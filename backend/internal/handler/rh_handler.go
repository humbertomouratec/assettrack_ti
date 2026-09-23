package handler

import (
	"context"
	"encoding/csv"
	"fmt"
	"html"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/assettrack/backend/internal/middleware"
	"github.com/assettrack/backend/internal/models"
	"github.com/assettrack/backend/internal/repository"
	"github.com/assettrack/backend/internal/service"
	"github.com/gin-gonic/gin"
)

// defaultTermTemplate mirrors app/web/endpoints/rh.py DEFAULT_TEMPLATE
const defaultTermTemplate = `TERMO DE RESPONSABILIDADE PELA GUARDA E USO DE EQUIPAMENTO

Eu, %s, denominado USUÁRIO, inscrito(a) no CPF sob o nº %s, declaro que recebi de NPG BRASIL PARQUES TEMÁTICOS LTDA, inscrita no CNPJ sob o nº.47.911.142/0001-74, com sede à Av. Das Hortênsias, nº 4795, Gramado/RS, a título de comodato, para uso exclusivo, os equipamentos abaixo especificados:

• EQUIPAMENTO: %s
• MODELO: %s
• PATRIMÔNIO / REF: %s
• NÚMERO DE SÉRIE: %s


TERMOS E CONDIÇÕES
------------------

1. O equipamento deverá ser utilizado ÚNICA e EXCLUSIVAMENTE a serviço da empresa, tendo em vista a atividade a ser exercida pelo USUÁRIO;
2. Ficará o USUÁRIO responsável pelo uso e conservação do equipamento;
3. O USUÁRIO tem somente a posse do(s) item(ns) acima descrito(s), não detendo qualquer propriedade do equipamento, tendo em vista o uso exclusivo para prestação dos serviços profissionais para o qual fora contratado, sendo terminantemente proibido o empréstimo, locação e/ou cessão deste a terceiros;
4. Ao término da prestação de serviço ou do contrato individual de trabalho, o USUÁRIO compromete-se a devolver o equipamento em perfeito estado de conservação e no mesmo dia em que tiver ciência de seu desligamento, salvo o desgaste natural pelo uso natural do equipamento.
5. O USUÁRIO fica autorizado o equipamento acima descrito para sua residência, devendo seu uso ser voltado exclusivamente para fins corporativos e em viagens a trabalho, comprometendo-se a não utilizá-lo para outros fins.
6. Na hipótese de haver roubo ou furto do equipamento, o USUÁRIO compromete-se a realizar registro de Boletim de Ocorrência junto à Autoridade Policial competente, bem como, informar a empresa de forma imediata, para que esta possa realizar o bloqueio de acesso aos dados empresariais contidos no equipamento.
7. Se o equipamento for danificado e/ou inutilizado por emprego inadequado do equipamento, mau uso, negligência, imprudência, imperícia e/ou extravio, ficará obrigado a ressarcir os prejuízos decorrentes à empresa, que cobrará o valor de 1 (um) equipamento novo da mesma marca e modelo ou similar.

Declaro estar ciente e de acordo com as cláusulas acima.


Gramado, RS, %s.



__________________________________________________
             Assinatura Usuario`

var ptMonths = []string{
	"janeiro", "fevereiro", "março", "abril", "maio", "junho",
	"julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
}

var validRHStatusTypes = map[string]bool{
	"trabalhando": true, "folga": true, "ferias": true, "banco_horas": true, "desligado": true,
}

func currentRHStatus(statuses []models.RHStatus, now time.Time) string {
	prioridade := map[string]int{"desligado": 5, "ferias": 4, "folga": 3, "banco_horas": 2, "trabalhando": 1}
	resultado, maior := "trabalhando", 0
	for _, status := range statuses {
		if status.Inicio.After(now) || (status.Fim != nil && status.Fim.Before(now)) {
			continue
		}
		if prioridade[status.Tipo] > maior {
			resultado, maior = status.Tipo, prioridade[status.Tipo]
		}
	}
	return resultado
}

func parseRHDate(value string, endOfDay bool) (*time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04", "2006-01-02"} {
		if parsed, err := time.ParseInLocation(layout, value, time.Local); err == nil {
			if layout == "2006-01-02" && endOfDay {
				parsed = parsed.Add(23*time.Hour + 59*time.Minute + 59*time.Second)
			}
			return &parsed, nil
		}
	}
	return nil, fmt.Errorf("data inválida")
}

type rhStatusInput struct {
	UsuarioID  uint     `json:"usuario_id"`
	Tipo       string   `json:"tipo"`
	Inicio     string   `json:"inicio"`
	Fim        string   `json:"fim"`
	Horas      *float64 `json:"horas"`
	Observacao string   `json:"observacao"`
}

type rhComunicadoInput struct {
	UsuarioID      *uint   `json:"usuario_id"`
	DepartamentoID *uint   `json:"departamento_id"`
	Titulo         string  `json:"titulo"`
	Mensagem       string  `json:"mensagem"`
	Inicio         string  `json:"inicio"`
	Fim            string  `json:"fim"`
	ImagemURL      *string `json:"imagem_url"`
	AudioURL       *string `json:"audio_url"`
	VideoURL       *string `json:"video_url"`
	MidiaTipo      *string `json:"midia_tipo"`
}

