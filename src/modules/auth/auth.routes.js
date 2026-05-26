import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { rateLimiter } from '../../shared/middleware/rateLimiter.js';
import * as ctrl from './auth.controller.js';

const router = Router();

router.post('/login', rateLimiter({ max: 5, window: 60 }), ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout', authenticate, ctrl.logout);

router.post('/mfa/setup', authenticate, ctrl.setupMfa);
router.post('/mfa/verify', authenticate, ctrl.verifyMfa);
router.post('/mfa/challenge', ctrl.mfaChallenge);

router.post('/password/reset-request', rateLimiter({ max: 3, window: 300 }), ctrl.passwordResetRequest);
router.post('/password/reset', ctrl.passwordReset);

router.post('/invite/accept', ctrl.acceptInvite);
router.post('/register', rateLimiter({ max: 5, window: 300 }), ctrl.register);

router.get('/me', authenticate, ctrl.getMe);
router.put('/me', authenticate, ctrl.updateProfile);
router.post('/password/change', authenticate, ctrl.changePassword);

export default router;
