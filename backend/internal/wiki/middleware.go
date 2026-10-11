package wiki

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// DefaultFeatureToggleTTL defines the default in-memory cache TTL for the Wiki Feature Toggle.
const DefaultFeatureToggleTTL = 5 * time.Second

type contextKey string

const authenticatedUserContextKey contextKey = "wiki_authenticated_user"

// ModuleStatusProvider abstracts the database check for system_modules so middlewares can be unit-tested easily.
// *WikiRepository implements this interface natively.
type ModuleStatusProvider interface {
	IsModuleEnabled(ctx context.Context, moduleName string) (bool, error)
}

// FeatureToggleCache provides a thread-safe in-memory cache (sync.RWMutex) with TTL for system_modules.
type FeatureToggleCache struct {
	mu        sync.RWMutex
	provider  ModuleStatusProvider
	ttl       time.Duration
	isEnabled bool
	expiresAt time.Time
	populated bool
}

// NewFeatureToggleCache creates a new FeatureToggleCache with the given TTL (defaults to 5s if <= 0).
func NewFeatureToggleCache(provider ModuleStatusProvider, ttl time.Duration) *FeatureToggleCache {
	if ttl <= 0 {
		ttl = DefaultFeatureToggleTTL
	}
	return &FeatureToggleCache{
		provider: provider,
		ttl:      ttl,
	}
}

// IsEnabled returns whether the 'wiki' module is active, using the RWMutex memory cache first
// and falling back to PostgreSQL system_modules when the TTL expires.
func (c *FeatureToggleCache) IsEnabled(ctx context.Context) (bool, error) {
	now := time.Now()

	c.mu.RLock()
	if c.populated && now.Before(c.expiresAt) {
		enabled := c.isEnabled
		c.mu.RUnlock()
		return enabled, nil
	}
	c.mu.RUnlock()

	c.mu.Lock()
	defer c.mu.Unlock()

	// Double-check after acquiring write lock
	now = time.Now()
	if c.populated && now.Before(c.expiresAt) {
		return c.isEnabled, nil
	}

	if c.provider == nil {
		return false, ErrModuleDisabled
	}

	enabled, err := c.provider.IsModuleEnabled(ctx, WikiModuleName)
	if err != nil {
		// Fail closed on error without caching a broken state
		return false, err
	}

	c.isEnabled = enabled
	c.populated = true
	c.expiresAt = now.Add(c.ttl)
	return enabled, nil
}

// Invalidate clears the cached feature toggle state immediately.
func (c *FeatureToggleCache) Invalidate() {
	if c == nil {
		return
	}
	c.mu.Lock()
	c.populated = false
	c.expiresAt = time.Time{}
	c.mu.Unlock()
}

// SetCachedState updates the cached state immediately after an Admin toggles the module.
func (c *FeatureToggleCache) SetCachedState(enabled bool) {
	if c == nil {
		return
	}
	c.mu.Lock()
	c.isEnabled = enabled
	c.populated = true
	c.expiresAt = time.Now().Add(c.ttl)
	c.mu.Unlock()
}

// WikiFeatureToggleMiddleware intercepts all routes under /api/v1/wiki (or any wrapped Wiki route).
// If system_modules has is_enabled = false for 'wiki', it immediately aborts with 403 Forbidden.
func WikiFeatureToggleMiddleware(provider ModuleStatusProvider, optionalCache ...*FeatureToggleCache) func(http.Handler) http.Handler {
	var cache *FeatureToggleCache
	if len(optionalCache) > 0 && optionalCache[0] != nil {
		cache = optionalCache[0]
	} else {
		cache = NewFeatureToggleCache(provider, DefaultFeatureToggleTTL)
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			path := r.URL.Path

			// Intercept all /api/v1/wiki routes (and relative routes when mounted via http.StripPrefix)
			if strings.HasPrefix(path, "/api/v1/wiki") || !strings.HasPrefix(path, "/api/") {
				// Allow Admin to hit the module-toggle endpoint even when disabled so the module can be re-enabled
				if isAdminToggleRequest(r) {
					next.ServeHTTP(w, r)
					return
				}

				enabled, err := cache.IsEnabled(r.Context())
				if err != nil || !enabled {
					writeJSONError(w, http.StatusForbidden, ErrModuleDisabled.Error(), map[string]any{
						"error":      "module_disabled",
						"module":     WikiModuleName,
						"is_enabled": false,
						"detail":     ErrModuleDisabled.Error(),
					})
					return
				}
			}

			next.ServeHTTP(w, r)
		})
	}
}

