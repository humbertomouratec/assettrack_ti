package wiki

import (
	"context"
	"database/sql"
	"net/http"
	"strings"

	"github.com/assettrack/backend/internal/middleware"
	"github.com/gin-gonic/gin"
)

// NewWikiMux builds a standalone standard library *http.ServeMux with:
//  1. All /api/v1/wiki/* endpoints protected by WikiFeatureToggleMiddleware.
//  2. Static media serving at /uploads/ via http.StripPrefix("/uploads/", http.FileServer(http.Dir("./uploads"))).
func NewWikiMux(db *sql.DB, uploadDir ...string) http.Handler {
	mux := http.NewServeMux()
	RegisterStdMuxRoutes(mux, db, uploadDir...)
	return mux
}

// RegisterStdMuxRoutes registers the Wiki endpoints and the /uploads/ static FileServer onto an existing *http.ServeMux.
func RegisterStdMuxRoutes(mux *http.ServeMux, db *sql.DB, uploadDir ...string) {
	repo := NewWikiRepository(db)
	_ = repo.EnsureSchema(context.Background())
	cache := NewFeatureToggleCache(repo, DefaultFeatureToggleTTL)
	handler := NewWikiHandler(repo, cache)
	uploadHandler := NewWikiUploadHandler(uploadDir...)

	apiMux := http.NewServeMux()

	// Categories & Departments
	apiMux.HandleFunc("GET /api/v1/wiki/categories", handler.ListCategories)
	apiMux.HandleFunc("POST /api/v1/wiki/categories", handler.CreateCategory)
	apiMux.HandleFunc("GET /api/v1/wiki/departments", handler.ListManageableDepartments)

	// Articles & Revisions
	apiMux.HandleFunc("GET /api/v1/wiki/articles", handler.ListArticles)
	apiMux.HandleFunc("POST /api/v1/wiki/articles", handler.CreateArticle)
	apiMux.HandleFunc("GET /api/v1/wiki/articles/{id}", handler.GetArticle)
	apiMux.HandleFunc("PUT /api/v1/wiki/articles/{id}", handler.UpdateArticle)
	apiMux.HandleFunc("GET /api/v1/wiki/articles/{id}/revisions", handler.ListArticleRevisions)

	// Department Manager RBAC Matrix & Bulk Update
	apiMux.HandleFunc("GET /api/v1/wiki/departments/{departmentId}/permissions-matrix", handler.GetDepartmentPermissionsMatrix)
	apiMux.HandleFunc("PUT /api/v1/wiki/permissions/bulk", handler.BulkUpdatePermissions)
	apiMux.HandleFunc("POST /api/v1/wiki/permissions/bulk", handler.BulkUpdatePermissions)

	// Global Feature Toggle (Admin only)
	apiMux.HandleFunc("GET /api/v1/wiki/admin/module-status", handler.GetWikiModuleStatus)
	apiMux.HandleFunc("PUT /api/v1/wiki/admin/module-toggle", handler.ToggleWikiModule)
	apiMux.HandleFunc("POST /api/v1/wiki/admin/module-toggle", handler.ToggleWikiModule)

	// Rich Text Media Upload (50MB max, ./uploads/wiki/)
	apiMux.HandleFunc("POST /api/v1/wiki/upload", uploadHandler.UploadMedia)
	apiMux.HandleFunc("POST /api/v1/wiki/media/upload", uploadHandler.UploadMedia)

	// Wrap /api/v1/wiki/ with HeaderAuthMiddleware + WikiFeatureToggleMiddleware
	protectedWikiHandler := HeaderAuthMiddleware(WikiFeatureToggleMiddleware(repo, cache)(apiMux))
	mux.Handle("/api/v1/wiki/", protectedWikiHandler)
	mux.Handle("/api/v1/wiki", protectedWikiHandler)

	// Static file server for /uploads/ (including /uploads/wiki/) with nosniff security header
	staticUploads := noSniffStaticMiddleware(http.StripPrefix("/uploads/", http.FileServer(http.Dir("./uploads"))))
	mux.Handle("GET /uploads/", staticUploads)
}

