import { performance } from 'node:perf_hooks';
import axios, { AxiosError } from 'axios';
import { prisma } from '../../db/prisma.js';
import { validateUrlSecurity } from '../../security/ssrf.js';
import { CheckErrorType } from '@prisma/client';
import type { Monitor, CheckResult } from '@prisma/client';

export interface ProbeResult {
  isUp: boolean;
  statusCode?: number;
  responseTimeMs?: number;
  errorType?: CheckErrorType;
  errorMessage?: string;
  checkedAt: Date;
}

/**
 * Classifies Axios and network errors into domain CheckErrorType enum.
 */
export function classifyError(error: unknown): { errorType: CheckErrorType; message: string } {
  if (axios.isAxiosError(error)) {
    const err = error as AxiosError;

    if (err.code === 'ECONNABORTED' || err.message.toLowerCase().includes('timeout')) {
      return {
        errorType: CheckErrorType.TIMEOUT,
        message: `Request timed out (${err.message})`,
      };
    }

    if (
      err.code === 'ENOTFOUND' ||
      err.code === 'EAI_AGAIN' ||
      err.message.toLowerCase().includes('getaddrinfo')
    ) {
      return {
        errorType: CheckErrorType.DNS,
        message: `DNS resolution failed: ${err.message}`,
      };
    }

    if (
      err.code === 'ECONNREFUSED' ||
      err.code === 'ECONNRESET' ||
      err.code === 'EHOSTUNREACH' ||
      err.code === 'ENETUNREACH'
    ) {
      return {
        errorType: CheckErrorType.CONNECTION,
        message: `Connection failed: ${err.code || err.message}`,
      };
    }

    if (
      err.code === 'CERT_HAS_EXPIRED' ||
      err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
      err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
      err.message.toLowerCase().includes('tls') ||
      err.message.toLowerCase().includes('ssl')
    ) {
      return {
        errorType: CheckErrorType.TLS,
        message: `TLS/SSL handshake failed: ${err.message}`,
      };
    }

    if (err.response) {
      return {
        errorType: CheckErrorType.HTTP_STATUS,
        message: `Received HTTP ${err.response.status}`,
      };
    }

    return {
      errorType: CheckErrorType.UNKNOWN,
      message: err.message || 'Unknown network error',
    };
  }

  if (error instanceof Error) {
    return {
      errorType: CheckErrorType.UNKNOWN,
      message: error.message,
    };
  }

  return {
    errorType: CheckErrorType.UNKNOWN,
    message: 'Unknown probing error',
  };
}

/**
 * Executes a probe against a URL, enforcing SSRF guards, strict timeout,
 * monotonic latency measurement, and result classification.
 */
export async function probeUrl(
  url: string,
  timeoutMs: number = 10000,
  method: string = 'GET'
): Promise<ProbeResult> {
  const checkedAt = new Date();

  // 1. SSRF Guard Check before outbound connection
  const ssrfCheck = await validateUrlSecurity(url);
  if (!ssrfCheck.valid) {
    const errorType =
      ssrfCheck.status === 'DNS_ERROR'
        ? CheckErrorType.DNS
        : CheckErrorType.BLOCKED;

    return {
      isUp: false,
      errorType,
      errorMessage: ssrfCheck.error || 'Blocked by security policy',
      checkedAt,
    };
  }

  // 2. Outbound probe with monotonic clock
  const startTime = performance.now();

  try {
    const response = await axios.request({
      url,
      method: method.toUpperCase(),
      timeout: timeoutMs,
      maxRedirects: 0, // Strict disable redirects in v1 per Section 7
      validateStatus: () => true, // Don't throw for 4xx/5xx so we read status code directly
      maxContentLength: 1 * 1024 * 1024, // Max 1MB response size
      maxBodyLength: 1 * 1024 * 1024,
      headers: {
        'User-Agent': 'UptimeHub-Probe/1.0',
        Accept: '*/*',
      },
    });

    const endTime = performance.now();
    const responseTimeMs = Math.round((endTime - startTime) * 100) / 100;
    const statusCode = response.status;

    // Check successful only if status code is in 2xx range (Section 5.1)
    const isUp = statusCode >= 200 && statusCode < 300;

    if (isUp) {
      return {
        isUp: true,
        statusCode,
        responseTimeMs,
        checkedAt,
      };
    } else {
      return {
        isUp: false,
        statusCode,
        responseTimeMs,
        errorType: CheckErrorType.HTTP_STATUS,
        errorMessage: `HTTP status ${statusCode}`,
        checkedAt,
      };
    }
  } catch (error) {
    const endTime = performance.now();
    const responseTimeMs = Math.round((endTime - startTime) * 100) / 100;
    const { errorType, message } = classifyError(error);

    return {
      isUp: false,
      responseTimeMs,
      errorType,
      errorMessage: message,
      checkedAt,
    };
  }
}

/**
 * Runs a check for a given monitor and persists the CheckResult row to PostgreSQL.
 */
export async function runCheck(monitor: Pick<Monitor, 'id' | 'url' | 'timeoutMs' | 'method'>): Promise<CheckResult> {
  const probe = await probeUrl(monitor.url, monitor.timeoutMs, monitor.method);

  const checkResult = await prisma.checkResult.create({
    data: {
      monitorId: monitor.id,
      statusCode: probe.statusCode,
      responseTimeMs: probe.responseTimeMs,
      isUp: probe.isUp,
      errorType: probe.errorType,
      errorMessage: probe.errorMessage,
      checkedAt: probe.checkedAt,
    },
  });

  return checkResult;
}
