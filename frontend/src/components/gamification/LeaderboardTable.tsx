import React, { useState, useMemo } from 'react';
import type { LeaderboardEntry } from '../../types/gamification';
import {
  Trophy,
  Medal,
  Flame,
  Search,
  Crown,
  Sparkles,
} from 'lucide-react';

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  loading?: boolean;
  period: 'all' | 'monthly' | 'weekly';
  onPeriodChange: (p: 'all' | 'monthly' | 'weekly') => void;
  currentUserId?: number;
}

export const LeaderboardTable: React.FC<LeaderboardTableProps> = ({
  entries,
  loading = false,
  period,
  onPeriodChange,
  currentUserId,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredEntries = useMemo(() => {
    if (!searchTerm.trim()) return entries;
    const term = searchTerm.toLowerCase();
    return entries.filter(
      (e) =>
        e.nome.toLowerCase().includes(term) ||
        e.email.toLowerCase().includes(term) ||
        (e.matricula && e.matricula.toLowerCase().includes(term)) ||
        (e.cargo && e.cargo.toLowerCase().includes(term))
    );
  }, [entries, searchTerm]);

  const topThree = filteredEntries.slice(0, 3);
  const remaining = filteredEntries.slice(3);

  const currentUserEntry = useMemo(
    () => entries.find((e) => e.user_id === currentUserId),
    [entries, currentUserId]
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header controls & Filters */}
      <div className="flex flex-col gap-4 rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">
                Ranking Geral da Equipe
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Produtividade técnica transparente e meritocracia em tempo real
              </p>
            </div>
          </div>
        </div>

        {/* Period Tabs & Search Input */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search box */}
          <div className="relative min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar técnico..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-1.5 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-hidden transition-colors"
            />
          </div>

          {/* Period Selector Tabs */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200/80">
            <button
              type="button"
              onClick={() => onPeriodChange('all')}
              className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                period === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Vitalício
            </button>
            <button
              type="button"
              onClick={() => onPeriodChange('monthly')}
              className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                period === 'monthly'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mês Atual
            </button>
            <button
              type="button"
              onClick={() => onPeriodChange('weekly')}
              className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                period === 'weekly'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Esta Semana
            </button>
          </div>
        </div>
      </div>

      {/* User's position quick highlight pill if logged in */}
      {currentUserEntry && (
        <div className="flex items-center justify-between rounded-2xl border border-blue-200/90 bg-gradient-to-r from-blue-50 via-cyan-50/70 to-white px-5 py-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white font-black text-sm shadow-xs">
              #{currentUserEntry.posicao}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-blue-950">Sua Posição no Ranking</span>
                <span className="rounded-full bg-blue-100 px-2 py-0.2 text-[10px] font-black text-blue-800">
                  Nível {currentUserEntry.nivel_atual}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Você acumula <strong className="text-blue-700">{currentUserEntry.xp_total.toLocaleString()} XP</strong> com{' '}
                <strong className="text-slate-800">{currentUserEntry.atividades_atendidas} atividades concluídas</strong>.
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            {currentUserEntry.current_streak > 0 && (
              <span className="inline-flex items-center gap-1 rounded-xl bg-orange-100 px-3 py-1 text-xs font-black text-orange-800 border border-orange-200">
                <Flame className="h-3.5 w-3.5 fill-orange-500 text-orange-500" />
                {currentUserEntry.current_streak}d streak
              </span>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid h-64 place-items-center rounded-3xl border border-white/70 bg-white/80 p-8 text-center text-slate-500 shadow-sm backdrop-blur-md">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-600 border-t-transparent" />
            <p className="text-sm font-semibold">Atualizando ranking da equipe...</p>
          </div>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="grid h-48 place-items-center rounded-3xl border border-white/70 bg-white/80 p-8 text-center text-sm font-medium text-slate-500 shadow-sm backdrop-blur-md">
          Nenhum técnico encontrado para os critérios selecionados.
        </div>
      ) : (
        <>
          {/* 3D Esports Tournament Podium for Top 3 */}
          {topThree.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
              {/* 2nd Place (Silver) */}
              {topThree[1] && (
                <div
                  className={`group relative order-2 sm:order-1 flex flex-col items-center justify-between rounded-3xl border border-slate-300/80 bg-gradient-to-b from-slate-100/90 via-white to-slate-50/60 p-6 shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                    topThree[1].user_id === currentUserId ? 'ring-3 ring-blue-500 border-blue-400' : ''
                  }`}
                >
                  <div className="absolute -top-3.5 flex items-center gap-1 rounded-full border border-slate-300 bg-gradient-to-r from-slate-500 to-slate-600 px-3.5 py-0.5 text-xs font-black uppercase tracking-wider text-white shadow-sm">
                    <Medal className="h-3.5 w-3.5" /> 2º Lugar
                  </div>

                  <div className="mt-3 flex flex-col items-center text-center">
                    <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full ring-4 ring-slate-300 shadow-md">
                      {topThree[1].foto ? (
                        <img src={topThree[1].foto} alt={topThree[1].nome} className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full w-full place-items-center bg-slate-200 text-slate-700 font-black text-xl">
                          {topThree[1].nome.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <h4 className="mt-3 font-extrabold text-slate-900 text-base">{topThree[1].nome}</h4>
                    <p className="text-xs text-slate-500 truncate max-w-[180px]">{topThree[1].cargo || topThree[1].email}</p>
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-slate-200/80 px-2.5 py-0.5 text-[11px] font-bold text-slate-800">
                      Nível {topThree[1].nivel_atual}
                    </span>
                  </div>

                  <div className="mt-5 grid w-full grid-cols-2 divide-x divide-slate-200 border-t border-slate-200/80 pt-3 text-center">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">XP</span>
                      <p className="text-base font-black text-slate-800">{topThree[1].xp_total.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Atividades</span>
                      <p className="text-base font-black text-slate-800">{topThree[1].atividades_atendidas}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 1st Place (Gold / Champion) */}
              {topThree[0] && (
                <div
                  className={`group relative order-1 sm:order-2 flex flex-col items-center justify-between rounded-3xl border-2 border-amber-300 bg-gradient-to-b from-amber-50/90 via-white to-amber-50/40 p-7 shadow-xl ring-4 ring-amber-200/60 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl ${
                    topThree[0].user_id === currentUserId ? 'ring-blue-500 border-blue-400' : ''
                  }`}
                >
                  <div className="absolute -top-4 flex items-center gap-1.5 rounded-full border border-amber-400 bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-500 px-4 py-1 text-xs font-black uppercase tracking-wider text-white shadow-md">
                    <Crown className="h-4 w-4" /> Campeão da Equipe
                  </div>

                  <div className="mt-3 flex flex-col items-center text-center">
                    <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full ring-4 ring-amber-400 shadow-xl">
                      {topThree[0].foto ? (
                        <img src={topThree[0].foto} alt={topThree[0].nome} className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full w-full place-items-center bg-gradient-to-tr from-amber-300 to-amber-200 text-amber-900 font-black text-2xl">
                          {topThree[0].nome.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <h4 className="mt-3 font-black text-slate-900 text-lg tracking-tight">{topThree[0].nome}</h4>
                    <p className="text-xs text-slate-600 truncate max-w-[200px]">{topThree[0].cargo || topThree[0].email}</p>
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-100 to-yellow-100 px-3 py-0.5 text-xs font-black text-amber-900 border border-amber-300 shadow-2xs">
                      <Sparkles className="h-3 w-3 text-amber-600" />
                      Nível {topThree[0].nivel_atual}
                    </span>
                  </div>

                  <div className="mt-5 grid w-full grid-cols-2 divide-x divide-amber-200 border-t border-amber-200 pt-3 text-center">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">XP Total</span>
                      <p className="text-lg font-black text-amber-600">{topThree[0].xp_total.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Atividades</span>
                      <p className="text-lg font-black text-slate-900">{topThree[0].atividades_atendidas}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 3rd Place (Bronze) */}
              {topThree[2] && (
                <div
                  className={`group relative order-3 flex flex-col items-center justify-between rounded-3xl border border-amber-600/30 bg-gradient-to-b from-amber-50/60 via-white to-slate-50 p-6 shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                    topThree[2].user_id === currentUserId ? 'ring-3 ring-blue-500 border-blue-400' : ''
                  }`}
                >
                  <div className="absolute -top-3.5 flex items-center gap-1 rounded-full border border-amber-700/40 bg-gradient-to-r from-amber-700 to-amber-800 px-3.5 py-0.5 text-xs font-black uppercase tracking-wider text-white shadow-sm">
                    <Medal className="h-3.5 w-3.5" /> 3º Lugar
                  </div>

                  <div className="mt-3 flex flex-col items-center text-center">
                    <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full ring-4 ring-amber-600/50 shadow-md">
                      {topThree[2].foto ? (
                        <img src={topThree[2].foto} alt={topThree[2].nome} className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full w-full place-items-center bg-amber-100 text-amber-900 font-black text-xl">
                          {topThree[2].nome.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <h4 className="mt-3 font-extrabold text-slate-900 text-base">{topThree[2].nome}</h4>
                    <p className="text-xs text-slate-500 truncate max-w-[180px]">{topThree[2].cargo || topThree[2].email}</p>
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100/70 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                      Nível {topThree[2].nivel_atual}
                    </span>
                  </div>

                  <div className="mt-5 grid w-full grid-cols-2 divide-x divide-slate-200 border-t border-slate-200/80 pt-3 text-center">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">XP</span>
                      <p className="text-base font-black text-amber-800">{topThree[2].xp_total.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Atividades</span>
                      <p className="text-base font-black text-slate-800">{topThree[2].atividades_atendidas}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Table for Ranks 4+ */}
          {remaining.length > 0 && (
            <div className="overflow-hidden rounded-3xl border border-white/70 bg-white/90 shadow-md backdrop-blur-md">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="py-3.5 px-4 text-center">Pos.</th>
                      <th className="py-3.5 px-4">Técnico</th>
                      <th className="py-3.5 px-4 text-center">Nível</th>
                      <th className="py-3.5 px-4 text-center">Atividades</th>
                      <th className="py-3.5 px-4 text-center">Streak</th>
                      <th className="py-3.5 px-4 text-right">XP Acumulado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {remaining.map((entry) => {
                      const isMe = entry.user_id === currentUserId;
                      return (
                        <tr
                          key={entry.user_id}
                          className={`transition-colors duration-150 hover:bg-blue-50/50 ${
                            isMe ? 'bg-blue-50/80 font-semibold' : ''
                          }`}
                        >
                          <td className="py-3.5 px-4 text-center font-black text-slate-700">
                            #{entry.posicao}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-slate-200 ring-2 ring-white shadow-2xs">
                                {entry.foto ? (
                                  <img src={entry.foto} alt={entry.nome} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="grid h-full w-full place-items-center font-bold text-slate-700 text-xs">
                                    {entry.nome.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-extrabold text-slate-900 text-sm">{entry.nome}</p>
                                  {isMe && (
                                    <span className="rounded-md bg-blue-600 px-1.5 py-0.2 text-[9px] font-black text-white uppercase tracking-wider">
                                      Você
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500">{entry.cargo || entry.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-black text-blue-700 border border-blue-200">
                              Lvl {entry.nivel_atual}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center font-bold text-slate-800">
                            {entry.atividades_atendidas}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {entry.current_streak > 0 ? (
                              <span className="inline-flex items-center gap-1 font-black text-orange-600 text-xs">
                                <Flame className="h-3.5 w-3.5 fill-orange-500 text-orange-500" />
                                {entry.current_streak}d
                              </span>
                            ) : (
                              <span className="text-slate-300 font-bold">-</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right font-black text-slate-900 text-sm">
                            {entry.xp_total.toLocaleString()} XP
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
