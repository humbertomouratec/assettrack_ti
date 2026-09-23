import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { User, Key, Camera, Loader2, Save, CalendarDays, MessageSquareText, Building2, Mail, BadgeCheck, ShieldCheck, Check, Wrench, ExternalLink, Sparkles, Volume2, Video as VideoIcon, Image as ImageIcon, Megaphone, Eye, Inbox } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { profileApi } from '../api/profile';
import { toApiFileUrl } from '../api/client';
import { rhApi } from '../api/rh';
import { preventiveApi } from '../api/preventive';
import type { MyRHPortal, RHStatusRecord, RHStatusType, RHComunicado } from '../types/rh';
import type { MaintenanceOrder, PMNotification } from '../types/preventive';
import { notifyAndroid } from '../utils/androidNotifications';
import { ComunicadoDetailModal } from '../components/rh/ComunicadoDetailModal';

const rhStatusMeta: Record<RHStatusType, { label: string; className: string }> = {
  trabalhando: { label: 'Trabalhando', className: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  folga: { label: 'Em folga', className: 'text-sky-300 border-sky-500/30 bg-sky-500/10' },
  ferias: { label: 'Em férias', className: 'text-violet-300 border-violet-500/30 bg-violet-500/10' },
  banco_horas: { label: 'Banco de horas', className: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
  desligado: { label: 'Desligado', className: 'text-red-400 border-red-500/30 bg-red-500/10' },
};

const pmStatusMeta: Record<string, { label: string; className: string }> = {
  'Aberta': { label: 'Aberta', className: 'text-blue-500 border-blue-500/30 bg-blue-500/10' },
  'Agendada': { label: 'Agendada', className: 'text-cyan-500 border-cyan-500/30 bg-cyan-500/10' },
  'Em andamento': { label: 'Em andamento', className: 'text-amber-500 border-amber-500/30 bg-amber-500/10' },
  'Aguardando peça': { label: 'Aguardando peça', className: 'text-orange-500 border-orange-500/30 bg-orange-500/10' },
  'Pausada': { label: 'Pausada', className: 'text-purple-500 border-purple-500/30 bg-purple-500/10' },
  'Concluída': { label: 'Concluída', className: 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10' },
  'Cancelada': { label: 'Cancelada', className: 'text-red-500 border-red-500/30 bg-red-500/10' },
};

const getPMDateInfo = (dataAgendada?: string) => {
  if (!dataAgendada) return { label: 'Sem data agendada', isOverdue: false, isToday: false, className: 'text-brand-muted' };
  const target = new Date(dataAgendada);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endToday = startToday + 24 * 60 * 60 * 1000 - 1;
  const targetTime = target.getTime();

  if (targetTime < startToday) {
    return {
      label: `Atrasada (${target.toLocaleDateString('pt-BR')})`,
      isOverdue: true,
      isToday: false,
      className: 'text-red-500 font-bold bg-red-500/10 border-red-500/30 px-2 py-0.5 rounded border'
    };
  }
  if (targetTime >= startToday && targetTime <= endToday) {
    return {
      label: 'Agendada para Hoje!',
      isOverdue: false,
      isToday: true,
      className: 'text-amber-500 font-bold bg-amber-500/10 border-amber-500/30 px-2 py-0.5 rounded border'
    };
  }
  return {
    label: target.toLocaleDateString('pt-BR'),
    isOverdue: false,
    isToday: false,
    className: 'text-brand-muted font-medium'
  };
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
  const eventsForDay = (date: Date) => records.filter(item => {
    const start = new Date(item.inicio);
    const end = new Date(item.fim || item.inicio);
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    return day >= new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime() && day <= new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  });

  return (
    <div className="overflow-hidden border border-brand-border bg-white/50">
      <div className="flex items-center gap-3 border-b border-brand-border bg-brand-dark/40 px-4 py-3">
        <CalendarDays size={16} className="text-brand-primary" />
        <span className="text-xs font-bold uppercase tracking-wide text-brand-text">Meu calendário RH</span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setReference(new Date(reference.getFullYear(), reference.getMonth() - 1, 1))} className="grid h-8 w-8 place-items-center rounded-lg border border-brand-border text-brand-primary" title="Mês anterior" aria-label="Mês anterior">&lt;</button>
          <span className="min-w-32 text-center text-xs font-medium capitalize text-brand-muted">{reference.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
          <button type="button" onClick={() => setReference(new Date(reference.getFullYear(), reference.getMonth() + 1, 1))} className="grid h-8 w-8 place-items-center rounded-lg border border-brand-border text-brand-primary" title="Próximo mês" aria-label="Próximo mês">&gt;</button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-l border-brand-border">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => <div key={day} className="border-b border-r border-brand-border bg-brand-dark/30 p-2 text-center text-[10px] font-bold uppercase text-brand-muted">{day}</div>)}
        {days.map((date, index) => {
          const events = date ? eventsForDay(date) : [];
          return <div key={index} className="min-h-24 border-b border-r border-brand-border bg-white/60 p-2">
            {date && <><div className="mb-2 text-right text-xs font-semibold text-brand-muted">{date.getDate()}</div><div className="space-y-1">{events.slice(0, 2).map(item => <div key={item.id} className={`truncate rounded-md border px-1.5 py-1 text-[10px] font-bold uppercase ${rhStatusMeta[item.tipo].className}`} title={`${rhStatusMeta[item.tipo].label}${item.horas ? ` - ${item.horas}h` : ''}`}>{rhStatusMeta[item.tipo].label}{item.horas ? ` ${item.horas}h` : ''}</div>)}</div></>}
          </div>;
        })}
      </div>
    </div>
  );
};

export const ProfilePage: React.FC = () => {
  const { user, logout, checkAuth } = useAuthStore();
  
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [matricula, setMatricula] = useState('');
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [rhPortal, setRhPortal] = useState<MyRHPortal | null>(null);
  const [rhLoadError, setRhLoadError] = useState('');
  const [messages, setMessages] = useState<{ mensagens: any[]; contatos: Array<{ id: number; nome: string }> }>({ mensagens: [], contatos: [] });
  const [messageForm, setMessageForm] = useState({ destinatario_id: '', assunto: '', mensagem: '' });
  const [myPMOrders, setMyPMOrders] = useState<MaintenanceOrder[]>([]);
  const [pmNotifications, setPmNotifications] = useState<PMNotification[]>([]);
  const [selectedComunicado, setSelectedComunicado] = useState<{ comunicado: RHComunicado; lida: boolean } | null>(null);
  const [comunicadoFilter, setComunicadoFilter] = useState<'nao_lidos' | 'todos'>('nao_lidos');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notifiedRHIds = useRef<Set<number>>(new Set());
  const notifiedPMIds = useRef<Set<number>>(new Set());

  const isTechOrStaff = useMemo(() => {
    const role = user?.role?.toLowerCase() || '';
    return ['tecnico', 'admin', 'gerente_ti', 'gerente_infra'].includes(role);
  }, [user]);

  useEffect(() => {
    if (user) {
      setNome(user.nome || '');
      setEmail(user.email || '');
      setMatricula(user.matricula || '');
    }
  }, [user]);

  useEffect(() => {
    let mounted = true;
    const loadRH = async () => {
      try {
        const data = await rhApi.myPortal();
        if (!mounted) return;
        const unseen = data.comunicados.filter(item => !item.lida && !notifiedRHIds.current.has(item.comunicado.id));
        unseen.forEach(item => {
          notifiedRHIds.current.add(item.comunicado.id);
          void notifyAndroid(item.comunicado.titulo, item.comunicado.mensagem, { rh_comunicado_id: item.comunicado.id });
        });
        setRhPortal(data);
        setRhLoadError('');
        try {
          setMessages(await rhApi.messages());
        } catch {
          setMessages({ mensagens: [], contatos: [] });
        }
      } catch {
        if (mounted) setRhLoadError('Não foi possível carregar seu calendário RH agora.');
      }
    };
    void loadRH();
    const interval = window.setInterval(loadRH, 30000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!isTechOrStaff || !user?.id) return;

    const loadPMData = async () => {
      try {
        const [orders, notifs] = await Promise.all([
          preventiveApi.listOrders('', 0, 100).catch(() => []),
          preventiveApi.myNotifications().catch(() => [])
        ]);
        if (!mounted) return;
        const assigned = (orders || []).filter(o => o.tecnico_id === user.id && o.status !== 'Concluída' && o.status !== 'Cancelada');
        setMyPMOrders(assigned);

        const unread = (notifs || []).filter(n => !n.lida);
        setPmNotifications(unread);

        // Notify technician on Android when newly assigned to an order
        unread.forEach(notif => {
          if (!notifiedPMIds.current.has(notif.id)) {
            notifiedPMIds.current.add(notif.id);
            void notifyAndroid('Nova OS Designada', notif.mensagem, { pm_order_id: notif.order_id });
          }
        });
      } catch (err) {
        console.error('Erro ao carregar ordens preventivas no perfil:', err);
      }
    };

    void loadPMData();
    const interval = window.setInterval(loadPMData, 20000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, [isTechOrStaff, user]);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await profileApi.updateProfile({ nome, email, matricula });
      alert('Perfil atualizado com sucesso!');
      checkAuth(); // Refresh user state
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

        // Crop square center
        const size = Math.min(width, height);
        const sx = (width - size) / 2;
        const sy = (height - size) / 2;

        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.drawImage(img, sx, sy, size, size, 0, 0, maxSize, maxSize);
        
        canvas.toBlob(async (blob) => {
          if (!blob) {
            setUploadingAvatar(false);
            return;
          }
          const compressedFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
          try {
            await profileApi.uploadAvatar(compressedFile);
            await checkAuth(); // Refresh user avatar
          } catch (err) {
            alert('Erro ao enviar foto de perfil');
          } finally {
            setUploadingAvatar(false);
          }
        }, 'image/jpeg', 0.8);
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

  const handleMarkComunicadoRead = async (comunicadoId: number) => {
    setRhPortal(prev => prev ? {
      ...prev,
      comunicados: prev.comunicados.map(item => item.comunicado.id === comunicadoId ? { ...item, lida: true } : item)
    } : null);
    if (selectedComunicado && selectedComunicado.comunicado.id === comunicadoId) {
      setSelectedComunicado({ ...selectedComunicado, lida: true });
    }
    await rhApi.markMyComunicadoRead(comunicadoId);
    const data = await rhApi.myPortal();
    setRhPortal(data);
  };

  const sendPrivateMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await rhApi.sendMessage({ destinatario_id: Number(messageForm.destinatario_id), assunto: messageForm.assunto, mensagem: messageForm.mensagem });
      setMessageForm({ destinatario_id: '', assunto: '', mensagem: '' });
      setMessages(await rhApi.messages());
      alert('Mensagem enviada com sucesso.');
    } catch (err: any) { alert(err.response?.data?.error || 'Não foi possível enviar a mensagem.'); }
  };

  if (!user) return null;

  const avatarUrl = toApiFileUrl(user.avatar_url);
  const today = new Date();
  const rhCalendar = rhPortal?.calendario ?? [];
  const upcomingCalendar = rhCalendar
    .filter(item => new Date(item.fim || item.inicio) >= today)
    .slice()
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
  const recentCalendar = rhCalendar
    .filter(item => new Date(item.fim || item.inicio) < today)
    .slice()
    .sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime());
  const bancoHorasTotal = rhCalendar
    .filter(item => item.tipo === 'banco_horas' && typeof item.horas === 'number')
    .reduce((total, item) => total + Number(item.horas || 0), 0);

  const pendingComunicados = useMemo(() => {
    return (rhPortal?.comunicados || []).filter(item => !item.lida);
  }, [rhPortal]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-8">
      <section className="relative overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-r from-brand-dark via-brand-dark to-brand-primary opacity-95" />
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10" />
        <div className="relative p-6 sm:p-8 text-white">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/70"><BadgeCheck size={15} /> Conta corporativa</div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Meu perfil</h1>
          <p className="mt-2 max-w-xl text-sm text-white/80">Mantenha seus dados, sua foto de identificação e suas configurações de acesso sempre atualizados.</p>
	        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <aside className="space-y-6 lg:col-span-4">
          <div className="overflow-hidden border border-brand-border bg-brand-card">
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
                <span className="text-2xl font-bold text-brand-primary/70">{user.nome.substring(0,2).toUpperCase()}</span>
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
              <span className="mt-4 inline-flex items-center rounded-full bg-brand-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-primary"><ShieldCheck className="mr-1.5" size={13} />{user.role.replace('_', ' ')}</span>
              <div className="mt-5 space-y-3 border-t border-brand-border pt-4 text-sm">
                <div className="flex items-center gap-3 text-brand-muted"><Mail size={16} className="text-brand-primary" /><span className="truncate">{user.email}</span></div>
                <div className="flex items-center gap-3 text-brand-muted"><Building2 size={16} className="text-brand-primary" /><span>{user.departamento?.nome || 'Setor não definido'}</span></div>
              </div>
            </div>
          </div>

          {rhPortal && <div className="bg-brand-card border border-brand-border">
            <div className="p-4 border-b border-brand-border flex items-center gap-2"><CalendarDays size={17} className="text-brand-primary" /><h3 className="text-sm font-bold font-mono uppercase tracking-wider text-brand-text m-0">Minha situação RH</h3></div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-xs text-brand-muted font-mono uppercase">Status atual</span><div className={`w-fit mt-1 text-xs font-bold font-mono uppercase px-2 py-1 border ${rhStatusMeta[rhPortal.status_atual].className}`}>{rhStatusMeta[rhPortal.status_atual].label}</div></div>
                <div><span className="text-xs text-brand-muted font-mono uppercase">Banco de horas</span><div className="mt-1 text-sm font-semibold text-brand-text">{bancoHorasTotal ? `${bancoHorasTotal}h registradas` : 'Sem saldo registrado'}</div></div>
              </div>
              <div className="border-t border-brand-border pt-3">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-brand-muted">Agenda programada</div>
                <div className="space-y-2">
                  {upcomingCalendar.slice(0, 6).map(item => <div key={item.id} className="rounded-lg border border-brand-border/70 bg-white/60 p-3"><div className="flex items-center justify-between gap-2"><span className={`text-[10px] font-bold uppercase px-2 py-1 border ${rhStatusMeta[item.tipo].className}`}>{rhStatusMeta[item.tipo].label}</span><span className="text-[10px] text-brand-muted">{formatDate(item.inicio)}{item.fim ? ` até ${formatDate(item.fim)}` : ''}</span></div>{item.horas ? <div className="mt-1 text-xs text-amber-700">{item.horas}h em banco de horas</div> : null}{item.observacao && <div className="text-xs text-brand-muted mt-1">{item.observacao}</div>}</div>)}
                  {upcomingCalendar.length === 0 && <p className="text-xs text-brand-muted m-0">Nenhum período futuro programado.</p>}
                </div>
              </div>
              {recentCalendar.length > 0 && <div className="border-t border-brand-border pt-3">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-brand-muted">Histórico recente</div>
                <div className="space-y-2">{recentCalendar.slice(0, 4).map(item => <div key={item.id} className="flex items-start justify-between gap-2 text-xs"><span className="text-brand-text">{rhStatusMeta[item.tipo].label}</span><span className="shrink-0 text-brand-muted">{formatDate(item.inicio)}{item.fim ? ` até ${formatDate(item.fim)}` : ''}</span></div>)}</div>
              </div>}
            </div>
          </div>}

          {rhPortal && (
            <div className="bg-brand-card border border-brand-border">
              <div className="p-4 border-b border-brand-border flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MessageSquareText size={17} className="text-brand-primary" />
                  <div>
                    <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-brand-text m-0">Comunicados do RH</h3>
                    <p className="mt-0.5 text-[11px] text-brand-muted">Avisos e comunicados direcionados a você.</p>
                  </div>
                </div>
                {pendingComunicados.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 border border-red-500/30 px-2 py-0.5 text-[10px] font-mono font-bold uppercase text-red-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-ping" />
                    {pendingComunicados.length} {pendingComunicados.length === 1 ? 'novo' : 'novos'}
                  </span>
                )}
              </div>

              {/* Filtro: Não Lidos / Todos */}
              <div className="flex border-b border-brand-border bg-brand-dark/20 text-xs">
                <button
                  type="button"
                  onClick={() => setComunicadoFilter('nao_lidos')}
                  className={`flex-1 py-2 text-center font-mono font-semibold transition-colors border-b-2 ${
                    comunicadoFilter === 'nao_lidos'
                      ? 'border-brand-primary text-brand-primary bg-brand-primary/5'
                      : 'border-transparent text-brand-muted hover:text-brand-text'
                  }`}
                >
                  Não lidos ({pendingComunicados.length})
                </button>
                <button
                  type="button"
                  onClick={() => setComunicadoFilter('todos')}
                  className={`flex-1 py-2 text-center font-mono font-semibold transition-colors border-b-2 ${
                    comunicadoFilter === 'todos'
                      ? 'border-brand-primary text-brand-primary bg-brand-primary/5'
                      : 'border-transparent text-brand-muted hover:text-brand-text'
                  }`}
                >
                  Todos ({rhPortal.comunicados.length})
                </button>
              </div>

              <div className="space-y-3 p-3 max-h-[380px] overflow-y-auto">
                {(comunicadoFilter === 'nao_lidos' ? pendingComunicados : rhPortal.comunicados).map(({ comunicado, lida }) => {
                  const isUpdate = comunicado.titulo.startsWith('Atualização do RH:');
                  return (
                    <article
                      key={comunicado.id}
                      className={`relative rounded-xl border p-4 shadow-sm transition-all hover:border-brand-primary/50 cursor-pointer ${
                        !lida
                          ? 'border-brand-primary/40 bg-brand-primary/5'
                          : 'border-brand-border/70 bg-white/40 opacity-90'
                      }`}
                      onClick={() => setSelectedComunicado({ comunicado, lida })}
                    >
                      {!lida && (
                        <span
                          aria-label="Não lido"
                          className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-red-500 shadow-sm animate-pulse"
                          title="Comunicado não lido"
                        />
                      )}
                      <div className="flex gap-3">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                            isUpdate
                              ? 'bg-violet-500/10 text-violet-600'
                              : !lida
                              ? 'bg-brand-primary/15 text-brand-primary'
                              : 'bg-brand-dark/40 text-brand-muted'
                          }`}
                        >
                          {isUpdate ? <CalendarDays size={17} /> : <Megaphone size={17} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 pr-5">
                            <h4 className="text-sm font-semibold text-brand-text m-0 truncate">{comunicado.titulo}</h4>
                            {comunicado.departamento?.nome ? (
                              <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-600">
                                {comunicado.departamento.nome}
                              </span>
                            ) : comunicado.usuario?.nome ? (
                              <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-700">
                                Individual
                              </span>
                            ) : (
                              <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded bg-brand-primary/10 border border-brand-primary/30 text-brand-primary">
                                Geral
                              </span>
                            )}
                          </div>

                          <p className="mt-1.5 text-xs leading-relaxed text-brand-muted line-clamp-2 m-0">
                            {comunicado.mensagem}
                          </p>

                          {/* Media attachments indicators */}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {(comunicado.midia_tipo === 'imagem' || (!comunicado.midia_tipo && comunicado.imagem_url)) && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-brand-muted bg-brand-dark/50 px-1.5 py-0.5 rounded border border-brand-border">
                                <ImageIcon size={11} className="text-brand-primary" /> Imagem
                              </span>
                            )}
                            {(comunicado.midia_tipo === 'audio' || (!comunicado.midia_tipo && comunicado.audio_url)) && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-brand-muted bg-brand-dark/50 px-1.5 py-0.5 rounded border border-brand-border">
                                <Volume2 size={11} className="text-brand-primary" /> Áudio
                              </span>
                            )}
                            {(comunicado.midia_tipo === 'video' || (!comunicado.midia_tipo && comunicado.video_url)) && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-brand-muted bg-brand-dark/50 px-1.5 py-0.5 rounded border border-brand-border">
                                <VideoIcon size={11} className="text-brand-primary" /> Vídeo
                              </span>
                            )}
                          </div>

                          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-brand-border/40 pt-2 text-[10px] text-brand-muted">
                            <span>{new Date(comunicado.inicio).toLocaleDateString('pt-BR')}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-brand-primary font-semibold flex items-center gap-0.5">
                                <Eye size={11} /> Ver detalhes
                              </span>
                              {!lida && (
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await handleMarkComunicadoRead(comunicado.id);
                                  }}
                                  className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm hover:bg-emerald-700"
                                >
                                  <Check size={11} strokeWidth={3} />
                                  Lido
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}

                {(comunicadoFilter === 'nao_lidos' ? pendingComunicados : rhPortal.comunicados).length === 0 && (
                  <div className="p-6 text-center text-xs text-brand-muted font-mono">
                    <Inbox size={20} className="mx-auto mb-1.5 opacity-50" />
                    {comunicadoFilter === 'nao_lidos'
                      ? 'Nenhum comunicado pendente de leitura.'
                      : 'Nenhum comunicado recebido.'}
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>

	        <main className="space-y-6 lg:col-span-8">
          <div className="bg-brand-card border border-brand-border">
            <div className="p-5 border-b border-brand-border flex items-center justify-between gap-4">
              <div className="flex items-center"><div className="mr-3 rounded-xl bg-brand-primary/10 p-2 text-brand-primary"><User size={18} /></div><div><h3 className="text-base font-bold text-brand-text m-0">Dados pessoais</h3><p className="text-xs text-brand-muted mt-0.5">Informações usadas na sua identificação corporativa.</p></div></div>
            </div>
            <form onSubmit={handleProfileUpdate} className="p-5 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-brand-muted mb-1 uppercase">Nome Completo</label>
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    required
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2.5 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-brand-muted mb-1 uppercase">E-mail Corporativo</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2.5 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-brand-muted mb-1 uppercase">Matrícula</label>
                  <input
                    type="text"
                    value={matricula}
                    onChange={(e) => setMatricula(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2.5 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="bg-brand-primary text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-xs flex items-center hover:bg-brand-primary/90 disabled:opacity-50"
                >
                  <Save size={16} className="mr-2" />
                  {savingProfile ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>

          <div className="bg-brand-card border border-brand-border">
            <div className="p-5 border-b border-brand-border flex items-center justify-between gap-4">
              <div className="flex items-center"><div className="mr-3 rounded-xl bg-brand-primary/10 p-2 text-brand-primary"><CalendarDays size={18} /></div><div><h3 className="text-base font-bold text-brand-text m-0">Meu calendário RH</h3><p className="text-xs text-brand-muted mt-0.5">Folgas, férias, banco de horas e status registrados para você.</p></div></div>
              <div className={`shrink-0 text-[10px] font-bold uppercase px-2 py-1 border ${rhStatusMeta[rhPortal?.status_atual || 'trabalhando'].className}`}>{rhStatusMeta[rhPortal?.status_atual || 'trabalhando'].label}</div>
            </div>
            <div className="p-5 space-y-4">
              {rhLoadError && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">{rhLoadError}</div>}
              <ProfileRHCalendar records={rhCalendar} />
              {rhCalendar.length === 0 && !rhLoadError && <p className="m-0 text-xs text-brand-muted">Nenhum registro de folga, férias ou banco de horas foi lançado no seu calendário.</p>}
            </div>
          </div>

          {/* Ordens de Manutenção Preventiva Designadas ao Técnico */}
          {isTechOrStaff && (myPMOrders.length > 0 || pmNotifications.length > 0) && (
            <div className="bg-brand-card border border-brand-border">
              <div className="p-5 border-b border-brand-border flex items-center justify-between gap-4">
                <div className="flex items-center">
                  <div className="mr-3 rounded-xl bg-amber-500/10 p-2 text-amber-500">
                    <Wrench size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-brand-text m-0">Minhas Ordens de Serviço Preventivas</h3>
                    <p className="text-xs text-brand-muted mt-0.5">Manutenções preventivas designadas para você executar.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-xs font-mono font-bold bg-amber-500/15 border border-amber-500/30 text-amber-500 px-2.5 py-1 rounded-full">
                    {myPMOrders.length} {myPMOrders.length === 1 ? 'OS ativa' : 'OS ativas'}
                  </span>
                  <Link
                    to="/manutencao-preventiva?tab=ordens"
                    className="text-xs font-mono text-brand-primary hover:underline flex items-center gap-1 shrink-0"
                  >
                    <span>Módulo Completo</span>
                    <ExternalLink size={13} />
                  </Link>
                </div>
              </div>

              {/* Notificações não lidas de atribuição */}
              {pmNotifications.length > 0 && (
                <div className="p-4 bg-amber-500/10 border-b border-amber-500/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300 uppercase font-mono flex items-center gap-1.5">
                      <Sparkles size={14} className="text-amber-400" />
                      Novas designações ({pmNotifications.length})
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await preventiveApi.markNotificationsRead();
                        setPmNotifications([]);
                      }}
                      className="text-[11px] text-amber-400 hover:text-amber-300 underline font-mono"
                    >
                      Marcar todas como lidas
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {pmNotifications.map(notif => (
                      <div key={notif.id} className="flex items-center justify-between gap-2 p-2 bg-brand-card/80 rounded border border-amber-500/30 text-xs">
                        <span className="text-brand-text text-xs truncate">{notif.mensagem}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {notif.order_id && (
                            <Link
                              to={`/manutencao-preventiva?openDetail=1&orderId=${notif.order_id}`}
                              onClick={async () => {
                                await preventiveApi.markNotificationRead(notif.id);
                                setPmNotifications(prev => prev.filter(n => n.id !== notif.id));
                              }}
                              className="px-2 py-0.5 bg-brand-primary text-brand-dark text-[10px] font-mono font-bold uppercase rounded"
                            >
                              Ver OS
                            </Link>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              await preventiveApi.markNotificationRead(notif.id);
                              setPmNotifications(prev => prev.filter(n => n.id !== notif.id));
                            }}
                            className="text-brand-muted hover:text-brand-text"
                            title="Confirmar ciência"
                          >
                            <Check size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lista de Ordens Atribuídas */}
              <div className="p-5 space-y-3">
                {myPMOrders.length === 0 ? (
                  <p className="text-xs text-brand-muted m-0">Nenhuma ordem preventiva pendente atribuída a você no momento.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {myPMOrders.map(order => {
                      const dateInfo = getPMDateInfo(order.data_agendada);
                      const statusMeta = pmStatusMeta[order.status] || { label: order.status, className: 'text-brand-muted border-brand-border bg-brand-dark/20' };
                      return (
                        <div
                          key={order.id}
                          className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-all ${
                            dateInfo.isOverdue
                              ? 'border-red-500/40 bg-red-500/5'
                              : dateInfo.isToday
                              ? 'border-amber-500/40 bg-amber-500/5'
                              : 'border-brand-border bg-white/40'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-mono text-xs font-bold text-brand-primary">{order.numero}</span>
                              <h4 className="text-sm font-semibold text-brand-text mt-0.5">
                                {order.asset?.nome || order.infra_predial_servico || 'Manutenção Preventiva'}
                              </h4>
                              {order.asset?.e_patrimonio && (
                                <span className="text-[11px] text-brand-muted font-mono block">
                                  Patrimônio: {order.asset.e_patrimonio}
                                </span>
                              )}
                              {order.plan?.nome && (
                                <span className="text-[10px] text-brand-muted font-mono block mt-0.5">
                                  Plano: {order.plan.nome}
                                </span>
                              )}
                            </div>
                            <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 border rounded-md ${statusMeta.className}`}>
                              {statusMeta.label}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-border/60 pt-2 text-xs">
                            <span className={dateInfo.className}>{dateInfo.label}</span>
                            <span className={`text-[10px] font-bold uppercase font-mono px-1.5 py-0.5 rounded ${
                              order.prioridade === 'Urgente' || order.prioridade === 'Alta' ? 'text-red-500 bg-red-500/10' : 'text-brand-muted bg-brand-dark/20'
                            }`}>
                              Prioridade {order.prioridade}
                            </span>
                          </div>

                          <Link
                            to={`/manutencao-preventiva?openDetail=1&orderId=${order.id}`}
                            className="inline-flex items-center justify-center gap-1.5 w-full py-2 bg-brand-primary text-brand-dark text-xs font-bold font-mono uppercase tracking-wider rounded hover:bg-brand-primary/90 transition-colors shadow-sm"
                          >
                            <Wrench size={14} />
                            <span>Abrir e Executar OS</span>
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-brand-card border border-brand-border">
            <div className="p-5 border-b border-brand-border flex items-center"><div className="mr-3 rounded-xl bg-brand-primary/10 p-2 text-brand-primary"><MessageSquareText size={18} /></div><div><h3 className="text-base font-bold text-brand-text m-0">Comunicação privada</h3><p className="text-xs text-brand-muted mt-0.5">Converse somente com seu gestor ou com RH.</p></div></div>
            <form onSubmit={sendPrivateMessage} className="p-5 space-y-3"><select required value={messageForm.destinatario_id} onChange={e => setMessageForm({ ...messageForm, destinatario_id: e.target.value })} className="w-full bg-brand-dark border border-brand-border px-3 py-2.5 text-sm text-brand-text"><option value="">Selecione o destinatário</option>{messages.contatos.filter(item => item.id !== user.id).map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select><input required placeholder="Assunto" value={messageForm.assunto} onChange={e => setMessageForm({ ...messageForm, assunto: e.target.value })} className="w-full bg-brand-dark border border-brand-border px-3 py-2.5 text-sm text-brand-text" /><textarea required placeholder="Escreva sua mensagem" value={messageForm.mensagem} onChange={e => setMessageForm({ ...messageForm, mensagem: e.target.value })} className="w-full min-h-24 bg-brand-dark border border-brand-border px-3 py-2.5 text-sm text-brand-text" /><button className="bg-brand-primary px-4 py-2 text-xs font-bold uppercase tracking-wide text-brand-dark">Enviar mensagem</button></form>
            {messages.mensagens.length > 0 && <div className="border-t border-brand-border divide-y divide-brand-border/60">{messages.mensagens.slice(0, 8).map(message => <div key={message.id} className="p-4 text-sm"><div className="flex justify-between gap-3"><strong className="text-brand-text">{message.assunto}</strong>{message.destinatario_id === user.id && !message.confirmado_em && <button type="button" onClick={async () => { await rhApi.confirmMessage(message.id); setMessages(await rhApi.messages()); }} className="text-xs font-bold text-brand-primary">Confirmar recebimento</button>}</div><p className="mt-1 text-xs text-brand-muted">{message.mensagem}</p><span className="text-[10px] text-brand-muted">{message.remetente?.nome} · {new Date(message.criado_em).toLocaleString('pt-BR')}</span></div>)}</div>}
          </div>

          <div className="bg-brand-card border border-brand-border">
            <div className="p-5 border-b border-brand-border flex items-center">
              <div className="mr-3 rounded-xl bg-brand-primary/10 p-2 text-brand-primary"><Key size={18} /></div><div><h3 className="text-base font-bold text-brand-text m-0">Segurança da conta</h3><p className="text-xs text-brand-muted mt-0.5">Use uma senha única e mantenha seu acesso protegido.</p></div>
            </div>
            <form onSubmit={handlePasswordUpdate} className="p-5 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-mono text-brand-muted mb-1 uppercase">Senha Atual</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2.5 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-brand-muted mb-1 uppercase">Nova Senha</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={4}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2.5 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-brand-muted mb-1 uppercase">Confirmar Nova Senha</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={4}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2.5 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
                  className="bg-brand-primary text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-xs flex items-center hover:bg-brand-primary/90 disabled:opacity-50"
                >
                  <Key size={16} className="mr-2" />
                  {savingPassword ? 'Alterando...' : 'Alterar Senha'}
                </button>
              </div>
            </form>
          </div>

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
            setSelectedComunicado(prev => prev ? { ...prev, lida: true } : null);
          }}
        />
      )}
    </div>
  );
};
