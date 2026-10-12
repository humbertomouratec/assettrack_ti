package wiki

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// WikiHandler provides net/http handlers for Wiki articles, revisions, RBAC bulk permissions, and module toggling.
type WikiHandler struct {
	repo        *WikiRepository
	toggleCache *FeatureToggleCache
}

// NewWikiHandler creates a new WikiHandler wired with a WikiRepository and an optional shared FeatureToggleCache.
func NewWikiHandler(repo *WikiRepository, optionalCache ...*FeatureToggleCache) *WikiHandler {
	var cache *FeatureToggleCache
	if len(optionalCache) > 0 && optionalCache[0] != nil {
		cache = optionalCache[0]
	} else {
		cache = NewFeatureToggleCache(repo, DefaultFeatureToggleTTL)
	}
	return &WikiHandler{
		repo:        repo,
		toggleCache: cache,
	}
}

// ToggleCache returns the handler's FeatureToggleCache instance so routers can share the same cache with middleware.
func (h *WikiHandler) ToggleCache() *FeatureToggleCache {
	return h.toggleCache
}

// ListArticles handles GET /api/v1/wiki/articles.
// Applies strict SQL RBAC filtering so the caller only receives articles they are authorized to read or write.
func (h *WikiHandler) ListArticles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "Método não permitido")
		return
	}

	user, err := ExtractAuthenticatedUser(r)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}

	var categoryIDFilter *int64
	if rawCat := strings.TrimSpace(r.URL.Query().Get("category_id")); rawCat != "" {
		parsedCat, err := strconv.ParseInt(rawCat, 10, 64)
		if err != nil || parsedCat <= 0 {
			writeJSONError(w, http.StatusBadRequest, "Parâmetro category_id inválido")
			return
		}
		categoryIDFilter = &parsedCat
	}

	searchQuery := strings.TrimSpace(r.URL.Query().Get("search"))
	if searchQuery == "" {
		searchQuery = strings.TrimSpace(r.URL.Query().Get("q"))
	}

	articles, err := h.repo.ListAccessibleArticles(r.Context(), user, categoryIDFilter, searchQuery)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"articles": articles,
		"count":    len(articles),
	})
}

// GetArticle handles GET /api/v1/wiki/articles/{id}.
func (h *WikiHandler) GetArticle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "Método não permitido")
		return
	}

	user, err := ExtractAuthenticatedUser(r)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}

	articleID, err := extractPathInt64(r, "id", "articles")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "ID do artigo inválido")
		return
	}

	article, err := h.repo.GetAccessibleArticleByID(r.Context(), user, articleID)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, article)
}

// CreateArticle handles POST /api/v1/wiki/articles.
func (h *WikiHandler) CreateArticle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Método não permitido")
		return
	}

	user, err := ExtractAuthenticatedUser(r)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}

	var req CreateArticleRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 10<<20)) // 10MB max JSON body
	if err := decoder.Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Corpo JSON inválido para criação de artigo")
		return
	}

	isPublished := true
	if req.IsPublished != nil {
		isPublished = *req.IsPublished
	}

	article := &WikiArticle{
		Title:         req.Title,
		Slug:          req.Slug,
		Content:       req.Content,
		ContentFormat: req.ContentFormat,
		CategoryID:    req.CategoryID,
		IsPublished:   isPublished,
	}

	created, err := h.repo.CreateArticle(r.Context(), article, user)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, created)
}

// UpdateArticle handles PUT /api/v1/wiki/articles/{id}.
// Automatically records the previous title and content in wiki_article_revisions inside a transaction.
func (h *WikiHandler) UpdateArticle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPatch {
		writeJSONError(w, http.StatusMethodNotAllowed, "Método não permitido")
		return
	}

	user, err := ExtractAuthenticatedUser(r)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}

	articleID, err := extractPathInt64(r, "id", "articles")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "ID do artigo inválido")
		return
	}

	var req UpdateArticleRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 10<<20))
	if err := decoder.Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Corpo JSON inválido para edição de artigo")
		return
	}

	updated, err := h.repo.UpdateArticleWithRevision(
		r.Context(),
		articleID,
		req.Title,
		req.Content,
		req.ContentFormat,
		req.ChangeSummary,
		user,
	)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, updated)
}

