import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  Edit3,
  FolderPlus,
  Globe,
  History,
  Layers,
  Loader2,
  Lock,
  Plus,
  Power,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';
import { API_ORIGIN, apiClient } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { WikiDepartmentPermissionsPanel } from '../components/wiki/WikiDepartmentPermissionsPanel';
import { WikiRichTextEditor } from '../components/wiki/WikiRichTextEditor';

interface WikiCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  department_id: number | null;
  department_name?: string;
}

interface WikiArticle {
  id: number;
  category_id: number;
  category_name?: string;
  department_id?: number | null;
  title: string;
  slug: string;
  summary: string;
  content: string;
  content_format: 'html' | 'json';
  is_published: boolean;
  author_id?: number | null;
  author_name?: string;
  updated_by?: number | null;
  created_at: string;
  updated_at: string;
}

interface WikiArticleRevision {
  id: number;
  article_id: number;
  edited_by?: number | null;
  editor_name?: string;
  previous_title: string;
  previous_content: string;
  content_format: string;
  change_summary: string;
  created_at: string;
}

interface ManageableDepartment {
  id: number;
  name?: string;
  nome?: string;
  descricao?: string;
}

function getDeptLabel(dept?: ManageableDepartment | null): string {
  if (!dept) return '';
  return (dept.name || dept.nome || `Setor #${dept.id}`).trim();
}

type ActiveTab = 'articles' | 'permissions';