type rhMonitoringInput struct {
	ShowOnMonitoring bool `json:"show_on_monitoring"`
}

type hierarchyInput struct {
	DepartamentoID uint   `json:"departamento_id" binding:"required"`
	GestorID       *uint  `json:"gestor_id"`
	SubordinadoIDs []uint `json:"subordinado_ids"`
}

type messageInput struct {
	DestinatarioID uint   `json:"destinatario_id" binding:"required"`
	Assunto        string `json:"assunto" binding:"required"`
	Mensagem       string `json:"mensagem" binding:"required"`
}

func (h *RHHandler) ListMessages(c *gin.Context) {
	current := middleware.GetCurrentUser(c)
	var messages []models.RHMensagem
	if err := h.userRepo.DB().Preload("Remetente").Preload("Destinatario").Where("remetente_id = ? OR destinatario_id = ?", current.ID, current.ID).Order("criado_em desc").Find(&messages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var contacts []models.User
	if current.GestorID != nil {
		if err := h.userRepo.DB().Where("is_active = true AND (role = ? OR id = ?)", models.RoleRH, *current.GestorID).Order("nome asc").Find(&contacts).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		if err := h.userRepo.DB().Where("is_active = true AND role = ?", models.RoleRH).Order("nome asc").Find(&contacts).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	var directReports []models.User
	if err := h.userRepo.DB().Where("is_active = true AND gestor_id = ?", current.ID).Order("nome asc").Find(&directReports).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	seen := make(map[uint]bool, len(contacts)+len(directReports))
	merged := make([]models.User, 0, len(contacts)+len(directReports))
	for _, contact := range append(contacts, directReports...) {
		if seen[contact.ID] || contact.ID == current.ID {
			continue
		}
		seen[contact.ID] = true
		merged = append(merged, contact)
	}
	c.JSON(http.StatusOK, gin.H{"mensagens": messages, "contatos": merged})
}

func (h *RHHandler) CreateMessage(c *gin.Context) {
	current := middleware.GetCurrentUser(c)
	var in messageInput
	if err := c.ShouldBindJSON(&in); err != nil || strings.TrimSpace(in.Assunto) == "" || strings.TrimSpace(in.Mensagem) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Destinatário, assunto e mensagem são obrigatórios"})
		return
	}
	target, err := h.userRepo.GetByID(in.DestinatarioID)
	if err != nil || !target.IsActive {
		c.JSON(http.StatusNotFound, gin.H{"error": "Destinatário não encontrado"})
		return
	}
	allowed := target.Role == models.RoleRH || (current.GestorID != nil && *current.GestorID == target.ID) || (target.GestorID != nil && *target.GestorID == current.ID)
	if !allowed {
		c.JSON(http.StatusForbidden, gin.H{"error": "Mensagens só podem ser enviadas ao gestor, RH ou subordinados diretos"})
		return
	}
	message := &models.RHMensagem{RemetenteID: current.ID, DestinatarioID: target.ID, Assunto: strings.TrimSpace(in.Assunto), Mensagem: strings.TrimSpace(in.Mensagem)}
	if err := h.userRepo.DB().Create(message).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, message)
}

func (h *RHHandler) ConfirmMessage(c *gin.Context) {
	current := middleware.GetCurrentUser(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	now := time.Now()
	result := h.userRepo.DB().Model(&models.RHMensagem{}).Where("id = ? AND destinatario_id = ?", id, current.ID).Update("confirmado_em", &now)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Mensagem não encontrada"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"confirmado_em": now})
}

func (h *RHHandler) Hierarchy(c *gin.Context) {
	users, err := h.userRepo.GetMulti(0, 1000)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var setores []models.Departamento
	if err := h.userRepo.DB().Preload("Responsavel").Find(&setores).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"setores": setores, "usuarios": users})
}

func (h *RHHandler) visibleToCurrent(c *gin.Context, user *models.User) bool {
	current := middleware.GetCurrentUser(c)
	if current == nil || user == nil {
		return false
	}
	if current.Role == models.RoleAdmin || current.Role == models.RoleRH {
		return true
	}
	if user.ID == current.ID {
		return h.canAccessRHTeam(c)
	}
	return user.GestorID != nil && *user.GestorID == current.ID
}

func (h *RHHandler) managedRecipients(c *gin.Context) ([]models.User, error) {
	current := middleware.GetCurrentUser(c)
	if current == nil {
		return nil, nil
	}
	var users []models.User
	err := h.userRepo.DB().Preload("Departamento").Where("is_active = true AND gestor_id = ?", current.ID).Order("nome asc").Find(&users).Error
	return users, err
}

