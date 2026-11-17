import { Router } from 'express';
import { preferenceController } from '../controllers/preferenceController';
import { authenticate } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { updatePreferencesSchema } from '../utils/validation';

const router = Router();

router.use(authenticate);

router.get('/', (req, res, next) => {
  preferenceController.getPreferences(req, res, next);
});

router.put('/', validate(updatePreferencesSchema), (req, res, next) => {
  preferenceController.updatePreferences(req, res, next);
});

export const preferenceRoutes = router;
