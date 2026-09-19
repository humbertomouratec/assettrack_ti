import { apiClient } from './client';
import type { ServiceCategory, ServiceDefinition, ServiceDeskNotification, ServiceTicket, ServiceTicketInteraction } from '../types';

export const serviceDeskApi = {
  // Categories
  listCategories: async (): Promise<ServiceCategory[]> => {
    const response = await apiClient.get<ServiceCategory[]>('/servicos/categorias');
    return response.data;
  },
  createCategory: async (data: Partial<ServiceCategory>): Promise<ServiceCategory> => {
    const response = await apiClient.post<ServiceCategory>('/servicos/categorias', data);
    return response.data;
  },

  // Definitions
  listDefinitions: async (): Promise<ServiceDefinition[]> => {
    const response = await apiClient.get<ServiceDefinition[]>('/servicos/definicoes');
    return response.data;
  },
  createDefinition: async (data: Partial<ServiceDefinition>): Promise<ServiceDefinition> => {
    const response = await apiClient.post<ServiceDefinition>('/servicos/definicoes', data);
    return response.data;
  },

  listTickets: async (options?: { skip?: number; limit?: number; my?: boolean } | number, limitParam = 100): Promise<ServiceTicket[]> => {
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
    const response = await apiClient.get<ServiceTicket[]>(`/servicos/chamados?skip=${skip}&limit=${limit}${myQuery}`);
    return response.data;
  },
  getTicketById: async (id: number): Promise<ServiceTicket> => {
    const response = await apiClient.get<ServiceTicket>(`/servicos/chamados/${id}`);
    return response.data;
  },
  createTicket: async (data: Partial<ServiceTicket>): Promise<ServiceTicket> => {
    const response = await apiClient.post<ServiceTicket>('/servicos/chamados', data);
    return response.data;
  },
  updateTicket: async (id: number, data: Partial<ServiceTicket>): Promise<ServiceTicket> => {
    const response = await apiClient.put<ServiceTicket>(`/servicos/chamados/${id}`, data);
    return response.data;
  },

  // Interactions / Comments
  createInteraction: async (ticketId: number, message: string, foto?: string): Promise<ServiceTicketInteraction> => {
    const response = await apiClient.post<ServiceTicketInteraction>(`/servicos/chamados/${ticketId}/interacoes`, {
      mensagem: message,
      foto,
    });
    return response.data;
  },
  uploadAttachment: async (ticketId: number, file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('arquivo', file);
    const response = await apiClient.post<{ url: string }>(`/servicos/chamados/${ticketId}/interacoes/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  uploadTicketAttachment: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('arquivo', file);
    const response = await apiClient.post<{ url: string }>('/servicos/chamados/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  listNotifications: async (): Promise<ServiceDeskNotification[]> => {
    const response = await apiClient.get<ServiceDeskNotification[]>('/servicos/notificacoes');
    return response.data;
  },
  markNotificationRead: async (id: number): Promise<void> => {
    await apiClient.post(`/servicos/notificacoes/${id}/lida`);
  },
  markAllNotificationsRead: async (): Promise<void> => {
    await apiClient.post('/servicos/notificacoes/lidas');
  },
};
