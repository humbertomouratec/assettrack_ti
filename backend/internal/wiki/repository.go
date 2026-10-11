package wiki

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// WikiRepository encapsulates all PostgreSQL (database/sql) operations for the Wiki module.
type WikiRepository struct {
	db *sql.DB
}

// NewWikiRepository creates a new WikiRepository backed by a standard *sql.DB connection pool.
func NewWikiRepository(db *sql.DB) *WikiRepository {
	return &WikiRepository{db: db}
}

// DB exposes the underlying *sql.DB handle when needed by adapters.
func (r *WikiRepository) DB() *sql.DB {
	return r.db
}

// IsModuleEnabled checks the system_modules table to determine if a module (e.g. 'wiki') is active.
// If the row does not exist yet, it fails closed (returns false, nil).
func (r *WikiRepository) IsModuleEnabled(ctx context.Context, moduleName string) (bool, error) {
	if r == nil || r.db == nil {
		return false, errors.New("wiki repository: database connection is nil")
	}

	const query = `
		SELECT is_enabled
		FROM system_modules
		WHERE module_name = $1
		LIMIT 1
	`

	var enabled bool
	err := r.db.QueryRowContext(ctx, query, strings.TrimSpace(moduleName)).Scan(&enabled)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("failed to query system_modules for %q: %w", moduleName, err)
	}
	return enabled, nil
}

// SetModuleEnabled enables or disables a module in system_modules (UPSERT).
// An optional updatedBy user ID can be provided for signature flexibility.
func (r *WikiRepository) SetModuleEnabled(ctx context.Context, moduleName string, enabled bool, updatedBy ...int64) error {
	if r == nil || r.db == nil {
		return errors.New("wiki repository: database connection is nil")
	}

	const query = `
		INSERT INTO system_modules (module_name, is_enabled, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (module_name)
		DO UPDATE SET
			is_enabled = EXCLUDED.is_enabled,
			updated_at = NOW()
	`

	_, err := r.db.ExecContext(ctx, query, strings.TrimSpace(moduleName), enabled)
	if err != nil {
		return fmt.Errorf("failed to update system_modules for %q: %w", moduleName, err)
	}
	return nil
}

// IsDepartmentManager verifies whether a user is authorized to manage a specific department's Wiki.
// True if:
//  1. userRole is 'admin', OR
//  2. departamentos.responsavel_id = userID for departamentos.id = departmentID, OR
//  3. The user belongs to departmentID (users.departamento_id = departmentID) AND holds a managerial role ('gerente_ti', 'gerente_infra', 'gerente').
func (r *WikiRepository) IsDepartmentManager(ctx context.Context, userID int64, departmentID int64, userRole string) (bool, error) {
	if strings.EqualFold(strings.TrimSpace(userRole), "admin") {
		return true, nil
	}
	if userID <= 0 || departmentID <= 0 {
		return false, nil
	}

	const query = `
		SELECT EXISTS (
			SELECT 1
			FROM departamentos d
			LEFT JOIN users u ON u.id = $1 AND u.is_active = TRUE
			WHERE d.id = $2
			  AND (
			      d.responsavel_id = $1
			      OR (
			          u.departamento_id = d.id
			          AND LOWER(COALESCE(u.role, $3)) IN ('admin', 'gerente_ti', 'gerente_infra', 'gerente')
			      )
			  )
		)
	`

	var isManager bool
	err := r.db.QueryRowContext(ctx, query, userID, departmentID, strings.ToLower(strings.TrimSpace(userRole))).Scan(&isManager)
	if err != nil {
		return false, fmt.Errorf("failed to verify department manager status: %w", err)
	}
	return isManager, nil
}

// isDepartmentManagerTx performs the same check inside an active *sql.Tx transaction.
func (r *WikiRepository) isDepartmentManagerTx(ctx context.Context, tx *sql.Tx, userID int64, departmentID int64, userRole string) (bool, error) {
	if strings.EqualFold(strings.TrimSpace(userRole), "admin") {
		return true, nil
	}
	if userID <= 0 || departmentID <= 0 {
		return false, nil
	}

	const query = `
		SELECT EXISTS (
			SELECT 1
			FROM departamentos d
			LEFT JOIN users u ON u.id = $1 AND u.is_active = TRUE
			WHERE d.id = $2
			  AND (
			      d.responsavel_id = $1
			      OR (
			          u.departamento_id = d.id
			          AND LOWER(COALESCE(u.role, $3)) IN ('admin', 'gerente_ti', 'gerente_infra', 'gerente')
			      )
			  )
		)
	`

	var isManager bool
	err := tx.QueryRowContext(ctx, query, userID, departmentID, strings.ToLower(strings.TrimSpace(userRole))).Scan(&isManager)
	if err != nil {
		return false, fmt.Errorf("failed to verify department manager status in tx: %w", err)
	}
	return isManager, nil
}

