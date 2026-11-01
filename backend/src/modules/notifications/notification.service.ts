import { prisma } from '../../db/prisma.js';
import { logger } from '../../config/logger.js';
import type { NotificationJobData } from '../../queue/notification.queue.js';
import {
  renderDownEmail,
  renderRecoveredEmail,
  sendEmail,
} from './email.service.js';
import { getNotificationPreferences } from './notification-preference.service.js';

export async function processNotificationJob(data: NotificationJobData): Promise<void> {
  const { incidentId, userId, type, monitorName, monitorUrl } = data;

  // 1. Idempotency Check: if already sent, do not send again
  const existingNotification = await prisma.notification.findUnique({
    where: {
      incidentId_type: {
        incidentId,
        type,
      },
    },
  });

  if (existingNotification && existingNotification.status === 'SENT') {
    logger.info(
      { incidentId, type },
      'Notification already sent for this incident and type. Skipping (idempotent).'
    );
    return;
  }

  // 2. Fetch User and Preferences
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });

  if (!user) {
    logger.warn({ userId }, 'User not found for notification job. Aborting.');
    return;
  }

  const prefs = await getNotificationPreferences(userId);

  // Check if disabled by preferences
  let shouldSend = prefs.emailEnabled;
  if (type === 'DOWN' && !prefs.downtimeEnabled) {
    shouldSend = false;
  }
  if (type === 'RECOVERED' && !prefs.recoveryEnabled) {
    shouldSend = false;
  }

  if (!shouldSend) {
    logger.info(
      { userId, type, prefs },
      'Notification suppressed by user preferences.'
    );
    // Mark as SENT (suppressed) so we do not re-process
    await prisma.notification.upsert({
      where: {
        incidentId_type: { incidentId, type },
      },
      update: {
        status: 'SENT',
        sentAt: new Date(),
        error: 'Suppressed by user preferences',
      },
      create: {
        incidentId,
        userId,
        type,
        channel: 'EMAIL',
        status: 'SENT',
        sentAt: new Date(),
        error: 'Suppressed by user preferences',
      },
    });
    return;
  }

  // 3. Upsert PENDING notification record
  const notificationRecord = await prisma.notification.upsert({
    where: {
      incidentId_type: { incidentId, type },
    },
    update: {
      status: 'PENDING',
    },
    create: {
      incidentId,
      userId,
      type,
      channel: 'EMAIL',
      status: 'PENDING',
    },
  });

  // 4. Render and Send Email
  try {
    let emailContent: { subject: string; text: string; html: string };

    if (type === 'DOWN') {
      emailContent = renderDownEmail({
        monitorName,
        monitorUrl,
        failureReason: data.failureReason,
        startedAt: data.startedAt,
      });
    } else {
      emailContent = renderRecoveredEmail({
        monitorName,
        monitorUrl,
        startedAt: data.startedAt,
        resolvedAt: data.resolvedAt || new Date().toISOString(),
        durationSeconds: data.durationSeconds,
      });
    }

    await sendEmail({
      to: user.email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    });

    // 5. Update record on success
    await prisma.notification.update({
      where: { id: notificationRecord.id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        attempts: { increment: 1 },
        error: null,
      },
    });

    logger.info(
      { notificationId: notificationRecord.id, incidentId, type, recipient: user.email },
      'Incident notification successfully delivered'
    );
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(
      { err, notificationId: notificationRecord.id, incidentId, type },
      'Failed to send alert email'
    );

    // Update record on failure
    await prisma.notification.update({
      where: { id: notificationRecord.id },
      data: {
        status: 'FAILED',
        attempts: { increment: 1 },
        error: err.message || 'Unknown email delivery error',
      },
    });

    // Rethrow error so BullMQ can trigger backoff retry
    throw err;
  }
}