func (h *RHHandler) canAccessRHTeam(c *gin.Context) bool {
	current := middleware.GetCurrentUser(c)
	if current == nil {
		return false
	}
	if current.Role == models.RoleAdmin || current.Role == models.RoleRH {
		return true
	}
	reports, _ := h.userRepo.CountDirectReports(current.ID)
	departments, _ := h.userRepo.CountManagedDepartments(current.ID)
	return reports > 0 || departments > 0
}

func (h *RHHandler) filterUsersAndStatusesForCurrent(c *gin.Context, users []models.User, statuses []models.RHStatus) ([]models.User, []models.RHStatus, map[uint]bool) {
	current := middleware.GetCurrentUser(c)
	allowed := map[uint]bool{}
	if current != nil && (current.Role == models.RoleAdmin || current.Role == models.RoleRH) {
		for _, user := range users {
			allowed[user.ID] = true
		}
		return users, statuses, allowed
	}
	filteredUsers := make([]models.User, 0)
	for i := range users {
		if h.visibleToCurrent(c, &users[i]) {
			filteredUsers = append(filteredUsers, users[i])
			allowed[users[i].ID] = true
		}
	}
	filteredStatuses := make([]models.RHStatus, 0)
	for _, status := range statuses {
		if allowed[status.UsuarioID] {
			filteredStatuses = append(filteredStatuses, status)
		}
	}
	return filteredUsers, filteredStatuses, allowed
}

func (h *RHHandler) filterComunicadosForCurrent(c *gin.Context, comunicados []models.RHComunicado, allowed map[uint]bool) []models.RHComunicado {
	current := middleware.GetCurrentUser(c)
	if current != nil && (current.Role == models.RoleAdmin || current.Role == models.RoleRH) {
		return comunicados
	}
	filtered := make([]models.RHComunicado, 0)
	for _, comunicado := range comunicados {
		if comunicado.UsuarioID != nil && allowed[*comunicado.UsuarioID] {
			filtered = append(filtered, comunicado)
		} else if comunicado.DepartamentoID != nil && current != nil && current.DepartamentoID != nil && *comunicado.DepartamentoID == *current.DepartamentoID {
			filtered = append(filtered, comunicado)
		} else if comunicado.UsuarioID == nil && comunicado.DepartamentoID == nil {
			filtered = append(filtered, comunicado)
		}
	}
	return filtered
}

func (h *RHHandler) UpdateHierarchy(c *gin.Context) {
	var in hierarchyInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	db := h.userRepo.DB()
	var sector models.Departamento
	if err := db.First(&sector, in.DepartamentoID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Setor não encontrado"})
		return
	}
	previousManagerID := sector.ResponsavelID
	if in.GestorID != nil {
		var manager models.User
		if err := db.First(&manager, *in.GestorID).Error; err != nil || !manager.IsActive {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Gestor ativo não encontrado"})
			return
		}
		sector.ResponsavelID = in.GestorID
	} else {
		sector.ResponsavelID = nil
	}
	if err := db.Save(&sector).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if previousManagerID != nil {
		query := db.Model(&models.User{}).Where("departamento_id = ? AND gestor_id = ?", in.DepartamentoID, *previousManagerID)
		if len(in.SubordinadoIDs) > 0 {
			query = query.Where("id NOT IN ?", in.SubordinadoIDs)
		}
		if err := query.Update("gestor_id", nil).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	for _, userID := range in.SubordinadoIDs {
		if userID == 0 || (in.GestorID != nil && userID == *in.GestorID) {
			continue
		}
		if err := db.Model(&models.User{}).Where("id = ?", userID).Updates(map[string]interface{}{"gestor_id": in.GestorID, "departamento_id": in.DepartamentoID}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"message": "Hierarquia atualizada"})
}

func monitoringTeamPayload(users []models.User, byUser map[uint][]models.RHStatus, now time.Time, onlySelected bool) []gin.H {
	colaboradores := make([]gin.H, 0)
	for _, user := range users {
		if onlySelected && !user.ShowOnMonitoring {
			continue
		}
		status := currentRHStatus(byUser[user.ID], now)
		if !user.IsActive {
			status = "desligado"
		}

		var horas *float64
		if status == "banco_horas" {
			for _, item := range byUser[user.ID] {
				if item.Tipo == "banco_horas" && !item.Inicio.After(now) && (item.Fim == nil || !item.Fim.Before(now)) && item.Horas != nil {
					horas = item.Horas
					break
				}
			}
		}

		colaboradores = append(colaboradores, gin.H{"usuario": user, "status_atual": status, "horas": horas})
	}
	return colaboradores
}

// StatusDashboard returns the personnel control center, including the
// current calculated status of every employee and their scheduled calendar.
func (h *RHHandler) StatusDashboard(c *gin.Context) {
	if !h.canAccessRHTeam(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Acesso liberado somente para RH, administradores ou gestores com equipe configurada"})
		return
	}
	statuses, err := h.rhRepo.ListStatuses()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	comunicados, err := h.rhRepo.ListComunicados()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	users, err := h.userRepo.GetMulti(0, 1000)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	users, statuses, allowed := h.filterUsersAndStatusesForCurrent(c, users, statuses)
	comunicados = h.filterComunicadosForCurrent(c, comunicados, allowed)
	byUser := make(map[uint][]models.RHStatus)
	for _, status := range statuses {
		byUser[status.UsuarioID] = append(byUser[status.UsuarioID], status)
	}
	now := time.Now()
	colaboradores := monitoringTeamPayload(users, byUser, now, false)
	c.JSON(http.StatusOK, gin.H{"colaboradores": colaboradores, "status": statuses, "comunicados": comunicados, "atualizado_em": now})
}

func (h *RHHandler) UpdateMonitoringVisibility(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	var in rhMonitoringInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if _, err := h.userRepo.GetByID(uint(id)); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Colaborador não encontrado"})
		return
	}
	current := middleware.GetCurrentUser(c)
	if current != nil && current.Role != models.RoleAdmin && current.Role != models.RoleRH {
		target, _ := h.userRepo.GetByID(uint(id))
		if !h.visibleToCurrent(c, target) {
			c.JSON(http.StatusForbidden, gin.H{"error": "Sem permissão para este colaborador"})
			return
		}
	}
	if err := h.userRepo.SetShowOnMonitoring(uint(id), in.ShowOnMonitoring); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id, "show_on_monitoring": in.ShowOnMonitoring})
}

