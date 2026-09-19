package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/assettrack/backend/internal/middleware"
	"github.com/assettrack/backend/internal/models"
	"github.com/assettrack/backend/internal/repository"
	"github.com/gin-gonic/gin"
)

type MaintenanceHandler struct {
	repo      *repository.MaintenanceRepository
	assetRepo *repository.AssetRepository
	txRepo    *repository.TransactionRepository
}

func NewMaintenanceHandler(
	repo *repository.MaintenanceRepository,
	assetRepo *repository.AssetRepository,
	txRepo *repository.TransactionRepository,
) *MaintenanceHandler {
	return &MaintenanceHandler{
		repo:      repo,
		assetRepo: assetRepo,
		txRepo:    txRepo,
	}
}

func (h *MaintenanceHandler) ListRequests(c *gin.Context) {
	skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	user := middleware.GetCurrentUser(c)

	var filterUser *uint
	if c.Query("my") == "true" && user != nil {
		filterUser = &user.ID
	}

	reqs, err := h.repo.ListRequests(filterUser, skip, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, reqs)
}

func (h *MaintenanceHandler) GetRequestByID(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	req, err := h.repo.GetRequestByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Solicitação não encontrada"})
		return
	}
	c.JSON(http.StatusOK, req)
}

func (h *MaintenanceHandler) CreateRequest(c *gin.Context) {
	user := middleware.GetCurrentUser(c)

	var req models.SolicitacaoManutencao
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}

	// Verify asset exists
	_, err := h.assetRepo.GetByID(req.AssetID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Ativo não encontrado"})
		return
	}

	uid := user.ID
	req.SolicitanteID = &uid
	req.Status = models.StatusMaintPendente

	if err := h.repo.CreateRequest(&req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}

	// Response preloaded
	created, _ := h.repo.GetRequestByID(req.ID)
	// Optionally update asset status or register movement
	c.JSON(http.StatusCreated, created)
}

func (h *MaintenanceHandler) AcceptRequest(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	if !isStaff(user.Role) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Apenas técnicos e administradores podem aceitar chamados de manutenção"})
		return
	}

	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	req, err := h.repo.GetRequestByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Solicitação não encontrada"})
		return
	}

	if req.Status != models.StatusMaintPendente {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Apenas solicitações pendentes podem ser aceitas"})
		return
	}

	// Update asset status to Maintenance -> this triggers the GORM Repository Update hook which captures the snapshot!
	asset, err := h.assetRepo.GetByID(req.AssetID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Ativo não encontrado"})
		return
	}

	asset.Status = models.AssetStatusManutencao
	if err := h.assetRepo.Update(asset); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "Erro ao bloquear ativo para manutenção: " + err.Error()})
		return
	}

	// Create Maintenance record
	now := time.Now()
	uid := user.ID
	maint := &models.Manutencao{
		AssetID:       req.AssetID,
		ResponsavelID: &uid,
		Motivo:        req.Descricao,
		Tipo:          models.TipoManutencaoCorretiva,
		Status:        models.StatusManutencaoEmAndamento,
		DataEntrada:   now,
	}

	if err := h.repo.CreateMaintenance(maint); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "Erro ao criar registro de manutenção: " + err.Error()})
		return
	}

	// Update Request fields
	req.Status = models.StatusMaintAceita
	req.ResponsavelID = &uid
	req.ManutencaoID = &maint.ID
	req.DataResposta = &now

	if err := h.repo.UpdateRequest(req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "Erro ao atualizar solicitação: " + err.Error()})
		return
	}

	// Log movement
	mov := &models.Movimentacao{
		AssetID:    req.AssetID,
		Tipo:       models.TipoMovimentacaoManutencao,
		DeUserID:   asset.PrevUserID,
		ParaUserID: &uid,
		Observacao: &req.Descricao,
	}
	_ = h.txRepo.CreateMovement(mov)

	updatedReq, _ := h.repo.GetRequestByID(req.ID)
	c.JSON(http.StatusOK, updatedReq)
}

