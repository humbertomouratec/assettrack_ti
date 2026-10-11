package wiki

import (
	"errors"
	"strings"
	"time"
)

// AccessLevel constants matching the PostgreSQL CHECK constraint on wiki_permissions.
const (
	AccessNone  = "none"
	AccessRead  = "read"
	AccessWrite = "write"
)

// ContentFormat constants for rich-text storage in wiki_articles and wiki_article_revisions.
const (
	FormatHTML     = "html"
	FormatJSON     = "json"
	FormatMarkdown = "markdown"
)

// WikiModuleName is the canonical identifier in system_modules.
const WikiModuleName = "wiki"

// Domain errors used across repository, middleware, and HTTP handlers.
var (
	ErrModuleDisabled        = errors.New("o módulo de Wiki e Base de Conhecimento está desativado pelo administrador")
	ErrUnauthorized          = errors.New("usuário não autenticado ou inativo")
	ErrForbidden             = errors.New("acesso negado: você não possui permissão para realizar esta operação na Wiki")
	ErrNotFound              = errors.New("recurso não encontrado na Wiki")
	ErrCrossDepartmentAccess = errors.New("violação de escopo departamental: gestores só podem alterar permissões de categorias e usuários do seu próprio departamento")
	ErrInvalidPayload        = errors.New("dados da requisição inválidos")
)

// IsValidAccessLevel validates whether an access level string matches ('none', 'read', 'write').
func IsValidAccessLevel(level string) bool {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case AccessNone, AccessRead, AccessWrite:
		return true
	default:
		return false
	}
}

// NormalizeContentFormat returns a valid content_format ('html' or 'json') matching the PostgreSQL CHECK constraint.
func NormalizeContentFormat(format string) string {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case FormatJSON:
		return FormatJSON
	default:
		return FormatHTML
	}
}

// AuthenticatedUser represents the caller extracted from JWT / Gin context / HTTP headers.
// It is decoupled from GORM models so package wiki stays 100% isolated.
type AuthenticatedUser struct {
	ID           int64  `json:"id"`
	Email        string `json:"email"`
	Name         string `json:"name"`
	Role         string `json:"role"`
	DepartmentID *int64 `json:"department_id,omitempty"`
	IsActive     bool   `json:"is_active"`
}

// IsAdmin returns true if the user has the global 'admin' role.
func (u *AuthenticatedUser) IsAdmin() bool {
	return u != nil && strings.EqualFold(strings.TrimSpace(u.Role), "admin")
}

// HasManagerRole checks whether the user holds a managerial role in AssetTrack TI.
func (u *AuthenticatedUser) HasManagerRole() bool {
	if u == nil {
		return false
	}
	switch strings.ToLower(strings.TrimSpace(u.Role)) {
	case "gerente_ti", "gerente_infra", "gerente":
		return true
	default:
		return false
	}
}