// CanWriteCategory checks whether the authenticated user has write permission on the target category.
func (r *WikiRepository) CanWriteCategory(ctx context.Context, user *AuthenticatedUser, categoryID int64) (bool, error) {
	if user == nil || !user.IsActive || user.ID <= 0 {
		return false, ErrUnauthorized
	}
	if categoryID <= 0 {
		return false, ErrInvalidPayload
	}

	const catQuery = `SELECT department_id FROM wiki_categories WHERE id = $1`
	var deptID sql.NullInt64
	err := r.db.QueryRowContext(ctx, catQuery, categoryID).Scan(&deptID)
	if errors.Is(err, sql.ErrNoRows) {
		return false, ErrNotFound
	}
	if err != nil {
		return false, fmt.Errorf("failed to fetch category %d: %w", categoryID, err)
	}

	if user.IsAdmin() {
		return true, nil
	}

	// If departmental category, check if user is the manager of that department.
	if deptID.Valid {
		isMgr, err := r.IsDepartmentManager(ctx, user.ID, deptID.Int64, user.Role)
		if err != nil {
			return false, err
		}
		if isMgr {
			return true, nil
		}
	}

	// Otherwise, check explicit 'write' grant in wiki_permissions.
	const permQuery = `
		SELECT access_level
		FROM wiki_permissions
		WHERE user_id = $1 AND category_id = $2
		LIMIT 1
	`
	var accessLevel string
	err = r.db.QueryRowContext(ctx, permQuery, user.ID, categoryID).Scan(&accessLevel)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("failed to check wiki_permissions: %w", err)
	}
	return accessLevel == AccessWrite, nil
}

// canWriteCategoryTx checks write permission on a category within an active SQL transaction.
func (r *WikiRepository) canWriteCategoryTx(ctx context.Context, tx *sql.Tx, user *AuthenticatedUser, categoryID int64, deptID sql.NullInt64) (bool, error) {
	if user == nil || !user.IsActive || user.ID <= 0 {
		return false, ErrUnauthorized
	}
	if user.IsAdmin() {
		return true, nil
	}

	if deptID.Valid {
		isMgr, err := r.isDepartmentManagerTx(ctx, tx, user.ID, deptID.Int64, user.Role)
		if err != nil {
			return false, err
		}
		if isMgr {
			return true, nil
		}
	}

	const permQuery = `
		SELECT access_level
		FROM wiki_permissions
		WHERE user_id = $1 AND category_id = $2
		LIMIT 1
	`
	var accessLevel string
	err := tx.QueryRowContext(ctx, permQuery, user.ID, categoryID).Scan(&accessLevel)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("failed to check wiki_permissions in tx: %w", err)
	}
	return accessLevel == AccessWrite, nil
}

// ListAccessibleArticles returns all articles visible to the authenticated user based on strict SQL RBAC filtering:
//   - Admin ('admin') sees all articles with 'write' effective access.
//   - Department Manager (departamentos.responsavel_id = user.id OR manager role in same department) sees all articles in their department's categories with 'write' effective access.
//   - Global categories (c.department_id IS NULL) are readable by any active authenticated user unless explicitly blocked with 'none', and writable if 'write' is granted.
//   - Departmental categories (c.department_id IS NOT NULL) are visible if the user has wiki_permissions.access_level IN ('read', 'write').
func (r *WikiRepository) ListAccessibleArticles(
	ctx context.Context,
	user *AuthenticatedUser,
	categoryIDFilter *int64,
	searchQuery string,
) ([]WikiArticle, error) {
	if user == nil || !user.IsActive || user.ID <= 0 {
		return nil, ErrUnauthorized
	}

	var catFilter sql.NullInt64
	if categoryIDFilter != nil && *categoryIDFilter > 0 {
		catFilter = sql.NullInt64{Int64: *categoryIDFilter, Valid: true}
	}

	trimmedSearch := strings.TrimSpace(searchQuery)

	const query = `
		SELECT
			a.id,
			a.title,
			a.slug,
			a.content,
			a.content_format,
			a.category_id,
			c.name AS category_name,
			c.department_id,
			a.author_id,
			COALESCE(u_author.nome, '') AS author_name,
			a.updated_by,
			a.is_published,
			CASE
				WHEN $2 = TRUE THEN 'write'
				WHEN c.department_id IS NOT NULL AND (
					d.responsavel_id = $1
					OR ($3 = TRUE AND u_caller.departamento_id = c.department_id)
				) THEN 'write'
				WHEN wp.access_level = 'write' THEN 'write'
				ELSE 'read'
			END AS effective_access,
			a.created_at,
			a.updated_at
		FROM wiki_articles a
		INNER JOIN wiki_categories c ON c.id = a.category_id
		LEFT JOIN departamentos d ON d.id = c.department_id
		LEFT JOIN users u_caller ON u_caller.id = $1 AND u_caller.is_active = TRUE
		LEFT JOIN users u_author ON u_author.id = a.author_id
		LEFT JOIN wiki_permissions wp ON wp.category_id = c.id AND wp.user_id = $1
		WHERE (
			-- 1. Global Admin has unrestricted access
			$2 = TRUE
			-- 2. Department Manager of the category's department
			OR (
				c.department_id IS NOT NULL
				AND (
					d.responsavel_id = $1
					OR ($3 = TRUE AND u_caller.departamento_id = c.department_id)
				)
			)
			-- 3. Global Category (department_id IS NULL): readable by authenticated users unless explicitly blocked ('none')
			OR (
				c.department_id IS NULL
				AND COALESCE(wp.access_level, 'read') IN ('read', 'write')
			)
			-- 4. Departmental Category with explicit 'read' or 'write' permission in wiki_permissions
			OR (
				c.department_id IS NOT NULL
				AND wp.access_level IN ('read', 'write')
			)
		)
		AND ($4::BIGINT IS NULL OR a.category_id = $4)
		AND (
			$5 = ''
			OR a.title ILIKE '%' || $5 || '%'
			OR a.content ILIKE '%' || $5 || '%'
			OR c.name ILIKE '%' || $5 || '%'
		)
		ORDER BY a.updated_at DESC, a.id DESC
	`

	rows, err := r.db.QueryContext(
		ctx,
		query,
		user.ID,
		user.IsAdmin(),
		user.HasManagerRole(),
		catFilter,
		trimmedSearch,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to list accessible wiki articles: %w", err)
	}
	defer rows.Close()

	articles := make([]WikiArticle, 0)
	for rows.Next() {
		var art WikiArticle
		var deptID, authorID, updatedBy sql.NullInt64

		if err := rows.Scan(
			&art.ID,
			&art.Title,
			&art.Slug,
			&art.Content,
			&art.ContentFormat,
			&art.CategoryID,
			&art.CategoryName,
			&deptID,
			&authorID,
			&art.AuthorName,
			&updatedBy,
			&art.IsPublished,
			&art.EffectiveAccess,
			&art.CreatedAt,
			&art.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan wiki article row: %w", err)
		}

		if deptID.Valid {
			v := deptID.Int64
			art.DepartmentID = &v
		}
		if authorID.Valid {
			v := authorID.Int64
			art.AuthorID = &v
		}
		if updatedBy.Valid {
			v := updatedBy.Int64
			art.UpdatedBy = &v
			art.LastEditedBy = &v
		}

		articles = append(articles, art)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating wiki articles: %w", err)
	}

	return articles, nil
}

