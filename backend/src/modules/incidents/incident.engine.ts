import { MonitorStatus, IncidentStatus, NotificationType } from '@prisma/client';
import type { Monitor, Incident, CheckResult } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { enqueueNotificationJob } from '../../queue/notification.queue.js';
import { logger } from '../../config/logger.js';
import type { ProbeResult } from '../checks/check.service.js';

export interface StateTransitionResult {
  nextStatus: MonitorStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  action: 'NONE' | 'OPEN_INCIDENT' | 'RESOLVE_INCIDENT';
}

/**
 * Pure state machine transition function according to Section 5.2.
 */
export function calculateNextState(
  current: {
    currentStatus: MonitorStatus;
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    failureThreshold: number; // k
    recoveryThreshold: number; // r
  },
  isUp: boolean
): StateTransitionResult {
  const k = Math.max(1, current.failureThreshold);
  const r = Math.max(1, current.recoveryThreshold);

  if (isUp) {
    // Check Succeeded
    switch (current.currentStatus) {
      case MonitorStatus.UP:
        return {
          nextStatus: MonitorStatus.UP,
          consecutiveFailures: 0,
          consecutiveSuccesses: 0,
          action: 'NONE',
        };

      case MonitorStatus.SUSPECT:
        // Transitory glitch recovered: reset back to UP
        return {
          nextStatus: MonitorStatus.UP,
          consecutiveFailures: 0,
          consecutiveSuccesses: 0,
          action: 'NONE',
        };

      case MonitorStatus.DOWN:
        if (r === 1) {
          // Direct recovery if threshold is 1
          return {
            nextStatus: MonitorStatus.UP,
            consecutiveFailures: 0,
            consecutiveSuccesses: 0,
            action: 'RESOLVE_INCIDENT',
          };
        }
        return {
          nextStatus: MonitorStatus.RECOVERING,
          consecutiveFailures: current.consecutiveFailures,
          consecutiveSuccesses: 1,
          action: 'NONE',
        };

      case MonitorStatus.RECOVERING: {
        const nextSuccesses = current.consecutiveSuccesses + 1;
        if (nextSuccesses >= r) {
          return {
            nextStatus: MonitorStatus.UP,
            consecutiveFailures: 0,
            consecutiveSuccesses: 0,
            action: 'RESOLVE_INCIDENT',
          };
        }
        return {
          nextStatus: MonitorStatus.RECOVERING,
          consecutiveFailures: current.consecutiveFailures,
          consecutiveSuccesses: nextSuccesses,
          action: 'NONE',
        };
      }
    }
  } else {
    // Check Failed
    switch (current.currentStatus) {
      case MonitorStatus.UP: {
        const nextFailures = 1;
        if (nextFailures >= k) {
          return {
            nextStatus: MonitorStatus.DOWN,
            consecutiveFailures: nextFailures,
            consecutiveSuccesses: 0,
            action: 'OPEN_INCIDENT',
          };
        }
        return {
          nextStatus: MonitorStatus.SUSPECT,
          consecutiveFailures: nextFailures,
          consecutiveSuccesses: 0,
          action: 'NONE',
        };
      }

      case MonitorStatus.SUSPECT: {
        const nextFailures = current.consecutiveFailures + 1;
        if (nextFailures >= k) {
          return {
            nextStatus: MonitorStatus.DOWN,
            consecutiveFailures: nextFailures,
            consecutiveSuccesses: 0,
            action: 'OPEN_INCIDENT',
          };
        }
        return {
          nextStatus: MonitorStatus.SUSPECT,
          consecutiveFailures: nextFailures,
          consecutiveSuccesses: 0,
          action: 'NONE',
        };
      }

      case MonitorStatus.DOWN:
        return {
          nextStatus: MonitorStatus.DOWN,
          consecutiveFailures: current.consecutiveFailures + 1,
          consecutiveSuccesses: 0,
          action: 'NONE',
        };

      case MonitorStatus.RECOVERING:
        // Recovery failed, falls back to DOWN without opening a new incident
        return {
          nextStatus: MonitorStatus.DOWN,
          consecutiveFailures: current.consecutiveFailures + 1,
          consecutiveSuccesses: 0,
          action: 'NONE',
        };
    }
  }
}

export interface ProcessCheckOutput {
  checkResult: CheckResult;
  monitor: Monitor;
  incident?: Incident | null;
}

/**
 * Executes check persistence, incident state machine evaluation,
 * and incident opening/resolution within a SINGLE database transaction.
 */
