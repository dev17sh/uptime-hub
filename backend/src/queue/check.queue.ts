import { Queue, QueueEvents } from 'bullmq';
import { getRedisConnectionOptions } from './connection.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../config/logger.js';

export const CHECK_QUEUE_NAME = 'check-queue';

export interface CheckJobData {
  monitorId: string;
}

export const checkQueue = new Queue<CheckJobData>(CHECK_QUEUE_NAME, {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export const checkQueueEvents = new QueueEvents(CHECK_QUEUE_NAME, {
  connection: getRedisConnectionOptions(),
});

/**
 * Derives a deterministic scheduler ID for a monitor.
 */
export function getMonitorSchedulerId(monitorId: string): string {
  return `monitor:${monitorId}`;
}

/**
 * Removes any scheduled repeatable jobs for a given monitor ID.
 */
export async function removeMonitorCheck(monitorId: string): Promise<boolean> {
  try {
    const schedulerId = getMonitorSchedulerId(monitorId);
    const removed = await checkQueue.removeJobScheduler(schedulerId);

    if (removed) {
      logger.info({ monitorId, schedulerId }, 'Removed repeatable check job scheduler from queue');
    }
    return removed;
  } catch (error) {
    logger.error({ err: error, monitorId }, 'Failed to remove monitor check job scheduler');
    return false;
  }
}

/**
 * Schedules or updates a repeatable check job scheduler for a monitor.
 */
export async function scheduleMonitorCheck(monitor: {
  id: string;
  intervalSeconds: number;
}): Promise<void> {
  const schedulerId = getMonitorSchedulerId(monitor.id);
  const intervalMs = Math.max(10, monitor.intervalSeconds) * 1000;

  await checkQueue.upsertJobScheduler(
    schedulerId,
    { every: intervalMs },
    {
      name: 'check-probe',
      data: { monitorId: monitor.id },
      opts: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    }
  );

  logger.info(
    { monitorId: monitor.id, schedulerId, intervalSeconds: monitor.intervalSeconds, intervalMs },
    'Upserted repeatable check job scheduler in queue'
  );
}

/**
 * Reconciles the database active monitors with BullMQ repeatable job schedulers.
 * Ensures every active monitor is scheduled and removes orphaned schedulers.
 */
export async function reconcileQueueJobs(): Promise<{
  scheduled: number;
  removed: number;
  totalActive: number;
}> {
  logger.info('Starting queue scheduler reconciliation...');

  const activeMonitors = await prisma.monitor.findMany({
    where: { isActive: true },
    select: { id: true, intervalSeconds: true },
  });

  const activeMonitorIds = new Set(activeMonitors.map((m) => m.id));
  const activeMonitorMap = new Map(activeMonitors.map((m) => [m.id, m]));

  const currentSchedulers = await checkQueue.getJobSchedulers();
  let removedCount = 0;
  let scheduledCount = 0;

  // 1. Remove schedulers for monitors that are inactive or no longer exist
  for (const scheduler of currentSchedulers) {
    const schedulerId = scheduler.name || scheduler.key;
    // Check if scheduler belongs to a monitor
    if (schedulerId && schedulerId.startsWith('monitor:')) {
      const monitorId = schedulerId.replace('monitor:', '');
      if (!activeMonitorIds.has(monitorId)) {
        await checkQueue.removeJobScheduler(schedulerId);
        removedCount++;
      }
    }
  }

  // 2. Ensure each active monitor has a job scheduler
  const remainingSchedulers = await checkQueue.getJobSchedulers();
  const scheduledMonitorIds = new Set<string>();

  for (const scheduler of remainingSchedulers) {
    const schedulerId = scheduler.name || scheduler.key;
    if (schedulerId && schedulerId.startsWith('monitor:')) {
      scheduledMonitorIds.add(schedulerId.replace('monitor:', ''));
    }
  }

  for (const [id, monitor] of activeMonitorMap) {
    if (!scheduledMonitorIds.has(id)) {
      await scheduleMonitorCheck(monitor);
      scheduledCount++;
    }
  }

  logger.info(
    { totalActive: activeMonitors.length, scheduled: scheduledCount, removed: removedCount },
    'Queue reconciliation completed'
  );

  return {
    totalActive: activeMonitors.length,
    scheduled: scheduledCount,
    removed: removedCount,
  };
}
