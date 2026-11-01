import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import nodemailer from 'nodemailer';
import app from '../app.js';
import { prisma } from '../db/prisma.js';
import { setMailTransporter } from '../modules/notifications/email.service.js';
import { processCheckResult } from '../modules/incidents/incident.engine.js';
import { processNotificationJob } from '../modules/notifications/notification.service.js';

describe('UptimeHub End-to-End Workflow (Phase 9)', () => {
  let authToken: string;
  let userId: string;
  let userEmail: string;

  beforeEach(async () => {
    setMailTransporter(nodemailer.createTransport({ jsonTransport: true }));

    await prisma.notification.deleteMany();
    await prisma.notificationPreference.deleteMany();
    await prisma.incident.deleteMany();
    await prisma.checkResult.deleteMany();
    await prisma.monitor.deleteMany();
    await prisma.user.deleteMany();

    // 1. Register a new user
    userEmail = 'e2e-user@uptimehub.local';
    const regRes = await request(app).post('/api/v1/auth/register').send({
      email: userEmail,
      password: 'SecurePassword123!',
      name: 'E2E Testing Admin',
    });

    expect(regRes.status).toBe(201);
    expect(regRes.body.success).toBe(true);
    authToken = regRes.body.data.token;
    userId = regRes.body.data.user.id;
  });

  afterAll(async () => {
    setMailTransporter(null);
    await prisma.$disconnect();
  });

  it('runs complete lifecycle: register -> create monitor -> outage -> alert -> recovery -> stats', async () => {
    // 2. User checks current profile
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${authToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe(userEmail);

    // 3. User configures notification preferences
    const prefRes = await request(app)
      .put('/api/v1/settings/notifications')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        emailEnabled: true,
        downtimeEnabled: true,
        recoveryEnabled: true,
      });
    expect(prefRes.status).toBe(200);
    expect(prefRes.body.data.emailEnabled).toBe(true);

    // 4. Create a monitor with k=2 failure threshold and r=2 recovery threshold
    const createMonRes = await request(app)
      .post('/api/v1/monitors')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Critical E-Commerce API',
        url: 'https://example.com/checkout',
        method: 'GET',
        intervalSeconds: 60,
        timeoutMs: 5000,
        failureThreshold: 2,
        recoveryThreshold: 2,
      });

    expect(createMonRes.status).toBe(201);
    const monitorId = createMonRes.body.data.id;
    expect(createMonRes.body.data.currentStatus).toBe('UP');

    // 5. Initial state check: monitor is UP with zero failures
    let monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
    expect(monitor?.currentStatus).toBe('UP');
    expect(monitor?.consecutiveFailures).toBe(0);

    // --- PHASE A: Simulate Outage Lifecycle ---

    // Check 1: 1st failure -> transitions to SUSPECT (not yet DOWN)
    const check1Time = new Date(Date.now() - 60000);
    await processCheckResult(monitorId, {
      isUp: false,
      statusCode: 503,
      responseTimeMs: 120,
      errorType: 'HTTP_STATUS',
      errorMessage: 'Service Unavailable',
      checkedAt: check1Time,
    });

    monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
    expect(monitor?.currentStatus).toBe('SUSPECT');
    expect(monitor?.consecutiveFailures).toBe(1);

    // Verify no incidents yet
    let openIncidents = await prisma.incident.findMany({
      where: { monitorId, status: 'OPEN' },
    });
    expect(openIncidents.length).toBe(0);

    // Check 2: 2nd consecutive failure (k=2 reached) -> transitions to DOWN and opens Incident
    const check2Time = new Date();
    await processCheckResult(monitorId, {
      isUp: false,
      statusCode: 503,
      responseTimeMs: 95,
      errorType: 'HTTP_STATUS',
      errorMessage: 'Service Unavailable',
      checkedAt: check2Time,
    });

    monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
    expect(monitor?.currentStatus).toBe('DOWN');
    expect(monitor?.consecutiveFailures).toBe(2);

    // Verify Incident opened with startedAt matching first failed check
    openIncidents = await prisma.incident.findMany({
      where: { monitorId, status: 'OPEN' },
    });
    expect(openIncidents.length).toBe(1);
    const incident = openIncidents[0];
    expect(incident.status).toBe('OPEN');
    expect(incident.failureReason).toContain('Service Unavailable');
    expect(incident.startedAt.getTime()).toBe(check1Time.getTime());

    // 6. Process DOWN Notification through worker
    await processNotificationJob({
      incidentId: incident.id,
      monitorId,
      userId,
      type: 'DOWN',
      monitorName: monitor!.name,
      monitorUrl: monitor!.url,
      failureReason: incident.failureReason || undefined,
      startedAt: incident.startedAt.toISOString(),
    });

    // Verify Notification record marked as SENT
    let downNotification = await prisma.notification.findUnique({
      where: { incidentId_type: { incidentId: incident.id, type: 'DOWN' } },
    });
    expect(downNotification?.status).toBe('SENT');
    expect(downNotification?.attempts).toBe(1);

    // Idempotency check: duplicate notification job does not re-send
    await processNotificationJob({
      incidentId: incident.id,
      monitorId,
      userId,
      type: 'DOWN',
      monitorName: monitor!.name,
      monitorUrl: monitor!.url,
      failureReason: incident.failureReason || undefined,
      startedAt: incident.startedAt.toISOString(),
    });
    const notificationCount = await prisma.notification.count({
      where: { incidentId: incident.id, type: 'DOWN' },
    });
    expect(notificationCount).toBe(1);

    // --- PHASE B: Simulate Recovery Lifecycle ---

    // Check 3: 1st success -> transitions to RECOVERING
    const rec1Time = new Date(Date.now() + 30000);
    await processCheckResult(monitorId, {
      isUp: true,
      statusCode: 200,
      responseTimeMs: 80,
      checkedAt: rec1Time,
    });

    monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
    expect(monitor?.currentStatus).toBe('RECOVERING');
    expect(monitor?.consecutiveSuccesses).toBe(1);

    // Incident is still OPEN until threshold r=2 is achieved
    const incidentStillOpen = await prisma.incident.findUnique({
      where: { id: incident.id },
    });
    expect(incidentStillOpen?.status).toBe('OPEN');

    // Check 4: 2nd consecutive success (r=2 reached) -> transitions to UP, Incident resolved
    const rec2Time = new Date(Date.now() + 60000);
    await processCheckResult(monitorId, {
      isUp: true,
      statusCode: 200,
      responseTimeMs: 75,
      checkedAt: rec2Time,
    });

    monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
    expect(monitor?.currentStatus).toBe('UP');
    expect(monitor?.consecutiveSuccesses).toBe(0);
    expect(monitor?.consecutiveFailures).toBe(0);

    // Verify incident is now RESOLVED with accurate resolvedAt
    const resolvedIncident = await prisma.incident.findUnique({
      where: { id: incident.id },
    });
    expect(resolvedIncident?.status).toBe('RESOLVED');
    expect(resolvedIncident?.resolvedAt).not.toBeNull();
    expect(resolvedIncident?.resolvedAt?.getTime()).toBe(rec1Time.getTime());

    // 7. Process RECOVERED Notification through worker
    await processNotificationJob({
      incidentId: incident.id,
      monitorId,
      userId,
      type: 'RECOVERED',
      monitorName: monitor!.name,
      monitorUrl: monitor!.url,
      startedAt: resolvedIncident!.startedAt.toISOString(),
      resolvedAt: resolvedIncident!.resolvedAt!.toISOString(),
      durationSeconds: Math.floor(
        (resolvedIncident!.resolvedAt!.getTime() - resolvedIncident!.startedAt.getTime()) / 1000
      ),
    });

    const recoveredNotification = await prisma.notification.findUnique({
      where: { incidentId_type: { incidentId: incident.id, type: 'RECOVERED' } },
    });
    expect(recoveredNotification?.status).toBe('SENT');
    expect(recoveredNotification?.attempts).toBe(1);

    // 8. Verify Incident API returns resolved incident
    const incRes = await request(app)
      .get(`/api/v1/incidents?monitorId=${monitorId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(incRes.status).toBe(200);
    expect(incRes.body.data.length).toBe(1);
    expect(incRes.body.data[0].id).toBe(incident.id);
    expect(incRes.body.data[0].status).toBe('RESOLVED');

    // 9. Verify Analytics Uptime API
    const uptimeRes = await request(app)
      .get(`/api/v1/monitors/${monitorId}/uptime?range=24h`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(uptimeRes.status).toBe(200);
    expect(uptimeRes.body.data.totalChecks).toBe(4);
    expect(uptimeRes.body.data.successfulChecks).toBe(2);
    expect(uptimeRes.body.data.failedChecks).toBe(2);
    expect(uptimeRes.body.data.uptimePercentage).toBe(50);
  });
});