// DeleteArticle handles DELETE /api/v1/wiki/articles/{id}.
// Only global administrators ('admin') are authorized to delete articles.
func (h *WikiHandler) DeleteArticle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeJSONError(w, http.StatusMethodNotAllowed, "Método não permitido")
		return
	}

	user, err := ExtractAuthenticatedUser(r)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}

	if !user.IsAdmin() {
		writeJSONError(w, http.StatusForbidden, "Apenas administradores globais podem excluir artigos da Wiki")
		return
	}

	articleID, err := extractPathInt64(r, "id", "articles")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "ID do artigo inválido")
		return
	}

	if err := h.repo.DeleteArticle(r.Context(), user, articleID); err != nil {
		h.handleDomainError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"message":    "Artigo excluído com sucesso",
		"article_id": articleID,
	})
}

// ListArticleRevisions handles GET /api/v1/wiki/articles/{id}/revisions.
func (h *WikiHandler) ListArticleRevisions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "Método não permitido")
		return
	}

	user, err := ExtractAuthenticatedUser(r)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}

	articleID, err := extractPathInt64(r, "id", "articles")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "ID do artigo inválido")
		return
	}

	revisions, err := h.repo.ListArticleRevisions(r.Context(), user, articleID)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"article_id": articleID,
		"revisions":  revisions,
		"count":      len(revisions),
	})
}

// GetDepartmentPermissionsMatrix handles GET /api/v1/wiki/departments/{departmentId}/permissions-matrix.
// Returns the department's members, its Wiki categories, and current access levels for the Manager UI.
func (h *WikiHandler) GetDepartmentPermissionsMatrix(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "Método não permitido")
		return
	}

	user, err := ExtractAuthenticatedUser(r)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}

	deptID, err := extractPathInt64(r, "departmentId", "departments")
	if err != nil {
		// Fallback to query parameter or caller's own department_id
		if rawQueryDept := strings.TrimSpace(r.URL.Query().Get("department_id")); rawQueryDept != "" {
			deptID, err = strconv.ParseInt(rawQueryDept, 10, 64)
		} else if user.DepartmentID != nil && *user.DepartmentID > 0 {
			deptID = *user.DepartmentID
			err = nil
		}
		if err != nil || deptID <= 0 {
			writeJSONError(w, http.StatusBadRequest, "ID do departamento inválido")
			return
		}
	}

	matrix, err := h.repo.GetDepartmentPermissionsMatrix(r.Context(), user, deptID)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, matrix)
}

// BulkUpdatePermissions handles PUT/POST /api/v1/wiki/permissions/bulk.
// Enforces strict anti-IDOR checks ensuring a Department Manager cannot alter permissions for categories
// or users belonging to other departments.
func (h *WikiHandler) BulkUpdatePermissions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Método não permitido")
		return
	}

	user, err := ExtractAuthenticatedUser(r)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}

	var req BulkPermissionUpdateRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2<<20)) // 2MB max payload
	if err := decoder.Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Payload JSON inválido para atualização em lote de permissões")
		return
	}

	if req.DepartmentID <= 0 && user.DepartmentID != nil && *user.DepartmentID > 0 {
		req.DepartmentID = *user.DepartmentID
	}

	resp, err := h.repo.BulkUpdatePermissions(r.Context(), user, req)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

// ToggleWikiModule handles PUT/POST /api/v1/wiki/admin/module-toggle.
// Restricted to global Admins; updates system_modules and immediately invalidates the FeatureToggleCache.
func (h *WikiHandler) ToggleWikiModule(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Método não permitido")
		return
	}

	user, err := ExtractAuthenticatedUser(r)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}
	if !user.IsAdmin() {
		writeJSONError(w, http.StatusForbidden, "Apenas administradores globais podem ativar ou desativar o módulo de Wiki")
		return
	}

	var req ModuleToggleRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	if err := decoder.Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Payload JSON inválido")
		return
	}

	if err := h.repo.SetModuleEnabled(r.Context(), WikiModuleName, req.IsEnabled, user.ID); err != nil {
		h.handleDomainError(w, err)
		return
	}

	if h.toggleCache != nil {
		h.toggleCache.Invalidate()
		h.toggleCache.SetCachedState(req.IsEnabled)
	}

	writeJSON(w, http.StatusOK, SystemModule{
		ModuleName: WikiModuleName,
		IsEnabled:  req.IsEnabled,
		UpdatedBy:  &user.ID,
		UpdatedAt:  time.Now().UTC(),
	})
}