export async function processCheckResult(
  monitorId: string,
  probe: ProbeResult
): Promise<ProcessCheckOutput> {
  const result = await prisma.$transaction(async (tx) => {
    // 1. Insert CheckResult
    const checkResult = await tx.checkResult.create({
      data: {
        monitorId,
        statusCode: probe.statusCode,
        responseTimeMs: probe.responseTimeMs,
        isUp: probe.isUp,
        errorType: probe.errorType,
        errorMessage: probe.errorMessage,
        checkedAt: probe.checkedAt,
      },
    });

    // 2. Fetch current monitor with lock / read
    const monitor = await tx.monitor.findUnique({
      where: { id: monitorId },
      include: {
        user: { select: { id: true, email: true } },
      },
    });

    if (!monitor) {
      throw new Error(`Monitor with ID ${monitorId} not found`);
    }

    // 3. Compute next state
    const transition = calculateNextState(
      {
        currentStatus: monitor.currentStatus,
        consecutiveFailures: monitor.consecutiveFailures,
        consecutiveSuccesses: monitor.consecutiveSuccesses,
        failureThreshold: monitor.failureThreshold,
        recoveryThreshold: monitor.recoveryThreshold,
      },
      probe.isUp
    );

    let incident: Incident | null = null;
    let notificationPayload: Parameters<typeof enqueueNotificationJob>[0] | null = null;

    // 4. Handle State Actions (Idempotent: maximum 1 OPEN incident per monitor)
    if (transition.action === 'OPEN_INCIDENT') {
      const existingOpen = await tx.incident.findFirst({
        where: { monitorId, status: IncidentStatus.OPEN },
      });

      if (!existingOpen) {
        // Find startedAt = first failed check of the current failure run
        const firstFailedCheck = await tx.checkResult.findFirst({
          where: { monitorId, isUp: false },
          orderBy: { checkedAt: 'desc' },
          skip: Math.max(0, transition.consecutiveFailures - 1),
          take: 1,
        });

        const startedAt = firstFailedCheck?.checkedAt || probe.checkedAt;

        incident = await tx.incident.create({
          data: {
            monitorId,
            startedAt,
            status: IncidentStatus.OPEN,
            failureReason: probe.errorMessage || `Endpoint failed (${probe.errorType || 'UNKNOWN'})`,
          },
        });

        notificationPayload = {
          incidentId: incident.id,
          monitorId: monitor.id,
          userId: monitor.userId,
          type: NotificationType.DOWN,
          monitorName: monitor.name,
          monitorUrl: monitor.url,
          failureReason: incident.failureReason || undefined,
          startedAt: startedAt.toISOString(),
        };

        logger.warn(
          { monitorId, incidentId: incident.id, startedAt },
          '🚨 Opened downtime incident'
        );
      } else {
        incident = existingOpen;
      }
    } else if (transition.action === 'RESOLVE_INCIDENT') {
      const openIncident = await tx.incident.findFirst({
        where: { monitorId, status: IncidentStatus.OPEN },
      });

      if (openIncident) {
        // resolvedAt = time of first successful check of the recovery run
        const firstRecoveryCheck = await tx.checkResult.findFirst({
          where: { monitorId, isUp: true },
          orderBy: { checkedAt: 'desc' },
          skip: Math.max(0, monitor.recoveryThreshold - 1),
          take: 1,
        });

        const resolvedAt = firstRecoveryCheck?.checkedAt || probe.checkedAt;
        const durationSeconds = Math.max(
          0,
          Math.round((resolvedAt.getTime() - openIncident.startedAt.getTime()) / 1000)
        );

        incident = await tx.incident.update({
          where: { id: openIncident.id },
          data: {
            status: IncidentStatus.RESOLVED,
            resolvedAt,
          },
        });

        notificationPayload = {
          incidentId: incident.id,
          monitorId: monitor.id,
          userId: monitor.userId,
          type: NotificationType.RECOVERED,
          monitorName: monitor.name,
          monitorUrl: monitor.url,
          startedAt: incident.startedAt.toISOString(),
          resolvedAt: resolvedAt.toISOString(),
          durationSeconds,
        };

        logger.info(
          { monitorId, incidentId: incident.id, durationSeconds },
          '✅ Resolved downtime incident'
        );
      }
    }

    // 5. Update Monitor counters and status
    const updatedMonitor = await tx.monitor.update({
      where: { id: monitorId },
      data: {
        currentStatus: transition.nextStatus,
        consecutiveFailures: transition.consecutiveFailures,
        consecutiveSuccesses: transition.consecutiveSuccesses,
      },
    });

    return {
      checkResult,
      monitor: updatedMonitor,
      incident,
      notificationPayload,
    };
  });

  // 6. Outside of DB transaction, enqueue alert job
  if (result.notificationPayload) {
    await enqueueNotificationJob(result.notificationPayload);
  }

  return {
    checkResult: result.checkResult,
    monitor: result.monitor,
    incident: result.incident,
  };
}

