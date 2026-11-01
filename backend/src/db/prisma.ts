import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function connectDb(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info(' Connected to PostgreSQL database via Prisma');
  } catch (error) {
    logger.error({ err: error }, 'Failed to connect to PostgreSQL');
    throw error;
  }
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
  logger.info(' Disconnected from PostgreSQL database');
}