// GetAccessibleArticleByID retrieves a single article by ID if and only if the user passes the RBAC filter.
func (r *WikiRepository) GetAccessibleArticleByID(ctx context.Context, user *AuthenticatedUser, articleID int64) (*WikiArticle, error) {
	if user == nil || !user.IsActive || user.ID <= 0 {
		return nil, ErrUnauthorized
	}
	if articleID <= 0 {
		return nil, ErrInvalidPayload
	}

	const query = `
		SELECT
			a.id,
			a.title,
			a.slug,
			a.content,
			a.content_format,
			a.category_id,
			c.name AS category_name,
			c.department_id,
			a.author_id,
			COALESCE(u_author.nome, '') AS author_name,
			a.updated_by,
			a.is_published,
			CASE
				WHEN $2 = TRUE THEN 'write'
				WHEN c.department_id IS NOT NULL AND (
					d.responsavel_id = $1
					OR ($3 = TRUE AND u_caller.departamento_id = c.department_id)
				) THEN 'write'
				WHEN wp.access_level = 'write' THEN 'write'
				ELSE 'read'
			END AS effective_access,
			a.created_at,
			a.updated_at
		FROM wiki_articles a
		INNER JOIN wiki_categories c ON c.id = a.category_id
		LEFT JOIN departamentos d ON d.id = c.department_id
		LEFT JOIN users u_caller ON u_caller.id = $1 AND u_caller.is_active = TRUE
		LEFT JOIN users u_author ON u_author.id = a.author_id
		LEFT JOIN wiki_permissions wp ON wp.category_id = c.id AND wp.user_id = $1
		WHERE a.id = $4
		  AND (
			$2 = TRUE
			OR (
				c.department_id IS NOT NULL
				AND (
					d.responsavel_id = $1
					OR ($3 = TRUE AND u_caller.departamento_id = c.department_id)
				)
			)
			OR (
				c.department_id IS NULL
				AND COALESCE(wp.access_level, 'read') IN ('read', 'write')
			)
			OR (
				c.department_id IS NOT NULL
				AND wp.access_level IN ('read', 'write')
			)
		  )
		LIMIT 1
	`

	var art WikiArticle
	var deptID, authorID, updatedBy sql.NullInt64
	err := r.db.QueryRowContext(
		ctx,
		query,
		user.ID,
		user.IsAdmin(),
		user.HasManagerRole(),
		articleID,
	).Scan(
		&art.ID,
		&art.Title,
		&art.Slug,
		&art.Content,
		&art.ContentFormat,
		&art.CategoryID,
		&art.CategoryName,
		&deptID,
		&authorID,
		&art.AuthorName,
		&updatedBy,
		&art.IsPublished,
		&art.EffectiveAccess,
		&art.CreatedAt,
		&art.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get wiki article %d: %w", articleID, err)
	}

	if deptID.Valid {
		v := deptID.Int64
		art.DepartmentID = &v
	}
	if authorID.Valid {
		v := authorID.Int64
		art.AuthorID = &v
	}
	if updatedBy.Valid {
		v := updatedBy.Int64
		art.UpdatedBy = &v
		art.LastEditedBy = &v
	}

	return &art, nil
}

var nonSlugCharsRegex = regexp.MustCompile(`[^a-z0-9-]+`)

// buildSlug generates a URL-safe slug from a title or existing slug.
func buildSlug(title, providedSlug string) string {
	raw := strings.TrimSpace(providedSlug)
	if raw == "" {
		raw = strings.TrimSpace(title)
	}
	raw = strings.ToLower(raw)
	raw = strings.ReplaceAll(raw, " ", "-")
	raw = nonSlugCharsRegex.ReplaceAllString(raw, "-")
	raw = strings.Trim(raw, "-")
	if raw == "" {
		return fmt.Sprintf("artigo-%d", time.Now().UnixNano())
	}
	return raw
}

