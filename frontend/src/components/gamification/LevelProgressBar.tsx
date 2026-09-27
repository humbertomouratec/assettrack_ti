import React from 'react';
import type { LevelProgress } from '../../types/gamification';
import { Award, Flame, Sparkles, ChevronRight, Shield, Star, Crown, Zap } from 'lucide-react';

interface LevelProgressBarProps {
  progress: LevelProgress;
  streak?: number;
  className?: string;
}

// Retorna o estilo temático e insígnia conforme o escalão do nível
const getTierTheme = (level: number) => {
  if (level >= 50) {
    return {
      gradient: 'from-amber-400 via-amber-300 to-yellow-500',
      textGradient: 'from-amber-600 to-yellow-700',
      badgeBg: 'bg-amber-500/15 text-amber-900 border-amber-300/80',
      ringColor: 'ring-amber-300/60 shadow-amber-500/30',
      Icon: Crown,
      tierName: 'Lendário',
    };
  }
  if (level >= 35) {
    return {
      gradient: 'from-cyan-500 via-blue-500 to-indigo-600',
      textGradient: 'from-cyan-600 to-blue-700',
      badgeBg: 'bg-cyan-50 text-cyan-900 border-cyan-300',
      ringColor: 'ring-cyan-300/60 shadow-cyan-500/25',
      Icon: Star,
      tierName: 'Diamante',
    };
  }
  if (level >= 20) {
    return {
      gradient: 'from-emerald-500 via-teal-500 to-cyan-600',
      textGradient: 'from-emerald-600 to-teal-700',
      badgeBg: 'bg-emerald-50 text-emerald-900 border-emerald-300',
      ringColor: 'ring-emerald-300/60 shadow-emerald-500/25',
      Icon: Shield,
      tierName: 'Mestre',
    };
  }
  if (level >= 10) {
    return {
      gradient: 'from-blue-600 via-blue-500 to-cyan-500',
      textGradient: 'from-blue-600 to-cyan-700',
      badgeBg: 'bg-blue-50 text-blue-900 border-blue-300',
      ringColor: 'ring-blue-300/60 shadow-blue-500/25',
      Icon: Zap,
      tierName: 'Especialista',
    };
  }
  if (level >= 5) {
    return {
      gradient: 'from-slate-600 via-slate-700 to-zinc-800',
      textGradient: 'from-slate-700 to-slate-900',
      badgeBg: 'bg-slate-100 text-slate-800 border-slate-300',
      ringColor: 'ring-slate-300/60 shadow-slate-500/20',
      Icon: Award,
      tierName: 'Técnico',
    };
  }
  return {
    gradient: 'from-amber-700 via-amber-800 to-amber-900',
    textGradient: 'from-amber-800 to-amber-950',
    badgeBg: 'bg-amber-50 text-amber-900 border-amber-300',
    ringColor: 'ring-amber-200 shadow-amber-900/10',
    Icon: Sparkles,
    tierName: 'Iniciante',
  };
};

export const LevelProgressBar: React.FC<LevelProgressBarProps> = ({
  progress,
  streak = 0,
  className = '',
}) => {
  const tier = getTierTheme(progress.current_level);
  const TierIcon = tier.Icon;
  const streakBonusPct = streak > 1 ? Math.min((streak - 1) * 5, 25) : 0;

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-white/70 bg-gradient-to-br from-white/95 via-white/90 to-blue-50/40 p-5 sm:p-6 shadow-md backdrop-blur-xl transition-all duration-300 hover:shadow-lg ${className}`}
    >
      {/* Decorative ambient radial glow */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-400/10 blur-2xl" />
      <div className="pointer-events-none absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-amber-400/10 blur-2xl" />

      <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        {/* Level badge and Title */}
        <div className="flex items-center gap-4">
          {/* Dynamic 3D-effect Tier Emblem */}
          <div
            className={`relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${tier.gradient} text-white shadow-lg ring-4 ${tier.ringColor} transition-transform duration-300 hover:scale-105`}
          >
            <TierIcon className="absolute top-1.5 right-1.5 h-3.5 w-3.5 opacity-60" />
            <div className="flex flex-col items-center justify-center -space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-80">NÍVEL</span>
              <span className="text-2xl font-black tracking-tight">{progress.current_level}</span>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                {progress.title}
              </h3>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold shadow-2xs ${tier.badgeBg}`}
              >
                <TierIcon className="h-3 w-3" />
                Rank {tier.tierName}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600 font-medium">
              <strong className="text-blue-700 font-bold">{progress.xp_in_level.toLocaleString()} XP</strong> de{' '}
              {progress.xp_needed.toLocaleString()} XP para avançar ao <span className="font-bold text-slate-800">Nível {progress.current_level + 1}</span>
            </p>
          </div>
        </div>

        {/* Actionable status pills */}
        <div className="flex flex-wrap items-center gap-2.5">
          {streak > 0 && (
            <div className="group relative flex items-center gap-2 rounded-2xl border border-orange-200/90 bg-gradient-to-r from-orange-50 to-amber-50/80 px-3.5 py-2 text-orange-900 shadow-2xs transition-all hover:border-orange-300">
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-orange-500 text-white shadow-xs">
                <Flame className="h-4 w-4 fill-white" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-orange-800">Streak</span>
                  {streakBonusPct > 0 && (
                    <span className="rounded-md bg-orange-600/15 px-1 py-0.2 text-[9px] font-extrabold text-orange-700">
                      +{streakBonusPct}% XP
                    </span>
                  )}
                </div>
                <span className="text-xs font-black text-slate-900">
                  {streak} {streak === 1 ? 'dia ativo' : 'dias consecutivos'}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-2xl border border-blue-200/90 bg-gradient-to-r from-blue-50 to-cyan-50/80 px-3.5 py-2 text-blue-950 shadow-2xs">
            <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
              <Award className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-800">Total Vitalício</span>
              <span className="text-xs font-black text-slate-900">
                {progress.total_xp.toLocaleString()} XP
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Track with Milestones & Glow */}
      <div className="mt-5">
        <div className="relative h-3.5 w-full overflow-hidden rounded-full bg-slate-200/90 shadow-inner p-0.5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-400 shadow-xs transition-all duration-700 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progress.progress_pct))}%` }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-xs font-semibold text-slate-600">
          <div className="flex items-center gap-1 text-blue-700 font-bold">
            <span>{progress.progress_pct}%</span>
            <span className="text-[11px] font-normal text-slate-500">do nível completado</span>
          </div>

          <div className="flex items-center gap-1 text-slate-700">
            <span className="font-bold text-slate-900">{(progress.xp_needed - progress.xp_in_level).toLocaleString()} XP</span>
            <span className="text-[11px] text-slate-500">restantes</span>
            <ChevronRight className="h-3 w-3 text-slate-400" />
          </div>
        </div>
      </div>
    </div>
  );
};
