import React, { useState, useRef, useEffect } from 'react';
import { Camera, Mic, Video, Image as ImageIcon, Upload, Play, Square, Trash2, RotateCcw, AlertCircle, Film } from 'lucide-react';

interface MediaAttachmentInputProps {
  mediaTipo: 'imagem' | 'audio' | 'video' | null;
  mediaFile: File | Blob | null;
  mediaPreviewUrl: string | null;
  onChange: (tipo: 'imagem' | 'audio' | 'video' | null, file: File | Blob | null, previewUrl: string | null) => void;
  disabled?: boolean;
}

export const MediaAttachmentInput: React.FC<MediaAttachmentInputProps> = ({
  mediaTipo,
  mediaFile: _mediaFile,
  mediaPreviewUrl,
  onChange,
  disabled = false,
}) => {
  const [activeTab, setActiveTab] = useState<'imagem' | 'audio' | 'video' | null>(mediaTipo);
  const [recordMode, setRecordMode] = useState<'record' | 'upload'>('record');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setActiveTab(mediaTipo);
  }, [mediaTipo]);

  // Clean up media streams and timers when unmounting or changing tab
  const stopCurrentStream = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsRecording(false);
    setCameraActive(false);
    setRecordingSeconds(0);
    setStreamError(null);
  };

  useEffect(() => {
    return () => {
      stopCurrentStream();
    };
  }, []);

  const handleSelectTab = (tab: 'imagem' | 'audio' | 'video' | null) => {
    if (disabled) return;
    stopCurrentStream();
    if (tab === activeTab) {
      // Toggle off
      setActiveTab(null);
      onChange(null, null, null);
    } else {
      setActiveTab(tab);
      setRecordMode(tab === 'imagem' ? 'upload' : 'record');
      // If switching tab and already had different media, clear it
      if (mediaTipo && mediaTipo !== tab) {
        onChange(null, null, null);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, tipo: 'imagem' | 'audio' | 'video') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit (100MB)
    if (file.size > 100 * 1024 * 1024) {
      alert('O arquivo selecionado excede o limite de 100MB.');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    onChange(tipo, file, previewUrl);
    e.target.value = '';
  };

  const handleClearMedia = () => {
    stopCurrentStream();
    onChange(null, null, null);
  };

  // Audio Recording
  const startAudioRecording = async () => {
    stopCurrentStream();
    setStreamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordedChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const previewUrl = URL.createObjectURL(blob);
        onChange('audio', blob, previewUrl);
        // Stop stream tracks
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }
      };

      recorder.start(200);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((sec) => sec + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone error:', err);
      setStreamError('Não foi possível acessar o microfone. Verifique as permissões do seu navegador.');
    }
  };

  const stopAudioRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  // Video Recording (Webcam + Mic)
  const startCameraPreview = async () => {
    stopCurrentStream();
    setStreamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: true,
      });
      mediaStreamRef.current = stream;
      setCameraActive(true);

      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        liveVideoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      setStreamError('Não foi possível acessar a câmera ou microfone. Verifique as permissões do navegador.');
      setCameraActive(false);
    }
  };

  const startVideoRecording = () => {
    if (!mediaStreamRef.current) return;
    recordedChunksRef.current = [];

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm';

    const recorder = new MediaRecorder(mediaStreamRef.current, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      const previewUrl = URL.createObjectURL(blob);
      onChange('video', blob, previewUrl);
      // Stop webcam stream tracks
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      setCameraActive(false);
    };

    recorder.start(250);
    setIsRecording(true);
    setRecordingSeconds(0);

    timerRef.current = window.setInterval(() => {
      setRecordingSeconds((sec) => sec + 1);
    }, 1000);
  };

  const stopVideoRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-3 rounded-xl border border-brand-border bg-brand-dark/40 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-brand-muted">
          <Film size={14} className="text-brand-primary" />
          Anexo de Mídia (Opcional)
        </label>
        {mediaTipo && (
          <button
            type="button"
            onClick={handleClearMedia}
            className="inline-flex items-center gap-1 text-[11px] font-mono text-red-400 hover:text-red-300 hover:underline"
          >
            <Trash2 size={12} />
            Remover anexo
          </button>
        )}
      </div>

      {/* Media Type Buttons */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          disabled={disabled || isRecording}
          onClick={() => handleSelectTab('imagem')}
          className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition-all ${
            activeTab === 'imagem'
              ? 'border-brand-primary bg-brand-primary/15 text-brand-primary font-bold shadow-sm'
              : 'border-brand-border bg-brand-dark/60 text-brand-muted hover:border-brand-primary/40 hover:text-brand-text'
          }`}
        >
          <ImageIcon size={15} />
          <span>Imagem</span>
        </button>

        <button
          type="button"
          disabled={disabled || isRecording}
          onClick={() => handleSelectTab('audio')}
          className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition-all ${
            activeTab === 'audio'
              ? 'border-brand-primary bg-brand-primary/15 text-brand-primary font-bold shadow-sm'
              : 'border-brand-border bg-brand-dark/60 text-brand-muted hover:border-brand-primary/40 hover:text-brand-text'
          }`}
        >
          <Mic size={15} />
          <span>Áudio</span>
        </button>

        <button
          type="button"
          disabled={disabled || isRecording}
          onClick={() => handleSelectTab('video')}
          className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition-all ${
            activeTab === 'video'
              ? 'border-brand-primary bg-brand-primary/15 text-brand-primary font-bold shadow-sm'
              : 'border-brand-border bg-brand-dark/60 text-brand-muted hover:border-brand-primary/40 hover:text-brand-text'
          }`}
        >
          <Video size={15} />
          <span>Vídeo</span>
        </button>
      </div>

      {streamError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{streamError}</span>
        </div>
      )}

      {/* IMAGE TAB */}
      {activeTab === 'imagem' && (
        <div className="space-y-3 rounded-lg border border-brand-border/60 bg-brand-card/60 p-3">
          {!mediaPreviewUrl ? (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-brand-border p-6 text-center hover:border-brand-primary/60 hover:bg-brand-primary/5 transition-colors">
              <Upload size={22} className="text-brand-primary" />
              <span className="text-xs font-medium text-brand-text">Clique para enviar uma foto ou imagem</span>
              <span className="text-[10px] text-brand-muted font-mono">Formatos: JPG, PNG, WEBP, GIF, SVG (máx 100MB)</span>
              <input
                type="file"
                accept="image/png, image/jpeg, image/webp, image/gif, image/svg+xml"
                onChange={(e) => handleFileUpload(e, 'imagem')}
                className="hidden"
                disabled={disabled}
              />
            </label>
          ) : (
            <div className="relative rounded-lg overflow-hidden border border-brand-border bg-black/40 text-center">
              <img src={mediaPreviewUrl} alt="Preview do anexo" className="mx-auto max-h-56 object-contain rounded-lg" />
              <button
                type="button"
                onClick={handleClearMedia}
                className="absolute right-2 top-2 rounded-full bg-red-600/90 p-1.5 text-white hover:bg-red-700 shadow-md"
                title="Remover imagem"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* AUDIO TAB */}
      {activeTab === 'audio' && (
        <div className="space-y-3 rounded-lg border border-brand-border/60 bg-brand-card/60 p-3">
          {/* Sub-tabs: Gravar vs Upload */}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isRecording}
              onClick={() => {
                setRecordMode('record');
                stopCurrentStream();
              }}
              className={`flex-1 rounded py-1.5 text-[11px] font-mono uppercase transition-colors ${
                recordMode === 'record'
                  ? 'bg-brand-primary/20 text-brand-primary font-bold border border-brand-primary/40'
                  : 'bg-brand-dark/40 text-brand-muted hover:text-brand-text'
              }`}
            >
              Gravar Microfone
            </button>
            <button
              type="button"
              disabled={isRecording}
              onClick={() => {
                setRecordMode('upload');
                stopCurrentStream();
              }}
              className={`flex-1 rounded py-1.5 text-[11px] font-mono uppercase transition-colors ${
                recordMode === 'upload'
                  ? 'bg-brand-primary/20 text-brand-primary font-bold border border-brand-primary/40'
                  : 'bg-brand-dark/40 text-brand-muted hover:text-brand-text'
              }`}
            >
              Upload Arquivo
            </button>
          </div>

          {recordMode === 'upload' && !mediaPreviewUrl && (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-brand-border p-6 text-center hover:border-brand-primary/60 hover:bg-brand-primary/5 transition-colors">
              <Upload size={22} className="text-brand-primary" />
              <span className="text-xs font-medium text-brand-text">Clique para enviar um arquivo de áudio</span>
              <span className="text-[10px] text-brand-muted font-mono">Formatos: MP3, WAV, OGG, M4A, WEBM (máx 100MB)</span>
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => handleFileUpload(e, 'audio')}
                className="hidden"
                disabled={disabled}
              />
            </label>
          )}

          {recordMode === 'record' && !mediaPreviewUrl && (
            <div className="flex flex-col items-center justify-center gap-3 p-4 text-center">
              {!isRecording ? (
                <>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={startAudioRecording}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20 text-red-500 border border-red-500/40 hover:bg-red-500/30 hover:scale-105 transition-all shadow-lg"
                    title="Iniciar gravação de voz"
                  >
                    <Mic size={26} />
                  </button>
                  <p className="text-xs text-brand-muted m-0">Clique no microfone para gravar uma mensagem de voz.</p>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-red-500 animate-ping" />
                    <span className="font-mono text-sm font-bold text-red-400">Gravando áudio: {formatTimer(recordingSeconds)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={stopAudioRecording}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold font-mono uppercase text-white shadow hover:bg-red-700"
                  >
                    <Square size={14} />
                    Finalizar e Salvar
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Audio Preview Player */}
          {mediaPreviewUrl && (
            <div className="space-y-2 rounded-lg border border-brand-border bg-brand-dark/80 p-3">
              <div className="flex items-center justify-between text-xs font-mono text-brand-muted">
                <span className="text-brand-text font-semibold flex items-center gap-1.5">
                  <Mic size={13} className="text-brand-primary" />
                  Áudio Pronto
                </span>
                <button
                  type="button"
                  onClick={handleClearMedia}
                  className="text-red-400 hover:underline flex items-center gap-1"
                >
                  <RotateCcw size={12} />
                  Gravar / Enviar outro
                </button>
              </div>
              <audio controls src={mediaPreviewUrl} className="w-full h-10 rounded" />
            </div>
          )}
        </div>
      )}

      {/* VIDEO TAB */}
      {activeTab === 'video' && (
        <div className="space-y-3 rounded-lg border border-brand-border/60 bg-brand-card/60 p-3">
          {/* Sub-tabs: Gravar Webcam vs Upload */}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isRecording}
              onClick={() => {
                setRecordMode('record');
                stopCurrentStream();
              }}
              className={`flex-1 rounded py-1.5 text-[11px] font-mono uppercase transition-colors ${
                recordMode === 'record'
                  ? 'bg-brand-primary/20 text-brand-primary font-bold border border-brand-primary/40'
                  : 'bg-brand-dark/40 text-brand-muted hover:text-brand-text'
              }`}
            >
              Gravar Webcam
            </button>
            <button
              type="button"
              disabled={isRecording}
              onClick={() => {
                setRecordMode('upload');
                stopCurrentStream();
              }}
              className={`flex-1 rounded py-1.5 text-[11px] font-mono uppercase transition-colors ${
                recordMode === 'upload'
                  ? 'bg-brand-primary/20 text-brand-primary font-bold border border-brand-primary/40'
                  : 'bg-brand-dark/40 text-brand-muted hover:text-brand-text'
              }`}
            >
              Upload Arquivo
            </button>
          </div>

          {recordMode === 'upload' && !mediaPreviewUrl && (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-brand-border p-6 text-center hover:border-brand-primary/60 hover:bg-brand-primary/5 transition-colors">
              <Upload size={22} className="text-brand-primary" />
              <span className="text-xs font-medium text-brand-text">Clique para enviar um arquivo de vídeo</span>
              <span className="text-[10px] text-brand-muted font-mono">Formatos: MP4, WEBM, MOV, MKV (máx 100MB)</span>
              <input
                type="file"
                accept="video/*"
                onChange={(e) => handleFileUpload(e, 'video')}
                className="hidden"
                disabled={disabled}
              />
            </label>
          )}

          {recordMode === 'record' && !mediaPreviewUrl && (
            <div className="space-y-3">
              {!cameraActive ? (
                <div className="flex flex-col items-center justify-center gap-3 p-4 text-center">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={startCameraPreview}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary/20 text-brand-primary border border-brand-primary/40 hover:bg-brand-primary/30 hover:scale-105 transition-all shadow-lg"
                    title="Ativar câmera"
                  >
                    <Camera size={26} />
                  </button>
                  <p className="text-xs text-brand-muted m-0">Clique para abrir a webcam e preparar a gravação.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative rounded-lg overflow-hidden border border-brand-border bg-black aspect-video max-h-60 mx-auto">
                    <video ref={liveVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                    {isRecording && (
                      <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-md bg-black/70 px-2.5 py-1 text-xs font-mono font-bold text-red-400">
                        <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
                        REC {formatTimer(recordingSeconds)}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-center gap-2">
                    {!isRecording ? (
                      <>
                        <button
                          type="button"
                          onClick={startVideoRecording}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold font-mono uppercase text-white shadow hover:bg-red-700"
                        >
                          <Play size={14} />
                          Iniciar Gravação
                        </button>
                        <button
                          type="button"
                          onClick={stopCurrentStream}
                          className="rounded-lg border border-brand-border bg-brand-dark px-3 py-2 text-xs text-brand-muted hover:text-brand-text"
                        >
                          Fechar Câmera
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={stopVideoRecording}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-5 py-2 text-xs font-bold font-mono uppercase text-white shadow hover:bg-red-700"
                      >
                        <Square size={14} />
                        Parar e Salvar Vídeo
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Video Preview Player */}
          {mediaPreviewUrl && (
            <div className="space-y-2 rounded-lg border border-brand-border bg-brand-dark/80 p-3">
              <div className="flex items-center justify-between text-xs font-mono text-brand-muted">
                <span className="text-brand-text font-semibold flex items-center gap-1.5">
                  <Video size={13} className="text-brand-primary" />
                  Vídeo Pronto
                </span>
                <button
                  type="button"
                  onClick={handleClearMedia}
                  className="text-red-400 hover:underline flex items-center gap-1"
                >
                  <RotateCcw size={12} />
                  Gravar / Enviar outro
                </button>
              </div>
              <video controls playsInline src={mediaPreviewUrl} className="w-full max-h-56 rounded-lg bg-black" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
