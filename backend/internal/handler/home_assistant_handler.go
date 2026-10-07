package handler

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/assettrack/backend/internal/repository"
	"github.com/assettrack/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type HomeAssistantHandler struct {
	svc  service.HomeAssistantService
	repo repository.HomeAssistantRepository
}

func NewHomeAssistantHandler(svc service.HomeAssistantService, repo repository.HomeAssistantRepository) *HomeAssistantHandler {
	return &HomeAssistantHandler{
		svc:  svc,
		repo: repo,
	}
}

// GetOverview returns current entities, their telemetry/state, and whether HA is online.
func (h *HomeAssistantHandler) GetOverview(c *gin.Context) {
	forceRefresh := c.Query("refresh") == "true"
	overview, err := h.svc.GetStates(c.Request.Context(), forceRefresh)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Erro ao carregar dados do Home Assistant: %v", err)})
		return
	}
	c.JSON(http.StatusOK, overview)
}

// CallService dispatches a service call (e.g., switch.turn_on, switch.turn_off, light.toggle)
func (h *HomeAssistantHandler) CallService(c *gin.Context) {
	var req service.CallServiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Parâmetros inválidos para executar comando"})
		return
	}

	if err := h.svc.CallService(c.Request.Context(), &req); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":   "Comando executado com sucesso",
		"entity_id": req.EntityID,
		"service":   fmt.Sprintf("%s.%s", req.Domain, req.Service),
	})
}

// GetAssetTelemetry returns all HA entities associated with a specific asset
func (h *HomeAssistantHandler) GetAssetTelemetry(c *gin.Context) {
	idParam := c.Param("id")
	assetID, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID do ativo inválido"})
		return
	}

	states, err := h.svc.GetAssetTelemetry(c.Request.Context(), uint(assetID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, states)
}

// ListBindings returns stored entity bindings with assets
func (h *HomeAssistantHandler) ListBindings(c *gin.Context) {
	bindings, err := h.repo.ListEntities(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro ao carregar vínculos de entidades"})
		return
	}
	c.JSON(http.StatusOK, bindings)
}

// SaveBinding creates or updates an entity binding
func (h *HomeAssistantHandler) SaveBinding(c *gin.Context) {
	var req service.SaveBindingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dados inválidos para vincular entidade"})
		return
	}

	if err := h.svc.SaveBinding(c.Request.Context(), &req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Falha ao salvar vínculo: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Vínculo salvo com sucesso"})
}

// SetVisibility quickly toggles whether an entity is visible in the main UI
func (h *HomeAssistantHandler) SetVisibility(c *gin.Context) {
	var req service.SetVisibilityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Parâmetros inválidos para alterar visibilidade"})
		return
	}

	if err := h.svc.SetVisibility(c.Request.Context(), req.EntityID, req.IsVisible); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Falha ao alterar visibilidade: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":    "Visibilidade alterada com sucesso",
		"entity_id":  req.EntityID,
		"is_visible": req.IsVisible,
	})
}

// DeleteBinding removes an entity binding
func (h *HomeAssistantHandler) DeleteBinding(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	if err := h.svc.DeleteBinding(c.Request.Context(), uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Falha ao remover vínculo"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Vínculo removido com sucesso"})
}

// TestConnection tests connectivity with Home Assistant (Admin only)
func (h *HomeAssistantHandler) TestConnection(c *gin.Context) {
	res, err := h.svc.TestConnection(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

type CreateCategoryRequest struct {
	Nome  string `json:"nome" binding:"required"`
	Icone string `json:"icone"`
	Cor   string `json:"cor"`
}

type UpdateCategoryRequest struct {
	Nome  string `json:"nome" binding:"required"`
	Icone string `json:"icone"`
	Cor   string `json:"cor"`
}

// ListCategories returns all configured categories
func (h *HomeAssistantHandler) ListCategories(c *gin.Context) {
	categories, err := h.svc.ListCategories(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro ao carregar categorias"})
		return
	}
	c.JSON(http.StatusOK, categories)
}

// CreateCategory adds a new category
func (h *HomeAssistantHandler) CreateCategory(c *gin.Context) {
	var req CreateCategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Informe o nome da categoria"})
		return
	}

	cat, err := h.svc.CreateCategory(c.Request.Context(), req.Nome, req.Icone, req.Cor)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Falha ao criar categoria: %v", err)})
		return
	}

	c.JSON(http.StatusCreated, cat)
}

// UpdateCategory edits an existing category
func (h *HomeAssistantHandler) UpdateCategory(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	var req UpdateCategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Informe os dados da categoria"})
		return
	}

	if err := h.svc.UpdateCategory(c.Request.Context(), uint(id), req.Nome, req.Icone, req.Cor); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Falha ao atualizar categoria: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Categoria atualizada com sucesso"})
}

// DeleteCategory deletes a category
func (h *HomeAssistantHandler) DeleteCategory(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	if err := h.svc.DeleteCategory(c.Request.Context(), uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Falha ao excluir categoria: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Categoria excluída com sucesso"})
}