export const WikiPage: React.FC = () => {
  const { user, token } = useAuthStore();
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';

  const [activeTab, setActiveTab] = useState<ActiveTab>('articles');
  const [moduleEnabled, setModuleEnabled] = useState<boolean>(true);
  const [moduleBlockedByToggle, setModuleBlockedByToggle] = useState<boolean>(false);
  const [togglingModule, setTogglingModule] = useState<boolean>(false);

  // Categories & Articles state
  const [categories, setCategories] = useState<WikiCategory[]>([]);
  const [articles, setArticles] = useState<WikiArticle[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedArticle, setSelectedArticle] = useState<WikiArticle | null>(null);
  const [loadingArticles, setLoadingArticles] = useState<boolean>(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Editor state (Create / Edit Article)
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingArticleId, setEditingArticleId] = useState<number | null>(null);
  const [formCategoryId, setFormCategoryId] = useState<number>(0);
  const [formTitle, setFormTitle] = useState<string>('');
  const [formSummary, setFormSummary] = useState<string>('');
  const [formContent, setFormContent] = useState<string>('');
  const [formChangeSummary, setFormChangeSummary] = useState<string>('');
  const [savingArticle, setSavingArticle] = useState<boolean>(false);

  // New Category Modal state
  const [showNewCategoryModal, setShowNewCategoryModal] = useState<boolean>(false);
  const [newCatName, setNewCatName] = useState<string>('');
  const [newCatDesc, setNewCatDesc] = useState<string>('');
  const [newCatDeptId, setNewCatDeptId] = useState<string>('global');
  const [creatingCategory, setCreatingCategory] = useState<boolean>(false);

  // Revisions Modal state
  const [showRevisionsModal, setShowRevisionsModal] = useState<boolean>(false);
  const [revisions, setRevisions] = useState<WikiArticleRevision[]>([]);
  const [loadingRevisions, setLoadingRevisions] = useState<boolean>(false);
  const [previewRevision, setPreviewRevision] = useState<WikiArticleRevision | null>(null);

  // Delete Article state (Admin only)
  const [articleToDelete, setArticleToDelete] = useState<WikiArticle | null>(null);
  const [deletingArticle, setDeletingArticle] = useState<boolean>(false);

  // Manageable Departments for RBAC Matrix
  const [manageableDepts, setManageableDepts] = useState<ManageableDepartment[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);

  const loadModuleStatusAndDepts = useCallback(async () => {
    try {
      const deptsRes = await apiClient.get<{ departments: ManageableDepartment[] }>('/wiki/departments');
      const list = deptsRes.data?.departments || [];
      setManageableDepts(list);
      if (list.length > 0 && selectedDeptId === null) {
        setSelectedDeptId(list[0].id);
      }
    } catch {
      // Non-managers or module disabled
    }

    if (isAdmin) {
      try {
        const statusRes = await apiClient.get<{ is_enabled: boolean }>('/wiki/admin/module-status');
        setModuleEnabled(Boolean(statusRes.data?.is_enabled));
      } catch {
        // Ignore if not reachable
      }
    }
  }, [isAdmin, selectedDeptId]);

  const loadWikiData = useCallback(async () => {
    setLoadingArticles(true);
    setErrorBanner(null);

    try {
      const [catRes, artRes] = await Promise.all([
        apiClient.get<{ categories: WikiCategory[] }>('/wiki/categories'),
        apiClient.get<{ articles: WikiArticle[] }>('/wiki/articles', {
          params: {
            ...(selectedCategoryId ? { category_id: selectedCategoryId } : {}),
            ...(searchQuery.trim() ? { q: searchQuery.trim() } : {}),
          },
        }),
      ]);

      const loadedCategories = catRes.data?.categories || [];
      const loadedArticles = artRes.data?.articles || [];
      setCategories(loadedCategories);
      setArticles(loadedArticles);
      setModuleBlockedByToggle(false);
      setModuleEnabled(true);

      if (loadedArticles.length > 0) {
        setSelectedArticle((prev) => {
          if (prev) {
            const updated = loadedArticles.find((a) => a.id === prev.id);
            if (updated) return updated;
          }
          return loadedArticles[0];
        });
      } else {
        setSelectedArticle(null);
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const errCode = err?.response?.data?.code;
      if (status === 403 && errCode === 'WIKI_MODULE_DISABLED') {
        setModuleBlockedByToggle(true);
        setModuleEnabled(false);
      } else {
        setErrorBanner(
          err?.response?.data?.error ||
            'Não foi possível carregar os artigos da Base de Conhecimento.'
        );
      }
    } finally {
      setLoadingArticles(false);
    }
  }, [selectedCategoryId, searchQuery]);

  useEffect(() => {
    void loadModuleStatusAndDepts();
  }, [loadModuleStatusAndDepts]);

  useEffect(() => {
    void loadWikiData();
  }, [loadWikiData]);

  const handleToggleModule = async () => {
    if (!isAdmin) return;
    setTogglingModule(true);
    setErrorBanner(null);
    setSuccessBanner(null);

    const nextState = !moduleEnabled;
    try {
      await apiClient.put('/wiki/admin/module-toggle', { is_enabled: nextState });
      setModuleEnabled(nextState);
      setModuleBlockedByToggle(!nextState);
      setSuccessBanner(
        nextState
          ? 'Módulo Wiki ativado globalmente com sucesso!'
          : 'Módulo Wiki desativado globalmente (403 Forbidden ativo para rotas da Wiki).'
      );
      if (nextState) {
        await loadWikiData();
        await loadModuleStatusAndDepts();
      }
    } catch (err: any) {
      setErrorBanner(
        err?.response?.data?.error || 'Falha ao alternar o estado global do módulo Wiki.'
      );
    } finally {
      setTogglingModule(false);
    }
  };

  const startCreateArticle = () => {
    const defaultCatId =
      selectedCategoryId || (categories.length > 0 ? categories[0].id : 0);
    setEditingArticleId(null);
    setFormCategoryId(defaultCatId);
    setFormTitle('');
    setFormSummary('');
    setFormContent('<h2>Objetivo do Procedimento</h2><p>Descreva passo a passo o manual técnico ou operacional...</p>');
    setFormChangeSummary('Criação inicial do artigo');
    setIsEditing(true);
  };

  const startEditArticle = (article: WikiArticle) => {
    setEditingArticleId(article.id);
    setFormCategoryId(article.category_id);
    setFormTitle(article.title);
    setFormSummary(article.summary || '');
    setFormContent(article.content || '');
    setFormChangeSummary('');
    setIsEditing(true);
  };

  const handleSaveArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formContent.trim() || !formCategoryId) {
      setErrorBanner('Preencha o título, a categoria e o conteúdo do artigo.');
      return;
    }

    setSavingArticle(true);
    setErrorBanner(null);
    setSuccessBanner(null);

    try {
      if (editingArticleId) {
        const res = await apiClient.put<WikiArticle>(`/wiki/articles/${editingArticleId}`, {
          title: formTitle.trim(),
          summary: formSummary.trim(),
          content: formContent,
          content_format: 'html',
          is_published: true,
          change_summary: formChangeSummary.trim() || 'Atualização de conteúdo',
        });
        setSuccessBanner('Artigo atualizado e revisão anterior arquivada no histórico!');
        setIsEditing(false);
        setSelectedArticle(res.data);
        await loadWikiData();
      } else {
        const res = await apiClient.post<WikiArticle>('/wiki/articles', {
          category_id: Number(formCategoryId),
          title: formTitle.trim(),
          summary: formSummary.trim(),
          content: formContent,
          content_format: 'html',
          is_published: true,
        });
        setSuccessBanner('Novo artigo publicado na Base de Conhecimento!');
        setIsEditing(false);
        setSelectedArticle(res.data);
        await loadWikiData();
      }
    } catch (err: any) {
      setErrorBanner(
        err?.response?.data?.error ||
          'Erro ao salvar artigo. Verifique se você possui permissão de escrita nesta categoria.'
      );
    } finally {
      setSavingArticle(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    setCreatingCategory(true);
    setErrorBanner(null);
    try {
      const deptId =
        newCatDeptId === 'global' ? null : Number(newCatDeptId);
      await apiClient.post('/wiki/categories', {
        name: newCatName.trim(),
        description: newCatDesc.trim(),
        department_id: deptId,
      });
      setNewCatName('');
      setNewCatDesc('');
      setShowNewCategoryModal(false);
      setSuccessBanner('Nova categoria criada com sucesso!');
      await loadWikiData();
    } catch (err: any) {
      setErrorBanner(
        err?.response?.data?.error || 'Não foi possível criar a categoria.'
      );
    } finally {
      setCreatingCategory(false);
    }
  };

  const openRevisionsModal = async (articleId: number) => {
    setShowRevisionsModal(true);
    setLoadingRevisions(true);
    setPreviewRevision(null);
    try {
      const res = await apiClient.get<{ revisions: WikiArticleRevision[] }>(
        `/wiki/articles/${articleId}/revisions`
      );
      const list = res.data?.revisions || [];
      setRevisions(list);
      if (list.length > 0) {
        setPreviewRevision(list[0]);
      }
    } catch {
      setRevisions([]);
    } finally {
      setLoadingRevisions(false);
    }
  };

  const handleDeleteArticle = async () => {
    if (!isAdmin || !articleToDelete) return;
    setDeletingArticle(true);
    setErrorBanner(null);
    try {
      await apiClient.delete(`/wiki/articles/${articleToDelete.id}`);
      setSuccessBanner(`Artigo "${articleToDelete.title}" excluído com sucesso!`);
      const deletedId = articleToDelete.id;
      setArticleToDelete(null);
      if (selectedArticle?.id === deletedId) {
        setSelectedArticle(null);
      }
      await loadWikiData();
    } catch (err: any) {
      setErrorBanner(
        err?.response?.data?.error || 'Erro ao excluir artigo da Base de Conhecimento.'
      );
    } finally {
      setDeletingArticle(false);
    }
  };

  const canManageAnyDepartment = isAdmin || manageableDepts.length > 0;

  const selectedDeptName = useMemo(() => {
    const found = manageableDepts.find((d) => d.id === selectedDeptId);
    return found ? getDeptLabel(found).toUpperCase() : undefined;
  }, [manageableDepts, selectedDeptId]);

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-6 pb-12">
      {/* Top Swiss Technical Header */}
      <header className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold tracking-wide text-blue-700 uppercase border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800">
              <BookOpen className="h-3.5 w-3.5" />
              Wiki & Base de Conhecimento
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold border ${
                moduleEnabled
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                  : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  moduleEnabled ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              />
              {moduleEnabled ? 'Módulo Ativo' : 'Módulo Desativado (403)'}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Documentação Técnica, Manuais e Procedimentos Operacionais
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Repositório centralizado com controle de acesso por setor (RBAC), histórico de revisões auditável e mídia local integrada.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Navigation Tabs */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950">
            <button
              type="button"
              onClick={() => setActiveTab('articles')}
              className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors ${
                activeTab === 'articles'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <BookOpen className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              Artigos & Manuais
            </button>

            {canManageAnyDepartment && (
              <button
                type="button"
                onClick={() => setActiveTab('permissions')}
                className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors ${
                  activeTab === 'permissions'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Permissões da Equipe (RBAC)
              </button>
            )}
          </div>

          {/* Global Feature Toggle Button for Admin */}
          {isAdmin && (
            <button
              type="button"
              onClick={handleToggleModule}
              disabled={togglingModule}
              className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                moduleEnabled
                  ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300'
                  : 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
              title="Ativar ou desativar globalmente o módulo Wiki (tabela system_modules)"
            >
              {togglingModule ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Power className="h-4 w-4" />
              )}
              {moduleEnabled ? 'Desativar Wiki Global' : 'Ativar Wiki Global'}
            </button>
          )}
        </div>
      </header>

      {/* Alerts */}
      {errorBanner && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="rounded p-1 hover:bg-rose-100 dark:hover:bg-rose-900/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {successBanner && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="rounded p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Global Module Disabled State (403 Feature Toggle) */}
      {moduleBlockedByToggle ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-8 text-center dark:border-amber-900/60 dark:bg-amber-950/20">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
            <Lock className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Módulo de Wiki Temporariamente Desativado (HTTP 403)
          </h2>
          <p className="mx-auto mt-1 max-w-xl text-sm text-slate-600 dark:text-slate-400">
            O middleware de Feature Toggle (<code>system_modules.module_name = &apos;wiki&apos;</code>) está com <code>is_enabled = false</code>. Todas as chamadas para <code>/api/v1/wiki/*</code> são bloqueadas automaticamente.
          </p>
          {isAdmin && (
            <button
              type="button"
              onClick={handleToggleModule}
              disabled={togglingModule}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 cursor-pointer"
            >
              <Power className="h-4 w-4" />
              Reativar Módulo Wiki Agora
            </button>
          )}
        </div>
      ) : activeTab === 'permissions' ? (
        /* TAB 2: DEPARTMENT MANAGER RBAC PERMISSIONS PANEL */
        <div className="space-y-4">
          {manageableDepts.length > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2.5">
                <Layers className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Selecionar Setor / Departamento para Gerenciar Acessos
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Defina quem do departamento selecionado pode visualizar ou editar cada categoria de manuais.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {manageableDepts.map((dept) => (
                  <button
                    key={dept.id}
                    type="button"
                    onClick={() => setSelectedDeptId(dept.id)}
                    className={`rounded-lg border px-3.5 py-1.5 text-xs font-semibold uppercase transition-colors cursor-pointer ${
                      selectedDeptId === dept.id
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    Setor: {getDeptLabel(dept)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedDeptId ? (
            <WikiDepartmentPermissionsPanel
              key={selectedDeptId}
              departmentId={selectedDeptId}
              departmentName={selectedDeptName}
              apiBaseUrl={API_ORIGIN}
              authToken={token || undefined}
              onSaveSuccess={() => {
                setSuccessBanner('Permissões da equipe atualizadas em lote com sucesso!');
              }}
            />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
              Nenhum departamento gerenciável vinculado ao seu usuário.
            </div>
          )}
        </div>
      ) : (
        /* TAB 1: TOP NAVIGATION DECK (ACIMA) + FULL-WIDTH EXPANDED EDITOR/VIEWER (ABAIXO) */
        <div className="flex flex-col space-y-6">
          {/* ACIMA: Navegação da Wiki (Categorias, Busca e Catálogo de Artigos) */}
          <section
            aria-label="Navegação RBAC e Catálogo da Wiki"
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4"
          >
            {/* Top Bar: Title, Search Input & Action Buttons */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-bold tracking-wider text-slate-600 uppercase dark:text-slate-300">
                  Navegação RBAC &amp; Artigos Disponíveis ({articles.length})
                </span>
                <button
                  type="button"
                  onClick={() => void loadWikiData()}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
                  title="Atualizar catálogo"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingArticles ? 'animate-spin' : ''}`} />
                  <span>Atualizar</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative min-w-[260px] flex-1 sm:w-80">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar manual, comando ou procedimento..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                {canManageAnyDepartment && (
                  <button
                    type="button"
                    onClick={() => setShowNewCategoryModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                    title="Criar nova categoria da Wiki"
                  >
                    <FolderPlus className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    Nova Categoria
                  </button>
                )}

                <button
                  type="button"
                  onClick={startCreateArticle}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Novo Artigo
                </button>
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
              <span className="mr-1 text-[11px] font-bold uppercase text-slate-400">
                Categorias:
              </span>
              <button
                type="button"
                onClick={() => setSelectedCategoryId(null)}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  selectedCategoryId === null
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Todas ({categories.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    selectedCategoryId === cat.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {cat.department_id === null ? (
                    <Globe className="h-3.5 w-3.5 opacity-80" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 opacity-80" />
                  )}
                  <span>{cat.name}</span>
                </button>
              ))}
            </div>

            {/* Horizontal / Grid Deck of Available Articles */}
            <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
              {loadingArticles ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span>Filtrando permissões RBAC...</span>
                </div>
              ) : articles.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  Nenhum artigo encontrado para o filtro atual ou seu nível de permissão.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 max-h-[220px] overflow-y-auto pr-1">
                  {articles.map((art) => {
                    const isSelected = selectedArticle?.id === art.id && !isEditing;
                    return (
                      <button
                        key={art.id}
                        type="button"
                        onClick={() => {
                          setIsEditing(false);
                          setSelectedArticle(art);
                        }}
                        className={`flex flex-col justify-between rounded-lg border p-3 text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/90 ring-1 ring-blue-600 dark:border-blue-500 dark:bg-blue-950/40'
                            : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-100/70 dark:border-slate-800 dark:bg-slate-950/50 dark:hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                            <span className="truncate">{art.category_name || 'Categoria'}</span>
                            <span className="font-mono text-slate-400">#{art.id}</span>
                          </div>
                          <h3 className="mt-1 text-xs font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
                            {art.title}
                          </h3>
                        </div>
                        {art.summary && (
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                            {art.summary}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* ABAIXO: Editor Rich Text de Largura Total OU Visualizador de Artigo */}
          <main className="w-full min-w-0">
            {isEditing ? (
              <form
                onSubmit={handleSaveArticle}
                className="w-full max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-5 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      {editingArticleId ? `Editando Artigo #${editingArticleId}` : 'Novo Artigo na Wiki'}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Editor expandido em largura total com auto-quebra de linha nas bordas e upload de mídias até 50MB via Drag &amp; Drop ou Ctrl+V.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                    Cancelar
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                  <div className="lg:col-span-4">
                    <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                      Categoria (Escopo RBAC)
                    </label>
                    <select
                      value={formCategoryId}
                      onChange={(e) => setFormCategoryId(Number(e.target.value))}
                      disabled={Boolean(editingArticleId)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value={0}>Selecione uma categoria...</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name} {cat.department_id === null ? '(Global)' : `(Setor: ${cat.department_name || cat.department_id})`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="lg:col-span-8">
                    <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                      Título do Manual / Procedimento
                    </label>
                    <input
                      type="text"
                      required
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="Ex: Procedimento de Contingência e Failover do Banco PostgreSQL"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                    Resumo Executivo
                  </label>
                  <input
                    type="text"
                    value={formSummary}
                    onChange={(e) => setFormSummary(e.target.value)}
                    placeholder="Breve descrição do objetivo deste manual..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                {/* Rich Text Editor with Drag & Drop + Paste upload + Auto Wrap */}
                <div className="w-full min-w-0">
                  <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-1.5">
                    Conteúdo Estruturado (Rich Text Expandido + Auto-Quebra de Texto + Upload Local <code>./uploads/wiki/</code>)
                  </label>
                  <WikiRichTextEditor
                    value={formContent}
                    onChange={setFormContent}
                    uploadEndpoint={`${API_ORIGIN}/api/v1/wiki/upload`}
                    authToken={token || undefined}
                  />
                </div>

                {editingArticleId && (
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                      Motivo da Alteração (Log de Auditoria em <code>wiki_article_revisions</code>)
                    </label>
                    <input
                      type="text"
                      value={formChangeSummary}
                      onChange={(e) => setFormChangeSummary(e.target.value)}
                      placeholder="Ex: Atualizado comando de restauração e adicionado vídeo demonstrativo"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    Descartar
                  </button>
                  <button
                    type="submit"
                    disabled={savingArticle}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
                  >
                    {savingArticle ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {editingArticleId ? 'Salvar e Arquivar Revisão' : 'Publicar Manual'}
                  </button>
                </div>
              </form>
            ) : selectedArticle ? (
              <article className="w-full max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-6 lg:p-8 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-6">
                <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-0.5 font-semibold text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800">
                        {selectedArticle.category_name || 'Categoria'}
                      </span>
                      <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                        <UserIcon className="h-3.5 w-3.5" />
                        Autor: {selectedArticle.author_name || 'Sistema'}
                      </span>
                      <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                        <Clock className="h-3.5 w-3.5" />
                        Atualizado em{' '}
                        {new Date(selectedArticle.updated_at).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 break-words">
                      {selectedArticle.title}
                    </h2>
                    {selectedArticle.summary && (
                      <p className="text-sm text-slate-600 dark:text-slate-400 break-words">
                        {selectedArticle.summary}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void openRevisionsModal(selectedArticle.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                    >
                      <History className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      Histórico de Revisões
                    </button>
                    <button
                      type="button"
                      onClick={() => startEditArticle(selectedArticle)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
                    >
                      <Edit3 className="h-4 w-4" />
                      Editar Artigo
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setArticleToDelete(selectedArticle)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 cursor-pointer"
                        title="Excluir este artigo da Base de Conhecimento"
                      >
                        <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                        Excluir Artigo
                      </button>
                    )}
                  </div>
                </div>

                {/* Rendered Rich Text Content with Automatic Border Text Wrapping */}
                <div
                  style={{
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                  }}
                  className="prose prose-slate dark:prose-invert w-full max-w-full overflow-x-hidden break-words text-base leading-relaxed text-slate-800 dark:text-slate-200 [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:p-4 [&_pre]:text-slate-100 [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:max-w-full [&_code]:font-mono [&_code]:break-words [&_p]:break-words [&_a]:break-all [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 dark:[&_td]:border-slate-700 [&_td]:p-2.5 [&_th]:border [&_th]:border-slate-300 dark:[&_th]:border-slate-700 [&_th]:p-2.5 [&_th]:bg-slate-100 dark:[&_th]:bg-slate-800 [&_img]:rounded-lg [&_img]:max-w-full [&_video]:rounded-lg [&_video]:max-w-full"
                  dangerouslySetInnerHTML={{ __html: selectedArticle.content }}
                />
              </article>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
                <BookOpen className="h-10 w-10 text-slate-400 mb-3" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Selecione ou crie um artigo na Base de Conhecimento
                </h3>
                <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                  Escolha um manual no painel de navegação acima ou clique em &ldquo;Novo Artigo&rdquo; para documentar um procedimento com imagens, vídeos e blocos de código.
                </p>
              </div>
            )}
          </main>
        </div>
      )}

      {/* Modal: Create New Wiki Category */}
      {showNewCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Nova Categoria da Wiki
              </h3>
              <button
                type="button"
                onClick={() => setShowNewCategoryModal(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateCategory} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                  Nome da Categoria
                </label>
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Ex: Redes & Infraestrutura"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                  Vinculação de Departamento (RBAC)
                </label>
                <select
                  value={newCatDeptId}
                  onChange={(e) => setNewCatDeptId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {isAdmin && (
                    <option value="global">Global (Todos os colaboradores autenticados)</option>
                  )}
                  {manageableDepts.map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      Restrita ao Setor: {getDeptLabel(d).toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                  Descrição
                </label>
                <textarea
                  rows={3}
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  placeholder="Descreva que tipo de manuais pertencem a esta categoria..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewCategoryModal(false)}
                  className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingCategory}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  {creatingCategory && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Criar Categoria
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Article Revisions History */}
      {showRevisionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Histórico de Alterações (<code>wiki_article_revisions</code>)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRevisionsModal(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loadingRevisions ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span>Carregando histórico de auditoria...</span>
              </div>
            ) : revisions.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">
                Nenhuma revisão anterior registrada para este artigo ainda. Edite o artigo para gerar um snapshot automático.
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 overflow-y-auto md:grid-cols-12">
                <div className="space-y-2 md:col-span-5">
                  {revisions.map((rev) => (
                    <button
                      key={rev.id}
                      type="button"
                      onClick={() => setPreviewRevision(rev)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors cursor-pointer ${
                        previewRevision?.id === rev.id
                          ? 'border-blue-600 bg-blue-50/70 dark:border-blue-500 dark:bg-blue-950/40'
                          : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-slate-100">
                        <span>Revisão #{rev.id}</span>
                        <span className="font-normal text-slate-500">
                          {new Date(rev.created_at).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                        Editor: <strong>{rev.editor_name || `ID #${rev.edited_by}`}</strong>
                      </p>
                      {rev.change_summary && (
                        <p className="mt-1 text-[11px] text-slate-500 italic">
                          &ldquo;{rev.change_summary}&rdquo;
                        </p>
                      )}
                    </button>
                  ))}
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950 md:col-span-7 overflow-y-auto max-h-[55vh]">
                  {previewRevision ? (
                    <div className="space-y-3">
                      <div className="border-b border-slate-200 pb-2 dark:border-slate-800">
                        <span className="text-[11px] font-bold uppercase text-slate-400">
                          Título Anterior
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {previewRevision.previous_title}
                        </h4>
                      </div>
                      <div>
                        <span className="text-[11px] font-bold uppercase text-slate-400">
                          Conteúdo Anterior Arquivado
                        </span>
                        <div
                          className="mt-2 prose prose-slate dark:prose-invert max-w-none text-xs"
                          dangerouslySetInnerHTML={{
                            __html: previewRevision.previous_content,
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Confirm Delete Article (Admin only) */}
      {articleToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-rose-200 bg-white p-6 shadow-xl dark:border-rose-900/60 dark:bg-slate-900">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/60">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Confirmar Exclusão de Artigo
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Esta ação é irreversível e removerá o manual e suas revisões.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                {articleToDelete.title}
              </p>
              <p className="mt-1 text-slate-500">
                Categoria: {articleToDelete.category_name || `#${articleToDelete.category_id}`}
              </p>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setArticleToDelete(null)}
                disabled={deletingArticle}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteArticle}
                disabled={deletingArticle}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer disabled:opacity-50"
              >
                {deletingArticle ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Excluir Definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
