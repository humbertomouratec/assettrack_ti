import React from 'react';
import type { GamificationBadge, UserBadge } from '../../types/gamification';
import {
  Rocket,
  Zap,
  CheckCircle2,
  Star,
  ShieldCheck,
  Flame,
  Kanban,
  Award,
  Lock,
  Wrench,
  Check,
  Sparkles,
} from 'lucide-react';

interface BadgeCardProps {
  badge: GamificationBadge;
  userBadge?: UserBadge;
}

const getBadgeIcon = (iconName: string, isUnlocked: boolean) => {
  const iconProps = {
    className: `h-6 w-6 transition-transform duration-300 group-hover:scale-110 ${
      isUnlocked ? 'text-amber-500' : 'text-slate-400'
    }`,
  };

  switch (iconName.toLowerCase()) {
    case 'rocket':
      return <Rocket {...iconProps} />;
    case 'zap':
      return <Zap {...iconProps} />;
    case 'checkcircle2':
      return <CheckCircle2 {...iconProps} />;
    case 'star':
      return <Star {...iconProps} />;
    case 'shieldcheck':
      return <ShieldCheck {...iconProps} />;
    case 'flame':
    case 'flamekindling':
      return <Flame {...iconProps} />;
    case 'kanban':
      return <Kanban {...iconProps} />;
    case 'wrench':
      return <Wrench {...iconProps} />;
    default:
      return <Award {...iconProps} />;
  }
};

export const BadgeCard: React.FC<BadgeCardProps> = ({ badge, userBadge }) => {
  const isUnlocked = Boolean(userBadge);

  return (
    <div
      className={`group relative flex flex-col justify-between overflow-hidden rounded-3xl border p-5 transition-all duration-200 cursor-pointer ${
        isUnlocked
          ? 'border-amber-300/80 bg-gradient-to-b from-white via-white to-amber-50/50 shadow-sm hover:border-amber-400 hover:shadow-lg hover:-translate-y-1'
          : 'border-slate-200/80 bg-slate-50/50 opacity-70 hover:opacity-90 hover:border-slate-300 hover:shadow-xs'
      }`}
    >
      {/* Decorative ambient light for unlocked achievements */}
      {isUnlocked && (
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-400/15 blur-2xl" />
      )}

      <div>
        {/* Top: Icon + Bonus Pill */}
        <div className="flex items-start justify-between gap-2">
          <div
            className={`relative flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm transition-transform duration-300 ${
              isUnlocked
                ? 'bg-gradient-to-tr from-amber-100 via-amber-50 to-white ring-2 ring-amber-300/70 shadow-amber-500/15'
                : 'bg-slate-200/90 ring-1 ring-slate-300 text-slate-400'
            }`}
          >
            {isUnlocked ? (
              getBadgeIcon(badge.icone, true)
            ) : (
              <Lock className="h-5 w-5 text-slate-400" />
            )}

            {isUnlocked && (
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xs ring-2 ring-white">
                <Check className="h-3 w-3 stroke-[3]" />
              </span>
            )}
          </div>

          <div className="flex flex-col items-end gap-1">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                isUnlocked
                  ? 'bg-amber-100 text-amber-900 border border-amber-300/60 shadow-2xs'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              +{badge.xp_bonus} XP
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {badge.categoria}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="mt-4">
          <h4 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
            {badge.nome}
            {isUnlocked && <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
          </h4>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed font-medium">
            {badge.descricao}
          </p>
        </div>
      </div>

      {/* Footer status */}
      <div className="mt-4 border-t border-slate-200/60 pt-2.5 text-[11px]">
        {isUnlocked ? (
          <div className="flex items-center justify-between text-emerald-700 font-bold">
            <span>Conquistado</span>
            <span className="text-slate-400 font-medium">
              {userBadge?.data_conquista
                ? new Date(userBadge.data_conquista).toLocaleDateString('pt-BR')
                : 'Recente'}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between text-slate-400 font-medium">
            <span>Bloqueado</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Objetivo Ativo
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
