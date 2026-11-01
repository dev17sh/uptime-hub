import type { Request, Response, NextFunction } from 'express';
import * as monitorService from './monitor.service.js';

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const monitors = await monitorService.listMonitors(req.user!.id);
    res.status(200).json({ success: true, data: monitors });
  } catch (error) {
    next(error);
  }
}

export async function get(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const monitor = await monitorService.getMonitorById(req.user!.id, req.params.id as string);
    res.status(200).json({ success: true, data: monitor });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const monitor = await monitorService.createMonitor(req.user!.id, req.body);
    res.status(201).json({ success: true, data: monitor });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const monitor = await monitorService.updateMonitor(req.user!.id, req.params.id as string, req.body);
    res.status(200).json({ success: true, data: monitor });
  } catch (error) {
    next(error);
  }
}

export async function pause(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const monitor = await monitorService.pauseMonitor(req.user!.id, req.params.id as string);
    res.status(200).json({ success: true, data: monitor });
  } catch (error) {
    next(error);
  }
}

export async function resume(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const monitor = await monitorService.resumeMonitor(req.user!.id, req.params.id as string);
    res.status(200).json({ success: true, data: monitor });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await monitorService.deleteMonitor(req.user!.id, req.params.id as string);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function manualCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const checkResult = await monitorService.triggerManualCheck(req.user!.id, req.params.id as string);
    res.status(200).json({ success: true, data: checkResult });
  } catch (error) {
    next(error);
  }
}

export async function getChecks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const result = await monitorService.getMonitorChecks(req.user!.id, req.params.id as string, {
      page,
      limit,
      from,
      to,
    });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

