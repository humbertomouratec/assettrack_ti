package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"mime/multipart"
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
	"github.com/google/uuid"
	"gorm.io/gorm"
)

const kanbanUploadDir = "uploads/kanban"
const defaultKanbanBoardBackgroundColor = "#212121"
const defaultKanbanBoardPattern = "glow"
const defaultKanbanCardColor = "#0079BF"
const defaultPreventiveKanbanCardColor = "#06B6D4"
const defaultPreventiveKanbanCardTitleTemplate = "Preventiva {{os}} - {{ativo}}"
const defaultPreventiveKanbanCardDescriptionTemplate = "OS {{os}} programada para {{data}}.\n\nPlano: {{plano}}\nAtivo/Serviço: {{ativo}}\nStatus: {{status}}\nTipo: {{tipo}}"
const defaultPreventiveKanbanChecklistTemplate = "Inspecionar condições de segurança\nExecutar checklist técnico\nRegistrar evidências e recomendações"

// KanbanEvent is a server-sent event payload.
type KanbanEvent struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

// SSEClient is a subscribed user connection.
type SSEClient struct {
	userID uint
	ch     chan KanbanEvent
}

// KanbanSSEBroker broadcasts events to subscribed users.
type KanbanSSEBroker struct {
	mu      sync.RWMutex
	clients map[uint]map[*SSEClient]bool
}

func NewKanbanSSEBroker() *KanbanSSEBroker {
	return &KanbanSSEBroker{clients: make(map[uint]map[*SSEClient]bool)}
}

func (b *KanbanSSEBroker) Subscribe(userID uint) *SSEClient {
	client := &SSEClient{userID: userID, ch: make(chan KanbanEvent, 16)}
	b.mu.Lock()
	if b.clients[userID] == nil {
		b.clients[userID] = make(map[*SSEClient]bool)
	}
	b.clients[userID][client] = true
	b.mu.Unlock()
	return client
}

func (b *KanbanSSEBroker) Unsubscribe(client *SSEClient) {
	b.mu.Lock()
	if users, ok := b.clients[client.userID]; ok {
		delete(users, client)
		if len(users) == 0 {
			delete(b.clients, client.userID)
		}
	}
	b.mu.Unlock()
	close(client.ch)
}

func (b *KanbanSSEBroker) BroadcastToUsers(userIDs []uint, event KanbanEvent) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for _, uid := range userIDs {
		if clients, ok := b.clients[uid]; ok {
			for client := range clients {
				select {
				case client.ch <- event:
				default:
					// Slow client — drop event
				}
			}
		}
	}
}

type KanbanHandler struct {
	projectRepo     *repository.KanbanProjectRepository
	columnRepo      *repository.KanbanColumnRepository
	cardRepo        *repository.KanbanCardRepository
	interactionRepo *repository.KanbanInteractionRepository
	attachmentRepo  *repository.KanbanAttachmentRepository
	notifRepo       *repository.KanbanNotificationRepository
	userRepo        *repository.UserRepository
	broker          *KanbanSSEBroker
	settingsRepo    repository.SystemSettingsRepository
	emailSvc        service.EmailService
	gamificationSvc *service.GamificationService
}

func (h *KanbanHandler) SetGamificationService(svc *service.GamificationService) {
	h.gamificationSvc = svc
}

func NewKanbanHandler(
	projectRepo *repository.KanbanProjectRepository,
	columnRepo *repository.KanbanColumnRepository,
	cardRepo *repository.KanbanCardRepository,
	interactionRepo *repository.KanbanInteractionRepository,
	attachmentRepo *repository.KanbanAttachmentRepository,
	notifRepo *repository.KanbanNotificationRepository,
	userRepo *repository.UserRepository,
	broker *KanbanSSEBroker,
	settingsRepo repository.SystemSettingsRepository,
	emailSvc service.EmailService,
) *KanbanHandler {
	return &KanbanHandler{
		projectRepo:     projectRepo,
		columnRepo:      columnRepo,
		cardRepo:        cardRepo,
		interactionRepo: interactionRepo,
		attachmentRepo:  attachmentRepo,
		notifRepo:       notifRepo,
		userRepo:        userRepo,
		broker:          broker,
		settingsRepo:    settingsRepo,
		emailSvc:        emailSvc,
	}
}

var defaultKanbanColumns = []struct {
	Nome string
	Cor  string
}{
	{"A Fazer", "#3B82F6"},
	{"Em Andamento", "#F59E0B"},
	{"Aguardando Compras", "#8B5CF6"},
	{"Concluído", "#10B981"},
}

// userCanAccessProject checks if the user is admin, the creator, or a participant.
func (h *KanbanHandler) userCanAccessProject(user *models.User, project *models.KanbanProject) bool {
	if user.Role == models.RoleAdmin || project.CriadorID == user.ID {
		return true
	}
	for _, p := range project.Participantes {
		if p.ID == user.ID {
			return true
		}
	}
	return false
}

// projectParticipantIDs returns unique user IDs to notify about a project.
func (h *KanbanHandler) projectParticipantIDs(project *models.KanbanProject) []uint {
	ids := map[uint]bool{project.CriadorID: true}
	for _, p := range project.Participantes {
		ids[p.ID] = true
	}
	result := make([]uint, 0, len(ids))
	for id := range ids {
		result = append(result, id)
	}
	return result
}

func (h *KanbanHandler) notify(userIDs []uint, autorID uint, tipo, titulo, mensagem string, projectID, cardID *uint) {
	internalEnabled := service.IsNotificationSettingEnabled(context.Background(), h.settingsRepo, service.NotificationKanbanEnabled, true)
	emailEnabled := h.emailSvc != nil && h.emailSvc.IsNotificationEnabled(context.Background(), service.EmailNotificationKanban, true)
	for _, uid := range userIDs {
		link := fmt.Sprintf("/kanban")
		if internalEnabled {
			_ = h.notifRepo.Create(&models.KanbanNotification{UserID: uid, AutorID: &autorID, ProjectID: projectID, CardID: cardID, Tipo: tipo, Titulo: titulo, Mensagem: mensagem, Link: &link, Lida: uid == autorID})
		}
		if emailEnabled && uid != autorID {
			if recipient, err := h.userRepo.GetByID(uid); err == nil && strings.TrimSpace(recipient.Email) != "" {
				_ = h.emailSvc.SendEmail(context.Background(), recipient.Email, titulo+" — AssetTrack TI", "<p>"+html.EscapeString(mensagem)+"</p>")
			}
		}
	}
	payload := gin.H{"tipo": tipo, "mensagem": mensagem}
	if projectID != nil {
		payload["project_id"] = *projectID
	}
	if cardID != nil {
		payload["card_id"] = *cardID
	}
	if internalEnabled {
		h.broker.BroadcastToUsers(userIDs, KanbanEvent{Type: "kanban_update", Payload: payload})
	}
}

// ---------- Projects ----------

func (h *KanbanHandler) ListProjects(c *gin.Context) {
	includeArchived := c.Query("incluir_arquivados") == "true"
	projects, err := h.projectRepo.List(includeArchived)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	user := middleware.GetCurrentUser(c)
	accessible := make([]models.KanbanProject, 0)
	for _, p := range projects {
		if h.userCanAccessProject(user, &p) {
			p.Favoritado, _ = h.projectRepo.IsFavorite(p.ID, user.ID)
			accessible = append(accessible, p)
		}
	}
	c.JSON(http.StatusOK, accessible)
}

