import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authenticate } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { authLimiter } from '../middleware/rateLimiter';
import { registerSchema, loginSchema } from '../utils/validation';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), (req, res, next) => {
  authController.register(req, res, next);
});

router.post('/login', authLimiter, validate(loginSchema), (req, res, next) => {
  authController.login(req, res, next);
});

router.get('/me', authenticate, (req, res, next) => {
  authController.getMe(req, res, next);
});

export const authRoutes = router;
