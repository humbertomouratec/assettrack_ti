import React, { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  Check,
  CheckCheck,
  Search,
  MessageSquare,
  Wrench,
  ClipboardList,
  Columns3,
  Megaphone,
  Clock,
  AlertTriangle,
  Inbox,
  Layers,
  ArrowRight,
  RefreshCw,
  History,
  Sparkles,
} from 'lucide-react';
import type { ServiceTicket, ServiceDeskNotification } from '../../types/serviceDesk';
import type { SolicitacaoManutencao } from '../../types/maintenance';
import type { MaintenanceOrder, PMNotification } from '../../types/preventive';
import type { KanbanNotification } from '../../types/kanban';
import type { RHComunicado } from '../../types/rh';

export type NotificationSource = 'service_desk' | 'maintenance' | 'preventive' | 'kanban' | 'rh';

export interface UnifiedWorkItem {
  id: string;
  source: NotificationSource;
  sourceLabel: string;
  itemType: 'notification' | 'task';
  title: string;
  subtitle?: string;
  description: string;
  code?: string;
  status?: string;
  priority?: 'urgente' | 'alta' | 'media' | 'baixa';
  createdAt: string;
  isUnread: boolean;
  isAttended?: boolean;
  linkUrl: string;
  actionLabel: string;
  dateInfo?: {
    isOverdue?: boolean;
    isToday?: boolean;
    label?: string;
  };
  onMarkRead?: () => Promise<void>;
  onOpenDetail?: () => void;
  meta?: Record<string, unknown>;
}

interface TechnicianNotificationCenterProps {
  // Service Desk
  sdNotifications: ServiceDeskNotification[];
  sdTickets: ServiceTicket[];
  onMarkSdRead: (id: number) => Promise<void>;
  onMarkAllSdRead: () => Promise<void>;

  // Maintenance (Bancada)
  maintRequests: SolicitacaoManutencao[];

  // Preventive
  pmNotifications: PMNotification[];
  pmOrders: MaintenanceOrder[];
  onMarkPmRead: (id: number) => Promise<void>;
  onMarkAllPmRead: () => Promise<void>;

  // Kanban
  kbNotifications: KanbanNotification[];
  onMarkKbRead: (id: number) => Promise<void>;
  onMarkAllKbRead: () => Promise<void>;

  // RH Comunicados
  rhComunicados: Array<{ comunicado: RHComunicado; lida: boolean }>;
  onMarkRhRead: (id: number) => Promise<void>;
  onOpenRhModal: (item: { comunicado: RHComunicado; lida: boolean }) => void;

  // General controls
  loading?: boolean;
  onRefresh?: () => void;
}

