import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CircleHelp, Home, Search, Settings, ShieldCheck, ShieldAlert, User as UserIcon, Menu, ArrowRight, Cpu, MessageSquare, Wrench, ClipboardList, Columns3, BellRing, ArrowLeftRight, Briefcase, FileSignature, Users, Webhook, Database, QrCode, BookOpen, Activity } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { triggerEmergencyAlertModal } from '../emergency/EmergencyGlobalHandler';
import { OfflineStatusIndicator } from './OfflineStatusIndicator';

interface HeaderProps {
  onOpenMobileMenu?: () => void;
}

interface SearchItem {
  name: string;
  path: string;
  keywords: string;
  icon: LucideIcon;
  roleLimit?: string[];
}

const SEARCH_ITEMS: SearchItem[] = [
  { name: 'Dashboard', path: '/', keywords: 'painel início home visão geral', icon: Home },
  { name: 'Manual do Sistema', path: '/manual', keywords: 'ajuda documentação instruções', icon: BookOpen },
  { name: 'Monitoramento TV', path: '/monitoramento', keywords: 'monitor tela chamados operação', icon: Activity, roleLimit: ['admin', 'gerente_ti', 'gerente_infra', 'tecnico'] },
  { name: 'Ativos & Inventário', path: '/assets', keywords: 'ativos inventário patrimônio equipamento estoque', icon: Cpu, roleLimit: ['admin', 'gerente_ti', 'gerente_infra', 'tecnico', 'comprador'] },
  { name: 'Central de Suporte', path: '/servicos', keywords: 'suporte chamados tickets service desk', icon: MessageSquare },
  { name: 'Manutenções', path: '/manutencoes', keywords: 'manutenção oficina reparo', icon: Wrench, roleLimit: ['admin', 'gerente_ti', 'gerente_infra', 'tecnico'] },
  { name: 'Prev. Programada', path: '/manutencao-preventiva', keywords: 'preventiva calendário agenda', icon: ClipboardList, roleLimit: ['admin', 'gerente_ti', 'gerente_infra', 'tecnico'] },
  { name: 'Kanban', path: '/kanban', keywords: 'quadro tarefas projetos', icon: Columns3 },
  { name: 'Alertas', path: '/alertas', keywords: 'notificações avisos', icon: BellRing, roleLimit: ['admin', 'gerente_ti', 'gerente_infra', 'tecnico'] },
  { name: 'Empréstimos', path: '/emprestimos', keywords: 'movimentações devolução retirada', icon: ArrowLeftRight },
  { name: 'Compras', path: '/compras', keywords: 'fornecedores pedidos compras', icon: Briefcase, roleLimit: ['admin', 'gerente_ti', 'gerente_infra', 'comprador'] },
  { name: 'Portal RH', path: '/rh', keywords: 'recursos humanos folgas férias pessoas', icon: FileSignature, roleLimit: ['admin', 'rh'] },
  { name: 'Usuários', path: '/users', keywords: 'pessoas colaboradores contas', icon: Users, roleLimit: ['admin', 'gerente_ti', 'gerente_infra'] },
  { name: 'Webhooks', path: '/webhooks', keywords: 'integrações eventos', icon: Webhook, roleLimit: ['admin'] },
  { name: 'Backup & Restore', path: '/backups', keywords: 'backup restauração segurança banco', icon: Database, roleLimit: ['admin', 'gerente_ti', 'gerente_infra'] },
  { name: 'Meu Crachá QR', path: '/badge', keywords: 'crachá qr código identificação', icon: QrCode },
  { name: 'Setores', path: '/setores', keywords: 'departamentos organização', icon: ClipboardList, roleLimit: ['admin', 'gerente_ti', 'gerente_infra'] },
  { name: 'Configurações', path: '/configuracoes', keywords: 'configuração preferências sistema', icon: Settings, roleLimit: ['admin', 'gerente_ti', 'gerente_infra'] },
  { name: 'Logs de E-mail', path: '/logs-email', keywords: 'email mensagens histórico', icon: Bell, roleLimit: ['admin'] },
];

