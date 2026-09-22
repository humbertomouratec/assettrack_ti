import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { cameraPermissionMessage, ensureCameraPermission } from '../utils/cameraPermission';
import { assetsApi } from '../api/assets';
import { suppliersApi } from '../api/suppliers';
import { usersApi } from '../api/users';
import { maintenanceApi } from '../api/maintenance';
import { transactionApi } from '../api/transaction';
import { toApiFileUrl } from '../api/client';
import type { 
  Asset, 
  AssetStatus, 
  AssetReferences,
  BulkCopySpec,
  AssetImportResponse,
  AssetHistoryResponse,
  User
} from '../types';
import { useAuthStore } from '../stores/authStore';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  QrCode, 
  FileText, 
  Search, 
  Filter, 
  ShieldAlert, 
  Check, 
  X, 
  Copy, 
  Kanban as KanbanIcon, 
  Table as TableIcon,
  Upload,
  RefreshCw,
  Lock,
  MapPin,
  Layers3,
  Wrench,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowRightLeft,
  RotateCcw,
  Camera,
  Eye,
  History,
  ShoppingCart,
  CheckCircle2,
  Clock,
  ShieldCheck,
  CalendarDays,
  FileCheck,
  DollarSign
} from 'lucide-react';

export const AssetsPage: React.FC = () => {
  const location = useLocation();
  const currentAuthUser = useAuthStore().user;
  const isManagerOrAbove = currentAuthUser?.role === 'admin' || 
                           currentAuthUser?.role === 'gerente_ti' || 
                           currentAuthUser?.role === 'gerente_infra' || 
                           currentAuthUser?.role === 'tecnico';

  const [activeTab, setActiveTab] = useState<'table' | 'kanban' | 'reports' | 'references'>('table');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [references, setReferences] = useState<AssetReferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportAssets, setReportAssets] = useState<Asset[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  // Search & Filter State
  const [searchEP, setSearchEP] = useState('');
  const [filterCategory, setFilterCategory] = useState<number | ''>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [assetPage, setAssetPage] = useState(1);
  const [assetPageSize, setAssetPageSize] = useState<20 | 50 | 100>(20);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<number>>(new Set());
  
  // Reports Filters
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [reportName, setReportName] = useState('');
  const [reportCategory, setReportCategory] = useState<number | ''>('');
  const [reportLocation, setReportLocation] = useState<number | ''>('');
  const [reportSupplier, setReportSupplier] = useState<number | ''>('');
  const [reportInvoice, setReportInvoice] = useState('');
  const [reportPatrimonio, setReportPatrimonio] = useState('');
  const [reportStatus, setReportStatus] = useState('');

  // Asset Dialog State
  const [showFormModal, setShowFormModal] = useState(false);
  const [editAssetId, setEditAssetId] = useState<number | null>(null);
  const [assetName, setAssetName] = useState('');
  const [assetEP, setAssetEP] = useState('');
  const [assetModelo, setAssetModelo] = useState('');
  const [assetDescricao, setAssetDescricao] = useState('');
  const [assetValor, setAssetValor] = useState<number>(0);
  const [assetStatus, setAssetStatusValue] = useState<AssetStatus>('Disponível');
  const [assetSerie, setAssetSerie] = useState('');
  const [assetEmPosseDe, setAssetEmPosseDe] = useState('');
  const [assetCurrentUserId, setAssetCurrentUserId] = useState<number | ''>('');
  const [assetBloqueado, setAssetBloqueado] = useState(false);
  const [assetRequerRH, setAssetRequerRH] = useState(false);
  const [assetCategoriaId, setAssetCategoriaId] = useState<number | ''>('');
  const [assetFornecedorId, setAssetFornecedorId] = useState<number | ''>('');
  const [assetNotaFiscalId, setAssetNotaFiscalId] = useState<number | ''>('');
  const [assetNotasFiscais, setAssetNotasFiscais] = useState<{ id: number; numero_nota: string }[]>([]);
  const [loadingAssetNotasFiscais, setLoadingAssetNotasFiscais] = useState(false);
  const [assetLocalId, setAssetLocalId] = useState<number | ''>('');
  const [assetArmazenamentoId, setAssetArmazenamentoId] = useState<number | ''>('');
  const [assetDataAquisicao, setAssetDataAquisicao] = useState('');
  const [assetDepartamentoId, setAssetDepartamentoId] = useState<number | ''>('');
  const [assetDatasheetPath, setAssetDatasheetPath] = useState<string>('');
  const [assetDatasheetNome, setAssetDatasheetNome] = useState<string>('');
  const [uploadingDatasheet, setUploadingDatasheet] = useState<boolean>(false);
  const [datasheetError, setDatasheetError] = useState<string | null>(null);
  const datasheetFileInputRef = useRef<HTMLInputElement>(null);
  const [referenceCreateType, setReferenceCreateType] = useState<'categoria' | 'localizacao' | 'armazenamento' | 'departamento' | null>(null);
  const [referenceCreateName, setReferenceCreateName] = useState('');
  const [referenceCreateError, setReferenceCreateError] = useState<string | null>(null);
  const [creatingReference, setCreatingReference] = useState(false);

  // Duplication Wizard State
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateTemplate, setDuplicateTemplate] = useState<Asset | null>(null);
  const [duplicateStep, setDuplicateStep] = useState<'count' | 'specs' | 'results'>('count');
  const [duplicateCount, setDuplicateCount] = useState<number>(1);
  const [duplicateSpecs, setDuplicateSpecs] = useState<BulkCopySpec[]>([]);
  const [duplicateResults, setDuplicateResults] = useState<any[]>([]);
  const [duplicateSuccessCount, setDuplicateSuccessCount] = useState(0);
  const [duplicateFailedCount, setDuplicateFailedCount] = useState(0);

  // Scanner State
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [scannerMode, setScannerMode] = useState<'camera' | 'upload' | 'manual'>('camera');
  const [scannerCameraActive, setScannerCameraActive] = useState(false);
  const [scannerManualInput, setScannerManualInput] = useState('');
  const [scanningAssetLoading, setScanningAssetLoading] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scannedAsset, setScannedAsset] = useState<Asset | null>(null);
  const scannerInstanceRef = useRef<Html5Qrcode | null>(null);
  const scannerRegionId = 'asset-qr-reader-region';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // CSV Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);
  const [selectedImportFile, setSelectedImportFile] = useState<File | null>(null);
  const [importSummary, setImportSummary] = useState<AssetImportResponse | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Reference management state
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newLocationName, setNewLocationName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [creatingLocation, setCreatingLocation] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [editingLocationId, setEditingLocationId] = useState<number | null>(null);
  const [editingLocationName, setEditingLocationName] = useState('');
  const [savingCategoryId, setSavingCategoryId] = useState<number | null>(null);
  const [savingLocationId, setSavingLocationId] = useState<number | null>(null);
  const [deletingCategoryId, setDeletingCategoryId] = useState<number | null>(null);
  const [deletingLocationId, setDeletingLocationId] = useState<number | null>(null);

  // Asset Details Modal State
  const [selectedAssetForDetail, setSelectedAssetForDetail] = useState<Asset | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailActiveTab, setDetailActiveTab] = useState<'info' | 'movimentacoes' | 'manutencoes' | 'preventivas' | 'compras'>('info');
  const [assetHistory, setAssetHistory] = useState<AssetHistoryResponse | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showDetailMaintenanceForm, setShowDetailMaintenanceForm] = useState(false);
  const [showDetailTransferForm, setShowDetailTransferForm] = useState(false);
  
  // Maintenance request inside modal state
  const [detailMaintenanceDescription, setDetailMaintenanceDescription] = useState('');
  const [detailMaintenanceLoading, setDetailMaintenanceLoading] = useState(false);
  const [detailMaintenanceError, setDetailMaintenanceError] = useState<string | null>(null);

  // Transfer inside modal state
  const [detailTransferUserId, setDetailTransferUserId] = useState<number | ''>('');
  const [detailTransferMotivo, setDetailTransferMotivo] = useState('');
  const [detailTransferDataPrevista, setDetailTransferDataPrevista] = useState('');
  const [detailTransferLoading, setDetailTransferLoading] = useState(false);
  const [detailTransferError, setDetailTransferError] = useState<string | null>(null);

  // Forced Devolution inside modal state
  const [showDetailDevolucaoForm, setShowDetailDevolucaoForm] = useState(false);
  const [detailDevolucaoCondicao, setDetailDevolucaoCondicao] = useState('Íntegro e funcional');
  const [detailDevolucaoAcessorios, setDetailDevolucaoAcessorios] = useState('Fonte e Carregador');
  const [detailDevolucaoNotas, setDetailDevolucaoNotas] = useState('');
  const [detailDevolucaoLoading, setDetailDevolucaoLoading] = useState(false);
  const [detailDevolucaoError, setDetailDevolucaoError] = useState<string | null>(null);

  const fetchAssetHistory = async (assetId: number) => {
    try {
      setLoadingHistory(true);
      const data = await assetsApi.getHistory(assetId);
      setAssetHistory(data);
    } catch (err) {
      console.error('Falha ao carregar histórico do ativo:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // List of users for transferring
  const [usersList, setUsersList] = useState<User[]>([]);

  // Global UI states
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchAssets = async () => {
    setLoading(true);
    setGlobalError(null);
    try {
      const data = await assetsApi.list(0, 10000, {
        e_patrimonio: searchEP,
        categoria_id: filterCategory,
        status: filterStatus,
      });
      setAssets(data);
    } catch (err: any) {
      setGlobalError('Falha ao buscar ativos no servidor.');
    } finally {
      setLoading(false);
    }
  };

  const fetchReferences = async () => {
    try {
      const data = await assetsApi.getReferences();
      setReferences(data);
    } catch (err) {
      console.error('Falha ao buscar referências:', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await usersApi.list();
      setUsersList(data);
    } catch (err) {
      console.error('Falha ao buscar usuários:', err);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nextTab = params.get('tab');
    if (nextTab === 'table' || nextTab === 'kanban' || nextTab === 'reports' || nextTab === 'references') {
      setActiveTab(nextTab);
    }

    const statusParam = params.get('status');
    if (statusParam !== null) {
      setFilterStatus(statusParam);
    }

    const searchParam = params.get('search') ?? params.get('e_patrimonio');
    if (searchParam !== null) {
      setSearchEP(searchParam);
    }

    const categoryParam = params.get('category');
    if (categoryParam) {
      if (!Number.isNaN(Number(categoryParam))) {
        setFilterCategory(Number(categoryParam));
      } else if (references?.categorias?.length) {
        const match = references.categorias.find((cat) => cat.nome.toLowerCase() === categoryParam.toLowerCase());
        if (match) {
          setFilterCategory(match.id);
        }
      }
    }
  }, [location.search, references]);

  const fetchReportAssets = async () => {
    setReportLoading(true);
    setGlobalError(null);
    try {
      const data = await assetsApi.list(0, 100, {
        data_inicio: reportStartDate,
        data_fim: reportEndDate,
        nome: reportName,
        categoria_id: reportCategory,
        localizacao_id: reportLocation,
        fornecedor_id: reportSupplier,
        nfe: reportInvoice,
        e_patrimonio: reportPatrimonio,
        status: reportStatus,
      });
      setReportAssets(data);
    } catch (_err) {
      setGlobalError('Falha ao buscar ativos para o painel de relatórios.');
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    setAssetPage(1);
    setSelectedAssetIds(new Set());
    fetchAssets();
    fetchReferences();
  }, [searchEP, filterCategory, filterStatus]);

  useEffect(() => {
    if (activeTab === 'reports') {
      fetchReportAssets();
    }
  }, [
    activeTab,
    reportStartDate,
    reportEndDate,
    reportName,
    reportCategory,
    reportLocation,
    reportSupplier,
    reportInvoice,
    reportPatrimonio,
    reportStatus,
  ]);

  // Asset crud triggers
  const handleOpenCreate = () => {
    setEditAssetId(null);
    setAssetName('');
    setAssetEP('');
    setAssetModelo('');
    setAssetDescricao('');
    setAssetValor(0);
    setAssetStatusValue('Disponível');
    setAssetSerie('');
    setAssetEmPosseDe('');
    setAssetCurrentUserId('');
    setAssetBloqueado(false);
    setAssetRequerRH(false);
    setAssetCategoriaId('');
    setAssetFornecedorId('');
    setAssetNotaFiscalId('');
    setAssetNotasFiscais([]);
    setAssetLocalId('');
    setAssetArmazenamentoId('');
    setAssetDataAquisicao('');
    setAssetDepartamentoId('');
    setAssetDatasheetPath('');
    setAssetDatasheetNome('');
    setDatasheetError(null);
    setFormError(null);
    setShowFormModal(true);
  };

  const handleOpenEdit = (a: Asset) => {
    setEditAssetId(a.id);
    setAssetName(a.nome);
    setAssetEP(a.e_patrimonio);
    setAssetModelo(a.modelo || '');
    setAssetDescricao(a.descricao || '');
    setAssetValor(a.valor || 0);
    setAssetStatusValue(a.status);
    setAssetSerie(a.numero_serie || '');
    setAssetEmPosseDe(a.em_posse_de || '');
    setAssetCurrentUserId(a.current_user_id || '');
    setAssetBloqueado(a.bloqueado);
    setAssetRequerRH(a.requer_termo_rh);
    setAssetCategoriaId(a.categoria_id || '');
    setAssetFornecedorId(a.fornecedor_id || '');
    setAssetNotaFiscalId(a.nota_fiscal_id || '');
    setAssetLocalId(a.current_local_id || '');
    setAssetArmazenamentoId(a.current_armazenamento_id || '');
    setAssetDataAquisicao(a.data_aquisicao ? a.data_aquisicao.split('T')[0] : '');
    setAssetDepartamentoId(a.current_departamento_id || '');
    setAssetDatasheetPath(a.datasheet_path || '');
    setAssetDatasheetNome(a.datasheet_nome || '');
    setDatasheetError(null);
    setFormError(null);
    setShowFormModal(true);
  };

  const handleDatasheetFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'txt', 'csv'].includes(ext || '')) {
      setDatasheetError('Formato inválido. Selecione um arquivo .pdf, .txt ou .csv');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setDatasheetError('Arquivo muito grande. O tamanho máximo permitido é 25MB.');
      return;
    }

    try {
      setUploadingDatasheet(true);
      setDatasheetError(null);
      const res = await assetsApi.uploadDatasheet(file);
      setAssetDatasheetPath(res.url);
      setAssetDatasheetNome(res.filename);
    } catch (err: any) {
      setDatasheetError(err.response?.data?.error || 'Falha ao enviar arquivo do datasheet.');
    } finally {
      setUploadingDatasheet(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const payload: Partial<Asset> = {
      nome: assetName,
      e_patrimonio: assetEP,
      modelo: assetModelo || null,
      descricao: assetDescricao || null,
      valor: assetValor || null,
      status: assetStatus,
      numero_serie: assetSerie || null,
      em_posse_de: assetEmPosseDe || null,
      current_user_id: assetStatus === 'Em uso'
        ? (assetCurrentUserId ? Number(assetCurrentUserId) : null)
        : assetStatus === 'Disponível' ? null : undefined,
      bloqueado: assetBloqueado,
      requer_termo_rh: assetRequerRH,
      categoria_id: assetCategoriaId ? Number(assetCategoriaId) : null,
      fornecedor_id: assetFornecedorId ? Number(assetFornecedorId) : null,
      nota_fiscal_id: assetNotaFiscalId ? Number(assetNotaFiscalId) : null,
      current_local_id: assetLocalId ? Number(assetLocalId) : null,
      current_armazenamento_id: assetArmazenamentoId ? Number(assetArmazenamentoId) : null,
      current_departamento_id: assetDepartamentoId ? Number(assetDepartamentoId) : null,
      data_aquisicao: assetDataAquisicao ? new Date(assetDataAquisicao).toISOString() : null,
      datasheet_path: assetDatasheetPath || null,
      datasheet_nome: assetDatasheetNome || null,
    };

    try {
      if (editAssetId) {
        // Use the server response immediately so the table reflects the saved
        // location/assignment even before the list refresh completes.
        const savedAsset = await assetsApi.update(editAssetId, payload);
        setAssets((current) => current.map((item) => (
          item.id === savedAsset.id ? savedAsset : item
        )));
        setGlobalSuccess('Registro de ativo atualizado com sucesso.');
      } else {
        const createdAsset = await assetsApi.create(payload);
        setAssets((current) => [createdAsset, ...current]);
        setGlobalSuccess('Novo ativo registrado com sucesso.');
      }
      setShowFormModal(false);
      // Force a fresh read after saving, ensuring joined reference names
      // (local, storage and department) are updated in the visible table.
      await fetchAssets();
    } catch (err: any) {
      setFormError(err.response?.data?.error || 'Erro ao salvar ativo.');
    }
  };

  useEffect(() => {
    if (!showFormModal || !assetFornecedorId) {
      setAssetNotasFiscais([]);
      return;
    }
    let cancelled = false;
    setLoadingAssetNotasFiscais(true);
    suppliersApi.listInvoices(Number(assetFornecedorId))
      .then((invoices) => { if (!cancelled) setAssetNotasFiscais(invoices); })
      .catch(() => { if (!cancelled) setAssetNotasFiscais([]); })
      .finally(() => { if (!cancelled) setLoadingAssetNotasFiscais(false); });
    return () => { cancelled = true; };
  }, [assetFornecedorId, showFormModal]);

  const handleDeleteAsset = async (id: number) => {
    if (!window.confirm('Tem certeza que deseja excluir permanentemente este ativo?')) return;
    try {
      await assetsApi.delete(id);
      setSelectedAssetIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      setGlobalSuccess('Ativo excluído com sucesso.');
      fetchAssets();
    } catch (err: any) {
      setGlobalError('Não foi possível excluir o ativo.');
    }
  };

  const handleToggleAssetSelection = (assetId: number) => {
    setSelectedAssetIds((current) => {
      const next = new Set(current);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const handleToggleAssetGroupSelection = (assetIds: number[]) => {
    const everyAssetSelected = assetIds.length > 0 && assetIds.every((id) => selectedAssetIds.has(id));
    setSelectedAssetIds((current) => {
      const next = new Set(current);
      assetIds.forEach((id) => {
        if (everyAssetSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const handleExportSelectedAssets = () => {
    const selectedAssets = assets.filter((asset) => selectedAssetIds.has(asset.id));
    if (selectedAssets.length === 0) return;

    const escapeCsv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = [
      ['E-Patrimonio', 'Nome', 'Modelo', 'Categoria', 'Status', 'Localização', 'Armazenamento', 'Em posse de', 'Setor / Departamento'],
      ...selectedAssets.map((asset) => [
        asset.e_patrimonio,
        asset.nome,
        asset.modelo,
        asset.categoria?.nome,
        asset.status,
        getAssetLocationLabel(asset),
        getAssetStorageLabel(asset),
        asset.current_user?.nome || asset.em_posse_de,
        asset.current_departamento?.nome,
      ]),
    ];
    const blob = new Blob([`\uFEFF${rows.map((row) => row.map(escapeCsv).join(';')).join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const fileUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = `ativos_selecionados_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(fileUrl);
  };

  const handleDeleteSelectedAssets = async () => {
    const selectedIds = Array.from(selectedAssetIds);
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Deseja excluir permanentemente ${selectedIds.length} ativo(s) selecionado(s)?`)) return;

    const results = await Promise.allSettled(selectedIds.map((id) => assetsApi.delete(id)));
    const deletedIds = selectedIds.filter((_, index) => results[index].status === 'fulfilled');
    const failedCount = selectedIds.length - deletedIds.length;
    setSelectedAssetIds((current) => {
      const next = new Set(current);
      deletedIds.forEach((id) => next.delete(id));
      return next;
    });
    if (failedCount > 0) {
      setGlobalError(`${failedCount} ativo(s) não puderam ser excluídos. Os demais foram removidos.`);
    } else {
      setGlobalSuccess(`${deletedIds.length} ativo(s) excluído(s) com sucesso.`);
    }
    await fetchAssets();
  };

  const handleOpenDetailModal = (asset: Asset) => {
    setSelectedAssetForDetail(asset);
    setShowDetailModal(true);
    setDetailActiveTab('info');
    setShowDetailMaintenanceForm(false);
    setShowDetailTransferForm(false);
    setShowDetailDevolucaoForm(false);
    setDetailMaintenanceDescription('');
    setDetailMaintenanceError(null);
    setDetailTransferUserId('');
    setDetailTransferError(null);
    fetchAssetHistory(asset.id);
  };

  const handleRequestMaintenanceFromDetail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssetForDetail || !detailMaintenanceDescription.trim()) return;

    setDetailMaintenanceLoading(true);
    setDetailMaintenanceError(null);
    try {
      await maintenanceApi.createRequest({
        asset_id: selectedAssetForDetail.id,
        descricao: detailMaintenanceDescription.trim(),
      });
      setGlobalSuccess('Solicitação de manutenção criada com sucesso.');
      fetchAssets();
      setShowDetailMaintenanceForm(false);
      setDetailMaintenanceDescription('');
      // Update selected asset state locally if needed
      const updatedData = await assetsApi.list(0, 100, { e_patrimonio: selectedAssetForDetail.e_patrimonio });
      if (updatedData.length > 0) {
        setSelectedAssetForDetail(updatedData[0]);
      }
    } catch (err: any) {
      setDetailMaintenanceError(err.response?.data?.detail || 'Erro ao criar solicitação de manutenção.');
    } finally {
      setDetailMaintenanceLoading(false);
    }
  };

  const handleTransferAssetFromDetail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssetForDetail || !detailTransferUserId || !detailTransferMotivo.trim()) return;

    setDetailTransferLoading(true);
    setDetailTransferError(null);
    try {
      const res = await transactionApi.transferirAsset(selectedAssetForDetail.id, {
        para_user_id: Number(detailTransferUserId),
        motivo: detailTransferMotivo.trim(),
        data_prevista_devolucao: detailTransferDataPrevista ? new Date(detailTransferDataPrevista).toISOString() : undefined,
      });

      const selectedUser = usersList.find(u => u.id === Number(detailTransferUserId));
      setSelectedAssetForDetail(res.asset || {
        ...selectedAssetForDetail,
        status: 'Em uso',
        current_user_id: Number(detailTransferUserId),
        em_posse_de: selectedUser ? selectedUser.nome : 'Usuário',
      });
      setGlobalSuccess(res.message || 'Ativo transferido com sucesso.');

      fetchAssets();
      if (activeTab === 'reports') {
        fetchReportAssets();
      }

      setShowDetailTransferForm(false);
      setDetailTransferUserId('');
      setDetailTransferMotivo('');
      setDetailTransferDataPrevista('');
    } catch (err: any) {
      setDetailTransferError(err.response?.data?.detail || err.response?.data?.error || 'Erro ao transferir o ativo.');
    } finally {
      setDetailTransferLoading(false);
    }
  };

  const handleDevolverAssetFromDetail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssetForDetail || !detailDevolucaoCondicao.trim() || !detailDevolucaoAcessorios.trim()) return;

    setDetailDevolucaoLoading(true);
    setDetailDevolucaoError(null);
    try {
      const res = await transactionApi.devolverAsset(selectedAssetForDetail.id, {
        condicao_equipamento: detailDevolucaoCondicao.trim(),
        acessorios_devolvidos: detailDevolucaoAcessorios.trim(),
        observacoes_adicionais: detailDevolucaoNotas.trim() || undefined,
      });

      setSelectedAssetForDetail({
        ...selectedAssetForDetail,
        status: 'Disponível',
        current_user_id: null,
        current_user: null,
        em_posse_de: null,
      });
      setGlobalSuccess(res.message || 'Devolução concluída com sucesso. Ativo redefinido como Disponível.');

      fetchAssets();
      if (activeTab === 'reports') {
        fetchReportAssets();
      }

      setShowDetailDevolucaoForm(false);
      setDetailDevolucaoNotas('');
    } catch (err: any) {
      setDetailDevolucaoError(err.response?.data?.detail || err.response?.data?.error || 'Erro ao realizar devolução do ativo.');
    } finally {
      setDetailDevolucaoLoading(false);
    }
  };

  const handleCreateReference = (type: 'categoria' | 'localizacao' | 'armazenamento' | 'departamento') => {
    setReferenceCreateType(type);
    setReferenceCreateName('');
    setReferenceCreateError(null);
  };

  const handleCloseReferenceCreate = () => {
    if (creatingReference) return;
    setReferenceCreateType(null);
    setReferenceCreateName('');
    setReferenceCreateError(null);
  };

  const handleSubmitReferenceCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referenceCreateType) return;

    const nome = referenceCreateName.trim();
    if (!nome) {
      setReferenceCreateError('Informe o nome do novo registro.');
      return;
    }

    setCreatingReference(true);
    setReferenceCreateError(null);
    try {
      if (referenceCreateType === 'categoria') {
        const res = await assetsApi.createCategoria(nome);
        setAssetCategoriaId(res.id);
      } else if (referenceCreateType === 'localizacao') {
        const res = await assetsApi.createLocalizacao(nome);
        setAssetLocalId(res.id);
      } else if (referenceCreateType === 'armazenamento') {
        const res = await assetsApi.createArmazenamento(nome);
        setAssetArmazenamentoId(res.id);
      } else if (referenceCreateType === 'departamento') {
        const res = await assetsApi.createDepartamento(nome);
        setAssetDepartamentoId(res.id);
      }
      await fetchReferences();
      setReferenceCreateType(null);
      setReferenceCreateName('');
    } catch (err: any) {
      setReferenceCreateError(err.response?.data?.error || 'Erro ao criar referência.');
    } finally {
      setCreatingReference(false);
    }
  };

  // Status transitions
  const handleUpdateStatus = async (id: number, newStatus: AssetStatus) => {
    const originalAsset = assets.find(a => a.id === id);
    if (!originalAsset) return;

    try {
      await assetsApi.update(id, { ...originalAsset, status: newStatus });
      setGlobalSuccess(`Status do ativo alterado para "${newStatus}".`);
      fetchAssets();
    } catch (err: any) {
      setGlobalError(err.response?.data?.error || 'Falha ao atualizar status do ativo.');
    }
  };

  // Duplication wizard flow
  const handleOpenDuplicate = (a: Asset) => {
    setDuplicateTemplate(a);
    setDuplicateCount(1);
    setDuplicateStep('count');
    setDuplicateResults([]);
    setShowDuplicateModal(true);
  };

  const handleSetupSpecs = (e: React.FormEvent) => {
    e.preventDefault();
    const specs: BulkCopySpec[] = [];
    for (let i = 0; i < duplicateCount; i++) {
      specs.push({
        e_patrimonio: `${duplicateTemplate?.e_patrimonio}-${i + 1}`,
        numero_serie: '',
        current_local_id: duplicateTemplate?.current_local_id || null,
        current_armazenamento_id: duplicateTemplate?.current_armazenamento_id || null,
      });
    }
    setDuplicateSpecs(specs);
    setDuplicateStep('specs');
  };

  const handleSpecChange = (index: number, field: keyof BulkCopySpec, value: any) => {
    const updated = [...duplicateSpecs];
    updated[index] = { ...updated[index], [field]: value };
    setDuplicateSpecs(updated);
  };

  const handleExecuteDuplication = async () => {
    if (!duplicateTemplate) return;
    try {
      const response = await assetsApi.bulkDuplicate({
        template_id: duplicateTemplate.id,
        copies: duplicateSpecs
      });
      setDuplicateSuccessCount(response.success_count);
      setDuplicateFailedCount(response.failed_count);
      setDuplicateResults(response.results);
      setDuplicateStep('results');
      fetchAssets();
    } catch (err: any) {
      alert('Erro crítico ao duplicar ativos.');
    }
  };

  // Live QR Camera & Processing
  const stopScannerCamera = () => {
    if (scannerInstanceRef.current) {
      try {
        scannerInstanceRef.current.stop().then(() => {
          scannerInstanceRef.current?.clear();
          scannerInstanceRef.current = null;
        }).catch(() => {
          scannerInstanceRef.current = null;
        });
      } catch (_e) {
        scannerInstanceRef.current = null;
      }
    }
    setScannerCameraActive(false);
  };

  const handleProcessScannedText = async (rawText: string) => {
    if (!rawText || !rawText.trim()) return;
    setScanningAssetLoading(true);
    setScannerError(null);
    try {
      let query = rawText.trim();
      if (query.includes('assets/ep/')) {
        query = query.split('assets/ep/')[1].split('?')[0].split('/')[0];
      } else if (query.includes('assets/sn/')) {
        query = query.split('assets/sn/')[1].split('?')[0].split('/')[0];
      } else if (query.includes('assets/')) {
        query = query.split('assets/')[1].split('?')[0].split('/')[0];
      }

      query = decodeURIComponent(query).trim();

      // 1. Try finding asset by e_patrimonio in loaded list or API
      let targetAsset: Asset | undefined = assets.find(
        (a) => a.e_patrimonio.toLowerCase() === query.toLowerCase()
      );

      if (!targetAsset) {
        const results = await assetsApi.list(0, 100, { e_patrimonio: query });
        targetAsset = results.find(
          (a) => a.e_patrimonio.toLowerCase() === query.toLowerCase()
        ) || results[0];
      }

      // 2. If numeric, try by ID
      if (!targetAsset && !isNaN(Number(query))) {
        try {
          targetAsset = await assetsApi.getById(Number(query));
        } catch (_e) {}
      }

      if (targetAsset) {
        setScannedAsset(targetAsset);
        stopScannerCamera();
        setShowScannerModal(false);
        setSearchEP(targetAsset.e_patrimonio);
        setActiveTab('table');
        setSelectedAssetForDetail(targetAsset);
        setShowDetailModal(true);
        setGlobalSuccess(`Ativo #${targetAsset.e_patrimonio} (${targetAsset.nome}) localizado e aberto com sucesso!`);
      } else {
        setScannerError(`Nenhum ativo encontrado para o código "${query}".`);
      }
    } catch (err: any) {
      setScannerError(err.response?.data?.error || 'Não foi possível carregar o ativo associado.');
    } finally {
      setScanningAssetLoading(false);
    }
  };

  const startScannerCamera = async () => {
    setScannerError(null);
    if (!(await ensureCameraPermission())) {
      setScannerError(cameraPermissionMessage);
      setScannerCameraActive(false);
      return;
    }
    setScannerCameraActive(true);
    setTimeout(async () => {
      try {
        if (scannerInstanceRef.current) {
          try { await scannerInstanceRef.current.stop(); } catch (_e) {}
        }
        const html5Qrcode = new Html5Qrcode(scannerRegionId);
        scannerInstanceRef.current = html5Qrcode;
        await html5Qrcode.start(
          { facingMode: 'environment' },
          {
            fps: 12,
            qrbox: { width: 260, height: 260 },
            aspectRatio: 1,
            disableFlip: false,
          },
          (decodedText) => {
            handleProcessScannedText(decodedText);
          },
          () => {}
        );
      } catch (err: any) {
        console.warn('QR camera start failed:', err);
        setScannerError(`${cameraPermissionMessage} Você também pode enviar uma foto ou digitar o código do patrimônio.`);
        setScannerCameraActive(false);
      }
    }, 300);
  };

  useEffect(() => {
    if (showScannerModal && scannerMode === 'camera') {
      startScannerCamera();
    } else {
      stopScannerCamera();
    }
    return () => {
      stopScannerCamera();
    };
  }, [showScannerModal, scannerMode]);

  // Scanning simulation / image upload
  const handleScanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScannerError(null);
    setScannedAsset(null);
    setScanningAssetLoading(true);
    try {
      const result = await assetsApi.scanQRCode(file);
      if (result && result.id) {
        setScannedAsset(result);
        stopScannerCamera();
        setShowScannerModal(false);
        setSearchEP(result.e_patrimonio);
        setActiveTab('table');
        setSelectedAssetForDetail(result);
        setShowDetailModal(true);
        setGlobalSuccess(`Ativo #${result.e_patrimonio} (${result.nome}) localizado e aberto com sucesso!`);
      }
    } catch (err: any) {
      setScannerError(err.response?.data?.error || 'QR Code inválido ou ativo não encontrado.');
    } finally {
      setScanningAssetLoading(false);
    }
  };

  const handleOpenImportModal = () => {
    setShowImportModal(true);
    setSelectedImportFile(null);
    setImportSummary(null);
    setImportError(null);
    if (importInputRef.current) {
      importInputRef.current.value = '';
    }
  };

  const handleImportCsv = async () => {
    if (!selectedImportFile) {
      setImportError('Selecione um arquivo CSV para importar.');
      return;
    }

    setImportingCsv(true);
    setImportError(null);
    try {
      const summary = await assetsApi.importCsv(selectedImportFile);
      setImportSummary(summary);
      setGlobalSuccess(`Importação concluída: ${summary.criados} criado(s), ${summary.atualizados} atualizado(s) e ${summary.falhas} falha(s).`);
      fetchAssets();
      fetchReferences();
      if (activeTab === 'reports') {
        fetchReportAssets();
      }
    } catch (err: any) {
      setImportError(err.response?.data?.error || 'Não foi possível importar o CSV.');
    } finally {
      setImportingCsv(false);
    }
  };

  const getAssetLocationLabel = (asset: Asset) => {
    if (asset.current_local?.nome) return asset.current_local.nome;
    if (asset.status === 'Manutenção' && asset.prev_local?.nome) return `${asset.prev_local.nome} (origem)`;
    return '—';
  };

  const getAssetStorageLabel = (asset: Asset) => {
    if (asset.current_armazenamento?.nome) return asset.current_armazenamento.nome;
    if (asset.status === 'Manutenção' && asset.prev_armazenamento?.nome) return `${asset.prev_armazenamento.nome} (origem)`;
    return '';
  };

  const handleCreateCategoryInline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    setCreatingCategory(true);
    try {
      await assetsApi.createCategoria(newCategoryName.trim());
      setNewCategoryName('');
      setGlobalSuccess('Categoria criada com sucesso.');
      fetchReferences();
    } catch (err: any) {
      setGlobalError(err.response?.data?.error || 'Não foi possível criar a categoria.');
    } finally {
      setCreatingCategory(false);
    }
  };

  const handleCreateLocationInline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocationName.trim()) return;

    setCreatingLocation(true);
    try {
      await assetsApi.createLocalizacao(newLocationName.trim());
      setNewLocationName('');
      setGlobalSuccess('Localização criada com sucesso.');
      fetchReferences();
    } catch (err: any) {
      setGlobalError(err.response?.data?.error || 'Não foi possível criar a localização.');
    } finally {
      setCreatingLocation(false);
    }
  };

  const handleStartEditCategory = (id: number, nome: string) => {
    setEditingCategoryId(id);
    setEditingCategoryName(nome);
  };

  const handleSaveCategory = async (id: number) => {
    if (!editingCategoryName.trim()) return;
    setSavingCategoryId(id);
    try {
      await assetsApi.updateCategoria(id, editingCategoryName.trim());
      setEditingCategoryId(null);
      setEditingCategoryName('');
      setGlobalSuccess('Categoria atualizada com sucesso.');
      fetchReferences();
    } catch (err: any) {
      setGlobalError(err.response?.data?.error || 'Não foi possível atualizar a categoria.');
    } finally {
      setSavingCategoryId(null);
    }
  };

  const handleDeleteCategory = async (id: number, nome: string) => {
    if (!window.confirm(`Deseja excluir a categoria "${nome}"?`)) return;
    setDeletingCategoryId(id);
    try {
      await assetsApi.deleteCategoria(id);
      if (editingCategoryId === id) {
        setEditingCategoryId(null);
        setEditingCategoryName('');
      }
      setGlobalSuccess('Categoria excluída com sucesso.');
      fetchReferences();
    } catch (err: any) {
      setGlobalError(err.response?.data?.error || 'Não foi possível excluir a categoria.');
    } finally {
      setDeletingCategoryId(null);
    }
  };

  const handleStartEditLocation = (id: number, nome: string) => {
    setEditingLocationId(id);
    setEditingLocationName(nome);
  };

  const handleSaveLocation = async (id: number) => {
    if (!editingLocationName.trim()) return;
    setSavingLocationId(id);
    try {
      await assetsApi.updateLocalizacao(id, editingLocationName.trim());
      setEditingLocationId(null);
      setEditingLocationName('');
      setGlobalSuccess('Localização atualizada com sucesso.');
      fetchReferences();
    } catch (err: any) {
      setGlobalError(err.response?.data?.error || 'Não foi possível atualizar a localização.');
    } finally {
      setSavingLocationId(null);
    }
  };

  const handleDeleteLocation = async (id: number, nome: string) => {
    if (!window.confirm(`Deseja excluir a localização "${nome}"?`)) return;
    setDeletingLocationId(id);
    try {
      await assetsApi.deleteLocalizacao(id);
      if (editingLocationId === id) {
        setEditingLocationId(null);
        setEditingLocationName('');
      }
      setGlobalSuccess('Localização excluída com sucesso.');
      fetchReferences();
    } catch (err: any) {
      setGlobalError(err.response?.data?.error || 'Não foi possível excluir a localização.');
    } finally {
      setDeletingLocationId(null);
    }
  };

  // Group assets by category name for list view
  const groupedAssets: Record<string, Asset[]> = {};
  assets.forEach(a => {
    const catName = a.categoria?.nome || 'Sem Categoria';
    if (!groupedAssets[catName]) {
      groupedAssets[catName] = [];
    }
    groupedAssets[catName].push(a);
  });

  const assetTotalPages = Math.max(1, Math.ceil(assets.length / assetPageSize));
  const currentAssetPage = Math.min(assetPage, assetTotalPages);
  const paginatedAssets = assets.slice((currentAssetPage - 1) * assetPageSize, currentAssetPage * assetPageSize);
  const groupedAssetsForPage: Record<string, Asset[]> = {};
  paginatedAssets.forEach(a => {
    const catName = a.categoria?.nome || 'Sem Categoria';
    if (!groupedAssetsForPage[catName]) groupedAssetsForPage[catName] = [];
    groupedAssetsForPage[catName].push(a);
  });

  // Kanban statuses list
  const statusesList: { name: AssetStatus; color: string; label: string }[] = [
    { name: 'Disponível', color: 'border-green-500/30 bg-green-500/5 text-green-400', label: 'Disponível' },
    { name: 'Em uso', color: 'border-blue-500/30 bg-blue-500/5 text-blue-400', label: 'Em Uso' },
    { name: 'Manutenção', color: 'border-amber-500/30 bg-amber-500/5 text-amber-400', label: 'Manutenção' },
    { name: 'Armazenado', color: 'border-purple-500/30 bg-purple-500/5 text-purple-400', label: 'Armazenado' },
    { name: 'Baixado', color: 'border-red-500/30 bg-red-500/5 text-red-400', label: 'Baixado' },
  ];

  const assetStatusCounts = assets.reduce<Record<string, number>>((counts, asset) => {
    counts[asset.status] = (counts[asset.status] || 0) + 1;
    return counts;
  }, {});
  const assetInventoryValue = assets.reduce((total, asset) => total + (asset.valor || 0), 0);

  return (
    <div className="space-y-5">
      {/* Notifications */}
      {globalError && (
        <div className="p-4 border border-red-500/30 bg-red-500/5 text-red-400 text-sm font-mono flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldAlert size={18} />
            <span>{globalError}</span>
          </div>
          <button onClick={() => setGlobalError(null)} className="text-red-400/70 hover:text-red-400 font-bold">&times;</button>
        </div>
      )}

      {globalSuccess && (
        <div className="app-notice--success p-4 border border-brand-primary/30 bg-brand-primary/5 text-brand-primary text-sm font-mono flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Check size={18} />
            <span>{globalSuccess}</span>
          </div>
          <button onClick={() => setGlobalSuccess(null)} className="text-brand-primary/70 hover:text-brand-primary font-bold">&times;</button>
        </div>
      )}

      {/* Header section */}
      <section className="relative overflow-hidden rounded-2xl border border-brand-primary/20 bg-gradient-to-br from-[#0c66e4] via-[#1559b7] to-[#172b4d] p-5 text-white shadow-lg md:p-7">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-blue-100"><Layers3 size={14} /> Central patrimonial</div>
          <h1 className="m-0 text-2xl font-bold tracking-tight md:text-3xl">
            Inventário organizado, ativos disponíveis.
          </h1>
          <p className="mt-2 text-sm leading-6 text-blue-100">
            Gestão de equipamentos, controle patrimonial, QR Codes e Kanban de oficina.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => {
              assetsApi.exportCsv({
                e_patrimonio: searchEP,
                categoria_id: filterCategory,
                status: filterStatus,
              }).catch(() => {
                setGlobalError('Falha ao exportar os ativos.');
              });
            }}
            className="flex-1 sm:flex-initial border border-brand-border bg-white/60 hover:bg-white text-brand-text font-bold font-mono px-3.5 py-2.5 rounded-xl uppercase tracking-wider text-xs flex items-center justify-center space-x-1.5 transition-all shadow-sm active:scale-95 cursor-pointer min-h-[40px]"
          >
            <FileText size={16} />
            <span>Exportar CSV</span>
          </button>

          {isManagerOrAbove && (
            <button
              onClick={handleOpenImportModal}
              className="flex-1 sm:flex-initial border border-brand-border bg-white/60 hover:bg-white text-brand-text font-bold font-mono px-3.5 py-2.5 rounded-xl uppercase tracking-wider text-xs flex items-center justify-center space-x-1.5 transition-all shadow-sm active:scale-95 cursor-pointer min-h-[40px]"
            >
              <Upload size={16} />
              <span>Importar CSV</span>
            </button>
          )}

          <button
            onClick={() => {
              setScannerMode('camera');
              setShowScannerModal(true);
            }}
            className="flex-1 sm:flex-initial border border-[#7a87e6] bg-brand-primary/10 hover:bg-white/20 text-[#e8eaed] font-bold font-mono px-3.5 py-2.5 rounded-xl uppercase tracking-wider text-xs flex items-center justify-center space-x-1.5 transition-all shadow-sm active:scale-95 cursor-pointer min-h-[40px]"
          >
            <QrCode size={16} />
            <span>Scanner QR</span>
          </button>

          {isManagerOrAbove && (
            <button
              onClick={handleOpenCreate}
              className="flex-1 sm:flex-initial bg-brand-primary hover:bg-brand-primary/90 text-white font-bold font-mono px-4 py-2.5 rounded-xl uppercase tracking-wider text-xs flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-brand-primary/20 active:scale-95 cursor-pointer min-h-[40px]"
            >
              <Plus size={16} />
              <span>Cadastrar Ativo</span>
            </button>
          )}
        </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Total de ativos', value: assets.length, hint: 'registros na visão atual', icon: Layers3, tone: 'text-blue-600 bg-blue-50' },
          { label: 'Disponíveis', value: assetStatusCounts['Disponível'] || 0, hint: 'prontos para uso', icon: CheckCircle2, tone: 'text-emerald-600 bg-emerald-50' },
          { label: 'Em manutenção', value: assetStatusCounts['Manutenção'] || 0, hint: 'fora de operação', icon: Wrench, tone: 'text-amber-600 bg-amber-50' },
          { label: 'Valor inventariado', value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(assetInventoryValue), hint: 'soma dos ativos carregados', icon: DollarSign, tone: 'text-violet-600 bg-violet-50' },
        ].map(({ label, value, hint, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-brand-border bg-brand-card p-4 shadow-sm"><div className="flex items-start justify-between gap-2"><span className={`rounded-xl p-2 ${tone}`}><Icon size={17} /></span><span className="text-right text-2xl font-bold tracking-tight text-brand-text">{value}</span></div><div className="mt-4 text-xs font-bold uppercase tracking-wide text-brand-text">{label}</div><div className="mt-1 text-xs text-brand-muted">{hint}</div></div>
        ))}
      </div>

      {/* Tabs Menu */}
      <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-t-2xl border-b border-brand-border bg-white/20 flex items-center gap-1 pb-0.5 no-scrollbar scroll-smooth">
        <button
          onClick={() => setActiveTab('table')}
          className={`shrink-0 whitespace-nowrap px-4 sm:px-5 py-2.5 sm:py-3 border-b-2 font-mono text-xs uppercase tracking-wider flex items-center space-x-2 transition-all cursor-pointer rounded-t-lg ${
            activeTab === 'table'
              ? 'border-brand-primary text-brand-primary bg-white font-bold shadow-sm'
              : 'border-transparent text-brand-text bg-white/40 opacity-70 hover:opacity-100 hover:bg-white/70'
          }`}
        >
          <TableIcon size={16} />
          <span>Tabela Geral</span>
        </button>

        <button
          onClick={() => setActiveTab('kanban')}
          className={`shrink-0 whitespace-nowrap px-4 sm:px-5 py-2.5 sm:py-3 border-b-2 font-mono text-xs uppercase tracking-wider flex items-center space-x-2 transition-all cursor-pointer rounded-t-lg ${
            activeTab === 'kanban'
              ? 'border-brand-primary text-brand-primary bg-white font-bold shadow-sm'
              : 'border-transparent text-brand-text bg-white/40 opacity-70 hover:opacity-100 hover:bg-white/70'
          }`}
        >
          <KanbanIcon size={16} />
          <span>Kanban Oficina</span>
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`shrink-0 whitespace-nowrap px-4 sm:px-5 py-2.5 sm:py-3 border-b-2 font-mono text-xs uppercase tracking-wider flex items-center space-x-2 transition-all cursor-pointer rounded-t-lg ${
            activeTab === 'reports'
              ? 'border-brand-primary text-brand-primary bg-white font-bold shadow-sm'
              : 'border-transparent text-brand-text bg-white/40 opacity-70 hover:opacity-100 hover:bg-white/70'
          }`}
        >
          <FileText size={16} />
          <span>Filtros & Relatórios</span>
        </button>

        {isManagerOrAbove && (
          <button
            onClick={() => setActiveTab('references')}
            className={`shrink-0 whitespace-nowrap px-4 sm:px-5 py-2.5 sm:py-3 border-b-2 font-mono text-xs uppercase tracking-wider flex items-center space-x-2 transition-all cursor-pointer rounded-t-lg ${
              activeTab === 'references'
                ? 'border-brand-primary text-brand-primary bg-white font-bold shadow-sm'
                : 'border-transparent text-brand-text bg-white/40 opacity-70 hover:opacity-100 hover:bg-white/70'
            }`}
          >
            <Layers3 size={16} />
            <span>Cadastros Base</span>
          </button>
        )}
      </div>

      {/* SEARCH AND QUICK FILTERS FOR TABLE & KANBAN */}
      {(activeTab === 'table' || activeTab === 'kanban') && (
        <div className="grid grid-cols-1 gap-3 rounded-2xl border border-brand-border bg-brand-card p-4 shadow-sm md:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-brand-muted" size={16} />
            <input
              type="text"
              placeholder="Buscar por E-Patrimônio..."
              value={searchEP}
              onChange={(e) => setSearchEP(e.target.value)}
              className="w-full rounded-xl bg-brand-dark border border-brand-border pl-10 pr-4 py-2.5 text-sm text-brand-text focus:outline-none focus:border-brand-primary font-mono transition-colors"
            />
          </div>

          <div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value ? Number(e.target.value) : '')}
              className="w-full rounded-xl bg-brand-dark border border-brand-border px-3 py-2.5 text-sm text-brand-text focus:outline-none focus:border-brand-primary transition-colors font-mono"
            >
              <option value="">Todas as Categorias</option>
              {references?.categorias.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full rounded-xl bg-brand-dark border border-brand-border px-3 py-2.5 text-sm text-brand-text focus:outline-none focus:border-brand-primary transition-colors font-mono"
            >
              <option value="">Todos os Status</option>
              <option value="Disponível">Disponível</option>
              <option value="Em uso">Em Uso</option>
              <option value="Manutenção">Manutenção</option>
              <option value="Armazenado">Armazenado</option>
              <option value="Baixado">Baixado</option>
              <option value="ativo_fixo">🔒 Ativo Fixo (Bloqueado)</option>
            </select>
          </div>
        </div>
      )}

      {/* TAB CONTENT: TABLE VIEW */}
      {activeTab === 'table' && (
        <div className="border border-brand-border bg-brand-card">
          {selectedAssetIds.size > 0 && (
            <div className="flex flex-col gap-3 border-b border-brand-primary/30 bg-brand-primary/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-mono text-xs font-semibold text-brand-text">
                {selectedAssetIds.size} ativo(s) selecionado(s)
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportSelectedAssets}
                  className="flex items-center gap-1.5 border border-brand-primary/40 px-3 py-2 font-mono text-xs font-bold uppercase text-brand-primary hover:bg-brand-primary/10"
                >
                  <Download size={14} />
                  Exportar selecionados
                </button>
                {isManagerOrAbove && (
                  <button
                    type="button"
                    onClick={handleDeleteSelectedAssets}
                    className="flex items-center gap-1.5 border border-red-500/50 px-3 py-2 font-mono text-xs font-bold uppercase text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 size={14} />
                    Excluir selecionados
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedAssetIds(new Set())}
                  className="border border-brand-border px-3 py-2 font-mono text-xs uppercase text-brand-muted hover:text-brand-text"
                >
                  Limpar
                </button>
              </div>
            </div>
          )}
          {loading ? (
            <div className="p-12 text-center flex flex-col items-center justify-center space-y-4">
              <RefreshCw className="animate-spin text-brand-primary" size={24} />
              <span className="font-mono text-xs text-brand-muted uppercase">Sincronizando base de dados...</span>
            </div>
          ) : Object.keys(groupedAssets).length === 0 ? (
            <div className="p-12 text-center text-brand-muted font-mono text-xs uppercase">
              Nenhum ativo localizado na base de dados.
            </div>
          ) : (
            <div className="divide-y divide-brand-border">
              {Object.entries(groupedAssetsForPage).map(([categoryName, items]) => (
                <div key={categoryName} className="space-y-0.5">
                  <div className="bg-brand-dark/40 px-4 py-2 border-b border-brand-border flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-brand-primary uppercase tracking-widest">{categoryName}</span>
                    <span className="font-mono text-[10px] text-brand-muted">{items.length} itens</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-brand-border/40 text-[10px] font-mono uppercase tracking-wider text-brand-muted">
                          <th className="w-11 p-4 text-center">
                            <input
                              type="checkbox"
                              checked={items.length > 0 && items.every((asset) => selectedAssetIds.has(asset.id))}
                              onChange={() => handleToggleAssetGroupSelection(items.map((asset) => asset.id))}
                              aria-label={`Selecionar todos os ativos de ${categoryName}`}
                              className="h-4 w-4 accent-brand-primary"
                            />
                          </th>
                          <th className="p-4 w-1/4">Equipamento</th>
                          <th className="p-4">Patrimônio / S/N</th>
                          <th className="p-4">Local / Armaz.</th>
                          <th className="p-4">Status</th>
                          <th className="p-4">Posse / Setor</th>
                          {isManagerOrAbove && <th className="p-4 text-right">Ações</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-border/30 text-sm">
                        {items.map(a => (
                          <tr 
                            key={a.id} 
                            onClick={() => handleOpenDetailModal(a)}
                            className="hover:bg-brand-dark/15 cursor-pointer transition-colors"
                          >
                            <td className="p-4 text-center" onClick={(event) => event.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedAssetIds.has(a.id)}
                                onChange={() => handleToggleAssetSelection(a.id)}
                                aria-label={`Selecionar ${a.nome}`}
                                className="h-4 w-4 accent-brand-primary"
                              />
                            </td>
                            <td className="p-4">
                              <div className="font-medium text-brand-text flex items-center space-x-1.5">
                                <span>{a.nome}</span>
                                {a.bloqueado && <span title="Ativo Fixo Bloqueado"><Lock size={12} className="text-blue-400" /></span>}
                                {a.datasheet_path && (
                                  <a
                                    href={toApiFileUrl(a.datasheet_path)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-brand-primary hover:text-brand-primary/80 transition-colors"
                                    title={`Datasheet: ${a.datasheet_nome || 'Visualizar Datasheet'}`}
                                  >
                                    <FileText size={13} />
                                  </a>
                                )}
                              </div>
                              <div className="text-xs text-brand-muted">{a.modelo || 'Sem modelo'}</div>
                            </td>
                            <td className="p-4">
                              <div className="font-mono text-xs text-brand-text">{a.e_patrimonio}</div>
                              <div className="text-[10px] text-brand-muted font-mono">{a.numero_serie ? `S/N: ${a.numero_serie}` : 'S/N: —'}</div>
                            </td>
                            <td className="p-4 text-xs">
                              <div className="text-brand-text">{getAssetLocationLabel(a)}</div>
                              <div className="text-brand-muted font-mono">{getAssetStorageLabel(a)}</div>
                            </td>
                            <td className="p-4">
                              {a.status === 'Manutenção' ? (
                                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 border border-amber-500/30 bg-amber-500/5 text-amber-400">
                                  Manutenção
                                </span>
                              ) : a.status === 'Disponível' ? (
                                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 border border-green-500/30 bg-green-500/5 text-green-400">
                                  Disponível
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 border border-brand-border bg-brand-dark/30 text-brand-text">
                                  {a.status}
                                </span>
                              )}
                            </td>
                            <td className="p-4 text-xs">
                              <div className="text-brand-text">
                                {a.status === 'Disponível' ? '—' : (a.current_user?.nome || a.em_posse_de || '—')}
                              </div>
                              <div className="text-brand-muted">{a.current_departamento?.nome}</div>
                            </td>
                            {isManagerOrAbove && (
                              <td className="p-4 text-right">
                                <div className="flex items-center justify-end space-x-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenDuplicate(a);
                                    }}
                                    className="border border-brand-border hover:border-brand-primary text-brand-text p-1.5 transition-colors"
                                    title="Duplicar ativo em lote"
                                  >
                                    <Copy size={13} />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenEdit(a);
                                    }}
                                    className="border border-brand-border hover:border-brand-primary text-brand-text p-1.5 transition-colors"
                                    title="Editar"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteAsset(a.id);
                                    }}
                                    className="border border-brand-border hover:border-red-500 text-red-400 p-1.5 transition-colors"
                                    title="Excluir"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!loading && assets.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-brand-border bg-brand-dark/20 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-brand-muted font-mono">
                <span>Exibir</span>
                <select
                  value={assetPageSize}
                  onChange={(e) => {
                    setAssetPageSize(Number(e.target.value) as 20 | 50 | 100);
                    setAssetPage(1);
                  }}
                  className="border border-brand-border bg-brand-dark px-2 py-1.5 text-brand-text focus:outline-none focus:border-brand-primary"
                  aria-label="Quantidade de ativos por página"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>por página · {assets.length} ativo(s)</span>
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <span className="font-mono text-brand-muted">Página {currentAssetPage} de {assetTotalPages}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setAssetPage(page => Math.max(1, page - 1))}
                    disabled={currentAssetPage === 1}
                    className="border border-brand-border p-1.5 text-brand-text hover:border-brand-primary disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssetPage(page => Math.min(assetTotalPages, page + 1))}
                    disabled={currentAssetPage === assetTotalPages}
                    className="border border-brand-border p-1.5 text-brand-text hover:border-brand-primary disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Próxima página"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: KANBAN BOARD */}
      {activeTab === 'kanban' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {statusesList.map(column => {
            const columnAssets = assets.filter(a => a.status === column.name);
            return (
              <div key={column.name} className="flex flex-col h-[70vh] border border-brand-border bg-brand-card">
                {/* Header */}
                <div className={`p-3 border-b border-brand-border flex items-center justify-between font-mono text-xs uppercase tracking-wider font-semibold ${column.color}`}>
                  <span>{column.label}</span>
                  <span>{columnAssets.length}</span>
                </div>

                {/* Cards Container */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-brand-dark/10">
                  {columnAssets.map(a => (
                    <div 
                      key={a.id} 
                      onClick={() => handleOpenDetailModal(a)}
                      className="border border-brand-border bg-brand-card p-3 space-y-3 shadow-sm hover:border-brand-primary/50 transition-colors cursor-pointer"
                    >
                      <div>
                        <div className="font-medium text-xs text-brand-text flex items-center justify-between">
                          <span className="truncate pr-1">{a.nome}</span>
                          {a.bloqueado && <Lock size={10} className="text-purple-400 flex-shrink-0" />}
                        </div>
                        <div className="text-[10px] text-brand-muted font-mono">{a.e_patrimonio}</div>
                      </div>

                      {/* Dropdown status update */}
                      {isManagerOrAbove && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <label className="text-[9px] font-mono uppercase text-brand-muted block mb-1">Mudar Status</label>
                          <select
                            value={a.status}
                            onChange={(e) => handleUpdateStatus(a.id, e.target.value as AssetStatus)}
                            className="w-full bg-brand-dark border border-brand-border px-1.5 py-1 text-[10px] text-brand-text focus:outline-none font-mono"
                          >
                            <option value="Disponível">Disponível</option>
                            <option value="Em uso">Em Uso</option>
                            <option value="Manutenção">Manutenção</option>
                            <option value="Armazenado">Armazenado</option>
                            <option value="Baixado">Baixado</option>
                          </select>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-[9px] text-brand-muted border-t border-brand-border/30 pt-2 font-mono">
                        <span>{a.categoria?.nome || 'Sem Categoria'}</span>
                        <span className="truncate max-w-[100px]">{getAssetLocationLabel(a)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB CONTENT: FILTERS & REPORTS */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="bg-brand-card border border-brand-border p-6 space-y-6">
            <div className="border-b border-brand-border pb-3 flex items-center space-x-2">
              <Filter className="text-brand-primary" size={18} />
              <h3 className="font-bold text-sm uppercase tracking-wider text-brand-text font-mono">Painel de Relatórios</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Data Aquisição (Início)</label>
                <input
                  type="date"
                  value={reportStartDate}
                  onChange={(e) => setReportStartDate(e.target.value)}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary font-mono transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Data Aquisição (Fim)</label>
                <input
                  type="date"
                  value={reportEndDate}
                  onChange={(e) => setReportEndDate(e.target.value)}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary font-mono transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Nome do Ativo</label>
                <input
                  type="text"
                  placeholder="Nome..."
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Categoria</label>
                <select
                  value={reportCategory}
                  onChange={(e) => setReportCategory(e.target.value ? Number(e.target.value) : '')}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary transition-colors font-mono"
                >
                  <option value="">Todas</option>
                  {references?.categorias.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Localização</label>
                <select
                  value={reportLocation}
                  onChange={(e) => setReportLocation(e.target.value ? Number(e.target.value) : '')}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary transition-colors font-mono"
                >
                  <option value="">Todas</option>
                  {references?.localizacoes.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Fornecedor</label>
                <select
                  value={reportSupplier}
                  onChange={(e) => setReportSupplier(e.target.value ? Number(e.target.value) : '')}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary transition-colors font-mono"
                >
                  <option value="">Todos</option>
                  {references?.fornecedores.map(f => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Nota Fiscal</label>
                <input
                  type="text"
                  placeholder="Número..."
                  value={reportInvoice}
                  onChange={(e) => setReportInvoice(e.target.value)}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary font-mono transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">E-Patrimônio</label>
                <input
                  type="text"
                  placeholder="EP..."
                  value={reportPatrimonio}
                  onChange={(e) => setReportPatrimonio(e.target.value)}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary font-mono transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-brand-muted mb-1.5">Status</label>
                <select
                  value={reportStatus}
                  onChange={(e) => setReportStatus(e.target.value)}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary transition-colors font-mono"
                >
                  <option value="">Todos</option>
                  <option value="Disponível">Disponível</option>
                  <option value="Em uso">Em Uso</option>
                  <option value="Manutenção">Manutenção</option>
                  <option value="Armazenado">Armazenado</option>
                  <option value="Baixado">Baixado</option>
                  <option value="ativo_fixo">🔒 Ativo Fixo (Bloqueado)</option>
                </select>
              </div>
            </div>

            <div className="flex space-x-3 pt-4 border-t border-brand-border">
              <button
                onClick={() => {
                  setReportStartDate('');
                  setReportEndDate('');
                  setReportName('');
                  setReportCategory('');
                  setReportLocation('');
                  setReportSupplier('');
                  setReportInvoice('');
                  setReportPatrimonio('');
                  setReportStatus('');
                }}
                className="border border-brand-border hover:bg-brand-card text-brand-muted px-4 py-2 font-mono text-xs uppercase"
              >
                Limpar Filtros
              </button>
              
              <button
                onClick={() => {
                  assetsApi.exportCsv({
                    data_inicio: reportStartDate,
                    data_fim: reportEndDate,
                    nome: reportName,
                    categoria_id: reportCategory,
                    localizacao_id: reportLocation,
                    fornecedor_id: reportSupplier,
                    nfe: reportInvoice,
                    e_patrimonio: reportPatrimonio,
                    status: reportStatus,
                  }).catch(() => {
                    setGlobalError('Falha ao exportar relatório de ativos.');
                  });
                }}
                className="bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold font-mono px-5 py-2 uppercase tracking-wider text-xs flex items-center space-x-1.5"
              >
                <FileText size={14} />
                <span>Exportar CSV</span>
              </button>
            </div>
          </div>

          <div className="bg-brand-card border border-brand-border p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-brand-border pb-3">
              <div>
                <h3 className="font-bold text-sm uppercase tracking-wider text-brand-text font-mono">
                  Ativos Encontrados
                </h3>
                <p className="text-[10px] font-mono uppercase tracking-wider text-brand-muted mt-1">
                  {reportLoading ? 'Atualizando resultados...' : `${reportAssets.length} registro(s) carregado(s)`}
                </p>
              </div>
            </div>

            {reportLoading ? (
              <div className="p-10 text-center flex flex-col items-center justify-center space-y-4">
                <RefreshCw className="animate-spin text-brand-primary" size={24} />
                <span className="font-mono text-xs text-brand-muted uppercase">Buscando ativos filtrados...</span>
              </div>
            ) : reportAssets.length === 0 ? (
              <div className="p-10 text-center text-brand-muted font-mono text-xs uppercase border border-brand-border/40 bg-brand-dark/20">
                Nenhum ativo encontrado com os filtros atuais.
              </div>
            ) : (
              <div className="overflow-x-auto border border-brand-border/40">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-brand-border/60 font-mono uppercase text-brand-muted text-[10px]">
                      <th className="py-3 px-3">Ativo</th>
                      <th className="py-3 px-3">Patrimônio</th>
                      <th className="py-3 px-3">Categoria</th>
                      <th className="py-3 px-3">Local</th>
                      <th className="py-3 px-3">Fornecedor</th>
                      <th className="py-3 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border/30">
                    {reportAssets.map((asset) => (
                      <tr key={asset.id} className="hover:bg-brand-dark/20 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-semibold text-brand-text">{asset.nome}</div>
                          <div className="text-brand-muted text-[10px] mt-1">{asset.modelo || 'Sem modelo'}</div>
                        </td>
                        <td className="py-3 px-3 font-mono text-brand-text">{asset.e_patrimonio}</td>
                        <td className="py-3 px-3 text-brand-muted">{asset.categoria?.nome || 'Sem categoria'}</td>
                        <td className="py-3 px-3 text-brand-muted">{getAssetLocationLabel(asset)}</td>
                        <td className="py-3 px-3 text-brand-muted">{asset.fornecedor?.nome || '—'}</td>
                        <td className="py-3 px-3">
                          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 border border-brand-primary/30 bg-brand-primary/5 text-brand-primary">
                            {asset.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: REFERENCE MANAGEMENT */}
      {activeTab === 'references' && isManagerOrAbove && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-brand-card border border-brand-border p-6 space-y-5">
            <div className="flex items-center space-x-2 border-b border-brand-border pb-3">
              <Layers3 className="text-brand-primary" size={18} />
              <div>
                <h3 className="font-bold text-sm uppercase tracking-wider text-brand-text font-mono m-0">Categorias de Ativos</h3>
                <p className="text-[11px] text-brand-muted mt-1">Crie e organize os tipos de equipamentos do inventário.</p>
              </div>
            </div>

            <form onSubmit={handleCreateCategoryInline} className="space-y-3">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted">Nova Categoria</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Ex.: Notebook, Monitor, Impressora"
                  className="flex-1 bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                />
                <button
                  type="submit"
                  disabled={creatingCategory}
                  className="bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-60 text-brand-dark font-bold font-mono px-4 py-2.5 uppercase tracking-wider text-xs flex items-center justify-center gap-2"
                >
                  {creatingCategory && <RefreshCw size={14} className="animate-spin" />}
                  <span>{creatingCategory ? 'Criando...' : 'Criar Categoria'}</span>
                </button>
              </div>
            </form>

            <div className="border border-brand-border/50">
              <div className="px-4 py-3 border-b border-brand-border bg-brand-dark/20 flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-wider text-brand-text">Categorias cadastradas</span>
                <span className="font-mono text-[10px] text-brand-muted">{references?.categorias.length ?? 0} itens</span>
              </div>
              <div className="max-h-[420px] overflow-y-auto divide-y divide-brand-border/30">
                {references?.categorias.length ? references.categorias.map((categoria) => (
                  <div key={categoria.id} className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      {editingCategoryId === categoria.id ? (
                        <input
                          type="text"
                          value={editingCategoryName}
                          onChange={(e) => setEditingCategoryName(e.target.value)}
                          className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                        />
                      ) : (
                        <div className="text-sm text-brand-text font-medium">{categoria.nome}</div>
                      )}
                      <div className="text-[10px] font-mono text-brand-muted mt-1">ID #{categoria.id}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {editingCategoryId === categoria.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSaveCategory(categoria.id)}
                            disabled={savingCategoryId === categoria.id}
                            className="border border-brand-primary text-brand-primary hover:bg-brand-primary/5 px-3 py-1.5 font-mono text-[10px] uppercase"
                          >
                            {savingCategoryId === categoria.id ? 'Salvando...' : 'Salvar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCategoryId(null);
                              setEditingCategoryName('');
                            }}
                            className="border border-brand-border text-brand-muted hover:bg-brand-card px-3 py-1.5 font-mono text-[10px] uppercase"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStartEditCategory(categoria.id, categoria.nome)}
                            className="border border-brand-border hover:border-brand-primary text-brand-text p-2 transition-colors"
                            title="Editar categoria"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(categoria.id, categoria.nome)}
                            disabled={deletingCategoryId === categoria.id}
                            className="border border-brand-border hover:border-red-500 text-red-400 p-2 transition-colors disabled:opacity-60"
                            title="Excluir categoria"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )) : (
                  <div className="px-4 py-8 text-center text-brand-muted font-mono text-xs uppercase">
                    Nenhuma categoria cadastrada.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-brand-card border border-brand-border p-6 space-y-5">
            <div className="flex items-center space-x-2 border-b border-brand-border pb-3">
              <MapPin className="text-brand-primary" size={18} />
              <div>
                <h3 className="font-bold text-sm uppercase tracking-wider text-brand-text font-mono m-0">Localizações</h3>
                <p className="text-[11px] text-brand-muted mt-1">Cadastre os locais físicos usados pelo estoque e pelos ativos em operação.</p>
              </div>
            </div>

            <form onSubmit={handleCreateLocationInline} className="space-y-3">
              <label className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted">Nova Localização</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  placeholder="Ex.: Matriz, Filial Goiânia, Sala CPD"
                  className="flex-1 bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                />
                <button
                  type="submit"
                  disabled={creatingLocation}
                  className="bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-60 text-brand-dark font-bold font-mono px-4 py-2.5 uppercase tracking-wider text-xs flex items-center justify-center gap-2"
                >
                  {creatingLocation && <RefreshCw size={14} className="animate-spin" />}
                  <span>{creatingLocation ? 'Criando...' : 'Criar Localização'}</span>
                </button>
              </div>
            </form>

            <div className="border border-brand-border/50">
              <div className="px-4 py-3 border-b border-brand-border bg-brand-dark/20 flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-wider text-brand-text">Localizações cadastradas</span>
                <span className="font-mono text-[10px] text-brand-muted">{references?.localizacoes.length ?? 0} itens</span>
              </div>
              <div className="max-h-[420px] overflow-y-auto divide-y divide-brand-border/30">
                {references?.localizacoes.length ? references.localizacoes.map((localizacao) => (
                  <div key={localizacao.id} className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      {editingLocationId === localizacao.id ? (
                        <input
                          type="text"
                          value={editingLocationName}
                          onChange={(e) => setEditingLocationName(e.target.value)}
                          className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                        />
                      ) : (
                        <div className="text-sm text-brand-text font-medium">{localizacao.nome}</div>
                      )}
                      <div className="text-[10px] font-mono text-brand-muted mt-1">ID #{localizacao.id}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {editingLocationId === localizacao.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSaveLocation(localizacao.id)}
                            disabled={savingLocationId === localizacao.id}
                            className="border border-brand-primary text-brand-primary hover:bg-brand-primary/5 px-3 py-1.5 font-mono text-[10px] uppercase"
                          >
                            {savingLocationId === localizacao.id ? 'Salvando...' : 'Salvar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingLocationId(null);
                              setEditingLocationName('');
                            }}
                            className="border border-brand-border text-brand-muted hover:bg-brand-card px-3 py-1.5 font-mono text-[10px] uppercase"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStartEditLocation(localizacao.id, localizacao.nome)}
                            className="border border-brand-border hover:border-brand-primary text-brand-text p-2 transition-colors"
                            title="Editar localização"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLocation(localizacao.id, localizacao.nome)}
                            disabled={deletingLocationId === localizacao.id}
                            className="border border-brand-border hover:border-red-500 text-red-400 p-2 transition-colors disabled:opacity-60"
                            title="Excluir localização"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )) : (
                  <div className="px-4 py-8 text-center text-brand-muted font-mono text-xs uppercase">
                    Nenhuma localização cadastrada.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DIALOG: CREATE / UPDATE ASSET */}
      {showFormModal && (
        <div className="fixed inset-0 bg-brand-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl border border-brand-border bg-brand-card p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-brand-border pb-4">
              <h3 className="text-lg font-bold font-mono uppercase tracking-wider text-brand-text">
                {editAssetId ? 'Editar Ativo' : 'Registrar Novo Ativo'}
              </h3>
              <button onClick={() => setShowFormModal(false)} className="text-brand-muted hover:text-brand-text">
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="p-3 border border-red-500/30 bg-red-500/5 text-red-400 text-xs font-mono flex items-center space-x-2">
                <ShieldAlert size={16} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveAsset} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted mb-1.5">Nome do Ativo *</label>
                  <input
                    type="text"
                    required
                    value={assetName}
                    onChange={(e) => setAssetName(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted mb-1.5">E-Patrimônio *</label>
                  <input
                    type="text"
                    required
                    value={assetEP}
                    onChange={(e) => setAssetEP(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted mb-1.5">Modelo</label>
                  <input
                    type="text"
                    value={assetModelo}
                    onChange={(e) => setAssetModelo(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted mb-1.5">Número de Série</label>
                  <input
                    type="text"
                    value={assetSerie}
                    onChange={(e) => setAssetSerie(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted mb-1.5">Valor R$</label>
                  <input
                    type="number"
                    step="0.01"
                    value={assetValor}
                    onChange={(e) => setAssetValor(Number(e.target.value))}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted mb-1.5">Data de Aquisição</label>
                  <input
                    type="date"
                    value={assetDataAquisicao}
                    onChange={(e) => setAssetDataAquisicao(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted">Categoria</label>
                    <button type="button" onClick={() => handleCreateReference('categoria')} className="text-brand-primary hover:text-brand-primary/80" title="Criar Nova Categoria">
                      <Plus size={14} />
                    </button>
                  </div>
                  <select
                    value={assetCategoriaId}
                    onChange={(e) => setAssetCategoriaId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                  >
                    <option value="">Selecione...</option>
                    {references?.categorias.map(c => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted mb-1.5">Fornecedor</label>
                  <select
                    value={assetFornecedorId}
                    onChange={(e) => { setAssetFornecedorId(e.target.value ? Number(e.target.value) : ''); setAssetNotaFiscalId(''); }}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                  >
                    <option value="">Selecione...</option>
                    {references?.fornecedores.map(f => (
                      <option key={f.id} value={f.id}>{f.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted mb-1.5">Nota fiscal (NF-e)</label>
                  <select
                    value={assetNotaFiscalId}
                    disabled={!assetFornecedorId || loadingAssetNotasFiscais}
                    onChange={(e) => setAssetNotaFiscalId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary font-mono disabled:opacity-60"
                  >
                    <option value="">{loadingAssetNotasFiscais ? 'Carregando NF-e...' : assetFornecedorId ? 'Selecione a NF-e...' : 'Selecione o fornecedor primeiro'}</option>
                    {assetNotasFiscais.map((invoice) => <option key={invoice.id} value={invoice.id}>NF-e {invoice.numero_nota}</option>)}
                  </select>
                  {assetFornecedorId && !loadingAssetNotasFiscais && assetNotasFiscais.length === 0 && <p className="mt-1 text-[10px] text-brand-muted">Nenhuma NF-e cadastrada para este fornecedor.</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted mb-1.5">Status Atual</label>
                  <select
                    value={assetStatus}
                    onChange={(e) => setAssetStatusValue(e.target.value as AssetStatus)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                  >
                    <option value="Disponível">Disponível</option>
                    <option value="Em uso">Em Uso</option>
                    <option value="Manutenção">Manutenção</option>
                    <option value="Armazenado">Armazenado</option>
                    <option value="Baixado">Baixado</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted">Localização Física</label>
                    <button type="button" onClick={() => handleCreateReference('localizacao')} className="text-brand-primary hover:text-brand-primary/80" title="Criar Nova Localização">
                      <Plus size={14} />
                    </button>
                  </div>
                  <select
                    value={assetLocalId}
                    onChange={(e) => setAssetLocalId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                  >
                    <option value="">Selecione...</option>
                    {references?.localizacoes.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.nome}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted">Armazenamento (Rack/Escaninho)</label>
                    <button type="button" onClick={() => handleCreateReference('armazenamento')} className="text-brand-primary hover:text-brand-primary/80" title="Criar Novo Armazenamento">
                      <Plus size={14} />
                    </button>
                  </div>
                  <select
                    value={assetArmazenamentoId}
                    onChange={(e) => setAssetArmazenamentoId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                  >
                    <option value="">Selecione...</option>
                    {references?.armazenamentos.map(arm => (
                      <option key={arm.id} value={arm.id}>{arm.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted mb-1.5">Em Posse De (Pessoa / Usuário)</label>
                  <select
                    value={assetCurrentUserId}
                    onChange={(e) => {
                      const nextId = e.target.value ? Number(e.target.value) : '';
                      setAssetCurrentUserId(nextId);
                      const selected = usersList.find((u) => u.id === Number(nextId));
                      setAssetEmPosseDe(selected?.nome || '');
                    }}
                    required={assetStatus === 'Em uso'}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                  >
                    <option value="">{assetStatus === 'Em uso' ? 'Selecione o usuário...' : 'Nenhum usuário'}</option>
                    {usersList.map((u) => (
                      <option key={u.id} value={u.id}>{u.nome} ({u.role})</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-brand-muted mt-1">Ao salvar em uso, localização, setor e armazenamento serão ajustados automaticamente.</p>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted">Setor (Departamento)</label>
                    <button type="button" onClick={() => handleCreateReference('departamento')} className="text-brand-primary hover:text-brand-primary/80" title="Criar Novo Setor">
                      <Plus size={14} />
                    </button>
                  </div>
                  <select
                    value={assetDepartamentoId}
                    onChange={(e) => setAssetDepartamentoId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                  >
                    <option value="">Selecione...</option>
                    {references?.setores.map(setor => (
                      <option key={setor.id} value={setor.id}>{setor.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted mb-1.5">Descrição / Detalhes Adicionais</label>
                <textarea
                  value={assetDescricao}
                  onChange={(e) => setAssetDescricao(e.target.value)}
                  rows={3}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary font-sans"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted mb-1.5 flex items-center justify-between">
                  <span>Datasheet / Manual Técnico (.pdf, .txt, .csv)</span>
                  {assetDatasheetPath && (
                    <span className="text-emerald-400 font-normal">Anexo enviado</span>
                  )}
                </label>

                <input
                  type="file"
                  ref={datasheetFileInputRef}
                  onChange={handleDatasheetFileUpload}
                  accept=".pdf,.txt,.csv"
                  className="hidden"
                />

                {datasheetError && (
                  <div className="mb-2 p-2 border border-red-500/30 bg-red-500/5 text-red-400 text-[11px] font-mono flex items-center space-x-2">
                    <ShieldAlert size={14} />
                    <span>{datasheetError}</span>
                  </div>
                )}

                {assetDatasheetPath ? (
                  <div className="flex items-center justify-between p-2.5 bg-brand-dark border border-brand-border rounded font-mono text-xs">
                    <div className="flex items-center space-x-2 truncate pr-2">
                      <FileText size={16} className="text-brand-primary shrink-0" />
                      <span className="text-brand-text truncate font-medium">
                        {assetDatasheetNome || 'datasheet_anexo'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 shrink-0">
                      <a
                        href={toApiFileUrl(assetDatasheetPath)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 bg-brand-card hover:bg-brand-border text-brand-text text-[10px] font-mono uppercase border border-brand-border rounded transition-colors"
                      >
                        Visualizar
                      </a>
                      <button
                        type="button"
                        onClick={() => datasheetFileInputRef.current?.click()}
                        disabled={uploadingDatasheet}
                        className="px-2 py-1 border border-brand-border hover:border-brand-primary text-brand-muted hover:text-brand-text text-[10px] font-mono uppercase rounded transition-colors"
                      >
                        Substituir
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAssetDatasheetPath('');
                          setAssetDatasheetNome('');
                          setDatasheetError(null);
                        }}
                        className="p-1 text-red-400 hover:text-red-300 transition-colors"
                        title="Remover Datasheet"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => datasheetFileInputRef.current?.click()}
                    disabled={uploadingDatasheet}
                    className="w-full border-2 border-dashed border-brand-border hover:border-brand-primary/60 bg-brand-dark/40 hover:bg-brand-dark/70 p-3 text-center transition-colors flex items-center justify-center space-x-2 rounded cursor-pointer disabled:opacity-50"
                  >
                    {uploadingDatasheet ? (
                      <>
                        <RefreshCw size={16} className="animate-spin text-brand-primary" />
                        <span className="font-mono text-xs text-brand-muted">Enviando datasheet...</span>
                      </>
                    ) : (
                      <>
                        <Upload size={16} className="text-brand-muted" />
                        <span className="font-mono text-xs text-brand-muted">
                          Clique para anexar o datasheet (<strong className="text-brand-text">.pdf, .txt ou .csv</strong> — máx 25MB)
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-4 py-2 border-t border-b border-brand-border/30">
                <div className="flex items-center space-x-2 select-none cursor-pointer">
                  <input
                    id="assetBloqueado"
                    type="checkbox"
                    checked={assetBloqueado}
                    onChange={(e) => setAssetBloqueado(e.target.checked)}
                    className="rounded-none accent-brand-primary border-brand-border"
                  />
                  <label htmlFor="assetBloqueado" className="font-mono uppercase tracking-wider text-brand-text">
                    🔒 Ativo Fixo (Bloqueia alteração de local em manutenção)
                  </label>
                </div>

                <div className="flex items-center space-x-2 select-none cursor-pointer">
                  <input
                    id="assetRequerRH"
                    type="checkbox"
                    checked={assetRequerRH}
                    onChange={(e) => setAssetRequerRH(e.target.checked)}
                    className="rounded-none accent-brand-primary border-brand-border"
                  />
                  <label htmlFor="assetRequerRH" className="font-mono uppercase tracking-wider text-brand-text">
                    Requer Termo do RH
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="border border-brand-border hover:bg-brand-card px-4 py-2 font-mono text-xs uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-xs"
                >
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DIALOG: CREATE ASSET REFERENCE */}
      {referenceCreateType && (
        <div className="fixed inset-0 bg-brand-dark/85 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reference-create-title"
            className="w-full max-w-md border border-brand-border bg-brand-card p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-brand-border pb-4">
              <div>
                <h3 id="reference-create-title" className="text-base font-bold font-mono uppercase tracking-wider text-brand-text">
                  {referenceCreateType === 'categoria' && 'Nova Categoria'}
                  {referenceCreateType === 'localizacao' && 'Nova Localização'}
                  {referenceCreateType === 'armazenamento' && 'Novo Armazenamento'}
                  {referenceCreateType === 'departamento' && 'Novo Setor'}
                </h3>
                <p className="mt-1 text-[11px] text-brand-muted">
                  O novo registro será selecionado automaticamente no ativo.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseReferenceCreate}
                disabled={creatingReference}
                className="text-brand-muted hover:text-brand-text disabled:opacity-50"
                aria-label="Fechar criação de registro"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitReferenceCreate} className="space-y-5">
              <div>
                <label htmlFor="reference-create-name" className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted mb-1.5">
                  Nome *
                </label>
                <input
                  id="reference-create-name"
                  type="text"
                  autoFocus
                  required
                  value={referenceCreateName}
                  onChange={(e) => setReferenceCreateName(e.target.value)}
                  disabled={creatingReference}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary disabled:opacity-60"
                  placeholder="Digite o nome"
                />
                {referenceCreateError && (
                  <p role="alert" className="mt-2 text-xs text-red-400">{referenceCreateError}</p>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-brand-border">
                <button
                  type="button"
                  onClick={handleCloseReferenceCreate}
                  disabled={creatingReference}
                  className="border border-brand-border hover:bg-brand-dark/40 px-4 py-2 font-mono text-xs uppercase disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingReference}
                  className="bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-xs flex items-center gap-2 disabled:opacity-60"
                >
                  {creatingReference && <RefreshCw size={14} className="animate-spin" />}
                  <span>{creatingReference ? 'Criando...' : 'Criar e selecionar'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DIALOG: BULK DUPLICATE WIZARD */}
      {showDuplicateModal && duplicateTemplate && (
        <div className="fixed inset-0 bg-brand-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl border border-brand-border bg-brand-card p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b border-brand-border pb-4">
              <div>
                <h3 className="text-lg font-bold font-mono uppercase tracking-wider text-brand-text">Duplicar Ativo</h3>
                <p className="text-[10px] text-brand-muted font-mono mt-0.5">Origem: {duplicateTemplate.nome} ({duplicateTemplate.e_patrimonio})</p>
              </div>
              <button onClick={() => setShowDuplicateModal(false)} className="text-brand-muted hover:text-brand-text">
                <X size={20} />
              </button>
            </div>

            {/* STEP 1: QUANTIDADE */}
            {duplicateStep === 'count' && (
              <form onSubmit={handleSetupSpecs} className="space-y-6">
                <div className="bg-brand-dark/40 border border-brand-border p-4 space-y-3">
                  <h4 className="font-bold text-[10px] font-mono uppercase tracking-widest text-brand-primary">Dados herdados automaticamente</h4>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div><span className="text-brand-muted">Nome:</span> <span className="text-brand-text font-bold">{duplicateTemplate.nome}</span></div>
                    <div><span className="text-brand-muted">Modelo:</span> <span className="text-brand-text">{duplicateTemplate.modelo || '—'}</span></div>
                    <div><span className="text-brand-muted">Categoria:</span> <span className="text-brand-text">{duplicateTemplate.categoria?.nome || '—'}</span></div>
                    <div><span className="text-brand-muted">Fornecedor:</span> <span className="text-brand-text">{duplicateTemplate.fornecedor?.nome || '—'}</span></div>
                    {duplicateTemplate.valor && (
                      <div><span className="text-brand-muted">Valor:</span> <span className="text-brand-text font-mono font-bold">R$ {duplicateTemplate.valor.toFixed(2)}</span></div>
                    )}
                    <div><span className="text-brand-muted">Original Local:</span> <span className="text-brand-text">{getAssetLocationLabel(duplicateTemplate)}</span></div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="font-mono text-xs font-bold text-brand-text uppercase tracking-widest block">Quantas cópias deseja gerar?</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={duplicateCount}
                    onChange={(e) => setDuplicateCount(Math.min(50, Math.max(1, Number(e.target.value))))}
                    className="w-full bg-brand-dark border border-brand-border p-3 text-lg font-bold font-mono text-center text-brand-text focus:outline-none focus:border-brand-primary"
                  />
                  <p className="font-mono text-[9px] text-brand-muted">Limite operacional: 50 cópias por lote.</p>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-brand-border">
                  <button
                    type="button"
                    onClick={() => setShowDuplicateModal(false)}
                    className="border border-brand-border hover:bg-brand-card px-4 py-2 font-mono text-xs uppercase"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-xs"
                  >
                    Prosseguir
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: CONFIGURE COPIES (E-Patrimonio, Serial, Locations) */}
            {duplicateStep === 'specs' && (
              <div className="space-y-4">
                <div className="p-3 border border-brand-primary/30 bg-brand-primary/5 text-brand-primary text-xs font-mono">
                  Defina os identificadores individuais de cada cópia.
                </div>

                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
                  {duplicateSpecs.map((spec, i) => (
                    <div key={i} className="border border-brand-border bg-brand-dark/20 p-4 space-y-3">
                      <div className="flex items-center space-x-2 font-mono text-xs font-semibold text-brand-text">
                        <span className="w-5 h-5 bg-brand-primary text-brand-dark flex items-center justify-center font-bold text-[10px]">
                          {i + 1}
                        </span>
                        <span>Cópia #{i + 1}</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted mb-1">E-Patrimônio *</label>
                          <input
                            type="text"
                            required
                            value={spec.e_patrimonio}
                            onChange={(e) => handleSpecChange(i, 'e_patrimonio', e.target.value)}
                            className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted mb-1">Número de Série (Opcional)</label>
                          <input
                            type="text"
                            value={spec.numero_serie || ''}
                            onChange={(e) => handleSpecChange(i, 'numero_serie', e.target.value || null)}
                            placeholder="S/N"
                            className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted mb-1">Localização</label>
                          <select
                            value={spec.current_local_id || ''}
                            onChange={(e) => handleSpecChange(i, 'current_local_id', e.target.value ? Number(e.target.value) : null)}
                            className="w-full bg-brand-dark border border-brand-border px-2 py-1.5 text-xs text-brand-text focus:outline-none font-mono"
                          >
                            <option value="">— Herdado do original —</option>
                            {references?.localizacoes.map(loc => (
                              <option key={loc.id} value={loc.id}>{loc.nome}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono uppercase tracking-wider text-brand-muted mb-1">Armazenamento</label>
                          <select
                            value={spec.current_armazenamento_id || ''}
                            onChange={(e) => handleSpecChange(i, 'current_armazenamento_id', e.target.value ? Number(e.target.value) : null)}
                            className="w-full bg-brand-dark border border-brand-border px-2 py-1.5 text-xs text-brand-text focus:outline-none font-mono"
                          >
                            <option value="">— Herdado do original —</option>
                            {references?.armazenamentos.map(arm => (
                              <option key={arm.id} value={arm.id}>{arm.nome}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-brand-border">
                  <button
                    onClick={() => setDuplicateStep('count')}
                    className="border border-brand-border hover:bg-brand-card text-brand-muted px-4 py-2 font-mono text-xs uppercase"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={handleExecuteDuplication}
                    className="bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-xs"
                  >
                    Confirmar Duplicação
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: RESULTS (Success / Partial Success Report) */}
            {duplicateStep === 'results' && (
              <div className="space-y-4">
                <div className="border border-brand-border bg-brand-dark/30 p-4 space-y-2">
                  <h4 className="font-bold text-sm uppercase tracking-wider text-brand-text font-mono">Relatório de Duplicação</h4>
                  <p className="text-xs text-brand-muted">
                    Executado: <span className="text-brand-primary font-bold">{duplicateSuccessCount}</span> criados com sucesso / <span className="text-red-400 font-bold">{duplicateFailedCount}</span> falhas.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-brand-border/60 font-mono uppercase text-brand-muted text-[10px]">
                        <th className="py-2 px-3">E-Patrimônio</th>
                        <th className="py-2 px-3">Resultado</th>
                        <th className="py-2 px-3">Detalhes / Erro</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border/30">
                      {duplicateResults.map((res, idx) => (
                        <tr key={idx} className="hover:bg-brand-dark/10">
                          <td className="py-2 px-3 font-mono font-bold text-brand-text">{res.e_patrimonio}</td>
                          <td className="py-2 px-3">
                            {res.success ? (
                              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 border border-green-500/30 bg-green-500/5 text-green-400">Criado</span>
                            ) : (
                              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 border border-red-500/30 bg-red-500/5 text-red-400">Falhou</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-brand-muted font-mono">{res.error || 'Sucesso'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end pt-4 border-t border-brand-border">
                  <button
                    onClick={() => setShowDuplicateModal(false)}
                    className="bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-xs"
                  >
                    Fechar Relatório
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DIALOG: REAL-TIME QR SCANNER MODAL */}
      {showScannerModal && (
        <div className="fixed inset-0 bg-brand-dark/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg border border-brand-border bg-brand-card shadow-2xl p-5 sm:p-6 space-y-5 rounded-2xl animate-fade-in max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-brand-border pb-3">
              <h3 className="text-base sm:text-lg font-bold font-mono uppercase tracking-wider text-brand-text flex items-center space-x-2">
                <QrCode size={20} className="text-brand-primary" />
                <span>Scanner QR do Ativo</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  stopScannerCamera();
                  setShowScannerModal(false);
                }}
                className="text-brand-muted hover:text-brand-text p-1 cursor-pointer transition-colors"
                title="Fechar scanner"
              >
                <X size={20} />
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-brand-dark/10 rounded-xl border border-brand-border">
              <button
                type="button"
                onClick={() => setScannerMode('camera')}
                className={`py-2 px-2 text-xs font-mono font-semibold rounded-lg flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                  scannerMode === 'camera'
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'text-brand-text hover:bg-white/60'
                }`}
              >
                <Camera size={14} />
                <span>Câmera</span>
              </button>
              <button
                type="button"
                onClick={() => setScannerMode('upload')}
                className={`py-2 px-2 text-xs font-mono font-semibold rounded-lg flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                  scannerMode === 'upload'
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'text-brand-text hover:bg-white/60'
                }`}
              >
                <Upload size={14} />
                <span>Imagem</span>
              </button>
              <button
                type="button"
                onClick={() => setScannerMode('manual')}
                className={`py-2 px-2 text-xs font-mono font-semibold rounded-lg flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                  scannerMode === 'manual'
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'text-brand-text hover:bg-white/60'
                }`}
              >
                <Search size={14} />
                <span>Digitar</span>
              </button>
            </div>

            {/* Mode 1: Live Camera */}
            {scannerMode === 'camera' && (
              <div className="space-y-3">
                <p className="text-xs text-brand-muted text-center">
                  Aponte a câmera do celular para a etiqueta patrimonial com QR Code do ativo.
                </p>
                <div className="relative w-full aspect-square max-w-[280px] mx-auto bg-black rounded-2xl overflow-hidden border-2 border-brand-primary/50 shadow-inner flex items-center justify-center">
                  <div id={scannerRegionId} className="w-full h-full" />
                  {scanningAssetLoading && (
                    <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center space-y-2 z-20">
                      <RefreshCw className="animate-spin text-brand-primary" size={28} />
                      <span className="text-xs font-mono text-white uppercase tracking-wider">Identificando Ativo...</span>
                    </div>
                  )}
                </div>
                {!scannerCameraActive && (
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={startScannerCamera}
                      className="px-4 py-2 bg-brand-primary text-white text-xs font-mono uppercase rounded-xl shadow-sm cursor-pointer"
                    >
                      Iniciar Câmera
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Mode 2: Upload File */}
            {scannerMode === 'upload' && (
              <div className="space-y-3">
                <p className="text-xs text-brand-muted text-center">
                  Selecione uma foto do QR Code da galeria do seu dispositivo.
                </p>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-brand-border hover:border-brand-primary/50 bg-brand-dark/10 p-8 text-center cursor-pointer space-y-3 transition-colors rounded-2xl"
                >
                  <Upload className="mx-auto text-brand-primary" size={36} />
                  <div>
                    <span className="text-xs font-mono text-brand-text uppercase block font-semibold">Selecionar Foto do QR Code</span>
                    <span className="text-[11px] text-brand-muted block mt-1">Formatos PNG, JPG ou WEBP</span>
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleScanFile} 
                    accept="image/*" 
                    className="hidden" 
                  />
                </div>
              </div>
            )}

            {/* Mode 3: Manual Input */}
            {scannerMode === 'manual' && (
              <div className="space-y-3">
                <p className="text-xs text-brand-muted">
                  Digite o código patrimonial (E-Patrimônio) ou número do ativo para abrir sua página:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={scannerManualInput}
                    onChange={(e) => setScannerManualInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleProcessScannedText(scannerManualInput);
                      }
                    }}
                    placeholder="Ex: NBA-001, EP-00123"
                    className="flex-1 bg-white border border-brand-border px-3.5 py-2.5 rounded-xl text-sm font-mono text-brand-text focus:outline-none focus:border-brand-primary"
                  />
                  <button
                    type="button"
                    onClick={() => handleProcessScannedText(scannerManualInput)}
                    disabled={!scannerManualInput.trim() || scanningAssetLoading}
                    className="px-4 py-2.5 bg-brand-primary hover:bg-brand-primary/90 text-white font-bold font-mono text-xs uppercase rounded-xl disabled:opacity-50 transition-all cursor-pointer flex items-center space-x-1.5 shadow-sm"
                  >
                    {scanningAssetLoading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                    <span>Buscar</span>
                  </button>
                </div>
              </div>
            )}

            {/* Error block */}
            {scannerError && (
              <div className="p-3.5 border border-red-500/30 bg-red-500/10 text-red-500 text-xs font-mono rounded-xl flex items-center space-x-2">
                <ShieldAlert size={18} className="shrink-0" />
                <span>{scannerError}</span>
              </div>
            )}

            {/* Scanned Result preview if modal stays open */}
            {scannedAsset && (
              <div className="border border-brand-primary/40 bg-brand-primary/10 p-4 rounded-xl space-y-3">
                <div className="flex items-center space-x-2 text-brand-primary">
                  <Check size={16} />
                  <span className="font-mono text-xs font-bold uppercase tracking-wider">Ativo Identificado com Sucesso!</span>
                </div>
                
                <div className="text-xs space-y-1 bg-white/70 p-3 rounded-lg border border-brand-border">
                  <div className="font-bold text-brand-text text-sm">{scannedAsset.nome}</div>
                  <div className="font-mono text-brand-primary font-bold text-xs">Patrimônio: #{scannedAsset.e_patrimonio}</div>
                  <div className="text-brand-muted">Localização: {getAssetLocationLabel(scannedAsset)}</div>
                  <div className="text-brand-muted">Status: {scannedAsset.status}</div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    stopScannerCamera();
                    setShowScannerModal(false);
                    setSearchEP(scannedAsset.e_patrimonio);
                    setActiveTab('table');
                    setSelectedAssetForDetail(scannedAsset);
                    setShowDetailModal(true);
                  }}
                  className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white font-bold font-mono py-2.5 rounded-xl uppercase tracking-wider text-xs flex items-center justify-center space-x-2 shadow-md shadow-brand-primary/20 cursor-pointer"
                >
                  <Eye size={16} />
                  <span>Carregar Página do Ativo</span>
                </button>
              </div>
            )}

            {/* Footer */}
            <div className="flex justify-end pt-3 border-t border-brand-border">
              <button
                type="button"
                onClick={() => {
                  stopScannerCamera();
                  setShowScannerModal(false);
                }}
                className="border border-brand-border hover:bg-white text-brand-text px-4 py-2 font-mono text-xs uppercase rounded-xl transition-all cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIALOG: CSV IMPORT */}
      {showImportModal && (
        <div className="fixed inset-0 bg-brand-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl border border-brand-border bg-brand-card p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-brand-border pb-4">
              <div>
                <h3 className="text-lg font-bold font-mono uppercase tracking-wider text-brand-text">Importar Ativos por CSV</h3>
                <p className="text-[11px] text-brand-muted mt-1">
                  Use o mesmo padrão do arquivo exportado pelo inventário. O sistema cria novos ativos e atualiza os já existentes pelo E-Patrimônio.
                </p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-brand-muted hover:text-brand-text">
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_.9fr] gap-6">
              <div className="space-y-4">
                <div
                  onClick={() => importInputRef.current?.click()}
                  className="border-2 border-dashed border-brand-border hover:border-brand-primary/50 bg-brand-dark/20 p-8 text-center cursor-pointer space-y-3 transition-colors"
                >
                  <Upload className="mx-auto text-brand-muted hover:text-brand-primary transition-colors" size={34} />
                  <div>
                    <span className="text-xs font-mono text-brand-text uppercase block font-semibold">Selecionar arquivo CSV</span>
                    <span className="text-[10px] text-brand-muted block mt-1">Separador `;` e colunas do inventário exportado</span>
                  </div>
                  <input
                    type="file"
                    ref={importInputRef}
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setSelectedImportFile(file);
                      setImportSummary(null);
                      setImportError(null);
                    }}
                  />
                </div>

                <div className="border border-brand-border/50 bg-brand-dark/20 p-4 text-xs space-y-2">
                  <div className="font-mono uppercase tracking-wider text-brand-primary">Como funciona</div>
                  <div className="text-brand-muted">Se o E-Patrimônio já existir, o ativo é atualizado.</div>
                  <div className="text-brand-muted">Se não existir, um novo ativo é criado.</div>
                  <div className="text-brand-muted">Categoria, localização, armazenamento, fornecedor e setor precisam já existir no sistema quando vierem preenchidos no CSV.</div>
                </div>

                <button
                  type="button"
                  onClick={() => assetsApi.downloadImportTemplate()}
                  className="border border-brand-border hover:bg-brand-card text-brand-text font-bold font-mono px-4 py-2.5 uppercase tracking-wider text-xs flex items-center justify-center space-x-2 transition-colors w-full"
                >
                  <FileText size={14} />
                  <span>Baixar Modelo CSV</span>
                </button>

                {selectedImportFile && (
                  <div className="border border-brand-primary/30 bg-brand-primary/5 p-3 text-xs">
                    <div className="font-semibold text-brand-text">{selectedImportFile.name}</div>
                    <div className="text-brand-muted mt-1">{Math.max(1, Math.round(selectedImportFile.size / 1024))} KB</div>
                  </div>
                )}

                {importError && (
                  <div className="p-3 border border-red-500/30 bg-red-500/5 text-red-400 text-xs font-mono flex items-center space-x-2">
                    <ShieldAlert size={16} />
                    <span>{importError}</span>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="border border-brand-border/50 bg-brand-dark/20 p-4 space-y-3">
                  <div className="font-mono uppercase tracking-wider text-brand-text text-xs">Colunas aceitas</div>
                  <div className="text-[11px] text-brand-muted leading-5">
                    E-Patrimônio, Nome, Modelo, Número de Série, Status, Categoria, Localização, Armazenamento, Fornecedor, Data de Aquisição, Valor, Ativo Fixo, Em Posse De, Setor e Requer Termo RH.
                  </div>
                </div>

                {importSummary && (
                  <div className="border border-brand-border bg-brand-dark/20 p-4 space-y-4">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="border border-brand-border/50 p-3">
                        <div className="text-xl font-black font-mono text-brand-text">{importSummary.criados}</div>
                        <div className="text-[10px] uppercase font-mono text-brand-muted">Criados</div>
                      </div>
                      <div className="border border-brand-border/50 p-3">
                        <div className="text-xl font-black font-mono text-brand-text">{importSummary.atualizados}</div>
                        <div className="text-[10px] uppercase font-mono text-brand-muted">Atualizados</div>
                      </div>
                      <div className="border border-brand-border/50 p-3">
                        <div className="text-xl font-black font-mono text-red-400">{importSummary.falhas}</div>
                        <div className="text-[10px] uppercase font-mono text-brand-muted">Falhas</div>
                      </div>
                    </div>

                    <div className="max-h-64 overflow-y-auto border border-brand-border/50">
                      <table className="w-full text-left text-[11px]">
                        <thead className="border-b border-brand-border/50 font-mono uppercase text-[10px] text-brand-muted">
                          <tr>
                            <th className="px-3 py-2">Linha</th>
                            <th className="px-3 py-2">Ativo</th>
                            <th className="px-3 py-2">Resultado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-border/30">
                          {importSummary.resultados.map((item) => (
                            <tr key={`${item.linha}-${item.e_patrimonio}`}>
                              <td className="px-3 py-2 font-mono text-brand-muted">{item.linha}</td>
                              <td className="px-3 py-2">
                                <div className="text-brand-text">{item.nome || 'Sem nome'}</div>
                                <div className="text-brand-muted font-mono text-[10px]">{item.e_patrimonio || 'Sem patrimônio'}</div>
                              </td>
                              <td className="px-3 py-2">
                                {item.erro ? (
                                  <span className="text-red-400">{item.erro}</span>
                                ) : (
                                  <span className="text-brand-primary font-mono uppercase text-[10px]">{item.acao}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-brand-border">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="border border-brand-border hover:bg-brand-card px-4 py-2 font-mono text-xs uppercase"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={handleImportCsv}
                disabled={importingCsv}
                className="bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-60 text-brand-dark font-bold font-mono px-4 py-2 uppercase tracking-wider text-xs flex items-center gap-2"
              >
                {importingCsv && <RefreshCw size={14} className="animate-spin" />}
                <span>{importingCsv ? 'Importando...' : 'Importar Agora'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL & HISTORY MODAL */}
      {showDetailModal && selectedAssetForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-brand-dark/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-5xl bg-brand-card border border-brand-border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] rounded-md">
            {/* Header */}
            <div className="flex justify-between items-center px-4 sm:px-6 py-3.5 border-b border-brand-border bg-brand-dark/60">
              <div className="flex items-center space-x-3 min-w-0">
                <span className="text-[11px] font-mono font-bold text-brand-primary uppercase tracking-widest bg-brand-primary/10 px-2.5 py-1 border border-brand-primary/20 shrink-0">
                  {selectedAssetForDetail.e_patrimonio}
                </span>
                <h3 className="text-base sm:text-lg font-bold font-mono uppercase tracking-wider text-brand-text truncate">
                  {selectedAssetForDetail.nome}
                </h3>
              </div>
              <button 
                onClick={() => setShowDetailModal(false)} 
                className="text-brand-muted hover:text-brand-text transition-colors p-1.5 rounded hover:bg-brand-dark"
                title="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            {/* Subheader / Tabs Navigation */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 border-b border-brand-border bg-brand-dark/70 px-1 gap-2 py-1.5 items-stretch min-h-[56px]">
              <button
                type="button"
                onClick={() => setDetailActiveTab('info')}
                className={`w-full px-3 py-2.5 rounded-md font-mono text-xs font-medium uppercase tracking-wider transition-all flex items-center justify-center gap-2 text-center whitespace-normal border min-h-[40px] ${
                  detailActiveTab === 'info'
                    ? 'border-brand-primary text-[#8f8f8f] bg-brand-primary/15 shadow-sm ring-1 ring-brand-primary/30'
                    : 'border-transparent text-[#919191] hover:text-[#171717] hover:bg-brand-dark/50'
                }`}
              >
                <FileText size={15} className="shrink-0" />
                <span>Ficha Técnica</span>
              </button>

              <button
                type="button"
                onClick={() => setDetailActiveTab('movimentacoes')}
                className={`w-full px-3 py-2.5 rounded-md font-mono text-xs font-medium uppercase tracking-wider transition-all flex items-center justify-center gap-2 text-center whitespace-normal border min-h-[40px] ${
                  detailActiveTab === 'movimentacoes'
                    ? 'border-brand-primary text-[#8f8f8f] bg-brand-primary/15 shadow-sm ring-1 ring-brand-primary/30'
                    : 'border-transparent text-[#919191] hover:text-[#171717] hover:bg-brand-dark/50'
                }`}
              >
                <ArrowRightLeft size={15} className="shrink-0" />
                <span>Movimentações & Empréstimos</span>
                {assetHistory && (
                  <span className="bg-brand-dark/90 px-2 py-0.5 rounded-full text-[11px] font-bold text-brand-primary border border-brand-primary/40 ml-1">
                    {(assetHistory.movimentacoes?.length || 0) + (assetHistory.solicitacoes_emprestimo?.length || 0)}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setDetailActiveTab('manutencoes')}
                className={`w-full px-3 py-2.5 rounded-md font-mono text-xs font-medium uppercase tracking-wider transition-all flex items-center justify-center gap-2 text-center whitespace-normal border min-h-[40px] ${
                  detailActiveTab === 'manutencoes'
                    ? 'border-brand-primary text-[#8f8f8f] bg-brand-primary/15 shadow-sm ring-1 ring-brand-primary/30'
                    : 'border-transparent text-[#919191] hover:text-[#171717] hover:bg-brand-dark/50'
                }`}
              >
                <Wrench size={15} className="shrink-0" />
                <span>Manutenções</span>
                {assetHistory && (
                  <span className="bg-brand-dark/90 px-2 py-0.5 rounded-full text-[11px] font-bold text-brand-primary border border-brand-primary/40 ml-1">
                    {(assetHistory.manutencoes?.length || 0) + (assetHistory.solicitacoes_manutencao?.length || 0)}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setDetailActiveTab('preventivas')}
                className={`w-full px-3 py-2.5 rounded-md font-mono text-xs font-medium uppercase tracking-wider transition-all flex items-center justify-center gap-2 text-center whitespace-normal border min-h-[40px] ${
                  detailActiveTab === 'preventivas'
                    ? 'border-brand-primary text-[#8f8f8f] bg-brand-primary/15 shadow-sm ring-1 ring-brand-primary/30'
                    : 'border-transparent text-[#919191] hover:text-[#171717] hover:bg-brand-dark/50'
                }`}
              >
                <CalendarDays size={15} className="shrink-0" />
                <span>Preventivas & Planos</span>
                {assetHistory && (
                  <span className="bg-brand-dark/90 px-2 py-0.5 rounded-full text-[11px] font-bold text-brand-primary border border-brand-primary/40 ml-1">
                    {(assetHistory.manutencoes_preventivas?.length || 0) + (assetHistory.planos_preventivos?.length || 0)}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setDetailActiveTab('compras')}
                className={`w-full px-3 py-2.5 rounded-md font-mono text-xs font-medium uppercase tracking-wider transition-all flex items-center justify-center gap-2 text-center whitespace-normal border min-h-[40px] ${
                  detailActiveTab === 'compras'
                    ? 'border-brand-primary text-[#8f8f8f] bg-brand-primary/15 shadow-sm ring-1 ring-brand-primary/30'
                    : 'border-transparent text-[#919191] hover:text-[#171717] hover:bg-brand-dark/50'
                }`}
              >
                <ShoppingCart size={15} className="shrink-0" />
                <span>Peças & Compras</span>
                {assetHistory && (
                  <span className="bg-brand-dark/90 px-2 py-0.5 rounded-full text-[11px] font-bold text-brand-primary border border-brand-primary/40 ml-1">
                    {assetHistory.solicitacoes_compra?.length || 0}
                  </span>
                )}
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {loadingHistory && detailActiveTab !== 'info' && (
                <div className="py-12 flex flex-col items-center justify-center space-y-3 text-brand-muted">
                  <RefreshCw size={28} className="animate-spin text-brand-primary" />
                  <span className="font-mono text-xs uppercase tracking-wider">Carregando histórico do ativo...</span>
                </div>
              )}

              {/* TAB 1: FICHA TÉCNICA E AÇÕES */}
              {detailActiveTab === 'info' && (
                <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.7fr] gap-6">
                  {/* Left Column: Registration Data */}
                  <div className="space-y-5">
                    <div className="flex flex-wrap gap-2">
                      <span className={`text-[10px] font-mono uppercase px-2.5 py-1 border ${
                        selectedAssetForDetail.status === 'Manutenção' 
                          ? 'border-amber-500/30 bg-amber-500/5 text-amber-400' 
                          : selectedAssetForDetail.status === 'Disponível'
                          ? 'border-green-500/30 bg-green-500/5 text-green-400'
                          : 'border-brand-border bg-brand-dark/30 text-brand-text'
                      }`}>
                        Status: {selectedAssetForDetail.status}
                      </span>
                      
                      {selectedAssetForDetail.bloqueado && (
                        <span className="text-[10px] font-mono uppercase px-2.5 py-1 border border-purple-500/30 bg-purple-500/5 text-purple-400 flex items-center space-x-1">
                          <Lock size={12} />
                          <span>Ativo Fixo (Bloqueado)</span>
                        </span>
                      )}

                      {selectedAssetForDetail.requer_termo_rh && (
                        <span className="text-[10px] font-mono uppercase px-2.5 py-1 border border-blue-500/30 bg-blue-500/5 text-blue-400 flex items-center space-x-1">
                          <FileCheck size={12} />
                          <span>Requer Termo RH</span>
                        </span>
                      )}
                    </div>

                    <div className="border border-brand-border bg-brand-dark/10 p-4 space-y-3 rounded-sm">
                      <h4 className="font-mono text-xs font-bold text-brand-primary uppercase tracking-widest border-b border-brand-border pb-1.5 flex items-center space-x-1.5">
                        <FileText size={13} />
                        <span>Informações Gerais</span>
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-xs">
                        <div>
                          <span className="text-[10px] font-mono uppercase text-brand-muted block">Modelo</span>
                          <span className="text-brand-text font-semibold">{selectedAssetForDetail.modelo || '—'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-mono uppercase text-brand-muted block">Número de Série (S/N)</span>
                          <span className="text-brand-text font-mono">{selectedAssetForDetail.numero_serie || '—'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-mono uppercase text-brand-muted block">Categoria</span>
                          <span className="text-brand-text">{selectedAssetForDetail.categoria?.nome || 'Sem categoria'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-mono uppercase text-brand-muted block">Cadastrado por</span>
                          <span className="text-brand-text">{selectedAssetForDetail.created_by?.nome || '—'}</span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-[10px] font-mono uppercase text-brand-muted block">Descrição</span>
                          <p className="text-brand-text bg-brand-dark/40 p-2.5 border border-brand-border/40 font-mono mt-1 text-[11px] whitespace-pre-wrap">
                            {selectedAssetForDetail.descricao || 'Nenhuma descrição fornecida.'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="border border-brand-border bg-brand-dark/10 p-4 space-y-3 rounded-sm">
                      <h4 className="font-mono text-xs font-bold text-brand-primary uppercase tracking-widest border-b border-brand-border pb-1.5 flex items-center space-x-1.5">
                        <MapPin size={13} />
                        <span>Localização & Posse</span>
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-xs">
                        <div>
                          <span className="text-[10px] font-mono uppercase text-brand-muted block">Localização</span>
                          <span className="text-brand-text font-semibold">{getAssetLocationLabel(selectedAssetForDetail)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-mono uppercase text-brand-muted block">Armazenamento</span>
                          <span className="text-brand-text">{getAssetStorageLabel(selectedAssetForDetail) || '—'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-mono uppercase text-brand-muted block">Em Posse De</span>
                          <span className="text-brand-text font-semibold">
                            {selectedAssetForDetail.status === 'Disponível'
                              ? 'Ninguém (Disponível)'
                              : (selectedAssetForDetail.current_user?.nome || selectedAssetForDetail.em_posse_de || 'Ninguém (Disponível)')}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-mono uppercase text-brand-muted block">Setor / Departamento</span>
                          <span className="text-brand-text">{selectedAssetForDetail.current_departamento?.nome || '—'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="border border-brand-border bg-brand-dark/10 p-4 space-y-3 rounded-sm">
                      <h4 className="font-mono text-xs font-bold text-brand-primary uppercase tracking-widest border-b border-brand-border pb-1.5 flex items-center space-x-1.5">
                        <DollarSign size={13} />
                        <span>Dados Fiscais & Aquisição</span>
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-xs">
                        <div>
                          <span className="text-[10px] font-mono uppercase text-brand-muted block">Valor de Aquisição</span>
                          <span className="text-brand-text font-mono font-semibold">
                            {selectedAssetForDetail.valor 
                              ? selectedAssetForDetail.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) 
                              : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-mono uppercase text-brand-muted block">Data de Aquisição</span>
                          <span className="text-brand-text font-mono">
                            {selectedAssetForDetail.data_aquisicao 
                              ? new Date(selectedAssetForDetail.data_aquisicao).toLocaleDateString('pt-BR') 
                              : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-mono uppercase text-brand-muted block">Fornecedor</span>
                          <span className="text-brand-text">{selectedAssetForDetail.fornecedor?.nome || '—'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-mono uppercase text-brand-muted block">Nota Fiscal</span>
                          <span className="text-brand-text font-mono">{selectedAssetForDetail.nota_fiscal?.numero_nota || '—'}</span>
                        </div>
                      </div>
                    </div>

                    {selectedAssetForDetail.datasheet_path && (
                      <div className="border border-brand-border bg-brand-dark/10 p-4 space-y-2 rounded-sm">
                        <h4 className="font-mono text-xs font-bold text-brand-primary uppercase tracking-widest flex items-center space-x-1.5">
                          <FileText size={13} />
                          <span>Datasheet / Manual Técnico</span>
                        </h4>
                        <div className="flex items-center justify-between bg-brand-dark p-2.5 border border-brand-border rounded font-mono text-xs">
                          <div className="flex items-center space-x-2 truncate pr-2">
                            <FileText size={15} className="text-brand-primary shrink-0" />
                            <span className="text-brand-text truncate font-medium">
                              {selectedAssetForDetail.datasheet_nome || 'datasheet_anexo'}
                            </span>
                          </div>
                          <a
                            href={toApiFileUrl(selectedAssetForDetail.datasheet_path)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 bg-brand-primary text-brand-dark font-bold hover:bg-brand-primary/90 text-[10px] uppercase rounded transition-colors shrink-0 flex items-center space-x-1"
                          >
                            <Download size={12} />
                            <span>Abrir Datasheet</span>
                          </a>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: QR Code & Actions */}
                  <div className="space-y-5 flex flex-col">
                    <div className="border border-brand-border bg-brand-dark/20 p-4 flex flex-col items-center justify-center text-center space-y-3 rounded-sm">
                      <div className="font-mono text-xs font-bold text-brand-primary uppercase tracking-wider flex items-center space-x-1.5">
                        <QrCode size={14} />
                        <span>QR Code Patrimonial</span>
                      </div>
                      <div className="bg-white p-2.5 border border-brand-border/60 rounded">
                        <img 
                          src={assetsApi.getQRCodeUrl(selectedAssetForDetail.id)} 
                          alt={`QR Code para ${selectedAssetForDetail.nome}`}
                          className="w-36 h-36 object-contain"
                        />
                      </div>
                      <button
                        onClick={() => assetsApi.downloadQRCode(selectedAssetForDetail.id, selectedAssetForDetail.e_patrimonio)}
                        className="flex items-center justify-center space-x-2 w-full py-2 bg-brand-dark hover:bg-brand-card border border-brand-border text-brand-text font-bold font-mono text-xs uppercase tracking-wider transition-colors"
                      >
                        <Download size={14} />
                        <span>Download QR Code</span>
                      </button>
                    </div>

                    <div className="border border-brand-border bg-brand-dark/20 p-4 space-y-3 flex-1 rounded-sm">
                      <div className="font-mono text-xs font-bold text-brand-primary uppercase tracking-wider">
                        Ações de Inventário
                      </div>

                      {!showDetailMaintenanceForm && !showDetailTransferForm && !showDetailDevolucaoForm && (
                        <div className="space-y-2.5">
                          {isManagerOrAbove && (
                            <button
                              onClick={() => {
                                handleOpenEdit(selectedAssetForDetail);
                                setShowDetailModal(false);
                              }}
                              className="flex items-center justify-center space-x-2 w-full py-2.5 bg-brand-dark border border-brand-primary/40 text-brand-primary font-bold font-mono text-xs uppercase tracking-wider hover:bg-brand-primary/10 transition-all"
                            >
                              <Edit2 size={14} />
                              <span>Editar Ativo</span>
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setShowDetailMaintenanceForm(true);
                              setShowDetailTransferForm(false);
                              setShowDetailDevolucaoForm(false);
                              setDetailMaintenanceDescription('');
                              setDetailMaintenanceError(null);
                            }}
                            className="flex items-center justify-center space-x-2 w-full py-2.5 bg-brand-primary text-brand-dark font-bold font-mono text-xs uppercase tracking-wider hover:bg-brand-primary/95 transition-all shadow-sm"
                          >
                            <Wrench size={14} />
                            <span>Solicitar Manutenção</span>
                          </button>

                          <button
                            onClick={() => {
                              setShowDetailTransferForm(true);
                              setShowDetailMaintenanceForm(false);
                              setShowDetailDevolucaoForm(false);
                              setDetailTransferUserId('');
                              setDetailTransferMotivo('');
                              setDetailTransferDataPrevista('');
                              setDetailTransferError(null);
                            }}
                            className="flex items-center justify-center space-x-2 w-full py-2.5 bg-brand-dark border border-brand-border text-brand-text font-bold font-mono text-xs uppercase tracking-wider hover:bg-brand-card transition-all"
                          >
                            <ArrowRightLeft size={14} />
                            <span>Transferir Ativo</span>
                          </button>

                          {(selectedAssetForDetail.status === 'Em uso' || selectedAssetForDetail.current_user_id || selectedAssetForDetail.em_posse_de) && (
                            <button
                              onClick={() => {
                                setShowDetailDevolucaoForm(true);
                                setShowDetailMaintenanceForm(false);
                                setShowDetailTransferForm(false);
                                setDetailDevolucaoCondicao('Íntegro e funcional');
                                setDetailDevolucaoAcessorios('Fonte e Carregador');
                                setDetailDevolucaoNotas('');
                                setDetailDevolucaoError(null);
                              }}
                              className="flex items-center justify-center space-x-2 w-full py-2.5 bg-amber-500/10 border border-amber-500/40 text-amber-400 font-bold font-mono text-xs uppercase tracking-wider hover:bg-amber-500/20 transition-all"
                            >
                              <RotateCcw size={14} />
                              <span>Forçar Devolução</span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Request Maintenance Form */}
                      {showDetailMaintenanceForm && (
                        <form onSubmit={handleRequestMaintenanceFromDetail} className="space-y-3 pt-1">
                          <div className="font-semibold text-xs text-brand-text flex items-center space-x-2 border-b border-brand-border/60 pb-1.5">
                            <Wrench size={14} className="text-brand-primary" />
                            <span>Solicitação de Manutenção</span>
                          </div>
                          
                          {detailMaintenanceError && (
                            <div className="p-2 border border-red-500/20 bg-red-500/5 text-red-400 text-[11px] font-mono">
                              {detailMaintenanceError}
                            </div>
                          )}

                          <div className="space-y-1">
                            <label className="text-[10px] font-mono uppercase text-brand-muted block">
                              Motivo / Descrição do Problema
                            </label>
                            <textarea
                              required
                              rows={3}
                              value={detailMaintenanceDescription}
                              onChange={(e) => setDetailMaintenanceDescription(e.target.value)}
                              placeholder="Descreva detalhadamente o defeito..."
                              className="w-full bg-brand-dark border border-brand-border px-2.5 py-1.5 text-xs text-brand-text focus:outline-none focus:border-brand-primary placeholder-brand-muted/40"
                            />
                          </div>

                          <div className="flex space-x-2">
                            <button
                              type="button"
                              onClick={() => setShowDetailMaintenanceForm(false)}
                              className="w-1/3 py-1.5 bg-brand-dark border border-brand-border text-brand-muted text-xs font-semibold font-mono uppercase"
                            >
                              Voltar
                            </button>
                            <button
                              type="submit"
                              disabled={detailMaintenanceLoading || !detailMaintenanceDescription.trim()}
                              className="flex-1 py-1.5 bg-brand-primary text-brand-dark text-xs font-semibold font-mono uppercase flex items-center justify-center space-x-1.5 disabled:opacity-50"
                            >
                              {detailMaintenanceLoading && <RefreshCw size={12} className="animate-spin" />}
                              <span>Confirmar</span>
                            </button>
                          </div>
                        </form>
                      )}

                      {/* Transfer Asset Form */}
                      {showDetailTransferForm && (
                        <form onSubmit={handleTransferAssetFromDetail} className="space-y-3 pt-1">
                          <div className="font-semibold text-xs text-brand-text flex items-center space-x-2 border-b border-brand-border/60 pb-1.5">
                            <ArrowRightLeft size={14} className="text-brand-primary" />
                            <span>Transferir Equipamento</span>
                          </div>

                          {detailTransferError && (
                            <div className="p-2 border border-red-500/20 bg-red-500/5 text-red-400 text-[11px] font-mono">
                              {detailTransferError}
                            </div>
                          )}

                          <div className="space-y-1">
                            <label className="text-[10px] font-mono uppercase text-brand-muted block">Destinatário *</label>
                            <select
                              required
                              value={detailTransferUserId}
                              onChange={(e) => setDetailTransferUserId(e.target.value ? Number(e.target.value) : '')}
                              className="w-full bg-brand-dark border border-brand-border px-2.5 py-1.5 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                            >
                              <option value="">Selecione o usuário...</option>
                              {usersList.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.nome} ({u.role})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-mono uppercase text-brand-muted block">Motivo *</label>
                            <textarea
                              required
                              rows={2}
                              value={detailTransferMotivo}
                              onChange={(e) => setDetailTransferMotivo(e.target.value)}
                              placeholder="Informe o motivo..."
                              className="w-full bg-brand-dark border border-brand-border px-2.5 py-1.5 text-xs text-brand-text focus:outline-none focus:border-brand-primary placeholder-brand-muted/40 font-mono"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-mono uppercase text-brand-muted block">Data Prevista Devolução</label>
                            <input
                              type="date"
                              value={detailTransferDataPrevista}
                              onChange={(e) => setDetailTransferDataPrevista(e.target.value)}
                              className="w-full bg-brand-dark border border-brand-border px-2.5 py-1.5 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                            />
                          </div>

                          <div className="flex space-x-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setShowDetailTransferForm(false)}
                              className="w-1/3 py-1.5 bg-brand-dark border border-brand-border text-brand-muted text-xs font-semibold font-mono uppercase hover:bg-brand-card"
                            >
                              Voltar
                            </button>
                            <button
                              type="submit"
                              disabled={detailTransferLoading || !detailTransferUserId || !detailTransferMotivo.trim()}
                              className="flex-1 py-1.5 bg-brand-primary text-brand-dark text-xs font-semibold font-mono uppercase flex items-center justify-center space-x-1.5 disabled:opacity-50"
                            >
                              {detailTransferLoading && <RefreshCw size={12} className="animate-spin" />}
                              <span>Transferir</span>
                            </button>
                          </div>
                        </form>
                      )}

                      {/* Forced Devolution Form */}
                      {showDetailDevolucaoForm && (
                        <form onSubmit={handleDevolverAssetFromDetail} className="space-y-3 pt-1">
                          <div className="font-semibold text-xs text-amber-400 flex items-center space-x-2 border-b border-brand-border/60 pb-1.5">
                            <RotateCcw size={14} className="text-amber-400" />
                            <span>Forçar Devolução</span>
                          </div>

                          {detailDevolucaoError && (
                            <div className="p-2 border border-red-500/20 bg-red-500/5 text-red-400 text-[11px] font-mono">
                              {detailDevolucaoError}
                            </div>
                          )}

                          <div className="space-y-1">
                            <label className="text-[10px] font-mono uppercase text-brand-muted block">Condição *</label>
                            <select
                              required
                              value={detailDevolucaoCondicao}
                              onChange={(e) => setDetailDevolucaoCondicao(e.target.value)}
                              className="w-full bg-brand-dark border border-brand-border px-2.5 py-1.5 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                            >
                              <option value="Íntegro e funcional">Íntegro e funcional</option>
                              <option value="Danificado com marcas de uso">Danificado com marcas de uso</option>
                              <option value="Avariado / Necessita Manutenção">Avariado / Necessita Manutenção</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-mono uppercase text-brand-muted block">Acessórios Devolvidos *</label>
                            <input
                              type="text"
                              required
                              value={detailDevolucaoAcessorios}
                              onChange={(e) => setDetailDevolucaoAcessorios(e.target.value)}
                              placeholder="Ex: Fonte de alimentação..."
                              className="w-full bg-brand-dark border border-brand-border px-2.5 py-1.5 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-mono uppercase text-brand-muted block">Observações</label>
                            <textarea
                              rows={2}
                              value={detailDevolucaoNotas}
                              onChange={(e) => setDetailDevolucaoNotas(e.target.value)}
                              placeholder="Observações..."
                              className="w-full bg-brand-dark border border-brand-border px-2.5 py-1.5 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                            />
                          </div>

                          <div className="flex space-x-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setShowDetailDevolucaoForm(false)}
                              className="w-1/3 py-1.5 bg-brand-dark border border-brand-border text-brand-muted text-xs font-semibold font-mono uppercase hover:bg-brand-card"
                            >
                              Voltar
                            </button>
                            <button
                              type="submit"
                              disabled={detailDevolucaoLoading || !detailDevolucaoCondicao.trim() || !detailDevolucaoAcessorios.trim()}
                              className="flex-1 py-1.5 bg-amber-500 text-brand-dark text-xs font-semibold font-mono uppercase flex items-center justify-center space-x-1.5 hover:bg-amber-400 disabled:opacity-50 font-bold"
                            >
                              {detailDevolucaoLoading && <RefreshCw size={12} className="animate-spin" />}
                              <span>Confirmar</span>
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: HISTÓRICO DE MOVIMENTAÇÕES & EMPRÉSTIMOS */}
              {detailActiveTab === 'movimentacoes' && (
                <div className="space-y-6">
                  {/* Solicitações de Empréstimo e Posse */}
                  <div className="space-y-3">
                    <h4 className="font-mono text-xs font-bold text-brand-primary uppercase tracking-wider flex items-center space-x-2 border-b border-brand-border pb-2">
                      <FileCheck size={14} />
                      <span>Empréstimos, Autorizações & Devoluções ({assetHistory?.solicitacoes_emprestimo?.length || 0})</span>
                    </h4>

                    {(!assetHistory?.solicitacoes_emprestimo || assetHistory.solicitacoes_emprestimo.length === 0) ? (
                      <div className="p-4 border border-dashed border-brand-border text-center text-xs font-mono text-brand-muted">
                        Nenhum registro de empréstimo ou solicitação formal para este ativo.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {assetHistory.solicitacoes_emprestimo.map((sol: any) => (
                          <div key={sol.id} className="border border-brand-border bg-brand-dark/20 p-4 space-y-3 rounded">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-border/40 pb-2">
                              <div className="flex items-center space-x-2">
                                <span className={`text-[10px] font-mono uppercase px-2 py-0.5 border font-bold ${
                                  sol.status === 'Entregue' ? 'border-green-500/30 bg-green-500/10 text-green-400' :
                                  sol.status === 'Devolvida' ? 'border-blue-500/30 bg-blue-500/10 text-blue-400' :
                                  sol.status === 'Aprovada' ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' :
                                  'border-brand-border bg-brand-dark/40 text-brand-muted'
                                }`}>
                                  {sol.status}
                                </span>
                                <span className="font-mono text-xs text-brand-text font-bold">
                                  Solicitação #{sol.id}
                                </span>
                              </div>
                              <span className="text-[11px] font-mono text-brand-muted">
                                Solicitado em: {new Date(sol.data_solicitacao).toLocaleString('pt-BR')}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                              <div className="bg-brand-dark/40 p-2.5 border border-brand-border/30 rounded space-y-1">
                                <span className="text-[10px] font-mono uppercase text-brand-muted block">Solicitante</span>
                                <div className="font-bold text-brand-text">{sol.solicitante?.nome || '—'}</div>
                                <div className="text-[11px] text-brand-muted">{sol.solicitante?.cargo || sol.solicitante?.email}</div>
                              </div>

                              <div className="bg-brand-dark/40 p-2.5 border border-brand-border/30 rounded space-y-1">
                                <span className="text-[10px] font-mono uppercase text-brand-muted block">Quem Autorizou (Aprovador)</span>
                                <div className="font-bold text-amber-400">{sol.aprovador?.nome || 'Pendente / Não informado'}</div>
                                <div className="text-[11px] text-brand-muted">
                                  {sol.data_aprovacao ? `Aprovado em: ${new Date(sol.data_aprovacao).toLocaleString('pt-BR')}` : 'Aguardando aprovação'}
                                </div>
                              </div>

                              <div className="bg-brand-dark/40 p-2.5 border border-brand-border/30 rounded space-y-1">
                                <span className="text-[10px] font-mono uppercase text-brand-muted block">Entrega & Confirmação</span>
                                <div className="font-bold text-green-400">{sol.confirmador?.nome || sol.solicitante?.nome || '—'}</div>
                                <div className="text-[11px] text-brand-muted">
                                  {sol.data_entrega ? `Entregue em: ${new Date(sol.data_entrega).toLocaleString('pt-BR')}` : 'Não entregue'}
                                  {sol.confirmado_via_qr && ' (✓ QR Code)'}
                                </div>
                              </div>
                            </div>

                            <div className="bg-brand-dark/30 p-2.5 text-xs font-mono space-y-1 border border-brand-border/20">
                              <span className="text-[10px] uppercase text-brand-muted block">Motivo do Empréstimo:</span>
                              <p className="text-brand-text italic whitespace-pre-wrap">{sol.motivo || '—'}</p>
                            </div>

                            {/* Devolução */}
                            {sol.data_devolucao && (
                              <div className="bg-blue-500/5 border border-blue-500/20 p-3 rounded space-y-2 text-xs">
                                <div className="font-mono text-blue-400 font-bold text-[11px] uppercase flex items-center space-x-1.5">
                                  <CheckCircle2 size={13} />
                                  <span>Registro de Devolução Concluída</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  <div>
                                    <span className="text-[10px] font-mono text-brand-muted block">Data Devolução</span>
                                    <span className="font-mono text-brand-text">{new Date(sol.data_devolucao).toLocaleString('pt-BR')}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-mono text-brand-muted block">Recebido Por</span>
                                    <span className="text-brand-text">{sol.recebedor?.nome || '—'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-mono text-brand-muted block">Condição Devolvida</span>
                                    <span className="text-brand-text font-bold">{sol.condicao_devolucao || 'Íntegro'}</span>
                                  </div>
                                </div>
                                {sol.acessorios_devolvidos && (
                                  <div>
                                    <span className="text-[10px] font-mono text-brand-muted block">Acessórios Devolvidos:</span>
                                    <span className="text-brand-text font-mono text-[11px]">{sol.acessorios_devolvidos}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Termo de responsabilidade */}
                            {sol.termo && (
                              <div className="flex items-center justify-between bg-brand-dark/50 p-2.5 border border-brand-border/40 text-xs">
                                <div className="flex items-center space-x-2">
                                  <FileCheck size={14} className="text-brand-primary" />
                                  <span className="font-mono text-brand-text">Termo RH #{sol.termo.id} - Status: {sol.termo.status}</span>
                                </div>
                                <span className="text-[11px] font-mono text-brand-muted">
                                  {sol.termo.assinado_em ? `Assinado em: ${new Date(sol.termo.assinado_em).toLocaleDateString('pt-BR')}` : 'Aguardando assinatura'}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Movimentações Diretas de Inventário */}
                  <div className="space-y-3 pt-2">
                    <h4 className="font-mono text-xs font-bold text-brand-primary uppercase tracking-wider flex items-center space-x-2 border-b border-brand-border pb-2">
                      <History size={14} />
                      <span>Histórico de Movimentações Diretas ({assetHistory?.movimentacoes?.length || 0})</span>
                    </h4>

                    {(!assetHistory?.movimentacoes || assetHistory.movimentacoes.length === 0) ? (
                      <div className="p-4 border border-dashed border-brand-border text-center text-xs font-mono text-brand-muted">
                        Nenhuma movimentação avulsa registrada no log.
                      </div>
                    ) : (
                      <div className="border border-brand-border divide-y divide-brand-border/60 bg-brand-dark/20 text-xs font-mono">
                        {assetHistory.movimentacoes.map((mov: any) => (
                          <div key={mov.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="space-y-0.5">
                              <div className="flex items-center space-x-2">
                                <span className="bg-brand-primary/10 text-brand-primary px-2 py-0.5 border border-brand-primary/20 text-[10px] uppercase font-bold">
                                  {mov.tipo}
                                </span>
                                <span className="text-brand-text font-bold">
                                  {mov.de_user?.nome || 'Estoque/Sistema'} → {mov.para_user?.nome || 'Disponível'}
                                </span>
                              </div>
                              {mov.observacao && (
                                <p className="text-[11px] text-brand-muted italic mt-0.5">{mov.observacao}</p>
                              )}
                            </div>
                            <span className="text-[10px] text-brand-muted shrink-0">
                              {new Date(mov.data).toLocaleString('pt-BR')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: MANUTENÇÕES CORRETIVAS */}
              {detailActiveTab === 'manutencoes' && (
                <div className="space-y-6">
                  {/* Ordens de Manutenção */}
                  <div className="space-y-3">
                    <h4 className="font-mono text-xs font-bold text-brand-primary uppercase tracking-wider flex items-center space-x-2 border-b border-brand-border pb-2">
                      <Wrench size={14} />
                      <span>Manutenções Realizadas & Em Andamento ({assetHistory?.manutencoes?.length || 0})</span>
                    </h4>

                    {(!assetHistory?.manutencoes || assetHistory.manutencoes.length === 0) ? (
                      <div className="p-4 border border-dashed border-brand-border text-center text-xs font-mono text-brand-muted">
                        Nenhum registro de manutenção na oficina para este equipamento.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {assetHistory.manutencoes.map((m: any) => (
                          <div key={m.id} className="border border-brand-border bg-brand-dark/20 p-4 space-y-3 rounded">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-border/40 pb-2">
                              <div className="flex items-center space-x-2">
                                <span className={`text-[10px] font-mono uppercase px-2 py-0.5 border font-bold ${
                                  m.status === 'concluida' ? 'border-green-500/30 bg-green-500/10 text-green-400' :
                                  m.status === 'em_andamento' ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' :
                                  'border-red-500/30 bg-red-500/10 text-red-400'
                                }`}>
                                  {m.status}
                                </span>
                                <span className="font-mono text-xs font-bold text-brand-text">
                                  Manutenção #{m.id} ({m.tipo})
                                </span>
                              </div>
                              {m.custo && (
                                <span className="font-mono text-xs text-green-400 font-bold">
                                  Custo: {m.custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                              <div>
                                <span className="text-[10px] font-mono uppercase text-brand-muted block">Data Entrada</span>
                                <span className="font-mono text-brand-text">{new Date(m.data_entrada).toLocaleString('pt-BR')}</span>
                              </div>
                              <div>
                                <span className="text-[10px] font-mono uppercase text-brand-muted block">Data Conclusão</span>
                                <span className="font-mono text-brand-text">{m.data_conclusao ? new Date(m.data_conclusao).toLocaleString('pt-BR') : 'Em reparo'}</span>
                              </div>
                              <div>
                                <span className="text-[10px] font-mono uppercase text-brand-muted block">Técnico Responsável</span>
                                <span className="text-brand-text font-bold">{m.responsavel?.nome || 'Não atribuído'}</span>
                              </div>
                            </div>

                            <div className="bg-brand-dark/30 p-2.5 text-xs font-mono border border-brand-border/20 space-y-1">
                              <span className="text-[10px] uppercase text-brand-muted block">Motivo da Entrada:</span>
                              <p className="text-brand-text">{m.motivo}</p>
                            </div>

                            {m.observacao_conclusao && (
                              <div className="bg-green-500/5 p-2.5 text-xs font-mono border border-green-500/20 space-y-1">
                                <span className="text-[10px] uppercase text-green-400 block font-bold">Laudo / Conclusão Técnica:</span>
                                <p className="text-brand-text">{m.observacao_conclusao}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Solicitações de Manutenção Abertas por Usuários */}
                  <div className="space-y-3 pt-2">
                    <h4 className="font-mono text-xs font-bold text-brand-primary uppercase tracking-wider flex items-center space-x-2 border-b border-brand-border pb-2">
                      <Clock size={14} />
                      <span>Chamados / Solicitações de Usuários ({assetHistory?.solicitacoes_manutencao?.length || 0})</span>
                    </h4>

                    {(!assetHistory?.solicitacoes_manutencao || assetHistory.solicitacoes_manutencao.length === 0) ? (
                      <div className="p-4 border border-dashed border-brand-border text-center text-xs font-mono text-brand-muted">
                        Nenhum chamado de manutenção aberto por usuários para este equipamento.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {assetHistory.solicitacoes_manutencao.map((sm: any) => (
                          <div key={sm.id} className="border border-brand-border bg-brand-dark/20 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
                            <div className="space-y-1">
                              <div className="flex items-center space-x-2">
                                <span className="bg-brand-dark px-2 py-0.5 border border-brand-border text-[10px] uppercase font-bold text-brand-muted">
                                  {sm.status}
                                </span>
                                <span className="text-brand-text font-bold">Solicitante: {sm.solicitante?.nome || '—'}</span>
                              </div>
                              <p className="text-[11px] text-brand-muted">{sm.descricao}</p>
                            </div>
                            <span className="text-[10px] text-brand-muted shrink-0">
                              {new Date(sm.data_solicitacao).toLocaleString('pt-BR')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: MANUTENÇÕES PREVENTIVAS & PLANOS */}
              {detailActiveTab === 'preventivas' && (
                <div className="space-y-6">
                  {/* Planos Preventivos Atribuídos */}
                  <div className="space-y-3">
                    <h4 className="font-mono text-xs font-bold text-brand-primary uppercase tracking-wider flex items-center space-x-2 border-b border-brand-border pb-2">
                      <CalendarDays size={14} />
                      <span>Planos Preventivos Associados ({assetHistory?.planos_preventivos?.length || 0})</span>
                    </h4>

                    {(!assetHistory?.planos_preventivos || assetHistory.planos_preventivos.length === 0) ? (
                      <div className="p-4 border border-dashed border-brand-border text-center text-xs font-mono text-brand-muted">
                        Este ativo ainda não possui planos de manutenção preventiva vinculados.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {assetHistory.planos_preventivos.map((plano: any) => (
                          <div key={plano.id} className="border border-brand-border bg-brand-dark/20 p-3.5 space-y-2 rounded text-xs">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="text-[10px] font-mono text-brand-primary font-bold">{plano.codigo}</span>
                                <h5 className="font-bold text-brand-text">{plano.nome}</h5>
                              </div>
                              <span className="text-[10px] font-mono bg-brand-dark px-2 py-0.5 border border-brand-border text-brand-muted uppercase">
                                {plano.periodicidade}
                              </span>
                            </div>
                            <div className="text-[11px] text-brand-muted space-y-0.5 font-mono">
                              <div>Criticidade: <span className="text-amber-400 font-bold">{plano.criticidade}</span></div>
                              <div>Próxima Execução: <span className="text-brand-text">{new Date(plano.proxima_execucao).toLocaleDateString('pt-BR')}</span></div>
                              <div>Responsável: <span className="text-brand-text">{plano.responsavel?.nome || '—'}</span></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Ordens Preventivas Executadas */}
                  <div className="space-y-3 pt-2">
                    <h4 className="font-mono text-xs font-bold text-brand-primary uppercase tracking-wider flex items-center space-x-2 border-b border-brand-border pb-2">
                      <ShieldCheck size={14} />
                      <span>Ordens de Manutenção Preventiva Executadas ({assetHistory?.manutencoes_preventivas?.length || 0})</span>
                    </h4>

                    {(!assetHistory?.manutencoes_preventivas || assetHistory.manutencoes_preventivas.length === 0) ? (
                      <div className="p-4 border border-dashed border-brand-border text-center text-xs font-mono text-brand-muted">
                        Nenhuma ordem preventiva executada para este equipamento.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {assetHistory.manutencoes_preventivas.map((ord: any) => (
                          <div key={ord.id} className="border border-brand-border bg-brand-dark/20 p-4 space-y-3 rounded text-xs">
                            <div className="flex flex-wrap justify-between items-center gap-2 border-b border-brand-border/40 pb-2">
                              <div className="flex items-center space-x-2">
                                <span className="font-mono font-bold text-brand-primary text-xs">{ord.numero}</span>
                                <span className={`text-[10px] font-mono px-2 py-0.5 border uppercase font-bold ${
                                  ord.status === 'Concluída' ? 'border-green-500/30 bg-green-500/10 text-green-400' :
                                  ord.status === 'Em andamento' ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' :
                                  'border-brand-border bg-brand-dark text-brand-muted'
                                }`}>
                                  {ord.status}
                                </span>
                              </div>
                              <span className="font-mono text-[11px] text-brand-muted">
                                Abertura: {new Date(ord.data_abertura).toLocaleDateString('pt-BR')}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <span className="text-[10px] font-mono uppercase text-brand-muted block">Técnico</span>
                                <span className="font-bold text-brand-text">{ord.tecnico?.nome || '—'}</span>
                              </div>
                              <div>
                                <span className="text-[10px] font-mono uppercase text-brand-muted block">Plano</span>
                                <span className="text-brand-text">{ord.plan?.nome || 'Ordem Avulsa'}</span>
                              </div>
                              <div>
                                <span className="text-[10px] font-mono uppercase text-brand-muted block">Conclusão</span>
                                <span className="font-mono text-brand-text">{ord.data_conclusao ? new Date(ord.data_conclusao).toLocaleDateString('pt-BR') : '—'}</span>
                              </div>
                            </div>

                            {/* Checklists Executados */}
                            {ord.executions && ord.executions.length > 0 && (
                              <div className="bg-brand-dark/40 p-2.5 border border-brand-border/30 rounded space-y-1.5">
                                <span className="text-[10px] font-mono uppercase text-brand-primary font-bold block">
                                  Itens do Checklist Executados ({ord.executions.filter((e: any) => e.concluido).length}/{ord.executions.length})
                                </span>
                                <div className="space-y-1 font-mono text-[11px]">
                                  {ord.executions.map((exe: any) => (
                                    <div key={exe.id} className="flex items-center space-x-2">
                                      <span className={exe.concluido ? 'text-green-400 font-bold' : 'text-brand-muted'}>
                                        {exe.concluido ? '✓' : '○'}
                                      </span>
                                      <span className={exe.concluido ? 'text-brand-text' : 'text-brand-muted'}>
                                        {exe.checklist_item?.descricao || 'Item de inspeção'}
                                      </span>
                                      {exe.observacao && <span className="text-brand-muted italic text-[10px]">({exe.observacao})</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Fotos anexadas */}
                            {ord.photos && ord.photos.length > 0 && (
                              <div className="space-y-1.5 pt-1">
                                <span className="text-[10px] font-mono uppercase text-brand-muted font-bold block">Fotos de Evidência:</span>
                                <div className="flex flex-wrap gap-2">
                                  {ord.photos.map((photo: any) => (
                                    <a 
                                      key={photo.id} 
                                      href={toApiFileUrl(photo.caminho_arquivo)} 
                                      target="_blank" 
                                      rel="noreferrer"
                                      className="border border-brand-border p-1 bg-brand-dark rounded hover:border-brand-primary transition-colors block"
                                    >
                                      <img 
                                        src={toApiFileUrl(photo.caminho_arquivo)} 
                                        alt={photo.descricao || 'Foto Preventiva'} 
                                        className="w-16 h-16 object-cover rounded" 
                                      />
                                      <span className="text-[9px] font-mono text-center block text-brand-muted mt-0.5">{photo.tipo}</span>
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: PEÇAS & COMPRAS */}
              {detailActiveTab === 'compras' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-brand-border pb-2">
                    <h4 className="font-mono text-xs font-bold text-brand-primary uppercase tracking-wider flex items-center space-x-2">
                      <ShoppingCart size={14} />
                      <span>Peças & Solicitações de Compra Vinculadas ({assetHistory?.solicitacoes_compra?.length || 0})</span>
                    </h4>
                  </div>

                  {(!assetHistory?.solicitacoes_compra || assetHistory.solicitacoes_compra.length === 0) ? (
                    <div className="p-8 border border-dashed border-brand-border text-center text-xs font-mono text-brand-muted">
                      Nenhuma solicitação de compra ou peça registrada para o patrimônio {selectedAssetForDetail.e_patrimonio}.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {assetHistory.solicitacoes_compra.map((item: any) => (
                        <div key={item.id} className="border border-brand-border bg-brand-dark/20 p-4 space-y-3 rounded text-xs font-mono">
                          <div className="flex flex-wrap justify-between items-center gap-2 border-b border-brand-border/40 pb-2">
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-brand-text text-sm">
                                {item.product?.nome || 'Peça / Componente'}
                              </span>
                              <span className="bg-brand-dark px-2 py-0.5 border border-brand-border text-[10px] uppercase text-brand-primary">
                                Qtd: {item.quantidade}
                              </span>
                            </div>
                            <span className="text-green-400 font-bold">
                              {item.valor_estimado ? (item.valor_estimado * item.quantidade).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                            <div>
                              <span className="text-[10px] text-brand-muted uppercase block">Solicitação de Compra</span>
                              <span className="text-brand-text font-bold">{item.request?.numero || `Req #${item.request_id}`}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-brand-muted uppercase block">Status da Compra</span>
                              <span className="text-amber-400 font-bold">{item.request?.status || 'Pendente'}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-brand-muted uppercase block">Solicitante</span>
                              <span className="text-brand-text">{item.request?.solicitante?.nome || '—'}</span>
                            </div>
                          </div>

                          {item.observacao && (
                            <div className="bg-brand-dark/40 p-2 border border-brand-border/30 text-[11px] text-brand-muted">
                              {item.observacao}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 sm:px-6 py-3.5 bg-brand-dark/40 border-t border-brand-border flex justify-between items-center">
              <span className="text-[11px] font-mono text-brand-muted hidden sm:inline">
                AssetTrack Rastreabilidade & Controle Patrimonial
              </span>
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="border border-brand-border hover:bg-brand-card text-brand-text font-bold font-mono px-5 py-2 uppercase tracking-wider text-xs transition-colors rounded"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
