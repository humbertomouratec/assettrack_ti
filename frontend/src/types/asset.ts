import type { User, Departamento } from './user';

export type AssetStatus = 'Disponível' | 'Em uso' | 'Manutenção' | 'Armazenado' | 'Baixado';

export interface AssetCategory {
  id: number;
  nome: string;
  descricao: string | null;
}

export interface Localizacao {
  id: number;
  nome: string;
  descricao: string | null;
}

export interface Armazenamento {
  id: number;
  nome: string;
  codigo: string | null;
}

export interface Fornecedor {
  id: number;
  nome: string;
  razao_social: string | null;
  cnpj: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  tipo_fornecedor: string | null;
}

export interface NotaFiscal {
  id: number;
  numero_nota: string;
  fornecedor_id: number;
  xml_path: string | null;
  data_cadastro: string;
  data_emissao: string | null;
  valor_total: number | null;
  natureza_operacao: string | null;
  emitente_nome: string | null;
  emitente_cnpj: string | null;
  destinatario_nome: string | null;
  destinatario_cnpj: string | null;
  itens: string | null; // json representation
}

export interface Asset {
  id: number;
  nome: string;
  e_patrimonio: string;
  modelo: string | null;
  descricao: string | null;
  data_aquisicao: string | null;
  valor: number | null;
  status: AssetStatus;
  qr_code_path: string | null;
  foto_path: string | null;
  datasheet_path?: string | null;
  datasheet_nome?: string | null;
  numero_serie: string | null;
  em_posse_de: string | null;
  bloqueado: boolean;
  requer_termo_rh: boolean;
  categoria_id: number | null;
  created_by_id: number | null;
  fornecedor_id: number | null;
  nota_fiscal_id: number | null;
  current_user_id: number | null;
  current_departamento_id: number | null;
  current_local_id: number | null;
  current_armazenamento_id: number | null;

  // History fields (for locked asset in maintenance edge-case)
  prev_status: string | null;
  prev_user_id: number | null;
  prev_departamento_id: number | null;
  prev_local_id: number | null;
  prev_armazenamento_id: number | null;

  // GORM relationships
  current_user: User | null;
  current_departamento: Departamento | null;
  current_local: Localizacao | null;
  current_armazenamento: Armazenamento | null;
  prev_local: Localizacao | null;
  prev_armazenamento: Armazenamento | null;
  created_by: User | null;
  fornecedor: Fornecedor | null;
  nota_fiscal: NotaFiscal | null;
  categoria: AssetCategory | null;
}

export interface AssetReferences {
  categorias: AssetCategory[];
  setores: Departamento[];
  localizacoes: Localizacao[];
  armazenamentos: Armazenamento[];
  fornecedores: Fornecedor[];
}

export interface BulkCopySpec {
  e_patrimonio: string;
  numero_serie: string | null;
  current_local_id: number | null;
  current_armazenamento_id: number | null;
}

export interface BulkDuplicateRequest {
  template_id: number;
  copies: BulkCopySpec[];
}

export interface BulkCopyResult {
  e_patrimonio: string;
  success: boolean;
  error?: string;
  asset_id?: number;
}

export interface BulkDuplicateResponse {
  success_count: number;
  failed_count: number;
  results: BulkCopyResult[];
}

export interface AssetImportRowResult {
  linha: number;
  e_patrimonio: string;
  nome: string;
  acao?: string;
  erro?: string;
}

export interface AssetImportResponse {
  criados: number;
  atualizados: number;
  falhas: number;
  resultados: AssetImportRowResult[];
}

export interface AssetHistoryResponse {
  asset: Asset;
  movimentacoes: any[];
  solicitacoes_emprestimo: any[];
  manutencoes: any[];
  solicitacoes_manutencao: any[];
  manutencoes_preventivas: any[];
  planos_preventivos: any[];
  solicitacoes_compra: any[];
}
