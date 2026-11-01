export interface HealthStatus {
  status: string;
  service: string;
  timestamp: string;
  uptime: number;
}

export function getHealthStatus(): HealthStatus {
  return {
    status: 'OK',
    service: 'UptimeHub API',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
}
