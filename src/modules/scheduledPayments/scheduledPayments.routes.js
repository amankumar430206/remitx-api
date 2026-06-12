import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import * as ctrl from './scheduledPayments.controller.js';

const router = Router();

router.post(   '/',     authenticate, authorize('payments:create'), ctrl.create);
router.get(    '/',     authenticate, authorize('payments:view'),   ctrl.list);
router.get(    '/:id',  authenticate, authorize('payments:view'),   ctrl.getOne);
router.put(    '/:id',  authenticate, authorize('payments:create'), ctrl.update);
router.delete( '/:id',  authenticate, authorize('payments:cancel'), ctrl.cancel);

export default router;
