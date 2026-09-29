import { apiClient } from './client';
import type {
  PurchaseCategory,
  PurchaseProduct,
  CostCenter,
  PurchaseRequest,
  PurchaseQuotation,
  PurchaseOrder,
  PurchaseReceiving,
  MaterialStock,
  MaterialStockTransaction,
  PurchaseContract,
  ContractType,
  PurchaseResearch,
  PurchaseNotification,
  ProcurementDashboard,
} from '../types/procurement';

export interface CreateRequestPayload {
  centro_custo_id: number;
  justificativa: string;
  urgencia?: string;
  data_necessaria?: string;
  itens: { product_id: number; quantidade: number; valor_estimado: number; observacao?: string }[];
}

export interface QuotationSupplierPayload {
  fornecedor_id: number;
  frete?: number;
  prazo_entrega_dias?: number;
  garantia_meses?: number;
  forma_pagamento?: string;
  observacoes?: string;
  itens: { product_id: number; quantidade: number; valor_unitario: number }[];
}

export const procurementApi = {
  // Dashboard
  dashboard: async (): Promise<ProcurementDashboard> => {
    const response = await apiClient.get<ProcurementDashboard>('/compras/dashboard');
    return response.data;
  },
  exportCsv: async (tipo: 'dashboard' | 'solicitacoes' | 'pedidos' | 'estoque'): Promise<void> => {
    const response = await apiClient.get<Blob>(`/compras/export.csv?tipo=${encodeURIComponent(tipo)}`, {
      responseType: 'blob',
    });
    const blobUrl = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `compras_${tipo}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
  },

  // Categories
  listCategories: async (): Promise<PurchaseCategory[]> => {
    const response = await apiClient.get<PurchaseCategory[]>('/compras/categorias');
    return response.data;
  },
  createCategory: async (data: Partial<PurchaseCategory>): Promise<PurchaseCategory> => {
    const response = await apiClient.post<PurchaseCategory>('/compras/categorias', data);
    return response.data;
  },
  updateCategory: async (id: number, data: Partial<PurchaseCategory>): Promise<PurchaseCategory> => {
    const response = await apiClient.put<PurchaseCategory>(`/compras/categorias/${id}`, data);
    return response.data;
  },
  deleteCategory: async (id: number): Promise<{ message: string }> => {
    const response = await apiClient.delete<{ message: string }>(`/compras/categorias/${id}`);
    return response.data;
  },

  // Products
  listProducts: async (): Promise<PurchaseProduct[]> => {
    const response = await apiClient.get<PurchaseProduct[]>('/compras/produtos?limit=1000');
    return response.data;
  },
  createProduct: async (data: Partial<PurchaseProduct>): Promise<PurchaseProduct> => {
    const response = await apiClient.post<PurchaseProduct>('/compras/produtos', data);
    return response.data;
  },
  updateProduct: async (id: number, data: Partial<PurchaseProduct>): Promise<PurchaseProduct> => {
    const response = await apiClient.put<PurchaseProduct>(`/compras/produtos/${id}`, data);
    return response.data;
  },
  deleteProduct: async (id: number): Promise<{ message: string }> => {
    const response = await apiClient.delete<{ message: string }>(`/compras/produtos/${id}`);
    return response.data;
  },

  // Cost centers
  listCostCenters: async (): Promise<CostCenter[]> => {
    const response = await apiClient.get<CostCenter[]>('/compras/centro-custos');
    return response.data;
  },
  createCostCenter: async (data: Partial<CostCenter>): Promise<CostCenter> => {
    const response = await apiClient.post<CostCenter>('/compras/centro-custos', data);
    return response.data;
  },
  updateCostCenter: async (id: number, data: Partial<CostCenter>): Promise<CostCenter> => {
    const response = await apiClient.put<CostCenter>(`/compras/centro-custos/${id}`, data);
    return response.data;
  },
  deleteCostCenter: async (id: number): Promise<{ message: string }> => {
    const response = await apiClient.delete<{ message: string }>(`/compras/centro-custos/${id}`);
    return response.data;
  },

  // Requests
  listRequests: async (status = ''): Promise<PurchaseRequest[]> => {
    const response = await apiClient.get<PurchaseRequest[]>(`/compras/solicitacoes?limit=1000${status ? `&status=${encodeURIComponent(status)}` : ''}`);
    return response.data;
  },
  getRequest: async (id: number): Promise<PurchaseRequest> => {
    const response = await apiClient.get<PurchaseRequest>(`/compras/solicitacoes/${id}`);
    return response.data;
  },
  createRequest: async (data: CreateRequestPayload): Promise<PurchaseRequest> => {
    const response = await apiClient.post<PurchaseRequest>('/compras/solicitacoes', data);
    return response.data;
  },
  decideRequest: async (id: number, nivel: string, decisao: string, observacao?: string): Promise<PurchaseRequest> => {
    const response = await apiClient.post<PurchaseRequest>(`/compras/solicitacoes/${id}/decidir`, { nivel, decisao, observacao });
    return response.data;
  },
  decideRequestAuto: async (id: number, decisao: string, observacao?: string): Promise<PurchaseRequest> => {
    const response = await apiClient.post<PurchaseRequest>(`/compras/solicitacoes/${id}/decidir`, { decisao, observacao });
    return response.data;
  },
  releaseBudget: async (id: number): Promise<PurchaseRequest> => {
    const response = await apiClient.post<PurchaseRequest>(`/compras/solicitacoes/${id}/liberar-orcamento`, {});
    return response.data;
  },
  cancelRequest: async (id: number, motivo?: string): Promise<PurchaseRequest> => {
    const response = await apiClient.post<PurchaseRequest>(`/compras/solicitacoes/${id}/cancelar`, { motivo });
    return response.data;
  },

  // Quotations
  listQuotations: async (): Promise<PurchaseQuotation[]> => {
    const response = await apiClient.get<PurchaseQuotation[]>('/compras/cotacoes');
    return response.data;
  },
  getQuotation: async (id: number): Promise<{ quotation: PurchaseQuotation; cheapest_id?: number; fastest_id?: number; best_value_id?: number }> => {
    const response = await apiClient.get(`/compras/cotacoes/${id}`);
    return response.data;
  },
  createQuotation: async (request_id: number, suppliers: QuotationSupplierPayload[]): Promise<PurchaseQuotation> => {
    const response = await apiClient.post<PurchaseQuotation>('/compras/cotacoes', { request_id, suppliers });
    return response.data;
  },
  selectWinner: async (quotationId: number, winner_supplier_id: number): Promise<PurchaseOrder> => {
    const response = await apiClient.post<PurchaseOrder>(`/compras/cotacoes/${quotationId}/selecionar-vencedor`, { winner_supplier_id });
    return response.data;
  },

  // Orders
  listOrders: async (status = ''): Promise<PurchaseOrder[]> => {
    const response = await apiClient.get<PurchaseOrder[]>(`/compras/pedidos?limit=1000${status ? `&status=${encodeURIComponent(status)}` : ''}`);
    return response.data;
  },
  getOrder: async (id: number): Promise<PurchaseOrder> => {
    const response = await apiClient.get<PurchaseOrder>(`/compras/pedidos/${id}`);
    return response.data;
  },
  createOrder: async (data: {
    fornecedor_id: number;
    centro_custo_id: number;
    request_id?: number;
    frete?: number;
    itens: { product_id: number; quantidade: number; valor_unitario: number }[];
  }): Promise<PurchaseOrder> => {
    const response = await apiClient.post<PurchaseOrder>('/compras/pedidos', data);
    return response.data;
  },
  updateOrderStatus: async (id: number, status: string): Promise<PurchaseOrder> => {
    const response = await apiClient.put<PurchaseOrder>(`/compras/pedidos/${id}/status`, { status });
    return response.data;
  },
  receiveOrder: async (
    orderId: number,
    data: { nota_fiscal_id?: number; observacoes?: string; itens: { product_id: number; quantidade_recebida: number; divergencias?: string }[] },
  ): Promise<{ receiving: PurchaseReceiving }> => {
    const response = await apiClient.post(`/compras/pedidos/${orderId}/receber`, data);
    return response.data;
  },
  reconcileOrder: async (id: number): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>(`/compras/pedidos/${id}/reconciliar`, {});
    return response.data;
  },

  // Stock
  listStock: async (): Promise<MaterialStock[]> => {
    const response = await apiClient.get<MaterialStock[]>('/compras/estoque');
    return response.data;
  },
  listStockTransactions: async (productId?: number, limit = 50): Promise<MaterialStockTransaction[]> => {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (productId) params.set('product_id', String(productId));
    const response = await apiClient.get<MaterialStockTransaction[]>(`/compras/estoque/transacoes?${params.toString()}`);
    return response.data;
  },
  consumeStock: async (data: { stock_id: number; quantidade_usar: number; justificativa?: string; centro_custo_id?: number }): Promise<{ stock: MaterialStock; message: string }> => {
    const response = await apiClient.post<{ stock: MaterialStock; message: string }>('/compras/estoque/consumir', data);
    return response.data;
  },

  // Contracts
  listContracts: async (): Promise<PurchaseContract[]> => {
    const response = await apiClient.get<PurchaseContract[]>('/compras/contratos');
    return response.data;
  },
  createContract: async (data: Partial<PurchaseContract>): Promise<PurchaseContract> => {
    const response = await apiClient.post<PurchaseContract>('/compras/contratos', data);
    return response.data;
  },
  updateContract: async (id: number, data: Partial<PurchaseContract>): Promise<PurchaseContract> => {
    const response = await apiClient.put<PurchaseContract>(`/compras/contratos/${id}`, data);
    return response.data;
  },
  deleteContract: async (id: number): Promise<{ message: string }> => {
    const response = await apiClient.delete<{ message: string }>(`/compras/contratos/${id}`);
    return response.data;
  },

  // Contract types
  listContractTypes: async (): Promise<ContractType[]> => {
    const response = await apiClient.get<ContractType[]>('/compras/contratos/tipos');
    return response.data;
  },
  createContractType: async (data: Partial<ContractType>): Promise<ContractType> => {
    const response = await apiClient.post<ContractType>('/compras/contratos/tipos', data);
    return response.data;
  },
  updateContractType: async (id: number, data: Partial<ContractType>): Promise<ContractType> => {
    const response = await apiClient.put<ContractType>(`/compras/contratos/tipos/${id}`, data);
    return response.data;
  },
  deleteContractType: async (id: number): Promise<{ message: string }> => {
    const response = await apiClient.delete<{ message: string }>(`/compras/contratos/tipos/${id}`);
    return response.data;
  },

  // Researches
  listResearches: async (): Promise<PurchaseResearch[]> => {
    const response = await apiClient.get<PurchaseResearch[]>('/compras/pesquisas');
    return response.data;
  },
  createResearch: async (data: {
    titulo: string;
    justificativa: string;
    status?: string;
    items: { nome_produto: string; link_produto?: string; valor_estimado: number; quantidade: number; tipo_produto?: string }[];
  }): Promise<PurchaseResearch> => {
    const response = await apiClient.post<PurchaseResearch>('/compras/pesquisas', data);
    return response.data;
  },
  sendResearch: async (id: number): Promise<PurchaseResearch> => {
    const response = await apiClient.post<PurchaseResearch>(`/compras/pesquisas/${id}/enviar`, {});
    return response.data;
  },
  decideResearch: async (id: number, data: { acao: string; justificativa_decisao?: string; centro_custo_id?: number; approved_item_ids?: number[] }): Promise<PurchaseResearch | PurchaseRequest> => {
    const response = await apiClient.post(`/compras/pesquisas/${id}/decidir`, data);
    return response.data;
  },

  // Maintenance and Kanban Purchase Requests
  createMaintenancePurchaseRequest: async (data: {
    nome_produto: string;
    link_produto?: string;
    quantidade: number;
    valor_estimado: number;
    justificativa?: string;
    urgencia?: string;
    tipo_item?: string;
    asset_id?: number;
    maintenance_order_id?: number;
    maintenance_request_id?: number;
  }): Promise<PurchaseRequest> => {
    const response = await apiClient.post<PurchaseRequest>('/compras/solicitar-peca', data);
    return response.data;
  },

  kanbanPurchaseRequest: async (cardId: number, data: {
    nome_produto: string;
    link_produto?: string;
    quantidade: number;
    valor_estimado: number;
    justificativa?: string;
    tipo_item?: string;
    departamento_id?: number;
    centro_custo_id?: number;
  }): Promise<PurchaseRequest> => {
    const response = await apiClient.post<PurchaseRequest>(`/kanban/cards/${cardId}/solicitar-compra`, data);
    return response.data;
  },

  // Notifications
  myNotifications: async (): Promise<PurchaseNotification[]> => {
    const response = await apiClient.get<PurchaseNotification[]>('/compras/notificacoes');
    return response.data;
  },
  markNotificationsRead: async (): Promise<void> => {
    await apiClient.post('/compras/notificacoes/lidas');
  },
};
