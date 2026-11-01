import apiClient from './client';
import type {
  ApiResponse,
  Monitor,
  CreateMonitorInput,
  CheckResult,
  UptimeStats,
} from '../types';

export async function getMonitorsApi(): Promise<Monitor[]> {
  const { data } = await apiClient.get<ApiResponse<Monitor[]>>('/monitors');
  return data.data;
}

export async function getMonitorByIdApi(id: string): Promise<Monitor> {
  const { data } = await apiClient.get<ApiResponse<Monitor>>(`/monitors/${id}`);
  return data.data;
}

export async function createMonitorApi(input: CreateMonitorInput): Promise<Monitor> {
  const { data } = await apiClient.post<ApiResponse<Monitor>>('/monitors', input);
  return data.data;
}

export async function updateMonitorApi(
  id: string,
  input: Partial<CreateMonitorInput>
): Promise<Monitor> {
  const { data } = await apiClient.patch<ApiResponse<Monitor>>(`/monitors/${id}`, input);
  return data.data;
}

export async function pauseMonitorApi(id: string): Promise<Monitor> {
  const { data } = await apiClient.post<ApiResponse<Monitor>>(`/monitors/${id}/pause`);
  return data.data;
}

export async function resumeMonitorApi(id: string): Promise<Monitor> {
  const { data } = await apiClient.post<ApiResponse<Monitor>>(`/monitors/${id}/resume`);
  return data.data;
}

export async function deleteMonitorApi(id: string): Promise<{ id: string; deleted: boolean }> {
  const { data } = await apiClient.delete<ApiResponse<{ id: string; deleted: boolean }>>(
    `/monitors/${id}`
  );
  return data.data;
}

export async function triggerCheckApi(id: string): Promise<CheckResult> {
  const { data } = await apiClient.post<ApiResponse<CheckResult>>(`/monitors/${id}/check`);
  return data.data;
}

export async function getMonitorChecksApi(
  id: string,
  params?: { page?: number; limit?: number }
): Promise<{ checks: CheckResult[]; total: number; page: number; limit: number }> {
  const { data } = await apiClient.get<
    ApiResponse<{ checks: CheckResult[]; total: number; page: number; limit: number }>
  >(`/monitors/${id}/checks`, { params });
  return data.data;
}

export async function getMonitorUptimeApi(
  id: string,
  range: '24h' | '7d' | '30d' = '24h'
): Promise<UptimeStats> {
  const { data } = await apiClient.get<ApiResponse<UptimeStats>>(`/monitors/${id}/uptime`, {
    params: { range },
  });
  return data.data;
}
