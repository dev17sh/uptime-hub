import apiClient from './client';
import type { ApiResponse, NotificationPreference } from '../types';

export async function getNotificationSettingsApi(): Promise<NotificationPreference> {
  const { data } = await apiClient.get<ApiResponse<NotificationPreference>>('/settings/notifications');
  return data.data;
}

export async function updateNotificationSettingsApi(
  settings: Partial<NotificationPreference>
): Promise<NotificationPreference> {
  const { data } = await apiClient.put<ApiResponse<NotificationPreference>>('/settings/notifications', settings);
  return data.data;
}
