package middleware

import (
	"net/http"
	"strings"

	"github.com/assettrack/backend/internal/models"
	"github.com/assettrack/backend/internal/repository"
	"github.com/assettrack/backend/internal/service"
	"github.com/gin-gonic/gin"
)

// RequireFeature keeps a disabled module unavailable even when a user opens an
// old bookmarked URL instead of navigating through the filtered menu.
func RequireFeature(settingsRepo repository.SystemSettingsRepository, key string, defaultEnabled bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		setting, err := settingsRepo.GetSetting(c.Request.Context(), key)
		enabled := defaultEnabled
		if err == nil && setting != nil {
			enabled = strings.EqualFold(strings.TrimSpace(setting.SettingValue), "true")
		}
		if !enabled {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"detail": "Este módulo está desativado pelo administrador", "feature": key})
			return
		}
		c.Next()
	}
}

const (
	ContextUserKey = "current_user"
)

// AuthMiddleware validates JWT and injects user into context
func AuthMiddleware(authSvc *service.AuthService, userRepo *repository.UserRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		tokenStr := ""
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
				tokenStr = parts[1]
			}
		}
		if tokenStr == "" {
			tokenStr = c.Query("token")
		}

		if tokenStr == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"detail": "Could not validate credentials",
			})
			return
		}

		email, _, err := authSvc.ValidateToken(tokenStr)
		if err != nil || email == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"detail": "Could not validate credentials",
			})
			return
		}

		user, err := userRepo.GetByEmail(email)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"detail": "Could not validate credentials",
			})
			return
		}

		c.Set(ContextUserKey, user)
		c.Next()
	}
}

// RequireActive ensures user is active
func RequireActive() gin.HandlerFunc {
	return func(c *gin.Context) {
		user := GetCurrentUser(c)
		if user == nil || !user.IsActive {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"detail": "Usuario Inativo entrar em contato com TI."})
			return
		}
		c.Next()
	}
}

// RequireAdmin ensures user is admin
func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		user := GetCurrentUser(c)
		if user == nil || !user.IsAdmin() {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"detail": "The user doesn't have enough privileges",
			})
			return
		}
		c.Next()
	}
}

// RequireManagerOrAbove ensures user has elevated permissions
func RequireManagerOrAbove() gin.HandlerFunc {
	return func(c *gin.Context) {
		user := GetCurrentUser(c)
		if user == nil || !user.IsManagerOrAbove() {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"detail": "The user doesn't have enough privileges",
			})
			return
		}
		c.Next()
	}
}

// RequireManagerOrRH ensures user is manager or RH
func RequireManagerOrRH() gin.HandlerFunc {
	return func(c *gin.Context) {
		user := GetCurrentUser(c)
		if user == nil || (!user.IsManagerOrAbove() && !user.CanManageRH()) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"detail": "The user doesn't have enough privileges",
			})
			return
		}
		c.Next()
	}
}

// RequireSupplierManager ensures supplier module access (admin, gerente, gerente_infra, comprador)
func RequireSupplierManager() gin.HandlerFunc {
	return func(c *gin.Context) {
		user := GetCurrentUser(c)
		if user == nil || !user.CanManageSuppliers() {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"detail": "The user doesn't have enough privileges",
			})
			return
		}
		c.Next()
	}
}

// RequireGamificationAccess ensures gamification is accessible only to gerentes, tecnicos and admins
func RequireGamificationAccess() gin.HandlerFunc {
	return func(c *gin.Context) {
		user := GetCurrentUser(c)
		if user == nil || !user.CanAccessGamification() {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"detail": "Acesso exclusivo para administradores, gerentes e técnicos",
			})
			return
		}
		c.Next()
	}
}

// RequireHomeAssistantAccess ensures Home Assistant is accessible only to gerentes, tecnicos and admins
func RequireHomeAssistantAccess() gin.HandlerFunc {
	return func(c *gin.Context) {
		user := GetCurrentUser(c)
		if user == nil || !user.CanAccessHomeAssistant() {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"detail": "Acesso exclusivo para administradores, gerentes e técnicos",
			})
			return
		}
		c.Next()
	}
}

// RequireRH ensures the personnel portal is managed only by RH and admins.
func RequireRH() gin.HandlerFunc {
	return func(c *gin.Context) {
		user := GetCurrentUser(c)
		if user == nil || (user.Role != models.RoleAdmin && user.Role != models.RoleRH) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"detail": "Acesso restrito ao RH e Administradores",
			})
			return
		}
		c.Next()
	}
}

func RequireRHOrManager() gin.HandlerFunc {
	return func(c *gin.Context) {
		user := GetCurrentUser(c)
		if user == nil || (!user.CanManageRH() && !user.IsManagerOrAbove()) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"detail": "Acesso restrito ao RH, administradores e gestores"})
			return
		}
		c.Next()
	}
}

// GetCurrentUser extracts user from gin context
func GetCurrentUser(c *gin.Context) *models.User {
	val, exists := c.Get(ContextUserKey)
	if !exists {
		return nil
	}
	user, ok := val.(*models.User)
	if !ok {
		return nil
	}
	return user
}
