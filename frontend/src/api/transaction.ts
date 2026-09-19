import { apiClient } from './client';
import type { Asset, Solicitacao } from '../types';

export const transactionApi = {
  listSolicitacoes: async (options?: { skip?: number; limit?: number; my?: boolean } | number, limitParam = 100): Promise<Solicitacao[]> => {
    let skip = 0;
    let limit = limitParam;
    let myFilter = false;

    if (typeof options === 'object' && options !== null) {
      skip = options.skip ?? 0;
      limit = options.limit ?? 100;
      myFilter = !!options.my;
    } else if (typeof options === 'number') {
      skip = options;
    }

    const myQuery = myFilter ? '&my=true' : '';
    const response = await apiClient.get<Solicitacao[]>(`/solicitacoes?skip=${skip}&limit=${limit}${myQuery}`);
    return response.data;
  },
  createSolicitacao: async (data: { asset_id: number; motivo: string; data_prevista_devolucao?: string }): Promise<Solicitacao> => {
    const response = await apiClient.post<Solicitacao>('/solicitacoes', data);
    return response.data;
  },
  approveSolicitacao: async (id: number): Promise<Solicitacao> => {
    const response = await apiClient.put<Solicitacao>(`/solicitacoes/${id}/approve`);
    return response.data;
  },
  rejectSolicitacao: async (id: number): Promise<Solicitacao> => {
    const response = await apiClient.put<Solicitacao>(`/solicitacoes/${id}/reject`);
    return response.data;
  },

  // Devolution & Transfer
  devolverAsset: async (
    assetId: number,
    data: {
      condicao_equipamento: string;
      acessorios_devolvidos: string;
      observacoes_adicionais?: string;
    }
  ): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>(`/movimentacoes/devolver/${assetId}`, data);
    return response.data;
  },

  transferirAsset: async (
    assetId: number,
    data: {
      para_user_id: number;
      motivo: string;
      data_prevista_devolucao?: string;
    }
  ): Promise<{ message: string; solicitacao: Solicitacao; asset: Asset }> => {
	    const response = await apiClient.post<{ message: string; solicitacao: Solicitacao; asset: Asset }>(`/movimentacoes/transferir/${assetId}`, data);
    return response.data;
  },
};
