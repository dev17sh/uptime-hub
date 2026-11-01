import apiClient from './client';
import type { ApiResponse, AuthData, User } from '../types';

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export async function registerApi(payload: RegisterPayload): Promise<AuthData> {
  const { data } = await apiClient.post<ApiResponse<AuthData>>('/auth/register', payload);
  return data.data;
}

export async function loginApi(payload: LoginPayload): Promise<AuthData> {
  const { data } = await apiClient.post<ApiResponse<AuthData>>('/auth/login', payload);
  return data.data;
}

export async function getMeApi(): Promise<User> {
  const { data } = await apiClient.get<ApiResponse<User>>('/auth/me');
  return data.data;
}

