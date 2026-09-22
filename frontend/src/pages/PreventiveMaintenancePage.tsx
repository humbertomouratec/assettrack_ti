import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { preventiveApi } from '../api/preventive';
import { procurementApi } from '../api/procurement';
import { toApiFileUrl } from '../api/client';
import { usersApi } from '../api/users';
import { assetsApi } from '../api/assets';
import type {
  MaintenancePlan,
  MaintenanceOrder,
  MaintenanceChecklist,
  PMDashboard,
  PMNotification,
} from '../types/preventive';
import type { MaterialStock } from '../types/procurement';
import {
  PM_STATUSES,
  PM_TYPES,
  PM_PERIODICITIES,
  PM_PRIORITIES,
  PM_CRITICALITIES,
} from '../types/preventive';
import { useAuthStore } from '../stores/authStore';
import {
  Plus, Edit2, Trash2, X, ShieldAlert, Wrench, ClipboardList, Bell, Play, Pause,
  CheckCircle2, Ban, FileText, Camera, CalendarDays, ChevronLeft, ChevronRight,
  ShoppingCart, RefreshCw, Link as LinkIcon, ExternalLink, FileDown, BarChart3,
  TrendingUp, Timer, DollarSign
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const structureRoles = ['admin', 'gerente_ti', 'gerente_infra'];
const workRoles = ['admin', 'gerente_ti', 'gerente_infra', 'tecnico'];
const preventiveOrderIntentStorageKey = 'assettrack:preventive-order-intent';
const preventiveOrderDetailIntentStorageKey = 'assettrack:preventive-order-detail-intent';
const kanbanReturnIntentStorageKey = 'assettrack:kanban-return-intent';

type KanbanOriginContext = {
  sourceProjectId?: number | null;
  sourceProjectTitle?: string | null;
  sourceCardId?: number | null;
  sourceCardTitle?: string | null;
};

const statusColor: Record<string, string> = {
  'Aberta': 'text-blue-400 border-blue-500/30',
  'Agendada': 'text-cyan-400 border-cyan-500/30',
  'Em andamento': 'text-yellow-400 border-yellow-500/30',
  'Aguardando peça': 'text-orange-400 border-orange-500/30',
  'Pausada': 'text-purple-400 border-purple-500/30',
  'Concluída': 'text-green-400 border-green-500/30',
  'Cancelada': 'text-red-400 border-red-500/30',
};

const criticalityColor: Record<string, string> = {
  'Baixa': 'border-sky-500/30 bg-sky-500/8 text-sky-300',
  'Média': 'border-yellow-500/30 bg-yellow-500/8 text-yellow-300',
  'Alta': 'border-orange-500/30 bg-orange-500/8 text-orange-300',
  'Crítica': 'border-red-500/30 bg-red-500/8 text-red-300',
};

type OrderChecklistDraft = {
  nome: string;
  items: {
    descricao: string;
    obrigatorio: boolean;
    requer_foto: boolean;
  }[];
};

const createEmptyChecklistItem = () => ({
  descricao: '',
  obrigatorio: true,
  requer_foto: false,
});

const createEmptyChecklistDraft = (): OrderChecklistDraft => ({
  nome: 'Checklist principal',
  items: [createEmptyChecklistItem()],
});

const formatMinutes = (totalMinutes: number) => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}min`;
};

const weekdayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

const startOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

const addMonths = (date: Date, amount: number) => new Date(date.getFullYear(), date.getMonth() + amount, 1);

const addDays = (date: Date, amount: number) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const startOfWeek = (date: Date) => {
  const copy = startOfDay(date);
  return addDays(copy, -copy.getDay());
};

const getCalendarEventDate = (order: MaintenanceOrder) => {
  if (order.data_agendada) {
    return new Date(order.data_agendada);
  }
  if (order.data_abertura) {
    return new Date(order.data_abertura);
  }
  return null;
};

export const PreventiveMaintenancePage: React.FC = () => {
  const location = useLocation();
  const user = useAuthStore().user;
  const canEditStructure = user ? structureRoles.includes(user.role) : false;
  const canWorkOrder = user ? workRoles.includes(user.role) : false;

  const [tab, setTab] = useState<'dashboard' | 'relatorio' | 'planos' | 'ordens' | 'calendario' | 'notifs'>('dashboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportingReport, setExportingReport] = useState(false);

  // Dashboard
  const [dash, setDash] = useState<PMDashboard | null>(null);

  // Plans
  const [plans, setPlans] = useState<MaintenancePlan[]>([]);
  const [planModal, setPlanModal] = useState(false);
  const [editPlanId, setEditPlanId] = useState<number | null>(null);
  const [planDetail, setPlanDetail] = useState<{ plan: MaintenancePlan; orders: MaintenanceOrder[] } | null>(null);

  // Orders
  const [orders, setOrders] = useState<MaintenanceOrder[]>([]);
  const [orderStatusFilter, setOrderStatusFilter] = useState('');
  const [orderModal, setOrderModal] = useState(false);
  const [orderDetail, setOrderDetail] = useState<{ order: MaintenanceOrder; checklists: MaintenanceChecklist[] } | null>(null);
  const [orderOriginContext, setOrderOriginContext] = useState<KanbanOriginContext | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [calendarView, setCalendarView] = useState<'mensal' | 'semanal'>('mensal');
  const [calendarStatusFilter, setCalendarStatusFilter] = useState('');
  const [calendarTechFilter, setCalendarTechFilter] = useState<number | 'all'>('all');

  // Notifications
  const [notifs, setNotifs] = useState<PMNotification[]>([]);

  const unreadNotifications = notifs.filter((notification) => !notification.lida).length;

  // Lookups
  const [techs, setTechs] = useState<{ id: number; nome: string }[]>([]);
  const [assets, setAssets] = useState<{ id: number; nome: string }[]>([]);
  const [stockItems, setStockItems] = useState<MaterialStock[]>([]);

  // Plan form
  const [pNome, setPNome] = useState('');
  const [pTipo, setPTipo] = useState('Preventiva');
  const [pPeriod, setPPeriod] = useState('Mensal');
  const [pCrit, setPCrit] = useState('Média');
  const [pPrio, setPPrio] = useState('Média');
  const [pDesc, setPDesc] = useState('');
  const [pResponsavel, setPResponsavel] = useState<number | null>(null);
  const [pDias, setPDias] = useState('');

  // Order form
  const [oTipo, setOTipo] = useState('Preventiva');
  const [oPrio, setOPrio] = useState('Média');
  const [oDesc, setODesc] = useState('');
  const [oAsset, setOAsset] = useState<number | null>(null);
  const [oInfra, setOInfra] = useState('');
  const [oTecnico, setOTecnico] = useState<number | null>(null);
  const [oPlan, setOPlan] = useState<number | null>(null);
  const [oSourceCardId, setOSourceCardId] = useState<number | null>(null);
  const [oAgendada, setOAgendada] = useState('');
  const [orderChecklistDrafts, setOrderChecklistDrafts] = useState<OrderChecklistDraft[]>([createEmptyChecklistDraft()]);
  const [mProduto, setMProduto] = useState('');
  const [mStockId, setMStockId] = useState<number | null>(null);
  const [mQuantidade, setMQuantidade] = useState('1');
  const [mValorUnitario, setMValorUnitario] = useState('');
  const [mObservacao, setMObservacao] = useState('');
  const [photoTipo, setPhotoTipo] = useState('Durante');
  const [photoDescricao, setPhotoDescricao] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [completeModal, setCompleteModal] = useState(false);
  const [completionDiagnosis, setCompletionDiagnosis] = useState('');
  const [completionSolution, setCompletionSolution] = useState('');
  const [completionRecommendations, setCompletionRecommendations] = useState('');
  const [completionAssetDestination, setCompletionAssetDestination] = useState('Disponível');
  const [completionExtraCost, setCompletionExtraCost] = useState('');
  const [timerNow, setTimerNow] = useState(Date.now());

  // Purchase request modal for preventive maintenance
  const [pmPurchaseModalOpen, setPmPurchaseModalOpen] = useState(false);
  const [pmPartName, setPmPartName] = useState('');
  const [pmPartLink, setPmPartLink] = useState('');
  const [pmPartQty, setPmPartQty] = useState<number>(1);
  const [pmPartEstimatedVal, setPmPartEstimatedVal] = useState<string>('');
  const [pmPartJustification, setPmPartJustification] = useState('');
  const [pmPartItemType, setPmPartItemType] = useState('Consumo');
  const [pmPartSubmitting, setPmPartSubmitting] = useState(false);
  const [pmPurchaseSuccess, setPmPurchaseSuccess] = useState<string | null>(null);
  const [pmPurchaseError, setPmPurchaseError] = useState<string | null>(null);

  const handleOpenPmPurchaseModal = () => {
    if (!orderDetail) return;
    setPmPartName('');
    setPmPartLink('');
    setPmPartQty(1);
    setPmPartEstimatedVal('');
    setPmPartJustification(`Peça/insumo para Ordem Preventiva ${orderDetail.order.numero} - ${orderDetail.order.asset?.nome || orderDetail.order.infra_predial_servico || ''}`);
    setPmPartItemType('Consumo');
    setPmPurchaseSuccess(null);
    setPmPurchaseError(null);
    setPmPurchaseModalOpen(true);
  };

  const handleSubmitPmPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderDetail || !pmPartName.trim()) {
      setPmPurchaseError('Informe o nome da peça/produto.');
      return;
    }

    try {
      setPmPartSubmitting(true);
      setPmPurchaseError(null);
      const val = pmPartEstimatedVal ? Number(pmPartEstimatedVal.replace(',', '.')) : 0;
      await procurementApi.createMaintenancePurchaseRequest({
        nome_produto: pmPartName.trim(),
        link_produto: pmPartLink.trim() || undefined,
        quantidade: pmPartQty > 0 ? pmPartQty : 1,
        valor_estimado: isNaN(val) ? 0 : val,
        justificativa: pmPartJustification.trim(),
        tipo_item: pmPartItemType,
        asset_id: orderDetail.order.asset_id || undefined,
        maintenance_order_id: orderDetail.order.id,
      });

      setPmPurchaseSuccess('Solicitação de compra enviada para o Comprador com sucesso!');
      setTimeout(() => {
        setPmPurchaseModalOpen(false);
        setPmPurchaseSuccess(null);
      }, 2000);
    } catch (err: any) {
      setPmPurchaseError(err.response?.data?.error || err.response?.data?.detail || 'Erro ao enviar solicitação de compra.');
    } finally {
      setPmPartSubmitting(false);
    }
  };

  const normalizeOrderDetail = (detail: { order: MaintenanceOrder; checklists: MaintenanceChecklist[] | null }) => ({
    order: {
      ...detail.order,
      executions: detail.order.executions ?? [],
      materials: detail.order.materials ?? [],
      photos: detail.order.photos ?? [],
      history: detail.order.history ?? [],
    },
    checklists: (detail.checklists ?? []).map((checklist) => ({
      ...checklist,
      items: checklist.items ?? [],
    })),
  });

  const calculateElapsedMinutes = (order: MaintenanceOrder) => {
    let minutes = order.tempo_total_minutos ?? 0;
    if (order.status === 'Em andamento' && order.data_inicio) {
      minutes += Math.max(0, Math.floor((timerNow - new Date(order.data_inicio).getTime()) / 60000));
    }
    return minutes;
  };

  const pickChecklistPhoto = () =>
    new Promise<File | undefined>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      let settled = false;

      const finish = (file?: File) => {
        if (settled) return;
        settled = true;
        resolve(file);
      };

      input.addEventListener('change', () => finish(input.files?.[0]), { once: true });
      window.setTimeout(() => finish(undefined), 30000);
      input.click();
    });

  const serializeChecklistDrafts = () =>
    orderChecklistDrafts
      .map((checklist, checklistIndex) => ({
        nome: checklist.nome.trim(),
        ordem: checklistIndex + 1,
        items: checklist.items
          .map((item, itemIndex) => ({
            descricao: item.descricao.trim(),
            obrigatorio: item.obrigatorio,
            requer_foto: item.requer_foto,
            ordem: itemIndex + 1,
          }))
          .filter((item) => item.descricao),
      }))
      .filter((checklist) => checklist.nome);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [d, p, o] = await Promise.all([
        preventiveApi.dashboard(),
        preventiveApi.listPlans(),
        preventiveApi.listOrders('', 0, 200),
      ]);
      setDash(d);
      setPlans(p);
      setOrders(o);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    preventiveApi.myNotifications().then(setNotifs).catch(() => {});
    usersApi.list(0, 200).then((u) => setTechs(
      u
        .filter((x) => workRoles.includes(x.role))
        .map((x) => ({ id: x.id, nome: x.nome })),
    )).catch(() => {});
    assetsApi.list(0, 200).then((a) => setAssets(a.map((x) => ({ id: x.id, nome: x.nome })))).catch(() => {});
    procurementApi.listStock().then(setStockItems).catch(() => {});
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      preventiveApi.myNotifications().then(setNotifs).catch(() => {});
      fetchAll();
    }, 30000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setTimerNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const showError = (err: any) => {
    setError(err.response?.data?.error || 'Erro na operação');
    setTimeout(() => setError(null), 5000);
  };

  const today = startOfDay(new Date());
  const upcomingOrders = orders
    .map((order) => ({ order, eventDate: getCalendarEventDate(order) }))
    .filter(({ order, eventDate }) =>
      eventDate &&
      !['Concluída', 'Cancelada'].includes(order.status) &&
      startOfDay(eventDate) >= today
    )
    .sort((a, b) => a.eventDate!.getTime() - b.eventDate!.getTime());

  const filteredUpcomingOrders = upcomingOrders.filter(({ order }) => {
    const statusMatches = !calendarStatusFilter || order.status === calendarStatusFilter;
    const techMatches = calendarTechFilter === 'all' || order.tecnico?.id === calendarTechFilter || order.tecnico_id === calendarTechFilter;
    return statusMatches && techMatches;
  });

  const calendarStart = startOfMonth(calendarMonth);
  const calendarEnd = endOfMonth(calendarMonth);
  const leadingDays = calendarStart.getDay();
  const monthDays = calendarEnd.getDate();
  const calendarCells: Array<{ date: Date; inMonth: boolean }> = [];

  for (let index = 0; index < leadingDays; index += 1) {
    calendarCells.push({
      date: new Date(calendarStart.getFullYear(), calendarStart.getMonth(), index - leadingDays + 1),
      inMonth: false,
    });
  }
  for (let day = 1; day <= monthDays; day += 1) {
    calendarCells.push({
      date: new Date(calendarStart.getFullYear(), calendarStart.getMonth(), day),
      inMonth: true,
    });
  }
  while (calendarCells.length % 7 !== 0) {
    const last = calendarCells[calendarCells.length - 1].date;
    calendarCells.push({
      date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1),
      inMonth: false,
    });
  }

  const monthOrders = filteredUpcomingOrders.filter(({ eventDate }) =>
    eventDate &&
    eventDate.getFullYear() === calendarMonth.getFullYear() &&
    eventDate.getMonth() === calendarMonth.getMonth()
  );

  const weekStart = startOfWeek(calendarMonth);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const weekOrders = filteredUpcomingOrders.filter(({ eventDate }) =>
    eventDate &&
    startOfDay(eventDate).getTime() >= weekStart.getTime() &&
    startOfDay(eventDate).getTime() <= addDays(weekStart, 6).getTime()
  );

  const dashboardUpcomingOrders = orders
    .map((order) => ({ order, eventDate: getCalendarEventDate(order) }))
    .filter(({ order, eventDate }) => eventDate && !['Concluída', 'Cancelada'].includes(order.status))
    .sort((a, b) => a.eventDate!.getTime() - b.eventDate!.getTime())
    .slice(0, 5);
  const dashboardAttentionOrders = orders.filter((order) => ['Aguardando peça', 'Pausada'].includes(order.status));
  const dashboardStatusTotal = Object.values(dash?.orders_by_status ?? {}).reduce((total, value) => total + value, 0) || 1;

  const reportCompletedOrders = orders.filter((order) => order.status === 'Concluída');
  const reportCancelledOrders = orders.filter((order) => order.status === 'Cancelada');
  const reportOpenOrders = orders.filter((order) => !['Concluída', 'Cancelada'].includes(order.status));
  const reportTotalCost = orders.reduce((total, order) => total + (Number(order.custo_total) || 0), 0);
  const reportTotalPhotos = orders.reduce((total, order) => total + (order.photos?.length || 0), 0);
  const reportChecklistItems = orders.reduce((total, order) => total + (order.executions?.length || 0), 0);
  const reportCompletedChecklistItems = orders.reduce((total, order) => total + (order.executions?.filter((execution) => execution.concluido).length || 0), 0);
  const reportChecklistRate = reportChecklistItems > 0 ? (reportCompletedChecklistItems / reportChecklistItems) * 100 : 0;
  const reportAverageMinutes = reportCompletedOrders.length > 0
    ? reportCompletedOrders.reduce((total, order) => total + (Number(order.tempo_total_minutos) || 0), 0) / reportCompletedOrders.length
    : 0;
  const reportStatusCounts = PM_STATUSES.reduce<Record<string, number>>((counts, status) => {
    counts[status] = orders.filter((order) => order.status === status).length;
    return counts;
  }, {});
  const reportPriorityCounts = PM_PRIORITIES.reduce<Record<string, number>>((counts, priority) => {
    counts[priority] = orders.filter((order) => order.prioridade === priority).length;
    return counts;
  }, {});
  const reportTechnicianCounts = orders.reduce<Record<string, number>>((counts, order) => {
    const technician = order.tecnico?.nome || 'Sem técnico';
    counts[technician] = (counts[technician] || 0) + 1;
    return counts;
  }, {});
  const reportCompletionRate = orders.length > 0 ? (reportCompletedOrders.length / orders.length) * 100 : 0;
  const reportAttentionRate = orders.length > 0 ? (dashboardAttentionOrders.length / orders.length) * 100 : 0;

  const formatReportCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const exportPreventiveReport = () => {
    setExportingReport(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const generatedAt = new Date().toLocaleString('pt-BR');
      const totalOrders = Math.max(orders.length, 1);
      const primaryBlue: [number, number, number] = [12, 102, 228];
      const slate: [number, number, number] = [15, 23, 42];
      let y = 18;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(...slate);
      doc.text('AssetTrack TI', 14, y);
      y += 9;
      doc.setFontSize(15);
      doc.text('Relatório geral de manutenção preventiva', 14, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Gerado em ${generatedAt} · ${user?.nome || 'Usuário do sistema'}`, 14, y + 7);
      y += 17;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...slate);
      doc.text('1. Resumo executivo', 14, y);
      autoTable(doc, {
        startY: y + 4,
        theme: 'grid',
        headStyles: { fillColor: primaryBlue },
        head: [['Indicador', 'Resultado', 'Leitura técnica']],
        body: [
          ['Ordens analisadas', String(orders.length), 'Base consolidada do módulo preventivo'],
          ['Taxa de conclusão', `${reportCompletionRate.toFixed(1)}%`, `${reportCompletedOrders.length} ordens concluídas`],
          ['Ordens em aberto', String(reportOpenOrders.length), 'Exigem acompanhamento operacional'],
          ['Ordens canceladas', String(reportCancelledOrders.length), 'Avaliar causa e recorrência'],
          ['Tempo médio informado', formatMinutes(Math.round(reportAverageMinutes)), 'Considera ordens concluídas com tempo registrado'],
          ['Custo total registrado', formatReportCurrency(reportTotalCost), `${reportTotalPhotos} evidências fotográficas`],
        ],
      });
      y = (doc as any).lastAutoTable.finalY + 12;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...slate);
      doc.text('2. Análises técnicas', 14, y);
      autoTable(doc, {
        startY: y + 4,
        theme: 'striped',
        headStyles: { fillColor: [30, 64, 175] },
        head: [['Análise', 'Resultado', 'Recomendação']],
        body: [
          ['Execução de checklists', `${reportChecklistRate.toFixed(1)}%`, reportChecklistRate >= 90 ? 'Aderência adequada' : 'Reforçar o preenchimento antes do encerramento'],
          ['Ordens aguardando peça/pausadas', String(dashboardAttentionOrders.length), dashboardAttentionOrders.length > 0 ? 'Priorizar compras e desbloqueios' : 'Sem pendências críticas'],
          ['Planos com vencimento próximo', String(dash?.plans_due || 0), (dash?.plans_due || 0) > 0 ? 'Revisar agenda dos próximos 7 dias' : 'Agenda sob controle'],
          ['Cobertura técnica', `${Object.keys(reportTechnicianCounts).length} responsáveis`, Object.keys(reportTechnicianCounts).length > 1 ? 'Distribuição por equipe disponível' : 'Revisar alocação de responsáveis'],
        ],
      });
      y = (doc as any).lastAutoTable.finalY + 12;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...slate);
      doc.text('3. Distribuição por status e prioridade', 14, y);
      autoTable(doc, {
        startY: y + 4,
        theme: 'grid',
        headStyles: { fillColor: [56, 189, 248] },
        head: [['Grupo', 'Indicador', 'Quantidade', 'Participação']],
        body: [
          ...PM_STATUSES.map((status) => ['Status', status, String(reportStatusCounts[status] || 0), `${(((reportStatusCounts[status] || 0) / totalOrders) * 100).toFixed(1)}%`]),
          ...PM_PRIORITIES.map((priority) => ['Prioridade', priority, String(reportPriorityCounts[priority] || 0), `${(((reportPriorityCounts[priority] || 0) / totalOrders) * 100).toFixed(1)}%`]),
        ],
      });
      y = (doc as any).lastAutoTable.finalY + 12;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...slate);
      doc.text('4. Ordens registradas', 14, y);
      autoTable(doc, {
        startY: y + 4,
        theme: 'striped',
        headStyles: { fillColor: primaryBlue },
        head: [['OS', 'Ativo / serviço', 'Status', 'Prioridade', 'Técnico', 'Abertura', 'Conclusão']],
        body: orders.map((order) => [
          order.numero,
          order.asset?.nome || order.infra_predial_servico || 'Serviço',
          order.status,
          order.prioridade,
          order.tecnico?.nome || '—',
          new Date(order.data_abertura).toLocaleDateString('pt-BR'),
          order.data_conclusao ? new Date(order.data_conclusao).toLocaleDateString('pt-BR') : '—',
        ]),
        styles: { fontSize: 7 },
      });

      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(`Página ${page} de ${pageCount} · AssetTrack TI · Manutenção preventiva`, 14, doc.internal.pageSize.height - 8);
      }
      doc.save(`relatorio_manutencao_preventiva_${new Date().getTime()}.pdf`);
    } catch (err) {
      console.error(err);
      alert('Não foi possível gerar o relatório em PDF.');
    } finally {
      setExportingReport(false);
    }
  };

  // ---- Plans ----
  const openPlanModal = (plan?: MaintenancePlan) => {
    setEditPlanId(plan?.id ?? null);
    setPNome(plan?.nome ?? '');
    setPTipo(plan?.tipo ?? 'Preventiva');
    setPPeriod(plan?.periodicidade ?? 'Mensal');
    setPCrit(plan?.criticidade ?? 'Média');
    setPPrio(plan?.prioridade ?? 'Média');
    setPDesc(plan?.descricao ?? '');
    setPResponsavel(plan?.responsavel_id ?? null);
    setPDias(plan?.dias_personalizado ? String(plan.dias_personalizado) : '');
    setPlanModal(true);
  };

  const submitPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        nome: pNome,
        tipo: pTipo,
        periodicidade: pPeriod,
        criticidade: pCrit,
        prioridade: pPrio,
        descricao: pDesc,
        responsavel_id: pResponsavel ?? undefined,
        dias_personalizado: pPeriod === 'Personalizada' ? Number(pDias) || undefined : undefined,
      };
      if (editPlanId) await preventiveApi.updatePlan(editPlanId, payload);
      else await preventiveApi.createPlan(payload);
      setPlanModal(false);
      fetchAll();
    } catch (err) {
      showError(err);
    }
  };

  const deletePlan = async (plan: MaintenancePlan) => {
    if (!window.confirm(`Excluir plano "${plan.nome}"?`)) return;
    try {
      await preventiveApi.deletePlan(plan.id);
      fetchAll();
    } catch (err) {
      showError(err);
    }
  };

  const openPlanDetail = async (planId: number) => {
    try {
      setPlanDetail(await preventiveApi.getPlan(planId));
    } catch (err) {
      showError(err);
    }
  };

  // ---- Orders ----
  const openOrderModal = async (defaults?: { planId?: number | null; assetId?: number | null; sourceCardId?: number | null }) => {
    setOTipo('Preventiva');
    setOPrio('Média');
    setODesc('');
    setOAsset(defaults?.assetId ?? null);
    setOInfra('');
    setOTecnico(null);
    setOPlan(defaults?.planId ?? null);
    setOSourceCardId(defaults?.sourceCardId ?? null);
    setOAgendada('');
    setOrderChecklistDrafts([createEmptyChecklistDraft()]);
    setOrderModal(true);
    if (defaults?.planId) {
      try {
        await loadChecklistDraftsFromPlan(defaults.planId);
      } catch {
        setOrderChecklistDrafts([createEmptyChecklistDraft()]);
      }
    }
  };

  useEffect(() => {
    let detailIntentFromStorage: ({ orderId?: number | null; createdAt?: number } & KanbanOriginContext) | null = null;
    let payloadFromStorage: ({ planId?: number | null; assetId?: number | null; createdAt?: number } & KanbanOriginContext) | null = null;
    try {
      const detailRaw = sessionStorage.getItem(preventiveOrderDetailIntentStorageKey);
      if (detailRaw) {
        detailIntentFromStorage = JSON.parse(detailRaw) as ({ orderId?: number | null; createdAt?: number } & KanbanOriginContext);
        if (detailIntentFromStorage.createdAt && Date.now() - detailIntentFromStorage.createdAt > 120000) {
          detailIntentFromStorage = null;
          sessionStorage.removeItem(preventiveOrderDetailIntentStorageKey);
        }
      }
      const raw = sessionStorage.getItem(preventiveOrderIntentStorageKey);
      if (raw) {
        payloadFromStorage = JSON.parse(raw) as ({ planId?: number | null; assetId?: number | null; createdAt?: number } & KanbanOriginContext);
        if (payloadFromStorage.createdAt && Date.now() - payloadFromStorage.createdAt > 120000) {
          payloadFromStorage = null;
          sessionStorage.removeItem(preventiveOrderIntentStorageKey);
        }
      }
    } catch {
      sessionStorage.removeItem(preventiveOrderIntentStorageKey);
    }

    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    const shouldOpenOrder = params.get('openOrder') === '1';
    const shouldOpenDetail = params.get('openDetail') === '1';
    const planIdParam = params.get('planId');
    const assetIdParam = params.get('assetId');
    const sourceCardIdParam = params.get('sourceCardId');
    const sourceProjectIdParam = params.get('sourceProjectId');
    const orderIdParam = params.get('orderId');
    const planId = payloadFromStorage?.planId ?? (planIdParam ? Number(planIdParam) : null);
    const assetId = payloadFromStorage?.assetId ?? (assetIdParam ? Number(assetIdParam) : null);
    const sourceCardId = payloadFromStorage?.sourceCardId ?? (sourceCardIdParam ? Number(sourceCardIdParam) : null);
    const sourceProjectId = payloadFromStorage?.sourceProjectId ?? (sourceProjectIdParam ? Number(sourceProjectIdParam) : null);
    const orderId = detailIntentFromStorage?.orderId ?? (orderIdParam ? Number(orderIdParam) : null);

    if (tabParam && ['dashboard', 'relatorio', 'planos', 'ordens', 'calendario', 'notifs'].includes(tabParam)) {
      setTab(tabParam as any);
    }

    if ((shouldOpenDetail || orderIdParam || detailIntentFromStorage) && orderId && !Number.isNaN(orderId)) {
      setTab('ordens');
      setOrderOriginContext({
        sourceProjectId: detailIntentFromStorage?.sourceProjectId ?? (sourceProjectId && !Number.isNaN(sourceProjectId) ? sourceProjectId : null),
        sourceProjectTitle: detailIntentFromStorage?.sourceProjectTitle ?? 'Kanban',
        sourceCardId: detailIntentFromStorage?.sourceCardId ?? (sourceCardId && !Number.isNaN(sourceCardId) ? sourceCardId : null),
        sourceCardTitle: detailIntentFromStorage?.sourceCardTitle ?? null,
      });
      void openOrderDetail(orderId);

      if (detailIntentFromStorage) {
        window.setTimeout(() => {
          sessionStorage.removeItem(preventiveOrderDetailIntentStorageKey);
        }, 2000);
      }

      params.delete('openDetail');
      params.delete('orderId');
      params.delete('sourceProjectId');
      params.delete('sourceCardId');
      const nextDetailQuery = params.toString();
      const nextDetailUrl = `${window.location.pathname}${nextDetailQuery ? `?${nextDetailQuery}` : ''}`;
      window.history.replaceState({}, '', nextDetailUrl);
      return;
    }

    if (!shouldOpenOrder && !payloadFromStorage) return;

    setTab('ordens');
    setOrderOriginContext({
      sourceProjectId: payloadFromStorage?.sourceProjectId ?? (sourceProjectId && !Number.isNaN(sourceProjectId) ? sourceProjectId : null),
      sourceProjectTitle: payloadFromStorage?.sourceProjectTitle ?? 'Kanban',
      sourceCardId: payloadFromStorage?.sourceCardId ?? (sourceCardId && !Number.isNaN(sourceCardId) ? sourceCardId : null),
      sourceCardTitle: payloadFromStorage?.sourceCardTitle ?? null,
    });
    void openOrderModal({
      planId: planId && !Number.isNaN(planId) ? planId : null,
      assetId: assetId && !Number.isNaN(assetId) ? assetId : null,
      sourceCardId: sourceCardId && !Number.isNaN(sourceCardId) ? sourceCardId : null,
    });

    if (payloadFromStorage) {
      window.setTimeout(() => {
        sessionStorage.removeItem(preventiveOrderIntentStorageKey);
      }, 2000);
    }

    params.delete('openOrder');
    params.delete('planId');
    params.delete('assetId');
    params.delete('sourceProjectId');
    params.delete('sourceCardId');
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
    window.history.replaceState({}, '', nextUrl);
  }, [location.search]);

  const loadChecklistDraftsFromPlan = async (planId: number | null) => {
    if (!planId) {
      setOrderChecklistDrafts([createEmptyChecklistDraft()]);
      return;
    }
    try {
      const detail = await preventiveApi.getPlan(planId);
      const drafts = (detail.plan.checklists ?? []).map((checklist) => ({
        nome: checklist.nome,
        items: checklist.items.length > 0
          ? checklist.items.map((item) => ({
              descricao: item.descricao,
              obrigatorio: item.obrigatorio,
              requer_foto: item.requer_foto,
            }))
          : [createEmptyChecklistItem()],
      }));
      setOrderChecklistDrafts(drafts.length > 0 ? drafts : [createEmptyChecklistDraft()]);
    } catch (err) {
      showError(err);
    }
  };

  const submitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await preventiveApi.createOrder({
        tipo: oTipo,
        prioridade: oPrio,
        descricao: oDesc,
        asset_id: oAsset ?? undefined,
        infra_predial_servico: oInfra || undefined,
        tecnico_id: oTecnico ?? undefined,
        plan_id: oPlan ?? undefined,
        source_card_id: oSourceCardId ?? undefined,
        data_agendada: oAgendada ? new Date(oAgendada).toISOString() : undefined,
        checklists: serializeChecklistDrafts(),
      });
      setOrderModal(false);
      fetchAll();
    } catch (err) {
      showError(err);
    }
  };

  const openOrderDetail = async (orderId: number) => {
    try {
      const detail = await preventiveApi.getOrder(orderId);
      setOrderDetail(normalizeOrderDetail(detail));
      setMProduto('');
      setMQuantidade('1');
      setMValorUnitario('');
      setMObservacao('');
      setPhotoTipo('Durante');
      setPhotoDescricao('');
      setPhotoFile(null);
      setCompleteModal(false);
      setCompletionDiagnosis('');
      setCompletionSolution('');
      setCompletionRecommendations('');
      setCompletionAssetDestination('Disponível');
      setCompletionExtraCost('');
    } catch (err) {
      showError(err);
    }
  };

  const orderAction = async (orderId: number, action: 'iniciar' | 'pausar' | 'concluir' | 'cancelar') => {
    try {
      if (action === 'iniciar') await preventiveApi.startOrder(orderId);
      else if (action === 'pausar') await preventiveApi.pauseOrder(orderId);
      else if (action === 'cancelar') {
        if (!window.confirm('Cancelar esta ordem de serviço?')) return;
        await preventiveApi.cancelOrder(orderId);
      }
      else {
        setCompleteModal(true);
        return;
      }
      await openOrderDetail(orderId);
      fetchAll();
    } catch (err) {
      showError(err);
    }
  };

  const refreshOrderDetail = async () => {
    if (orderDetail) await openOrderDetail(orderDetail.order.id);
  };

  const submitMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderDetail) return;
    try {
      await preventiveApi.addMaterial(orderDetail.order.id, {
        stock_id: mStockId ?? undefined,
        product_id: mStockId ? stockItems.find((item) => item.id === mStockId)?.product_id : undefined,
        produto: mProduto,
        quantidade: Number(mQuantidade),
        valor_unitario: Number(mValorUnitario),
        observacao: mObservacao || undefined,
      });
      setMProduto('');
      setMStockId(null);
      setMQuantidade('1');
      setMValorUnitario('');
      setMObservacao('');
      procurementApi.listStock().then(setStockItems).catch(() => {});
      await refreshOrderDetail();
    } catch (err) {
      showError(err);
    }
  };

  const deleteOrder = async (orderId: number) => {
    if (!window.confirm('Excluir esta ordem de serviço? Essa ação não poderá ser desfeita.')) return;
    try {
      await preventiveApi.deleteOrder(orderId);
      setOrderDetail(null);
      await fetchAll();
    } catch (err) {
      showError(err);
    }
  };

  const submitPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderDetail || !photoFile) {
      setError('Selecione uma foto para anexar na OS.');
      setTimeout(() => setError(null), 5000);
      return;
    }
    try {
      await preventiveApi.uploadPhoto(orderDetail.order.id, photoFile, photoTipo, photoDescricao || undefined);
      setPhotoTipo('Durante');
      setPhotoDescricao('');
      setPhotoFile(null);
      await refreshOrderDetail();
    } catch (err) {
      showError(err);
    }
  };

  const submitCompletion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderDetail) return;

    const requiredChecklistItems = orderDetail.checklists.flatMap((checklist) => checklist.items).filter((item) => item.obrigatorio);
    const completedRequired = requiredChecklistItems.filter((item) =>
      orderDetail.order.executions.some((execution) => execution.checklist_item_id === item.id && execution.concluido)
    );

    if (requiredChecklistItems.length > 0 && completedRequired.length !== requiredChecklistItems.length) {
      setError('Finalize todos os itens obrigatórios do checklist antes de concluir a OS.');
      setTimeout(() => setError(null), 5000);
      return;
    }

    if (orderDetail.order.photos.length === 0) {
      setError('Anexe pelo menos uma evidência fotográfica antes de concluir a OS.');
      setTimeout(() => setError(null), 5000);
      return;
    }

    try {
      await preventiveApi.completeOrder(orderDetail.order.id, {
        diagnostico: completionDiagnosis,
        solucao: completionSolution,
        recomendacoes: completionRecommendations || undefined,
        status_pos_manutencao: completionAssetDestination,
        custo_total: completionExtraCost || undefined,
      });
      setCompleteModal(false);
      setCompletionDiagnosis('');
      setCompletionSolution('');
      setCompletionRecommendations('');
      setCompletionAssetDestination('Disponível');
      setCompletionExtraCost('');
      await openOrderDetail(orderDetail.order.id);
      fetchAll();
    } catch (err) {
      showError(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-wider font-mono text-brand-text m-0">
            Manutenção Preventiva
          </h1>
          <p className="text-brand-muted text-sm mt-1">
            Planos, ordens de serviço e checklists de manutenção.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 border border-red-500/30 bg-red-500/5 text-red-400 text-xs font-mono flex items-center space-x-2">
          <ShieldAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs with smooth touch horizontal scroll */}
      <div className="w-full min-w-0 max-w-full overflow-x-auto border-b border-brand-border flex items-center gap-1.5 pb-0.5 no-scrollbar scroll-smooth">
        {([
          ['dashboard', 'Dashboard'],
          ['relatorio', 'Relatório geral'],
          ['planos', 'Planos'],
          ['ordens', 'Ordens de Serviço'],
          ['calendario', 'Calendário'],
          ['notifs', `Notificações${unreadNotifications > 0 ? ` (${unreadNotifications})` : ''}`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`shrink-0 whitespace-nowrap px-4 py-2.5 font-mono text-xs uppercase tracking-wider rounded-t-lg border-b-2 transition-all cursor-pointer ${
              tab === key
                ? 'border-brand-primary bg-white text-brand-primary font-bold shadow-sm'
                : 'border-transparent bg-white/40 text-brand-text opacity-70 hover:opacity-100 hover:bg-white/70'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="p-12 text-center flex flex-col items-center justify-center space-y-4">
          <div className="w-8 h-8 border-2 border-brand-primary border-t-transparent animate-spin" />
          <span className="font-mono text-xs text-brand-muted uppercase">Carregando...</span>
        </div>
      )}

      {/* ---------- DASHBOARD ---------- */}
      {!loading && tab === 'dashboard' && dash && (
        <div className="space-y-5">
          <section className="relative overflow-hidden rounded-2xl border border-brand-primary/20 bg-gradient-to-br from-[#0c66e4] via-[#1559b7] to-[#172b4d] p-5 text-white shadow-lg md:p-7">
            <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-blue-100"><Wrench size={14} /> Central de manutenção</div>
                <h2 className="m-0 max-w-xl text-2xl font-bold tracking-tight md:text-3xl">Operação preventiva sob controle.</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">Acompanhe o que precisa de atenção, organize a agenda e mantenha os ativos disponíveis.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canWorkOrder && <button onClick={() => void openOrderModal()} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-brand-primary shadow-sm hover:bg-blue-50"><Plus size={15} /> Nova OS</button>}
                {canEditStructure && <button onClick={() => openPlanModal()} className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-white/20"><ClipboardList size={15} /> Novo plano</button>}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              { label: 'Planos ativos', value: dash.active_plans, hint: `${dash.total_plans} no total`, icon: ClipboardList, tone: 'text-blue-600 bg-blue-50' },
              { label: 'Planos vencendo', value: dash.plans_due, hint: 'próximos 7 dias', icon: CalendarDays, tone: 'text-amber-600 bg-amber-50' },
              { label: 'OS abertas', value: dash.open_orders, hint: 'aguardando ação', icon: Wrench, tone: 'text-orange-600 bg-orange-50' },
              { label: 'OS nesta semana', value: dash.due_soon, hint: 'agenda próxima', icon: CalendarDays, tone: 'text-cyan-600 bg-cyan-50' },
              { label: 'OS concluídas', value: dash.orders_by_status['Concluída'] ?? 0, hint: `${dash.total_orders} no total`, icon: CheckCircle2, tone: 'text-emerald-600 bg-emerald-50' },
              { label: 'Alertas pendentes', value: unreadNotifications, hint: 'notificações não lidas', icon: Bell, tone: 'text-violet-600 bg-violet-50' },
            ].map(({ label, value, hint, icon: Icon, tone }) => (
              <div key={label} className="rounded-2xl border border-brand-border bg-brand-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2"><span className={`rounded-xl p-2 ${tone}`}><Icon size={17} /></span><span className="text-2xl font-bold tracking-tight text-brand-text">{value}</span></div>
                <div className="mt-4 text-xs font-bold uppercase tracking-wide text-brand-text">{label}</div>
                <div className="mt-1 text-xs text-brand-muted">{hint}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.75fr)]">
            <section className="rounded-2xl border border-brand-border bg-brand-card p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-[0.12em] text-brand-muted">Agenda operacional</div><h3 className="mt-1 text-lg font-bold text-brand-text">Próximas ordens de serviço</h3></div><button onClick={() => setTab('calendario')} className="text-xs font-bold uppercase tracking-wide text-brand-primary hover:underline">Ver calendário</button></div>
              <div className="space-y-2">
                {dashboardUpcomingOrders.map(({ order, eventDate }) => (
                  <button key={order.id} onClick={() => openOrderDetail(order.id)} className="group flex w-full items-center gap-3 rounded-xl border border-brand-border bg-brand-dark/10 p-3 text-left hover:border-brand-primary/40 hover:bg-brand-primary/5">
                    <div className="min-w-[46px] rounded-lg bg-brand-primary/10 px-2 py-1.5 text-center"><div className="text-[10px] font-bold uppercase text-brand-primary">{eventDate?.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</div><div className="text-lg font-bold leading-none text-brand-primary">{eventDate?.getDate()}</div></div>
                    <div className="min-w-0 flex-1"><div className="text-xs font-bold uppercase text-brand-primary">{order.numero}</div><div className="mt-0.5 truncate text-sm font-semibold text-brand-text">{order.asset?.nome ?? order.infra_predial_servico ?? 'Serviço'}</div><div className="mt-0.5 truncate text-xs text-brand-muted">{order.tecnico?.nome ?? 'Sem técnico'} · {order.tipo}</div></div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${statusColor[order.status] ?? 'border-brand-border text-brand-muted'}`}>{order.status}</span>
                  </button>
                ))}
                {dashboardUpcomingOrders.length === 0 && <div className="rounded-xl border border-dashed border-brand-border p-8 text-center text-sm text-brand-muted">Nenhuma OS programada no momento.</div>}
              </div>
            </section>

            <section className="rounded-2xl border border-brand-border bg-brand-card p-5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.12em] text-brand-muted">Visão do fluxo</div><h3 className="mt-1 text-lg font-bold text-brand-text">Ordens por status</h3>
              <div className="mt-5 space-y-4">
                {Object.entries(dash.orders_by_status).map(([status, count]) => <div key={status}><div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-semibold text-brand-text">{status}</span><span className="font-mono text-brand-muted">{count}</span></div><div className="h-2 overflow-hidden rounded-full bg-brand-dark/10"><div className="h-full rounded-full bg-brand-primary transition-all" style={{ width: `${Math.max((count / dashboardStatusTotal) * 100, count ? 6 : 0)}%` }} /></div></div>)}
                {Object.keys(dash.orders_by_status).length === 0 && <div className="py-6 text-center text-sm text-brand-muted">Ainda não há dados de status.</div>}
              </div>
              <div className="mt-6 grid grid-cols-2 gap-2"><button onClick={() => setTab('ordens')} className="rounded-xl border border-brand-border px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-brand-text hover:border-brand-primary/40">Todas as OS</button><button onClick={() => setTab('notifs')} className="rounded-xl bg-brand-primary px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-blue-700">Ver alertas</button></div>
            </section>
          </div>

          {dashboardAttentionOrders.length > 0 && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="flex items-start gap-3"><div className="rounded-xl bg-amber-100 p-2 text-amber-700"><ShieldAlert size={18} /></div><div className="flex-1"><div className="text-xs font-bold uppercase tracking-[0.12em] text-amber-700">Atenção necessária</div><h3 className="mt-1 text-lg font-bold text-amber-950">{dashboardAttentionOrders.length} {dashboardAttentionOrders.length === 1 ? 'ordem precisa' : 'ordens precisam'} de acompanhamento</h3><p className="mt-1 text-sm text-amber-800">Há ordens pausadas ou aguardando peça. Revise os detalhes para evitar atrasos.</p></div><button onClick={() => setTab('ordens')} className="shrink-0 rounded-xl border border-amber-300 bg-white/60 px-3 py-2 text-xs font-bold uppercase tracking-wide text-amber-800">Revisar</button></div></section>}

          <section className="rounded-2xl border border-brand-border bg-brand-card p-5 shadow-sm"><div className="mb-4 flex items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-[0.12em] text-brand-muted">Equipe</div><h3 className="mt-1 text-lg font-bold text-brand-text">Desempenho dos técnicos</h3></div><span className="text-xs text-brand-muted">Aderência e tempo médio</span></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{dash.technician_performance.map((tech) => <div key={tech.user_id} className="rounded-xl border border-brand-border bg-brand-dark/10 p-4"><div className="flex items-center justify-between"><span className="font-semibold text-brand-text">{tech.nome}</span><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">{tech.required_completion_rate.toFixed(0)}%</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div><div className="text-lg font-bold text-brand-text">{tech.assigned_orders}</div><div className="text-[10px] uppercase text-brand-muted">Atribuídas</div></div><div><div className="text-lg font-bold text-brand-text">{tech.in_progress_orders}</div><div className="text-[10px] uppercase text-brand-muted">Andamento</div></div><div><div className="text-lg font-bold text-brand-text">{tech.completed_orders}</div><div className="text-[10px] uppercase text-brand-muted">Concluídas</div></div></div><div className="mt-3 border-t border-brand-border pt-2 text-xs text-brand-muted">Tempo médio <span className="float-right font-bold text-brand-primary">{formatMinutes(tech.avg_resolution_minutes)}</span></div></div>)}{dash.technician_performance.length === 0 && <div className="col-span-full rounded-xl border border-dashed border-brand-border p-6 text-center text-sm text-brand-muted">Ainda não há indicadores suficientes para exibir desempenho técnico.</div>}</div></section>
        </div>
      )}

      {/* ---------- RELATÓRIO GERAL ---------- */}
      {!loading && tab === 'relatorio' && (
        <div className="space-y-5">
          <section className="relative overflow-hidden rounded-2xl border border-brand-primary/20 bg-gradient-to-br from-[#172b4d] via-[#1559b7] to-[#0c66e4] p-5 text-white shadow-lg md:p-7">
            <div className="absolute -right-12 -top-20 h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-blue-100"><BarChart3 size={14} /> Inteligência operacional</div>
                <h2 className="m-0 max-w-2xl text-2xl font-bold tracking-tight md:text-3xl">Relatório geral de manutenção.</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">Uma leitura técnica de tudo que foi planejado, executado, concluído e ainda precisa de atenção.</p>
              </div>
              <button onClick={exportPreventiveReport} disabled={exportingReport} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-brand-primary shadow-sm hover:bg-blue-50 disabled:cursor-wait disabled:opacity-70">
                <FileDown size={16} /> {exportingReport ? 'Gerando PDF...' : 'Exportar relatório PDF'}
              </button>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: 'Ordens analisadas', value: orders.length, hint: `${reportOpenOrders.length} em aberto`, icon: ClipboardList, tone: 'text-blue-600 bg-blue-50' },
              { label: 'Taxa de conclusão', value: `${reportCompletionRate.toFixed(0)}%`, hint: `${reportCompletedOrders.length} concluídas`, icon: TrendingUp, tone: 'text-emerald-600 bg-emerald-50' },
              { label: 'Tempo médio', value: formatMinutes(Math.round(reportAverageMinutes)), hint: 'ordens concluídas', icon: Timer, tone: 'text-amber-600 bg-amber-50' },
              { label: 'Custo registrado', value: formatReportCurrency(reportTotalCost), hint: `${reportTotalPhotos} fotos de evidência`, icon: DollarSign, tone: 'text-violet-600 bg-violet-50' },
            ].map(({ label, value, hint, icon: Icon, tone }) => (
              <div key={label} className="rounded-2xl border border-brand-border bg-brand-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2"><span className={`rounded-xl p-2 ${tone}`}><Icon size={17} /></span><span className="text-right text-xl font-bold tracking-tight text-brand-text md:text-2xl">{value}</span></div>
                <div className="mt-4 text-xs font-bold uppercase tracking-wide text-brand-text">{label}</div>
                <div className="mt-1 text-xs text-brand-muted">{hint}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
            <section className="rounded-2xl border border-brand-border bg-brand-card p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between"><div><div className="text-xs font-bold uppercase tracking-[0.12em] text-brand-muted">Leitura técnica</div><h3 className="mt-1 text-lg font-bold text-brand-text">Indicadores de execução</h3></div><span className="text-xs text-brand-muted">Base atualizada</span></div>
              <div className="space-y-4">
                {[
                  { label: 'Conclusão das ordens', value: reportCompletionRate, detail: reportCompletionRate >= 80 ? 'Ritmo saudável de execução' : 'Aumentar o acompanhamento das pendências', color: 'bg-emerald-500' },
                  { label: 'Checklists preenchidos', value: reportChecklistRate, detail: reportChecklistRate >= 90 ? 'Boa aderência aos procedimentos' : 'Reforçar evidências e rotinas técnicas', color: 'bg-blue-500' },
                  { label: 'Ordens em atenção', value: reportAttentionRate, detail: dashboardAttentionOrders.length > 0 ? `${dashboardAttentionOrders.length} aguardando peça ou pausada` : 'Nenhuma ordem crítica na fila', color: 'bg-amber-500' },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-brand-text">{item.label}</span><span className="font-mono font-bold text-brand-primary">{item.value.toFixed(0)}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-brand-dark/10"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${Math.min(100, Math.max(item.value, item.value > 0 ? 6 : 0))}%` }} /></div>
                    <div className="mt-1 text-[11px] text-brand-muted">{item.detail}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-brand-border bg-brand-card p-5 shadow-sm">
              <div className="mb-4"><div className="text-xs font-bold uppercase tracking-[0.12em] text-brand-muted">Distribuição da carga</div><h3 className="mt-1 text-lg font-bold text-brand-text">Ordens por prioridade</h3></div>
              <div className="space-y-3">
                {PM_PRIORITIES.map((priority) => {
                  const count = reportPriorityCounts[priority] || 0;
                  return <div key={priority}><div className="mb-1 flex justify-between text-xs"><span className="font-semibold text-brand-text">{priority}</span><span className="font-mono text-brand-muted">{count}</span></div><div className="h-2 overflow-hidden rounded-full bg-brand-dark/10"><div className={`h-full rounded-full ${priority === 'Urgente' ? 'bg-red-500' : priority === 'Alta' ? 'bg-amber-500' : priority === 'Média' ? 'bg-blue-500' : 'bg-slate-400'}`} style={{ width: `${Math.max((count / Math.max(orders.length, 1)) * 100, count ? 6 : 0)}%` }} /></div></div>;
                })}
              </div>
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{dashboardAttentionOrders.length > 0 ? 'Priorize as ordens aguardando peça ou pausadas para reduzir o tempo parado.' : 'A fila não possui ordens pausadas ou aguardando peça no momento.'}</div>
            </section>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-2xl border border-brand-border bg-brand-card p-5 shadow-sm"><div className="mb-4"><div className="text-xs font-bold uppercase tracking-[0.12em] text-brand-muted">Cobertura da equipe</div><h3 className="mt-1 text-lg font-bold text-brand-text">Distribuição por técnico</h3></div><div className="space-y-2">{Object.entries(reportTechnicianCounts).sort(([, a], [, b]) => b - a).map(([technician, count]) => <div key={technician} className="flex items-center justify-between rounded-xl border border-brand-border bg-brand-dark/10 px-3 py-2.5 text-sm"><span className="font-medium text-brand-text">{technician}</span><span className="rounded-full bg-brand-primary/10 px-2 py-1 text-xs font-bold text-brand-primary">{count} OS</span></div>)}{Object.keys(reportTechnicianCounts).length === 0 && <div className="rounded-xl border border-dashed border-brand-border p-6 text-center text-sm text-brand-muted">Sem responsáveis registrados.</div>}</div></section>
            <section className="rounded-2xl border border-brand-border bg-brand-card p-5 shadow-sm"><div className="mb-4 flex items-start justify-between"><div><div className="text-xs font-bold uppercase tracking-[0.12em] text-brand-muted">Rastreamento</div><h3 className="mt-1 text-lg font-bold text-brand-text">Ordens concluídas recentemente</h3></div><button onClick={() => setTab('ordens')} className="text-xs font-bold uppercase tracking-wide text-brand-primary hover:underline">Ver todas</button></div><div className="space-y-2">{[...reportCompletedOrders].sort((a, b) => new Date(b.data_conclusao || b.data_abertura).getTime() - new Date(a.data_conclusao || a.data_abertura).getTime()).slice(0, 5).map((order) => <button key={order.id} onClick={() => openOrderDetail(order.id)} className="flex w-full items-center gap-3 rounded-xl border border-brand-border bg-brand-dark/10 p-3 text-left hover:border-brand-primary/40"><div className="rounded-lg bg-emerald-50 p-2 text-emerald-600"><CheckCircle2 size={16} /></div><div className="min-w-0 flex-1"><div className="text-xs font-bold uppercase text-brand-primary">{order.numero}</div><div className="truncate text-sm font-semibold text-brand-text">{order.asset?.nome || order.infra_predial_servico || 'Serviço'}</div></div><div className="shrink-0 text-right text-[10px] text-brand-muted">{order.data_conclusao ? new Date(order.data_conclusao).toLocaleDateString('pt-BR') : 'Concluída'}</div></button>)}{reportCompletedOrders.length === 0 && <div className="rounded-xl border border-dashed border-brand-border p-6 text-center text-sm text-brand-muted">Ainda não há ordens concluídas.</div>}</div></section>
          </div>
        </div>
      )}

      {/* ---------- PLANOS ---------- */}
      {!loading && tab === 'planos' && (
        <div className="space-y-4">
          {canEditStructure && (
            <div className="flex justify-end">
              <button
                onClick={() => openPlanModal()}
                className="bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold font-mono px-4 py-2.5 uppercase tracking-wider text-xs flex items-center space-x-1.5"
              >
                <Plus size={16} />
                <span>Novo Plano</span>
              </button>
            </div>
          )}

          <div className="border border-brand-border bg-brand-card overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-brand-border bg-brand-dark/20 text-xs font-mono uppercase tracking-wider text-brand-muted">
                  <th className="p-4">Código</th>
                  <th className="p-4">Nome</th>
                  <th className="p-4">Tipo / Period.</th>
                  <th className="p-4">Prioridade</th>
                  <th className="p-4">Próx. execução</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/60 text-sm">
                {plans.map((p) => (
                  <tr key={p.id} className="hover:bg-brand-dark/10">
                    <td className="p-4 font-mono text-xs text-brand-primary">{p.codigo}</td>
                    <td className="p-4 font-medium text-brand-text">{p.nome}</td>
                    <td className="p-4">
                      <div className="text-brand-text">{p.tipo}</div>
                      <div className="text-xs text-brand-muted">{p.periodicidade}</div>
                    </td>
                    <td className="p-4 text-brand-text">{p.prioridade}</td>
                    <td className="p-4 font-mono text-xs">
                      {new Date(p.proxima_execucao).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="p-4">
                      <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 border ${p.ativo ? 'border-green-500/30 text-green-400' : 'border-brand-border text-brand-muted'}`}>
                        {p.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="p-4 text-right whitespace-nowrap">
                      <button onClick={() => openPlanDetail(p.id)} className="text-brand-primary border border-brand-primary/30 px-2.5 py-1.5 font-mono text-xs uppercase mr-2 hover:bg-brand-primary/10">
                        <ClipboardList size={12} className="inline mr-1" /> Detalhes
                      </button>
                      {canEditStructure && (
                        <>
                          <button onClick={() => openPlanModal(p)} className="text-brand-primary border border-brand-primary/30 px-2.5 py-1.5 font-mono text-xs uppercase mr-2 hover:bg-brand-primary/10">
                            <Edit2 size={12} className="inline mr-1" /> Editar
                          </button>
                          <button onClick={() => deletePlan(p)} className="text-red-400 border border-red-500/30 px-2.5 py-1.5 font-mono text-xs uppercase hover:bg-red-500/10">
                            <Trash2 size={12} className="inline mr-1" /> Excluir
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {plans.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-brand-muted font-mono text-sm">
                      Nenhum plano cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------- ORDENS ---------- */}
      {!loading && tab === 'ordens' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <select
              value={orderStatusFilter}
              onChange={(e) => setOrderStatusFilter(e.target.value)}
              className="bg-brand-dark border border-brand-border px-3 py-2 text-sm font-mono text-brand-text focus:outline-none focus:border-brand-primary"
            >
              <option value="">Todos os status</option>
              {PM_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {canWorkOrder && (
              <button
                onClick={() => {
                  void openOrderModal();
                }}
                className="bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold font-mono px-4 py-2.5 uppercase tracking-wider text-xs flex items-center space-x-1.5"
              >
                <Plus size={16} />
                <span>Nova OS</span>
              </button>
            )}
          </div>

          <div className="border border-brand-border bg-brand-card overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-brand-border bg-brand-dark/20 text-xs font-mono uppercase tracking-wider text-brand-muted">
                  <th className="p-4">OS</th>
                  <th className="p-4">Ativo</th>
                  <th className="p-4">Tipo</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Prioridade</th>
                  <th className="p-4">Abertura</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/60 text-sm">
                {orders.filter((o) => !orderStatusFilter || o.status === orderStatusFilter).map((o) => (
                  <tr key={o.id} className="hover:bg-brand-dark/10">
                    <td className="p-4 font-mono text-xs text-brand-primary">{o.numero}</td>
                    <td className="p-4">
                      <div className="text-brand-text">{o.asset?.nome ?? o.infra_predial_servico ?? '—'}</div>
                      {o.asset?.e_patrimonio && <div className="text-xs text-brand-muted font-mono">{o.asset.e_patrimonio}</div>}
                    </td>
                    <td className="p-4 text-brand-text">{o.tipo}</td>
                    <td className="p-4">
                      <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 border ${statusColor[o.status] ?? 'border-brand-border'}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="p-4 text-brand-text">{o.prioridade}</td>
                    <td className="p-4">
                      <div className="font-mono text-xs">{new Date(o.data_abertura).toLocaleDateString('pt-BR')}</div>
                      <div className="font-mono text-[11px] text-brand-primary mt-1">
                        {formatMinutes(calculateElapsedMinutes(o))}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <button onClick={() => openOrderDetail(o.id)} className="text-brand-primary border border-brand-primary/30 px-2.5 py-1.5 font-mono text-xs uppercase hover:bg-brand-primary/10">
                        <FileText size={12} className="inline mr-1" /> Abrir
                      </button>
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-brand-muted font-mono text-sm">
                      Nenhuma ordem de serviço.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------- CALENDÁRIO ---------- */}
      {!loading && tab === 'calendario' && (
        <div className="space-y-4">
          <div className="border border-brand-border bg-brand-card p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-brand-text">
                <CalendarDays size={16} className="text-brand-primary" />
                <span className="font-mono text-xs uppercase tracking-wider text-brand-muted">Calendário de OS</span>
              </div>
              <h3 className="mt-2 text-xl font-bold font-mono uppercase tracking-wider text-brand-text">
                {calendarMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </h3>
              <p className="text-sm text-brand-muted mt-1">
                Visualização das ordens programadas e futuras com foco em agenda operacional.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center border border-brand-border">
                <button
                  onClick={() => setCalendarView('mensal')}
                  className={`px-3 py-2 font-mono text-xs uppercase ${calendarView === 'mensal' ? 'bg-brand-primary text-brand-dark' : 'text-brand-text hover:bg-brand-dark/20'}`}
                >
                  Mensal
                </button>
                <button
                  onClick={() => setCalendarView('semanal')}
                  className={`px-3 py-2 font-mono text-xs uppercase ${calendarView === 'semanal' ? 'bg-brand-primary text-brand-dark' : 'text-brand-text hover:bg-brand-dark/20'}`}
                >
                  Semanal
                </button>
              </div>
              <button
                onClick={() => setCalendarMonth(calendarView === 'mensal' ? addMonths(calendarMonth, -1) : addDays(calendarMonth, -7))}
                className="border border-brand-border px-3 py-2 text-brand-text hover:bg-brand-dark/20"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setCalendarMonth(startOfMonth(new Date()))}
                className="border border-brand-border px-3 py-2 font-mono text-xs uppercase text-brand-text hover:bg-brand-dark/20"
              >
                Hoje
              </button>
              <button
                onClick={() => setCalendarMonth(calendarView === 'mensal' ? addMonths(calendarMonth, 1) : addDays(calendarMonth, 7))}
                className="border border-brand-border px-3 py-2 text-brand-text hover:bg-brand-dark/20"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="border border-brand-border bg-brand-card p-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-brand-muted mb-1.5">Filtrar por status</label>
              <select
                value={calendarStatusFilter}
                onChange={(e) => setCalendarStatusFilter(e.target.value)}
                className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm font-mono text-brand-text focus:outline-none focus:border-brand-primary"
              >
                <option value="">Todos</option>
                {PM_STATUSES.filter((status) => !['Concluída', 'Cancelada'].includes(status)).map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-brand-muted mb-1.5">Filtrar por técnico</label>
              <select
                value={calendarTechFilter}
                onChange={(e) => setCalendarTechFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm font-mono text-brand-text focus:outline-none focus:border-brand-primary"
              >
                <option value="all">Todos</option>
                {techs.map((tech) => (
                  <option key={tech.id} value={tech.id}>{tech.nome}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <div className="w-full border border-brand-border bg-brand-dark/20 px-3 py-2">
                <div className="text-[11px] font-mono uppercase tracking-wider text-brand-muted">Ordens visíveis</div>
                <div className="mt-1 text-lg font-mono text-brand-primary">{filteredUpcomingOrders.length}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
            <div className="border border-brand-border bg-brand-card overflow-hidden rounded-2xl shadow-sm">
              {calendarView === 'mensal' ? (
                <div className="w-full overflow-x-auto no-scrollbar touch-pan-x">
                  <div className="min-w-[600px] md:min-w-0">
                    <div className="grid grid-cols-7 border-b border-brand-border bg-brand-dark/20">
                      {weekdayLabels.map((label) => (
                        <div key={label} className="p-2.5 text-center text-[11px] font-mono uppercase tracking-wider text-brand-muted font-bold">
                          {label}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7">
                      {calendarCells.map(({ date, inMonth }) => {
                        const dayOrders = filteredUpcomingOrders.filter(({ eventDate }) => eventDate && isSameDay(eventDate, date));
                        const isToday = isSameDay(date, today);
                        return (
                          <div
                            key={date.toISOString()}
                            className={`min-h-28 md:min-h-36 border-r border-b border-brand-border p-1.5 md:p-2 align-top ${
                              inMonth ? 'bg-brand-card' : 'bg-brand-dark/10'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span
                                className={`text-xs font-mono px-1.5 py-0.5 rounded-md ${
                                  isToday
                                    ? 'bg-brand-primary text-white font-bold shadow-sm'
                                    : inMonth
                                      ? 'text-brand-text font-semibold'
                                      : 'text-brand-muted opacity-50'
                                }`}
                              >
                                {date.getDate()}
                              </span>
                              {dayOrders.length > 0 && (
                                <span className="text-[10px] font-mono font-bold uppercase text-brand-primary bg-brand-primary/10 px-1 rounded">
                                  {dayOrders.length} OS
                                </span>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              {dayOrders.slice(0, 3).map(({ order }) => (
                                <button
                                  key={order.id}
                                  onClick={() => openOrderDetail(order.id)}
                                  className={`w-full text-left border p-1.5 rounded-lg hover:bg-brand-primary/10 transition-all cursor-pointer ${criticalityColor[order.criticidade] ?? 'border-brand-primary/20 bg-brand-dark/20 text-brand-text'}`}
                                >
                                  <div className="text-[10px] font-mono font-bold uppercase text-brand-primary truncate">{order.numero}</div>
                                  <div className="text-xs text-brand-text truncate leading-tight">{order.asset?.nome ?? order.infra_predial_servico ?? 'Serviço'}</div>
                                  <div className="mt-1 flex items-center justify-between gap-1">
                                    <span className={`text-[9px] font-mono uppercase px-1 py-0.2 rounded border ${statusColor[order.status] ?? 'border-brand-border'}`}>
                                      {order.status}
                                    </span>
                                    <span className="text-[9px] font-mono">{order.criticidade}</span>
                                  </div>
                                </button>
                              ))}
                              {dayOrders.length > 3 && (
                                <div className="text-[10px] font-mono uppercase text-brand-muted px-1">
                                  +{dayOrders.length - 3} adicional(is)
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full overflow-x-auto no-scrollbar touch-pan-x">
                  <div className="min-w-[600px] md:min-w-0 grid grid-cols-1 md:grid-cols-7">
                    {weekDays.map((date) => {
                      const dayOrders = weekOrders.filter(({ eventDate }) => eventDate && isSameDay(eventDate, date));
                      const isToday = isSameDay(date, today);
                      return (
                        <div key={date.toISOString()} className="min-h-72 border-r border-b border-brand-border p-2.5">
                          <div className="flex items-center justify-between mb-2.5">
                            <div>
                              <div className="text-[11px] font-mono uppercase tracking-wider text-brand-muted font-bold">
                                {weekdayLabels[date.getDay()]}
                              </div>
                              <div className={`mt-0.5 inline-flex px-1.5 py-0.5 rounded text-xs font-mono ${isToday ? 'bg-brand-primary text-white font-bold' : 'text-brand-text border border-brand-border'}`}>
                                {date.toLocaleDateString('pt-BR')}
                              </div>
                            </div>
                            <span className="text-[10px] font-mono font-bold uppercase text-brand-primary bg-brand-primary/10 px-1 rounded">{dayOrders.length} OS</span>
                          </div>
                          <div className="space-y-1.5">
                            {dayOrders.map(({ order }) => (
                              <button
                                key={order.id}
                                onClick={() => openOrderDetail(order.id)}
                                className={`w-full text-left border p-1.5 rounded-lg hover:bg-brand-primary/10 transition-all cursor-pointer ${criticalityColor[order.criticidade] ?? 'border-brand-primary/20 bg-brand-dark/20 text-brand-text'}`}
                              >
                                <div className="text-[10px] font-mono font-bold uppercase text-brand-primary">{order.numero}</div>
                                <div className="text-xs text-brand-text mt-0.5 truncate leading-tight">{order.asset?.nome ?? order.infra_predial_servico ?? 'Serviço'}</div>
                                <div className="text-[10px] text-brand-muted mt-0.5 truncate">{order.tecnico?.nome ?? 'Sem técnico'}</div>
                                <div className="mt-1.5 flex items-center justify-between gap-1">
                                  <span className={`text-[9px] font-mono uppercase px-1 py-0.2 rounded border ${statusColor[order.status] ?? 'border-brand-border'}`}>
                                    {order.status}
                                  </span>
                                  <span className="text-[9px] font-mono">{order.criticidade}</span>
                                </div>
                              </button>
                            ))}
                            {dayOrders.length === 0 && (
                              <div className="text-[10px] font-mono uppercase text-brand-muted border border-dashed border-brand-border p-3 text-center rounded-lg">
                                Sem programação
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="border border-brand-border bg-brand-card p-4 space-y-3">
              <div className="text-xs font-mono uppercase tracking-wider text-brand-muted">
                {calendarView === 'mensal' ? 'Programadas e futuras do mês' : 'Programadas e futuras da semana'}
              </div>
              <div className="space-y-2 max-h-[720px] overflow-y-auto pr-1">
                {(calendarView === 'mensal' ? monthOrders : weekOrders).map(({ order, eventDate }) => (
                  <button
                    key={order.id}
                    onClick={() => openOrderDetail(order.id)}
                    className="w-full text-left border border-brand-border hover:border-brand-primary/40 hover:bg-brand-dark/20 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-mono uppercase text-brand-primary">{order.numero}</div>
                        <div className="text-sm text-brand-text mt-1">{order.asset?.nome ?? order.infra_predial_servico ?? 'Serviço'}</div>
                        <div className="text-xs text-brand-muted mt-1">
                          {order.tecnico?.nome ?? 'Sem técnico definido'} · {order.tipo} · {order.criticidade}
                        </div>
                      </div>
                      <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 border ${statusColor[order.status] ?? 'border-brand-border'}`}>
                        {order.status}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-brand-muted">
                      <span>{eventDate?.toLocaleDateString('pt-BR')}</span>
                      <span>{order.prioridade}</span>
                    </div>
                  </button>
                ))}
                {(calendarView === 'mensal' ? monthOrders.length === 0 : weekOrders.length === 0) && (
                  <div className="p-8 text-center text-brand-muted font-mono text-xs border border-dashed border-brand-border">
                    {calendarView === 'mensal'
                      ? 'Nenhuma OS programada ou futura neste mês.'
                      : 'Nenhuma OS programada ou futura nesta semana.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- NOTIFICAÇÕES ---------- */}
      {!loading && tab === 'notifs' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={async () => {
                await preventiveApi.markNotificationsRead();
                setNotifs(await preventiveApi.myNotifications());
              }}
              className="border border-brand-border px-3 py-2 font-mono text-xs uppercase hover:bg-brand-card"
            >
              Marcar todas como lidas
            </button>
          </div>
          <div className="space-y-2">
            {notifs.map((n) => (
              <button
                type="button"
                key={n.id}
                onClick={async () => {
                  if (!n.lida) {
                    await preventiveApi.markNotificationRead(n.id).catch(() => {});
                    setNotifs((current) => current.map((item) => item.id === n.id ? { ...item, lida: true } : item));
                  }
                  if (n.order_id) {
                    setTab('ordens');
                    await openOrderDetail(n.order_id);
                  }
                }}
                className={`w-full text-left border p-4 transition-colors ${n.lida ? 'border-brand-border bg-brand-card/50' : 'border-brand-primary/40 bg-brand-card hover:bg-brand-primary/5'}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-mono uppercase ${n.lida ? 'text-brand-muted' : 'text-brand-primary'}`}>
                    <Bell size={12} className="inline mr-1" />
                    {n.tipo}
                  </span>
                  <span className="text-xs font-mono text-brand-muted">
                    {new Date(n.data_criacao).toLocaleString('pt-BR')}
                  </span>
                  {n.order_id && <span className="text-xs text-brand-primary font-mono uppercase"><ExternalLink size={12} className="inline mr-1" />Abrir OS</span>}
                </div>
                <pre className="mt-2 text-sm text-brand-text font-sans whitespace-pre-wrap m-0">{n.mensagem}</pre>
              </button>
            ))}
            {notifs.length === 0 && (
              <div className="p-12 text-center text-brand-muted font-mono text-sm">
                Nenhuma notificação.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- PLAN MODAL ---------- */}
      {planModal && (
        <div className="fixed inset-0 bg-brand-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl border border-brand-border bg-brand-card p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-brand-border pb-4">
              <h3 className="text-lg font-bold font-mono uppercase tracking-wider text-brand-text">
                {editPlanId ? 'Editar Plano' : 'Novo Plano'}
              </h3>
              <button onClick={() => setPlanModal(false)} className="text-brand-muted hover:text-brand-text">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={submitPlan} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Nome do Plano *</label>
                <input type="text" required value={pNome} onChange={(e) => setPNome(e.target.value)}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Tipo</label>
                  <select value={pTipo} onChange={(e) => setPTipo(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                    {PM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Periodicidade</label>
                  <select value={pPeriod} onChange={(e) => setPPeriod(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                    {PM_PERIODICITIES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {pPeriod === 'Personalizada' && (
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Dias personalizados</label>
                  <input type="number" value={pDias} onChange={(e) => setPDias(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none font-mono" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Criticidade</label>
                  <select value={pCrit} onChange={(e) => setPCrit(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                    {PM_CRITICALITIES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Prioridade</label>
                  <select value={pPrio} onChange={(e) => setPPrio(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                    {PM_PRIORITIES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Responsável</label>
                <select value={pResponsavel ?? ''} onChange={(e) => setPResponsavel(e.target.value ? Number(e.target.value) : null)}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                  <option value="">—</option>
                  {techs.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Descrição</label>
                <textarea value={pDesc} onChange={(e) => setPDesc(e.target.value)} rows={3}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none" />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-brand-border">
                <button type="button" onClick={() => setPlanModal(false)}
                  className="border border-brand-border hover:bg-brand-card px-4 py-2 font-mono text-xs uppercase">Cancelar</button>
                <button type="submit"
                  className="bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-xs">Confirmar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------- PLAN DETAIL MODAL ---------- */}
      {planDetail && (
        <div className="fixed inset-0 bg-brand-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl border border-brand-border bg-brand-card p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-brand-border pb-4">
              <div>
                <h3 className="text-lg font-bold font-mono uppercase tracking-wider text-brand-text">{planDetail.plan.nome}</h3>
                <span className="text-xs font-mono text-brand-primary">{planDetail.plan.codigo}</span>
              </div>
              <button onClick={() => setPlanDetail(null)} className="text-brand-muted hover:text-brand-text">
                <X size={20} />
              </button>
            </div>

            {planDetail.plan.checklists?.map((cl) => (
              <div key={cl.id} className="border border-brand-border">
                <div className="p-3 border-b border-brand-border bg-brand-dark/20 flex justify-between items-center">
                  <span className="text-xs font-mono uppercase tracking-wider text-brand-text">{cl.nome}</span>
                  {canEditStructure && (
                    <button
                      onClick={async () => {
                        if (!window.confirm('Excluir checklist?')) return;
                        await preventiveApi.deleteChecklist(planDetail.plan.id, cl.id);
                        await openPlanDetail(planDetail.plan.id);
                      }}
                      className="text-red-400 border border-red-500/30 px-2 py-1"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
                <div className="divide-y divide-brand-border/60">
                  {cl.items.map((item) => (
                    <div key={item.id} className="p-3 flex justify-between items-center text-sm">
                      <span className="text-brand-text">{item.descricao}</span>
                      <span className="text-xs font-mono text-brand-muted">
                        {item.obrigatorio && 'OBRIGATÓRIO'} {item.requer_foto && '· FOTO'}
                      </span>
                    </div>
                  ))}
                  {cl.items.length === 0 && (
                    <div className="p-4 text-center text-brand-muted font-mono text-xs">Sem itens.</div>
                  )}
                </div>
              </div>
            ))}

            <div className="grid grid-cols-2 gap-4">
              <div className="border border-brand-border bg-brand-dark/20 p-4">
                <div className="text-xs font-mono uppercase text-brand-muted mb-2">OS do plano</div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {planDetail.orders.map((o) => (
                    <div key={o.id} className="text-xs font-mono text-brand-text">
                      {o.numero} — <span className="text-brand-muted">{o.status}</span>
                    </div>
                  ))}
                  {planDetail.orders.length === 0 && (
                    <div className="text-xs text-brand-muted font-mono">Nenhuma OS gerada.</div>
                  )}
                </div>
              </div>
              <div className="border border-brand-border bg-brand-dark/20 p-4">
                <div className="text-xs font-mono uppercase text-brand-muted mb-2">Ativos vinculados</div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {planDetail.plan.assets?.map((pa) => (
                    <div key={pa.id} className="text-xs font-mono text-brand-text">
                      {pa.asset?.nome ?? '—'} {pa.asset?.e_patrimonio ? `(${pa.asset.e_patrimonio})` : ''}
                    </div>
                  ))}
                  {(!planDetail.plan.assets || planDetail.plan.assets.length === 0) && (
                    <div className="text-xs text-brand-muted font-mono">Sem ativos vinculados.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- ORDER MODAL ---------- */}
      {orderModal && (
        <div className="fixed inset-0 bg-brand-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl border border-brand-border bg-brand-card p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-brand-border pb-4">
              <h3 className="text-lg font-bold font-mono uppercase tracking-wider text-brand-text">Nova Ordem de Serviço</h3>
              <button onClick={() => setOrderModal(false)} className="text-brand-muted hover:text-brand-text">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={submitOrder} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Tipo</label>
                  <select value={oTipo} onChange={(e) => setOTipo(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                    {PM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Prioridade</label>
                  <select value={oPrio} onChange={(e) => setOPrio(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                    {PM_PRIORITIES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Ativo</label>
                  <select value={oAsset ?? ''} onChange={(e) => setOAsset(e.target.value ? Number(e.target.value) : null)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                    <option value="">—</option>
                    {assets.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Técnico</label>
                  <select value={oTecnico ?? ''} onChange={(e) => setOTecnico(e.target.value ? Number(e.target.value) : null)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                    <option value="">—</option>
                    {techs.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Plano (opcional)</label>
                  <select value={oPlan ?? ''} onChange={async (e) => {
                    const planId = e.target.value ? Number(e.target.value) : null;
                    setOPlan(planId);
                    await loadChecklistDraftsFromPlan(planId);
                  }}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                    <option value="">—</option>
                    {plans.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Data agendada</label>
                  <input type="datetime-local" value={oAgendada} onChange={(e) => setOAgendada(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Serviço de Infra Predial (se não houver ativo)</label>
                <input type="text" value={oInfra} onChange={(e) => setOInfra(e.target.value)}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none" />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Descrição *</label>
                <textarea required value={oDesc} onChange={(e) => setODesc(e.target.value)} rows={3}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none" />
              </div>

              <div className="border border-brand-border bg-brand-dark/20 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-mono uppercase tracking-wider text-brand-muted">Checklist da OS</div>
                    <div className="text-xs text-brand-muted mt-1">
                      Administradores e gerentes podem ajustar o procedimento desta ordem antes de abrir o atendimento.
                    </div>
                  </div>
                  {canEditStructure && (
                    <button
                      type="button"
                      onClick={() => setOrderChecklistDrafts((current) => [...current, createEmptyChecklistDraft()])}
                      className="border border-brand-primary/30 text-brand-primary px-3 py-2 font-mono text-xs uppercase hover:bg-brand-primary/10"
                    >
                      <Plus size={12} className="inline mr-1" /> Checklist
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {orderChecklistDrafts.map((checklist, checklistIndex) => (
                    <div key={checklistIndex} className="border border-brand-border bg-brand-card/40 p-3 space-y-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          value={checklist.nome}
                          onChange={(e) => setOrderChecklistDrafts((current) => current.map((item, index) => index === checklistIndex ? { ...item, nome: e.target.value } : item))}
                          disabled={!canEditStructure}
                          className="flex-1 bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none"
                          placeholder="Nome do checklist"
                        />
                        {canEditStructure && orderChecklistDrafts.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setOrderChecklistDrafts((current) => current.filter((_, index) => index !== checklistIndex))}
                            className="text-red-400 border border-red-500/30 px-2 py-2"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>

                      <div className="space-y-2">
                        {checklist.items.map((item, itemIndex) => (
                          <div key={itemIndex} className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                            <input
                              type="text"
                              value={item.descricao}
                              onChange={(e) => setOrderChecklistDrafts((current) => current.map((currentChecklist, currentChecklistIndex) => currentChecklistIndex === checklistIndex ? {
                                ...currentChecklist,
                                items: currentChecklist.items.map((currentItem, currentItemIndex) => currentItemIndex === itemIndex ? { ...currentItem, descricao: e.target.value } : currentItem),
                              } : currentChecklist))}
                              disabled={!canEditStructure}
                              className="bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none"
                              placeholder="Descreva a atividade obrigatória ou opcional"
                            />
                            <label className="flex items-center gap-2 text-xs font-mono text-brand-muted uppercase">
                              <input
                                type="checkbox"
                                checked={item.obrigatorio}
                                disabled={!canEditStructure}
                                onChange={(e) => setOrderChecklistDrafts((current) => current.map((currentChecklist, currentChecklistIndex) => currentChecklistIndex === checklistIndex ? {
                                  ...currentChecklist,
                                  items: currentChecklist.items.map((currentItem, currentItemIndex) => currentItemIndex === itemIndex ? { ...currentItem, obrigatorio: e.target.checked } : currentItem),
                                } : currentChecklist))}
                                className="accent-brand-primary"
                              />
                              Obrigatório
                            </label>
                            <label className="flex items-center gap-2 text-xs font-mono text-brand-muted uppercase">
                              <input
                                type="checkbox"
                                checked={item.requer_foto}
                                disabled={!canEditStructure}
                                onChange={(e) => setOrderChecklistDrafts((current) => current.map((currentChecklist, currentChecklistIndex) => currentChecklistIndex === checklistIndex ? {
                                  ...currentChecklist,
                                  items: currentChecklist.items.map((currentItem, currentItemIndex) => currentItemIndex === itemIndex ? { ...currentItem, requer_foto: e.target.checked } : currentItem),
                                } : currentChecklist))}
                                className="accent-brand-primary"
                              />
                              Foto
                            </label>
                            {canEditStructure && (
                              <button
                                type="button"
                                onClick={() => setOrderChecklistDrafts((current) => current.map((currentChecklist, currentChecklistIndex) => currentChecklistIndex === checklistIndex ? {
                                  ...currentChecklist,
                                  items: currentChecklist.items.filter((_, currentItemIndex) => currentItemIndex !== itemIndex),
                                } : currentChecklist))}
                                className="text-red-400 border border-red-500/30 px-2 py-2"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {canEditStructure && (
                        <button
                          type="button"
                          onClick={() => setOrderChecklistDrafts((current) => current.map((item, index) => index === checklistIndex ? { ...item, items: [...item.items, createEmptyChecklistItem()] } : item))}
                          className="border border-brand-border px-3 py-2 font-mono text-xs uppercase hover:bg-brand-card"
                        >
                          <Plus size={12} className="inline mr-1" /> Item
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-brand-border">
                <button type="button" onClick={() => setOrderModal(false)}
                  className="border border-brand-border hover:bg-brand-card px-4 py-2 font-mono text-xs uppercase">Cancelar</button>
                <button type="submit"
                  className="bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-xs">Criar OS</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------- ORDER DETAIL MODAL ---------- */}
      {orderDetail && (
        <div className="fixed inset-0 bg-brand-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl border border-brand-border bg-brand-card p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-brand-border pb-4">
              <div>
                <h3 className="text-lg font-bold font-mono uppercase tracking-wider text-brand-text">
                  OS {orderDetail.order.numero}
                </h3>
                <div className="flex items-center space-x-2 mt-1">
                  <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 border ${statusColor[orderDetail.order.status] ?? 'border-brand-border'}`}>
                    {orderDetail.order.status}
                  </span>
                  <span className="text-xs font-mono text-brand-muted">
                    {orderDetail.order.asset?.nome ?? orderDetail.order.infra_predial_servico ?? '—'}
                  </span>
                  <span className="text-xs font-mono text-brand-primary">
                    {formatMinutes(calculateElapsedMinutes(orderDetail.order))}
                  </span>
                </div>
              </div>
              <button onClick={() => {
                setOrderDetail(null);
                setOrderOriginContext(null);
              }} className="text-brand-muted hover:text-brand-text">
                <X size={20} />
              </button>
            </div>

            {orderOriginContext && (
              <div className="border border-cyan-500/30 bg-cyan-500/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[15px] font-mono uppercase tracking-wider text-[#222020]">Origem do Kanban</div>
                    <div className="mt-1 text-sm text-brand-text">
                      {orderOriginContext.sourceCardTitle
                        ? `Esta OS foi aberta a partir do cartão "${orderOriginContext.sourceCardTitle}".`
                        : 'Esta OS foi aberta a partir de um cartão do Kanban.'}
                    </div>
                    <div className="mt-1 text-xs font-mono text-brand-muted">
                      {orderOriginContext.sourceProjectTitle ?? 'Kanban'}
                      {orderOriginContext.sourceCardId ? ` · Card #${orderOriginContext.sourceCardId}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const payload = {
                        projectId: orderOriginContext.sourceProjectId ?? null,
                        cardId: orderOriginContext.sourceCardId ?? null,
                        createdAt: Date.now(),
                      };

                      sessionStorage.setItem(kanbanReturnIntentStorageKey, JSON.stringify(payload));

                      const params = new URLSearchParams();
                      if (payload.projectId) params.set('projectId', String(payload.projectId));
                      if (payload.cardId) params.set('cardId', String(payload.cardId));

                      window.location.assign(`/kanban${params.toString() ? `?${params.toString()}` : ''}`);
                    }}
                    className="border border-[#273fb4] px-3 py-2 font-mono text-xs uppercase text-[#000b9e] hover:bg-[#273fb4]/10"
                  >
                    Voltar ao Kanban
                  </button>
                </div>
              </div>
            )}

            {/* Status actions */}
            <div className="flex flex-wrap gap-2">
              {canWorkOrder && (orderDetail.order.status === 'Aberta' || orderDetail.order.status === 'Agendada' || orderDetail.order.status === 'Pausada') && (
                <button onClick={() => orderAction(orderDetail.order.id, 'iniciar')}
                  className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 px-3 py-2 font-mono text-xs uppercase hover:bg-yellow-500/20">
                  <Play size={12} className="inline mr-1" /> Iniciar
                </button>
              )}
              {canWorkOrder && orderDetail.order.status === 'Em andamento' && (
                <button onClick={() => orderAction(orderDetail.order.id, 'pausar')}
                  className="bg-purple-500/10 text-purple-400 border border-purple-500/30 px-3 py-2 font-mono text-xs uppercase hover:bg-purple-500/20">
                  <Pause size={12} className="inline mr-1" /> Pausar
                </button>
              )}
              {canWorkOrder && !['Concluída', 'Cancelada'].includes(orderDetail.order.status) && (
                <>
                  <button onClick={() => orderAction(orderDetail.order.id, 'concluir')}
                    className="bg-[#3d7eff] text-[#fafafa] border border-[#3d7eff]/70 px-3 py-2 font-mono text-xs uppercase opacity-[0.86] hover:bg-[#2f6ee8]">
                    <CheckCircle2 size={12} className="inline mr-1" /> Concluir
                  </button>
                  {canEditStructure && (
                    <button onClick={() => orderAction(orderDetail.order.id, 'cancelar')}
                      className="bg-red-500/10 text-red-400 border border-red-500/30 px-3 py-2 font-mono text-xs uppercase hover:bg-red-500/20">
                      <Ban size={12} className="inline mr-1" /> Cancelar
                    </button>
                  )}
                  {canEditStructure && orderDetail.order.status !== 'Concluída' && (
                    <button
                      onClick={() => deleteOrder(orderDetail.order.id)}
                      className="bg-red-950/40 text-red-300 border border-red-700/40 px-3 py-2 font-mono text-xs uppercase hover:bg-red-950/60"
                    >
                      <Trash2 size={12} className="inline mr-1" /> Excluir OS
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border border-brand-border bg-brand-dark/20 p-3">
                <div className="text-xs font-mono uppercase text-brand-muted mb-1">Técnico</div>
                <div className="text-sm text-brand-text">{orderDetail.order.tecnico?.nome ?? 'Não definido'}</div>
              </div>
              <div className="border border-brand-border bg-brand-dark/20 p-3">
                <div className="text-xs font-mono uppercase text-brand-muted mb-1">Materiais</div>
                <div className="text-sm text-brand-text">{orderDetail.order.materials.length} item(ns)</div>
              </div>
              <div className="border border-brand-border bg-brand-dark/20 p-3">
                <div className="text-xs font-mono uppercase text-brand-muted mb-1">Fotos</div>
                <div className="text-sm text-brand-text">{orderDetail.order.photos.length} evidência(s)</div>
              </div>
              <div className="border border-brand-border bg-brand-dark/20 p-3">
                <div className="text-xs font-mono uppercase text-brand-muted mb-1">Custo acumulado</div>
                <div className="text-sm text-brand-text">
                  R$ {orderDetail.order.materials.reduce((sum, item) => sum + item.valor_total, 0).toFixed(2)}
                </div>
              </div>
              <div className="border border-brand-border bg-brand-dark/20 p-3">
                <div className="text-xs font-mono uppercase text-brand-muted mb-1">Validador final</div>
                <div className="text-sm text-brand-text">{orderDetail.order.validado_por?.nome ?? 'Pendente'}</div>
              </div>
              <div className="border border-brand-border bg-brand-dark/20 p-3">
                <div className="text-xs font-mono uppercase text-brand-muted mb-1">Tempo da OS</div>
                <div className="text-sm text-brand-primary">{formatMinutes(calculateElapsedMinutes(orderDetail.order))}</div>
              </div>
            </div>

            {orderDetail.order.observacoes && (
              <div className="border border-brand-border bg-brand-dark/20 p-4">
                <div className="text-xs font-mono uppercase text-brand-muted mb-2">Escopo da manutenção</div>
                <div className="text-sm text-brand-text whitespace-pre-wrap">{orderDetail.order.observacoes}</div>
              </div>
            )}

            {/* Checklist execution */}
            {orderDetail.checklists.length > 0 && (
              <div className="border border-brand-border">
                <div className="p-3 border-b border-brand-border bg-brand-dark/20 text-xs font-mono uppercase tracking-wider text-brand-muted flex items-center">
                  <ClipboardList size={14} className="mr-2" /> Checklists
                </div>
                <div className="divide-y divide-brand-border/60">
                  {orderDetail.checklists.map((cl) => (
                    <div key={cl.id}>
                      <div className="p-3 text-sm font-bold text-brand-text font-mono">{cl.nome}</div>
                      {cl.items.map((item) => {
                        const exec = orderDetail.order.executions.find((e) => e.checklist_item_id === item.id);
                        return (
                          <div key={item.id} className="p-3 flex items-center justify-between border-t border-brand-border/40">
                            <div className="flex-1">
                              <span className={`text-sm ${exec?.concluido ? 'text-brand-muted line-through' : 'text-brand-text'}`}>
                                {item.descricao}
                              </span>
                              <div className="text-xs font-mono text-brand-muted">
                                {item.obrigatorio && 'OBRIGATÓRIO'} {item.requer_foto && '· REQUER FOTO'}
                                {exec?.executado_por && ` · ${exec.executado_por.nome}`}
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              {exec?.concluido && (
                                <span className="text-green-400 text-xs font-mono uppercase">Executado</span>
                              )}
                              <label className="flex items-center space-x-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={!!exec?.concluido}
                                  disabled={!canWorkOrder || ['Concluída', 'Cancelada'].includes(orderDetail.order.status)}
                                  onChange={async (e) => {
                                    const checked = e.target.checked;
                                    let foto: File | undefined;
                                    if (checked && item.requer_foto) {
                                      foto = await pickChecklistPhoto();
                                      if (!foto) {
                                        setError(`Selecione uma foto para concluir o item obrigatório "${item.descricao}".`);
                                        setTimeout(() => setError(null), 5000);
                                        return;
                                      }
                                    }
                                    try {
                                      await preventiveApi.executeChecklistItem(orderDetail.order.id, item.id, checked, undefined, foto);
                                      await refreshOrderDetail();
                                    } catch (err) {
                                      showError(err);
                                    }
                                  }}
                                  className="accent-brand-primary"
                                />
                                <Camera size={12} className="text-brand-muted" />
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Materials */}
            <div className="border border-brand-border">
              <div className="p-3 border-b border-brand-border bg-brand-dark/20 text-xs font-mono uppercase tracking-wider text-brand-muted flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center">
                  <Wrench size={14} className="mr-2 text-brand-primary" /> Materiais aplicados
                </div>
                {canWorkOrder && !['Concluída', 'Cancelada'].includes(orderDetail.order.status) && (
                  <button
                    type="button"
                    onClick={handleOpenPmPurchaseModal}
                    className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-mono uppercase font-bold flex items-center space-x-1.5 transition-colors"
                    title="Solicitar compra de peça/suprimento para esta ordem"
                  >
                    <ShoppingCart size={13} />
                    <span>Solicitar Compra de Peça</span>
                  </button>
                )}
              </div>
              {canWorkOrder && !['Concluída', 'Cancelada'].includes(orderDetail.order.status) && (
                <form onSubmit={submitMaterial} className="p-3 border-b border-brand-border/60 bg-brand-card/40 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <select
                      value={mStockId ?? ''}
                      onChange={(e) => {
                        const stockId = e.target.value ? Number(e.target.value) : null;
                        const selected = stockItems.find((item) => item.id === stockId);
                        setMStockId(stockId);
                        setMProduto(selected?.product?.nome ?? '');
                        if (stockId && !mValorUnitario) setMValorUnitario('0');
                      }}
                      className="bg-brand-dark border border-brand-primary/40 px-3 py-2 text-sm text-brand-text focus:outline-none"
                    >
                      <option value="">Aplicar material do estoque (opcional)</option>
                      {stockItems.map((item) => (
                        <option key={item.id} value={item.id} disabled={item.quantidade_saldo <= 0}>
                          {item.product?.nome ?? `Produto #${item.product_id}`} · saldo: {item.quantidade_saldo.toFixed(2)} {item.product?.unidade ?? 'UN'}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder={mStockId ? 'Material selecionado do estoque' : 'Produto ou peça'}
                      value={mProduto}
                      onChange={(e) => setMProduto(e.target.value)}
                      disabled={!!mStockId}
                      className="bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none"
                      required
                    />
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Quantidade"
                      value={mQuantidade}
                      onChange={(e) => setMQuantidade(e.target.value)}
                      className="bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none"
                      required
                    />
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Valor unitário"
                      value={mValorUnitario}
                      onChange={(e) => setMValorUnitario(e.target.value)}
                      className="bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none"
                      required={!mStockId}
                    />
                    <button
                      type="submit"
                      className="bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-xs"
                    >
                      Adicionar material
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Observação do material aplicado (opcional)"
                    value={mObservacao}
                    onChange={(e) => setMObservacao(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none"
                  />
                  {mStockId && (
                    <div className="text-xs text-emerald-400 font-mono">
                      A aplicação deste material fará a baixa automática do saldo e registrará a OS no histórico do estoque.
                    </div>
                  )}
                </form>
              )}
              <div className="divide-y divide-brand-border/60">
                {orderDetail.order.materials.map((m) => (
                  <div key={m.id} className="p-3 flex justify-between items-center text-sm">
                    <div>
                      <div className="text-brand-text">{m.produto}</div>
                      <div className="text-xs font-mono text-brand-muted">x{m.quantidade} · R$ {m.valor_unitario.toFixed(2)}</div>
                      {m.product_id && <div className="text-[11px] font-mono text-emerald-400">Baixa automática do estoque</div>}
                      {m.observacao && <div className="text-xs text-brand-muted mt-1">{m.observacao}</div>}
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs text-brand-primary">R$ {m.valor_total.toFixed(2)}</span>
                      {canWorkOrder && (
                        <button
                          onClick={async () => {
                            if (!window.confirm('Remover material?')) return;
                            await preventiveApi.removeMaterial(orderDetail.order.id, m.id);
                            await refreshOrderDetail();
                          }}
                          className="text-red-400 border border-red-500/30 px-2 py-1"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {orderDetail.order.materials.length === 0 && (
                  <div className="p-4 text-center text-brand-muted font-mono text-xs">Nenhum material aplicado.</div>
                )}
              </div>
            </div>

            {/* Photos */}
            <div className="border border-brand-border">
              <div className="p-3 border-b border-brand-border bg-brand-dark/20 text-xs font-mono uppercase tracking-wider text-brand-muted flex items-center">
                <Camera size={14} className="mr-2" /> Fotos ({orderDetail.order.photos.length})
              </div>
              {canWorkOrder && !['Concluída', 'Cancelada'].includes(orderDetail.order.status) && (
                <form onSubmit={submitPhoto} className="p-3 border-b border-brand-border/60 bg-brand-card/40 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <select
                      value={photoTipo}
                      onChange={(e) => setPhotoTipo(e.target.value)}
                      className="bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none"
                    >
                      <option value="Antes">Antes</option>
                      <option value="Durante">Durante</option>
                      <option value="Depois">Depois</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Descrição da evidência"
                      value={photoDescricao}
                      onChange={(e) => setPhotoDescricao(e.target.value)}
                      className="bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none md:col-span-2"
                    />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                      className="bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-xs"
                    >
                      Anexar foto
                    </button>
                  </div>
                </form>
              )}
              <div className="p-3 grid grid-cols-3 gap-3">
                {orderDetail.order.photos.map((p) => (
                  <div key={p.id} className="border border-brand-border p-2">
                    <img src={toApiFileUrl(p.caminho_arquivo)} alt={p.descricao ?? 'foto'} className="w-full h-28 object-cover" />
                    <div className="mt-1 text-xs font-mono text-brand-muted">{p.tipo}</div>
                    {p.descricao && <div className="text-xs text-brand-text mt-1">{p.descricao}</div>}
                    {canWorkOrder && (
                      <button
                        onClick={async () => {
                          if (!window.confirm('Excluir foto?')) return;
                          await preventiveApi.deletePhoto(orderDetail.order.id, p.id);
                          await refreshOrderDetail();
                        }}
                        className="text-red-400 text-xs font-mono uppercase mt-1"
                      >
                        Excluir
                      </button>
                    )}
                  </div>
                ))}
                {orderDetail.order.photos.length === 0 && (
                  <div className="col-span-3 p-4 text-center text-brand-muted font-mono text-xs">Nenhuma evidência fotográfica anexada.</div>
                )}
              </div>
            </div>

            {/* History */}
            <div className="border border-brand-border">
              <div className="p-3 border-b border-brand-border bg-brand-dark/20 text-xs font-mono uppercase tracking-wider text-brand-muted">
                Histórico
              </div>
              <div className="divide-y divide-brand-border/60 max-h-56 overflow-y-auto">
                {orderDetail.order.history.map((h) => (
                  <div key={h.id} className="p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-brand-primary font-mono text-xs uppercase">{h.acao}</span>
                      <span className="text-xs font-mono text-brand-muted">{new Date(h.data_hora).toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="text-brand-text mt-1">{h.descricao}</div>
                    {h.usuario && <div className="text-xs font-mono text-brand-muted">por {h.usuario.nome}</div>}
                  </div>
                ))}
                {orderDetail.order.history.length === 0 && (
                  <div className="p-4 text-center text-brand-muted font-mono text-xs">Sem histórico.</div>
                )}
              </div>
            </div>

            {completeModal && (
              <div className="border border-green-500/30 bg-green-500/5 p-4 space-y-4">
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider text-green-400">Encerramento assistido da OS</div>
                  <div className="text-sm text-brand-muted mt-1">
                    Registre o diagnóstico, a solução aplicada e as recomendações finais antes de concluir a ordem.
                  </div>
                </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="border border-brand-border bg-brand-dark/20 p-3">
                    <div className="text-xs font-mono uppercase text-brand-muted mb-1">Checklist obrigatório</div>
                    <div className="text-sm text-brand-text">
                      {orderDetail.checklists.flatMap((checklist) => checklist.items).filter((item) => item.obrigatorio).length === 0
                        ? 'Sem itens obrigatórios'
                        : `${orderDetail.checklists.flatMap((checklist) => checklist.items).filter((item) => item.obrigatorio && orderDetail.order.executions.some((execution) => execution.checklist_item_id === item.id && execution.concluido)).length}/${orderDetail.checklists.flatMap((checklist) => checklist.items).filter((item) => item.obrigatorio).length} concluídos`}
                    </div>
                  </div>
                  <div className="border border-brand-border bg-brand-dark/20 p-3">
                    <div className="text-xs font-mono uppercase text-brand-muted mb-1">Evidências fotográficas</div>
                    <div className="text-sm text-brand-text">{orderDetail.order.photos.length} anexo(s)</div>
                  </div>
                  <div className="border border-brand-border bg-brand-dark/20 p-3">
                    <div className="text-xs font-mono uppercase text-brand-muted mb-1">Custo de materiais</div>
                    <div className="text-sm text-brand-text">
                      R$ {orderDetail.order.materials.reduce((sum, item) => sum + item.valor_total, 0).toFixed(2)}
                    </div>
                  </div>
                </div>

                <form onSubmit={submitCompletion} className="space-y-3">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Diagnóstico final *</label>
                    <textarea
                      required
                      value={completionDiagnosis}
                      onChange={(e) => setCompletionDiagnosis(e.target.value)}
                      rows={3}
                      className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none"
                      placeholder="Descreva a causa encontrada e o estado do ativo no momento do atendimento."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Solução aplicada *</label>
                    <textarea
                      required
                      value={completionSolution}
                      onChange={(e) => setCompletionSolution(e.target.value)}
                      rows={3}
                      className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none"
                      placeholder="Informe o procedimento executado, troca de peças, ajustes, limpeza ou atualização realizada."
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Recomendações finais</label>
                      <textarea
                        value={completionRecommendations}
                        onChange={(e) => setCompletionRecommendations(e.target.value)}
                        rows={3}
                        className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none"
                        placeholder="Ex.: monitorar temperatura, trocar bateria no próximo ciclo, orientar usuário..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Destino final do ativo *</label>
                      <select
                        value={completionAssetDestination}
                        onChange={(e) => setCompletionAssetDestination(e.target.value)}
                        className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none mb-3"
                      >
                        <option value="Disponível">Liberado para uso / Disponível</option>
                        <option value="Armazenado">Armazenado após manutenção</option>
                        <option value="Manutenção">Manter em manutenção / nova intervenção</option>
                      </select>
                      <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Custo adicional extra (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={completionExtraCost}
                        onChange={(e) => setCompletionExtraCost(e.target.value)}
                        className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none"
                        placeholder="0,00"
                      />
                      <p className="text-xs text-brand-muted mt-2">
                        O sistema soma esse valor ao custo já registrado em materiais e atualiza o status do ativo no encerramento.
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setCompleteModal(false)}
                      className="border border-brand-border hover:bg-brand-card px-4 py-2 font-mono text-xs uppercase"
                    >
                      Voltar
                    </button>
                    <button
                      type="submit"
                      className="bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-xs"
                    >
                      Confirmar encerramento
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PM PURCHASE REQUEST MODAL */}
      {pmPurchaseModalOpen && orderDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg bg-brand-card border border-amber-500/50 shadow-2xl overflow-hidden rounded-md">
            <div className="bg-amber-500/10 border-b border-amber-500/30 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-amber-400">
                <ShoppingCart size={20} />
                <h3 className="font-bold font-mono text-sm uppercase tracking-wider text-amber-300">
                  Solicitação de Compra / Peça para Preventiva
                </h3>
              </div>
              <button
                onClick={() => setPmPurchaseModalOpen(false)}
                className="text-brand-muted hover:text-brand-text p-1"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitPmPurchase} className="p-6 space-y-4">
              <div className="bg-brand-dark/50 p-3 border border-brand-border/40 text-xs font-mono rounded">
                <div className="text-brand-muted text-[10px] uppercase">Ordem de Serviço Preventiva:</div>
                <div className="text-brand-text font-bold text-sm">
                  OS {orderDetail.order.numero} — {orderDetail.order.asset?.nome || orderDetail.order.infra_predial_servico || 'Infraestrutura'}
                </div>
                {orderDetail.order.asset && (
                  <div className="text-[11px] text-brand-primary mt-0.5">
                    Patrimônio: {orderDetail.order.asset.e_patrimonio}
                  </div>
                )}
              </div>

              {pmPurchaseSuccess && (
                <div className="p-3 bg-green-500/10 border border-green-500/30 text-green-400 font-mono text-xs flex items-center space-x-2">
                  <CheckCircle2 size={16} />
                  <span>{pmPurchaseSuccess}</span>
                </div>
              )}

              {pmPurchaseError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 font-mono text-xs">
                  {pmPurchaseError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-mono font-bold text-brand-text uppercase block">
                  Nome da Peça / Material *
                </label>
                <input
                  type="text"
                  required
                  value={pmPartName}
                  onChange={(e) => setPmPartName(e.target.value)}
                  placeholder="Ex: Filtro de ar condicionado, Pasta térmica, Pasta de solda..."
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-mono font-bold text-brand-text uppercase flex items-center space-x-1">
                  <LinkIcon size={12} className="text-amber-400" />
                  <span>Link do Site / Loja (URL Fornecedor)</span>
                </label>
                <input
                  type="url"
                  value={pmPartLink}
                  onChange={(e) => setPmPartLink(e.target.value)}
                  placeholder="https://www.mercadolivre.com.br/... ou link da loja"
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-mono font-bold text-brand-text uppercase block">
                    Quantidade *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={pmPartQty}
                    onChange={(e) => setPmPartQty(Number(e.target.value))}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono font-bold text-brand-text uppercase block">
                    Valor Estimado (R$)
                  </label>
                  <input
                    type="text"
                    value={pmPartEstimatedVal}
                    onChange={(e) => setPmPartEstimatedVal(e.target.value)}
                    placeholder="Ex: 85.00"
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-mono font-bold text-brand-text uppercase block">
                  Justificativa / Motivo
                </label>
                <textarea
                  rows={2}
                  value={pmPartJustification}
                  onChange={(e) => setPmPartJustification(e.target.value)}
                  placeholder="Justificativa da necessidade de compra..."
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPmPurchaseModalOpen(false)}
                  className="w-1/3 py-2.5 bg-brand-dark border border-brand-border text-xs font-mono uppercase text-brand-muted hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pmPartSubmitting || !pmPartName.trim()}
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-brand-dark font-bold font-mono text-xs uppercase flex items-center justify-center space-x-2 disabled:opacity-50 shadow-md"
                >
                  {pmPartSubmitting && <RefreshCw size={14} className="animate-spin" />}
                  <span>Encaminhar para Comprador</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
