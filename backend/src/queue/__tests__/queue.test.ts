import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  checkQueue,
  checkQueueEvents,
  scheduleMonitorCheck,
  removeMonitorCheck,
  reconcileQueueJobs,
  getMonitorSchedulerId,
} from '../check.queue.js';
import { createMonitorWorker } from '../../workers/monitor.worker.js';
import { prisma } from '../../db/prisma.js';
import request from 'supertest';
import app from '../../app.js';

describe('Phase 5: Queue, Worker & Scheduler Integration', () => {
  let userToken = '';
  let userId = '';
  let testMonitorId = '';
  let worker: ReturnType<typeof createMonitorWorker>;

  beforeAll(async () => {
    // Register test user
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Queue Test User',
        email: 'queue.tester@uptimehub.local',
        password: 'password123',
      });
    userToken = res.body.data.token;
    userId = res.body.data.user.id;

    // Start worker
    worker = createMonitorWorker();
  });

  afterAll(async () => {
    if (worker) {
      await worker.close();
    }
    // Clean queue
    const schedulers = await checkQueue.getJobSchedulers();
    for (const s of schedulers) {
      const id = s.id || s.key;
      if (id) {
        await checkQueue.removeJobScheduler(id);
      }
    }
    await checkQueue.close();
    await checkQueueEvents.close();

    // Clean DB
    await prisma.checkResult.deleteMany();
    await prisma.monitor.deleteMany({ where: { userId } });
    await prisma.notificationPreference.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('schedules a repeatable job scheduler when a monitor is created', async () => {
    const res = await request(app)
      .post('/api/v1/monitors')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'Queue Check Monitor',
        url: 'https://example.com',
        intervalSeconds: 30,
        timeoutMs: 5000,
      });

    expect(res.status).toBe(201);
    testMonitorId = res.body.data.id;

    const schedulers = await checkQueue.getJobSchedulers();
    const schedulerId = getMonitorSchedulerId(testMonitorId);
    const found = schedulers.find((s) => s.name === schedulerId || s.key === schedulerId);

    expect(found).toBeDefined();
    expect(found?.every).toBe(30000);
  });

  it('removes the scheduler from queue when monitor is paused', async () => {
    const res = await request(app)
      .post(`/api/v1/monitors/${testMonitorId}/pause`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);

    const schedulers = await checkQueue.getJobSchedulers();
    const schedulerId = getMonitorSchedulerId(testMonitorId);
    const found = schedulers.find((s) => s.name === schedulerId || s.key === schedulerId);

    expect(found).toBeUndefined();
  });

  it('re-adds the scheduler to queue when monitor is resumed', async () => {
    const res = await request(app)
      .post(`/api/v1/monitors/${testMonitorId}/resume`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(true);

    const schedulers = await checkQueue.getJobSchedulers();
    const schedulerId = getMonitorSchedulerId(testMonitorId);
    const found = schedulers.find((s) => s.name === schedulerId || s.key === schedulerId);

    expect(found).toBeDefined();
  });

  it('reconciles queue jobs with database active monitors', async () => {
    // 1. Manually remove the scheduler from queue
    await removeMonitorCheck(testMonitorId);
    let schedulers = await checkQueue.getJobSchedulers();
    expect(
      schedulers.find((s) => s.name === getMonitorSchedulerId(testMonitorId) || s.key === getMonitorSchedulerId(testMonitorId))
    ).toBeUndefined();

    // 2. Run reconciliation (monitor in DB is still active)
    const result = await reconcileQueueJobs();
    expect(result.scheduled).toBeGreaterThanOrEqual(1);

    // 3. Verify it was restored in BullMQ
    schedulers = await checkQueue.getJobSchedulers();
    expect(
      schedulers.find((s) => s.name === getMonitorSchedulerId(testMonitorId) || s.key === getMonitorSchedulerId(testMonitorId))
    ).toBeDefined();
  });

  it('worker processes a check job and persists result to PostgreSQL', async () => {
    // Manually add an immediate check job to the queue
    const job = await checkQueue.add('check-probe', { monitorId: testMonitorId });
    expect(job.id).toBeDefined();

    // Wait for worker to pick up and process job
    const checkResult = (await job.waitUntilFinished(checkQueueEvents)) as any;

    expect(checkResult).toBeDefined();
    expect(checkResult.monitorId).toBe(testMonitorId);
    expect(checkResult.statusCode).toBe(200);
    expect(checkResult.isUp).toBe(true);

    // Verify written to PostgreSQL CheckResult table
    const dbRow = await prisma.checkResult.findFirst({
      where: { monitorId: testMonitorId },
      orderBy: { checkedAt: 'desc' },
    });

    expect(dbRow).not.toBeNull();
    expect(dbRow?.isUp).toBe(true);
    expect(dbRow?.statusCode).toBe(200);
  });

  it('survives worker restart seamlessly', async () => {
    // Stop current worker
    await worker.close();

    // Restart a new worker instance
    worker = createMonitorWorker();

    // Enqueue another check job
    const job = await checkQueue.add('check-probe', { monitorId: testMonitorId });
    const checkResult = (await job.waitUntilFinished(checkQueueEvents)) as any;

    expect(checkResult).toBeDefined();
    expect(checkResult.isUp).toBe(true);
    expect(checkResult.statusCode).toBe(200);
  });

  it('removes scheduler when monitor is deleted', async () => {
    const res = await request(app)
      .delete(`/api/v1/monitors/${testMonitorId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);

    const schedulers = await checkQueue.getJobSchedulers();
    const schedulerId = getMonitorSchedulerId(testMonitorId);
    const found = schedulers.find((s) => s.name === schedulerId || s.key === schedulerId);

    expect(found).toBeUndefined();
  });
});