export const Header: React.FC<HeaderProps> = ({ onOpenMobileMenu }) => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const canAccessSettings = ['admin', 'gerente_ti', 'gerente_infra'].includes(user?.role?.toLowerCase() || '');
  const userRole = user?.role?.toLowerCase() || '';
  const hasRHManagement = !!user?.has_rh_management;
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const searchRef = useRef<HTMLLabelElement>(null);

  const availableSearchItems = useMemo(
    () => SEARCH_ITEMS.filter((item) => !item.roleLimit || item.roleLimit.includes(userRole) || (item.path === '/rh' && hasRHManagement)),
    [hasRHManagement, userRole],
  );

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('pt-BR');
    if (!query) return availableSearchItems.slice(0, 6);
    return availableSearchItems
      .filter((item) => `${item.name} ${item.keywords}`.toLocaleLowerCase('pt-BR').includes(query))
      .slice(0, 6);
  }, [availableSearchItems, searchQuery]);

  const assetSearchResult = searchQuery.trim() && availableSearchItems.some((item) => item.path === '/assets') && searchResults.length === 0
    ? { name: `Buscar ativo por “${searchQuery.trim()}”`, path: `/assets?search=${encodeURIComponent(searchQuery.trim())}`, icon: Cpu }
    : null;

  const goToSearchResult = (path: string) => {
    navigate(path);
    setSearchQuery('');
    setSearchOpen(false);
    setActiveSearchIndex(0);
  };

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.querySelector('input')?.focus();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  useEffect(() => {
    const closeSearch = (event: PointerEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('pointerdown', closeSearch);
    return () => document.removeEventListener('pointerdown', closeSearch);
  }, []);

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const resultCount = searchResults.length + (assetSearchResult ? 1 : 0);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSearchOpen(true);
      setActiveSearchIndex((current) => resultCount ? (current + 1) % resultCount : 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSearchOpen(true);
      setActiveSearchIndex((current) => resultCount ? (current - 1 + resultCount) % resultCount : 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selectedResult = searchResults[activeSearchIndex] ?? (assetSearchResult && activeSearchIndex === searchResults.length ? assetSearchResult : null);
      if (selectedResult) goToSearchResult(selectedResult.path);
    } else if (event.key === 'Escape') {
      setSearchOpen(false);
      event.currentTarget.blur();
    }
  };

  return (
    <header
      className="w-full shrink-0 border-b border-white/20 flex items-center justify-between px-3 md:px-5 bg-[#345b7d] text-white backdrop-blur-md sticky top-0 z-40 shadow-[0_2px_12px_rgba(9,30,66,.16)] box-border"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 6px)',
        paddingBottom: '6px',
        minHeight: 'calc(3.5rem + env(safe-area-inset-top, 0px))'
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="md:hidden grid h-9 w-9 place-items-center rounded-lg bg-white/16 hover:bg-white/28 active:scale-95 transition-all text-white cursor-pointer"
          title="Menu de Navegação"
          aria-label="Menu de Navegação"
        >
          <Menu size={20} />
        </button>

        <Link to="/" className="grid h-8 w-8 place-items-center rounded bg-white/16 hover:bg-white/28" title="Início" aria-label="Início">
          <Home size={17} />
        </Link>
        <label ref={searchRef} className="relative hidden md:flex h-8 w-52 lg:w-64 items-center gap-2 rounded bg-white/16 px-3 text-white/85 focus-within:bg-white/24" title="Busca global">
          <Search size={15} />
          <input
            className="w-full bg-transparent text-sm outline-none placeholder:text-white/65"
            placeholder="Buscar no AssetTrack"
            aria-label="Busca global"
            value={searchQuery}
            onFocus={() => setSearchOpen(true)}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setSearchOpen(true);
              setActiveSearchIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
            role="combobox"
            aria-expanded={searchOpen}
            aria-controls="global-search-results"
            aria-autocomplete="list"
          />
          {searchOpen && (
            <div id="global-search-results" role="listbox" className="absolute left-0 top-[calc(100%+8px)] z-50 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-xl border border-brand-border bg-white p-1.5 text-brand-text shadow-2xl">
              {searchResults.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    type="button"
                    role="option"
                    aria-selected={index === activeSearchIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => goToSearchResult(item.path)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${index === activeSearchIndex ? 'bg-blue-50 text-brand-primary' : 'hover:bg-slate-50'}`}
                  >
                    <Icon size={16} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <ArrowRight size={14} className="shrink-0 opacity-45" />
                  </button>
                );
              })}
              {assetSearchResult && (
                <button
                  type="button"
                  role="option"
                  aria-selected={activeSearchIndex === searchResults.length}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => goToSearchResult(assetSearchResult.path)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${activeSearchIndex === searchResults.length ? 'bg-blue-50 text-brand-primary' : 'hover:bg-slate-50'}`}
                >
                  <Cpu size={16} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{assetSearchResult.name}</span>
                  <ArrowRight size={14} className="shrink-0 opacity-45" />
                </button>
              )}
              {searchResults.length === 0 && !assetSearchResult && <p className="px-3 py-2 text-xs text-brand-muted">Nenhum módulo encontrado.</p>}
              {!searchQuery.trim() && <p className="border-t border-slate-100 px-3 pb-1 pt-2 text-[10px] text-brand-muted">Use ↑ ↓ e Enter · Ctrl/Cmd + K</p>}
            </div>
          )}
        </label>
      </div>

      <div className="flex items-center gap-2">
        {/* Offline Status & Sync Indicator */}
        <OfflineStatusIndicator />

        {/* Emergency Trigger Button for ALL users on Desktop / Web */}
        <button
          onClick={triggerEmergencyAlertModal}
          className="hidden sm:flex bg-red-600/90 hover:bg-red-600 text-white font-bold text-xs px-3 py-1.5 rounded border border-red-300/30 items-center space-x-1.5 transition-all shadow-sm active:scale-95"
          title="Disparar um alerta emergencial para a equipe de TI"
        >
          <ShieldAlert size={15} />
          <span>Alerta Emergencial</span>
        </button>

        {user?.role === 'admin' && (
          <div className="hidden lg:flex h-8 items-center space-x-1 text-white border border-white/25 px-2 py-0 bg-white/10 rounded text-xs">
            <ShieldCheck size={14} />
            <span>ROOT</span>
          </div>
        )}
        <Link to="/alertas" className="grid h-8 w-8 place-items-center rounded bg-white/16 hover:bg-white/28" title="Notificações" aria-label="Notificações">
          <Bell size={16} />
        </Link>
        <Link to="/manual" className="hidden sm:grid h-8 w-8 place-items-center rounded bg-white/16 hover:bg-white/28" title="Manual do sistema" aria-label="Manual do sistema"><CircleHelp size={16} /></Link>
        {canAccessSettings && (
          <Link to="/configuracoes" className="hidden sm:grid h-8 w-8 place-items-center rounded bg-white/16 hover:bg-white/28" title="Configurações" aria-label="Configurações"><Settings size={16} /></Link>
        )}
        <Link to="/profile" className="flex items-center gap-2 rounded bg-white/10 py-1 pl-1 pr-2 text-sm hover:bg-white/20">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#0c66e4] text-xs font-bold"><UserIcon size={15} /></span>
          <span className="hidden font-medium md:block max-w-28 truncate">{user?.nome}</span>
        </Link>
      </div>
    </header>
  );
};
