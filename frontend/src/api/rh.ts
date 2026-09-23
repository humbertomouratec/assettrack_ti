import { apiClient } from './client';
import type { TermoResponsabilidade, RHListResponse, RHControlResponse, RHStatusRecord, RHComunicado, MyRHPortal, RHMonitoringTeamResponse } from '../types/rh';
import type { Solicitacao } from '../types/transaction';

export const rhApi = {
  hierarchy: async (): Promise<{ setores: Array<{ id: number; nome: string; responsavel_id?: number | null }>; usuarios: import('../types/user').User[] }> => (await apiClient.get('/rh/hierarquia')).data,
  updateHierarchy: async (data: { departamento_id: number; gestor_id?: number; subordinado_ids: number[] }): Promise<void> => { await apiClient.put('/rh/hierarquia', data); },
  list: async (): Promise<RHListResponse> => {
    const response = await apiClient.get<RHListResponse>('/rh/termos');
    return response.data;
  },
  generateTemplate: async (solicitacaoId: number): Promise<{ conteudo_termo: string; solicitacao: Solicitacao }> => {
    const response = await apiClient.get(`/rh/solicitacoes/${solicitacaoId}/modelo`);
    return response.data;
  },
  create: async (data: { solicitacao_id?: number; conteudo_termo: string }): Promise<TermoResponsabilidade> => {
    const response = await apiClient.post<TermoResponsabilidade>('/rh/termos', data);
    return response.data;
  },
  update: async (id: number, conteudo_termo: string): Promise<TermoResponsabilidade> => {
    const response = await apiClient.put<TermoResponsabilidade>(`/rh/termos/${id}`, { conteudo_termo });
    return response.data;
  },
  sign: async (id: number): Promise<TermoResponsabilidade> => {
    const response = await apiClient.post<TermoResponsabilidade>(`/rh/termos/${id}/assinar`);
    return response.data;
  },
  cancel: async (id: number): Promise<TermoResponsabilidade> => {
    const response = await apiClient.post<TermoResponsabilidade>(`/rh/termos/${id}/cancelar`);
    return response.data;
  },
  pdf: async (id: number): Promise<Blob> => {
    const response = await apiClient.get(`/rh/termos/${id}/pdf`, { responseType: 'blob' });
    return response.data;
  },
  offboardUser: async (userId: number): Promise<{ message: string; assets_affected: number }> => {
    const response = await apiClient.post<{ message: string; assets_affected: number }>(`/rh/colaboradores/${userId}/desligamento`);
    return response.data;
  },
  control: async (): Promise<RHControlResponse> => (await apiClient.get<RHControlResponse>('/rh/controle')).data,
  createStatus: async (data: { usuario_id: number; tipo: string; inicio: string; fim?: string; horas?: number; observacao?: string }): Promise<RHStatusRecord> =>
    (await apiClient.post<RHStatusRecord>('/rh/status', data)).data,
  updateMonitoringVisibility: async (userId: number, showOnMonitoring: boolean): Promise<void> => {
    await apiClient.put(`/rh/colaboradores/${userId}/monitoramento`, { show_on_monitoring: showOnMonitoring });
  },
  deleteStatus: async (id: number): Promise<void> => { await apiClient.delete(`/rh/status/${id}`); },
  uploadComunicadoMedia: async (file: File | Blob, filename?: string, midiaTipo?: string): Promise<{ url: string; midia_tipo: string; filename: string }> => {
    const formData = new FormData();
    const resolvedName = filename || (file instanceof File ? file.name : (midiaTipo === 'audio' ? 'gravacao_audio.weba' : midiaTipo === 'video' ? 'gravacao_video.webm' : 'media_record.webm'));
    formData.append('file', file, resolvedName);
    if (midiaTipo) {
      formData.append('midia_tipo', midiaTipo);
    }
    const response = await apiClient.post<{ url: string; midia_tipo: string; filename: string }>('/rh/comunicados/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  createComunicado: async (data: {
    usuario_id?: number;
    departamento_id?: number;
    titulo: string;
    mensagem: string;
    inicio?: string;
    fim?: string;
    imagem_url?: string;
    audio_url?: string;
    video_url?: string;
    midia_tipo?: string;
  }): Promise<RHComunicado> =>
    (await apiClient.post<RHComunicado>('/rh/comunicados', data)).data,
  deleteComunicado: async (id: number): Promise<void> => { await apiClient.delete(`/rh/comunicados/${id}`); },
  deleteComunicadoMedia: async (id: number): Promise<void> => { await apiClient.delete(`/rh/comunicados/${id}/midia`); },
  myPortal: async (): Promise<MyRHPortal> => (await apiClient.get<MyRHPortal>('/profile/rh')).data,
  markMyComunicadoRead: async (id: number): Promise<void> => { await apiClient.post(`/profile/rh/comunicados/${id}/lida`); },
  messages: async (): Promise<{ mensagens: Array<any>; contatos: Array<{ id: number; nome: string }> }> => (await apiClient.get('/profile/mensagens')).data,
  sendMessage: async (data: { destinatario_id: number; assunto: string; mensagem: string }): Promise<void> => { await apiClient.post('/profile/mensagens', data); },
  confirmMessage: async (id: number): Promise<void> => { await apiClient.post(`/profile/mensagens/${id}/confirmar`); },
  exportStatusCSV: async (): Promise<Blob> => (await apiClient.get('/rh/controle/export.csv', { responseType: 'blob' })).data,
  monitoringTeam: async (): Promise<RHMonitoringTeamResponse> => (await apiClient.get<RHMonitoringTeamResponse>('/monitoramento/equipe-rh')).data,
};
