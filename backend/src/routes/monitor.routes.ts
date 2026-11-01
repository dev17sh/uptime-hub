import { Router } from 'express';
import { monitorController, createMonitorSchema, updateMonitorSchema } from '../modules/monitors/index.js';
import { analyticsController } from '../modules/analytics/index.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

// All monitor routes require authentication
router.use(requireAuth);

router.get('/', monitorController.list);
router.post('/', validateBody(createMonitorSchema), monitorController.create);
router.get('/:id', monitorController.get);
router.patch('/:id', validateBody(updateMonitorSchema), monitorController.update);
router.post('/:id/pause', monitorController.pause);
router.post('/:id/resume', monitorController.resume);
router.delete('/:id', monitorController.remove);

// Manual check trigger and check history
router.post('/:id/check', monitorController.manualCheck);
router.get('/:id/checks', monitorController.getChecks);
router.get('/:id/uptime', analyticsController.getUptimeStats);

export default router;

