import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import * as ctrl from './reporting.controller.js';

const router = Router();

router.get('/statement',              authenticate, authorize('reports:view'),   ctrl.getStatement);
router.get('/transactions',           authenticate, authorize('reports:view'),   ctrl.getTransactions);
router.get('/fx-summary',             authenticate, authorize('reports:view'),   ctrl.getFxSummary);
router.get('/reconciliation',         authenticate, authorize('reports:view'),   ctrl.listReconciliation);
router.get('/reconciliation/:date',   authenticate, authorize('reports:view'),   ctrl.getReconciliationByDate);
router.get('/audit',                  authenticate, authorize('admin:config'),   ctrl.getAuditLogs);

export default router;
