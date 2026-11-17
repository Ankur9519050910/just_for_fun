import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma';

const router = Router();

router.get('/health', async (req: Request, res: Response) => {
  let dbStatus = 'disconnected';
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch {
    dbStatus = 'degraded';
  }

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'ai-travel-companion-backend',
    version: '1.0.0',
    database: dbStatus,
    providers: {
      amadeus: process.env.AMADEUS_CLIENT_ID ? 'configured' : 'sandbox_mock',
      duffel: process.env.DUFFEL_ACCESS_TOKEN ? 'configured' : 'sandbox_mock',
      openai: process.env.OPENAI_API_KEY ? 'configured' : 'missing'
    }
  });
});

export const healthRoutes = router;
