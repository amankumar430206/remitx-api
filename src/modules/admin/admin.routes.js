import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import * as ctrl from './admin.controller.js';

const router = Router();

// ─── KYC ─────────────────────────────────────────────────────────────────────
router.get('/kyc-queue',                               authenticate, authorize('admin:kyc'),     ctrl.getKycQueue);
router.put('/tenants/:id/kyc/:userId/approve',         authenticate, authorize('admin:kyc'),     ctrl.approveUserKyc);
router.put('/tenants/:id/kyc/:userId/reject',          authenticate, authorize('admin:kyc'),     ctrl.rejectUserKyc);

// ─── Tenant management ────────────────────────────────────────────────────────
router.get('/tenants',                                 authenticate, authorize('tenants:view'),   ctrl.listTenants);
router.post('/tenants',                                authenticate, authorize('tenants:create'), ctrl.createTenant);
router.get('/tenants/:id',                             authenticate, authorize('tenants:view'),   ctrl.getTenant);
router.put('/tenants/:id',                             authenticate, authorize('tenants:update'), ctrl.updateTenant);
router.put('/tenants/:id/status',                      authenticate, authorize('tenants:update'), ctrl.updateTenantStatus);
router.put('/tenants/:id/provider-config',             authenticate, authorize('tenants:update'), ctrl.updateProviderConfig);
router.get('/tenants/:id/users',                       authenticate, authorize('tenants:view'),   ctrl.listTenantUsers);

// ─── Manual payment queue ─────────────────────────────────────────────────────
router.get('/payments/manual-queue',                   authenticate, authorize('admin:*'),        ctrl.getManualQueue);
router.put('/payments/:id/process',                    authenticate, authorize('admin:*'),        ctrl.processPayment);
router.get('/payments',                                authenticate, authorize('admin:*'),        ctrl.listAllPayments);

// ─── Reconciliation ───────────────────────────────────────────────────────────
router.get('/reconciliation',                          authenticate, authorize('admin:*'),        ctrl.listReconciliationExceptions);

// ─── Impersonation ────────────────────────────────────────────────────────────
router.post('/impersonate/:userId',                    authenticate, authorize('admin:*'),        ctrl.impersonateUser);

export default router;
