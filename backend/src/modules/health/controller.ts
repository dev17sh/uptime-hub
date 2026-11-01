import type { Request, Response } from 'express';
import { getHealthStatus } from './health.service.js';

export function healthCheck(_req: Request, res: Response): void {
  const health = getHealthStatus();
  res.status(200).json({ success: true, data: health });
}
