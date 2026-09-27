import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Sparkles, X, ChevronRight, CheckCircle2, ShieldCheck, Trophy } from 'lucide-react';

interface LevelUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  newLevel: number;
  title: string;
}

export const LevelUpModal: React.FC<LevelUpModalProps> = ({
  isOpen,
  onClose,
  newLevel,
  title,
}) => {
  useEffect(() => {
    if (isOpen) {
      // Disparo comemorativo de confetes com paleta vibrante
      const end = Date.now() + 2.5 * 1000;
      const colors = ['#f59e0b', '#0c66e4', '#10b981', '#06b6d4', '#ea580c'];

      (function frame() {
        confetti({
          particleCount: 4,
          angle: 60,
          spread: 65,
          origin: { x: 0 },
          colors,
        });
        confetti({
          particleCount: 4,
          angle: 120,
          spread: 65,
          origin: { x: 1 },
          colors,
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      })();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/90 bg-gradient-to-b from-white via-white to-blue-50/50 p-6 sm:p-8 text-center shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Ambient Top Glow */}
        <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-44 w-44 rounded-full bg-amber-400/25 blur-3xl" />

        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          title="Fechar"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Level Emblem with 3D Depth */}
        <div className="relative mx-auto flex h-28 w-28 items-center justify-center rounded-3xl bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-600 text-white shadow-xl ring-8 ring-amber-100/90">
          <Trophy className="absolute top-2 right-2 h-5 w-5 opacity-70" />
          <div className="flex flex-col items-center -space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-950/80">NÍVEL</span>
            <span className="text-4xl font-black tracking-tight">{newLevel}</span>
          </div>
        </div>

        <div className="mt-6">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100/80 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-amber-900 shadow-2xs">
            <Sparkles className="h-3.5 w-3.5 text-amber-600 animate-spin" style={{ animationDuration: '3s' }} />
            NOVA CONQUISTA ALCANÇADA!
          </div>

          <h3 className="mt-3 text-2xl font-black text-slate-900 tracking-tight">{title}</h3>
          <p className="mt-2 text-xs text-slate-600 leading-relaxed font-medium">
            Seu empenho técnico contínuo gerou impacto real na operação de TI. Você desbloqueou novos reconhecimentos no sistema.
          </p>
        </div>

        {/* Unlocked Perks list */}
        <div className="mt-5 rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 text-left text-xs font-medium text-slate-700 space-y-2.5">
          <div className="flex items-center gap-2 text-slate-900 font-bold">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>Novo Título Oficial de Especialista atribuído</span>
          </div>
          <div className="flex items-center gap-2 text-slate-900 font-bold">
            <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0" />
            <span>Destaque prioritário no quadro de produtividade</span>
          </div>
          <div className="flex items-center gap-2 text-slate-900 font-bold">
            <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
            <span>Badge de Nível atualizado no cabeçalho do ERP</span>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-600 py-3 text-sm font-black text-white shadow-md shadow-blue-500/25 transition-all hover:opacity-95 active:scale-98"
          >
            Continuar Atendendo
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
