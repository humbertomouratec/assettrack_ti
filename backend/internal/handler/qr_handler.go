package handler

import (
	"net/http"
	"time"

	"github.com/assettrack/backend/internal/dto"
	"github.com/assettrack/backend/internal/middleware"
	"github.com/assettrack/backend/internal/models"
	"github.com/assettrack/backend/internal/repository"
	"github.com/assettrack/backend/internal/service"
	"github.com/gin-gonic/gin"
)

const qrTokenExpiryDays = 90

type QRHandler struct {
	userRepo  *repository.UserRepository
	authSvc   *service.AuthService
	qrSvc     *service.QRService
	qrLogSvc  *service.QRLogService
	txRepo    *repository.TransactionRepository
	maintRepo *repository.MaintenanceRepository
	assetRepo *repository.AssetRepository
}

func NewQRHandler(
	userRepo *repository.UserRepository,
	authSvc *service.AuthService,
	qrSvc *service.QRService,
	qrLogSvc *service.QRLogService,
	txRepo *repository.TransactionRepository,
	maintRepo *repository.MaintenanceRepository,
	assetRepo *repository.AssetRepository,
) *QRHandler {
	return &QRHandler{
		userRepo:  userRepo,
		authSvc:   authSvc,
		qrSvc:     qrSvc,
		qrLogSvc:  qrLogSvc,
		txRepo:    txRepo,
		maintRepo: maintRepo,
		assetRepo: assetRepo,
	}
}

func (h *QRHandler) buildScannerURL(c *gin.Context, token string) string {
	origin := c.Request.Header.Get("Origin")
	if origin == "" {
		origin = c.Request.Header.Get("Referer")
		if len(origin) > 0 && origin[len(origin)-1] == '/' {
			origin = origin[:len(origin)-1]
		}
	}
	if origin == "" {
		origin = "http://localhost:5173"
	}
	return origin + "/usuario/" + token
}

// GetMyQR GET /api/v1/qr/me
func (h *QRHandler) GetMyQR(c *gin.Context) {
	user := middleware.GetCurrentUser(c)

	if user.QRToken == nil || *user.QRToken == "" {
		newToken, err := h.userRepo.RegenerateQRToken(user.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"detail": "Failed to generate QR token"})
			return
		}
		user.QRToken = &newToken
	}

	qrContent := h.buildScannerURL(c, *user.QRToken)
	qrBase64, err := h.qrSvc.GenerateQRBase64(qrContent)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "Failed to generate QR code"})
		return
	}

	c.JSON(http.StatusOK, dto.UserQRResponse{
		QRCodeBase64: qrBase64,
		QRToken:      *user.QRToken,
		CreatedAt:    user.QRTokenCreatedAt,
		HasPIN:       user.HasPIN(),
	})
}

// GenerateQRToken POST /api/v1/qr/me/generate
func (h *QRHandler) GenerateQRToken(c *gin.Context) {
	user := middleware.GetCurrentUser(c)

	newToken, err := h.userRepo.RegenerateQRToken(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "Failed to regenerate QR token"})
		return
	}

	h.qrLogSvc.LogRegenerate(c, user.ID)

	qrContent := h.buildScannerURL(c, newToken)
	qrBase64, _ := h.qrSvc.GenerateQRBase64(qrContent)
	now := time.Now().UTC()

	c.JSON(http.StatusOK, dto.UserQRResponse{
		QRCodeBase64: qrBase64,
		QRToken:      newToken,
		CreatedAt:    &now,
		HasPIN:       user.HasPIN(),
	})
}

// GetMyBadge GET /api/v1/qr/me/badge
func (h *QRHandler) GetMyBadge(c *gin.Context) {
	user := middleware.GetCurrentUser(c)

	if user.QRToken == nil || *user.QRToken == "" {
		newToken, _ := h.userRepo.RegenerateQRToken(user.ID)
		user.QRToken = &newToken
	}

	qrContent := h.buildScannerURL(c, *user.QRToken)
	qrBase64, _ := h.qrSvc.GenerateQRBase64(qrContent)

	var deptName *string
	if user.Departamento != nil {
		deptName = &user.Departamento.Nome
	}

	c.JSON(http.StatusOK, dto.UserBadgeResponse{
		ID:               user.ID,
		Nome:             user.Nome,
		Email:            user.Email,
		Matricula:        user.Matricula,
		Cargo:            user.Cargo,
		DepartamentoNome: deptName,
		AvatarURL:        user.AvatarURL,
		QRCodeBase64:     qrBase64,
	})
}