// GetWikiModuleStatus handles GET /api/v1/wiki/admin/module-status.
func (h *WikiHandler) GetWikiModuleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "Método não permitido")
		return
	}
	enabled, err := h.repo.IsModuleEnabled(r.Context(), WikiModuleName)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, SystemModule{
		ModuleName: WikiModuleName,
		IsEnabled:  enabled,
		UpdatedAt:  time.Now().UTC(),
	})
}

// ListCategories handles GET /api/v1/wiki/categories.
func (h *WikiHandler) ListCategories(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "Método não permitido")
		return
	}
	user, err := ExtractAuthenticatedUser(r)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}
	categories, err := h.repo.ListAccessibleCategories(r.Context(), user)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"categories": categories,
		"count":      len(categories),
	})
}

// CreateCategory handles POST /api/v1/wiki/categories.
func (h *WikiHandler) CreateCategory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Método não permitido")
		return
	}
	user, err := ExtractAuthenticatedUser(r)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}
	var req CreateCategoryRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<10))
	if err := decoder.Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Corpo JSON inválido para criação de categoria")
		return
	}
	created, err := h.repo.CreateCategory(r.Context(), req, user)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

// ListManageableDepartments handles GET /api/v1/wiki/departments.
func (h *WikiHandler) ListManageableDepartments(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "Método não permitido")
		return
	}
	user, err := ExtractAuthenticatedUser(r)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}
	depts, err := h.repo.ListManageableDepartments(r.Context(), user)
	if err != nil {
		h.handleDomainError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"departments": depts,
		"count":       len(depts),
	})
}

// handleDomainError translates domain errors into standardized HTTP status codes and JSON bodies.
func (h *WikiHandler) handleDomainError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrModuleDisabled):
		writeJSONError(w, http.StatusForbidden, err.Error(), map[string]any{"error": "module_disabled"})
	case errors.Is(err, ErrUnauthorized):
		writeJSONError(w, http.StatusUnauthorized, err.Error(), map[string]any{"error": "unauthorized"})
	case errors.Is(err, ErrCrossDepartmentAccess):
		writeJSONError(w, http.StatusForbidden, err.Error(), map[string]any{"error": "cross_department_access_denied"})
	case errors.Is(err, ErrForbidden):
		writeJSONError(w, http.StatusForbidden, err.Error(), map[string]any{"error": "forbidden"})
	case errors.Is(err, ErrNotFound):
		writeJSONError(w, http.StatusNotFound, err.Error(), map[string]any{"error": "not_found"})
	case errors.Is(err, ErrInvalidPayload):
		writeJSONError(w, http.StatusBadRequest, err.Error(), map[string]any{"error": "invalid_payload"})
	default:
		writeJSONError(w, http.StatusInternalServerError, "Erro interno ao processar requisição na Wiki")
	}
}

// extractPathInt64 extracts an int64 path parameter by name (Go 1.22+ PathValue) or by locating the segment
// immediately following anchorSegment in r.URL.Path.
func extractPathInt64(r *http.Request, paramName string, anchorSegment string) (int64, error) {
	if raw := strings.TrimSpace(r.PathValue(paramName)); raw != "" {
		val, err := strconv.ParseInt(raw, 10, 64)
		if err == nil && val > 0 {
			return val, nil
		}
	}

	segments := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	for i := 0; i < len(segments)-1; i++ {
		if segments[i] == anchorSegment {
			val, err := strconv.ParseInt(segments[i+1], 10, 64)
			if err == nil && val > 0 {
				return val, nil
			}
		}
	}

	return 0, ErrInvalidPayload
}
