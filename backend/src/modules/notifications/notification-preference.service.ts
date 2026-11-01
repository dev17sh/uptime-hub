import { prisma } from '../../db/prisma.js';

export interface UpdatePreferencesInput {
  emailEnabled?: boolean;
  downtimeEnabled?: boolean;
  recoveryEnabled?: boolean;
}

export async function getNotificationPreferences(userId: string) {
  let prefs = await prisma.notificationPreference.findUnique({
    where: { userId },
  });

  if (!prefs) {
    prefs = await prisma.notificationPreference.create({
      data: {
        userId,
        emailEnabled: true,
        downtimeEnabled: true,
        recoveryEnabled: true,
      },
    });
  }

  return {
    emailEnabled: prefs.emailEnabled,
    downtimeEnabled: prefs.downtimeEnabled,
    recoveryEnabled: prefs.recoveryEnabled,
  };
}

export async function updateNotificationPreferences(
  userId: string,
  data: UpdatePreferencesInput
) {
  const prefs = await prisma.notificationPreference.upsert({
    where: { userId },
    update: {
      ...(typeof data.emailEnabled === 'boolean' ? { emailEnabled: data.emailEnabled } : {}),
      ...(typeof data.downtimeEnabled === 'boolean' ? { downtimeEnabled: data.downtimeEnabled } : {}),
      ...(typeof data.recoveryEnabled === 'boolean' ? { recoveryEnabled: data.recoveryEnabled } : {}),
    },
    create: {
      userId,
      emailEnabled: data.emailEnabled ?? true,
      downtimeEnabled: data.downtimeEnabled ?? true,
      recoveryEnabled: data.recoveryEnabled ?? true,
    },
  });

  return {
    emailEnabled: prefs.emailEnabled,
    downtimeEnabled: prefs.downtimeEnabled,
    recoveryEnabled: prefs.recoveryEnabled,
  };
}
