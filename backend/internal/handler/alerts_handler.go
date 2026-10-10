package handler

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/assettrack/backend/internal/middleware"
	"github.com/assettrack/backend/internal/models"
	"github.com/assettrack/backend/internal/repository"
	"github.com/assettrack/backend/internal/service"
	"github.com/gin-gonic/gin"
)

// AlertSSEBroker broadcasts emergency alerts to subscribed staff members.
type AlertSSEBroker struct {
	mu       sync.RWMutex
	channels map[chan interface{}]bool
}

func NewAlertSSEBroker() *AlertSSEBroker {
	return &AlertSSEBroker{channels: make(map[chan interface{}]bool)}
}

func (b *AlertSSEBroker) Subscribe() chan interface{} {
	ch := make(chan interface{}, 16)
	b.mu.Lock()
	b.channels[ch] = true
	b.mu.Unlock()
	return ch
}

func (b *AlertSSEBroker) Unsubscribe(ch chan interface{}) {
	b.mu.Lock()
	delete(b.channels, ch)
	b.mu.Unlock()
	close(ch)
}

func (b *AlertSSEBroker) Broadcast(payload interface{}) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for ch := range b.channels {
		select {
		case ch <- payload:
		default:
		}
	}
}

type AlertsHandler struct {
	alertRepo  *repository.EmergencyAlertRepository
	avisoRepo  *repository.AvisoRepository
	userRepo   *repository.UserRepository
	assetRepo  *repository.AssetRepository
	broker     *AlertSSEBroker
	dispatcher *service.WebhookDispatcher
	gamificationSvc *service.GamificationService
}

func (h *AlertsHandler) SetGamificationService(svc *service.GamificationService) {
	h.gamificationSvc = svc
}

func NewAlertsHandler(
	alertRepo *repository.EmergencyAlertRepository,
	avisoRepo *repository.AvisoRepository,
	userRepo *repository.UserRepository,
	assetRepo *repository.AssetRepository,
	broker *AlertSSEBroker,
	dispatcher *service.WebhookDispatcher,
) *AlertsHandler {
	return &AlertsHandler{
		alertRepo:  alertRepo,
		avisoRepo:  avisoRepo,
		userRepo:   userRepo,
		assetRepo:  assetRepo,
		broker:     broker,
		dispatcher: dispatcher,
	}
}

// ---------- Emergency Alerts ----------

