import { Worker, type Job } from 'bullmq';
import { getRedisConnectionOptions } from '../queue/connection.js';
import {
  NOTIFICATION_QUEUE_NAME,
  type NotificationJobData,
} from '../queue/notification.queue.js';
import { processNotificationJob } from '../modules/notifications/notification.service.js';
import { logger } from '../config/logger.js';

logger.info('Starting UptimeHub Notification Worker...');

export const notificationWorker = new Worker<NotificationJobData>(
  NOTIFICATION_QUEUE_NAME,
  async (job: Job<NotificationJobData>) => {
    logger.info(
      { jobId: job.id, incidentId: job.data.incidentId, type: job.data.type },
      'Processing notification job'
    );

    await processNotificationJob(job.data);
  },
  {
    connection: getRedisConnectionOptions(),
    concurrency: 5,
  }
);

notificationWorker.on('completed', (job: Job<NotificationJobData>) => {
  logger.info(
    { jobId: job.id, incidentId: job.data.incidentId, type: job.data.type },
    'Notification job completed successfully'
  );
});

notificationWorker.on('failed', (job: Job<NotificationJobData> | undefined, error: Error) => {
  logger.error(
    {
      jobId: job?.id,
      incidentId: job?.data.incidentId,
      type: job?.data.type,
      err: error,
      attemptsMade: job?.attemptsMade,
    },
    'Notification job failed'
  );
});

async function shutdown() {
  logger.info('Shutting down notification worker gracefully...');
  await notificationWorker.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

