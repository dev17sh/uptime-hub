import { Queue } from 'bullmq';
import { getRedisConnectionOptions } from './connection.js';
import { logger } from '../config/logger.js';
import type { NotificationType } from '@prisma/client';

export const NOTIFICATION_QUEUE_NAME = 'notification-queue';

export interface NotificationJobData {
  incidentId: string;
  monitorId: string;
  userId: string;
  type: NotificationType;
  monitorName: string;
  monitorUrl: string;
  failureReason?: string;
  startedAt: string;
  resolvedAt?: string;
  durationSeconds?: number;
}

export const notificationQueue = new Queue<NotificationJobData>(NOTIFICATION_QUEUE_NAME, {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export async function enqueueNotificationJob(data: NotificationJobData): Promise<void> {
  try {
    // Unique job ID per incident and alert type ensures no duplicate alerts
    const jobId = `notification:${data.incidentId}:${data.type}`;

    await notificationQueue.add('send-notification', data, {
      jobId,
    });

    logger.info(
      { incidentId: data.incidentId, monitorId: data.monitorId, type: data.type },
      'Enqueued alert notification job'
    );
  } catch (error) {
    logger.error(
      { err: error, incidentId: data.incidentId, type: data.type },
      'Failed to enqueue notification job'
    );
  }
}