func (h *KanbanHandler) CreateProject(c *gin.Context) {
	user := middleware.GetCurrentUser(c)

	var in struct {
		Titulo                            string `json:"titulo"`
		Descricao                         string `json:"descricao"`
		BoardBackgroundColor              string `json:"board_background_color"`
		BoardPattern                      string `json:"board_pattern"`
		RelatedToMaintenance              bool   `json:"related_to_maintenance"`
		RelatedToPreventive               bool   `json:"related_to_preventive"`
		PreventivePlanID                  *uint  `json:"preventive_plan_id"`
		PreventiveAutomationEnabled       bool   `json:"preventive_automation_enabled"`
		PreventiveAutomationHorizonDays   int    `json:"preventive_automation_horizon_days"`
		PreventiveCardTitleTemplate       string `json:"preventive_card_title_template"`
		PreventiveCardDescriptionTemplate string `json:"preventive_card_description_template"`
		PreventiveCardChecklistTemplate   string `json:"preventive_card_checklist_template"`
		PreventiveCardPriority            string `json:"preventive_card_priority"`
		PreventiveCardColor               string `json:"preventive_card_color"`
		ParticipanteIDs                   []uint `json:"participante_ids"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(in.Titulo) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Título é obrigatório"})
		return
	}

	// Include creator in participants
	participantIDs := append([]uint{user.ID}, in.ParticipanteIDs...)
	var participants []models.User
	if len(participantIDs) > 0 {
		if err := h.userRepo.DB().Where("id IN ?", uniqueUints(participantIDs)).Find(&participants).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	var preventivePlanID *uint
	if in.RelatedToPreventive && in.PreventivePlanID != nil {
		var plan models.MaintenancePlan
		if err := h.userRepo.DB().First(&plan, *in.PreventivePlanID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Plano preventivo não encontrado"})
			return
		}
		preventivePlanID = in.PreventivePlanID
	}

	project := &models.KanbanProject{
		Titulo:                          strings.TrimSpace(in.Titulo),
		BoardBackgroundColor:            normalizeHexColor(in.BoardBackgroundColor, defaultKanbanBoardBackgroundColor),
		BoardPattern:                    normalizeBoardPattern(in.BoardPattern),
		RelatedToMaintenance:            in.RelatedToMaintenance,
		RelatedToPreventive:             in.RelatedToPreventive,
		PreventivePlanID:                preventivePlanID,
		PreventiveAutomationEnabled:     in.RelatedToPreventive && in.PreventiveAutomationEnabled,
		PreventiveAutomationHorizonDays: normalizePreventiveAutomationHorizon(in.PreventiveAutomationHorizonDays),
		PreventiveCardTitleTemplate:     normalizePreventiveTemplate(in.PreventiveCardTitleTemplate, defaultPreventiveKanbanCardTitleTemplate),
		PreventiveCardPriority:          normalizeEnumValue(in.PreventiveCardPriority, []string{models.CardPriorityBaixa, models.CardPriorityMedia, models.CardPriorityAlta, models.CardPriorityUrgente}, models.CardPriorityAlta),
		PreventiveCardColor:             normalizeHexColor(in.PreventiveCardColor, defaultPreventiveKanbanCardColor),
		CriadorID:                       user.ID,
		IsActive:                        true,
		Participantes:                   participants,
	}
	if strings.TrimSpace(in.Descricao) != "" {
		d := strings.TrimSpace(in.Descricao)
		project.Descricao = &d
	}
	if strings.TrimSpace(in.PreventiveCardDescriptionTemplate) != "" {
		d := strings.TrimSpace(in.PreventiveCardDescriptionTemplate)
		project.PreventiveCardDescriptionTemplate = &d
	}
	if strings.TrimSpace(in.PreventiveCardChecklistTemplate) != "" {
		checklist := buildKanbanChecklistTemplate(in.PreventiveCardChecklistTemplate)
		project.PreventiveCardChecklistTemplate = checklist
	}

	if err := h.projectRepo.Create(project); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Default columns
	for idx, col := range defaultKanbanColumns {
		_ = h.columnRepo.Create(&models.KanbanColumn{
			ProjectID: project.ID,
			Nome:      col.Nome,
			Cor:       col.Cor,
			Ordem:     idx,
			IsDefault: true,
		})
	}

	h.notify(h.projectParticipantIDs(project), user.ID, models.NotifProjetoAdicionado,
		"Novo projeto de Kanban",
		fmt.Sprintf("%s criou o projeto '%s'.", user.Nome, project.Titulo),
		&project.ID, nil)

	loaded, _ := h.projectRepo.GetByID(project.ID)
	if loaded == nil {
		loaded = project
	}
	c.JSON(http.StatusCreated, loaded)
}

func (h *KanbanHandler) GetProjectBoard(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	project, err := h.projectRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Projeto não encontrado"})
		return
	}

	if !h.userCanAccessProject(user, project) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Acesso não autorizado a este projeto"})
		return
	}
	project.Favoritado, _ = h.projectRepo.IsFavorite(project.ID, user.ID)

	// Board progress (like Python)
	totalCards := 0
	for _, col := range project.Colunas {
		totalCards += len(col.Cards)
	}
	numCols := len(project.Colunas)
	boardProgress := 0
	if totalCards > 0 && numCols > 1 {
		weighted := 0.0
		for idx, col := range project.Colunas {
			weighted += float64(len(col.Cards)) * (float64(idx) / float64(numCols-1))
		}
		boardProgress = int((weighted / float64(totalCards)) * 100)
	}

	c.JSON(http.StatusOK, gin.H{
		"project":        project,
		"board_progress": boardProgress,
		"total_cards":    totalCards,
	})
}

func (h *KanbanHandler) SyncPreventiveAutomation(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	project, err := h.projectRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Projeto não encontrado"})
		return
	}
	if !h.userCanAccessProject(user, project) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Acesso negado"})
		return
	}
	if user.Role != models.RoleAdmin && project.CriadorID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Apenas administradores ou o criador podem executar esta automação"})
		return
	}
	if !project.RelatedToPreventive || !project.PreventiveAutomationEnabled {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Automação preventiva do Kanban está desativada neste projeto"})
		return
	}
	if project.PreventiveAutomationStartedAt == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Clique em Dar start para iniciar o ciclo antes de sincronizar cards"})
		return
	}

	if err := h.ensurePreventiveStatusColumns(project); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	horizonDays := normalizePreventiveAutomationHorizon(project.PreventiveAutomationHorizonDays)
	windowStart, windowEnd := preventiveAutomationWindow(project)
	// When a cycle expires, roll the window forward without moving or deleting
	// historical cards. New preventive orders generated in the next window get
	// their own cards, preserving a complete maintenance history.
	now := time.Now()
	if project.PreventiveAutomationNextRunAt != nil && !now.Before(*project.PreventiveAutomationNextRunAt) {
		windowStart = *project.PreventiveAutomationNextRunAt
		windowEnd = windowStart.AddDate(0, 0, horizonDays)
		for !now.Before(windowEnd) {
			windowEnd = windowEnd.AddDate(0, 0, horizonDays)
		}
		project.PreventiveAutomationNextRunAt = &windowEnd
	}
	createdCards, err := h.syncPreventiveAutomationCards(project, user.ID, windowStart, windowEnd)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	project.PreventiveAutomationLastRunAt = &now
	// Persist only the cycle timestamps. Saving the fully preloaded project
	// here would also save stale nested cards and undo their status movement.
	if err := h.userRepo.DB().Model(&models.KanbanProject{}).Where("id = ?", project.ID).Updates(map[string]interface{}{
		"preventive_automation_last_run_at": project.PreventiveAutomationLastRunAt,
		"preventive_automation_next_run_at": project.PreventiveAutomationNextRunAt,
		"updated_at":                        now,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(createdCards) > 0 {
		h.notify(h.projectParticipantIDs(project), user.ID, models.NotifCartaoAtribuido,
			"Automação preventiva sincronizada",
			fmt.Sprintf("%d card(s) preventivo(s) foram gerados no projeto '%s'.", len(createdCards), project.Titulo),
			&project.ID, nil)
	}

	c.JSON(http.StatusOK, gin.H{
		"created_count": len(createdCards),
		"cards":         createdCards,
		"horizon_days":  horizonDays,
		"started_at":    project.PreventiveAutomationStartedAt,
		"last_run_at":   project.PreventiveAutomationLastRunAt,
		"next_run_at":   project.PreventiveAutomationNextRunAt,
		"window_start":  windowStart,
		"window_end":    windowEnd,
	})
}

func (h *KanbanHandler) StartPreventiveAutomation(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	project, err := h.projectRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Projeto não encontrado"})
		return
	}
	if !h.userCanAccessProject(user, project) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Acesso negado"})
		return
	}
	if user.Role != models.RoleAdmin && project.CriadorID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Apenas administradores ou o criador podem iniciar esta automação"})
		return
	}
	if !project.RelatedToPreventive || !project.PreventiveAutomationEnabled {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ative a automação preventiva no projeto antes de dar start"})
		return
	}
	if err := h.ensurePreventiveStatusColumns(project); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	horizonDays := normalizePreventiveAutomationHorizon(project.PreventiveAutomationHorizonDays)
	startedAt := time.Now()
	nextRunAt := startedAt.AddDate(0, 0, horizonDays)
	project.PreventiveAutomationStartedAt = &startedAt
	project.PreventiveAutomationLastRunAt = &startedAt
	project.PreventiveAutomationNextRunAt = &nextRunAt
	project.PreventiveAutomationHorizonDays = horizonDays
	project.UpdatedAt = startedAt

	if err := h.projectRepo.Update(project); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	createdCards, err := h.syncPreventiveAutomationCards(project, user.ID, startedAt, nextRunAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(createdCards) > 0 {
		h.notify(h.projectParticipantIDs(project), user.ID, models.NotifCartaoAtribuido,
			"Automação preventiva iniciada",
			fmt.Sprintf("%s iniciou a automação preventiva em '%s' e %d card(s) foram gerados.", user.Nome, project.Titulo, len(createdCards)),
			&project.ID, nil)
	} else {
		h.notify(h.projectParticipantIDs(project), user.ID, models.NotifProjetoAdicionado,
			"Automação preventiva iniciada",
			fmt.Sprintf("%s iniciou a automação preventiva em '%s'. O ciclo de %d dia(s) começou agora.", user.Nome, project.Titulo, horizonDays),
			&project.ID, nil)
	}

	c.JSON(http.StatusOK, gin.H{
		"created_count": len(createdCards),
		"cards":         createdCards,
		"horizon_days":  horizonDays,
		"started_at":    project.PreventiveAutomationStartedAt,
		"last_run_at":   project.PreventiveAutomationLastRunAt,
		"next_run_at":   project.PreventiveAutomationNextRunAt,
		"window_start":  startedAt,
		"window_end":    nextRunAt,
	})
}

func (h *KanbanHandler) ToggleProjectFavorite(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	project, err := h.projectRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Projeto não encontrado"})
		return
	}
	if !h.userCanAccessProject(user, project) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Acesso não autorizado a este projeto"})
		return
	}

	favoritado, err := h.projectRepo.IsFavorite(project.ID, user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	favoritado = !favoritado
	if err := h.projectRepo.SetFavorite(project.ID, user.ID, favoritado); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"favoritado": favoritado})
}

func (h *KanbanHandler) UpdateProject(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	project, err := h.projectRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Projeto não encontrado"})
		return
	}

	if !h.userCanAccessProject(user, project) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Acesso negado"})
		return
	}

	var in struct {
		Titulo                            string  `json:"titulo"`
		Descricao                         string  `json:"descricao"`
		BoardBackgroundColor              *string `json:"board_background_color"`
		BoardPattern                      *string `json:"board_pattern"`
		RelatedToMaintenance              *bool   `json:"related_to_maintenance"`
		RelatedToPreventive               *bool   `json:"related_to_preventive"`
		PreventivePlanID                  *uint   `json:"preventive_plan_id"`
		PreventiveAutomationEnabled       *bool   `json:"preventive_automation_enabled"`
		PreventiveAutomationHorizonDays   *int    `json:"preventive_automation_horizon_days"`
		PreventiveCardTitleTemplate       *string `json:"preventive_card_title_template"`
		PreventiveCardDescriptionTemplate *string `json:"preventive_card_description_template"`
		PreventiveCardChecklistTemplate   *string `json:"preventive_card_checklist_template"`
		PreventiveCardPriority            *string `json:"preventive_card_priority"`
		PreventiveCardColor               *string `json:"preventive_card_color"`
		ParticipanteIDs                   []uint  `json:"participante_ids"`
		IsActive                          *bool   `json:"is_active"`
		IsArchived                        *bool   `json:"is_archived"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if in.ParticipanteIDs != nil && user.Role != models.RoleAdmin && project.CriadorID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Apenas o criador ou administradores podem alterar os participantes do projeto"})
		return
	}

	project.Titulo = strings.TrimSpace(in.Titulo)
	if strings.TrimSpace(in.Descricao) != "" {
		d := strings.TrimSpace(in.Descricao)
		project.Descricao = &d
	} else {
		project.Descricao = nil
	}
	if in.BoardBackgroundColor != nil {
		project.BoardBackgroundColor = normalizeHexColor(*in.BoardBackgroundColor, defaultKanbanBoardBackgroundColor)
	}
	if in.BoardPattern != nil {
		project.BoardPattern = normalizeBoardPattern(*in.BoardPattern)
	}
	if in.RelatedToMaintenance != nil {
		project.RelatedToMaintenance = *in.RelatedToMaintenance
	}
	if in.RelatedToPreventive != nil {
		project.RelatedToPreventive = *in.RelatedToPreventive
	}
	if in.RelatedToPreventive != nil && !project.RelatedToPreventive {
		project.PreventivePlanID = nil
		project.PreventiveAutomationEnabled = false
		clearPreventiveAutomationSchedule(project)
	} else if in.PreventivePlanID != nil {
		var plan models.MaintenancePlan
		if err := h.userRepo.DB().First(&plan, *in.PreventivePlanID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Plano preventivo não encontrado"})
			return
		}
		project.PreventivePlanID = in.PreventivePlanID
	}
	if in.PreventiveAutomationEnabled != nil {
		project.PreventiveAutomationEnabled = project.RelatedToPreventive && *in.PreventiveAutomationEnabled
		if !project.PreventiveAutomationEnabled {
			clearPreventiveAutomationSchedule(project)
		}
	}
	if in.PreventiveAutomationHorizonDays != nil {
		project.PreventiveAutomationHorizonDays = normalizePreventiveAutomationHorizon(*in.PreventiveAutomationHorizonDays)
		if project.PreventiveAutomationStartedAt != nil {
			nextRunAt := project.PreventiveAutomationStartedAt.AddDate(0, 0, project.PreventiveAutomationHorizonDays)
			project.PreventiveAutomationNextRunAt = &nextRunAt
		}
	}
	if in.PreventiveCardTitleTemplate != nil {
		project.PreventiveCardTitleTemplate = normalizePreventiveTemplate(*in.PreventiveCardTitleTemplate, defaultPreventiveKanbanCardTitleTemplate)
	}
	if in.PreventiveCardDescriptionTemplate != nil {
		if strings.TrimSpace(*in.PreventiveCardDescriptionTemplate) == "" {
			project.PreventiveCardDescriptionTemplate = nil
		} else {
			d := strings.TrimSpace(*in.PreventiveCardDescriptionTemplate)
			project.PreventiveCardDescriptionTemplate = &d
		}
	}
	if in.PreventiveCardChecklistTemplate != nil {
		project.PreventiveCardChecklistTemplate = buildKanbanChecklistTemplate(*in.PreventiveCardChecklistTemplate)
	}
	if in.PreventiveCardPriority != nil {
		project.PreventiveCardPriority = normalizeEnumValue(*in.PreventiveCardPriority, []string{models.CardPriorityBaixa, models.CardPriorityMedia, models.CardPriorityAlta, models.CardPriorityUrgente}, models.CardPriorityAlta)
	}
	if in.PreventiveCardColor != nil {
		project.PreventiveCardColor = normalizeHexColor(*in.PreventiveCardColor, defaultPreventiveKanbanCardColor)
	}
	if in.IsActive != nil {
		project.IsActive = *in.IsActive
	}
	if in.IsArchived != nil {
		project.IsArchived = *in.IsArchived
	}
	if project.RelatedToPreventive && project.PreventiveAutomationEnabled {
		if err := h.ensurePreventiveStatusColumns(project); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	project.UpdatedAt = time.Now()

	if err := h.projectRepo.Update(project); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if in.ParticipanteIDs != nil {
		previousParticipantIDs := make(map[uint]bool)
		for _, participant := range project.Participantes {
			previousParticipantIDs[participant.ID] = true
		}
		participantIDs := append([]uint{project.CriadorID}, in.ParticipanteIDs...)
		participantIDs = uniqueUints(participantIDs)
		if err := h.projectRepo.ReplaceParticipantes(project, participantIDs); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		newParticipantIDs := make([]uint, 0)
		for _, participantID := range participantIDs {
			if participantID != project.CriadorID && !previousParticipantIDs[participantID] {
				newParticipantIDs = append(newParticipantIDs, participantID)
			}
		}
		if len(newParticipantIDs) > 0 {
			h.notify(newParticipantIDs, user.ID, models.NotifProjetoAdicionado,
				"Você foi incluído em um projeto",
				fmt.Sprintf("%s adicionou você ao projeto '%s'. Acesse o Kanban para colaborar.", user.Nome, project.Titulo),
				&project.ID, nil)
		}
	}

	h.notify(h.projectParticipantIDs(project), user.ID, models.NotifProjetoAdicionado,
		"Projeto atualizado",
		fmt.Sprintf("%s atualizou o projeto '%s'.", user.Nome, project.Titulo),
		&project.ID, nil)

	c.JSON(http.StatusOK, project)
}

func (h *KanbanHandler) DeleteProject(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	project, err := h.projectRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Projeto não encontrado"})
		return
	}

	if user.Role != models.RoleAdmin && project.CriadorID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Apenas o criador ou administradores podem excluir este projeto"})
		return
	}

	participantIDs := h.projectParticipantIDs(project)
	if err := h.projectRepo.Delete(project); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.broker.BroadcastToUsers(participantIDs, KanbanEvent{
		Type: "kanban_update",
		Payload: gin.H{
			"tipo":     "PROJETO_EXCLUIDO",
			"mensagem": fmt.Sprintf("%s excluiu o projeto '%s'.", user.Nome, project.Titulo),
		},
	})

	c.JSON(http.StatusOK, gin.H{"message": "Projeto excluído com sucesso"})
}