// SetPIN POST /api/v1/qr/me/pin
func (h *QRHandler) SetPIN(c *gin.Context) {
	user := middleware.GetCurrentUser(c)

	var req dto.PINSetupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}

	hadPIN := user.HasPIN()

	if err := h.userRepo.SetPIN(user.ID, req.PIN); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "PIN deve ter 4-6 dígitos numéricos"})
		return
	}

	h.qrLogSvc.LogPINAction(c, user.ID, hadPIN)
	c.JSON(http.StatusOK, gin.H{"message": "PIN configurado com sucesso"})
}

// LoginWithQR POST /api/v1/qr/login
func (h *QRHandler) LoginWithQR(c *gin.Context) {
	var req dto.QRLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}

	user, err := h.userRepo.GetByQRToken(req.QRToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "QR Code inválido ou expirado"})
		return
	}

	if isTokenExpired(user.QRTokenCreatedAt) {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "QR Code expirado. Regenere seu QR Code."})
		return
	}

	if !user.IsActive {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Usuario Inativo entrar em contato com TI."})
		return
	}

	if !user.HasPIN() {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "PIN não configurado. Configure o PIN no seu perfil."})
		return
	}

	if !service.VerifyPIN(req.PIN, *user.PINHash) {
		h.qrLogSvc.LogLogin(c, user.ID, false)
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "PIN incorreto"})
		return
	}

	h.qrLogSvc.LogLogin(c, user.ID, true)

	token, err := h.authSvc.CreateAccessTokenForUser(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "Failed to create token"})
		return
	}

	c.JSON(http.StatusOK, dto.TokenResponse{AccessToken: token, TokenType: "bearer"})
}

// GetUserByQR GET /api/v1/qr/user/:token
func (h *QRHandler) GetUserByQR(c *gin.Context) {
	currentUser := middleware.GetCurrentUser(c)

	if currentUser.Role != models.RoleAdmin && currentUser.Role != models.RoleGerente {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Apenas Admin e Gerente TI podem consultar perfis via QR"})
		return
	}

	token := c.Param("token")
	user, err := h.userRepo.GetByQRToken(token)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Usuário não encontrado"})
		return
	}

	var deptName *string
	if user.Departamento != nil {
		deptName = &user.Departamento.Nome
	}

	// Fetch pending deliveries for the scanned user
	var pendingDeliveries []dto.PendingDeliveryItem
	sols, _ := h.txRepo.ListSolicitacoes(&user.ID, 0, 1000)
	for _, s := range sols {
		if s.SolicitanteID != nil && *s.SolicitanteID == user.ID && s.Status == models.StatusSolicitacaoAprovada {
			assetTag := ""
			assetNome := ""
			if s.Asset != nil {
				assetTag = s.Asset.EPatrimonio
				assetNome = s.Asset.Nome
			}
			pendingDeliveries = append(pendingDeliveries, dto.PendingDeliveryItem{
				ID:              s.ID,
				Tipo:            "empréstimo",
				AssetTag:        assetTag,
				AssetNome:       assetNome,
				DataSolicitacao: s.DataSolicitacao,
				Status:          string(s.Status),
			})
		}
	}

	reqs, _ := h.maintRepo.ListRequests(&user.ID, 0, 1000)
	for _, r := range reqs {
		if r.SolicitanteID != nil && *r.SolicitanteID == user.ID && r.Status == models.StatusMaintAguardandoEntrega {
			assetTag := ""
			assetNome := ""
			if r.Asset != nil {
				assetTag = r.Asset.EPatrimonio
				assetNome = r.Asset.Nome
			}
			pendingDeliveries = append(pendingDeliveries, dto.PendingDeliveryItem{
				ID:              r.ID,
				Tipo:            "manutenção",
				AssetTag:        assetTag,
				AssetNome:       assetNome,
				DataSolicitacao: r.DataSolicitacao,
				Status:          string(r.Status),
			})
		}
	}

	c.JSON(http.StatusOK, dto.UserPublicProfile{
		ID:                user.ID,
		Nome:              user.Nome,
		Email:             user.Email,
		Matricula:         user.Matricula,
		Cargo:             user.Cargo,
		DepartamentoNome:  deptName,
		AvatarURL:         user.AvatarURL,
		PendingDeliveries: pendingDeliveries,
	})
}

