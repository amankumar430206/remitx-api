import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import * as ctrl from './tenants.controller.js';

const router = Router();

router.get('/config', ctrl.getConfig);
router.get('/theme', ctrl.getTheme);
router.get('/webhook-config', authenticate, authorize('admin:config'), ctrl.getWebhookConfig);
router.put('/webhook-config', authenticate, authorize('admin:config'), ctrl.updateWebhookConfig);

// ─── User management ──────────────────────────────────────────────────────────
router.post('/users/invite', authenticate, authorize('users:*'), ctrl.inviteUser);
router.get('/users',         authenticate, authorize('users:*'), ctrl.listUsers);
router.get('/users/:id',     authenticate, authorize('users:*'), ctrl.getUserById);
router.put('/users/:id/status',      authenticate, authorize('users:*'), ctrl.updateUserStatus);
router.put('/users/:id/permissions', authenticate, authorize('users:*'), ctrl.updateUserPermissions);

// ─── Sub-clients ──────────────────────────────────────────────────────────────
router.post('/sub-clients',     authenticate, authorize('subclients:*'), ctrl.createSubClient);
router.get('/sub-clients',      authenticate, authorize('subclients:*'), ctrl.listSubClients);
router.get('/sub-clients/:id',  authenticate, authorize('subclients:*'), ctrl.getSubClientById);

// ─── Roles ────────────────────────────────────────────────────────────────────
router.post('/roles', authenticate, authorize('admin:config'), ctrl.upsertRole);
router.get('/roles',  authenticate, authorize('admin:config'), ctrl.listRoles);

export default router;
