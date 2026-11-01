import apiClient from './client';
import type { ApiResponse, Incident } from '../types';

export async function getIncidentsApi(params?: {
  monitorId?: string;
  status?: 'OPEN' | 'RESOLVED';
}): Promise<Incident[]> {
  const { data } = await apiClient.get<ApiResponse<Incident[]>>('/incidents', { params });
  return data.data;
}

export async function getIncidentByIdApi(id: string): Promise<Incident> {
  const { data } = await apiClient.get<ApiResponse<Incident>>(`/incidents/${id}`);
  return data.data;
}
