export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface AuthData {
  user: User;
  token: string;
}

export type MonitorStatus = 'UP' | 'SUSPECT' | 'DOWN' | 'RECOVERING';

export interface Monitor {
  id: string;
  userId: string;
  name: string;
  url: string;
  method: string;
  intervalSeconds: number;
  timeoutMs: number;
  failureThreshold: number;
  recoveryThreshold: number;
  isActive: boolean;
  currentStatus: MonitorStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMonitorInput {
  name: string;
  url: string;
  method?: string;
  intervalSeconds?: number;
  timeoutMs?: number;
  failureThreshold?: number;
  recoveryThreshold?: number;
}

export interface CheckResult {
  id: string;
  monitorId: string;
  statusCode?: number | null;
  responseTimeMs?: number | null;
  isUp: boolean;
  errorType?: string | null;
  errorMessage?: string | null;
  checkedAt: string;
}

export interface Incident {
  id: string;
  monitorId: string;
  startedAt: string;
  resolvedAt?: string | null;
  status: 'OPEN' | 'RESOLVED';
  failureReason?: string | null;
  monitor?: {
    id: string;
    name: string;
    url: string;
  };
}

export interface TimeSeriesPoint {
  timestamp: string;
  label: string;
  avgLatency: number;
  p95Latency: number;
  uptime: number;
  totalChecks: number;
}

export interface UptimeStats {
  range: '24h' | '7d' | '30d';
  uptimePercentage: number;
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  timeSeries: TimeSeriesPoint[];
}
