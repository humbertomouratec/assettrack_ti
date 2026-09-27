import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, AlertOctagon, AlertTriangle, CheckCircle2, Clock3, Expand,
  Headphones, MonitorCog, RefreshCw, ShieldCheck, Ticket, UsersRound, Wrench, X,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { dashboardApi, type DashboardStats } from '../api/dashboard';
import { serviceDeskApi } from '../api/serviceDesk';
import { maintenanceApi } from '../api/maintenance';
import { alertsApi } from '../api/alerts';
import { API_BASE_URL, toApiFileUrl } from '../api/client';
import { rhApi } from '../api/rh';
import { transactionApi } from '../api/transaction';
import { kanbanApi } from '../api/kanban';
import type { KanbanProject } from '../types/kanban';
import { EmergencyGlobalHandler } from '../components/emergency/EmergencyGlobalHandler';
import type { ServiceTicket } from '../types/serviceDesk';
import type { SolicitacaoManutencao } from '../types/maintenance';
import type { EmergencyAlert } from '../types/alerts';
import type { Solicitacao } from '../types/transaction';
import type { RHMonitoringTeamResponse, RHStatusType } from '../types/rh';
import { playNotificationSound } from '../utils/audio';
import { notifyAndroid } from '../utils/androidNotifications';

const STAFF_ROLES = ['admin', 'gerente_ti', 'gerente_infra', 'tecnico'];

