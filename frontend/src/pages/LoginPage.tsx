import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../api/auth';
import { CONFIGURED_APPLICATION_URL, IS_NATIVE_APP, normalizeApplicationUrl } from '../api/client';
import { KeyRound, QrCode, AlertCircle, Settings, RotateCcw, Camera, X, CheckCircle, Smartphone, ChevronDown } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { cameraPermissionMessage, ensureCameraPermission } from '../utils/cameraPermission';

type QrCamera = {
  id: string;
  label: string;
};

const QR_CAMERA_STORAGE_KEY = 'assettrack_qr_camera_id';

const choosePreferredCamera = (cameras: QrCamera[]) => {
  const savedCameraId = localStorage.getItem(QR_CAMERA_STORAGE_KEY);
  if (savedCameraId && cameras.some((camera) => camera.id === savedCameraId)) {
    return savedCameraId;
  }

  const isRearCamera = (label: string) => /back|rear|environment|traseir/i.test(label);
  const isAuxiliaryLens = (label: string) => /ultra|wide|macro|depth|tele/i.test(label);
  const mainRearCamera = cameras.find(
    (camera) => isRearCamera(camera.label) && !isAuxiliaryLens(camera.label),
  );

  return mainRearCamera?.id
    || cameras.find((camera) => isRearCamera(camera.label))?.id
    || cameras.at(-1)?.id
    || '';
};

