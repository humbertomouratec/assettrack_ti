import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { serviceDeskApi } from '../api/serviceDesk';
import { usersApi } from '../api/users';
import { useAuthStore } from '../stores/authStore';
import { toApiFileUrl } from '../api/client';
import type { ServiceTicket, ServiceCategory, ServiceDefinition, ServiceDeskNotification, User } from '../types';
import {
  Plus,
  MessageSquare,
  Clock,
  User as UserIcon,
  Check,
  X,
  AlertCircle,
  Filter,
  CheckCircle2,
  Send,
  Star,
  Play,
  Bell
} from 'lucide-react';

export const ServiceDeskPage: React.FC = () => {
  const location = useLocation();
  const { user: currentUser } = useAuthStore();
  const isTechnicianOrAbove = currentUser?.role === 'admin' || currentUser?.role === 'gerente_ti' || currentUser?.role === 'gerente_infra' || currentUser?.role === 'tecnico';
  const isTechnician = currentUser?.role === 'tecnico';

  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [definitions, setDefinitions] = useState<ServiceDefinition[]>([]);
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [notifications, setNotifications] = useState<ServiceDeskNotification[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');

  // Ticket creation form
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDescription, setNewDescription] = useState('');
  const [newPriority, setNewPriority] = useState<'baixa' | 'media' | 'alta' | 'urgente'>('media');
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<number | ''>('');
  const [newAssignedTechId, setNewAssignedTechId] = useState<number | ''>('');
  const [newTicketAttachedFile, setNewTicketAttachedFile] = useState<File | null>(null);
  const [newTicketAttachedPath, setNewTicketAttachedPath] = useState<string>('');
  const [newTicketUploading, setNewTicketUploading] = useState(false);

  // Config modal state
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [activeConfigTab, setActiveConfigTab] = useState<'categorias' | 'servicos'>('categorias');

  // Category form
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDesc, setNewCategoryDesc] = useState('');

  // Definition form
  const [newDefName, setNewDefName] = useState('');
  const [newDefDesc, setNewDefDesc] = useState('');
  const [newDefCategoryId, setNewDefCategoryId] = useState<number | ''>('');
  // Detail panel state (Layout Diversification: Slide-out panel)
  const normalizeStatus = (status: string | undefined): string => {
    if (!status) return '';
    return status.toLowerCase().replace(/\s+/g, '_');
  };

  const statusLabel = (status: string | undefined): string => {
    const labels: Record<string, string> = {
      aberto: 'Aberto',
      em_atendimento: 'Em atendimento',
      resolvido: 'Resolvido',
      fechado: 'Fechado',
    };
    return labels[normalizeStatus(status)] || normalizeStatus(status).replace('_', ' ') || 'Sem status';
  };

  const isImageFile = (url: string | undefined): boolean => {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.gif') || lower.endsWith('.webp');
  };

  const getFileName = (url: string | undefined): string => {
    if (!url) return '';
    const parts = url.split('/');
    return parts[parts.length - 1];
  };

  const getDescriptionSummary = (description: string | undefined, maxLength = 92): string => {
    const normalized = (description || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return 'Sem descrição';
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
  };

  const handleNewTicketUpload = async (file: File) => {
    try {
      setNewTicketUploading(true);
      const res = await serviceDeskApi.uploadTicketAttachment(file);
      setNewTicketAttachedPath(res.url);
      setNewTicketAttachedFile(file);
    } catch (err: any) {
      alert('Erro ao fazer upload do arquivo.');
    } finally {
      setNewTicketUploading(false);
    }
  };

  const handleNewTicketPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleNewTicketUpload(file);
          break;
        }
      }
    }
  };

  const handleNewTicketFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleNewTicketUpload(e.target.files[0]);
    }
  };

  const handleRemoveNewTicketAttachment = () => {
    setNewTicketAttachedFile(null);
    setNewTicketAttachedPath('');
  };

  // Detail panel state (Layout Diversification)
  const [selectedTicket, setSelectedTicket] = useState<ServiceTicket | null>(null);
  const [previewImage, setPreviewImage] = useState<{ src: string; title: string } | null>(null);
  const [commentMessage, setCommentMessage] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [showResolutionForm, setShowResolutionForm] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);

  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // Assign state
  const [assignedTechId, setAssignedTechId] = useState<number | ''>('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAttachedFile(e.target.files[0]);
    }
  };

  const openPreviewImage = (src: string, title: string) => {
    if (!src) return;
    setPreviewImage({ src, title });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1 || items[i].type.indexOf('pdf') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const extension = file.type.split('/')[1] || 'png';
          const name = `pasted_image_${Date.now()}.${extension}`;
          const renamedFile = new File([file], name, { type: file.type });
          setAttachedFile(renamedFile);
          e.preventDefault();
        }
      }
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get('status');
    if (status) {
      setStatusFilter(status.toLowerCase());
    }

    const priority = params.get('priority');
    if (priority) {
      setPriorityFilter(priority.toLowerCase());
    }
  }, [location.search]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ticketsData, notificationsData] = await Promise.all([
        serviceDeskApi.listTickets(),
        serviceDeskApi.listNotifications(),
      ]);
      setTickets(ticketsData);
      setNotifications(notificationsData);

      const ticketId = Number(new URLSearchParams(location.search).get('ticketId'));
      if (Number.isInteger(ticketId) && ticketId > 0) {
        const ticketFromAlert = ticketsData.find((ticket) => ticket.id === ticketId);
        if (ticketFromAlert) {
          await handleSelectTicket(ticketFromAlert);
        }
      }

      const catsData = await serviceDeskApi.listCategories();
      setCategories(catsData);

      const defsData = await serviceDeskApi.listDefinitions();
      setDefinitions(defsData);

      if (isTechnicianOrAbove) {
        const usersData = await usersApi.list();
        // filter technicians
        const techs = usersData.filter(u => u.role === 'tecnico' || u.role === 'admin' || u.role === 'gerente_ti' || u.role === 'gerente_infra');
        setTechnicians(techs);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao carregar dados do Service Desk.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDescription || !selectedDefinitionId) {
      setError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    try {
      const ticket = await serviceDeskApi.createTicket({
        descricao: newDescription,
        prioridade: newPriority,
        servico_id: Number(selectedDefinitionId),
        foto: newTicketAttachedPath || undefined,
        tecnico_id: newAssignedTechId ? Number(newAssignedTechId) : undefined,
      });

      setTickets([ticket, ...tickets]);
      setShowCreateModal(false);
      // Reset form
      setNewDescription('');
      setNewPriority('media');
      setSelectedDefinitionId('');
      setNewAssignedTechId(isTechnician && currentUser ? currentUser.id : '');
      setNewTicketAttachedFile(null);
      setNewTicketAttachedPath('');
      setNewTicketUploading(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao abrir chamado.');
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName) return;
    try {
      const cat = await serviceDeskApi.createCategory({
        nome: newCategoryName,
        descricao: newCategoryDesc
      });
      setCategories([...categories, cat]);
      setNewCategoryName('');
      setNewCategoryDesc('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao criar categoria.');
    }
  };

  const handleCreateDefinition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDefName || !newDefCategoryId) return;
    try {
      const def = await serviceDeskApi.createDefinition({
        nome: newDefName,
        descricao: newDefDesc,
        categoria_id: Number(newDefCategoryId)
      });
      setDefinitions([...definitions, def]);
      setNewDefName('');
      setNewDefDesc('');
      setNewDefCategoryId('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao criar serviço.');
    }
  };

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;

    const hasMessage = !!commentMessage.trim();
    const hasFile = !!attachedFile;
    if (!hasMessage && !hasFile) return;

    setUploadingAttachment(true);
    try {
      let fileUrl = '';
      if (attachedFile) {
        const uploadResult = await serviceDeskApi.uploadAttachment(selectedTicket.id, attachedFile);
        fileUrl = uploadResult.url;
      }

      const finalMsg = hasMessage ? commentMessage : `Enviou um anexo: ${attachedFile?.name}`;
      const newComment = await serviceDeskApi.createInteraction(selectedTicket.id, finalMsg, fileUrl || undefined);

      if (currentUser) {
        newComment.usuario = {
          id: currentUser.id,
          nome: currentUser.nome,
          email: currentUser.email,
        };
        newComment.user = newComment.usuario;
      }

      const updatedTicket = { ...selectedTicket };
      updatedTicket.interacoes = [...(updatedTicket.interacoes || []), newComment];

      setSelectedTicket(updatedTicket);
      setTickets(tickets.map(t => t.id === updatedTicket.id ? updatedTicket : t));
      setCommentMessage('');
      setAttachedFile(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao enviar comentário.');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleUpdateStatus = async (status: 'em_atendimento' | 'resolvido' | 'fechado', notes?: string) => {
    if (!selectedTicket) return;

    try {
      const payload: Partial<ServiceTicket> = { status };
      if (notes) {
        payload.nota_resolucao = notes;
      }
      if (assignedTechId) {
        payload.tecnico_id = Number(assignedTechId);
        payload.responsavel_id = Number(assignedTechId);
      } else if (status === 'em_atendimento' && isTechnician && currentUser) {
        // Iniciar atendimento por um técnico também registra automaticamente o responsável.
        payload.tecnico_id = currentUser.id;
        payload.responsavel_id = currentUser.id;
        setAssignedTechId(currentUser.id);
      }

      const updated = await serviceDeskApi.updateTicket(selectedTicket.id, payload);

      // reload full details to get interactions
      const freshTicket = await serviceDeskApi.getTicketById(updated.id);
      setSelectedTicket(freshTicket);
      setTickets(tickets.map(t => t.id === freshTicket.id ? freshTicket : t));

      setShowResolutionForm(false);
      setResolutionNotes('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao atualizar status do chamado.');
    }
  };

  const handleAssignTicket = async (techId: number) => {
    if (!selectedTicket) return;
    try {
      const updated = await serviceDeskApi.updateTicket(selectedTicket.id, {
        tecnico_id: techId,
        responsavel_id: techId,
        status: 'em_atendimento',
      });
      const freshTicket = await serviceDeskApi.getTicketById(updated.id);
      setSelectedTicket(freshTicket);
      setTickets(tickets.map(t => t.id === freshTicket.id ? freshTicket : t));
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao delegar chamado.');
    }
  };

  const handleSendFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;

    try {
      const updated = await serviceDeskApi.updateTicket(selectedTicket.id, {
        avaliacao: rating,
        feedback_usuario: feedbackComment,
        nota_feedback: rating,
        comentario_feedback: feedbackComment,
        status: 'fechado' as any,
      });
      const freshTicket = await serviceDeskApi.getTicketById(updated.id);
      setSelectedTicket(freshTicket);
      setTickets(tickets.map(t => t.id === freshTicket.id ? freshTicket : t));
      setShowFeedbackForm(false);
      setFeedbackComment('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao enviar feedback.');
    }
  };

  const handleSelectTicket = async (ticket: ServiceTicket) => {
    try {
      const fullTicket = await serviceDeskApi.getTicketById(ticket.id);
      setSelectedTicket(fullTicket);
      if (fullTicket.tecnico_id || fullTicket.responsavel_id) {
        setAssignedTechId(fullTicket.tecnico_id || fullTicket.responsavel_id || '');
      } else {
        setAssignedTechId('');
      }
    } catch (err: any) {
      setError('Erro ao carregar detalhes do chamado.');
    }
  };

  // Filtered tickets list
  const filteredTickets = tickets.filter(t => {
    if (statusFilter && normalizeStatus(t.status) !== statusFilter) return false;
    if (priorityFilter && t.prioridade !== priorityFilter) return false;
    return true;
  });

  const ticketStatusCounts = tickets.reduce<Record<string, number>>((counts, ticket) => {
    const status = normalizeStatus(ticket.status);
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const ticketPriorityCounts = tickets.reduce<Record<string, number>>((counts, ticket) => {
    counts[ticket.prioridade] = (counts[ticket.prioridade] || 0) + 1;
    return counts;
  }, {});
  const openTicketCount = tickets.filter((ticket) => ['aberto', 'em_atendimento'].includes(normalizeStatus(ticket.status))).length;
  const resolvedTicketCount = tickets.filter((ticket) => ['resolvido', 'fechado'].includes(normalizeStatus(ticket.status))).length;
  const ticketTotalForChart = Math.max(tickets.length, 1);
  const recentTickets = [...tickets].sort((a, b) => new Date(b.data_abertura).getTime() - new Date(a.data_abertura).getTime()).slice(0, 4);
  const unreadNotifications = notifications.filter((notification) => !notification.lida);

  const openNotification = async (notification: ServiceDeskNotification) => {
    try {
      if (!notification.lida) {
        await serviceDeskApi.markNotificationRead(notification.id);
        setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, lida: true } : item));
      }
      const ticket = await serviceDeskApi.getTicketById(notification.ticket_id);
      setSelectedTicket(ticket);
    } catch {
      setError('Não foi possível abrir o chamado desta notificação.');
    }
  };

  return (
    <div className="flex h-full min-h-[calc(100vh-4rem)] bg-brand-dark overflow-hidden">
      {/* Main Panel */}
      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        <section className="relative overflow-hidden rounded-2xl border border-brand-primary/20 bg-gradient-to-br from-[#0c66e4] via-[#1559b7] to-[#172b4d] p-5 text-white shadow-lg md:p-7">
          <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-blue-100"><MessageSquare size={14} /> Service desk</div>
            <h1 className="m-0 text-2xl font-bold tracking-tight md:text-3xl">Suporte técnico no controle.</h1>
            <p className="mt-2 text-sm leading-6 text-blue-100">Priorize incidentes, acompanhe o SLA e mantenha cada atendimento com histórico completo.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {isTechnicianOrAbove && (
              <button
                onClick={() => setShowConfigModal(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-white/20"
              >
                <Plus size={18} />
                <span>Configurar Serviços</span>
              </button>
            )}
            <button
              onClick={() => {
                setNewAssignedTechId(isTechnician && currentUser ? currentUser.id : '');
                setShowCreateModal(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-brand-primary shadow-sm hover:bg-blue-50"
            >
              <Plus size={18} />
              <span>Abrir Chamado</span>
            </button>
          </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Chamados em aberto', value: openTicketCount, hint: 'abertos ou em atendimento', icon: MessageSquare, tone: 'text-blue-600 bg-blue-50' },
            { label: 'Prioridade urgente', value: ticketPriorityCounts.urgente || 0, hint: 'resposta imediata', icon: AlertCircle, tone: 'text-red-600 bg-red-50' },
            { label: 'Resolvidos', value: resolvedTicketCount, hint: `${tickets.length} chamados no total`, icon: CheckCircle2, tone: 'text-emerald-600 bg-emerald-50' },
            { label: 'Categorias ativas', value: categories.length, hint: `${definitions.length} serviços disponíveis`, icon: Filter, tone: 'text-violet-600 bg-violet-50' },
          ].map(({ label, value, hint, icon: Icon, tone }) => <button type="button" key={label} onClick={() => { if (label === 'Chamados em aberto') setStatusFilter('aberto'); if (label === 'Prioridade urgente') setPriorityFilter('urgente'); }} className="rounded-2xl border border-brand-border bg-brand-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between gap-2"><span className={`rounded-xl p-2 ${tone}`}><Icon size={17} /></span><span className="text-2xl font-bold tracking-tight text-brand-text">{value}</span></div><div className="mt-4 text-xs font-bold uppercase tracking-wide text-brand-text">{label}</div><div className="mt-1 text-xs text-brand-muted">{hint}</div></button>)}
        </div>

        <section className="rounded-2xl border border-brand-border bg-brand-card p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Bell size={17} className="text-brand-primary" /><div><div className="text-xs font-bold uppercase tracking-[0.12em] text-brand-muted">Notificações do Service Desk</div><div className="mt-0.5 text-sm font-semibold text-brand-text">{unreadNotifications.length ? `${unreadNotifications.length} não lida${unreadNotifications.length === 1 ? '' : 's'}` : 'Tudo em dia'}</div></div></div>
            {unreadNotifications.length > 0 && <button type="button" onClick={async () => { await serviceDeskApi.markAllNotificationsRead(); setNotifications((current) => current.map((item) => ({ ...item, lida: true }))); }} className="text-xs font-semibold text-brand-primary hover:underline">Marcar todas como lidas</button>}
          </div>
          {notifications.length > 0 ? <div className="grid gap-2 md:grid-cols-3">{notifications.slice(0, 3).map((notification) => <button type="button" key={notification.id} onClick={() => openNotification(notification)} className={`rounded-xl border p-3 text-left transition hover:border-brand-primary/50 ${notification.lida ? 'border-brand-border bg-brand-dark/10' : 'border-brand-primary/30 bg-brand-primary/5'}`}><div className="text-xs font-bold text-brand-text">{notification.titulo}</div><div className="mt-1 line-clamp-2 text-xs text-brand-muted">{notification.mensagem}</div><div className="mt-2 text-[10px] text-brand-muted">{new Date(notification.data_criacao).toLocaleString('pt-BR')}</div></button>)}</div> : <p className="text-sm text-brand-muted">Nenhum aviso de chamado para você.</p>}
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
          <section className="rounded-2xl border border-brand-border bg-brand-card p-5 shadow-sm"><div className="mb-4 flex items-start justify-between"><div><div className="text-xs font-bold uppercase tracking-[0.12em] text-brand-muted">Panorama do atendimento</div><h2 className="mt-1 text-lg font-bold text-brand-text">Chamados por status</h2></div><span className="text-xs text-brand-muted">{tickets.length} registros</span></div><div className="grid gap-3 sm:grid-cols-4">{[['aberto', 'Abertos', 'bg-blue-500'], ['em_atendimento', 'Em atendimento', 'bg-amber-500'], ['resolvido', 'Resolvidos', 'bg-emerald-500'], ['fechado', 'Fechados', 'bg-slate-400']].map(([key, label, color]) => <button type="button" key={key} onClick={() => setStatusFilter(statusFilter === key ? '' : key)} className={`rounded-xl border p-3 text-left transition hover:border-brand-primary/40 ${statusFilter === key ? 'border-brand-primary ring-2 ring-brand-primary/15' : 'border-brand-border'}`}><div className="flex items-center gap-2 text-xs font-semibold text-brand-text"><span className={`h-2 w-2 rounded-full ${color}`} />{label}</div><div className="mt-2 text-2xl font-bold text-brand-text">{ticketStatusCounts[key] || 0}</div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-dark/10"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(((ticketStatusCounts[key] || 0) / ticketTotalForChart) * 100, ticketStatusCounts[key] ? 6 : 0)}%` }} /></div></button>)}</div></section>
          <section className="rounded-2xl border border-brand-border bg-brand-card p-5 shadow-sm"><div className="mb-4"><div className="text-xs font-bold uppercase tracking-[0.12em] text-brand-muted">Distribuição</div><h2 className="mt-1 text-lg font-bold text-brand-text">Prioridades</h2></div><div className="space-y-3">{[['urgente', 'Urgente', 'bg-red-500'], ['alta', 'Alta', 'bg-amber-500'], ['media', 'Média', 'bg-blue-500'], ['baixa', 'Baixa', 'bg-slate-400']].map(([key, label, color]) => <button type="button" key={key} onClick={() => setPriorityFilter(priorityFilter === key ? '' : key)} className="w-full text-left"><div className="mb-1 flex justify-between text-xs"><span className="font-semibold text-brand-text">{label}</span><span className="font-mono text-brand-muted">{ticketPriorityCounts[key] || 0}</span></div><div className="h-2 overflow-hidden rounded-full bg-brand-dark/10"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(((ticketPriorityCounts[key] || 0) / ticketTotalForChart) * 100, ticketPriorityCounts[key] ? 6 : 0)}%` }} /></div></button>)}</div></section>
        </div>

        <section className="rounded-2xl border border-brand-border bg-brand-card p-5 shadow-sm"><div className="mb-4 flex items-start justify-between"><div><div className="text-xs font-bold uppercase tracking-[0.12em] text-brand-muted">Atividade</div><h2 className="mt-1 text-lg font-bold text-brand-text">Chamados mais recentes</h2></div><span className="text-xs text-brand-muted">Atualização manual na lista</span></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{recentTickets.map((ticket) => <button type="button" key={ticket.id} onClick={() => handleSelectTicket(ticket)} className="rounded-xl border border-brand-border bg-brand-dark/10 p-3 text-left transition hover:border-brand-primary/40"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase text-brand-primary">{ticket.codigo}</span><span className="text-[10px] text-brand-muted">{new Date(ticket.data_abertura).toLocaleDateString('pt-BR')}</span></div><div className="mt-2 line-clamp-2 text-sm font-semibold text-brand-text">{getDescriptionSummary(ticket.descricao, 70)}</div><div className="mt-2 flex items-center justify-between gap-2 text-[10px] uppercase text-brand-muted"><span>{statusLabel(ticket.status)}</span><span>{ticket.prioridade}</span></div></button>)}{recentTickets.length === 0 && <div className="col-span-full rounded-xl border border-dashed border-brand-border p-6 text-center text-sm text-brand-muted">Nenhum chamado registrado.</div>}</div></section>

        {error && (
          <div className="flex items-start space-x-3 p-4 border border-red-500/20 bg-red-500/5 text-red-400 text-sm">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto font-bold">×</button>
          </div>
        )}

        {/* Filters */}
        <div className="p-4 bg-brand-card border border-brand-border flex flex-wrap gap-4 items-center justify-center sm:justify-start">
          <div className="flex items-center space-x-2 text-brand-muted text-sm mr-2">
            <Filter size={16} />
            <span>Filtros:</span>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-brand-dark border border-brand-border px-3 py-1.5 text-xs text-brand-text focus:outline-none focus:border-brand-primary"
          >
            <option value="">Todos os Status</option>
            <option value="aberto">Aberto</option>
            <option value="em_atendimento">Em Atendimento</option>
            <option value="resolvido">Resolvido</option>
            <option value="fechado">Fechado</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-brand-dark border border-brand-border px-3 py-1.5 text-xs text-brand-text focus:outline-none focus:border-brand-primary"
          >
            <option value="">Todas as Prioridades</option>
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
        </div>

        {/* Tickets Grid / List */}
        {loading ? (
          <div className="p-12 text-center text-brand-muted font-mono text-sm">Carregando chamados...</div>
        ) : filteredTickets.length === 0 ? (
          <div className="p-12 border border-brand-border bg-brand-card/20 text-center text-brand-muted text-sm">
            Nenhum chamado encontrado para os filtros selecionados.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredTickets.map((ticket) => (
              <div
                key={ticket.id}
                onClick={() => handleSelectTicket(ticket)}
                className={`p-4 bg-brand-card border transition-all duration-150 cursor-pointer flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0 hover:border-brand-primary/40 ${selectedTicket?.id === ticket.id ? 'border-brand-primary bg-brand-primary/5' : 'border-brand-border'
                  }`}
              >
                <div className="flex-1 flex items-start space-x-3 pr-4 font-sans">
                  {ticket.foto && isImageFile(ticket.foto) && (
                    <div className="shrink-0 mt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPreviewImage(toApiFileUrl(ticket.foto), `Anexo do chamado ${ticket.codigo}`);
                        }}
                        className="block rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/70 focus-visible:ring-offset-0"
                        title="Visualizar imagem"
                      >
                        <img
                          src={toApiFileUrl(ticket.foto)}
                          alt="Thumbnail"
                          className="w-12 h-12 object-cover border border-brand-border/60 rounded cursor-zoom-in hover:border-brand-primary/60 transition-colors"
                        />
                      </button>
                    </div>
                  )}
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono font-bold text-brand-primary px-1.5 py-0.5 bg-brand-primary/10 border border-brand-primary/20">
                        {ticket.codigo}
                      </span>
                      <span className="text-sm font-semibold text-brand-text">{getDescriptionSummary(ticket.descricao)}</span>
                    </div>
                    <p className="text-xs text-brand-muted line-clamp-2">{ticket.descricao}</p>
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-brand-muted">
                      <span className="flex items-center space-x-1">
                        <UserIcon size={12} />
                        <span>{ticket.solicitante?.nome || 'Usuário'}</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center space-x-1">
                        <Clock size={12} />
                        <span>{new Date(ticket.data_abertura).toLocaleDateString('pt-BR')}</span>
                      </span>
                      {ticket.servico?.categoria && (
                        <>
                          <span>•</span>
                          <span className="px-1.5 py-0.2 bg-brand-dark border border-brand-border text-brand-muted">
                            {ticket.servico.categoria.nome}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3 shrink-0">
                  {/* Priority Badge */}
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 border ${ticket.prioridade === 'urgente'
                      ? 'text-red-500 bg-red-500/10 border-red-500/20'
                      : ticket.prioridade === 'alta'
                        ? 'text-amber-500 bg-amber-500/10 border-amber-500/20'
                        : ticket.prioridade === 'media'
                          ? 'text-blue-500 bg-blue-500/10 border-blue-500/20'
                          : 'text-brand-muted bg-brand-muted/10 border-brand-border'
                    }`}>
                    {ticket.prioridade}
                  </span>

                  {/* Status Badge */}
                  <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 ${normalizeStatus(ticket.status) === 'aberto'
                      ? 'text-blue-400 bg-blue-400/10 border border-blue-400/20'
                      : normalizeStatus(ticket.status) === 'em_atendimento'
                        ? 'text-amber-400 bg-amber-400/10 border border-amber-400/20'
                        : normalizeStatus(ticket.status) === 'resolvido'
                          ? 'text-brand-primary bg-brand-primary/10 border border-brand-primary/20'
                          : 'text-brand-muted bg-brand-dark border border-brand-border'
                    }`}>
                    {ticket.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ticket Details Modal (Centered & Responsive Modal Overlay) */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-brand-dark/80 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-2xl bg-brand-card border border-brand-border shadow-2xl flex flex-col max-h-[92vh] my-auto rounded-sm overflow-hidden">
            <div className="p-4 border-b border-brand-border flex items-center justify-between bg-brand-dark/50 shrink-0">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-brand-text text-base">{selectedTicket.codigo}</h3>
                  <span className={`text-[10px] font-mono px-2 py-0.5 border font-semibold ${
                    normalizeStatus(selectedTicket.status) === 'aberto' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                    normalizeStatus(selectedTicket.status) === 'em_atendimento' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                    normalizeStatus(selectedTicket.status) === 'resolvido' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                    'bg-gray-500/10 text-gray-400 border-gray-500/30'
                  }`}>
                    {normalizeStatus(selectedTicket.status).replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <p className="text-[11px] text-brand-muted">Aberto em {new Date(selectedTicket.data_abertura).toLocaleString('pt-BR')}</p>
              </div>
              <button
                onClick={() => setSelectedTicket(null)}
                className="text-brand-muted hover:text-brand-text transition-colors p-1.5 hover:bg-brand-dark rounded"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Ticket Info */}
              <div className="space-y-3">
                <h4 className="font-semibold text-brand-text text-base">{getDescriptionSummary(selectedTicket.descricao, 120)}</h4>
                <p className="text-xs text-brand-muted bg-brand-dark p-3 border border-brand-border/60 rounded-sm whitespace-pre-wrap">
                  {selectedTicket.descricao}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono border-t border-brand-border/40 pt-3">
                  <div className="flex justify-between sm:block">
                    <span className="text-brand-muted">Solicitante: </span>
                    <span className="text-brand-text font-semibold">{selectedTicket.solicitante?.nome || 'N/A'}</span>
                  </div>

                  <div className="flex justify-between sm:block">
                    <span className="text-brand-muted">Serviço: </span>
                    <span className="text-brand-text font-semibold">{selectedTicket.servico?.nome || 'Geral'}</span>
                  </div>

                  <div className="flex justify-between sm:block">
                    <span className="text-brand-muted">Técnico Atribuído: </span>
                    <span className="text-brand-text font-semibold">
                      {selectedTicket.tecnico?.nome || selectedTicket.responsavel?.nome || 'Não atribuído'}
                    </span>
                  </div>

                  {selectedTicket.prioridade && (
                    <div className="flex justify-between sm:block">
                      <span className="text-brand-muted">Prioridade: </span>
                      <span className="text-brand-text font-semibold capitalize">{selectedTicket.prioridade}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Admin/Technician Management controls */}
              {isTechnicianOrAbove && (
                <div className="border-t border-brand-border/60 pt-4 space-y-3">
                  <h5 className="text-xs font-semibold text-brand-primary uppercase tracking-wider font-mono">Gerenciamento Técnico</h5>

                  {/* Delegation selection */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-brand-muted">Delegar para Técnico:</label>
                    <select
                      disabled={normalizeStatus(selectedTicket.status) === 'fechado'}
                      value={assignedTechId}
                      onChange={(e) => {
                        const id = e.target.value === '' ? '' : Number(e.target.value);
                        setAssignedTechId(id);
                        if (id) handleAssignTicket(id);
                      }}
                      className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">Atribuir a...</option>
                      {technicians.map(t => (
                        <option key={t.id} value={t.id}>{t.nome}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    {normalizeStatus(selectedTicket.status) === 'aberto' && (
                      <button
                        onClick={() => handleUpdateStatus('em_atendimento')}
                        className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all shadow-sm rounded-sm"
                      >
                        <Play size={14} />
                        <span>Iniciar Atendimento</span>
                      </button>
                    )}
                    {normalizeStatus(selectedTicket.status) !== 'resolvido' && normalizeStatus(selectedTicket.status) !== 'fechado' && (
                      <button
                        onClick={() => setShowResolutionForm(true)}
                        className="flex-1 py-2 px-3 bg-brand-primary hover:bg-brand-primary/95 text-brand-dark text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all shadow-sm rounded-sm"
                      >
                        <Check size={14} />
                        <span>Resolver Chamado</span>
                      </button>
                    )}
                    {normalizeStatus(selectedTicket.status) === 'resolvido' && (
                      <button
                        onClick={() => handleUpdateStatus('fechado')}
                        className="flex-1 py-2 px-3 bg-brand-muted/10 border border-brand-border hover:bg-brand-card text-brand-text text-xs font-semibold flex items-center justify-center space-x-1.5 rounded-sm"
                      >
                        <CheckCircle2 size={14} />
                        <span>Fechar Chamado</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

            {/* User Rating / Feedback controls */}
            {currentUser?.id === selectedTicket.solicitante_id &&
              selectedTicket.status?.toLowerCase() === 'resolvido' &&
              !selectedTicket.nota_feedback &&
              !selectedTicket.avaliacao && (
                <div className="border-t border-brand-border/60 pt-4 bg-brand-primary/5 p-3 border border-brand-primary/20 space-y-3">
                  <h5 className="text-xs font-semibold text-brand-primary flex items-center space-x-1">
                    <Star size={14} />
                    <span>Avaliar Atendimento</span>
                  </h5>
                  <p className="text-[11px] text-brand-text">Este chamado foi resolvido. Por favor, forneça sua avaliação de atendimento.</p>
                  <button
                    onClick={() => setShowFeedbackForm(true)}
                    className="w-full py-1.5 bg-brand-primary text-brand-dark text-xs font-semibold flex items-center justify-center space-x-1"
                  >
                    <span>Avaliar e Encerrar</span>
                  </button>
                </div>
              )}

            {/* Feedback Detail (if rated) */}
            {(selectedTicket.nota_feedback || selectedTicket.avaliacao) && (
              <div className="border-t border-brand-border/60 pt-4 space-y-2">
                <h5 className="text-xs font-semibold text-brand-text flex items-center space-x-1">
                  <Star size={14} className="text-amber-500" />
                  <span>Avaliação do Usuário</span>
                </h5>
                <div className="flex items-center space-x-1">
                  {[1, 2, 3, 4, 5].map((s) => {
                    const ratingScore = selectedTicket.nota_feedback || selectedTicket.avaliacao || 0;
                    return (
                      <Star
                        key={s}
                        size={14}
                        className={s <= ratingScore ? 'text-amber-500 fill-amber-500' : 'text-brand-muted'}
                      />
                    );
                  })}
                </div>
                {(selectedTicket.comentario_feedback || selectedTicket.feedback_usuario) && (
                  <p className="text-xs italic text-brand-muted font-serif">
                    "{selectedTicket.comentario_feedback || selectedTicket.feedback_usuario}"
                  </p>
                )}
              </div>
            )}

            {/* Resolution Note */}
            {(selectedTicket.nota_resolucao || selectedTicket.solucao) && (
              <div className="border-t border-brand-border/60 pt-4 space-y-1">
                <h5 className="text-xs font-semibold text-brand-text">Solução / Resolução:</h5>
                <p className="text-xs text-brand-muted bg-brand-dark p-2 border border-brand-border/40 font-mono">
                  {selectedTicket.nota_resolucao || selectedTicket.solucao}
                </p>
              </div>
            )}

            {/* Interaction Thread */}
            <div className="border-t border-brand-border/60 pt-4 space-y-3">
              <h5 className="text-xs font-semibold text-brand-text flex items-center space-x-1">
                <MessageSquare size={14} />
                <span>Interações e Comentários</span>
              </h5>

              <div className="space-y-3">
                {selectedTicket.interacoes && selectedTicket.interacoes.map((item) => {
                  const author = item.usuario || item.user;
                  return (
                    <div key={item.id} className="text-xs p-2.5 bg-brand-dark/40 border border-brand-border/50 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-brand-muted mb-1 font-mono">
                        <span className="font-semibold text-brand-text">{author?.nome || 'Usuário'}</span>
                        <span>{new Date(item.data_criacao).toLocaleString('pt-BR')}</span>
                      </div>
                      <p className="text-brand-text text-[11px] whitespace-pre-wrap">{item.mensagem}</p>
                      {item.foto && (
                        <div className="mt-2 pt-2 border-t border-brand-border/20">
                          {isImageFile(item.foto) ? (
                            <button
                              type="button"
                              onClick={() => openPreviewImage(toApiFileUrl(item.foto), `Anexo de ${author?.nome || 'Usuário'}`)}
                              className="block max-w-max rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/70 focus-visible:ring-offset-0"
                              title="Visualizar imagem"
                            >
                              <img
                                src={toApiFileUrl(item.foto)}
                                alt="Anexo"
                                className="max-h-40 max-w-full rounded border border-brand-border/60 hover:border-brand-primary/60 transition-colors cursor-zoom-in"
                              />
                            </button>
                          ) : (
                            <a
                              href={toApiFileUrl(item.foto)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center space-x-1.5 text-brand-primary hover:underline"
                            >
                              <span>📎</span>
                              <span className="truncate max-w-xs">{getFileName(item.foto)}</span>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {(!selectedTicket.interacoes || selectedTicket.interacoes.length === 0) && (
                  <p className="text-[11px] text-brand-muted text-center py-4">Sem interações registradas.</p>
                )}
              </div>
            </div>
          </div>

          {/* Comment Message Box */}
          {normalizeStatus(selectedTicket.status) !== 'fechado' && (
            <form onSubmit={handleSendComment} className="p-3 border-t border-brand-border bg-brand-dark/20 flex flex-col space-y-2">
              {attachedFile && (
                <div className="flex items-center justify-between p-2 bg-brand-dark/60 border border-brand-border/60 rounded-sm text-xs">
                  <div className="flex items-center space-x-2 truncate">
                    <span className="text-brand-primary">📎</span>
                    <span className="text-brand-text truncate">{attachedFile.name}</span>
                    <span className="text-[10px] text-brand-muted">({(attachedFile.size / 1024).toFixed(1)} KB)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAttachedFile(null)}
                    className="text-red-400 hover:text-red-300 font-bold px-1"
                  >
                    ×
                  </button>
                </div>
              )}
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Escreva uma mensagem ou cole arquivos/imagens..."
                  value={commentMessage}
                  onChange={(e) => setCommentMessage(e.target.value)}
                  onPaste={handlePaste}
                  className="flex-1 bg-brand-dark border border-brand-border px-3 py-1.5 text-xs focus:outline-none focus:border-brand-primary text-brand-text placeholder-brand-muted/40"
                />

                <label className="p-1.5 bg-brand-dark border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-primary/50 transition-all cursor-pointer flex items-center justify-center">
                  <Plus size={14} />
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>

                <button
                  type="submit"
                  disabled={uploadingAttachment || (!commentMessage.trim() && !attachedFile)}
                  className="p-1.5 bg-brand-primary/10 border border-brand-primary/30 text-brand-primary hover:bg-brand-primary hover:text-brand-dark transition-all disabled:opacity-40 flex items-center justify-center"
                >
                  {uploadingAttachment ? (
                    <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full" />
                  ) : (
                    <Send size={14} />
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
      )}

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/80 backdrop-blur-md">
          <div className="w-full max-w-lg bg-brand-card border border-brand-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border bg-brand-dark/50">
              <h3 className="font-semibold text-lg text-brand-text">Abrir Novo Chamado de Suporte</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-brand-muted hover:text-brand-text">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-brand-muted">Selecione o Serviço / Incidente</label>
                <select
                  required
                  value={selectedDefinitionId}
                  onChange={(e) => setSelectedDefinitionId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                >
                  <option value="">Escolha um serviço...</option>
                  {categories.map(cat => (
                    <optgroup key={cat.id} label={cat.nome} className="bg-brand-card text-brand-muted">
                      {definitions
                        .filter(def => def.categoria_id === cat.id)
                        .map(def => (
                          <option key={def.id} value={def.id} className="text-brand-text">{def.nome}</option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-brand-muted">Descrição Detalhada do Problema</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Explique detalhadamente o ocorrido..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  onPaste={handleNewTicketPaste}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm focus:outline-none focus:border-brand-primary text-brand-text placeholder-brand-muted/30"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-brand-muted">Prioridade Estimada</label>
                <select
                  value={newPriority}
                  onChange={(e: any) => setNewPriority(e.target.value)}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                >
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>

              {isTechnicianOrAbove && (
                <div className="space-y-1 rounded-lg border border-brand-primary/20 bg-brand-primary/5 p-3">
                  <label className="text-xs font-semibold text-brand-text">Responsável pelo atendimento</label>
                  <select
                    value={newAssignedTechId}
                    onChange={(e) => setNewAssignedTechId(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                  >
                    <option value="">Definir depois</option>
                    {technicians.map((technician) => (
                      <option key={technician.id} value={technician.id}>
                        {technician.id === currentUser?.id ? 'Assumir para mim — ' : ''}{technician.nome}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-brand-muted">
                    {isTechnician ? 'Você pode assumir este chamado agora ou deixar a atribuição para depois.' : 'O chamado atribuído já será aberto como Em Atendimento.'}
                  </p>
                </div>
              )}

              <div className="space-y-2 border-t border-brand-border/30 pt-3">
                <label className="text-xs text-brand-muted block">Anexo / Imagem (opcional)</label>
                <div className="flex flex-col space-y-2">
                  <div className="flex items-center space-x-3">
                    <label className="cursor-pointer bg-brand-dark hover:bg-brand-card border border-brand-border px-3 py-1.5 text-xs text-brand-text flex items-center space-x-2 transition-all">
                      <span>📁 Escolher Arquivo</span>
                      <input
                        type="file"
                        onChange={handleNewTicketFileChange}
                        className="hidden"
                        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
                      />
                    </label>
                    <span className="text-[15px] text-brand-muted font-mono leading-tight">
                      Dica: Você também pode colar (Ctrl+V) uma imagem diretamente na descrição.
                    </span>
                  </div>

                  {newTicketUploading && (
                    <div className="text-[10px] text-brand-primary font-mono animate-pulse">
                      Fazendo upload do anexo...
                    </div>
                  )}

                  {newTicketAttachedFile && (
                    <div className="p-2 bg-brand-dark border border-brand-border flex items-center justify-between text-xs text-brand-text">
                      <span className="truncate max-w-xs">📎 {newTicketAttachedFile.name}</span>
                      <button
                        type="button"
                        onClick={handleRemoveNewTicketAttachment}
                        className="text-red-400 hover:text-red-300 font-bold font-mono px-2"
                      >
                        Remover
                      </button>
                    </div>
                  )}

                  {newTicketAttachedPath && isImageFile(newTicketAttachedPath) && (
                    <div className="mt-2 border border-brand-border/40 max-w-max p-1 bg-brand-dark rounded">
                      <img
                        src={toApiFileUrl(newTicketAttachedPath)}
                        alt="Preview"
                        className="max-h-24 max-w-full object-contain rounded"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="w-1/3 py-2 bg-brand-dark border border-brand-border hover:bg-brand-card text-brand-muted text-sm transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={newTicketUploading}
                  className="flex-1 py-2 bg-brand-primary hover:bg-brand-primary/95 text-brand-dark font-semibold text-sm transition-all disabled:opacity-50"
                >
                  Enviar Chamado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resolution Notes Modal */}
      {showResolutionForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-brand-card border border-brand-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border">
              <h3 className="font-semibold text-brand-text text-sm">Registrar Solução / Resolução</h3>
              <button onClick={() => setShowResolutionForm(false)} className="text-brand-muted hover:text-brand-text">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-brand-muted">Notas da Resolução Técnico</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Informe o procedimento técnico executado para a resolução do chamado..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-xs focus:outline-none focus:border-brand-primary text-brand-text"
                />
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowResolutionForm(false)}
                  className="w-1/3 py-1.5 bg-brand-dark border border-brand-border text-xs text-brand-muted"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleUpdateStatus('resolvido', resolutionNotes)}
                  disabled={!resolutionNotes.trim()}
                  className="flex-1 py-1.5 bg-brand-primary text-brand-dark text-xs font-semibold disabled:opacity-50"
                >
                  Confirmar Resolução
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Feedback Modal */}
      {showFeedbackForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-brand-card border border-brand-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border">
              <h3 className="font-semibold text-brand-text text-sm">Avaliar e Encerrar Chamado</h3>
              <button onClick={() => setShowFeedbackForm(false)} className="text-brand-muted hover:text-brand-text">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSendFeedback} className="p-6 space-y-4">
              <div className="space-y-2 text-center">
                <label className="text-xs text-brand-muted">Sua Nota para este Atendimento:</label>
                <div
                  className="flex justify-center space-x-2 pt-2"
                  onMouseLeave={() => setHoveredRating(null)}
                >
                  {[1, 2, 3, 4, 5].map((s) => {
                    const isLit = hoveredRating !== null ? s <= hoveredRating : s <= rating;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setRating(s)}
                        onMouseEnter={() => setHoveredRating(s)}
                        className="p-1 hover:scale-110 transition-transform focus:outline-none"
                      >
                        <Star
                          size={28}
                          className={isLit ? 'text-amber-500 fill-amber-500' : 'text-brand-muted'}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-brand-muted">Comentário Adicional (Opcional)</label>
                <textarea
                  rows={3}
                  placeholder="Escreva sua opinião..."
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-xs focus:outline-none focus:border-brand-primary text-brand-text"
                />
              </div>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setShowFeedbackForm(false)}
                  className="w-1/3 py-1.5 bg-brand-dark border border-brand-border text-xs text-brand-muted"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-1.5 bg-brand-primary text-brand-dark text-xs font-semibold"
                >
                  Enviar e Fechar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {previewImage && createPortal(
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-brand-dark/80 backdrop-blur-md p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="w-full max-w-4xl bg-brand-card border border-brand-border shadow-2xl rounded-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border bg-brand-dark/50">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-brand-text truncate">{previewImage.title}</h3>
                <p className="text-[10px] font-mono text-brand-muted">Clique fora ou no X para fechar</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="text-brand-muted hover:text-brand-text transition-colors p-1.5 hover:bg-brand-dark rounded"
                aria-label="Fechar visualização"
              >
                <X size={18} />
              </button>
            </div>
            <div className="bg-black/60 p-4 flex items-center justify-center max-h-[82vh] overflow-auto">
              <img
                src={previewImage.src}
                alt={previewImage.title}
                className="max-w-full max-h-[78vh] object-contain rounded border border-brand-border/60 shadow-lg"
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
      {/* Configuration Modal */}
      {showConfigModal && isTechnicianOrAbove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/80 backdrop-blur-md">
          <div className="w-full max-w-2xl bg-brand-card border border-brand-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border bg-brand-dark/50">
              <h3 className="font-semibold text-lg text-brand-text">Configurações do Service Desk</h3>
              <button onClick={() => setShowConfigModal(false)} className="text-brand-muted hover:text-brand-text">
                <X size={20} />
              </button>
            </div>

            <div className="flex border-b border-brand-border bg-brand-dark/30">
              <button
                onClick={() => setActiveConfigTab('categorias')}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeConfigTab === 'categorias' ? 'text-brand-primary border-b-2 border-brand-primary opacity-100' : 'text-brand-text opacity-[0.55] hover:opacity-75'}`}
              >
                1. Categorias de Serviço
              </button>
              <button
                onClick={() => setActiveConfigTab('servicos')}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeConfigTab === 'servicos' ? 'text-brand-primary border-b-2 border-brand-primary opacity-100' : 'text-brand-text opacity-[0.55] hover:opacity-75'}`}
              >
                2. Serviços Específicos
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {activeConfigTab === 'categorias' && (
                <div className="space-y-6">
                  <form onSubmit={handleCreateCategory} className="space-y-4 p-4 border border-brand-primary/30 bg-brand-primary/5">
                    <h4 className="text-sm font-bold text-brand-text uppercase font-mono tracking-wider">Nova Categoria</h4>
                    <div className="space-y-1">
                      <label className="text-xs text-brand-muted">Nome da Categoria</label>
                      <input
                        type="text"
                        required
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="Ex: Hardware, Redes, Softwares..."
                        className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm focus:outline-none focus:border-brand-primary text-brand-text placeholder-brand-muted/30"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-brand-muted">Descrição (Opcional)</label>
                      <input
                        type="text"
                        value={newCategoryDesc}
                        onChange={(e) => setNewCategoryDesc(e.target.value)}
                        className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm focus:outline-none focus:border-brand-primary text-brand-text placeholder-brand-muted/30"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button type="submit" className="px-4 py-2 bg-brand-primary text-brand-dark font-semibold text-xs">
                        Adicionar Categoria
                      </button>
                    </div>
                  </form>

                  <div>
                    <h4 className="text-sm font-bold text-brand-text mb-3">Categorias Existentes</h4>
                    <div className="space-y-2">
                      {categories.map(cat => (
                        <div key={cat.id} className="p-3 bg-brand-dark border border-brand-border flex flex-col text-sm">
                          <span className="font-semibold text-brand-text">{cat.nome}</span>
                          {cat.descricao && <span className="text-xs text-brand-muted">{cat.descricao}</span>}
                        </div>
                      ))}
                      {categories.length === 0 && <p className="text-xs text-brand-muted">Nenhuma categoria cadastrada.</p>}
                    </div>
                  </div>
                </div>
              )}

              {activeConfigTab === 'servicos' && (
                <div className="space-y-6">
                  <form onSubmit={handleCreateDefinition} className="space-y-4 p-4 border border-brand-primary/30 bg-brand-primary/5">
                    <h4 className="text-sm font-bold text-brand-text uppercase font-mono tracking-wider">Novo Serviço/Incidente</h4>

                    <div className="space-y-1">
                      <label className="text-xs text-brand-muted">Categoria Relacionada</label>
                      <select
                        required
                        value={newDefCategoryId}
                        onChange={(e) => setNewDefCategoryId(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm focus:outline-none focus:border-brand-primary text-brand-text"
                      >
                        <option value="">Selecione uma categoria...</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.nome}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-brand-muted">Nome do Serviço</label>
                      <input
                        type="text"
                        required
                        value={newDefName}
                        onChange={(e) => setNewDefName(e.target.value)}
                        placeholder="Ex: Formatação de Computador"
                        className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm focus:outline-none focus:border-brand-primary text-brand-text placeholder-brand-muted/30"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-brand-muted">Descrição / Orientações (Opcional)</label>
                      <textarea
                        rows={2}
                        value={newDefDesc}
                        onChange={(e) => setNewDefDesc(e.target.value)}
                        className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm focus:outline-none focus:border-brand-primary text-brand-text placeholder-brand-muted/30"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button type="submit" className="px-4 py-2 bg-brand-primary text-brand-dark font-semibold text-xs">
                        Adicionar Serviço
                      </button>
                    </div>
                  </form>

                  <div>
                    <h4 className="text-sm font-bold text-brand-text mb-3">Serviços Existentes</h4>
                    <div className="space-y-2">
                      {definitions.map(def => (
                        <div key={def.id} className="p-3 bg-brand-dark border border-brand-border flex flex-col text-sm">
                          <div className="flex justify-between items-start">
                            <span className="font-semibold text-brand-text">{def.nome}</span>
                            <span className="text-[10px] uppercase px-1.5 py-0.5 bg-brand-muted/10 border border-brand-border text-brand-muted">
                              {categories.find(c => c.id === def.categoria_id)?.nome || 'Sem Categoria'}
                            </span>
                          </div>
                          {def.descricao && <span className="text-xs text-brand-muted mt-1">{def.descricao}</span>}
                        </div>
                      ))}
                      {definitions.length === 0 && <p className="text-xs text-brand-muted">Nenhum serviço cadastrado.</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
