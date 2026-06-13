import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import { validateUUID } from '../../shared/middleware/validateUUID.js';
import * as ctrl from './accounts.controller.js';

const router = Router();

router.get('/fee-preview', authenticate, authorize('accounts:view'), ctrl.feePreview);
router.post('/', authenticate, authorize('accounts:create'), ctrl.provision);
router.get('/', authenticate, authorize('accounts:view'), ctrl.list);
router.get('/:id', authenticate, authorize('accounts:view'), validateUUID('id'), ctrl.getOne);
router.get('/:id/ledger', authenticate, authorize('accounts:view'), validateUUID('id'), ctrl.getLedger);
router.post('/:id/adjust', authenticate, authorize('accounts:manage'), validateUUID('id'), ctrl.adjust);

export default router;
