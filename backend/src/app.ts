import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { apiLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import { authRoutes } from './routes/authRoutes';
import { preferenceRoutes } from './routes/preferenceRoutes';
import { tripRoutes } from './routes/tripRoutes';
import { healthRoutes } from './routes/healthRoutes';
import { chatRoutes } from './routes/chatRoutes';
import { inventoryRoutes } from './routes/inventoryRoutes';

export function createApp(): Application {
  const app: Application = express();

  // Security headers
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }));

  // CORS configuration
  app.use(
    cors({
      origin: env.CORS_ORIGIN || '*',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
    })
  );

  // Body parsers
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // General rate limiter on standard JSON API routes (exclude streaming endpoint to prevent stream throttle)
  app.use('/api/auth', apiLimiter);
  app.use('/api/preferences', apiLimiter);
  app.use('/api/trips', apiLimiter);
  app.use('/api/inventory', apiLimiter);

  // API Routes
  app.use('/api', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/preferences', preferenceRoutes);
  app.use('/api/trips', tripRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/inventory', inventoryRoutes);

  // 404 Not Found Handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint ${req.method} ${req.originalUrl} not found`
      }
    });
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