func (h *KanbanHandler) DuplicateProject(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	project, err := h.projectRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Projeto não encontrado"})
		return
	}
	if !h.userCanAccessProject(user, project) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Acesso negado"})
		return
	}

	var in struct {
		IncluirCartoes bool `json:"incluir_cartoes"`
	}
	_ = c.ShouldBindJSON(&in)

	participantIDs := make([]uint, 0, len(project.Participantes)+1)
	participantIDs = append(participantIDs, user.ID)
	for _, participant := range project.Participantes {
		participantIDs = append(participantIDs, participant.ID)
	}

	var participants []models.User
	if err := h.userRepo.DB().Where("id IN ?", uniqueUints(participantIDs)).Find(&participants).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	duplicate := &models.KanbanProject{
		Titulo:                            strings.TrimSpace(project.Titulo) + " (Cópia)",
		Descricao:                         project.Descricao,
		BoardBackgroundColor:              normalizeHexColor(project.BoardBackgroundColor, defaultKanbanBoardBackgroundColor),
		BoardPattern:                      normalizeBoardPattern(project.BoardPattern),
		RelatedToMaintenance:              project.RelatedToMaintenance,
		RelatedToPreventive:               project.RelatedToPreventive,
		PreventivePlanID:                  project.PreventivePlanID,
		PreventiveAutomationEnabled:       false,
		PreventiveAutomationHorizonDays:   normalizePreventiveAutomationHorizon(project.PreventiveAutomationHorizonDays),
		PreventiveCardTitleTemplate:       normalizePreventiveTemplate(project.PreventiveCardTitleTemplate, defaultPreventiveKanbanCardTitleTemplate),
		PreventiveCardDescriptionTemplate: project.PreventiveCardDescriptionTemplate,
		PreventiveCardChecklistTemplate:   project.PreventiveCardChecklistTemplate,
		PreventiveCardPriority:            normalizeEnumValue(project.PreventiveCardPriority, []string{models.CardPriorityBaixa, models.CardPriorityMedia, models.CardPriorityAlta, models.CardPriorityUrgente}, models.CardPriorityAlta),
		PreventiveCardColor:               normalizeHexColor(project.PreventiveCardColor, defaultPreventiveKanbanCardColor),
		CriadorID:                         user.ID,
		IsActive:                          true,
		IsArchived:                        false,
		Participantes:                     participants,
	}

	if err := h.projectRepo.Create(duplicate); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	columnMap := make(map[uint]uint, len(project.Colunas))
	for idx, col := range project.Colunas {
		newCol := &models.KanbanColumn{
			ProjectID: duplicate.ID,
			Nome:      col.Nome,
			Cor:       col.Cor,
			Ordem:     idx,
			IsDefault: col.IsDefault,
		}
		if err := h.columnRepo.Create(newCol); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		columnMap[col.ID] = newCol.ID
	}

	if in.IncluirCartoes {
		for _, col := range project.Colunas {
			for _, card := range col.Cards {
				newColumnID, ok := columnMap[col.ID]
				if !ok {
					continue
				}

				duplicateCard := &models.KanbanCard{
					ProjectID:     duplicate.ID,
					ColumnID:      newColumnID,
					Titulo:        card.Titulo,
					Cor:           card.Cor,
					Descricao:     card.Descricao,
					ChecklistJSON: card.ChecklistJSON,
					CriadorID:     user.ID,
					ResponsavelID: card.ResponsavelID,
					Prioridade:    card.Prioridade,
					DataEntrega:   card.DataEntrega,
					Ordem:         card.Ordem,
				}
				if err := h.cardRepo.Create(duplicateCard); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}

				if len(card.Participantes) > 0 {
					cardParticipantIDs := make([]uint, 0, len(card.Participantes))
					for _, participant := range card.Participantes {
						cardParticipantIDs = append(cardParticipantIDs, participant.ID)
					}
					if err := h.cardRepo.ReplaceParticipantes(duplicateCard, uniqueUints(cardParticipantIDs)); err != nil {
						c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
						return
					}
				}

				if len(card.Ativos) > 0 {
					assetIDs := make([]uint, 0, len(card.Ativos))
					for _, asset := range card.Ativos {
						assetIDs = append(assetIDs, asset.ID)
					}
					if err := h.cardRepo.ReplaceAssets(duplicateCard, uniqueUints(assetIDs)); err != nil {
						c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
						return
					}
				}
			}
		}
	}

	h.notify(h.projectParticipantIDs(duplicate), user.ID, models.NotifProjetoAdicionado,
		"Projeto duplicado",
		fmt.Sprintf("%s duplicou o projeto '%s'.", user.Nome, project.Titulo),
		&duplicate.ID, nil)

	loaded, _ := h.projectRepo.GetByID(duplicate.ID)
	if loaded == nil {
		loaded = duplicate
	}
	c.JSON(http.StatusCreated, loaded)
}

