import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import monitorRoutes from './monitor.routes.js';
import incidentRoutes from './incident.routes.js';
import settingsRoutes from './settings.routes.js';

const router = Router();

// Liveness check outside /api/v1 prefix
router.use(healthRoutes);

// API v1 prefix
const v1Router = Router();
v1Router.use('/auth', authRoutes);
v1Router.use('/monitors', monitorRoutes);
v1Router.use('/incidents', incidentRoutes);
v1Router.use('/settings', settingsRoutes);

router.use('/api/v1', v1Router);

export default router;
