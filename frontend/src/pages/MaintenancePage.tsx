import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { maintenanceApi } from '../api/maintenance';
import { assetsApi } from '../api/assets';
import { procurementApi } from '../api/procurement';
import { useAuthStore } from '../stores/authStore';
import type { SolicitacaoManutencao, Asset } from '../types';
import { QRHandoverModal } from '../components/qr/QRHandoverModal';
import {
  Plus,
  Clock,
  Check,
  X,
  AlertCircle,
  Filter,
  QrCode,
  DollarSign,
  User,
  ExternalLink,
  ShoppingCart,
  CheckCircle2,
  Link as LinkIcon,
  RefreshCw
} from 'lucide-react';

export const MaintenancePage: React.FC = () => {
  const location = useLocation();
  const { user: currentUser } = useAuthStore();
  const isTechnicianOrAbove = currentUser?.role === 'admin' || currentUser?.role === 'gerente_ti' || currentUser?.role === 'tecnico';

  const [requests, setRequests] = useState<SolicitacaoManutencao[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tabs: 'requests' | 'active' | 'history'
  const [activeTab, setActiveTab] = useState<'requests' | 'active' | 'history'>('requests');

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Request creation modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<number | ''>('');
  const [newDescription, setNewDescription] = useState('');

  // Rejection modal
  const [rejectingRequestId, setRejectingRequestId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Conclusion modal
  const [concludingRequestId, setConcludingRequestId] = useState<number | null>(null);
  const [conclusionNotes, setConclusionNotes] = useState('');
  const [conclusionCost, setConclusionCost] = useState<string>('');
  const [cancelPendingPurchases, setCancelPendingPurchases] = useState(true);

  // QR Handover modal integration
  const [showQRModal, setShowQRModal] = useState(false);

  // Purchase request modal for maintenance parts
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [purchaseTargetRequest, setPurchaseTargetRequest] = useState<SolicitacaoManutencao | null>(null);
  const [partName, setPartName] = useState('');
  const [partLink, setPartLink] = useState('');
  const [partQty, setPartQty] = useState<number>(1);
  const [partEstimatedVal, setPartEstimatedVal] = useState<string>('');
  const [partJustification, setPartJustification] = useState('');
  const [partItemType, setPartItemType] = useState('Consumo');
  const [partSubmitting, setPartSubmitting] = useState(false);
  const [purchaseSuccessMessage, setPurchaseSuccessMessage] = useState<string | null>(null);

  // Purchase request cancellation modal
  const [cancelPurchaseModalOpen, setCancelPurchaseModalOpen] = useState(false);
  const [selectedPurchaseToCancel, setSelectedPurchaseToCancel] = useState<{ id: number; numero: string; item: string } | null>(null);
  const [cancelPurchaseReason, setCancelPurchaseReason] = useState('');
  const [cancelPurchaseLoading, setCancelPurchaseLoading] = useState(false);

  const handleOpenPurchaseModal = (req: SolicitacaoManutencao) => {
    setPurchaseTargetRequest(req);
    setPartName('');
    setPartLink('');
    setPartQty(1);
    setPartEstimatedVal('');
    setPartJustification(`Compra de peça/reposição para o ativo ${req.asset?.e_patrimonio} (${req.asset?.nome}) - Chamado #${req.id}`);
    setPartItemType('Consumo');
    setPurchaseSuccessMessage(null);
    setPurchaseModalOpen(true);
  };

  const handleSubmitPurchaseRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseTargetRequest || !partName.trim()) {
      setError('Informe o nome do produto/peça a comprar.');
      return;
    }

    try {
      setPartSubmitting(true);
      setError(null);
      const val = partEstimatedVal ? Number(partEstimatedVal.replace(',', '.')) : 0;
      await procurementApi.createMaintenancePurchaseRequest({
        nome_produto: partName.trim(),
        link_produto: partLink.trim() || undefined,
        quantidade: partQty > 0 ? partQty : 1,
        valor_estimado: isNaN(val) ? 0 : val,
        justificativa: partJustification.trim(),
        tipo_item: partItemType,
        asset_id: purchaseTargetRequest.asset_id,
        maintenance_request_id: purchaseTargetRequest.id,
      });

      setPurchaseSuccessMessage('Solicitação de compra encaminhada com sucesso para o Comprador!');
      fetchRequests();
      setTimeout(() => {
        setPurchaseModalOpen(false);
        setPurchaseSuccessMessage(null);
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.detail || 'Erro ao gerar solicitação de compra.');
    } finally {
      setPartSubmitting(false);
    }
  };

  const handleOpenCancelPurchaseModal = (purchaseId: number, numero: string, itemDesc: string) => {
    setSelectedPurchaseToCancel({ id: purchaseId, numero, item: itemDesc });
    setCancelPurchaseReason('');
    setCancelPurchaseModalOpen(true);
  };

  const handleConfirmCancelPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPurchaseToCancel) return;
    try {
      setCancelPurchaseLoading(true);
      await procurementApi.cancelRequest(selectedPurchaseToCancel.id, cancelPurchaseReason.trim() || undefined);
      setCancelPurchaseModalOpen(false);
      setSelectedPurchaseToCancel(null);
      setCancelPurchaseReason('');
      fetchRequests();
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.detail || 'Erro ao cancelar solicitação de compra.');
    } finally {
      setCancelPurchaseLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    if (showCreateModal) {
      fetchAssets();
    }
  }, [showCreateModal]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'requests' || tabParam === 'active' || tabParam === 'history') {
      setActiveTab(tabParam);
    }

    const statusParam = params.get('status');
    if (statusParam) {
      setStatusFilter(statusParam);
    }
  }, [location.search]);

  const fetchRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await maintenanceApi.listRequests();
      setRequests(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao buscar solicitações de manutenção.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAssets = async () => {
    try {
      const data = await assetsApi.list(0, 500);
      // For common users, filter out locked assets. For admins, show everything.
      if (isTechnicianOrAbove) {
        setAssets(data);
      } else {
        // filter out blocked/in maintenance assets
        setAssets(data.filter(a => !a.bloqueado && a.status === 'Disponível'));
      }
    } catch (err) {
      console.error('Error fetching assets:', err);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssetId || !newDescription) {
      setError('Preencha os campos obrigatórios.');
      return;
    }

    try {
      const request = await maintenanceApi.createRequest({
        asset_id: Number(selectedAssetId),
        descricao: newDescription,
      });

      setRequests([request, ...requests]);
      setShowCreateModal(false);
      setSelectedAssetId('');
      setNewDescription('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao abrir solicitação.');
    }
  };

  const handleAcceptRequest = async (id: number) => {
    try {
      await maintenanceApi.acceptRequest(id);
      fetchRequests();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao aceitar manutenção.');
    }
  };

  const handleRejectRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingRequestId || !rejectionReason) return;

    try {
      await maintenanceApi.rejectRequest(rejectingRequestId, rejectionReason);
      setRejectingRequestId(null);
      setRejectionReason('');
      fetchRequests();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao rejeitar manutenção.');
    }
  };

  const handleConcludeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!concludingRequestId || !conclusionNotes) return;

    try {
      const cost = conclusionCost ? Number(conclusionCost) : undefined;
      await maintenanceApi.concludeRequest(concludingRequestId, conclusionNotes, cost, cancelPendingPurchases);
      setConcludingRequestId(null);
      setConclusionNotes('');
      setConclusionCost('');
      setCancelPendingPurchases(true);
      fetchRequests();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao registrar conclusão.');
    }
  };

  const handleConfirmReceiptDirect = async (id: number) => {
    try {
      await maintenanceApi.confirmReceipt(id);
      fetchRequests();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao confirmar recebimento do ativo.');
    }
  };

  const getMaintenanceAssetLocation = (asset?: Asset) => {
    if (!asset) return '—';
    if (asset.current_local?.nome) return asset.current_local.nome;
    if (asset.status === 'Manutenção' && asset.prev_local?.nome) return `${asset.prev_local.nome} (origem)`;
    return '—';
  };

  const getMaintenanceAssetStorage = (asset?: Asset) => {
    if (!asset) return '';
    if (asset.current_armazenamento?.nome) return asset.current_armazenamento.nome;
    if (asset.status === 'Manutenção' && asset.prev_armazenamento?.nome) return `${asset.prev_armazenamento.nome} (origem)`;
    return '';
  };

  // Filter requests based on tab and filters
  const filteredRequests = requests.filter(r => {
    if (activeTab === 'requests') {
      // Show pending requests
      if (r.status !== 'pendente' && r.status !== 'rejeitada') return false;
    } else if (activeTab === 'active') {
      // Show active maintenance entries (accepted/awaiting handover)
      if (r.status === 'pendente' || r.status === 'rejeitada' || r.status === 'concluida' || r.status === 'entregue') return false;
    } else {
      // Show finished maintenance history
      if (r.status !== 'concluida' && r.status !== 'entregue') return false;
    }

    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  });


  // Workshop Metrics calculations
  const totalInWorkshop = requests.filter(r => r.status === 'aceita' || r.status === 'aguardando_entrega' || r.status === 'em_andamento').length;
  const totalConcluded = requests.filter(r => r.status === 'concluida' || r.status === 'entregue').length;
  const totalPending = requests.filter(r => r.status === 'pendente').length;
  const totalSpent = requests.reduce((sum, r) => sum + (r.manutencao?.custo || 0), 0);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-brand-primary/20 bg-gradient-to-br from-[#0c66e4] via-[#1559b7] to-[#172b4d] p-5 text-white shadow-lg md:p-7">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-blue-100"><Clock size={14} /> Centro de oficina</div>
            <h1 className="m-0 max-w-xl text-2xl font-bold tracking-tight md:text-3xl">Manutenções no ritmo certo.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">Centralize chamados, acompanhe reparos e devolva ativos à operação com rastreabilidade.</p>
          </div>
          <div className="flex flex-wrap gap-2">
          {isTechnicianOrAbove && (
            <button
              onClick={() => setShowQRModal(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-white/20"
            >
              <QrCode size={18} />
              <span>Scanner de Handover</span>
            </button>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-brand-primary shadow-sm hover:bg-blue-50"
          >
            <Plus size={18} />
            <span>Solicitar Manutenção</span>
          </button>
          </div>
        </div>
      </section>

      {/* Workshop Summary Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Fila de espera', value: totalPending, hint: 'aguardando triagem', icon: Clock, tone: 'text-blue-600 bg-blue-50' },
          { label: 'Na bancada', value: totalInWorkshop, hint: 'reparos em andamento', icon: AlertCircle, tone: 'text-amber-600 bg-amber-50' },
          { label: 'Reparos concluídos', value: totalConcluded, hint: 'finalizados ou entregues', icon: CheckCircle2, tone: 'text-emerald-600 bg-emerald-50' },
          { label: 'Custo acumulado', value: formatCurrency(totalSpent), hint: 'investimento em reparos', icon: DollarSign, tone: 'text-emerald-600 bg-emerald-50' },
        ].map(({ label, value, hint, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-brand-border bg-brand-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2"><span className={`rounded-xl p-2 ${tone}`}><Icon size={17} /></span><span className="text-2xl font-bold tracking-tight text-brand-text">{value}</span></div>
            <div className="mt-4 text-xs font-bold uppercase tracking-wide text-brand-text">{label}</div>
            <div className="mt-1 text-xs text-brand-muted">{hint}</div>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-start space-x-3 p-4 border border-red-500/20 bg-red-500/5 text-red-400 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto font-bold">×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-t-2xl border-b border-brand-border flex items-center gap-1.5 bg-white/20 pb-0.5 no-scrollbar scroll-smooth">
        <button
          onClick={() => { setActiveTab('requests'); setStatusFilter(''); }}
          className={`shrink-0 whitespace-nowrap py-2.5 sm:py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer rounded-t-lg ${activeTab === 'requests'
            ? 'border-brand-primary text-brand-primary bg-white font-bold shadow-sm'
            : 'border-transparent text-brand-text bg-white/40 opacity-70 hover:opacity-100 hover:bg-white/70'
            }`}
        >
          Triagem e Solicitações ({totalPending})
        </button>
        <button
          onClick={() => { setActiveTab('active'); setStatusFilter(''); }}
          className={`shrink-0 whitespace-nowrap py-2.5 sm:py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer rounded-t-lg ${activeTab === 'active'
            ? 'border-brand-primary text-brand-primary bg-white font-bold shadow-sm'
            : 'border-transparent text-brand-text bg-white/40 opacity-70 hover:opacity-100 hover:bg-white/70'
            }`}
        >
          Oficina Ativa ({totalInWorkshop})
        </button>
        <button
          onClick={() => { setActiveTab('history'); setStatusFilter(''); }}
          className={`shrink-0 whitespace-nowrap py-2.5 sm:py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-all cursor-pointer rounded-t-lg ${activeTab === 'history'
            ? 'border-brand-primary text-brand-primary bg-white font-bold shadow-sm'
            : 'border-transparent text-brand-text bg-white/40 opacity-70 hover:opacity-100 hover:bg-white/70'
            }`}
        >
          Histórico de Reparos ({totalConcluded})
        </button>
      </div>

      {/* Filters (Conditional based on active tab) */}
      <div className="flex flex-col gap-3 rounded-2xl border border-brand-border bg-brand-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-brand-muted">
          <Filter size={14} />
          <span>Filtrar visão atual</span>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full rounded-xl border border-brand-border bg-brand-dark px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary sm:w-auto"
        >
          <option value="">Todos</option>
          {activeTab === 'requests' ? (
            <>
              <option value="pendente">Pendente</option>
              <option value="rejeitada">Rejeitada</option>
            </>
          ) : activeTab === 'active' ? (
            <>
              <option value="aceita">Aceita / Iniciada</option>
              <option value="aguardando_entrega">Aguardando Entrega</option>
            </>
          ) : (
            <>
              <option value="concluida">Concluída</option>
              <option value="entregue">Entregue ao Solicitante</option>
            </>
          )}
        </select>
      </div>


      {/* Grid List */}
      {loading ? (
        <div className="p-12 text-center text-brand-muted font-mono text-sm">Buscando registros...</div>
      ) : filteredRequests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-border bg-brand-card/60 p-12 text-center text-brand-muted shadow-sm">
          <CheckCircle2 size={28} className="mx-auto mb-3 text-emerald-500" />
          <div className="text-sm font-semibold text-brand-text">Tudo limpo por aqui</div>
          <div className="mt-1 text-sm">Nenhuma solicitação encontrada nesta visão.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredRequests.map((request) => (
            <div
              key={request.id}
              className="flex flex-col justify-between space-y-4 rounded-2xl border border-brand-border bg-brand-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-primary/40 hover:shadow-md"
            >
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-brand-text text-sm">{request.asset?.nome}</h3>
                    <p className="text-xs text-brand-muted font-mono mt-0.5">EP: {request.asset?.e_patrimonio}</p>
                  </div>
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 border ${request.status === 'pendente'
                    ? 'text-blue-400 bg-blue-400/10 border-blue-400/20'
                    : request.status === 'aceita'
                      ? 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                      : request.status === 'aguardando_entrega'
                        ? 'text-teal-400 bg-teal-400/10 border-teal-400/20'
                        : request.status === 'concluida'
                          ? 'text-brand-primary bg-brand-primary/10 border-brand-primary/20'
                          : 'text-red-400 bg-red-500/10 border-red-500/20'
                    }`}>
                    {request.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="rounded-xl border border-brand-border/40 bg-brand-dark/40 p-3 text-xs font-mono text-brand-muted whitespace-pre-wrap">
                  {request.descricao}
                </div>

                {request.observacao_resposta && (
                  <div className="text-xs text-red-400/90 italic">
                    Rejeitado por: "{request.observacao_resposta}"
                  </div>
                )}

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-brand-muted font-mono pt-1">
                  <div className="flex items-center space-x-1">
                    <User size={12} />
                    <span>Solicitante: {request.solicitante?.nome || 'Usuário'}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span>Local: {getMaintenanceAssetLocation(request.asset)}</span>
                  </div>
                  {getMaintenanceAssetStorage(request.asset) && (
                    <div className="flex items-center space-x-1">
                      <span>Armaz.: {getMaintenanceAssetStorage(request.asset)}</span>
                    </div>
                  )}
                  <div className="flex items-center space-x-1">
                    <Clock size={12} />
                    <span>Abertura: {new Date(request.data_solicitacao).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>

                {/* Linked Purchase Requests (Peças Solicitadas) */}
                {request.solicitacoes_compra && request.solicitacoes_compra.length > 0 && (
                  <div className="mt-3 space-y-2.5 rounded-xl border border-blue-500/25 bg-blue-500/5 p-3.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-blue-400">
                        <ShoppingCart size={15} />
                        <span>Peças / Pedidos de Compra ({request.solicitacoes_compra.length})</span>
                      </div>
                      {request.status === 'aceita' && isTechnicianOrAbove && (
                        <button
                          type="button"
                          onClick={() => handleOpenPurchaseModal(request)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                        >
                          <Plus size={12} />
                          <span>Pedir outra peça</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {request.solicitacoes_compra.map((sc) => {
                        const isCancelled = sc.status === 'Cancelada' || sc.status === 'Reprovada';
                        const isApproved = sc.status === 'Aprovada' || sc.status === 'Convertida em cotação';
                        const isPending = sc.status === 'Pendente' || sc.status === 'Em aprovação' || sc.status === 'Rascunho' || sc.status === 'Aguardando Liberação de Orçamento';

                        const itemNames = sc.itens && sc.itens.length > 0
                          ? sc.itens.map(it => `${it.quantidade > 1 ? `${it.quantidade}x ` : ''}${it.product?.nome || 'Peça/Item'}`).join(', ')
                          : sc.justificativa;

                        const totalEstimado = sc.valor_estimado_total || (sc.itens?.reduce((sum, i) => sum + (i.valor_estimado || 0), 0) || 0);

                        return (
                          <div
                            key={sc.id}
                            className={`rounded-lg border p-2.5 text-xs transition-all ${
                              isCancelled
                                ? 'border-brand-border/40 bg-brand-dark/30 opacity-75'
                                : isApproved
                                  ? 'border-emerald-500/30 bg-emerald-500/5'
                                  : 'border-blue-500/20 bg-brand-dark/60'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono font-bold text-brand-text text-[11px]">{sc.numero}</span>
                                  <span
                                    className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${
                                      isCancelled
                                        ? 'border-red-500/30 bg-red-500/10 text-red-400'
                                        : isApproved
                                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                          : isPending
                                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                                            : 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                                    }`}
                                  >
                                    {sc.status}
                                  </span>
                                  {totalEstimado > 0 && (
                                    <span className="text-[11px] font-mono text-brand-muted">
                                      Est.: {formatCurrency(totalEstimado)}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-brand-text font-medium" title={itemNames}>
                                  {itemNames}
                                </div>
                                <div className="text-[10px] text-brand-muted font-mono">
                                  Criado em {new Date(sc.data_criacao).toLocaleDateString('pt-BR')}
                                  {sc.solicitante?.nome ? ` por ${sc.solicitante.nome}` : ''}
                                </div>
                              </div>

                              {/* Cancellation Button */}
                              {!isCancelled && isTechnicianOrAbove && (
                                <div className="shrink-0 pt-1 sm:pt-0">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenCancelPurchaseModal(sc.id, sc.numero, itemNames)}
                                    className="px-2 py-1 text-[11px] font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded transition-colors inline-flex items-center gap-1 cursor-pointer"
                                    title="Cancelar esta solicitação de compra de peça"
                                  >
                                    <X size={12} />
                                    <span>Cancelar Pedido</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* If the request status is concluded/delivered, or has associated maintenance information */}
                {(request.status === 'concluida' || request.status === 'entregue' || request.manutencao) && (
                  <div className="mt-3 p-3 bg-brand-dark/30 border border-emerald-500/10 rounded space-y-2">
                    <div className="flex justify-between items-center text-xs font-semibold text-emerald-400">
                      <span>Relatório de Conclusão Técnica</span>
                      {request.manutencao?.custo !== undefined && (
                        <span className="font-mono">{formatCurrency(request.manutencao.custo)}</span>
                      )}
                    </div>

                    {request.manutencao?.observacao_conclusao && (
                      <p className="text-xs text-brand-text bg-brand-dark/50 p-2 border border-brand-border/40 font-mono whitespace-pre-wrap">
                        Resolução: "{request.manutencao.observacao_conclusao}"
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-[10px] text-brand-muted font-mono pt-1">
                      <div>
                        <span className="font-bold text-brand-muted">Responsável:</span> {request.manutencao?.responsavel?.nome || request.responsavel?.nome || 'Técnico'}
                      </div>
                      <div>
                        <span className="font-bold text-brand-muted">Tipo:</span> <span className="uppercase">{request.manutencao?.tipo || 'corretiva'}</span>
                      </div>
                      {request.data_conclusao_tecnico && (
                        <div>
                          <span className="font-bold text-brand-muted">Conserto:</span> {new Date(request.data_conclusao_tecnico).toLocaleDateString('pt-BR')}
                        </div>
                      )}
                      {request.data_entrega && (
                        <div>
                          <span className="font-bold text-brand-muted">Entregue em:</span> {new Date(request.data_entrega).toLocaleDateString('pt-BR')}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons for Technicians */}
              {isTechnicianOrAbove && (
                <div className="flex space-x-2 border-t border-brand-border/40 pt-3">
                  {request.status === 'pendente' && (
                    <>
                      <button
                        onClick={() => handleAcceptRequest(request.id)}
                        className="flex-1 py-1.5 bg-brand-primary hover:bg-brand-primary/95 text-brand-dark text-xs font-semibold flex items-center justify-center space-x-1"
                      >
                        <Check size={14} />
                        <span>Aceitar</span>
                      </button>
                      <button
                        onClick={() => setRejectingRequestId(request.id)}
                        className="flex-1 py-1.5 bg-brand-muted/10 border border-brand-border hover:bg-red-500/10 hover:text-red-400 text-brand-text text-xs font-semibold flex items-center justify-center space-x-1"
                      >
                        <X size={14} />
                        <span>Rejeitar</span>
                      </button>
                    </>
                  )}

                  {request.status === 'aceita' && (
                    <div className="flex space-x-2 w-full">
                      <button
                        onClick={() => setConcludingRequestId(request.id)}
                        className="flex-1 py-1.5 bg-brand-primary hover:bg-brand-primary/95 text-brand-dark text-xs font-semibold flex items-center justify-center space-x-1"
                      >
                        <Check size={14} />
                        <span>Concluir Reparo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenPurchaseModal(request)}
                        className="py-1.5 px-3 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-semibold flex items-center justify-center space-x-1 transition-colors"


                        title="Solicitar compra de peça/suprimento"
                      >
                        <ShoppingCart size={13} />
                        <span>Pedir Peça</span>
                      </button>
                    </div>
                  )}

                  {request.status === 'pendente' && (
                    <button
                      type="button"
                      onClick={() => handleOpenPurchaseModal(request)}
                      className="w-full py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center justify-center space-x-1 transition-colors mt-2"
                      title="Solicitar compra de peça para este chamado"
                    >
                      <ShoppingCart size={13} />
                      <span>Solicitar Compra de Peça</span>
                    </button>
                  )}

                  {request.status === 'aguardando_entrega' && (
                    <>
                      <button
                        onClick={() => setShowQRModal(true)}
                        className="flex-1 py-1.5 bg-brand-dark border border-brand-primary/40 hover:border-brand-primary text-brand-primary text-xs font-semibold flex items-center justify-center space-x-1"
                      >
                        <QrCode size={14} />
                        <span>Entrega QR (PIN)</span>
                      </button>
                      <button
                        onClick={() => handleConfirmReceiptDirect(request.id)}
                        className="flex-1 py-1.5 bg-brand-muted/10 border border-brand-border hover:bg-brand-card text-brand-text text-xs font-semibold flex items-center justify-center space-x-1"
                      >
                        <ExternalLink size={14} />
                        <span>Entrega Direta</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* QR Handover Modal */}
      <QRHandoverModal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        onSuccess={() => {
          fetchRequests();
        }}
      />

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-brand-card border border-brand-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border bg-brand-dark/50">
              <h3 className="font-semibold text-lg text-brand-text">Solicitar Manutenção</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-brand-muted hover:text-brand-text">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-brand-muted">Selecione o Equipamento</label>
                <select
                  required
                  value={selectedAssetId}
                  onChange={(e) => setSelectedAssetId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                >
                  <option value="">Escolha um ativo...</option>
                  {assets.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.nome} (EP: {a.e_patrimonio})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-brand-muted">Descrição do Defeito / Motivo</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Informe detalhadamente qual o problema apresentado no equipamento..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm focus:outline-none focus:border-brand-primary text-brand-text placeholder-brand-muted/30"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="w-1/3 py-2 bg-brand-dark border border-brand-border hover:bg-brand-card text-brand-muted text-sm transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-brand-primary hover:bg-brand-primary/95 text-brand-dark font-semibold text-sm transition-all"
                >
                  Confirmar Abertura
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectingRequestId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-brand-card border border-brand-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border">
              <h3 className="font-semibold text-brand-text text-sm">Rejeitar Solicitação de Manutenção</h3>
              <button onClick={() => setRejectingRequestId(null)} className="text-brand-muted hover:text-brand-text">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleRejectRequest} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-brand-muted">Motivo da Rejeição</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Escreva a justificativa para recusar este reparo..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-xs focus:outline-none focus:border-brand-primary text-brand-text"
                />
              </div>
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setRejectingRequestId(null)}
                  className="w-1/3 py-1.5 bg-brand-dark border border-brand-border text-xs text-brand-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold"
                >
                  Rejeitar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Conclude Modal */}
      {concludingRequestId && (() => {
        const concludingReq = requests.find((r) => r.id === concludingRequestId);
        const pendingPurchases = concludingReq?.solicitacoes_compra?.filter(
          (sc) =>
            sc.status === 'Pendente' ||
            sc.status === 'Em aprovação' ||
            sc.status === 'Rascunho' ||
            sc.status === 'Aguardando Liberação de Orçamento'
        );
        const hasPendingPurchases = !!(pendingPurchases && pendingPurchases.length > 0);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/80 backdrop-blur-md">
            <div className="w-full max-w-md bg-brand-card border border-brand-border shadow-2xl overflow-hidden rounded-xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border">
                <h3 className="font-semibold text-brand-text text-sm">Registrar Conclusão de Reparo</h3>
                <button onClick={() => setConcludingRequestId(null)} className="text-brand-muted hover:text-brand-text">
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleConcludeRequest} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs text-brand-muted">Notas Técnicas do Reparo</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Detalhe o que foi feito (ex: troca de pasta térmica, limpeza, instalação de componente)..."
                    value={conclusionNotes}
                    onChange={(e) => setConclusionNotes(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-xs focus:outline-none focus:border-brand-primary text-brand-text rounded"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-brand-muted flex items-center space-x-1">
                    <DollarSign size={12} />
                    <span>Custo Adicional de Reparo (Opcional)</span>
                  </label>
                  <input
                    type="number"
                    placeholder="0.00"
                    step="0.01"
                    value={conclusionCost}
                    onChange={(e) => setConclusionCost(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-1.5 text-xs focus:outline-none focus:border-brand-primary text-brand-text rounded"
                  />
                </div>

                {hasPendingPurchases && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs space-y-2">
                    <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                      <AlertCircle size={14} />
                      <span>Solicitações de compra pendentes ({pendingPurchases.length})</span>
                    </div>
                    <p className="text-brand-muted text-[11px] leading-relaxed">
                      Existem pedidos de compra de peça ainda não finalizados vinculados a esta manutenção.
                    </p>
                    <label className="flex items-center gap-2 cursor-pointer pt-1 text-brand-text font-medium text-[11px]">
                      <input
                        type="checkbox"
                        checked={cancelPendingPurchases}
                        onChange={(e) => setCancelPendingPurchases(e.target.checked)}
                        className="rounded border-brand-border text-brand-primary focus:ring-brand-primary"
                      />
                      <span>Cancelar automaticamente os pedidos de peça pendentes</span>
                    </label>
                  </div>
                )}

                <div className="flex space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setConcludingRequestId(null)}
                    className="w-1/3 py-2 bg-brand-dark border border-brand-border text-xs text-brand-muted hover:text-brand-text rounded"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-brand-primary hover:bg-brand-primary/95 text-brand-dark text-xs font-semibold rounded shadow-sm"
                  >
                    Confirmar Conclusão
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Cancel Purchase Request Modal */}
      {cancelPurchaseModalOpen && selectedPurchaseToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-brand-card border border-brand-border shadow-2xl overflow-hidden rounded-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border bg-brand-dark/40">
              <div className="flex items-center space-x-2 text-red-400">
                <AlertCircle size={18} />
                <h3 className="font-semibold text-brand-text text-sm">Cancelar Pedido de Peça</h3>
              </div>
              <button
                onClick={() => setCancelPurchaseModalOpen(false)}
                className="text-brand-muted hover:text-brand-text"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleConfirmCancelPurchase} className="p-6 space-y-4">
              <div className="bg-brand-dark/50 p-3 border border-brand-border/40 text-xs font-mono rounded space-y-1">
                <div className="text-brand-muted text-[10px] uppercase">Solicitação de Compra:</div>
                <div className="text-brand-text font-bold text-sm">
                  {selectedPurchaseToCancel.numero}
                </div>
                <div className="text-brand-muted text-[11px] truncate">
                  Item: {selectedPurchaseToCancel.item}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-brand-muted">Motivo do Cancelamento (Opcional)</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Peça já disponível em estoque, reparo realizado sem substituição..."
                  value={cancelPurchaseReason}
                  onChange={(e) => setCancelPurchaseReason(e.target.value)}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-xs focus:outline-none focus:border-brand-primary text-brand-text rounded"
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCancelPurchaseModalOpen(false)}
                  className="w-1/3 py-2 bg-brand-dark border border-brand-border text-xs text-brand-muted hover:text-brand-text rounded"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={cancelPurchaseLoading}
                  className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded flex items-center justify-center space-x-2 shadow-sm"
                >
                  {cancelPurchaseLoading && <RefreshCw size={14} className="animate-spin" />}
                  <span>Confirmar Cancelamento</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PURCHASE REQUEST MODAL FOR MAINTENANCE PARTS */}
      {purchaseModalOpen && purchaseTargetRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-dark/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg bg-brand-card border border-amber-500/50 shadow-2xl overflow-hidden rounded-md">
            <div className="bg-amber-500/10 border-b border-amber-500/30 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-amber-400">
                <ShoppingCart size={20} />
                <h3 className="font-bold font-mono text-sm uppercase tracking-wider text-blue-400">
                  Solicitação de Compra de Peça
                </h3>
              </div>
              <button
                onClick={() => setPurchaseModalOpen(false)}
                className="text-brand-muted hover:text-brand-text p-1"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitPurchaseRequest} className="p-6 space-y-4">
              <div className="bg-brand-dark/50 p-3 border border-brand-border/40 text-xs font-mono rounded">
                <div className="text-brand-muted text-[10px] uppercase">Equipamento Vinculado:</div>
                <div className="text-brand-text font-bold text-sm">
                  {purchaseTargetRequest.asset?.nome} ({purchaseTargetRequest.asset?.e_patrimonio})
                </div>
                <div className="text-[11px] text-brand-muted mt-0.5">Chamado #{purchaseTargetRequest.id}</div>
              </div>

              {purchaseSuccessMessage && (
                <div className="p-3 bg-green-500/10 border border-green-500/30 text-green-400 font-mono text-xs flex items-center space-x-2">
                  <CheckCircle2 size={16} />
                  <span>{purchaseSuccessMessage}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-mono font-bold text-brand-text uppercase block">
                  Nome da Peça / Produto *
                </label>
                <input
                  type="text"
                  required
                  value={partName}
                  onChange={(e) => setPartName(e.target.value)}
                  placeholder="Ex: Teclado Dell Latitude 5440, SSD NVMe 512GB, Bateria..."
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-mono font-bold text-brand-text uppercase flex items-center space-x-1">
                  <LinkIcon size={12} className="text-amber-400" />
                  <span>Link do Site / Loja (URL do Fornecedor)</span>
                </label>
                <input
                  type="url"
                  value={partLink}
                  onChange={(e) => setPartLink(e.target.value)}
                  placeholder="https://www.mercadolivre.com.br/... ou https://kabum.com.br/..."
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-mono font-bold text-brand-text uppercase block">
                    Quantidade *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={partQty}
                    onChange={(e) => setPartQty(Number(e.target.value))}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-mono font-bold text-brand-text uppercase block">
                    Valor Estimado (R$)
                  </label>
                  <input
                    type="text"
                    value={partEstimatedVal}
                    onChange={(e) => setPartEstimatedVal(e.target.value)}
                    placeholder="Ex: 149.90"
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-mono font-bold text-brand-text uppercase block">
                  Justificativa da Troca / Reposição
                </label>
                <textarea
                  rows={2}
                  value={partJustification}
                  onChange={(e) => setPartJustification(e.target.value)}
                  placeholder="Explique a necessidade da peça..."
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPurchaseModalOpen(false)}
                  className="w-1/3 py-2.5 bg-brand-dark border border-brand-border text-xs font-mono uppercase text-brand-muted hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={partSubmitting || !partName.trim()}
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-brand-dark font-bold font-mono text-xs uppercase flex items-center justify-center space-x-2 disabled:opacity-50 shadow-md"
                >
                  {partSubmitting && <RefreshCw size={14} className="animate-spin" />}
                  <span>Encaminhar para Comprador</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