func (h *KanbanHandler) ToggleProjectStatus(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	project, err := h.projectRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Projeto não encontrado"})
		return
	}
	if !h.userCanAccessProject(user, project) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Acesso negado"})
		return
	}

	var in struct {
		Acao string `json:"acao"` // archive, unarchive, deactivate, activate
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	switch in.Acao {
	case "archive":
		project.IsArchived = true
	case "unarchive":
		project.IsArchived = false
	case "deactivate":
		project.IsActive = false
	case "activate":
		project.IsActive = true
		project.IsArchived = false
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ação inválida"})
		return
	}
	project.UpdatedAt = time.Now()

	if err := h.projectRepo.Update(project); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, project)
}

func (h *KanbanHandler) AddColumn(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	projectID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	project, err := h.projectRepo.GetByID(uint(projectID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Projeto não encontrado"})
		return
	}
	if !h.userCanAccessProject(user, project) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Acesso negado"})
		return
	}

	var in struct {
		Nome string `json:"nome"`
		Cor  string `json:"cor"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(in.Nome) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nome é obrigatório"})
		return
	}

	count, _ := h.columnRepo.CountByProject(uint(projectID))
	cor := in.Cor
	if cor == "" {
		cor = "#6B7280"
	}
	col := &models.KanbanColumn{
		ProjectID: uint(projectID),
		Nome:      strings.TrimSpace(in.Nome),
		Cor:       cor,
		Ordem:     int(count),
	}
	if err := h.columnRepo.Create(col); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, col)
}

func (h *KanbanHandler) UpdateColumn(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	columnID, err := strconv.ParseUint(c.Param("columnId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	col, err := h.columnRepo.GetByID(uint(columnID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Coluna não encontrada"})
		return
	}

	project, err := h.projectRepo.GetByID(col.ProjectID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Projeto não encontrado"})
		return
	}
	if !h.userCanAccessProject(user, project) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Acesso negado"})
		return
	}

	var in struct {
		Nome  *string `json:"nome"`
		Cor   *string `json:"cor"`
		Ordem *int    `json:"ordem"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if in.Nome != nil {
		nome := strings.TrimSpace(*in.Nome)
		if nome == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Nome é obrigatório"})
			return
		}
		col.Nome = nome
	}

	if in.Cor != nil {
		cor := strings.TrimSpace(*in.Cor)
		if cor == "" {
			cor = "#6B7280"
		}
		col.Cor = cor
	}

	if in.Ordem != nil {
		col.Ordem = *in.Ordem
	}

	if err := h.columnRepo.Update(col); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, col)
}

// ---------- Cards ----------

