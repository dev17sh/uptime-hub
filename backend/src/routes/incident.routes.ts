import { Router } from 'express';
import { incidentController } from '../modules/incidents/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', incidentController.list);
router.get('/:id', incidentController.get);

export default router;