func (h *RHHandler) MonitoringTeam(c *gin.Context) {
	if !h.canAccessRHTeam(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Acesso liberado somente para RH, administradores ou gestores com equipe configurada"})
		return
	}
	statuses, err := h.rhRepo.ListStatuses()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	users, err := h.userRepo.GetMulti(0, 1000)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	users, statuses, _ = h.filterUsersAndStatusesForCurrent(c, users, statuses)
	byUser := make(map[uint][]models.RHStatus)
	for _, status := range statuses {
		byUser[status.UsuarioID] = append(byUser[status.UsuarioID], status)
	}
	now := time.Now()
	c.JSON(http.StatusOK, gin.H{"colaboradores": monitoringTeamPayload(users, byUser, now, true), "atualizado_em": now})
}

func (h *RHHandler) CreateStatus(c *gin.Context) {
	var in rhStatusInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	in.Tipo = strings.TrimSpace(strings.ToLower(in.Tipo))
	if in.UsuarioID == 0 || !validRHStatusTypes[in.Tipo] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Colaborador e status válido são obrigatórios"})
		return
	}
	if in.Tipo == "desligado" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Use o fluxo de desligamento para revogar o acesso e registrar o desligamento"})
		return
	}
	user, err := h.userRepo.GetByID(in.UsuarioID)
	if err != nil || !user.IsActive {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Colaborador ativo não encontrado"})
		return
	}
	if !h.visibleToCurrent(c, user) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Você só pode gerenciar sua equipe configurada"})
		return
	}
	inicio, err := parseRHDate(in.Inicio, false)
	if err != nil || inicio == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Data de início inválida"})
		return
	}
	fim, err := parseRHDate(in.Fim, true)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Data final inválida"})
		return
	}
	if fim != nil && fim.Before(*inicio) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "A data final deve ser posterior ao início"})
		return
	}
	var observacao *string
	if text := strings.TrimSpace(in.Observacao); text != "" {
		observacao = &text
	}
	current := middleware.GetCurrentUser(c)
	status := &models.RHStatus{UsuarioID: in.UsuarioID, Tipo: in.Tipo, Inicio: *inicio, Fim: fim, Horas: in.Horas, Observacao: observacao, CriadoPorID: current.ID}
	if err := h.rhRepo.CreateStatus(status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	label := map[string]string{"trabalhando": "Trabalhando", "folga": "Folga", "ferias": "Férias", "banco_horas": "Banco de horas"}[status.Tipo]
	autor := "RH"
	if current.Nome != "" {
		autor = current.Nome
	}
	message := fmt.Sprintf("%s registrou o status %s a partir de %s.", autor, label, status.Inicio.Format("02/01/2006"))
	if status.Fim != nil {
		message += " Período previsto até " + status.Fim.Format("02/01/2006") + "."
	}
	if status.Observacao != nil {
		message += " " + *status.Observacao
	}
	comunicado := &models.RHComunicado{UsuarioID: &user.ID, Titulo: "Atualização do RH: " + label, Mensagem: message, Inicio: time.Now(), Ativo: true, CriadoPorID: current.ID}
	_ = h.rhRepo.CreateComunicado(comunicado)
	if h.emailSvc != nil && h.emailSvc.IsNotificationEnabled(context.Background(), service.EmailNotificationRHStatus, true) {
		go func(email, subject, content string) {
			_ = h.emailSvc.SendEmail(context.Background(), email, subject, "<p>"+html.EscapeString(content)+"</p>")
		}(user.Email, comunicado.Titulo, message)
	}
	c.JSON(http.StatusCreated, status)
}

