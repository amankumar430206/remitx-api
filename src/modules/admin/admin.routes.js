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
router.get('/tenants/:id/provider-config',             authenticate, authorize('tenants:view'),   ctrl.getProviderConfig);
router.put('/tenants/:id/provider-config',             authenticate, authorize('tenants:update'), ctrl.updateProviderConfig);
router.get('/tenants/:id/users',                       authenticate, authorize('tenants:view'),   ctrl.listTenantUsers);
router.get('/tenants/:id/contact',                     authenticate, authorize('tenants:view'),   ctrl.getTenantContact);
router.get('/tenants/:id/beneficiaries',               authenticate, authorize('tenants:view'),   ctrl.listTenantBeneficiaries);
router.get('/tenants/:id/accounts',                    authenticate, authorize('tenants:view'),   ctrl.listTenantAccounts);
router.get('/tenants/:id/fee-config',                  authenticate, authorize('tenants:view'),   ctrl.listFeeConfigs);
router.post('/tenants/:id/fee-config',                 authenticate, authorize('tenants:update'), ctrl.createFeeConfig);
router.put('/tenants/:id/fee-config/:feeId',           authenticate, authorize('tenants:update'), ctrl.updateFeeConfig);
router.delete('/tenants/:id/fee-config/:feeId',        authenticate, authorize('tenants:update'), ctrl.deleteFeeConfig);

// ─── Global fee config ────────────────────────────────────────────────────────
router.get('/fee-config',                              authenticate, authorize('admin:*'),         ctrl.listGlobalFeeConfigs);
router.post('/fee-config',                             authenticate, authorize('admin:*'),         ctrl.createGlobalFeeConfig);
router.put('/fee-config/:feeId',                       authenticate, authorize('admin:*'),         ctrl.updateGlobalFeeConfig);
router.delete('/fee-config/:feeId',                    authenticate, authorize('admin:*'),         ctrl.deleteGlobalFeeConfig);

// ─── Per-tenant default provider ─────────────────────────────────────────────
router.put('/tenants/:id/default-provider',                authenticate, authorize('tenants:update'), ctrl.setDefaultProvider);

// ─── Per-tenant corridor CRUD ─────────────────────────────────────────────────
router.post('/tenants/:id/provider-config',                authenticate, authorize('tenants:update'), ctrl.addTenantCorridor);
router.delete('/tenants/:id/provider-config/:corridorId',  authenticate, authorize('tenants:update'), ctrl.deleteTenantCorridor);

// ─── Global provider defaults ─────────────────────────────────────────────────
router.get('/provider-defaults',                           authenticate, authorize('admin:*'),        ctrl.getGlobalProviders);
router.post('/provider-defaults',                          authenticate, authorize('admin:*'),        ctrl.addGlobalProvider);
router.delete('/provider-defaults/:corridorId',            authenticate, authorize('admin:*'),        ctrl.deleteGlobalProvider);

// ─── KYC document serving ─────────────────────────────────────────────────────
router.get('/tenants/:id/kyc/:userId/documents/:storedAs', authenticate, authorize('tenants:view'), ctrl.serveKycDocument);

// ─── Per-client branding ──────────────────────────────────────────────────────
router.get('/global-theme',                            authenticate, authorize('tenants:view'),   ctrl.getGlobalTheme);
router.get('/tenants/:id/branding',                    authenticate, authorize('tenants:view'),   ctrl.getClientTheme);
router.put('/tenants/:id/branding',                    authenticate, authorize('tenants:update'), ctrl.updateClientTheme);
router.delete('/tenants/:id/branding',                 authenticate, authorize('tenants:update'), ctrl.resetClientTheme);

// ─── Manual payment queue ─────────────────────────────────────────────────────
router.get('/payments/manual-queue',                   authenticate, authorize('admin:*'),        ctrl.getManualQueue);
router.put('/payments/:id/process',                    authenticate, authorize('admin:*'),        ctrl.processPayment);
router.get('/payments',                                authenticate, authorize('admin:*'),        ctrl.listAllPayments);

// ─── Reconciliation ───────────────────────────────────────────────────────────
router.get('/reconciliation',                          authenticate, authorize('admin:*'),        ctrl.listReconciliationExceptions);

// ─── Impersonation ────────────────────────────────────────────────────────────
router.post('/impersonate/:userId',                    authenticate, authorize('admin:*'),        ctrl.impersonateUser);

// ─── On-behalf payment ────────────────────────────────────────────────────────
router.post('/payments/on-behalf',                     authenticate, authorize('admin:*'),        ctrl.createPaymentOnBehalf);

export default router;
