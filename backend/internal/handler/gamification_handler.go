package handler

import (
	"net/http"
	"strconv"

	"github.com/assettrack/backend/internal/middleware"
	"github.com/assettrack/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type GamificationHandler struct {
	svc *service.GamificationService
}

func NewGamificationHandler(svc *service.GamificationService) *GamificationHandler {
	return &GamificationHandler{svc: svc}
}

// GetMyProfile retorna os dados de gamificação do usuário logado
func (h *GamificationHandler) GetMyProfile(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Não autenticado"})
		return
	}

	profile, err := h.svc.GetUserProfile(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, profile)
}

// GetUserProfileByID permite ver perfil gamificado de outro técnico
func (h *GamificationHandler) GetUserProfileByID(c *gin.Context) {
	idParam := c.Param("id")
	targetID, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de usuário inválido"})
		return
	}

	profile, err := h.svc.GetUserProfile(uint(targetID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, profile)
}

// GetLeaderboard retorna o ranking dos técnicos (vitalício, semanal ou mensal)
func (h *GamificationHandler) GetLeaderboard(c *gin.Context) {
	period := c.DefaultQuery("period", "all")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	res, err := h.svc.GetLeaderboard(period, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, res)
}
