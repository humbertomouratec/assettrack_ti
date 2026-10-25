import { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Radio,
  Boxes,
  ShieldCheck,
  Cpu,
  Trophy,
  Check,
} from 'lucide-react';

interface Chapter {
  id: string;
  time: number;
  label: string;
  title: string;
  description: string;
  icon: typeof Boxes;
}

const chapters: Chapter[] = [
  {
    id: 'visao-geral',
    time: 0,
    label: '00:00',
    title: 'Visão Geral & Ecossistema',
    description: 'Centralização de inventário, ciclo de vida do ativo e visibilidade completa.',
    icon: Boxes,
  },
  {
    id: 'patrimonio-suporte',
    time: 15,
    label: '00:15',
    title: 'Patrimônio & Service Desk',
    description: 'Etiquetas QR Code, rastreio de responsáveis e chamados com evidências.',
    icon: ShieldCheck,
  },
  {
    id: 'manutencao-compras',
    time: 30,
    label: '00:30',
    title: 'Manutenção & Suprimentos',
    description: 'Planos preventivos com periodicidade, checklists e requisição de peças.',
    icon: Cpu,
  },
  {
    id: 'iot-gamificacao',
    time: 43,
    label: '00:43',
    title: 'IoT Telemetria & Gamificação',
    description: 'Sensores de data center ao vivo e pontos de XP para reconhecimento da equipe.',
    icon: Trophy,
  },
];

