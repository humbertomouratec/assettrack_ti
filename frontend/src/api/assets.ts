import { API_BASE_URL, apiClient, toApiFileUrl } from './client';
import type { Asset, AssetReferences, BulkDuplicateRequest, BulkDuplicateResponse, AssetCategory, Localizacao, Armazenamento, Departamento, AssetImportResponse, AssetHistoryResponse } from '../types';

export interface AssetListFilters {
  e_patrimonio?: string;
  nome?: string;
  categoria_id?: number | '';
  localizacao_id?: number | '';
  fornecedor_id?: number | '';
  nfe?: string;
  status?: string;
  data_inicio?: string;
  data_fim?: string;
}

const buildAssetQuery = (skip = 0, limit = 100, filters: AssetListFilters = {}) => {
  const params = new URLSearchParams({
    skip: String(skip),
    limit: String(limit),
  });

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });

  return params;
};

export const assetsApi = {
  list: async (skip = 0, limit = 100, filters: AssetListFilters = {}): Promise<Asset[]> => {
    const query = buildAssetQuery(skip, limit, filters);
    const url = `/assets?${query.toString()}`;
    const response = await apiClient.get<Asset[]>(url);
    return response.data;
  },

  listUrl: (skip = 0, limit = 100, filters: AssetListFilters = {}): string => {
    const query = buildAssetQuery(skip, limit, filters);
    const token = localStorage.getItem('token');
    if (token) {
      query.append('token', token);
    }
    return `${API_BASE_URL}/assets?${query.toString()}`;
  },

  exportCsv: async (filters: AssetListFilters = {}): Promise<void> => {
    const query = buildAssetQuery(0, 10000, filters);
    const response = await apiClient.get<Blob>(`/assets/export.csv?${query.toString()}`, {
      responseType: 'blob',
    });

    const blobUrl = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `ativos_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
  },

  downloadImportTemplate: (): void => {
    const rows = [
      [
        'ID',
        'E-Patrimonio',
        'Nome',
        'Modelo',
        'Numero de Serie',
        'Status',
        'Categoria',
        'Localizacao',
        'Armazenamento',
        'Fornecedor',
        'Nota Fiscal',
        'Data Aquisicao',
        'Valor',
        'Ativo Fixo',
        'Em Posse De',
        'Setor',
        'Requer Termo RH',
      ],
      [
        '',
        'EP-0001',
        'Notebook Dell Latitude 5440',
        'Latitude 5440',
        'SN-EXEMPLO-001',
        'Disponível',
        'Notebook',
        'Matriz',
        'Estoque TI',
        'Fornecedor Exemplo',
        '',
        '19/08/2026',
        '4599,90',
        'Nao',
        '',
        'TI',
        'Nao',
      ],
    ];

    const content = `\uFEFF${rows.map((row) => row.join(';')).join('\n')}`;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = 'modelo_importacao_ativos.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
  },

  importCsv: async (file: File): Promise<AssetImportResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post<AssetImportResponse>('/assets/import.csv', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  getById: async (id: number): Promise<Asset> => {
    const response = await apiClient.get<Asset>(`/assets/${id}`);
    return response.data;
  },

  create: async (data: Partial<Asset>): Promise<Asset> => {
    const response = await apiClient.post<Asset>('/assets', data);
    return response.data;
  },

  update: async (id: number, data: Partial<Asset>): Promise<Asset> => {
    const response = await apiClient.put<Asset>(`/assets/${id}`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/assets/${id}`);
  },

  getReferences: async (): Promise<AssetReferences> => {
    const response = await apiClient.get<AssetReferences>('/assets/referencias');
    return response.data;
  },

  createCategoria: async (nome: string): Promise<AssetCategory> => {
    const response = await apiClient.post<AssetCategory>('/assets/categorias', { nome });
    return response.data;
  },

  updateCategoria: async (id: number, nome: string): Promise<AssetCategory> => {
    const response = await apiClient.put<AssetCategory>(`/assets/categorias/${id}`, { nome });
    return response.data;
  },

  deleteCategoria: async (id: number): Promise<{ detail: string }> => {
    const response = await apiClient.delete<{ detail: string }>(`/assets/categorias/${id}`);
    return response.data;
  },

  createLocalizacao: async (nome: string): Promise<Localizacao> => {
    const response = await apiClient.post<Localizacao>('/assets/localizacoes', { nome });
    return response.data;
  },

  updateLocalizacao: async (id: number, nome: string): Promise<Localizacao> => {
    const response = await apiClient.put<Localizacao>(`/assets/localizacoes/${id}`, { nome });
    return response.data;
  },

  deleteLocalizacao: async (id: number): Promise<{ detail: string }> => {
    const response = await apiClient.delete<{ detail: string }>(`/assets/localizacoes/${id}`);
    return response.data;
  },

  createArmazenamento: async (nome: string): Promise<Armazenamento> => {
    const response = await apiClient.post<Armazenamento>('/assets/armazenamentos', { nome });
    return response.data;
  },

  createDepartamento: async (nome: string): Promise<Departamento> => {
    const response = await apiClient.post<Departamento>('/assets/departamentos', { nome });
    return response.data;
  },

  deleteDepartamento: async (id: number): Promise<{ detail: string }> => {
    const response = await apiClient.delete<{ detail: string }>(`/assets/departamentos/${id}`);
    return response.data;
  },

  bulkDuplicate: async (data: BulkDuplicateRequest): Promise<BulkDuplicateResponse> => {
    const response = await apiClient.post<BulkDuplicateResponse>('/assets/bulk', data);
    return response.data;
  },

  scanQRCode: async (file: File): Promise<Asset> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post<Asset>('/assets/scan-qr', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  getQRCodeUrl: (id: number): string => {
    const token = localStorage.getItem('token');
    return `${API_BASE_URL}/assets/${id}/qrcode?token=${token || ''}`;
  },

  downloadQRCode: async (id: number, ePatrimonio: string): Promise<void> => {
    const response = await apiClient.get<Blob>(`/assets/${id}/qrcode`, {
      responseType: 'blob',
    });
    const blobUrl = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `qrcode_${ePatrimonio}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
  },

  getHistory: async (id: number): Promise<AssetHistoryResponse> => {
    const response = await apiClient.get<AssetHistoryResponse>(`/assets/${id}/historico`);
    return response.data;
  },

  uploadDatasheet: async (file: File): Promise<{ url: string; filename: string }> => {
    const formData = new FormData();
    formData.append('arquivo', file);
    const response = await apiClient.post<{ url: string; filename: string }>('/assets/upload-datasheet', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  getDatasheetUrl: (asset: Asset | { id?: number; datasheet_path?: string | null }): string => {
    if (!asset.datasheet_path) return '';
    if (asset.id) {
      const token = localStorage.getItem('token');
      return `${API_BASE_URL}/assets/${asset.id}/datasheet?token=${token || ''}`;
    }
    return toApiFileUrl(asset.datasheet_path);
  },
};
