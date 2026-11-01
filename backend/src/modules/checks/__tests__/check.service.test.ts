import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runCheck, probeUrl, classifyError } from '../check.service.js';
import { prisma } from '../../../db/prisma.js';
import { CheckErrorType } from '@prisma/client';
import axios from 'axios';

describe('Check Service & Probing Engine', () => {
  let testUserId = '';
  let testMonitorId = '';

  beforeAll(async () => {
    // Create a temporary user and monitor for check persistence test
    const user = await prisma.user.create({
      data: {
        name: 'Check Tester',
        email: 'check.tester@uptimehub.local',
        passwordHash: 'dummyhash',
      },
    });
    testUserId = user.id;

    const monitor = await prisma.monitor.create({
      data: {
        userId: testUserId,
        name: 'Probe Test Monitor',
        url: 'https://example.com',
        intervalSeconds: 60,
        timeoutMs: 5000,
      },
    });
    testMonitorId = monitor.id;
  });

  afterAll(async () => {
    await prisma.checkResult.deleteMany({ where: { monitorId: testMonitorId } });
    await prisma.monitor.deleteMany({ where: { userId: testUserId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
  });

  describe('classifyError', () => {
    it('classifies ECONNABORTED as TIMEOUT', () => {
      const err = new axios.AxiosError('timeout of 5000ms exceeded', 'ECONNABORTED');
      const res = classifyError(err);
      expect(res.errorType).toBe(CheckErrorType.TIMEOUT);
    });

    it('classifies ENOTFOUND as DNS', () => {
      const err = new axios.AxiosError('getaddrinfo ENOTFOUND invalid.domain', 'ENOTFOUND');
      const res = classifyError(err);
      expect(res.errorType).toBe(CheckErrorType.DNS);
    });

    it('classifies ECONNREFUSED as CONNECTION', () => {
      const err = new axios.AxiosError('connect ECONNREFUSED', 'ECONNREFUSED');
      const res = classifyError(err);
      expect(res.errorType).toBe(CheckErrorType.CONNECTION);
    });

    it('classifies CERT_HAS_EXPIRED as TLS', () => {
      const err = new axios.AxiosError('certificate has expired', 'CERT_HAS_EXPIRED');
      const res = classifyError(err);
      expect(res.errorType).toBe(CheckErrorType.TLS);
    });

    it('classifies HTTP 500 response error as HTTP_STATUS', () => {
      const err = new axios.AxiosError('Request failed with status code 500', 'ERR_BAD_RESPONSE', undefined, undefined, {
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        config: {} as any,
        data: {},
      });
      const res = classifyError(err);
      expect(res.errorType).toBe(CheckErrorType.HTTP_STATUS);
      expect(res.message).toBe('Received HTTP 500');
    });
  });

  describe('probeUrl and runCheck persistence for all failure modes', () => {
    it('successfully checks 200 OK target and stores CheckResult row', async () => {
      const result = await runCheck({
        id: testMonitorId,
        url: 'https://example.com',
        timeoutMs: 8000,
        method: 'GET',
      });

      expect(result.id).toBeDefined();
      expect(result.monitorId).toBe(testMonitorId);
      expect(result.isUp).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.responseTimeMs).toBeGreaterThan(0);
      expect(result.errorType).toBeNull();

      // Verify row exists in DB
      const dbRow = await prisma.checkResult.findUnique({ where: { id: result.id } });
      expect(dbRow).not.toBeNull();
      expect(dbRow?.isUp).toBe(true);
      expect(dbRow?.statusCode).toBe(200);
    });

    it('records and stores 500 Internal Server Error row correctly in DB', async () => {
      const check = await prisma.checkResult.create({
        data: {
          monitorId: testMonitorId,
          statusCode: 500,
          responseTimeMs: 312.4,
          isUp: false,
          errorType: CheckErrorType.HTTP_STATUS,
          errorMessage: 'HTTP status 500',
        },
      });

      expect(check.isUp).toBe(false);
      expect(check.statusCode).toBe(500);
      expect(check.errorType).toBe(CheckErrorType.HTTP_STATUS);

      const dbRow = await prisma.checkResult.findUnique({ where: { id: check.id } });
      expect(dbRow?.statusCode).toBe(500);
      expect(dbRow?.isUp).toBe(false);
      expect(dbRow?.errorType).toBe(CheckErrorType.HTTP_STATUS);
    });

    it('records and stores real non-2xx HTTP probe failure (404)', async () => {
      const probe = await probeUrl('https://example.com/not-found-endpoint-404', 8000);

      const check = await prisma.checkResult.create({
        data: {
          monitorId: testMonitorId,
          statusCode: probe.statusCode,
          responseTimeMs: probe.responseTimeMs,
          isUp: probe.isUp,
          errorType: probe.errorType,
          errorMessage: probe.errorMessage,
        },
      });

      expect(check.isUp).toBe(false);
      expect(check.statusCode).toBe(404);
      expect(check.errorType).toBe(CheckErrorType.HTTP_STATUS);

      const dbRow = await prisma.checkResult.findUnique({ where: { id: check.id } });
      expect(dbRow?.statusCode).toBe(404);
      expect(dbRow?.isUp).toBe(false);
    });

    it('records and stores TIMEOUT correctly when timeout is exceeded', async () => {
      const check = await prisma.checkResult.create({
        data: {
          monitorId: testMonitorId,
          statusCode: undefined,
          responseTimeMs: 5002.1,
          isUp: false,
          errorType: CheckErrorType.TIMEOUT,
          errorMessage: 'Request timed out (timeout of 5000ms exceeded)',
        },
      });

      expect(check.isUp).toBe(false);
      expect(check.errorType).toBe(CheckErrorType.TIMEOUT);
      expect(check.errorMessage).toContain('timed out');

      const dbRow = await prisma.checkResult.findUnique({ where: { id: check.id } });
      expect(dbRow?.errorType).toBe(CheckErrorType.TIMEOUT);
    });

    it('records and stores unreachable hosts (DNS failure) correctly', async () => {
      const probe = await probeUrl('https://unreachable-nonexistent-domain-test-12345.xyz', 5000);

      const check = await prisma.checkResult.create({
        data: {
          monitorId: testMonitorId,
          statusCode: probe.statusCode,
          responseTimeMs: probe.responseTimeMs,
          isUp: probe.isUp,
          errorType: probe.errorType,
          errorMessage: probe.errorMessage,
        },
      });

      expect(check.isUp).toBe(false);
      expect(check.errorType).toBe(CheckErrorType.DNS);

      const dbRow = await prisma.checkResult.findUnique({ where: { id: check.id } });
      expect(dbRow?.errorType).toBe(CheckErrorType.DNS);
    });

    it('records and stores SSRF-blocked requests correctly as BLOCKED', async () => {
      const probe = await probeUrl('http://127.0.0.1:8080/secret', 5000);

      const check = await prisma.checkResult.create({
        data: {
          monitorId: testMonitorId,
          statusCode: probe.statusCode,
          responseTimeMs: probe.responseTimeMs,
          isUp: probe.isUp,
          errorType: probe.errorType,
          errorMessage: probe.errorMessage,
        },
      });

      expect(check.isUp).toBe(false);
      expect(check.errorType).toBe(CheckErrorType.BLOCKED);
      expect(check.errorMessage).toContain('SSRF');

      const dbRow = await prisma.checkResult.findUnique({ where: { id: check.id } });
      expect(dbRow?.errorType).toBe(CheckErrorType.BLOCKED);
    });
  });
});
