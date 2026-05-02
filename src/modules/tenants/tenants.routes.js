import { Router } from 'express';
import * as ctrl from './tenants.controller.js';

const router = Router();

router.get('/config', ctrl.getConfig);
router.get('/theme', ctrl.getTheme);

export default router;
