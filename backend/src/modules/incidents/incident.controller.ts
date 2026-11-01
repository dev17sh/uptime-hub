import type { Request, Response, NextFunction } from 'express';
import * as incidentService from './incident.service.js';
import type { IncidentStatus } from '@prisma/client';

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const monitorId = req.query.monitorId as string | undefined;
    const status = req.query.status as IncidentStatus | undefined;

    const incidents = await incidentService.listIncidents(req.user!.id, {
      monitorId,
      status,
    });

    res.status(200).json({ success: true, data: incidents });
  } catch (error) {
    next(error);
  }
}

export async function get(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const incident = await incidentService.getIncidentById(req.user!.id, req.params.id as string);
    res.status(200).json({ success: true, data: incident });
  } catch (error) {
    next(error);
  }
}

