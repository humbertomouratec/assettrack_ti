import { apiClient } from './client';
import type {
  HAOverviewResponse,
  HAEntityState,
  CallServiceRequest,
  SaveBindingRequest,
  TestConnectionResponse,
  HACategory,
  CreateHACategoryRequest,
  UpdateHACategoryRequest,
} from '../types/homeAssistant';

export const homeAssistantApi = {
  getOverview: async (refresh = false): Promise<HAOverviewResponse> => {
    const res = await apiClient.get<HAOverviewResponse>('/home-assistant/overview', {
      params: refresh ? { refresh: 'true' } : undefined,
    });
    return res.data;
  },

  callService: async (req: CallServiceRequest): Promise<{ message: string }> => {
    const res = await apiClient.post<{ message: string }>('/home-assistant/service', req);
    return res.data;
  },

  getAssetTelemetry: async (assetId: number): Promise<HAEntityState[]> => {
    const res = await apiClient.get<HAEntityState[]>(`/home-assistant/asset/${assetId}/telemetry`);
    return res.data;
  },

  saveBinding: async (binding: SaveBindingRequest): Promise<{ message: string }> => {
    const res = await apiClient.post<{ message: string }>('/home-assistant/bindings', binding);
    return res.data;
  },

  deleteBinding: async (id: number): Promise<{ message: string }> => {
    const res = await apiClient.delete<{ message: string }>(`/home-assistant/bindings/${id}`);
    return res.data;
  },

  setVisibility: async (entityId: string, isVisible: boolean): Promise<{ message: string }> => {
    const res = await apiClient.patch<{ message: string }>('/home-assistant/visibility', {
      entity_id: entityId,
      is_visible: isVisible,
    });
    return res.data;
  },

  listCategories: async (): Promise<HACategory[]> => {
    const res = await apiClient.get<HACategory[]>('/home-assistant/categories');
    return res.data;
  },

  createCategory: async (req: CreateHACategoryRequest): Promise<HACategory> => {
    const res = await apiClient.post<HACategory>('/home-assistant/categories', req);
    return res.data;
  },

  updateCategory: async (id: number, req: UpdateHACategoryRequest): Promise<{ message: string }> => {
    const res = await apiClient.put<{ message: string }>(`/home-assistant/categories/${id}`, req);
    return res.data;
  },

  deleteCategory: async (id: number): Promise<{ message: string }> => {
    const res = await apiClient.delete<{ message: string }>(`/home-assistant/categories/${id}`);
    return res.data;
  },

  testConnection: async (): Promise<TestConnectionResponse> => {
    const res = await apiClient.post<TestConnectionResponse>('/admin/home-assistant/test');
    return res.data;
  },
};
