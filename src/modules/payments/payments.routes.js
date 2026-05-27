import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import { kycGuard } from '../../shared/middleware/kycGuard.js';
import { requireIdempotencyKey } from '../../shared/middleware/idempotency.js';
import { validateUUID } from '../../shared/middleware/validateUUID.js';
import * as ctrl from './payments.controller.js';

const router = Router();

router.post(
  '/',
  authenticate,
  authorize('payments:create'),
  kycGuard,
  requireIdempotencyKey,
  ctrl.submit,
);

router.get('/', authenticate, authorize('payments:create'), ctrl.list);

router.get(
  '/fee-preview',
  authenticate,
  authorize('payments:create'),
  ctrl.getFeePreview,
);

router.get(
  '/approval-queue',
  authenticate,
  authorize('payments:approve'),
  ctrl.getApprovalQueue,
);

router.get('/:id', authenticate, authorize('payments:create'), validateUUID('id'), ctrl.getOne);

router.put(
  '/:id/approve',
  authenticate,
  authorize('payments:approve'),
  validateUUID('id'),
  ctrl.approve,
);

router.put(
  '/:id/reject',
  authenticate,
  authorize('payments:approve'),
  validateUUID('id'),
  ctrl.reject,
);

router.put(
  '/:id/cancel',
  authenticate,
  authorize('payments:cancel'),
  validateUUID('id'),
  ctrl.cancel,
);

export default router;
