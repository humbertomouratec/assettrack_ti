import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { transactionApi } from '../api/transaction';
import { assetsApi } from '../api/assets';
import { maintenanceApi } from '../api/maintenance';
import { qrApi } from '../api/qr';
import { useAuthStore } from '../stores/authStore';
import type { Solicitacao, Asset } from '../types';
import { QRHandoverModal } from '../components/qr/QRHandoverModal';
import { 
  Plus, 
  Clock, 
  Check, 
  X, 
  AlertCircle, 
  Filter, 
  QrCode, 
  User,
  Calendar,
  Undo2,
  Search,
  Laptop,
  Monitor,
  Smartphone,
  Cpu,
  ShoppingBag,
  CheckCircle2,
  Info,
  Wrench,
  RefreshCw
} from 'lucide-react';

export const BorrowingsPage: React.FC = () => {
  const location = useLocation();
  const { user: currentUser } = useAuthStore();
  const isManagerOrAbove = ['admin', 'gerente_ti', 'gerente_infra', 'tecnico'].includes(currentUser?.role?.toLowerCase() || '');
  const canProcessReturn = ['admin', 'gerente_ti', 'gerente_infra', 'tecnico', 'rh'].includes(currentUser?.role?.toLowerCase() || '');

  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter status state
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [borrowingSearchText, setBorrowingSearchText] = useState<string>('');
  const [borrowingUserFilter, setBorrowingUserFilter] = useState<string>('');
  const [borrowingCategoryFilter, setBorrowingCategoryFilter] = useState<string>('');

  // Create request modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [motive, setMotive] = useState('');
  const [expectedDevolutionDate, setExpectedDevolutionDate] = useState('');

  // QR Handover modal integration
  const [showQRModal, setShowQRModal] = useState(false);
  const [returningItem, setReturningItem] = useState<Solicitacao | null>(null);
  const [returnCondition, setReturnCondition] = useState('Integro e funcional');
  const [returnedAccessories, setReturnedAccessories] = useState('Carregador');
  const [returnNotes, setReturnNotes] = useState('');

  // Maintenance request from borrowing item
  const [showMaintModal, setShowMaintModal] = useState(false);
  const [maintAsset, setMaintAsset] = useState<Asset | null>(null);
  const [maintDescription, setMaintDescription] = useState('');
  const [maintSubmitting, setMaintSubmitting] = useState(false);
  // System categories for filter
  const [allCategoryNames, setAllCategoryNames] = useState<string[]>([]);

  useEffect(() => {
    fetchSolicitacoes();
    fetchCategories();
    if (showCreateModal) {
      fetchAssets();
    }
  }, [showCreateModal]);

  const fetchCategories = async () => {
    try {
      const refs = await assetsApi.getReferences();
      if (refs && refs.categorias) {
        setAllCategoryNames(refs.categorias.map(c => c.nome).filter(Boolean));
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const statusParam = params.get('status');
    if (statusParam) {
      setStatusFilter(statusParam.toLowerCase());
    }
  }, [location.search]);

  const fetchSolicitacoes = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await transactionApi.listSolicitacoes();
      setSolicitacoes(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao carregar solicitações de empréstimo.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAssets = async () => {
    try {
      const data = await assetsApi.list(0, 500);
      // Filter out assets that are locked, fixed, or already in use
      // Only display assets that are "Disponível" and not locked
      // For common users, we strictly enforce hiding blocked assets, for admins we show tooltips
      const available = data.filter(a => {
        if (isManagerOrAbove) {
          return a.status === 'Disponível';
        }
        return a.status === 'Disponível' && !a.bloqueado;
      });
      setAssets(available);
    } catch (err) {
      console.error('Error fetching assets:', err);
    }
  };

  const handleCreateSolicitacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset || !motive.trim()) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }

    try {
      await transactionApi.createSolicitacao({
        asset_id: selectedAsset.id,
        motivo: motive.trim(),
        data_prevista_devolucao: expectedDevolutionDate ? new Date(expectedDevolutionDate).toISOString() : undefined,
      });

      setShowCreateModal(false);
      setSelectedAsset(null);
      setSearchQuery('');
      setSelectedCategory('');
      setMotive('');
      setExpectedDevolutionDate('');
      fetchSolicitacoes();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao criar solicitação de empréstimo.');
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await transactionApi.approveSolicitacao(id);
      fetchSolicitacoes();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao aprovar solicitação.');
    }
  };

  const handleReject = async (id: number) => {
    try {
      await transactionApi.rejectSolicitacao(id);
      fetchSolicitacoes();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao rejeitar solicitação.');
    }
  };

  const openMaintenanceModal = (item: Solicitacao) => {
    if (!item.asset) return;
    setMaintAsset(item.asset);
    setMaintDescription('');
    setShowMaintModal(true);
  };

  const closeMaintenanceModal = () => {
    setShowMaintModal(false);
    setMaintAsset(null);
    setMaintDescription('');
  };

  const handleConfirmMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintAsset || !maintDescription.trim()) {
      setError('Informe a descrição do defeito.');
      return;
    }

    setMaintSubmitting(true);
    setError(null);
    try {
      await maintenanceApi.createRequest({
        asset_id: maintAsset.id,
        descricao: maintDescription.trim(),
      });
      setShowMaintModal(false);
      setMaintAsset(null);
      setMaintDescription('');
      alert('Solicitação de manutenção criada com sucesso!');
      fetchSolicitacoes();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao abrir solicitação de manutenção.');
    } finally {
      setMaintSubmitting(false);
    }
  };

  const openReturnModal = (item: Solicitacao) => {
    setReturningItem(item);
    setReturnCondition('Integro e funcional');
    setReturnedAccessories('Carregador');
    setReturnNotes('');
  };

  const closeReturnModal = () => {
    setReturningItem(null);
    setReturnCondition('Integro e funcional');
    setReturnedAccessories('Carregador');
    setReturnNotes('');
  };

  const handleConfirmReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returningItem?.asset_id) return;

    const condition = returnCondition.trim();
    const accessories = returnedAccessories.trim();
    const notes = returnNotes.trim();

    if (!condition || !accessories) {
      setError('Preencha a condição do equipamento e os acessórios devolvidos.');
      return;
    }

    const isAssetBlocked = returningItem.asset?.bloqueado;
    let confirmationMessage = 'Confirmar a devolução deste equipamento? Ele retornará ao inventário geral.';
    if (isAssetBlocked) {
      confirmationMessage = 'ATENÇÃO: Este equipamento é um Ativo Fixo (Bloqueado/Em uso corporativo). Confirme que a conferência física foi concluída e o ativo deve voltar ao estado corporativo controlado.';
    }
    if (!window.confirm(confirmationMessage)) return;

    try {
      await transactionApi.devolverAsset(returningItem.asset_id, {
        condicao_equipamento: condition,
        acessorios_devolvidos: accessories,
        observacoes_adicionais: notes || undefined,
      });
      closeReturnModal();
      fetchSolicitacoes();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao registrar devolução.');
    }
  };

  const handleManualDelivery = async (solicitacaoId: number) => {
    const obs = window.prompt("Observação para entrega manual (opcional):", "Entrega manual confirmada pelo administrador");
    if (obs === null) return; // User cancelled

    try {
      await qrApi.confirmDelivery({
        solicitacao_id: solicitacaoId,
        bypass_pin: true,
        observacao: obs
      });
      fetchSolicitacoes();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao registrar entrega manual.');
    }
  };

  // Dynamic categories
  const categoriesList = Array.from(
    new Set(assets.map(a => a.categoria?.nome).filter(Boolean))
  ) as string[];

  // Filtered assets for catalog
  const filteredCatalogAssets = assets.filter(a => {
    // category filter
    if (selectedCategory && a.categoria?.nome !== selectedCategory) {
      return false;
    }
    // search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const nameMatch = a.nome?.toLowerCase().includes(q);
      const modelMatch = a.modelo?.toLowerCase().includes(q);
      const epMatch = a.e_patrimonio?.toLowerCase().includes(q);
      const descMatch = a.descricao?.toLowerCase().includes(q);
      const categoryMatch = a.categoria?.nome?.toLowerCase().includes(q);
      return nameMatch || modelMatch || epMatch || descMatch || categoryMatch;
    }
    return true;
  });

  const getCategoryIcon = (categoryName: string) => {
    const name = categoryName.toLowerCase();
    if (name.includes('notebook') || name.includes('computador') || name.includes('laptop') || name.includes('desktop')) {
      return <Laptop size={22} className="text-brand-primary" />;
    }
    if (name.includes('monitor') || name.includes('tela') || name.includes('tv')) {
      return <Monitor size={22} className="text-brand-primary" />;
    }
    if (name.includes('celular') || name.includes('phone') || name.includes('smartphone') || name.includes('mobile')) {
      return <Smartphone size={22} className="text-brand-primary" />;
    }
    return <Cpu size={22} className="text-brand-primary" />;
  };

  const visibleBorrowings = solicitacoes.filter((item) => isManagerOrAbove || item.solicitante_id === currentUser?.id);

  // Dynamic user options for filter
  const borrowingUsersList = Array.from(
    new Map(
      visibleBorrowings
        .filter(s => s.solicitante && s.solicitante.nome)
        .map(s => [s.solicitante!.id, s.solicitante!])
    ).values()
  ).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

  // Dynamic category options for filter (combining system categories + active borrowing asset categories)
  const borrowingCategoriesList = Array.from(
    new Set([
      ...allCategoryNames,
      ...visibleBorrowings
        .map(s => s.asset?.categoria?.nome)
        .filter((cat): cat is string => Boolean(cat))
    ])
  ).sort();

  // Filter list with User, Category, Status, and Search text
  const filteredSolicitacoes = solicitacoes.filter(s => {
    if (!isManagerOrAbove && s.solicitante_id !== currentUser?.id) {
      return false;
    }
    const status = s.status?.toLowerCase() || '';
    if (!statusFilter && status === 'devolvida') return false;
    if (statusFilter && status !== statusFilter.toLowerCase()) return false;

    // Filter by specific user
    if (borrowingUserFilter && String(s.solicitante_id) !== borrowingUserFilter) {
      return false;
    }

    // Filter by category
    if (borrowingCategoryFilter && s.asset?.categoria?.nome !== borrowingCategoryFilter) {
      return false;
    }

    // Free text search
    if (borrowingSearchText.trim()) {
      const q = borrowingSearchText.toLowerCase().trim();
      const userName = s.solicitante?.nome?.toLowerCase() || '';
      const userEmail = s.solicitante?.email?.toLowerCase() || '';
      const assetName = s.asset?.nome?.toLowerCase() || '';
      const assetPatrimonio = s.asset?.e_patrimonio?.toLowerCase() || '';
      const assetModel = s.asset?.modelo?.toLowerCase() || '';
      const motiveText = s.motivo?.toLowerCase() || '';

      const match = userName.includes(q) ||
        userEmail.includes(q) ||
        assetName.includes(q) ||
        assetPatrimonio.includes(q) ||
        assetModel.includes(q) ||
        motiveText.includes(q);

      if (!match) return false;
    }

    return true;
  });

  const borrowingMetrics = {
    pending: visibleBorrowings.filter((item) => item.status?.toLowerCase() === 'pendente').length,
    approved: visibleBorrowings.filter((item) => item.status?.toLowerCase() === 'aprovada').length,
    delivered: visibleBorrowings.filter((item) => item.status?.toLowerCase() === 'entregue').length,
    returned: visibleBorrowings.filter((item) => item.status?.toLowerCase() === 'devolvida').length,
  };


  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-brand-primary/20 bg-gradient-to-br from-[#0c66e4] via-[#1559b7] to-[#172b4d] p-5 text-white shadow-lg md:p-7">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-blue-100"><ShoppingBag size={14} /> Gestão de empréstimos</div>
          <h1 className="m-0 text-2xl font-bold tracking-tight md:text-3xl">Equipamentos em circulação, controle em dia.</h1>
          <p className="mt-2 text-sm leading-6 text-blue-100">Acompanhe aprovações, entregas, devoluções e a responsabilidade por cada ativo.</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {isManagerOrAbove && (
            <button
              onClick={() => setShowQRModal(true)}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-3.5 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-white/20 sm:flex-none"
            >
              <QrCode size={18} />
              <span>Scanner QR</span>
            </button>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-brand-primary shadow-sm hover:bg-blue-50 sm:flex-none"
          >
            <Plus size={18} />
            <span>Solicitar Equipamento</span>
          </button>
        </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Aguardando aprovação', value: borrowingMetrics.pending, hint: 'solicitações na fila', status: 'pendente', icon: Clock, tone: 'text-blue-600 bg-blue-50' },
          { label: 'Prontos para entrega', value: borrowingMetrics.approved, hint: 'aprovados pela equipe', status: 'aprovada', icon: CheckCircle2, tone: 'text-amber-600 bg-amber-50' },
          { label: 'Em uso', value: borrowingMetrics.delivered, hint: 'ativos com colaboradores', status: 'entregue', icon: User, tone: 'text-violet-600 bg-violet-50' },
          { label: 'Devolvidos', value: borrowingMetrics.returned, hint: 'retornaram ao inventário', status: 'devolvida', icon: Undo2, tone: 'text-emerald-600 bg-emerald-50' },
        ].map(({ label, value, hint, status, icon: Icon, tone }) => <button type="button" key={label} onClick={() => setStatusFilter(statusFilter === status ? '' : status)} className={`rounded-2xl border bg-brand-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${statusFilter === status ? 'border-brand-primary ring-2 ring-brand-primary/15' : 'border-brand-border'}`} aria-label={`Filtrar por ${label}`}><div className="flex items-start justify-between gap-2"><span className={`rounded-xl p-2 ${tone}`}><Icon size={17} /></span><span className="text-2xl font-bold tracking-tight text-brand-text">{value}</span></div><div className="mt-4 text-xs font-bold uppercase tracking-wide text-brand-text">{label}</div><div className="mt-1 text-xs text-brand-muted">{hint}</div></button>)}
      </div>

      {error && (
        <div className="flex items-start space-x-3 p-4 border border-red-500/20 bg-red-500/5 text-red-400 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto font-bold">×</button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="space-y-3 rounded-2xl border border-brand-border bg-brand-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="rounded-xl bg-brand-primary/10 p-2 text-brand-primary">
              <Filter size={16} />
            </span>
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-brand-text">
                Filtros & Controle de Fluxo
              </div>
              <div className="mt-0.5 text-xs text-brand-muted">
                {filteredSolicitacoes.length} solicitação(ões) encontrada(s)
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(statusFilter || borrowingSearchText || borrowingUserFilter || borrowingCategoryFilter) && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('');
                  setBorrowingSearchText('');
                  setBorrowingUserFilter('');
                  setBorrowingCategoryFilter('');
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-600 bg-red-500/10 hover:bg-red-500/20 px-3 py-2 rounded-xl transition-colors cursor-pointer"
              >
                <X size={14} />
                <span>Limpar Filtros</span>
              </button>
            )}
            <button
              type="button"
              onClick={fetchSolicitacoes}
              className="rounded-xl border border-brand-border p-2 text-brand-muted hover:border-brand-primary hover:text-brand-primary transition-colors cursor-pointer"
              title="Atualizar solicitações"
              aria-label="Atualizar solicitações"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 pt-1">
          {/* Text Search Input */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-3 text-brand-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar colaborador, patrimônio..."
              value={borrowingSearchText}
              onChange={(e) => setBorrowingSearchText(e.target.value)}
              className="w-full rounded-xl bg-brand-dark border border-brand-border pl-9 pr-8 py-2 text-xs text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-primary transition-colors"
            />
            {borrowingSearchText && (
              <button
                type="button"
                onClick={() => setBorrowingSearchText('')}
                className="absolute right-2.5 top-2.5 text-brand-muted hover:text-brand-text"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* User Filter Dropdown */}
          {isManagerOrAbove && (
            <div>
              <select
                value={borrowingUserFilter}
                onChange={(e) => setBorrowingUserFilter(e.target.value)}
                className="w-full rounded-xl bg-brand-dark border border-brand-border px-3 py-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary transition-colors cursor-pointer"
              >
                <option value="">Todos os usuários</option>
                {borrowingUsersList.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.nome} {u.cargo ? `(${u.cargo})` : `(${u.email})`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Category Filter Dropdown */}
          <div>
            <select
              value={borrowingCategoryFilter}
              onChange={(e) => setBorrowingCategoryFilter(e.target.value)}
              className="w-full rounded-xl bg-brand-dark border border-brand-border px-3 py-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary transition-colors cursor-pointer"
            >
              <option value="">Todas as categorias</option>
              {borrowingCategoriesList.map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter Dropdown */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-xl bg-brand-dark border border-brand-border px-3 py-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary transition-colors cursor-pointer"
            >
              <option value="">Status (Exceto Devolvidas)</option>
              <option value="pendente">Pendente</option>
              <option value="aprovada">Aprovada</option>
              <option value="rejeitada">Rejeitada</option>
              <option value="entregue">Entregue / Em Uso</option>
              <option value="devolvida">Devolvida (Histórico)</option>
            </select>
          </div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="p-12 text-center text-brand-muted font-mono text-sm">Carregando solicitações...</div>
      ) : filteredSolicitacoes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-border bg-brand-card/60 p-12 text-center text-brand-muted shadow-sm">
          <CheckCircle2 size={28} className="mx-auto mb-3 text-emerald-500" />
          <div className="text-sm font-semibold text-brand-text">Tudo organizado por aqui</div>
          <div className="mt-1 text-sm">Nenhuma solicitação de empréstimo registrada.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSolicitacoes.map((item) => {
            const st = item.status?.toLowerCase() || '';
            return (
              <div
                key={item.id}
                className="flex flex-col justify-between space-y-4 rounded-2xl border border-brand-border bg-brand-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-primary/40 hover:shadow-md"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-brand-text text-sm">{item.asset?.nome || 'Equipamento'}</h3>
                      <p className="text-xs text-brand-muted font-mono mt-0.5">EP: {item.asset?.e_patrimonio}</p>
                    </div>
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 border ${
                      st === 'pendente'
                        ? 'text-blue-400 bg-blue-400/10 border-blue-400/20'
                        : st === 'aprovada'
                        ? 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                        : st === 'entregue'
                        ? 'text-brand-primary bg-brand-primary/10 border-brand-primary/20'
                        : st === 'devolvida'
                        ? 'text-brand-muted bg-brand-muted/10 border-brand-border'
                        : 'text-red-400 bg-red-500/10 border-red-500/20'
                    }`}>
                      {item.status}
                    </span>
                  </div>

                  <div className="rounded-xl border border-brand-border/40 bg-brand-dark/40 p-3 text-xs font-mono text-brand-muted whitespace-pre-wrap">
                    Motivo: "{item.motivo}"
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-brand-muted font-mono pt-1">
                    <div className="flex items-center space-x-1">
                      <User size={12} />
                      <span>Solicitante: {item.solicitante?.nome || 'Usuário'}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Calendar size={12} />
                      <span>Abertura: {new Date(item.data_solicitacao).toLocaleDateString('pt-BR')}</span>
                    </div>
                    {item.data_prevista_devolucao && (
                      <div className="flex items-center space-x-1 text-amber-500/80">
                        <Clock size={12} />
                        <span>Prev. Retorno: {new Date(item.data_prevista_devolucao).toLocaleDateString('pt-BR')}</span>
                      </div>
                    )}
                    {st === 'devolvida' && item.data_devolucao && (
                      <div className="flex items-center space-x-1 text-brand-primary/80">
                        <Check size={12} />
                        <span>Recebido em: {new Date(item.data_devolucao).toLocaleDateString('pt-BR')}</span>
                      </div>
                    )}
                  </div>

                  {item.asset?.requer_termo_rh && (
                    <div className="flex items-center space-x-1.5 mt-2">
                      <span className="text-[10px] font-mono text-brand-muted">Termo RH:</span>
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                        item.termo?.status === 'Assinado'
                          ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                          : 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                      }`}>
                        {item.termo?.status === 'Assinado' ? 'Assinado' : 'Pendente de Assinatura'}
                      </span>
                    </div>
                  )}


                  {st === 'devolvida' && (
                    <div className="text-xs text-brand-muted bg-brand-dark/40 p-3 border border-brand-border/40 space-y-1">
                      <div>
                        Recebido por: <span className="text-brand-text">{item.recebedor?.nome || 'Registro interno'}</span>
                      </div>
                      {item.condicao_devolucao ? (
                        <div>
                          Condição do recebimento: <span className="text-brand-text">{item.condicao_devolucao}</span>
                        </div>
                      ) : item.observacao_devolucao ? (
                        <div>
                          Condição do recebimento: <span className="text-brand-text">{item.observacao_devolucao}</span>
                        </div>
                      ) : null}
                      {item.acessorios_devolvidos && (
                        <div>
                          Acessórios devolvidos: <span className="text-brand-text">{item.acessorios_devolvidos}</span>
                        </div>
                      )}
                      {item.observacoes_devolucao && (
                        <div>
                          Observações adicionais: <span className="text-brand-text">{item.observacoes_devolucao}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex space-x-2 border-t border-brand-border/40 pt-3">
                  {isManagerOrAbove && st === 'pendente' && (
                    <>
                      <button
                        onClick={() => handleApprove(item.id)}
                        className="flex-1 py-1.5 bg-brand-primary hover:bg-brand-primary/95 text-brand-dark text-xs font-semibold flex items-center justify-center space-x-1"
                      >
                        <Check size={14} />
                        <span>Aprovar</span>
                      </button>
                      <button
                        onClick={() => handleReject(item.id)}
                        className="flex-1 py-1.5 bg-brand-muted/10 border border-brand-border hover:bg-red-500/10 hover:text-red-400 text-brand-text text-xs font-semibold flex items-center justify-center space-x-1"
                      >
                        <X size={14} />
                        <span>Rejeitar</span>
                      </button>
                    </>
                  )}

                  {isManagerOrAbove && st === 'aprovada' && (
                    <>
                      <button
                        onClick={() => handleManualDelivery(item.id)}
                        className="flex-1 py-1.5 bg-brand-primary hover:bg-brand-primary/95 text-brand-dark text-xs font-semibold flex items-center justify-center space-x-1"
                      >
                        <Check size={14} />
                        <span>Entregar (Manual)</span>
                      </button>
                      <button
                        onClick={() => setShowQRModal(true)}
                        className="flex-1 py-1.5 bg-brand-muted/10 border border-brand-border hover:bg-brand-primary hover:text-brand-dark text-brand-text text-xs font-semibold flex items-center justify-center space-x-1"
                      >
                        <QrCode size={14} />
                        <span>Entregar c/ QR</span>
                      </button>
                    </>
                  )}

                  {canProcessReturn && st === 'entregue' && item.asset_id && (
                    <button
                      onClick={() => openReturnModal(item)}
                      className="flex-1 py-1.5 bg-brand-muted/10 border border-brand-border hover:bg-brand-primary hover:text-brand-dark text-brand-text text-xs font-semibold flex items-center justify-center space-x-1 transition-all"
                    >
                      <Undo2 size={14} />
                      <span>Confirmar Devolução</span>
                    </button>
                  )}

                  {st === 'entregue' && item.asset_id && (!item.asset?.requer_termo_rh || item.termo?.status === 'Assinado') && (
                    <button
                      onClick={() => openMaintenanceModal(item)}
                      className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-600 text-brand-dark text-xs font-semibold flex items-center justify-center space-x-1 transition-all"
                    >
                      <Wrench size={14} />
                      <span>Solicitar Manutenção</span>
                    </button>
                  )}

                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* QR Handover Modal */}
      <QRHandoverModal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        onSuccess={fetchSolicitacoes}
      />

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/90 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-6xl bg-brand-card border border-brand-border shadow-2xl overflow-hidden flex flex-col my-8 max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border bg-brand-dark/50">
              <div>
                <h3 className="font-semibold text-lg text-brand-text flex items-center space-x-2">
                  <ShoppingBag className="text-brand-primary" size={20} />
                  <span>Catálogo de Equipamentos para Empréstimo</span>
                </h3>
                <p className="text-xs text-brand-muted mt-0.5">Selecione o equipamento disponível por categoria para abrir a solicitação.</p>
              </div>
              <button 
                onClick={() => {
                  setShowCreateModal(false);
                  setSelectedAsset(null);
                  setSearchQuery('');
                  setSelectedCategory('');
                }} 
                className="text-brand-muted hover:text-brand-text p-1 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
              {/* LEFT SIDE: Catalog & Categories */}
              <div className="flex-1 flex flex-col md:w-2/3 border-r border-brand-border/60 overflow-hidden">
                {/* Search and Filters top bar */}
                <div className="p-4 border-b border-brand-border bg-brand-dark/20 flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 text-brand-muted" size={16} />
                    <input
                      type="text"
                      placeholder="Pesquisar por nome, patrimônio, modelo..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-brand-dark border border-brand-border pl-10 pr-4 py-2 text-sm text-brand-text placeholder-brand-muted/40 focus:outline-none focus:border-brand-primary"
                    />
                  </div>
                  <div className="w-full sm:w-48">
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                    >
                      <option value="">Todas Categorias</option>
                      {categoriesList.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* E-commerce grid body */}
                <div className="flex-1 overflow-y-auto p-6 bg-brand-dark/5">
                  {/* Category Filter Badges */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <button
                      onClick={() => setSelectedCategory('')}
                      className={`px-3 py-1 text-xs font-mono tracking-wider border uppercase transition-all ${
                        !selectedCategory 
                          ? 'border-brand-primary bg-brand-primary/10 text-brand-primary font-semibold' 
                          : 'border-brand-border bg-brand-card hover:border-brand-primary/40 text-brand-muted'
                      }`}
                    >
                      Todos ({assets.length})
                    </button>
                    {categoriesList.map(cat => {
                      const count = assets.filter(a => a.categoria?.nome === cat).length;
                      return (
                        <button
                          key={cat}
                          onClick={() => setSelectedCategory(cat)}
                          className={`px-3 py-1 text-xs font-mono tracking-wider border uppercase transition-all ${
                            selectedCategory === cat 
                              ? 'border-brand-primary bg-brand-primary/10 text-brand-primary font-semibold' 
                              : 'border-brand-border bg-brand-card hover:border-brand-primary/40 text-brand-muted'
                          }`}
                        >
                          {cat} ({count})
                        </button>
                      );
                    })}
                  </div>

                  {filteredCatalogAssets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center border border-dashed border-brand-border/60 p-6 bg-brand-card/10">
                      <AlertCircle className="text-brand-muted/60 mb-2" size={32} />
                      <p className="text-sm text-brand-muted">Nenhum equipamento disponível encontrado nesta categoria ou pesquisa.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {filteredCatalogAssets.map(a => {
                        const isSelected = selectedAsset?.id === a.id;
                        return (
                          <div
                            key={a.id}
                            onClick={() => setSelectedAsset(a)}
                            className={`border bg-brand-card p-4 flex flex-col justify-between hover:border-brand-primary/50 transition-all cursor-pointer relative group ${
                              isSelected ? 'border-brand-primary ring-1 ring-brand-primary/30' : 'border-brand-border'
                            }`}
                          >
                            <div className="space-y-3">
                              <div className="flex items-start justify-between">
                                <div className="p-2 border border-brand-border/60 bg-brand-dark/20 group-hover:border-brand-primary/40 transition-colors">
                                  {getCategoryIcon(a.categoria?.nome || '')}
                                </div>
                                <div className="flex flex-col items-end space-y-1">
                                  <span className="text-[10px] font-mono uppercase bg-brand-dark border border-brand-border px-1.5 py-0.5 text-brand-text font-bold">
                                    EP: {a.e_patrimonio}
                                  </span>
                                  {a.requer_termo_rh && (
                                    <span className="text-[9px] font-mono font-bold uppercase bg-amber-500/15 border border-amber-500/35 text-amber-500 px-1.5 py-0.2">
                                      Termo RH
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div>
                                <h4 className="font-semibold text-brand-text text-sm group-hover:text-brand-primary transition-colors truncate">
                                  {a.nome}
                                </h4>
                                <p className="text-xs text-brand-muted truncate mt-0.5">
                                  Modelo: {a.modelo || '—'}
                                </p>
                                {a.numero_serie && (
                                  <p className="text-[10px] text-brand-muted font-mono mt-0.5">
                                    S/N: {a.numero_serie}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="mt-4 pt-3 border-t border-brand-border/40 flex items-center justify-between">
                              <span className="text-[10px] text-brand-muted uppercase font-mono tracking-wider">
                                {a.categoria?.nome || 'Geral'}
                              </span>
                              <button
                                type="button"
                                className={`px-3 py-1 text-xs font-semibold uppercase transition-all ${
                                  isSelected
                                    ? 'bg-brand-primary text-brand-dark'
                                    : 'bg-brand-dark border border-brand-border hover:border-brand-primary/60 text-brand-text'
                                }`}
                              >
                                {isSelected ? 'Selecionado' : 'Selecionar'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT SIDE: Checkout Form */}
              <div className="w-full md:w-1/3 bg-brand-dark/15 flex flex-col justify-between overflow-y-auto">
                <form onSubmit={handleCreateSolicitacao} className="p-6 space-y-6 flex-1 flex flex-col justify-between">
                  <div className="space-y-6">
                    <div className="border-b border-brand-border pb-3">
                      <h4 className="font-semibold text-sm uppercase tracking-wider text-brand-text font-mono">
                        Checkout do Empréstimo
                      </h4>
                      <p className="text-xs text-brand-muted mt-1">Preencha os dados corporativos da solicitação.</p>
                    </div>

                    {/* Selected Item Detail */}
                    {selectedAsset ? (
                      <div className="border border-brand-primary/20 bg-brand-primary/5 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-mono tracking-wider text-brand-primary font-bold">Equipamento Selecionado</span>
                          <button 
                            type="button" 
                            onClick={() => setSelectedAsset(null)}
                            className="text-brand-muted hover:text-red-400 text-xs font-semibold"
                          >
                            Remover
                          </button>
                        </div>
                        <div>
                          <h5 className="font-bold text-brand-text text-sm">{selectedAsset.nome}</h5>
                          <p className="text-xs text-brand-muted mt-0.5">Patrimônio: {selectedAsset.e_patrimonio}</p>
                          {selectedAsset.modelo && <p className="text-xs text-brand-muted">Modelo: {selectedAsset.modelo}</p>}
                        </div>
                        {selectedAsset.requer_termo_rh && (
                          <div className="flex items-start space-x-2 bg-amber-500/10 border border-amber-500/20 p-2 text-[10px] text-amber-500">
                            <Info size={14} className="shrink-0 mt-0.5" />
                            <span>Atenção: Este equipamento exige termo de responsabilidade assinado com o RH após a entrega.</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="border border-dashed border-brand-border p-8 text-center text-brand-muted text-xs space-y-2 flex flex-col items-center justify-center">
                        <ShoppingBag size={24} className="text-brand-muted/40" />
                        <span>Nenhum equipamento selecionado do catálogo ainda.</span>
                      </div>
                    )}

                    {/* Loan Motive */}
                    <div className="space-y-1">
                      <label className="text-xs text-brand-muted block font-semibold">Motivo do Empréstimo *</label>
                      <textarea
                        required
                        placeholder="Ex.: Trabalho remoto emergencial, viagem a negócios ou substituição temporária de máquina com defeito."
                        value={motive}
                        onChange={(e) => setMotive(e.target.value)}
                        rows={3}
                        className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm focus:outline-none focus:border-brand-primary text-brand-text placeholder-brand-muted/30 resize-none"
                      />
                    </div>

                    {/* Expected Return Date */}
                    <div className="space-y-1">
                      <label className="text-xs text-brand-muted block font-semibold">Data Prevista para Devolução (Opcional)</label>
                      <input
                        type="date"
                        value={expectedDevolutionDate}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={(e) => setExpectedDevolutionDate(e.target.value)}
                        className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm focus:outline-none focus:border-brand-primary text-brand-text"
                      />
                      <p className="text-[10px] text-brand-muted">Deixe em branco para empréstimos por tempo indeterminado.</p>
                    </div>
                  </div>

                  <div className="space-y-3 pt-6 border-t border-brand-border/40">
                    <button
                      type="submit"
                      disabled={!selectedAsset}
                      className={`w-full py-2.5 font-semibold text-sm flex items-center justify-center space-x-2 transition-all ${
                        selectedAsset
                          ? 'bg-brand-primary hover:bg-brand-primary/95 text-brand-dark cursor-pointer'
                          : 'bg-brand-muted/15 border border-brand-border text-brand-muted cursor-not-allowed'
                      }`}
                    >
                      <CheckCircle2 size={16} />
                      <span>Confirmar Solicitação</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateModal(false);
                        setSelectedAsset(null);
                        setSearchQuery('');
                        setSelectedCategory('');
                      }}
                      className="w-full py-2 bg-brand-dark border border-brand-border hover:bg-brand-card text-brand-muted text-xs transition-all font-mono uppercase tracking-wider"
                    >
                      Cancelar e Fechar
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {returningItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/80 backdrop-blur-md">
          <div className="w-full max-w-lg bg-brand-card border border-brand-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border bg-brand-dark/50">
              <div>
                <h3 className="font-semibold text-lg text-brand-text">Registrar Devolução</h3>
                <p className="text-xs text-brand-muted mt-1">
                  {returningItem.asset?.nome || 'Equipamento'}{returningItem.asset?.e_patrimonio ? ` · EP ${returningItem.asset.e_patrimonio}` : ''}
                </p>
              </div>
              <button onClick={closeReturnModal} className="text-brand-muted hover:text-brand-text">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleConfirmReturn} className="p-6 space-y-4">
              <div className="p-4 border border-brand-primary/20 bg-brand-primary/5 text-xs text-brand-muted space-y-1">
                <div>Solicitante: <span className="text-brand-text">{returningItem.solicitante?.nome || 'Usuário'}</span></div>
                <div>Motivo do empréstimo: <span className="text-brand-text">{returningItem.motivo}</span></div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-brand-muted">Condição do Equipamento no Recebimento</label>
                <select
                  value={returnCondition}
                  onChange={(e) => setReturnCondition(e.target.value)}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                >
                  <option>Integro e funcional</option>
                  <option>Com desgaste de uso, mas funcional</option>
                  <option>Com avarias leves</option>
                  <option>Com defeito funcional</option>
                  <option>Incompleto / faltando acessorios</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-brand-muted">Acessórios Devolvidos</label>
                <input
                  type="text"
                  required
                  value={returnedAccessories}
                  onChange={(e) => setReturnedAccessories(e.target.value)}
                  placeholder="Ex.: carregador, mouse, mochila"
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm focus:outline-none focus:border-brand-primary text-brand-text placeholder-brand-muted/30"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-brand-muted">Observações Adicionais</label>
                <textarea
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  rows={4}
                  placeholder="Ex.: carcaça com risco lateral, recebido por RH sem caixa, encaminhar para limpeza..."
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm focus:outline-none focus:border-brand-primary text-brand-text placeholder-brand-muted/30 resize-none"
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={closeReturnModal}
                  className="w-1/3 py-2 bg-brand-dark border border-brand-border hover:bg-brand-card text-brand-muted text-sm transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-brand-primary hover:bg-brand-primary/95 text-brand-dark font-semibold text-sm transition-all"
                >
                  Confirmar Devolução
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showMaintModal && maintAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/80 backdrop-blur-md">
          <div className="w-full max-w-lg bg-brand-card border border-brand-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border bg-brand-dark/50">
              <div>
                <h3 className="font-semibold text-lg text-brand-text flex items-center space-x-2">
                  <Wrench className="text-amber-500" size={20} />
                  <span>Solicitar Manutenção</span>
                </h3>
                <p className="text-xs text-brand-muted mt-1">
                  Ativo: <span className="text-brand-text">{maintAsset.nome}</span>{maintAsset.e_patrimonio ? ` · EP ${maintAsset.e_patrimonio}` : ''}
                </p>
              </div>
              <button onClick={closeMaintenanceModal} className="text-brand-muted hover:text-brand-text">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleConfirmMaintenance} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-brand-muted">Descrição Detalhada do Defeito / Problema</label>
                <textarea
                  required
                  value={maintDescription}
                  onChange={(e) => setMaintDescription(e.target.value)}
                  rows={5}
                  placeholder="Por favor, descreva detalhadamente qual problema ou defeito o equipamento está apresentando..."
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm focus:outline-none focus:border-brand-primary text-brand-text placeholder-brand-muted/30 resize-none"
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={closeMaintenanceModal}
                  className="w-1/3 py-2 bg-brand-dark border border-brand-border hover:bg-brand-card text-brand-muted text-sm transition-all"
                  disabled={maintSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-brand-dark font-semibold text-sm transition-all flex items-center justify-center space-x-1"
                  disabled={maintSubmitting}
                >
                  {maintSubmitting ? 'Enviando...' : 'Enviar Solicitação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
