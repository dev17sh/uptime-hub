import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import nodemailer, { type Transporter } from 'nodemailer';
import app from '../../../app.js';
import { prisma } from '../../../db/prisma.js';
import {
  setMailTransporter,
  formatDurationText,
  renderDownEmail,
  renderRecoveredEmail,
} from '../email.service.js';
import { processNotificationJob } from '../notification.service.js';

describe('Notifications Module (Phase 8)', () => {
  let userToken: string;
  let userId: string;
  let userEmail: string;
  let otherToken: string;
  let otherUserId: string;

  let monitorId: string;
  let incidentId: string;

  beforeEach(async () => {
    // Reset test transporter to in-memory JSON transporter
    setMailTransporter(nodemailer.createTransport({ jsonTransport: true }));

    await prisma.notification.deleteMany();
    await prisma.notificationPreference.deleteMany();
    await prisma.incident.deleteMany();
    await prisma.checkResult.deleteMany();
    await prisma.monitor.deleteMany();
    await prisma.user.deleteMany();

    // Register User 1
    const res1 = await request(app).post('/api/v1/auth/register').send({
      email: 'alerts-user1@example.com',
      password: 'Password123!',
      name: 'Alerts User 1',
    });
    userToken = res1.body.data.token;
    userId = res1.body.data.user.id;
    userEmail = res1.body.data.user.email;

    // Register User 2
    const res2 = await request(app).post('/api/v1/auth/register').send({
      email: 'alerts-user2@example.com',
      password: 'Password123!',
      name: 'Alerts User 2',
    });
    otherToken = res2.body.data.token;
    otherUserId = res2.body.data.user.id;

    // Create a monitor and incident for User 1
    const monitor = await prisma.monitor.create({
      data: {
        userId,
        name: 'Production API',
        url: 'https://api.example.com/health',
        method: 'GET',
        currentStatus: 'DOWN',
      },
    });
    monitorId = monitor.id;

    const incident = await prisma.incident.create({
      data: {
        monitorId,
        status: 'OPEN',
        startedAt: new Date(Date.now() - 5 * 60 * 1000), // 5 mins ago
        failureReason: 'HTTP_STATUS (500)',
      },
    });
    incidentId = incident.id;
  });

  afterAll(async () => {
    setMailTransporter(null);
    await prisma.$disconnect();
  });

  describe('Notification Preferences API (/api/v1/settings/notifications)', () => {
    it('requires authentication', async () => {
      const res = await request(app).get('/api/v1/settings/notifications');
      expect(res.status).toBe(401);
    });

    it('returns default preferences for a new user', async () => {
      const res = await request(app)
        .get('/api/v1/settings/notifications')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        emailEnabled: true,
        downtimeEnabled: true,
        recoveryEnabled: true,
      });
    });

    it('updates preferences and persists them', async () => {
      const res = await request(app)
        .put('/api/v1/settings/notifications')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          emailEnabled: true,
          downtimeEnabled: false,
          recoveryEnabled: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.downtimeEnabled).toBe(false);

      // Verify persistence
      const checkRes = await request(app)
        .get('/api/v1/settings/notifications')
        .set('Authorization', `Bearer ${userToken}`);
      expect(checkRes.body.data.downtimeEnabled).toBe(false);
    });

    it('enforces multi-user isolation on preferences', async () => {
      // User 1 disables downtime
      await request(app)
        .put('/api/v1/settings/notifications')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ downtimeEnabled: false });

      // User 2 preferences should remain default (downtimeEnabled = true)
      const res2 = await request(app)
        .get('/api/v1/settings/notifications')
        .set('Authorization', `Bearer ${otherToken}`);
      expect(res2.body.data.downtimeEnabled).toBe(true);
    });
  });

  describe('Email Formatting & Templates', () => {
    it('formatDurationText formats seconds, minutes, and hours', () => {
      expect(formatDurationText(0)).toBe('< 1 second');
      expect(formatDurationText(45)).toBe('45s');
      expect(formatDurationText(125)).toBe('2m 5s');
      expect(formatDurationText(3665)).toBe('1h 1m 5s');
    });

    it('renderDownEmail generates valid text and HTML', () => {
      const email = renderDownEmail({
        monitorName: 'Payment Gateway',
        monitorUrl: 'https://pay.example.com',
        failureReason: 'TIMEOUT',
        startedAt: new Date().toISOString(),
      });

      expect(email.subject).toContain('[DOWN ALERT]');
      expect(email.subject).toContain('Payment Gateway');
      expect(email.text).toContain('Payment Gateway');
      expect(email.text).toContain('TIMEOUT');
      expect(email.html).toContain('Service Outage Detected');
    });

    it('renderRecoveredEmail generates valid text and HTML with duration', () => {
      const start = new Date(Date.now() - 300000).toISOString();
      const resolved = new Date().toISOString();

      const email = renderRecoveredEmail({
        monitorName: 'Payment Gateway',
        monitorUrl: 'https://pay.example.com',
        startedAt: start,
        resolvedAt: resolved,
        durationSeconds: 300,
      });

      expect(email.subject).toContain('[RECOVERED]');
      expect(email.text).toContain('5m');
      expect(email.html).toContain('Service Restored');
    });
  });

  describe('Notification Worker & Service', () => {
    it('processes DOWN alert and stores SENT notification record', async () => {
      await processNotificationJob({
        incidentId,
        monitorId,
        userId,
        type: 'DOWN',
        monitorName: 'Production API',
        monitorUrl: 'https://api.example.com/health',
        failureReason: 'HTTP_STATUS (500)',
        startedAt: new Date().toISOString(),
      });

      const notification = await prisma.notification.findUnique({
        where: {
          incidentId_type: { incidentId, type: 'DOWN' },
        },
      });

      expect(notification).not.toBeNull();
      expect(notification?.status).toBe('SENT');
      expect(notification?.attempts).toBe(1);
      expect(notification?.sentAt).toBeInstanceOf(Date);
      expect(notification?.error).toBeNull();
    });

    it('is strictly idempotent on duplicate jobs', async () => {
      const jobData = {
        incidentId,
        monitorId,
        userId,
        type: 'DOWN' as const,
        monitorName: 'Production API',
        monitorUrl: 'https://api.example.com/health',
        failureReason: 'HTTP_STATUS (500)',
        startedAt: new Date().toISOString(),
      };

      // Run once
      await processNotificationJob(jobData);

      const count1 = await prisma.notification.count({
        where: { incidentId, type: 'DOWN' },
      });
      expect(count1).toBe(1);

      // Run duplicate job
      await processNotificationJob(jobData);

      const count2 = await prisma.notification.count({
        where: { incidentId, type: 'DOWN' },
      });
      expect(count2).toBe(1);
    });

    it('processes RECOVERED alert with duration', async () => {
      await processNotificationJob({
        incidentId,
        monitorId,
        userId,
        type: 'RECOVERED',
        monitorName: 'Production API',
        monitorUrl: 'https://api.example.com/health',
        startedAt: new Date(Date.now() - 120000).toISOString(),
        resolvedAt: new Date().toISOString(),
        durationSeconds: 120,
      });

      const notification = await prisma.notification.findUnique({
        where: {
          incidentId_type: { incidentId, type: 'RECOVERED' },
        },
      });

      expect(notification).not.toBeNull();
      expect(notification?.status).toBe('SENT');
      expect(notification?.type).toBe('RECOVERED');
    });

    it('suppresses alert when emailEnabled is false in user preferences', async () => {
      // Set emailEnabled to false
      await prisma.notificationPreference.upsert({
        where: { userId },
        update: { emailEnabled: false },
        create: { userId, emailEnabled: false },
      });

      await processNotificationJob({
        incidentId,
        monitorId,
        userId,
        type: 'DOWN',
        monitorName: 'Production API',
        monitorUrl: 'https://api.example.com/health',
        failureReason: 'HTTP_STATUS (500)',
        startedAt: new Date().toISOString(),
      });

      const notification = await prisma.notification.findUnique({
        where: {
          incidentId_type: { incidentId, type: 'DOWN' },
        },
      });

      expect(notification).not.toBeNull();
      expect(notification?.status).toBe('SENT');
      expect(notification?.error).toBe('Suppressed by user preferences');
    });

    it('suppresses downtime alert when downtimeEnabled is false', async () => {
      await prisma.notificationPreference.upsert({
        where: { userId },
        update: { downtimeEnabled: false },
        create: { userId, downtimeEnabled: false },
      });

      await processNotificationJob({
        incidentId,
        monitorId,
        userId,
        type: 'DOWN',
        monitorName: 'Production API',
        monitorUrl: 'https://api.example.com/health',
        failureReason: 'HTTP_STATUS (500)',
        startedAt: new Date().toISOString(),
      });

      const notification = await prisma.notification.findUnique({
        where: {
          incidentId_type: { incidentId, type: 'DOWN' },
        },
      });

      expect(notification?.error).toBe('Suppressed by user preferences');
    });

    it('records FAILED status when email dispatch fails', async () => {
      // Mock failing transport
      const failingTransport = {
        sendMail: vi.fn().mockRejectedValue(new Error('SMTP Connection Refused (ECONNREFUSED)')),
      };
      setMailTransporter(failingTransport as unknown as Transporter);

      await expect(
        processNotificationJob({
          incidentId,
          monitorId,
          userId,
          type: 'DOWN',
          monitorName: 'Production API',
          monitorUrl: 'https://api.example.com/health',
          failureReason: 'HTTP_STATUS (500)',
          startedAt: new Date().toISOString(),
        })
      ).rejects.toThrow('SMTP Connection Refused');

      const notification = await prisma.notification.findUnique({
        where: {
          incidentId_type: { incidentId, type: 'DOWN' },
        },
      });

      expect(notification).not.toBeNull();
      expect(notification?.status).toBe('FAILED');
      expect(notification?.attempts).toBe(1);
      expect(notification?.error).toContain('SMTP Connection Refused');
    });
  });
});

