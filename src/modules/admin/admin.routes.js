import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import * as ctrl from './admin.controller.js';

const router = Router();

router.get('/kyc-queue', authenticate, authorize('admin:kyc'), ctrl.getKycQueue);
router.put('/tenants/:id/kyc/:userId/approve', authenticate, authorize('admin:kyc'), ctrl.approveUserKyc);
router.put('/tenants/:id/kyc/:userId/reject', authenticate, authorize('admin:kyc'), ctrl.rejectUserKyc);

export default router;
