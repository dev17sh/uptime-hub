import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDb, disconnectDb } from './db/prisma.js';
import { reconcileQueueJobs, checkQueue } from './queue/check.queue.js';
import app from './app.js';

async function bootstrap() {
  try {
    await connectDb();
    await reconcileQueueJobs();

    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 UptimeHub API running on port ${env.PORT} [${env.NODE_ENV}]`);
    });

    // Graceful shutdown
    async function gracefulShutdown(signal: string): Promise<void> {
      logger.info(`${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        logger.info('HTTP server closed');
        await checkQueue.close();
        await disconnectDb();
        process.exit(0);
      });
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.error({ err: error }, 'Failed to start API server');
    process.exit(1);
  }
}

bootstrap();
