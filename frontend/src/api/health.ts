import apiClient from './client';

export interface HealthResponse {
  success: boolean;
  data: {
    status: string;
    service: string;
    timestamp: string;
    uptime: number;
  };
}

export async function getHealth(): Promise<HealthResponse> {
  // Health endpoint is at root, not under /api/v1
  const { data } = await apiClient.get<HealthResponse>('/health', {
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
  });
  return data;
}
