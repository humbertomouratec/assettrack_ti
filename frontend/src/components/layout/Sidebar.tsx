import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
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
  PanelLeftOpen
} from 'lucide-react';

interface SidebarProps {
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpenMobile = false, onCloseMobile }) => {
  const { user, logout } = useAuthStore();
  const userRole = user?.role?.toLowerCase() || '';
  const hasRHManagement = !!user?.has_rh_management;
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('assettrack-sidebar-collapsed');
    return saved ? saved === 'true' : window.matchMedia('(max-width: 1279px)').matches;
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
        // Keep the backwards-compatible defaults when the feature endpoint is unavailable.
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
    const desktopBreakpoint = window.matchMedia('(max-width: 1024px)');
    const collapseForSmallScreens = () => {
      if (desktopBreakpoint.matches) setCollapsed(true);
    };
    desktopBreakpoint.addEventListener('change', collapseForSmallScreens);
    return () => desktopBreakpoint.removeEventListener('change', collapseForSmallScreens);
  }, []);

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Manual do Sistema', path: '/manual', icon: BookOpen },
    { name: 'Monitoramento TV', path: '/monitoramento', icon: Activity, roleLimit: ['admin', 'gerente_ti', 'gerente_infra', 'tecnico'] },
    { name: 'Ativos & Inventário', path: '/assets', icon: Cpu, roleLimit: ['admin', 'gerente_ti', 'gerente_infra', 'tecnico', 'comprador'] },
    { name: 'Central de Suporte', path: '/servicos', icon: MessageSquare },
    { name: 'Manutenções', path: '/manutencoes', icon: Wrench, roleLimit: ['admin', 'gerente_ti', 'gerente_infra', 'tecnico'] },
    { name: 'Prev. Programada', path: '/manutencao-preventiva', icon: ClipboardList, roleLimit: ['admin', 'gerente_ti', 'gerente_infra', 'tecnico'], feature: 'preventive_maintenance_enabled' as const },
    { name: 'Kanban', path: '/kanban', icon: Columns3, feature: 'kanban_enabled' as const },
    { name: 'Alertas', path: '/alertas', icon: BellRing, roleLimit: ['admin', 'gerente_ti', 'gerente_infra', 'tecnico'] },
    { name: 'Empréstimos', path: '/emprestimos', icon: ArrowLeftRight },
    { name: 'Compras', path: '/compras', icon: Briefcase, roleLimit: ['admin', 'gerente_ti', 'gerente_infra', 'comprador'], feature: 'purchases_enabled' as const },
    { name: 'Portal RH', path: '/rh', icon: FileSignature, roleLimit: ['admin', 'rh'], allowRHManagement: true },
    { name: 'Usuários', path: '/users', icon: Users, roleLimit: ['admin', 'gerente_ti', 'gerente_infra'] },
    { name: 'Webhooks', path: '/webhooks', icon: Webhook, roleLimit: ['admin'] },
    { name: 'Backup & Restore', path: '/backups', icon: Database, roleLimit: ['admin', 'gerente_ti', 'gerente_infra'] },
    { name: 'Meu Crachá QR', path: '/badge', icon: QrCode },
  ];

  const adminModules = [
    { name: 'Setores', path: '/setores', icon: ClipboardList, roleLimit: ['admin', 'gerente_ti', 'gerente_infra'] },
    { name: 'Configurações', path: '/configuracoes', icon: Wrench, roleLimit: ['admin', 'gerente_ti', 'gerente_infra'] },
    { name: 'Logs de E-mail', path: '/logs-email', icon: FileSpreadsheet, roleLimit: ['admin'] },
  ];

  const visibleAdminModules = adminModules.filter(
    item => !item.roleLimit || item.roleLimit.includes(userRole) || (item as any).allowRHManagement && hasRHManagement
  );

  const renderNavContent = (isMobileView: boolean) => (
    <div className="flex flex-col h-full justify-between overflow-hidden">
      <div className="flex flex-col flex-1 min-h-0">
        {/* Header */}
        <div className={`h-14 shrink-0 flex items-center border-b border-brand-border ${!isMobileView && collapsed ? 'justify-center px-1' : 'justify-between px-5'}`}>
          {(isMobileView || !collapsed) ? (
            <img
              src="/logo-assettrack-claro.svg"
              alt="AssetTrack TI"
              className="h-[50px] w-[159px] max-w-none object-contain object-left"
            />
          ) : (
            <img
              src="/logo-assettrack-claro.svg"
              alt="AssetTrack TI"
              className="h-8 w-10 object-cover object-left"
            />
          )}
          {isMobileView ? (
            <button
              type="button"
              onClick={onCloseMobile}
              className="grid h-8 w-8 place-items-center rounded-lg text-brand-muted hover:bg-white hover:text-brand-primary cursor-pointer shrink-0"
              title="Fechar menu"
              aria-label="Fechar menu"
            >
              <PanelLeftClose size={18} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCollapsed((current) => !current)}
              className="grid h-9 w-9 place-items-center rounded-lg text-brand-muted hover:bg-white hover:text-brand-primary cursor-pointer shrink-0 bg-white/50 border border-brand-border/40 shadow-xs transition-all hover:scale-105"
              title={collapsed ? 'Expandir menu' : 'Recolher menu'}
              aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              {collapsed ? <PanelLeftOpen size={20} className="text-brand-primary" /> : <PanelLeftClose size={18} />}
            </button>
          )}
        </div>

        {/* User Info Card */}
        <NavLink
          to="/profile"
          onClick={() => isMobileView && onCloseMobile?.()}
          title={!isMobileView && collapsed ? user?.nome : undefined}
          className={`shrink-0 border-b border-brand-border bg-white/35 hover:bg-white/70 transition-colors block cursor-pointer ${!isMobileView && collapsed ? 'p-3' : 'p-4'}`}
        >
          <div className={`flex items-center ${!isMobileView && collapsed ? 'justify-center' : 'space-x-3'}`}>
            <div className="w-10 h-10 rounded-full border-2 border-white flex items-center justify-center font-semibold text-white text-sm bg-brand-primary overflow-hidden shadow-sm flex-shrink-0">
              {user?.avatar_url ? (
                <img src={toApiFileUrl(user.avatar_url)} alt="Avatar" className="w-full h-full rounded-[20px] object-cover" />
              ) : (
                user?.nome.substring(0, 2).toUpperCase()
              )}
            </div>
            {(isMobileView || !collapsed) && (
              <div className="overflow-hidden">
                <h4 className="text-sm font-semibold truncate text-brand-text group-hover:text-brand-primary">{user?.nome}</h4>
                <span className="text-[10px] text-brand-primary uppercase bg-brand-primary/10 px-2 py-0.5 rounded-full mt-1 inline-block">
                  {user?.role.replace('_', ' ')}
                </span>
              </div>
            )}
          </div>
        </NavLink>

        {/* Navigation */}
        <nav className={`p-3 space-y-1 flex-1 overflow-y-auto ${!isMobileView && collapsed ? 'px-2' : ''}`}>
          {menuItems.map((item) => {
            if (item.feature && !featureFlags[item.feature]) return null;
            if (item.roleLimit && !item.roleLimit.includes(userRole) && !((item as any).allowRHManagement && hasRHManagement)) {
              return null;
            }
            return (
              <NavLink
                key={item.name}
                to={item.path}
                onClick={() => isMobileView && onCloseMobile?.()}
                title={!isMobileView && collapsed ? item.name : undefined}
                className={({ isActive }) =>
                  `flex items-center ${!isMobileView && collapsed ? 'justify-center px-2' : 'space-x-3 px-3'} py-2.5 rounded-xl border border-transparent text-sm transition-all duration-150 active:scale-[0.98] ${
                    isActive
                      ? 'bg-[#dbeafe] text-[#0055cc] font-semibold shadow-sm'
                      : 'text-brand-muted hover:text-brand-text hover:bg-white/65'
                  }`
                }
              >
                <item.icon size={18} className="flex-shrink-0" />
                {(isMobileView || !collapsed) && <span>{item.name}</span>}
              </NavLink>
            );
          })}

          {visibleAdminModules.length > 0 && (
            <>
              {(isMobileView || !collapsed) && (
                <div className="pt-4 pb-2 px-3 text-[10px] font-semibold text-brand-muted/80 tracking-widest uppercase">
                  Administração
                </div>
              )}

              {visibleAdminModules.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.path}
                  onClick={() => isMobileView && onCloseMobile?.()}
                  title={!isMobileView && collapsed ? item.name : undefined}
                  className={({ isActive }) =>
                    `flex items-center ${!isMobileView && collapsed ? 'justify-center px-2' : 'space-x-3 px-3'} py-2.5 rounded-xl text-sm transition-all duration-150 active:scale-[0.98] ${
                      isActive
                        ? 'bg-[#dbeafe] text-[#0055cc] font-semibold shadow-sm'
                        : 'text-brand-muted/80 hover:bg-white/65 hover:text-brand-text'
                    }`
                  }
                >
                  <item.icon size={18} className="flex-shrink-0" />
                  {(isMobileView || !collapsed) && <span>{item.name}</span>}
                </NavLink>
              ))}
            </>
          )}
        </nav>
      </div>

      {/* Android app download */}
      <div className={`p-3 shrink-0 border-t border-brand-border ${!isMobileView && collapsed ? 'px-2' : ''}`}>
        <ApkDownloadButton variant="sidebar" compact={!isMobileView && collapsed} />
      </div>

      {/* Logout */}
      <div className={`p-3 shrink-0 border-t border-brand-border ${!isMobileView && collapsed ? 'px-2' : ''}`}>
        <button
          onClick={logout}
          title={!isMobileView && collapsed ? 'Encerrar sessão' : undefined}
          className={`w-full flex items-center py-2.5 rounded-xl border border-red-500/20 text-red-500 hover:bg-red-500/10 text-sm transition-all duration-150 active:scale-95 cursor-pointer ${
            !isMobileView && collapsed ? 'justify-center px-2' : 'space-x-3 px-3'
          }`}
        >
          <LogOut size={18} className="flex-shrink-0" />
          {(isMobileView || !collapsed) && <span>Encerrar Sessão</span>}
        </button>
      </div>
    </div>
  );

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
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)'
        }}
      >
        {renderNavContent(true)}
      </aside>

      {/* Desktop & Tablet Persistent Sidebar */}
      <aside
        className={`app-sidebar hidden md:flex shrink-0 bg-[#edf5fa]/88 border-r border-white/45 h-full max-h-[100dvh] flex-col justify-between select-none backdrop-blur-md text-[#172b4d] transition-[width] duration-200 ease-out ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        {renderNavContent(false)}
      </aside>
    </>
  );
};
