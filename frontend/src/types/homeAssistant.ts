export interface HAEntityState {
  entity_id: string;
  domain: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
  friendly_name: string;
  category: string;
  is_pinned: boolean;
  is_visible: boolean;
  display_order: number;
  asset_id?: number;
  asset_tag?: string;
  asset_name?: string;
}

export interface HAOverviewResponse {
  is_online: boolean;
  error?: string;
  last_sync_at: string;
  entities: HAEntityState[];
}

export interface HACategory {
  id: number;
  nome: string;
  icone: string;
  cor: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreateHACategoryRequest {
  nome: string;
  icone?: string;
  cor?: string;
}

export interface UpdateHACategoryRequest {
  nome: string;
  icone?: string;
  cor?: string;
}

export interface CallServiceRequest {
  domain: string;
  service: string;
  entity_id: string;
  service_data?: Record<string, any>;
}

export interface SaveBindingRequest {
  entity_id: string;
  friendly_name: string;
  category: string;
  asset_id?: number | null;
  is_pinned: boolean;
  is_visible?: boolean;
  display_order?: number;
}

export interface SetVisibilityRequest {
  entity_id: string;
  is_visible: boolean;
}

export interface TestConnectionResponse {
  connected: boolean;
  version?: string;
  location_name?: string;
  state?: string;
  url?: string;
}
