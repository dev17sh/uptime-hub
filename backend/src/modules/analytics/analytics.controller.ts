import type { Request, Response, NextFunction } from 'express';
import * as analyticsService from './analytics.service.js';

export async function getUptimeStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const range = (req.query.range as string) || '24h';
    const stats = await analyticsService.getMonitorUptimeStats(
      req.user!.id,
      req.params.id as string,
      range
    );

    res.status(200).json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}

