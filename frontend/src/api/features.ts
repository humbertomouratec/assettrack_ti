import { apiClient } from './client';

export interface FeatureFlags {
  preventive_maintenance_enabled: boolean;
  purchases_enabled: boolean;
  kanban_enabled: boolean;
  ai_enabled: boolean;
  home_assistant_enabled?: boolean;
}

export const getFeatureFlags = async (): Promise<FeatureFlags> => {
  const response = await apiClient.get<FeatureFlags>('/settings/features');
  return response.data;
};
