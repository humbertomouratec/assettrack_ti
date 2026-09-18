import React, { useState } from 'react';
import { Smartphone, Download } from 'lucide-react';
import { ApkDownloadModal } from './ApkDownloadModal';
import { APP_CONFIG } from '../../config/appVersion';

interface ApkDownloadButtonProps {
  className?: string;
  variant?: 'header' | 'sidebar';
  compact?: boolean;
}

export const ApkDownloadButton: React.FC<ApkDownloadButtonProps> = ({ className = '', variant = 'header', compact = false }) => {
  const [modalOpen, setModalOpen] = useState(false);

  if (variant === 'sidebar') {
    return (
      <>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={`flex items-center w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded transition-all text-xs font-mono font-bold uppercase ${compact ? 'justify-center p-2.5' : 'space-x-2 p-2.5'} ${className}`}
          title="Baixar Aplicativo Android (APK)"
          aria-label="Baixar Aplicativo Android (APK)"
        >
          <Smartphone size={16} />
          {!compact && (
            <>
              <span>Baixar App Android</span>
              <span className="ml-auto bg-emerald-500 text-brand-dark px-1.5 py-0.2 rounded text-[10px]">
                v{APP_CONFIG.CURRENT_VERSION_NAME}
              </span>
            </>
          )}
        </button>
        <ApkDownloadModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={`inline-flex h-[38px] w-[183px] min-[1280px]:w-[228px] items-center justify-center space-x-1.5 overflow-visible bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-200 hover:text-white border border-emerald-400/40 rounded transition-all active:scale-95 shadow-sm text-xs font-semibold ${className}`}
        title="Baixar Aplicativo Android (APK) para Celular e Coletores"
        aria-label="Download do APK Android"
      >
        <img
          src="/logoandroid.svg"
          alt="Android"
          className="h-[71px] w-[104px] shrink-0 object-contain"
        />
        <span className="bg-emerald-500 text-slate-900 text-[10px] font-mono font-black px-1.5 py-0.2 rounded shrink-0 shadow-sm">
          v{APP_CONFIG.CURRENT_VERSION_NAME}
        </span>
        <Download size={13} className="hidden lg:inline text-emerald-300" />
      </button>
      <ApkDownloadModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
};
