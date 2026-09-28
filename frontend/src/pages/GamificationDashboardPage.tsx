import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { getMyGamificationProfile, getGamificationLeaderboard } from '../api/gamification';
import { LevelProgressBar } from '../components/gamification/LevelProgressBar';
import { BadgeCard } from '../components/gamification/BadgeCard';
import { LeaderboardTable } from '../components/gamification/LeaderboardTable';
import { LevelUpModal } from '../components/gamification/LevelUpModal';
import {
  Trophy,
  Award,
  Sparkles,
  Flame,
  CheckCircle2,
  History,
  Zap,
  Wrench,
  ClipboardList,
  MessageSquare,
  Columns3,
  Star,
  QrCode,
  ChevronRight,
} from 'lucide-react';

export const GamificationDashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const isAuthorized = ['admin', 'gerente_ti', 'gerente_infra', 'tecnico'].includes(user?.role?.toLowerCase() || '');
  const [activeTab, setActiveTab] = useState<'overview' | 'leaderboard' | 'badges' | 'history'>('overview');
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<'all' | 'monthly' | 'weekly'>('all');
  const [badgeCategoryFilter, setBadgeCategoryFilter] = useState<string>('all');
  const [showLevelUpModal, setShowLevelUpModal] = useState(false);

  // Fetch technician profile
  const {
    data: profileData,
    isLoading: loadingProfile,
  } = useQuery({
    queryKey: ['my-gamification-profile'],
    queryFn: getMyGamificationProfile,
    enabled: isAuthorized,
    staleTime: 30 * 1000,
  });

  // Fetch leaderboard
  const {
    data: leaderboardData,
    isLoading: loadingLeaderboard,
  } = useQuery({
    queryKey: ['gamification-leaderboard', leaderboardPeriod],
    queryFn: () => getGamificationLeaderboard(leaderboardPeriod),
    enabled: isAuthorized,
    staleTime: 30 * 1000,
  });

  const profile = profileData?.profile;
  const levelProgress = profileData?.level_progress;
  const badges = profileData?.all_badges || [];
  const userBadges = profileData?.badges || [];
  const recentLogs = profileData?.recent_logs || [];

  const userBadgeMap = useMemo(
    () => new Map(userBadges.map((ub) => [ub.badge_id, ub])),
    [userBadges]
  );

  const categories = useMemo(() => {
    const set = new Set(badges.map((b) => b.categoria));
    return ['all', ...Array.from(set)];
  }, [badges]);

  const filteredBadges = useMemo(() => {
    if (badgeCategoryFilter === 'all') return badges;
    return badges.filter((b) => b.categoria === badgeCategoryFilter);
  }, [badges, badgeCategoryFilter]);

  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center">
        <div className="rounded-full bg-amber-50 p-4 text-amber-600 mb-4 border border-amber-200">
          <Trophy className="w-10 h-10 opacity-70" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Acesso Restrito</h2>
        <p className="text-sm text-slate-500 max-w-md mt-2">
          O módulo de gamificação e produtividade está disponível exclusivamente para técnicos, gerentes e administradores.
        </p>
      </div>
    );
  }

  if (loadingProfile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-600 border-t-transparent" />
          <p className="text-sm font-semibold text-slate-500">
            Carregando Central de Conquistas e Produtividade...
          </p>
        </div>
      </div>
    );
  }

  const getActivityIcon = (tipo: string) => {
    switch (tipo) {
      case 'service_desk':
        return <MessageSquare className="h-4 w-4 text-blue-600" />;
      case 'preventive_maintenance':
        return <ClipboardList className="h-4 w-4 text-cyan-600" />;
      case 'maintenance':
      case 'manutencao_corretiva':
        return <Wrench className="h-4 w-4 text-orange-600" />;
      case 'kanban':
        return <Columns3 className="h-4 w-4 text-emerald-600" />;
      case 'rating_5_star':
        return <Star className="h-4 w-4 text-amber-500" />;
      case 'qr_scan':
        return <QrCode className="h-4 w-4 text-indigo-600" />;
      default:
        return <CheckCircle2 className="h-4 w-4 text-blue-600" />;
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner / Hero Command Center */}
      <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 p-6 sm:p-8 text-white shadow-xl">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          {/* User Profile summary */}
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 sm:h-20 sm:w-20 shrink-0 overflow-hidden rounded-2xl bg-white/20 p-1 ring-4 ring-white/30 backdrop-blur-md shadow-md">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.nome}
                  className="h-full w-full rounded-xl object-cover"
                />
              ) : (
                <div className="grid h-full w-full place-items-center rounded-xl bg-blue-900/60 font-black text-white text-xl sm:text-2xl">
                  {user?.nome ? user.nome.charAt(0).toUpperCase() : 'T'}
                </div>
              )}
              <span className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full bg-emerald-400 ring-2 ring-white" />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-0.5 text-xs font-bold uppercase tracking-wider backdrop-blur-md">
                  <Sparkles className="h-3 w-3 text-amber-300" />
                  Painel de Produtividade Gamificado
                </span>
                {user?.matricula && (
                  <span className="rounded-full bg-blue-900/50 px-2.5 py-0.5 text-[11px] font-mono font-semibold text-blue-200">
                    Matrícula: {user.matricula}
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
                {user?.nome || 'Técnico de Suporte'}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100 font-medium">
                {user?.cargo || 'Equipe de TI & Infraestrutura'} · Cada chamado resolvido e equipamento reparado acelera sua evolução técnica.
              </p>
            </div>
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-md border border-white/15 text-center min-w-[105px] transition-transform hover:scale-105">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200">Nível</span>
              <p className="text-2xl font-black text-amber-300">{levelProgress?.current_level || 1}</p>
              <span className="text-[10px] text-blue-200 font-medium">{levelProgress?.title?.split(' ')[0] || 'Técnico'}</span>
            </div>

            <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-md border border-white/15 text-center min-w-[105px] transition-transform hover:scale-105">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200">Atividades</span>
              <p className="text-2xl font-black text-white">{profile?.atividades_atendidas || 0}</p>
              <span className="text-[10px] text-blue-200 font-medium">atendimentos</span>
            </div>

            <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-md border border-white/15 text-center min-w-[105px] transition-transform hover:scale-105">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200">Sequência</span>
              <p className="text-2xl font-black text-orange-300 flex items-center justify-center gap-1">
                <Flame className="h-5 w-5 fill-orange-400 text-orange-400" />
                {profile?.current_streak || 0}d
              </p>
              <span className="text-[10px] text-blue-200 font-medium">dias seguidos</span>
            </div>

            <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-md border border-white/15 text-center min-w-[105px] transition-transform hover:scale-105">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200">Insígnias</span>
              <p className="text-2xl font-black text-emerald-300">{userBadges.length}/{badges.length}</p>
              <span className="text-[10px] text-blue-200 font-medium">desbloqueadas</span>
            </div>
          </div>
        </div>

        {/* Decorative background glows */}
        <div className="pointer-events-none absolute -right-10 -bottom-10 h-64 w-64 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="pointer-events-none absolute left-1/3 -top-20 h-48 w-48 rounded-full bg-blue-400/20 blur-3xl" />
      </div>

      {/* Level Progress Bar PRO MAX */}
      {levelProgress && (
        <LevelProgressBar
          progress={levelProgress}
          streak={profile?.current_streak}
        />
      )}

      {/* Navigation Tabs with High Contrast Indicators */}
      <div className="flex border-b border-slate-200/90 gap-2 sm:gap-3 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`cursor-pointer flex items-center gap-2 border-b-2 py-3 px-3.5 text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === 'overview'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-xl'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50/50'
          }`}
        >
          <Zap className="h-4 w-4" />
          Visão Geral
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('leaderboard')}
          className={`cursor-pointer flex items-center gap-2 border-b-2 py-3 px-3.5 text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === 'leaderboard'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-xl'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50/50'
          }`}
        >
          <Trophy className="h-4 w-4" />
          Ranking da Equipe
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('badges')}
          className={`cursor-pointer flex items-center gap-2 border-b-2 py-3 px-3.5 text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === 'badges'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-xl'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50/50'
          }`}
        >
          <Award className="h-4 w-4" />
          Insígnias ({userBadges.length}/{badges.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`cursor-pointer flex items-center gap-2 border-b-2 py-3 px-3.5 text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === 'history'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-xl'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50/50'
          }`}
        >
          <History className="h-4 w-4" />
          Extrato de Atividades
        </button>
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Breakdown + Badges preview */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {/* Breakdown Cards across all 5 operational modules */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              <div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-xs backdrop-blur-md hover:border-blue-300 transition-colors">
                <div className="flex items-center justify-between text-blue-600">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Service Desk</span>
                  <MessageSquare className="h-4 w-4" />
                </div>
                <p className="mt-2 text-2xl font-black text-blue-700">{profile?.chamados_resolvidos || 0}</p>
                <span className="text-[11px] text-slate-500 font-medium">chamados fechados</span>
              </div>

              <div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-xs backdrop-blur-md hover:border-cyan-300 transition-colors">
                <div className="flex items-center justify-between text-cyan-600">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Preventivas</span>
                  <ClipboardList className="h-4 w-4" />
                </div>
                <p className="mt-2 text-2xl font-black text-cyan-700">{profile?.preventivas_concluidas || 0}</p>
                <span className="text-[11px] text-slate-500 font-medium">ordens concluídas</span>
              </div>

              <div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-xs backdrop-blur-md hover:border-orange-300 transition-colors">
                <div className="flex items-center justify-between text-orange-600">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Manutenções</span>
                  <Wrench className="h-4 w-4" />
                </div>
                <p className="mt-2 text-2xl font-black text-orange-700">{profile?.manutencoes_concluidas || 0}</p>
                <span className="text-[11px] text-slate-500 font-medium">reparos na oficina</span>
              </div>

              <div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-xs backdrop-blur-md hover:border-emerald-300 transition-colors">
                <div className="flex items-center justify-between text-emerald-600">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Kanban</span>
                  <Columns3 className="h-4 w-4" />
                </div>
                <p className="mt-2 text-2xl font-black text-emerald-700">{profile?.kanban_concluidos || 0}</p>
                <span className="text-[11px] text-slate-500 font-medium">tarefas ágeis</span>
              </div>

              <div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-xs backdrop-blur-md hover:border-amber-300 transition-colors">
                <div className="flex items-center justify-between text-amber-500">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">5 Estrelas</span>
                  <Star className="h-4 w-4 fill-amber-400" />
                </div>
                <p className="mt-2 text-2xl font-black text-amber-600">{profile?.avaliacoes_cinco_estrelas || 0}</p>
                <span className="text-[11px] text-slate-500 font-medium">elogios de usuários</span>
              </div>
            </div>

            {/* Badges Preview */}
            <div className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm backdrop-blur-md">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight">
                    Suas Conquistas Recentes
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Insígnias que aceleram sua pontuação e destacam sua especialidade
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('badges')}
                  className="cursor-pointer text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                >
                  Ver todas ({badges.length})
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                {badges.slice(0, 6).map((badge) => (
                  <BadgeCard
                    key={badge.id}
                    badge={badge}
                    userBadge={userBadgeMap.get(badge.id)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Mini Leaderboard + Celebration Preview */}
          <div className="flex flex-col gap-6">
            {/* Quick Leaderboard Preview */}
            <div className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm backdrop-blur-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  Top Técnicos
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('leaderboard')}
                  className="cursor-pointer text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Ver ranking completo →
                </button>
              </div>

              <div className="flex flex-col divide-y divide-slate-100">
                {(leaderboardData || []).slice(0, 5).map((entry) => (
                  <div key={entry.user_id} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black text-slate-500 w-5">#{entry.posicao}</span>
                      <div className="h-8 w-8 rounded-full overflow-hidden bg-slate-200 ring-2 ring-white">
                        {entry.foto ? (
                          <img src={entry.foto} alt={entry.nome} className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-xs font-bold text-slate-600">
                            {entry.nome.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 leading-tight">{entry.nome}</p>
                        <span className="text-[10px] text-slate-500">Lvl {entry.nivel_atual}</span>
                      </div>
                    </div>
                    <span className="text-xs font-black text-slate-900">
                      {entry.xp_total.toLocaleString()} XP
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Test Level Up Modal button */}
            <div className="rounded-3xl border border-amber-200/80 bg-gradient-to-br from-amber-500/10 via-amber-400/5 to-transparent p-5 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-xs">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900">Efeito Comemorativo</h4>
                  <p className="text-xs text-slate-600 font-medium">Simule a celebração de subir de nível</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLevelUpModal(true)}
                className="cursor-pointer mt-4 w-full rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 py-2.5 text-xs font-black text-white shadow-sm hover:from-amber-600 hover:to-yellow-600 transition-all active:scale-98"
              >
                Testar Celebração de Nível
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Leaderboard */}
      {activeTab === 'leaderboard' && (
        <LeaderboardTable
          entries={leaderboardData || []}
          loading={loadingLeaderboard}
          period={leaderboardPeriod}
          onPeriodChange={setLeaderboardPeriod}
          currentUserId={user?.id}
        />
      )}

      {/* Tab: Badges */}
      {activeTab === 'badges' && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">
                Galeria de Insígnias & Conquistas
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Atenda atividades no Service Desk, Preventivas, Reparos e Kanban para desbloquear prêmios.
              </p>
            </div>

            {/* Filter pills */}
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setBadgeCategoryFilter(cat)}
                  className={`cursor-pointer rounded-xl px-3 py-1 text-xs font-bold transition-all ${
                    badgeCategoryFilter === cat
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white/80 text-slate-600 border border-slate-200 hover:bg-white'
                  }`}
                >
                  {cat === 'all' ? 'Todas' : cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredBadges.map((badge) => (
              <BadgeCard
                key={badge.id}
                badge={badge}
                userBadge={userBadgeMap.get(badge.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tab: History */}
      {activeTab === 'history' && (
        <div className="overflow-hidden rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm backdrop-blur-md">
          <div className="mb-5 flex items-center justify-between border-b border-slate-200/80 pb-4">
            <div>
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                Extrato Cronológico de Atividades
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Auditoria de cada ação técnica pontuada no sistema
              </p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 border border-blue-200">
              {recentLogs.length} eventos recentes
            </span>
          </div>

          {recentLogs.length === 0 ? (
            <div className="py-12 text-center">
              <History className="mx-auto h-8 w-8 text-slate-300 mb-2" />
              <p className="text-xs text-slate-500 font-medium">Nenhuma atividade pontuada registrada até o momento.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between py-3.5 hover:bg-slate-50/50 px-2 rounded-xl transition-colors">
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 shadow-2xs border border-slate-200/70">
                      {getActivityIcon(log.tipo_atividade)}
                    </div>
                    <div>
                      <p className="text-xs font-extrabold text-slate-900">{log.descricao}</p>
                      <span className="text-[11px] text-slate-400 font-medium">
                        {new Date(log.created_at).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-black text-emerald-700 shadow-2xs">
                    +{log.xp_ganho} XP
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Level Up Celebration Modal */}
      <LevelUpModal
        isOpen={showLevelUpModal}
        onClose={() => setShowLevelUpModal(false)}
        newLevel={(levelProgress?.current_level || 1) + 1}
        title={levelProgress?.title || 'Especialista em Sistemas'}
      />
    </div>
  );
};