func (h *RHHandler) DeleteStatus(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	var status models.RHStatus
	if err := h.userRepo.DB().Preload("Usuario").First(&status, uint(id)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Registro de status não encontrado"})
		return
	}
	if !h.visibleToCurrent(c, status.Usuario) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Você só pode remover registros da sua equipe configurada"})
		return
	}
	if err := h.rhRepo.DeleteStatus(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Registro de status removido"})
}

func (h *RHHandler) CreateComunicado(c *gin.Context) {
	if !h.canAccessRHTeam(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Acesso liberado somente para RH, administradores ou gestores com equipe configurada"})
		return
	}
	var in rhComunicadoInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(in.Titulo) == "" || strings.TrimSpace(in.Mensagem) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Título e mensagem são obrigatórios"})
		return
	}
	current := middleware.GetCurrentUser(c)
	if in.UsuarioID != nil && *in.UsuarioID > 0 {
		target, err := h.userRepo.GetByID(*in.UsuarioID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Colaborador não encontrado"})
			return
		}
		if !h.visibleToCurrent(c, target) {
			c.JSON(http.StatusForbidden, gin.H{"error": "Você só pode comunicar sua equipe configurada"})
			return
		}
	} else if in.DepartamentoID != nil && *in.DepartamentoID > 0 {
		var dept models.Departamento
		if err := h.userRepo.DB().First(&dept, *in.DepartamentoID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Setor não encontrado"})
			return
		}
	} else if current != nil && current.Role != models.RoleAdmin && current.Role != models.RoleRH {
		recipients, err := h.managedRecipients(c)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if len(recipients) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Nenhum subordinado configurado para este gestor"})
			return
		}
	}
	inicio, err := parseRHDate(in.Inicio, false)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Data de início inválida"})
		return
	}
	if inicio == nil {
		now := time.Now()
		inicio = &now
	}
	fim, err := parseRHDate(in.Fim, true)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Data final inválida"})
		return
	}
	if fim != nil && fim.Before(*inicio) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "A data final deve ser posterior ao início"})
		return
	}

	var imgURL, audioURL, videoURL, midiaTipo *string
	if in.ImagemURL != nil && strings.TrimSpace(*in.ImagemURL) != "" {
		t := strings.TrimSpace(*in.ImagemURL)
		imgURL = &t
	}
	if in.AudioURL != nil && strings.TrimSpace(*in.AudioURL) != "" {
		t := strings.TrimSpace(*in.AudioURL)
		audioURL = &t
	}
	if in.VideoURL != nil && strings.TrimSpace(*in.VideoURL) != "" {
		t := strings.TrimSpace(*in.VideoURL)
		videoURL = &t
	}
	if in.MidiaTipo != nil && strings.TrimSpace(*in.MidiaTipo) != "" {
		t := strings.TrimSpace(*in.MidiaTipo)
		midiaTipo = &t
	}

	if current != nil && current.Role != models.RoleAdmin && current.Role != models.RoleRH && (in.UsuarioID == nil || *in.UsuarioID == 0) && (in.DepartamentoID == nil || *in.DepartamentoID == 0) {
		recipients, err := h.managedRecipients(c)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		created := make([]models.RHComunicado, 0, len(recipients))
		for _, recipient := range recipients {
			recipientID := recipient.ID
			comunicado := models.RHComunicado{
				UsuarioID:   &recipientID,
				Titulo:      strings.TrimSpace(in.Titulo),
				Mensagem:    strings.TrimSpace(in.Mensagem),
				Inicio:      *inicio,
				Fim:         fim,
				Ativo:       true,
				ImagemURL:   imgURL,
				AudioURL:    audioURL,
				VideoURL:    videoURL,
				MidiaTipo:   midiaTipo,
				CriadoPorID: current.ID,
			}
			if err := h.rhRepo.CreateComunicado(&comunicado); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			created = append(created, comunicado)
		}
		c.JSON(http.StatusCreated, gin.H{"message": "Comunicado enviado para a equipe", "quantidade": len(created), "comunicados": created})
		return
	}

	comunicado := &models.RHComunicado{
		UsuarioID:      in.UsuarioID,
		DepartamentoID: in.DepartamentoID,
		Titulo:         strings.TrimSpace(in.Titulo),
		Mensagem:       strings.TrimSpace(in.Mensagem),
		Inicio:         *inicio,
		Fim:            fim,
		Ativo:          true,
		ImagemURL:      imgURL,
		AudioURL:       audioURL,
		VideoURL:       videoURL,
		MidiaTipo:      midiaTipo,
		CriadoPorID:    current.ID,
	}
	if err := h.rhRepo.CreateComunicado(comunicado); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, comunicado)
}

