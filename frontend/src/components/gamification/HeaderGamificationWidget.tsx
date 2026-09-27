import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getMyGamificationProfile } from '../../api/gamification';
import { Flame } from 'lucide-react';

export const HeaderGamificationWidget: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['my-gamification-profile'],
    queryFn: getMyGamificationProfile,
    staleTime: 60 * 1000,
    retry: 1,
  });

  if (isLoading || !data) {
    return null;
  }

  const { profile, level_progress } = data;

  return (
    <Link
      to="/gamificacao"
      title={`Gamificação: Nível ${level_progress.current_level} - ${level_progress.title}`}
      className="group hidden sm:flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white/70 px-2.5 py-1.5 shadow-xs backdrop-blur-xs transition-all hover:border-amber-300 hover:bg-white hover:shadow-sm"
    >
      {/* Mini Level Badge */}
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-amber-400 to-amber-500 text-white font-black text-xs shadow-xs ring-2 ring-amber-100 group-hover:scale-105 transition-transform">
        {level_progress.current_level}
      </div>

      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-800 leading-none">
            {level_progress.title}
          </span>
          {profile.current_streak > 0 && (
            <span className="inline-flex items-center text-[10px] font-black text-orange-600">
              <Flame className="h-3 w-3 fill-orange-500 text-orange-500" />
              {profile.current_streak}d
            </span>
          )}
        </div>

        {/* Micro progress bar */}
        <div className="mt-1 flex items-center gap-1.5">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500"
              style={{ width: `${level_progress.progress_pct}%` }}
            />
          </div>
          <span className="text-[9px] font-semibold text-slate-500">
            {level_progress.progress_pct}%
          </span>
        </div>
      </div>
    </Link>
  );
};