func (h *KanbanHandler) CreateCard(c *gin.Context) {
	user := middleware.GetCurrentUser(c)

	var in struct {
		ProjectID       uint                         `json:"project_id"`
		ColumnID        uint                         `json:"column_id"`
		Titulo          string                       `json:"titulo"`
		Descricao       string                       `json:"descricao"`
		ChecklistItems  []kanbanChecklistItemPayload `json:"checklist_items"`
		ResponsavelID   *uint                        `json:"responsavel_id"`
		Prioridade      string                       `json:"prioridade"`
		DataEntrega     *string                      `json:"data_entrega"`
		Cor             string                       `json:"cor"`
		ParticipanteIDs []uint                       `json:"participante_ids"`
		AtivoIDs        []uint                       `json:"ativo_ids"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(in.Titulo) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Título é obrigatório"})
		return
	}

	project, err := h.projectRepo.GetByID(in.ProjectID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Projeto não encontrado"})
		return
	}
	if !h.userCanAccessProject(user, project) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Acesso negado"})
		return
	}

	count, _ := h.cardRepo.CountByColumn(in.ColumnID)
	prioridade := normalizeEnumValue(in.Prioridade, []string{models.CardPriorityBaixa, models.CardPriorityMedia, models.CardPriorityAlta, models.CardPriorityUrgente}, models.CardPriorityMedia)

	card := &models.KanbanCard{
		ProjectID:     in.ProjectID,
		ColumnID:      in.ColumnID,
		Titulo:        strings.TrimSpace(in.Titulo),
		Cor:           normalizeHexColor(in.Cor, defaultKanbanCardColor),
		CriadorID:     user.ID,
		ResponsavelID: in.ResponsavelID,
		Prioridade:    prioridade,
		Ordem:         int(count),
	}
	if strings.TrimSpace(in.Descricao) != "" {
		d := strings.TrimSpace(in.Descricao)
		card.Descricao = &d
	}
	checklistJSON, err := marshalKanbanChecklist(in.ChecklistItems)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Checklist inválido"})
		return
	}
	card.ChecklistJSON = checklistJSON
	if in.DataEntrega != nil && *in.DataEntrega != "" {
		if t, err := time.Parse("2006-01-02", *in.DataEntrega); err == nil {
			card.DataEntrega = &t
		}
	}

	if err := h.cardRepo.Create(card); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Participants and assets
	var participants []models.User
	if len(in.ParticipanteIDs) > 0 {
		_ = h.userRepo.DB().Where("id IN ?", in.ParticipanteIDs).Find(&participants).Error
		_ = h.cardRepo.ReplaceParticipantes(card, in.ParticipanteIDs)
	}
	if len(in.AtivoIDs) > 0 {
		_ = h.cardRepo.ReplaceAssets(card, in.AtivoIDs)
		h.syncKanbanAssetsMaintenance(card, in.AtivoIDs, user.ID, "")
	}

	// Notify assignees
	notifyIDs := in.ParticipanteIDs
	if card.ResponsavelID != nil {
		notifyIDs = append(notifyIDs, *card.ResponsavelID)
	}
	if len(notifyIDs) > 0 {
		h.notify(uniqueUints(notifyIDs), user.ID, models.NotifCartaoAtribuido,
			"Novo cartão no Kanban",
			fmt.Sprintf("%s criou o cartão '%s' no projeto '%s'.", user.Nome, card.Titulo, project.Titulo),
			&project.ID, &card.ID)
	}

	loaded, _ := h.cardRepo.GetByID(card.ID)
	if loaded == nil {
		loaded = card
	}
	c.JSON(http.StatusCreated, loaded)
}

func (h *KanbanHandler) GetCard(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	card, err := h.cardRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Cartão não encontrado"})
		return
	}

	project, err := h.projectRepo.GetByID(card.ProjectID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Projeto não encontrado"})
		return
	}
	if !h.userCanAccessProject(user, project) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Acesso negado"})
		return
	}

	c.JSON(http.StatusOK, card)
}

func (h *KanbanHandler) UpdateCard(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	card, err := h.cardRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Cartão não encontrado"})
		return
	}

	var in struct {
		Titulo          string                       `json:"titulo"`
		Descricao       string                       `json:"descricao"`
		ChecklistItems  []kanbanChecklistItemPayload `json:"checklist_items"`
		ColumnID        uint                         `json:"column_id"`
		ResponsavelID   *uint                        `json:"responsavel_id"`
		Prioridade      string                       `json:"prioridade"`
		DataEntrega     *string                      `json:"data_entrega"`
		Cor             *string                      `json:"cor"`
		ParticipanteIDs []uint                       `json:"participante_ids"`
		AtivoIDs        []uint                       `json:"ativo_ids"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	card.Titulo = strings.TrimSpace(in.Titulo)
	if in.Cor != nil {
		card.Cor = normalizeHexColor(*in.Cor, defaultKanbanCardColor)
	} else if strings.TrimSpace(card.Cor) == "" {
		card.Cor = defaultKanbanCardColor
	}
	if strings.TrimSpace(in.Descricao) != "" {
		d := strings.TrimSpace(in.Descricao)
		card.Descricao = &d
	} else {
		card.Descricao = nil
	}
	checklistJSON, err := marshalKanbanChecklist(in.ChecklistItems)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Checklist inválido"})
		return
	}
	card.ChecklistJSON = checklistJSON
	card.ColumnID = in.ColumnID
	card.ResponsavelID = in.ResponsavelID
	card.Prioridade = normalizeEnumValue(in.Prioridade, []string{models.CardPriorityBaixa, models.CardPriorityMedia, models.CardPriorityAlta, models.CardPriorityUrgente}, models.CardPriorityMedia)
	card.DataEntrega = nil
	if in.DataEntrega != nil && *in.DataEntrega != "" {
		if t, err := time.Parse("2006-01-02", *in.DataEntrega); err == nil {
			card.DataEntrega = &t
		}
	}
	card.UpdatedAt = time.Now()

	if err := h.cardRepo.Update(card); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// Persist the color explicitly because it is a user-facing visual setting
	// and must never fall back to the database default during a full card save.
	if err := h.cardRepo.UpdateColor(card.ID, card.Cor); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_ = h.cardRepo.ReplaceParticipantes(card, in.ParticipanteIDs)
	_ = h.cardRepo.ReplaceAssets(card, in.AtivoIDs)
	if len(in.AtivoIDs) > 0 {
		h.syncKanbanAssetsMaintenance(card, in.AtivoIDs, user.ID, "")
	}

	notifyIDs := in.ParticipanteIDs
	if card.ResponsavelID != nil {
		notifyIDs = append(notifyIDs, *card.ResponsavelID)
	}
	if len(notifyIDs) > 0 {
		h.notify(uniqueUints(notifyIDs), user.ID, models.NotifCartaoAtribuido,
			"Cartão atualizado",
			fmt.Sprintf("%s atualizou o cartão '%s'.", user.Nome, card.Titulo),
			&card.ProjectID, &card.ID)
	}

	loaded, _ := h.cardRepo.GetByID(card.ID)
	if loaded == nil {
		loaded = card
	}
	c.JSON(http.StatusOK, loaded)
}

