import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileEdit,
  Filter,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';

export type WikiAccessLevel = 'none' | 'read' | 'write';

export interface WikiEmployee {
  id: number;
  name: string;
  email: string;
  role?: string;
  cargo?: string;
}

export interface WikiCategoryItem {
  id: number;
  name: string;
  slug: string;
  description?: string;
  department_id: number | null;
}

export interface WikiPermissionEntry {
  user_id: number;
  category_id: number;
  access_level: WikiAccessLevel;
}

export interface WikiDepartmentMatrixResponse {
  department_id: number;
  department_name?: string;
  employees: WikiEmployee[];
  categories: WikiCategoryItem[];
  permissions: WikiPermissionEntry[];
}

export interface BulkPermissionsUpdatePayload {
  department_id: number;
  permissions: WikiPermissionEntry[];
}

export interface WikiDepartmentPermissionsPanelProps {
  departmentId: number;
  departmentName?: string;
  apiBaseUrl?: string;
  authToken?: string;
  initialData?: WikiDepartmentMatrixResponse;
  onSaveSuccess?: (updatedCount: number) => void;
}

type CellKey = `${number}:${number}`;

const ACCESS_OPTIONS: ReadonlyArray<{
  value: WikiAccessLevel;
  label: string;
  shortLabel: string;
  description: string;
  activeClass: string;
}> = [
  {
    value: 'none',
    label: 'Sem Acesso',
    shortLabel: 'Bloqueado',
    description: 'Categoria oculta para o colaborador',
    activeClass:
      'bg-slate-800 text-white border-slate-900 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-500',
  },
  {
    value: 'read',
    label: 'Leitura',
    shortLabel: 'Leitura',
    description: 'Visualiza artigos e procedimentos da categoria',
    activeClass:
      'bg-blue-600 text-white border-blue-700 dark:bg-blue-500 dark:text-slate-950 dark:border-blue-400',
  },
  {
    value: 'write',
    label: 'Escrita',
    shortLabel: 'Escrita',
    description: 'Cria e edita artigos nesta categoria',
    activeClass:
      'bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:border-emerald-400',
  },
];

function makeCellKey(userId: number, categoryId: number): CellKey {
  return `${userId}:${categoryId}`;
}

function parseCellKey(key: CellKey): { user_id: number; category_id: number } {
  const [u, c] = key.split(':');
  return { user_id: Number(u), category_id: Number(c) };
}