export const LoginPage: React.FC = () => {
  const { token, login: loginStore } = useAuthStore();

  useEffect(() => {
    if (token) {
      window.location.href = '/profile';
    }
  }, [token]);

  const appAccessUrl = window.location.origin;
  const appAccessQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(appAccessUrl)}`;
  const isLocalhostAccess = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const [mode, setMode] = useState<'standard' | 'qr'>('standard');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [qrToken, setQrToken] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrSuccessMsg, setQrSuccessMsg] = useState<string | null>(null);
  const [showMobileAccess, setShowMobileAccess] = useState(false);

  // Optional server address override for APK/mobile/local network testing
  const [showSettings, setShowSettings] = useState(IS_NATIVE_APP && !CONFIGURED_APPLICATION_URL);
  const [customAppUrl, setCustomAppUrl] = useState(CONFIGURED_APPLICATION_URL);

  const handleSaveSettings = () => {
    const normalizedUrl = normalizeApplicationUrl(customAppUrl);
    if (!normalizedUrl) {
      setError('Informe um endereço válido, incluindo o IP ou nome do servidor e a porta.');
      return;
    }

    localStorage.setItem('custom_app_url', normalizedUrl);
    localStorage.removeItem('custom_api_url');
    window.location.reload();
  };

  const handleResetSettings = () => {
    localStorage.removeItem('custom_app_url');
    localStorage.removeItem('custom_api_url');
    window.location.reload();
  };

  // Camera Scanner configuration
  const [cameraActive, setCameraActive] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<QrCamera[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [detectingCameras, setDetectingCameras] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const regionId = 'qr-reader-login';

  useEffect(() => {
    return () => {
      // Clean up camera on unmount
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, []);

  async function detectAvailableCameras(): Promise<string> {
    setDetectingCameras(true);
    setScanError(null);

    try {
      if (!(await ensureCameraPermission())) {
        setScanError(cameraPermissionMessage);
        return '';
      }

      const detected = await Html5Qrcode.getCameras();
      const cameras = detected.map((camera, index) => ({
        id: camera.id,
        label: camera.label || `Câmera ${index + 1}`,
      }));

      if (cameras.length === 0) {
        setScanError('Nenhuma câmera foi encontrada neste dispositivo.');
        return '';
      }

      setAvailableCameras(cameras);
      const preferredCameraId = choosePreferredCamera(cameras);
      setSelectedCameraId(preferredCameraId);
      return preferredCameraId;
    } catch (err) {
      console.error('Camera detection error:', err);
      setScanError('Não foi possível detectar as câmeras disponíveis.');
      return '';
    } finally {
      setDetectingCameras(false);
    }
  }

  const handleCameraSelection = (cameraId: string) => {
    setSelectedCameraId(cameraId);
    localStorage.setItem(QR_CAMERA_STORAGE_KEY, cameraId);
  };

  async function stopCamera() {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
      } catch (err) {
        console.error('Stop scanner error:', err);
      }
      scannerRef.current = null;
    }
    setCameraActive(false);
  }

  const handleModeChange = (nextMode: 'standard' | 'qr') => {
    setMode(nextMode);
    setError(null);
    setQrSuccessMsg(null);

    if (nextMode === 'qr') {
      void detectAvailableCameras();
    } else {
      void stopCamera();
    }
  };

  const extractTokenFromQr = (text: string): string => {
    if (!text) return '';
    let trimmed = text.trim();
    
    // Remove query params or hash if any
    trimmed = trimmed.split('?')[0].split('#')[0];
    
    if (trimmed.includes('://') || trimmed.includes('/')) {
      if (trimmed.includes('/usuario/')) {
        const parts = trimmed.split('/usuario/');
        return parts[parts.length - 1];
      }
      if (trimmed.includes('token=')) {
        const parts = trimmed.split('token=');
        return parts[1]?.split('&')[0] || trimmed;
      }
      const parts = trimmed.split('/');
      return parts[parts.length - 1] || trimmed;
    }
    return trimmed;
  };

  const startCamera = async () => {
    try {
      setScanError(null);
      if (!(await ensureCameraPermission())) {
        setScanError(cameraPermissionMessage);
        return;
      }

      const cameraId = selectedCameraId || await detectAvailableCameras();
      if (!cameraId) return;

      setCameraActive(true);
      
      setTimeout(async () => {
        try {
          const html5Qrcode = new Html5Qrcode(regionId);
          scannerRef.current = html5Qrcode;

          await html5Qrcode.start(
            cameraId,
            {
              fps: 12,
              qrbox: { width: 220, height: 220 },
              aspectRatio: 1,
              disableFlip: false,
            },
            (decodedText) => {
              const token = extractTokenFromQr(decodedText);
              setQrToken(token);
              setQrSuccessMsg('Token lido com sucesso! Digite o PIN de Segurança para entrar.');
              stopCamera();
            },
            () => {
              // Expected frame failures can be ignored
            }
          );
        } catch (err: any) {
          console.error('Html5Qrcode login init error:', err);
          setScanError(cameraPermissionMessage);
          setCameraActive(false);
        }
      }, 300);
    } catch (err: any) {
      setScanError('Erro ao carregar a câmera.');
      setCameraActive(false);
    }
  };

  const formatLoginError = (err: any): string => {
    const detail = err.response?.data?.detail || err.message || '';
    const lower = detail.toLowerCase();
    if (lower.includes('inactive') || lower.includes('inativo')) {
      return 'Usuario Inativo entrar em contato com TI.';
    }
    if (lower.includes('incorrect') || lower.includes('incorret')) {
      return 'E-mail ou senha incorretos.';
    }
    return detail || 'Falha ao autenticar. Tente novamente.';
  };

  const handleStandardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (IS_NATIVE_APP && !CONFIGURED_APPLICATION_URL) {
      setShowSettings(true);
      setError('Configure primeiro o endereço da aplicação com a porta.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.login({ username: email, password });
      await loginStore(res.access_token);
      window.location.href = '/profile';
    } catch (err: any) {
      setError(formatLoginError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleQRSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (IS_NATIVE_APP && !CONFIGURED_APPLICATION_URL) {
      setShowSettings(true);
      setError('Configure primeiro o endereço da aplicação com a porta.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.qrLogin({ qr_token: qrToken, pin });
      await loginStore(res.access_token);
      window.location.href = '/profile';
    } catch (err: any) {
      setError(formatLoginError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-3 sm:p-4 bg-[radial-gradient(circle_at_80%_15%,rgba(255,255,255,.30),transparent_25rem),linear-gradient(135deg,#a9d4ee,#68acd3)]">
      <div className="w-full max-w-md rounded-2xl border border-white/60 bg-white/90 p-5 shadow-[0_18px_60px_rgba(9,30,66,.22)] backdrop-blur relative sm:p-8">
        {/* Settings Trigger Icon */}
        <button
          type="button"
          onClick={() => setShowSettings(!showSettings)}
          className="absolute top-4 right-4 p-2 rounded-xl text-brand-muted hover:text-brand-primary hover:bg-slate-100/50 transition-all duration-200 sm:top-6 sm:right-6"
          title="Configurações de Conexão"
        >
          <Settings size={18} className={`transition-transform duration-300 ${showSettings ? 'rotate-90' : ''}`} />
        </button>

        {/* Header */}
        <div className="text-center mb-5 sm:mb-8">
          <img
            src="/logo-assettrack-claro.svg"
            alt="AssetTrack TI"
            className="mx-auto mb-3 h-auto w-[190px] max-w-[72%] object-contain sm:mb-4 sm:w-[220px]"
          />
          <h2 className="text-xl font-bold tracking-tight text-brand-text sm:text-2xl">
            Painel de Acesso
          </h2>
        </div>

        {/* Connection Settings Panel */}
        {showSettings && (
          <div className="mb-6 p-4 rounded-xl border border-blue-500/20 bg-blue-50/50 backdrop-blur-sm space-y-3 transition-all duration-300">
            <h3 className="text-xs font-mono uppercase tracking-wider text-brand-primary font-bold">
              ⚙️ Endereço da Aplicação
            </h3>
            <p className="text-[10px] text-brand-muted font-mono leading-relaxed">
              Informe somente o endereço usado para abrir a aplicação, incluindo a porta. Exemplo: http://192.168.1.50:8000. Não adicione caminhos extras.
            </p>
            <div className="space-y-2">
              <input
                type="text"
                value={customAppUrl}
                onChange={(e) => setCustomAppUrl(e.target.value)}
                className="w-full rounded-lg bg-white border border-brand-border px-3 py-2 text-xs font-mono text-brand-text focus:outline-none focus:border-brand-primary"
                placeholder="http://192.168.X.X:8000"
              />
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="flex-1 bg-brand-primary hover:bg-brand-primary/90 text-white font-bold py-2 rounded-lg text-[10px] font-mono tracking-wider transition-colors shadow-sm cursor-pointer"
                >
                  Salvar e Conectar
                </button>
                <button
                  type="button"
                  onClick={handleResetSettings}
                  className="px-3 bg-slate-200 hover:bg-slate-300 text-brand-text rounded-lg text-[10px] flex items-center justify-center transition-colors cursor-pointer"
                  title="Restaurar Padrão"
                >
                  <RotateCcw size={12} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mode Toggle */}
        <div className="flex rounded-xl border border-brand-border bg-slate-50 p-1 mb-4 sm:mb-6">
          <button
            type="button"
            onClick={() => handleModeChange('standard')}
            className={`flex-1 py-2.5 text-[11px] font-mono uppercase tracking-wider flex items-center justify-center space-x-2 transition-all duration-150 sm:py-3 sm:text-xs ${
              mode === 'standard'
                ? 'bg-white text-brand-primary rounded-lg shadow-sm'
                : 'text-brand-muted hover:text-brand-text'
            }`}
          >
            <KeyRound size={14} />
            <span>Credenciais</span>
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('qr')}
            className={`flex-1 py-2.5 text-[11px] font-mono uppercase tracking-wider flex items-center justify-center space-x-2 transition-all duration-150 sm:py-3 sm:text-xs ${
              mode === 'qr'
                ? 'bg-white text-brand-primary rounded-lg shadow-sm'
                : 'text-brand-muted hover:text-brand-text'
            }`}
          >
            <QrCode size={14} />
            <span>QR Code + PIN</span>
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-cyan-500/20 bg-cyan-50/70 sm:mb-6">
          <button
            type="button"
            onClick={() => setShowMobileAccess((current) => !current)}
            className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-cyan-100/40 sm:p-4"
            aria-expanded={showMobileAccess}
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-brand-primary shadow-sm">
              <Smartphone size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-brand-primary">
                Acessar no smartphone
              </h3>
              <p className="mt-0.5 truncate text-[11px] text-brand-muted">
                QR Code para abrir no celular
              </p>
            </div>
            <ChevronDown size={18} className={`shrink-0 text-brand-muted transition-transform ${showMobileAccess ? 'rotate-180' : ''}`} />
          </button>
          {showMobileAccess && (
            <div className="border-t border-cyan-500/10 px-3 pb-3 sm:px-4 sm:pb-4">
              <p className="pt-3 text-[11px] leading-relaxed text-brand-muted">
                Escaneie para abrir esta aplicação no celular conectado à mesma rede.
              </p>
              <div className="mt-3 flex flex-col gap-3 min-[380px]:flex-row min-[380px]:items-center">
                <img
                  src={appAccessQrUrl}
                  alt={`QR Code para acessar ${appAccessUrl}`}
                  className="mx-auto h-[112px] w-[112px] rounded-lg border border-brand-border bg-white p-1 min-[380px]:mx-0"
                />
                <div className="min-w-0">
                  <p className="truncate rounded-lg border border-brand-border bg-white px-2 py-1.5 text-[10px] font-mono text-brand-text">
                    {appAccessUrl}
                  </p>
                  {isLocalhostAccess && (
                    <p className="mt-2 text-[10px] leading-relaxed text-amber-700">
                      Para celular, abra o sistema pelo IP da máquina na rede, por exemplo http://192.168.x.x:8000, e o QR será atualizado automaticamente.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mb-6 p-4 border border-red-500/30 bg-red-500/5 text-red-400 text-xs font-mono flex items-start space-x-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* QR Success Notification */}
        {qrSuccessMsg && (
          <div className="mb-6 p-4 border border-emerald-500/30 bg-emerald-500/5 text-emerald-600 text-xs font-mono flex items-start space-x-2 rounded-lg">
            <CheckCircle size={16} className="shrink-0 mt-0.5 text-emerald-500" />
            <span>{qrSuccessMsg}</span>
          </div>
        )}

        {/* Forms */}
        {mode === 'standard' ? (
          <form onSubmit={handleStandardSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-2">
                E-mail Corporativo
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg bg-white border border-brand-border px-4 py-3 text-sm text-brand-text focus:outline-none focus:border-brand-primary transition-colors"
                placeholder="usuario@example.com"
              />
            </div>
            <div>
              <label htmlFor="pass" className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-2">
                Senha de Acesso
              </label>
              <input
                id="pass"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg bg-white border border-brand-border px-4 py-3 text-sm text-brand-text focus:outline-none focus:border-brand-primary transition-colors"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-primary hover:bg-brand-primary/90 text-white font-bold py-3 tracking-wide text-xs transition-colors mt-6 disabled:opacity-50 shadow-sm"
            >
              {loading ? 'Processando...' : 'Autenticar'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleQRSubmit} className="space-y-4">
            <div>
              <label htmlFor="qr" className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-2">
                Token QR Code
              </label>

              {detectingCameras && (
                <p className="mb-2 text-[10px] font-mono text-brand-muted">
                  Detectando câmeras disponíveis...
                </p>
              )}

              {!detectingCameras && availableCameras.length > 1 && (
                <div className="mb-3">
                  <label htmlFor="qr-camera" className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-brand-muted">
                    Câmera para leitura
                  </label>
                  <select
                    id="qr-camera"
                    value={selectedCameraId}
                    onChange={(event) => handleCameraSelection(event.target.value)}
                    disabled={cameraActive}
                    className="w-full rounded-lg border border-brand-border bg-white px-3 py-2.5 text-xs text-brand-text focus:border-brand-primary focus:outline-none disabled:opacity-60"
                  >
                    {availableCameras.map((camera, index) => (
                      <option key={camera.id} value={camera.id}>
                        {camera.label || `Câmera ${index + 1}`}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] leading-relaxed text-brand-muted">
                    A câmera traseira principal é selecionada automaticamente. Troque se outra lente focar melhor o QR Code.
                  </p>
                </div>
              )}
              
              {cameraActive ? (
                <div className="flex flex-col items-center justify-center space-y-3 mb-4 p-2 bg-slate-50 border border-brand-border rounded-xl">
                  <div 
                    id={regionId} 
                    className="w-full max-w-[220px] aspect-square border border-brand-border bg-black overflow-hidden relative rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-lg transition-colors flex items-center space-x-1 cursor-pointer"
                  >
                    <X size={12} />
                    <span>Desativar Câmera</span>
                  </button>
                </div>
              ) : (
                <div className="flex space-x-2">
                  <input
                    id="qr"
                    type="text"
                    required
                    value={qrToken}
                    onChange={(e) => setQrToken(e.target.value)}
                    className="flex-1 rounded-lg bg-white border border-brand-border px-4 py-3 text-sm text-brand-text focus:outline-none focus:border-brand-primary transition-colors"
                    placeholder="Insira o token do seu crachá"
                  />
                  <button
                    type="button"
                    onClick={startCamera}
                    disabled={detectingCameras}
                    className="px-3 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary border border-brand-primary/20 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                    title="Escanear com a Câmera"
                  >
                    <Camera size={18} />
                  </button>
                </div>
              )}
              
              {scanError && (
                <p className="text-[10px] text-red-500 font-mono mt-1">{scanError}</p>
              )}
            </div>
            <div>
              <label htmlFor="pin" className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-2">
                PIN de Segurança
              </label>
              <input
                id="pin"
                type="password"
                required
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full rounded-lg bg-white border border-brand-border px-4 py-3 text-sm text-brand-text focus:outline-none focus:border-brand-primary transition-colors text-center tracking-widest"
                placeholder="••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-primary hover:bg-brand-primary/90 text-white font-bold py-3 tracking-wide text-xs transition-colors mt-6 disabled:opacity-50 shadow-sm"
            >
              {loading ? 'Processando...' : 'Autenticar via QR'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
