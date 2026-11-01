import { Worker, type Job } from 'bullmq';
import { CHECK_QUEUE_NAME, type CheckJobData, removeMonitorCheck } from '../queue/check.queue.js';
import { getRedisConnectionOptions } from '../queue/connection.js';
import { prisma } from '../db/prisma.js';
import { probeUrl } from '../modules/checks/check.service.js';
import { processCheckResult } from '../modules/incidents/incident.engine.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export function createMonitorWorker(): Worker<CheckJobData> {
  const worker = new Worker<CheckJobData>(
    CHECK_QUEUE_NAME,
    async (job: Job<CheckJobData>) => {
      const { monitorId } = job.data;
      if (!monitorId) {
        logger.warn({ jobId: job.id }, 'Job has no monitorId, skipping');
        return;
      }

      logger.debug({ jobId: job.id, monitorId }, 'Processing monitor check job');

      // 1. Fetch monitor state from DB
      const monitor = await prisma.monitor.findUnique({
        where: { id: monitorId },
      });

      if (!monitor) {
        logger.warn({ monitorId }, 'Monitor not found, removing orphaned check job');
        await removeMonitorCheck(monitorId);
        return;
      }

      if (!monitor.isActive) {
        logger.info({ monitorId }, 'Monitor is paused/inactive, skipping check');
        await removeMonitorCheck(monitorId);
        return;
      }

      // 2. Outbound Probe
      const probe = await probeUrl(monitor.url, monitor.timeoutMs, monitor.method);

      // 3. Process check, state transition, and incident management in single transaction
      try {
        const result = await processCheckResult(monitor.id, probe);
        logger.info(
          {
            monitorId: monitor.id,
            isUp: result.checkResult.isUp,
            statusCode: result.checkResult.statusCode,
            responseTimeMs: result.checkResult.responseTimeMs,
            monitorStatus: result.monitor.currentStatus,
            incidentId: result.incident?.id,
          },
          'Monitor check and incident state processed'
        );
        return result.checkResult;
      } catch (err) {
        logger.error({ err, monitorId }, 'Fatal transaction failure during check processing');
        throw err;
      }
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: env.CHECK_WORKER_CONCURRENCY,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, monitorId: job?.data?.monitorId, err: err.message },
      'Check worker job failed'
    );
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Check worker internal error');
  });

  return worker;
}

// Standalone execution entrypoint when run via `npm run worker`
if (process.argv[1]?.includes('monitor.worker')) {
  logger.info('🚀 Starting UptimeHub Monitor Check Worker...');
  const worker = createMonitorWorker();

  async function shutdown(signal: string): Promise<void> {
    logger.info(`${signal} received. Closing monitor worker gracefully...`);
    await worker.close();
    await prisma.$disconnect();
    logger.info('Worker closed');
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
