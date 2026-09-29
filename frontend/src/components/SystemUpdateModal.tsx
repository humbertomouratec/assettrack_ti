import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  X,
  Copy,
  Check,
  GitCommit,
  ExternalLink,
} from 'lucide-react';
import type { CommitInfo, UpdateStatusResponse } from '../types/systemUpdate';
import { applySystemUpdate, getSystemUpdateStatus, checkServerHealth } from '../api/systemUpdate';

interface SystemUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBranch: string;
  behindCount: number;
  pendingCommits: CommitInfo[];
  onUpdateCompleted: () => void;
}

type ModalPhase = 'confirm' | 'running' | 'completed' | 'error';

export const SystemUpdateModal: React.FC<SystemUpdateModalProps> = ({
  isOpen,
  onClose,
  currentBranch,
  behindCount,
  pendingCommits,
  onUpdateCompleted,
}) => {
  const [phase, setPhase] = useState<ModalPhase>('confirm');
  const [logs, setLogs] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('Aguardando início...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const healthCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPhase('confirm');
      setLogs([]);
      setErrorMessage(null);
      setIsReconnecting(false);
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (healthCheckRef.current) clearInterval(healthCheckRef.current);
    }
  }, [isOpen]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const startPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      try {
        const res: UpdateStatusResponse = await getSystemUpdateStatus();
        if (res.logs && res.logs.length > 0) {
          setLogs(res.logs);
        }

        if (res.status === 'completed') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setStatusMessage('Recipientes recompilados. Verificando conectividade da API...');
          setIsReconnecting(true);
          startHealthChecking();
        } else if (res.status === 'error') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setPhase('error');
          setErrorMessage(res.error || 'Ocorreu um erro durante o processo de atualização.');
        } else {
          setStatusMessage('Executando atualização e reconstrução dos serviços...');
        }
      } catch (err: any) {
        // Se a API cair momentaneamente durante o restart dos containers,
        // isso é esperado. Não interrompe o fluxo imediatamente, aguarda.
        setStatusMessage('Reiniciando serviços da aplicação... Aguardando resposta...');
      }
    }, 1500);
  };

  const startHealthChecking = () => {
    let attempts = 0;
    const maxAttempts = 40;

    healthCheckRef.current = setInterval(async () => {
      attempts += 1;
      const isHealthy = await checkServerHealth();
      if (isHealthy) {
        if (healthCheckRef.current) clearInterval(healthCheckRef.current);
        setIsReconnecting(false);
        setPhase('completed');
        onUpdateCompleted();
      } else if (attempts >= maxAttempts) {
        if (healthCheckRef.current) clearInterval(healthCheckRef.current);
        setIsReconnecting(false);
        setPhase('completed'); // Permite ao menos o reload manual
      }
    }, 2000);
  };

  const handleConfirmUpdate = async () => {
    try {
      setPhase('running');
      setErrorMessage(null);
      setLogs(['[00:00:00] Disparando ordem de atualização...']);
      setStatusMessage('Iniciando o processo no servidor...');

      await applySystemUpdate();
      startPolling();
    } catch (err: any) {
      setPhase('error');
      setErrorMessage(err?.response?.data?.error || 'Não foi possível disparar a atualização.');
    }
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReload = () => {
    window.location.reload();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
      <div className="bg-white border border-slate-200 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-brand-primary flex items-center justify-center shadow-xs">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-brand-text uppercase font-mono tracking-wide">
                Atualização do Sistema
              </h3>
              <p className="text-xs text-brand-muted">
                Branch: <span className="font-mono font-bold text-blue-700">{currentBranch}</span>
                {behindCount > 0 && ` • ${behindCount} commit(s) pendente(s)`}
              </p>
            </div>
          </div>
          {phase !== 'running' && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* Phase 1: Confirmation */}
          {phase === 'confirm' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3.5">
                <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5 text-amber-600" />
                <div className="text-xs space-y-1.5 leading-relaxed">
                  <p className="font-bold text-sm text-amber-950">Aviso Operacional de Reinicialização</p>
                  <p className="text-amber-900/90">
                    A atualização executará <code className="bg-white/80 px-1.5 py-0.5 rounded border border-amber-300 font-mono font-bold text-amber-950">git pull</code> e a recompilação dos containers Docker. A aplicação poderá ficar inacessível por cerca de <strong>30 a 60 segundos</strong> enquanto os serviços são reiniciados.
                  </p>
                </div>
              </div>

              {pendingCommits.length > 0 ? (
                <div>
                  <h4 className="text-xs font-mono font-bold text-brand-text uppercase mb-2">
                    Commits que serão aplicados ({pendingCommits.length}):
                  </h4>
                  <div className="border border-slate-200 rounded-xl bg-slate-50/70 max-h-48 overflow-y-auto divide-y divide-slate-200/80">
                    {pendingCommits.map((c) => (
                      <div key={c.hash} className="p-3 text-xs flex items-start gap-2.5 hover:bg-white transition-colors">
                        <GitCommit className="w-4 h-4 text-brand-primary shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-mono font-semibold text-brand-text truncate">{c.message}</p>
                          <p className="text-slate-500 text-[11px] mt-0.5">
                            <span className="text-blue-700 font-mono font-bold">{c.hash}</span> por {c.author} • {c.date}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-brand-muted">
                  Nenhum commit novo pendente detectado. Deseja forçar o rebuild da aplicação com o código atual?
                </div>
              )}
            </div>
          )}

          {/* Phase 2: Running / Logs */}
          {(phase === 'running' || phase === 'error' || phase === 'completed') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-mono flex-wrap gap-2">
                <div className="flex items-center gap-2 text-brand-text">
                  {phase === 'running' && (
                    <RefreshCw className="w-4 h-4 text-brand-primary animate-spin" />
                  )}
                  {phase === 'completed' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  )}
                  {phase === 'error' && (
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                  )}
                  <span className="font-semibold text-slate-800">{statusMessage}</span>
                  {isReconnecting && (
                    <span className="text-[11px] text-amber-600 font-mono font-semibold animate-pulse">
                      (Aguardando API...)
                    </span>
                  )}
                </div>
                {logs.length > 0 && (
                  <button
                    onClick={handleCopyLogs}
                    className="flex items-center gap-1.5 text-slate-600 hover:text-brand-text px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-50 transition-colors text-[11px] font-mono shadow-2xs"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copiado!' : 'Copiar Logs'}
                  </button>
                )}
              </div>

              {/* Terminal Screen */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-200 h-64 overflow-y-auto space-y-1 shadow-inner select-text">
                {logs.length === 0 ? (
                  <p className="text-slate-500 italic">Iniciando streaming do terminal...</p>
                ) : (
                  logs.map((line, idx) => (
                    <div
                      key={idx}
                      className={`leading-relaxed break-all ${
                        line.includes('❌') || line.includes('Erro') || line.includes('error')
                          ? 'text-red-400 font-semibold'
                          : line.includes('✅') || line.includes('sucesso')
                          ? 'text-emerald-400 font-semibold'
                          : line.includes('🚀') || line.includes('🏗️')
                          ? 'text-amber-300'
                          : 'text-slate-300'
                      }`}
                    >
                      {line}
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>

              {/* Error Alert */}
              {phase === 'error' && errorMessage && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Falha no Processo</p>
                    <p className="mt-0.5 leading-relaxed text-red-700">{errorMessage}</p>
                  </div>
                </div>
              )}

              {/* Success Alert */}
              {phase === 'completed' && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-sm text-emerald-950">Atualização Concluída com Sucesso!</p>
                    <p className="text-emerald-800/90 mt-0.5 leading-relaxed">
                      Todos os serviços e containers foram recriados e a API já está operando normalmente.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200/80 bg-slate-50/80 flex items-center justify-end gap-3">
          {phase === 'confirm' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold uppercase font-mono tracking-wider transition-colors shadow-2xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmUpdate}
                className="px-5 py-2.5 rounded-lg bg-brand-primary text-white font-bold text-xs uppercase font-mono tracking-wider hover:bg-blue-600 flex items-center gap-2 transition-all shadow-md"
              >
                <RefreshCw className="w-4 h-4" />
                Confirmar e Atualizar Agora
              </button>
            </>
          )}

          {phase === 'running' && (
            <div className="flex items-center gap-2 text-xs font-mono text-brand-muted">
              <RefreshCw className="w-4 h-4 animate-spin text-brand-primary" />
              <span>Não feche esta janela durante a atualização...</span>
            </div>
          )}

          {phase === 'error' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold uppercase font-mono tracking-wider transition-colors"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={handleConfirmUpdate}
                className="px-4 py-2.5 rounded-lg bg-brand-primary text-white font-bold text-xs uppercase font-mono tracking-wider hover:bg-blue-600 transition-colors shadow-sm"
              >
                Tentar Novamente
              </button>
            </>
          )}

          {phase === 'completed' && (
            <button
              type="button"
              onClick={handleReload}
              className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white font-bold text-xs uppercase font-mono tracking-wider hover:bg-emerald-700 flex items-center gap-2 transition-colors shadow-md"
            >
              <ExternalLink className="w-4 h-4" />
              Recarregar Aplicação Agora
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
