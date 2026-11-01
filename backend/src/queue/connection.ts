import type { ConnectionOptions } from 'bullmq';
import { env } from '../config/env.js';

/**
 * Returns Redis connection options for BullMQ.
 * maxRetriesPerRequest must be null for BullMQ workers.
 */
export function getRedisConnectionOptions(): ConnectionOptions {
  try {
    const parsed = new URL(env.REDIS_URL);
    return {
      host: parsed.hostname || 'localhost',
      port: parsed.port ? parseInt(parsed.port, 10) : 6379,
      password: parsed.password || undefined,
      username: parsed.username || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  } catch (_e) {
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }
}

