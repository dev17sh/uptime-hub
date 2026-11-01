import { z } from 'zod';

export const createMonitorSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  url: z.string().trim().url('Invalid URL format'),
  method: z.enum(['GET']).default('GET'),
  intervalSeconds: z.coerce.number().int().min(30, 'Minimum interval is 30 seconds').max(86400).default(60),
  timeoutMs: z.coerce.number().int().min(1000, 'Minimum timeout is 1000ms').max(30000, 'Maximum timeout is 30000ms').default(10000),
  failureThreshold: z.coerce.number().int().min(1).max(10).default(2),
  recoveryThreshold: z.coerce.number().int().min(1).max(10).default(2),
});

export const updateMonitorSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  url: z.string().trim().url('Invalid URL format').optional(),
  method: z.enum(['GET']).optional(),
  intervalSeconds: z.coerce.number().int().min(30).max(86400).optional(),
  timeoutMs: z.coerce.number().int().min(1000).max(30000).optional(),
  failureThreshold: z.coerce.number().int().min(1).max(10).optional(),
  recoveryThreshold: z.coerce.number().int().min(1).max(10).optional(),
  isActive: z.boolean().optional(),
});

export type CreateMonitorInput = z.infer<typeof createMonitorSchema>;
export type UpdateMonitorInput = z.infer<typeof updateMonitorSchema>;

