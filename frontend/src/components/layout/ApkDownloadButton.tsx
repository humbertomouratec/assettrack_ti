import React, { useState } from 'react';
import { Smartphone, Download } from 'lucide-react';
import { ApkDownloadModal } from './ApkDownloadModal';
import { APP_CONFIG } from '../../config/appVersion';

interface ApkDownloadButtonProps {
  className?: string;
  variant?: 'header' | 'sidebar';
  compact?: boolean;
}

export const ApkDownloadButton: React.FC<ApkDownloadButtonProps> = ({
  className = '',
  variant = 'header',
  compact = false,
}) => {
  const [modalOpen, setModalOpen] = useState(false);

  if (variant === 'sidebar') {
    return (
      <>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          title={compact ? `Baixar App Android (v${APP_CONFIG.CURRENT_VERSION_NAME})` : undefined}
          aria-label="Baixar Aplicativo Android (APK)"
          className={`group flex w-full items-center rounded-xl border border-emerald-600/30 bg-emerald-50 hover:bg-emerald-100/90 text-emerald-950 transition-all duration-150 active:scale-[0.98] cursor-pointer shadow-2xs ${
            compact ? 'justify-center p-2.5' : 'justify-between px-3 py-2.5'
          } ${className}`}
        >
          <div className="flex items-center space-x-2.5 min-w-0">
            <Smartphone size={18} className="shrink-0 text-emerald-700 group-hover:scale-110 transition-transform" />
            {!compact && (
              <span className="text-xs font-bold whitespace-nowrap text-emerald-950 tracking-tight">
                App Android
              </span>
            )}
          </div>
          {!compact && (
            <span className="shrink-0 rounded-md bg-emerald-600 text-white px-1.5 py-0.5 font-mono text-[10px] font-bold shadow-2xs">
              v{APP_CONFIG.CURRENT_VERSION_NAME}
            </span>
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
        title="Baixar Aplicativo Android (APK)"
        aria-label="Download do APK Android"
        className={`inline-flex h-8 items-center space-x-1.5 rounded-lg border border-emerald-600/30 bg-emerald-50 hover:bg-emerald-100/90 px-2.5 text-xs font-bold text-emerald-950 transition-all duration-150 active:scale-95 cursor-pointer shadow-2xs ${className}`}
      >
        <Smartphone size={15} className="shrink-0 text-emerald-700" />
        <span className="whitespace-nowrap font-bold text-emerald-950">App Android</span>
        <span className="rounded-md bg-emerald-600 text-white px-1.5 py-0.5 font-mono text-[10px] font-bold shadow-2xs">
          v{APP_CONFIG.CURRENT_VERSION_NAME}
        </span>
        <Download size={13} className="shrink-0 text-emerald-700" />
      </button>
      <ApkDownloadModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
};