export const WikiDepartmentPermissionsPanel: React.FC<WikiDepartmentPermissionsPanelProps> = ({
  departmentId,
  departmentName,
  apiBaseUrl = '',
  authToken,
  initialData,
  onSaveSuccess,
}) => {
  const searchInputId = useId();
  const filterLevelId = useId();

  const [employees, setEmployees] = useState<WikiEmployee[]>(initialData?.employees ?? []);
  const [categories, setCategories] = useState<WikiCategoryItem[]>(initialData?.categories ?? []);
  const [resolvedDeptName, setResolvedDeptName] = useState<string>(
    initialData?.department_name ?? departmentName ?? `Departamento #${departmentId}`
  );

  // Baseline state from backend vs current working state
  const [baselineMatrix, setBaselineMatrix] = useState<Record<CellKey, WikiAccessLevel>>({});
  const [currentMatrix, setCurrentMatrix] = useState<Record<CellKey, WikiAccessLevel>>({});

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [accessFilter, setAccessFilter] = useState<'all' | 'dirty' | WikiAccessLevel>('all');

  const [isLoading, setIsLoading] = useState<boolean>(!initialData);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const buildHeaders = useCallback((): HeadersInit => {
    const token =
      authToken ??
      (typeof window !== 'undefined' ? window.localStorage.getItem('token') ?? undefined : undefined);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }, [authToken]);

  const hydrateMatrixState = useCallback((data: WikiDepartmentMatrixResponse) => {
    setEmployees(data.employees ?? []);
    setCategories(data.categories ?? []);
    if (data.department_name) {
      setResolvedDeptName(data.department_name);
    }

    const nextMap: Record<CellKey, WikiAccessLevel> = {};
    for (const emp of data.employees ?? []) {
      for (const cat of data.categories ?? []) {
        nextMap[makeCellKey(emp.id, cat.id)] = 'none';
      }
    }

    for (const perm of data.permissions ?? []) {
      const normalizedLevel: WikiAccessLevel =
        perm.access_level === 'read' || perm.access_level === 'write' ? perm.access_level : 'none';
      nextMap[makeCellKey(perm.user_id, perm.category_id)] = normalizedLevel;
    }

    setBaselineMatrix(nextMap);
    setCurrentMatrix({ ...nextMap });
  }, []);

  const fetchPermissionsMatrix = useCallback(async () => {
    if (initialData) {
      hydrateMatrixState(initialData);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setStatusBanner(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/wiki/departments/${departmentId}/permissions-matrix`,
        {
          method: 'GET',
          headers: buildHeaders(),
        }
      );

      if (response.status === 403) {
        throw new Error(
          'Acesso negado (403): o módulo Wiki está desativado ou você não é o gestor responsável por este departamento.'
        );
      }

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(
          (errBody as { error?: string }).error ||
            `Falha ao carregar matriz de permissões (HTTP ${response.status}).`
        );
      }

      const payload = (await response.json()) as WikiDepartmentMatrixResponse;
      hydrateMatrixState(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado ao carregar permissões.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, buildHeaders, departmentId, hydrateMatrixState, initialData]);

  useEffect(() => {
    void fetchPermissionsMatrix();
  }, [fetchPermissionsMatrix]);

  // Compute pending ("dirty") modifications compared to baseline
  const dirtyChanges = useMemo<WikiPermissionEntry[]>(() => {
    const entries: WikiPermissionEntry[] = [];
    const allKeys = new Set([
      ...Object.keys(baselineMatrix),
      ...Object.keys(currentMatrix),
    ]) as Set<CellKey>;

    allKeys.forEach((key) => {
      const baseLevel = baselineMatrix[key] ?? 'none';
      const currentLevel = currentMatrix[key] ?? 'none';
      if (baseLevel !== currentLevel) {
        const { user_id, category_id } = parseCellKey(key);
        entries.push({
          user_id,
          category_id,
          access_level: currentLevel,
        });
      }
    });

    return entries;
  }, [baselineMatrix, currentMatrix]);

  const dirtyLookup = useMemo<Set<CellKey>>(() => {
    return new Set(dirtyChanges.map((item) => makeCellKey(item.user_id, item.category_id)));
  }, [dirtyChanges]);

  const handleAccessChange = useCallback(
    (userId: number, categoryId: number, nextLevel: WikiAccessLevel) => {
      const key = makeCellKey(userId, categoryId);
      setStatusBanner(null);
      setCurrentMatrix((prev) => ({
        ...prev,
        [key]: nextLevel,
      }));
    },
    []
  );

  // Quick row action: apply access level to all categories for a single employee
  const handleApplyRowLevel = useCallback(
    (userId: number, level: WikiAccessLevel) => {
      setStatusBanner(null);
      setCurrentMatrix((prev) => {
        const updated = { ...prev };
        for (const cat of categories) {
          updated[makeCellKey(userId, cat.id)] = level;
        }
        return updated;
      });
    },
    [categories]
  );

  // Quick column action: apply access level to all filtered employees for a single category
  const handleApplyColumnLevel = useCallback(
    (categoryId: number, level: WikiAccessLevel, targetEmployees: WikiEmployee[]) => {
      setStatusBanner(null);
      setCurrentMatrix((prev) => {
        const updated = { ...prev };
        for (const emp of targetEmployees) {
          updated[makeCellKey(emp.id, categoryId)] = level;
        }
        return updated;
      });
    },
    []
  );

  const handleDiscardChanges = useCallback(() => {
    setCurrentMatrix({ ...baselineMatrix });
    setStatusBanner(null);
    setErrorMessage(null);
  }, [baselineMatrix]);

  const handleSaveBulkPermissions = useCallback(async () => {
    if (dirtyChanges.length === 0 || isSaving) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setStatusBanner(null);

    const payload: BulkPermissionsUpdatePayload = {
      department_id: departmentId,
      permissions: dirtyChanges,
    };

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/wiki/permissions/bulk`, {
        method: 'PUT',
        headers: buildHeaders(),
        body: JSON.stringify(payload),
      });

      if (response.status === 403) {
        throw new Error(
          'Operação bloqueada (403): apenas o gestor responsável pelo departamento ou Administrador pode salvar permissões.'
        );
      }

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(
          (errBody as { error?: string }).error ||
            `Falha ao salvar permissões em lote (HTTP ${response.status}).`
        );
      }

      const savedCount = dirtyChanges.length;
      setBaselineMatrix({ ...currentMatrix });
      setStatusBanner(
        `${savedCount} ${savedCount === 1 ? 'permissão atualizada' : 'permissões atualizadas'} com sucesso no lote.`
      );
      onSaveSuccess?.(savedCount);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Erro de comunicação ao salvar o lote de permissões.';
      setErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  }, [apiBaseUrl, buildHeaders, currentMatrix, departmentId, dirtyChanges, isSaving, onSaveSuccess]);

  const filteredEmployees = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase();

    return employees.filter((emp) => {
      const matchesText =
        normalizedQuery.length === 0 ||
        (emp.name || '').toLowerCase().includes(normalizedQuery) ||
        (emp.email || '').toLowerCase().includes(normalizedQuery) ||
        (emp.cargo && emp.cargo.toLowerCase().includes(normalizedQuery));

      if (!matchesText) {
        return false;
      }

      if (accessFilter === 'all') {
        return true;
      }

      if (accessFilter === 'dirty') {
        return categories.some((cat) => dirtyLookup.has(makeCellKey(emp.id, cat.id)));
      }

      return categories.some(
        (cat) => (currentMatrix[makeCellKey(emp.id, cat.id)] ?? 'none') === accessFilter
      );
    });
  }, [accessFilter, categories, currentMatrix, dirtyLookup, employees, searchTerm]);

  const renderLevelIcon = (level: WikiAccessLevel) => {
    if (level === 'write') {
      return <FileEdit className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
    }
    if (level === 'read') {
      return <Eye className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
    }
    return <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
  };

  return (
    <section
      aria-label="Matriz de Permissões da Wiki por Departamento"
      className="w-full bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 shadow-xs"
    >
      {/* Swiss Technical Header */}
      <header className="border-b border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-6 py-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-blue-600 dark:text-blue-400">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            <span>RBAC Granular • Painel do Gestor de Setor</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Controle de Acesso da Wiki — {resolvedDeptName}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
            Defina o nível de acesso individual de cada colaborador às categorias técnicas do seu
            departamento. As alterações são validadas e enviadas em lote transacional.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="px-3 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <span>{employees.length} Colaboradores</span>
            <span className="text-slate-400">|</span>
            <span>{categories.length} Categorias</span>
          </div>

          <button
            type="button"
            onClick={() => void fetchPermissionsMatrix()}
            disabled={isLoading || isSaving}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold uppercase tracking-wider border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Recarregar Matriz</span>
          </button>
        </div>
      </header>

      {/* Filter & Legend Toolbar */}
      <div className="border-b border-slate-300 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-900/90 px-6 py-3.5 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        <div className="md:col-span-5 relative">
          <label htmlFor={searchInputId} className="sr-only">
            Filtrar colaborador por nome, e-mail ou cargo
          </label>
          <Search
            className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id={searchInputId}
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar colaborador por nome, e-mail ou cargo..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          />
        </div>

        <div className="md:col-span-4 flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
          <label
            htmlFor={filterLevelId}
            className="text-xs font-mono uppercase tracking-wider text-slate-600 dark:text-slate-400 shrink-0"
          >
            Filtro:
          </label>
          <select
            id={filterLevelId}
            value={accessFilter}
            onChange={(e) =>
              setAccessFilter(e.target.value as 'all' | 'dirty' | WikiAccessLevel)
            }
            className="w-full py-2 px-2.5 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <option value="all">Todos os colaboradores</option>
            <option value="dirty">Com alterações pendentes ({dirtyChanges.length})</option>
            <option value="write">Com permissão de Escrita (write)</option>
            <option value="read">Com permissão de Leitura (read)</option>
            <option value="none">Sem Acesso em alguma categoria (none)</option>
          </select>
        </div>

        <div className="md:col-span-3 flex items-center justify-end gap-3 text-xs font-mono">
          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
            <span className="w-2.5 h-2.5 bg-orange-500 inline-block" aria-hidden="true" />
            Pendentes: <strong className="text-slate-900 dark:text-white">{dirtyChanges.length}</strong>
          </span>
        </div>
      </div>

      {/* Feedback Banners */}
      {errorMessage && (
        <div
          role="alert"
          className="mx-6 mt-4 p-4 border-l-4 border-red-600 bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-200 flex items-start gap-3 text-sm"
        >
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-semibold">Não foi possível concluir a operação</p>
            <p className="mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {statusBanner && (
        <div
          role="status"
          className="mx-6 mt-4 p-4 border-l-4 border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 flex items-center gap-3 text-sm"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
          <span className="font-medium">{statusBanner}</span>
        </div>
      )}

      {/* Matrix Content */}
      <div className="p-6">
        {isLoading ? (
          <div
            role="status"
            aria-live="polite"
            className="py-16 flex flex-col items-center justify-center gap-3 border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          >
            <Loader2 className="w-7 h-7 animate-spin text-blue-600" aria-hidden="true" />
            <p className="text-sm font-mono text-slate-600 dark:text-slate-400">
              Carregando funcionários e categorias do departamento...
            </p>
          </div>
        ) : categories.length === 0 ? (
          <div className="py-12 px-6 text-center border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
            <p className="text-base font-semibold text-slate-800 dark:text-slate-200">
              Nenhuma categoria da Wiki cadastrada para este departamento.
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Crie categorias setoriais para liberar o controle granular de leitura e escrita.
            </p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="py-12 px-6 text-center border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
            <p className="text-base font-semibold text-slate-800 dark:text-slate-200">
              Nenhum colaborador encontrado para o filtro selecionado.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900">
                  <th
                    scope="col"
                    className="p-4 min-w-[260px] border-r border-slate-300 dark:border-slate-700 text-xs font-mono uppercase tracking-wider text-slate-700 dark:text-slate-300"
                  >
                    Colaborador do Setor
                  </th>

                  {categories.map((category) => (
                    <th
                      key={category.id}
                      scope="col"
                      className="p-4 min-w-[250px] border-r border-slate-300 dark:border-slate-700 align-top"
                    >
                      <div className="flex flex-col gap-2">
                        <div>
                          <span className="text-xs font-mono uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                            /{category.slug}
                          </span>
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            {category.name}
                          </span>
                        </div>

                        {/* Column bulk preset buttons */}
                        <div className="flex items-center gap-1 pt-1 border-t border-slate-200 dark:border-slate-800">
                          <span className="text-[11px] font-mono text-slate-500 mr-1">
                            Coluna:
                          </span>
                          {ACCESS_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() =>
                                handleApplyColumnLevel(
                                  category.id,
                                  opt.value,
                                  filteredEmployees
                                )
                              }
                              title={`Aplicar "${opt.label}" para todos os colaboradores listados na categoria ${category.name}`}
                              aria-label={`Aplicar ${opt.label} na coluna ${category.name}`}
                              className="px-2 py-0.5 text-[11px] font-mono border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer"
                            >
                              {opt.shortLabel}
                            </button>
                          ))}
                        </div>
                      </div>
                    </th>
                  ))}

                  <th
                    scope="col"
                    className="p-4 min-w-[180px] text-xs font-mono uppercase tracking-wider text-slate-700 dark:text-slate-300"
                  >
                    Ação Rápida (Linha)
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredEmployees.map((employee) => {
                  const rowHasDirtyCell = categories.some((cat) =>
                    dirtyLookup.has(makeCellKey(employee.id, cat.id))
                  );

                  return (
                    <tr
                      key={employee.id}
                      className={
                        rowHasDirtyCell
                          ? 'bg-orange-50/40 dark:bg-orange-950/15'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
                      }
                    >
                      {/* Employee Info Cell */}
                      <th
                        scope="row"
                        className="p-4 border-r border-slate-300 dark:border-slate-700 align-middle"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            {employee.name}
                            {rowHasDirtyCell && (
                              <span
                                className="px-1.5 py-0.5 text-[10px] font-mono uppercase bg-orange-500 text-white"
                                title="Possui alterações não salvas"
                              >
                                Editado
                              </span>
                            )}
                          </span>
                          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            {employee.email}
                          </span>
                          {employee.cargo && (
                            <span className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                              {employee.cargo}
                            </span>
                          )}
                        </div>
                      </th>

                      {/* Segmented Access Selector Cells */}
                      {categories.map((category) => {
                        const cellKey = makeCellKey(employee.id, category.id);
                        const currentLevel = currentMatrix[cellKey] ?? 'none';
                        const isDirty = dirtyLookup.has(cellKey);

                        return (
                          <td
                            key={category.id}
                            className={`p-3 border-r border-slate-300 dark:border-slate-700 align-middle transition-colors ${
                              isDirty
                                ? 'bg-orange-50/70 dark:bg-orange-950/30 ring-1 ring-inset ring-orange-500'
                                : ''
                            }`}
                          >
                            <div
                              role="radiogroup"
                              aria-label={`Nível de acesso de ${employee.name} em ${category.name}`}
                              className="grid grid-cols-3 border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 p-0.5 gap-0.5"
                            >
                              {ACCESS_OPTIONS.map((option) => {
                                const isSelected = currentLevel === option.value;
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={isSelected}
                                    onClick={() =>
                                      handleAccessChange(
                                        employee.id,
                                        category.id,
                                        option.value
                                      )
                                    }
                                    title={option.description}
                                    className={`flex items-center justify-center gap-1 py-1.5 px-2 text-xs font-medium border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                                      isSelected
                                        ? option.activeClass
                                        : 'border-transparent bg-transparent text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                                    }`}
                                  >
                                    {renderLevelIcon(option.value)}
                                    <span>{option.shortLabel}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                        );
                      })}

                      {/* Row Quick Actions */}
                      <td className="p-3 align-middle">
                        <div className="flex items-center gap-1">
                          {ACCESS_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => handleApplyRowLevel(employee.id, opt.value)}
                              title={`Definir todas as categorias de ${employee.name} como ${opt.label}`}
                              aria-label={`Definir linha de ${employee.name} como ${opt.label}`}
                              className="px-2 py-1 text-xs font-mono border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer"
                            >
                              {opt.shortLabel}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sticky Bulk Action Footer Bar */}
      <footer className="sticky bottom-0 z-10 border-t border-slate-300 dark:border-slate-700 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xs px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center justify-center px-2.5 py-1 text-xs font-mono font-bold uppercase ${
              dirtyChanges.length > 0
                ? 'bg-orange-500 text-white'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            {dirtyChanges.length} {dirtyChanges.length === 1 ? 'alteração' : 'alterações'}
          </span>
          <span className="text-sm text-slate-600 dark:text-slate-400">
            {dirtyChanges.length > 0
              ? 'Modificações prontas para envio em lote ao servidor.'
              : 'Nenhuma modificação pendente na matriz.'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDiscardChanges}
            disabled={dirtyChanges.length === 0 || isSaving}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span>Descartar</span>
          </button>

          <button
            type="button"
            onClick={() => void handleSaveBulkPermissions()}
            disabled={dirtyChanges.length === 0 || isSaving}
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold uppercase tracking-wider bg-orange-500 hover:bg-orange-600 text-white border border-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="w-4 h-4" aria-hidden="true" />
            )}
            <span>Salvar Alterações em Lote ({dirtyChanges.length})</span>
          </button>
        </div>
      </footer>
    </section>
  );
};

export default WikiDepartmentPermissionsPanel;