// CreateArticle inserts a new article into wiki_articles after checking write permissions when an author user is supplied.
func (r *WikiRepository) CreateArticle(ctx context.Context, article *WikiArticle, authorUser ...*AuthenticatedUser) (*WikiArticle, error) {
	if article == nil {
		return nil, ErrInvalidPayload
	}
	article.Title = strings.TrimSpace(article.Title)
	if article.Title == "" || article.CategoryID <= 0 {
		return nil, ErrInvalidPayload
	}

	if len(authorUser) > 0 && authorUser[0] != nil {
		caller := authorUser[0]
		allowed, err := r.CanWriteCategory(ctx, caller, article.CategoryID)
		if err != nil {
			return nil, err
		}
		if !allowed {
			return nil, ErrForbidden
		}
		uid := caller.ID
		article.AuthorID = &uid
		article.UpdatedBy = &uid
		article.LastEditedBy = &uid
	}

	article.Slug = buildSlug(article.Title, article.Slug)
	article.ContentFormat = NormalizeContentFormat(article.ContentFormat)

	var authorNullable, editorNullable sql.NullInt64
	if article.AuthorID != nil && *article.AuthorID > 0 {
		authorNullable = sql.NullInt64{Int64: *article.AuthorID, Valid: true}
	}
	if article.UpdatedBy != nil && *article.UpdatedBy > 0 {
		editorNullable = sql.NullInt64{Int64: *article.UpdatedBy, Valid: true}
	} else if article.LastEditedBy != nil && *article.LastEditedBy > 0 {
		editorNullable = sql.NullInt64{Int64: *article.LastEditedBy, Valid: true}
	} else if authorNullable.Valid {
		editorNullable = authorNullable
	}

	const insertQuery = `
		INSERT INTO wiki_articles (
			title, slug, content, content_format, category_id, author_id, updated_by, is_published, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
		)
		RETURNING id, created_at, updated_at
	`

	err := r.db.QueryRowContext(
		ctx,
		insertQuery,
		article.Title,
		article.Slug,
		article.Content,
		article.ContentFormat,
		article.CategoryID,
		authorNullable,
		editorNullable,
		article.IsPublished,
	).Scan(&article.ID, &article.CreatedAt, &article.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to create wiki article: %w", err)
	}

	article.EffectiveAccess = AccessWrite
	return article, nil
}