func (h *KanbanHandler) MoveCard(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	card, err := h.cardRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Cartão não encontrado"})
		return
	}

	var in struct {
		ColumnID uint   `json:"column_id"`
		Ordem    int    `json:"ordem"`
		Motivo   string `json:"motivo"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	sourceColName := "Coluna"
	if card.Column != nil {
		sourceColName = card.Column.Nome
	}

	if err := h.cardRepo.MoveCard(card.ID, in.ColumnID, in.Ordem); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	targetCol, _ := h.columnRepo.GetByID(in.ColumnID)
	targetColName := "Coluna"
	if targetCol != nil {
		targetColName = targetCol.Nome
	}

	if sourceColName != targetColName {
		_ = h.interactionRepo.Create(&models.KanbanCardInteraction{
			CardID:    card.ID,
			UsuarioID: user.ID,
			Mensagem:  fmt.Sprintf("Moveu o cartão de '%s' para '%s'.", sourceColName, targetColName),
			Tipo:      models.InteractionSistemaMove,
		})

		// Notify card assignees + project participants
		project, _ := h.projectRepo.GetByID(card.ProjectID)
		if project != nil {
			notifyIDs := h.projectParticipantIDs(project)
			h.notify(notifyIDs, user.ID, models.NotifCartaoMovimentado,
				"Cartão movido",
				fmt.Sprintf("O cartão '%s' foi movido de '%s' para '%s'.", card.Titulo, sourceColName, targetColName),
				&card.ProjectID, &card.ID)
		}
	}

	// Sync assets maintenance status if card has assets
	cardFull, _ := h.cardRepo.GetByID(card.ID)
	if cardFull != nil && len(cardFull.Ativos) > 0 {
		var assetIDs []uint
		for _, a := range cardFull.Ativos {
			assetIDs = append(assetIDs, a.ID)
		}
		h.syncKanbanAssetsMaintenance(cardFull, assetIDs, user.ID, in.Motivo)
	}

	// Gamificação: premiar técnico ao concluir card Kanban
	if sourceColName != targetColName && h.gamificationSvc != nil {
		normTarget := strings.ToLower(strings.TrimSpace(targetColName))
		normSource := strings.ToLower(strings.TrimSpace(sourceColName))
		isDoneColumn := normTarget == "concluído" || normTarget == "concluido" || normTarget == "done" || normTarget == "finalizado" || normTarget == "pronto"
		wasDoneColumn := normSource == "concluído" || normSource == "concluido" || normSource == "done" || normSource == "finalizado" || normSource == "pronto"

		if isDoneColumn && !wasDoneColumn {
			techID := user.ID
			if card.ResponsavelID != nil && *card.ResponsavelID > 0 {
				techID = *card.ResponsavelID
			}
			cardID := card.ID
			cardTitle := card.Titulo
			go func(tID uint, cID uint, tit string) {
				_, _ = h.gamificationSvc.AwardActivityXP(
					tID,
					"kanban",
					&cID,
					50,
					25,
					fmt.Sprintf("Card Kanban '%s' concluído", tit),
					0,
				)
			}(techID, cardID, cardTitle)
		}
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok", "card_id": card.ID, "column_id": in.ColumnID})
}

func (h *KanbanHandler) DeleteCard(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	card, err := h.cardRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Cartão não encontrado"})
		return
	}

	// Delete physical attachments
	for _, att := range card.Anexos {
		if strings.HasPrefix(att.URL, "/uploads/") {
			_ = os.Remove(filepath.FromSlash(filepath.Clean(att.URL)))
		}
	}

	if err := h.cardRepo.Delete(card); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Cartão excluído", "project_id": card.ProjectID})
}

// ---------- Attachments ----------

func (h *KanbanHandler) UploadAttachment(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	cardID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	card, err := h.cardRepo.GetByID(uint(cardID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Cartão não encontrado"})
		return
	}

	var file *multipart.FileHeader
	var att *models.KanbanAttachment

	// File upload
	if f, err := c.FormFile("arquivo"); err == nil {
		file = f
	} else if link := c.PostForm("link"); link != "" {
		// Link type attachment
		att = &models.KanbanAttachment{
			CardID: uint(cardID),
			Nome:   c.PostForm("nome"),
			Tipo:   "link",
			URL:    link,
		}
	}

	if file != nil {
		if err := os.MkdirAll(kanbanUploadDir, 0o755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		ext := filepath.Ext(file.Filename)
		filename := fmt.Sprintf("card_%d_%d_%s%s", cardID, time.Now().Unix(), uuid.New().String()[:8], ext)
		filePath := filepath.Join(kanbanUploadDir, filename)

		f, err := file.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer f.Close()
		data := make([]byte, file.Size)
		if _, err := f.Read(data); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if err := os.WriteFile(filePath, data, 0o644); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		tipo := "arquivo"
		switch strings.ToLower(ext) {
		case ".png", ".jpg", ".jpeg", ".gif", ".webp":
			tipo = "imagem"
		}
		att = &models.KanbanAttachment{
			CardID: uint(cardID),
			Nome:   file.Filename,
			Tipo:   tipo,
			URL:    "/" + filepath.ToSlash(filePath),
		}
	}

	if att == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Envie um arquivo ou um link"})
		return
	}

	if err := h.attachmentRepo.Create(att); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_ = h.interactionRepo.Create(&models.KanbanCardInteraction{
		CardID:    uint(cardID),
		UsuarioID: user.ID,
		Mensagem:  fmt.Sprintf("Adicionou o anexo '%s'.", att.Nome),
		Tipo:      models.InteractionSistemaAnexo,
	})

	project, _ := h.projectRepo.GetByID(card.ProjectID)
	if project != nil {
		h.notify(h.projectParticipantIDs(project), user.ID, models.NotifAnexoAdicionado,
			"Anexo adicionado",
			fmt.Sprintf("%s adicionou o anexo '%s' ao cartão '%s'.", user.Nome, att.Nome, card.Titulo),
			&card.ProjectID, &card.ID)
	}

	c.JSON(http.StatusCreated, att)
}

func (h *KanbanHandler) DeleteAttachment(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	id, err := strconv.ParseUint(c.Param("attachmentId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	att, err := h.attachmentRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Anexo não encontrado"})
		return
	}

	if strings.HasPrefix(att.URL, "/uploads/") {
		_ = os.Remove(filepath.FromSlash(filepath.Clean(att.URL)))
	}

	if err := h.attachmentRepo.Delete(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_ = h.interactionRepo.Create(&models.KanbanCardInteraction{
		CardID:    att.CardID,
		UsuarioID: user.ID,
		Mensagem:  fmt.Sprintf("Removeu o anexo '%s'.", att.Nome),
		Tipo:      models.InteractionSistemaAnexo,
	})

	if card, err := h.cardRepo.GetByID(att.CardID); err == nil {
		if project, err := h.projectRepo.GetByID(card.ProjectID); err == nil && project != nil {
			h.notify(h.projectParticipantIDs(project), user.ID, models.NotifAnexoAdicionado,
				"Anexo removido",
				fmt.Sprintf("%s removeu o anexo '%s' do cartão '%s'.", user.Nome, att.Nome, card.Titulo),
				&card.ProjectID, &card.ID)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Anexo excluído"})
}

// ---------- Comments ----------

func (h *KanbanHandler) AddCardComment(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	cardID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	card, err := h.cardRepo.GetByID(uint(cardID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Cartão não encontrado"})
		return
	}

	var in struct {
		Mensagem string `json:"mensagem"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(in.Mensagem) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Mensagem é obrigatória"})
		return
	}

	interaction := &models.KanbanCardInteraction{
		CardID:    uint(cardID),
		UsuarioID: user.ID,
		Mensagem:  strings.TrimSpace(in.Mensagem),
		Tipo:      models.InteractionComentario,
	}
	if err := h.interactionRepo.Create(interaction); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Load user name for response
	var author models.User
	_ = h.userRepo.DB().First(&author, user.ID).Error
	interaction.Usuario = &author

	project, _ := h.projectRepo.GetByID(card.ProjectID)
	if project != nil {
		h.notify(h.projectParticipantIDs(project), user.ID, models.NotifCartaoAtribuido,
			"Novo comentário",
			fmt.Sprintf("%s comentou no cartão '%s'.", user.Nome, card.Titulo),
			&card.ProjectID, &card.ID)
	}

	c.JSON(http.StatusCreated, interaction)
}

// ---------- Notifications ----------

func (h *KanbanHandler) UnreadCount(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	notifs, err := h.notifRepo.ListByUser(user.ID, 1000)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	accessible := h.filterAccessibleNotifications(notifs, user)
	count := int64(0)
	for _, notification := range accessible {
		if !notification.Lida {
			count++
		}
	}
	c.JSON(http.StatusOK, gin.H{"unread_count": count})
}

func (h *KanbanHandler) ListNotifications(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	notifs, err := h.notifRepo.ListByUser(user.ID, 15)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, h.filterAccessibleNotifications(notifs, user))
}

func (h *KanbanHandler) filterAccessibleNotifications(notifs []models.KanbanNotification, user *models.User) []models.KanbanNotification {
	accessible := make([]models.KanbanNotification, 0, len(notifs))
	for _, notification := range notifs {
		// Project notifications are visible only while the user can access the
		// related project as its creator or participant.
		if notification.ProjectID == nil {
			continue
		}
		project, err := h.projectRepo.GetByID(*notification.ProjectID)
		if err != nil || !h.userCanAccessProject(user, project) {
			continue
		}
		accessible = append(accessible, notification)
	}
	return accessible
}

func (h *KanbanHandler) MarkNotificationRead(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	id, err := strconv.ParseUint(c.Param("notifId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	_ = h.notifRepo.MarkRead(uint(id), user.ID)
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *KanbanHandler) MarkAllNotificationsRead(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	if err := h.notifRepo.MarkAllRead(user.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// ---------- SSE ----------

func (h *KanbanHandler) SSEStream(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	client := h.broker.Subscribe(user.ID)
	defer h.broker.Unsubscribe(client)

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	// Initial event
	c.SSEvent("connected", gin.H{"user_id": user.ID})
	c.Writer.Flush()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case event := <-client.ch:
			c.SSEvent(event.Type, event.Payload)
			c.Writer.Flush()
		case <-ticker.C:
			c.SSEvent("ping", gin.H{"time": time.Now().Unix()})
			c.Writer.Flush()
		case <-c.Request.Context().Done():
			return
		}
	}
}

func uniqueUints(ids []uint) []uint {
	seen := map[uint]bool{}
	result := make([]uint, 0, len(ids))
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			result = append(result, id)
		}
	}
	return result
}

func normalizeHexColor(input string, fallback string) string {
	color := strings.ToUpper(strings.TrimSpace(input))
	if len(color) != 7 || !strings.HasPrefix(color, "#") {
		return fallback
	}
	for _, ch := range color[1:] {
		if !strings.ContainsRune("0123456789ABCDEF", ch) {
			return fallback
		}
	}
	return color
}

func normalizeBoardPattern(input string) string {
	switch strings.ToLower(strings.TrimSpace(input)) {
	case "glow", "grid", "dots", "clean":
		return strings.ToLower(strings.TrimSpace(input))
	default:
		return defaultKanbanBoardPattern
	}
}

func normalizePreventiveAutomationHorizon(days int) int {
	if days <= 0 {
		return 30
	}
	if days > 365 {
		return 365
	}
	return days
}

func clearPreventiveAutomationSchedule(project *models.KanbanProject) {
	project.PreventiveAutomationStartedAt = nil
	project.PreventiveAutomationLastRunAt = nil
	project.PreventiveAutomationNextRunAt = nil
}

func normalizePreventiveTemplate(input string, fallback string) string {
	value := strings.TrimSpace(input)
	if value == "" {
		return fallback
	}
	return value
}

func buildKanbanChecklistTemplate(input string) *string {
	// Templates may arrive already serialized (for example when an exported
	// project is edited and imported again). Preserve each checklist entry
	// instead of turning the whole JSON array into one title.
	if normalized := normalizeKanbanChecklistJSON(input); normalized != nil {
		return normalized
	}
	lines := strings.Split(input, "\n")
	items := make([]kanbanChecklistItemPayload, 0, len(lines))
	for index, line := range lines {
		title := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(line, "-"), "•"))
		if title == "" {
			continue
		}
		items = append(items, kanbanChecklistItemPayload{
			ID:        fmt.Sprintf("auto-%d", index+1),
			Titulo:    title,
			Concluido: false,
		})
	}
	if len(items) == 0 {
		return nil
	}
	payload, err := json.Marshal(items)
	if err != nil {
		return nil
	}
	value := string(payload)
	return &value
}