func (h *MaintenanceHandler) RejectRequest(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	if !isStaff(user.Role) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Apenas técnicos e administradores podem rejeitar chamados de manutenção"})
		return
	}

	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	req, err := h.repo.GetRequestByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Solicitação não encontrada"})
		return
	}

	if req.Status != models.StatusMaintPendente {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Apenas solicitações pendentes podem ser rejeitadas"})
		return
	}

	var payload struct {
		Observacao string `json:"observacao"`
	}
	_ = c.ShouldBindJSON(&payload)

	now := time.Now()
	uid := user.ID
	req.Status = models.StatusMaintRejeitada
	req.ResponsavelID = &uid
	req.DataResposta = &now
	if payload.Observacao != "" {
		req.ObservacaoResposta = &payload.Observacao
	}

	if err := h.repo.UpdateRequest(req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}

	c.JSON(http.StatusOK, req)
}

func (h *MaintenanceHandler) ConcludeRequest(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	if !isStaff(user.Role) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Permissão negada"})
		return
	}

	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	req, err := h.repo.GetRequestByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Solicitação não encontrada"})
		return
	}

	if req.Status != models.StatusMaintAceita && req.Status != models.StatusMaintEmAndamento {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Status da solicitação inválido para conclusão"})
		return
	}

	var payload struct {
		ObservacaoConclusao string   `json:"observacao_conclusao"`
		Custo               *float64 `json:"custo"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}

	if req.ManutencaoID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Manutenção associada não encontrada"})
		return
	}

	maint, err := h.repo.GetMaintenanceByID(*req.ManutencaoID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Registro de manutenção não encontrado"})
		return
	}

	now := time.Now()
	maint.Status = models.StatusManutencaoConcluida
	maint.DataConclusao = &now
	if payload.ObservacaoConclusao != "" {
		maint.ObservacaoConclusao = &payload.ObservacaoConclusao
	}
	maint.Custo = payload.Custo

	if err := h.repo.UpdateMaintenance(maint); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "Falha ao salvar conclusão da manutenção: " + err.Error()})
		return
	}

	req.Status = models.StatusMaintAguardandoEntrega
	req.DataConclusaoTecnico = &now
	if err := h.repo.UpdateRequest(req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "Falha ao salvar conclusão da solicitação: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, req)
}

func (h *MaintenanceHandler) ConfirmReceipt(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	req, err := h.repo.GetRequestByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Solicitação não encontrada"})
		return
	}

	if req.Status != models.StatusMaintAguardandoEntrega && req.Status != models.StatusMaintEntregue {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Status inválido para recebimento"})
		return
	}

	// Update asset status to something else (e.g. Disponível or its previous status if available).
	// This will trigger GORM AssetRepository Update hook which restores snapshot!
	asset, err := h.assetRepo.GetByID(req.AssetID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Ativo não encontrado"})
		return
	}

	// Get target status to change it from Maintenance.
	// Setting it to a status different from Maintenance tells the repository to execute snapshot restoration.
	if asset.PrevStatus != nil {
		asset.Status = models.AssetStatus(*asset.PrevStatus)
	} else {
		asset.Status = models.AssetStatusDisponivel
	}

	if err := h.assetRepo.Update(asset); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "Erro ao atualizar ativo: " + err.Error()})
		return
	}

	now := time.Now()
	req.Status = models.StatusMaintConcluida
	req.DataEntrega = &now
	if err := h.repo.UpdateRequest(req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "Erro ao salvar conclusão: " + err.Error()})
		return
	}

	// Log movement
	mov := &models.Movimentacao{
		AssetID:    req.AssetID,
		Tipo:       models.TipoMovimentacaoDevolucao,
		DeUserID:   req.ResponsavelID,
		ParaUserID: req.SolicitanteID,
		Observacao: stringPtr("Ativo entregue ao solicitante após manutenção concluída"),
	}
	_ = h.txRepo.CreateMovement(mov)

	c.JSON(http.StatusOK, req)
}

func stringPtr(s string) *string {
	return &s
}