// UpdateArticleWithRevision atomically:
//  1. Locks the target article row in wiki_articles
//  2. Verifies that editorUser has write permission on the article's category
//  3. Records the previous title & content in wiki_article_revisions
//  4. Updates wiki_articles with the new content and editor metadata
func (r *WikiRepository) UpdateArticleWithRevision(
	ctx context.Context,
	articleID int64,
	newTitle string,
	newContent string,
	contentFormat string,
	changeSummary string,
	editorUser *AuthenticatedUser,
) (*WikiArticle, error) {
	if editorUser == nil || !editorUser.IsActive || editorUser.ID <= 0 {
		return nil, ErrUnauthorized
	}
	trimmedTitle := strings.TrimSpace(newTitle)
	if articleID <= 0 || trimmedTitle == "" {
		return nil, ErrInvalidPayload
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction for article update: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	// 1. Read & lock existing article state along with category department_id
	const selectForUpdate = `
		SELECT
			a.id,
			a.title,
			a.slug,
			a.content,
			a.content_format,
			a.category_id,
			a.author_id,
			a.is_published,
			a.created_at,
			c.department_id
		FROM wiki_articles a
		INNER JOIN wiki_categories c ON c.id = a.category_id
		WHERE a.id = $1
		FOR UPDATE OF a
	`

	var current WikiArticle
	var authorID, deptID sql.NullInt64
	err = tx.QueryRowContext(ctx, selectForUpdate, articleID).Scan(
		&current.ID,
		&current.Title,
		&current.Slug,
		&current.Content,
		&current.ContentFormat,
		&current.CategoryID,
		&authorID,
		&current.IsPublished,
		&current.CreatedAt,
		&deptID,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to lock article %d for update: %w", articleID, err)
	}

	// 2. Verify write permission inside transaction
	canWrite, err := r.canWriteCategoryTx(ctx, tx, editorUser, current.CategoryID, deptID)
	if err != nil {
		return nil, err
	}
	if !canWrite {
		return nil, ErrForbidden
	}

	// 3. Insert audit record into wiki_article_revisions with the PREVIOUS state
	summary := strings.TrimSpace(changeSummary)
	if summary == "" {
		summary = "Atualização de conteúdo"
	}

	const insertRevisionQuery = `
		INSERT INTO wiki_article_revisions (
			article_id,
			edited_by,
			previous_title,
			previous_content,
			content_format,
			change_note,
			created_at
		) VALUES ($1, $2, $3, $4, $5, $6, NOW())
	`
	if _, err := tx.ExecContext(
		ctx,
		insertRevisionQuery,
		current.ID,
		editorUser.ID,
		current.Title,
		current.Content,
		current.ContentFormat,
		summary,
	); err != nil {
		return nil, fmt.Errorf("failed to insert article revision for article %d: %w", current.ID, err)
	}

	// 4. Update article in wiki_articles
	normalizedFormat := NormalizeContentFormat(contentFormat)
	const updateArticleQuery = `
		UPDATE wiki_articles
		SET
			title = $1,
			content = $2,
			content_format = $3,
			updated_by = $4,
			updated_at = NOW()
		WHERE id = $5
		RETURNING updated_at
	`
	var updatedAt time.Time
	if err := tx.QueryRowContext(
		ctx,
		updateArticleQuery,
		trimmedTitle,
		newContent,
		normalizedFormat,
		editorUser.ID,
		current.ID,
	).Scan(&updatedAt); err != nil {
		return nil, fmt.Errorf("failed to update article %d: %w", current.ID, err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit article revision transaction: %w", err)
	}

	editorID := editorUser.ID
	current.Title = trimmedTitle
	current.Content = newContent
	current.ContentFormat = normalizedFormat
	current.UpdatedBy = &editorID
	current.LastEditedBy = &editorID
	current.UpdatedAt = updatedAt
	current.EffectiveAccess = AccessWrite
	if authorID.Valid {
		v := authorID.Int64
		current.AuthorID = &v
	}
	if deptID.Valid {
		v := deptID.Int64
		current.DepartmentID = &v
	}

	return &current, nil
}

// ListArticleRevisions returns the chronological revision history of an article for authorized readers.
func (r *WikiRepository) ListArticleRevisions(ctx context.Context, user *AuthenticatedUser, articleID int64) ([]WikiArticleRevision, error) {
	// Ensure caller has at least read access to the article before exposing revision history.
	if _, err := r.GetAccessibleArticleByID(ctx, user, articleID); err != nil {
		return nil, err
	}

	const query = `
		SELECT
			r.id,
			r.article_id,
			r.edited_by,
			COALESCE(u.nome, '') AS editor_name,
			r.previous_title,
			r.previous_content,
			r.content_format,
			COALESCE(r.change_note, ''),
			r.created_at
		FROM wiki_article_revisions r
		LEFT JOIN users u ON u.id = r.edited_by
		WHERE r.article_id = $1
		ORDER BY r.created_at DESC, r.id DESC
	`

	rows, err := r.db.QueryContext(ctx, query, articleID)
	if err != nil {
		return nil, fmt.Errorf("failed to list revisions for article %d: %w", articleID, err)
	}
	defer rows.Close()

	revisions := make([]WikiArticleRevision, 0)
	for rows.Next() {
		var rev WikiArticleRevision
		var editedBy sql.NullInt64
		if err := rows.Scan(
			&rev.ID,
			&rev.ArticleID,
			&editedBy,
			&rev.EditorName,
			&rev.PreviousTitle,
			&rev.PreviousContent,
			&rev.ContentFormat,
			&rev.ChangeSummary,
			&rev.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan article revision: %w", err)
		}
		rev.ChangeNote = rev.ChangeSummary
		if editedBy.Valid {
			v := editedBy.Int64
			rev.EditedBy = &v
		}
		revisions = append(revisions, rev)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating article revisions: %w", err)
	}

	return revisions, nil
}

// BulkUpdatePermissions updates Wiki access levels in batch for a specific department.
// Security Guarantees (Anti-IDOR / Cross-Department Isolation):
//  1. Verifies managerUser is Admin OR the legitimate Manager of req.DepartmentID.
//  2. Verifies inside the SQL transaction that EVERY category_id belongs to req.DepartmentID.
//  3. Verifies inside the SQL transaction that EVERY target user_id belongs to req.DepartmentID.
//  4. Performs an atomic UPSERT on wiki_permissions.
func (r *WikiRepository) BulkUpdatePermissions(
	ctx context.Context,
	managerUser *AuthenticatedUser,
	req BulkPermissionUpdateRequest,
) (*BulkPermissionUpdateResponse, error) {
	if managerUser == nil || !managerUser.IsActive || managerUser.ID <= 0 {
		return nil, ErrUnauthorized
	}
	if req.DepartmentID <= 0 || len(req.Permissions) == 0 {
		return nil, ErrInvalidPayload
	}

	uniqueCategoryIDs := make(map[int64]struct{})
	uniqueUserIDs := make(map[int64]struct{})

	for _, item := range req.Permissions {
		if item.UserID <= 0 || item.CategoryID <= 0 || !IsValidAccessLevel(item.AccessLevel) {
			return nil, ErrInvalidPayload
		}
		uniqueCategoryIDs[item.CategoryID] = struct{}{}
		uniqueUserIDs[item.UserID] = struct{}{}
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to begin bulk permissions transaction: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	// 1. Validate that caller manages req.DepartmentID (unless global Admin)
	if !managerUser.IsAdmin() {
		isMgr, err := r.isDepartmentManagerTx(ctx, tx, managerUser.ID, req.DepartmentID, managerUser.Role)
		if err != nil {
			return nil, err
		}
		if !isMgr {
			return nil, ErrCrossDepartmentAccess
		}
	}

	// 2. Validate that ALL target categories belong strictly to req.DepartmentID
	catPlaceholders := make([]string, 0, len(uniqueCategoryIDs))
	catArgs := make([]any, 0, len(uniqueCategoryIDs)+1)
	catArgs = append(catArgs, req.DepartmentID)
	idx := 2
	for catID := range uniqueCategoryIDs {
		catPlaceholders = append(catPlaceholders, fmt.Sprintf("$%d", idx))
		catArgs = append(catArgs, catID)
		idx++
	}

	catValidationQuery := fmt.Sprintf(
		`SELECT COUNT(id) FROM wiki_categories WHERE department_id = $1 AND id IN (%s)`,
		strings.Join(catPlaceholders, ", "),
	)
	var validCatCount int
	if err := tx.QueryRowContext(ctx, catValidationQuery, catArgs...).Scan(&validCatCount); err != nil {
		return nil, fmt.Errorf("failed to validate category department ownership: %w", err)
	}
	if validCatCount != len(uniqueCategoryIDs) {
		return nil, ErrCrossDepartmentAccess
	}

	// 3. Validate that ALL target users belong strictly to req.DepartmentID
	userPlaceholders := make([]string, 0, len(uniqueUserIDs))
	userArgs := make([]any, 0, len(uniqueUserIDs)+1)
	userArgs = append(userArgs, req.DepartmentID)
	idx = 2
	for uid := range uniqueUserIDs {
		userPlaceholders = append(userPlaceholders, fmt.Sprintf("$%d", idx))
		userArgs = append(userArgs, uid)
		idx++
	}

	userValidationQuery := fmt.Sprintf(
		`SELECT COUNT(id) FROM users WHERE departamento_id = $1 AND id IN (%s)`,
		strings.Join(userPlaceholders, ", "),
	)
	var validUserCount int
	if err := tx.QueryRowContext(ctx, userValidationQuery, userArgs...).Scan(&validUserCount); err != nil {
		return nil, fmt.Errorf("failed to validate user department membership: %w", err)
	}
	if validUserCount != len(uniqueUserIDs) {
		return nil, ErrCrossDepartmentAccess
	}

	// 4. Upsert each permission in wiki_permissions
	const upsertQuery = `
		INSERT INTO wiki_permissions (user_id, category_id, access_level, granted_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, NOW(), NOW())
		ON CONFLICT (user_id, category_id)
		DO UPDATE SET
			access_level = EXCLUDED.access_level,
			granted_by = EXCLUDED.granted_by,
			updated_at = NOW()
	`

	for _, item := range req.Permissions {
		normalizedAccess := strings.ToLower(strings.TrimSpace(item.AccessLevel))
		if _, err := tx.ExecContext(ctx, upsertQuery, item.UserID, item.CategoryID, normalizedAccess, managerUser.ID); err != nil {
			return nil, fmt.Errorf("failed to upsert permission for user %d on category %d: %w", item.UserID, item.CategoryID, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit bulk permissions update: %w", err)
	}

	return &BulkPermissionUpdateResponse{
		DepartmentID: req.DepartmentID,
		UpdatedCount: len(req.Permissions),
		UpdatedAt:    time.Now().UTC(),
	}, nil
}

// GetDepartmentPermissionsMatrix loads the department's members, its Wiki categories, and current permissions
// to populate the Manager's React Bulk Permissions Matrix panel.
func (r *WikiRepository) GetDepartmentPermissionsMatrix(
	ctx context.Context,
	managerUser *AuthenticatedUser,
	departmentID int64,
) (*DepartmentMemberPermissionDTO, error) {
	if managerUser == nil || !managerUser.IsActive || managerUser.ID <= 0 {
		return nil, ErrUnauthorized
	}
	if departmentID <= 0 {
		return nil, ErrInvalidPayload
	}

	isMgr, err := r.IsDepartmentManager(ctx, managerUser.ID, departmentID, managerUser.Role)
	if err != nil {
		return nil, err
	}
	if !isMgr {
		return nil, ErrForbidden
	}

	// 1. Fetch department metadata
	var deptName string
	err = r.db.QueryRowContext(ctx, `SELECT nome FROM departamentos WHERE id = $1`, departmentID).Scan(&deptName)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to fetch department %d: %w", departmentID, err)
	}

	// 2. Fetch categories belonging to this department
	const catQuery = `
		SELECT id, name, slug, COALESCE(description, ''), department_id, created_by, created_at, updated_at
		FROM wiki_categories
		WHERE department_id = $1
		ORDER BY name ASC, id ASC
	`
	catRows, err := r.db.QueryContext(ctx, catQuery, departmentID)
	if err != nil {
		return nil, fmt.Errorf("failed to query department categories: %w", err)
	}
	defer catRows.Close()

	categories := make([]WikiCategory, 0)
	for catRows.Next() {
		var cat WikiCategory
		var deptIDNullable, createdByNullable sql.NullInt64
		if err := catRows.Scan(
			&cat.ID,
			&cat.Name,
			&cat.Slug,
			&cat.Description,
			&deptIDNullable,
			&createdByNullable,
			&cat.CreatedAt,
			&cat.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan department category: %w", err)
		}
		if deptIDNullable.Valid {
			v := deptIDNullable.Int64
			cat.DepartmentID = &v
		}
		if createdByNullable.Valid {
			v := createdByNullable.Int64
			cat.CreatedBy = &v
		}
		cat.DepartmentName = deptName
		categories = append(categories, cat)
	}
	if err := catRows.Err(); err != nil {
		return nil, err
	}

	// 3. Fetch active employees in this department
	const memberQuery = `
		SELECT id, nome, email, COALESCE(cargo, ''), role, departamento_id
		FROM users
		WHERE departamento_id = $1 AND is_active = TRUE
		ORDER BY nome ASC, id ASC
	`
	memberRows, err := r.db.QueryContext(ctx, memberQuery, departmentID)
	if err != nil {
		return nil, fmt.Errorf("failed to query department members: %w", err)
	}
	defer memberRows.Close()

	members := make([]DepartmentMemberDTO, 0)
	for memberRows.Next() {
		var m DepartmentMemberDTO
		if err := memberRows.Scan(
			&m.UserID,
			&m.Name,
			&m.Email,
			&m.Cargo,
			&m.Role,
			&m.DepartmentID,
		); err != nil {
			return nil, fmt.Errorf("failed to scan department member: %w", err)
		}
		m.ID = m.UserID
		members = append(members, m)
	}
	if err := memberRows.Err(); err != nil {
		return nil, err
	}

	// 4. Fetch existing permissions for this department's categories & members
	const permQuery = `
		SELECT
			wp.id,
			wp.user_id,
			wp.category_id,
			wp.access_level,
			wp.granted_by,
			wp.created_at,
			wp.updated_at
		FROM wiki_permissions wp
		INNER JOIN wiki_categories wc ON wc.id = wp.category_id
		INNER JOIN users u ON u.id = wp.user_id
		WHERE wc.department_id = $1
		  AND u.departamento_id = $1
		ORDER BY wp.user_id ASC, wp.category_id ASC
	`
	permRows, err := r.db.QueryContext(ctx, permQuery, departmentID)
	if err != nil {
		return nil, fmt.Errorf("failed to query department permissions: %w", err)
	}
	defer permRows.Close()

	permissions := make([]WikiPermission, 0)
	for permRows.Next() {
		var p WikiPermission
		var grantedBy sql.NullInt64
		if err := permRows.Scan(
			&p.ID,
			&p.UserID,
			&p.CategoryID,
			&p.AccessLevel,
			&grantedBy,
			&p.CreatedAt,
			&p.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan department permission: %w", err)
		}
		if grantedBy.Valid {
			v := grantedBy.Int64
			p.GrantedBy = &v
		}
		permissions = append(permissions, p)
	}
	if err := permRows.Err(); err != nil {
		return nil, err
	}

	return &DepartmentMemberPermissionDTO{
		DepartmentID:   departmentID,
		DepartmentName: deptName,
		Categories:     categories,
		Members:        members,
		Employees:      members,
		Permissions:    permissions,
	}, nil
}

// ListAccessibleCategories returns all Wiki categories accessible to the authenticated user.
func (r *WikiRepository) ListAccessibleCategories(ctx context.Context, user *AuthenticatedUser) ([]WikiCategory, error) {
	if user == nil || !user.IsActive || user.ID <= 0 {
		return nil, ErrUnauthorized
	}

	const query = `
		SELECT
			c.id,
			c.name,
			c.slug,
			COALESCE(c.description, ''),
			c.department_id,
			COALESCE(d.nome, '') AS department_name,
			c.created_by,
			c.created_at,
			c.updated_at
		FROM wiki_categories c
		LEFT JOIN departamentos d ON d.id = c.department_id
		LEFT JOIN users u_caller ON u_caller.id = $1 AND u_caller.is_active = TRUE
		LEFT JOIN wiki_permissions wp ON wp.category_id = c.id AND wp.user_id = $1
		WHERE (
			$2 = TRUE
			OR (
				c.department_id IS NOT NULL
				AND (
					d.responsavel_id = $1
					OR ($3 = TRUE AND u_caller.departamento_id = c.department_id)
				)
			)
			OR (
				c.department_id IS NULL
				AND COALESCE(wp.access_level, 'read') IN ('read', 'write')
			)
			OR (
				c.department_id IS NOT NULL
				AND wp.access_level IN ('read', 'write')
			)
		)
		ORDER BY c.department_id NULLS FIRST, c.name ASC, c.id ASC
	`

	rows, err := r.db.QueryContext(ctx, query, user.ID, user.IsAdmin(), user.HasManagerRole())
	if err != nil {
		return nil, fmt.Errorf("failed to list accessible wiki categories: %w", err)
	}
	defer rows.Close()

	categories := make([]WikiCategory, 0)
	for rows.Next() {
		var cat WikiCategory
		var deptID, createdBy sql.NullInt64
		if err := rows.Scan(
			&cat.ID,
			&cat.Name,
			&cat.Slug,
			&cat.Description,
			&deptID,
			&cat.DepartmentName,
			&createdBy,
			&cat.CreatedAt,
			&cat.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan wiki category: %w", err)
		}
		if deptID.Valid {
			v := deptID.Int64
			cat.DepartmentID = &v
		}
		if createdBy.Valid {
			v := createdBy.Int64
			cat.CreatedBy = &v
		}
		categories = append(categories, cat)
	}
	return categories, rows.Err()
}

// CreateCategory creates a new WikiCategory. Global categories require Admin; departmental categories require Admin or Department Manager.
func (r *WikiRepository) CreateCategory(ctx context.Context, req CreateCategoryRequest, user *AuthenticatedUser) (*WikiCategory, error) {
	if user == nil || !user.IsActive || user.ID <= 0 {
		return nil, ErrUnauthorized
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, ErrInvalidPayload
	}

	if req.DepartmentID == nil || *req.DepartmentID <= 0 {
		if !user.IsAdmin() {
			return nil, ErrForbidden
		}
		req.DepartmentID = nil
	} else {
		isMgr, err := r.IsDepartmentManager(ctx, user.ID, *req.DepartmentID, user.Role)
		if err != nil {
			return nil, err
		}
		if !isMgr {
			return nil, ErrForbidden
		}
	}

	slug := buildSlug(name, req.Slug)
	var deptNullable sql.NullInt64
	if req.DepartmentID != nil && *req.DepartmentID > 0 {
		deptNullable = sql.NullInt64{Int64: *req.DepartmentID, Valid: true}
	}

	const insertQuery = `
		INSERT INTO wiki_categories (name, slug, description, department_id, created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
		RETURNING id, created_at, updated_at
	`
	cat := &WikiCategory{
		Name:         name,
		Slug:         slug,
		Description:  strings.TrimSpace(req.Description),
		DepartmentID: req.DepartmentID,
		CreatedBy:    &user.ID,
	}
	if err := r.db.QueryRowContext(ctx, insertQuery, cat.Name, cat.Slug, cat.Description, deptNullable, user.ID).Scan(
		&cat.ID, &cat.CreatedAt, &cat.UpdatedAt,
	); err != nil {
		return nil, fmt.Errorf("failed to create wiki category: %w", err)
	}
	return cat, nil
}

// ListManageableDepartments returns all departments that the user can manage in the Wiki RBAC Matrix.
func (r *WikiRepository) ListManageableDepartments(ctx context.Context, user *AuthenticatedUser) ([]DepartmentSummaryDTO, error) {
	if user == nil || !user.IsActive || user.ID <= 0 {
		return nil, ErrUnauthorized
	}

	var rows *sql.Rows
	var err error
	if user.IsAdmin() {
		rows, err = r.db.QueryContext(ctx, `SELECT id, nome, responsavel_id FROM departamentos ORDER BY nome ASC, id ASC`)
	} else {
		const mgrQuery = `
			SELECT d.id, d.nome, d.responsavel_id
			FROM departamentos d
			LEFT JOIN users u ON u.id = $1 AND u.is_active = TRUE
			WHERE d.responsavel_id = $1
			   OR ($2 = TRUE AND u.departamento_id = d.id)
			ORDER BY d.nome ASC, d.id ASC
		`
		rows, err = r.db.QueryContext(ctx, mgrQuery, user.ID, user.HasManagerRole())
	}
	if err != nil {
		return nil, fmt.Errorf("failed to list manageable departments: %w", err)
	}
	defer rows.Close()

	depts := make([]DepartmentSummaryDTO, 0)
	for rows.Next() {
		var d DepartmentSummaryDTO
		var respID sql.NullInt64
		if err := rows.Scan(&d.ID, &d.Name, &respID); err != nil {
			return nil, err
		}
		d.Nome = d.Name
		if respID.Valid {
			v := respID.Int64
			d.ResponsavelID = &v
		}
		depts = append(depts, d)
	}
	return depts, rows.Err()
}

// EnsureSchema idempotently initializes the Wiki module tables and seeds the initial 'wiki' toggle and default categories.
func (r *WikiRepository) EnsureSchema(ctx context.Context) error {
	if r == nil || r.db == nil {
		return nil
	}
	const ddl = `
		CREATE TABLE IF NOT EXISTS system_modules (
			module_name VARCHAR(64) PRIMARY KEY,
			is_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
			updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		INSERT INTO system_modules (module_name, is_enabled, updated_at)
		VALUES ('wiki', TRUE, NOW())
		ON CONFLICT (module_name) DO NOTHING;

		CREATE TABLE IF NOT EXISTS wiki_categories (
			id            BIGSERIAL PRIMARY KEY,
			name          VARCHAR(150) NOT NULL,
			slug          VARCHAR(160) NOT NULL UNIQUE,
			description   TEXT NOT NULL DEFAULT '',
			icon          VARCHAR(64) NOT NULL DEFAULT 'folder',
			department_id BIGINT NULL REFERENCES departamentos(id) ON DELETE SET NULL,
			sort_order    INTEGER NOT NULL DEFAULT 0,
			is_active     BOOLEAN NOT NULL DEFAULT TRUE,
			created_by    BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
			created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS wiki_articles (
			id             BIGSERIAL PRIMARY KEY,
			category_id    BIGINT NOT NULL REFERENCES wiki_categories(id) ON DELETE CASCADE,
			title          VARCHAR(255) NOT NULL,
			slug           VARCHAR(260) NOT NULL UNIQUE,
			summary        TEXT NOT NULL DEFAULT '',
			content        TEXT NOT NULL DEFAULT '',
			content_format VARCHAR(16) NOT NULL DEFAULT 'html' CHECK (content_format IN ('html', 'json')),
			is_published   BOOLEAN NOT NULL DEFAULT TRUE,
			view_count     BIGINT NOT NULL DEFAULT 0,
			author_id      BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
			updated_by     BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
			created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS wiki_permissions (
			id           BIGSERIAL PRIMARY KEY,
			user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			category_id  BIGINT NOT NULL REFERENCES wiki_categories(id) ON DELETE CASCADE,
			access_level VARCHAR(16) NOT NULL DEFAULT 'none' CHECK (access_level IN ('none', 'read', 'write')),
			granted_by   BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
			created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			CONSTRAINT uq_wiki_permissions_user_category UNIQUE (user_id, category_id)
		);

		CREATE TABLE IF NOT EXISTS wiki_article_revisions (
			id               BIGSERIAL PRIMARY KEY,
			article_id       BIGINT NOT NULL REFERENCES wiki_articles(id) ON DELETE CASCADE,
			edited_by        BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
			previous_title   VARCHAR(255) NOT NULL DEFAULT '',
			previous_content TEXT NOT NULL,
			content_format   VARCHAR(16) NOT NULL DEFAULT 'html' CHECK (content_format IN ('html', 'json')),
			change_note      VARCHAR(500) NOT NULL DEFAULT '',
			created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`
	if _, err := r.db.ExecContext(ctx, ddl); err != nil {
		return err
	}

	// Seed default global category & departmental categories if none exist
	_, _ = r.db.ExecContext(ctx, `
		INSERT INTO wiki_categories (name, slug, description, department_id)
		VALUES ('Manuais Gerais & Políticas', 'manuais-gerais-politicas', 'Documentação global acessível a todos os colaboradores ativos', NULL)
		ON CONFLICT (slug) DO NOTHING;
	`)
	_, _ = r.db.ExecContext(ctx, `
		INSERT INTO wiki_categories (name, slug, description, department_id)
		SELECT 'Procedimentos Operacionais — ' || UPPER(d.nome), 'procedimentos-' || LOWER(REPLACE(d.nome, ' ', '-')), 'Base de conhecimento exclusiva do setor ' || d.nome, d.id
		FROM departamentos d
		ON CONFLICT (slug) DO NOTHING;
	`)
	_, _ = r.db.ExecContext(ctx, `
		INSERT INTO wiki_articles (category_id, title, slug, content, content_format, is_published)
		SELECT id, 'Guia de Boas-Vindas à Wiki & Base de Conhecimento', 'guia-boas-vindas-wiki',
		'<h2>Bem-vindo à Wiki Corporativa do AssetTrack TI</h2><p>Este módulo centraliza procedimentos técnicos, manuais operacionais e vídeos curtos (até 50MB) com controle de acesso granular por departamento (RBAC) e auditoria de revisões.</p><pre><code># Exemplo de bloco de código técnico\ndocker compose ps\ncurl http://localhost:8080/health</code></pre>',
		'html', TRUE
		FROM wiki_categories WHERE slug = 'manuais-gerais-politicas'
		ON CONFLICT (slug) DO NOTHING;
	`)
	return nil
}

