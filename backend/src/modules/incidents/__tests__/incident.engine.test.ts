import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { calculateNextState, processCheckResult } from '../incident.engine.js';
import { MonitorStatus, IncidentStatus } from '@prisma/client';
import { prisma } from '../../../db/prisma.js';
import request from 'supertest';
import app from '../../../app.js';

describe('Phase 6: Incident Engine & State Machine', () => {
  let userTokenA = '';
  let userIdA = '';
  let userTokenB = '';
  let userIdB = '';
  let testMonitorId = '';

  beforeAll(async () => {
    // Register User A
    const resA = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Incident Tester A',
        email: 'incident.tester.a@uptimehub.local',
        password: 'password123',
      });
    userTokenA = resA.body.data.token;
    userIdA = resA.body.data.user.id;

    // Register User B
    const resB = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Incident Tester B',
        email: 'incident.tester.b@uptimehub.local',
        password: 'password123',
      });
    userTokenB = resB.body.data.token;
    userIdB = resB.body.data.user.id;

    // Create monitor for User A
    const mon = await prisma.monitor.create({
      data: {
        userId: userIdA,
        name: 'Outage Target',
        url: 'https://example.com',
        intervalSeconds: 60,
        timeoutMs: 5000,
        failureThreshold: 2, // k = 2
        recoveryThreshold: 2, // r = 2
        currentStatus: MonitorStatus.UP,
      },
    });
    testMonitorId = mon.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany();
    await prisma.incident.deleteMany();
    await prisma.checkResult.deleteMany();
    await prisma.monitor.deleteMany({ where: { userId: { in: [userIdA, userIdB] } } });
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: [userIdA, userIdB] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userIdA, userIdB] } } });
    await prisma.$disconnect();
  });

  describe('Pure State Machine Unit Transitions (calculateNextState)', () => {
    it('UP + failure -> SUSPECT (fails = 1, action = NONE)', () => {
      const next = calculateNextState(
        {
          currentStatus: MonitorStatus.UP,
          consecutiveFailures: 0,
          consecutiveSuccesses: 0,
          failureThreshold: 2,
          recoveryThreshold: 2,
        },
        false
      );

      expect(next.nextStatus).toBe(MonitorStatus.SUSPECT);
      expect(next.consecutiveFailures).toBe(1);
      expect(next.action).toBe('NONE');
    });

    it('SUSPECT + success -> UP (transitory glitch recovered, counters reset)', () => {
      const next = calculateNextState(
        {
          currentStatus: MonitorStatus.SUSPECT,
          consecutiveFailures: 1,
          consecutiveSuccesses: 0,
          failureThreshold: 2,
          recoveryThreshold: 2,
        },
        true
      );

      expect(next.nextStatus).toBe(MonitorStatus.UP);
      expect(next.consecutiveFailures).toBe(0);
      expect(next.consecutiveSuccesses).toBe(0);
      expect(next.action).toBe('NONE');
    });

    it('SUSPECT + 2nd failure -> DOWN (k-th failure reached, action = OPEN_INCIDENT)', () => {
      const next = calculateNextState(
        {
          currentStatus: MonitorStatus.SUSPECT,
          consecutiveFailures: 1,
          consecutiveSuccesses: 0,
          failureThreshold: 2,
          recoveryThreshold: 2,
        },
        false
      );

      expect(next.nextStatus).toBe(MonitorStatus.DOWN);
      expect(next.consecutiveFailures).toBe(2);
      expect(next.action).toBe('OPEN_INCIDENT');
    });

    it('DOWN + failure -> remains DOWN (no duplicate incident opened)', () => {
      const next = calculateNextState(
        {
          currentStatus: MonitorStatus.DOWN,
          consecutiveFailures: 2,
          consecutiveSuccesses: 0,
          failureThreshold: 2,
          recoveryThreshold: 2,
        },
        false
      );

      expect(next.nextStatus).toBe(MonitorStatus.DOWN);
      expect(next.consecutiveFailures).toBe(3);
      expect(next.action).toBe('NONE');
    });

    it('DOWN + success -> RECOVERING (oks = 1, action = NONE)', () => {
      const next = calculateNextState(
        {
          currentStatus: MonitorStatus.DOWN,
          consecutiveFailures: 3,
          consecutiveSuccesses: 0,
          failureThreshold: 2,
          recoveryThreshold: 2,
        },
        true
      );

      expect(next.nextStatus).toBe(MonitorStatus.RECOVERING);
      expect(next.consecutiveSuccesses).toBe(1);
      expect(next.action).toBe('NONE');
    });

    it('RECOVERING + failure -> falls back to DOWN without new incident', () => {
      const next = calculateNextState(
        {
          currentStatus: MonitorStatus.RECOVERING,
          consecutiveFailures: 3,
          consecutiveSuccesses: 1,
          failureThreshold: 2,
          recoveryThreshold: 2,
        },
        false
      );

      expect(next.nextStatus).toBe(MonitorStatus.DOWN);
      expect(next.consecutiveSuccesses).toBe(0);
      expect(next.action).toBe('NONE');
    });

    it('RECOVERING + 2nd success -> UP (r-th success reached, action = RESOLVE_INCIDENT)', () => {
      const next = calculateNextState(
        {
          currentStatus: MonitorStatus.RECOVERING,
          consecutiveFailures: 3,
          consecutiveSuccesses: 1,
          failureThreshold: 2,
          recoveryThreshold: 2,
        },
        true
      );

      expect(next.nextStatus).toBe(MonitorStatus.UP);
      expect(next.consecutiveFailures).toBe(0);
      expect(next.consecutiveSuccesses).toBe(0);
      expect(next.action).toBe('RESOLVE_INCIDENT');
    });
  });

  describe('End-to-End Outage Lifecycle & Single Transaction Processing', () => {
    let openedIncidentId = '';

    it('Check 1 (Failed): transitions monitor from UP to SUSPECT, no incident opened', async () => {
      const probe = {
        isUp: false,
        statusCode: 500,
        errorMessage: 'HTTP status 500',
        responseTimeMs: 250,
        checkedAt: new Date(Date.now() - 60000),
      };

      const res = await processCheckResult(testMonitorId, probe);

      expect(res.monitor.currentStatus).toBe(MonitorStatus.SUSPECT);
      expect(res.monitor.consecutiveFailures).toBe(1);
      expect(res.incident).toBeNull();

      const incidents = await prisma.incident.findMany({ where: { monitorId: testMonitorId } });
      expect(incidents.length).toBe(0);
    });

    it('Check 2 (Failed): 2nd consecutive failure transitions to DOWN and opens exactly 1 incident', async () => {
      const probe = {
        isUp: false,
        statusCode: 500,
        errorMessage: 'HTTP status 500',
        responseTimeMs: 260,
        checkedAt: new Date(),
      };

      const res = await processCheckResult(testMonitorId, probe);

      expect(res.monitor.currentStatus).toBe(MonitorStatus.DOWN);
      expect(res.monitor.consecutiveFailures).toBe(2);
      expect(res.incident).not.toBeNull();
      expect(res.incident?.status).toBe(IncidentStatus.OPEN);

      openedIncidentId = res.incident!.id;

      // Verify DB has exactly 1 incident
      const incidents = await prisma.incident.findMany({ where: { monitorId: testMonitorId } });
      expect(incidents.length).toBe(1);
      expect(incidents[0].status).toBe(IncidentStatus.OPEN);
    });

    it('Check 3 (Failed - Duplicate/Repeated): stays DOWN and produces NO duplicate incident rows', async () => {
      const probe = {
        isUp: false,
        statusCode: 500,
        errorMessage: 'HTTP status 500',
        responseTimeMs: 270,
        checkedAt: new Date(),
      };

      const res = await processCheckResult(testMonitorId, probe);

      expect(res.monitor.currentStatus).toBe(MonitorStatus.DOWN);
      expect(res.monitor.consecutiveFailures).toBe(3);

      // Verify still only 1 incident in total exists
      const incidents = await prisma.incident.findMany({ where: { monitorId: testMonitorId } });
      expect(incidents.length).toBe(1);
      expect(incidents[0].id).toBe(openedIncidentId);
    });

    it('Check 4 (Success): transitions to RECOVERING, incident remains open', async () => {
      const probe = {
        isUp: true,
        statusCode: 200,
        responseTimeMs: 95,
        checkedAt: new Date(Date.now() - 30000),
      };

      const res = await processCheckResult(testMonitorId, probe);

      expect(res.monitor.currentStatus).toBe(MonitorStatus.RECOVERING);
      expect(res.monitor.consecutiveSuccesses).toBe(1);

      const incident = await prisma.incident.findUnique({ where: { id: openedIncidentId } });
      expect(incident?.status).toBe(IncidentStatus.OPEN);
      expect(incident?.resolvedAt).toBeNull();
    });

    it('Check 5 (Success): 2nd consecutive success transitions to UP and resolves the incident', async () => {
      const probe = {
        isUp: true,
        statusCode: 200,
        responseTimeMs: 90,
        checkedAt: new Date(),
      };

      const res = await processCheckResult(testMonitorId, probe);

      expect(res.monitor.currentStatus).toBe(MonitorStatus.UP);
      expect(res.monitor.consecutiveSuccesses).toBe(0);
      expect(res.monitor.consecutiveFailures).toBe(0);

      const incident = await prisma.incident.findUnique({ where: { id: openedIncidentId } });
      expect(incident?.status).toBe(IncidentStatus.RESOLVED);
      expect(incident?.resolvedAt).not.toBeNull();
    });
  });

  describe('GET /api/v1/incidents API Contract', () => {
    it('returns incidents for User A', async () => {
      const res = await request(app)
        .get('/api/v1/incidents')
        .set('Authorization', `Bearer ${userTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].monitor.name).toBe('Outage Target');
    });

    it('filters incidents by status', async () => {
      const resResolved = await request(app)
        .get('/api/v1/incidents?status=RESOLVED')
        .set('Authorization', `Bearer ${userTokenA}`);

      expect(resResolved.status).toBe(200);
      expect(resResolved.body.data.length).toBe(1);

      const resOpen = await request(app)
        .get('/api/v1/incidents?status=OPEN')
        .set('Authorization', `Bearer ${userTokenA}`);

      expect(resOpen.status).toBe(200);
      expect(resOpen.body.data.length).toBe(0);
    });

    it('enforces user isolation (User B cannot see User A incidents)', async () => {
      const resB = await request(app)
        .get('/api/v1/incidents')
        .set('Authorization', `Bearer ${userTokenB}`);

      expect(resB.status).toBe(200);
      expect(resB.body.data.length).toBe(0);
    });
  });
});

