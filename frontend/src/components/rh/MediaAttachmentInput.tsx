import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Mic, Video, Image as ImageIcon, Upload, Play, Square, Trash2, RotateCcw, AlertCircle, Film, RefreshCw, SwitchCamera } from 'lucide-react';

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

  // Camera device selection
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setActiveTab(mediaTipo);
  }, [mediaTipo]);

  // Clean up media streams and timers when unmounting or changing tab
  const stopCurrentStream = useCallback(() => {
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
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
    setIsRecording(false);
    setCameraActive(false);
    setRecordingSeconds(0);
    setStreamError(null);
  }, []);

  useEffect(() => {
    return () => {
      stopCurrentStream();
    };
  }, [stopCurrentStream]);

  // Enumerate cameras
  const refreshCameraList = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      setAvailableCameras(videoDevices);
      if (videoDevices.length > 0 && !selectedCameraId) {
        setSelectedCameraId(videoDevices[0].deviceId);
      }
    } catch (err) {
      console.error('Error enumerating cameras:', err);
    }
  }, [selectedCameraId]);

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

  // ==========================================
  // AUDIO RECORDING (AUDIO-ONLY)
  // ==========================================
  const startAudioRecording = async () => {
    stopCurrentStream();
    setStreamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      mediaStreamRef.current = stream;
      recordedChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const file = new File(recordedChunksRef.current, 'gravacao_audio.weba', { type: mimeType });
        const previewUrl = URL.createObjectURL(file);
        onChange('audio', file, previewUrl);
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

  // ==========================================
  // VIDEO RECORDING (WEBCAM + MIC WITH PREVIEW & CAMERA SELECTOR)
  // ==========================================
  const startCameraPreview = useCallback(async (deviceIdOverride?: string) => {
    // Stop any existing stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    setStreamError(null);
    const targetDeviceId = deviceIdOverride || selectedCameraId;

    try {
      const videoConstraints: MediaTrackConstraints = targetDeviceId
        ? { deviceId: { exact: targetDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: true,
      });

      mediaStreamRef.current = stream;
      setCameraActive(true);

      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        liveVideoRef.current.play().catch(() => {});
      }

      // Re-enumerate devices to fetch actual labels now that permission is granted
      await refreshCameraList();

      // If no specific camera was selected yet, find the one currently used
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        if (settings.deviceId && !targetDeviceId) {
          setSelectedCameraId(settings.deviceId);
        }
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      setStreamError('Não foi possível acessar a câmera ou microfone selecionado. Verifique as permissões do navegador.');
      setCameraActive(false);
    }
  }, [selectedCameraId, refreshCameraList]);

  // Handle switching camera from dropdown
  const handleCameraChange = async (newDeviceId: string) => {
    setSelectedCameraId(newDeviceId);
    if (cameraActive && !isRecording) {
      await startCameraPreview(newDeviceId);
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
      const file = new File(recordedChunksRef.current, 'gravacao_video.webm', { type: mimeType });
      const previewUrl = URL.createObjectURL(file);
      onChange('video', file, previewUrl);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = null;
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

      {/* ========================================== */}
      {/* IMAGE TAB */}
      {/* ========================================== */}
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
                className="absolute right-2 top-2 rounded-full bg-red-600/90 p-1.5 text-white hover:bg-red-700 shadow-md transition-colors"
                title="Remover imagem"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* AUDIO TAB */}
      {/* ========================================== */}
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
              <span className="text-[10px] text-brand-muted font-mono">Formatos: MP3, WAV, OGG, M4A, WEBA (máx 100MB)</span>
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
                  Áudio Gravado / Selecionado
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

      {/* ========================================== */}
      {/* VIDEO TAB (WITH LIVE PREVIEW & CAMERA SELECTOR) */}
      {/* ========================================== */}
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
                <div className="flex flex-col items-center justify-center gap-3 p-5 text-center">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => startCameraPreview()}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary/20 text-brand-primary border border-brand-primary/40 hover:bg-brand-primary/30 hover:scale-105 transition-all shadow-lg"
                    title="Ativar câmera"
                  >
                    <Camera size={26} />
                  </button>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-brand-text m-0">Ativar Câmera e Microfone</p>
                    <p className="text-[11px] text-brand-muted m-0">Veja o preview em tempo real e selecione sua webcam antes de gravar.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Camera Selector Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-border/80 bg-brand-dark/80 p-2 text-xs">
                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                      <SwitchCamera size={14} className="text-brand-primary shrink-0" />
                      <span className="text-[11px] font-mono text-brand-muted shrink-0">Câmera:</span>
                      <select
                        value={selectedCameraId}
                        onChange={(e) => handleCameraChange(e.target.value)}
                        disabled={isRecording}
                        aria-label="Selecionar câmera"
                        className="flex-1 rounded border border-brand-border bg-brand-card px-2 py-1 text-xs text-brand-text focus:border-brand-primary focus:outline-none"
                      >
                        {availableCameras.length > 0 ? (
                          availableCameras.map((cam, idx) => (
                            <option key={cam.deviceId || idx} value={cam.deviceId}>
                              {cam.label || `Câmera ${idx + 1}`}
                            </option>
                          ))
                        ) : (
                          <option value="">Câmera Padrão do Sistema</option>
                        )}
                      </select>
                    </div>

                    <button
                      type="button"
                      disabled={isRecording}
                      onClick={() => startCameraPreview(selectedCameraId)}
                      className="inline-flex items-center gap-1 rounded bg-brand-card border border-brand-border px-2 py-1 text-[11px] font-mono text-brand-muted hover:text-brand-text transition-colors"
                      title="Reiniciar / Atualizar câmera"
                    >
                      <RefreshCw size={11} />
                      Recarregar
                    </button>
                  </div>

                  {/* Real-time Viewfinder */}
                  <div className="relative rounded-xl overflow-hidden border-2 border-brand-border bg-black aspect-video max-h-72 mx-auto shadow-xl">
                    <video
                      ref={liveVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-contain bg-black"
                    />

                    {/* Status Overlay */}
                    {isRecording ? (
                      <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-red-600/90 backdrop-blur-sm px-3 py-1 text-xs font-mono font-bold text-white shadow-lg animate-pulse">
                        <span className="h-2.5 w-2.5 rounded-full bg-white animate-ping" />
                        REC {formatTimer(recordingSeconds)}
                      </div>
                    ) : (
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-sm px-2.5 py-0.5 text-[11px] font-mono font-semibold text-emerald-400 border border-emerald-500/30">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        Preview Ao Vivo
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-center gap-3 pt-1">
                    {!isRecording ? (
                      <>
                        <button
                          type="button"
                          onClick={startVideoRecording}
                          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2 text-xs font-bold font-mono uppercase text-white shadow-lg hover:bg-red-700 transition-all hover:scale-105"
                        >
                          <Play size={15} />
                          Iniciar Gravação
                        </button>
                        <button
                          type="button"
                          onClick={stopCurrentStream}
                          className="rounded-lg border border-brand-border bg-brand-dark px-3.5 py-2 text-xs text-brand-muted hover:text-brand-text transition-colors"
                        >
                          Fechar Câmera
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={stopVideoRecording}
                        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-6 py-2.5 text-xs font-bold font-mono uppercase text-white shadow-xl hover:bg-red-700 transition-all animate-bounce"
                      >
                        <Square size={15} />
                        Parar e Concluir Vídeo
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Video Preview Player (Recorded / Uploaded) */}
          {mediaPreviewUrl && (
            <div className="space-y-2 rounded-lg border border-brand-border bg-brand-dark/80 p-3">
              <div className="flex items-center justify-between text-xs font-mono text-brand-muted">
                <span className="text-brand-text font-semibold flex items-center gap-1.5">
                  <Video size={13} className="text-brand-primary" />
                  Vídeo Pronto para Publicação
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
              <video controls playsInline src={mediaPreviewUrl} className="w-full max-h-64 rounded-lg bg-black object-contain shadow-md" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
