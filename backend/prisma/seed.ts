import { PrismaClient, MonitorStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean existing data
  await prisma.notification.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await prisma.checkResult.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.monitor.deleteMany();
  await prisma.user.deleteMany();

  // Create test user
  const user = await prisma.user.create({
    data: {
      name: 'Test Engineer',
      email: 'admin@uptimehub.local',
      passwordHash: 'dummy_hash_for_seed', // Will be real bcrypt hash in Phase 3
      notificationPreference: {
        create: {
          emailEnabled: true,
          downtimeEnabled: true,
          recoveryEnabled: true,
        },
      },
      monitors: {
        create: [
          {
            name: 'Google DNS / Web',
            url: 'https://www.google.com',
            method: 'GET',
            intervalSeconds: 60,
            timeoutMs: 5000,
            failureThreshold: 2,
            recoveryThreshold: 2,
            isActive: true,
            currentStatus: MonitorStatus.UP,
          },
          {
            name: 'Example Domain',
            url: 'https://example.com',
            method: 'GET',
            intervalSeconds: 30,
            timeoutMs: 5000,
            failureThreshold: 2,
            recoveryThreshold: 2,
            isActive: true,
            currentStatus: MonitorStatus.UP,
          },
        ],
      },
    },
    include: {
      monitors: true,
      notificationPreference: true,
    },
  });

  console.log(`✅ Seeded user: ${user.email} with ${user.monitors.length} monitors`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

