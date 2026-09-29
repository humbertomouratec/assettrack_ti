import type { Asset } from './asset';
import type { PurchaseRequest } from './procurement';

export interface SolicitacaoManutencao {
  id: number;
  asset_id: number;
  asset?: Asset;
  solicitante_id?: number;
  solicitante?: {
    id: number;
    nome: string;
    email: string;
  };
  descricao: string;
  data_solicitacao: string;
  status: 'pendente' | 'aceita' | 'rejeitada' | 'em_andamento' | 'aguardando_entrega' | 'entregue' | 'concluida';
  responsavel_id?: number;
  responsavel?: {
    id: number;
    nome: string;
    email: string;
  };
  manutencao_id?: number;
  manutencao?: Manutencao;
  solicitacoes_compra?: PurchaseRequest[];
  data_resposta?: string;
  observacao_resposta?: string;
  data_conclusao_tecnico?: string;
  data_entrega?: string;
}

export interface Manutencao {
  id: number;
  asset_id: number;
  asset?: Asset;
  responsavel_id?: number;
  responsavel?: {
    id: number;
    nome: string;
    email: string;
  };
  motivo: string;
  tipo: 'preventiva' | 'corretiva' | 'calibracao';
  status: 'em_andamento' | 'concluida' | 'cancelada';
  data_entrada: string;
  data_conclusao?: string;
  observacao_conclusao?: string;
  custo?: number;
}
