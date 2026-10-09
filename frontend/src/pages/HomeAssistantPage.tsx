import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Radio,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Power,
  Zap,
  Thermometer,
  Droplets,
  Server,
  Activity,
  Sliders,
  Link,
  BatteryCharging,
  Gauge,
  WifiOff,
  Filter,
  Eye,
  EyeOff,
  Edit3,
  Pin,
  Settings2,
  Tags,
  Plus,
  Trash2,
  Edit2,
  FolderTree,
  Clock,
} from 'lucide-react';
import { homeAssistantApi } from '../api/homeAssistant';
import { assetsApi } from '../api/assets';
import type {
  HAOverviewResponse,
  HAEntityState,
  SaveBindingRequest,
  HACategory,
} from '../types/homeAssistant';
import type { Asset } from '../types';
import { useAuthStore } from '../stores/authStore';

export const HomeAssistantPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin';

  // Core data states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isBackgroundFetching, setIsBackgroundFetching] = useState(false);
  const [overview, setOverview] = useState<HAOverviewResponse | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categoriesList, setCategoriesList] = useState<HACategory[]>([]);
  const [activeTab, setActiveTab] = useState<'telemetry' | 'control' | 'customize' | 'bindings'>('telemetry');

  // Auto-refresh interval (0 = desativado/manual, 15, 30, 60, 300 segundos)
  // Padrão: 0 (Desativado / Manual) para não atualizar sozinho nem piscar a tela
  const [refreshInterval, setRefreshInterval] = useState<number>(() => {
    const saved = localStorage.getItem('ha_auto_refresh_sec');
    return saved !== null ? Number(saved) : 0;
  });

  const hasLoadedOnce = useRef(false);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [showHidden, setShowHidden] = useState<boolean>(false);
  const [customizeDomainFilter, setCustomizeDomainFilter] = useState<'all' | 'sensors' | 'controls'>('all');
  const [customizeVisibilityFilter, setCustomizeVisibilityFilter] = useState<'all' | 'visible' | 'hidden'>('all');

  // Action states
  const [serviceActionPending, setServiceActionPending] = useState(false);
  const [safetyModalEntity, setSafetyModalEntity] = useState<HAEntityState | null>(null);
  const [targetStateAction, setTargetStateAction] = useState<'turn_on' | 'turn_off' | 'toggle'>('toggle');

  // Customization & Binding Modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [targetEntity, setTargetEntity] = useState<HAEntityState | null>(null);
  const [editFriendlyName, setEditFriendlyName] = useState('');
  const [editCategory, setEditCategory] = useState('Geral');
  const [editAssetId, setEditAssetId] = useState<number | ''>('');
  const [editIsPinned, setEditIsPinned] = useState(false);
  const [editIsVisible, setEditIsVisible] = useState(true);
  const [editDisplayOrder, setEditDisplayOrder] = useState<number>(0);
  const [savingEdit, setSavingEdit] = useState(false);

  // Category Manager Modal state
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [catNameInput, setCatNameInput] = useState('');
  const [catColorInput, setCatColorInput] = useState('blue');
  const [catIconInput, setCatIconInput] = useState('folder');
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [savingCat, setSavingCat] = useState(false);

  // Success / Error alerts
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  const loadData = useCallback(async (forceRefresh = false, isBackground = false) => {
    try {
      if (forceRefresh) {
        setRefreshing(true);
      } else if (isBackground || hasLoadedOnce.current) {
        setIsBackgroundFetching(true);
      } else {
        setLoading(true);
      }

      const [haData, assetList, catList] = await Promise.all([
        homeAssistantApi.getOverview(forceRefresh),
        assetsApi.list(0, 1000).catch(() => [] as Asset[]),
        homeAssistantApi.listCategories().catch(() => [] as HACategory[]),
      ]);

      hasLoadedOnce.current = true;
      setOverview(haData);
      setAssets(assetList);
      setCategoriesList(catList);
    } catch (err: any) {
      if (!isBackground) {
        showFeedback(err?.response?.data?.error || 'Erro ao carregar telemetria do Home Assistant', 'error');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setIsBackgroundFetching(false);
    }
  }, []);

  // Carga inicial
  useEffect(() => {
    loadData(false, false);
  }, [loadData]);

  // Atualização periódica configurável (se refreshInterval > 0)
  useEffect(() => {
    if (refreshInterval <= 0) return;

    const timer = setInterval(() => {
      loadData(false, true);
    }, refreshInterval * 1000);

    return () => clearInterval(timer);
  }, [loadData, refreshInterval]);

  const handleIntervalChange = (newSec: number) => {
    setRefreshInterval(newSec);
    localStorage.setItem('ha_auto_refresh_sec', String(newSec));
    if (newSec === 0) {
      showFeedback('Atualização automática desativada (Modo Manual).');
    } else {
      showFeedback(`Atualização em segundo plano configurada para cada ${newSec}s.`);
    }
  };

  // Dynamic Categories list for filters
  const categories = useMemo(() => {
    const list = categoriesList.map((c) => c.nome);
    if (!list.includes('Geral')) list.push('Geral');
    return ['Todas', ...list];
  }, [categoriesList]);

  // Quick toggle visibility (inline 1-click)
  const toggleEntityVisibility = async (entity: HAEntityState, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newVisibility = !entity.is_visible;
    try {
      await homeAssistantApi.setVisibility(entity.entity_id, newVisibility);
      setOverview((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          entities: prev.entities.map((item) =>
            item.entity_id === entity.entity_id ? { ...item, is_visible: newVisibility } : item
          ),
        };
      });
      showFeedback(
        `Entidade "${entity.friendly_name}" ${newVisibility ? 'agora é visível' : 'foi ocultada do painel'}.`
      );
    } catch (err: any) {
      showFeedback(err?.response?.data?.error || 'Falha ao alterar visibilidade', 'error');
    }
  };

  // Open Edit/Customize Modal
  const handleOpenEditModal = (entity: HAEntityState, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTargetEntity(entity);
    setEditFriendlyName(entity.friendly_name);
    setEditCategory(entity.category || 'Geral');
    setEditAssetId(entity.asset_id || '');
    setEditIsPinned(entity.is_pinned);
    setEditIsVisible(entity.is_visible !== false);
    setEditDisplayOrder(entity.display_order || 0);
    setEditModalOpen(true);
  };

  const handleSaveCustomization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetEntity) return;

    setSavingEdit(true);
    try {
      const req: SaveBindingRequest = {
        entity_id: targetEntity.entity_id,
        friendly_name: editFriendlyName.trim() || targetEntity.entity_id,
        category: editCategory.trim() || 'Geral',
        asset_id: editAssetId === '' ? null : Number(editAssetId),
        is_pinned: editIsPinned,
        is_visible: editIsVisible,
        display_order: Number(editDisplayOrder) || 0,
      };

      await homeAssistantApi.saveBinding(req);
      showFeedback(`Personalização salva para "${editFriendlyName}"!`);
      setEditModalOpen(false);
      await loadData(true);
    } catch (err: any) {
      showFeedback(err?.response?.data?.error || 'Falha ao salvar personalização', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  // Category Manager Handlers
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = catNameInput.trim();
    if (!name) return;

    setSavingCat(true);
    try {
      if (editingCatId) {
        await homeAssistantApi.updateCategory(editingCatId, {
          nome: name,
          icone: catIconInput,
          cor: catColorInput,
        });
        showFeedback(`Categoria "${name}" atualizada com sucesso!`);
      } else {
        await homeAssistantApi.createCategory({
          nome: name,
          icone: catIconInput,
          cor: catColorInput,
        });
        showFeedback(`Categoria "${name}" criada com sucesso!`);
      }
      setCatNameInput('');
      setEditingCatId(null);
      // Reload categories & overview
      const [newCats, haData] = await Promise.all([
        homeAssistantApi.listCategories(),
        homeAssistantApi.getOverview(true),
      ]);
      setCategoriesList(newCats);
      setOverview(haData);
    } catch (err: any) {
      showFeedback(err?.response?.data?.error || 'Falha ao salvar categoria', 'error');
    } finally {
      setSavingCat(false);
    }
  };

  const handleStartEditCategory = (cat: HACategory) => {
    setEditingCatId(cat.id);
    setCatNameInput(cat.nome);
    setCatIconInput(cat.icone || 'folder');
    setCatColorInput(cat.cor || 'blue');
  };

  const handleCancelEditCategory = () => {
    setEditingCatId(null);
    setCatNameInput('');
    setCatIconInput('folder');
    setCatColorInput('blue');
  };

  const handleDeleteCategory = async (cat: HACategory) => {
    if (cat.nome === 'Geral') {
      showFeedback('A categoria padrão "Geral" não pode ser excluída.', 'error');
      return;
    }
    const confirmDelete = window.confirm(
      `Deseja excluir a categoria "${cat.nome}"? As entidades associadas serão migradas para a categoria "Geral".`
    );
    if (!confirmDelete) return;

    try {
      await homeAssistantApi.deleteCategory(cat.id);
      showFeedback(`Categoria "${cat.nome}" excluída!`);
      const [newCats, haData] = await Promise.all([
        homeAssistantApi.listCategories(),
        homeAssistantApi.getOverview(true),
      ]);
      setCategoriesList(newCats);
      setOverview(haData);
    } catch (err: any) {
      showFeedback(err?.response?.data?.error || 'Falha ao excluir categoria', 'error');
    }
  };

  // Filtered Telemetry (Sensors)
  const telemetryEntities = useMemo(() => {
    if (!overview) return [];
    return overview.entities.filter((e) => {
      const isTelemetryDomain = ['sensor', 'binary_sensor'].includes(e.domain);
      if (!isTelemetryDomain) return false;

      // Visibility filter
      if (!showHidden && e.is_visible === false) return false;

      const matchesSearch =
        e.friendly_name.toLowerCase().includes(search.toLowerCase()) ||
        e.entity_id.toLowerCase().includes(search.toLowerCase()) ||
        (e.asset_name && e.asset_name.toLowerCase().includes(search.toLowerCase())) ||
        (e.asset_tag && e.asset_tag.toLowerCase().includes(search.toLowerCase()));

      const matchesCategory = selectedCategory === 'Todas' || e.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [overview, search, selectedCategory, showHidden]);

  // Filtered Controls (Switches, Lights, Relays)
  const controlEntities = useMemo(() => {
    if (!overview) return [];
    return overview.entities.filter((e) => {
      const isControlDomain = ['switch', 'light', 'climate', 'lock', 'fan'].includes(e.domain);
      if (!isControlDomain) return false;

      // Visibility filter
      if (!showHidden && e.is_visible === false) return false;

      const matchesSearch =
        e.friendly_name.toLowerCase().includes(search.toLowerCase()) ||
        e.entity_id.toLowerCase().includes(search.toLowerCase()) ||
        (e.asset_name && e.asset_name.toLowerCase().includes(search.toLowerCase())) ||
        (e.asset_tag && e.asset_tag.toLowerCase().includes(search.toLowerCase()));

      const matchesCategory = selectedCategory === 'Todas' || e.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [overview, search, selectedCategory, showHidden]);

  // All Entities for Customization Tab
  const customizeEntities = useMemo(() => {
    if (!overview) return [];
    return overview.entities.filter((e) => {
      // Domain filter
      if (customizeDomainFilter === 'sensors' && !['sensor', 'binary_sensor'].includes(e.domain)) return false;
      if (customizeDomainFilter === 'controls' && !['switch', 'light', 'climate', 'lock', 'fan'].includes(e.domain))
        return false;

      // Visibility filter
      if (customizeVisibilityFilter === 'visible' && e.is_visible === false) return false;
      if (customizeVisibilityFilter === 'hidden' && e.is_visible !== false) return false;

      const matchesSearch =
        e.friendly_name.toLowerCase().includes(search.toLowerCase()) ||
        e.entity_id.toLowerCase().includes(search.toLowerCase()) ||
        (e.category && e.category.toLowerCase().includes(search.toLowerCase())) ||
        (e.asset_name && e.asset_name.toLowerCase().includes(search.toLowerCase())) ||
        (e.asset_tag && e.asset_tag.toLowerCase().includes(search.toLowerCase()));

      const matchesCategory = selectedCategory === 'Todas' || e.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [overview, search, selectedCategory, customizeDomainFilter, customizeVisibilityFilter]);

  // Hidden counts
  const hiddenCountTelemetry = useMemo(() => {
    return (
      overview?.entities.filter((e) => ['sensor', 'binary_sensor'].includes(e.domain) && e.is_visible === false)
        .length || 0
    );
  }, [overview]);

  const hiddenCountControl = useMemo(() => {
    return (
      overview?.entities.filter(
        (e) => ['switch', 'light', 'climate', 'lock', 'fan'].includes(e.domain) && e.is_visible === false
      ).length || 0
    );
  }, [overview]);

  // Count entities per category
  const entityCountByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    overview?.entities.forEach((e) => {
      const cat = e.category || 'Geral';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [overview]);

  // Handle Switch Action with Safety Confirmation Modal
  const initiateControlAction = (entity: HAEntityState) => {
    const isCurrentlyOn = entity.state.toLowerCase() === 'on';
    const nextAction = isCurrentlyOn ? 'turn_off' : 'turn_on';
    setTargetStateAction(nextAction);
    setSafetyModalEntity(entity);
  };

  const confirmControlAction = async () => {
    if (!safetyModalEntity) return;
    setServiceActionPending(true);
    try {
      await homeAssistantApi.callService({
        domain: safetyModalEntity.domain,
        service: targetStateAction,
        entity_id: safetyModalEntity.entity_id,
      });

      showFeedback(
        `Comando enviado para ${safetyModalEntity.friendly_name}: ${
          targetStateAction === 'turn_on' ? 'Ligar' : 'Desligar'
        }`
      );
      setSafetyModalEntity(null);
      await loadData(true);
    } catch (err: any) {
      showFeedback(err?.response?.data?.error || 'Erro ao executar comando no Home Assistant', 'error');
    } finally {
      setServiceActionPending(false);
    }
  };

  // Helper for telemetry units & icons
  const getEntityIcon = (entity: HAEntityState) => {
    const devClass = entity.attributes?.device_class;
    const unit = entity.attributes?.unit_of_measurement;
    const id = entity.entity_id.toLowerCase();

    if (devClass === 'temperature' || unit === '°C' || unit === '°F' || id.includes('temp')) {
      return <Thermometer className="w-5 h-5 text-amber-500" />;
    }
    if (devClass === 'humidity' || (unit === '%' && id.includes('humid'))) {
      return <Droplets className="w-5 h-5 text-sky-500" />;
    }
    if (
      devClass === 'power' ||
      devClass === 'energy' ||
      unit === 'W' ||
      unit === 'kW' ||
      unit === 'kWh' ||
      id.includes('power')
    ) {
      return <Zap className="w-5 h-5 text-amber-400" />;
    }
    if (devClass === 'battery' || id.includes('ups') || id.includes('nobreak') || id.includes('bateria')) {
      return <BatteryCharging className="w-5 h-5 text-emerald-500" />;
    }
    if (devClass === 'voltage' || unit === 'V') {
      return <Gauge className="w-5 h-5 text-blue-400" />;
    }
    if (id.includes('server') || id.includes('rack') || id.includes('cpd')) {
      return <Server className="w-5 h-5 text-indigo-400" />;
    }
    return <Activity className="w-5 h-5 text-slate-400" />;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 shadow-inner">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white uppercase font-mono tracking-wide">
                  Automação & IoT
                </h1>
                {overview && (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium ${
                      overview.is_online
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {overview.is_online ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        Online
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-3 h-3 text-amber-400" />
                        Offline (Cache)
                      </>
                    )}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1 font-mono">
                Telemetria de sensores, controle de relés, personalização de nomes, visibilidade e categorias
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Auto-refresh selector */}
            <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 font-mono text-xs">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <label htmlFor="ha-refresh-interval" className="text-slate-400 text-[11px] hidden sm:inline">
                Auto-Atualização:
              </label>
              <select
                id="ha-refresh-interval"
                value={refreshInterval}
                onChange={(e) => handleIntervalChange(Number(e.target.value))}
                className="bg-slate-900 text-slate-200 border border-slate-700 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-500 font-mono"
              >
                <option value={0}>Desativado (Manual)</option>
                <option value={15}>A cada 15s</option>
                <option value={30}>A cada 30s</option>
                <option value={60}>A cada 1 min</option>
                <option value={300}>A cada 5 min</option>
              </select>
            </div>

            {/* Gerenciar Categorias button */}
            <button
              onClick={() => setCategoryModalOpen(true)}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-mono text-xs font-medium px-3.5 py-2.5 rounded-xl transition-all shadow-xs"
              title="Criar, editar e configurar categorias de agrupamento"
            >
              <Tags className="w-3.5 h-3.5 text-blue-400" />
              Configurar Categorias
            </button>

            {isAdmin && (
              <a
                href="/configuracoes"
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 font-mono text-xs font-medium px-3.5 py-2.5 rounded-xl transition-all shadow-xs"
                title="Configurações do Home Assistant"
              >
                <Sliders className="w-3.5 h-3.5" />
                Configurar HA
              </a>
            )}
            <button
              onClick={() => loadData(true)}
              disabled={refreshing || isBackgroundFetching}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-mono text-xs font-medium px-4 py-2.5 rounded-xl transition-all shadow-xs disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  refreshing || isBackgroundFetching ? 'animate-spin text-blue-400' : ''
                }`}
              />
              {refreshing ? 'Sincronizando...' : isBackgroundFetching ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
        </div>

        {/* Status notice if offline or error */}
        {overview && !overview.is_online && overview.error && (
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2 text-xs text-amber-300 font-mono">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              Home Assistant inacessível ({overview.error}). Exibindo último estado em cache.
            </span>
          </div>
        )}

        {/* Global Feedback notification */}
        {feedbackMsg && (
          <div
            className={`mt-4 p-3 rounded-xl border flex items-center gap-2 text-xs font-mono ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
          >
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertOctagon className="w-4 h-4 shrink-0 text-red-400" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 mt-6 border-t border-slate-800 pt-4">
          <button
            onClick={() => setActiveTab('telemetry')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-medium uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'telemetry'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Monitoramento ({telemetryEntities.length})
          </button>

          <button
            onClick={() => setActiveTab('control')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-medium uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'control'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            Controle & Relés ({controlEntities.length})
          </button>

          <button
            onClick={() => setActiveTab('customize')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-medium uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'customize'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            Personalizar & Organizar ({overview?.entities.length || 0})
          </button>

          <button
            onClick={() => setActiveTab('bindings')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-medium uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'bindings'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Link className="w-3.5 h-3.5" />
            Vínculo com Ativos ({overview?.entities.filter((e) => e.asset_id).length || 0})
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome personalizado, entidade ou ativo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Dynamic Categories filter buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 max-w-xl">
            <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-slate-700 text-white font-medium border border-slate-600'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Show hidden toggle in Telemetry and Control tabs */}
          {(activeTab === 'telemetry' || activeTab === 'control') && (
            <button
              onClick={() => setShowHidden(!showHidden)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all border ${
                showHidden
                  ? 'bg-blue-900/30 text-blue-300 border-blue-500/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
              title="Exibir entidades marcadas como ocultas"
            >
              {showHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {showHidden
                ? 'Exibindo Ocultas'
                : `Ocultas (${activeTab === 'telemetry' ? hiddenCountTelemetry : hiddenCountControl})`}
            </button>
          )}
        </div>
      </div>

      {/* Loading state - apenas no carregamento inicial antes de ter dados */}
      {loading && !overview ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 animate-pulse h-36" />
          ))}
        </div>
      ) : (
        <>
          {/* TAB 1: TELEMETRY (Sensors) */}
          {activeTab === 'telemetry' && (
            <div className="space-y-4">
              {telemetryEntities.length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
                  <Activity className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400 font-mono text-sm">
                    Nenhum sensor de telemetria visível encontrado com os filtros atuais.
                  </p>
                  {hiddenCountTelemetry > 0 && !showHidden && (
                    <button
                      onClick={() => setShowHidden(true)}
                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 text-xs font-mono hover:bg-blue-600/30 transition-all"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Ver {hiddenCountTelemetry} sensores ocultos
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {telemetryEntities.map((entity) => {
                    const unit = entity.attributes?.unit_of_measurement || '';
                    const isBinary = entity.domain === 'binary_sensor';
                    const binaryState = entity.state.toLowerCase() === 'on';
                    const isHidden = entity.is_visible === false;

                    return (
                      <div
                        key={entity.entity_id}
                        className={`bg-slate-900/90 border rounded-2xl p-4 flex flex-col justify-between hover:border-slate-700 transition-all shadow-xs relative group ${
                          isHidden ? 'opacity-60 border-dashed border-slate-700' : 'border-slate-800'
                        } ${entity.is_pinned ? 'ring-1 ring-blue-500/30' : ''}`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                                {getEntityIcon(entity)}
                              </div>
                              <div className="overflow-hidden">
                                <div className="flex items-center gap-1.5">
                                  <h3 className="text-sm font-semibold text-white truncate" title={entity.friendly_name}>
                                    {entity.friendly_name}
                                  </h3>
                                  {entity.is_pinned && (
                                    <span title="Fixado no topo">
                                      <Pin className="w-3 h-3 text-blue-400 shrink-0" />
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 font-mono truncate" title={entity.entity_id}>
                                  {entity.entity_id}
                                </p>
                              </div>
                            </div>

                            {/* Card Quick Actions: Edit customization & Toggle Visibility */}
                            <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => toggleEntityVisibility(entity, e)}
                                className={`p-1 rounded-md transition-colors ${
                                  isHidden
                                    ? 'text-amber-400 hover:text-amber-300'
                                    : 'text-slate-500 hover:text-slate-300'
                                }`}
                                title={isHidden ? 'Reexibir no painel' : 'Ocultar do painel'}
                              >
                                {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={(e) => handleOpenEditModal(entity, e)}
                                className="text-slate-500 hover:text-blue-400 p-1 rounded-md transition-colors"
                                title="Personalizar nome, categoria e ativo"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Value display */}
                          <div className="my-4">
                            {isBinary ? (
                              <div className="flex items-center gap-2">
                                <span
                                  className={`w-2.5 h-2.5 rounded-full ${
                                    binaryState ? 'bg-emerald-400' : 'bg-slate-500'
                                  }`}
                                />
                                <span className="text-lg font-mono font-bold text-white">
                                  {binaryState ? 'Detectado / Aberto' : 'Normal / Fechado'}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-2xl font-mono font-bold text-white tracking-tight">
                                  {entity.state}
                                </span>
                                {unit && (
                                  <span className="text-xs font-mono font-semibold text-slate-400">
                                    {unit}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Card Footer: Metadata and Linked Asset */}
                        <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                          {entity.asset_tag ? (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 truncate max-w-[170px]"
                              title={`${entity.asset_tag} - ${entity.asset_name}`}
                            >
                              <Server className="w-3 h-3 shrink-0" />
                              {entity.asset_tag}
                            </span>
                          ) : (
                            <span className="text-slate-600">Sem ativo</span>
                          )}

                          <div className="flex items-center gap-1.5">
                            {isHidden && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 text-[9px] uppercase font-bold">
                                Oculto
                              </span>
                            )}
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                              {entity.category || 'Geral'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CONTROL (Switches, Lights, Relays) */}
          {activeTab === 'control' && (
            <div className="space-y-4">
              {controlEntities.length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
                  <Power className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400 font-mono text-sm">Nenhum relé ou atuador visível encontrado.</p>
                  {hiddenCountControl > 0 && !showHidden && (
                    <button
                      onClick={() => setShowHidden(true)}
                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 text-xs font-mono hover:bg-blue-600/30 transition-all"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Ver {hiddenCountControl} controles ocultos
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {controlEntities.map((entity) => {
                    const isOn = entity.state.toLowerCase() === 'on';
                    const isHidden = entity.is_visible === false;

                    return (
                      <div
                        key={entity.entity_id}
                        className={`bg-slate-900/90 border rounded-2xl p-5 flex flex-col justify-between transition-all shadow-xs relative group ${
                          isOn ? 'border-blue-500/30 ring-1 ring-blue-500/20' : 'border-slate-800'
                        } ${isHidden ? 'opacity-60 border-dashed' : ''} ${
                          entity.is_pinned ? 'ring-1 ring-blue-500/40' : ''
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                  isOn
                                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                    : 'bg-slate-800 text-slate-500 border border-slate-700'
                                }`}
                              >
                                <Power className="w-5 h-5" />
                              </div>
                              <div className="overflow-hidden">
                                <div className="flex items-center gap-1.5">
                                  <h3 className="text-sm font-semibold text-white truncate" title={entity.friendly_name}>
                                    {entity.friendly_name}
                                  </h3>
                                  {entity.is_pinned && (
                                    <span title="Fixado no topo">
                                      <Pin className="w-3 h-3 text-blue-400 shrink-0" />
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 font-mono truncate" title={entity.entity_id}>
                                  {entity.entity_id}
                                </p>
                              </div>
                            </div>

                            {/* Card Quick Actions */}
                            <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => toggleEntityVisibility(entity, e)}
                                className={`p-1 rounded-md transition-colors ${
                                  isHidden
                                    ? 'text-amber-400 hover:text-amber-300'
                                    : 'text-slate-500 hover:text-slate-300'
                                }`}
                                title={isHidden ? 'Reexibir no painel' : 'Ocultar do painel'}
                              >
                                {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={(e) => handleOpenEditModal(entity, e)}
                                className="text-slate-500 hover:text-blue-400 p-1 rounded-md transition-colors"
                                title="Personalizar nome, categoria e ativo"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <div className="my-5 flex items-center justify-between">
                            <div>
                              <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
                                Estado Atual
                              </span>
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold uppercase tracking-wider ${
                                  isOn
                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${isOn ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                                {isOn ? 'Ligado' : 'Desligado'}
                              </span>
                            </div>

                            {/* Action Trigger Button */}
                            <button
                              type="button"
                              onClick={() => initiateControlAction(entity)}
                              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-semibold uppercase tracking-wider transition-all shadow-sm ${
                                isOn
                                  ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30'
                                  : 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-500'
                              }`}
                            >
                              <Power className="w-3.5 h-3.5" />
                              {isOn ? 'Desligar' : 'Ligar'}
                            </button>
                          </div>
                        </div>

                        {/* Card Footer */}
                        <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                          {entity.asset_tag ? (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 truncate max-w-[170px]"
                              title={`${entity.asset_tag} - ${entity.asset_name}`}
                            >
                              <Server className="w-3 h-3 shrink-0" />
                              {entity.asset_tag}
                            </span>
                          ) : (
                            <span className="text-slate-600">Sem ativo</span>
                          )}

                          <div className="flex items-center gap-1.5">
                            {isHidden && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 text-[9px] uppercase font-bold">
                                Oculto
                              </span>
                            )}
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                              {entity.category || 'Geral'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CUSTOMIZE & ORGANIZE (Hub for names, visibility & categories) */}
          {activeTab === 'customize' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm space-y-4">
              <div className="p-5 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/60">
                <div>
                  <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wide flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-blue-400" />
                    Gerenciador de Personalização & Visibilidade
                  </h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Defina nomes personalizados, organize por categoria, ordene e selecione o que deve ou não aparecer nas abas de Monitoramento e Controle.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Domain filter */}
                  <select
                    value={customizeDomainFilter}
                    onChange={(e: any) => setCustomizeDomainFilter(e.target.value)}
                    className="p-1.5 px-3 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">Todos os Tipos</option>
                    <option value="sensors">Apenas Sensores</option>
                    <option value="controls">Apenas Controles/Relés</option>
                  </select>

                  {/* Visibility filter */}
                  <select
                    value={customizeVisibilityFilter}
                    onChange={(e: any) => setCustomizeVisibilityFilter(e.target.value)}
                    className="p-1.5 px-3 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">Todas as Visibilidades</option>
                    <option value="visible">Apenas Visíveis</option>
                    <option value="hidden">Apenas Ocultas</option>
                  </select>

                  <button
                    onClick={() => setCategoryModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 transition-all text-xs font-mono"
                  >
                    <Tags className="w-3.5 h-3.5" />
                    Editar Categorias
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto px-4 pb-4">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-800/80 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4 w-12 text-center">Exibir</th>
                      <th className="py-3 px-4">Nome Personalizado</th>
                      <th className="py-3 px-4">ID da Entidade</th>
                      <th className="py-3 px-4">Categoria</th>
                      <th className="py-3 px-4">Tipo</th>
                      <th className="py-3 px-4">Ativo Vinculado</th>
                      <th className="py-3 px-4 text-center">Destaque</th>
                      <th className="py-3 px-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {customizeEntities.map((entity) => {
                      const isVisible = entity.is_visible !== false;
                      const isControl = ['switch', 'light', 'climate', 'lock', 'fan'].includes(entity.domain);

                      return (
                        <tr
                          key={entity.entity_id}
                          className={`hover:bg-slate-800/50 transition-colors ${
                            !isVisible ? 'opacity-50 bg-slate-950/40' : ''
                          }`}
                        >
                          {/* Toggle visibility */}
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={(e) => toggleEntityVisibility(entity, e)}
                              className={`p-1.5 rounded-lg border transition-all ${
                                isVisible
                                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                                  : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
                              }`}
                              title={isVisible ? 'Clique para ocultar' : 'Clique para exibir'}
                            >
                              {isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </button>
                          </td>

                          {/* Friendly Name */}
                          <td className="py-3 px-4 font-bold text-white">
                            <div className="flex items-center gap-1.5">
                              <span>{entity.friendly_name}</span>
                              {entity.is_pinned && (
                                <span title="Fixado no topo">
                                  <Pin className="w-3 h-3 text-blue-400 shrink-0" />
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Entity ID */}
                          <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                            {entity.entity_id}
                          </td>

                          {/* Category */}
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {entity.category || 'Geral'}
                            </span>
                          </td>

                          {/* Type */}
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                                isControl
                                  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                              }`}
                            >
                              {isControl ? 'Controle / Relé' : 'Sensor'}
                            </span>
                          </td>

                          {/* Asset Tag */}
                          <td className="py-3 px-4">
                            {entity.asset_tag ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                <Server className="w-3 h-3 shrink-0" />
                                {entity.asset_tag}
                              </span>
                            ) : (
                              <span className="text-slate-600 italic">Sem ativo</span>
                            )}
                          </td>

                          {/* Pinned */}
                          <td className="py-3 px-4 text-center">
                            {entity.is_pinned ? (
                              <span className="text-blue-400 font-bold">Sim</span>
                            ) : (
                              <span className="text-slate-600">Não</span>
                            )}
                          </td>

                          {/* Edit button */}
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={(e) => handleOpenEditModal(entity, e)}
                              className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 transition-all text-xs font-semibold"
                            >
                              Personalizar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: ASSET BINDINGS */}
          {activeTab === 'bindings' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wide">
                    Mapeamento de Entidades com Ativos
                  </h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Vincule entidades do Home Assistant a ativos físicos (servidores, nobreaks, ar-condicionado) cadastrados no AssetTrack.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-800/60 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Entidade Home Assistant</th>
                      <th className="py-3 px-4">Nome Amigável</th>
                      <th className="py-3 px-4">Categoria</th>
                      <th className="py-3 px-4">Ativo Vinculado (Patrimônio)</th>
                      <th className="py-3 px-4">Estado Atual</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {overview?.entities
                      .filter((e) => e.asset_id || e.category !== 'Geral')
                      .map((entity) => (
                        <tr key={entity.entity_id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 font-bold text-white">
                            {entity.entity_id}
                          </td>
                          <td className="py-3 px-4 text-slate-300">
                            {entity.friendly_name}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                              {entity.category || 'Geral'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {entity.asset_tag ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                <Server className="w-3.5 h-3.5" />
                                {entity.asset_tag} — {entity.asset_name}
                              </span>
                            ) : (
                              <span className="text-slate-500 italic">Nenhum</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-bold text-white">
                              {entity.state} {entity.attributes?.unit_of_measurement || ''}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={(e) => handleOpenEditModal(entity, e)}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 transition-colors text-xs font-semibold mr-2"
                            >
                              Editar
                            </button>
                          </td>
                        </tr>
                      ))}
                    {!overview?.entities.some((e) => e.asset_id || e.category !== 'Geral') && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          Nenhum vínculo configurado ainda. Clique em Personalizar em qualquer entidade para associá-la a um ativo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* SAFETY CONFIRMATION MODAL */}
      {safetyModalEntity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-slate-900 border border-red-500/50 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-in fade-in duration-200">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center shrink-0">
                <AlertOctagon className="w-7 h-7" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-white uppercase font-mono tracking-wide">
                  Confirmação de Operação Crítica
                </h3>
                <p className="text-xs text-red-400 font-mono mt-1">
                  Atenção: Ação com impacto direto sobre circuito ou equipamento físico
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-800/80 border border-slate-700 rounded-xl space-y-2 text-xs font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Dispositivo:</span>
                <span className="text-white font-bold">{safetyModalEntity.friendly_name}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>ID da Entidade:</span>
                <span className="text-slate-300">{safetyModalEntity.entity_id}</span>
              </div>
              {safetyModalEntity.asset_tag && (
                <div className="flex justify-between text-slate-400">
                  <span>Ativo Vinculado:</span>
                  <span className="text-blue-400 font-bold">
                    {safetyModalEntity.asset_tag} ({safetyModalEntity.asset_name})
                  </span>
                </div>
              )}
              <div className="flex justify-between text-slate-400 border-t border-slate-700 pt-2">
                <span>Ação Solicitada:</span>
                <span
                  className={`font-bold uppercase ${
                    targetStateAction === 'turn_on' ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {targetStateAction === 'turn_on' ? 'Ligar Dispositivo' : 'Desligar Dispositivo'}
                </span>
              </div>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 font-mono flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <p>
                A interrupção de energia, tomadas ou réguas pode provocar indisponibilidade. Tem certeza de que deseja prosseguir?
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSafetyModalEntity(null)}
                disabled={serviceActionPending}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs font-semibold uppercase tracking-wider transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmControlAction}
                disabled={serviceActionPending}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-mono text-xs font-bold uppercase tracking-wider text-white transition-all shadow-md disabled:opacity-50 ${
                  targetStateAction === 'turn_on'
                    ? 'bg-emerald-600 hover:bg-emerald-500 border border-emerald-500'
                    : 'bg-red-600 hover:bg-red-500 border border-red-500'
                }`}
              >
                <Power className="w-4 h-4" />
                {serviceActionPending ? 'Executando...' : 'Confirmar e Executar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL CUSTOMIZATION MODAL (Name, Category, Visibility, Order, Pin, Asset Binding) */}
      {editModalOpen && targetEntity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <Settings2 className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wide">
                  Personalizar Entidade Home Assistant
                </h3>
              </div>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-slate-500 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCustomization} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-slate-400 mb-1">ID da Entidade (Home Assistant)</label>
                <input
                  type="text"
                  disabled
                  value={targetEntity.entity_id}
                  className="w-full p-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-slate-400 font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Nome Amigável / Descrição Personalizada
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Sensor Temperatura CPD Rack 1"
                  value={editFriendlyName}
                  onChange={(e) => setEditFriendlyName(e.target.value)}
                  className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Este nome será exibido nos cards de Monitoramento e Controle.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-slate-300">Categoria de Agrupamento</label>
                    <button
                      type="button"
                      onClick={() => setCategoryModalOpen(true)}
                      className="text-[11px] text-blue-400 hover:underline flex items-center gap-0.5"
                    >
                      + Configurar
                    </button>
                  </div>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                  >
                    {categoriesList.map((cat) => (
                      <option key={cat.id} value={cat.nome}>
                        {cat.nome}
                      </option>
                    ))}
                    {!categoriesList.some((c) => c.nome === editCategory) && (
                      <option value={editCategory}>{editCategory}</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1">Ordem / Prioridade</label>
                  <input
                    type="number"
                    value={editDisplayOrder}
                    onChange={(e) => setEditDisplayOrder(Number(e.target.value))}
                    className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Vincular a Ativo Físico (AssetTrack)</label>
                <select
                  value={editAssetId}
                  onChange={(e) => setEditAssetId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Nenhum Ativo Vinculado --</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.e_patrimonio} — {a.nome} ({a.modelo || 'Sem modelo'})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Permite exibir a telemetria desta entidade direto na ficha técnica do ativo.
                </p>
              </div>

              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-white font-semibold block">Visibilidade no Painel Principal</span>
                    <span className="text-[11px] text-slate-400">
                      Se desativado, fica oculto nas abas de Monitoramento e Controle.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={editIsVisible}
                    onChange={(e) => setEditIsVisible(e.target.checked)}
                    className="w-5 h-5 accent-blue-600 bg-slate-800 border-slate-700 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between border-t border-slate-700/60 pt-2">
                  <div>
                    <span className="text-white font-semibold block">Fixar no Topo (Destaque)</span>
                    <span className="text-[11px] text-slate-400">
                      Posiciona esta entidade no início da listagem.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={editIsPinned}
                    onChange={(e) => setEditIsPinned(e.target.checked)}
                    className="w-5 h-5 accent-blue-600 bg-slate-800 border-slate-700 rounded cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold disabled:opacity-50"
                >
                  {savingEdit ? 'Salvando...' : 'Salvar Personalização'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CATEGORY CONFIGURATION MODAL */}
      {categoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-xl w-full shadow-2xl space-y-5 animate-in fade-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <FolderTree className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wide">
                    Configuração de Categorias
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    Crie, renomeie e gerencie as categorias para organizar os sensores e atuadores.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCategoryModalOpen(false)}
                className="text-slate-500 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Form to Add / Edit Category */}
            <form
              onSubmit={handleSaveCategory}
              className="p-4 bg-slate-800/60 border border-slate-700/80 rounded-xl space-y-3 text-xs font-mono"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-white uppercase text-[11px]">
                  {editingCatId ? 'Editar Categoria' : 'Criar Nova Categoria'}
                </span>
                {editingCatId && (
                  <button
                    type="button"
                    onClick={handleCancelEditCategory}
                    className="text-[11px] text-amber-400 hover:underline"
                  >
                    Cancelar edição
                  </button>
                )}
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Nome da Categoria</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Racks & Servidores, Nobreaks CPD, etc."
                  value={catNameInput}
                  onChange={(e) => setCatNameInput(e.target.value)}
                  className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="submit"
                  disabled={savingCat || !catNameInput.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold disabled:opacity-50 transition-all shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {savingCat ? 'Salvando...' : editingCatId ? 'Salvar Alteração' : 'Adicionar Categoria'}
                </button>
              </div>
            </form>

            {/* List of Existing Categories */}
            <div className="space-y-2">
              <span className="text-[11px] font-mono uppercase text-slate-400 block font-semibold">
                Categorias Cadastradas ({categoriesList.length})
              </span>

              <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60 font-mono text-xs">
                {categoriesList.map((cat) => {
                  const count = entityCountByCategory[cat.nome] || 0;
                  const isDefault = cat.nome === 'Geral';

                  return (
                    <div
                      key={cat.id}
                      className="p-3 flex items-center justify-between hover:bg-slate-800/40 transition-colors gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-blue-400 shrink-0">
                          <Tags className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{cat.nome}</span>
                            {isDefault && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[10px]">
                                Padrão
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500">
                            {count} {count === 1 ? 'entidade associada' : 'entidades associadas'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleStartEditCategory(cat)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 transition-colors"
                          title="Editar nome da categoria"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {!isDefault && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-red-400 border border-slate-700 transition-colors"
                            title="Excluir categoria"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setCategoryModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs font-semibold"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
