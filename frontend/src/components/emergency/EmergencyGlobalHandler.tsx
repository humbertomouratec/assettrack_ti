import React, { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { alertsApi } from '../../api/alerts';
import { playEmergencyAlarm } from '../../utils/audio';
import { API_BASE_URL } from '../../api/client';
import { ShieldAlert, AlertTriangle, CheckCircle, X, Volume2, User, Building, Cpu, Clock, BellRing } from 'lucide-react';
import { notifyAndroid } from '../../utils/androidNotifications';

export interface EmergencyPayload {
  id: number;
  usuario_nome: string;
  usuario_id: number;
  setor_nome: string;
  ativo_nome: string;
  motivo: string;
  created_at: string;
}

// Global Custom Event Dispatchers
export const triggerEmergencyAlertModal = () => {
  window.dispatchEvent(new CustomEvent('OPEN_EMERGENCY_TRIGGER_MODAL'));
};

export const triggerTestEmergencyAlert = () => {
  window.dispatchEvent(new CustomEvent('TEST_EMERGENCY_BROADCAST'));
};

export const EmergencyGlobalHandler: React.FC = () => {
  const { user, token } = useAuthStore();
  const userRole = user?.role?.toLowerCase() || '';
  const isStaff = ['admin', 'gerente_ti', 'gerente_infra', 'tecnico'].includes(userRole);

  // Modal States
  const [showTriggerModal, setShowTriggerModal] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [sending, setSending] = useState(false);
  const [triggerSuccess, setTriggerSuccess] = useState<string | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  // Staff Live Alert Modal
  const [liveAlert, setLiveAlert] = useState<EmergencyPayload | null>(null);
  const [acknowledgingAlert, setAcknowledgingAlert] = useState(false);
  
  // Track dismissed alert IDs and SSE connection health
  const dismissedAlertIdsRef = useRef<Set<number>>(new Set());
  const sseConnectedRef = useRef<boolean>(false);

  // Listen for global custom trigger events
  useEffect(() => {
    const handleOpenTrigger = () => {
      setShowTriggerModal(true);
      setMotivo('');
      setTriggerSuccess(null);
      setTriggerError(null);
    };

    const handleTestBroadcast = () => {
      playEmergencyAlarm();
      void notifyAndroid('Alerta emergencial de teste', 'Teste de transmissão do AssetTrack TI.');
      setLiveAlert({
        id: 999999,
        usuario_nome: user?.nome || 'Usuário Teste',
        usuario_id: user?.id || 1,
        setor_nome: user?.cargo || 'Setor de TI',
        ativo_nome: 'Notebook Dell Latitude 5420 (PAT-TESTE)',
        motivo: 'TESTE DE SISTEMA: Falha crítica simulada para verificação de alerta e áudio.',
        created_at: new Date().toLocaleString('pt-BR'),
      });
    };

    window.addEventListener('OPEN_EMERGENCY_TRIGGER_MODAL', handleOpenTrigger);
    window.addEventListener('TEST_EMERGENCY_BROADCAST', handleTestBroadcast);
    return () => {
      window.removeEventListener('OPEN_EMERGENCY_TRIGGER_MODAL', handleOpenTrigger);
      window.removeEventListener('TEST_EMERGENCY_BROADCAST', handleTestBroadcast);
    };
  }, [user]);

  // 1. SSE Real-Time Listener (Primary)
  useEffect(() => {
    if (!isStaff || !token) return;

    let evtSource: EventSource | null = null;
    let reconnectTimeout: any = null;

    const connectSSE = () => {
      try {
        const streamUrl = `${API_BASE_URL}/alertas/stream?token=${encodeURIComponent(token)}`;
        evtSource = new EventSource(streamUrl);

        evtSource.onopen = () => {
          sseConnectedRef.current = true;
        };

        evtSource.addEventListener('emergency_alert', (event: MessageEvent) => {
          sseConnectedRef.current = true;
          try {
            const data: EmergencyPayload = JSON.parse(event.data);
            if (!dismissedAlertIdsRef.current.has(data.id)) {
              playEmergencyAlarm();
              void notifyAndroid('Alerta emergencial', `${data.usuario_nome}: ${data.motivo}`, { alertId: data.id });
              setLiveAlert(data);
            }
          } catch (err) {
            console.error('[EMERGENCY_SSE] Failed to parse payload:', err);
          }
        });

        evtSource.onerror = () => {
          sseConnectedRef.current = false;
          if (evtSource) evtSource.close();
          reconnectTimeout = setTimeout(connectSSE, 10000);
        };
      } catch (e) {
        sseConnectedRef.current = false;
        console.error('[EMERGENCY_SSE] Error initializing EventSource:', e);
      }
    };

    connectSSE();

    return () => {
      sseConnectedRef.current = false;
      if (evtSource) evtSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [isStaff, token]);

  // 2. Polling Fallback (Backup check every 30s only when SSE stream is disconnected)
  useEffect(() => {
    if (!isStaff) return;

    const checkPendingAlerts = async () => {
      if (sseConnectedRef.current) return; // Skip polling when primary SSE stream is healthy

      try {
        const history = await alertsApi.history();
        const pending = history.filter(a => !a.atendido && !a.ciente && !dismissedAlertIdsRef.current.has(a.id));
        if (pending.length > 0) {
          const newest = pending[0];
          setLiveAlert(prev => {
            if (!prev || prev.id !== newest.id) {
              playEmergencyAlarm();
              void notifyAndroid('Alerta emergencial', `${newest.usuario_nome}: ${newest.motivo}`, { alertId: newest.id });
              return {
                id: newest.id,
                usuario_nome: newest.usuario_nome,
                usuario_id: newest.usuario_id,
                setor_nome: newest.setor_nome || 'Não informado',
                ativo_nome: newest.ativo_nome || 'Nenhum ativo vinculado',
                motivo: newest.motivo,
                created_at: new Date(newest.created_at).toLocaleString('pt-BR'),
              };
            }
            return prev;
          });
        }
      } catch (err) {
        /* Ignore background polling errors */
      }
    };

    const interval = setInterval(checkPendingAlerts, 30000);
    return () => clearInterval(interval);
  }, [isStaff]);

  // Submit Emergency Alert from User
  const handleSendAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivo.trim()) {
      setTriggerError('Por favor, informe o motivo da emergência.');
      return;
    }

    setSending(true);
    setTriggerError(null);
    setTriggerSuccess(null);

    try {
      const res = await alertsApi.sendAlert(motivo.trim());
      setTriggerSuccess(res.message || 'Alerta emergencial transmitido com sucesso!');
      setMotivo('');
      setTimeout(() => {
        setShowTriggerModal(false);
        setTriggerSuccess(null);
      }, 2500);
    } catch (err: any) {
      setTriggerError(err.response?.data?.error || err.response?.data?.detail || 'Falha ao transmitir alerta de emergência.');
    } finally {
      setSending(false);
    }
  };

  // Staff acknowledges the popup without marking the occurrence as resolved.
  const handleMarkCiente = async () => {
    if (!liveAlert) return;
    if (liveAlert.id !== 999999) {
      setAcknowledgingAlert(true);
      try {
        await alertsApi.markCiente(liveAlert.id);
        dismissedAlertIdsRef.current.add(liveAlert.id);
      } catch (err) {
        console.error('Erro ao marcar alerta como ciente:', err);
      } finally {
        setAcknowledgingAlert(false);
        setLiveAlert(null);
      }
    } else {
      // Test alert close
      setLiveAlert(null);
    }
  };

  return (
    <>
      {/* 1. USER EMERGENCY TRIGGER MODAL (ALL USERS) */}
      {showTriggerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/90 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg bg-brand-card border-2 border-red-500 shadow-2xl overflow-hidden">
            <div className="bg-red-500/10 border-b border-red-500/30 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-red-500">
                <ShieldAlert size={24} className="animate-pulse" />
                <h3 className="font-bold text-red-400 font-mono text-base uppercase tracking-wider m-0">
                  Disparar Alerta Emergencial
                </h3>
              </div>
              <button
                onClick={() => setShowTriggerModal(false)}
                className="text-brand-muted hover:text-brand-text transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSendAlert} className="p-6 space-y-5">
              <div className="bg-amber-500/10 border-l-4 border-amber-500 p-3 text-xs text-amber-300 space-y-1">
                <div className="font-bold flex items-center">
                  <AlertTriangle size={14} className="mr-1 shrink-0" />
                  Notificação em Tempo Real para TI
                </div>
                <p className="text-[11px] text-brand-muted leading-relaxed">
                  Ao disparar este alerta, seus dados completos (<strong>Nome: {user?.nome}</strong>, <strong>Setor/Cargo</strong> e <strong>Equipamentos em Uso</strong>) serão vinculados e notificados com alarme sonoro instantâneo para os administradores e técnicos de TI.
                </p>
              </div>

              {triggerSuccess && (
                <div className="app-notice--success p-3 bg-green-500/10 border border-green-500/30 text-green-400 font-mono text-xs flex items-center space-x-2">
                  <CheckCircle size={16} />
                  <span>{triggerSuccess}</span>
                </div>
              )}

              {triggerError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 font-mono text-xs flex items-center space-x-2">
                  <AlertTriangle size={16} />
                  <span>{triggerError}</span>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-mono font-bold uppercase tracking-wider text-brand-text">
                  Descreva a Emergência: <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Ex: Notebook sem vídeo antes de reunião importante, falha crítica no sistema de vendas..."
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="w-full bg-brand-dark border border-brand-border p-3 text-xs font-mono text-white focus:outline-none focus:border-red-500 transition-colors"
                />
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTriggerModal(false)}
                  className="w-1/3 py-2.5 bg-brand-dark border border-brand-border text-xs font-mono uppercase tracking-wider text-white hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="w-2/3 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold font-mono text-xs uppercase tracking-wider flex items-center justify-center space-x-2 shadow-lg shadow-red-600/30 transition-all disabled:opacity-50"
                >
                  <ShieldAlert size={16} />
                  <span>{sending ? 'Transmitindo...' : 'Disparar Alerta Agora'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. STAFF LIVE EMERGENCY POPUP MODAL (ADMINS, MANAGERS & TECHNICIANS) */}
      {isStaff && liveAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-red-950/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-xl rounded-[14px] bg-brand-card border-4 border-red-600 shadow-2xl overflow-hidden">
            {/* Header with animated warning */}
            <div className="bg-red-600 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-white/20 rounded animate-bounce">
                  <ShieldAlert size={28} />
                </div>
                <div>
                  <h3 className="font-light font-mono text-[17px] uppercase tracking-wider m-0">
                    🚨 ALERTA EMERGENCIAL TRANSMITIDO!
                  </h3>
                  <p className="text-xs text-red-100 font-mono mt-0.5">
                    Um colaborador necessita de atendimento técnico imediato
                  </p>
                </div>
              </div>
              <button
                onClick={() => playEmergencyAlarm()}
                title="Tocar som de alerta novamente"
                className="p-2 bg-white/10 hover:bg-white/20 rounded transition-colors flex items-center space-x-1 text-xs font-mono"
              >
                <Volume2 size={18} />
                <span>Ouvir Som</span>
              </button>
            </div>

            {/* Alert Content Details */}
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-brand-dark p-3 border border-brand-border rounded-[14px] space-y-1">
                  <span className="text-[10px] font-mono text-brand-muted uppercase flex items-center">
                    <User size={12} className="mr-1 text-brand-primary" /> Colaborador (Nome)
                  </span>
                  <div className="text-sm font-light font-mono text-white truncate">
                    {liveAlert.usuario_nome}
                  </div>
                </div>

                <div className="bg-brand-dark p-3 border border-brand-border rounded-[14px] space-y-1">
                  <span className="text-[10px] font-mono text-brand-muted uppercase flex items-center">
                    <Building size={12} className="mr-1 text-brand-primary" /> Setor / Departamento
                  </span>
                  <div className="text-sm font-light font-mono text-[#f8f9fc] truncate">
                    {liveAlert.setor_nome || 'Não informado'}
                  </div>
                </div>
              </div>

              <div className="bg-brand-dark min-h-[70px] p-3 border border-brand-border rounded-[14px] space-y-1">
                <span className="text-[10px] font-mono text-brand-muted uppercase flex items-center">
                  <Cpu size={12} className="mr-1 text-brand-primary" /> Equipamento(s) Atribuído(s)
                </span>
                <div className="text-xs font-mono font-bold text-amber-400 truncate">
                  {liveAlert.ativo_nome || 'Nenhum ativo vinculado'}
                </div>
              </div>

              <div className="bg-red-500/10 border-l-4 border-red-500 rounded-[14px] p-4 space-y-1">
                <span className="text-[10px] font-mono text-red-400 uppercase font-bold">
                  Motivo da Emergência:
                </span>
                <p className="text-sm text-brand-text font-serif italic whitespace-pre-wrap">
                  “{liveAlert.motivo}”
                </p>
              </div>

              <div className="flex items-center justify-between text-xs font-mono text-brand-muted pt-2 border-t border-brand-border">
                <span className="flex items-center">
                  <Clock size={14} className="mr-1 text-brand-primary" />
                  Disparado em: {liveAlert.created_at}
                </span>
                <span className="text-red-400 font-bold animate-pulse flex items-center space-x-1">
                  <BellRing size={14} />
                  <span>TRANSMISSÃO AO VIVO</span>
                </span>
              </div>

              {/* Acknowledge Action Button */}
              <div className="pt-2">
                <button
                  onClick={handleMarkCiente}
                  disabled={acknowledgingAlert}
                  className="w-full py-3.5 bg-green-600 hover:bg-green-500 text-brand-dark font-black font-mono text-sm uppercase tracking-wider flex items-center justify-center space-x-2 shadow-xl shadow-green-600/30 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle size={20} />
                  <span>{acknowledgingAlert ? 'Salvando...' : '✓ Ciente'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
