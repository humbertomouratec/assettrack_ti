import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  User,
  Key,
  Camera,
  Loader2,
  Save,
  CalendarDays,
  MessageSquareText,
  Building2,
  Mail,
  BadgeCheck,
  ShieldCheck,
  Bell,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { profileApi } from '../api/profile';
import { toApiFileUrl } from '../api/client';
import { rhApi } from '../api/rh';
import { serviceDeskApi } from '../api/serviceDesk';
import { maintenanceApi } from '../api/maintenance';
import { preventiveApi } from '../api/preventive';
import { kanbanApi } from '../api/kanban';
import type { MyRHPortal, RHStatusRecord, RHStatusType, RHComunicado } from '../types/rh';
import type { ServiceTicket, ServiceDeskNotification } from '../types/serviceDesk';
import type { SolicitacaoManutencao } from '../types/maintenance';
import type { MaintenanceOrder, PMNotification } from '../types/preventive';
import type { KanbanNotification } from '../types/kanban';
import { notifyAndroid } from '../utils/androidNotifications';
import { ComunicadoDetailModal } from '../components/rh/ComunicadoDetailModal';
import { TechnicianNotificationCenter } from '../components/profile/TechnicianNotificationCenter';

const rhStatusMeta: Record<RHStatusType, { label: string; className: string }> = {
  trabalhando: { label: 'Trabalhando', className: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  folga: { label: 'Em folga', className: 'text-sky-300 border-sky-500/30 bg-sky-500/10' },
  ferias: { label: 'Em férias', className: 'text-blue-300 border-blue-500/30 bg-blue-500/10' },
  banco_horas: { label: 'Banco de horas', className: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
  desligado: { label: 'Desligado', className: 'text-red-400 border-red-500/30 bg-red-500/10' },
};

const formatDate = (value: string) => new Date(value).toLocaleDateString('pt-BR');

const ProfileRHCalendar: React.FC<{ records: RHStatusRecord[] }> = ({ records }) => {
  const [reference, setReference] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const days = useMemo(() => {
    const first = new Date(reference.getFullYear(), reference.getMonth(), 1);
    const total = new Date(reference.getFullYear(), reference.getMonth() + 1, 0).getDate();
    return [
      ...Array.from({ length: first.getDay() }, () => null),
      ...Array.from({ length: total }, (_, index) => new Date(reference.getFullYear(), reference.getMonth(), index + 1)),
    ] as Array<Date | null>;
  }, [reference]);

  const eventsForDay = (date: Date) => records.filter((item) => {
    const start = new Date(item.inicio);
    const end = new Date(item.fim || item.inicio);
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    return (
      day >= new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime() &&
      day <= new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime()
    );
  });

  return (
    <div className="overflow-hidden border border-brand-border bg-white/50 rounded-xl">
      <div className="flex items-center gap-3 border-b border-brand-border bg-brand-dark/40 px-4 py-3">
        <CalendarDays size={16} className="text-brand-primary" />
        <span className="text-xs font-bold uppercase tracking-wide text-brand-text">Meu calendário RH</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setReference(new Date(reference.getFullYear(), reference.getMonth() - 1, 1))}
            className="grid h-8 w-8 place-items-center rounded-lg border border-brand-border text-brand-primary cursor-pointer hover:bg-brand-primary/10"
            title="Mês anterior"
            aria-label="Mês anterior"
          >
            &lt;
          </button>
          <span className="min-w-32 text-center text-xs font-medium capitalize text-brand-muted">
            {reference.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </span>
          <button
            type="button"
            onClick={() => setReference(new Date(reference.getFullYear(), reference.getMonth() + 1, 1))}
            className="grid h-8 w-8 place-items-center rounded-lg border border-brand-border text-brand-primary cursor-pointer hover:bg-brand-primary/10"
            title="Próximo mês"
            aria-label="Próximo mês"
          >
            &gt;
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-l border-brand-border">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
          <div key={day} className="border-b border-r border-brand-border bg-brand-dark/30 p-2 text-center text-[10px] font-bold uppercase text-brand-muted">
            {day}
          </div>
        ))}
        {days.map((date, index) => {
          const events = date ? eventsForDay(date) : [];
          return (
            <div key={index} className="min-h-24 border-b border-r border-brand-border bg-white/60 p-2">
              {date && (
                <>
                  <div className="mb-2 text-right text-xs font-semibold text-brand-muted">{date.getDate()}</div>
                  <div className="space-y-1">
                    {events.slice(0, 2).map((item) => (
                      <div
                        key={item.id}
                        className={`truncate rounded-md border px-1.5 py-1 text-[10px] font-bold uppercase ${rhStatusMeta[item.tipo].className}`}
                        title={`${rhStatusMeta[item.tipo].label}${item.horas ? ` - ${item.horas}h` : ''}`}
                      >
                        {rhStatusMeta[item.tipo].label}
                        {item.horas ? ` ${item.horas}h` : ''}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ProfilePage: React.FC = () => {
  const { user, logout, checkAuth } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const isTechOrStaff = useMemo(() => {
    const role = user?.role?.toLowerCase() || '';
    return ['tecnico', 'admin', 'gerente_ti', 'gerente_infra'].includes(role);
  }, [user]);

  // Tab State: 'notificacoes' | 'dados' | 'rh'
  const initialTab = searchParams.get('tab') as 'notificacoes' | 'dados' | 'rh' | null;
  const [activeTab, setActiveTab] = useState<'notificacoes' | 'dados' | 'rh'>(() => {
    if (initialTab === 'notificacoes' || initialTab === 'dados' || initialTab === 'rh') {
      return initialTab;
    }
    return isTechOrStaff ? 'notificacoes' : 'dados';
  });

  // Keep search params synced
  const handleTabChange = (tab: 'notificacoes' | 'dados' | 'rh') => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  // Profile Edit State
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [matricula, setMatricula] = useState('');

  // Password Edit State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Operational Data for Technician Hub
  const [loadingOperations, setLoadingOperations] = useState(false);
  const [sdNotifications, setSdNotifications] = useState<ServiceDeskNotification[]>([]);
  const [sdTickets, setSdTickets] = useState<ServiceTicket[]>([]);
  const [maintRequests, setMaintRequests] = useState<SolicitacaoManutencao[]>([]);
  const [pmNotifications, setPmNotifications] = useState<PMNotification[]>([]);
  const [myPMOrders, setMyPMOrders] = useState<MaintenanceOrder[]>([]);
  const [kbNotifications, setKbNotifications] = useState<KanbanNotification[]>([]);

  // RH Portal State
  const [rhPortal, setRhPortal] = useState<MyRHPortal | null>(null);
  const [rhLoadError, setRhLoadError] = useState('');
  const [messages, setMessages] = useState<{ mensagens: any[]; contatos: Array<{ id: number; nome: string }> }>({
    mensagens: [],
    contatos: [],
  });
  const [messageForm, setMessageForm] = useState({ destinatario_id: '', assunto: '', mensagem: '' });
  const [selectedComunicado, setSelectedComunicado] = useState<{ comunicado: RHComunicado; lida: boolean } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const notifiedSDIds = useRef<Set<number>>(new Set());
  const notifiedPMIds = useRef<Set<number>>(new Set());
  const notifiedKBIds = useRef<Set<number>>(new Set());
  const notifiedRHIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (user) {
      setNome(user.nome || '');
      setEmail(user.email || '');
      setMatricula(user.matricula || '');
    }
  }, [user]);

  // Load RH Data
  const loadRH = useCallback(async () => {
    try {
      const data = await rhApi.myPortal();
      const unseen = data.comunicados.filter(
        (item) => !item.lida && !notifiedRHIds.current.has(item.comunicado.id)
      );
      unseen.forEach((item) => {
        notifiedRHIds.current.add(item.comunicado.id);
        void notifyAndroid(item.comunicado.titulo, item.comunicado.mensagem, {
          rh_comunicado_id: item.comunicado.id,
        });
      });
      setRhPortal(data);
      setRhLoadError('');
      try {
        setMessages(await rhApi.messages());
      } catch {
        setMessages({ mensagens: [], contatos: [] });
      }
    } catch {
      setRhLoadError('Não foi possível carregar seu calendário RH agora.');
    }
  }, []);

  // Load All Operational Notifications & Tasks
  const loadOperations = useCallback(async () => {
    if (!user?.id) return;
    setLoadingOperations(true);
    try {
      const [sdNotifs, sdTkts, maintList, pmOrds, pmNotifs, kbNotifs] = await Promise.all([
        serviceDeskApi.listNotifications().catch(() => []),
        serviceDeskApi.listTickets({ my: true, limit: 100 }).catch(() => []),
        maintenanceApi.listRequests({ limit: 100 }).catch(() => []),
        preventiveApi.listOrders('', 0, 100).catch(() => []),
        preventiveApi.myNotifications().catch(() => []),
        kanbanApi.listNotifications().catch(() => []),
      ]);

      // Service Desk
      setSdNotifications(sdNotifs || []);
      const myActiveTickets = (sdTkts || []).filter(
        (t) =>
          (t.tecnico_id === user.id || t.responsavel_id === user.id) &&
          t.status !== 'fechado' &&
          t.status !== 'resolvido'
      );
      setSdTickets(myActiveTickets);
      (sdNotifs || [])
        .filter((n) => !n.lida)
        .forEach((n) => {
          if (!notifiedSDIds.current.has(n.id)) {
            notifiedSDIds.current.add(n.id);
            void notifyAndroid(n.titulo || 'Novo Chamado de Suporte', n.mensagem, {
              sd_ticket_id: n.ticket_id,
            });
          }
        });

      // Maintenance (Bancada)
      const myMaint = (maintList || []).filter(
        (m) =>
          (m.responsavel_id === user.id || !m.responsavel_id) &&
          m.status !== 'concluida' &&
          m.status !== 'rejeitada'
      );
      setMaintRequests(myMaint);

      // Preventive
      const assignedPM = (pmOrds || []).filter(
        (o) => o.tecnico_id === user.id && o.status !== 'Concluída' && o.status !== 'Cancelada'
      );
      setMyPMOrders(assignedPM);
      const unreadPM = (pmNotifs || []).filter((n) => !n.lida);
      setPmNotifications(unreadPM);
      unreadPM.forEach((notif) => {
        if (!notifiedPMIds.current.has(notif.id)) {
          notifiedPMIds.current.add(notif.id);
          void notifyAndroid('Nova OS Preventiva Designada', notif.mensagem, {
            pm_order_id: notif.order_id,
          });
        }
      });

      // Kanban
      setKbNotifications(kbNotifs || []);
      (kbNotifs || [])
        .filter((n) => !n.lida)
        .forEach((n) => {
          if (!notifiedKBIds.current.has(n.id)) {
            notifiedKBIds.current.add(n.id);
            void notifyAndroid(n.titulo || 'Atualização no Kanban', n.mensagem, {
              kb_card_id: n.card_id,
            });
          }
        });
    } catch (err) {
      console.error('Erro ao sincronizar tarefas operacionais no perfil:', err);
    } finally {
      setLoadingOperations(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadRH();
    const interval = window.setInterval(loadRH, 30000);
    return () => window.clearInterval(interval);
  }, [loadRH]);

  useEffect(() => {
    void loadOperations();
    const interval = window.setInterval(loadOperations, 20000);
    return () => window.clearInterval(interval);
  }, [loadOperations]);

  // Operational Action Handlers
  const handleMarkSdRead = async (id: number) => {
    await serviceDeskApi.markNotificationRead(id);
    setSdNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)));
  };

  const handleMarkAllSdRead = async () => {
    await serviceDeskApi.markAllNotificationsRead();
    setSdNotifications((prev) => prev.map((n) => ({ ...n, lida: true })));
  };

  const handleMarkPmRead = async (id: number) => {
    await preventiveApi.markNotificationRead(id);
    setPmNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleMarkAllPmRead = async () => {
    await preventiveApi.markNotificationsRead();
    setPmNotifications([]);
  };

  const handleMarkKbRead = async (id: number) => {
    await kanbanApi.markNotificationRead(id);
    setKbNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)));
  };

  const handleMarkAllKbRead = async () => {
    await kanbanApi.markAllNotificationsRead();
    setKbNotifications((prev) => prev.map((n) => ({ ...n, lida: true })));
  };

  const handleMarkComunicadoRead = async (comunicadoId: number) => {
    setRhPortal((prev) =>
      prev
        ? {
            ...prev,
            comunicados: prev.comunicados.map((item) =>
              item.comunicado.id === comunicadoId ? { ...item, lida: true } : item
            ),
          }
        : null
    );
    if (selectedComunicado && selectedComunicado.comunicado.id === comunicadoId) {
      setSelectedComunicado({ ...selectedComunicado, lida: true });
    }
    await rhApi.markMyComunicadoRead(comunicadoId);
    const data = await rhApi.myPortal();
    setRhPortal(data);
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await profileApi.updateProfile({ nome, email, matricula });
      alert('Perfil atualizado com sucesso!');
      checkAuth();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao atualizar perfil');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      alert('As senhas não coincidem!');
      return;
    }
    setSavingPassword(true);
    try {
      await profileApi.changePassword({ current_password: currentPassword, new_password: newPassword });
      alert('Senha alterada com sucesso! Você será desconectado.');
      logout();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao alterar senha');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const processAndUploadAvatar = (file: File) => {
    setUploadingAvatar(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const maxSize = 256;
        const width = img.width;
        const height = img.height;

        const size = Math.min(width, height);
        const sx = (width - size) / 2;
        const sy = (height - size) / 2;

        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(img, sx, sy, size, size, 0, 0, maxSize, maxSize);

        canvas.toBlob(
          async (blob) => {
            if (!blob) {
              setUploadingAvatar(false);
              return;
            }
            const compressedFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
            try {
              await profileApi.uploadAvatar(compressedFile);
              await checkAuth();
            } catch (err) {
              alert('Erro ao enviar foto de perfil');
            } finally {
              setUploadingAvatar(false);
            }
          },
          'image/jpeg',
          0.8
        );
      };
    };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processAndUploadAvatar(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sendPrivateMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await rhApi.sendMessage({
        destinatario_id: Number(messageForm.destinatario_id),
        assunto: messageForm.assunto,
        mensagem: messageForm.mensagem,
      });
      setMessageForm({ destinatario_id: '', assunto: '', mensagem: '' });
      setMessages(await rhApi.messages());
      alert('Mensagem enviada com sucesso.');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Não foi possível enviar a mensagem.');
    }
  };

  // Total Unread Count for Tab Badge
  const totalUnreadCount = useMemo(() => {
    const sdUnread = sdNotifications.filter((n) => !n.lida).length;
    const pmUnread = pmNotifications.filter((n) => !n.lida).length;
    const kbUnread = kbNotifications.filter((n) => !n.lida).length;
    const rhUnread = (rhPortal?.comunicados || []).filter((c) => !c.lida).length;
    const openSdTasks = sdTickets.filter((t) => t.status === 'aberto').length;
    const openMaint = maintRequests.filter((m) => m.status === 'pendente').length;
    return sdUnread + pmUnread + kbUnread + rhUnread + openSdTasks + openMaint;
  }, [sdNotifications, pmNotifications, kbNotifications, rhPortal, sdTickets, maintRequests]);

  if (!user) return null;

  const avatarUrl = toApiFileUrl(user.avatar_url);
  const today = new Date();
  const rhCalendar = rhPortal?.calendario ?? [];
  const upcomingCalendar = rhCalendar
    .filter((item) => new Date(item.fim || item.inicio) >= today)
    .slice()
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
  const recentCalendar = rhCalendar
    .filter((item) => new Date(item.fim || item.inicio) < today)
    .slice()
    .sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime());
  const bancoHorasTotal = rhCalendar
    .filter((item) => item.tipo === 'banco_horas' && typeof item.horas === 'number')
    .reduce((total, item) => total + Number(item.horas || 0), 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-8">
      {/* Banner de Identificação */}
      <section className="relative overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-r from-brand-dark via-slate-900 to-blue-900 opacity-95" />
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-blue-500/10 blur-2xl" />
        <div className="relative p-6 sm:p-8 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
              <BadgeCheck size={15} /> Conta Corporativa AssetTrack TI
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Meu Perfil & Atividades
            </h1>
            <p className="mt-1 text-sm text-slate-300 max-w-xl">
              Central de notificações operacionais, chamados, preventivas, demandas e configurações de acesso.
            </p>
          </div>

          {/* Quick stats on the hero */}
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 backdrop-blur-sm">
              <span className="text-[10px] font-mono uppercase text-slate-300 block">Pendências</span>
              <span className="text-xl font-bold text-white font-mono flex items-center gap-1.5">
                {totalUnreadCount}
                {totalUnreadCount > 0 && <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Navegação por Abas Principais */}
      <div className="flex border border-brand-border bg-brand-card rounded-2xl p-1.5 gap-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => handleTabChange('notificacoes')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'notificacoes'
              ? 'bg-brand-primary text-brand-dark shadow-sm'
              : 'text-brand-muted hover:text-brand-text hover:bg-brand-dark/20'
          }`}
        >
          <Bell size={16} />
          <span>Central de Notificações</span>
          {totalUnreadCount > 0 && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'notificacoes'
                  ? 'bg-brand-dark text-brand-primary'
                  : 'bg-amber-500 text-white animate-pulse'
              }`}
            >
              {totalUnreadCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('dados')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'dados'
              ? 'bg-brand-primary text-brand-dark shadow-sm'
              : 'text-brand-muted hover:text-brand-text hover:bg-brand-dark/20'
          }`}
        >
          <User size={16} />
          <span>Meus Dados & Segurança</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('rh')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'rh'
              ? 'bg-brand-primary text-brand-dark shadow-sm'
              : 'text-brand-muted hover:text-brand-text hover:bg-brand-dark/20'
          }`}
        >
          <CalendarDays size={16} />
          <span>Situação RH & Calendário</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Coluna Lateral: Resumo do Usuário */}
        <aside className="space-y-6 lg:col-span-4">
          <div className="overflow-hidden border border-brand-border bg-brand-card rounded-2xl shadow-sm">
            <div className="h-20 bg-gradient-to-br from-brand-primary/90 to-brand-dark" />
            <div className="px-6 pb-6">
              <div
                className="relative -mt-12 h-24 w-24 cursor-pointer overflow-hidden rounded-2xl border-4 border-white bg-brand-dark shadow-lg group flex items-center justify-center"
                onClick={handleAvatarClick}
                title="Alterar foto de perfil"
              >
                {uploadingAvatar ? (
                  <Loader2 className="animate-spin text-brand-primary" size={32} />
                ) : avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-brand-primary/70">
                    {user.nome.substring(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera className="text-white" size={24} />
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/png, image/jpeg, image/webp"
                  onChange={handleFileChange}
                />
              </div>
              <h2 className="mt-4 text-xl font-bold text-brand-text">{user.nome}</h2>
              <p className="mt-1 text-sm text-brand-muted">{user.cargo || 'Cargo não definido'}</p>
              <span className="mt-4 inline-flex items-center rounded-full bg-brand-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-primary border border-brand-primary/20">
                <ShieldCheck className="mr-1.5" size={13} />
                {user.role.replace('_', ' ')}
              </span>
              <div className="mt-5 space-y-3 border-t border-brand-border pt-4 text-sm">
                <div className="flex items-center gap-3 text-brand-muted">
                  <Mail size={16} className="text-brand-primary" />
                  <span className="truncate">{user.email}</span>
                </div>
                <div className="flex items-center gap-3 text-brand-muted">
                  <Building2 size={16} className="text-brand-primary" />
                  <span>{user.departamento?.nome || 'Setor não definido'}</span>
                </div>
                {user.matricula && (
                  <div className="flex items-center gap-3 text-brand-muted font-mono text-xs">
                    <BadgeCheck size={16} className="text-brand-primary" />
                    <span>Matrícula: {user.matricula}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card Resumo Situação RH */}
          {rhPortal && (
            <div className="bg-brand-card border border-brand-border rounded-2xl p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b border-brand-border pb-3">
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-brand-text flex items-center gap-1.5">
                  <CalendarDays size={15} className="text-brand-primary" /> Situação RH
                </span>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 border rounded ${rhStatusMeta[rhPortal.status_atual].className}`}>
                  {rhStatusMeta[rhPortal.status_atual].label}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-brand-muted font-mono uppercase text-[10px] block">Banco de Horas</span>
                  <span className="font-semibold text-brand-text">
                    {bancoHorasTotal ? `${bancoHorasTotal}h acumuladas` : 'Sem saldo'}
                  </span>
                </div>
                <div>
                  <span className="text-brand-muted font-mono uppercase text-[10px] block">Próxima folga/férias</span>
                  <span className="font-semibold text-brand-text">
                    {upcomingCalendar.length > 0 ? formatDate(upcomingCalendar[0].inicio) : 'Nenhuma'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Coluna Principal: Conteúdo da Aba Ativa */}
        <main className="space-y-6 lg:col-span-8">
          {/* ABA 1: Central de Notificações & Tarefas */}
          {activeTab === 'notificacoes' && (
            <TechnicianNotificationCenter
              sdNotifications={sdNotifications}
              sdTickets={sdTickets}
              onMarkSdRead={handleMarkSdRead}
              onMarkAllSdRead={handleMarkAllSdRead}
              maintRequests={maintRequests}
              pmNotifications={pmNotifications}
              pmOrders={myPMOrders}
              onMarkPmRead={handleMarkPmRead}
              onMarkAllPmRead={handleMarkAllPmRead}
              kbNotifications={kbNotifications}
              onMarkKbRead={handleMarkKbRead}
              onMarkAllKbRead={handleMarkAllKbRead}
              rhComunicados={rhPortal?.comunicados || []}
              onMarkRhRead={handleMarkComunicadoRead}
              onOpenRhModal={(item) => setSelectedComunicado(item)}
              loading={loadingOperations}
              onRefresh={loadOperations}
            />
          )}

          {/* ABA 2: Meus Dados & Segurança */}
          {activeTab === 'dados' && (
            <div className="space-y-6">
              {/* Dados Pessoais */}
              <div className="bg-brand-card border border-brand-border rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-brand-border flex items-center justify-between gap-4">
                  <div className="flex items-center">
                    <div className="mr-3 rounded-xl bg-brand-primary/10 p-2 text-brand-primary">
                      <User size={18} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-brand-text m-0">Dados Pessoais</h3>
                      <p className="text-xs text-brand-muted mt-0.5">
                        Informações cadastrais usadas na sua identificação corporativa.
                      </p>
                    </div>
                  </div>
                </div>
                <form onSubmit={handleProfileUpdate} className="p-5 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-mono text-brand-muted mb-1 uppercase">
                        Nome Completo
                      </label>
                      <input
                        type="text"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        required
                        className="w-full bg-brand-dark border border-brand-border px-3 py-2.5 text-sm text-brand-text rounded-lg focus:outline-none focus:border-brand-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-brand-muted mb-1 uppercase">
                        E-mail Corporativo
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full bg-brand-dark border border-brand-border px-3 py-2.5 text-sm text-brand-text rounded-lg focus:outline-none focus:border-brand-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-brand-muted mb-1 uppercase">
                        Matrícula
                      </label>
                      <input
                        type="text"
                        value={matricula}
                        onChange={(e) => setMatricula(e.target.value)}
                        className="w-full bg-brand-dark border border-brand-border px-3 py-2.5 text-sm text-brand-text rounded-lg focus:outline-none focus:border-brand-primary"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="bg-brand-primary text-brand-dark font-bold font-mono px-5 py-2.5 uppercase tracking-wider text-xs rounded-xl flex items-center hover:bg-brand-primary/90 disabled:opacity-50 transition cursor-pointer shadow-sm"
                    >
                      <Save size={16} className="mr-2" />
                      {savingProfile ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Segurança da Conta */}
              <div className="bg-brand-card border border-brand-border rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-brand-border flex items-center">
                  <div className="mr-3 rounded-xl bg-brand-primary/10 p-2 text-brand-primary">
                    <Key size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-brand-text m-0">Segurança da Conta</h3>
                    <p className="text-xs text-brand-muted mt-0.5">
                      Altere sua senha periodicamente para manter seu acesso protegido.
                    </p>
                  </div>
                </div>
                <form onSubmit={handlePasswordUpdate} className="p-5 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-mono text-brand-muted mb-1 uppercase">
                        Senha Atual
                      </label>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                        className="w-full bg-brand-dark border border-brand-border px-3 py-2.5 text-sm text-brand-text rounded-lg focus:outline-none focus:border-brand-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-brand-muted mb-1 uppercase">
                        Nova Senha
                      </label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={4}
                        className="w-full bg-brand-dark border border-brand-border px-3 py-2.5 text-sm text-brand-text rounded-lg focus:outline-none focus:border-brand-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-brand-muted mb-1 uppercase">
                        Confirmar Nova Senha
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={4}
                        className="w-full bg-brand-dark border border-brand-border px-3 py-2.5 text-sm text-brand-text rounded-lg focus:outline-none focus:border-brand-primary"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
                      className="bg-brand-primary text-brand-dark font-bold font-mono px-5 py-2.5 uppercase tracking-wider text-xs rounded-xl flex items-center hover:bg-brand-primary/90 disabled:opacity-50 transition cursor-pointer shadow-sm"
                    >
                      <Key size={16} className="mr-2" />
                      {savingPassword ? 'Alterando...' : 'Alterar Senha'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ABA 3: Situação RH & Calendário */}
          {activeTab === 'rh' && (
            <div className="space-y-6">
              <div className="bg-brand-card border border-brand-border rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-brand-border flex items-center justify-between gap-4">
                  <div className="flex items-center">
                    <div className="mr-3 rounded-xl bg-brand-primary/10 p-2 text-brand-primary">
                      <CalendarDays size={18} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-brand-text m-0">Calendário de Escala & Horas</h3>
                      <p className="text-xs text-brand-muted mt-0.5">
                        Folgas, férias, banco de horas e status registrados pelo RH.
                      </p>
                    </div>
                  </div>
                  <div
                    className={`shrink-0 text-[10px] font-bold uppercase px-2.5 py-1 border rounded-lg ${
                      rhStatusMeta[rhPortal?.status_atual || 'trabalhando'].className
                    }`}
                  >
                    {rhStatusMeta[rhPortal?.status_atual || 'trabalhando'].label}
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  {rhLoadError && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-700">
                      {rhLoadError}
                    </div>
                  )}
                  <ProfileRHCalendar records={rhCalendar} />
                  {recentCalendar.length > 0 && (
                    <div className="border-t border-brand-border pt-4">
                      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-brand-muted">
                        Histórico recente do calendário
                      </div>
                      <div className="space-y-2">
                        {recentCalendar.slice(0, 4).map((item) => (
                          <div key={item.id} className="flex items-start justify-between gap-2 text-xs">
                            <span className="text-brand-text">{rhStatusMeta[item.tipo].label}</span>
                            <span className="shrink-0 text-brand-muted">
                              {formatDate(item.inicio)}
                              {item.fim ? ` até ${formatDate(item.fim)}` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {rhCalendar.length === 0 && !rhLoadError && (
                    <p className="m-0 text-xs text-brand-muted">
                      Nenhum registro de folga, férias ou banco de horas foi lançado no seu calendário.
                    </p>
                  )}
                </div>
              </div>

              {/* Comunicação Privada com Gestor/RH */}
              <div className="bg-brand-card border border-brand-border rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-brand-border flex items-center">
                  <div className="mr-3 rounded-xl bg-brand-primary/10 p-2 text-brand-primary">
                    <MessageSquareText size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-brand-text m-0">Comunicação Privada</h3>
                    <p className="text-xs text-brand-muted mt-0.5">
                      Converse em canal exclusivo e seguro com seu gestor ou departamento de RH.
                    </p>
                  </div>
                </div>
                <form onSubmit={sendPrivateMessage} className="p-5 space-y-3">
                  <select
                    required
                    value={messageForm.destinatario_id}
                    onChange={(e) => setMessageForm({ ...messageForm, destinatario_id: e.target.value })}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2.5 text-sm text-brand-text rounded-lg"
                  >
                    <option value="">Selecione o destinatário</option>
                    {messages.contatos
                      .filter((item) => item.id !== user.id)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nome}
                        </option>
                      ))}
                  </select>
                  <input
                    required
                    placeholder="Assunto"
                    value={messageForm.assunto}
                    onChange={(e) => setMessageForm({ ...messageForm, assunto: e.target.value })}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2.5 text-sm text-brand-text rounded-lg"
                  />
                  <textarea
                    required
                    placeholder="Escreva sua mensagem"
                    value={messageForm.mensagem}
                    onChange={(e) => setMessageForm({ ...messageForm, mensagem: e.target.value })}
                    className="w-full min-h-24 bg-brand-dark border border-brand-border px-3 py-2.5 text-sm text-brand-text rounded-lg"
                  />
                  <div className="flex justify-end">
                    <button className="bg-brand-primary px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-brand-dark rounded-xl transition hover:bg-brand-primary/90 cursor-pointer">
                      Enviar Mensagem
                    </button>
                  </div>
                </form>
                {messages.mensagens.length > 0 && (
                  <div className="border-t border-brand-border divide-y divide-brand-border/60">
                    {messages.mensagens.slice(0, 8).map((message) => (
                      <div key={message.id} className="p-4 text-sm">
                        <div className="flex justify-between gap-3">
                          <strong className="text-brand-text">{message.assunto}</strong>
                          {message.destinatario_id === user.id && !message.confirmado_em && (
                            <button
                              type="button"
                              onClick={async () => {
                                await rhApi.confirmMessage(message.id);
                                setMessages(await rhApi.messages());
                              }}
                              className="text-xs font-bold text-brand-primary hover:underline cursor-pointer"
                            >
                              Confirmar recebimento
                            </button>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-brand-muted">{message.mensagem}</p>
                        <span className="text-[10px] text-brand-muted">
                          {message.remetente?.nome} · {new Date(message.criado_em).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modal de Detalhes do Comunicado com Player de Mídia */}
      {selectedComunicado && (
        <ComunicadoDetailModal
          comunicado={selectedComunicado.comunicado}
          isRead={selectedComunicado.lida}
          onClose={() => setSelectedComunicado(null)}
          onMarkRead={async () => {
            await handleMarkComunicadoRead(selectedComunicado.comunicado.id);
            setSelectedComunicado((prev) => (prev ? { ...prev, lida: true } : null));
          }}
          canManage={
            user?.role === 'admin' ||
            user?.role === 'rh' ||
            selectedComunicado.comunicado.criado_por?.id === user?.id
          }
          onDeleteMedia={async () => {
            await rhApi.deleteComunicadoMedia(selectedComunicado.comunicado.id);
            setSelectedComunicado((prev) =>
              prev
                ? {
                    ...prev,
                    comunicado: {
                      ...prev.comunicado,
                      imagem_url: undefined,
                      audio_url: undefined,
                      video_url: undefined,
                      midia_tipo: undefined,
                    },
                  }
                : null
            );
            const data = await rhApi.myPortal();
            setRhPortal(data);
          }}
        />
      )}
    </div>
  );
};
