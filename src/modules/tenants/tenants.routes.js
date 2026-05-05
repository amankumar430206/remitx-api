import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import * as ctrl from './tenants.controller.js';

const router = Router();

router.get('/config', ctrl.getConfig);
router.get('/theme', ctrl.getTheme);
router.get('/webhook-config', authenticate, authorize('admin:config'), ctrl.getWebhookConfig);
router.put('/webhook-config', authenticate, authorize('admin:config'), ctrl.updateWebhookConfig);

export default router;
