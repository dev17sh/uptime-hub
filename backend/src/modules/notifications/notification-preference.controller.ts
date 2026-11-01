import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from './notification-preference.service.js';

export const updatePreferencesSchema = z.object({
  emailEnabled: z.boolean().optional(),
  downtimeEnabled: z.boolean().optional(),
  recoveryEnabled: z.boolean().optional(),
});

export async function getPreferencesHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const preferences = await getNotificationPreferences(userId);
    res.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    next(error);
  }
}

export async function updatePreferencesHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const input = updatePreferencesSchema.parse(req.body);
    const preferences = await updateNotificationPreferences(userId, input);
    res.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    next(error);
  }
}

