import { Router } from 'express';
import { chatController } from '../controllers/chatController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

router.post('/flights', (req, res, next) => {
  chatController.directFlightSearch(req, res, next);
});

router.post('/hotels', (req, res, next) => {
  chatController.directHotelSearch(req, res, next);
});

export const inventoryRoutes = router;
