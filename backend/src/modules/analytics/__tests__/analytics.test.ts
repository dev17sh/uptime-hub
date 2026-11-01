import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../../app.js';
import { prisma } from '../../../db/prisma.js';
import { calculateP95, getMonitorUptimeStats } from '../analytics.service.js';

describe('Analytics Service & Controller', () => {
  let userToken: string;
  let otherUserToken: string;
  let userId: string;
  let monitorId: string;

  beforeEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.incident.deleteMany();
    await prisma.checkResult.deleteMany();
    await prisma.monitor.deleteMany();
    await prisma.user.deleteMany();

    // Register user 1
    const res1 = await request(app).post('/api/v1/auth/register').send({
      email: 'analytics-user1@example.com',
      password: 'Password123!',
      name: 'Analytics User 1',
    });
    userToken = res1.body.data.token;
    userId = res1.body.data.user.id;

    // Register user 2
    const res2 = await request(app).post('/api/v1/auth/register').send({
      email: 'analytics-user2@example.com',
      password: 'Password123!',
      name: 'Analytics User 2',
    });
    otherUserToken = res2.body.data.token;

    // Create a monitor for user 1
    const mon = await prisma.monitor.create({
      data: {
        userId,
        name: 'Analytics Test Monitor',
        url: 'https://example.com/test',
        method: 'GET',
        intervalSeconds: 60,
        timeoutMs: 5000,
        currentStatus: 'UP',
      },
    });
    monitorId = mon.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('calculateP95', () => {
    it('returns 0 for empty array', () => {
      expect(calculateP95([])).toBe(0);
    });

    it('returns single element for array of length 1', () => {
      expect(calculateP95([42])).toBe(42);
    });

    it('correctly calculates 95th percentile for 100 values', () => {
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      expect(calculateP95(values)).toBe(95);
    });

    it('handles unsorted array properly', () => {
      const values = [50, 10, 100, 30, 20, 90, 40, 80, 60, 70];
      const p95 = calculateP95(values);
      expect(p95).toBe(100);
    });
  });

  describe('getMonitorUptimeStats service', () => {
    it('throws 404 if monitor does not exist or user does not own it', async () => {
      await expect(
        getMonitorUptimeStats('wrong-user-id', monitorId, '24h')
      ).rejects.toThrow('Monitor not found');
    });

    it('returns 100% uptime and 0 response times when no check results exist', async () => {
      const stats = await getMonitorUptimeStats(userId, monitorId, '24h');
      expect(stats.uptimePercentage).toBe(100);
      expect(stats.totalChecks).toBe(0);
      expect(stats.avgResponseTimeMs).toBe(0);
      expect(stats.p95ResponseTimeMs).toBe(0);
      expect(stats.timeSeries.length).toBeGreaterThan(0);
    });

    it('accurately calculates uptime percentage, avg, and p95 latency', async () => {
      const now = new Date();
      // Insert 3 successful checks and 1 failure
      await prisma.checkResult.createMany({
        data: [
          {
            monitorId,
            isUp: true,
            statusCode: 200,
            responseTimeMs: 100,
            checkedAt: new Date(now.getTime() - 30 * 60 * 1000), // 30m ago
          },
          {
            monitorId,
            isUp: true,
            statusCode: 200,
            responseTimeMs: 150,
            checkedAt: new Date(now.getTime() - 20 * 60 * 1000), // 20m ago
          },
          {
            monitorId,
            isUp: true,
            statusCode: 200,
            responseTimeMs: 200,
            checkedAt: new Date(now.getTime() - 10 * 60 * 1000), // 10m ago
          },
          {
            monitorId,
            isUp: false,
            statusCode: 500,
            responseTimeMs: 50,
            checkedAt: new Date(now.getTime() - 5 * 60 * 1000), // 5m ago
          },
        ],
      });

      const stats = await getMonitorUptimeStats(userId, monitorId, '24h');
      expect(stats.totalChecks).toBe(4);
      expect(stats.successfulChecks).toBe(3);
      expect(stats.failedChecks).toBe(1);
      expect(stats.uptimePercentage).toBe(75);
      // Average: (100 + 150 + 200 + 50) / 4 = 125
      expect(stats.avgResponseTimeMs).toBe(125);
      expect(stats.p95ResponseTimeMs).toBe(200);
    });
  });

  describe('GET /api/v1/monitors/:id/uptime API endpoint', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get(`/api/v1/monitors/${monitorId}/uptime`);
      expect(res.status).toBe(401);
    });

    it('returns 404 when accessing another user’s monitor stats', async () => {
      const res = await request(app)
        .get(`/api/v1/monitors/${monitorId}/uptime`)
        .set('Authorization', `Bearer ${otherUserToken}`);
      expect(res.status).toBe(404);
    });

    it('returns 200 with uptime stats and time series for 24h range', async () => {
      const res = await request(app)
        .get(`/api/v1/monitors/${monitorId}/uptime?range=24h`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.range).toBe('24h');
      expect(res.body.data.uptimePercentage).toBe(100);
      expect(Array.isArray(res.body.data.timeSeries)).toBe(true);
      expect(res.body.data.timeSeries.length).toBe(24);
    });

    it('supports 7d and 30d range parameters', async () => {
      const res7d = await request(app)
        .get(`/api/v1/monitors/${monitorId}/uptime?range=7d`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(res7d.status).toBe(200);
      expect(res7d.body.data.range).toBe('7d');

      const res30d = await request(app)
        .get(`/api/v1/monitors/${monitorId}/uptime?range=30d`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(res30d.status).toBe(200);
      expect(res30d.body.data.range).toBe('30d');
    });
  });
});
