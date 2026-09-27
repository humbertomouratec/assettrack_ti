import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { procurementApi } from '../api/procurement';
import { suppliersApi } from '../api/suppliers';
import { assetsApi } from '../api/assets';
import { usersApi } from '../api/users';
import { getSettings, updateSettings } from '../api/settings';
import { SuppliersPage } from './SuppliersPage';
import type {
  PurchaseRequest,
  PurchaseOrder,
  MaterialStock,
  MaterialStockTransaction,
  PurchaseQuotation,
  ProcurementDashboard,
  CostCenter,
  PurchaseProduct,
  PurchaseCategory,
  PurchaseContract,
  ContractType,
  PurchaseResearch,
  PurchaseNotification,
} from '../types/procurement';
import { URGENCIES, requestStatusColor, orderStatusColor } from '../types/procurement';
import { useAuthStore } from '../stores/authStore';
import {
  Plus, X, ShieldAlert, Package, Gavel, CheckCircle2, Ban,
  ClipboardList, ArrowRightCircle,
  Building2, Pencil, Trash2, Save, Boxes, RefreshCw,
  ExternalLink, Eye, ShoppingCart
} from 'lucide-react';

const canManage = ['admin', 'gerente_ti', 'gerente_infra', 'comprador'];

export const ProcurementPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore().user;
  const manage = user ? canManage.includes(user.role) : false;

  const [tab, setTab] = useState<'dashboard' | 'solicitacoes' | 'ordens' | 'estoque' | 'cotacoes' | 'cadastros' | 'contratos' | 'pesquisas' | 'fornecedores'>(
    location.pathname === '/compras/fornecedores' ? 'fornecedores' : 'dashboard',
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dash, setDash] = useState<ProcurementDashboard | null>(null);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [stock, setStock] = useState<MaterialStock[]>([]);
  const [stockTransactions, setStockTransactions] = useState<MaterialStockTransaction[]>([]);
  const [quotations, setQuotations] = useState<PurchaseQuotation[]>([]);
  const [contracts, setContracts] = useState<PurchaseContract[]>([]);
  const [contractTypes, setContractTypes] = useState<ContractType[]>([]);
  const [researches, setResearches] = useState<PurchaseResearch[]>([]);
  const [purchaseNotifications, setPurchaseNotifications] = useState<PurchaseNotification[]>([]);

  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [products, setProducts] = useState<PurchaseProduct[]>([]);
  const [categories, setCategories] = useState<PurchaseCategory[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: number; nome: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: number; nome: string }[]>([]);
  const [users, setUsers] = useState<{ id: number; nome: string }[]>([]);
  const [requestCostCenterFilter, setRequestCostCenterFilter] = useState<number | 'all'>('all');
  const [approvalLimitGestor, setApprovalLimitGestor] = useState<number>(5000);
  const [approvalLimitGerente, setApprovalLimitGerente] = useState<number>(15000);
  const [approvalLimitFinanceiro, setApprovalLimitFinanceiro] = useState<number>(50000);
  const [savingApprovalConfig, setSavingApprovalConfig] = useState(false);
  const [stockConsumeModal, setStockConsumeModal] = useState(false);
  const [consumeStockId, setConsumeStockId] = useState<number | ''>('');
  const [consumeQty, setConsumeQty] = useState<number>(1);
  const [consumeJustification, setConsumeJustification] = useState('');
  const [consumeCCId, setConsumeCCId] = useState<number | ''>('');
  const [savingConsume, setSavingConsume] = useState(false);
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(null);
  const [receivingItems, setReceivingItems] = useState<{ product_id: number; quantidade_recebida: number; divergencias: string }[]>([]);
  const [receivingNotes, setReceivingNotes] = useState('');
  const [savingReceiving, setSavingReceiving] = useState(false);
  const [receivingInvoices, setReceivingInvoices] = useState<{ id: number; numero_nota: string }[]>([]);
  const [receivingInvoiceId, setReceivingInvoiceId] = useState<number | ''>('');
  const [uploadingReceivingInvoice, setUploadingReceivingInvoice] = useState(false);

  const [contractModal, setContractModal] = useState(false);
  const [editingContract, setEditingContract] = useState<PurchaseContract | null>(null);
  const [contractForm, setContractForm] = useState({ fornecedor_id: '', tipo: '', tipo_id: '', numero: '', data_inicio: '', data_fim: '', renovacao_automatica: false, valor: 0, periodicidade: 'Mensal' });
  const [researchModal, setResearchModal] = useState(false);
  const [researchTitle, setResearchTitle] = useState('');
  const [researchJustification, setResearchJustification] = useState('');
  const [researchItems, setResearchItems] = useState([{ nome_produto: '', link_produto: '', valor_estimado: 0, quantidade: 1, tipo_produto: 'Consumo' }]);
  const [contractTypeName, setContractTypeName] = useState('');
  const [contractTypeDescription, setContractTypeDescription] = useState('');
  const [savingContractType, setSavingContractType] = useState(false);

  // Cost center management
  const [ccCodigo, setCCCodigo] = useState('');
  const [ccNome, setCCNome] = useState('');
  const [ccDepartamentoId, setCCDepartamentoId] = useState<number | ''>('');
  const [ccResponsavelId, setCCResponsavelId] = useState<number | ''>('');
  const [ccOrcamentoMensal, setCCOrcamentoMensal] = useState<number>(0);
  const [ccOrcamentoAnual, setCCOrcamentoAnual] = useState<number>(0);
  const [ccAlertaLimite, setCCAlertaLimite] = useState(true);
  const [ccBloquearLimite, setCCBloquearLimite] = useState(false);
  const [editingCCId, setEditingCCId] = useState<number | null>(null);
  const [savingCC, setSavingCC] = useState(false);
  const [deletingCCId, setDeletingCCId] = useState<number | null>(null);

  // Category quick-create
  const [categoryNome, setCategoryNome] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);

  // Product quick-create
  const [productCodigo, setProductCodigo] = useState('');
  const [productNome, setProductNome] = useState('');
  const [productCategoriaId, setProductCategoriaId] = useState<number | ''>('');
  const [productUnidade, setProductUnidade] = useState('UN');
  const [productTipo, setProductTipo] = useState('Produto');
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<number | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null);

  // Request view detail modal
  const [viewingRequest, setViewingRequest] = useState<PurchaseRequest | null>(null);

  // Request modal
  const [reqModal, setReqModal] = useState(false);
  const [rCC, setRCC] = useState<number | null>(null);
  const [rJust, setRJust] = useState('');
  const [rUrgencia, setRUrgencia] = useState('Média');
  const [rItens, setRItens] = useState<{ product_id: number; quantidade: number; valor_estimado: number }[]>([{ product_id: 0, quantidade: 1, valor_estimado: 0 }]);

  // Quotation modal
  const [quotModal, setQuotModal] = useState(false);
  const [qRequestId, setQRequestId] = useState<number | null>(null);
  const [qSuppliers, setQSuppliers] = useState<{ fornecedor_id: number; frete: number; prazo_entrega_dias: number; itens: { product_id: number; quantidade: number; valor_unitario: number }[] }[]>([]);

  // Order modal
  const [orderModal, setOrderModal] = useState(false);
  const [oSupplier, setOSupplier] = useState<number | null>(null);
  const [oCC, setOCC] = useState<number | null>(null);
  const [oItens, setOItens] = useState<{ product_id: number; quantidade: number; valor_unitario: number }[]>([{ product_id: 0, quantidade: 1, valor_unitario: 0 }]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [d, r, o, s, tx, q, c, ct, pr, notifications] = await Promise.all([
        procurementApi.dashboard(),
        procurementApi.listRequests(),
        procurementApi.listOrders(),
        procurementApi.listStock(),
        procurementApi.listStockTransactions(undefined, 20),
        procurementApi.listQuotations(),
        procurementApi.listContracts(),
        procurementApi.listContractTypes(),
        procurementApi.listResearches(),
        procurementApi.myNotifications(),
      ]);
      setDash(d);
      setRequests(r);
      setOrders(o);
      setStock(s);
      setStockTransactions(tx);
      setQuotations(q);
      setContracts(c);
      setContractTypes(ct);
      setResearches(pr);
      setPurchaseNotifications(notifications);
    } catch (err) {
      console.error(err);
      showError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    procurementApi.listCostCenters().then(setCostCenters).catch(() => {});
    procurementApi.listCategories().then(setCategories).catch(() => {});
    procurementApi.listProducts().then(setProducts).catch(() => {});
    suppliersApi.list(0, 200).then((s) => setSuppliers(s.map((x) => ({ id: x.id, nome: x.nome })))).catch(() => {});
    assetsApi.getReferences().then((refs) => setDepartments(refs.setores.map((x) => ({ id: x.id, nome: x.nome })))).catch(() => {});
    usersApi.list().then((list) => setUsers(list.map((x) => ({ id: x.id, nome: x.nome })))).catch(() => {});
    getSettings().then((settings) => {
      setApprovalLimitGestor(Number(settings.procurement_approval_limit_gestor || 5000));
      setApprovalLimitGerente(Number(settings.procurement_approval_limit_gerente || 15000));
      setApprovalLimitFinanceiro(Number(settings.procurement_approval_limit_financeiro || 50000));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (location.pathname === '/compras/fornecedores') {
      setTab('fornecedores');
      return;
    }

    if (tab === 'fornecedores') {
      setTab('dashboard');
    }
  }, [location.pathname]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    const allowedTabs = ['dashboard', 'solicitacoes', 'ordens', 'estoque', 'cotacoes', 'cadastros', 'contratos', 'pesquisas', 'fornecedores'] as const;
    if (tabParam && allowedTabs.includes(tabParam as any)) {
      const nextTab = tabParam as typeof allowedTabs[number];
      setTab(nextTab);
      if (nextTab === 'fornecedores') {
        navigate('/compras/fornecedores', { replace: true });
      } else if (location.pathname === '/compras/fornecedores') {
        navigate('/compras', { replace: true });
      }
    }
  }, [location.search]);

  const handleTabChange = (nextTab: 'dashboard' | 'solicitacoes' | 'ordens' | 'estoque' | 'cotacoes' | 'cadastros' | 'contratos' | 'pesquisas' | 'fornecedores') => {
    setTab(nextTab);
    navigate(nextTab === 'fornecedores' ? '/compras/fornecedores' : '/compras');
  };

  const showError = (err: any) => {
    setError(err.response?.data?.error || 'Erro na operação');
    setTimeout(() => setError(null), 5000);
  };

  const refreshMasterData = async () => {
    try {
      const [ccs, cats, prods] = await Promise.all([
        procurementApi.listCostCenters(),
        procurementApi.listCategories(),
        procurementApi.listProducts(),
      ]);
      setCostCenters(ccs);
      setCategories(cats);
      setProducts(prods);
    } catch (_err) {
      // keep current UI state
    }
  };

  const resetCostCenterForm = () => {
    setEditingCCId(null);
    setCCCodigo('');
    setCCNome('');
    setCCDepartamentoId('');
    setCCResponsavelId('');
    setCCOrcamentoMensal(0);
    setCCOrcamentoAnual(0);
    setCCAlertaLimite(true);
    setCCBloquearLimite(false);
  };

  const openEditCostCenter = (cc: CostCenter) => {
    setEditingCCId(cc.id);
    setCCCodigo(cc.codigo);
    setCCNome(cc.nome);
    setCCDepartamentoId(cc.departamento_id ?? '');
    setCCResponsavelId(cc.responsavel_id ?? '');
    setCCOrcamentoMensal(cc.orcamento_mensal);
    setCCOrcamentoAnual(cc.orcamento_anual);
    setCCAlertaLimite(cc.alerta_limite);
    setCCBloquearLimite(cc.bloquear_limite);
    setTab('cadastros');
  };

  const submitCostCenter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ccCodigo.trim() || !ccNome.trim()) {
      showError({ response: { data: { error: 'Código e nome do centro de custo são obrigatórios' } } });
      return;
    }

    setSavingCC(true);
    try {
      const payload = {
        codigo: ccCodigo.trim(),
        nome: ccNome.trim(),
        departamento_id: ccDepartamentoId ? Number(ccDepartamentoId) : undefined,
        responsavel_id: ccResponsavelId ? Number(ccResponsavelId) : undefined,
        orcamento_mensal: Number(ccOrcamentoMensal) || 0,
        orcamento_anual: Number(ccOrcamentoAnual) || 0,
        alerta_limite: ccAlertaLimite,
        bloquear_limite: ccBloquearLimite,
      };
      if (editingCCId) {
        await procurementApi.updateCostCenter(editingCCId, payload);
      } else {
        await procurementApi.createCostCenter(payload);
      }
      resetCostCenterForm();
      await refreshMasterData();
      setGlobalMessage(editingCCId ? 'Centro de custo atualizado com sucesso.' : 'Centro de custo criado com sucesso.');
    } catch (err) {
      showError(err);
    } finally {
      setSavingCC(false);
    }
  };

  const deleteCostCenter = async (cc: CostCenter) => {
    if (!window.confirm(`Excluir o centro de custo ${cc.codigo} - ${cc.nome}?`)) return;
    setDeletingCCId(cc.id);
    try {
      await procurementApi.deleteCostCenter(cc.id);
      if (editingCCId === cc.id) resetCostCenterForm();
      await refreshMasterData();
      setGlobalMessage('Centro de custo excluído com sucesso.');
    } catch (err) {
      showError(err);
    } finally {
      setDeletingCCId(null);
    }
  };

  const createCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryNome.trim()) return;
    setSavingCategory(true);
    try {
      if (editingCategoryId) {
        await procurementApi.updateCategory(editingCategoryId, { nome: categoryNome.trim(), ativo: true });
      } else {
        await procurementApi.createCategory({ nome: categoryNome.trim(), ativo: true });
      }
      setCategoryNome('');
      setEditingCategoryId(null);
      await refreshMasterData();
      setGlobalMessage(editingCategoryId ? 'Categoria de compra atualizada com sucesso.' : 'Categoria de compra criada com sucesso.');
    } catch (err) {
      showError(err);
    } finally {
      setSavingCategory(false);
    }
  };

  const createProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productCodigo.trim() || !productNome.trim() || !productCategoriaId) {
      showError({ response: { data: { error: 'Código, nome e categoria do produto são obrigatórios' } } });
      return;
    }
    setSavingProduct(true);
    try {
      const payload = {
        codigo: productCodigo.trim(),
        nome: productNome.trim(),
        categoria_id: Number(productCategoriaId),
        unidade: productUnidade.trim() || 'UN',
        tipo: productTipo,
        ativo: true,
      };
      if (editingProductId) {
        await procurementApi.updateProduct(editingProductId, payload);
      } else {
        await procurementApi.createProduct(payload);
      }
      setProductCodigo('');
      setProductNome('');
      setProductCategoriaId('');
      setProductUnidade('UN');
      setProductTipo('Produto');
      setEditingProductId(null);
      await refreshMasterData();
      setGlobalMessage(editingProductId ? 'Produto de compras atualizado com sucesso.' : 'Produto de compras criado com sucesso.');
    } catch (err) {
      showError(err);
    } finally {
      setSavingProduct(false);
    }
  };

  const [globalMessage, setGlobalMessage] = useState<string | null>(null);

  const editCategory = (category: PurchaseCategory) => {
    setEditingCategoryId(category.id);
    setCategoryNome(category.nome);
    setTab('cadastros');
  };

  const deleteCategory = async (category: PurchaseCategory) => {
    if (!window.confirm(`Excluir a categoria ${category.nome}?`)) return;
    setDeletingCategoryId(category.id);
    try {
      await procurementApi.deleteCategory(category.id);
      if (editingCategoryId === category.id) {
        setEditingCategoryId(null);
        setCategoryNome('');
      }
      await refreshMasterData();
      setGlobalMessage('Categoria de compra excluída com sucesso.');
    } catch (err) {
      showError(err);
    } finally {
      setDeletingCategoryId(null);
    }
  };

  const editProduct = (product: PurchaseProduct) => {
    setEditingProductId(product.id);
    setProductCodigo(product.codigo);
    setProductNome(product.nome);
    setProductCategoriaId(product.categoria_id);
    setProductUnidade(product.unidade || 'UN');
    setProductTipo(product.tipo || 'Produto');
    setTab('cadastros');
  };

  const deleteProduct = async (product: PurchaseProduct) => {
    if (!window.confirm(`Excluir o produto ${product.codigo} - ${product.nome}?`)) return;
    setDeletingProductId(product.id);
    try {
      await procurementApi.deleteProduct(product.id);
      if (editingProductId === product.id) {
        setEditingProductId(null);
        setProductCodigo('');
        setProductNome('');
        setProductCategoriaId('');
        setProductUnidade('UN');
        setProductTipo('Produto');
      }
      await refreshMasterData();
      setGlobalMessage('Produto de compras excluído com sucesso.');
    } catch (err) {
      showError(err);
    } finally {
      setDeletingProductId(null);
    }
  };

  // ---- Requests ----
  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rCC) { showError({ response: { data: { error: 'Selecione o centro de custo' } } }); return; }
    try {
      await procurementApi.createRequest({
        centro_custo_id: rCC,
        justificativa: rJust,
        urgencia: rUrgencia,
        itens: rItens.filter((i) => i.product_id && i.quantidade > 0),
      });
      setReqModal(false);
      setRCC(null); setRJust(''); setRUrgencia('Média');
      setRItens([{ product_id: 0, quantidade: 1, valor_estimado: 0 }]);
      fetchAll();
    } catch (err) {
      showError(err);
    }
  };

  const decideRequest = async (req: PurchaseRequest, decisao: 'Aprovado' | 'Reprovado') => {
    const obs = decisao === 'Reprovado' ? window.prompt('Motivo da reprovação:') ?? undefined : undefined;
    try {
      await procurementApi.decideRequestAuto(req.id, decisao, obs);
      setGlobalMessage(
        decisao === 'Aprovado'
          ? `Solicitação ${req.numero} aprovada usando a alçada automática sugerida para este caso.`
          : `Solicitação ${req.numero} reprovada com sucesso.`,
      );
      fetchAll();
    } catch (err) {
      showError(err);
    }
  };

  const releaseBudget = async (req: PurchaseRequest) => {
    if (!window.confirm(`Liberar orçamento da solicitação ${req.numero}?`)) return;
    try {
      await procurementApi.releaseBudget(req.id);
      fetchAll();
    } catch (err) {
      showError(err);
    }
  };

  // ---- Quotations ----
  const buildQuotationItemsFromRequest = (req: PurchaseRequest) => (
    req.itens.map((it) => ({
      product_id: it.product_id,
      quantidade: it.quantidade,
      valor_unitario: it.valor_estimado || 0,
    }))
  );

  const buildQuotationSupplierDraft = (req: PurchaseRequest, fornecedorId = 0) => ({
    fornecedor_id: fornecedorId,
    frete: 0,
    prazo_entrega_dias: 0,
    itens: buildQuotationItemsFromRequest(req),
  });

  const getQuotationDraftTotal = (supplier: { frete: number; itens: { quantidade: number; valor_unitario: number }[] }) => (
    supplier.itens.reduce((sum, item) => sum + (Number(item.quantidade) || 0) * (Number(item.valor_unitario) || 0), 0) + (Number(supplier.frete) || 0)
  );

  const getQuotationDraftUnitAverage = (supplier: { itens: { quantidade: number; valor_unitario: number }[] }) => {
    const validItems = supplier.itens.filter((item) => (Number(item.quantidade) || 0) > 0);
    if (validItems.length === 0) return 0;
    return validItems.reduce((sum, item) => sum + (Number(item.valor_unitario) || 0), 0) / validItems.length;
  };

  const getQuotationDraftBestValueIndex = () => {
    const valid = qSuppliers
      .map((supplier, index) => ({ supplier, index, total: getQuotationDraftTotal(supplier), prazo: Number(supplier.prazo_entrega_dias) || 0 }))
      .filter(({ supplier }) => supplier.fornecedor_id > 0);

    if (valid.length === 0) return -1;

    const totals = valid.map((item) => item.total);
    const deadlines = valid.map((item) => item.prazo);
    const minTotal = Math.min(...totals);
    const maxTotal = Math.max(...totals);
    const minDeadline = Math.min(...deadlines);
    const maxDeadline = Math.max(...deadlines);

    const scored = valid.map((item) => {
      const priceScore = maxTotal === minTotal ? 1 : 1 - ((item.total - minTotal) / (maxTotal - minTotal));
      const deadlineScore = maxDeadline === minDeadline ? 1 : 1 - ((item.prazo - minDeadline) / (maxDeadline - minDeadline));
      const finalScore = (priceScore * 0.7) + (deadlineScore * 0.3);
      return { index: item.index, score: finalScore };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.index ?? -1;
  };

  const getQuotationCheapestSupplierId = (quotation: PurchaseQuotation) => {
    if (!quotation.suppliers.length) return null;
    return quotation.suppliers.reduce((best, current) => (
      current.valor_total < best.valor_total ? current : best
    )).id;
  };

  const getQuotationFastestSupplierId = (quotation: PurchaseQuotation) => {
    const valid = quotation.suppliers.filter((supplier) => supplier.prazo_entrega_dias >= 0);
    if (!valid.length) return null;
    return valid.reduce((best, current) => (
      current.prazo_entrega_dias < best.prazo_entrega_dias ? current : best
    )).id;
  };

  const getQuotationBestValueSupplierId = (quotation: PurchaseQuotation) => {
    if (!quotation.suppliers.length) return null;
    const totals = quotation.suppliers.map((supplier) => supplier.valor_total || 0);
    const deadlines = quotation.suppliers.map((supplier) => supplier.prazo_entrega_dias || 0);
    const minTotal = Math.min(...totals);
    const maxTotal = Math.max(...totals);
    const minDeadline = Math.min(...deadlines);
    const maxDeadline = Math.max(...deadlines);

    const scored = quotation.suppliers.map((supplier) => {
      const priceScore = maxTotal === minTotal ? 1 : 1 - (((supplier.valor_total || 0) - minTotal) / (maxTotal - minTotal));
      const deadlineScore = maxDeadline === minDeadline ? 1 : 1 - (((supplier.prazo_entrega_dias || 0) - minDeadline) / (maxDeadline - minDeadline));
      return {
        id: supplier.id,
        score: (priceScore * 0.7) + (deadlineScore * 0.3),
      };
    }).sort((a, b) => b.score - a.score);

    return scored[0]?.id ?? null;
  };

  const getQuotationWinnerReason = (quotation: PurchaseQuotation, supplierId: number) => {
    const cheapestId = getQuotationCheapestSupplierId(quotation);
    const fastestId = getQuotationFastestSupplierId(quotation);
    const bestValueId = getQuotationBestValueSupplierId(quotation);
    const reasons: string[] = [];

    if (supplierId === cheapestId) reasons.push('menor preço total');
    if (supplierId === fastestId) reasons.push('menor prazo de entrega');
    if (supplierId === bestValueId) reasons.push('melhor custo-benefício');

    if (reasons.length === 0) return 'seleção manual';
    if (reasons.length === 1) return reasons[0];
    return `${reasons.slice(0, -1).join(', ')} e ${reasons[reasons.length - 1]}`;
  };

  const getWinnerSupplier = (quotation: PurchaseQuotation) => quotation.suppliers.find((supplier) => supplier.escolhido);

  const getOrderForQuotation = (quotationId: number) => orders.find((order) => order.quotation_id === quotationId);

  const getQuotationEstimatedTotal = (quotation: PurchaseQuotation) => Number(quotation.request?.valor_estimado_total) || 0;

  const getQuotationClosedTotal = (quotation: PurchaseQuotation) => {
    const order = getOrderForQuotation(quotation.id);
    if (order) return Number(order.valor_total) || 0;
    return Number(getWinnerSupplier(quotation)?.valor_total) || 0;
  };

  const getQuotationSavings = (quotation: PurchaseQuotation) => getQuotationEstimatedTotal(quotation) - getQuotationClosedTotal(quotation);

  const getQuotationSavingsPercent = (quotation: PurchaseQuotation) => {
    const estimated = getQuotationEstimatedTotal(quotation);
    if (estimated <= 0) return 0;
    return (getQuotationSavings(quotation) / estimated) * 100;
  };

  const getQuotationRiskFlags = (quotation: PurchaseQuotation) => {
    const winner = getWinnerSupplier(quotation);
    if (!winner) return [];

    const risks: { label: string; tone: 'red' | 'amber'; message: string }[] = [];
    const savings = getQuotationSavings(quotation);
    const deadline = Number(winner.prazo_entrega_dias) || 0;

    if (savings < 0) {
      risks.push({
        label: 'Acima do estimado',
        tone: 'red',
        message: `Fechamento ${fmt(Math.abs(savings))} acima do valor previsto na solicitação.`,
      });
    }

    if (deadline >= 15) {
      risks.push({
        label: 'Prazo alto',
        tone: 'amber',
        message: `Fornecedor vencedor com prazo de ${deadline} dia(s), acima do padrão ideal de atendimento rápido.`,
      });
    }

    return risks;
  };

  const fmtDateTime = (value?: string) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString('pt-BR');
  };

  const unreadPurchaseNotifications = purchaseNotifications.filter((notification) => !notification.lido);

  const openQuotationModal = (req: PurchaseRequest) => {
    setQRequestId(req.id);
    const suggestedSupplierIds = Array.from(
      new Set(req.itens.map((it) => it.fornecedor_sugerido_id).filter((id): id is number => Boolean(id))),
    );
    setQSuppliers(
      suggestedSupplierIds.length > 0
        ? suggestedSupplierIds.map((supplierId) => buildQuotationSupplierDraft(req, supplierId))
        : [buildQuotationSupplierDraft(req)],
    );
    setQuotModal(true);
  };

  const submitQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qRequestId) return;
    const normalizedSuppliers = qSuppliers.filter((s) => s.fornecedor_id && s.itens.some((it) => it.product_id && it.quantidade > 0));
    const uniqueSuppliers = new Set(normalizedSuppliers.map((s) => s.fornecedor_id));
    if (normalizedSuppliers.length === 0) {
      showError({ response: { data: { error: 'Adicione ao menos um fornecedor com itens válidos para a cotação.' } } });
      return;
    }
    if (uniqueSuppliers.size !== normalizedSuppliers.length) {
      showError({ response: { data: { error: 'Não é permitido repetir o mesmo fornecedor na mesma cotação.' } } });
      return;
    }
    try {
      await procurementApi.createQuotation(
        qRequestId,
        normalizedSuppliers,
      );
      setQuotModal(false);
      setQRequestId(null);
      setQSuppliers([]);
      fetchAll();
    } catch (err) {
      showError(err);
    }
  };

  const selectWinner = async (quotationId: number, supplierId: number) => {
    const quotation = quotations.find((item) => item.id === quotationId);
    const supplier = quotation?.suppliers.find((item) => item.id === supplierId);
    const supplierName = supplier?.fornecedor?.nome ?? `#${supplier?.fornecedor_id ?? supplierId}`;
    const justification = quotation ? getQuotationWinnerReason(quotation, supplierId) : 'seleção manual';
    const confirmMessage = [
      `Confirmar ${supplierName} como vencedor desta cotação?`,
      '',
      `Motivo identificado: ${justification}.`,
      supplier ? `Valor total: ${fmt(supplier.valor_total)}.` : '',
      supplier ? `Prazo: ${supplier.prazo_entrega_dias} dia(s).` : '',
      '',
      'Ao confirmar, o Pedido de Compra será emitido automaticamente.',
    ].filter(Boolean).join('\n');
    if (!window.confirm(confirmMessage)) return;
    try {
      await procurementApi.selectWinner(quotationId, supplierId);
      setGlobalMessage(`Fornecedor ${supplierName} selecionado como vencedor por ${justification}. Pedido de compra emitido automaticamente.`);
      fetchAll();
    } catch (err) {
      showError(err);
    }
  };

  // ---- Orders ----
  const submitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oSupplier || !oCC) { showError({ response: { data: { error: 'Selecione fornecedor e centro de custo' } } }); return; }
    try {
      await procurementApi.createOrder({
        fornecedor_id: oSupplier,
        centro_custo_id: oCC,
        itens: oItens.filter((i) => i.product_id && i.quantidade > 0),
      });
      setOrderModal(false);
      setOSupplier(null); setOCC(null);
      setOItens([{ product_id: 0, quantidade: 1, valor_unitario: 0 }]);
      fetchAll();
    } catch (err) {
      showError(err);
    }
  };

  const remainingOrderItemQuantity = (order: PurchaseOrder, productId: number, orderedQuantity: number) => {
    const received = (order.receivings || []).flatMap((receiving) => receiving.itens || [])
      .filter((item) => item.product_id === productId)
      .reduce((total, item) => total + item.quantidade_recebida, 0);
    return Math.max(0, orderedQuantity - received);
  };

  const openReceivingModal = async (order: PurchaseOrder) => {
    setReceivingOrder(order);
    setReceivingItems(order.itens.map((item) => ({ product_id: item.product_id, quantidade_recebida: remainingOrderItemQuantity(order, item.product_id, item.quantidade), divergencias: '' })));
    setReceivingNotes('');
    setReceivingInvoiceId('');
    setReceivingInvoices([]);
    try {
      setReceivingInvoices(await suppliersApi.listInvoices(order.fornecedor_id));
    } catch (_err) {
      // NF-e is optional; receipt can proceed without an invoice linked.
    }
  };

  const uploadReceivingInvoice = async (file?: File) => {
    if (!file || !receivingOrder) return;
    setUploadingReceivingInvoice(true);
    try {
      const invoice = await suppliersApi.uploadInvoice(receivingOrder.fornecedor_id, file);
      const invoices = await suppliersApi.listInvoices(receivingOrder.fornecedor_id);
      setReceivingInvoices(invoices);
      setReceivingInvoiceId(invoice.id);
      setGlobalMessage(`NF-e ${invoice.numero_nota} importada e selecionada para o recebimento.`);
    } catch (err) {
      showError(err);
    } finally {
      setUploadingReceivingInvoice(false);
    }
  };

  const submitReceiving = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingOrder) return;
    const itens = receivingItems.filter((item) => item.quantidade_recebida > 0);
    if (itens.length === 0) {
      showError({ response: { data: { error: 'Informe a quantidade recebida de ao menos um item.' } } });
      return;
    }
    setSavingReceiving(true);
    try {
      await procurementApi.receiveOrder(receivingOrder.id, { itens, nota_fiscal_id: receivingInvoiceId ? Number(receivingInvoiceId) : undefined, observacoes: receivingNotes.trim() || undefined });
      setReceivingOrder(null);
      setGlobalMessage(`Recebimento do pedido ${receivingOrder.numero} registrado com sucesso.`);
      fetchAll();
    } catch (err) {
      showError(err);
    } finally {
      setSavingReceiving(false);
    }
  };

  const updateOrderStatus = async (order: PurchaseOrder, status: string) => {
    try {
      await procurementApi.updateOrderStatus(order.id, status);
      setGlobalMessage(`Pedido ${order.numero} atualizado para ${status}.`);
      fetchAll();
    } catch (err) {
      showError(err);
    }
  };

  const handleReconcileOrder = async (orderId: number) => {
    try {
      const res = await procurementApi.reconcileOrder(orderId);
      setGlobalMessage(res.message || 'Sincronização de estoque concluída.');
      fetchAll();
    } catch (err) {
      showError(err);
    }
  };

  const submitStockConsume = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consumeStockId || consumeQty <= 0) {
      showError({ response: { data: { error: 'Selecione um item de estoque e informe uma quantidade válida' } } });
      return;
    }
    setSavingConsume(true);
    try {
      await procurementApi.consumeStock({
        stock_id: Number(consumeStockId),
        quantidade_usar: consumeQty,
        justificativa: consumeJustification.trim() || undefined,
        centro_custo_id: consumeCCId ? Number(consumeCCId) : undefined,
      });
      setStockConsumeModal(false);
      setConsumeStockId('');
      setConsumeQty(1);
      setConsumeJustification('');
      setConsumeCCId('');
      setGlobalMessage('Consumo de estoque registrado com sucesso.');
      fetchAll();
    } catch (err) {
      showError(err);
    } finally {
      setSavingConsume(false);
    }
  };

  const saveApprovalConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (approvalLimitGestor <= 0 || approvalLimitGerente < approvalLimitGestor || approvalLimitFinanceiro < approvalLimitGerente) {
      showError({ response: { data: { error: 'Configure limites crescentes e maiores que zero para as alçadas' } } });
      return;
    }
    setSavingApprovalConfig(true);
    try {
      await updateSettings({
        procurement_approval_limit_gestor: String(approvalLimitGestor),
        procurement_approval_limit_gerente: String(approvalLimitGerente),
        procurement_approval_limit_financeiro: String(approvalLimitFinanceiro),
      });
      setGlobalMessage('Faixas de aprovação do compras salvas com sucesso.');
      fetchAll();
    } catch (err) {
      showError(err);
    } finally {
      setSavingApprovalConfig(false);
    }
  };

  const cancelOrder = async (order: PurchaseOrder) => {
    if (!window.confirm(`Cancelar o pedido ${order.numero}? Esta ação encerra o fluxo de compra deste pedido.`)) return;
    await updateOrderStatus(order, 'Cancelado');
  };

  const markPurchaseNotificationsRead = async () => {
    try {
      await procurementApi.markNotificationsRead();
      setPurchaseNotifications(purchaseNotifications.map((notification) => ({ ...notification, lido: true })));
    } catch (err) { showError(err); }
  };

  const resetContractForm = () => {
    setEditingContract(null);
    setContractForm({ fornecedor_id: '', tipo: '', tipo_id: '', numero: '', data_inicio: '', data_fim: '', renovacao_automatica: false, valor: 0, periodicidade: 'Mensal' });
  };

  const openContractModal = (contract?: PurchaseContract) => {
    if (contract) {
      setEditingContract(contract);
      setContractForm({
        fornecedor_id: String(contract.fornecedor_id), tipo: contract.tipo, tipo_id: contract.tipo_id ? String(contract.tipo_id) : '', numero: contract.numero,
        data_inicio: contract.data_inicio.slice(0, 10), data_fim: contract.data_fim.slice(0, 10), renovacao_automatica: contract.renovacao_automatica,
        valor: contract.valor, periodicidade: contract.periodicidade || 'Mensal',
      });
    } else {
      resetContractForm();
    }
    setContractModal(true);
  };

  const submitContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractForm.fornecedor_id || !contractForm.numero || !contractForm.data_inicio || !contractForm.data_fim) {
      showError({ response: { data: { error: 'Fornecedor, número e período do contrato são obrigatórios' } } });
      return;
    }
    if (contractForm.data_fim < contractForm.data_inicio) {
      showError({ response: { data: { error: 'A data final do contrato deve ser posterior à data inicial.' } } });
      return;
    }
    const payload = {
      fornecedor_id: Number(contractForm.fornecedor_id), tipo: contractForm.tipo.trim() || 'Geral', tipo_id: contractForm.tipo_id ? Number(contractForm.tipo_id) : undefined,
      numero: contractForm.numero.trim(), data_inicio: contractForm.data_inicio, data_fim: contractForm.data_fim,
      renovacao_automatica: contractForm.renovacao_automatica, valor: Number(contractForm.valor) || 0, periodicidade: contractForm.periodicidade,
    };
    try {
      if (editingContract) await procurementApi.updateContract(editingContract.id, payload);
      else await procurementApi.createContract(payload);
      setContractModal(false);
      resetContractForm();
      setGlobalMessage(editingContract ? 'Contrato atualizado com sucesso.' : 'Contrato cadastrado com sucesso.');
      fetchAll();
    } catch (err) { showError(err); }
  };

  const deleteContract = async (contract: PurchaseContract) => {
    if (!window.confirm(`Excluir o contrato ${contract.numero}?`)) return;
    try {
      await procurementApi.deleteContract(contract.id);
      setGlobalMessage('Contrato excluído com sucesso.');
      fetchAll();
    } catch (err) { showError(err); }
  };

  const createContractType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractTypeName.trim()) {
      showError({ response: { data: { error: 'Informe o nome do tipo de contrato.' } } });
      return;
    }
    setSavingContractType(true);
    try {
      await procurementApi.createContractType({ nome: contractTypeName.trim(), descricao: contractTypeDescription.trim() || undefined, ativo: true });
      setContractTypeName('');
      setContractTypeDescription('');
      const types = await procurementApi.listContractTypes();
      setContractTypes(types);
      setGlobalMessage('Tipo de contrato criado com sucesso.');
    } catch (err) { showError(err); } finally { setSavingContractType(false); }
  };

  const submitResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = researchItems.filter((item) => item.nome_produto.trim() && item.quantidade > 0);
    if (!researchTitle.trim() || !researchJustification.trim() || items.length === 0) {
      showError({ response: { data: { error: 'Informe título, justificativa e ao menos um item válido.' } } });
      return;
    }
    try {
      await procurementApi.createResearch({ titulo: researchTitle.trim(), justificativa: researchJustification.trim(), items });
      setResearchModal(false);
      setResearchTitle(''); setResearchJustification('');
      setResearchItems([{ nome_produto: '', link_produto: '', valor_estimado: 0, quantidade: 1, tipo_produto: 'Consumo' }]);
      setGlobalMessage('Pesquisa de compra criada e enviada para aprovação.');
      fetchAll();
    } catch (err) { showError(err); }
  };

  const decideResearch = async (research: PurchaseResearch, action: 'aprovar' | 'rejeitar') => {
    const justification = window.prompt(action === 'aprovar' ? 'Observação da aprovação (opcional):' : 'Motivo da reprovação:') ?? undefined;
    if (action === 'rejeitar' && justification === undefined) return;
    let centroCustoId: number | undefined;
    if (action === 'aprovar') {
      const answer = window.prompt(`Informe o ID do centro de custo (${costCenters.map((cc) => `${cc.id}: ${cc.codigo}`).join(', ')}):`);
      if (!answer) return;
      centroCustoId = Number(answer);
      if (!centroCustoId || !costCenters.some((cc) => cc.id === centroCustoId)) {
        showError({ response: { data: { error: 'Centro de custo inválido.' } } });
        return;
      }
    }
    try {
      await procurementApi.decideResearch(research.id, {
        acao: action, justificativa_decisao: justification || undefined, centro_custo_id: centroCustoId,
        approved_item_ids: action === 'aprovar' ? research.items.filter((item) => item.aprovado).map((item) => item.id) : undefined,
      });
      setGlobalMessage(action === 'aprovar' ? 'Pesquisa aprovada e convertida em solicitação de compra.' : 'Pesquisa reprovada.');
      fetchAll();
    } catch (err) { showError(err); }
  };

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const filteredRequests = requests.filter((r) => requestCostCenterFilter === 'all' || r.centro_custo_id === requestCostCenterFilter);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-wider font-mono text-brand-text m-0">Compras</h1>
          <p className="text-brand-muted text-sm mt-1">Da solicitação ao recebimento, com contratos, pesquisas e governança orçamentária.</p>
        </div>
        <div className="hidden xl:flex items-center gap-2">
          <button onClick={() => procurementApi.exportCsv('dashboard')} className="border border-brand-border hover:bg-brand-card px-3 py-2 font-mono text-xs uppercase">
            Exportar Resumo
          </button>
          <button onClick={() => procurementApi.exportCsv('solicitacoes')} className="border border-brand-border hover:bg-brand-card px-3 py-2 font-mono text-xs uppercase">
            Exportar Solicitações
          </button>
          <button onClick={() => procurementApi.exportCsv('pedidos')} className="border border-brand-border hover:bg-brand-card px-3 py-2 font-mono text-xs uppercase">
            Exportar Pedidos
          </button>
          <button onClick={() => procurementApi.exportCsv('estoque')} className="border border-brand-border hover:bg-brand-card px-3 py-2 font-mono text-xs uppercase">
            Exportar Estoque
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 border border-red-500/30 bg-red-500/5 text-red-400 text-xs font-mono flex items-center space-x-2">
          <ShieldAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      {globalMessage && (
        <div className="app-notice--success p-3 border border-brand-primary/30 bg-brand-primary/5 text-brand-primary text-xs font-mono flex items-center justify-between">
          <span>{globalMessage}</span>
          <button onClick={() => setGlobalMessage(null)} className="text-brand-primary/70 hover:text-brand-primary font-bold">&times;</button>
        </div>
      )}

      {/* Navegação do processo de compras */}
      <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-2xl border border-brand-border bg-brand-card/70 p-2 no-scrollbar scroll-smooth">
        <div className="flex min-w-max items-center gap-1">
        {([
          ['dashboard', 'Visão geral'],
          ['solicitacoes', 'Solicitações'],
          ['cotacoes', 'Cotações'],
          ['ordens', 'Pedidos'],
          ['estoque', 'Estoque'],
          ['contratos', 'Contratos'],
          ['pesquisas', 'Pesquisas'],
          ['fornecedores', 'Fornecedores'],
          ['cadastros', 'Configurações'],
        ] as const).map(([key, label], index) => (
          <React.Fragment key={key}>
            {[1, 5, 7].includes(index) && <span className="mx-1 h-6 w-px bg-brand-border" aria-hidden="true" />}
          <button
            onClick={() => handleTabChange(key)}
            className={`shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 font-mono text-xs uppercase tracking-wider transition-all cursor-pointer ${
              tab === key
                ? 'bg-brand-primary text-brand-dark font-bold shadow-sm'
                : 'text-brand-muted hover:bg-brand-dark/10 hover:text-brand-text'
            }`}
          >
            {label}
          </button>
          </React.Fragment>
        ))}
        </div>
      </div>

      {loading && (
        <div className="p-12 text-center flex flex-col items-center justify-center space-y-4">
          <div className="w-8 h-8 border-2 border-brand-primary border-t-transparent animate-spin" />
          <span className="font-mono text-xs text-brand-muted uppercase">Carregando...</span>
        </div>
      )}

      {/* ---------- DASHBOARD ---------- */}
      {!loading && tab === 'dashboard' && dash && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="relative overflow-hidden rounded-2xl border border-brand-border bg-gradient-to-r from-[#0d2137] via-[#12335a] to-[#1079ea] p-6 text-white md:col-span-2 xl:col-span-6">
            <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div><p className="text-xs font-mono uppercase tracking-[0.18em] text-blue-100">Central de suprimentos</p><h2 className="mt-2 text-2xl font-semibold">Visão geral de compras</h2><p className="mt-1 max-w-2xl text-sm text-blue-100">Acompanhe aprovação, pedidos, orçamento e fornecedores em uma única visão operacional.</p><div className="mt-3 flex flex-wrap gap-2 text-[11px] font-mono"><span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1">{dash.req_pending_count} aguardando aprovação</span><span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1">{dash.orders_active_count} pedido(s) em andamento</span>{dash.low_stock_count > 0 && <span className="rounded-full border border-amber-200/40 bg-amber-300/15 px-2.5 py-1 text-amber-100">{dash.low_stock_count} alerta(s) de estoque</span>}</div></div>
              <div className="flex flex-wrap gap-2"><button onClick={() => handleTabChange('solicitacoes')} className="rounded-lg bg-white px-3 py-2 text-xs font-bold font-mono uppercase text-[#0d2137] hover:bg-blue-50"><Plus size={14} className="mr-1 inline" /> Solicitação</button><button onClick={() => handleTabChange('ordens')} className="rounded-lg border border-white/40 px-3 py-2 text-xs font-bold font-mono uppercase text-white hover:bg-white/10">Pedidos</button><button onClick={() => handleTabChange('estoque')} className="rounded-lg border border-white/40 px-3 py-2 text-xs font-bold font-mono uppercase text-white hover:bg-white/10">Estoque</button><button onClick={() => handleTabChange('contratos')} className="rounded-lg border border-white/40 px-3 py-2 text-xs font-bold font-mono uppercase text-white hover:bg-white/10">Contratos</button></div>
            </div>
          </div>
          <div className="rounded-2xl border border-brand-border bg-brand-card p-4 shadow-sm">
            <div className="text-3xl font-bold font-mono text-brand-primary">{dash.req_pending_count}</div>
            <div className="text-xs font-mono uppercase text-brand-muted mt-1">Solicitações pendentes</div>
          </div>
          <div className="rounded-2xl border border-brand-border bg-brand-card p-4 shadow-sm">
            <div className="text-3xl font-bold font-mono text-brand-primary">{dash.orders_active_count}</div>
            <div className="text-xs font-mono uppercase text-brand-muted mt-1">Pedidos em aberto</div>
          </div>
          <div className="rounded-2xl border border-brand-border bg-brand-card p-4 shadow-sm">
            <div className="text-3xl font-bold font-mono text-brand-primary">{dash.low_stock_count}</div>
            <div className="text-xs font-mono uppercase text-brand-muted mt-1">Itens com estoque baixo</div>
          </div>
          <div className="rounded-2xl border border-brand-border bg-brand-card p-4 shadow-sm">
            <div className="text-3xl font-bold font-mono text-brand-primary">{fmt(dash.monthly_budget_used || 0)}</div>
            <div className="text-xs font-mono uppercase text-brand-muted mt-1">Uso do orçamento mensal</div>
            <div className="text-[11px] text-brand-muted mt-2">Base: {fmt(dash.monthly_budget_total || 0)}</div>
          </div>
          <div className="rounded-2xl border border-brand-border bg-brand-card p-4 shadow-sm">
            <div className="text-3xl font-bold font-mono text-brand-primary">{fmt(dash.requested_total || 0)}</div>
            <div className="text-xs font-mono uppercase text-brand-muted mt-1">Total solicitado</div>
          </div>
          <div className="rounded-2xl border border-brand-border bg-brand-card p-4 shadow-sm">
            <div className="text-3xl font-bold font-mono text-brand-primary">{fmt(dash.estimated_savings_total || 0)}</div>
            <div className="text-xs font-mono uppercase text-brand-muted mt-1">Economia estimada</div>
            <div className="text-[11px] text-brand-muted mt-2">Comprado: {fmt(dash.ordered_total || 0)}</div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-sm md:col-span-2 xl:col-span-6">
            <div className="flex flex-col gap-3 border-b border-brand-border bg-brand-dark/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="text-xs font-mono uppercase tracking-wider text-brand-muted">Atualizações de compras</div><div className="mt-1 text-sm font-semibold text-brand-text">Notificações operacionais</div></div>
              {unreadPurchaseNotifications.length > 0 && <button onClick={markPurchaseNotificationsRead} className="self-start rounded-lg border border-brand-primary/30 px-3 py-1.5 text-xs font-mono uppercase text-brand-primary hover:bg-brand-primary/10 sm:self-auto">Marcar {unreadPurchaseNotifications.length} como lida{unreadPurchaseNotifications.length > 1 ? 's' : ''}</button>}
            </div>
            {purchaseNotifications.length > 0 ? <div className="grid divide-y divide-brand-border/60 md:grid-cols-2 md:divide-x md:divide-y-0">{purchaseNotifications.slice(0, 4).map((notification) => <div key={notification.id} className="flex gap-3 p-4"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${notification.lido ? 'bg-brand-muted/40' : 'bg-brand-primary'}`} /><div className="min-w-0"><p className={`text-sm ${notification.lido ? 'text-brand-muted' : 'text-brand-text'}`}>{notification.mensagem}</p><p className="mt-1 text-[11px] font-mono text-brand-muted">{fmtDateTime(notification.data_criacao)}</p></div></div>)}</div> : <div className="p-5 text-center text-xs font-mono text-brand-muted">Nenhuma atualização operacional pendente.</div>}
          </div>

          <div className="grid gap-4 md:col-span-2 xl:col-span-6 xl:grid-cols-[1.2fr_.8fr]">
            <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-sm">
              <div className="flex items-center justify-between border-b border-brand-border bg-brand-dark/20 p-4"><div><div className="text-xs font-mono uppercase tracking-wider text-brand-muted">Fila operacional</div><div className="mt-1 text-sm font-semibold text-brand-text">Solicitações recentes</div></div><button onClick={() => handleTabChange('solicitacoes')} className="text-xs font-mono text-brand-primary hover:underline">Ver todas</button></div>
              <div className="divide-y divide-brand-border/60">
                {dash.requests_recent.map((r) => (
                  <div key={r.id} className="p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-brand-primary text-xs">{r.numero}</span>
                      <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 border ${requestStatusColor[r.status] ?? 'border-brand-border'}`}>{r.status}</span>
                    </div>
                    <span className="text-brand-text">{r.justificativa.slice(0, 60)}</span>
                    <div className="text-right">
                      <div className="font-mono text-xs text-brand-text">{fmt(r.valor_estimado_total || 0)}</div>
                      <div className="text-[11px] text-brand-muted mt-1">{r.nivel_aprovacao_sugerido}</div>
                    </div>
                  </div>
                ))}
                {dash.requests_recent.length === 0 && <div className="p-4 text-center text-brand-muted font-mono text-xs">Nenhuma solicitação.</div>}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-sm">
              <div className="border-b border-brand-border bg-brand-dark/20 p-4"><div className="text-xs font-mono uppercase tracking-wider text-brand-muted">Orçamento</div><div className="mt-1 text-sm font-semibold text-brand-text">Saúde dos centros de custo</div></div>
              <div className="p-4 grid grid-cols-2 gap-3 border-b border-brand-border">
                <div className="border border-brand-border bg-brand-dark/10 p-3">
                  <div className="text-2xl font-bold font-mono text-orange-400">{dash.cost_centers_alert || 0}</div>
                  <div className="text-[11px] uppercase font-mono text-brand-muted mt-1">Em alerta</div>
                </div>
                <div className="border border-brand-border bg-brand-dark/10 p-3">
                  <div className="text-2xl font-bold font-mono text-red-400">{dash.cost_centers_over_limit || 0}</div>
                  <div className="text-[11px] uppercase font-mono text-brand-muted mt-1">Acima do limite</div>
                </div>
              </div>
              <div className="divide-y divide-brand-border/60">
                {(dash.cost_centers_summary || []).slice(0, 5).map((cc) => (
                  <div key={cc.id} className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-mono text-xs text-brand-primary">{cc.codigo}</div>
                        <div className="text-sm text-brand-text mt-1">{cc.nome}</div>
                      </div>
                      <div className={`text-[10px] uppercase font-mono px-1.5 py-0.5 border ${
                        cc.status === 'over_limit' ? 'text-red-400 border-red-500/30' :
                        cc.status === 'alert' ? 'text-orange-400 border-orange-500/30' :
                        cc.status === 'no_budget' ? 'text-gray-400 border-gray-500/30' :
                        'text-green-400 border-green-500/30'
                      }`}>
                        {cc.status === 'over_limit' ? 'Acima do limite' : cc.status === 'alert' ? 'Alerta' : cc.status === 'no_budget' ? 'Sem orçamento' : 'Ok'}
                      </div>
                    </div>
                    <div className="mt-3 h-2 bg-brand-dark/20 border border-brand-border overflow-hidden">
                      <div
                        className={`h-full ${
                          cc.status === 'over_limit' ? 'bg-red-400' :
                          cc.status === 'alert' ? 'bg-orange-400' :
                          'bg-brand-primary'
                        }`}
                        style={{ width: `${Math.min(cc.uso_percentual || 0, 100)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-brand-muted">
                      <span>{fmt(cc.orcamento_mensal_usado || 0)}</span>
                      <span>{(cc.uso_percentual || 0).toFixed(1)}%</span>
                      <span>{fmt(cc.orcamento_mensal || 0)}</span>
                    </div>
                  </div>
                ))}
                {(dash.cost_centers_summary || []).length === 0 && <div className="p-4 text-center text-brand-muted font-mono text-xs">Nenhum centro de custo cadastrado.</div>}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-sm xl:col-span-2">
              <div className="flex items-center justify-between border-b border-brand-border bg-brand-dark/20 p-4"><div><div className="text-xs font-mono uppercase tracking-wider text-brand-muted">Parcerias</div><div className="mt-1 text-sm font-semibold text-brand-text">Fornecedores com maior volume</div></div><button onClick={() => handleTabChange('fornecedores')} className="text-xs font-mono text-brand-primary hover:underline">Ver fornecedores</button></div>
              <div className="divide-y divide-brand-border/60">
                {(dash.top_suppliers || []).map((supplier) => (
                  <div key={supplier.id} className="p-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm text-brand-text">{supplier.nome}</div>
                      <div className="text-[11px] text-brand-muted mt-1">{supplier.total_pedidos} pedido(s)</div>
                    </div>
                    <div className="text-right font-mono text-xs text-brand-primary">{fmt(supplier.valor_total || 0)}</div>
                  </div>
                ))}
                {(dash.top_suppliers || []).length === 0 && <div className="p-4 text-center text-brand-muted font-mono text-xs">Nenhum fornecedor com pedidos ainda.</div>}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:col-span-2 xl:col-span-6 xl:grid-cols-2">
            <div className="overflow-x-auto rounded-2xl border border-brand-border bg-brand-card shadow-sm">
              <div className="p-3 border-b border-brand-border bg-brand-dark/20 text-xs font-mono uppercase tracking-wider text-brand-muted">Relatório por centro de custo</div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-brand-border bg-brand-dark/10 text-xs font-mono uppercase tracking-wider text-brand-muted">
                    <th className="p-4">Centro</th>
                    <th className="p-4">Pendente</th>
                    <th className="p-4">Aprovado</th>
                    <th className="p-4">Comprado</th>
                    <th className="p-4">Economia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/60 text-sm">
                  {(dash.cost_center_reports || []).map((cc) => (
                    <tr key={cc.id} className="hover:bg-brand-dark/10">
                      <td className="p-4">
                        <div className="font-mono text-xs text-brand-primary">{cc.codigo}</div>
                        <div className="text-brand-text mt-1">{cc.nome}</div>
                      </td>
                      <td className="p-4 font-mono text-xs text-brand-text">{fmt(cc.solicitado_pendente || 0)}</td>
                      <td className="p-4 font-mono text-xs text-brand-text">{fmt(cc.solicitado_aprovado || 0)}</td>
                      <td className="p-4 font-mono text-xs text-brand-text">{fmt(cc.comprado_total || 0)}</td>
                      <td className="p-4 font-mono text-xs text-green-400">{fmt(cc.economia_total || 0)}</td>
                    </tr>
                  ))}
                  {(dash.cost_center_reports || []).length === 0 && (
                    <tr><td colSpan={5} className="p-10 text-center text-brand-muted font-mono text-sm">Nenhum dado de centro de custo ainda.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-brand-border bg-brand-card shadow-sm">
              <div className="p-3 border-b border-brand-border bg-brand-dark/20 text-xs font-mono uppercase tracking-wider text-brand-muted">Performance de fornecedores</div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-brand-border bg-brand-dark/10 text-xs font-mono uppercase tracking-wider text-brand-muted">
                    <th className="p-4">Fornecedor</th>
                    <th className="p-4">Pedidos</th>
                    <th className="p-4">Ativos</th>
                    <th className="p-4">Recebidos</th>
                    <th className="p-4">SLA</th>
                    <th className="p-4">Ticket Médio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/60 text-sm">
                  {(dash.supplier_performance || []).map((supplier) => (
                    <tr key={supplier.id} className="hover:bg-brand-dark/10">
                      <td className="p-4 text-brand-text">{supplier.nome}</td>
                      <td className="p-4 font-mono text-xs text-brand-text">{supplier.total_pedidos}</td>
                      <td className="p-4 font-mono text-xs text-orange-400">{supplier.pedidos_ativos}</td>
                      <td className="p-4 font-mono text-xs text-green-400">{supplier.pedidos_recebidos}</td>
                      <td className="p-4 text-xs">
                        <div className="font-mono text-brand-text">{(supplier.sla_percentual || 0).toFixed(1)}%</div>
                        <div className="text-[11px] text-brand-muted mt-1">{supplier.pedidos_no_prazo} no prazo · {supplier.pedidos_em_atraso} atrasado(s)</div>
                      </td>
                      <td className="p-4 font-mono text-xs text-brand-text">{fmt(supplier.ticket_medio || 0)}</td>
                    </tr>
                  ))}
                  {(dash.supplier_performance || []).length === 0 && (
                    <tr><td colSpan={6} className="p-10 text-center text-brand-muted font-mono text-sm">Nenhum fornecedor com histórico ainda.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ---------- SOLICITAÇÕES ---------- */}
      {!loading && tab === 'solicitacoes' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-3">
              <select value={requestCostCenterFilter} onChange={(e) => setRequestCostCenterFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                <option value="all">Todos os centros de custo</option>
                {costCenters.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.nome}</option>)}
              </select>
            </div>
            <button onClick={() => setReqModal(true)} className="bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold font-mono px-4 py-2.5 uppercase tracking-wider text-xs flex items-center space-x-1.5">
              <Plus size={16} /> <span>Nova Solicitação</span>
            </button>
          </div>
          <div className="border border-brand-border bg-brand-card overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-brand-border bg-brand-dark/20 text-xs font-mono uppercase tracking-wider text-brand-muted">
                  <th className="p-4">Número</th>
                  <th className="p-4">Centro de Custo</th>
                  <th className="p-4">Justificativa</th>
                  <th className="p-4">Valor Estimado</th>
                  <th className="p-4">Alçada Sugerida</th>
                  <th className="p-4">Urgência</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Orçamento</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/60 text-sm">
                {filteredRequests.map((r) => (
                  <tr key={r.id} className="hover:bg-brand-dark/10">
                    <td className="p-4 font-mono text-xs text-brand-primary">{r.numero}</td>
                    <td className="p-4 text-brand-text">{r.centro_custo?.nome ?? `#${r.centro_custo_id}`}</td>
                    <td className="p-4 text-brand-text max-w-xs truncate">{r.justificativa}</td>
                    <td className="p-4 font-mono text-xs text-brand-text">{fmt(r.valor_estimado_total || 0)}</td>
                    <td className="p-4 text-brand-muted">{r.nivel_aprovacao_sugerido || '—'}</td>
                    <td className="p-4 text-brand-text">{r.urgencia}</td>
                    <td className="p-4">
                      <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 border ${requestStatusColor[r.status] ?? 'border-brand-border'}`}>{r.status}</span>
                    </td>
                    <td className="p-4">
                      <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 border ${
                        r.situacao_orcamento_centro === 'Bloqueio por orçamento' || r.situacao_orcamento_centro === 'Acima do orçamento'
                          ? 'text-red-400 border-red-500/30'
                          : r.situacao_orcamento_centro === 'Em alerta'
                            ? 'text-orange-400 border-orange-500/30'
                            : 'text-green-400 border-green-500/30'
                      }`}>
                        {r.situacao_orcamento_centro || '—'}
                      </span>
                    </td>
                    <td className="p-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => setViewingRequest(r)}
                        className="text-brand-text border border-brand-border px-2.5 py-1.5 font-mono text-xs uppercase mr-2 hover:bg-brand-dark/30 hover:border-brand-primary/40 transition-colors"
                        title="Visualizar itens e detalhes da solicitação"
                      >
                        <Eye size={12} className="inline mr-1" /> Detalhes
                      </button>
                      {manage && ['Pendente', 'Em aprovação'].includes(r.status) && (
                        <>
                          <button onClick={() => decideRequest(r, 'Aprovado')} className="text-green-400 border border-green-500/30 px-2.5 py-1.5 font-mono text-xs uppercase mr-2 hover:bg-green-500/10">
                            <CheckCircle2 size={12} className="inline mr-1" /> Aprovar
                          </button>
                          <button onClick={() => decideRequest(r, 'Reprovado')} className="text-red-400 border border-red-500/30 px-2.5 py-1.5 font-mono text-xs uppercase mr-2 hover:bg-red-500/10">
                            <Ban size={12} className="inline mr-1" /> Reprovar
                          </button>
                        </>
                      )}
                      {manage && r.status === 'Aguardando Liberação de Orçamento' && (
                        <button onClick={() => releaseBudget(r)} className="text-orange-400 border border-orange-500/30 px-2.5 py-1.5 font-mono text-xs uppercase mr-2 hover:bg-orange-500/10">
                          <ClipboardList size={12} className="inline mr-1" /> Liberar Orçamento
                        </button>
                      )}
                      {manage && r.status === 'Aprovada' && (
                        <button onClick={() => openQuotationModal(r)} className="text-brand-primary border border-brand-primary/30 px-2.5 py-1.5 font-mono text-xs uppercase hover:bg-brand-primary/10">
                          <Gavel size={12} className="inline mr-1" /> Cotar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredRequests.length === 0 && (
                  <tr><td colSpan={9} className="p-12 text-center text-brand-muted font-mono text-sm">Nenhuma solicitação de compra.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------- COTAÇÕES ---------- */}
      {!loading && tab === 'cotacoes' && (
        <div className="border border-brand-border bg-brand-card overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-brand-border bg-brand-dark/20 text-xs font-mono uppercase tracking-wider text-brand-muted">
                <th className="p-4">Número</th>
                <th className="p-4">Solicitação</th>
                <th className="p-4">Status</th>
                <th className="p-4">Fornecedores</th>
                <th className="p-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/60 text-sm">
              {quotations.map((q) => (
                <tr key={q.id} className="hover:bg-brand-dark/10">
                  <td className="p-4 font-mono text-xs text-brand-primary">{q.numero}</td>
                  <td className="p-4 text-brand-text">{q.request?.numero ?? `#${q.request_id}`}</td>
                  <td className="p-4 text-brand-text">{q.status}</td>
                  <td className="p-4">
                    <div className="space-y-1">
                      {q.suppliers.map((s) => {
                        const isCheapest = s.id === getQuotationCheapestSupplierId(q);
                        const isFastest = s.id === getQuotationFastestSupplierId(q);
                        const isBestValue = s.id === getQuotationBestValueSupplierId(q);
                        return (
                          <div key={s.id} className="rounded-xl border border-brand-border/40 bg-brand-dark/10 p-2 text-xs space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-brand-text">{s.fornecedor?.nome ?? `#${s.fornecedor_id}`}</span>
                              <span className="font-mono text-brand-muted">{fmt(s.valor_total)}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {isCheapest && <span className="rounded-full border border-cyan-400/40 bg-cyan-500/15 px-2 py-0.5 font-mono uppercase text-[#1079ea]">Menor preço</span>}
                              {isFastest && <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 font-mono uppercase text-[#d98a30]">Menor prazo</span>}
                              {isBestValue && <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 font-mono uppercase text-[#63a83e]">Melhor custo-benefício</span>}
                              {s.escolhido && <span className="rounded-full border border-green-400/40 bg-green-500/15 px-2 py-0.5 font-mono uppercase text-[#439d52]">Vencedor</span>}
                            </div>
                            <div className="text-brand-muted">
                              Prazo: {s.prazo_entrega_dias} dia(s) · Motivo sugerido: {getQuotationWinnerReason(q, s.id)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {getWinnerSupplier(q) && (
                      <div className="mt-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-mono uppercase text-[#4c9532]">
                            Decisão registrada
                          </span>
                          <span className="text-xs text-brand-text">
                            Vencedor: <span className="font-semibold">{getWinnerSupplier(q)?.fornecedor?.nome ?? `#${getWinnerSupplier(q)?.fornecedor_id}`}</span>
                          </span>
                        </div>
                        <div className="text-xs text-brand-muted">
                          Critério de escolha identificado: {getQuotationWinnerReason(q, getWinnerSupplier(q)!.id)}.
                        </div>
                        {getQuotationRiskFlags(q).length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {getQuotationRiskFlags(q).map((risk) => (
                              <span
                                key={`${q.id}-${risk.label}`}
                                className={`rounded-full border px-2 py-1 text-[10px] font-mono uppercase ${
                                  risk.tone === 'red'
                                    ? 'border-red-400/40 bg-red-500/15 text-[#9c4444]'
                                    : 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                                }`}
                                title={risk.message}
                              >
                                {risk.label}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="grid gap-2 md:grid-cols-5 text-xs">
                          <div className="rounded-xl border border-brand-border/50 bg-brand-dark/15 px-3 py-2">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-brand-muted">Estimado</div>
                            <div className="mt-1 font-mono text-brand-text">{fmt(getQuotationEstimatedTotal(q))}</div>
                          </div>
                          <div className="rounded-xl border border-brand-border/50 bg-brand-dark/15 px-3 py-2">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-brand-muted">Valor vencedor</div>
                            <div className="mt-1 font-mono text-brand-text">{fmt(getWinnerSupplier(q)!.valor_total || 0)}</div>
                          </div>
                          <div className="rounded-xl border border-brand-border/50 bg-brand-dark/15 px-3 py-2">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-brand-muted">Prazo vencedor</div>
                            <div className="mt-1 font-mono text-brand-text">{getWinnerSupplier(q)!.prazo_entrega_dias} dia(s)</div>
                          </div>
                          <div className="rounded-xl border border-brand-border/50 bg-brand-dark/15 px-3 py-2">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-brand-muted">Pedido gerado</div>
                            <div className="mt-1 font-mono text-brand-text">{getOrderForQuotation(q.id)?.numero ?? 'Em processamento'}</div>
                          </div>
                          <div className={`rounded-xl border px-3 py-2 ${
                            getQuotationSavings(q) >= 0
                              ? 'border-green-400/30 bg-green-500/10'
                              : 'border-red-400/30 bg-red-500/10'
                          }`}>
                            <div className="text-[10px] font-mono uppercase tracking-wider text-brand-muted">
                              {getQuotationSavings(q) >= 0 ? 'Economia' : 'Acima do estimado'}
                            </div>
                            <div className={`mt-1 font-mono ${getQuotationSavings(q) >= 0 ? 'text-green-200' : 'text-[#b91d1d]'}`}>
                              {fmt(Math.abs(getQuotationSavings(q)))}
                            </div>
                            <div className="mt-1 text-[11px] text-brand-muted">
                              {Math.abs(getQuotationSavingsPercent(q)).toFixed(1)}%
                            </div>
                          </div>
                        </div>
                        {getOrderForQuotation(q.id) && (
                          <div className="rounded-xl border border-brand-border/50 bg-brand-dark/15 px-3 py-2 text-xs text-brand-muted">
                            Pedido <span className="font-mono text-brand-text">{getOrderForQuotation(q.id)?.numero}</span> emitido em{' '}
                            <span className="font-mono text-brand-text">{fmtDateTime(getOrderForQuotation(q.id)?.data_emissao)}</span>
                            {' '}no valor de <span className="font-mono text-brand-text">{fmt(getOrderForQuotation(q.id)?.valor_total || 0)}</span>.
                          </div>
                        )}
                        <div className={`rounded-xl border px-3 py-2 text-xs ${
                          getQuotationSavings(q) >= 0
                            ? 'border-green-400/30 bg-green-500/10 text-green-100'
                            : 'border-red-400/30 bg-red-500/10 text-[#c84646]'
                        }`}>
                          {getQuotationSavings(q) >= 0
                            ? `A decisão desta cotação gerou economia de ${fmt(Math.abs(getQuotationSavings(q)))} em relação ao valor estimado da solicitação.`
                            : `A decisão desta cotação ficou ${fmt(Math.abs(getQuotationSavings(q)))} acima do valor estimado da solicitação.`}
                        </div>
                        {getQuotationRiskFlags(q).map((risk) => (
                          <div
                            key={`${q.id}-risk-message-${risk.label}`}
                            className={`rounded-xl border px-3 py-2 text-xs ${
                              risk.tone === 'red'
                                ? 'border-red-400/30 bg-red-500/10 text-[#c84646]'
                                : 'border-amber-400/30 bg-amber-500/10 text-amber-100'
                            }`}
                          >
                            {risk.message}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-right whitespace-nowrap">
                    {manage && q.status === 'Em cotação' && (
                      <div className="flex flex-col items-end gap-2">
                        {q.suppliers.map((s) => {
                          const reason = getQuotationWinnerReason(q, s.id);
                          const recommended = s.id === getQuotationBestValueSupplierId(q);
                          return (
                            <button
                              key={s.id}
                              onClick={() => selectWinner(q.id, s.id)}
                              className={`px-2.5 py-1.5 font-mono text-xs uppercase hover:bg-brand-primary/10 border ${
                                recommended
                                  ? 'text-[#43a85c] border-emerald-400/40 bg-emerald-500/10'
                                  : 'text-brand-primary border-brand-primary/30'
                              }`}
                              title={`Escolher ${s.fornecedor?.nome ?? `#${s.fornecedor_id}`} por ${reason}`}
                            >
                              <ArrowRightCircle size={12} className="inline mr-1" />
                              {recommended ? 'Escolher recomendado' : 'Escolher'}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {quotations.length === 0 && (
                <tr><td colSpan={5} className="p-12 text-center text-brand-muted font-mono text-sm">Nenhuma cotação.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------- ORDENS ---------- */}
      {!loading && tab === 'ordens' && (
        <div className="space-y-4">
          {manage && (
            <div className="flex justify-end">
              <button onClick={() => setOrderModal(true)} className="bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold font-mono px-4 py-2.5 uppercase tracking-wider text-xs flex items-center space-x-1.5">
                <Plus size={16} /> <span>Novo Pedido</span>
              </button>
            </div>
          )}
          <div className="border border-brand-border bg-brand-card overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-brand-border bg-brand-dark/20 text-xs font-mono uppercase tracking-wider text-brand-muted">
                  <th className="p-4">Número</th>
                  <th className="p-4">Fornecedor</th>
                  <th className="p-4">Valor Total</th>
                  <th className="p-4">Comparativo</th>
                  <th className="p-4">Prazo / SLA</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Emissão</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/60 text-sm">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-brand-dark/10">
                    <td className="p-4 font-mono text-xs text-brand-primary">{o.numero}</td>
                    <td className="p-4 text-brand-text">{o.fornecedor?.nome ?? `#${o.fornecedor_id}`}</td>
                    <td className="p-4 font-mono text-xs text-brand-text">{fmt(o.valor_total)}</td>
                    <td className="p-4 text-xs">
                      <div className="font-mono text-brand-text">Solicitado: {fmt(o.request_valor_estimado_total || 0)}</div>
                      <div className={`font-mono mt-1 ${(o.economia_estimada || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {(o.economia_estimada || 0) >= 0 ? 'Economia' : 'Acima do estimado'}: {fmt(Math.abs(o.economia_estimada || 0))}
                      </div>
                    </td>
                    <td className="p-4 text-xs">
                      <div className="font-mono text-brand-text">
                        {o.data_prevista_entrega ? `Previsto: ${new Date(o.data_prevista_entrega).toLocaleDateString('pt-BR')}` : 'Sem prazo previsto'}
                      </div>
                      <div className={`font-mono mt-1 ${
                        o.sla_status?.includes('atraso') || o.sla_status === 'Em atraso'
                          ? 'text-red-400'
                          : o.sla_status?.includes('prazo')
                            ? 'text-green-400'
                            : 'text-brand-muted'
                      }`}>
                        {o.sla_status || 'Sem SLA'}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 border ${orderStatusColor[o.status] ?? 'border-brand-border'}`}>{o.status}</span>
                      {(o.receivings || []).some((receiving) => receiving.nota_fiscal) && <div className="mt-2 space-y-1">{Array.from(new Map((o.receivings || []).filter((receiving) => receiving.nota_fiscal).map((receiving) => [receiving.nota_fiscal!.id, receiving.nota_fiscal!])).values()).map((invoice) => <div key={invoice.id} className="font-mono text-[10px] text-cyan-400">NF-e {invoice.numero_nota}</div>)}</div>}
                    </td>
                    <td className="p-4 font-mono text-xs">{new Date(o.data_emissao).toLocaleDateString('pt-BR')}</td>
                    <td className="p-4 text-right whitespace-nowrap">
                      {manage && o.status === 'Aberto' && (
                        <button onClick={() => updateOrderStatus(o, 'Enviado')} className="text-cyan-400 border border-cyan-500/30 px-2.5 py-1.5 font-mono text-xs uppercase mr-2 hover:bg-cyan-500/10">
                          Enviar
                        </button>
                      )}
                      {manage && o.status === 'Enviado' && (
                        <button onClick={() => updateOrderStatus(o, 'Aceito')} className="text-yellow-400 border border-yellow-500/30 px-2.5 py-1.5 font-mono text-xs uppercase mr-2 hover:bg-yellow-500/10">
                          Aceitar
                        </button>
                      )}
                      {manage && ['Aceito', 'Recebido parcialmente'].includes(o.status) && (
                        <button onClick={() => updateOrderStatus(o, 'Em transporte')} className="text-cyan-500 border border-cyan-500/30 px-2.5 py-1.5 font-mono text-xs uppercase mr-2 hover:bg-cyan-500/10">
                          Em Transporte
                        </button>
                      )}
                      {manage && ['Aberto', 'Enviado', 'Aceito', 'Em transporte'].includes(o.status) && (
                        <button onClick={() => openReceivingModal(o)} className="text-green-400 border border-green-500/30 px-2.5 py-1.5 font-mono text-xs uppercase hover:bg-green-500/10">
                          <Package size={12} className="inline mr-1" /> Receber
                        </button>
                      )}
                      {manage && ['Aberto', 'Enviado', 'Aceito', 'Em transporte'].includes(o.status) && (
                        <button onClick={() => cancelOrder(o)} className="ml-2 text-red-400 border border-red-500/30 px-2.5 py-1.5 font-mono text-xs uppercase hover:bg-red-500/10">
                          <Ban size={12} className="inline mr-1" /> Cancelar
                        </button>
                      )}
                      {manage && ['Recebido parcialmente', 'Recebido totalmente'].includes(o.status) && (
                        <button onClick={() => handleReconcileOrder(o.id)} className="text-blue-400 border border-blue-500/30 px-2.5 py-1.5 font-mono text-xs uppercase hover:bg-blue-500/10 ml-2" title="Reconciliar saldo de estoque">
                          <RefreshCw size={12} className="inline mr-1" /> Reconciliar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr><td colSpan={8} className="p-12 text-center text-brand-muted font-mono text-sm">Nenhum pedido de compra.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------- ESTOQUE ---------- */}
      {!loading && tab === 'estoque' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            {manage && (
              <button onClick={() => setStockConsumeModal(true)} className="bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold font-mono px-4 py-2.5 uppercase tracking-wider text-xs flex items-center space-x-1.5">
                <Package size={16} /> <span>Registrar Consumo</span>
              </button>
            )}
          </div>

          <div className="border border-brand-border bg-brand-card overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-brand-border bg-brand-dark/20 text-xs font-mono uppercase tracking-wider text-brand-muted">
                  <th className="p-4">Material</th>
                  <th className="p-4">Categoria</th>
                  <th className="p-4">Saldo</th>
                  <th className="p-4">Localização</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/60 text-sm">
                {stock.map((s) => (
                  <tr key={s.id} className="hover:bg-brand-dark/10">
                    <td className="p-4 text-brand-text">{s.product?.nome ?? `#${s.product_id}`}</td>
                    <td className="p-4 text-brand-muted">{s.product?.categoria?.nome ?? '—'}</td>
                    <td className="p-4 font-mono text-xs">
                      <span className={s.quantidade_saldo < 5 ? 'text-red-400' : 'text-brand-primary'}>{s.quantidade_saldo}</span>
                    </td>
                    <td className="p-4 text-brand-muted">{s.localizacao_almoxarifado ?? '—'}</td>
                  </tr>
                ))}
                {stock.length === 0 && (
                  <tr><td colSpan={4} className="p-12 text-center text-brand-muted font-mono text-sm">Nenhum item em estoque.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border border-brand-border bg-brand-card overflow-x-auto">
            <div className="p-4 border-b border-brand-border bg-brand-dark/20">
              <div className="text-xs font-mono uppercase tracking-wider text-brand-muted">Movimentações recentes de estoque</div>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-brand-border bg-brand-dark/10 text-xs font-mono uppercase tracking-wider text-brand-muted">
                  <th className="p-4">Data</th>
                  <th className="p-4">Tipo</th>
                  <th className="p-4">Quantidade</th>
                  <th className="p-4">Responsável</th>
                  <th className="p-4">Justificativa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/60 text-sm">
                {stockTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-brand-dark/10">
                    <td className="p-4 font-mono text-xs text-brand-text">{new Date(tx.data_transacao).toLocaleString('pt-BR')}</td>
                    <td className="p-4">
                      <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 border ${tx.tipo_movimentacao === 'Saída' ? 'text-red-400 border-red-500/30' : 'text-green-400 border-green-500/30'}`}>
                        {tx.tipo_movimentacao}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-xs text-brand-text">{tx.quantidade}</td>
                    <td className="p-4 text-brand-muted">{tx.user?.nome ?? `#${tx.user_id}`}</td>
                    <td className="p-4 text-brand-text">{tx.justificativa ?? '—'}</td>
                  </tr>
                ))}
                {stockTransactions.length === 0 && (
                  <tr><td colSpan={5} className="p-12 text-center text-brand-muted font-mono text-sm">Nenhuma movimentação registrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {stockConsumeModal && (
        <div className="fixed inset-0 bg-brand-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-xl border border-brand-border bg-brand-card p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-brand-border pb-4">
              <h3 className="text-lg font-bold font-mono uppercase tracking-wider text-brand-text">Registrar Consumo de Estoque</h3>
              <button onClick={() => setStockConsumeModal(false)} className="text-brand-muted hover:text-brand-text"><X size={20} /></button>
            </div>
            <form onSubmit={submitStockConsume} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Item de estoque</label>
                <select value={consumeStockId} onChange={(e) => setConsumeStockId(e.target.value ? Number(e.target.value) : '')} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                  <option value="">Selecione...</option>
                  {stock.map((s) => <option key={s.id} value={s.id}>{s.product?.nome ?? `#${s.product_id}`} · saldo {s.quantidade_saldo}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Quantidade</label>
                  <input type="number" min="0.01" step="0.01" value={consumeQty} onChange={(e) => setConsumeQty(Number(e.target.value))} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Centro de custo</label>
                  <select value={consumeCCId} onChange={(e) => setConsumeCCId(e.target.value ? Number(e.target.value) : '')} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                    <option value="">Opcional...</option>
                    {costCenters.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.nome}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Justificativa</label>
                <textarea value={consumeJustification} onChange={(e) => setConsumeJustification(e.target.value)} rows={3} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none" placeholder="Ex.: uso interno do suporte, reposição de campo, atendimento emergencial..." />
              </div>
              <div className="flex justify-end space-x-3 pt-4 border-t border-brand-border">
                <button type="button" onClick={() => setStockConsumeModal(false)} className="border border-brand-border hover:bg-brand-card px-4 py-2 font-mono text-xs uppercase">Cancelar</button>
                <button type="submit" disabled={savingConsume} className="bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-60 text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-xs">
                  {savingConsume ? 'Salvando...' : 'Registrar Consumo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------- CONTRATOS ---------- */}
      {!loading && tab === 'contratos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="font-mono text-sm font-bold uppercase text-brand-text">Contratos</h2><p className="mt-1 text-xs text-brand-muted">Acompanhe vigência, valor e renovação dos contratos com fornecedores.</p></div>
            {manage && <button onClick={() => openContractModal()} className="bg-brand-primary px-4 py-2.5 text-xs font-bold font-mono uppercase tracking-wider text-brand-dark hover:bg-brand-primary/90"><Plus size={15} className="mr-1 inline" /> Novo contrato</button>}
          </div>
          <div className="overflow-x-auto border border-brand-border bg-brand-card">
            <table className="w-full border-collapse text-left text-sm"><thead><tr className="border-b border-brand-border bg-brand-dark/20 text-xs font-mono uppercase tracking-wider text-brand-muted"><th className="p-4">Número</th><th className="p-4">Fornecedor</th><th className="p-4">Tipo</th><th className="p-4">Vigência</th><th className="p-4">Valor</th><th className="p-4">Renovação</th><th className="p-4 text-right">Ações</th></tr></thead>
              <tbody className="divide-y divide-brand-border/60">{contracts.map((contract) => <tr key={contract.id} className="hover:bg-brand-dark/10"><td className="p-4 font-mono text-xs text-brand-primary">{contract.numero}</td><td className="p-4 text-brand-text">{contract.fornecedor?.nome ?? `#${contract.fornecedor_id}`}</td><td className="p-4 text-brand-muted">{contract.tipo}</td><td className="p-4 text-xs text-brand-muted">{fmtDateTime(contract.data_inicio).slice(0, 10)} até {fmtDateTime(contract.data_fim).slice(0, 10)}</td><td className="p-4 font-mono text-xs text-brand-text">{fmt(contract.valor)}</td><td className="p-4 text-xs text-brand-muted">{contract.renovacao_automatica ? 'Automática' : 'Manual'}</td><td className="p-4 text-right whitespace-nowrap">{manage && <><button onClick={() => openContractModal(contract)} className="mr-2 border border-brand-primary/30 px-2.5 py-1.5 text-xs font-mono uppercase text-brand-primary hover:bg-brand-primary/10"><Pencil size={12} className="mr-1 inline" />Editar</button><button onClick={() => deleteContract(contract)} className="border border-red-500/30 px-2.5 py-1.5 text-xs font-mono uppercase text-red-400 hover:bg-red-500/10"><Trash2 size={12} className="mr-1 inline" />Excluir</button></>}</td></tr>)}
              {contracts.length === 0 && <tr><td colSpan={7} className="p-12 text-center font-mono text-sm text-brand-muted">Nenhum contrato cadastrado.</td></tr>}</tbody></table>
          </div>
          <div className="rounded-2xl border border-brand-border bg-brand-card p-5">
            <div className="mb-4"><div className="text-xs font-mono uppercase tracking-wider text-brand-muted">Base de classificação</div><h3 className="mt-1 text-sm font-semibold text-brand-text">Tipos de contrato</h3><p className="mt-1 text-xs text-brand-muted">Padronize os tipos usados nos contratos, como licença, suporte, locação e serviço.</p></div>
            {manage && <form onSubmit={createContractType} className="grid gap-3 md:grid-cols-[1fr_1.5fr_auto]"><input value={contractTypeName} onChange={(e) => setContractTypeName(e.target.value)} placeholder="Nome do tipo" className="border border-brand-border bg-brand-dark px-3 py-2 text-sm text-brand-text" /><input value={contractTypeDescription} onChange={(e) => setContractTypeDescription(e.target.value)} placeholder="Descrição opcional" className="border border-brand-border bg-brand-dark px-3 py-2 text-sm text-brand-text" /><button type="submit" disabled={savingContractType} className="bg-brand-primary px-4 py-2 text-xs font-bold font-mono uppercase text-brand-dark disabled:opacity-60">{savingContractType ? 'Salvando...' : 'Criar tipo'}</button></form>}
            <div className="mt-4 flex flex-wrap gap-2">{contractTypes.map((type) => <span key={type.id} className="rounded-full border border-brand-primary/25 bg-brand-primary/5 px-3 py-1.5 text-xs text-brand-text">{type.nome}{type.descricao && <span className="ml-1 text-brand-muted">· {type.descricao}</span>}</span>)}{contractTypes.length === 0 && <span className="text-xs text-brand-muted">Nenhum tipo cadastrado.</span>}</div>
          </div>
        </div>
      )}

      {/* ---------- PESQUISAS ---------- */}
      {!loading && tab === 'pesquisas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-mono text-sm font-bold uppercase text-brand-text">Pesquisas de compra</h2><p className="mt-1 text-xs text-brand-muted">Registre referências de mercado e encaminhe itens para aprovação.</p></div><button onClick={() => setResearchModal(true)} className="bg-brand-primary px-4 py-2.5 text-xs font-bold font-mono uppercase tracking-wider text-brand-dark hover:bg-brand-primary/90"><Plus size={15} className="mr-1 inline" /> Nova pesquisa</button></div>
          <div className="space-y-3">{researches.map((research) => <div key={research.id} className="border border-brand-border bg-brand-card p-4"><div className="flex flex-col justify-between gap-3 md:flex-row"><div><div className="flex items-center gap-2"><span className="font-mono text-xs text-brand-primary">{research.numero}</span><span className="border border-brand-border px-2 py-0.5 font-mono text-[10px] uppercase text-brand-muted">{research.status}</span></div><h3 className="mt-2 font-semibold text-brand-text">{research.titulo}</h3><p className="mt-1 text-xs text-brand-muted">{research.justificativa}</p></div><div className="text-xs text-brand-muted">{research.solicitante?.nome || 'Solicitante'}<br />{fmtDateTime(research.data_criacao)}</div></div><div className="mt-3 grid gap-2 md:grid-cols-2">{research.items.map((item) => <div key={item.id} className="rounded border border-brand-border/60 bg-brand-dark/15 p-3 text-xs"><div className="font-medium text-brand-text">{item.nome_produto}</div><div className="mt-1 text-brand-muted">{item.quantidade} un. · {item.tipo_produto} · {fmt(item.valor_estimado)}</div>{item.link_produto && <a className="mt-1 inline-flex items-center text-brand-primary hover:underline" href={item.link_produto} target="_blank" rel="noreferrer">Ver referência <ExternalLink size={12} className="ml-1" /></a>}</div>)}</div>{manage && research.status === 'Pendente' && <div className="mt-4 flex gap-2"><button onClick={() => decideResearch(research, 'aprovar')} className="border border-green-500/30 px-3 py-2 text-xs font-mono uppercase text-green-400 hover:bg-green-500/10"><CheckCircle2 size={13} className="mr-1 inline" /> Aprovar e converter</button><button onClick={() => decideResearch(research, 'rejeitar')} className="border border-red-500/30 px-3 py-2 text-xs font-mono uppercase text-red-400 hover:bg-red-500/10"><Ban size={13} className="mr-1 inline" /> Reprovar</button></div>}</div>)}
            {researches.length === 0 && <div className="border border-brand-border bg-brand-card p-12 text-center font-mono text-sm text-brand-muted">Nenhuma pesquisa de compra cadastrada.</div>}</div>
        </div>
      )}

      {!loading && tab === 'cadastros' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_.85fr] gap-6">
            <div className="border border-brand-border bg-brand-card p-6 space-y-5">
              <div className="flex items-center space-x-2 border-b border-brand-border pb-3">
                <Building2 size={18} className="text-brand-primary" />
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-brand-text">Centros de Custo</h3>
                  <p className="text-[11px] text-brand-muted mt-1">Base orçamentária do processo de compras. Sem isso, solicitação e pedido ficam sem governança.</p>
                </div>
              </div>

              <form onSubmit={submitCostCenter} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Código *</label>
                    <input value={ccCodigo} onChange={(e) => setCCCodigo(e.target.value)} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none" placeholder="Ex.: CC-TI-01" />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Nome *</label>
                    <input value={ccNome} onChange={(e) => setCCNome(e.target.value)} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none" placeholder="Ex.: TI / Operações" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Departamento</label>
                    <select value={ccDepartamentoId} onChange={(e) => setCCDepartamentoId(e.target.value ? Number(e.target.value) : '')} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                      <option value="">—</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Responsável</label>
                    <select value={ccResponsavelId} onChange={(e) => setCCResponsavelId(e.target.value ? Number(e.target.value) : '')} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                      <option value="">—</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Orçamento Mensal</label>
                    <input type="number" step="0.01" value={ccOrcamentoMensal} onChange={(e) => setCCOrcamentoMensal(Number(e.target.value))} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Orçamento Anual</label>
                    <input type="number" step="0.01" value={ccOrcamentoAnual} onChange={(e) => setCCOrcamentoAnual(Number(e.target.value))} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none font-mono" />
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 py-2 border-t border-b border-brand-border/40">
                  <label className="flex items-center gap-2 text-sm text-brand-text">
                    <input type="checkbox" checked={ccAlertaLimite} onChange={(e) => setCCAlertaLimite(e.target.checked)} />
                    Alertar ao atingir limite
                  </label>
                  <label className="flex items-center gap-2 text-sm text-brand-text">
                    <input type="checkbox" checked={ccBloquearLimite} onChange={(e) => setCCBloquearLimite(e.target.checked)} />
                    Bloquear ao ultrapassar orçamento
                  </label>
                </div>

                <div className="flex justify-end gap-3">
                  {editingCCId && (
                    <button type="button" onClick={resetCostCenterForm} className="border border-brand-border hover:bg-brand-card px-4 py-2 font-mono text-xs uppercase">
                      Cancelar edição
                    </button>
                  )}
                  <button type="submit" disabled={savingCC} className="bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-60 text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-xs flex items-center gap-2">
                    <Save size={14} />
                    <span>{savingCC ? 'Salvando...' : editingCCId ? 'Atualizar Centro de Custo' : 'Cadastrar Centro de Custo'}</span>
                  </button>
                </div>
              </form>
            </div>

            <div className="space-y-6">
              <div className="border border-brand-border bg-brand-card p-6 space-y-4">
                <div className="flex items-center space-x-2 border-b border-brand-border pb-3">
                  <ShieldAlert size={18} className="text-brand-primary" />
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-brand-text">Alçadas de aprovação</h3>
                    <p className="text-[11px] text-brand-muted mt-1">Defina até onde cada faixa de valor pode ser aprovada automaticamente no fluxo de compras.</p>
                  </div>
                </div>

                <form onSubmit={saveApprovalConfig} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Até Gestor</label>
                      <input type="number" min="0" step="0.01" value={approvalLimitGestor} onChange={(e) => setApprovalLimitGestor(Number(e.target.value))} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Até Gerente</label>
                      <input type="number" min="0" step="0.01" value={approvalLimitGerente} onChange={(e) => setApprovalLimitGerente(Number(e.target.value))} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Até Financeiro</label>
                      <input type="number" min="0" step="0.01" value={approvalLimitFinanceiro} onChange={(e) => setApprovalLimitFinanceiro(Number(e.target.value))} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none font-mono" />
                    </div>
                  </div>
                  <div className="text-[11px] text-brand-muted">
                    Acima do limite do Financeiro, a aprovação sugerida passa automaticamente para Diretoria.
                  </div>
                  <div className="flex justify-end">
                    <button type="submit" disabled={savingApprovalConfig} className="bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-60 text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-xs">
                      {savingApprovalConfig ? 'Salvando...' : 'Salvar Alçadas'}
                    </button>
                  </div>
                </form>
              </div>

              <div className="border border-brand-border bg-brand-card p-6 space-y-4">
                <div className="flex items-center space-x-2 border-b border-brand-border pb-3">
                  <Boxes size={18} className="text-brand-primary" />
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-brand-text">Cadastros rápidos</h3>
                    <p className="text-[11px] text-brand-muted mt-1">Base mínima para sustentar solicitações, cotações, pedidos e estoque.</p>
                  </div>
                </div>

                <form onSubmit={createCategory} className="space-y-3">
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted">Categoria de compra</label>
                  <div className="flex gap-3">
                    <input value={categoryNome} onChange={(e) => setCategoryNome(e.target.value)} className="flex-1 bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none" placeholder="Ex.: Infraestrutura, Licenças, Periféricos" />
                    <button type="submit" disabled={savingCategory} className="bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-60 text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-xs">
                      {savingCategory ? 'Salvando...' : editingCategoryId ? 'Atualizar' : 'Criar'}
                    </button>
                  </div>
                  {editingCategoryId && (
                    <button type="button" onClick={() => { setEditingCategoryId(null); setCategoryNome(''); }} className="border border-brand-border hover:bg-brand-card px-3 py-2 font-mono text-xs uppercase">
                      Cancelar edição
                    </button>
                  )}
                </form>

                <form onSubmit={createProduct} className="space-y-3 border-t border-brand-border pt-4">
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted">Produto de compra</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input value={productCodigo} onChange={(e) => setProductCodigo(e.target.value)} className="bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none font-mono" placeholder="Código" />
                    <input value={productNome} onChange={(e) => setProductNome(e.target.value)} className="bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none" placeholder="Nome do produto" />
                    <select value={productCategoriaId} onChange={(e) => setProductCategoriaId(e.target.value ? Number(e.target.value) : '')} className="bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                      <option value="">Categoria...</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                    <input value={productUnidade} onChange={(e) => setProductUnidade(e.target.value)} className="bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none font-mono" placeholder="UN" />
                    <select value={productTipo} onChange={(e) => setProductTipo(e.target.value)} className="bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none md:col-span-2">
                      {['Produto', 'Serviço', 'Licença', 'Assinatura', 'Equipamento', 'Material de Consumo'].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <button type="submit" disabled={savingProduct} className="bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-60 text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-xs">
                    {savingProduct ? 'Salvando...' : editingProductId ? 'Atualizar Produto' : 'Cadastrar Produto'}
                  </button>
                  {editingProductId && (
                    <button type="button" onClick={() => { setEditingProductId(null); setProductCodigo(''); setProductNome(''); setProductCategoriaId(''); setProductUnidade('UN'); setProductTipo('Produto'); }} className="ml-3 border border-brand-border hover:bg-brand-card px-3 py-2 font-mono text-xs uppercase">
                      Cancelar edição
                    </button>
                  )}
                </form>
              </div>
            </div>
          </div>

          <div className="border border-brand-border bg-brand-card overflow-x-auto">
            <div className="p-4 border-b border-brand-border bg-brand-dark/20 flex items-center justify-between">
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-brand-muted">Centros de custo cadastrados</div>
                <div className="text-[11px] text-brand-muted mt-1">{costCenters.length} registro(s) ativos na governança de compras.</div>
              </div>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-brand-border bg-brand-dark/10 text-xs font-mono uppercase tracking-wider text-brand-muted">
                  <th className="p-4">Código</th>
                  <th className="p-4">Nome</th>
                  <th className="p-4">Departamento</th>
                  <th className="p-4">Responsável</th>
                  <th className="p-4">Orçamento</th>
                  <th className="p-4">Uso</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/60 text-sm">
                {costCenters.map((cc) => (
                  <tr key={cc.id} className="hover:bg-brand-dark/10">
                    <td className="p-4 font-mono text-xs text-brand-primary">{cc.codigo}</td>
                    <td className="p-4 text-brand-text">{cc.nome}</td>
                    <td className="p-4 text-brand-muted">{cc.departamento?.nome || '—'}</td>
                    <td className="p-4 text-brand-muted">{cc.responsavel?.nome || '—'}</td>
                    <td className="p-4 text-xs">
                      <div className="font-mono text-brand-text">Mensal: {fmt(cc.orcamento_mensal || 0)}</div>
                      <div className="font-mono text-brand-muted mt-1">Anual: {fmt(cc.orcamento_anual || 0)}</div>
                    </td>
                    <td className="p-4 text-xs">
                      <div className="font-mono text-brand-text">Mensal: {fmt(cc.orcamento_mensal_usado || 0)}</div>
                      <div className="font-mono text-brand-muted mt-1">Anual: {fmt(cc.orcamento_anual_usado || 0)}</div>
                    </td>
                    <td className="p-4 text-right whitespace-nowrap">
                      <button onClick={() => openEditCostCenter(cc)} className="text-brand-primary border border-brand-primary/30 px-2.5 py-1.5 font-mono text-xs uppercase mr-2 hover:bg-brand-primary/10">
                        <Pencil size={12} className="inline mr-1" /> Editar
                      </button>
                      <button onClick={() => deleteCostCenter(cc)} disabled={deletingCCId === cc.id} className="text-red-400 border border-red-500/30 px-2.5 py-1.5 font-mono text-xs uppercase hover:bg-red-500/10 disabled:opacity-60">
                        <Trash2 size={12} className="inline mr-1" /> Excluir
                      </button>
                    </td>
                  </tr>
                ))}
                {costCenters.length === 0 && (
                  <tr><td colSpan={7} className="p-12 text-center text-brand-muted font-mono text-sm">Nenhum centro de custo cadastrado. Cadastre ao menos um para operar o ERP de compras.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="border border-brand-border bg-brand-card overflow-x-auto">
              <div className="p-4 border-b border-brand-border bg-brand-dark/20">
                <div className="text-xs font-mono uppercase tracking-wider text-brand-muted">Categorias de compra</div>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-brand-border bg-brand-dark/10 text-xs font-mono uppercase tracking-wider text-brand-muted">
                    <th className="p-4">Nome</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/60 text-sm">
                  {categories.map((category) => (
                    <tr key={category.id} className="hover:bg-brand-dark/10">
                      <td className="p-4 text-brand-text">{category.nome}</td>
                      <td className="p-4 text-brand-muted">{category.ativo ? 'Ativa' : 'Inativa'}</td>
                      <td className="p-4 text-right whitespace-nowrap">
                        <button onClick={() => editCategory(category)} className="text-brand-primary border border-brand-primary/30 px-2.5 py-1.5 font-mono text-xs uppercase mr-2 hover:bg-brand-primary/10">
                          <Pencil size={12} className="inline mr-1" /> Editar
                        </button>
                        <button onClick={() => deleteCategory(category)} disabled={deletingCategoryId === category.id} className="text-red-400 border border-red-500/30 px-2.5 py-1.5 font-mono text-xs uppercase hover:bg-red-500/10 disabled:opacity-60">
                          <Trash2 size={12} className="inline mr-1" /> Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                  {categories.length === 0 && (
                    <tr><td colSpan={3} className="p-10 text-center text-brand-muted font-mono text-sm">Nenhuma categoria cadastrada.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="border border-brand-border bg-brand-card overflow-x-auto">
              <div className="p-4 border-b border-brand-border bg-brand-dark/20">
                <div className="text-xs font-mono uppercase tracking-wider text-brand-muted">Produtos de compras</div>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-brand-border bg-brand-dark/10 text-xs font-mono uppercase tracking-wider text-brand-muted">
                    <th className="p-4">Código</th>
                    <th className="p-4">Produto</th>
                    <th className="p-4">Categoria</th>
                    <th className="p-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/60 text-sm">
                  {products.map((product) => (
                    <tr key={product.id} className="hover:bg-brand-dark/10">
                      <td className="p-4 font-mono text-xs text-brand-primary">{product.codigo}</td>
                      <td className="p-4 text-brand-text">
                        <div>{product.nome}</div>
                        <div className="text-[11px] text-brand-muted mt-1">{product.tipo} · {product.unidade}</div>
                      </td>
                      <td className="p-4 text-brand-muted">{product.categoria?.nome ?? '—'}</td>
                      <td className="p-4 text-right whitespace-nowrap">
                        <button onClick={() => editProduct(product)} className="text-brand-primary border border-brand-primary/30 px-2.5 py-1.5 font-mono text-xs uppercase mr-2 hover:bg-brand-primary/10">
                          <Pencil size={12} className="inline mr-1" /> Editar
                        </button>
                        <button onClick={() => deleteProduct(product)} disabled={deletingProductId === product.id} className="text-red-400 border border-red-500/30 px-2.5 py-1.5 font-mono text-xs uppercase hover:bg-red-500/10 disabled:opacity-60">
                          <Trash2 size={12} className="inline mr-1" /> Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                  {products.length === 0 && (
                    <tr><td colSpan={4} className="p-10 text-center text-brand-muted font-mono text-sm">Nenhum produto de compra cadastrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!loading && tab === 'fornecedores' && <SuppliersPage />}

      {contractModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/85 p-4 backdrop-blur-sm"><form onSubmit={submitContract} className="w-full max-w-2xl space-y-4 border border-brand-border bg-brand-card p-6 shadow-2xl"><div className="flex items-center justify-between border-b border-brand-border pb-3"><h2 className="font-mono text-sm font-bold uppercase">{editingContract ? 'Editar contrato' : 'Novo contrato'}</h2><button type="button" onClick={() => { setContractModal(false); resetContractForm(); }} className="text-brand-muted hover:text-brand-text"><X size={20} /></button></div><div className="grid gap-3 sm:grid-cols-2"><select required value={contractForm.fornecedor_id} onChange={(e) => setContractForm({ ...contractForm, fornecedor_id: e.target.value })} className="border border-brand-border bg-brand-dark px-3 py-2 text-sm text-brand-text"><option value="">Fornecedor...</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.nome}</option>)}</select><input required value={contractForm.numero} onChange={(e) => setContractForm({ ...contractForm, numero: e.target.value })} placeholder="Número do contrato" className="border border-brand-border bg-brand-dark px-3 py-2 text-sm text-brand-text" /><select value={contractForm.tipo_id} onChange={(e) => { const type = contractTypes.find((item) => item.id === Number(e.target.value)); setContractForm({ ...contractForm, tipo_id: e.target.value, tipo: type?.nome || contractForm.tipo }); }} className="border border-brand-border bg-brand-dark px-3 py-2 text-sm text-brand-text"><option value="">Tipo de contrato...</option>{contractTypes.filter((type) => type.ativo).map((type) => <option key={type.id} value={type.id}>{type.nome}</option>)}</select><input value={contractForm.tipo} onChange={(e) => setContractForm({ ...contractForm, tipo: e.target.value })} placeholder="Tipo (ex.: Licença, Serviço)" className="border border-brand-border bg-brand-dark px-3 py-2 text-sm text-brand-text" /><input required type="date" value={contractForm.data_inicio} onChange={(e) => setContractForm({ ...contractForm, data_inicio: e.target.value })} className="border border-brand-border bg-brand-dark px-3 py-2 text-sm text-brand-text" /><input required type="date" value={contractForm.data_fim} onChange={(e) => setContractForm({ ...contractForm, data_fim: e.target.value })} className="border border-brand-border bg-brand-dark px-3 py-2 text-sm text-brand-text" /><input type="number" min="0" step="0.01" value={contractForm.valor} onChange={(e) => setContractForm({ ...contractForm, valor: Number(e.target.value) })} placeholder="Valor" className="border border-brand-border bg-brand-dark px-3 py-2 text-sm text-brand-text" /><select value={contractForm.periodicidade} onChange={(e) => setContractForm({ ...contractForm, periodicidade: e.target.value })} className="border border-brand-border bg-brand-dark px-3 py-2 text-sm text-brand-text">{['Mensal', 'Trimestral', 'Semestral', 'Anual', 'Único'].map((period) => <option key={period}>{period}</option>)}</select></div><label className="flex items-center gap-2 text-xs text-brand-muted"><input type="checkbox" checked={contractForm.renovacao_automatica} onChange={(e) => setContractForm({ ...contractForm, renovacao_automatica: e.target.checked })} /> Renovação automática</label><div className="flex justify-end gap-3"><button type="button" onClick={() => { setContractModal(false); resetContractForm(); }} className="border border-brand-border px-4 py-2 text-xs font-mono uppercase">Cancelar</button><button type="submit" className="bg-brand-primary px-4 py-2 text-xs font-bold font-mono uppercase text-brand-dark">Salvar contrato</button></div></form></div>
      )}

      {researchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/85 p-4 backdrop-blur-sm"><form onSubmit={submitResearch} className="max-h-[90vh] w-full max-w-3xl space-y-4 overflow-y-auto border border-brand-border bg-brand-card p-6 shadow-2xl"><div className="flex items-center justify-between border-b border-brand-border pb-3"><h2 className="font-mono text-sm font-bold uppercase">Nova pesquisa de compra</h2><button type="button" onClick={() => setResearchModal(false)} className="text-brand-muted hover:text-brand-text"><X size={20} /></button></div><input required value={researchTitle} onChange={(e) => setResearchTitle(e.target.value)} placeholder="Título da pesquisa" className="w-full border border-brand-border bg-brand-dark px-3 py-2 text-sm text-brand-text" /><textarea required value={researchJustification} onChange={(e) => setResearchJustification(e.target.value)} placeholder="Justificativa" rows={3} className="w-full border border-brand-border bg-brand-dark px-3 py-2 text-sm text-brand-text" /><div className="space-y-3">{researchItems.map((item, index) => <div key={index} className="grid gap-2 border border-brand-border/60 p-3 sm:grid-cols-6"><input required value={item.nome_produto} onChange={(e) => setResearchItems(researchItems.map((current, i) => i === index ? { ...current, nome_produto: e.target.value } : current))} placeholder="Produto" className="sm:col-span-2 border border-brand-border bg-brand-dark px-2 py-2 text-sm text-brand-text" /><input value={item.link_produto} onChange={(e) => setResearchItems(researchItems.map((current, i) => i === index ? { ...current, link_produto: e.target.value } : current))} placeholder="Link" className="sm:col-span-2 border border-brand-border bg-brand-dark px-2 py-2 text-sm text-brand-text" /><input type="number" min="0" step="0.01" value={item.valor_estimado} onChange={(e) => setResearchItems(researchItems.map((current, i) => i === index ? { ...current, valor_estimado: Number(e.target.value) } : current))} placeholder="Valor" className="border border-brand-border bg-brand-dark px-2 py-2 text-sm text-brand-text" /><input type="number" min="1" step="1" value={item.quantidade} onChange={(e) => setResearchItems(researchItems.map((current, i) => i === index ? { ...current, quantidade: Number(e.target.value) } : current))} placeholder="Qtd." className="border border-brand-border bg-brand-dark px-2 py-2 text-sm text-brand-text" /><select value={item.tipo_produto} onChange={(e) => setResearchItems(researchItems.map((current, i) => i === index ? { ...current, tipo_produto: e.target.value } : current))} className="sm:col-span-2 border border-brand-border bg-brand-dark px-2 py-2 text-sm text-brand-text"><option>Consumo</option><option>Imobilizado</option></select>{researchItems.length > 1 && <button type="button" onClick={() => setResearchItems(researchItems.filter((_, i) => i !== index))} className="border border-red-500/30 px-2 py-2 text-xs font-mono uppercase text-red-400">Remover</button>}</div>)}</div><button type="button" onClick={() => setResearchItems([...researchItems, { nome_produto: '', link_produto: '', valor_estimado: 0, quantidade: 1, tipo_produto: 'Consumo' }])} className="border border-brand-primary/30 px-3 py-2 text-xs font-mono uppercase text-brand-primary"><Plus size={13} className="mr-1 inline" />Adicionar item</button><div className="flex justify-end gap-3"><button type="button" onClick={() => setResearchModal(false)} className="border border-brand-border px-4 py-2 text-xs font-mono uppercase">Cancelar</button><button type="submit" className="bg-brand-primary px-4 py-2 text-xs font-bold font-mono uppercase text-brand-dark">Criar pesquisa</button></div></form></div>
      )}

      {receivingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/85 p-4 backdrop-blur-sm">
          <form onSubmit={submitReceiving} className="max-h-[90vh] w-full max-w-3xl space-y-5 overflow-y-auto rounded-xl border border-brand-border bg-brand-card p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-brand-border pb-3"><div><div className="font-mono text-xs text-brand-primary">{receivingOrder.numero}</div><h2 className="mt-1 text-lg font-semibold text-brand-text">Registrar recebimento</h2><p className="mt-1 text-xs text-brand-muted">Informe as quantidades efetivamente recebidas. Itens não preenchidos permanecem pendentes.</p></div><button type="button" onClick={() => setReceivingOrder(null)} className="text-brand-muted hover:text-brand-text"><X size={20} /></button></div>
            <div className="space-y-3">{receivingOrder.itens.map((item) => { const draft = receivingItems.find((entry) => entry.product_id === item.product_id); const remaining = remainingOrderItemQuantity(receivingOrder, item.product_id, item.quantidade); return <div key={item.id} className="grid gap-3 rounded-lg border border-brand-border/60 bg-brand-dark/10 p-3 md:grid-cols-[1.4fr_.55fr_1fr]"><div><div className="text-sm font-medium text-brand-text">{item.product?.nome || `Produto #${item.product_id}`}</div><div className="mt-1 text-xs text-brand-muted">Pedido: {item.quantidade} · Pendente: {remaining} · {fmt(item.valor_unitario)} por unidade</div></div><label className="text-xs text-brand-muted">Quantidade recebida<input type="number" min="0" max={remaining} step="0.01" value={draft?.quantidade_recebida ?? 0} onChange={(e) => setReceivingItems(receivingItems.map((entry) => entry.product_id === item.product_id ? { ...entry, quantidade_recebida: Math.min(remaining, Math.max(0, Number(e.target.value))) } : entry))} className="mt-1 w-full border border-brand-border bg-brand-dark px-2 py-2 text-sm text-brand-text" /></label><label className="text-xs text-brand-muted">Divergência / observação<input value={draft?.divergencias ?? ''} onChange={(e) => setReceivingItems(receivingItems.map((entry) => entry.product_id === item.product_id ? { ...entry, divergencias: e.target.value } : entry))} placeholder="Ex.: embalagem avariada" className="mt-1 w-full border border-brand-border bg-brand-dark px-2 py-2 text-sm text-brand-text" /></label></div>; })}</div>
            <div className="rounded-lg border border-brand-border/60 bg-brand-dark/10 p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-end"><label className="block flex-1 text-xs text-brand-muted">Nota fiscal (opcional)<select value={receivingInvoiceId} onChange={(e) => setReceivingInvoiceId(e.target.value ? Number(e.target.value) : '')} className="mt-1 w-full border border-brand-border bg-brand-dark px-3 py-2 text-sm text-brand-text"><option value="">Nenhuma NF-e vinculada</option>{receivingInvoices.map((invoice) => <option key={invoice.id} value={invoice.id}>NF-e {invoice.numero_nota}</option>)}</select></label><label className="cursor-pointer border border-cyan-500/30 px-3 py-2 text-center text-xs font-mono uppercase text-cyan-400 hover:bg-cyan-500/10"><input type="file" accept=".xml,text/xml,application/xml" className="hidden" disabled={uploadingReceivingInvoice} onChange={(e) => { const file = e.target.files?.[0]; void uploadReceivingInvoice(file); e.currentTarget.value = ''; }} />{uploadingReceivingInvoice ? 'Importando...' : 'Importar XML da NF-e'}</label></div><p className="mt-2 text-[11px] text-brand-muted">Importe o XML da NF-e do fornecedor ou selecione uma nota já cadastrada. A nota será vinculada a este recebimento.</p></div>
            <label className="block text-xs text-brand-muted">Observações gerais<textarea value={receivingNotes} onChange={(e) => setReceivingNotes(e.target.value)} rows={3} placeholder="Ex.: entrega conferida no almoxarifado" className="mt-1 w-full border border-brand-border bg-brand-dark px-3 py-2 text-sm text-brand-text" /></label>
            <div className="flex justify-end gap-3"><button type="button" onClick={() => setReceivingOrder(null)} className="border border-brand-border px-4 py-2 text-xs font-mono uppercase">Cancelar</button><button type="submit" disabled={savingReceiving} className="bg-brand-primary px-4 py-2 text-xs font-bold font-mono uppercase text-brand-dark disabled:opacity-60">{savingReceiving ? 'Registrando...' : 'Confirmar recebimento'}</button></div>
          </form>
        </div>
      )}

      {/* ---------- REQUEST DETAILS MODAL ---------- */}
      {viewingRequest && (
        <div className="fixed inset-0 bg-brand-dark/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-3xl border border-brand-border bg-brand-card p-6 space-y-5 max-h-[90vh] overflow-y-auto rounded shadow-2xl">
            <div className="flex justify-between items-center border-b border-brand-border pb-3">
              <div className="flex items-center space-x-3">
                <span className="text-xs font-mono font-bold text-brand-primary bg-brand-primary/10 px-2 py-0.5 border border-brand-primary/20">
                  {viewingRequest.numero}
                </span>
                <span className={`text-[10px] font-mono uppercase px-2 py-0.5 border ${requestStatusColor[viewingRequest.status] ?? 'border-brand-border'}`}>
                  {viewingRequest.status}
                </span>
                <span className="text-xs font-mono text-brand-muted">
                  Urgência: <span className="font-bold text-brand-text">{viewingRequest.urgencia}</span>
                </span>
              </div>
              <button onClick={() => setViewingRequest(null)} className="text-brand-muted hover:text-brand-text p-1">
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-brand-dark/30 p-3.5 border border-brand-border/40 rounded">
              <div>
                <span className="text-[10px] font-mono uppercase text-brand-muted block">Centro de Custo</span>
                <span className="font-semibold text-brand-text">{viewingRequest.centro_custo?.nome ?? `#${viewingRequest.centro_custo_id}`}</span>
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase text-brand-muted block">Solicitante</span>
                <span className="font-semibold text-brand-text">{viewingRequest.solicitante?.nome ?? 'Sistema / Usuário'}</span>
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase text-brand-muted block">Data da Solicitação</span>
                <span className="font-mono text-brand-text">
                  {viewingRequest.data_criacao ? new Date(viewingRequest.data_criacao).toLocaleString('pt-BR') : '—'}
                </span>
              </div>
            </div>

            {/* Justification */}
            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase text-brand-muted block">Justificativa / Motivo:</span>
              <p className="text-xs text-brand-text bg-brand-dark/40 p-3 border border-brand-border/40 font-mono whitespace-pre-wrap rounded">
                {viewingRequest.justificativa}
              </p>
            </div>

            {/* Items Table */}
            <div className="space-y-2">
              <span className="text-xs font-mono uppercase tracking-wider text-brand-primary font-bold block flex items-center space-x-1.5">
                <ShoppingCart size={13} />
                <span>Itens Solicitados ({viewingRequest.itens?.length || 0})</span>
              </span>

              <div className="border border-brand-border overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="bg-brand-dark/40 border-b border-brand-border text-brand-muted uppercase text-[10px]">
                      <th className="p-3">Produto / Item</th>
                      <th className="p-3 text-center">Qtd</th>
                      <th className="p-3 text-right">Valor Unit. Estimado</th>
                      <th className="p-3 text-right">Total Estimado</th>
                      <th className="p-3">Link da Loja / Observação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border/40">
                    {viewingRequest.itens?.map((item: any) => {
                      // Detect external link
                      const linkMatch = (item.observacao || '').match(/https?:\/\/[^\s]+/i) || (viewingRequest.justificativa || '').match(/https?:\/\/[^\s]+/i);
                      const productUrl = linkMatch ? linkMatch[0] : null;

                      return (
                        <tr key={item.id} className="hover:bg-brand-dark/20">
                          <td className="p-3 font-semibold text-brand-text">
                            {item.product?.nome || `Item #${item.product_id}`}
                          </td>
                          <td className="p-3 text-center font-bold text-brand-primary">{item.quantidade}</td>
                          <td className="p-3 text-right">{fmt(item.valor_estimado)}</td>
                          <td className="p-3 text-right font-bold text-green-400">{fmt(item.valor_estimado * item.quantidade)}</td>
                          <td className="p-3 space-y-1">
                            {productUrl ? (
                              <a
                                href={productUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center space-x-1 px-2 py-1 bg-brand-primary/10 border border-brand-primary/30 text-brand-primary hover:bg-brand-primary hover:text-brand-dark text-[11px] rounded transition-colors font-bold"
                              >
                                <ExternalLink size={12} />
                                <span>Abrir Link do Site</span>
                              </a>
                            ) : null}
                            {item.observacao && (
                              <div className="text-[10px] text-brand-muted">{item.observacao}</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {(!viewingRequest.itens || viewingRequest.itens.length === 0) && (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-brand-muted text-xs">
                          Nenhum item listado individualmente.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Total Footer */}
            <div className="flex justify-between items-center border-t border-brand-border pt-3">
              <div>
                <span className="text-[10px] font-mono text-brand-muted uppercase block">Valor Total Estimado:</span>
                <span className="text-base font-mono font-bold text-green-400">{fmt(viewingRequest.valor_estimado_total || 0)}</span>
              </div>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setViewingRequest(null)}
                  className="px-4 py-2 border border-brand-border hover:bg-brand-card text-brand-text font-mono text-xs uppercase"
                >
                  Fechar
                </button>
                {manage && ['Pendente', 'Em aprovação'].includes(viewingRequest.status) && (
                  <>
                    <button
                      onClick={() => {
                        const req = viewingRequest;
                        setViewingRequest(null);
                        decideRequest(req, 'Reprovado');
                      }}
                      className="px-4 py-2 border border-red-500/30 text-red-400 font-mono text-xs uppercase hover:bg-red-500/10 flex items-center space-x-1"
                    >
                      <Ban size={13} />
                      <span>Reprovar</span>
                    </button>
                    <button
                      onClick={() => {
                        const req = viewingRequest;
                        setViewingRequest(null);
                        decideRequest(req, 'Aprovado');
                      }}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-mono text-xs uppercase font-bold flex items-center space-x-1"
                    >
                      <CheckCircle2 size={13} />
                      <span>Aprovar</span>
                    </button>
                  </>
                )}
                {manage && viewingRequest.status === 'Aprovada' && (
                  <button
                    onClick={() => {
                      const req = viewingRequest;
                      setViewingRequest(null);
                      openQuotationModal(req);
                    }}
                    className="px-4 py-2 bg-brand-primary text-brand-dark font-mono text-xs uppercase font-bold hover:bg-brand-primary/90 flex items-center space-x-1"
                  >
                    <Gavel size={13} />
                    <span>Iniciar Cotação</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- REQUEST MODAL ---------- */}
      {reqModal && (
        <div className="fixed inset-0 bg-brand-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl border border-brand-border bg-brand-card p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-brand-border pb-4">
              <h3 className="text-lg font-bold font-mono uppercase tracking-wider text-brand-text">Nova Solicitação de Compra</h3>
              <button onClick={() => setReqModal(false)} className="text-brand-muted hover:text-brand-text"><X size={20} /></button>
            </div>
            <form onSubmit={submitRequest} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Centro de Custo *</label>
                  <select required value={rCC ?? ''} onChange={(e) => setRCC(Number(e.target.value))} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                    <option value="">—</option>
                    {costCenters.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Urgência</label>
                  <select value={rUrgencia} onChange={(e) => setRUrgencia(e.target.value)} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                    {URGENCIES.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Justificativa *</label>
                <textarea required value={rJust} onChange={(e) => setRJust(e.target.value)} rows={3} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-mono uppercase tracking-wider text-brand-muted">Itens</span>
                  <button type="button" onClick={() => setRItens([...rItens, { product_id: 0, quantidade: 1, valor_estimado: 0 }])} className="text-brand-primary border border-brand-primary/30 px-2 py-1 font-mono text-xs uppercase">+ Item</button>
                </div>
                {rItens.map((it, idx) => (
                  <div key={idx} className="rounded-xl border border-brand-border/70 bg-brand-card/40 p-3">
                    <div className="grid gap-2 md:grid-cols-4">
                      <div className="md:col-span-2">
                        <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-brand-muted">
                          Produto
                        </label>
                        <select value={it.product_id} onChange={(e) => { const n = [...rItens]; n[idx].product_id = Number(e.target.value); setRItens(n); }} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                          <option value={0}>Produto...</option>
                          {products.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-brand-muted">
                          Quantidade
                        </label>
                        <input type="number" step="0.01" placeholder="0,00" value={it.quantidade} onChange={(e) => { const n = [...rItens]; n[idx].quantidade = Number(e.target.value); setRItens(n); }} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none font-mono" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-brand-muted">
                          Valor estimado
                        </label>
                        <input type="number" step="0.01" placeholder="R$ 0,00" value={it.valor_estimado} onChange={(e) => { const n = [...rItens]; n[idx].valor_estimado = Number(e.target.value); setRItens(n); }} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none font-mono" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end space-x-3 pt-4 border-t border-brand-border">
                <button type="button" onClick={() => setReqModal(false)} className="border border-brand-border hover:bg-brand-card px-4 py-2 font-mono text-xs uppercase">Cancelar</button>
                <button type="submit" className="bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-xs">Enviar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------- QUOTATION MODAL ---------- */}
      {quotModal && (
        <div className="fixed inset-0 bg-brand-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-6xl border border-brand-border bg-brand-card p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-brand-border pb-4">
              <h3 className="text-lg font-bold font-mono uppercase tracking-wider text-brand-text">Nova Cotação</h3>
              <button onClick={() => setQuotModal(false)} className="text-brand-muted hover:text-brand-text"><X size={20} /></button>
            </div>
            <form onSubmit={submitQuotation} className="space-y-4">
              {qRequestId && (() => {
                const request = requests.find((req) => req.id === qRequestId);
                if (!request) return null;
                const cheapestIndex = qSuppliers.length > 0
                  ? qSuppliers.reduce((bestIdx, supplier, currentIdx) => (
                    getQuotationDraftTotal(supplier) < getQuotationDraftTotal(qSuppliers[bestIdx]) ? currentIdx : bestIdx
                  ), 0)
                  : -1;
                const fastestIndex = qSuppliers.length > 0
                  ? qSuppliers.reduce((bestIdx, supplier, currentIdx) => (
                    (Number(supplier.prazo_entrega_dias) || 0) < (Number(qSuppliers[bestIdx].prazo_entrega_dias) || 0) ? currentIdx : bestIdx
                  ), 0)
                  : -1;
                const bestValueIndex = getQuotationDraftBestValueIndex();
                return (
                  <div className="rounded-2xl border border-brand-border/70 bg-brand-dark/20 p-4 space-y-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-brand-muted">Solicitação base</div>
                        <div className="text-sm font-semibold text-brand-text">{request.numero}</div>
                      </div>
                      <div className="text-xs text-brand-muted">
                        Os fornecedores abaixo irão cotar os mesmos itens desta solicitação.
                      </div>
                    </div>
                    <div className="space-y-2">
                      {request.itens.map((item) => (
                        <div key={item.id} className="flex items-center justify-between rounded-xl border border-brand-border/50 bg-brand-card/30 px-3 py-2 text-xs">
                          <div>
                            <div className="font-medium text-brand-text">{item.product?.nome ?? `Produto #${item.product_id}`}</div>
                            {item.fornecedor_sugerido?.nome && (
                              <div className="mt-1 text-brand-muted">Fornecedor sugerido: {item.fornecedor_sugerido.nome}</div>
                            )}
                          </div>
                          <div className="text-right font-mono text-brand-muted">
                            <div>Qtd. {item.quantidade}</div>
                            <div>Estimado {fmt(item.valor_estimado)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {qSuppliers.length > 0 && (
                      <div className="space-y-3 border-t border-brand-border/50 pt-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-brand-muted">Comparativo rápido da cotação</div>
                          <div className="text-[11px] text-brand-muted">Regra usada no custo-benefício: 70% preço e 30% prazo.</div>
                        </div>
                        <div className="grid gap-3 lg:grid-cols-3">
                          {qSuppliers.map((supplier, supplierIdx) => {
                            const supplierName = suppliers.find((item) => item.id === supplier.fornecedor_id)?.nome || `Fornecedor ${supplierIdx + 1}`;
                            const total = getQuotationDraftTotal(supplier);
                            const averageUnit = getQuotationDraftUnitAverage(supplier);
                            const isCheapest = supplier.fornecedor_id > 0 && supplierIdx === cheapestIndex;
                            const isFastest = supplier.fornecedor_id > 0 && supplierIdx === fastestIndex;
                            const isBestValue = supplier.fornecedor_id > 0 && supplierIdx === bestValueIndex;
                            return (
                              <div
                                key={`comparison-${supplierIdx}`}
                                className={`rounded-2xl border p-3 space-y-3 ${
                                  isBestValue
                                    ? 'border-emerald-400/60 bg-emerald-500/10'
                                    : isCheapest
                                      ? 'border-cyan-400/50 bg-cyan-500/10'
                                      : isFastest
                                        ? 'border-amber-400/50 bg-amber-500/10'
                                        : 'border-brand-border/60 bg-brand-card/30'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="text-sm font-semibold text-brand-text">{supplierName}</div>
                                    <div className="text-[11px] text-brand-muted">
                                      {supplier.fornecedor_id ? 'Proposta em comparação' : 'Selecione um fornecedor para comparar'}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap justify-end gap-1">
                                    {isCheapest && <span className="rounded-full border border-cyan-400/40 bg-cyan-500/15 px-2 py-1 text-[10px] font-mono uppercase text-[#1079ea]">Menor preço</span>}
                                    {isFastest && <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-1 text-[10px] font-mono uppercase text-[#d98a30]">Menor prazo</span>}
                                    {isBestValue && <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-1 text-[10px] font-mono uppercase text-[#63a83e]">Melhor custo-benefício</span>}
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div className="rounded-xl border border-brand-border/50 bg-brand-dark/15 px-3 py-2">
                                    <div className="text-[10px] font-mono uppercase tracking-wider text-brand-muted">Total</div>
                                    <div className="mt-1 font-mono text-brand-text">{fmt(total)}</div>
                                  </div>
                                  <div className="rounded-xl border border-brand-border/50 bg-brand-dark/15 px-3 py-2">
                                    <div className="text-[10px] font-mono uppercase tracking-wider text-brand-muted">Prazo</div>
                                    <div className="mt-1 font-mono text-brand-text">{Number(supplier.prazo_entrega_dias) || 0} dia(s)</div>
                                  </div>
                                  <div className="rounded-xl border border-brand-border/50 bg-brand-dark/15 px-3 py-2">
                                    <div className="text-[10px] font-mono uppercase tracking-wider text-brand-muted">Frete</div>
                                    <div className="mt-1 font-mono text-brand-text">{fmt(Number(supplier.frete) || 0)}</div>
                                  </div>
                                  <div className="rounded-xl border border-brand-border/50 bg-brand-dark/15 px-3 py-2">
                                    <div className="text-[10px] font-mono uppercase tracking-wider text-brand-muted">Média unitária</div>
                                    <div className="mt-1 font-mono text-brand-text">{fmt(averageUnit)}</div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="space-y-3 border-t border-brand-border/50 pt-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-brand-muted">Mapa comparativo por item</div>
                            <div className="text-[11px] text-brand-muted">Aqui fica fácil ver quem ganhou em cada produto e no total.</div>
                          </div>
                          <div className="overflow-x-auto rounded-2xl border border-brand-border/60">
                            <table className="min-w-full text-left text-xs">
                              <thead className="bg-brand-dark/30">
                                <tr className="border-b border-brand-border/60">
                                  <th className="p-3 font-mono uppercase tracking-wider text-brand-muted">Item</th>
                                  <th className="p-3 font-mono uppercase tracking-wider text-brand-muted">Qtd.</th>
                                  <th className="p-3 font-mono uppercase tracking-wider text-brand-muted">Estimado</th>
                                  {qSuppliers.map((supplier, supplierIdx) => {
                                    const supplierName = suppliers.find((item) => item.id === supplier.fornecedor_id)?.nome || `Fornecedor ${supplierIdx + 1}`;
                                    return (
                                      <th key={`matrix-head-${supplierIdx}`} className="p-3 font-mono uppercase tracking-wider text-brand-muted min-w-[220px]">
                                        {supplierName}
                                      </th>
                                    );
                                  })}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-brand-border/50">
                                {request.itens.map((requestItem) => {
                                  const quotedValues = qSuppliers.map((supplier) => {
                                    const quotedItem = supplier.itens.find((item) => item.product_id === requestItem.product_id);
                                    return Number(quotedItem?.valor_unitario) || 0;
                                  }).filter((value) => value > 0);
                                  const lowestQuotedValue = quotedValues.length > 0 ? Math.min(...quotedValues) : 0;

                                  return (
                                    <tr key={`matrix-row-${requestItem.id}`} className="bg-brand-card/10">
                                      <td className="p-3">
                                        <div className="font-medium text-brand-text">{requestItem.product?.nome ?? `Produto #${requestItem.product_id}`}</div>
                                      </td>
                                      <td className="p-3 font-mono text-brand-text">{requestItem.quantidade}</td>
                                      <td className="p-3 font-mono text-brand-text">{fmt(requestItem.valor_estimado)}</td>
                                      {qSuppliers.map((supplier, supplierIdx) => {
                                        const quotedItem = supplier.itens.find((item) => item.product_id === requestItem.product_id);
                                        const quotedValue = Number(quotedItem?.valor_unitario) || 0;
                                        const totalItem = quotedValue * (Number(quotedItem?.quantidade) || 0);
                                        const isBestItemValue = quotedValue > 0 && lowestQuotedValue > 0 && quotedValue === lowestQuotedValue;
                                        return (
                                          <td
                                            key={`matrix-cell-${requestItem.id}-${supplierIdx}`}
                                            className={`p-3 align-top ${
                                              isBestItemValue ? 'bg-emerald-500/10' : ''
                                            }`}
                                          >
                                            <div className="space-y-1">
                                              <div className="font-mono text-brand-text">{fmt(quotedValue)}</div>
                                              <div className="text-brand-muted">Total item: {fmt(totalItem)}</div>
                                              {isBestItemValue && (
                                                <span className="inline-flex rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-mono uppercase text-emerald-200">
                                                  Melhor item
                                                </span>
                                              )}
                                            </div>
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                })}
                                <tr className="bg-brand-dark/20">
                                  <td className="p-3 font-mono uppercase tracking-wider text-brand-muted">Resumo final</td>
                                  <td className="p-3" />
                                  <td className="p-3 font-mono text-brand-muted">Base da solicitação</td>
                                  {qSuppliers.map((supplier, supplierIdx) => {
                                    const total = getQuotationDraftTotal(supplier);
                                    const isCheapest = supplier.fornecedor_id > 0 && supplierIdx === cheapestIndex;
                                    const isFastest = supplier.fornecedor_id > 0 && supplierIdx === fastestIndex;
                                    const isBestValue = supplier.fornecedor_id > 0 && supplierIdx === bestValueIndex;
                                    return (
                                      <td key={`matrix-summary-${supplierIdx}`} className="p-3 align-top">
                                        <div className="space-y-1">
                                          <div className="font-mono text-brand-text">Total: {fmt(total)}</div>
                                          <div className="font-mono text-brand-muted">Prazo: {Number(supplier.prazo_entrega_dias) || 0} dia(s)</div>
                                          <div className="flex flex-wrap gap-1 pt-1">
                                            {isCheapest && <span className="rounded-full border border-cyan-400/40 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-mono uppercase text-[#1079ea]">Menor preço</span>}
                                            {isFastest && <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-mono uppercase text-[#d98a30]">Menor prazo</span>}
                                            {isBestValue && <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-mono uppercase text-[#63a83e]">Melhor custo-benefício</span>}
                                          </div>
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-mono uppercase tracking-wider text-brand-muted">Fornecedores cotados</span>
                  <button
                    type="button"
                    onClick={() => {
                      const request = requests.find((req) => req.id === qRequestId);
                      if (!request) return;
                      setQSuppliers([...qSuppliers, buildQuotationSupplierDraft(request)]);
                    }}
                    className="text-brand-primary border border-brand-primary/30 px-2 py-1 font-mono text-xs uppercase"
                  >
                    + Fornecedor
                  </button>
                </div>
                {qSuppliers.map((s, idx) => (
                  <div key={idx} className="rounded-2xl border border-brand-border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-mono uppercase tracking-wider text-brand-muted">Proposta do fornecedor {idx + 1}</div>
                      {qSuppliers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setQSuppliers(qSuppliers.filter((_, supplierIdx) => supplierIdx !== idx))}
                          className="text-red-300 border border-red-400/30 px-2 py-1 font-mono text-[10px] uppercase"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div>
                        <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-brand-muted">
                          Fornecedor
                        </label>
                        <select
                          value={s.fornecedor_id}
                          onChange={(e) => {
                            const n = [...qSuppliers];
                            n[idx].fornecedor_id = Number(e.target.value);
                            setQSuppliers(n);
                          }}
                          className="col-span-1 w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none"
                        >
                          <option value={0}>Selecione...</option>
                          {suppliers.map((f) => (
                            <option
                              key={f.id}
                              value={f.id}
                              disabled={qSuppliers.some((supplier, supplierIdx) => supplierIdx !== idx && supplier.fornecedor_id === f.id)}
                            >
                              {f.nome}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-brand-muted">
                          Frete
                        </label>
                        <input type="number" step="0.01" placeholder="0,00" value={s.frete} onChange={(e) => { const n = [...qSuppliers]; n[idx].frete = Number(e.target.value); setQSuppliers(n); }} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none font-mono" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-brand-muted">
                          Prazo de entrega
                        </label>
                        <input type="number" placeholder="Dias" value={s.prazo_entrega_dias} onChange={(e) => { const n = [...qSuppliers]; n[idx].prazo_entrega_dias = Number(e.target.value); setQSuppliers(n); }} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none font-mono" />
                      </div>
                    </div>
                    <div className="rounded-xl border border-brand-border/50 bg-brand-dark/10 px-3 py-2 text-[11px] text-brand-muted">
                      Cada fornecedor informa preço para os mesmos itens da solicitação. A quantidade já vem preenchida para manter o comparativo justo.
                    </div>
                    {s.itens.map((it, iIdx) => (
                      <div key={iIdx} className="rounded-xl border border-brand-border/70 bg-brand-card/40 p-3">
                        <div className="grid gap-2 md:grid-cols-3">
                          <div>
                            <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-brand-muted">
                              Produto
                            </label>
                            <select value={it.product_id} onChange={(e) => { const n = [...qSuppliers]; n[idx].itens[iIdx].product_id = Number(e.target.value); setQSuppliers(n); }} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                              <option value={0}>Produto...</option>
                              {products.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-brand-muted">
                              Quantidade
                            </label>
                            <input type="number" step="0.01" placeholder="0,00" value={it.quantidade} onChange={(e) => { const n = [...qSuppliers]; n[idx].itens[iIdx].quantidade = Number(e.target.value); setQSuppliers(n); }} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none font-mono" />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-brand-muted">
                              Valor unitário
                            </label>
                            <input type="number" step="0.01" placeholder="R$ 0,00" value={it.valor_unitario} onChange={(e) => { const n = [...qSuppliers]; n[idx].itens[iIdx].valor_unitario = Number(e.target.value); setQSuppliers(n); }} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none font-mono" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex justify-end space-x-3 pt-4 border-t border-brand-border">
                <button type="button" onClick={() => setQuotModal(false)} className="border border-brand-border hover:bg-brand-card px-4 py-2 font-mono text-xs uppercase">Cancelar</button>
                <button type="submit" className="bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-xs">Criar Cotação</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------- ORDER MODAL ---------- */}
      {orderModal && (
        <div className="fixed inset-0 bg-brand-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl border border-brand-border bg-brand-card p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-brand-border pb-4">
              <h3 className="text-lg font-bold font-mono uppercase tracking-wider text-brand-text">Novo Pedido de Compra</h3>
              <button onClick={() => setOrderModal(false)} className="text-brand-muted hover:text-brand-text"><X size={20} /></button>
            </div>
            <form onSubmit={submitOrder} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Fornecedor *</label>
                  <select required value={oSupplier ?? ''} onChange={(e) => setOSupplier(Number(e.target.value))} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                    <option value="">—</option>
                    {suppliers.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Centro de Custo *</label>
                  <select required value={oCC ?? ''} onChange={(e) => setOCC(Number(e.target.value))} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                    <option value="">—</option>
                    {costCenters.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-mono uppercase tracking-wider text-brand-muted">Itens</span>
                  <button type="button" onClick={() => setOItens([...oItens, { product_id: 0, quantidade: 1, valor_unitario: 0 }])} className="text-brand-primary border border-brand-primary/30 px-2 py-1 font-mono text-xs uppercase">+ Item</button>
                </div>
                {oItens.map((it, idx) => (
                  <div key={idx} className="rounded-xl border border-brand-border/70 bg-brand-card/40 p-3">
                    <div className="grid gap-2 md:grid-cols-3">
                      <div>
                        <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-brand-muted">
                          Produto
                        </label>
                        <select value={it.product_id} onChange={(e) => { const n = [...oItens]; n[idx].product_id = Number(e.target.value); setOItens(n); }} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none">
                          <option value={0}>Produto...</option>
                          {products.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-brand-muted">
                          Quantidade
                        </label>
                        <input type="number" step="0.01" placeholder="0,00" value={it.quantidade} onChange={(e) => { const n = [...oItens]; n[idx].quantidade = Number(e.target.value); setOItens(n); }} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none font-mono" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-brand-muted">
                          Valor unitário
                        </label>
                        <input type="number" step="0.01" placeholder="R$ 0,00" value={it.valor_unitario} onChange={(e) => { const n = [...oItens]; n[idx].valor_unitario = Number(e.target.value); setOItens(n); }} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none font-mono" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end space-x-3 pt-4 border-t border-brand-border">
                <button type="button" onClick={() => setOrderModal(false)} className="border border-brand-border hover:bg-brand-card px-4 py-2 font-mono text-xs uppercase">Cancelar</button>
                <button type="submit" className="bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-xs">Emitir Pedido</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
