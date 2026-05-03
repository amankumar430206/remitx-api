import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import * as ctrl from './fx.controller.js';

const router = Router();

router.get('/rates', authenticate, ctrl.getRates);
router.post('/quote', authenticate, ctrl.createQuote);
router.get('/quote/:id', authenticate, ctrl.getQuote);

export default router;