// DeliveryConfirm POST /api/v1/qr/delivery/confirm
func (h *QRHandler) DeliveryConfirm(c *gin.Context) {
	var req dto.DeliveryConfirmRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"detail": err.Error()})
		return
	}

	currentUser := middleware.GetCurrentUser(c)
	var user *models.User

	// 1. Fetch User if QR Token is provided
	if req.QRToken != nil && *req.QRToken != "" {
		var err error
		user, err = h.userRepo.GetByQRToken(*req.QRToken)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"detail": "QR Code inválido ou expirado"})
			return
		}
	} else {
		// If no QR token provided, it MUST be a manual bypass by a manager/admin
		if currentUser == nil || !currentUser.IsManagerOrAbove() {
			c.JSON(http.StatusForbidden, gin.H{"detail": "Apenas gerentes e administradores podem realizar entrega manual sem QR Code"})
			return
		}
		// Require explicit bypass PIN flag for manual deliveries
		if !req.BypassPIN {
			c.JSON(http.StatusBadRequest, gin.H{"detail": "QR Token do usuário é obrigatório, ou ative a entrega manual (bypass)"})
			return
		}
	}

	// 2. Validate PIN (unless bypassed by manager/admin)
	shouldValidatePIN := true
	if req.BypassPIN {
		if currentUser != nil && currentUser.IsManagerOrAbove() {
			shouldValidatePIN = false
		} else {
			c.JSON(http.StatusForbidden, gin.H{"detail": "Apenas técnicos ou administradores podem ignorar a validação do PIN"})
			return
		}
	}

	if shouldValidatePIN {
		if user == nil {
			c.JSON(http.StatusBadRequest, gin.H{"detail": "Usuário não identificado para validar o PIN"})
			return
		}
		if req.PIN == nil || *req.PIN == "" {
			c.JSON(http.StatusBadRequest, gin.H{"detail": "PIN do usuário é obrigatório"})
			return
		}
		if !user.HasPIN() {
			c.JSON(http.StatusBadRequest, gin.H{"detail": "Usuário não possui PIN configurado"})
			return
		}
		if !service.VerifyPIN(*req.PIN, *user.PINHash) {
			c.JSON(http.StatusUnauthorized, gin.H{"detail": "PIN incorreto"})
			return
		}
	}

	// 3. Confirm Borrowing (Solicitacao) or Maintenance Delivery (Manutencao / SolicitacaoManutencao)
	if req.SolicitacaoID != nil {
		sol, err := h.txRepo.GetSolicitacaoByID(*req.SolicitacaoID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"detail": "Solicitação de empréstimo não encontrada"})
			return
		}

		// If user was fetched via QR, ensure they are the requester
		if user != nil {
			if sol.SolicitanteID == nil || *sol.SolicitanteID != user.ID {
				c.JSON(http.StatusForbidden, gin.H{"detail": "QR Code não pertence ao solicitante do equipamento"})
				return
			}
		} else {
			// If manual delivery, fetch the user from the solicitation
			var fetchErr error
			user, fetchErr = h.userRepo.GetByID(*sol.SolicitanteID)
			if fetchErr != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": "Erro ao localizar usuário solicitante"})
				return
			}
		}

		if sol.Status != models.StatusSolicitacaoAprovada {
			c.JSON(http.StatusBadRequest, gin.H{"detail": "Apenas solicitações Aprovadas podem ter entrega confirmada"})
			return
		}

		now := time.Now()
		confirmador := middleware.GetCurrentUser(c)
		uid := confirmador.ID
		confirmViaQR := true

		sol.Status = models.StatusSolicitacaoEntregue
		sol.DataEntrega = &now
		sol.ConfirmadoPorID = &uid
		sol.ConfirmadoViaQR = &confirmViaQR
		if req.Observacao != nil {
			sol.ObservacaoEntrega = req.Observacao
		}

		if err := h.txRepo.UpdateSolicitacao(sol); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"detail": "Erro ao atualizar solicitação: " + err.Error()})
			return
		}

		// Update asset location/owner
		if sol.AssetID != nil {
			asset, err := h.assetRepo.GetByID(*sol.AssetID)
			if err == nil {
				asset.Status = models.AssetStatusEmUso
				asset.CurrentUserID = &user.ID
				_ = h.assetRepo.Update(asset)

				// Create movement log
				mov := &models.Movimentacao{
					AssetID:    asset.ID,
					Tipo:       models.TipoMovimentacaoEmprestimo,
					DeUserID:   &uid,
					ParaUserID: &user.ID,
					Observacao: req.Observacao,
				}
				_ = h.txRepo.CreateMovement(mov)
			}
		}

		c.JSON(http.StatusOK, gin.H{"message": "Entrega de empréstimo confirmada com sucesso"})
		return
	}

	if req.ManutencaoID != nil {
		// Delivery confirm for maintenance request (returns asset to user)
		var reqMaint *models.SolicitacaoManutencao
		reqs, _ := h.maintRepo.ListRequests(nil, 0, 1000)
		for i := range reqs {
			if reqs[i].ManutencaoID != nil && *reqs[i].ManutencaoID == *req.ManutencaoID {
				reqMaint = &reqs[i]
				break
			}
		}

		if reqMaint == nil {
			c.JSON(http.StatusNotFound, gin.H{"detail": "Solicitação de manutenção correspondente não encontrada"})
			return
		}

		// If user was fetched via QR, ensure they are the requester
		if user != nil {
			if reqMaint.SolicitanteID == nil || *reqMaint.SolicitanteID != user.ID {
				c.JSON(http.StatusForbidden, gin.H{"detail": "QR Code não pertence ao solicitante original da manutenção"})
				return
			}
		} else {
			// Manual bypass delivery, fetch user from request
			var fetchErr error
			user, fetchErr = h.userRepo.GetByID(*reqMaint.SolicitanteID)
			if fetchErr != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": "Erro ao localizar usuário solicitante"})
				return
			}
		}

		if reqMaint.Status != models.StatusMaintAguardandoEntrega && reqMaint.Status != models.StatusMaintEntregue {
			c.JSON(http.StatusBadRequest, gin.H{"detail": "A solicitação não está aguardando entrega"})
			return
		}

		// Process confirmation
		asset, err := h.assetRepo.GetByID(reqMaint.AssetID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"detail": "Ativo não encontrado"})
			return
		}

		// Restore asset status/location using GORM repo update triggers
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
		reqMaint.Status = models.StatusMaintConcluida
		reqMaint.DataEntrega = &now
		if err := h.maintRepo.UpdateRequest(reqMaint); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"detail": "Erro ao salvar conclusão: " + err.Error()})
			return
		}

		// Log movement
		confirmador := middleware.GetCurrentUser(c)
		uid := confirmador.ID
		mov := &models.Movimentacao{
			AssetID:    reqMaint.AssetID,
			Tipo:       models.TipoMovimentacaoDevolucao,
			DeUserID:   &uid,
			ParaUserID: &user.ID,
			Observacao: req.Observacao,
		}
		_ = h.txRepo.CreateMovement(mov)

		c.JSON(http.StatusOK, gin.H{"message": "Entrega de manutenção confirmada com sucesso"})
		return
	}

	c.JSON(http.StatusBadRequest, gin.H{"detail": "Deve fornecer solicitacao_id ou manutencao_id"})
}

func isTokenExpired(createdAt *time.Time) bool {
	if createdAt == nil {
		return true
	}
	return time.Now().UTC().After(createdAt.Add(qrTokenExpiryDays * 24 * time.Hour))
}
