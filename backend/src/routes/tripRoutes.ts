import { Router } from 'express';
import { tripController } from '../controllers/tripController';
import { authenticate } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { createTripSchema } from '../utils/validation';

const router = Router();

router.use(authenticate);

router.get('/', (req, res, next) => {
  tripController.listUserTrips(req, res, next);
});

router.post('/', validate(createTripSchema), (req, res, next) => {
  tripController.createTrip(req, res, next);
});

router.get('/summary', (req, res, next) => {
  tripController.getDashboardSummary(req, res, next);
});

router.get('/:tripId', (req, res, next) => {
  tripController.getTripById(req, res, next);
});

export const tripRoutes = router;
