import axios from 'axios';
import { apiClient as api, API_ORIGIN } from './client';
import type {
  SystemVersionInfo,
  UpdateCheckResult,
  UpdateJobResponse,
  UpdateStatusResponse,
} from '../types/systemUpdate';

export const getSystemVersion = async (): Promise<SystemVersionInfo> => {
  const response = await api.get<SystemVersionInfo>('/admin/system/version');
  return response.data;
};

export const checkForUpdates = async (): Promise<UpdateCheckResult> => {
  const response = await api.post<UpdateCheckResult>('/admin/system/updates/check');
  return response.data;
};

export const applySystemUpdate = async (): Promise<UpdateJobResponse> => {
  const response = await api.post<UpdateJobResponse>('/admin/system/updates/apply');
  return response.data;
};

export const getSystemUpdateStatus = async (): Promise<UpdateStatusResponse> => {
  const response = await api.get<UpdateStatusResponse>('/admin/system/updates/logs');
  return response.data;
};

export const checkServerHealth = async (): Promise<boolean> => {
  try {
    const healthUrl = `${API_ORIGIN}/health`;
    const res = await axios.get(healthUrl, { timeout: 3000 });
    return res.status === 200;
  } catch {
    return false;
  }
};
