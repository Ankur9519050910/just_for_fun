import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { connectDatabase, disconnectDatabase } from './db/prisma';

async function bootstrap() {
  try {
    // Attempt database connection
    await connectDatabase().catch((err) => {
      logger.warn('Initial DB connection attempt reported warning (will retry on queries): ' + err.message, 'Bootstrap');
    });

    const app = createApp();
    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 AI Travel Companion Backend running at http://localhost:${env.PORT}`, 'Server');
      logger.info(`Environment: ${env.NODE_ENV}`, 'Server');
      logger.info(`CORS Origin: ${env.CORS_ORIGIN}`, 'Server');
    });

    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Gracefully shutting down...`, 'Server');
      server.close(async () => {
        await disconnectDatabase();
        logger.info('Closed database connections and HTTP server.', 'Server');
        process.exit(0);
      });

      // Force terminate after 10s if stuck
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout', 'Server');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server', 'Bootstrap', error);
    process.exit(1);
  }
}

bootstrap();
