import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { validateUrlSecurity } from '../../security/ssrf.js';
import { probeUrl } from '../checks/check.service.js';
import { processCheckResult } from '../incidents/incident.engine.js';
import { scheduleMonitorCheck, removeMonitorCheck } from '../../queue/check.queue.js';
import type { CreateMonitorInput, UpdateMonitorInput } from './monitor.schema.js';
import type { AppError } from '../../middleware/error-handler.js';
import type { Monitor, CheckResult } from '@prisma/client';

function createError(message: string, statusCode: number, code: string): AppError {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.code = code;
  error.isOperational = true;
  return error;
}

export async function listMonitors(userId: string): Promise<Monitor[]> {
  return prisma.monitor.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getMonitorById(userId: string, monitorId: string): Promise<Monitor> {
  const monitor = await prisma.monitor.findFirst({
    where: { id: monitorId, userId },
  });

  if (!monitor) {
    throw createError('Monitor not found', 404, 'MONITOR_NOT_FOUND');
  }

  return monitor;
}

export async function createMonitor(userId: string, input: CreateMonitorInput): Promise<Monitor> {
  // 1. Quota check
  const count = await prisma.monitor.count({
    where: { userId },
  });

  if (count >= env.MAX_MONITORS_PER_USER) {
    throw createError(
      `Monitor limit of ${env.MAX_MONITORS_PER_USER} reached for this account`,
      403,
      'QUOTA_EXCEEDED'
    );
  }

  // 2. SSRF validation check on target URL
  const ssrf = await validateUrlSecurity(input.url);
  if (!ssrf.valid) {
    throw createError(
      ssrf.error || 'The specified target URL violates security policies (SSRF guard).',
      400,
      'SSRF_BLOCKED'
    );
  }

  // 3. Create record
  const monitor = await prisma.monitor.create({
    data: {
      userId,
      name: input.name,
      url: input.url,
      method: input.method,
      intervalSeconds: input.intervalSeconds,
      timeoutMs: input.timeoutMs,
      failureThreshold: input.failureThreshold,
      recoveryThreshold: input.recoveryThreshold,
    },
  });

  // 4. Schedule repeatable queue check
  await scheduleMonitorCheck(monitor);

  return monitor;
}

export async function updateMonitor(
  userId: string,
  monitorId: string,
  input: UpdateMonitorInput
): Promise<Monitor> {
  // Ensure ownership
  const existing = await getMonitorById(userId, monitorId);

  // Validate URL if changed
  if (input.url) {
    const ssrf = await validateUrlSecurity(input.url);
    if (!ssrf.valid) {
      throw createError(
        ssrf.error || 'The updated URL violates security policies (SSRF guard).',
        400,
        'SSRF_BLOCKED'
      );
    }
  }

  const updated = await prisma.monitor.update({
    where: { id: monitorId },
    data: input,
  });

  // Reschedule if interval or active state changed
  if (updated.isActive) {
    if (
      existing.intervalSeconds !== updated.intervalSeconds ||
      existing.url !== updated.url ||
      !existing.isActive
    ) {
      await scheduleMonitorCheck(updated);
    }
  } else {
    await removeMonitorCheck(updated.id);
  }

  return updated;
}

export async function pauseMonitor(userId: string, monitorId: string): Promise<Monitor> {
  await getMonitorById(userId, monitorId);

  const updated = await prisma.monitor.update({
    where: { id: monitorId },
    data: { isActive: false },
  });

  await removeMonitorCheck(monitorId);

  return updated;
}

export async function resumeMonitor(userId: string, monitorId: string): Promise<Monitor> {
  await getMonitorById(userId, monitorId);

  const updated = await prisma.monitor.update({
    where: { id: monitorId },
    data: { isActive: true },
  });

  await scheduleMonitorCheck(updated);

  return updated;
}

export async function deleteMonitor(userId: string, monitorId: string): Promise<{ id: string; deleted: boolean }> {
  await getMonitorById(userId, monitorId);

  await removeMonitorCheck(monitorId);

  await prisma.monitor.delete({
    where: { id: monitorId },
  });

  return { id: monitorId, deleted: true };
}

export async function triggerManualCheck(userId: string, monitorId: string): Promise<CheckResult> {
  const monitor = await getMonitorById(userId, monitorId);
  const probe = await probeUrl(monitor.url, monitor.timeoutMs, monitor.method);
  const result = await processCheckResult(monitorId, probe);
  return result.checkResult;
}

export async function getMonitorChecks(
  userId: string,
  monitorId: string,
  params: { page?: number; limit?: number; from?: string; to?: string }
): Promise<{ checks: CheckResult[]; total: number; page: number; limit: number }> {
  await getMonitorById(userId, monitorId);

  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const skip = (page - 1) * limit;

  const whereClause: {
    monitorId: string;
    checkedAt?: { gte?: Date; lte?: Date };
  } = { monitorId };

  if (params.from || params.to) {
    whereClause.checkedAt = {};
    if (params.from) whereClause.checkedAt.gte = new Date(params.from);
    if (params.to) whereClause.checkedAt.lte = new Date(params.to);
  }

  const [checks, total] = await Promise.all([
    prisma.checkResult.findMany({
      where: whereClause,
      orderBy: { checkedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.checkResult.count({
      where: whereClause,
    }),
  ]);

  return { checks, total, page, limit };
}