// SystemModule maps to the "system_modules" table for global Feature Toggles.
type SystemModule struct {
	ID         int64     `json:"id"`
	ModuleName string    `json:"module_name"`
	IsEnabled  bool      `json:"is_enabled"`
	UpdatedBy  *int64    `json:"updated_by,omitempty"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// WikiCategory maps to the "wiki_categories" table.
// When DepartmentID is nil, it is a Global Category (visible to authenticated users, writable by Admin).
type WikiCategory struct {
	ID             int64     `json:"id"`
	Name           string    `json:"name"`
	Slug           string    `json:"slug"`
	Description    string    `json:"description"`
	DepartmentID   *int64    `json:"department_id"`
	DepartmentName string    `json:"department_name,omitempty"`
	CreatedBy      *int64    `json:"created_by,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// WikiArticle maps to the "wiki_articles" table.
type WikiArticle struct {
	ID              int64     `json:"id"`
	Title           string    `json:"title"`
	Slug            string    `json:"slug"`
	Summary         string    `json:"summary,omitempty"`
	Content         string    `json:"content"`
	ContentFormat   string    `json:"content_format"`
	CategoryID      int64     `json:"category_id"`
	CategoryName    string    `json:"category_name,omitempty"`
	DepartmentID    *int64    `json:"department_id"`
	AuthorID        *int64    `json:"author_id,omitempty"`
	AuthorName      string    `json:"author_name,omitempty"`
	UpdatedBy       *int64    `json:"updated_by,omitempty"`
	LastEditedBy    *int64    `json:"last_edited_by,omitempty"`
	IsPublished     bool      `json:"is_published"`
	EffectiveAccess string    `json:"effective_access,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// WikiPermission maps to the "wiki_permissions" table.
type WikiPermission struct {
	ID          int64     `json:"id"`
	UserID      int64     `json:"user_id"`
	CategoryID  int64     `json:"category_id"`
	AccessLevel string    `json:"access_level"`
	GrantedBy   *int64    `json:"granted_by,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// WikiArticleRevision maps to the "wiki_article_revisions" audit table.
type WikiArticleRevision struct {
	ID              int64     `json:"id"`
	ArticleID       int64     `json:"article_id"`
	EditedBy        *int64    `json:"edited_by,omitempty"`
	EditorName      string    `json:"editor_name,omitempty"`
	PreviousTitle   string    `json:"previous_title"`
	PreviousContent string    `json:"previous_content"`
	ContentFormat   string    `json:"content_format"`
	ChangeSummary   string    `json:"change_summary"`
	ChangeNote      string    `json:"change_note,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

// CreateCategoryRequest represents the payload to create a new Wiki category.
type CreateCategoryRequest struct {
	Name         string `json:"name"`
	Slug         string `json:"slug"`
	Description  string `json:"description"`
	DepartmentID *int64 `json:"department_id"`
}

// CreateArticleRequest represents the payload to create a new Wiki article.
type CreateArticleRequest struct {
	Title         string `json:"title"`
	Slug          string `json:"slug"`
	Content       string `json:"content"`
	ContentFormat string `json:"content_format"`
	CategoryID    int64  `json:"category_id"`
	IsPublished   *bool  `json:"is_published,omitempty"`
}

// UpdateArticleRequest represents the payload to update an existing Wiki article and record a revision.
type UpdateArticleRequest struct {
	Title         string `json:"title"`
	Content       string `json:"content"`
	ContentFormat string `json:"content_format"`
	ChangeSummary string `json:"change_summary"`
	IsPublished   *bool  `json:"is_published,omitempty"`
}

// BulkPermissionItem represents a single (user_id, category_id, access_level) assignment.
type BulkPermissionItem struct {
	UserID      int64  `json:"user_id"`
	CategoryID  int64  `json:"category_id"`
	AccessLevel string `json:"access_level"`
}

// BulkPermissionUpdateRequest is sent by a Department Manager (or Admin) to update team permissions in batch.
type BulkPermissionUpdateRequest struct {
	DepartmentID int64                `json:"department_id"`
	Permissions  []BulkPermissionItem `json:"permissions"`
}

// BulkPermissionUpdateResponse summarizes a completed batch permission update.
type BulkPermissionUpdateResponse struct {
	DepartmentID int64     `json:"department_id"`
	UpdatedCount int       `json:"updated_count"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// DepartmentMemberDTO represents an active employee belonging to a department.
type DepartmentMemberDTO struct {
	ID           int64  `json:"id"`
	UserID       int64  `json:"user_id"`
	Name         string `json:"name"`
	Email        string `json:"email"`
	Cargo        string `json:"cargo,omitempty"`
	Role         string `json:"role"`
	DepartmentID int64  `json:"department_id"`
}

// DepartmentMemberPermissionDTO powers the React Manager RBAC Matrix UI.
type DepartmentMemberPermissionDTO struct {
	DepartmentID   int64                 `json:"department_id"`
	DepartmentName string                `json:"department_name"`
	Categories     []WikiCategory        `json:"categories"`
	Members        []DepartmentMemberDTO `json:"members"`
	Employees      []DepartmentMemberDTO `json:"employees"`
	Permissions    []WikiPermission      `json:"permissions"`
}

// DepartmentSummaryDTO represents a department managed by the current user or Admin.
type DepartmentSummaryDTO struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	Nome          string `json:"nome"`
	ResponsavelID *int64 `json:"responsavel_id,omitempty"`
}

// ModuleToggleRequest is the payload for Admin to enable/disable the Wiki module.
type ModuleToggleRequest struct {
	IsEnabled bool `json:"is_enabled"`
}

// UploadMediaResponse is returned after a validated rich-text media upload to ./uploads/wiki/.
type UploadMediaResponse struct {
	URL          string    `json:"url"`
	Filename     string    `json:"filename"`
	OriginalName string    `json:"original_name"`
	Size         int64     `json:"size"`
	MimeType     string    `json:"mime_type"`
	UploadedAt   time.Time `json:"uploaded_at"`
}