// RegisterGinWikiRoutes mounts the complete /api/v1/wiki module onto an existing Gin *gin.RouterGroup
// (e.g., apiV1 := r.Group("/api/v1", authMW, rActive)) without altering any existing handlers.
// It automatically bridges middleware.GetCurrentUser(c) into wiki.AuthenticatedUser.
func RegisterGinWikiRoutes(apiV1 *gin.RouterGroup, db *sql.DB, uploadDir ...string) {
	repo := NewWikiRepository(db)
	_ = repo.EnsureSchema(context.Background())
	cache := NewFeatureToggleCache(repo, DefaultFeatureToggleTTL)
	handler := NewWikiHandler(repo, cache)
	uploadHandler := NewWikiUploadHandler(uploadDir...)

	wikiGroup := apiV1.Group("/wiki")
	wikiGroup.Use(ginUserBridgeMiddleware(), ginFeatureToggleMiddleware(cache))

	// Categories & Departments
	wikiGroup.GET("/categories", wrapStdHandler(handler.ListCategories))
	wikiGroup.POST("/categories", wrapStdHandler(handler.CreateCategory))
	wikiGroup.GET("/departments", wrapStdHandler(handler.ListManageableDepartments))

	// Articles & Revisions
	wikiGroup.GET("/articles", wrapStdHandler(handler.ListArticles))
	wikiGroup.POST("/articles", wrapStdHandler(handler.CreateArticle))
	wikiGroup.GET("/articles/:id", wrapStdHandlerWithParams(handler.GetArticle, "id"))
	wikiGroup.PUT("/articles/:id", wrapStdHandlerWithParams(handler.UpdateArticle, "id"))
	wikiGroup.GET("/articles/:id/revisions", wrapStdHandlerWithParams(handler.ListArticleRevisions, "id"))

	// Department Manager RBAC Matrix & Bulk Update
	wikiGroup.GET("/departments/:departmentId/permissions-matrix", wrapStdHandlerWithParams(handler.GetDepartmentPermissionsMatrix, "departmentId"))
	wikiGroup.PUT("/permissions/bulk", wrapStdHandler(handler.BulkUpdatePermissions))
	wikiGroup.POST("/permissions/bulk", wrapStdHandler(handler.BulkUpdatePermissions))

	// Admin Feature Toggle
	wikiGroup.GET("/admin/module-status", wrapStdHandler(handler.GetWikiModuleStatus))
	wikiGroup.PUT("/admin/module-toggle", wrapStdHandler(handler.ToggleWikiModule))
	wikiGroup.POST("/admin/module-toggle", wrapStdHandler(handler.ToggleWikiModule))

	// Rich Text Media Upload (50MB max)
	wikiGroup.POST("/upload", wrapStdHandler(uploadHandler.UploadMedia))
	wikiGroup.POST("/media/upload", wrapStdHandler(uploadHandler.UploadMedia))
}

// RegisterGinRoutes is an alias for RegisterGinWikiRoutes for convenience.
func RegisterGinRoutes(apiV1 *gin.RouterGroup, db *sql.DB, uploadDir ...string) {
	RegisterGinWikiRoutes(apiV1, db, uploadDir...)
}

// RegisterGinStaticUploads exposes ./uploads (and ./uploads/wiki/) at /uploads/ on a *gin.Engine
// with X-Content-Type-Options: nosniff protection.
func RegisterGinStaticUploads(engine *gin.Engine, uploadsRootDir ...string) {
	root := "./uploads"
	if len(uploadsRootDir) > 0 && strings.TrimSpace(uploadsRootDir[0]) != "" {
		root = strings.TrimSpace(uploadsRootDir[0])
	}
	fileServer := noSniffStaticMiddleware(http.StripPrefix("/uploads/", http.FileServer(http.Dir(root))))
	engine.GET("/uploads/*filepath", gin.WrapH(fileServer))
	engine.HEAD("/uploads/*filepath", gin.WrapH(fileServer))
}

// ginUserBridgeMiddleware adapts AssetTrack TI's existing middleware.GetCurrentUser(c)
// into wiki.AuthenticatedUser inside c.Request.Context().
func ginUserBridgeMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if gormUser := middleware.GetCurrentUser(c); gormUser != nil {
			var deptID *int64
			if gormUser.DepartamentoID != nil && *gormUser.DepartamentoID > 0 {
				d := int64(*gormUser.DepartamentoID)
				deptID = &d
			}
			wikiUser := &AuthenticatedUser{
				ID:           int64(gormUser.ID),
				Email:        gormUser.Email,
				Name:         gormUser.Nome,
				Role:         gormUser.Role,
				DepartmentID: deptID,
				IsActive:     gormUser.IsActive,
			}
			ctx := WithAuthenticatedUser(c.Request.Context(), wikiUser)
			c.Request = c.Request.WithContext(ctx)
		}
		c.Next()
	}
}

// ginFeatureToggleMiddleware enforces the /api/v1/wiki Feature Toggle inside a Gin pipeline.
func ginFeatureToggleMiddleware(cache *FeatureToggleCache) gin.HandlerFunc {
	return func(c *gin.Context) {
		if isAdminToggleRequest(c.Request) {
			c.Next()
			return
		}

		enabled, err := cache.IsEnabled(c.Request.Context())
		if err != nil || !enabled {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error":      "module_disabled",
				"module":     WikiModuleName,
				"is_enabled": false,
				"detail":     ErrModuleDisabled.Error(),
			})
			return
		}
		c.Next()
	}
}

// wrapStdHandler adapts a standard net/http HandlerFunc into a gin.HandlerFunc.
func wrapStdHandler(fn http.HandlerFunc) gin.HandlerFunc {
	return func(c *gin.Context) {
		fn(c.Writer, c.Request)
	}
}

// wrapStdHandlerWithParams copies Gin path parameters into Go 1.22+ http.Request.SetPathValue
// before invoking the standard net/http HandlerFunc.
func wrapStdHandlerWithParams(fn http.HandlerFunc, paramNames ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		for _, name := range paramNames {
			if val := c.Param(name); val != "" {
				c.Request.SetPathValue(name, val)
			}
		}
		fn(c.Writer, c.Request)
	}
}

// noSniffStaticMiddleware adds security headers to static media responses under /uploads/.
func noSniffStaticMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'")
		next.ServeHTTP(w, r)
	})
}
