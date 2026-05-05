import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import * as ctrl from './notifications.controller.js';

const router = Router();

router.get('/stream', authenticate, ctrl.stream);
router.get('/', authenticate, ctrl.list);
router.put('/read-all', authenticate, ctrl.markAllRead);
router.put('/:id/read', authenticate, ctrl.markRead);

export default router;
