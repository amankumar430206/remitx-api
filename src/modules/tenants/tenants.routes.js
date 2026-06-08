import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import * as ctrl from './tenants.controller.js';

const router = Router();

router.get('/config', ctrl.getConfig);
router.get('/theme',  ctrl.getTheme);
router.put('/theme',  authenticate, authorize('admin:config'), ctrl.updateTheme);
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

// ─── Roles & permissions ────────────────────────────────────────────────────────
router.get('/permissions/catalog', authenticate, authorize('admin:config'), ctrl.getPermissionCatalog);
router.get('/role-templates',      authenticate, authorize('admin:config'), ctrl.getRoleTemplates);
router.get('/roles',            authenticate, authorize('admin:config'), ctrl.listRoles);
router.post('/roles',           authenticate, authorize('admin:config'), ctrl.createRole);
router.put('/roles/:key',       authenticate, authorize('admin:config'), ctrl.updateRole);
router.delete('/roles/:key',    authenticate, authorize('admin:config'), ctrl.deleteRole);

// ─── Feature flags ────────────────────────────────────────────────────────────
// GET is open to any authenticated user (drives client-side feature gating).
// Editing is platform-level (super admin only) via the admin:features permission,
// which only super_admin satisfies (through its admin:* wildcard).
router.get('/feature-flags', authenticate, ctrl.getFeatureFlags);
router.put('/feature-flags', authenticate, authorize('admin:features'), ctrl.updateFeatureFlags);

export default router;
