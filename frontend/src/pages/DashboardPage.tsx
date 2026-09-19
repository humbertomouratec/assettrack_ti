import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { dashboardApi } from '../api/dashboard';
import { transactionApi } from '../api/transaction';
import { maintenanceApi } from '../api/maintenance';
import { kanbanApi } from '../api/kanban';
import type { DashboardStats } from '../api/dashboard';
import type { Solicitacao, SolicitacaoManutencao } from '../types';
import {
  LayoutDashboard, Wrench, MessageSquare, Briefcase, BellRing, FileDown,
  AlertTriangle, Info, QrCode, ArrowLeftRight, UserCheck,
  Laptop, Calendar, Clock, X, Send, Paperclip, Star, TrendingUp,
  PlusCircle, Activity, Layers, BarChart3, PieChart, ShieldCheck, RefreshCw, Columns3,
  ChevronRight, Package, Zap, ShieldAlert, ExternalLink, Eye, Maximize2
} from 'lucide-react';
import { triggerEmergencyAlertModal } from '../components/emergency/EmergencyGlobalHandler';
import { serviceDeskApi } from '../api/serviceDesk';
import { alertsApi } from '../api/alerts';
import { toApiFileUrl } from '../api/client';
import type { ServiceTicket } from '../types';
import type { Aviso } from '../types/alerts';
import type { KanbanNotification } from '../types/kanban';


import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Register Chart.js components
ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  ArcElement, Title, Tooltip, Legend, Filler
);

