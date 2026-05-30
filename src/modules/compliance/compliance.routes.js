import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { mkdirSync } from 'fs';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import * as ctrl from './compliance.controller.js';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', req.user.tenantId, req.user.sub);
    mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    cb(null, allowed.includes(file.mimetype));
  },
});

const router = Router();

router.post('/kyc/initiate',                  authenticate, ctrl.initiateKyc);
router.get('/kyc/status',                     authenticate, ctrl.getKycStatus);
router.post('/kyc/documents',                 authenticate, upload.single('document'), ctrl.uploadDocument);
router.get('/kyc/documents/:storedAs',        authenticate, ctrl.serveDocument);

router.get('/queue', authenticate, authorize('compliance:review'), ctrl.listQueue);
router.put('/:id/clear', authenticate, authorize('compliance:review'), ctrl.clearPayment);
router.put('/:id/block', authenticate, authorize('compliance:review'), ctrl.blockPayment);

export default router;