export const TechnicianNotificationCenter: React.FC<TechnicianNotificationCenterProps> = ({
  sdNotifications,
  sdTickets,
  onMarkSdRead,
  onMarkAllSdRead,
  maintRequests,
  pmNotifications,
  pmOrders,
  onMarkPmRead,
  onMarkAllPmRead,
  kbNotifications,
  onMarkKbRead,
  onMarkAllKbRead,
  rhComunicados,
  onMarkRhRead,
  onOpenRhModal,
  loading = false,
  onRefresh,
}) => {
  const [selectedSource, setSelectedSource] = useState<NotificationSource | 'all'>('all');
  const [viewMode, setViewMode] = useState<'pending' | 'history'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [dismissedItemIds, setDismissedItemIds] = useState<Set<string>>(new Set());

  // Helper date calculation for PM
  const calculatePMDateInfo = (dataAgendada?: string) => {
    if (!dataAgendada) return undefined;
    const target = new Date(dataAgendada);
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endToday = startToday + 24 * 60 * 60 * 1000 - 1;
    const targetTime = target.getTime();

    if (targetTime < startToday) {
      return {
        isOverdue: true,
        isToday: false,
        label: `Atrasada (${target.toLocaleDateString('pt-BR')})`,
      };
    }
    if (targetTime >= startToday && targetTime <= endToday) {
      return {
        isOverdue: false,
        isToday: true,
        label: 'Agendada para Hoje',
      };
    }
    return {
      isOverdue: false,
      isToday: false,
      label: target.toLocaleDateString('pt-BR'),
    };
  };

  // Build unified list of work items & notifications with STRICT DEDUPLICATION AND ATTENDANCE FILTERING
  const allItems: UnifiedWorkItem[] = useMemo(() => {
    const items: UnifiedWorkItem[] = [];

    // Map service desk notifications by ticket_id
    const sdNotifsByTicket = new Map<number, ServiceDeskNotification[]>();
    const orphanSdNotifs: ServiceDeskNotification[] = [];

    sdNotifications.forEach((n) => {
      // If notification has a ticket attached and that ticket is already resolved/closed/cancelled, it is ALREADY ATTENDED!
      if (
        n.ticket &&
        (n.ticket.status === 'resolvido' ||
          n.ticket.status === 'fechado' ||
          n.ticket.status === 'cancelado')
      ) {
        return;
      }
      if (n.ticket_id) {
        const list = sdNotifsByTicket.get(n.ticket_id) || [];
        list.push(n);
        sdNotifsByTicket.set(n.ticket_id, list);
      } else {
        orphanSdNotifs.push(n);
      }
    });

    const processedTickets = new Set<number>();

    // 1. Process active assigned Service Desk tickets (Tasks)
    sdTickets.forEach((t) => {
      // JÁ ATENDIDO / FECHADO: Não deve aparecer nas notificações pendentes
      const st = t.status as string;
      if (st === 'fechado' || st === 'resolvido' || st === 'cancelado') return;
      processedTickets.add(t.id);

      const relatedNotifs = sdNotifsByTicket.get(t.id) || [];
      const hasUnread = relatedNotifs.some((n) => !n.lida) || t.status === 'aberto';
      const latestNotif = relatedNotifs[0];

      const markTicketRead = relatedNotifs.length > 0
        ? async () => {
            await Promise.all(relatedNotifs.filter((n) => !n.lida).map((n) => onMarkSdRead(n.id)));
          }
        : undefined;

      items.push({
        id: `sd_ticket_${t.id}`,
        source: 'service_desk',
        sourceLabel: 'Suporte',
        itemType: 'task',
        title: t.servico?.nome || `Chamado #${t.codigo}`,
        subtitle: t.solicitante ? `Solicitante: ${t.solicitante.nome}` : undefined,
        description: latestNotif?.mensagem || t.descricao,
        code: `#${t.codigo}`,
        status: t.status === 'em_atendimento' ? 'Em atendimento' : 'Aberto',
        priority: t.prioridade,
        createdAt: latestNotif?.data_criacao || t.data_abertura,
        isUnread: hasUnread,
        isAttended: t.status === 'em_atendimento' && !hasUnread,
        linkUrl: `/servicos?ticketId=${t.id}`,
        actionLabel: 'Atender Chamado',
        onMarkRead: markTicketRead,
      });
    });

    // 1b. Remaining Service Desk notifications for tickets not assigned directly to technician
    sdNotifsByTicket.forEach((notifs, ticketId) => {
      if (processedTickets.has(ticketId)) return;
      processedTickets.add(ticketId);

      const latestNotif = notifs[0];
      const hasUnread = notifs.some((n) => !n.lida);
      const markTicketRead = async () => {
        await Promise.all(notifs.filter((n) => !n.lida).map((n) => onMarkSdRead(n.id)));
      };

      items.push({
        id: `sd_notif_ticket_${ticketId}`,
        source: 'service_desk',
        sourceLabel: 'Suporte',
        itemType: 'notification',
        title: latestNotif.titulo || 'Atualização no Chamado',
        description: latestNotif.mensagem || '',
        code: `#CHAM-${ticketId}`,
        createdAt: latestNotif.data_criacao || new Date().toISOString(),
        isUnread: hasUnread,
        isAttended: !hasUnread,
        linkUrl: `/servicos?ticketId=${ticketId}`,
        actionLabel: 'Ver Chamado',
        onMarkRead: markTicketRead,
      });
    });

    // Orphan SD notifications
    orphanSdNotifs.forEach((n) => {
      items.push({
        id: `sd_notif_${n.id}`,
        source: 'service_desk',
        sourceLabel: 'Suporte',
        itemType: 'notification',
        title: n.titulo || 'Notificação de Suporte',
        description: n.mensagem || '',
        createdAt: n.data_criacao || new Date().toISOString(),
        isUnread: !n.lida,
        isAttended: n.lida,
        linkUrl: '/servicos',
        actionLabel: 'Ver Suporte',
        onMarkRead: () => onMarkSdRead(n.id),
      });
    });

    // 2. Maintenance / Bancada Requests
    maintRequests.forEach((m) => {
      // JÁ ATENDIDO / CONCLUÍDO: Não deve aparecer se estiver concluída, rejeitada ou devolvida
      if (m.status === 'concluida' || m.status === 'rejeitada' || m.status === 'entregue') return;
      const statusLabels: Record<string, string> = {
        pendente: 'Pendente de Triagem',
        aceita: 'Aceita em Bancada',
        em_andamento: 'Em Reparo',
        aguardando_entrega: 'Aguardando Devolução',
      };
      items.push({
        id: `maint_${m.id}`,
        source: 'maintenance',
        sourceLabel: 'Manutenção Bancada',
        itemType: 'task',
        title: m.asset?.nome ? `${m.asset.nome} (${m.asset.e_patrimonio || 'S/N'})` : 'Ordem de Manutenção',
        subtitle: m.solicitante ? `Solicitado por: ${m.solicitante.nome}` : undefined,
        description: m.descricao || 'Reparo ou intervenção técnica de laboratório.',
        code: `#BANC-${m.id}`,
        status: statusLabels[m.status] || m.status,
        priority: 'alta',
        createdAt: m.data_solicitacao || new Date().toISOString(),
        isUnread: m.status === 'pendente',
        isAttended: m.status !== 'pendente',
        linkUrl: `/manutencoes?status=${m.status}`,
        actionLabel: 'Ver na Bancada',
      });
    });

    // 3. Preventive Maintenance (Deduplicated & Filtered for completed orders)
    const pmNotifsByOrder = new Map<number, PMNotification[]>();
    const orphanPmNotifs: PMNotification[] = [];

    pmNotifications.forEach((n) => {
      if (n.order_id) {
        const list = pmNotifsByOrder.get(n.order_id) || [];
        list.push(n);
        pmNotifsByOrder.set(n.order_id, list);
      } else {
        orphanPmNotifs.push(n);
      }
    });

    const processedOrders = new Set<number>();

    // 3a. Process active assigned Preventive Orders
    pmOrders.forEach((o) => {
      // JÁ CONCLUÍDA / CANCELADA: Não deve aparecer nas notificações ativas!
      if (o.status === 'Concluída' || o.status === 'Cancelada') return;
      processedOrders.add(o.id);

      const relatedNotifs = pmNotifsByOrder.get(o.id) || [];
      const hasUnread = relatedNotifs.some((n) => !n.lida);
      const dateInfo = calculatePMDateInfo(o.data_agendada);

      const markOrderRead = relatedNotifs.length > 0
        ? async () => {
            await Promise.all(relatedNotifs.filter((n) => !n.lida).map((n) => onMarkPmRead(n.id)));
          }
        : undefined;

      items.push({
        id: `pm_order_${o.id}`,
        source: 'preventive',
        sourceLabel: 'Preventiva',
        itemType: 'task',
        title: o.asset?.nome || o.infra_predial_servico || 'Manutenção Preventiva',
        subtitle: o.asset?.e_patrimonio ? `Patrimônio: ${o.asset.e_patrimonio}` : o.plan?.nome ? `Plano: ${o.plan.nome}` : undefined,
        description: o.observacoes || (o.plan?.nome ? `Plano: ${o.plan.nome}` : 'Checklist e inspeção preventiva programada.'),
        code: `#${o.numero}`,
        status: o.status,
        priority: (o.prioridade?.toLowerCase() as any) || 'media',
        createdAt: o.data_abertura || o.data_agendada || new Date().toISOString(),
        isUnread: hasUnread || dateInfo?.isOverdue || dateInfo?.isToday || o.status === 'Aberta',
        isAttended: o.status === 'Em andamento' && !hasUnread,
        linkUrl: `/manutencao-preventiva?openDetail=1&orderId=${o.id}`,
        actionLabel: 'Executar Preventiva',
        dateInfo,
        onMarkRead: markOrderRead,
      });
    });

    // 3b. Remaining PM notifications for orders not in assigned list
    pmNotifsByOrder.forEach((notifs, orderId) => {
      if (processedOrders.has(orderId)) return;
      processedOrders.add(orderId);

      const latest = notifs[0];
      const hasUnread = notifs.some((n) => !n.lida);
      const markOrderRead = async () => {
        await Promise.all(notifs.filter((n) => !n.lida).map((n) => onMarkPmRead(n.id)));
      };

      items.push({
        id: `pm_notif_order_${orderId}`,
        source: 'preventive',
        sourceLabel: 'Preventiva',
        itemType: 'notification',
        title: 'Designação de Preventiva',
        description: latest.mensagem,
        code: `#OS-${orderId}`,
        createdAt: latest.data_criacao || new Date().toISOString(),
        isUnread: hasUnread,
        isAttended: !hasUnread,
        linkUrl: `/manutencao-preventiva?openDetail=1&orderId=${orderId}`,
        actionLabel: 'Ver OS Preventiva',
        onMarkRead: markOrderRead,
      });
    });

    // Orphan PM notifications
    orphanPmNotifs.forEach((n) => {
      items.push({
        id: `pm_notif_${n.id}`,
        source: 'preventive',
        sourceLabel: 'Preventiva',
        itemType: 'notification',
        title: 'Notificação de Preventiva',
        description: n.mensagem,
        createdAt: n.data_criacao || new Date().toISOString(),
        isUnread: !n.lida,
        isAttended: n.lida,
        linkUrl: '/manutencao-preventiva',
        actionLabel: 'Ver Preventiva',
        onMarkRead: () => onMarkPmRead(n.id),
      });
    });

    // 4. Kanban Notifications
    const kbNotifsByCard = new Map<number, KanbanNotification[]>();
    const orphanKbNotifs: KanbanNotification[] = [];

    kbNotifications.forEach((n) => {
      if (n.card_id) {
        const list = kbNotifsByCard.get(n.card_id) || [];
        list.push(n);
        kbNotifsByCard.set(n.card_id, list);
      } else {
        orphanKbNotifs.push(n);
      }
    });

    kbNotifsByCard.forEach((notifs, cardId) => {
      const latest = notifs[0];
      const hasUnread = notifs.some((n) => !n.lida);
      const markCardRead = async () => {
        await Promise.all(notifs.filter((n) => !n.lida).map((n) => onMarkKbRead(n.id)));
      };

      items.push({
        id: `kb_card_${cardId}`,
        source: 'kanban',
        sourceLabel: 'Kanban TI',
        itemType: 'notification',
        title: latest.titulo || 'Atualização no Kanban',
        subtitle: notifs.length > 1 ? `${notifs.length} atualizações no cartão` : undefined,
        description: latest.mensagem || '',
        code: `#CARD-${cardId}`,
        createdAt: latest.created_at || new Date().toISOString(),
        isUnread: hasUnread,
        isAttended: !hasUnread,
        linkUrl: `/kanban?projectId=${latest.project_id || ''}&cardId=${cardId}`,
        actionLabel: 'Abrir no Kanban',
        onMarkRead: markCardRead,
      });
    });

    orphanKbNotifs.forEach((n) => {
      items.push({
        id: `kb_notif_${n.id}`,
        source: 'kanban',
        sourceLabel: 'Kanban TI',
        itemType: 'notification',
        title: n.titulo || 'Atualização no Kanban',
        description: n.mensagem || '',
        createdAt: n.created_at || new Date().toISOString(),
        isUnread: !n.lida,
        isAttended: n.lida,
        linkUrl: '/kanban',
        actionLabel: 'Abrir no Kanban',
        onMarkRead: () => onMarkKbRead(n.id),
      });
    });

    // 5. RH Comunicados
    rhComunicados.forEach((item) => {
      items.push({
        id: `rh_comunicado_${item.comunicado.id}`,
        source: 'rh',
        sourceLabel: 'Comunicado RH',
        itemType: 'notification',
        title: item.comunicado.titulo,
        subtitle: item.comunicado.departamento?.nome || (item.comunicado.usuario?.nome ? 'Individual' : 'Geral'),
        description: item.comunicado.mensagem,
        code: `#RH-${item.comunicado.id}`,
        createdAt: item.comunicado.inicio || new Date().toISOString(),
        isUnread: !item.lida,
        isAttended: item.lida,
        linkUrl: '#',
        actionLabel: 'Ver Comunicado',
        onMarkRead: () => onMarkRhRead(item.comunicado.id),
        onOpenDetail: () => onOpenRhModal(item),
      });
    });

    // Sort: Unread first, then by createdAt desc
    return items.sort((a, b) => {
      if (a.isUnread && !b.isUnread) return -1;
      if (!a.isUnread && b.isUnread) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [
    sdNotifications,
    sdTickets,
    maintRequests,
    pmNotifications,
    pmOrders,
    kbNotifications,
    rhComunicados,
    onMarkSdRead,
    onMarkPmRead,
    onMarkKbRead,
    onMarkRhRead,
    onOpenRhModal,
  ]);

  // Counts of active pending items (excluding locally dismissed)
  const activePendingItems = useMemo(() => {
    return allItems.filter((i) => i.isUnread && !dismissedItemIds.has(i.id));
  }, [allItems, dismissedItemIds]);

  const counts = useMemo(() => {
    return {
      all: allItems.length,
      allPending: activePendingItems.length,
      service_desk: activePendingItems.filter((i) => i.source === 'service_desk').length,
      maintenance: activePendingItems.filter((i) => i.source === 'maintenance').length,
      preventive: activePendingItems.filter((i) => i.source === 'preventive').length,
      kanban: activePendingItems.filter((i) => i.source === 'kanban').length,
      rh: activePendingItems.filter((i) => i.source === 'rh').length,
    };
  }, [allItems.length, activePendingItems]);

  // Filtered items based on viewMode ('pending' vs 'history'), source and search query
  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      const isDismissed = dismissedItemIds.has(item.id);

      // In 'pending' mode, only show active unread items that have NOT been dismissed/attended
      if (viewMode === 'pending') {
        if (!item.isUnread || isDismissed) {
          return false;
        }
      } else {
        // In 'history' mode, show items that have already been attended or read or dismissed
        if (item.isUnread && !isDismissed) {
          return false;
        }
      }

      // Source filter
      if (selectedSource !== 'all' && item.source !== selectedSource) {
        return false;
      }

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesDesc = item.description.toLowerCase().includes(q);
        const matchesCode = item.code?.toLowerCase().includes(q);
        const matchesSubtitle = item.subtitle?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesCode && !matchesSubtitle) {
          return false;
        }
      }
      return true;
    });
  }, [allItems, dismissedItemIds, viewMode, selectedSource, searchQuery]);

  // Handle single item mark read with IMMEDIATE OPTIMISTIC REMOVAL
  const handleMarkItemRead = async (item: UnifiedWorkItem) => {
    // Immediately remove from the notification list
    setDismissedItemIds((prev) => new Set(prev).add(item.id));
    if (item.onMarkRead) {
      try {
        await item.onMarkRead();
      } catch (err) {
        console.error('Erro ao marcar notificação como lida:', err);
      }
    }
  };

  // Global mark all read with IMMEDIATE OPTIMISTIC REMOVAL
  const handleMarkAllRead = useCallback(async () => {
    setIsMarkingAll(true);
    // Optimistically remove all current unread items from the notification list
    setDismissedItemIds((prev) => {
      const next = new Set(prev);
      allItems.forEach((i) => {
        if (i.isUnread) next.add(i.id);
      });
      return next;
    });

    try {
      await Promise.allSettled([
        onMarkAllSdRead(),
        onMarkAllPmRead(),
        onMarkAllKbRead(),
        ...rhComunicados.filter((c) => !c.lida).map((c) => onMarkRhRead(c.comunicado.id)),
      ]);
    } finally {
      setIsMarkingAll(false);
    }
  }, [allItems, onMarkAllSdRead, onMarkAllPmRead, onMarkAllKbRead, onMarkRhRead, rhComunicados]);

  // Colors & styles by source
  const sourceMeta: Record<
    NotificationSource,
    {
      label: string;
      icon: React.ComponentType<{ size?: number; className?: string }>;
      colorClass: string;
      badgeClass: string;
      borderAccent: string;
      bgHighlight: string;
    }
  > = {
    service_desk: {
      label: 'Suporte',
      icon: MessageSquare,
      colorClass: 'text-blue-500',
      badgeClass: 'bg-blue-500/10 border-blue-500/30 text-blue-600',
      borderAccent: 'border-l-blue-500',
      bgHighlight: 'bg-blue-500/5',
    },
    maintenance: {
      label: 'Bancada',
      icon: Wrench,
      colorClass: 'text-orange-500',
      badgeClass: 'bg-orange-500/10 border-orange-500/30 text-orange-600',
      borderAccent: 'border-l-orange-500',
      bgHighlight: 'bg-orange-500/5',
    },
    preventive: {
      label: 'Preventiva',
      icon: ClipboardList,
      colorClass: 'text-amber-500',
      badgeClass: 'bg-amber-500/10 border-amber-500/30 text-amber-600',
      borderAccent: 'border-l-amber-500',
      bgHighlight: 'bg-amber-500/5',
    },
    kanban: {
      label: 'Kanban TI',
      icon: Columns3,
      colorClass: 'text-cyan-600',
      badgeClass: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-600',
      borderAccent: 'border-l-cyan-500',
      bgHighlight: 'bg-cyan-500/5',
    },
    rh: {
      label: 'Comunicado RH',
      icon: Megaphone,
      colorClass: 'text-emerald-600',
      badgeClass: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600',
      borderAccent: 'border-l-emerald-500',
      bgHighlight: 'bg-emerald-500/5',
    },
  };

  const priorityMeta: Record<string, { label: string; className: string }> = {
    urgente: { label: 'Urgente', className: 'text-red-500 bg-red-500/10 border-red-500/30' },
    alta: { label: 'Alta', className: 'text-orange-500 bg-orange-500/10 border-orange-500/30' },
    media: { label: 'Média', className: 'text-blue-500 bg-blue-500/10 border-blue-500/30' },
    baixa: { label: 'Baixa', className: 'text-slate-500 bg-slate-500/10 border-slate-500/30' },
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMinutes < 1) return 'Agora mesmo';
      if (diffMinutes < 60) return `Há ${diffMinutes} min`;
      if (diffHours < 24) return `Há ${diffHours}h`;
      if (diffDays === 1) return 'Ontem';
      if (diffDays < 7) return `Há ${diffDays} dias`;
      return date.toLocaleDateString('pt-BR');
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Central de Notificações */}
      <div className="relative overflow-hidden rounded-2xl border border-brand-border bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 p-6 text-white shadow-md">
        <div className="absolute right-0 top-0 -mr-10 -mt-10 h-44 w-44 rounded-full bg-blue-500/10 blur-2xl" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-500/20 p-2.5 text-blue-400 border border-blue-400/30 shadow-inner">
              <Bell size={24} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-white m-0">
                  Central de Notificações & Tarefas
                </h2>
                {counts.allPending > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 border border-amber-400/40 px-2.5 py-0.5 text-xs font-mono font-bold text-amber-300">
                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                    {counts.allPending} pendente{counts.allPending !== 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 px-2 py-0.5 text-[11px] font-mono font-bold text-emerald-300">
                    <Check size={12} /> Tudo em dia
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-300 max-w-2xl leading-relaxed">
                Itens atendidos saem automaticamente da fila para manter seu fluxo de trabalho limpo e focado.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/20 active:scale-95 disabled:opacity-50 cursor-pointer"
                title="Atualizar notificações"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin text-blue-400' : ''} />
                <span className="hidden sm:inline">Atualizar</span>
              </button>
            )}

            {counts.allPending > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={isMarkingAll}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-500 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <CheckCheck size={15} />
                <span>{isMarkingAll ? 'Processando...' : 'Marcar todas como lidas'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Resumo de métricas por módulo (KPIs) */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-4 border-t border-white/10">
          {/* Suporte */}
          <button
            type="button"
            onClick={() => setSelectedSource('service_desk')}
            className={`rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
              selectedSource === 'service_desk'
                ? 'border-blue-400 bg-blue-500/20 shadow'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-blue-300">
              <span className="font-semibold flex items-center gap-1">
                <MessageSquare size={13} /> Suporte
              </span>
              {counts.service_desk > 0 && (
                <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-white font-mono">{counts.service_desk}</span>
              <span className="text-[10px] text-slate-400 font-mono">pendentes</span>
            </div>
          </button>

          {/* Bancada */}
          <button
            type="button"
            onClick={() => setSelectedSource('maintenance')}
            className={`rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
              selectedSource === 'maintenance'
                ? 'border-orange-400 bg-orange-500/20 shadow'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-orange-300">
              <span className="font-semibold flex items-center gap-1">
                <Wrench size={13} /> Bancada
              </span>
              {counts.maintenance > 0 && (
                <span className="h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-white font-mono">{counts.maintenance}</span>
              <span className="text-[10px] text-slate-400 font-mono">pendentes</span>
            </div>
          </button>

          {/* Preventiva */}
          <button
            type="button"
            onClick={() => setSelectedSource('preventive')}
            className={`rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
              selectedSource === 'preventive'
                ? 'border-amber-400 bg-amber-500/20 shadow'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-amber-300">
              <span className="font-semibold flex items-center gap-1">
                <ClipboardList size={13} /> Preventivas
              </span>
              {counts.preventive > 0 && (
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-white font-mono">{counts.preventive}</span>
              <span className="text-[10px] text-slate-400 font-mono">pendentes</span>
            </div>
          </button>

          {/* Kanban */}
          <button
            type="button"
            onClick={() => setSelectedSource('kanban')}
            className={`rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
              selectedSource === 'kanban'
                ? 'border-cyan-400 bg-cyan-500/20 shadow'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-cyan-300">
              <span className="font-semibold flex items-center gap-1">
                <Columns3 size={13} /> Kanban TI
              </span>
              {counts.kanban > 0 && (
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-white font-mono">{counts.kanban}</span>
              <span className="text-[10px] text-slate-400 font-mono">pendentes</span>
            </div>
          </button>

          {/* RH */}
          <button
            type="button"
            onClick={() => setSelectedSource('rh')}
            className={`col-span-2 sm:col-span-1 rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
              selectedSource === 'rh'
                ? 'border-emerald-400 bg-emerald-500/20 shadow'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-emerald-300">
              <span className="font-semibold flex items-center gap-1">
                <Megaphone size={13} /> RH Avisos
              </span>
              {counts.rh > 0 && (
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-white font-mono">{counts.rh}</span>
              <span className="text-[10px] text-slate-400 font-mono">pendentes</span>
            </div>
          </button>
        </div>
      </div>

      {/* Barra de Filtros, Modo de Visualização e Busca */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-brand-border bg-brand-card p-3 shadow-sm">
        {/* Toggle Ativas/Pendentes vs Histórico de Atendidas */}
        <div className="flex items-center rounded-xl bg-brand-dark/40 p-1 border border-brand-border">
          <button
            type="button"
            onClick={() => setViewMode('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'pending'
                ? 'bg-brand-primary text-brand-dark shadow-sm'
                : 'text-brand-muted hover:text-brand-text'
            }`}
          >
            <Sparkles size={13} />
            <span>Pendentes ({counts.allPending})</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('history')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'history'
                ? 'bg-brand-primary text-brand-dark shadow-sm'
                : 'text-brand-muted hover:text-brand-text'
            }`}
          >
            <History size={13} />
            <span>Atendidas / Histórico</span>
          </button>
        </div>

        {/* Pílulas de Módulo */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setSelectedSource('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition cursor-pointer ${
              selectedSource === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-brand-dark/30 text-brand-muted hover:text-brand-text border border-brand-border'
            }`}
          >
            Todos
          </button>

          {(
            [
              ['service_desk', 'Suporte', MessageSquare],
              ['maintenance', 'Bancada', Wrench],
              ['preventive', 'Preventiva', ClipboardList],
              ['kanban', 'Kanban', Columns3],
              ['rh', 'RH', Megaphone],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedSource(key)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono font-semibold transition cursor-pointer ${
                selectedSource === key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-brand-dark/30 text-brand-muted hover:text-brand-text border border-brand-border'
              }`}
            >
              <Icon size={12} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Input busca */}
        <div className="relative sm:w-44">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-muted" />
          <input
            type="text"
            placeholder="Buscar..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-brand-border bg-brand-dark/30 pl-8 pr-3 py-1.5 text-xs text-brand-text focus:border-brand-primary focus:outline-none"
          />
        </div>
      </div>

      {/* Lista de Cards das Notificações & Tarefas */}
      <div className="space-y-3">
        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-brand-border bg-brand-card p-12 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-dark/40 text-brand-muted border border-brand-border">
              {viewMode === 'pending' ? <Check size={28} className="text-emerald-500" /> : <Inbox size={28} />}
            </div>
            <h3 className="text-base font-bold text-brand-text">
              {viewMode === 'pending' ? 'Tudo em dia!' : 'Nenhum histórico encontrado'}
            </h3>
            <p className="mt-1 text-xs text-brand-muted max-w-md mx-auto">
              {viewMode === 'pending'
                ? 'Todas as suas notificações e ordens foram atendidas ou arquivadas. Bom trabalho!'
                : 'Nenhuma notificação atendida arquivada no histórico recente.'}
            </p>
            {viewMode === 'pending' && (
              <button
                type="button"
                onClick={() => setViewMode('history')}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-dark px-3 py-1.5 text-xs font-mono font-bold text-brand-primary hover:bg-brand-primary/10 transition cursor-pointer"
              >
                <History size={13} />
                <span>Ver histórico de atendidas</span>
              </button>
            )}
          </div>
        ) : (
          filteredItems.map((item) => {
            const meta = sourceMeta[item.source];
            const SourceIcon = meta.icon;
            const prio = item.priority ? priorityMeta[item.priority] : undefined;

            return (
              <article
                key={item.id}
                className={`relative overflow-hidden rounded-xl border transition-all duration-200 hover:shadow-md hover:border-brand-primary/40 ${
                  meta.borderAccent
                } border-l-[5px] ${
                  item.isUnread && !dismissedItemIds.has(item.id)
                    ? 'border-brand-border bg-white dark:bg-slate-900 shadow-sm'
                    : 'border-brand-border/70 bg-brand-card/70 opacity-85'
                }`}
              >
                {/* Indicador pulsante de não lido */}
                {item.isUnread && !dismissedItemIds.has(item.id) && (
                  <span
                    aria-label="Pendente"
                    className="absolute right-3.5 top-3.5 h-2.5 w-2.5 rounded-full bg-blue-500 shadow-sm animate-pulse"
                    title="Item pendente de atendimento"
                  />
                )}

                <div className="p-4 sm:p-5">
                  {/* Top Bar do Card */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Badge da Fonte */}
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${meta.badgeClass}`}
                      >
                        <SourceIcon size={11} />
                        {meta.label}
                      </span>

                      {/* Código de Identificação */}
                      {item.code && (
                        <span className="font-mono text-xs font-bold text-brand-primary">
                          {item.code}
                        </span>
                      )}

                      {/* Status */}
                      {item.status && (
                        <span className="text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded border border-brand-border bg-brand-dark/30 text-brand-text">
                          {item.status}
                        </span>
                      )}

                      {/* Prioridade */}
                      {prio && (
                        <span
                          className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${prio.className}`}
                        >
                          {prio.label}
                        </span>
                      )}

                      {/* Tag de atraso ou hoje */}
                      {item.dateInfo?.isOverdue && (
                        <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-500 flex items-center gap-1">
                          <AlertTriangle size={11} />
                          {item.dateInfo.label}
                        </span>
                      )}
                      {item.dateInfo?.isToday && (
                        <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-600 flex items-center gap-1">
                          <Clock size={11} />
                          {item.dateInfo.label}
                        </span>
                      )}
                    </div>

                    {/* Timestamp relativo */}
                    <div className="flex items-center gap-1 text-[11px] font-mono text-brand-muted">
                      <Clock size={12} />
                      <span>{formatRelativeTime(item.createdAt)}</span>
                    </div>
                  </div>

                  {/* Título & Conteúdo */}
                  <div className="mt-2.5">
                    <h3 className="text-sm font-bold text-brand-text tracking-tight m-0">
                      {item.title}
                    </h3>
                    {item.subtitle && (
                      <p className="mt-0.5 text-xs text-brand-muted font-medium font-mono">
                        {item.subtitle}
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-brand-muted leading-relaxed line-clamp-2 m-0">
                      {item.description}
                    </p>
                  </div>

                  {/* Rodapé com Ações Diretas */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-brand-border/60 pt-3">
                    <div className="text-[11px] font-mono text-brand-muted">
                      {item.itemType === 'task' ? (
                        <span className="inline-flex items-center gap-1 text-blue-600 font-semibold">
                          <Layers size={12} /> Tarefa operacional
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Bell size={12} /> Notificação
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Botão Marcar como Lido / Ciente (Remove imediatamente da lista) */}
                      {item.isUnread && !dismissedItemIds.has(item.id) && (
                        <button
                          type="button"
                          onClick={() => handleMarkItemRead(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-brand-border bg-brand-dark/40 px-2.5 py-1 text-xs font-mono font-semibold text-brand-muted hover:text-brand-text hover:bg-brand-primary/10 transition cursor-pointer"
                          title="Marcar como atendida/lida e remover da notificação"
                        >
                          <Check size={13} className="text-emerald-500" />
                          <span>Atendido / Lido</span>
                        </button>
                      )}

                      {/* Botão de Ação Direta */}
                      {item.onOpenDetail ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (item.onMarkRead) {
                              void item.onMarkRead();
                            }
                            setDismissedItemIds((prev) => new Set(prev).add(item.id));
                            item.onOpenDetail?.();
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider text-brand-dark shadow-sm hover:bg-brand-primary/90 transition cursor-pointer"
                        >
                          <span>{item.actionLabel}</span>
                          <ArrowRight size={13} />
                        </button>
                      ) : (
                        <Link
                          to={item.linkUrl}
                          onClick={() => {
                            if (item.onMarkRead) {
                              void item.onMarkRead();
                            }
                            setDismissedItemIds((prev) => new Set(prev).add(item.id));
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider text-brand-dark shadow-sm hover:bg-brand-primary/90 transition cursor-pointer"
                        >
                          <span>{item.actionLabel}</span>
                          <ArrowRight size={13} />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
};