// 32 pseudo-frequency waveform bar heights
const WAVEFORM_BARS = [
  35, 60, 45, 80, 55, 95, 70, 85, 40, 90, 65, 100, 75, 50, 85, 60,
  95, 70, 40, 80, 90, 65, 85, 50, 75, 90, 60, 80, 45, 70, 55, 40
];

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function AudioPresentation() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(55); // ~55 seconds fallback
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      const cur = audio.currentTime;
      setCurrentTime(cur);

      // Determine active chapter
      let currentIdx = 0;
      for (let i = chapters.length - 1; i >= 0; i--) {
        if (cur >= chapters[i].time - 0.5) {
          currentIdx = i;
          break;
        }
      }
      setActiveChapterIndex(currentIdx);
    };

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      setActiveChapterIndex(0);
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, []);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      try {
        await audio.play();
      } catch (err) {
        console.warn('Audio playback error:', err);
      }
    }
  };

  const handleSeek = (fraction: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const target = Math.max(0, Math.min(duration, fraction * duration));
    audio.currentTime = target;
    setCurrentTime(target);
  };

  const jumpToChapter = (timeInSeconds: number, index: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = timeInSeconds;
    setCurrentTime(timeInSeconds);
    setActiveChapterIndex(index);
    if (!isPlaying) {
      audio.play().catch(() => {});
    }
  };

  const toggleRate = () => {
    const rates = [1, 1.25, 1.5, 2];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIdx];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const next = !isMuted;
    setIsMuted(next);
    audioRef.current.muted = next;
  };

  const restartAudio = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    setCurrentTime(0);
    setActiveChapterIndex(0);
    audioRef.current.play().catch(() => {});
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <section className="audio-presentation-section" id="apresentacao" aria-labelledby="apresentacao-titulo">
      <audio ref={audioRef} src="/Assettrack-ti.aac" preload="metadata" />

      <div className="audio-presentation-container">
        {/* Header da Apresentação */}
        <div className="audio-presentation-header">
          <div className="audio-eyebrow">
            <span className="audio-live-dot" />
            <Radio size={14} className="audio-eyebrow-icon" />
            <span>APRESENTAÇÃO EM ÁUDIO · OUÇA EM 1 MINUTO</span>
          </div>
          <h2 id="apresentacao-titulo">
            Sua operação de TI explicada<br />
            <span>de ponta a ponta.</span>
          </h2>
          <p>
            Dê o play para ouvir uma síntese rápida de como o AssetTrack TI reúne ativos, chamados,
            manutenções, telemetria inteligente e motivação técnica em um só ecossistema.
          </p>
        </div>

        {/* Deck Central: Avatar + Player Principal */}
        <div className="audio-deck-layout">
          {/* Lado A: Avatar com anéis orbitais */}
          <div className={`audio-avatar-card ${isPlaying ? 'is-playing' : ''}`}>
            <div className="audio-avatar-stage">
              {/* Anéis sonoros pulsantes */}
              <div className="sound-pulse-ring ring-1" aria-hidden="true" />
              <div className="sound-pulse-ring ring-2" aria-hidden="true" />
              <div className="sound-pulse-ring ring-3" aria-hidden="true" />

              {/* Moldura do Avatar */}
              <div className="audio-avatar-wrapper">
                <img
                  src="/avatar-presenter.jpg"
                  alt="Avatar do especialista técnico apresentador do AssetTrack TI"
                  className="audio-avatar-img"
                  width="280"
                  height="280"
                  loading="lazy"
                />
                <button
                  type="button"
                  className="audio-avatar-play-overlay"
                  onClick={togglePlay}
                  aria-label={isPlaying ? 'Pausar áudio' : 'Reproduzir apresentação em áudio'}
                >
                  {isPlaying ? <Pause size={32} /> : <Play size={32} className="play-icon-offset" />}
                </button>
              </div>

              {/* Badge Flutuante de Status */}
              <div className="audio-status-pill">
                <span className={`status-indicator ${isPlaying ? 'active' : ''}`} />
                <div>
                  <strong>Alexandre Moura</strong>
                  <span>{isPlaying ? 'Apresentando ao vivo…' : 'Especialista AssetTrack TI'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Lado B: Console do Player & Waveform */}
          <div className="audio-console-card">
            {/* Topo do console com info e controles rápidos */}
            <div className="audio-console-top">
              <div className="audio-track-info">
                <span className="audio-track-badge">ÁUDIO OFICIAL</span>
                <span className="audio-track-duration">Duração: {formatTime(duration)}</span>
              </div>
              <div className="audio-top-actions">
                <button
                  type="button"
                  className="audio-action-btn speed-btn"
                  onClick={toggleRate}
                  title="Alterar velocidade de reprodução"
                  aria-label={`Velocidade ${playbackRate}x`}
                >
                  {playbackRate}x
                </button>
                <button
                  type="button"
                  className="audio-action-btn"
                  onClick={toggleMute}
                  title={isMuted ? 'Desmutar áudio' : 'Silenciar áudio'}
                  aria-label={isMuted ? 'Desmutar áudio' : 'Silenciar áudio'}
                >
                  {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <button
                  type="button"
                  className="audio-action-btn"
                  onClick={restartAudio}
                  title="Reiniciar apresentação"
                  aria-label="Reiniciar do início"
                >
                  <RotateCcw size={17} />
                </button>
              </div>
            </div>

            {/* Waveform Interativo de 32 barras */}
            <div className="audio-waveform-wrapper">
              <div
                className="audio-waveform-track"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const frac = Math.max(0, Math.min(1, clickX / rect.width));
                  handleSeek(frac);
                }}
                role="slider"
                tabIndex={0}
                aria-label="Controle de posição da faixa"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration)}
                aria-valuenow={Math.round(currentTime)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') handleSeek(Math.min(1, (currentTime + 5) / duration));
                  if (e.key === 'ArrowLeft') handleSeek(Math.max(0, (currentTime - 5) / duration));
                }}
              >
                {WAVEFORM_BARS.map((height, i) => {
                  const barFrac = (i / WAVEFORM_BARS.length) * 100;
                  const isPassed = barFrac <= progressPercent;
                  return (
                    <span
                      key={i}
                      className={`waveform-bar ${isPassed ? 'is-passed' : ''} ${isPlaying ? 'is-active-wave' : ''}`}
                      style={{
                        height: `${height}%`,
                        animationDelay: `${(i % 8) * 0.12}s`,
                      }}
                    />
                  );
                })}
              </div>

              {/* Indicadores de Tempo */}
              <div className="audio-time-row">
                <span className="current-time">{formatTime(currentTime)}</span>
                <span className="total-time">{formatTime(duration)}</span>
              </div>
            </div>

            {/* Botão de Controle Principal */}
            <div className="audio-main-controls">
              <button
                type="button"
                className={`audio-hero-play-button ${isPlaying ? 'playing' : ''}`}
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pausar apresentação' : 'Ouvir apresentação do AssetTrack'}
              >
                <span className="play-button-icon">
                  {isPlaying ? <Pause size={22} /> : <Play size={22} className="play-icon-offset" />}
                </span>
                <span className="play-button-text">
                  <strong>{isPlaying ? 'Pausar áudio' : 'Ouvir apresentação'}</strong>
                  <small>{isPlaying ? 'Clique para interromper' : 'Voz original sintetizada da plataforma'}</small>
                </span>
              </button>

              <div className="audio-quick-tags">
                <span><Check size={14} /> Áudio nativo (~1 min)</span>
                <span><Check size={14} /> Compatível Web & Mobile</span>
              </div>
            </div>

            {/* Capítulos / Tópicos Abordados */}
            <div className="audio-chapters-section">
              <span className="chapters-label">Capítulos abordados no áudio:</span>
              <div className="audio-chapters-grid">
                {chapters.map((chap, idx) => {
                  const isCurrent = activeChapterIndex === idx;
                  const Icon = chap.icon;
                  return (
                    <button
                      key={chap.id}
                      type="button"
                      className={`chapter-pill ${isCurrent ? 'active' : ''}`}
                      onClick={() => jumpToChapter(chap.time, idx)}
                      aria-current={isCurrent ? 'true' : undefined}
                    >
                      <span className="chapter-time">{chap.label}</span>
                      <Icon size={16} className="chapter-icon" />
                      <div className="chapter-content">
                        <strong>{chap.title}</strong>
                        <span>{chap.description}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
