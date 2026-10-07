import React, { useState, useEffect } from 'react';
import { getSettings, updateSettings, sendTestEmail } from '../api/settings';
import type { SystemSettings, UpdateSettingsPayload } from '../types/settings';
import {
  Save,
  AlertCircle,
  Mail,
  GitBranch,
  RefreshCw,
  CheckCircle2,
  Download,
  Clock,
  ShieldCheck,
  GitCommit,
  AlertTriangle,
  Radio,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { getSystemVersion, checkForUpdates } from '../api/systemUpdate';
import { homeAssistantApi } from '../api/homeAssistant';
import type { SystemVersionInfo, UpdateCheckResult } from '../types/systemUpdate';
import { SystemUpdateModal } from '../components/SystemUpdateModal';

export const SettingsPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin';

  const [settings, setSettings] = useState<SystemSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testingHA, setTestingHA] = useState(false);
  const [haTestResult, setHaTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Estados de Atualização do Sistema (Git & Docker)
  const [versionInfo, setVersionInfo] = useState<SystemVersionInfo | null>(null);
  const [checkResult, setCheckResult] = useState<UpdateCheckResult | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  useEffect(() => {
    fetchSettings();
    if (isAdmin) {
      loadSystemVersion();
    }
  }, [isAdmin]);

  const loadSystemVersion = async () => {
    try {
      const info = await getSystemVersion();
      setVersionInfo(info);
    } catch {
      // Silencioso se backend não responder
    }
  };

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true);
    setUpdateError(null);
    try {
      const res = await checkForUpdates();
      setCheckResult(res);
    } catch (err: any) {
      setUpdateError(err?.response?.data?.error || 'Não foi possível verificar atualizações no momento.');
    } finally {
      setCheckingUpdates(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const data = await getSettings();
      setSettings({
        ...data,
        preventive_maintenance_enabled: data.preventive_maintenance_enabled || 'true',
        purchases_enabled: data.purchases_enabled || 'true',
        kanban_enabled: data.kanban_enabled || 'true',
        home_assistant_enabled: data.home_assistant_enabled || 'false',
        home_assistant_url: data.home_assistant_url || '',
        home_assistant_token: data.home_assistant_token || '',
        openai_model: data.openai_model || 'gpt-4o-mini',
        gemini_model: data.gemini_model || 'gemini-2.5-flash',
      });
      const aiEnabled = data.ai_enabled === 'true';
      localStorage.setItem('assettrack-ai-enabled', String(aiEnabled));
      window.dispatchEvent(new CustomEvent('assettrack-ai-visibility-change', { detail: { enabled: aiEnabled } }));
    } catch (err) {
      setError('Falha ao carregar configurações.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let finalValue = value;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      finalValue = checked ? 'true' : 'false';
    }

    setSettings(prev => ({
      ...prev,
      [name]: finalValue
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const payload: UpdateSettingsPayload = { ...settings };
      await updateSettings(payload);
      const enabled = settings.ai_enabled === 'true';
      localStorage.setItem('assettrack-ai-enabled', String(enabled));
      window.dispatchEvent(new CustomEvent('assettrack-ai-visibility-change', { detail: { enabled } }));
      setSuccessMsg('Configurações salvas com sucesso!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError('Erro ao salvar as configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    setError(null);
    setSuccessMsg(null);
    try {
      // Persist the values in the form before testing so the test always uses
      // exactly what the administrator is looking at.
      await updateSettings({ ...settings });
      const result = await sendTestEmail(testEmail);
      setSuccessMsg(`E-mail de teste enviado para ${result.recipient}.`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Não foi possível enviar o e-mail de teste.');
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleTestHA = async () => {
    setTestingHA(true);
    setHaTestResult(null);
    setError(null);
    try {
      await updateSettings({ ...settings });
      const res = await homeAssistantApi.testConnection();
      setHaTestResult({
        success: true,
        message: `Conectado com sucesso ao Home Assistant v${res.version || 'desconhecida'} (${res.location_name || 'Servidor Local'}) - Estado: ${res.state || 'ok'}`,
      });
    } catch (err: any) {
      setHaTestResult({
        success: false,
        message: err.response?.data?.error || 'Falha ao conectar com o Home Assistant. Verifique a URL e o Token.',
      });
    } finally {
      setTestingHA(false);
    }
  };

  const notificationControls = [
    {
      key: 'email_notification_rh_status_enabled',
      channel: 'E-mail',
      title: 'Atualizações de status do RH',
      description: 'Envia e-mail ao colaborador quando um status de folga, férias, banco de horas ou trabalho é registrado.',
    },
    {
      key: 'notification_kanban_enabled',
      channel: 'Notificação interna e tempo real',
      title: 'Projetos e cartões Kanban',
      description: 'Cria avisos para participantes e atualiza o Kanban em tempo real quando projetos, cartões e anexos mudam.',
    },
    {
      key: 'email_notification_kanban_enabled',
      channel: 'E-mail',
      title: 'Projetos e cartões Kanban',
      description: 'Envia e-mail aos participantes quando ocorrerem alterações, atribuições e interações no Kanban.',
    },
    {
      key: 'notification_maintenance_enabled',
      channel: 'Notificação interna',
      title: 'Ordens de manutenção preventiva',
      description: 'Avisa técnicos e gestores sobre atribuição, geração automática e conclusão de ordens de serviço.',
    },
    {
      key: 'email_notification_maintenance_enabled',
      channel: 'E-mail',
      title: 'Ordens de manutenção preventiva',
      description: 'Envia e-mail sobre atribuição, geração automática e conclusão de ordens de serviço.',
    },
    {
      key: 'notification_procurement_enabled',
      channel: 'Notificação interna',
      title: 'Compras e solicitações de peças',
      description: 'Avisa compradores e gestores sobre solicitações, pedidos e compras originadas pelo Kanban ou manutenção.',
    },
    {
      key: 'email_notification_procurement_enabled',
      channel: 'E-mail',
      title: 'Compras e solicitações de peças',
      description: 'Envia e-mail a compradores e gestores sobre solicitações, pedidos e compras vinculadas.',
    },
    {
      key: 'notification_service_desk_enabled',
      channel: 'Notificação interna',
      title: 'Chamados do Service Desk',
      description: 'Avisa a equipe ao abrir um chamado e os envolvidos quando houver atribuição, resposta, alteração de status, solução ou encerramento.',
    },
    {
      key: 'email_notification_service_desk_enabled',
      channel: 'E-mail',
      title: 'Chamados do Service Desk',
      description: 'Envia e-mail aos envolvidos quando houver abertura, atribuição, resposta, solução ou encerramento de chamado.',
    },
  ];

  const isEmailNotificationEnabled = (key: string) => settings[key] !== 'false';

  if (loading) return <div className="p-4 text-brand-muted">Carregando configurações...</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white font-mono uppercase">Configurações do Sistema</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-brand-primary text-white px-4 py-2 hover:bg-brand-primary/80 disabled:opacity-50 transition-colors font-mono uppercase tracking-wider text-sm border border-brand-primary"
        >
          <Save size={18} />
          {saving ? 'Salvando...' : 'Salvar Alterações'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-4 flex items-center gap-2">
          <AlertCircle size={20} />
          <span className="font-mono text-sm">{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="app-notice--success bg-green-500/10 border border-green-500/50 text-green-500 p-4 flex items-center gap-2">
          <CheckCircleIcon size={20} />
          <span className="font-mono text-sm">{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Modules Config */}
        <div className="bg-brand-card p-6 border border-brand-border">
          <h2 className="text-lg font-semibold text-brand-primary mb-4 border-b border-brand-border pb-2 font-mono uppercase">Módulos Ativos</h2>
          
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                name="preventive_maintenance_enabled"
                checked={settings.preventive_maintenance_enabled === 'true'}
                onChange={handleInputChange}
                className="w-5 h-5 accent-brand-primary bg-brand-dark border-brand-border"
              />
              <span className="text-brand-text group-hover:text-brand-primary transition-colors">Manutenção Preventiva</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                name="purchases_enabled"
                checked={settings.purchases_enabled === 'true'}
                onChange={handleInputChange}
                className="w-5 h-5 accent-brand-primary bg-brand-dark border-brand-border"
              />
              <span className="text-brand-text group-hover:text-brand-primary transition-colors">Módulo de Compras</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                name="kanban_enabled"
                checked={settings.kanban_enabled === 'true'}
                onChange={handleInputChange}
                className="w-5 h-5 accent-brand-primary bg-brand-dark border-brand-border"
              />
              <span className="text-brand-text group-hover:text-brand-primary transition-colors">Kanban de Projetos</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                name="home_assistant_enabled"
                checked={settings.home_assistant_enabled === 'true'}
                onChange={handleInputChange}
                className="w-5 h-5 accent-brand-primary bg-brand-dark border-brand-border"
              />
              <span className="text-brand-text group-hover:text-brand-primary transition-colors">Automação & IoT (Home Assistant)</span>
            </label>
          </div>
        </div>

        {/* AI Config */}
        <div className="bg-brand-card p-6 border border-brand-border">
          <h2 className="text-lg font-semibold text-brand-primary mb-4 border-b border-brand-border pb-2 font-mono uppercase">Assistente IA</h2>
          
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer group mb-4">
              <input
                type="checkbox"
                name="ai_enabled"
                checked={settings.ai_enabled === 'true'}
                onChange={handleInputChange}
                className="w-5 h-5 accent-brand-primary bg-brand-dark border-brand-border"
              />
              <span className="text-brand-text font-medium group-hover:text-brand-primary transition-colors">Ativar Assistente IA</span>
            </label>

            {settings.ai_enabled === 'true' && (
              <>
                <div>
                  <label className="block text-sm text-brand-muted mb-1 font-mono uppercase">Provedor de IA</label>
                  <select
                    name="ai_provider"
                    value={settings.ai_provider || 'openai'}
                    onChange={handleInputChange}
                    className="w-full p-2.5 bg-brand-dark border border-brand-border text-brand-text focus:outline-none focus:border-brand-primary transition-colors appearance-none"
                  >
                    <option value="openai" className="bg-brand-dark text-brand-text">OpenAI</option>
                    <option value="gemini" className="bg-brand-dark text-brand-text">Google Gemini</option>
                    <option value="ollama" className="bg-brand-dark text-brand-text">Ollama (Local)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-brand-muted mb-1 font-mono uppercase">Chave de API (OpenAI)</label>
                  <input
                    type="password"
                    name="openai_api_key"
                    value={settings.openai_api_key || ''}
                    onChange={handleInputChange}
                    className="w-full p-2.5 bg-brand-dark border border-brand-border text-brand-text focus:outline-none focus:border-brand-primary transition-colors placeholder-brand-muted/30"
                  />
                </div>

                <div>
                  <label className="block text-sm text-brand-muted mb-1 font-mono uppercase">Modelo (OpenAI)</label>
                  <input
                    type="text"
                    name="openai_model"
                    value={settings.openai_model || 'gpt-4o-mini'}
                    onChange={handleInputChange}
                    className="w-full p-2.5 bg-brand-dark border border-brand-border text-brand-text focus:outline-none focus:border-brand-primary transition-colors placeholder-brand-muted/30"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-brand-muted mb-1 font-mono uppercase">Chave de API (Gemini)</label>
                  <input
                    type="password"
                    name="gemini_api_key"
                    value={settings.gemini_api_key || ''}
                    onChange={handleInputChange}
                    className="w-full p-2.5 bg-brand-dark border border-brand-border text-brand-text focus:outline-none focus:border-brand-primary transition-colors placeholder-brand-muted/30"
                  />
                </div>

                {settings.ai_provider === 'gemini' && (
                  <div>
                    <label className="block text-sm text-brand-muted mb-1 font-mono uppercase">Modelo Gemini</label>
                    <select
                      name="gemini_model"
                      value={settings.gemini_model || 'gemini-2.5-flash'}
                      onChange={handleInputChange}
                      className="w-full p-2.5 bg-brand-dark border border-brand-border text-brand-text focus:outline-none focus:border-brand-primary transition-colors appearance-none"
                    >
                      <option value="gemini-2.5-flash" className="bg-brand-dark text-brand-text">Gemini 2.5 Flash (recomendado)</option>
                      <option value="gemini-2.5-pro" className="bg-brand-dark text-brand-text">Gemini 2.5 Pro</option>
                      <option value="gemini-2.0-flash" className="bg-brand-dark text-brand-text">Gemini 2.0 Flash</option>
                      <option value="gemini-2.0-flash-lite" className="bg-brand-dark text-brand-text">Gemini 2.0 Flash Lite</option>
                    </select>
                    <p className="mt-1 text-xs text-brand-muted">Selecione um modelo liberado para a sua chave no Google AI Studio.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="bg-brand-card p-6 border border-brand-border md:col-span-2">
          <h2 className="text-lg font-semibold text-brand-primary mb-2 border-b border-brand-border pb-2 font-mono uppercase">Eventos de saída e notificações</h2>
          <p className="mb-4 text-xs text-brand-muted">Ative ou desative cada evento de saída. Alertas emergenciais continuam visíveis no sistema para não comprometer o atendimento crítico.</p>
          <div className="space-y-3">
            {notificationControls.map((control) => (
              <label key={control.key} className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-brand-border bg-white/45 p-4 transition-colors hover:bg-white/70">
                <span>
                  <span className="block text-[10px] font-mono uppercase tracking-wider text-brand-primary">{control.channel}</span>
                  <span className="mt-1 block text-sm font-semibold text-brand-text">{control.title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-brand-muted">{control.description}</span>
                </span>
                <input
                  type="checkbox"
                  checked={isEmailNotificationEnabled(control.key)}
                  onChange={(event) => setSettings((previous) => ({ ...previous, [control.key]: event.target.checked ? 'true' : 'false' }))}
                  className="mt-1 h-5 w-5 shrink-0 accent-brand-primary"
                />
              </label>
            ))}
          </div>
        </div>

        {/* SMTP Config */}
        <div className="bg-brand-card p-6 border border-brand-border md:col-span-2">
          <h2 className="text-lg font-semibold text-brand-primary mb-4 border-b border-brand-border pb-2 font-mono uppercase">Servidor SMTP (Envio de E-mails)</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-brand-muted mb-1 font-mono uppercase">SMTP Host</label>
              <input
                type="text"
                name="smtp_host"
                placeholder="smtp.gmail.com"
                value={settings.smtp_host || ''}
                onChange={handleInputChange}
                className="w-full p-2.5 bg-brand-dark border border-brand-border text-brand-text focus:outline-none focus:border-brand-primary transition-colors placeholder-brand-muted/30"
              />
            </div>
            <div>
              <label className="block text-sm text-brand-muted mb-1 font-mono uppercase">SMTP Port</label>
              <input
                type="text"
                name="smtp_port"
                placeholder="587"
                value={settings.smtp_port || ''}
                onChange={handleInputChange}
                className="w-full p-2.5 bg-brand-dark border border-brand-border text-brand-text focus:outline-none focus:border-brand-primary transition-colors placeholder-brand-muted/30"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-brand-muted mb-1 font-mono uppercase">Segurança da conexão SMTP</label>
              <select
                name="smtp_security"
                value={settings.smtp_security || (settings.smtp_port === '465' ? 'ssl_tls' : 'starttls')}
                onChange={handleInputChange}
                className="w-full p-2.5 bg-brand-dark border border-brand-border text-brand-text focus:outline-none focus:border-brand-primary transition-colors"
              >
                <option value="ssl_tls">SSL/TLS implícito — recomendado para porta 465</option>
                <option value="starttls">STARTTLS — recomendado para porta 587</option>
                <option value="none">Sem criptografia — apenas servidores internos confiáveis</option>
              </select>
              <p className="mt-1 text-xs text-brand-muted">A porta e o modo devem corresponder ao provedor. A senha nunca é enviada sem TLS quando STARTTLS ou SSL/TLS estiver selecionado.</p>
            </div>
            <div>
              <label className="block text-sm text-brand-muted mb-1 font-mono uppercase">SMTP User / E-mail</label>
              <input
                type="text"
                name="smtp_user"
                value={settings.smtp_user || ''}
                onChange={handleInputChange}
                className="w-full p-2.5 bg-brand-dark border border-brand-border text-brand-text focus:outline-none focus:border-brand-primary transition-colors placeholder-brand-muted/30"
              />
            </div>
            <div>
              <label className="block text-sm text-brand-muted mb-1 font-mono uppercase">SMTP Password</label>
              <input
                type="password"
                name="smtp_password"
                value={settings.smtp_password || ''}
                onChange={handleInputChange}
                className="w-full p-2.5 bg-brand-dark border border-brand-border text-brand-text focus:outline-none focus:border-brand-primary transition-colors placeholder-brand-muted/30"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-brand-muted mb-1 font-mono uppercase">Remetente (nome exibido ou e-mail autorizado)</label>
              <input
                type="text"
                name="smtp_from"
                placeholder="Assettrack TI"
                value={settings.smtp_from || ''}
                onChange={handleInputChange}
                className="w-full p-2.5 bg-brand-dark border border-brand-border text-brand-text focus:outline-none focus:border-brand-primary transition-colors placeholder-brand-muted/30"
              />
              <p className="mt-1 text-xs text-brand-muted">Ao informar só um nome, o sistema envia pela caixa SMTP autenticada. Informe outro e-mail somente se ele for um endereço autorizado pelo seu provedor.</p>
            </div>
            <div className="md:col-span-2 mt-2 border-t border-brand-border pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex-1">
                  <label className="block text-sm text-brand-muted mb-1 font-mono uppercase" htmlFor="smtp-test-email">Destinatário do teste (opcional)</label>
                  <input
                    id="smtp-test-email"
                    type="email"
                    placeholder="vazio = seu usuário administrador"
                    value={testEmail}
                    onChange={(event) => setTestEmail(event.target.value)}
                    className="w-full p-2.5 bg-brand-dark border border-brand-border text-brand-text focus:outline-none focus:border-brand-primary transition-colors placeholder-brand-muted/30"
                  />
                </div>
                <button type="button" onClick={handleTestSmtp} disabled={testingSmtp} className="flex h-11 shrink-0 items-center justify-center gap-2 border border-brand-primary bg-brand-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/80 disabled:cursor-not-allowed disabled:opacity-50">
                  <Mail size={17} />
                  {testingSmtp ? 'Enviando teste...' : 'Enviar e-mail de teste'}
                </button>
              </div>
              <p className="mt-2 text-xs text-brand-muted">O teste salva as configurações atuais e registra o resultado em Logs de E-mail.</p>
            </div>
          </div>
        </div>

        {/* Home Assistant IoT & Automation Config */}
        <div className="bg-brand-card p-6 border border-brand-border md:col-span-2">
          <div className="flex items-center justify-between border-b border-brand-border pb-2 mb-4">
            <h2 className="text-lg font-semibold text-brand-primary font-mono uppercase flex items-center gap-2">
              <Radio className="w-5 h-5 text-brand-primary" />
              Integração Home Assistant (Automação & IoT)
            </h2>
            <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-blue-100/20 text-blue-400 border border-blue-500/30">
              Admin Only
            </span>
          </div>

          <p className="text-xs text-brand-muted mb-4">
            Conecte o AssetTrack ao Home Assistant para telemetria em tempo real (sensores de temperatura, umidade, nobreaks/UPS, energia do CPD) e controle bidirecional (relés, tomadas inteligentes e switches).
          </p>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer group mb-2">
              <input
                type="checkbox"
                name="home_assistant_enabled"
                checked={settings.home_assistant_enabled === 'true'}
                onChange={handleInputChange}
                className="w-5 h-5 accent-brand-primary bg-brand-dark border-brand-border"
              />
              <span className="text-brand-text font-medium group-hover:text-brand-primary transition-colors">
                Habilitar Módulo de Automação & IoT
              </span>
            </label>

            {settings.home_assistant_enabled === 'true' && (
              <div className="space-y-4 pt-2">
                <div>
                  <label className="block text-sm text-brand-muted mb-1 font-mono uppercase">
                    URL do Home Assistant
                  </label>
                  <input
                    type="text"
                    name="home_assistant_url"
                    placeholder="http://192.168.1.100:8123 ou http://homeassistant.local:8123"
                    value={settings.home_assistant_url || ''}
                    onChange={handleInputChange}
                    className="w-full p-2.5 bg-brand-dark border border-brand-border text-brand-text focus:outline-none focus:border-brand-primary transition-colors placeholder-brand-muted/30"
                  />
                  <p className="mt-1 text-xs text-brand-muted">
                    Endereço IP ou hostname interno com porta (padrão :8123). Não incluir barra no final.
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-brand-muted mb-1 font-mono uppercase">
                    Token de Acesso de Longa Duração (Long-Lived Access Token)
                  </label>
                  <input
                    type="password"
                    name="home_assistant_token"
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    value={settings.home_assistant_token || ''}
                    onChange={handleInputChange}
                    className="w-full p-2.5 bg-brand-dark border border-brand-border text-brand-text focus:outline-none focus:border-brand-primary transition-colors placeholder-brand-muted/30 font-mono text-xs"
                  />
                  <p className="mt-1 text-xs text-brand-muted">
                    Gerado no Home Assistant em: <em>Perfil de Usuário &rarr; Tokens de Acesso de Longa Duração &rarr; Criar Token</em>.
                  </p>
                </div>

                {haTestResult && (
                  <div
                    className={`p-3 text-xs border flex items-start gap-2 ${
                      haTestResult.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-red-500/10 border-red-500/30 text-red-400'
                    }`}
                  >
                    {haTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                    )}
                    <span>{haTestResult.message}</span>
                  </div>
                )}

                <div className="pt-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleTestHA}
                    disabled={testingHA || !settings.home_assistant_url || !settings.home_assistant_token}
                    className="flex h-10 items-center justify-center gap-2 border border-brand-primary bg-brand-primary/10 px-4 text-xs font-mono font-semibold uppercase tracking-wider text-brand-primary transition-colors hover:bg-brand-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testingHA ? 'animate-spin' : ''}`} />
                    {testingHA ? 'Testando Conexão...' : 'Testar Conexão com Home Assistant'}
                  </button>
                  <span className="text-[11px] text-brand-muted font-mono">
                    Salva automaticamente os dados ao testar
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Atualização do Sistema (Git & Docker) - Exclusivo para Administradores */}
        {isAdmin && (
          <div className="bg-brand-card p-6 border border-brand-border rounded-xl shadow-sm space-y-5 md:col-span-2">
            {/* Header com ícone, título e badge */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-200/80 gap-3">
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200/80 text-brand-primary flex items-center justify-center shrink-0 shadow-xs">
                  <GitBranch className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-brand-text uppercase font-mono tracking-wide">
                    Atualização do Sistema (Git & Docker)
                  </h2>
                  <p className="text-xs text-brand-muted mt-0.5">
                    Verifique novas versões no repositório remoto e aplique atualizações com rebuild automatizado dos containers.
                  </p>
                </div>
              </div>
              <div className="flex items-center shrink-0 self-start sm:self-auto">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-semibold text-brand-primary font-mono shadow-2xs whitespace-nowrap">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Acesso Restrito: Administrador
                </span>
              </div>
            </div>

            {/* Metadados da versão atual (Cards em grid) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="p-3.5 rounded-lg bg-slate-50/90 border border-slate-200/80 flex flex-col justify-between hover:border-brand-primary/40 transition-colors">
                <span className="text-[11px] font-mono font-bold uppercase text-brand-muted tracking-wider block mb-1">
                  Branch Ativa
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <GitBranch className="w-4 h-4 text-brand-primary shrink-0" />
                  <span className="px-2 py-0.5 rounded bg-blue-100/80 text-blue-900 font-mono font-bold text-xs">
                    {versionInfo?.branch || 'Carregando...'}
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50/90 border border-slate-200/80 flex flex-col justify-between hover:border-brand-primary/40 transition-colors">
                <span className="text-[11px] font-mono font-bold uppercase text-brand-muted tracking-wider block mb-1">
                  Commit Atual
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <GitCommit className="w-4 h-4 text-brand-primary shrink-0" />
                  <span className="font-mono font-bold text-brand-text text-xs">
                    {versionInfo?.commit_hash ? `#${versionInfo.commit_hash}` : 'Carregando...'}
                  </span>
                </div>
                {versionInfo?.commit_message && (
                  <p className="text-[11px] text-brand-muted truncate mt-1.5" title={versionInfo.commit_message}>
                    {versionInfo.commit_message}
                  </p>
                )}
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50/90 border border-slate-200/80 flex flex-col justify-between hover:border-brand-primary/40 transition-colors">
                <span className="text-[11px] font-mono font-bold uppercase text-brand-muted tracking-wider block mb-1">
                  Data da Versão
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="w-4 h-4 text-brand-primary shrink-0" />
                  <span className="font-mono font-semibold text-brand-text text-xs">
                    {versionInfo?.commit_date ? versionInfo.commit_date.split(' ')[0] || versionInfo.commit_date : 'Carregando...'}
                  </span>
                </div>
                {versionInfo?.commit_author && (
                  <p className="text-[11px] text-brand-muted mt-1.5 truncate">
                    Por {versionInfo.commit_author}
                  </p>
                )}
              </div>
            </div>

            {/* Status da checagem de atualizações */}
            {checkResult && (
              <div>
                {checkResult.has_updates ? (
                  <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                        <span className="font-bold text-sm">
                          {checkResult.behind_count} nova(s) atualização(ões) encontrada(s) no GitHub!
                        </span>
                      </div>
                      <span className="text-xs text-amber-700 font-mono">
                        Checado às {new Date(checkResult.checked_at).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="rounded-md border border-amber-200 bg-white/90 p-2.5 max-h-40 overflow-y-auto divide-y divide-amber-100 text-xs">
                      {checkResult.commits.map((c) => (
                        <div key={c.hash} className="py-2 flex items-start gap-2.5">
                          <span className="font-mono font-bold text-blue-700 shrink-0">{c.hash}</span>
                          <span className="text-slate-800 font-medium flex-1 truncate">{c.message}</span>
                          <span className="text-slate-500 shrink-0 text-[11px]">{c.author}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between text-xs flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <span>O sistema está totalmente atualizado na versão mais recente da branch <strong className="font-mono text-emerald-800">{checkResult.current_branch}</strong>.</span>
                    </div>
                    <span className="text-[11px] text-emerald-700 font-mono">
                      Checado às {new Date(checkResult.checked_at).toLocaleTimeString()}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Aviso de erro estilizado */}
            {updateError && (
              <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold">Aviso de Verificação</p>
                  <p className="mt-0.5 leading-relaxed text-red-700">{updateError}</p>
                </div>
              </div>
            )}

            {/* Botões de Ação */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleCheckUpdates}
                disabled={checkingUpdates}
                className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-brand-text border border-slate-300 font-semibold px-4 py-2.5 rounded-lg text-xs font-mono uppercase tracking-wider shadow-xs transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${checkingUpdates ? 'animate-spin text-brand-primary' : 'text-slate-500'}`} />
                {checkingUpdates ? 'Consultando GitHub...' : 'Verificar Atualizações'}
              </button>

              <button
                type="button"
                onClick={() => setIsUpdateModalOpen(true)}
                className="flex items-center justify-center gap-2 bg-brand-primary hover:bg-blue-600 text-white font-bold px-5 py-2.5 rounded-lg text-xs font-mono uppercase tracking-wider shadow-md transition-all disabled:opacity-50 ml-auto"
              >
                <Download className="w-4 h-4" />
                {checkResult?.has_updates ? 'Atualizar Aplicação Agora' : 'Recompilar / Atualizar Sistema'}
              </button>
            </div>

            {/* Modal com Terminal de Logs */}
            <SystemUpdateModal
              isOpen={isUpdateModalOpen}
              onClose={() => setIsUpdateModalOpen(false)}
              currentBranch={versionInfo?.branch || 'main'}
              behindCount={checkResult?.behind_count || 0}
              pendingCommits={checkResult?.commits || []}
              onUpdateCompleted={() => {
                loadSystemVersion();
                handleCheckUpdates();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

function CheckCircleIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
