import React, { useState } from 'react';
import { X, Check, Megaphone, CalendarDays, Building2, User, Volume2, Video as VideoIcon, Image as ImageIcon, CheckCircle2, Clock, Trash2, HardDrive } from 'lucide-react';
import type { RHComunicado } from '../../types/rh';
import { toApiFileUrl } from '../../api/client';

interface ComunicadoDetailModalProps {
  comunicado: RHComunicado;
  isRead: boolean;
  onClose: () => void;
  onMarkRead?: () => Promise<void> | void;
  onDeleteMedia?: () => Promise<void> | void;
  canManage?: boolean;
}

export const ComunicadoDetailModal: React.FC<ComunicadoDetailModalProps> = ({
  comunicado,
  isRead,
  onClose,
  onMarkRead,
  onDeleteMedia,
  canManage = false,
}) => {
  const [marking, setMarking] = useState(false);
  const [deletingMedia, setDeletingMedia] = useState(false);
  const isUpdate = comunicado.titulo.startsWith('Atualização do RH:');

  const isAudioType = comunicado.midia_tipo === 'audio';
  const isVideoType = comunicado.midia_tipo === 'video';
  const isImageType = comunicado.midia_tipo === 'imagem';

  const resolvedImageUrl = isImageType
    ? (toApiFileUrl(comunicado.imagem_url) || toApiFileUrl(comunicado.video_url) || toApiFileUrl(comunicado.audio_url))
    : (!comunicado.midia_tipo ? toApiFileUrl(comunicado.imagem_url) : null);

  const resolvedAudioUrl = isAudioType
    ? (toApiFileUrl(comunicado.audio_url) || toApiFileUrl(comunicado.video_url))
    : (!comunicado.midia_tipo ? toApiFileUrl(comunicado.audio_url) : null);

  const resolvedVideoUrl = isVideoType
    ? (toApiFileUrl(comunicado.video_url) || toApiFileUrl(comunicado.audio_url))
    : (!comunicado.midia_tipo ? toApiFileUrl(comunicado.video_url) : null);

  const handleDeleteMedia = async () => {
    if (!onDeleteMedia) return;
    if (!window.confirm('Deseja excluir permanentemente o arquivo de mídia deste comunicado para liberar espaço no servidor? O texto da mensagem continuará visível.')) {
      return;
    }
    setDeletingMedia(true);
    try {
      await onDeleteMedia();
    } finally {
      setDeletingMedia(false);
    }
  };

  const handleMark = async () => {
    if (!onMarkRead || isRead) return;
    setMarking(true);
    try {
      await onMarkRead();
    } finally {
      setMarking(false);
    }
  };

  const getTargetBadge = () => {
    if (comunicado.departamento?.nome) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-0.5 text-[11px] font-mono font-bold uppercase text-cyan-600">
          <Building2 size={12} />
          Setor: {comunicado.departamento.nome}
        </span>
      );
    }
    if (comunicado.usuario?.nome) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-mono font-bold uppercase text-amber-700">
          <User size={12} />
          Individual: {comunicado.usuario.nome}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-primary/10 border border-brand-primary/30 px-2.5 py-0.5 text-[11px] font-mono font-bold uppercase text-brand-primary">
        <Megaphone size={12} />
        Todos os Colaboradores
      </span>
    );
  };

  const hasMedia = Boolean(resolvedImageUrl || resolvedAudioUrl || resolvedVideoUrl);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-brand-border bg-gradient-to-r from-brand-card to-brand-dark/40 p-5">
          <div className="flex items-start gap-3.5 min-w-0 pr-4">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                isUpdate ? 'bg-violet-500/15 text-violet-600' : 'bg-brand-primary/15 text-brand-primary'
              }`}
            >
              {isUpdate ? <CalendarDays size={22} /> : <Megaphone size={22} />}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                {getTargetBadge()}
                {!isRead && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 border border-red-500/30 px-2 py-0.5 text-[10px] font-mono font-bold uppercase text-red-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                    Novo
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-brand-text leading-snug m-0">{comunicado.titulo}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-brand-muted hover:bg-brand-dark hover:text-brand-text transition-colors shrink-0"
            title="Fechar modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Info bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border/60 bg-brand-dark/30 px-5 py-2.5 text-xs text-brand-muted">
          <span className="flex items-center gap-1.5">
            <User size={13} className="text-brand-primary" />
            Enviado por: <strong className="text-brand-text">{comunicado.criado_por?.nome || 'Portal RH'}</strong>
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[11px]">
            <Clock size={13} />
            {new Date(comunicado.inicio).toLocaleDateString('pt-BR')}
            {comunicado.fim ? ` · Válido até ${new Date(comunicado.fim).toLocaleDateString('pt-BR')}` : ''}
          </span>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Text Message */}
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-brand-text bg-white/40 border border-brand-border/40 p-4 rounded-xl">
            {comunicado.mensagem}
          </div>

          {/* Media Section Header with Delete Media Option */}
          {hasMedia && canManage && onDeleteMedia && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs font-mono text-brand-muted flex items-center gap-1">
                <HardDrive size={13} className="text-brand-primary" />
                Mídia armazenada no servidor
              </span>
              <button
                type="button"
                disabled={deletingMedia}
                onClick={handleDeleteMedia}
                className="inline-flex items-center gap-1 rounded bg-red-500/10 border border-red-500/30 px-2 py-1 text-[11px] font-mono text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors"
                title="Excluir arquivo do servidor para economizar espaço em disco"
              >
                <Trash2 size={12} />
                {deletingMedia ? 'Excluindo mídia...' : 'Liberar espaço (Excluir mídia)'}
              </button>
            </div>
          )}

          {/* Media Attachments */}
          {resolvedImageUrl && (
            <div className="space-y-1.5 rounded-xl border border-brand-border bg-brand-dark/50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-brand-muted mb-2">
                <ImageIcon size={14} className="text-brand-primary" />
                Imagem Anexa
              </div>
              <div className="overflow-hidden rounded-lg bg-black/60 text-center">
                <img
                  src={resolvedImageUrl}
                  alt={comunicado.titulo}
                  className="mx-auto max-h-80 w-auto object-contain rounded-lg shadow-sm"
                />
              </div>
            </div>
          )}

          {resolvedAudioUrl && (
            <div className="space-y-2 rounded-xl border border-brand-border bg-brand-dark/50 p-4">
              <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-brand-text mb-1">
                <Volume2 size={16} className="text-brand-primary" />
                Mensagem de Áudio
              </div>
              <audio controls src={resolvedAudioUrl} className="w-full h-11 rounded" autoPlay={false} />
            </div>
          )}

          {resolvedVideoUrl && (
            <div className="space-y-2 rounded-xl border border-brand-border bg-brand-dark/50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-brand-text mb-1.5">
                <VideoIcon size={16} className="text-brand-primary" />
                Vídeo Anexo
              </div>
              <div className="relative overflow-hidden rounded-lg bg-black">
                <video
                  controls
                  playsInline
                  src={resolvedVideoUrl}
                  className="w-full max-h-80 rounded-lg bg-black object-contain shadow-inner"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-brand-border bg-brand-dark/40 px-5 py-3.5">
          <div>
            {isRead ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                <CheckCircle2 size={16} />
                Leitura confirmada
              </span>
            ) : (
              <span className="text-xs text-brand-muted">Confirme o recebimento deste comunicado</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-brand-border bg-brand-card px-4 py-2 text-xs font-semibold text-brand-muted hover:text-brand-text hover:bg-brand-dark transition-colors"
            >
              Fechar
            </button>
            {!isRead && onMarkRead && (
              <button
                type="button"
                disabled={marking}
                onClick={handleMark}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold font-mono uppercase text-white shadow hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                <Check size={15} strokeWidth={3} />
                {marking ? 'Confirmando...' : 'Confirmar Leitura'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