func normalizeKanbanChecklistJSON(input string) *string {
	var parsed []kanbanChecklistItemPayload
	if err := json.Unmarshal([]byte(strings.TrimSpace(input)), &parsed); err != nil || len(parsed) == 0 {
		return nil
	}
	items := make([]kanbanChecklistItemPayload, 0, len(parsed))
	for _, item := range parsed {
		title := strings.TrimSpace(item.Titulo)
		if strings.HasPrefix(title, "[") {
			var nested []kanbanChecklistItemPayload
			if err := json.Unmarshal([]byte(title), &nested); err == nil {
				items = append(items, nested...)
				continue
			}
		}
		item.Titulo = title
		items = append(items, item)
	}
	normalized, err := marshalKanbanChecklist(items)
	if err != nil {
		return nil
	}
	return normalized
}

func pickPreventiveAutomationColumn(project *models.KanbanProject) *models.KanbanColumn {
	if project == nil || len(project.Colunas) == 0 {
		return nil
	}
	for idx := range project.Colunas {
		name := strings.ToLower(project.Colunas[idx].Nome)
		if strings.Contains(name, "fazer") || strings.Contains(name, "planej") || strings.Contains(name, "agend") {
			return &project.Colunas[idx]
		}
	}
	return &project.Colunas[0]
}

func preventiveAutomationWindow(project *models.KanbanProject) (time.Time, time.Time) {
	start := time.Now()
	if project != nil && project.PreventiveAutomationStartedAt != nil {
		start = *project.PreventiveAutomationStartedAt
	}

	if project != nil && project.PreventiveAutomationNextRunAt != nil {
		return start, *project.PreventiveAutomationNextRunAt
	}

	horizonDays := 30
	if project != nil {
		horizonDays = normalizePreventiveAutomationHorizon(project.PreventiveAutomationHorizonDays)
	}
	return start, start.AddDate(0, 0, horizonDays)
}

type preventiveStatusColumn struct {
	name  string
	color string
}

var preventiveStatusColumns = []preventiveStatusColumn{
	{name: "A Fazer", color: "#6B7280"},
	{name: "Em Andamento", color: "#2563EB"},
	{name: "Aguardando Peça", color: "#F59E0B"},
	{name: "Pausada", color: "#8B5CF6"},
	{name: "Concluído", color: "#16A34A"},
}

func (h *KanbanHandler) ensurePreventiveStatusColumns(project *models.KanbanProject) error {
	if project == nil {
		return fmt.Errorf("projeto inválido")
	}
	for _, wanted := range preventiveStatusColumns {
		found := false
		for _, col := range project.Colunas {
			name := strings.ToLower(strings.TrimSpace(col.Nome))
			if name == strings.ToLower(wanted.name) ||
				(wanted.name == "Aguardando Peça" && strings.Contains(name, "aguardando") && strings.Contains(name, "compr")) ||
				(wanted.name == "Concluído" && strings.Contains(name, "conclu")) {
				found = true
				break
			}
		}
		if found {
			continue
		}
		count, _ := h.columnRepo.CountByProject(project.ID)
		col := &models.KanbanColumn{ProjectID: project.ID, Nome: wanted.name, Cor: wanted.color, Ordem: int(count)}
		if err := h.columnRepo.Create(col); err != nil {
			return err
		}
		project.Colunas = append(project.Colunas, *col)
	}
	return nil
}

func (h *KanbanHandler) preventiveColumnForStatus(project *models.KanbanProject, status string) *models.KanbanColumn {
	if project == nil {
		return nil
	}
	status = strings.ToLower(strings.TrimSpace(status))
	needle := "a fazer"
	switch status {
	case strings.ToLower(models.PMStatusEmAndamento):
		needle = "andamento"
	case strings.ToLower(models.PMStatusAguardandoPeca):
		needle = "aguardando"
	case strings.ToLower(models.PMStatusPausada):
		needle = "pausad"
	case strings.ToLower(models.PMStatusConcluida):
		needle = "conclu"
	}
	for idx := range project.Colunas {
		name := strings.ToLower(project.Colunas[idx].Nome)
		if strings.Contains(name, needle) || (needle == "aguardando" && strings.Contains(name, "compr")) {
			return &project.Colunas[idx]
		}
	}
	return pickPreventiveAutomationColumn(project)
}

func (h *KanbanHandler) syncPreventiveAutomationCards(project *models.KanbanProject, userID uint, windowStart time.Time, windowEnd time.Time) ([]models.KanbanCard, error) {
	if err := h.ensurePreventiveStatusColumns(project); err != nil {
		return nil, err
	}
	if err := h.syncExistingPreventiveCardStatuses(project); err != nil {
		return nil, err
	}
	targetColumn := pickPreventiveAutomationColumn(project)
	if targetColumn == nil {
		return nil, fmt.Errorf("crie ao menos uma coluna no projeto antes de sincronizar")
	}

	db := h.userRepo.DB()
	var orders []models.MaintenanceOrder
	query := db.Preload("Plan").Preload("Asset").Preload("Tecnico").
		Where("status NOT IN ?", []string{models.PMStatusConcluida, models.PMStatusCancelada}).
		Where("COALESCE(data_agendada, data_abertura) >= ? AND COALESCE(data_agendada, data_abertura) <= ?", windowStart, windowEnd)
	if project.PreventivePlanID != nil {
		query = query.Where("plan_id = ?", *project.PreventivePlanID)
	}
	if err := query.Order("COALESCE(data_agendada, data_abertura) asc").Find(&orders).Error; err != nil {
		return nil, err
	}

	createdCards := make([]models.KanbanCard, 0)
	for _, order := range orders {
		// Reconcile legacy cards too: this copies the real OS checklist and
		// status into Kanban even when the OS was updated before the event hook.
		if err := service.SyncPreventiveOrderToKanban(db, order.ID, userID); err != nil {
			return nil, err
		}
		// Keep existing cards synchronized with the authoritative OS status.
		var existingCards []models.KanbanCard
		if err := db.Where("project_id = ? AND preventive_order_id = ?", project.ID, order.ID).Find(&existingCards).Error; err != nil {
			return nil, err
		}
		if len(existingCards) > 0 {
			statusColumn := h.preventiveColumnForStatus(project, order.Status)
			if statusColumn != nil {
				for _, existing := range existingCards {
					if existing.ColumnID != statusColumn.ID {
						_ = db.Model(&models.KanbanCard{}).Where("id = ?", existing.ID).Updates(map[string]interface{}{"column_id": statusColumn.ID, "ordem": 0})
					}
				}
			}
			continue
		}
		var countExisting int64
		if err := db.Model(&models.KanbanCard{}).
			Where("project_id = ? AND preventive_order_id = ?", project.ID, order.ID).
			Count(&countExisting).Error; err != nil {
			return nil, err
		}
		if countExisting > 0 {
			continue
		}

		statusColumn := h.preventiveColumnForStatus(project, order.Status)
		if statusColumn == nil {
			statusColumn = targetColumn
		}
		// Ordem zero makes the newest cycle appear above older cards.
		_ = db.Model(&models.KanbanCard{}).Where("project_id = ? AND column_id = ?", project.ID, statusColumn.ID).Updates(map[string]interface{}{"ordem": gorm.Expr("ordem + 1")})
		card := buildPreventiveKanbanCard(project, statusColumn.ID, 0, userID, order)
		if err := h.cardRepo.Create(card); err != nil {
			return nil, err
		}
		if order.AssetID != nil {
			_ = h.cardRepo.ReplaceAssets(card, []uint{*order.AssetID})
		}
		if order.TecnicoID != nil {
			_ = h.cardRepo.ReplaceParticipantes(card, []uint{*order.TecnicoID})
		}
		_ = h.interactionRepo.Create(&models.KanbanCardInteraction{
			CardID:    card.ID,
			UsuarioID: userID,
			Mensagem:  fmt.Sprintf("Card gerado automaticamente a partir da OS preventiva %s.", order.Numero),
			Tipo:      models.InteractionSistemaResp,
		})
		if loaded, err := h.cardRepo.GetByID(card.ID); err == nil && loaded != nil {
			createdCards = append(createdCards, *loaded)
		} else {
			createdCards = append(createdCards, *card)
		}
	}

	return createdCards, nil
}

