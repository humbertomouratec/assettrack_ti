import type { Asset } from './asset';

export interface Solicitacao {
  id: number;
  solicitante_id?: number;
  solicitante?: {
    id: number;
    nome: string;
    email: string;
    cargo?: string;
  };
  asset_id?: number;
  asset?: Asset;
  motivo: string;
  status: 'pendente' | 'aprovada' | 'rejeitada' | 'entregue' | 'devolvida';
  data_solicitacao: string;
  data_aprovacao?: string;
  aprovador_id?: number;
  aprovador?: {
    id: number;
    nome: string;
    email: string;
  };
  data_entrega?: string;
  confirmado_por_id?: number;
  confirmador?: {
    id: number;
    nome: string;
    email: string;
  };
  confirmado_via_qr?: boolean;
  observacao_entrega?: string;
  data_devolucao?: string;
  recebido_por_id?: number;
  recebedor?: {
    id: number;
    nome: string;
    email: string;
  };
  condicao_devolucao?: string;
  acessorios_devolvidos?: string;
  observacoes_devolucao?: string;
  observacao_devolucao?: string;
  data_prevista_devolucao?: string;
  termo?: any;
}


export interface Movimentacao {
  id: number;
  asset_id: number;
  asset?: Asset;
  tipo: 'entrada' | 'saida' | 'transferencia' | 'emprestimo' | 'devolucao' | 'manutencao' | 'baixa';
  data_movimentacao: string;
  de_user_id?: number;
  de_user?: {
    id: number;
    nome: string;
    email: string;
  };
  para_user_id?: number;
  para_user?: {
    id: number;
    nome: string;
    email: string;
  };
  de_local_id?: number;
  para_local_id?: number;
  observacao?: string;
}