export const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const userRole = user?.role?.toLowerCase() || '';
  const isStaff = ['admin', 'gerente_ti', 'gerente_infra', 'tecnico'].includes(userRole);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [myActiveLoans, setMyActiveLoans] = useState<Solicitacao[]>([]);
  const [myMaintenanceRequests, setMyMaintenanceRequests] = useState<SolicitacaoManutencao[]>([]);
  const [extraLoading, setExtraLoading] = useState(false);

  // System notices (Avisos) for all users
  const [activeAvisos, setActiveAvisos] = useState<Aviso[]>([]);
  const [selectedAviso, setSelectedAviso] = useState<Aviso | null>(null);
  const [kanbanNotifications, setKanbanNotifications] = useState<KanbanNotification[]>([]);

  // Service desk states for collaborator tracking
  const [myTickets, setMyTickets] = useState<ServiceTicket[]>([]);
  const [selectedDashboardTicket, setSelectedDashboardTicket] = useState<ServiceTicket | null>(null);
  const [commentMessage, setCommentMessage] = useState('');
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // Emergency alert modal states for resolved tickets
  const [resolvedTickets, setResolvedTickets] = useState<ServiceTicket[]>([]);
  const [dashboardRating, setDashboardRating] = useState<number>(0);
  const [dashboardHoverRating, setDashboardHoverRating] = useState<number>(0);
  const [dashboardFeedbackComment, setDashboardFeedbackComment] = useState<string>('');
  const [submittingEmergency, setSubmittingEmergency] = useState<boolean>(false);

  const summarizeServiceTicket = (description: string | undefined, maxLength = 72): string => {
    const normalized = (description || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return 'Sem descrição';
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
  };

  const dashboardSourceLinks = {
    assets: '/assets?tab=table',
    serviceDesk: '/servicos?status=aberto',
    serviceDeskResolved: '/servicos?status=resolvido',
    serviceDeskClosed: '/servicos?status=fechado',
    loans: '/emprestimos?status=pendente',
    maintenance: '/manutencoes?tab=active',
    purchases: '/compras?tab=ordens',
    alerts: '/alertas',
  } as const;

  const assetStatusSourceLinks: Record<string, string> = {
    Disponível: '/assets?tab=table&status=Disponível',
    'Em Uso': '/assets?tab=table&status=Em%20uso',
    Manutenção: '/assets?tab=table&status=Manutenção',
    Armazenado: '/assets?tab=table&status=Armazenado',
    Baixado: '/assets?tab=table&status=Baixado',
  };

  const getRecentActivityLink = (act: { type: string; status: string }) => {
    if (act.type === 'movimentacao') return dashboardSourceLinks.assets;
    if (act.type === 'solicitacao') {
      const status = act.status?.toLowerCase() || '';
      if (status === 'entregue') return '/emprestimos?status=entregue';
      if (status === 'pendente') return '/emprestimos?status=pendente';
      return dashboardSourceLinks.loans;
    }
    return dashboardSourceLinks.assets;
  };

  const getCategorySourceLink = (category: string) =>
    `/assets?tab=table&category=${encodeURIComponent(category)}`;

  const getPrioritySourceLink = (priority: 'urgente' | 'alta' | 'media' | 'baixa') =>
    `/servicos?priority=${priority}`;

  const renderSourceFooter = (label: string) => (
    <div className="mt-3 pt-2 border-t border-brand-border/50 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-brand-muted group-hover:text-brand-primary transition-colors">
      <span>Atalho</span>
      <span className="inline-flex items-center space-x-1">
        <span>{label}</span>
        <ExternalLink size={11} />
      </span>
    </div>
  );

  const fetchStats = async () => {
    try {
      setLoading(true);
      const data = await dashboardApi.getStats();
      setStats(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchUserDashboardData = async () => {
    try {
      setExtraLoading(true);
      const [sols, maints, ticketsData] = await Promise.all([
        transactionApi.listSolicitacoes({ my: true }),
        maintenanceApi.listRequests({ my: true }),
        serviceDeskApi.listTickets({ my: true })
      ]);

      const active = sols.filter(s => s.solicitante_id === user?.id && s.status?.toLowerCase() === 'entregue');
      setMyActiveLoans(active);

      const myMaints = maints.filter(m => m.solicitante_id === user?.id);
      setMyMaintenanceRequests(myMaints);

      // Keep only active/open tickets (not status closed/fechado)
      const openTickets = ticketsData.filter(t => t.status?.toLowerCase() !== 'fechado');
      setMyTickets(openTickets);

      // Find tickets with status resolved
      const resolved = ticketsData.filter(t => t.status?.toLowerCase() === 'resolvido');
      setResolvedTickets(resolved);
    } catch (err) {
      console.error('Erro ao buscar dados do dashboard do colaborador:', err);
    } finally {
      setExtraLoading(false);
    }
  };

  const fetchActiveAvisos = async () => {
    try {
      const data = await alertsApi.listActiveAvisos();
      setActiveAvisos(data || []);
    } catch (err) {
      console.error('Erro ao carregar avisos ativos:', err);
    }
  };

  const fetchKanbanNotifications = async () => {
    try {
      const notifications = await kanbanApi.listNotifications();
      setKanbanNotifications(notifications.filter((notification) => notification.tipo === 'PROJETO_ADICIONADO' && !notification.lida));
    } catch (err) {
      console.error('Erro ao carregar notificações de projetos:', err);
    }
  };

  const openKanbanNotification = async (notification: KanbanNotification) => {
    try {
      await kanbanApi.markNotificationRead(notification.id);
      setKanbanNotifications((current) => current.filter((item) => item.id !== notification.id));
    } catch (err) {
      console.error('Erro ao marcar notificação de projeto:', err);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchStats(),
      fetchActiveAvisos(),
      fetchKanbanNotifications(),
      !isStaff ? fetchUserDashboardData() : Promise.resolve(),
    ]);
  };

  const handleConfirmReceipt = async (id: number) => {
    if (!window.confirm('Confirma que recebeu o equipamento consertado e que ele está funcionando corretamente?')) return;
    try {
      setExtraLoading(true);
      await maintenanceApi.confirmReceipt(id);
      await fetchUserDashboardData();
    } catch (err) {
      console.error('Erro ao confirmar recebimento:', err);
      alert('Não foi possível confirmar o recebimento. Tente novamente.');
      setExtraLoading(false);
    }
  };

  const handleConfirmEmergencyClose = async (ticketId: number) => {
    try {
      setSubmittingEmergency(true);
      await serviceDeskApi.updateTicket(ticketId, {
        avaliacao: dashboardRating,
        feedback_usuario: dashboardFeedbackComment,
        nota_feedback: dashboardRating,
        comentario_feedback: dashboardFeedbackComment,
        status: 'fechado' as any,
      });

      // Reset emergency states
      setDashboardRating(0);
      setDashboardFeedbackComment('');

      // Refresh user dashboard data
      await fetchUserDashboardData();
    } catch (err) {
      console.error('Erro ao encerrar chamado pelo alerta emergencial:', err);
      alert('Não foi possível encerrar o chamado. Tente novamente.');
    } finally {
      setSubmittingEmergency(false);
    }
  };

  const hasUnreadComments = (ticket: ServiceTicket) => {
    if (!ticket.interacoes || ticket.interacoes.length === 0) return false;
    const lastInteraction = ticket.interacoes[ticket.interacoes.length - 1];

    const author = lastInteraction.usuario || lastInteraction.user;
    if (author && author.id === user?.id) return false;

    const lastReadVal = localStorage.getItem(`ticket_read_${ticket.id}`);
    if (!lastReadVal) return true;

    return Number(lastReadVal) < lastInteraction.id;
  };

  const markTicketAsRead = (ticket: ServiceTicket) => {
    if (ticket.interacoes && ticket.interacoes.length > 0) {
      const lastInteraction = ticket.interacoes[ticket.interacoes.length - 1];
      localStorage.setItem(`ticket_read_${ticket.id}`, String(lastInteraction.id));
    }
  };

  const handleSelectTicket = async (ticket: ServiceTicket) => {
    try {
      const fullTicket = await serviceDeskApi.getTicketById(ticket.id);
      setSelectedDashboardTicket(fullTicket);
      markTicketAsRead(fullTicket);
    } catch (err) {
      console.error('Erro ao carregar detalhes do chamado:', err);
    }
  };

  const handleDashboardPaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items || !selectedDashboardTicket) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          try {
            setUploadingAttachment(true);
            const res = await serviceDeskApi.uploadAttachment(selectedDashboardTicket.id, file);
            const finalMsg = `Enviou uma imagem colada: ${file.name}`;
            await serviceDeskApi.createInteraction(selectedDashboardTicket.id, finalMsg, res.url);

            const freshTicket = await serviceDeskApi.getTicketById(selectedDashboardTicket.id);
            setSelectedDashboardTicket(freshTicket);
            setMyTickets(prev => prev.map(t => t.id === freshTicket.id ? freshTicket : t));
          } catch (err) {
            alert('Erro ao colar/enviar anexo.');
          } finally {
            setUploadingAttachment(false);
          }
          break;
        }
      }
    }
  };

  const handleDashboardFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && selectedDashboardTicket) {
      const file = e.target.files[0];
      try {
        setUploadingAttachment(true);
        const res = await serviceDeskApi.uploadAttachment(selectedDashboardTicket.id, file);
        const finalMsg = `Enviou um anexo: ${file.name}`;
        await serviceDeskApi.createInteraction(selectedDashboardTicket.id, finalMsg, res.url);

        const freshTicket = await serviceDeskApi.getTicketById(selectedDashboardTicket.id);
        setSelectedDashboardTicket(freshTicket);
        setMyTickets(prev => prev.map(t => t.id === freshTicket.id ? freshTicket : t));
      } catch (err) {
        alert('Erro ao fazer upload do anexo.');
      } finally {
        setUploadingAttachment(false);
      }
    }
  };

  const handleSendDashboardComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDashboardTicket || !commentMessage.trim()) return;

    try {
      await serviceDeskApi.createInteraction(selectedDashboardTicket.id, commentMessage);
      setCommentMessage('');

      const freshTicket = await serviceDeskApi.getTicketById(selectedDashboardTicket.id);
      setSelectedDashboardTicket(freshTicket);
      setMyTickets(prev => prev.map(t => t.id === freshTicket.id ? freshTicket : t));
    } catch (err) {
      alert('Erro ao enviar mensagem.');
    }
  };

  const exportPDF = () => {
    if (!stats) return;
    setExporting(true);

    try {
      const doc = new jsPDF();

      // Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text('AssetTrack TI - Relatório Executivo do Sistema', 14, 20);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`Gerado por: ${user?.nome || 'Administrador'} em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);

      // KPIs Principais
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('1. Indicadores Principais de Inventário & Operação (KPIs)', 14, 40);

      const totalAssetsCalc = stats.total_assets || (
        (stats.total_assets_disponivel || 0) +
        (stats.total_assets_em_uso || 0) +
        (stats.total_assets_maintenance || 0) +
        (stats.total_assets_armazenado || 0) +
        (stats.total_assets_baixado || 0)
      );

      autoTable(doc, {
        startY: 45,
        theme: 'grid',
        headStyles: { fillColor: [12, 102, 228] }, // brand primary
        head: [['Métrica / Indicador', 'Valor Registrado', 'Detalhes']],
        body: [
          ['Total de Ativos Cadastrados', String(totalAssetsCalc), '100% da base inventariada'],
          ['Valor Total Patrimonial', `R$ ${(stats.total_assets_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Valor venal / aquisição'],
          ['Ativos Disponíveis', String(stats.total_assets_disponivel || 0), `${totalAssetsCalc > 0 ? ((stats.total_assets_disponivel / totalAssetsCalc) * 100).toFixed(1) : 0}% do inventário`],
          ['Ativos Em Uso', String(stats.total_assets_em_uso || 0), `${totalAssetsCalc > 0 ? ((stats.total_assets_em_uso / totalAssetsCalc) * 100).toFixed(1) : 0}% em posse de colaboradores`],
          ['Ativos em Manutenção', String(stats.total_assets_maintenance || 0), 'Na oficina / laboratório técnico'],
          ['Ativos Armazenados', String(stats.total_assets_armazenado || 0), 'Estoque reserva / almoxarifado'],
          ['Ativos Baixados', String(stats.total_assets_baixado || 0), 'Descartados / Fim de vida útil'],
          ['Service Desk (Chamados)', `${stats.tickets_open || 0} Abertos / ${stats.tickets_resolved || 0} Resolvidos / ${stats.tickets_closed || 0} Fechados`, `Satisfação: ${(stats.tickets_avg_rating || 0).toFixed(1)} / 5.0 estrelas`],
          ['Solicitações de Ativos Pendentes', String(stats.pending_asset_requests || 0), 'Aguardando aprovação ou entrega'],
          ['Solicitações de Manutenção Pendentes', String(stats.pending_maintenance_requests || 0), 'Aguardando triagem técnica'],
          ['Custo Mensal (Compras)', `R$ ${(stats.supplier_cost_monthly || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Ordens de compra emitidas no mês'],
        ]
      });

      // Categories Breakdown
      let currentY = (doc as any).lastAutoTable.finalY + 12;
      if (stats.assets_by_category && stats.assets_by_category.length > 0) {
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('2. Distribuição de Ativos por Categoria', 14, currentY);

        autoTable(doc, {
          startY: currentY + 5,
          theme: 'striped',
          headStyles: { fillColor: [56, 189, 248] },
          head: [['Categoria', 'Quantidade', 'Participação (%)']],
          body: stats.assets_by_category.map(c => [
            c.category,
            String(c.count),
            `${totalAssetsCalc > 0 ? ((c.count / totalAssetsCalc) * 100).toFixed(1) : 0}%`
          ])
        });
        currentY = (doc as any).lastAutoTable.finalY + 12;
      }

      // Alerts Section
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('3. Alertas e Notificações Ativas', 14, currentY);

      if (stats.active_alerts && stats.active_alerts.length > 0) {
        autoTable(doc, {
          startY: currentY + 5,
          theme: 'striped',
          headStyles: { fillColor: [239, 68, 68] },
          head: [['Gravidade', 'Descrição do Alerta', 'Data de Registro']],
          body: stats.active_alerts.map(a => [
            a.severity,
            a.title,
            new Date(a.created_at).toLocaleString('pt-BR')
          ])
        });
      } else {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text('Nenhum alerta crítico pendente no momento.', 14, currentY + 8);
      }

      // Footer
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount} - AssetTrack TI · Relatório de Gestão`, 14, doc.internal.pageSize.height - 10);
      }

      doc.save(`relatorio_executivo_${new Date().getTime()}.pdf`);
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar PDF');
    } finally {
      setExporting(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // 1. Primary data load effect
  useEffect(() => {
    fetchStats();
    fetchActiveAvisos();
    fetchKanbanNotifications();
    if (!isStaff) {
      fetchUserDashboardData();
    }
  }, [isStaff]);

  useEffect(() => {
    const interval = setInterval(fetchKanbanNotifications, 15000);
    return () => clearInterval(interval);
  }, []);

  // Real-time polling for active avisos (for all users)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchActiveAvisos();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // 2. Real-time synchronization (polling) for tickets on collaborator dashboard
  useEffect(() => {
    if (isStaff) return;

    const interval = setInterval(async () => {
      try {
        const ticketsData = await serviceDeskApi.listTickets();
        setMyTickets(ticketsData.filter(t => t.status?.toLowerCase() !== 'fechado'));
        setResolvedTickets(ticketsData.filter(t => t.status?.toLowerCase() === 'resolvido'));
      } catch (err) {
        console.error('Erro ao recarregar chamados em tempo real:', err);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [isStaff]);

  // 3. Real-time synchronization (polling) for the active selected ticket's details/comments
  useEffect(() => {
    if (!selectedDashboardTicket) return;

    const interval = setInterval(async () => {
      try {
        const freshTicket = await serviceDeskApi.getTicketById(selectedDashboardTicket.id);
        setSelectedDashboardTicket(freshTicket);
        setMyTickets(prev => prev.map(t => t.id === freshTicket.id ? freshTicket : t));
      } catch (err) {
        console.error('Erro ao atualizar chamado no modal:', err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedDashboardTicket?.id]);

  // Early returns (only after all React hooks have been declared)
  if (loading) return <div className="text-brand-muted font-mono text-sm p-8 text-center animate-pulse">Carregando painel analítico e indicadores...</div>;
  if (!stats) return <div className="text-red-500 font-bold p-8 text-center">Erro ao carregar dados do painel analítico.</div>;

  const totalAssetsCount = stats.total_assets || (
    (stats.total_assets_disponivel || 0) +
    (stats.total_assets_em_uso || 0) +
    (stats.total_assets_maintenance || 0) +
    (stats.total_assets_armazenado || 0) +
    (stats.total_assets_baixado || 0)
  );

  const totalTicketsCount = (stats.tickets_open || 0) + (stats.tickets_resolved || 0) + (stats.tickets_closed || 0);
  const maintenanceRequestsOpenCount = myMaintenanceRequests.filter((req) => {
    const status = req.status?.toLowerCase() || '';
    return ['pendente', 'aceita', 'em_andamento', 'aguardando_entrega'].includes(status);
  }).length;
  const maintenanceRequestsClosedCount = myMaintenanceRequests.filter((req) => {
    const status = req.status?.toLowerCase() || '';
    return ['concluida', 'entregue', 'rejeitada'].includes(status);
  }).length;
  const maintenanceRequestsTotalCount = myMaintenanceRequests.length;
  const formatPercent = (value: number, total: number) => `${total > 0 ? ((value / total) * 100).toFixed(0) : 0}%`;

  // Tickets Doughnut Chart Data
  const ticketsChartData = {
    labels: ['Abertos', 'Resolvidos', 'Fechados'],
    datasets: [
      {
        data: [
          stats?.tickets_open || 0,
          stats?.tickets_resolved || 0,
          stats?.tickets_closed || 0
        ],
        backgroundColor: [
          '#ef4444', // red-500 (Abertos)
          '#f59e0b', // amber-500 (Resolvidos)
          '#10b981', // emerald-500 (Fechados)
        ],
        hoverBackgroundColor: [
          '#dc2626',
          '#d97706',
          '#059669',
        ],
        borderColor: '#ffffff',
        borderWidth: 2,
      },
    ],
  };

  // Assets Status Bar Chart Data
  const assetsStatusBarData = {
    labels: ['Disponível', 'Em Uso', 'Manutenção', 'Armazenado', 'Baixado'],
    datasets: [
      {
        label: 'Quantidade',
        data: [
          stats?.total_assets_disponivel || 0,
          stats?.total_assets_em_uso || 0,
          stats?.total_assets_maintenance || 0,
          stats?.total_assets_armazenado || 0,
          stats?.total_assets_baixado || 0
        ],
        backgroundColor: [
          'rgba(16, 185, 129, 0.85)', // emerald
          'rgba(12, 102, 228, 0.85)',  // brand primary blue
          'rgba(245, 158, 11, 0.85)',  // amber
          'rgba(100, 116, 139, 0.85)', // slate
          'rgba(239, 68, 68, 0.85)'    // red
        ],
        hoverBackgroundColor: [
          '#10b981',
          '#0c66e4',
          '#f59e0b',
          '#64748b',
          '#ef4444'
        ],
        borderRadius: 8,
        borderSkipped: false,
      },
    ],
  };




  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-brand-border pb-4">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-wider font-mono text-brand-text m-0 flex items-center">
            <LayoutDashboard className="mr-3 text-brand-primary" size={28} />
            {isStaff ? 'Painel Executivo' : `Portal do Colaborador (${user?.nome})`}
          </h1>
          <p className="text-brand-muted text-sm mt-1">
            {isStaff
              ? 'Visão geral do ecossistema de TI, métricas e análises'
              : 'Gerencie seus chamados de TI, solicitações de equipamentos e crachá digital'}
          </p>
        </div>
        <div className="flex items-center flex-wrap gap-2.5">
          <button
            type="button"
            onClick={triggerEmergencyAlertModal}
            className="sm:hidden rounded-[10px] bg-red-600/90 hover:bg-red-600 text-white font-bold font-mono px-3.5 py-2 uppercase tracking-wider text-xs flex items-center shadow-lg shadow-red-600/30 transition-all active:scale-95 animate-pulse"
            title="Disparar Alerta Emergencial (Pânico TI)"
          >
            <ShieldAlert size={16} className="mr-1.5" />
            <span>Alerta Emergencial</span>
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="rounded-[10px] bg-brand-card border border-brand-border text-brand-text font-bold font-mono px-3.5 py-2 uppercase tracking-wider text-xs flex items-center hover:bg-brand-dark/40 transition-colors shadow-sm disabled:opacity-50"
            title="Atualizar dados do dashboard"
          >
            <RefreshCw size={15} className={`mr-1.5 text-brand-primary ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Atualizando...' : 'Atualizar'}
          </button>
          {isStaff && (
            <button
              onClick={exportPDF}
              disabled={exporting}
              className="rounded-[10px] bg-brand-primary text-white font-bold font-mono px-4 py-2 uppercase tracking-wider text-sm flex items-center hover:bg-brand-primary/90 transition-colors shadow-lg shadow-brand-primary/20 disabled:opacity-50"
            >
              <FileDown size={18} className="mr-2" />
              {exporting ? 'Gerando...' : 'Exportar Relatório PDF'}
            </button>
          )}
        </div>
      </div>

      {/* System Announcements & Avisos (Visible to ALL users on Desktop & Mobile) */}
      {activeAvisos.length > 0 ? (
        <div className="bg-brand-card border border-brand-primary/40 p-4 md:p-5 rounded-sm shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-brand-border/60 pb-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-brand-primary/20 text-brand-primary rounded">
                <BellRing size={20} className="animate-bounce" />
              </div>
              <div>
                <h3 className="text-base font-bold font-mono uppercase tracking-wider text-brand-text m-0">
                  Comunicados & Avisos Oficiais ({activeAvisos.length})
                </h3>
                <p className="text-xs text-brand-muted mt-0.5">Informações e comunicados importantes transmitidos pela equipe de TI</p>
              </div>
            </div>
            {isStaff && (
              <Link
                to="/alertas"
                className="px-3 py-1.5 bg-brand-primary/10 border border-brand-primary/30 text-brand-primary hover:bg-brand-primary hover:text-brand-dark transition-all text-xs font-semibold rounded font-mono uppercase"
              >
                Gerenciar Avisos
              </Link>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeAvisos.map((aviso) => (
              <div
                key={aviso.id}
                onClick={() => setSelectedAviso(aviso)}
                className="bg-brand-dark/60 border border-brand-border hover:border-brand-primary/60 transition-all p-4 rounded-sm flex flex-col justify-between space-y-3 cursor-pointer group shadow-sm hover:shadow-lg relative overflow-hidden"
              >
                {/* Visual hint on hover */}
                <div className="absolute top-0 right-0 left-0 h-0.5 bg-brand-primary opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-brand-text text-sm sm:text-base leading-snug group-hover:text-brand-primary transition-colors flex items-center gap-1.5">
                      <span>{aviso.titulo}</span>
                    </h4>
                    <div className="flex items-center space-x-1.5 shrink-0">
                      <span className="text-[10px] font-mono text-brand-muted bg-brand-card px-2 py-0.5 border border-brand-border">
                        {new Date(aviso.data_cadastro).toLocaleDateString('pt-BR')}
                      </span>
                      <span className="text-brand-primary opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-brand-primary/10 rounded" title="Ampliar comunicado">
                        <Maximize2 size={13} />
                      </span>
                    </div>
                  </div>

                  {aviso.texto && (
                    <p className="text-xs sm:text-sm text-brand-muted line-clamp-3 leading-relaxed">
                      {aviso.texto}
                    </p>
                  )}

                  {/* Media Thumbnail / Preview */}
                  {aviso.midia_url && (
                    <div className="pt-2 rounded overflow-hidden relative">
                      {aviso.midia_tipo === 'video' || aviso.midia_url.includes('youtube') || aviso.midia_url.includes('youtu.be') ? (
                        <div className="relative rounded overflow-hidden border border-brand-border aspect-video bg-black flex items-center justify-center">
                          {aviso.midia_url.includes('youtube.com/watch?v=') || aviso.midia_url.includes('youtu.be/') ? (
                            <iframe
                              src={aviso.midia_url.includes('youtu.be/')
                                ? `https://www.youtube.com/embed/${aviso.midia_url.split('youtu.be/')[1]?.split('?')[0]}`
                                : `https://www.youtube.com/embed/${new URLSearchParams(aviso.midia_url.split('?')[1]).get('v')}`}
                              className="w-full h-full pointer-events-none"
                              title={aviso.titulo}
                            />
                          ) : (
                            <video
                              src={toApiFileUrl(aviso.midia_url)}
                              className="w-full h-full object-cover pointer-events-none"
                            />
                          )}
                          <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 flex items-center justify-center transition-all">
                            <div className="p-2.5 bg-brand-primary/90 text-brand-dark rounded-full shadow-lg group-hover:scale-110 transition-transform flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold font-mono">
                              <Eye size={14} />
                              <span>Assistir / Ver Detalhes</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="relative rounded overflow-hidden border border-brand-border max-h-52 bg-black">
                          <img
                            src={toApiFileUrl(aviso.midia_url)}
                            alt={aviso.titulo}
                            className="w-full max-h-52 object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2.5">
                            <span className="text-[11px] font-mono text-white flex items-center space-x-1">
                              <Maximize2 size={12} className="text-brand-primary" />
                              <span>Clique para ampliar imagem</span>
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-brand-border/40 flex items-center justify-between text-xs">
                  <span className="text-brand-primary font-mono text-[11px] flex items-center space-x-1 group-hover:underline">
                    <Eye size={12} />
                    <span>Ver comunicado completo</span>
                  </span>
                  {aviso.link_url && (
                    <a
                      href={aviso.link_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center space-x-1.5 px-3 py-1 bg-brand-primary/10 border border-brand-primary/30 text-brand-primary text-xs rounded hover:bg-brand-primary hover:text-brand-dark transition-all"
                    >
                      <span>{aviso.link_texto || 'Acessar Link'}</span>
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : isStaff ? (
        <div className="bg-brand-card border border-brand-border p-4 rounded-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-brand-primary/10 text-brand-primary rounded">
              <BellRing size={20} />
            </div>
            <div>
              <h4 className="text-xs font-bold font-mono uppercase text-brand-text">Avisos do Sistema & Comunicados</h4>
              <p className="text-xs text-brand-muted">Publique avisos com imagens, vídeos e links que aparecem aqui na Dashboard para todos os usuários.</p>
            </div>
          </div>
          <Link
            to="/alertas"
            className="px-3.5 py-2 bg-brand-primary text-brand-dark font-bold text-xs rounded hover:bg-brand-primary/90 transition-all font-mono uppercase shrink-0"
          >
            + Criar Novo Comunicado
          </Link>
        </div>
      ) : null}

      {kanbanNotifications.length > 0 && (
        <div className="border border-sky-300/60 bg-sky-50 p-4 md:p-5 rounded-sm shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-sky-100 text-sky-700">
              <Columns3 size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-sky-900">Você foi incluído em um projeto</h3>
              <p className="text-xs text-sky-800/80">Acesse o Kanban para colaborar com sua equipe.</p>
            </div>
          </div>
          <div className="space-y-2">
            {kanbanNotifications.map((notification) => (
              <Link
                key={notification.id}
                to={notification.link || '/kanban'}
                onClick={() => openKanbanNotification(notification)}
                className="flex items-center justify-between gap-3 rounded border border-sky-200 bg-white px-3 py-2.5 text-sm text-sky-950 hover:border-sky-400 hover:bg-sky-50 transition-colors"
              >
                <span>{notification.mensagem}</span>
                <span className="shrink-0 text-xs font-bold uppercase text-sky-700">Abrir Kanban</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Alert Banner for Pending Asset Requests (Staff/Managers) */}
      {isStaff && stats.pending_asset_requests > 0 && (
        <div className="bg-amber-500/10 border-l-4 border-amber-500 p-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wider font-mono">
                Atenção: {stats.pending_asset_requests} {stats.pending_asset_requests === 1 ? 'Solicitação de Ativo Pendente' : 'Solicitações de Ativos Pendentes'}
              </h3>
              <p className="text-xs text-brand-muted mt-0.5">
                Existem solicitações de empréstimo de equipamentos aguardando aprovação ou confirmação de entrega.
              </p>
            </div>
          </div>
          <Link
            to="/emprestimos"
            className="px-4 py-2 bg-amber-500 text-brand-dark font-bold text-xs uppercase tracking-wider font-mono hover:bg-amber-400 transition-all shrink-0"
          >
            Analisar Solicitações
          </Link>
        </div>
      )}

      {/* Alert Banner for Pending Maintenance Requests (Staff/Managers) */}
      {isStaff && stats.pending_maintenance_requests > 0 && (
        <div className="bg-red-500/10 border-l-4 border-red-500 p-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-red-500/20 text-red-400 rounded">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-red-300 uppercase tracking-wider font-mono">
                Atenção: {stats.pending_maintenance_requests} {stats.pending_maintenance_requests === 1 ? 'Solicitação de Manutenção Pendente' : 'Solicitações de Manutenção Pendentes'}
              </h3>
              <p className="text-xs text-brand-muted mt-0.5">
                Existem solicitações de manutenção aguardando atendimento ou resposta técnica.
              </p>
            </div>
          </div>
          <Link
            to="/manutencoes"
            className="px-4 py-2 bg-red-500 text-brand-dark font-bold text-xs uppercase tracking-wider font-mono hover:bg-red-400 transition-all shrink-0"
          >
            Analisar Manutenções
          </Link>
        </div>
      )}

      {!isStaff ? (
        /* Portal do Colaborador Layout */
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <Link
              to="/servicos"
              className="p-5 bg-brand-card border border-brand-border hover:border-brand-primary/50 transition-all group flex flex-col justify-between space-y-4 rounded-xl"
            >
              <div className="flex items-center justify-between">
                <div className="p-3 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg">
                  <MessageSquare size={26} />
                </div>
                <span className="text-xs font-mono text-brand-muted group-hover:text-brand-primary transition-colors">Acessar →</span>
              </div>
              <div>
                <h3 className="font-bold text-brand-text text-base group-hover:text-brand-primary transition-colors">Central de Suporte</h3>
                <p className="text-xs text-brand-muted mt-1">Abra chamados para suporte técnico, incidentes ou dúvidas com a equipe de TI.</p>
              </div>
            </Link>

            <Link
              to="/emprestimos"
              className="p-5 bg-brand-card border border-brand-border hover:border-brand-primary/50 transition-all group flex flex-col justify-between space-y-4 rounded-xl"
            >
              <div className="flex items-center justify-between">
                <div className="p-3 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-lg">
                  <ArrowLeftRight size={26} />
                </div>
                <span className="text-xs font-mono text-brand-muted group-hover:text-brand-primary transition-colors">Acessar →</span>
              </div>
              <div>
                <h3 className="font-bold text-brand-text text-base group-hover:text-brand-primary transition-colors">Solicitar Equipamento</h3>
                <p className="text-xs text-brand-muted mt-1">Solicite empréstimos temporários de notebooks, periféricos ou dispositivos.</p>
              </div>
            </Link>

            <Link
              to="/badge"
              className="p-5 bg-brand-card border border-brand-border hover:border-brand-primary/50 transition-all group flex flex-col justify-between space-y-4 rounded-xl"
            >
              <div className="flex items-center justify-between">
                <div className="p-3 bg-brand-primary/10 text-brand-primary border border-brand-primary/20 rounded-lg">
                  <QrCode size={26} />
                </div>
                <span className="text-xs font-mono text-brand-muted group-hover:text-brand-primary transition-colors">Acessar →</span>
              </div>
              <div>
                <h3 className="font-bold text-brand-text text-base group-hover:text-brand-primary transition-colors">Meu Crachá QR</h3>
                <p className="text-xs text-brand-muted mt-1">Visualize seu token QR pessoal para identificação e retirada de ativos.</p>
              </div>
            </Link>

            <Link
              to="/servicos"
              className="p-5 bg-brand-card border border-brand-border hover:border-brand-primary/50 transition-all group flex flex-col justify-between space-y-4 rounded-xl"
            >
              <div className="flex items-center justify-between">
                <div className="p-3 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg">
                  <MessageSquare size={26} />
                </div>
                <span className="text-xs font-mono text-brand-muted group-hover:text-brand-primary transition-colors">Acessar →</span>
              </div>
              <div>
                <h3 className="font-bold text-brand-text text-base group-hover:text-brand-primary transition-colors">Tickets de Suporte</h3>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[10px] font-mono">
                  <div className="bg-brand-dark/40 border border-brand-border/50 p-2">
                    <div className="text-red-500 font-bold text-sm">{stats.tickets_open}</div>
                    <div className="text-brand-muted uppercase">Abertos</div>
                  </div>
                  <div className="bg-brand-dark/40 border border-brand-border/50 p-2">
                    <div className="text-amber-500 font-bold text-sm">{stats.tickets_resolved}</div>
                    <div className="text-brand-muted uppercase">Resolvidos</div>
                  </div>
                  <div className="bg-brand-dark/40 border border-brand-border/50 p-2">
                    <div className="text-emerald-500 font-bold text-sm">{stats.tickets_closed}</div>
                    <div className="text-brand-muted uppercase">Fechados</div>
                  </div>
                </div>
              </div>
            </Link>
          </div>

          {/* Real-time Support reply notification banner */}
          {myTickets.some(hasUnreadComments) && (
            <div className="bg-brand-primary/10 border-l-4 border-brand-primary p-4 mb-6 flex items-center justify-between animate-pulse">
              <div className="flex items-center space-x-3">
                <MessageSquare className="text-brand-primary shrink-0" size={20} />
                <div>
                  <h4 className="text-xs font-bold text-brand-primary uppercase tracking-wider font-mono">
                    Nova resposta do suporte técnico!
                  </h4>
                  <p className="text-[14px] text-black mt-1">
                    Você possui novas mensagens não lidas nos seus chamados ativos. Clique no chamado abaixo para visualizar e responder.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Active Loans & Maintenance Tracking & Support Tickets */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Active Assets Block */}
            <div className="bg-brand-card border border-brand-border p-6 space-y-4">
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-brand-muted flex items-center space-x-2">
                <Laptop size={18} className="text-brand-primary" />
                <span>Meus Equipamentos em Posse</span>
              </h3>

              {extraLoading ? (
                <div className="text-xs text-brand-muted font-mono">Carregando seus ativos...</div>
              ) : myActiveLoans.length === 0 ? (
                <div className="text-xs text-brand-muted bg-brand-dark/20 p-4 border border-brand-border/40 text-center">
                  Você não possui nenhum equipamento emprestado no momento.
                </div>
              ) : (
                <div className="space-y-3">
                  {myActiveLoans.map(loan => {
                    const hasActiveMaint = myMaintenanceRequests.some(
                      req => req.asset_id === loan.asset_id &&
                        !['concluida', 'rejeitada'].includes(req.status?.toLowerCase() || '')
                    );

                    return (
                      <div key={loan.id} className="p-4 bg-brand-dark/40 border border-brand-border/60 flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold text-brand-text text-sm">{loan.asset?.nome || 'Equipamento'}</h4>
                          <p className="text-[11px] text-brand-muted font-mono mt-0.5">
                            EP: {loan.asset?.e_patrimonio} {loan.asset?.modelo ? ` · ${loan.asset.modelo}` : ''}
                          </p>
                          <p className="text-[10px] text-brand-muted font-mono mt-1 flex items-center space-x-1">
                            <Calendar size={10} />
                            <span>Entregue em: {loan.data_entrega ? new Date(loan.data_entrega).toLocaleDateString('pt-BR') : '-'}</span>
                          </p>
                        </div>
                        {!hasActiveMaint ? (
                          <Link
                            to="/emprestimos"
                            className="px-3 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-black/80 border border-amber-500/30 font-medium text-[11px] uppercase tracking-wide font-mono flex items-center space-x-1 transition-colors"
                          >
                            <Wrench size={11} />
                            <span>Solicitar Manutenção</span>
                          </Link>
                        ) : (
                          <div className="px-3 py-1 border border-amber-500/30 text-amber-500 font-bold text-xs uppercase tracking-wider font-mono flex items-center space-x-1 opacity-60">
                            <Wrench size={12} />
                            <span>Em Andamento</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Maintenance Requests Block */}
            <div className="bg-brand-card border border-brand-border p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-brand-muted flex items-center space-x-2">
                  <Wrench size={18} className="text-amber-500" />
                  <span>Solicitações de Manutenção</span>
                </h3>
                <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-mono">
                  <div className="bg-brand-dark/40 border border-blue-500/15 px-2 py-1">
                    <div className="text-blue-500 font-bold">{maintenanceRequestsOpenCount}</div>
                    <div className="text-brand-muted uppercase">{formatPercent(maintenanceRequestsOpenCount, maintenanceRequestsTotalCount)}</div>
                  </div>
                  <div className="bg-brand-dark/40 border border-emerald-500/15 px-2 py-1">
                    <div className="text-emerald-500 font-bold">{maintenanceRequestsClosedCount}</div>
                    <div className="text-brand-muted uppercase">{formatPercent(maintenanceRequestsClosedCount, maintenanceRequestsTotalCount)}</div>
                  </div>
                  <div className="bg-brand-dark/40 border border-brand-border px-2 py-1">
                    <div className="text-brand-text font-bold">{maintenanceRequestsTotalCount}</div>
                    <div className="text-brand-muted uppercase">total</div>
                  </div>
                </div>
              </div>

              {extraLoading ? (
                <div className="text-xs text-brand-muted font-mono">Carregando solicitações...</div>
              ) : myMaintenanceRequests.length === 0 ? (
                <div className="text-xs text-brand-muted bg-brand-dark/20 p-4 border border-brand-border/40 text-center">
                  Nenhuma solicitação de manutenção registrada.
                </div>
              ) : (
                <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                  {myMaintenanceRequests.map(req => {
                    const statusLower = req.status?.toLowerCase() || '';
                    let statusColor = '';
                    let statusLabel: string;

                    if (statusLower === 'pendente') {
                      statusColor = 'text-blue-400 bg-blue-400/10 border-blue-400/20';
                      statusLabel = 'Pendente';
                    } else if (statusLower === 'aceita' || statusLower === 'em_andamento') {
                      statusColor = 'text-amber-400 bg-amber-400/10 border-amber-400/20';
                      statusLabel = 'Em Manutenção';
                    } else if (statusLower === 'aguardando_entrega' || statusLower === 'concluida') {
                      statusColor = 'text-brand-primary bg-brand-primary/10 border-brand-primary/20';
                      statusLabel = statusLower === 'concluida' ? 'Concluída' : 'Pronto p/ Retirada';
                    } else if (statusLower === 'rejeitada') {
                      statusColor = 'text-red-400 bg-red-400/10 border-red-400/20';
                      statusLabel = 'Rejeitada';
                    } else {
                      statusLabel = req.status || '';
                    }

                    return (
                      <div key={req.id} className="p-4 bg-brand-dark/40 border border-brand-border/60 flex flex-col justify-between space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-semibold text-brand-text text-xs">{req.asset?.nome || 'Equipamento'}</h4>
                            <p className="text-[10px] text-brand-muted font-mono mt-0.5">EP: {req.asset?.e_patrimonio}</p>
                          </div>
                          <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 border ${statusColor}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="text-[11px] text-brand-muted bg-brand-dark/60 p-2 border border-brand-border/30 rounded font-mono truncate">
                          Defeito: "{req.descricao}"
                        </div>
                        <div className="flex justify-between items-center mt-2">
                          {req.data_resposta ? (
                            <div className="text-[9px] text-brand-muted font-mono flex items-center space-x-1">
                              <Clock size={10} />
                              <span>Respondido em: {new Date(req.data_resposta).toLocaleDateString('pt-BR')}</span>
                            </div>
                          ) : (
                            <div />
                          )}

                          {statusLower === 'aguardando_entrega' && (
                            <button
                              onClick={() => handleConfirmReceipt(req.id)}
                              className="px-2 py-1 bg-brand-primary text-brand-dark font-bold text-[9px] uppercase tracking-wider font-mono hover:bg-brand-primary/90 transition-all ml-2 shrink-0 shadow shadow-brand-primary/20"
                            >
                              Confirmar Recebimento
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Active Tickets Block */}
            <div className={`bg-brand-card border p-6 space-y-4 transition-all duration-300 ${myTickets.some(hasUnreadComments) ? 'border-brand-primary/40 shadow-[0_0_15px_rgba(245,158,11,0.05)]' : 'border-brand-border'
              }`}>
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-brand-muted flex items-center justify-between w-full">
                <div className="flex items-center space-x-2">
                  <MessageSquare size={18} className="text-brand-primary" />
                  <span>Chamados de Suporte Ativos</span>
                </div>
                {myTickets.filter(hasUnreadComments).length > 0 && (
                  <span className="text-[9px] bg-brand-primary text-brand-dark font-black px-2 py-0.5 animate-bounce">
                    {myTickets.filter(hasUnreadComments).length} NOVO(S)
                  </span>
                )}
              </h3>

              {extraLoading ? (
                <div className="text-xs text-brand-muted font-mono">Carregando chamados...</div>
              ) : myTickets.length === 0 ? (
                <div className="text-xs text-brand-muted bg-brand-dark/20 p-4 border border-brand-border/40 text-center">
                  Nenhum chamado de suporte ativo.
                </div>
              ) : (
                <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                  {myTickets.map(ticket => {
                    const hasUnread = hasUnreadComments(ticket);
                    const statusLower = ticket.status?.toLowerCase() || '';
                    let statusColor = 'text-brand-muted bg-brand-dark border-brand-border';
                    if (statusLower === 'aberto') {
                      statusColor = 'text-blue-400 bg-blue-400/10 border-blue-400/20';
                    } else if (statusLower === 'em_atendimento') {
                      statusColor = 'text-amber-400 bg-amber-400/10 border-amber-400/20';
                    } else if (statusLower === 'resolvido') {
                      statusColor = 'text-brand-primary bg-brand-primary/10 border-brand-primary/20';
                    }

                    return (
                      <div
                        key={ticket.id}
                        onClick={() => handleSelectTicket(ticket)}
                        className={`p-4 bg-brand-dark/40 border transition-all duration-150 cursor-pointer flex flex-col justify-between space-y-2 hover:border-brand-primary/45 relative ${hasUnread ? 'border-brand-primary bg-brand-primary/5' : 'border-brand-border/60'
                          }`}
                      >
                        {hasUnread && (
                          <div className="absolute top-2 right-2 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-primary"></span>
                          </div>
                        )}
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <span className="text-[9px] font-mono font-bold text-brand-primary px-1 py-0.2 bg-brand-primary/10 border border-brand-primary/20 shrink-0">
                                {ticket.codigo}
                              </span>
                              <h4 className="font-semibold text-brand-text text-xs line-clamp-1">{summarizeServiceTicket(ticket.descricao)}</h4>
                            </div>
                            <p className="text-[10px] text-brand-muted font-mono mt-1 flex items-center space-x-1">
                              <Clock size={10} />
                              <span>Atualizado: {new Date(ticket.data_abertura).toLocaleDateString('pt-BR')}</span>
                            </p>
                          </div>
                          <span className={`text-[8px] uppercase font-bold px-1.5 py-0.5 border ${statusColor} shrink-0`}>
                            {ticket.status.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="text-[11px] text-brand-muted bg-brand-dark/60 p-2 border border-brand-border/30 rounded font-mono truncate">
                          "{ticket.descricao}"
                        </div>
                        <div className="flex justify-between items-center pt-1">
                          {hasUnread ? (
                            <span className="text-[9px] font-bold text-brand-primary animate-pulse flex items-center space-x-1">
                              <span>💬</span>
                              <span>Novas respostas!</span>
                            </span>
                          ) : (
                            <div />
                          )}
                          <button
                            type="button"
                            className="text-[9px] font-bold text-brand-primary hover:underline flex items-center space-x-0.5 ml-auto"
                          >
                            <span>Responder</span>
                            <span>→</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          <div className="p-6 bg-brand-card border border-brand-border flex items-center space-x-4">
            <div className="p-3 bg-brand-primary/10 text-brand-primary border border-brand-primary/20 shrink-0">
              <UserCheck size={24} />
            </div>
            <div>
              <h4 className="font-semibold text-brand-text text-sm">Status do Seu Perfil ({user?.role.replace('_', ' ')})</h4>
              <p className="text-sm text-brand-muted mt-0.5">Você está com perfil de colaborador ativo. Para alteração de permissões ou acesso administrativo, entre em contato com a equipe de TI.</p>
            </div>
          </div>
        </div>

      ) : (
        /* Executive Dashboard Layout (Staff/Admin) */
        <div className="space-y-6">

          {/* Quick Action Bar for Management/Technicians */}
          <div className="bg-brand-card border border-brand-border p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2 text-xs font-mono font-bold text-brand-muted uppercase tracking-wider">
              <Zap size={16} className="text-brand-primary" />
              <span>Ações Rápidas do Gestor:</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/assets"
                className="px-3 py-1.5 bg-brand-primary/10 hover:bg-brand-primary hover:text-white border border-brand-primary/20 text-brand-primary text-xs font-mono font-bold transition-all flex items-center space-x-1.5"
              >
                <Package size={14} />
                <span>Cadastrar Ativo</span>
              </Link>
              <Link
                to="/servicos"
                className="px-3 py-1.5 bg-brand-primary/10 hover:bg-brand-primary hover:text-white border border-brand-primary/20 text-brand-primary text-xs font-mono font-bold transition-all flex items-center space-x-1.5"
              >
                <PlusCircle size={14} />
                <span>Novo Chamado</span>
              </Link>
              <Link
                to="/emprestimos"
                className="px-3 py-1.5 bg-brand-primary/10 hover:bg-brand-primary hover:text-white border border-brand-primary/20 text-brand-primary text-xs font-mono font-bold transition-all flex items-center space-x-1.5"
              >
                <ArrowLeftRight size={14} />
                <span>Empréstimos ({stats.pending_asset_requests})</span>
              </Link>
              <Link
                to="/manutencoes"
                className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500 hover:text-white border border-amber-500/30 text-amber-600 text-xs font-mono font-bold transition-all flex items-center space-x-1.5"
              >
                <Wrench size={14} />
                <span>Oficina & Manutenção ({stats.total_assets_maintenance})</span>
              </Link>
              <Link
                to="/fornecedores"
                className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-600 hover:text-white border border-emerald-500/30 text-emerald-600 text-xs font-mono font-bold transition-all flex items-center space-x-1.5"
              >
                <Briefcase size={14} />
                <span>Compras & Ordens</span>
              </Link>
            </div>
          </div>

          {/* 6 High-Impact Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">

            {/* Total Assets */}
            <Link
              to={dashboardSourceLinks.assets}
              title="Abrir origem dos dados em Ativos & Inventário"
              className="group block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/70 focus-visible:ring-offset-0"
            >
              <div className="bg-brand-card border border-brand-border p-4 relative overflow-hidden group-hover:border-brand-primary/40 transition-all flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold font-mono uppercase tracking-wider text-brand-muted">Total de Ativos</span>
                  <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
                    <Layers size={18} />
                  </div>
                </div>
                <div>
                  <div className="text-3xl font-black font-mono text-brand-text">{totalAssetsCount}</div>
                  <div className="text-[11px] text-emerald-600 font-mono font-semibold mt-1 flex items-center space-x-1">
                    <span>●</span>
                    <span>{stats.total_assets_disponivel} disponíveis ({totalAssetsCount > 0 ? ((stats.total_assets_disponivel / totalAssetsCount) * 100).toFixed(0) : 0}%)</span>
                  </div>
                </div>
                {renderSourceFooter('Abrir ativos')}
              </div>
            </Link>

            {/* Total Value in R$ */}
            <Link
              to={dashboardSourceLinks.assets}
              title="Abrir origem do patrimônio total em Ativos & Inventário"
              className="group block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/70 focus-visible:ring-offset-0"
            >
              <div className="bg-brand-card border border-brand-border p-4 relative overflow-hidden group-hover:border-brand-primary/40 transition-all flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold font-mono uppercase tracking-wider text-brand-muted">Patrimônio Total</span>
                  <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
                    <TrendingUp size={18} />
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-black font-mono text-emerald-600 truncate" title={formatCurrency(stats.total_assets_value || 0)}>
                    {formatCurrency(stats.total_assets_value || 0)}
                  </div>
                  <div className="text-[11px] text-brand-muted mt-1">Valor de aquisição / inventário</div>
                </div>
                {renderSourceFooter('Abrir inventário')}
              </div>
            </Link>

            {/* Service Desk Tickets */}
            <Link
              to={dashboardSourceLinks.serviceDesk}
              title="Abrir origem dos chamados em Service Desk"
              className="group block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/70 focus-visible:ring-offset-0"
            >
              <div className="bg-brand-card border border-brand-border p-4 relative overflow-hidden group-hover:border-brand-primary/40 transition-all flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold font-mono uppercase tracking-wider text-brand-muted">Service Desk</span>
                  <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-lg">
                    <MessageSquare size={18} />
                  </div>
                </div>
                <div>
                  <div className="flex items-baseline space-x-1.5">
                    <span className="text-3xl font-black font-mono text-brand-text">{stats.tickets_open}</span>
                    <span className="text-xs font-mono text-brand-muted">abertos</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px] font-mono">
                    <div className="bg-brand-dark/40 border border-red-500/15 px-2 py-1">
                      <div className="text-red-500 font-bold">{stats.tickets_open}</div>
                      <div className="text-brand-muted uppercase">{formatPercent(stats.tickets_open, totalTicketsCount)}</div>
                    </div>
                    <div className="bg-brand-dark/40 border border-amber-500/15 px-2 py-1">
                      <div className="text-amber-500 font-bold">{stats.tickets_resolved}</div>
                      <div className="text-brand-muted uppercase">{formatPercent(stats.tickets_resolved, totalTicketsCount)}</div>
                    </div>
                    <div className="bg-brand-dark/40 border border-emerald-500/15 px-2 py-1">
                      <div className="text-emerald-500 font-bold">{stats.tickets_closed}</div>
                      <div className="text-brand-muted uppercase">{formatPercent(stats.tickets_closed, totalTicketsCount)}</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-brand-muted mt-2 flex items-center justify-between">
                    <span>{totalTicketsCount} total</span>
                    {stats.tickets_avg_rating && stats.tickets_avg_rating > 0 ? (
                      <span className="text-amber-500 font-bold font-mono flex items-center">
                        <Star size={11} className="fill-amber-400 mr-0.5 inline" />
                        {stats.tickets_avg_rating.toFixed(1)}
                      </span>
                    ) : null}
                  </div>
                </div>
                {renderSourceFooter('Abrir chamados')}
              </div>
            </Link>

            {/* Pending Asset Requests */}
            <Link
              to={dashboardSourceLinks.loans}
              title="Abrir origem dos empréstimos e devoluções"
              className="group block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/70 focus-visible:ring-offset-0"
            >
              <div className="bg-brand-card border border-brand-border p-4 relative overflow-hidden group-hover:border-brand-primary/40 transition-all flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold font-mono uppercase tracking-wider text-brand-muted">Empréstimos</span>
                  <div className="p-2 bg-purple-500/10 text-purple-500 rounded-lg">
                    <ArrowLeftRight size={18} />
                  </div>
                </div>
                <div>
                  <div className="text-3xl font-black font-mono text-brand-text">{stats.pending_asset_requests}</div>
                  <div className="text-[11px] text-brand-muted mt-1">Pendentes de aprovação/entrega</div>
                </div>
                {renderSourceFooter('Abrir empréstimos')}
              </div>
            </Link>

            {/* Assets in Maintenance */}
            <Link
              to={dashboardSourceLinks.maintenance}
              title="Abrir origem de manutenção e oficina"
              className="group block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/70 focus-visible:ring-offset-0"
            >
              <div className="bg-brand-card border border-brand-border p-4 relative overflow-hidden group-hover:border-brand-primary/40 transition-all flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold font-mono uppercase tracking-wider text-brand-muted">Em Manutenção</span>
                  <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg">
                    <Wrench size={18} />
                  </div>
                </div>
                <div>
                  <div className="text-3xl font-black font-mono text-brand-text">{stats.total_assets_maintenance}</div>
                  <div className="text-[11px] text-brand-muted mt-1">
                    {stats.pending_maintenance_requests > 0
                      ? `${stats.pending_maintenance_requests} solicitações pendentes`
                      : 'Na oficina / laboratório'}
                  </div>
                </div>
                {renderSourceFooter('Abrir manutenção')}
              </div>
            </Link>

            {/* Monthly Cost (Procurement) */}
            <Link
              to={dashboardSourceLinks.purchases}
              title="Abrir origem das compras aprovadas no mês"
              className="group block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/70 focus-visible:ring-offset-0"
            >
              <div className="bg-brand-card border border-brand-border p-4 relative overflow-hidden group-hover:border-brand-primary/40 transition-all flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold font-mono uppercase tracking-wider text-brand-muted">Compras no Mês</span>
                  <div className="p-2 bg-teal-500/10 text-teal-500 rounded-lg">
                    <Briefcase size={18} />
                  </div>
                </div>
                <div>
                  <div className="text-xl font-black font-mono text-brand-text truncate" title={formatCurrency(stats.supplier_cost_monthly)}>
                    {formatCurrency(stats.supplier_cost_monthly)}
                  </div>
                  <div className="text-[11px] text-brand-muted mt-1">Ordens aprovadas no mês</div>
                </div>
                {renderSourceFooter('Abrir compras')}
              </div>
            </Link>

          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Doughnut: Tickets Volume */}
            <div className="lg:col-span-5 bg-brand-card border border-brand-border p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between pb-3 border-b border-brand-border/60">
                <div className="flex items-center space-x-2">
                  <PieChart size={18} className="text-brand-primary" />
                  <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-brand-text">Volume & Status de Chamados</h3>
                </div>
                <span className="text-xs font-mono font-bold bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded">
                  {totalTicketsCount} {totalTicketsCount === 1 ? 'chamado' : 'chamados'}
                </span>
              </div>

              <div className="h-60 relative flex items-center justify-center my-3">
                {totalTicketsCount === 0 ? (
                  <div className="text-center text-brand-muted text-xs font-mono">
                    Nenhum chamado registrado no momento.
                  </div>
                ) : (
                  <>
                    <Doughnut
                      data={ticketsChartData}
                      options={{
                        maintainAspectRatio: false,
                        cutout: '72%',
                        plugins: {
                          legend: {
                            display: false,
                          },
                          tooltip: {
                            callbacks: {
                              label: (ctx) => {
                                const v = ctx.raw as number;
                                const pct = totalTicketsCount > 0 ? ((v / totalTicketsCount) * 100).toFixed(1) : '0';
                                return ` ${ctx.label}: ${v} chamados (${pct}%)`;
                              }
                            }
                          }
                        }
                      }}
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-3xl font-black font-mono text-brand-text">{totalTicketsCount}</span>
                      <span className="text-[10px] font-mono text-brand-muted uppercase">Total</span>
                    </div>
                  </>
                )}
              </div>

              {/* Legend with exact counts and colors */}
              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-brand-border/60 text-center">
                <Link to={dashboardSourceLinks.serviceDesk} title="Abrir Service Desk — chamados em aberto" className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/70 focus-visible:ring-offset-0">
                  <div className="p-2 bg-red-500/5 border border-red-500/20 rounded-lg transition-all hover:border-red-500/40 hover:bg-red-500/10">
                  <div className="text-[10px] font-mono text-red-600 font-bold uppercase">Abertos</div>
                  <div className="text-base font-black font-mono text-red-600">{stats.tickets_open}</div>
                  <div className="text-[9px] text-brand-muted font-mono">
                    {totalTicketsCount > 0 ? ((stats.tickets_open / totalTicketsCount) * 100).toFixed(0) : 0}%
                  </div>
                  </div>
                </Link>
                <Link to={dashboardSourceLinks.serviceDeskResolved} title="Abrir Service Desk — chamados resolvidos" className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/70 focus-visible:ring-offset-0">
                  <div className="p-2 bg-amber-500/5 border border-amber-500/20 rounded-lg transition-all hover:border-amber-500/40 hover:bg-amber-500/10">
                  <div className="text-[10px] font-mono text-amber-600 font-bold uppercase">Resolvidos</div>
                  <div className="text-base font-black font-mono text-amber-600">{stats.tickets_resolved}</div>
                  <div className="text-[9px] text-brand-muted font-mono">
                    {totalTicketsCount > 0 ? ((stats.tickets_resolved / totalTicketsCount) * 100).toFixed(0) : 0}%
                  </div>
                  </div>
                </Link>
                <Link to={dashboardSourceLinks.serviceDeskClosed} title="Abrir Service Desk — chamados fechados" className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/70 focus-visible:ring-offset-0">
                  <div className="p-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg transition-all hover:border-emerald-500/40 hover:bg-emerald-500/10">
                  <div className="text-[10px] font-mono text-emerald-600 font-bold uppercase">Fechados</div>
                  <div className="text-base font-black font-mono text-emerald-600">{stats.tickets_closed}</div>
                  <div className="text-[9px] text-brand-muted font-mono">
                    {totalTicketsCount > 0 ? ((stats.tickets_closed / totalTicketsCount) * 100).toFixed(0) : 0}%
                  </div>
                  </div>
                </Link>
              </div>
            </div>

            {/* Bar: Assets Health / Status */}
            <div className="lg:col-span-7 bg-brand-card border border-brand-border p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between pb-3 border-b border-brand-border/60">
                <div className="flex items-center space-x-2">
                  <BarChart3 size={18} className="text-brand-primary" />
                  <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-brand-text">Saúde e Status dos Equipamentos</h3>
                </div>
                <span className="text-xs font-mono text-brand-muted">
                  Base total: <strong className="text-brand-text">{totalAssetsCount}</strong> ativos
                </span>
              </div>

              <div className="h-60 relative flex items-center justify-center my-3">
                <Bar
                  data={assetsStatusBarData}
                  options={{
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const v = ctx.raw as number;
                            const pct = totalAssetsCount > 0 ? ((v / totalAssetsCount) * 100).toFixed(1) : '0';
                            return ` ${ctx.label}: ${v} (${pct}% do inventário)`;
                          }
                        }
                      }
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(9, 30, 66, 0.06)' },
                        ticks: { color: '#5e6c84', font: { family: 'Inter, sans-serif', size: 11 } }
                      },
                      x: {
                        grid: { display: false },
                        ticks: { color: '#5e6c84', font: { family: 'Inter, sans-serif', size: 11, weight: 'bold' } }
                      }
                    }
                  }}
                />
              </div>

              {/* Status footer stats pills */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-brand-border/60 text-xs font-mono">
                <Link to={assetStatusSourceLinks['Disponível']} className="flex items-center space-x-1.5 hover:text-brand-primary" title="Ver ativos disponíveis">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  <span className="text-brand-muted">Disponível: <strong className="text-brand-text">{stats.total_assets_disponivel}</strong></span>
                </Link>
                <Link to={assetStatusSourceLinks['Em Uso']} className="flex items-center space-x-1.5 hover:text-brand-primary" title="Ver ativos em uso">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                  <span className="text-brand-muted">Em Uso: <strong className="text-brand-text">{stats.total_assets_em_uso}</strong></span>
                </Link>
                <Link to={assetStatusSourceLinks.Manutenção} className="flex items-center space-x-1.5 hover:text-brand-primary" title="Ver ativos em manutenção">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                  <span className="text-brand-muted">Manutenção: <strong className="text-brand-text">{stats.total_assets_maintenance}</strong></span>
                </Link>
                <Link to={assetStatusSourceLinks.Armazenado} className="flex items-center space-x-1.5 hover:text-brand-primary" title="Ver ativos armazenados">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" />
                  <span className="text-brand-muted">Armazenado: <strong className="text-brand-text">{stats.total_assets_armazenado}</strong></span>
                </Link>
                <Link to={assetStatusSourceLinks.Baixado} className="flex items-center space-x-1.5 hover:text-brand-primary" title="Ver ativos baixados">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                  <span className="text-brand-muted">Baixado: <strong className="text-brand-text">{stats.total_assets_baixado}</strong></span>
                </Link>
              </div>
            </div>

          </div>

          {/* Secondary Analytics: Categories Breakdown + Tickets Priority + Recent Activity + Alerts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Categories Breakdown */}
            <div className="bg-brand-card border border-brand-border p-5 flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-brand-border/60">
                <div className="flex items-center space-x-2">
                  <Package size={18} className="text-brand-primary" />
                  <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-brand-text">Distribuição por Categoria</h3>
                </div>
                <Link to="/assets" className="text-xs font-mono text-brand-primary hover:underline flex items-center">
                  <span>Ver todos</span>
                  <ChevronRight size={14} />
                </Link>
              </div>

              <div className="space-y-3 flex-1 overflow-y-auto max-h-[300px] pr-1">
                {stats.assets_by_category && stats.assets_by_category.length > 0 ? (
                  stats.assets_by_category.map((cat, idx) => {
                    const percentage = totalAssetsCount > 0 ? ((cat.count / totalAssetsCount) * 100).toFixed(1) : '0';
                    return (
                      <Link key={idx} to={getCategorySourceLink(cat.category)} className="block space-y-1 group" title={`Abrir ativos da categoria ${cat.category}`}>
                        <div className="flex justify-between items-center text-xs font-mono">
                          <span className="font-semibold text-brand-text truncate max-w-[200px]" title={cat.category}>
                            {cat.category}
                          </span>
                          <span className="text-brand-muted">
                            <strong className="text-brand-text">{cat.count}</strong> ({percentage}%)
                          </span>
                        </div>
                        <div className="w-full bg-brand-dark/30 h-2 rounded-full overflow-hidden border border-brand-border/30">
                          <div
                            className="bg-brand-primary h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(5, Number(percentage)))}%` }}
                          />
                        </div>
                      </Link>
                    );
                  })
                ) : (
                  <div className="text-xs text-brand-muted font-mono text-center py-6">
                    Nenhuma categoria vinculada aos ativos.
                  </div>
                )}
              </div>

              {/* Service Desk Priority Summary */}
              {stats.tickets_by_priority && (
                  <div className="pt-3 border-t border-brand-border/60 space-y-2">
                  <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-brand-muted">
                    Chamados por Prioridade
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 text-center font-mono">
                    <Link to={getPrioritySourceLink('urgente')} title="Abrir chamados urgentes" className="block p-1.5 bg-red-500/10 border border-red-500/20 rounded hover:border-red-500/40 hover:bg-red-500/15 transition-all">
                      <div className="text-[9px] text-red-600 font-bold uppercase">Urgente</div>
                      <div className="text-xs font-black text-red-600">{stats.tickets_by_priority.urgente || 0}</div>
                    </Link>
                    <Link to={getPrioritySourceLink('alta')} title="Abrir chamados de prioridade alta" className="block p-1.5 bg-amber-500/10 border border-amber-500/20 rounded hover:border-amber-500/40 hover:bg-amber-500/15 transition-all">
                      <div className="text-[9px] text-amber-600 font-bold uppercase">Alta</div>
                      <div className="text-xs font-black text-amber-600">{stats.tickets_by_priority.alta || 0}</div>
                    </Link>
                    <Link to={getPrioritySourceLink('media')} title="Abrir chamados de prioridade média" className="block p-1.5 bg-blue-500/10 border border-blue-500/20 rounded hover:border-blue-500/40 hover:bg-blue-500/15 transition-all">
                      <div className="text-[9px] text-blue-600 font-bold uppercase">Média</div>
                      <div className="text-xs font-black text-blue-600">{stats.tickets_by_priority.media || 0}</div>
                    </Link>
                    <Link to={getPrioritySourceLink('baixa')} title="Abrir chamados de prioridade baixa" className="block p-1.5 bg-slate-500/10 border border-slate-500/20 rounded hover:border-slate-500/40 hover:bg-slate-500/15 transition-all">
                      <div className="text-[9px] text-slate-600 font-bold uppercase">Baixa</div>
                      <div className="text-xs font-black text-slate-600">{stats.tickets_by_priority.baixa || 0}</div>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Recent Activities Feed */}
            <div className="bg-brand-card border border-brand-border p-5 flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-brand-border/60">
                <div className="flex items-center space-x-2">
                  <Activity size={18} className="text-brand-primary" />
                  <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-brand-text">Atividades Recentes</h3>
                </div>
                <span className="text-[10px] font-mono text-brand-muted uppercase">Feed em tempo real</span>
              </div>

              <div className="space-y-3 flex-1 overflow-y-auto max-h-[380px] pr-1">
                {stats.recent_activities && stats.recent_activities.length > 0 ? (
                  stats.recent_activities.map((act) => (
                    <Link
                      key={`${act.type}-${act.id}`}
                      to={getRecentActivityLink(act)}
                      title="Abrir origem desta atividade"
                      className="block p-3 bg-brand-dark/20 border border-brand-border/60 flex items-start space-x-3 hover:border-brand-primary/40 hover:bg-brand-dark/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/70 focus-visible:ring-offset-0"
                    >
                      <div className="p-1.5 bg-brand-primary/10 text-brand-primary rounded mt-0.5 shrink-0">
                        {act.type === 'movimentacao' ? <ArrowLeftRight size={14} /> : <Laptop size={14} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-brand-text truncate">{act.title}</h4>
                          <span className="text-[9px] font-mono text-brand-muted shrink-0 ml-2">
                            {new Date(act.created_at).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        <p className="text-[11px] text-brand-muted font-mono truncate mt-0.5">{act.subtitle}</p>
                        <div className="mt-1">
                          <span className="text-[8px] font-mono uppercase font-bold px-1.5 py-0.2 bg-brand-dark border border-brand-border text-brand-muted">
                            {act.status}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="text-xs text-brand-muted font-mono text-center py-10">
                    Nenhuma atividade recente registrada.
                  </div>
                )}
              </div>
            </div>

            {/* Active Alerts Center */}
            <div className="bg-brand-card border border-brand-border p-5 flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-brand-border/60">
                <div className="flex items-center text-red-500">
                  <BellRing size={18} className="mr-2" />
                  <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-brand-text">Central de Alertas</h3>
                </div>
                {stats.active_alerts && stats.active_alerts.length > 0 ? (
                  <span className="bg-red-500/10 text-red-500 text-xs font-mono font-bold px-2 py-0.5 border border-red-500/20 rounded">
                    {stats.active_alerts.length} ativo(s)
                  </span>
                ) : null}
              </div>

              <div className="space-y-3 flex-1 overflow-y-auto max-h-[380px] pr-1">
                {!stats.active_alerts || stats.active_alerts.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-brand-muted py-12 text-center">
                    <ShieldCheck size={44} className="mb-2 text-emerald-500 opacity-60" />
                    <p className="text-xs font-mono font-bold text-brand-text">Tudo em conformidade!</p>
                    <p className="text-[11px] font-mono text-brand-muted mt-1">Nenhum alerta crítico ativo no momento.</p>
                  </div>
                ) : (
                  stats.active_alerts.map((alert) => (
                    <Link key={alert.id} to={alert.link || dashboardSourceLinks.alerts} title="Abrir item relacionado ao alerta" className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/70 focus-visible:ring-offset-0">
                      <div className="border-l-4 border-red-500 bg-red-500/5 p-3 flex items-start space-x-2.5 transition-all hover:bg-red-500/10 hover:border-red-500/60">
                      {alert.severity === 'CRITICAL' ? (
                        <AlertTriangle className="text-red-500 mt-0.5 shrink-0" size={16} />
                      ) : (
                        <Info className="text-amber-500 mt-0.5 shrink-0" size={16} />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-brand-text mb-0.5 leading-snug">{alert.title}</h4>
                        <p className="text-[10px] font-mono text-brand-muted">
                          {new Date(alert.created_at).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>
      )}

      {selectedDashboardTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/80 backdrop-blur-md">
          <div className="w-full max-w-2xl bg-brand-card border border-brand-border shadow-2xl flex flex-col max-h-[85vh] rounded-none">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border bg-brand-dark/50">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono font-bold text-brand-primary px-1.5 py-0.5 bg-brand-primary/10 border border-brand-primary/20">
                  {selectedDashboardTicket.codigo}
                </span>
                <h3 className="font-semibold text-sm text-brand-text truncate max-w-md">
                  {summarizeServiceTicket(selectedDashboardTicket.descricao, 96)}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDashboardTicket(null)}
                className="text-brand-muted hover:text-brand-text transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content/Timeline */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="bg-brand-dark/30 p-4 border border-brand-border/40 space-y-2">
                <div className="flex justify-between items-center text-xs text-brand-muted">
                  <span>Aberto em: {new Date(selectedDashboardTicket.data_abertura).toLocaleString('pt-BR')}</span>
                  <span className="px-1.5 py-0.5 bg-brand-dark border border-brand-border text-brand-muted uppercase text-[9px] font-bold">
                    {selectedDashboardTicket.status}
                  </span>
                </div>
                <p className="text-sm text-brand-text whitespace-pre-wrap">{selectedDashboardTicket.descricao}</p>
                {selectedDashboardTicket.foto && (
                  <div className="mt-2 pt-2 border-t border-brand-border/20">
                    <span className="text-[10px] text-brand-muted block mb-1">Anexo Inicial:</span>
                    <a href={toApiFileUrl(selectedDashboardTicket.foto)} target="_blank" rel="noreferrer" className="block max-w-max">
                      <img
                        src={toApiFileUrl(selectedDashboardTicket.foto)}
                        alt="Anexo"
                        className="max-h-32 max-w-full rounded-none border border-brand-border/60 hover:border-brand-primary/60 transition-colors"
                      />
                    </a>
                  </div>
                )}
              </div>

              {/* Interactions List */}
              <div className="space-y-4 pt-2">
                <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-brand-muted flex items-center space-x-1.5">
                  <MessageSquare size={14} />
                  <span>Interações e Histórico</span>
                </h4>

                {!selectedDashboardTicket.interacoes || selectedDashboardTicket.interacoes.length === 0 ? (
                  <div className="text-xs text-brand-muted font-mono italic text-center py-4 bg-brand-dark/20 border border-brand-border/30">
                    Nenhuma interação registrada ainda.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedDashboardTicket.interacoes.map((item) => {
                      const author = item.usuario || item.user;
                      const isMe = author?.id === user?.id;

                      return (
                        <div
                          key={item.id}
                          className={`p-3 border flex flex-col space-y-1.5 ${isMe
                            ? 'border-brand-primary/20 bg-brand-primary/5 ml-8'
                            : 'border-brand-border/60 bg-brand-dark/40 mr-8'
                            }`}
                        >
                          <div className="flex justify-between items-center text-[10px] text-brand-muted">
                            <span className="font-semibold text-brand-text">
                              {author?.nome || 'Usuário'} ({author?.id === selectedDashboardTicket.solicitante_id ? 'Solicitante' : 'Suporte'})
                            </span>
                            <span>{new Date(item.data_criacao).toLocaleString('pt-BR')}</span>
                          </div>
                          <p className="text-xs text-brand-text whitespace-pre-wrap">{item.mensagem}</p>
                          {item.foto && (
                            <div className="mt-1.5 pt-1.5 border-t border-brand-border/20">
                              {item.foto.toLowerCase().endsWith('.png') ||
                                item.foto.toLowerCase().endsWith('.jpg') ||
                                item.foto.toLowerCase().endsWith('.jpeg') ||
                                item.foto.toLowerCase().endsWith('.gif') ||
                                item.foto.toLowerCase().endsWith('.webp') ? (
                                <a href={toApiFileUrl(item.foto)} target="_blank" rel="noreferrer" className="block max-w-max">
                                  <img
                                    src={toApiFileUrl(item.foto)}
                                    alt="Anexo"
                                    className="max-h-32 max-w-full border border-brand-border/60"
                                  />
                                </a>
                              ) : (
                                <a
                                  href={toApiFileUrl(item.foto)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center space-x-1.5 text-brand-primary hover:underline text-[11px]"
                                >
                                  <span>📎</span>
                                  <span className="underline">{item.foto.split('/').pop()}</span>
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer Input Area */}
            {selectedDashboardTicket.status?.toLowerCase() !== 'fechado' && (
              <div className="p-4 border-t border-brand-border bg-brand-dark/50">
                <form onSubmit={handleSendDashboardComment} className="flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="Escreva uma resposta... (Ctrl+V para colar imagem)"
                    value={commentMessage}
                    onChange={(e) => setCommentMessage(e.target.value)}
                    onPaste={handleDashboardPaste}
                    className="flex-1 bg-brand-dark border border-brand-border px-3 py-2 text-xs focus:outline-none focus:border-brand-primary text-brand-text placeholder-brand-muted/40 rounded-none"
                  />

                  <label className="p-2 bg-brand-dark border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-primary/50 transition-all cursor-pointer flex items-center justify-center shrink-0">
                    <Paperclip size={14} />
                    <input
                      type="file"
                      onChange={handleDashboardFileChange}
                      className="hidden"
                      accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={uploadingAttachment || !commentMessage.trim()}
                    className="p-2 bg-brand-primary/10 border border-brand-primary/30 text-brand-primary hover:bg-brand-primary hover:text-brand-dark transition-all disabled:opacity-40 flex items-center justify-center shrink-0"
                  >
                    {uploadingAttachment ? (
                      <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full" />
                    ) : (
                      <Send size={14} />
                    )}
                  </button>
                </form>
                {uploadingAttachment && (
                  <div className="text-[10px] text-brand-primary font-mono animate-pulse mt-1">
                    Enviando anexo...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {resolvedTickets.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/95 backdrop-blur-xl">
          {/* Main Emergency Container */}
          <div className="w-full max-w-lg bg-slate-950 border-4 border-amber-500 shadow-2xl relative flex flex-col overflow-hidden rounded-none">
            {/* Caution Stripes Top */}
            <div className="h-4 bg-amber-500 animate-pulse" style={{
              backgroundImage: 'repeating-linear-gradient(-45deg, #f59e0b, #f59e0b 10px, #000 10px, #000 20px)'
            }} />

            {/* Content Box */}
            <div className="p-8 space-y-6 text-center">
              {/* Flashing Warning Beacon */}
              <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-amber-500/10 border-2 border-amber-500 animate-pulse relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500/20 opacity-75"></span>
                <AlertTriangle size={42} className="text-amber-500 animate-bounce" />
              </div>

              {/* Title & Info */}
              <div className="space-y-2">
                <h2 className="text-xl font-black font-mono tracking-widest text-amber-500 uppercase">
                  Alerta do Sistema: Chamado Concluído!
                </h2>
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center justify-center space-x-2">
                  <span className="text-brand-primary font-bold px-1.5 py-0.5 bg-brand-primary/10 border border-brand-primary/20">
                    {resolvedTickets[0].codigo}
                  </span>
                  <span>—</span>
                  <span className="text-slate-200 font-bold truncate max-w-[200px]">{summarizeServiceTicket(resolvedTickets[0].descricao, 80)}</span>
                </div>
              </div>

              <div className="bg-slate-900 p-5 border border-slate-800 text-left rounded-none space-y-2">
                <p className="text-[10px] uppercase font-mono tracking-wider text-amber-500 font-bold">Nota de Solução do Técnico:</p>
                <div className="text-xs font-mono text-slate-100 italic bg-slate-950 p-4 border border-slate-800 leading-relaxed">
                  "{resolvedTickets[0].solucao || resolvedTickets[0].nota_resolucao || 'O chamado foi resolvido e está pronto para encerramento.'}"
                </div>
              </div>

              {/* Rate and comment */}
              <div className="space-y-4 pt-2">
                <p className="text-xs font-bold font-mono tracking-wide text-slate-200 uppercase">
                  Por favor, avalie o atendimento antes de encerrar:
                </p>

                {/* Stars Component with Hover and Selection */}
                <div className="flex justify-center items-center space-x-2">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const isLit = star <= (dashboardHoverRating || dashboardRating);
                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setDashboardRating(star)}
                        onMouseEnter={() => setDashboardHoverRating(star)}
                        onMouseLeave={() => setDashboardHoverRating(0)}
                        className="transition-all transform hover:scale-125 focus:outline-none"
                      >
                        <Star
                          size={32}
                          className={`transition-colors duration-100 ${isLit
                            ? 'text-amber-400 fill-amber-400 filter drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]'
                            : 'text-slate-700 hover:text-amber-400'
                            }`}
                        />
                      </button>
                    );
                  })}
                </div>

                {/* Comment Input */}
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-mono text-slate-400 uppercase font-bold">Deixe seu comentário / feedback (opcional):</label>
                  <textarea
                    rows={2}
                    placeholder="Escreva algo sobre o atendimento..."
                    value={dashboardFeedbackComment}
                    onChange={(e) => setDashboardFeedbackComment(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 px-3 py-2 text-xs focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-100 placeholder-slate-500 rounded-none resize-none"
                  />
                </div>
              </div>

              {/* Confirm / Close Button */}
              <div className="pt-2">
                <button
                  type="button"
                  disabled={submittingEmergency}
                  onClick={() => handleConfirmEmergencyClose(resolvedTickets[0].id)}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black font-black text-xs uppercase tracking-widest font-mono transition-all border-none focus:outline-none flex items-center justify-center space-x-2 shadow-lg shadow-amber-500/20"
                >
                  {submittingEmergency ? (
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                  ) : (
                    <>
                      <span>Confirmar Avaliação e Encerrar Chamado</span>
                      <span>🚀</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Caution Stripes Bottom */}
            <div className="h-4 bg-amber-500" style={{
              backgroundImage: 'repeating-linear-gradient(-45deg, #f59e0b, #f59e0b 10px, #000 10px, #000 20px)'
            }} />
          </div>
        </div>
      )}

      {/* Modal de Visualização Completa do Aviso / Comunicado */}
      {selectedAviso && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={() => setSelectedAviso(null)}
        >
          <div
            className="w-full max-w-3xl bg-brand-card border border-brand-border shadow-2xl rounded-sm flex flex-col max-h-[92vh] my-auto overflow-hidden animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-brand-border flex items-center justify-between bg-brand-dark/60 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-brand-primary/20 text-brand-primary rounded">
                  <BellRing size={22} className="animate-bounce" />
                </div>
                <div>
                  <h3 className="font-bold text-brand-text text-base sm:text-lg m-0">{selectedAviso.titulo}</h3>
                  <p className="text-xs text-brand-muted mt-0.5 m-0 font-mono">
                    Publicado em {new Date(selectedAviso.data_cadastro).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedAviso(null)}
                className="text-brand-muted hover:text-brand-text transition-colors p-1.5 hover:bg-brand-dark rounded"
                title="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              {/* Media (High Res / Full Player) */}
              {selectedAviso.midia_url && (
                <div className="rounded-sm overflow-hidden border border-brand-border bg-black">
                  {selectedAviso.midia_tipo === 'video' || selectedAviso.midia_url.includes('youtube') || selectedAviso.midia_url.includes('youtu.be') ? (
                    selectedAviso.midia_url.includes('youtube.com/watch?v=') || selectedAviso.midia_url.includes('youtu.be/') ? (
                      <iframe
                        src={selectedAviso.midia_url.includes('youtu.be/')
                          ? `https://www.youtube.com/embed/${selectedAviso.midia_url.split('youtu.be/')[1]?.split('?')[0]}?autoplay=1`
                          : `https://www.youtube.com/embed/${new URLSearchParams(selectedAviso.midia_url.split('?')[1]).get('v')}?autoplay=1`}
                        className="w-full aspect-video"
                        title={selectedAviso.titulo}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <video
                        src={toApiFileUrl(selectedAviso.midia_url)}
                        controls
                        autoPlay
                        className="w-full max-h-[500px] bg-black mx-auto"
                      />
                    )
                  ) : (
                    <img
                      src={toApiFileUrl(selectedAviso.midia_url)}
                      alt={selectedAviso.titulo}
                      className="w-full max-h-[550px] object-contain mx-auto"
                    />
                  )}
                </div>
              )}

              {/* Text Description */}
              {selectedAviso.texto && (
                <div className="p-4 bg-brand-dark/50 border border-brand-border/60 rounded-sm">
                  <p className="text-sm sm:text-base text-brand-text whitespace-pre-wrap leading-relaxed m-0">
                    {selectedAviso.texto}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-brand-border bg-brand-dark/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedAviso(null)}
                className="px-4 py-2 bg-brand-dark border border-brand-border text-xs text-brand-text hover:bg-brand-card rounded font-mono uppercase"
              >
                Fechar Visualização
              </button>
              {selectedAviso.link_url && (
                <a
                  href={selectedAviso.link_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center space-x-2 px-5 py-2.5 bg-brand-primary text-brand-dark font-bold text-xs rounded hover:bg-brand-primary/90 transition-all shadow-md font-mono uppercase"
                >
                  <span>{selectedAviso.link_texto || 'Acessar Link do Comunicado'}</span>
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