func (h *KanbanHandler) syncExistingPreventiveCardStatuses(project *models.KanbanProject) error {
	db := h.userRepo.DB()
	var cards []models.KanbanCard
	if err := db.Preload("PreventiveOrder").Where("project_id = ? AND preventive_order_id IS NOT NULL", project.ID).Find(&cards).Error; err != nil {
		return err
	}
	for _, card := range cards {
		if card.PreventiveOrder == nil {
			continue
		}
		column := h.preventiveColumnForStatus(project, card.PreventiveOrder.Status)
		if column != nil && column.ID != card.ColumnID {
			if err := db.Model(&models.KanbanCard{}).Where("id = ?", card.ID).Updates(map[string]interface{}{"column_id": column.ID, "ordem": 0}).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

func buildPreventiveKanbanCard(project *models.KanbanProject, columnID uint, ordem int, creatorID uint, order models.MaintenanceOrder) *models.KanbanCard {
	titleTemplate := normalizePreventiveTemplate(project.PreventiveCardTitleTemplate, defaultPreventiveKanbanCardTitleTemplate)
	descTemplate := defaultPreventiveKanbanCardDescriptionTemplate
	if project.PreventiveCardDescriptionTemplate != nil && strings.TrimSpace(*project.PreventiveCardDescriptionTemplate) != "" {
		descTemplate = *project.PreventiveCardDescriptionTemplate
	}

	title := applyPreventiveTemplate(titleTemplate, order)
	desc := applyPreventiveTemplate(descTemplate, order)
	cardPriority := normalizeEnumValue(project.PreventiveCardPriority, []string{models.CardPriorityBaixa, models.CardPriorityMedia, models.CardPriorityAlta, models.CardPriorityUrgente}, preventivePriorityToCardPriority(order.Prioridade))
	cardColor := normalizeHexColor(project.PreventiveCardColor, defaultPreventiveKanbanCardColor)
	checklist := project.PreventiveCardChecklistTemplate
	if checklist != nil {
		checklist = normalizeKanbanChecklistJSON(*checklist)
	}
	if checklist == nil {
		checklist = buildKanbanChecklistTemplate(defaultPreventiveKanbanChecklistTemplate)
	}

	card := &models.KanbanCard{
		ProjectID:         project.ID,
		ColumnID:          columnID,
		Titulo:            title,
		Cor:               cardColor,
		Descricao:         &desc,
		ChecklistJSON:     checklist,
		PreventiveOrderID: &order.ID,
		CriadorID:         creatorID,
		ResponsavelID:     order.TecnicoID,
		Prioridade:        cardPriority,
		DataEntrega:       order.DataAgendada,
		Ordem:             ordem,
	}
	return card
}

func applyPreventiveTemplate(template string, order models.MaintenanceOrder) string {
	planName := "Sem plano"
	if order.Plan != nil {
		if strings.TrimSpace(order.Plan.Codigo) != "" {
			planName = fmt.Sprintf("%s (%s)", order.Plan.Nome, order.Plan.Codigo)
		} else {
			planName = order.Plan.Nome
		}
	}
	target := "Infraestrutura"
	if order.Asset != nil {
		target = order.Asset.Nome
	} else if order.InfraPredialServico != nil && strings.TrimSpace(*order.InfraPredialServico) != "" {
		target = strings.TrimSpace(*order.InfraPredialServico)
	}
	scheduled := "Sem data"
	if order.DataAgendada != nil {
		scheduled = order.DataAgendada.Format("02/01/2006")
	}

	replacer := strings.NewReplacer(
		"{{os}}", order.Numero,
		"{{plano}}", planName,
		"{{ativo}}", target,
		"{{data}}", scheduled,
		"{{status}}", order.Status,
		"{{tipo}}", order.Tipo,
	)
	return strings.TrimSpace(replacer.Replace(template))
}

func preventivePriorityToCardPriority(priority string) string {
	switch strings.ToLower(strings.TrimSpace(priority)) {
	case "baixa":
		return models.CardPriorityBaixa
	case "alta":
		return models.CardPriorityAlta
	case "urgente", "crítica", "critica":
		return models.CardPriorityUrgente
	default:
		return models.CardPriorityMedia
	}
}

type kanbanChecklistItemPayload struct {
	ID        string `json:"id"`
	Titulo    string `json:"titulo"`
	Concluido bool   `json:"concluido"`
}

func sanitizeKanbanChecklist(items []kanbanChecklistItemPayload) []kanbanChecklistItemPayload {
	sanitized := make([]kanbanChecklistItemPayload, 0, len(items))
	for index, item := range items {
		titulo := strings.TrimSpace(item.Titulo)
		if titulo == "" {
			continue
		}
		itemID := strings.TrimSpace(item.ID)
		if itemID == "" {
			itemID = fmt.Sprintf("item-%d", index+1)
		}
		sanitized = append(sanitized, kanbanChecklistItemPayload{
			ID:        itemID,
			Titulo:    titulo,
			Concluido: item.Concluido,
		})
	}
	return sanitized
}

func marshalKanbanChecklist(items []kanbanChecklistItemPayload) (*string, error) {
	sanitized := sanitizeKanbanChecklist(items)
	if len(sanitized) == 0 {
		return nil, nil
	}
	payload, err := json.Marshal(sanitized)
	if err != nil {
		return nil, err
	}
	value := string(payload)
	return &value, nil
}

func (h *KanbanHandler) syncKanbanAssetsMaintenance(card *models.KanbanCard, assetIDs []uint, userID uint, motivo string) {
	if len(assetIDs) == 0 {
		return
	}
	db := h.userRepo.DB()

	// Check column or project name to see if it's maintenance/workshop related
	var col models.KanbanColumn
	var proj models.KanbanProject
	_ = db.First(&col, card.ColumnID).Error
	_ = db.First(&proj, card.ProjectID).Error

	colName := strings.ToLower(col.Nome)
	projName := strings.ToLower(proj.Titulo)

	isOficinaOrMaintenance := proj.RelatedToMaintenance ||
		strings.Contains(colName, "oficina") ||
		strings.Contains(colName, "manuten") ||
		strings.Contains(colName, "reparo") ||
		strings.Contains(projName, "oficina") ||
		strings.Contains(projName, "manuten")

	isConcluido := strings.Contains(colName, "conclu") || strings.Contains(colName, "pronto") || strings.Contains(colName, "finaliz") || strings.Contains(colName, "entregue")

	for _, assetID := range assetIDs {
		var asset models.Asset
		if err := db.First(&asset, assetID).Error; err != nil {
			continue
		}

		if isConcluido {
			// Mark asset as available and conclude maintenance records
			db.Model(&asset).Update("status", models.AssetStatusDisponivel)
			var now = time.Now()
			db.Model(&models.Manutencao{}).
				Where("asset_id = ? AND status = ?", assetID, models.StatusManutencaoEmAndamento).
				Updates(map[string]interface{}{
					"status":         models.StatusManutencaoConcluida,
					"data_conclusao": &now,
				})
			// Also update linked SolicitacaoManutencao
			db.Model(&models.SolicitacaoManutencao{}).
				Where("asset_id = ? AND status IN ?", assetID, []string{
					string(models.StatusMaintAceita),
					string(models.StatusMaintEmAndamento),
				}).
				Updates(map[string]interface{}{
					"status":                 models.StatusMaintAguardandoEntrega,
					"data_conclusao_tecnico": &now,
				})
		} else if isOficinaOrMaintenance {
			// Update asset status to Manutenção
			if asset.Status != models.AssetStatusManutencao {
				db.Model(&asset).Updates(map[string]interface{}{
					"status":      models.AssetStatusManutencao,
					"prev_status": string(asset.Status),
				})
			}

			// Check if an active SolicitacaoManutencao already exists for this asset
			var solCount int64
			db.Model(&models.SolicitacaoManutencao{}).
				Where("asset_id = ? AND status IN ?", assetID, []string{
					string(models.StatusMaintPendente),
					string(models.StatusMaintAceita),
					string(models.StatusMaintEmAndamento),
				}).
				Count(&solCount)

			if solCount == 0 {
				maintMotivo := motivo
				if maintMotivo == "" {
					maintMotivo = fmt.Sprintf("Adicionado à Oficina Kanban: %s", card.Titulo)
				}

				// Create Manutencao record
				maint := models.Manutencao{
					AssetID:       assetID,
					ResponsavelID: card.ResponsavelID,
					Motivo:        maintMotivo,
					Tipo:          models.TipoManutencaoCorretiva,
					DataEntrada:   time.Now(),
					Status:        models.StatusManutencaoEmAndamento,
				}
				if err := db.Create(&maint).Error; err != nil {
					continue
				}

				// Create SolicitacaoManutencao linked to the Manutencao
				now := time.Now()
				responsavelID := card.ResponsavelID
				if responsavelID == nil {
					responsavelID = &userID
				}
				solicitacao := models.SolicitacaoManutencao{
					SolicitanteID:   &userID,
					AssetID:         assetID,
					Descricao:       maintMotivo,
					Prioridade:      models.PrioridadeSolicitacaoMedia,
					DataSolicitacao: now,
					DataResposta:    &now,
					Status:          models.StatusMaintAceita,
					ResponsavelID:   responsavelID,
					ManutencaoID:    &maint.ID,
				}
				_ = db.Create(&solicitacao).Error
			}
		}
	}
}
