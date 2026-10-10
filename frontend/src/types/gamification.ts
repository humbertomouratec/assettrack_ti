export interface GamificationProfile {
  id: number;
  user_id: number;
  xp_total: number;
  nivel_atual: number;
  tech_coins: number;
  current_streak: number;
  last_activity_date: string | null;
  atividades_atendidas: number;
  chamados_resolvidos: number;
  preventivas_concluidas: number;
  manutencoes_concluidas: number;
  kanban_concluidos: number;
  qr_scans_realizados: number;
  avaliacoes_cinco_estrelas: number;
  emergencias_atendidas?: number;
  created_at?: string;
  updated_at?: string;
}

export interface LevelProgress {
  current_level: number;
  title: string;
  current_level_xp: number;
  next_level_xp: number;
  xp_in_level: number;
  xp_needed: number;
  progress_pct: number;
  total_xp: number;
}

export interface GamificationBadge {
  id: number;
  codigo: string;
  nome: string;
  descricao: string;
  icone: string;
  categoria: string;
  xp_bonus: number;
  created_at?: string;
}

export interface UserBadge {
  id: number;
  user_id: number;
  badge_id: number;
  data_conquista: string;
  badge?: GamificationBadge;
}

export interface GamificationActivityLog {
  id: number;
  user_id: number;
  tipo_atividade: string;
  referencia_id?: number;
  xp_ganho: number;
  coins_ganho: number;
  descricao: string;
  created_at: string;
}

export interface UserProfileSummary {
  profile: GamificationProfile;
  level_progress: LevelProgress;
  badges: UserBadge[];
  all_badges: GamificationBadge[];
  recent_logs: GamificationActivityLog[];
}

export interface LeaderboardEntry {
  user_id: number;
  nome: string;
  email: string;
  foto: string;
  cargo: string;
  matricula: string;
  xp_total: number;
  nivel_atual: number;
  tech_coins: number;
  current_streak: number;
  atividades_atendidas: number;
  posicao: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total: number;
}
