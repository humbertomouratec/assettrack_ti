import React, { useState, useEffect } from 'react';
import { getWebhookEventLabel, WEBHOOK_EVENT_CATEGORIES, webhooksApi } from '../api/webhooks';
import type { Webhook, WebhookInput, WebhookLog } from '../types/webhook';
import { Webhook as WebhookIcon, Plus, Edit2, Trash2, Activity, PlayCircle, CheckCircle2, XCircle, Key } from 'lucide-react';

export const WebhooksPage: React.FC = () => {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [nome, setNome] = useState('');
  const [url, setUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [secretKey, setSecretKey] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [logsModal, setLogsModal] = useState(false);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const fetchWebhooks = async () => {
    try {
      setLoading(true);
      const data = await webhooksApi.list();
      setWebhooks(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setNome('');
    setUrl('');
    setIsActive(true);
    setSecretKey('');
    setSelectedEvents([]);
    setModal(true);
  };

  const openEdit = (w: Webhook) => {
    setEditingId(w.id);
    setNome(w.nome);
    setUrl(w.url);
    setIsActive(w.is_active);
    setSecretKey(w.secret_key || '');
    try {
      const evts = JSON.parse(w.eventos_permitidos);
      setSelectedEvents(Array.isArray(evts) ? evts : []);
    } catch {
      setSelectedEvents([]);
    }
    setModal(true);
  };

  const save = async () => {
    if (!nome || !url || selectedEvents.length === 0) return;
    setSaving(true);
    const data: WebhookInput = {
      nome,
      url,
      is_active: isActive,
      secret_key: secretKey.trim() || undefined,
      eventos_permitidos: selectedEvents,
    };
    try {
      if (editingId) {
        await webhooksApi.update(editingId, data);
      } else {
        await webhooksApi.create(data);
      }
      setModal(false);
      fetchWebhooks();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar webhook');
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: number) => {
    if (!window.confirm('Excluir este webhook?')) return;
    try {
      await webhooksApi.delete(id);
      fetchWebhooks();
    } catch (err) {
      console.error(err);
    }
  };

  const test = async (id: number) => {
    try {
      const res = await webhooksApi.test(id);
      alert(res.message);
      fetchWebhooks();
    } catch (err: any) {
      alert('Erro ao testar: ' + err.message);
    }
  };

  const openLogs = async (id: number) => {
    setLogsModal(true);
    setLogsLoading(true);
    try {
      const data = await webhooksApi.getLogs(id);
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLogsLoading(false);
    }
  };

  const toggleEvent = (e: string) => {
    if (selectedEvents.includes(e)) {
      setSelectedEvents(selectedEvents.filter((x) => x !== e));
    } else {
      setSelectedEvents([...selectedEvents, e]);
    }
  };

  const selectAllEvents = () => {
    setSelectedEvents(WEBHOOK_EVENT_CATEGORIES.flatMap((category) => category.events.map((event) => event.code)));
  };

  if (loading) return <div className="text-brand-muted font-mono text-sm">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-wider font-mono text-brand-text m-0 flex items-center">
            <WebhookIcon className="mr-3 text-brand-primary" size={28} />
            Webhooks
          </h1>
          <p className="text-brand-muted text-sm mt-1">Integrações de eventos em tempo real (n8n, Discord, Slack)</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-brand-primary text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-sm flex items-center hover:bg-brand-primary/90"
        >
          <Plus size={16} className="mr-2" />
          Novo Webhook
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {webhooks.map((w) => {
          let evtCount = 0;
          try { evtCount = JSON.parse(w.eventos_permitidos).length; } catch {}
          
          return (
            <div key={w.id} className="border border-brand-border bg-brand-card p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-3 mb-1">
                  <h3 className="text-lg font-bold text-brand-text m-0">{w.nome}</h3>
                  <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 border ${w.is_active ? 'border-green-500/30 text-green-400' : 'border-red-500/30 text-red-400'}`}>
                    {w.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                  {w.secret_key && (
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 border border-teal-500/30 text-teal-400 flex items-center">
                      <Key size={10} className="mr-1" /> Assinatura HMAC
                    </span>
                  )}
                </div>
                <div className="text-sm font-mono text-brand-muted truncate mb-2">{w.url}</div>
                <div className="text-xs font-mono text-brand-muted">
                  {evtCount} eventos inscritos · Criado em {new Date(w.created_at).toLocaleDateString('pt-BR')}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button onClick={() => test(w.id)} className="flex items-center px-3 py-1.5 text-xs font-mono border border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
                  <PlayCircle size={14} className="mr-1.5" /> Testar
                </button>
                <button onClick={() => openLogs(w.id)} className="flex items-center px-3 py-1.5 text-xs font-mono border border-brand-border text-brand-muted hover:text-brand-text">
                  <Activity size={14} className="mr-1.5" /> Logs
                </button>
                <button onClick={() => openEdit(w)} className="flex items-center px-3 py-1.5 text-xs font-mono border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10">
                  <Edit2 size={14} className="mr-1.5" /> Editar
                </button>
                <button onClick={() => del(w.id)} className="flex items-center px-3 py-1.5 text-xs font-mono border border-red-500/30 text-red-400 hover:bg-red-500/10">
                  <Trash2 size={14} className="mr-1.5" /> Excluir
                </button>
              </div>
            </div>
          );
        })}
        {webhooks.length === 0 && (
          <div className="border border-brand-border bg-brand-card p-8 text-center text-brand-muted font-mono text-sm">
            Nenhum webhook configurado.
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-brand-card border border-brand-border w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-brand-border flex justify-between items-center">
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-brand-text m-0">
                {editingId ? 'Editar Webhook' : 'Novo Webhook'}
              </h3>
              <button onClick={() => setModal(false)} className="text-brand-muted hover:text-brand-text">X</button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-brand-muted mb-1 uppercase">Nome de Identificação</label>
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                    placeholder="Ex.: Integração n8n - Produção"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-brand-muted mb-1 uppercase">URL de Destino (POST)</label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                    placeholder="https://n8n.seu-dominio.com/webhook/..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-brand-muted mb-1 uppercase">Chave secreta para assinatura HMAC (opcional)</label>
                  <input
                    type="text"
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                    placeholder="Deixe em branco se não utilizar assinatura"
                  />
                  <p className="text-[10px] text-brand-muted mt-1 font-mono">Adiciona uma assinatura ao conteúdo enviado pelo cabeçalho X-Hub-Signature.</p>
                </div>
                <div className="flex items-center space-x-2 pt-6">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    id="is_active"
                  />
                  <label htmlFor="is_active" className="text-sm font-mono text-brand-text">Webhook ativo</label>
                </div>
              </div>

              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-brand-border pb-2">
                  <div>
                    <label className="block text-xs font-mono text-brand-muted uppercase">Eventos inscritos</label>
                    <p className="mt-1 text-xs text-brand-muted">Escolha quais acontecimentos devem ser enviados para esta integração.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-brand-primary">{selectedEvents.length} selecionado(s)</span>
                    <button type="button" onClick={selectAllEvents} className="text-xs font-mono text-brand-primary hover:underline">Selecionar todos</button>
                    <button type="button" onClick={() => setSelectedEvents([])} className="text-xs font-mono text-brand-muted hover:text-brand-text hover:underline">Limpar</button>
                  </div>
                </div>
                <div className="space-y-4">
                  {WEBHOOK_EVENT_CATEGORIES.map((category) => (
                    <section key={category.title} className="rounded border border-brand-border bg-brand-dark/40 p-3">
                      <div className="mb-3"><h4 className="text-sm font-semibold text-brand-text">{category.title}</h4><p className="mt-0.5 text-xs text-brand-muted">{category.description}</p></div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {category.events.map((event) => (
                          <label key={event.code} className="flex items-start gap-2 rounded border border-brand-border bg-brand-dark p-2.5 hover:border-brand-primary/50 cursor-pointer">
                            <input type="checkbox" checked={selectedEvents.includes(event.code)} onChange={() => toggleEvent(event.code)} className="mt-1" />
                            <span><span className="block text-sm text-brand-text">{event.label}</span><span className="mt-0.5 block text-xs text-brand-muted">{event.description}</span><span className="mt-1 block font-mono text-[10px] text-brand-muted/70">{event.code}</span></span>
                          </label>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-brand-border flex justify-end space-x-3">
              <button onClick={() => setModal(false)} className="border border-brand-border text-brand-muted px-4 py-2 font-mono uppercase tracking-wider text-xs">Cancelar</button>
              <button
                onClick={save}
                disabled={saving || !nome || !url || selectedEvents.length === 0}
                className="bg-brand-primary text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-xs disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar Webhook'}
              </button>
            </div>
          </div>
        </div>
      )}

      {logsModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-brand-card border border-brand-border w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-brand-border flex justify-between items-center">
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-brand-text m-0">Histórico de Disparos</h3>
              <button onClick={() => setLogsModal(false)} className="text-brand-muted hover:text-brand-text">X</button>
            </div>
            <div className="p-0 flex-1 overflow-y-auto">
              {logsLoading ? (
                <div className="p-6 text-brand-muted font-mono text-sm text-center">Carregando logs...</div>
              ) : logs.length === 0 ? (
                <div className="p-6 text-brand-muted font-mono text-sm text-center">Nenhum log registrado ainda.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-brand-dark border-b border-brand-border text-brand-muted text-xs font-mono uppercase">
                      <th className="p-3 font-normal whitespace-nowrap w-40">Data/Hora</th>
                      <th className="p-3 font-normal">Evento</th>
                      <th className="p-3 font-normal text-center w-24">Status</th>
                      <th className="p-3 font-normal">Resposta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border/50 text-sm">
                    {logs.map((l) => (
                      <tr key={l.id} className="hover:bg-brand-dark/50">
                        <td className="p-3 font-mono text-brand-text whitespace-nowrap text-xs">{new Date(l.created_at).toLocaleString('pt-BR')}</td>
                        <td className="p-3 text-brand-primary text-xs"><span className="block">{getWebhookEventLabel(l.evento)}</span><span className="font-mono text-[10px] text-brand-muted">{l.evento}</span></td>
                        <td className="p-3 text-center">
                          {l.sucesso ? (
                            <span className="inline-flex items-center text-green-400 text-xs font-mono"><CheckCircle2 size={12} className="mr-1" /> {l.response_code}</span>
                          ) : (
                            <span className="inline-flex items-center text-red-400 text-xs font-mono"><XCircle size={12} className="mr-1" /> {l.response_code}</span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-xs text-brand-muted truncate max-w-xs" title={l.response_body}>
                          {l.response_body || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
