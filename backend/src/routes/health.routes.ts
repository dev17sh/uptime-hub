import { Router } from 'express';
import { healthCheck } from '../modules/health/index.js';

const router = Router();

router.get('/health', healthCheck);

export default router;
