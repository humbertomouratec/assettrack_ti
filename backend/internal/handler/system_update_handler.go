package handler

import (
	"net/http"

	"github.com/assettrack/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type SystemUpdateHandler struct {
	updateSvc service.SystemUpdateService
}

func NewSystemUpdateHandler(updateSvc service.SystemUpdateService) *SystemUpdateHandler {
	return &SystemUpdateHandler{
		updateSvc: updateSvc,
	}
}

// GetVersion retorna os metadados da versão atual (commit, branch, data)
func (h *SystemUpdateHandler) GetVersion(c *gin.Context) {
	info, err := h.updateSvc.GetVersion(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, info)
}

// CheckUpdates executa git fetch e lista commits pendentes
func (h *SystemUpdateHandler) CheckUpdates(c *gin.Context) {
	result, err := h.updateSvc.CheckUpdates(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// ApplyUpdate dispara a atualização assíncrona
func (h *SystemUpdateHandler) ApplyUpdate(c *gin.Context) {
	job, err := h.updateSvc.ApplyUpdate(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusAccepted, job)
}

// GetUpdateStatus retorna logs e status da execução
func (h *SystemUpdateHandler) GetUpdateStatus(c *gin.Context) {
	status, err := h.updateSvc.GetUpdateStatus(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, status)
}
