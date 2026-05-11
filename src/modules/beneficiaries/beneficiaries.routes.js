import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import { validateUUID } from '../../shared/middleware/validateUUID.js';
import * as ctrl from './beneficiaries.controller.js';

const router = Router();

router.post('/', authenticate, authorize('beneficiaries:create'), ctrl.create);
router.get('/', authenticate, authorize('beneficiaries:view'), ctrl.list);
router.get('/:id', authenticate, authorize('beneficiaries:view'), validateUUID('id'), ctrl.getOne);
router.put('/:id', authenticate, authorize('beneficiaries:create'), validateUUID('id'), ctrl.update);
router.delete('/:id', authenticate, authorize('beneficiaries:delete'), validateUUID('id'), ctrl.remove);

export default router;
