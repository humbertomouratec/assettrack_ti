import React, { useState, useEffect, useRef } from 'react';
import { alertsApi } from '../api/alerts';
import { toApiFileUrl } from '../api/client';
import type { EmergencyAlert, Aviso } from '../types/alerts';
import { useAuthStore } from '../stores/authStore';
import {
  ShieldAlert, Siren, Bell, Plus, Trash2, Edit2, X, CheckCircle2, Volume2,
  Image as ImageIcon, Video as VideoIcon, UploadCloud, ExternalLink
} from 'lucide-react';
import { triggerTestEmergencyAlert } from '../components/emergency/EmergencyGlobalHandler';

const staffRoles = ['admin', 'gerente_ti', 'gerente_infra', 'tecnico'];

export const AlertsPage: React.FC = () => {
  const user = useAuthStore().user;
  const isStaff = user ? staffRoles.includes(user.role) : false;
  const canManageAvisos = user ? ['admin', 'gerente_ti', 'gerente_infra', 'tecnico'].includes(user.role) : false;

  const [motivo, setMotivo] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [history, setHistory] = useState<EmergencyAlert[]>([]);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<any[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Aviso form states
  const [avisoModal, setAvisoModal] = useState(false);
  const [editAvisoId, setEditAvisoId] = useState<number | null>(null);
  const [aTitulo, setATitulo] = useState('');
  const [aTexto, setATexto] = useState('');
  const [aMidiaUrl, setAMidiaUrl] = useState('');
  const [aMidiaTipo, setAMidiaTipo] = useState<'imagem' | 'video' | ''>('');
  const [aLink, setALink] = useState('');
  const [aLinkTexto, setALinkTexto] = useState('');
  const [aInicio, setAInicio] = useState('');
  const [aFim, setAFim] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const fetchData = async () => {
    try {
      setHistory(await alertsApi.history());
      setAvisos(await alertsApi.listAvisos());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
    return () => eventSourceRef.current?.close();
  }, []);

  // SSE for staff
  useEffect(() => {
    if (!isStaff) return;
    const token = localStorage.getItem('token');
    const es = new EventSource(`/api/v1/alertas/stream?token=${token}`);
    es.addEventListener('emergency_alert', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        setLiveAlerts((prev) => [data, ...prev].slice(0, 5));
        fetchData();
      } catch { /* ignore */ }
    });
    es.onerror = () => { /* EventSource auto-reconnects */ };
    eventSourceRef.current = es;
    return () => es.close();
  }, [isStaff]);

  const submitAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivo.trim()) return;

    if (!navigator.onLine) {
      window.alert('⚠️ Disparo indisponível: Você está sem conexão à internet. Os alertas emergenciais são transmitidos em tempo real para os técnicos e exigem conexão ativa.');
      return;
    }

    setSending(true);
    try {
      await alertsApi.sendAlert(motivo);
      setMotivo('');
      setSent(true);
      setTimeout(() => setSent(false), 5000);
    } catch (err) {
      window.alert('Erro ao enviar alerta de emergência.');
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingMedia(true);
      const res = await alertsApi.uploadMedia(file);
      setAMidiaUrl(res.url);
      setAMidiaTipo(res.midia_tipo as 'imagem' | 'video');
    } catch (err: any) {
      window.alert(err.response?.data?.error || 'Erro ao fazer upload do arquivo de mídia.');
    } finally {
      setUploadingMedia(false);
    }
  };

  const openAvisoModal = (aviso?: Aviso) => {
    setEditAvisoId(aviso?.id ?? null);
    setATitulo(aviso?.titulo ?? '');
    setATexto(aviso?.texto ?? '');
    setAMidiaUrl(aviso?.midia_url ?? '');
    setAMidiaTipo((aviso?.midia_tipo as 'imagem' | 'video') ?? '');
    setALink(aviso?.link_url ?? '');
    setALinkTexto(aviso?.link_texto ?? '');
    setAInicio(aviso?.programado_inicio ? aviso.programado_inicio.slice(0, 16) : '');
    setAFim(aviso?.programado_fim ? aviso.programado_fim.slice(0, 16) : '');
    setAvisoModal(true);
  };

  const submitAviso = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // If external video URL like YouTube, set type to video
      let finalTipo = aMidiaTipo;
      if (aMidiaUrl && !finalTipo) {
        if (aMidiaUrl.includes('youtube.com') || aMidiaUrl.includes('youtu.be') || aMidiaUrl.includes('vimeo.com') || aMidiaUrl.endsWith('.mp4')) {
          finalTipo = 'video';
        } else {
          finalTipo = 'imagem';
        }
      }

      const payload = {
        titulo: aTitulo,
        texto: aTexto || undefined,
        midia_url: aMidiaUrl || undefined,
        midia_tipo: finalTipo || undefined,
        link_url: aLink || undefined,
        link_texto: aLinkTexto || undefined,
        programado_inicio: aInicio ? new Date(aInicio).toISOString() : undefined,
        programado_fim: aFim ? new Date(aFim).toISOString() : undefined,
      };
      if (editAvisoId) await alertsApi.updateAviso(editAvisoId, payload);
      else await alertsApi.createAviso(payload);
      setAvisoModal(false);
      fetchData();
    } catch (err: any) {
      window.alert(err.response?.data?.error || 'Erro ao salvar aviso');
    }
  };

  const activeHistoryCount = history.filter((alert) => !alert.atendido).length;
  const acknowledgedCount = history.filter((alert) => alert.ciente && !alert.atendido).length;

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-red-500/20 bg-gradient-to-br from-[#b4232d] via-[#8f2632] to-[#172b4d] p-5 text-white shadow-lg md:p-7">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-red-100"><Siren size={14} /> Central de comunicação</div>
            <h1 className="m-0 max-w-xl text-2xl font-bold tracking-tight md:text-3xl">Alertas claros. Resposta rápida.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-red-100">Dispare emergências, acompanhe confirmações e mantenha os comunicados do sistema organizados.</p>
          </div>
          {isStaff && (
          <button
            onClick={triggerTestEmergencyAlert}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-white/20"
          >
            <Volume2 size={16} />
            Testar Som & Popup de Alerta
          </button>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Alertas em aberto', value: activeHistoryCount, hint: 'aguardando atendimento', icon: ShieldAlert, tone: 'text-red-600 bg-red-50' },
          { label: 'Cientes pendentes', value: acknowledgedCount, hint: 'assumidos pela equipe', icon: CheckCircle2, tone: 'text-amber-600 bg-amber-50' },
          { label: 'Recebidos agora', value: liveAlerts.length, hint: 'eventos nesta sessão', icon: Siren, tone: 'text-cyan-600 bg-cyan-50' },
          { label: 'Comunicados', value: avisos.length, hint: 'avisos cadastrados', icon: Bell, tone: 'text-blue-600 bg-blue-50' },
        ].map(({ label, value, hint, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-brand-border bg-brand-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2"><span className={`rounded-xl p-2 ${tone}`}><Icon size={17} /></span><span className="text-2xl font-bold tracking-tight text-brand-text">{value}</span></div>
            <div className="mt-4 text-xs font-bold uppercase tracking-wide text-brand-text">{label}</div>
            <div className="mt-1 text-xs text-brand-muted">{hint}</div>
          </div>
        ))}
      </div>

      {/* Live alerts (staff) */}
      {isStaff && liveAlerts.length > 0 && (
        <div className="space-y-2">
          {liveAlerts.map((a, i) => (
            <div key={i} className="border border-red-500/40 bg-red-500/10 p-4">
              <div className="flex items-center space-x-2 text-red-400 font-mono text-xs uppercase">
                <Siren size={16} />
                <span>Alerta recebido — {a.created_at}</span>
              </div>
              <div className="mt-2 text-sm text-brand-text">
                <strong>{a.usuario_nome}</strong> ({a.setor_nome}) — {a.motivo}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Trigger alert */}
        <div className="rounded-2xl border border-red-200 bg-brand-card p-5 shadow-sm sm:p-6">
          <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-brand-text flex items-center">
            <ShieldAlert size={16} className="mr-2 text-red-400" /> Disparar alerta emergencial
          </h3>
          <p className="text-sm text-brand-muted">
            Aciona a equipe de TI em tempo real. Informe o motivo da emergência.
          </p>
          <form onSubmit={submitAlert} className="space-y-3">
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              required
              placeholder="Descreva o problema urgente..."
              className="w-full rounded-xl bg-brand-dark border border-brand-border px-3 py-3 text-sm text-brand-text focus:outline-none focus:border-red-500/50"
            />
            <button
              type="submit"
              disabled={sending}
              className="w-full rounded-xl bg-red-600 px-4 py-3 font-bold font-mono uppercase tracking-wider text-xs text-white hover:bg-red-700 disabled:opacity-50"
            >
              {sending ? 'Enviando...' : 'Transmitir alerta'}
            </button>
            {sent && (
              <div className="text-green-400 text-xs font-mono uppercase flex items-center">
                <CheckCircle2 size={14} className="mr-1" /> Alerta transmitido com sucesso!
              </div>
            )}
          </form>
        </div>

        {/* Alert history (staff) */}
        {isStaff && (
          <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-sm">
            <div className="flex items-center border-b border-brand-border p-4 text-sm font-bold font-mono uppercase tracking-wider text-brand-text">
              <Bell size={16} className="mr-2" /> Histórico de alertas
            </div>
            <div className="divide-y divide-brand-border/60 max-h-96 overflow-y-auto">
              {history.map((a) => (
                <div key={a.id} className={`p-4 ${a.atendido ? 'opacity-60' : ''}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-mono text-xs text-brand-primary">
                        {a.usuario_nome} — {a.setor_nome ?? '—'}
                      </span>
                      <p className="text-sm text-brand-text mt-1 m-0">{a.motivo}</p>
                      <span className="text-xs font-mono text-brand-muted">{new Date(a.created_at).toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!a.ciente && !a.atendido && (
                        <button
                          onClick={async () => {
                            await alertsApi.markCiente(a.id);
                            fetchData();
                          }}
                          className="text-amber-300 border border-amber-400/30 px-2.5 py-1.5 font-mono text-xs uppercase hover:bg-amber-500/10"
                        >
                          Ciente
                        </button>
                      )}
                      {a.ciente && !a.atendido && (
                        <button
                          onClick={async () => {
                            await alertsApi.markAtendido(a.id);
                            fetchData();
                          }}
                          className="text-[#f10909] border border-[#f90101] px-2.5 py-1.5 font-mono text-xs uppercase hover:bg-red-500/10"
                        >
                          Marcar Atendido
                        </button>
                      )}
                    </div>
                  </div>
                  {a.ciente && !a.atendido && (
                    <div className="text-xs font-mono text-[#2739c4] mt-1">
                      Ciente{a.ciente_por ? ` por ${a.ciente_por.nome}` : ''}{a.ciente_em ? ` em ${new Date(a.ciente_em).toLocaleString('pt-BR')}` : ''}
                    </div>
                  )}
                  {a.atendido && a.atendido_por && (
                    <div className="text-xs font-mono font-semibold text-[#f51919] mt-1">Atendido por {a.atendido_por.nome}</div>
                  )}
                </div>
              ))}
              {history.length === 0 && (
                <div className="p-6 text-center text-brand-muted font-mono text-xs">Nenhum alerta registrado.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Avisos */}
      <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-sm">
        <div className="flex flex-col items-start justify-between gap-3 border-b border-brand-border p-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-brand-text m-0">Avisos e Comunicados do Sistema</h3>
            <p className="text-xs text-brand-muted mt-0.5">Visíveis na Dashboard para todos os usuários da aplicação</p>
          </div>
          {canManageAvisos && (
            <button onClick={() => openAvisoModal()}
              className="bg-brand-primary text-brand-dark font-bold font-mono px-3 py-2 uppercase tracking-wider text-xs flex items-center space-x-1.5 hover:bg-brand-primary/90 transition-all">
              <Plus size={14} />
              <span>Novo Aviso</span>
            </button>
          )}
        </div>
        <div className="divide-y divide-brand-border/60">
          {avisos.map((a) => (
            <div key={a.id} className="p-4 flex flex-col md:flex-row justify-between items-start gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-brand-text text-base">{a.titulo}</span>
                  <span className={`text-[10px] font-mono uppercase px-2 py-0.5 border ${a.ativo ? 'border-green-500/30 text-green-400 bg-green-500/5' : 'border-brand-border text-brand-muted bg-brand-dark'}`}>
                    {a.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                  {a.midia_tipo && (
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 border border-brand-primary/30 text-brand-primary bg-brand-primary/5 flex items-center space-x-1">
                      {a.midia_tipo === 'video' ? <VideoIcon size={11} /> : <ImageIcon size={11} />}
                      <span>{a.midia_tipo}</span>
                    </span>
                  )}
                </div>

                {a.texto && <p className="text-sm text-brand-muted whitespace-pre-wrap">{a.texto}</p>}

                {/* Media Preview in List */}
                {a.midia_url && (
                  <div className="pt-2 max-w-md">
                    {a.midia_tipo === 'video' || a.midia_url.includes('youtube') || a.midia_url.includes('youtu.be') ? (
                      a.midia_url.includes('youtube.com/watch?v=') || a.midia_url.includes('youtu.be/') ? (
                        <iframe
                          src={a.midia_url.includes('youtu.be/')
                            ? `https://www.youtube.com/embed/${a.midia_url.split('youtu.be/')[1]?.split('?')[0]}`
                            : `https://www.youtube.com/embed/${new URLSearchParams(a.midia_url.split('?')[1]).get('v')}`}
                          className="w-full aspect-video rounded border border-brand-border"
                          title={a.titulo}
                          allowFullScreen
                        />
                      ) : (
                        <video
                          src={toApiFileUrl(a.midia_url)}
                          controls
                          className="w-full max-h-56 rounded border border-brand-border bg-black"
                        />
                      )
                    ) : (
                      <img
                        src={toApiFileUrl(a.midia_url)}
                        alt={a.titulo}
                        className="w-full max-h-56 object-cover rounded border border-brand-border"
                      />
                    )}
                  </div>
                )}

                {a.link_url && (
                  <div className="pt-1">
                    <a
                      href={a.link_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center space-x-1.5 text-xs text-brand-primary bg-brand-primary/10 border border-brand-primary/30 px-2.5 py-1 rounded hover:bg-brand-primary hover:text-brand-dark transition-all"
                    >
                      <span>{a.link_texto || a.link_url}</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                )}
              </div>

              {canManageAvisos && (
                <div className="flex space-x-2 shrink-0">
                  <button onClick={async () => { await alertsApi.toggleAviso(a.id); fetchData(); }}
                    title={a.ativo ? 'Desativar' : 'Ativar'}
                    className="text-xs text-brand-muted border border-brand-border px-2.5 py-1.5 hover:text-brand-text hover:bg-brand-card rounded">
                    {a.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                  <button onClick={() => openAvisoModal(a)} className="text-brand-primary border border-brand-primary/30 px-2.5 py-1.5 hover:bg-brand-primary/10 rounded">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={async () => {
                    if (!window.confirm('Excluir aviso?')) return;
                    await alertsApi.deleteAviso(a.id);
                    fetchData();
                  }} className="text-red-400 border border-red-500/30 px-2.5 py-1.5 hover:bg-red-500/10 rounded">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {avisos.length === 0 && (
            <div className="p-8 text-center text-brand-muted font-mono text-xs">Nenhum aviso cadastrado no sistema.</div>
          )}
        </div>
      </div>

      {/* Aviso Modal */}
      {avisoModal && (
        <div className="fixed inset-0 bg-brand-dark/80 backdrop-blur-md z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto">
          <div className="w-full max-w-xl border border-brand-border bg-brand-card p-6 space-y-5 my-auto max-h-[92vh] overflow-y-auto shadow-2xl rounded-sm">
            <div className="flex justify-between items-center border-b border-brand-border pb-3">
              <h3 className="text-base font-bold font-mono uppercase tracking-wider text-brand-text">
                {editAvisoId ? 'Editar Aviso' : 'Novo Comunicado / Aviso'}
              </h3>
              <button onClick={() => setAvisoModal(false)} className="text-brand-muted hover:text-brand-text"><X size={20} /></button>
            </div>
            <form onSubmit={submitAviso} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1">Título do Aviso *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Manutenção Programada nos Servidores"
                  value={aTitulo}
                  onChange={(e) => setATitulo(e.target.value)}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1">Texto / Mensagem</label>
                <textarea
                  value={aTexto}
                  onChange={(e) => setATexto(e.target.value)}
                  rows={3}
                  placeholder="Descreva as instruções ou detalhes do comunicado..."
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                />
              </div>

              {/* Media Section: Upload or URL */}
              <div className="p-3 bg-brand-dark/50 border border-brand-border space-y-3 rounded-sm">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-text flex items-center space-x-1.5">
                    <ImageIcon size={14} className="text-brand-primary" />
                    <span>Mídia (Imagem ou Vídeo)</span>
                  </label>
                  {aMidiaUrl && (
                    <button
                      type="button"
                      onClick={() => { setAMidiaUrl(''); setAMidiaTipo(''); }}
                      className="text-[11px] text-red-400 hover:underline"
                    >
                      Remover Mídia
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-brand-muted mb-1">Upload Direto (Arquivo):</label>
                    <label className="flex items-center justify-center space-x-2 w-full p-2 bg-brand-dark border border-dashed border-brand-border hover:border-brand-primary text-xs text-brand-text cursor-pointer transition-all rounded">
                      <UploadCloud size={16} className="text-brand-primary" />
                      <span>{uploadingMedia ? 'Enviando mídia...' : 'Escolher Imagem/Vídeo'}</span>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={handleFileUpload}
                        disabled={uploadingMedia}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div>
                    <label className="block text-[11px] text-brand-muted mb-1">Ou Link Externo / YouTube:</label>
                    <input
                      type="text"
                      placeholder="https://youtube.com/watch?v=... ou URL de imagem/vídeo"
                      value={aMidiaUrl}
                      onChange={(e) => {
                        setAMidiaUrl(e.target.value);
                        if (e.target.value.includes('youtube') || e.target.value.includes('youtu.be') || e.target.value.endsWith('.mp4')) {
                          setAMidiaTipo('video');
                        }
                      }}
                      className="w-full bg-brand-dark border border-brand-border px-2.5 py-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary"
                    />
                  </div>
                </div>

                {/* Media Preview in Modal */}
                {aMidiaUrl && (
                  <div className="pt-2">
                    <div className="text-[10px] text-brand-muted uppercase font-mono mb-1">Prévia da Mídia:</div>
                    {aMidiaTipo === 'video' || aMidiaUrl.includes('youtube') || aMidiaUrl.includes('youtu.be') ? (
                      aMidiaUrl.includes('youtube.com/watch?v=') || aMidiaUrl.includes('youtu.be/') ? (
                        <iframe
                          src={aMidiaUrl.includes('youtu.be/')
                            ? `https://www.youtube.com/embed/${aMidiaUrl.split('youtu.be/')[1]?.split('?')[0]}`
                            : `https://www.youtube.com/embed/${new URLSearchParams(aMidiaUrl.split('?')[1]).get('v')}`}
                          className="w-full aspect-video rounded border border-brand-border"
                          title="Prévia do Vídeo"
                        />
                      ) : (
                        <video src={toApiFileUrl(aMidiaUrl)} controls className="w-full max-h-48 rounded bg-black" />
                      )
                    ) : (
                      <img src={toApiFileUrl(aMidiaUrl)} alt="Prévia" className="w-full max-h-48 object-cover rounded border border-brand-border" />
                    )}
                  </div>
                )}
              </div>

              {/* Link / Action Button */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1">Link de Ação (URL)</label>
                  <input
                    type="text"
                    placeholder="https://exemplo.com ou /servicos"
                    value={aLink}
                    onChange={(e) => setALink(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1">Texto do Botão</label>
                  <input
                    type="text"
                    placeholder="Ex: Acessar Procedimento"
                    value={aLinkTexto}
                    onChange={(e) => setALinkTexto(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>

              {/* Scheduling */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1">Início programado (Opcional)</label>
                  <input
                    type="datetime-local"
                    value={aInicio}
                    onChange={(e) => setAInicio(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-2.5 py-1.5 text-xs text-brand-text focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1">Fim programado (Opcional)</label>
                  <input
                    type="datetime-local"
                    value={aFim}
                    onChange={(e) => setAFim(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-2.5 py-1.5 text-xs text-brand-text focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-brand-border">
                <button
                  type="button"
                  onClick={() => setAvisoModal(false)}
                  className="border border-brand-border px-4 py-2 font-mono text-xs uppercase text-brand-muted hover:text-brand-text"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploadingMedia}
                  className="bg-brand-primary text-brand-dark font-bold font-mono px-4 py-2 uppercase text-xs hover:bg-brand-primary/90 transition-all disabled:opacity-50"
                >
                  Salvar Comunicado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
