import { Router } from 'express';
import { chatController } from '../controllers/chatController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticate);

// SSE Streaming Conversational Agent endpoint
router.post('/stream', (req, res, next) => {
  chatController.handleStreamMessage(req, res, next);
});

// Conversation History & Messages
router.get('/history/:conversationId', (req, res, next) => {
  chatController.getConversationHistory(req, res, next);
});

export const chatRoutes = router;
