import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { toApiFileUrl } from '../../api/client';
import { getFeatureFlags, type FeatureFlags } from '../../api/features';
import { ApkDownloadButton } from './ApkDownloadButton';
import {
  LayoutDashboard,
  Users,
  QrCode,
  LogOut,
  Briefcase,
  Cpu,
  FileSpreadsheet,
  Wrench,
  ArrowLeftRight,
  MessageSquare,
  ClipboardList,
  Columns3,
  BellRing,
  FileSignature,
  Webhook,
  Database,
  Activity,
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Trophy,
  Layers,
  Settings,
  ShieldAlert,
  Search,
  X,
  ChevronDown,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

interface SidebarProps {
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

interface MenuItemDef {
  name: string;
  path: string;
  icon: LucideIcon;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  roleLimit?: string[];
  allowRHManagement?: boolean;
  feature?: keyof FeatureFlags;
  keywords?: string;
}

interface MenuGroupDef {
  id: string;
  title: string;
  collapsible?: boolean;
  items: MenuItemDef[];
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpenMobile = false, onCloseMobile }) => {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const userRole = user?.role?.toLowerCase() || '';
  const isGamificationAllowed = ['admin', 'gerente_ti', 'gerente_infra', 'tecnico'].includes(userRole);
  const hasRHManagement = !!user?.has_rh_management;

  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('assettrack-sidebar-collapsed');
    return saved ? saved === 'true' : window.matchMedia('(max-width: 1279px)').matches;
  });

  const [filterQuery, setFilterQuery] = useState('');
  const [adminGroupExpanded, setAdminGroupExpanded] = useState(() => {
    const saved = localStorage.getItem('assettrack-sidebar-admin-expanded');
    return saved !== null ? saved === 'true' : true;
  });

  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({
    preventive_maintenance_enabled: true,
    purchases_enabled: true,
    kanban_enabled: true,
    ai_enabled: false,
  });

  useEffect(() => {
    let active = true;
    const refreshFeatures = async () => {
      try {
        const flags = await getFeatureFlags();
        if (active) setFeatureFlags(flags);
      } catch {
        // Fallback default
      }
    };
    void refreshFeatures();
    const interval = window.setInterval(refreshFeatures, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('assettrack-sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem('assettrack-sidebar-admin-expanded', String(adminGroupExpanded));
  }, [adminGroupExpanded]);

  useEffect(() => {
    const desktopBreakpoint = window.matchMedia('(max-width: 1024px)');
    const collapseForSmallScreens = () => {
      if (desktopBreakpoint.matches) setCollapsed(true);
    };
    desktopBreakpoint.addEventListener('change', collapseForSmallScreens);
    return () => desktopBreakpoint.removeEventListener('change', collapseForSmallScreens);
  }, []);

  // Logical groupings according to Enterprise IT Service Management patterns
  const menuGroups: MenuGroupDef[] = useMemo(() => [
    {
      id: 'overview',
      title: 'Visão Geral',
      items: [
        {
          name: 'Dashboard',
          path: '/',
          icon: LayoutDashboard,
          subtitle: 'Métricas e telemetria',
          keywords: 'início home painel kpis resumo',
        },
        {
          name: 'Monitoramento TV',
          path: '/monitoramento',
          icon: Activity,
          subtitle: 'Painel NOC para tela grande',
          roleLimit: ['admin', 'gerente_ti', 'gerente_infra', 'tecnico'],
          keywords: 'monitor tv noc chamados tempo real',
        },
        ...(isGamificationAllowed
          ? [
              {
                name: 'Gamificação & XP',
                path: '/gamificacao',
                icon: Trophy,
                subtitle: 'Ranking, níveis e conquistas',
                badge: 'XP',
                badgeColor: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
                roleLimit: ['admin', 'gerente_ti', 'gerente_infra', 'tecnico'],
                keywords: 'gamificacao conquistas ranking pontos trofeus tecnicos',
              },
            ]
          : []),
      ],
    },
    {
      id: 'operations',
      title: 'Operações & Suporte',
      items: [
        {
          name: 'Central de Suporte',
          path: '/servicos',
          icon: MessageSquare,
          subtitle: 'Service Desk e chamados',
          keywords: 'suporte tickets service desk chamado atendimento',
        },
        {
          name: 'Manutenções (Bancada)',
          path: '/manutencoes',
          icon: Wrench,
          subtitle: 'Oficina e bancada física',
          roleLimit: ['admin', 'gerente_ti', 'gerente_infra', 'tecnico'],
          keywords: 'manutencao bancada reparo oficina conserto',
        },
        {
          name: 'Prev. Programada',
          path: '/manutencao-preventiva',
          icon: ClipboardList,
          subtitle: 'Ordens e rotinas periódicas',
          roleLimit: ['admin', 'gerente_ti', 'gerente_infra', 'tecnico'],
          feature: 'preventive_maintenance_enabled',
          keywords: 'preventiva os planos ordens rotina checklist',
        },
        {
          name: 'Kanban de Tarefas',
          path: '/kanban',
          icon: Columns3,
          subtitle: 'Quadro ágil operacional',
          feature: 'kanban_enabled',
          keywords: 'kanban quadro tarefas projetos cards',
        },
      ],
    },
    {
      id: 'assets',
      title: 'Patrimônio & Compras',
      items: [
        {
          name: 'Ativos & Inventário',
          path: '/assets',
          icon: Cpu,
          subtitle: 'Hardware, software e estoque',
          roleLimit: ['admin', 'gerente_ti', 'gerente_infra', 'tecnico', 'comprador'],
          keywords: 'ativos patrimonio inventario hardware licenca computadores',
        },
        {
          name: 'Empréstimos Rápidos',
          path: '/emprestimos',
          icon: ArrowLeftRight,
          subtitle: 'Cautelas e devoluções',
          keywords: 'emprestimos cautela devolucao retirada termo',
        },
        {
          name: 'Compras & Insumos',
          path: '/compras',
          icon: Briefcase,
          subtitle: 'Pedidos e cotações',
          roleLimit: ['admin', 'gerente_ti', 'gerente_infra', 'comprador'],
          feature: 'purchases_enabled',
          keywords: 'compras cotacao pedidos fornecedores insumos',
        },
      ],
    },
    {
      id: 'personal',
      title: 'Colaborador',
      items: [
        {
          name: 'Tarefas & Notificações',
          path: '/profile?tab=notificacoes',
          icon: BellRing,
          subtitle: 'Fila tática pessoal',
          keywords: 'notificacoes tarefas perfil avisos pendencias',
        },
        {
          name: 'Meu Crachá QR',
          path: '/badge',
          icon: QrCode,
          subtitle: 'Identificação digital',
          keywords: 'cracha qr codigo identificacao digital',
        },
        {
          name: 'Portal RH',
          path: '/rh',
          icon: FileSignature,
          subtitle: 'Férias, folgas e escalas',
          roleLimit: ['admin', 'rh'],
          allowRHManagement: true,
          keywords: 'rh departamento pessoal ferias escala comunicados',
        },
        {
          name: 'Manual do Sistema',
          path: '/manual',
          icon: BookOpen,
          subtitle: 'Guias e documentação',
          keywords: 'manual ajuda documentacao instrucoes tutorial',
        },
      ],
    },
    {
      id: 'admin',
      title: 'Administração',
      collapsible: true,
      items: [
        {
          name: 'Usuários & Acessos',
          path: '/users',
          icon: Users,
          subtitle: 'Perfis e credenciais',
          roleLimit: ['admin', 'gerente_ti', 'gerente_infra'],
          keywords: 'usuarios contas acessos permissoes colaboradores',
        },
        {
          name: 'Setores Organizacionais',
          path: '/setores',
          icon: Layers,
          subtitle: 'Departamentos e locais',
          roleLimit: ['admin', 'gerente_ti', 'gerente_infra'],
          keywords: 'setores departamentos departamentos locais empresas',
        },
        {
          name: 'Alertas do Sistema',
          path: '/alertas',
          icon: ShieldAlert,
          subtitle: 'Avisos e incidentes globais',
          roleLimit: ['admin', 'gerente_ti', 'gerente_infra', 'tecnico'],
          keywords: 'alertas incidentes seguranca avisos globais',
        },
        {
          name: 'Configurações',
          path: '/configuracoes',
          icon: Settings,
          subtitle: 'Preferências do sistema',
          roleLimit: ['admin', 'gerente_ti', 'gerente_infra'],
          keywords: 'configuracoes preferencias sistema parametros',
        },
        {
          name: 'Webhooks & APIs',
          path: '/webhooks',
          icon: Webhook,
          subtitle: 'Eventos e integrações',
          roleLimit: ['admin'],
          keywords: 'webhooks api integracao eventos notificacoes externas',
        },
        {
          name: 'Backup & Restore',
          path: '/backups',
          icon: Database,
          subtitle: 'Segurança e banco de dados',
          roleLimit: ['admin', 'gerente_ti', 'gerente_infra'],
          keywords: 'backup restore restauracao dump banco dados',
        },
        {
          name: 'Logs de E-mail',
          path: '/logs-email',
          icon: FileSpreadsheet,
          subtitle: 'Auditoria de envios SMTP',
          roleLimit: ['admin'],
          keywords: 'logs email smtp auditoria mensagens',
        },
      ],
    },
  ], [isGamificationAllowed]);

  // Filter groups and items based on roles, feature flags and search query
  const visibleGroups = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();

    return menuGroups
      .map((group) => {
        const allowedItems = group.items.filter((item) => {
          // Feature flag check
          if (item.feature && !featureFlags[item.feature]) return false;
          // Role limit check
          if (
            item.roleLimit &&
            !item.roleLimit.includes(userRole) &&
            !(item.allowRHManagement && hasRHManagement)
          ) {
            return false;
          }
          // Search query check
          if (q) {
            const matchesName = item.name.toLowerCase().includes(q);
            const matchesSub = item.subtitle?.toLowerCase().includes(q) || false;
            const matchesKw = item.keywords?.toLowerCase().includes(q) || false;
            return matchesName || matchesSub || matchesKw;
          }
          return true;
        });

        return {
          ...group,
          items: allowedItems,
        };
      })
      .filter((group) => group.items.length > 0);
  }, [menuGroups, filterQuery, featureFlags, userRole, hasRHManagement]);

  // Total visible item count
  const totalItemsCount = useMemo(() => {
    return visibleGroups.reduce((acc, g) => acc + g.items.length, 0);
  }, [visibleGroups]);

  const renderNavContent = (isMobileView: boolean) => {
    const isCollapsed = !isMobileView && collapsed;

    return (
      <div className="flex flex-col h-full justify-between overflow-hidden bg-white/90 backdrop-blur-xl">
        {/* Top Header & Branding */}
        <div className="flex flex-col flex-1 min-h-0">
          <div
            className={`h-16 shrink-0 flex items-center border-b border-brand-border/60 transition-all ${
              isCollapsed ? 'justify-center px-1' : 'justify-between px-4'
            }`}
          >
            {isMobileView || !collapsed ? (
              <div className="flex items-center gap-2.5 overflow-hidden">
                <img
                  src="/logo-assettrack-claro.svg"
                  alt="AssetTrack TI"
                  className="h-9 w-auto max-w-[155px] object-contain object-left"
                />
              </div>
            ) : (
              <img
                src="/logo-assettrack-claro.svg"
                alt="AssetTrack TI"
                className="h-8 w-8 object-cover object-left rounded-lg"
              />
            )}

            {isMobileView ? (
              <button
                type="button"
                onClick={onCloseMobile}
                className="grid h-8 w-8 place-items-center rounded-lg text-brand-muted hover:bg-brand-dark/5 hover:text-brand-text cursor-pointer shrink-0 transition"
                title="Fechar menu"
                aria-label="Fechar menu"
              >
                <PanelLeftClose size={18} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCollapsed((current) => !current)}
                className="grid h-8 w-8 place-items-center rounded-lg text-brand-muted hover:bg-brand-primary/10 hover:text-brand-primary cursor-pointer shrink-0 border border-brand-border/60 bg-white/80 shadow-xs transition-all hover:scale-105"
                title={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
                aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
              >
                {collapsed ? (
                  <PanelLeftOpen size={18} className="text-brand-primary" />
                ) : (
                  <PanelLeftClose size={17} />
                )}
              </button>
            )}
          </div>

          {/* User Profile Tactical Card */}
          <NavLink
            to="/profile"
            onClick={() => isMobileView && onCloseMobile?.()}
            title={isCollapsed ? `${user?.nome} (${user?.role})` : undefined}
            className={`group shrink-0 border-b border-brand-border/60 bg-gradient-to-r from-blue-50/50 via-white/40 to-transparent hover:from-blue-50/90 hover:to-blue-50/40 transition-all cursor-pointer block ${
              isCollapsed ? 'p-2.5' : 'p-3.5'
            }`}
          >
            <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-xl border-2 border-white shadow-sm flex items-center justify-center font-bold text-white text-xs bg-gradient-to-br from-[#0c66e4] to-[#0284c7] overflow-hidden">
                  {user?.avatar_url ? (
                    <img
                      src={toApiFileUrl(user.avatar_url)}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    user?.nome?.substring(0, 2).toUpperCase() || 'TI'
                  )}
                </div>
                {/* Active user status dot */}
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-white" />
              </div>

              {!isCollapsed && (
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex items-center justify-between gap-1">
                    <h4 className="text-xs font-bold truncate text-brand-text group-hover:text-brand-primary transition">
                      {user?.nome || 'Usuário'}
                    </h4>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-700 bg-blue-100/70 border border-blue-200 px-1.5 py-0.2 rounded-md truncate">
                      {userRole.replace('_', ' ') || 'COLABORADOR'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </NavLink>

          {/* Search Filter input (Expanded mode only) */}
          {!isCollapsed && (
            <div className="px-3 pt-2.5 pb-1 shrink-0">
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none"
                />
                <input
                  type="text"
                  placeholder="Filtrar módulos..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="w-full h-8 pl-8 pr-7 text-xs rounded-lg border border-brand-border/80 bg-white/70 text-brand-text placeholder:text-brand-muted/70 focus:outline-none focus:border-brand-primary focus:bg-white transition-all shadow-xs"
                />
                {filterQuery && (
                  <button
                    type="button"
                    onClick={() => setFilterQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-text cursor-pointer p-0.5"
                    title="Limpar filtro"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Navigation Items (Grouped with Dividers & Quick Tooltips) */}
          <nav
            className={`p-2.5 space-y-4 flex-1 overflow-y-auto overscroll-contain ${
              isCollapsed ? 'px-1.5' : ''
            }`}
          >
            {visibleGroups.length === 0 ? (
              <div className="p-4 text-center text-xs text-brand-muted">
                <p>Nenhum módulo encontrado com &ldquo;{filterQuery}&rdquo;.</p>
                <button
                  type="button"
                  onClick={() => setFilterQuery('')}
                  className="mt-2 text-brand-primary font-semibold hover:underline cursor-pointer"
                >
                  Limpar busca
                </button>
              </div>
            ) : (
              visibleGroups.map((group) => {
                const isAdminGroup = group.id === 'admin';
                const isGroupCollapsed = isAdminGroup && !adminGroupExpanded && !filterQuery;

                return (
                  <div key={group.id} className="space-y-1">
                    {/* Section Header */}
                    {!isCollapsed ? (
                      <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-mono font-bold tracking-wider text-brand-muted/80 uppercase select-none">
                        <span className="flex items-center gap-1.5">
                          {group.title}
                        </span>
                        {group.collapsible && !filterQuery && (
                          <button
                            type="button"
                            onClick={() => setAdminGroupExpanded((prev) => !prev)}
                            className="p-0.5 text-brand-muted hover:text-brand-text cursor-pointer rounded transition"
                            title={adminGroupExpanded ? 'Recolher seção' : 'Expandir seção'}
                          >
                            <ChevronDown
                              size={13}
                              className={`transition-transform duration-200 ${
                                adminGroupExpanded ? '' : '-rotate-90'
                              }`}
                            />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="my-1.5 border-t border-brand-border/40 mx-2" />
                    )}

                    {/* Group Items */}
                    {!isGroupCollapsed && (
                      <div className="space-y-0.5">
                        {group.items.map((item) => {
                          const Icon = item.icon;
                          const isPathActive =
                            item.path === '/'
                              ? location.pathname === '/'
                              : item.path.includes('?')
                              ? `${location.pathname}${location.search}`.startsWith(item.path)
                              : location.pathname.startsWith(item.path);

                          return (
                            <div key={item.name} className="relative group">
                              <NavLink
                                to={item.path}
                                onClick={() => isMobileView && onCloseMobile?.()}
                                className={({ isActive }) => {
                                  const active = isPathActive || isActive;
                                  return `relative flex items-center ${
                                    isCollapsed
                                      ? 'justify-center h-10 w-10 mx-auto px-0 rounded-xl'
                                      : 'gap-2.5 px-3 py-2 rounded-xl'
                                  } text-xs font-semibold transition-all duration-150 active:scale-[0.98] cursor-pointer ${
                                    active
                                      ? 'bg-[#0c66e4] text-white shadow-sm shadow-[#0c66e4]/25'
                                      : 'text-[#42526e] hover:text-[#0c66e4] hover:bg-blue-50/80'
                                  }`;
                                }}
                              >
                                {({ isActive }) => {
                                  const active = isPathActive || isActive;

                                  return (
                                    <>
                                      <Icon
                                        size={isCollapsed ? 18 : 17}
                                        className={`shrink-0 transition-transform duration-150 ${
                                          active
                                            ? 'text-white scale-105'
                                            : 'text-[#5e6c84] group-hover:text-[#0c66e4] group-hover:scale-105'
                                        }`}
                                      />

                                      {!isCollapsed && (
                                        <div className="flex-1 flex items-center justify-between min-w-0">
                                          <span className="truncate tracking-tight">{item.name}</span>
                                          {item.badge && (
                                            <span
                                              className={`ml-1.5 text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border uppercase tracking-wider shrink-0 ${
                                                active
                                                  ? 'bg-white/20 border-white/30 text-white'
                                                  : item.badgeColor || 'bg-blue-100 text-blue-700 border-blue-200'
                                              }`}
                                            >
                                              {item.badge}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </>
                                  );
                                }}
                              </NavLink>

                              {/* Hover Floating Tooltip in Collapsed Mode */}
                              {isCollapsed && (
                                <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 hidden group-hover:flex flex-col z-50 min-w-[130px] max-w-[200px] px-2.5 py-1.5 rounded-lg bg-[#0f172a] text-white text-xs shadow-xl border border-slate-700/60 animate-in fade-in-0 zoom-in-95">
                                  <div className="flex items-center justify-between gap-1.5">
                                    <span className="font-bold text-slate-100 whitespace-nowrap">
                                      {item.name}
                                    </span>
                                    {item.badge && (
                                      <span className="text-[9px] font-mono font-bold bg-blue-500/30 text-blue-300 border border-blue-400/30 px-1 rounded">
                                        {item.badge}
                                      </span>
                                    )}
                                  </div>
                                  {item.subtitle && (
                                    <span className="text-[10px] text-slate-400 font-normal leading-tight mt-0.5">
                                      {item.subtitle}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </nav>
        </div>

        {/* Bottom Section: APK, Version & Logout */}
        <div className="shrink-0 border-t border-brand-border/60 bg-white/60 p-2.5 space-y-2">
          {/* Android APK Download button */}
          <div>
            <ApkDownloadButton variant="sidebar" compact={isCollapsed} />
          </div>

          {/* Logout Action */}
          <button
            type="button"
            onClick={logout}
            title={isCollapsed ? 'Encerrar sessão no sistema' : undefined}
            className={`w-full flex items-center rounded-xl border border-red-500/20 text-red-600 hover:bg-red-50 text-xs font-semibold transition-all duration-150 active:scale-98 cursor-pointer ${
              isCollapsed ? 'justify-center h-9 px-0' : 'gap-2 px-3 py-2'
            }`}
          >
            <LogOut size={16} className="shrink-0 text-red-500" />
            {!isCollapsed && <span>Encerrar Sessão</span>}
          </button>

          {/* Micro Footer Indicator */}
          {!isCollapsed && (
            <div className="pt-1 flex items-center justify-between px-1 text-[10px] font-mono text-brand-muted/70">
              <span className="inline-flex items-center gap-1">
                <Sparkles size={10} className="text-amber-500" />
                AssetTrack TI
              </span>
              <span>{totalItemsCount} módulos</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isOpenMobile && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/45 backdrop-blur-sm transition-opacity animate-fade-in"
          onClick={onCloseMobile}
        />
      )}

      {/* Mobile Off-Canvas Drawer */}
      <aside
        className={`md:hidden fixed top-0 bottom-0 left-0 z-50 w-72 max-w-[85vw] h-full max-h-[100dvh] bg-[#edf5fa] border-r border-white/60 shadow-2xl flex flex-col justify-between select-none text-[#172b4d] transform transition-transform duration-250 ease-out ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px), 4px)',
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
        }}
      >
        {renderNavContent(true)}
      </aside>

      {/* Desktop & Tablet Persistent Sidebar */}
      <aside
        className={`app-sidebar hidden md:flex shrink-0 bg-[#edf5fa]/90 border-r border-brand-border/60 h-full max-h-[100dvh] flex-col justify-between select-none backdrop-blur-md text-[#172b4d] transition-[width] duration-200 ease-out ${
          collapsed ? 'w-[68px]' : 'w-64'
        }`}
      >
        {renderNavContent(false)}
      </aside>
    </>
  );
};