func (h *RHHandler) DeleteComunicado(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	var comunicado models.RHComunicado
	if err := h.userRepo.DB().Preload("Usuario").First(&comunicado, uint(id)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comunicado não encontrado"})
		return
	}
	current := middleware.GetCurrentUser(c)
	if current == nil || (current.Role != models.RoleAdmin && current.Role != models.RoleRH) {
		if comunicado.Usuario == nil || !h.visibleToCurrent(c, comunicado.Usuario) {
			c.JSON(http.StatusForbidden, gin.H{"error": "Você só pode remover comunicados enviados para sua equipe configurada"})
			return
		}
	}
	if err := h.rhRepo.DeleteComunicado(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Comunicado removido"})
}

// UploadComunicadoMedia handles image, audio and video uploads or recordings for RH comunicados
func (h *RHHandler) UploadComunicadoMedia(c *gin.Context) {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nenhum arquivo enviado"})
		return
	}

	// 100MB max limit for videos/audio/images
	if fileHeader.Size > 100*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Arquivo excede o limite máximo de 100MB"})
		return
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	mediaTipo := ""
	if ext == ".mp4" || ext == ".webm" || ext == ".mov" || ext == ".mkv" || ext == ".avi" {
		mediaTipo = "video"
	} else if ext == ".mp3" || ext == ".wav" || ext == ".ogg" || ext == ".m4a" || ext == ".aac" || ext == ".weba" {
		mediaTipo = "audio"
	} else if ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".webp" || ext == ".gif" || ext == ".svg" {
		mediaTipo = "imagem"
	} else {
		contentType := fileHeader.Header.Get("Content-Type")
		if strings.HasPrefix(contentType, "audio/") {
			mediaTipo = "audio"
			ext = ".webm"
		} else if strings.HasPrefix(contentType, "video/") {
			mediaTipo = "video"
			ext = ".webm"
		} else if strings.HasPrefix(contentType, "image/") {
			mediaTipo = "imagem"
			ext = ".png"
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Formato de arquivo não suportado. Envie imagens, áudios ou vídeos."})
			return
		}
	}

	uploadDir := filepath.Join("uploads", "rh_comunicados")
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro ao criar diretório de uploads"})
		return
	}

	filename := fmt.Sprintf("%d_%s", time.Now().UnixNano(), filepath.Base(fileHeader.Filename))
	if !strings.HasSuffix(filename, ext) && ext != "" {
		filename += ext
	}
	dst := filepath.Join(uploadDir, filename)

	if err := c.SaveUploadedFile(fileHeader, dst); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Falha ao salvar arquivo"})
		return
	}

	publicURL := fmt.Sprintf("/uploads/rh_comunicados/%s", filename)
	c.JSON(http.StatusOK, gin.H{
		"url":        publicURL,
		"midia_tipo": mediaTipo,
		"filename":   filename,
	})
}