// isAdminToggleRequest checks if the current request is an authenticated Admin toggling or checking the module state.
func isAdminToggleRequest(r *http.Request) bool {
	trimmedPath := strings.TrimSuffix(r.URL.Path, "/")
	isToggle := (r.Method == http.MethodPut || r.Method == http.MethodPost) && strings.HasSuffix(trimmedPath, "/admin/module-toggle")
	isStatus := r.Method == http.MethodGet && strings.HasSuffix(trimmedPath, "/admin/module-status")
	if !isToggle && !isStatus {
		return false
	}
	user, err := ExtractAuthenticatedUser(r)
	return err == nil && user != nil && user.IsActive && user.IsAdmin()
}

// WithAuthenticatedUser injects the AuthenticatedUser into a standard context.Context.
func WithAuthenticatedUser(ctx context.Context, user *AuthenticatedUser) context.Context {
	return context.WithValue(ctx, authenticatedUserContextKey, user)
}

// UserFromContext retrieves the AuthenticatedUser from a context.Context if present.
func UserFromContext(ctx context.Context) (*AuthenticatedUser, bool) {
	if ctx == nil {
		return nil, false
	}
	user, ok := ctx.Value(authenticatedUserContextKey).(*AuthenticatedUser)
	if !ok || user == nil {
		return nil, false
	}
	return user, true
}

// ExtractAuthenticatedUser retrieves the caller from context or falls back to HTTP headers
// when running in standalone net/http mode.
func ExtractAuthenticatedUser(r *http.Request) (*AuthenticatedUser, error) {
	if r == nil {
		return nil, ErrUnauthorized
	}

	if user, ok := UserFromContext(r.Context()); ok && user != nil {
		if !user.IsActive || user.ID <= 0 {
			return nil, ErrUnauthorized
		}
		return user, nil
	}

	// Fallback: parse from X-User-* headers if provided by an upstream gateway or test harness
	rawID := strings.TrimSpace(r.Header.Get("X-User-ID"))
	if rawID == "" {
		return nil, ErrUnauthorized
	}
	uid, err := strconv.ParseInt(rawID, 10, 64)
	if err != nil || uid <= 0 {
		return nil, ErrUnauthorized
	}

	role := strings.TrimSpace(r.Header.Get("X-User-Role"))
	if role == "" {
		role = "usuario_comum"
	}

	isActive := true
	if rawActive := strings.TrimSpace(r.Header.Get("X-User-Active")); rawActive != "" {
		isActive = strings.EqualFold(rawActive, "true") || rawActive == "1"
	}
	if !isActive {
		return nil, ErrUnauthorized
	}

	var deptID *int64
	if rawDept := strings.TrimSpace(r.Header.Get("X-User-Department-ID")); rawDept != "" {
		if parsedDept, err := strconv.ParseInt(rawDept, 10, 64); err == nil && parsedDept > 0 {
			deptID = &parsedDept
		}
	}

	return &AuthenticatedUser{
		ID:           uid,
		Email:        strings.TrimSpace(r.Header.Get("X-User-Email")),
		Name:         strings.TrimSpace(r.Header.Get("X-User-Name")),
		Role:         role,
		DepartmentID: deptID,
		IsActive:     isActive,
	}, nil
}

// HeaderAuthMiddleware populates the request context from X-User-* headers if no user is already in context.
func HeaderAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := UserFromContext(r.Context()); !ok {
			if user, err := ExtractAuthenticatedUser(r); err == nil && user != nil {
				r = r.WithContext(WithAuthenticatedUser(r.Context(), user))
			}
		}
		next.ServeHTTP(w, r)
	})
}

// writeJSON responds with a JSON payload and HTTP status code.
func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// writeJSONError writes a standardized JSON error response.
func writeJSONError(w http.ResponseWriter, status int, detail string, extra ...map[string]any) {
	body := map[string]any{
		"detail": detail,
	}
	if len(extra) > 0 && extra[0] != nil {
		for k, v := range extra[0] {
			body[k] = v
		}
	}
	writeJSON(w, status, body)
}
