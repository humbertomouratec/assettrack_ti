import { apiClient } from './client';
import type { SolicitacaoManutencao } from '../types';

export const maintenanceApi = {
  listRequests: async (options?: { skip?: number; limit?: number; my?: boolean } | number, limitParam = 100): Promise<SolicitacaoManutencao[]> => {
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
    const response = await apiClient.get<SolicitacaoManutencao[]>(`/solicitacoes-manutencao?skip=${skip}&limit=${limit}${myQuery}`);
    return response.data;
  },
  getRequestById: async (id: number): Promise<SolicitacaoManutencao> => {
    const response = await apiClient.get<SolicitacaoManutencao>(`/solicitacoes-manutencao/${id}`);
    return response.data;
  },
  createRequest: async (data: Partial<SolicitacaoManutencao>): Promise<SolicitacaoManutencao> => {
    const response = await apiClient.post<SolicitacaoManutencao>('/solicitacoes-manutencao', data);
    return response.data;
  },

  // Actions
  acceptRequest: async (id: number): Promise<SolicitacaoManutencao> => {
    const response = await apiClient.post<SolicitacaoManutencao>(`/solicitacoes-manutencao/${id}/aceitar`);
    return response.data;
  },
  rejectRequest: async (id: number, reason: string): Promise<SolicitacaoManutencao> => {
    const response = await apiClient.post<SolicitacaoManutencao>(`/solicitacoes-manutencao/${id}/rejeitar`, {
      observacao: reason,
    });
    return response.data;
  },
  concludeRequest: async (id: number, notes: string, cost?: number): Promise<SolicitacaoManutencao> => {
    const response = await apiClient.post<SolicitacaoManutencao>(`/solicitacoes-manutencao/${id}/concluir`, {
      observacao_conclusao: notes,
      custo: cost,
    });
    return response.data;
  },
  confirmReceipt: async (id: number): Promise<SolicitacaoManutencao> => {
    const response = await apiClient.post<SolicitacaoManutencao>(`/solicitacoes-manutencao/${id}/confirmar-recebimento`);
    return response.data;
  },
};
