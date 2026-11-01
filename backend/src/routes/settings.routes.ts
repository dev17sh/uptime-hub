import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getPreferencesHandler,
  updatePreferencesHandler,
} from '../modules/notifications/notification-preference.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/notifications', getPreferencesHandler);
router.put('/notifications', updatePreferencesHandler);

export default router;