// MyPortal exposes only the authenticated user's HR calendar and messages.
func (h *RHHandler) MyPortal(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	statuses, err := h.rhRepo.ListStatusesForUser(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	now := time.Now()
	comunicados, err := h.rhRepo.ListComunicadosForUser(user.ID, user.DepartamentoID, now)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	readIDs, err := h.rhRepo.ListReadComunicadoIDs(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	readSet := make(map[uint]bool, len(readIDs))
	for _, id := range readIDs {
		readSet[id] = true
	}
	views := make([]gin.H, 0, len(comunicados))
	for _, comunicado := range comunicados {
		views = append(views, gin.H{"comunicado": comunicado, "lida": readSet[comunicado.ID]})
	}
	status := currentRHStatus(statuses, now)
	if !user.IsActive {
		status = "desligado"
	}
	c.JSON(http.StatusOK, gin.H{"status_atual": status, "calendario": statuses, "comunicados": views, "atualizado_em": now})
}

func (h *RHHandler) MarkMyComunicadoRead(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	user := middleware.GetCurrentUser(c)
	items, err := h.rhRepo.ListComunicadosForUser(user.ID, user.DepartamentoID, time.Now())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	allowed := false
	for _, item := range items {
		if item.ID == uint(id) {
			allowed = true
			break
		}
	}
	if !allowed {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comunicado não encontrado"})
		return
	}
	if err := h.rhRepo.MarkComunicadoRead(uint(id), user.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Leitura confirmada"})
}

func (h *RHHandler) ExportStatusCSV(c *gin.Context) {
	if !h.canAccessRHTeam(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Acesso liberado somente para RH, administradores ou gestores com equipe configurada"})
		return
	}
	statuses, err := h.rhRepo.ListStatuses()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if current := middleware.GetCurrentUser(c); current != nil && current.Role != models.RoleAdmin && current.Role != models.RoleRH {
		filtered := make([]models.RHStatus, 0)
		for _, status := range statuses {
			if h.visibleToCurrent(c, status.Usuario) {
				filtered = append(filtered, status)
			}
		}
		statuses = filtered
	}
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename=controle_rh.csv")
	w := csv.NewWriter(c.Writer)
	defer w.Flush()
	_ = w.Write([]string{"Colaborador", "E-mail", "Status", "Início", "Fim", "Horas", "Observação", "Registrado por"})
	for _, item := range statuses {
		name, email, creator, end, hours, note := "", "", "", "", "", ""
		if item.Usuario != nil {
			name, email = item.Usuario.Nome, item.Usuario.Email
		}
		if item.CriadoPor != nil {
			creator = item.CriadoPor.Nome
		}
		if item.Fim != nil {
			end = item.Fim.Format("02/01/2006")
		}
		if item.Horas != nil {
			hours = strconv.FormatFloat(*item.Horas, 'f', -1, 64)
		}
		if item.Observacao != nil {
			note = *item.Observacao
		}
		_ = w.Write([]string{name, email, item.Tipo, item.Inicio.Format("02/01/2006"), end, hours, note, creator})
	}
}

// formatDatePT renders "02 de agosto de 2026"
func formatDatePT(t time.Time) string {
	return fmt.Sprintf("%02d de %s de %d", t.Day(), ptMonths[t.Month()-1], t.Year())
}

func strOrDash(s *string) string {
	if s == nil || strings.TrimSpace(*s) == "" {
		return "-"
	}
	return strings.TrimSpace(*s)
}

// generateTermContent builds the default term text from a solicitacao
func generateTermContent(sol *models.Solicitacao) string {
	nome := "-"
	matricula := "-"
	if sol.Solicitante != nil {
		nome = sol.Solicitante.Nome
		if sol.Solicitante.Matricula != nil {
			matricula = *sol.Solicitante.Matricula
		}
	}
	nomeAtivo := "-"
	modelo := "-"
	patrimonio := "-"
	serie := "-"
	if sol.Asset != nil {
		nomeAtivo = sol.Asset.Nome
		modelo = strOrDash(sol.Asset.Modelo)
		patrimonio = sol.Asset.EPatrimonio
		serie = strOrDash(sol.Asset.NumeroSerie)
	}
	return fmt.Sprintf(defaultTermTemplate,
		nome, matricula, nomeAtivo, modelo, patrimonio, serie,
		formatDatePT(time.Now()))
}

type RHHandler struct {
	rhRepo    *repository.RHRepository
	userRepo  *repository.UserRepository
	assetRepo *repository.AssetRepository
	alertRepo *repository.EmergencyAlertRepository
	broker    *AlertSSEBroker
	emailSvc  service.EmailService
}

func NewRHHandler(rhRepo *repository.RHRepository, userRepo *repository.UserRepository, assetRepo *repository.AssetRepository, alertRepo *repository.EmergencyAlertRepository, broker *AlertSSEBroker, emailSvc service.EmailService) *RHHandler {
	return &RHHandler{
		rhRepo:    rhRepo,
		userRepo:  userRepo,
		assetRepo: assetRepo,
		alertRepo: alertRepo,
		broker:    broker,
		emailSvc:  emailSvc,
	}
}

// List returns all terms + pending solicitacoes that need a term
func (h *RHHandler) List(c *gin.Context) {
	termos, err := h.rhRepo.ListTermos()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	pendentes, err := h.rhRepo.GetPendingSolicitacoesRH()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"termos": termos, "pendentes": pendentes})
}

// GenerateTemplate returns the default term text for a solicitacao
func (h *RHHandler) GenerateTemplate(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	sol, err := h.rhRepo.GetSolicitacaoWithDetails(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Solicitação não encontrada"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"conteudo_termo": generateTermContent(sol),
		"solicitacao":    sol,
	})
}

type createTermoInput struct {
	SolicitacaoID *uint  `json:"solicitacao_id"`
	ConteudoTermo string `json:"conteudo_termo"`
}

// Create creates a new term (generating default content when not provided)
func (h *RHHandler) Create(c *gin.Context) {
	var in createTermoInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if in.SolicitacaoID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "É obrigatório informar a solicitação"})
		return
	}

	sol, err := h.rhRepo.GetSolicitacaoWithDetails(*in.SolicitacaoID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Solicitação não encontrada"})
		return
	}
	if sol.AssetID == nil || sol.SolicitanteID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Solicitação sem ativo ou usuário vinculado"})
		return
	}

	termo := &models.TermoResponsabilidade{
		SolicitacaoID: in.SolicitacaoID,
		AssetID:       *sol.AssetID,
		UsuarioID:     *sol.SolicitanteID,
		Status:        "Pendente",
		ConteudoTermo: strings.TrimSpace(in.ConteudoTermo),
	}
	if termo.ConteudoTermo == "" {
		termo.ConteudoTermo = generateTermContent(sol)
	}

	if termo.ConteudoTermo == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "O conteúdo do termo não pode estar em branco"})
		return
	}

	if err := h.rhRepo.CreateTermo(termo); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	created, err := h.rhRepo.GetTermoByID(termo.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, created)
}

type updateTermoInput struct {
	ConteudoTermo string `json:"conteudo_termo"`
}

// Update edits the term content
func (h *RHHandler) Update(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	termo, err := h.rhRepo.GetTermoByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Termo não encontrado"})
		return
	}

	var in updateTermoInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(in.ConteudoTermo) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "O conteúdo do termo não pode estar em branco"})
		return
	}

	termo.ConteudoTermo = strings.TrimSpace(in.ConteudoTermo)
	if err := h.rhRepo.UpdateTermo(termo); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, termo)
}