func (h *AlertsHandler) SendAlert(c *gin.Context) {
	user := middleware.GetCurrentUser(c)

	var in struct {
		Motivo string `json:"motivo"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(in.Motivo) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "O motivo do alerta não pode estar em branco"})
		return
	}

	// Sector name: departamento > cargo
	setorStr := "Não informado"
	if user.DepartamentoID != nil {
		var dept models.Departamento
		if err := h.userRepo.DB().First(&dept, *user.DepartamentoID).Error; err == nil {
			setorStr = dept.Nome
		}
	} else if user.Cargo != nil && *user.Cargo != "" {
		setorStr = *user.Cargo
	}

	// Assets currently in use by the user
	ativoStr := "Nenhum ativo vinculado"
	assets, err := h.assetRepo.ListByCurrentUser(user.ID)
	if err == nil && len(assets) > 0 {
		names := make([]string, 0, len(assets))
		for _, a := range assets {
			if a.EPatrimonio != "" {
				names = append(names, a.Nome+" ("+a.EPatrimonio+")")
			} else {
				names = append(names, a.Nome)
			}
		}
		ativoStr = strings.Join(names, ", ")
	}

	alert := &models.EmergencyAlert{
		UsuarioID:   user.ID,
		UsuarioNome: user.Nome,
		Motivo:      strings.TrimSpace(in.Motivo),
		Atendido:    false,
	}
	if setorStr != "" {
		alert.SetorNome = &setorStr
	}
	if ativoStr != "" {
		alert.AtivoNome = &ativoStr
	}

	if err := h.alertRepo.Create(alert); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	payload := gin.H{
		"id":           alert.ID,
		"usuario_nome": user.Nome,
		"usuario_id":   user.ID,
		"setor_nome":   setorStr,
		"ativo_nome":   ativoStr,
		"motivo":       alert.Motivo,
		"created_at":   alert.CreatedAt.Format("02/01/2006 15:04:05"),
	}

	h.broker.Broadcast(payload)
	if h.dispatcher != nil {
		h.dispatcher.DispatchEvent("EMERGENCY_ALERT_TRIGGERED", payload)
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "Alerta emergencial transmitido aos administradores e equipe técnica!",
		"alert":   payload,
	})
}

// StaffRole checks whether a user may receive the emergency SSE stream.
func staffRole(role string) bool {
	switch strings.ToLower(role) {
	case models.RoleAdmin, models.RoleGerente, models.RoleGerenteInfra, models.RoleTecnico:
		return true
	}
	return false
}

func (h *AlertsHandler) AlertStream(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	if !staffRole(user.Role) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Apenas administradores, gerentes e técnicos recebem a transmissão de emergência"})
		return
	}

	ch := h.broker.Subscribe()
	defer h.broker.Unsubscribe(ch)

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case payload := <-ch:
			c.SSEvent("emergency_alert", payload)
			c.Writer.Flush()
		case <-ticker.C:
			c.Writer.WriteString(": keep-alive\n\n")
			c.Writer.Flush()
		case <-c.Request.Context().Done():
			return
		}
	}
}

func (h *AlertsHandler) History(c *gin.Context) {
	alerts, err := h.alertRepo.History(100)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Enrich legacy alerts that were created before the equipment lookup was
	// corrected. This keeps the existing modal accurate without rewriting data.
	for i := range alerts {
		if alerts[i].AtivoNome != nil && strings.TrimSpace(*alerts[i].AtivoNome) != "" {
			continue
		}
		assets, assetErr := h.assetRepo.ListByCurrentUser(alerts[i].UsuarioID)
		if assetErr != nil || len(assets) == 0 {
			continue
		}
		names := make([]string, 0, len(assets))
		for _, asset := range assets {
			if asset.EPatrimonio != "" {
				names = append(names, asset.Nome+" ("+asset.EPatrimonio+")")
			} else {
				names = append(names, asset.Nome)
			}
		}
		assetName := strings.Join(names, ", ")
		alerts[i].AtivoNome = &assetName
	}
	c.JSON(http.StatusOK, alerts)
}

func (h *AlertsHandler) MarkAtendido(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	if !staffRole(user.Role) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Não autorizado"})
		return
	}

	id, err := strconv.ParseUint(c.Param("alertId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	alert, err := h.alertRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Alerta não encontrado"})
		return
	}
	if !alert.Ciente {
		c.JSON(http.StatusBadRequest, gin.H{"error": "O alerta precisa ser marcado como ciente antes de ser atendido"})
		return
	}

	if err := h.alertRepo.MarkAtendido(uint(id), user.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Gamificação: premiar técnico ao normalizar emergência crítica
	if h.gamificationSvc != nil && user.CanAccessGamification() {
		alertID := uint(id)
		go func(tID uint, aID uint) {
			_, _ = h.gamificationSvc.AwardActivityXP(
				tID,
				"emergency_alert",
				&aID,
				100,
				50,
				fmt.Sprintf("Ocorrência crítica de emergência #%d normalizada", aID),
				50,
			)
		}(user.ID, alertID)
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *AlertsHandler) MarkCiente(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	if !staffRole(user.Role) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Não autorizado"})
		return
	}

	id, err := strconv.ParseUint(c.Param("alertId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	alert, err := h.alertRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Alerta não encontrado"})
		return
	}
	if alert.Ciente {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
		return
	}

	if err := h.alertRepo.MarkCiente(uint(id), user.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// ---------- Avisos ----------

func (h *AlertsHandler) ListAvisos(c *gin.Context) {
	avisos, err := h.avisoRepo.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, avisos)
}

// ListActiveAvisos is the public-ish endpoint for dashboards (any authenticated user).
func (h *AlertsHandler) ListActiveAvisos(c *gin.Context) {
	avisos, err := h.avisoRepo.ListActive(time.Now())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, avisos)
}

type avisoInput struct {
	Titulo           string  `json:"titulo"`
	Texto            string  `json:"texto"`
	MidiaURL         string  `json:"midia_url"`
	MidiaTipo        string  `json:"midia_tipo"`
	LinkURL          string  `json:"link_url"`
	LinkTexto        string  `json:"link_texto"`
	Ativo            *bool   `json:"ativo"`
	ProgramadoInicio *string `json:"programado_inicio"`
	ProgramadoFim    *string `json:"programado_fim"`
}

func applyAvisoInput(aviso *models.Aviso, in avisoInput) {
	aviso.Titulo = strings.TrimSpace(in.Titulo)
	aviso.Texto = nil
	if strings.TrimSpace(in.Texto) != "" {
		t := strings.TrimSpace(in.Texto)
		aviso.Texto = &t
	}
	aviso.MidiaURL = nil
	if strings.TrimSpace(in.MidiaURL) != "" {
		u := strings.TrimSpace(in.MidiaURL)
		aviso.MidiaURL = &u
	}
	aviso.MidiaTipo = nil
	if in.MidiaTipo == "imagem" || in.MidiaTipo == "video" {
		aviso.MidiaTipo = &in.MidiaTipo
	}
	aviso.LinkURL = nil
	if strings.TrimSpace(in.LinkURL) != "" {
		u := strings.TrimSpace(in.LinkURL)
		aviso.LinkURL = &u
	}
	aviso.LinkTexto = nil
	if strings.TrimSpace(in.LinkTexto) != "" {
		t := strings.TrimSpace(in.LinkTexto)
		aviso.LinkTexto = &t
	}
	if in.Ativo != nil {
		aviso.Ativo = *in.Ativo
	}
	aviso.ProgramadoInicio = parseOptionalDate(in.ProgramadoInicio)
	aviso.ProgramadoFim = parseOptionalDate(in.ProgramadoFim)
}

func parseOptionalDate(s *string) *time.Time {
	if s == nil || strings.TrimSpace(*s) == "" {
		return nil
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04", "2006-01-02 15:04", "2006-01-02"} {
		if t, err := time.Parse(layout, strings.TrimSpace(*s)); err == nil {
			return &t
		}
	}
	return nil
}

func (h *AlertsHandler) CreateAviso(c *gin.Context) {
	var in avisoInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(in.Titulo) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Título é obrigatório"})
		return
	}

	aviso := &models.Aviso{Ativo: true}
	applyAvisoInput(aviso, in)

	if err := h.avisoRepo.Create(aviso); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, aviso)
}

func (h *AlertsHandler) UpdateAviso(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("avisoId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	aviso, err := h.avisoRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Aviso não encontrado"})
		return
	}

	var in avisoInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	applyAvisoInput(aviso, in)

	if err := h.avisoRepo.Update(aviso); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, aviso)
}

func (h *AlertsHandler) ToggleAviso(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("avisoId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	aviso, err := h.avisoRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Aviso não encontrado"})
		return
	}

	aviso.Ativo = !aviso.Ativo
	if err := h.avisoRepo.Update(aviso); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, aviso)
}

func (h *AlertsHandler) DeleteAviso(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("avisoId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	if err := h.avisoRepo.Delete(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Aviso excluído"})
}

// UploadAvisoMedia handles image and video uploads for system notices
func (h *AlertsHandler) UploadAvisoMedia(c *gin.Context) {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nenhum arquivo enviado"})
		return
	}

	// 100MB max limit for videos/images
	if fileHeader.Size > 100*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Arquivo excede o limite máximo de 100MB"})
		return
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	mediaTipo := "imagem"
	if ext == ".mp4" || ext == ".webm" || ext == ".mov" || ext == ".mkv" || ext == ".avi" {
		mediaTipo = "video"
	} else if ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".webp" || ext == ".gif" || ext == ".svg" {
		mediaTipo = "imagem"
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Formato de arquivo não suportado. Envie imagens ou vídeos."})
		return
	}

	uploadDir := filepath.Join("uploads", "avisos")
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro ao criar diretório de uploads"})
		return
	}

	filename := fmt.Sprintf("%d_%s", time.Now().UnixNano(), filepath.Base(fileHeader.Filename))
	dst := filepath.Join(uploadDir, filename)

	if err := c.SaveUploadedFile(fileHeader, dst); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Falha ao salvar arquivo"})
		return
	}

	publicURL := fmt.Sprintf("/uploads/avisos/%s", filename)
	c.JSON(http.StatusOK, gin.H{
		"url":        publicURL,
		"midia_tipo": mediaTipo,
		"filename":   filename,
	})
}
