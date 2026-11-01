import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../app.js';
import { prisma } from '../../../db/prisma.js';

describe('Monitor CRUD & Manual Trigger API', () => {
  let userTokenA = '';
  let userTokenB = '';
  let userIdA = '';
  let userIdB = '';
  let createdMonitorId = '';

  beforeAll(async () => {
    // Register User A
    const resA = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Monitor User A',
        email: 'monitor.a@uptimehub.local',
        password: 'password123',
      });
    userTokenA = resA.body.data.token;
    userIdA = resA.body.data.user.id;

    // Register User B
    const resB = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Monitor User B',
        email: 'monitor.b@uptimehub.local',
        password: 'password123',
      });
    userTokenB = resB.body.data.token;
    userIdB = resB.body.data.user.id;
  });

  afterAll(async () => {
    await prisma.checkResult.deleteMany();
    await prisma.monitor.deleteMany();
    await prisma.notificationPreference.deleteMany();
    await prisma.user.deleteMany({
      where: { id: { in: [userIdA, userIdB] } },
    });
    await prisma.$disconnect();
  });

  describe('POST /api/v1/monitors', () => {
    it('creates a new monitor successfully', async () => {
      const res = await request(app)
        .post('/api/v1/monitors')
        .set('Authorization', `Bearer ${userTokenA}`)
        .send({
          name: 'Example Test',
          url: 'https://example.com',
          intervalSeconds: 60,
          timeoutMs: 5000,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Example Test');
      expect(res.body.data.url).toBe('https://example.com');
      expect(res.body.data.isActive).toBe(true);

      createdMonitorId = res.body.data.id;
    });

    it('rejects monitor creation with SSRF-violating URL', async () => {
      const res = await request(app)
        .post('/api/v1/monitors')
        .set('Authorization', `Bearer ${userTokenA}`)
        .send({
          name: 'Internal Server',
          url: 'http://169.254.169.254/secret',
          intervalSeconds: 60,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SSRF_BLOCKED');
    });

    it('rejects monitor creation with interval below minimum (30s)', async () => {
      const res = await request(app)
        .post('/api/v1/monitors')
        .set('Authorization', `Bearer ${userTokenA}`)
        .send({
          name: 'Fast Monitor',
          url: 'https://example.com',
          intervalSeconds: 10,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/monitors and Ownership Scoping', () => {
    it('returns monitors for User A', async () => {
      const res = await request(app)
        .get('/api/v1/monitors')
        .set('Authorization', `Bearer ${userTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe(createdMonitorId);
    });

    it('returns empty monitors for User B (User B cannot see User A monitors)', async () => {
      const res = await request(app)
        .get('/api/v1/monitors')
        .set('Authorization', `Bearer ${userTokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(0);
    });

    it('prevents User B from reading User A monitor detail by ID (404)', async () => {
      const res = await request(app)
        .get(`/api/v1/monitors/${createdMonitorId}`)
        .set('Authorization', `Bearer ${userTokenB}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PATCH /api/v1/monitors/:id and Pause/Resume', () => {
    it('updates monitor name', async () => {
      const res = await request(app)
        .patch(`/api/v1/monitors/${createdMonitorId}`)
        .set('Authorization', `Bearer ${userTokenA}`)
        .send({ name: 'Updated Example Test' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated Example Test');
    });

    it('pauses monitor', async () => {
      const res = await request(app)
        .post(`/api/v1/monitors/${createdMonitorId}/pause`)
        .set('Authorization', `Bearer ${userTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(false);
    });

    it('resumes monitor', async () => {
      const res = await request(app)
        .post(`/api/v1/monitors/${createdMonitorId}/resume`)
        .set('Authorization', `Bearer ${userTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(true);
    });
  });

  describe('POST /api/v1/monitors/:id/check (Phase 4 Manual Trigger)', () => {
    it('triggers a manual check and persists a CheckResult row', async () => {
      const res = await request(app)
        .post(`/api/v1/monitors/${createdMonitorId}/check`)
        .set('Authorization', `Bearer ${userTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.monitorId).toBe(createdMonitorId);
      expect(res.body.data.isUp).toBe(true);
      expect(res.body.data.statusCode).toBe(200);
      expect(res.body.data.responseTimeMs).toBeGreaterThan(0);
    });

    it('fetches monitor checks history', async () => {
      const res = await request(app)
        .get(`/api/v1/monitors/${createdMonitorId}/checks`)
        .set('Authorization', `Bearer ${userTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.checks.length).toBeGreaterThan(0);
      expect(res.body.data.total).toBeGreaterThan(0);
    });
  });

  describe('DELETE /api/v1/monitors/:id', () => {
    it('deletes the monitor', async () => {
      const res = await request(app)
        .delete(`/api/v1/monitors/${createdMonitorId}`)
        .set('Authorization', `Bearer ${userTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(true);

      const checkDeleted = await request(app)
        .get(`/api/v1/monitors/${createdMonitorId}`)
        .set('Authorization', `Bearer ${userTokenA}`);

      expect(checkDeleted.status).toBe(404);
    });
  });
});