// Sign marks the term as signed by the user
func (h *RHHandler) Sign(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	termo, err := h.rhRepo.GetTermoByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Termo não encontrado"})
		return
	}

	termo.Status = "Assinado"
	now := time.Now()
	termo.DataAssinatura = &now
	if err := h.rhRepo.UpdateTermo(termo); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, termo)
}

// Cancel marks the term as cancelled
func (h *RHHandler) Cancel(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	termo, err := h.rhRepo.GetTermoByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Termo não encontrado"})
		return
	}

	termo.Status = "Cancelado"
	if err := h.rhRepo.UpdateTermo(termo); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, termo)
}

// PDF returns a printable HTML document (browser print → PDF), mirroring termo_pdf.html
func (h *RHHandler) PDF(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	termo, err := h.rhRepo.GetTermoByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Termo não encontrado"})
		return
	}

	nome := "-"
	patrimonio := "-"
	if termo.Usuario != nil {
		nome = termo.Usuario.Nome
	}
	if termo.Asset != nil {
		patrimonio = termo.Asset.EPatrimonio
	}

	escaped := html.EscapeString(termo.ConteudoTermo)
	doc := `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Termo de Responsabilidade - ` + html.EscapeString(nome) + `</title>
<style>
  @page { size: A4; margin: 3cm 2.5cm 2.5cm 2.5cm; }
  body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #111111; }
  .header { text-align: center; margin-bottom: 2.5cm; border-bottom: 2px solid #000; padding-bottom: 10px; }
  .header h1 { font-size: 16pt; text-transform: uppercase; letter-spacing: 1px; margin: 0; font-weight: bold; }
  .header .subtitle { font-family: 'Courier New', Courier, monospace; font-size: 9pt; color: #666; margin-top: 5px; }
  .content { text-align: justify; white-space: pre-line; margin-bottom: 2cm; }
  .footer-info { margin-top: 3cm; font-size: 9pt; color: #777; font-family: 'Courier New', Courier, monospace; border-top: 1px dashed #ccc; padding-top: 10px; }
</style>
</head>
<body>
<div class="header">
  <h1>Termo de Responsabilidade</h1>
  <div class="subtitle">NBAPARK // CONTROLE INTERNO DE ATIVOS DE TI</div>
</div>
<div class="content">` + escaped + `</div>
<div class="footer-info">
  Documento gerado eletronicamente em ` + formatDatePT(time.Now()) + ` pelo módulo RH Audit Workflow.<br>
  Identificador do Termo: #` + strconv.FormatUint(uint64(termo.ID), 10) + ` · Ref: Patrimônio ` + html.EscapeString(patrimonio) + `
</div>
</body>
</html>`

	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(http.StatusOK, doc)
}

// OffboardUser processes an employee offboarding
func (h *RHHandler) OffboardUser(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de usuário inválido"})
		return
	}

	user, err := h.userRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Usuário não encontrado"})
		return
	}

	// Set inactive
	user.IsActive = false
	if err := h.userRepo.Update(user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro ao inativar usuário"})
		return
	}

	// Keep the personnel history explicit even though the inactive account also
	// makes the calculated status immediately show as "desligado".
	now := time.Now()
	offboardingNote := "Desligamento processado pelo Portal RH"
	if current := middleware.GetCurrentUser(c); current != nil {
		_ = h.rhRepo.CreateStatus(&models.RHStatus{UsuarioID: user.ID, Tipo: "desligado", Inicio: now, Observacao: &offboardingNote, CriadoPorID: current.ID})
	}

	// List user assets to inform in the alert
	assets, err := h.assetRepo.ListByCurrentUser(uint(id))
	ativoStr := "Nenhum ativo vinculado"

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

	// Create emergency alert for IT
	motivo := fmt.Sprintf("O colaborador %s foi desligado pelo RH. Por favor, utilize a opção de solicitação de devolução para recolher os seguintes ativos: %s.", user.Nome, ativoStr)

	setorStr := "Não informado"
	if user.DepartamentoID != nil {
		var dept models.Departamento
		if err := h.userRepo.DB().First(&dept, *user.DepartamentoID).Error; err == nil {
			setorStr = dept.Nome
		}
	} else if user.Cargo != nil && *user.Cargo != "" {
		setorStr = *user.Cargo
	}

	alert := &models.EmergencyAlert{
		UsuarioID:   user.ID,
		UsuarioNome: user.Nome,
		Motivo:      motivo,
		Atendido:    false,
	}
	if setorStr != "" {
		alert.SetorNome = &setorStr
	}
	if ativoStr != "Nenhum ativo vinculado" {
		alert.AtivoNome = &ativoStr
	}

	if h.alertRepo != nil {
		if err := h.alertRepo.Create(alert); err == nil && h.broker != nil {
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
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message":         "Colaborador desligado com sucesso. Alerta de devolução enviado para a TI.",
		"assets_affected": len(assets),
	})
}
