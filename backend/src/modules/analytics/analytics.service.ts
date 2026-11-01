import { prisma } from '../../db/prisma.js';
import type { AppError } from '../../middleware/error-handler.js';

function createError(message: string, statusCode: number, code: string): AppError {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.code = code;
  error.isOperational = true;
  return error;
}

export type UptimeRange = '24h' | '7d' | '30d';

export interface TimeSeriesPoint {
  timestamp: string;
  label: string;
  avgLatency: number;
  p95Latency: number;
  uptime: number;
  totalChecks: number;
}

export interface UptimeStatsResponse {
  range: UptimeRange;
  uptimePercentage: number;
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  timeSeries: TimeSeriesPoint[];
}

/**
 * Calculates 95th percentile latency from an array of numbers.
 */
export function calculateP95(latencies: number[]): number {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const index = Math.ceil(0.95 * sorted.length) - 1;
  return Math.round(sorted[Math.max(0, Math.min(index, sorted.length - 1))] * 100) / 100;
}

/**
 * Computes check-based uptime percentage and average/p95 latency over a specified time range.
 */
export async function getMonitorUptimeStats(
  userId: string,
  monitorId: string,
  rangeStr: string = '24h'
): Promise<UptimeStatsResponse> {
  const range: UptimeRange =
    rangeStr === '7d' || rangeStr === '30d' ? rangeStr : '24h';

  // Verify monitor ownership
  const monitor = await prisma.monitor.findFirst({
    where: { id: monitorId, userId },
  });

  if (!monitor) {
    throw createError('Monitor not found', 404, 'MONITOR_NOT_FOUND');
  }

  // Calculate cutoff timestamp
  const now = Date.now();
  let durationMs = 24 * 60 * 60 * 1000; // 24h default
  let bucketDurationMs = 60 * 60 * 1000; // 1 hour per bucket for 24h

  if (range === '7d') {
    durationMs = 7 * 24 * 60 * 60 * 1000;
    bucketDurationMs = 6 * 60 * 60 * 1000; // 6 hours per bucket
  } else if (range === '30d') {
    durationMs = 30 * 24 * 60 * 60 * 1000;
    bucketDurationMs = 24 * 60 * 60 * 1000; // 24 hours per bucket
  }

  const startTime = new Date(now - durationMs);

  // Query all check results in range
  const checks = await prisma.checkResult.findMany({
    where: {
      monitorId,
      checkedAt: { gte: startTime },
    },
    orderBy: { checkedAt: 'asc' },
    select: {
      isUp: true,
      responseTimeMs: true,
      checkedAt: true,
    },
  });

  const totalChecks = checks.length;
  const successfulChecks = checks.filter((c) => c.isUp).length;
  const failedChecks = totalChecks - successfulChecks;
  const uptimePercentage =
    totalChecks > 0
      ? Math.round((successfulChecks / totalChecks) * 10000) / 100
      : 100;

  const validLatencies = checks
    .filter((c) => typeof c.responseTimeMs === 'number' && c.responseTimeMs! > 0)
    .map((c) => c.responseTimeMs!);

  const avgResponseTimeMs =
    validLatencies.length > 0
      ? Math.round((validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length) * 100) / 100
      : 0;

  const p95ResponseTimeMs = calculateP95(validLatencies);

  // Group into time-series buckets for charting
  const bucketCount = Math.ceil(durationMs / bucketDurationMs);
  const buckets: { [key: number]: { latencies: number[]; successes: number; total: number } } = {};

  for (let i = 0; i < bucketCount; i++) {
    buckets[i] = { latencies: [], successes: 0, total: 0 };
  }

  for (const check of checks) {
    const checkTime = check.checkedAt.getTime();
    const bucketIndex = Math.min(
      bucketCount - 1,
      Math.max(0, Math.floor((checkTime - startTime.getTime()) / bucketDurationMs))
    );

    if (buckets[bucketIndex]) {
      buckets[bucketIndex].total++;
      if (check.isUp) buckets[bucketIndex].successes++;
      if (typeof check.responseTimeMs === 'number' && check.responseTimeMs > 0) {
        buckets[bucketIndex].latencies.push(check.responseTimeMs);
      }
    }
  }

  const timeSeries: TimeSeriesPoint[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const bucketTime = new Date(startTime.getTime() + i * bucketDurationMs);
    const b = buckets[i];

    const avg =
      b.latencies.length > 0
        ? Math.round((b.latencies.reduce((x, y) => x + y, 0) / b.latencies.length) * 10) / 10
        : 0;
    const p95 = calculateP95(b.latencies);
    const uptime = b.total > 0 ? Math.round((b.successes / b.total) * 100) : 100;

    let label = bucketTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (range === '7d' || range === '30d') {
      label = bucketTime.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    timeSeries.push({
      timestamp: bucketTime.toISOString(),
      label,
      avgLatency: avg,
      p95Latency: p95,
      uptime,
      totalChecks: b.total,
    });
  }

  return {
    range,
    uptimePercentage,
    avgResponseTimeMs,
    p95ResponseTimeMs,
    totalChecks,
    successfulChecks,
    failedChecks,
    timeSeries,
  };
}
