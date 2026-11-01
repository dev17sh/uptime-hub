import { prisma } from '../../db/prisma.js';
import type { Incident, IncidentStatus } from '@prisma/client';
import type { AppError } from '../../middleware/error-handler.js';

function createError(message: string, statusCode: number, code: string): AppError {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.code = code;
  error.isOperational = true;
  return error;
}

export interface IncidentFilters {
  monitorId?: string;
  status?: IncidentStatus;
}

export async function listIncidents(
  userId: string,
  filters: IncidentFilters
): Promise<Incident[]> {
  const whereClause: {
    monitor: { userId: string };
    monitorId?: string;
    status?: IncidentStatus;
  } = {
    monitor: { userId },
  };

  if (filters.monitorId) {
    whereClause.monitorId = filters.monitorId;
  }

  if (filters.status) {
    whereClause.status = filters.status;
  }

  return prisma.incident.findMany({
    where: whereClause,
    include: {
      monitor: {
        select: {
          id: true,
          name: true,
          url: true,
        },
      },
    },
    orderBy: { startedAt: 'desc' },
  });
}

export async function getIncidentById(userId: string, incidentId: string): Promise<Incident> {
  const incident = await prisma.incident.findFirst({
    where: {
      id: incidentId,
      monitor: { userId },
    },
    include: {
      monitor: {
        select: {
          id: true,
          name: true,
          url: true,
        },
      },
      notifications: true,
    },
  });

  if (!incident) {
    throw createError('Incident not found', 404, 'INCIDENT_NOT_FOUND');
  }

  return incident;
}

