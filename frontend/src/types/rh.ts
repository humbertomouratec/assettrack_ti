import type { Asset } from './asset';
import type { Solicitacao } from './transaction';

export interface TermoResponsabilidade {
  id: number;
  solicitacao_id?: number;
  solicitacao?: Solicitacao;
  asset_id: number;
  asset?: Asset;
  usuario_id: number;
  usuario?: {
    id: number;
    nome: string;
    email: string;
  };
  status: 'Pendente' | 'Assinado' | 'Cancelado' | string;
  conteudo_termo: string;
  data_geracao: string;
  data_assinatura?: string;
}

export interface RHListResponse {
  termos: TermoResponsabilidade[];
  pendentes: Solicitacao[];
}

export type RHStatusType = 'trabalhando' | 'folga' | 'ferias' | 'banco_horas' | 'desligado';

export interface RHStatusRecord {
  id: number;
  usuario_id: number;
  tipo: RHStatusType;
  inicio: string;
  fim?: string | null;
  horas?: number | null;
  observacao?: string | null;
  usuario?: { id: number; nome: string; email: string; cargo?: string | null; departamento_id?: number | null; departamento?: { id: number; nome: string } | null };
  criado_por?: { id: number; nome: string };
}

export interface RHComunicado {
  id: number;
  usuario_id?: number | null;
  departamento_id?: number | null;
  titulo: string;
  mensagem: string;
  inicio: string;
  fim?: string | null;
  ativo: boolean;
  imagem_url?: string | null;
  audio_url?: string | null;
  video_url?: string | null;
  midia_tipo?: 'imagem' | 'audio' | 'video' | string | null;
  usuario?: { id: number; nome: string };
  departamento?: { id: number; nome: string };
  criado_por?: { id: number; nome: string };
}

export interface RHControlResponse {
  colaboradores: Array<{ usuario: import('./user').User; status_atual: RHStatusType; horas?: number | null }>;
  status: RHStatusRecord[];
  comunicados: RHComunicado[];
  atualizado_em: string;
}

export interface RHMonitoringTeamResponse {
  colaboradores: Array<{ usuario: import('./user').User; status_atual: RHStatusType; horas?: number | null }>;
  atualizado_em: string;
}

export interface MyRHPortal {
  status_atual: RHStatusType;
  calendario: RHStatusRecord[];
  comunicados: Array<{ comunicado: RHComunicado; lida: boolean }>;
  atualizado_em: string;
}