const formatTime = (value?: string) => {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const formatAge = (value?: string) => {
  if (!value) return 'agora';
  const date = new Date(value);
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (Number.isNaN(date.getTime()) || minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h`;
};

const priorityLabel: Record<string, string> = {
  urgente: 'URGENTE', alta: 'ALTA', media: 'MÉDIA', baixa: 'BAIXA',
};

const statusLabel = (status?: string) => String(status || 'aberto').replaceAll('_', ' ');

const assigneeLabel = (ticket: ServiceTicket) =>
  ticket.tecnico?.nome || ticket.responsavel?.nome || 'Não atribuído';

const rhStatusMeta: Record<RHStatusType, { label: string; className: string; dot: string }> = {
  trabalhando: { label: 'Trabalhando', className: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200', dot: 'bg-emerald-300' },
  folga: { label: 'Folga', className: 'border-sky-300/20 bg-sky-300/10 text-sky-200', dot: 'bg-sky-300' },
  ferias: { label: 'Férias', className: 'border-teal-300/20 bg-teal-300/10 text-teal-200', dot: 'bg-teal-300' },
  banco_horas: { label: 'Banco de horas', className: 'border-amber-300/20 bg-amber-300/10 text-amber-200', dot: 'bg-amber-300' },
  desligado: { label: 'Desligado', className: 'border-red-300/20 bg-red-300/10 text-red-200', dot: 'bg-red-300' },
};

const firstName = (name?: string) => String(name || 'Equipe').trim().split(/\s+/)[0] || 'Equipe';

export const MonitoramentoPage: React.FC = () => {
  const { user, token, loading: authLoading } = useAuthStore();
  const navigate = useNavigate();
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [maintenance, setMaintenance] = useState<SolicitacaoManutencao[]>([]);
  const [assetRequests, setAssetRequests] = useState<Solicitacao[]>([]);
  const [kanbanProjects, setKanbanProjects] = useState<KanbanProject[]>([]);
  const [rhTeam, setRhTeam] = useState<RHMonitoringTeamResponse['colaboradores']>([]);
  const [emergencyAlerts, setEmergencyAlerts] = useState<EmergencyAlert[]>([]);
  const [clock, setClock] = useState(new Date());
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [connection, setConnection] = useState<'online' | 'reconnecting'>('online');
  const [loading, setLoading] = useState(true);
  const monitorSignatureRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const results = await Promise.allSettled([
      dashboardApi.getStats(),
      serviceDeskApi.listTickets(0, 100),
      maintenanceApi.listRequests(0, 100),
      alertsApi.history(),
      transactionApi.listSolicitacoes(0, 100),
      kanbanApi.listProjects(false),
      rhApi.monitoringTeam(),
    ]);
    if (results[0].status === 'fulfilled') setStats(results[0].value);
    const nextTickets = results[1].status === 'fulfilled' ? results[1].value : tickets;
    const nextMaintenance = results[2].status === 'fulfilled' ? results[2].value : maintenance;
    const nextAssetRequests = results[4].status === 'fulfilled' ? results[4].value : assetRequests;
    const nextKanbanProjects = results[5].status === 'fulfilled' ? results[5].value : kanbanProjects;
    const nextRhTeam = results[6].status === 'fulfilled' ? results[6].value.colaboradores : rhTeam;
    const boardResults = results[5].status === 'fulfilled'
      ? await Promise.allSettled(nextKanbanProjects.slice(0, 40).map((project) => kanbanApi.getBoard(project.id)))
      : [];
    const loadedKanbanProjects = boardResults.length
      ? boardResults.filter((result): result is PromiseFulfilledResult<{ project: KanbanProject; board_progress: number; total_cards: number }> => result.status === 'fulfilled').map((result) => result.value.project)
      : nextKanbanProjects;
    const nextSignature = JSON.stringify({
      tickets: nextTickets.map((ticket) => [ticket.id, ticket.status, ticket.tecnico_id, ticket.responsavel_id]),
      requests: nextAssetRequests.map((request) => [request.id, request.status]),
      maintenance: nextMaintenance.map((item) => [item.id, item.status]),
      kanban: loadedKanbanProjects.flatMap((project) => (project.colunas || []).flatMap((column) => (column.cards || []).map((card) => [card.id, column.id, card.updated_at]))),
      rhTeam: nextRhTeam.map((item) => [item.usuario.id, item.status_atual, item.horas, item.usuario.show_on_monitoring]),
    });
    if (monitorSignatureRef.current !== null && monitorSignatureRef.current !== nextSignature) {
      playNotificationSound();
      void notifyAndroid('Novidade no monitoramento', 'Há uma nova atualização operacional no AssetTrack TI.');
    }
    monitorSignatureRef.current = nextSignature;
    if (results[1].status === 'fulfilled') setTickets(nextTickets);
    if (results[2].status === 'fulfilled') setMaintenance(nextMaintenance);
    if (results[3].status === 'fulfilled') setEmergencyAlerts(results[3].value);
    if (results[4].status === 'fulfilled') setAssetRequests(nextAssetRequests);
    if (loadedKanbanProjects.length || results[5].status === 'fulfilled') setKanbanProjects(loadedKanbanProjects);
    if (results[6].status === 'fulfilled') setRhTeam(nextRhTeam);
    setLastUpdate(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!token || !STAFF_ROLES.includes(user?.role?.toLowerCase() || '')) return;
    refresh();
    const interval = window.setInterval(refresh, 5000);
    const clockInterval = window.setInterval(() => setClock(new Date()), 1000);
    return () => { window.clearInterval(interval); window.clearInterval(clockInterval); };
  }, [refresh, token, user?.role]);

  useEffect(() => {
    if (!token || !STAFF_ROLES.includes(user?.role?.toLowerCase() || '')) return;
    const source = new EventSource(`${API_BASE_URL}/kanban/sse?token=${encodeURIComponent(token)}`);
    source.addEventListener('kanban_update', () => { void refresh(); });
    return () => source.close();
  }, [refresh, token, user?.role]);

  useEffect(() => {
    if (!token || !STAFF_ROLES.includes(user?.role?.toLowerCase() || '')) return;
    const source = new EventSource(`${API_BASE_URL}/alertas/stream?token=${encodeURIComponent(token)}`);
    source.onopen = () => setConnection('online');
    source.onerror = () => setConnection('reconnecting');
    source.addEventListener('emergency_alert', (event) => {
      try {
        const incoming = JSON.parse((event as MessageEvent).data) as EmergencyAlert;
        setEmergencyAlerts((current) => [incoming, ...current.filter((item) => item.id !== incoming.id)].slice(0, 100));
      } catch { /* mantém o painel ativo mesmo se um evento inválido for recebido */ }
    });
    return () => source.close();
  }, [token, user?.role]);

  useEffect(() => {
    const onFullscreen = () => setIsFullscreen(document.fullscreenElement === fullscreenRef.current);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  const openTickets = useMemo(() => tickets.filter((ticket) => !['resolvido', 'fechado', 'cancelado'].includes(String(ticket.status).toLowerCase())), [tickets]);
  const urgentTickets = useMemo(() => openTickets.filter((ticket) => ['urgente', 'alta'].includes(String(ticket.prioridade).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))), [openTickets]);
  const activeMaintenance = useMemo(() => maintenance.filter((item) => !['concluida', 'rejeitada', 'entregue'].includes(String(item.status).toLowerCase())), [maintenance]);
  const pendingAssetRequests = useMemo(() => assetRequests.filter((item) => ['pendente', 'aprovada'].includes(String(item.status).toLowerCase())), [assetRequests]);
  const activeEmergency = useMemo(() => emergencyAlerts.filter((alert) => !alert.atendido), [emergencyAlerts]);
  const kanbanSummary = useMemo(() => {
    const columns = new Map<string, { name: string; color: string; count: number }>();
    const updates: { id: number; title: string; project: string; status: string; responsible: string; updatedAt: string }[] = [];
    let totalCards = 0;
    kanbanProjects.forEach((project) => (project.colunas || []).forEach((column) => {
      const cards = column.cards || [];
      totalCards += cards.length;
      const current = columns.get(column.nome) || { name: column.nome, color: column.cor, count: 0 };
      current.count += cards.length;
      columns.set(column.nome, current);
      cards.forEach((card) => updates.push({ id: card.id, title: card.titulo, project: project.titulo, status: column.nome, responsible: card.responsavel?.nome || card.criador?.nome || 'Não atribuído', updatedAt: card.updated_at }));
    }));
    return { totalCards, columns: Array.from(columns.values()), updates: updates.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 6) };
  }, [kanbanProjects]);
  const visibleAlerts = useMemo(() => [
    ...activeEmergency.map((alert) => ({ id: `emergency-${alert.id}`, title: alert.motivo, detail: `${alert.usuario_nome} · alerta emergencial`, tone: 'red', age: alert.created_at })),
    ...urgentTickets.map((ticket) => ({ id: `ticket-${ticket.id}`, title: ticket.descricao, detail: `${ticket.codigo} · ${priorityLabel[ticket.prioridade] || ticket.prioridade}`, tone: ticket.prioridade === 'urgente' ? 'red' : 'amber', age: ticket.data_abertura })),
    ...activeMaintenance.slice(0, 4).map((item) => ({ id: `maintenance-${item.id}`, title: item.descricao, detail: `${item.asset?.nome || 'Equipamento'} · manutenção`, tone: 'blue', age: item.data_solicitacao })),
  ].slice(0, 8), [activeEmergency, activeMaintenance, urgentTickets]);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await fullscreenRef.current?.requestFullscreen();
  };

  if (authLoading) return <div className="min-h-screen bg-[#071525]" />;
  if (!token) { navigate('/login', { replace: true }); return null; }
  if (!STAFF_ROLES.includes(user?.role?.toLowerCase() || '')) { navigate('/', { replace: true }); return null; }

  const metricCards = [
    { label: 'Chamados em aberto', value: stats?.tickets_open ?? openTickets.length, icon: Ticket, color: 'text-cyan-300', link: `${openTickets.length} na fila` },
    { label: 'Prioridade alta', value: urgentTickets.length, icon: AlertTriangle, color: 'text-amber-300', link: 'atenção imediata' },
    { label: 'Em manutenção', value: stats?.total_assets_maintenance ?? activeMaintenance.length, icon: Wrench, color: 'text-amber-300', link: `${activeMaintenance.length} solicitações ativas` },
    { label: 'Alertas ativos', value: activeEmergency.length, icon: AlertOctagon, color: 'text-red-300', link: connection === 'online' ? 'tempo real ativo' : 'reconectando' },
    { label: 'Cartões no Kanban', value: kanbanSummary.totalCards, icon: Activity, color: 'text-emerald-300', link: `${kanbanProjects.length} projetos acompanhados` },
  ];

  return (
    <div ref={fullscreenRef} className="h-screen min-h-0 overflow-x-hidden overflow-y-auto bg-[#071525] text-white selection:bg-cyan-400/30">
      <div className="mx-auto flex min-h-full max-w-[1900px] flex-col px-3 py-4 sm:px-6 sm:py-6 lg:px-8 2xl:px-12">
        <header className="relative flex shrink-0 items-center justify-between gap-3 border-b border-white/10 pb-4 sm:pb-5">
          <div className="min-w-0 flex-1 sm:min-w-[180px]">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300"><Activity size={14} /> Sala de monitoramento</p>
            <p className="mt-1 truncate text-xs text-slate-400">Operação AssetTrack TI · {user?.nome}</p>
          </div>
          <img src="/logo-assettrack-monitoramento.png" alt="AssetTrack TI" className="absolute left-1/2 top-0 hidden h-[48px] w-[190px] -translate-x-1/2 object-contain sm:block sm:h-[60px] sm:w-[280px] lg:h-[69px] lg:w-[328px]" />
          <div className="flex shrink-0 items-center justify-end gap-2 sm:min-w-[180px] sm:gap-3">
            <div className="text-right"><p className="text-xl font-semibold tracking-tight sm:text-3xl">{clock.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p><p className="text-[9px] uppercase tracking-widest text-slate-500 sm:text-[10px]">{clock.toLocaleDateString('pt-BR')}</p></div>
            <button onClick={toggleFullscreen} className="rounded-xl border border-white/15 bg-white/5 p-2.5 text-slate-300 transition hover:bg-white/10 hover:text-white" aria-label={isFullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'} title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}>{isFullscreen ? <X size={18} /> : <Expand size={18} />}</button>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 pt-4 sm:gap-5 sm:pt-5">
          {rhTeam.length > 0 && (
            <section className="rounded-2xl border border-white/10 bg-[#0d2137] p-4 shadow-2xl shadow-black/10">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider"><UsersRound size={17} className="text-cyan-300" /> Status atual da equipe</h2>
                  <p className="mt-1 text-xs text-slate-500">Colaboradores selecionados pelo RH para exibição na sala</p>
                </div>
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">{rhTeam.length} visíveis</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
                {rhTeam.slice(0, 16).map(({ usuario, status_atual, horas }) => {
                  const meta = rhStatusMeta[status_atual];
                  const avatarUrl = toApiFileUrl(usuario.avatar_url);
                  return (
                    <div key={usuario.id} className="min-w-0 rounded-2xl border border-white/10 bg-[#102a44] p-3 text-center">
                      <div className="mx-auto h-16 w-16 overflow-hidden rounded-full border border-white/15 bg-[#071525]">
                        {avatarUrl ? <img src={avatarUrl} alt={usuario.nome} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-lg font-bold text-cyan-200">{firstName(usuario.nome).slice(0, 2).toUpperCase()}</div>}
                      </div>
                      <p className="mt-2 truncate text-sm font-semibold text-slate-100">{firstName(usuario.nome)}</p>
                      <div className={`mx-auto mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${meta.className}`}>
                        <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                        <span className="truncate">{meta.label}</span>
                      </div>
                      {status_atual === 'banco_horas' && horas !== null && horas !== undefined ? <p className="mt-1 text-[10px] text-amber-200">{horas}h</p> : null}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
            {metricCards.map(({ label, value, icon: Icon, color, link }) => <div key={label} className="rounded-2xl border border-white/10 bg-[#0d2137] p-4 shadow-2xl shadow-black/10 sm:p-5"><div className="flex items-start justify-between"><p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p><Icon size={20} className={color} /></div><p className={`mt-2 text-3xl font-semibold tracking-tight sm:text-4xl ${color}`}>{loading ? '—' : value}</p><p className="mt-1 text-[11px] text-slate-500">{link}</p></div>)}
          </div>

          <div className="grid min-h-0 gap-4 sm:gap-5 xl:grid-cols-3">
            <section className="flex min-h-[300px] flex-col rounded-2xl border border-white/10 bg-[#0d2137] p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between"><div><h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider"><Headphones size={17} className="text-cyan-300" /> Fila de atendimento</h2><p className="mt-1 text-xs text-slate-500">Chamados que precisam de acompanhamento</p></div><span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-300">{openTickets.length} ativos</span></div>
              <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
                {openTickets.slice(0, 7).map((ticket) => <div key={ticket.id} className="flex items-center gap-3 rounded-xl border border-white/7 bg-[#102a44] px-3 py-3"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${String(ticket.prioridade).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 'urgente' ? 'bg-red-400 shadow-[0_0_12px_#f87171]' : String(ticket.prioridade).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 'alta' ? 'bg-amber-300' : 'bg-cyan-300'}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-100">{ticket.descricao}</p><p className="mt-1 truncate text-[11px] text-slate-500">{ticket.codigo} · {ticket.solicitante?.nome || 'Solicitante'}</p><div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wide"><span className="rounded bg-cyan-300/10 px-1.5 py-0.5 font-semibold text-cyan-200">{statusLabel(ticket.status)}</span><span className="text-slate-500">·</span><span className="truncate normal-case tracking-normal text-slate-400">{assigneeLabel(ticket)}</span></div></div><div className="shrink-0 text-right"><p className="text-[10px] font-semibold uppercase text-slate-400">{priorityLabel[String(ticket.prioridade).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')] || ticket.prioridade}</p><p className="mt-1 text-[10px] text-slate-600">{formatAge(ticket.data_abertura)}</p></div></div>)}
                {!openTickets.length && <div className="grid h-full place-items-center text-sm text-slate-500"><CheckCircle2 className="mr-2 inline text-emerald-400" size={18} /> Tudo tranquilo por aqui</div>}
              </div>
            </section>

            <section className="flex min-h-[300px] flex-col rounded-2xl border border-white/10 bg-[#0d2137] p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider"><AlertOctagon size={17} className="text-red-300" /> Central de alertas</h2><p className="mt-1 text-xs text-slate-500">Eventos priorizados para a equipe</p></div><span className={`flex items-center gap-1.5 text-[10px] uppercase tracking-widest ${connection === 'online' ? 'text-emerald-300' : 'text-amber-300'}`}><span className={`h-2 w-2 rounded-full ${connection === 'online' ? 'bg-emerald-400' : 'animate-pulse bg-amber-400'}`} /> {connection === 'online' ? 'Ao vivo' : 'Reconectando'}</span></div><div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">{visibleAlerts.map((alert) => <div key={alert.id} className={`rounded-xl border px-3 py-3 ${alert.tone === 'red' ? 'border-red-400/20 bg-red-400/8' : alert.tone === 'amber' ? 'border-amber-300/20 bg-amber-300/8' : 'border-cyan-300/15 bg-cyan-300/6'}`}><div className="flex items-start gap-3"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${alert.tone === 'red' ? 'bg-red-400' : alert.tone === 'amber' ? 'bg-amber-300' : 'bg-cyan-300'}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{alert.title}</p><p className="mt-1 truncate text-[11px] text-slate-400">{alert.detail}</p></div><span className="shrink-0 text-[10px] text-slate-500">{formatAge(alert.age)}</span></div></div>)}{!visibleAlerts.length && <div className="grid h-full place-items-center text-sm text-slate-500"><ShieldCheck className="mr-2 inline text-emerald-400" size={18} /> Nenhum alerta ativo</div>}</div></section>

            <section className="flex min-h-[300px] flex-col rounded-2xl border border-white/10 bg-[#0d2137] p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider"><MonitorCog size={17} className="text-amber-300" /> Solicitações de ativos</h2><p className="mt-1 text-xs text-slate-500">Pendentes e aprovadas aguardando entrega</p></div><span className="rounded-full bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-300">{pendingAssetRequests.length} pendentes</span></div><div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">{pendingAssetRequests.slice(0, 7).map((request) => <div key={request.id} className="rounded-xl border border-white/7 bg-[#102a44] px-3 py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-100">{request.asset?.nome || 'Equipamento solicitado'}</p><p className="mt-1 truncate text-[11px] text-slate-500">{request.solicitante?.nome || 'Solicitante'} · {request.motivo || 'Sem justificativa'}</p></div><span className={`shrink-0 rounded px-2 py-1 text-[9px] font-bold uppercase ${String(request.status).toLowerCase() === 'aprovada' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-300/10 text-amber-300'}`}>{String(request.status).toLowerCase() === 'aprovada' ? 'Aprovada' : 'Pendente'}</span></div></div>)}{!pendingAssetRequests.length && <div className="grid h-full place-items-center text-sm text-slate-500"><CheckCircle2 className="mr-2 inline text-emerald-400" size={18} /> Nenhuma solicitação pendente</div>}</div></section>
          </div>

          <section className="rounded-2xl border border-white/10 bg-[#0d2137] p-4 shadow-2xl shadow-black/10 sm:p-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div><h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider"><Activity size={17} className="text-emerald-300" /> Kanban operacional</h2><p className="mt-1 text-xs text-slate-500">Contagens e últimas movimentações dos projetos disponíveis para esta equipe</p></div>
              <button onClick={() => navigate('/kanban')} className="self-start rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-300 transition hover:bg-white/10 hover:text-white">Abrir Kanban</button>
            </div>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
                <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/5 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Projetos</p><p className="mt-1 text-2xl font-semibold text-emerald-300">{kanbanProjects.length}</p></div>
                <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/5 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Cartões</p><p className="mt-1 text-2xl font-semibold text-cyan-300">{kanbanSummary.totalCards}</p></div>
                {kanbanSummary.columns.map((column) => <div key={column.name} className="rounded-xl border border-white/10 bg-[#102a44] p-3"><div className="flex items-center justify-between gap-2"><p className="truncate text-[10px] uppercase tracking-wider text-slate-500">{column.name}</p><span className="h-2 w-2 rounded-full" style={{ backgroundColor: column.color || '#38bdf8' }} /></div><p className="mt-1 text-2xl font-semibold text-slate-100">{column.count}</p></div>)}
              </div>
              <div className="min-w-0"><div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Atualizações recentes</div><div className="space-y-2">{kanbanSummary.updates.map((update) => <div key={`${update.id}-${update.updatedAt}`} className="flex items-center gap-3 rounded-xl border border-white/7 bg-[#102a44] px-3 py-2.5"><span className="h-2 w-2 shrink-0 rounded-full bg-emerald-300" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-100">{update.title}</p><p className="mt-1 truncate text-[10px] text-slate-500">{update.project} · {update.responsible}</p></div><div className="shrink-0 text-right"><p className="max-w-[110px] truncate text-[10px] font-semibold uppercase text-emerald-300">{update.status}</p><p className="mt-1 text-[10px] text-slate-600">{formatAge(update.updatedAt)}</p></div></div>)}{!kanbanSummary.updates.length && <div className="rounded-xl border border-dashed border-white/10 p-7 text-center text-sm text-slate-500">Nenhum cartão Kanban disponível para acompanhamento.</div>}</div></div>
            </div>
          </section>

          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-[11px] text-slate-500"><span className="flex items-center gap-2"><MonitorCog size={14} className="text-cyan-300" /> Status, atribuições e novidades com atualização a cada 5 segundos</span><span className="flex items-center gap-2"><Clock3 size={14} /> Última sincronização: {lastUpdate ? formatTime(lastUpdate.toISOString()) : 'carregando'} <button onClick={refresh} className="rounded p-1 transition hover:bg-white/10 hover:text-white" title="Atualizar agora"><RefreshCw size={14} /></button><button onClick={() => navigate('/')} className="rounded p-1 transition hover:bg-white/10 hover:text-white" title="Voltar ao sistema"><X size={14} /></button></span></footer>
        </div>
      </div>
      <EmergencyGlobalHandler />
    </div>
  );
};
