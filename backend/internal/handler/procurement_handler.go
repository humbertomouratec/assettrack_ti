package handler

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"html"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/assettrack/backend/internal/middleware"
	"github.com/assettrack/backend/internal/models"
	"github.com/assettrack/backend/internal/repository"
	"github.com/assettrack/backend/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// procurementManager roles allowed to manage procurement records (admin, gerente_ti, gerente_infra, comprador).
func procurementManager(user *models.User) bool {
	if user == nil {
		return false
	}
	return user.Role == models.RoleAdmin || user.Role == models.RoleGerente ||
		user.Role == models.RoleGerenteInfra || user.Role == models.RoleComprador
}

// procurementAdmin roles allowed for budget release / deletions (admin, gerente_ti, gerente_infra).
func procurementAdmin(user *models.User) bool {
	if user == nil {
		return false
	}
	return user.Role == models.RoleAdmin || user.Role == models.RoleGerente || user.Role == models.RoleGerenteInfra
}

// canApproveLevel mirrors the Python decide_request authorization matrix.
func canApproveLevel(role, nivel string) bool {
	switch nivel {
	case "Gestor", "Gerente":
		return role == models.RoleAdmin || role == models.RoleGerente ||
			role == models.RoleGerenteInfra || role == models.RoleComprador
	case "Financeiro", "Diretoria", "Compras":
		return role == models.RoleAdmin || role == models.RoleComprador
	}
	return false
}

type ProcurementHandler struct {
	categoryRepo     *repository.ProcurementCategoryRepository
	productRepo      *repository.ProcurementProductRepository
	ccRepo           *repository.ProcurementCostCenterRepository
	requestRepo      *repository.ProcurementRequestRepository
	approvalRepo     *repository.ProcurementApprovalRepository
	quotationRepo    *repository.ProcurementQuotationRepository
	orderRepo        *repository.ProcurementOrderRepository
	receivingRepo    *repository.ProcurementReceivingRepository
	stockRepo        *repository.ProcurementStockRepository
	contractRepo     *repository.ProcurementContractRepository
	contractTypeRepo *repository.ProcurementContractTypeRepository
	historyRepo      *repository.ProcurementHistoryRepository
	notifRepo        *repository.ProcurementNotificationRepository
	researchRepo     *repository.ProcurementResearchRepository
	invoiceRepo      *repository.InvoiceRepository
	assetRepo        *repository.AssetRepository
	userRepo         *repository.UserRepository
	projectRepo      *repository.KanbanProjectRepository
	cardRepo         *repository.KanbanCardRepository
	interactionRepo  *repository.KanbanInteractionRepository
	kanbanBroker     *KanbanSSEBroker
	settingsRepo     repository.SystemSettingsRepository
	emailSvc         service.EmailService
}

func NewProcurementHandler(
	categoryRepo *repository.ProcurementCategoryRepository,
	productRepo *repository.ProcurementProductRepository,
	ccRepo *repository.ProcurementCostCenterRepository,
	requestRepo *repository.ProcurementRequestRepository,
	approvalRepo *repository.ProcurementApprovalRepository,
	quotationRepo *repository.ProcurementQuotationRepository,
	orderRepo *repository.ProcurementOrderRepository,
	receivingRepo *repository.ProcurementReceivingRepository,
	stockRepo *repository.ProcurementStockRepository,
	contractRepo *repository.ProcurementContractRepository,
	contractTypeRepo *repository.ProcurementContractTypeRepository,
	historyRepo *repository.ProcurementHistoryRepository,
	notifRepo *repository.ProcurementNotificationRepository,
	researchRepo *repository.ProcurementResearchRepository,
	invoiceRepo *repository.InvoiceRepository,
	assetRepo *repository.AssetRepository,
	userRepo *repository.UserRepository,
	projectRepo *repository.KanbanProjectRepository,
	cardRepo *repository.KanbanCardRepository,
	interactionRepo *repository.KanbanInteractionRepository,
	kanbanBroker *KanbanSSEBroker,
	settingsRepo repository.SystemSettingsRepository,
	emailSvc service.EmailService,
) *ProcurementHandler {
	return &ProcurementHandler{
		categoryRepo:     categoryRepo,
		productRepo:      productRepo,
		ccRepo:           ccRepo,
		requestRepo:      requestRepo,
		approvalRepo:     approvalRepo,
		quotationRepo:    quotationRepo,
		orderRepo:        orderRepo,
		receivingRepo:    receivingRepo,
		stockRepo:        stockRepo,
		contractRepo:     contractRepo,
		contractTypeRepo: contractTypeRepo,
		historyRepo:      historyRepo,
		notifRepo:        notifRepo,
		researchRepo:     researchRepo,
		invoiceRepo:      invoiceRepo,
		assetRepo:        assetRepo,
		userRepo:         userRepo,
		projectRepo:      projectRepo,
		cardRepo:         cardRepo,
		interactionRepo:  interactionRepo,
		kanbanBroker:     kanbanBroker,
		settingsRepo:     settingsRepo,
		emailSvc:         emailSvc,
	}
}

func (h *ProcurementHandler) logHistory(tabela string, registroID, userID uint, acao string) {
	_ = h.historyRepo.Create(&models.PurchaseHistory{
		TabelaOrigem: tabela,
		RegistroID:   registroID,
		UserID:       userID,
		Acao:         acao,
	})
}

func (h *ProcurementHandler) broadcastKanbanRequestUpdate(req *models.PurchaseRequest, cardHint *models.KanbanCard, mensagem string) {
	if h.kanbanBroker == nil || req == nil {
		return
	}

	var card *models.KanbanCard
	if cardHint != nil {
		card = cardHint
	} else if linked, err := h.cardRepo.GetByPurchaseRequestID(req.ID); err == nil {
		card = linked
	}
	if card == nil {
		return
	}

	project, err := h.projectRepo.GetByID(card.ProjectID)
	if err != nil || project == nil {
		return
	}

	ids := h.projectParticipantIDs(project)
	h.kanbanBroker.BroadcastToUsers(ids, KanbanEvent{
		Type: "kanban_update",
		Payload: gin.H{
			"tipo":       "SOLICITACAO_COMPRA_ATUALIZADA",
			"mensagem":   mensagem,
			"project_id": card.ProjectID,
			"card_id":    card.ID,
			"request_id": req.ID,
			"status":     req.Status,
		},
	})
}

// syncMaintenancePurchaseToKanban turns a preventive purchase request into a
// visible operational stop: the OS waits for the part and its Kanban card is
// linked to the request so buyers and field technicians share one context.
func (h *ProcurementHandler) syncMaintenancePurchaseToKanban(req *models.PurchaseRequest, userID uint) {
	if req == nil || req.OrigemOSID == nil {
		return
	}
	db := h.userRepo.DB()
	var order models.MaintenanceOrder
	if err := db.First(&order, *req.OrigemOSID).Error; err != nil {
		return
	}
	if order.Status != models.PMStatusConcluida && order.Status != models.PMStatusCancelada {
		previousStatus := order.Status
		order.Status = models.PMStatusAguardandoPeca
		if err := db.Save(&order).Error; err != nil {
			return
		}
		_ = db.Create(&models.MaintenanceHistory{
			OrderID: order.ID, Acao: "Aguardando Peça",
			Descricao: fmt.Sprintf("OS aguardando a solicitação de compra %s para liberação da peça/material.", req.Numero),
			UsuarioID: &userID, DataHora: time.Now(), StatusAnterior: &previousStatus, StatusNovo: &order.Status,
		}).Error
	}
	if err := service.SyncPreventiveOrderToKanban(db, order.ID, userID); err != nil {
		return
	}
	_ = db.Model(&models.KanbanCard{}).Where("preventive_order_id = ?", order.ID).Updates(map[string]interface{}{
		"purchase_request_id": req.ID,
		"updated_at":          time.Now(),
	}).Error
	var cards []models.KanbanCard
	if err := db.Where("preventive_order_id = ?", order.ID).Find(&cards).Error; err == nil {
		for _, card := range cards {
			_ = h.interactionRepo.Create(&models.KanbanCardInteraction{
				CardID: card.ID, UsuarioID: userID, Tipo: models.InteractionSistemaSupr,
				Mensagem: fmt.Sprintf("Solicitação de compra %s vinculada. OS aguardando peça/material.", req.Numero),
			})
		}
	}
	h.broadcastKanbanRequestUpdate(req, nil, fmt.Sprintf("Solicitação de compra %s vinculada à OS preventiva; aguardando peça/material.", req.Numero))
}

func (h *ProcurementHandler) projectParticipantIDs(project *models.KanbanProject) []uint {
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

// notifyStaff creates in-DB notifications for manager/comprador roles.
func (h *ProcurementHandler) notifyStaff(mensagem string) {
	internalEnabled := service.IsNotificationSettingEnabled(context.Background(), h.settingsRepo, service.NotificationProcurementEnabled, true)
	emailEnabled := h.emailSvc != nil && h.emailSvc.IsNotificationEnabled(context.Background(), service.EmailNotificationProcurement, true)
	staff, err := h.userRepo.ListByRoles([]string{models.RoleAdmin, models.RoleGerente, models.RoleGerenteInfra, models.RoleComprador})
	if err != nil {
		return
	}
	for _, u := range staff {
		if internalEnabled {
			_ = h.notifRepo.Create(&models.PurchaseNotification{UserID: u.ID, Mensagem: mensagem, LinkRedirecionamento: strPtr("/compras")})
		}
		if emailEnabled && strings.TrimSpace(u.Email) != "" {
			_ = h.emailSvc.SendEmail(context.Background(), u.Email, "Atualização de compras — AssetTrack TI", "<p>"+html.EscapeString(mensagem)+"</p>")
		}
	}
}

func strPtr(s string) *string { return &s }

func (h *ProcurementHandler) sendPurchaseEmail(recipient models.User, subject, message string) {
	if h.emailSvc == nil || !h.emailSvc.IsNotificationEnabled(context.Background(), service.EmailNotificationProcurement, true) || strings.TrimSpace(recipient.Email) == "" {
		return
	}
	_ = h.emailSvc.SendEmail(context.Background(), recipient.Email, subject+" — AssetTrack TI", "<p>"+html.EscapeString(message)+"</p>")
}

func parseProcDate(s string) *time.Time {
	if s == "" {
		return nil
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02", "2006-01-02T15:04"} {
		if t, err := time.Parse(layout, s); err == nil {
			return &t
		}
	}
	return nil
}

func calcRequestEstimatedTotal(req *models.PurchaseRequest) float64 {
	if req == nil {
		return 0
	}
	total := 0.0
	for _, it := range req.Itens {
		total += it.Quantidade * it.ValorEstimado
	}
	return total
}

type procurementApprovalLimits struct {
	GestorMax     float64
	GerenteMax    float64
	FinanceiroMax float64
}

func defaultProcurementApprovalLimits() procurementApprovalLimits {
	return procurementApprovalLimits{
		GestorMax:     5000,
		GerenteMax:    15000,
		FinanceiroMax: 50000,
	}
}

func parseFloatSetting(value string, fallback float64) float64 {
	v, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
	if err != nil || v <= 0 {
		return fallback
	}
	return v
}

func (h *ProcurementHandler) loadApprovalLimits(c *gin.Context) procurementApprovalLimits {
	limits := defaultProcurementApprovalLimits()
	if h.settingsRepo == nil || c == nil {
		return limits
	}
	if s, err := h.settingsRepo.GetSetting(c.Request.Context(), "procurement_approval_limit_gestor"); err == nil && s != nil {
		limits.GestorMax = parseFloatSetting(s.SettingValue, limits.GestorMax)
	}
	if s, err := h.settingsRepo.GetSetting(c.Request.Context(), "procurement_approval_limit_gerente"); err == nil && s != nil {
		limits.GerenteMax = parseFloatSetting(s.SettingValue, limits.GerenteMax)
	}
	if s, err := h.settingsRepo.GetSetting(c.Request.Context(), "procurement_approval_limit_financeiro"); err == nil && s != nil {
		limits.FinanceiroMax = parseFloatSetting(s.SettingValue, limits.FinanceiroMax)
	}
	if limits.GerenteMax < limits.GestorMax {
		limits.GerenteMax = limits.GestorMax
	}
	if limits.FinanceiroMax < limits.GerenteMax {
		limits.FinanceiroMax = limits.GerenteMax
	}
	return limits
}

func suggestedApprovalLevel(total float64, urgency string, limits procurementApprovalLimits) string {
	switch {
	case total >= limits.FinanceiroMax:
		return "Diretoria"
	case total >= limits.GerenteMax:
		return "Financeiro"
	case total >= limits.GestorMax:
		return "Gerente"
	case urgency == models.UrgencyUrgente || urgency == models.UrgencyAlta:
		return "Gerente"
	default:
		return "Gestor"
	}
}

func approvalLevelRank(level string) int {
	switch level {
	case "Gestor":
		return 1
	case "Gerente":
		return 2
	case "Financeiro":
		return 3
	case "Diretoria":
		return 4
	case "Compras":
		return 5
	default:
		return 0
	}
}

func nextRequestApprovalLevel(current string) string {
	switch current {
	case "Gestor":
		return "Gerente"
	case "Gerente":
		return "Financeiro"
	case "Financeiro":
		return "Diretoria"
	case "Diretoria":
		return "Compras"
	default:
		return "Compras"
	}
}

func normalizeOrderStatus(value string) string {
	value = strings.TrimSpace(value)
	switch value {
	case models.POStatusAberto, models.POStatusEnviado, models.POStatusAceito, models.POStatusEmTransporte,
		models.POStatusRecebidoParcial, models.POStatusRecebidoTotal, models.POStatusCancelado:
		return value
	default:
		return ""
	}
}

func canTransitionOrderStatus(current, next string) bool {
	if current == next {
		return true
	}
	allowed := map[string][]string{
		models.POStatusAberto:          {models.POStatusEnviado, models.POStatusCancelado},
		models.POStatusEnviado:         {models.POStatusAceito, models.POStatusCancelado},
		models.POStatusAceito:          {models.POStatusEmTransporte, models.POStatusCancelado},
		models.POStatusEmTransporte:    {models.POStatusRecebidoParcial, models.POStatusRecebidoTotal, models.POStatusCancelado},
		models.POStatusRecebidoParcial: {models.POStatusEmTransporte, models.POStatusRecebidoTotal},
	}
	for _, candidate := range allowed[current] {
		if candidate == next {
			return true
		}
	}
	return false
}

func budgetSituation(cc *models.CostCenter, additional float64) string {
	if cc == nil {
		return "Sem centro de custo"
	}
	if cc.OrcamentoMensal <= 0 {
		return "Sem orçamento mensal definido"
	}
	projected := cc.OrcamentoMensalUsado + additional
	limit := (projected / cc.OrcamentoMensal) * 100
	switch {
	case projected > cc.OrcamentoMensal && cc.BloquearLimite:
		return "Bloqueio por orçamento"
	case projected > cc.OrcamentoMensal:
		return "Acima do orçamento"
	case limit >= 90 && cc.AlertaLimite:
		return "Em alerta"
	default:
		return "Dentro do orçamento"
	}
}

func enrichRequest(req *models.PurchaseRequest, limits procurementApprovalLimits) {
	if req == nil {
		return
	}
	total := calcRequestEstimatedTotal(req)
	req.ValorEstimadoTotal = total
	req.NivelAprovacaoSugerido = suggestedApprovalLevel(total, req.Urgencia, limits)
	req.SituacaoOrcamentoCentro = budgetSituation(req.CentroCusto, total)
}

func enrichRequests(items []models.PurchaseRequest, limits procurementApprovalLimits) {
	for i := range items {
		enrichRequest(&items[i], limits)
	}
}

func enrichOrder(order *models.PurchaseOrder) {
	if order == nil {
		return
	}
	if order.Request != nil {
		total := calcRequestEstimatedTotal(order.Request)
		order.RequestValorEstimadoTotal = total
		order.EconomiaEstimada = total - order.ValorTotal
	}
	if order.Quotation != nil {
		for _, supplier := range order.Quotation.Suppliers {
			if supplier.FornecedorID == order.FornecedorID {
				order.PrazoEntregaDias = supplier.PrazoEntregaDias
				if supplier.PrazoEntregaDias > 0 {
					due := order.DataEmissao.AddDate(0, 0, supplier.PrazoEntregaDias)
					order.DataPrevistaEntrega = &due
				}
				break
			}
		}
	}
	if len(order.Receivings) > 0 {
		latest := order.Receivings[0].DataRecebimento
		for _, receiving := range order.Receivings[1:] {
			if receiving.DataRecebimento.After(latest) {
				latest = receiving.DataRecebimento
			}
		}
		order.UltimaDataRecebimento = &latest
	}
	if order.PrazoEntregaDias <= 0 || order.DataPrevistaEntrega == nil {
		order.SLAStatus = "Sem SLA"
		return
	}
	today := time.Now()
	switch order.Status {
	case models.POStatusRecebidoParcial, models.POStatusRecebidoTotal:
		if order.UltimaDataRecebimento != nil && !order.UltimaDataRecebimento.After(*order.DataPrevistaEntrega) {
			order.SLAStatus = "Entregue no prazo"
		} else {
			order.SLAStatus = "Entregue em atraso"
		}
	default:
		if today.After(*order.DataPrevistaEntrega) {
			order.SLAStatus = "Em atraso"
		} else {
			order.SLAStatus = "Dentro do prazo"
		}
	}
}

func enrichOrders(items []models.PurchaseOrder) {
	for i := range items {
		enrichOrder(&items[i])
	}
}

func procurementSafeCSV(value string) string {
	if value == "" {
		return ""
	}
	if strings.ContainsAny(value[:1], "=+-@") {
		return "'" + value
	}
	return value
}

func procurementFloat(value float64) string {
	return fmt.Sprintf("%.2f", value)
}

// ---------- Dashboard ----------

func (h *ProcurementHandler) Dashboard(c *gin.Context) {
	var reqPending, ordersActive, lowStock int64
	reqs, _ := h.requestRepo.List("", 0, 1000)
	limits := h.loadApprovalLimits(c)
	enrichRequests(reqs, limits)
	for _, r := range reqs {
		if r.Status == models.PRStatusPendente {
			reqPending++
		}
	}
	orders, _ := h.orderRepo.List("", 0, 1000)
	enrichOrders(orders)
	for _, o := range orders {
		if o.Status == models.POStatusAberto {
			ordersActive++
		}
	}
	stocks, _ := h.stockRepo.List()
	for _, s := range stocks {
		if s.QuantidadeSaldo < 5 {
			lowStock++
		}
	}
	recentReq := reqs
	if len(recentReq) > 5 {
		recentReq = recentReq[:5]
	}
	recentOrders := orders
	if len(recentOrders) > 5 {
		recentOrders = recentOrders[:5]
	}
	requestedTotal := 0.0
	for _, r := range reqs {
		requestedTotal += r.ValorEstimadoTotal
	}
	orderedTotal := 0.0
	estimatedSavingsTotal := 0.0
	supplierAgg := map[uint]gin.H{}
	for _, o := range orders {
		orderedTotal += o.ValorTotal
		if o.EconomiaEstimada > 0 {
			estimatedSavingsTotal += o.EconomiaEstimada
		}
		if o.Fornecedor == nil {
			continue
		}
		row, ok := supplierAgg[o.FornecedorID]
		if !ok {
			row = gin.H{"id": o.FornecedorID, "nome": o.Fornecedor.Nome, "total_pedidos": 0, "valor_total": 0.0}
		}
		row["total_pedidos"] = row["total_pedidos"].(int) + 1
		row["valor_total"] = row["valor_total"].(float64) + o.ValorTotal
		supplierAgg[o.FornecedorID] = row
	}
	topSuppliers := make([]gin.H, 0, len(supplierAgg))
	for _, row := range supplierAgg {
		topSuppliers = append(topSuppliers, row)
	}
	sort.Slice(topSuppliers, func(i, j int) bool {
		return topSuppliers[i]["valor_total"].(float64) > topSuppliers[j]["valor_total"].(float64)
	})
	if len(topSuppliers) > 5 {
		topSuppliers = topSuppliers[:5]
	}
	quotedTotal := 0.0
	quotations, _ := h.quotationRepo.List()
	for _, quotation := range quotations {
		best := 0.0
		for idx, supplier := range quotation.Suppliers {
			if idx == 0 || supplier.ValorTotal < best {
				best = supplier.ValorTotal
			}
		}
		quotedTotal += best
	}
	costCenters, _ := h.ccRepo.List()
	monthlyBudgetTotal := 0.0
	monthlyBudgetUsed := 0.0
	costCentersAlert := 0
	costCentersOverLimit := 0
	ccSummary := make([]gin.H, 0, len(costCenters))
	ccReports := map[uint]gin.H{}
	for _, cc := range costCenters {
		monthlyBudgetTotal += cc.OrcamentoMensal
		monthlyBudgetUsed += cc.OrcamentoMensalUsado
		usagePct := 0.0
		status := "ok"
		if cc.OrcamentoMensal > 0 {
			usagePct = (cc.OrcamentoMensalUsado / cc.OrcamentoMensal) * 100
		}
		switch {
		case cc.OrcamentoMensal > 0 && cc.OrcamentoMensalUsado > cc.OrcamentoMensal:
			status = "over_limit"
			costCentersOverLimit++
		case cc.AlertaLimite && usagePct >= 90:
			status = "alert"
			costCentersAlert++
		case cc.OrcamentoMensal <= 0:
			status = "no_budget"
		}
		ccSummary = append(ccSummary, gin.H{
			"id":                     cc.ID,
			"codigo":                 cc.Codigo,
			"nome":                   cc.Nome,
			"orcamento_mensal":       cc.OrcamentoMensal,
			"orcamento_mensal_usado": cc.OrcamentoMensalUsado,
			"uso_percentual":         usagePct,
			"status":                 status,
		})
		ccReports[cc.ID] = gin.H{
			"id":                  cc.ID,
			"codigo":              cc.Codigo,
			"nome":                cc.Nome,
			"orcamento_mensal":    cc.OrcamentoMensal,
			"orcamento_usado":     cc.OrcamentoMensalUsado,
			"solicitado_pendente": 0.0,
			"solicitado_aprovado": 0.0,
			"comprado_total":      0.0,
			"economia_total":      0.0,
		}
	}
	for _, r := range reqs {
		row, ok := ccReports[r.CentroCustoID]
		if !ok {
			continue
		}
		switch r.Status {
		case models.PRStatusPendente, models.PRStatusEmAprovacao, models.PRStatusAguardandoOrcamento:
			row["solicitado_pendente"] = row["solicitado_pendente"].(float64) + r.ValorEstimadoTotal
		case models.PRStatusAprovada, models.PRStatusConvertidaCotacao:
			row["solicitado_aprovado"] = row["solicitado_aprovado"].(float64) + r.ValorEstimadoTotal
		}
		ccReports[r.CentroCustoID] = row
	}
	supplierPerformance := make([]gin.H, 0, len(supplierAgg))
	for _, o := range orders {
		if o.Fornecedor == nil {
			continue
		}
		found := false
		for i := range supplierPerformance {
			if supplierPerformance[i]["id"].(uint) == o.FornecedorID {
				supplierPerformance[i]["total_pedidos"] = supplierPerformance[i]["total_pedidos"].(int) + 1
				supplierPerformance[i]["valor_total"] = supplierPerformance[i]["valor_total"].(float64) + o.ValorTotal
				if o.Status == models.POStatusRecebidoParcial || o.Status == models.POStatusRecebidoTotal {
					supplierPerformance[i]["pedidos_recebidos"] = supplierPerformance[i]["pedidos_recebidos"].(int) + 1
				}
				if o.Status == models.POStatusAberto || o.Status == models.POStatusEnviado || o.Status == models.POStatusAceito || o.Status == models.POStatusEmTransporte {
					supplierPerformance[i]["pedidos_ativos"] = supplierPerformance[i]["pedidos_ativos"].(int) + 1
				}
				if o.SLAStatus == "Entregue no prazo" || o.SLAStatus == "Dentro do prazo" {
					supplierPerformance[i]["pedidos_no_prazo"] = supplierPerformance[i]["pedidos_no_prazo"].(int) + 1
				}
				if o.SLAStatus == "Entregue em atraso" || o.SLAStatus == "Em atraso" {
					supplierPerformance[i]["pedidos_em_atraso"] = supplierPerformance[i]["pedidos_em_atraso"].(int) + 1
				}
				found = true
				break
			}
		}
		if !found {
			row := gin.H{
				"id":                o.FornecedorID,
				"nome":              o.Fornecedor.Nome,
				"total_pedidos":     1,
				"valor_total":       o.ValorTotal,
				"pedidos_recebidos": 0,
				"pedidos_ativos":    0,
				"pedidos_no_prazo":  0,
				"pedidos_em_atraso": 0,
				"ticket_medio":      0.0,
				"sla_percentual":    0.0,
			}
			if o.Status == models.POStatusRecebidoParcial || o.Status == models.POStatusRecebidoTotal {
				row["pedidos_recebidos"] = 1
			}
			if o.Status == models.POStatusAberto || o.Status == models.POStatusEnviado || o.Status == models.POStatusAceito || o.Status == models.POStatusEmTransporte {
				row["pedidos_ativos"] = 1
			}
			if o.SLAStatus == "Entregue no prazo" || o.SLAStatus == "Dentro do prazo" {
				row["pedidos_no_prazo"] = 1
			}
			if o.SLAStatus == "Entregue em atraso" || o.SLAStatus == "Em atraso" {
				row["pedidos_em_atraso"] = 1
			}
			supplierPerformance = append(supplierPerformance, row)
		}
	}
	for _, o := range orders {
		row, ok := ccReports[o.CentroCustoID]
		if !ok {
			continue
		}
		row["comprado_total"] = row["comprado_total"].(float64) + o.ValorTotal
		if o.EconomiaEstimada > 0 {
			row["economia_total"] = row["economia_total"].(float64) + o.EconomiaEstimada
		}
		ccReports[o.CentroCustoID] = row
	}
	costCenterReports := make([]gin.H, 0, len(ccReports))
	for _, row := range ccReports {
		costCenterReports = append(costCenterReports, row)
	}
	sort.Slice(costCenterReports, func(i, j int) bool {
		return costCenterReports[i]["comprado_total"].(float64) > costCenterReports[j]["comprado_total"].(float64)
	})
	for i := range supplierPerformance {
		totalPedidos := supplierPerformance[i]["total_pedidos"].(int)
		valorTotal := supplierPerformance[i]["valor_total"].(float64)
		if totalPedidos > 0 {
			supplierPerformance[i]["ticket_medio"] = valorTotal / float64(totalPedidos)
			supplierPerformance[i]["sla_percentual"] = float64(supplierPerformance[i]["pedidos_no_prazo"].(int)) / float64(totalPedidos) * 100
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"req_pending_count":       reqPending,
		"orders_active_count":     ordersActive,
		"low_stock_count":         lowStock,
		"requests_recent":         recentReq,
		"orders_recent":           recentOrders,
		"requested_total":         requestedTotal,
		"quoted_total":            quotedTotal,
		"ordered_total":           orderedTotal,
		"estimated_savings_total": estimatedSavingsTotal,
		"top_suppliers":           topSuppliers,
		"cost_center_reports":     costCenterReports,
		"supplier_performance":    supplierPerformance,
		"monthly_budget_total":    monthlyBudgetTotal,
		"monthly_budget_used":     monthlyBudgetUsed,
		"cost_centers_alert":      costCentersAlert,
		"cost_centers_over_limit": costCentersOverLimit,
		"cost_centers_summary":    ccSummary,
	})
}

func (h *ProcurementHandler) ExportCSV(c *gin.Context) {
	reportType := strings.TrimSpace(c.DefaultQuery("tipo", "dashboard"))
	reqs, _ := h.requestRepo.List("", 0, 10000)
	enrichRequests(reqs, h.loadApprovalLimits(c))
	orders, _ := h.orderRepo.List("", 0, 10000)
	enrichOrders(orders)
	stocks, _ := h.stockRepo.List()
	dashCtx, _ := h.ccRepo.List()

	var buf bytes.Buffer
	buf.WriteString("\xEF\xBB\xBF")
	writer := csv.NewWriter(&buf)
	writer.Comma = ';'

	write := func(row []string) bool {
		if err := writer.Write(row); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Falha ao gerar CSV"})
			return false
		}
		return true
	}

	switch reportType {
	case "solicitacoes":
		if !write([]string{"Numero", "Centro de Custo", "Justificativa", "Urgencia", "Status", "Valor Estimado", "Alcada Sugerida", "Situacao Orcamento", "Data Criacao"}) {
			return
		}
		for _, r := range reqs {
			ccName := ""
			if r.CentroCusto != nil {
				ccName = r.CentroCusto.Codigo + " - " + r.CentroCusto.Nome
			}
			if !write([]string{
				procurementSafeCSV(r.Numero),
				procurementSafeCSV(ccName),
				procurementSafeCSV(r.Justificativa),
				procurementSafeCSV(r.Urgencia),
				procurementSafeCSV(r.Status),
				procurementFloat(r.ValorEstimadoTotal),
				procurementSafeCSV(r.NivelAprovacaoSugerido),
				procurementSafeCSV(r.SituacaoOrcamentoCentro),
				r.DataCriacao.Format("02/01/2006 15:04"),
			}) {
				return
			}
		}
	case "pedidos":
		if !write([]string{"Numero", "Fornecedor", "Centro de Custo", "Valor Total", "Valor Solicitado", "Economia Estimada", "Status", "Data Emissao"}) {
			return
		}
		for _, o := range orders {
			supplier := ""
			if o.Fornecedor != nil {
				supplier = o.Fornecedor.Nome
			}
			ccName := ""
			if o.CentroCusto != nil {
				ccName = o.CentroCusto.Codigo + " - " + o.CentroCusto.Nome
			}
			if !write([]string{
				procurementSafeCSV(o.Numero),
				procurementSafeCSV(supplier),
				procurementSafeCSV(ccName),
				procurementFloat(o.ValorTotal),
				procurementFloat(o.RequestValorEstimadoTotal),
				procurementFloat(o.EconomiaEstimada),
				procurementSafeCSV(o.Status),
				o.DataEmissao.Format("02/01/2006"),
			}) {
				return
			}
		}
	case "estoque":
		if !write([]string{"Material", "Categoria", "Saldo", "Localizacao"}) {
			return
		}
		for _, s := range stocks {
			productName := ""
			categoryName := ""
			if s.Product != nil {
				productName = s.Product.Nome
				if s.Product.Categoria != nil {
					categoryName = s.Product.Categoria.Nome
				}
			}
			if !write([]string{
				procurementSafeCSV(productName),
				procurementSafeCSV(categoryName),
				procurementFloat(s.QuantidadeSaldo),
				procurementSafeCSV(func() string {
					if s.LocalizacaoAlmoxarifado == nil {
						return ""
					}
					return *s.LocalizacaoAlmoxarifado
				}()),
			}) {
				return
			}
		}
	default:
		if !write([]string{"Relatorio", "Valor"}) {
			return
		}
		requestedTotal := 0.0
		orderedTotal := 0.0
		for _, r := range reqs {
			requestedTotal += r.ValorEstimadoTotal
		}
		for _, o := range orders {
			orderedTotal += o.ValorTotal
		}
		monthlyBudgetTotal := 0.0
		monthlyBudgetUsed := 0.0
		for _, cc := range dashCtx {
			monthlyBudgetTotal += cc.OrcamentoMensal
			monthlyBudgetUsed += cc.OrcamentoMensalUsado
		}
		rows := [][]string{
			{"Total Solicitado", procurementFloat(requestedTotal)},
			{"Total Comprado", procurementFloat(orderedTotal)},
			{"Orcamento Mensal", procurementFloat(monthlyBudgetTotal)},
			{"Uso Orcamento Mensal", procurementFloat(monthlyBudgetUsed)},
			{"Itens em Estoque Baixo", strconv.Itoa(func() int {
				count := 0
				for _, s := range stocks {
					if s.QuantidadeSaldo < 5 {
						count++
					}
				}
				return count
			}())},
		}
		for _, row := range rows {
			if !write(row) {
				return
			}
		}
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Falha ao finalizar CSV"})
		return
	}

	filename := fmt.Sprintf("compras_%s_%s.csv", reportType, time.Now().Format("20060102_150405"))
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	c.Data(http.StatusOK, "text/csv; charset=utf-8", buf.Bytes())
}

// ---------- Categories ----------

func (h *ProcurementHandler) ListCategories(c *gin.Context) {
	items, err := h.categoryRepo.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *ProcurementHandler) CreateCategory(c *gin.Context) {
	var in struct {
		Nome      string `json:"nome"`
		Descricao string `json:"descricao"`
		Ativo     *bool  `json:"ativo"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if in.Nome == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nome é obrigatório"})
		return
	}
	cat := &models.PurchaseCategory{Nome: in.Nome, Ativo: true}
	if in.Descricao != "" {
		cat.Descricao = &in.Descricao
	}
	if in.Ativo != nil {
		cat.Ativo = *in.Ativo
	}
	if err := h.categoryRepo.Create(cat); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Já existe uma categoria com este nome"})
		return
	}
	c.JSON(http.StatusCreated, cat)
}

func (h *ProcurementHandler) UpdateCategory(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	cat, err := h.categoryRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Categoria não encontrada"})
		return
	}
	var in struct {
		Nome      string `json:"nome"`
		Descricao string `json:"descricao"`
		Ativo     *bool  `json:"ativo"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(in.Nome) != "" {
		cat.Nome = strings.TrimSpace(in.Nome)
	}
	if in.Descricao != "" {
		cat.Descricao = &in.Descricao
	}
	if in.Ativo != nil {
		cat.Ativo = *in.Ativo
	}
	if err := h.categoryRepo.Update(cat); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Não foi possível atualizar a categoria"})
		return
	}
	c.JSON(http.StatusOK, cat)
}

func (h *ProcurementHandler) DeleteCategory(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	if _, err := h.categoryRepo.GetByID(uint(id)); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Categoria não encontrada"})
		return
	}
	hasProducts, err := h.categoryRepo.HasProducts(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if hasProducts {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Não é possível excluir esta categoria porque já existem produtos vinculados a ela."})
		return
	}
	if err := h.categoryRepo.Delete(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Categoria excluída"})
}

// ---------- Products ----------

func (h *ProcurementHandler) ListProducts(c *gin.Context) {
	skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	items, err := h.productRepo.List(skip, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

type productInput struct {
	Codigo      string `json:"codigo"`
	Nome        string `json:"nome"`
	CategoriaID uint   `json:"categoria_id"`
	Unidade     string `json:"unidade"`
	Tipo        string `json:"tipo"`
	Marca       string `json:"marca"`
	Modelo      string `json:"modelo"`
	Fabricante  string `json:"fabricante"`
	Descricao   string `json:"descricao"`
	Ativo       *bool  `json:"ativo"`
}

func (h *ProcurementHandler) CreateProduct(c *gin.Context) {
	var in productInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if in.Codigo == "" || in.Nome == "" || in.CategoriaID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Código, nome e categoria são obrigatórios"})
		return
	}
	if _, err := h.productRepo.GetByCodigo(in.Codigo); err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Código de produto já cadastrado"})
		return
	}
	prod := &models.PurchaseProduct{
		Codigo:      in.Codigo,
		Nome:        in.Nome,
		CategoriaID: in.CategoriaID,
		Unidade:     "UN",
		Tipo:        normalizeEnumValue(in.Tipo, []string{models.ProductTypeProduto, models.ProductTypeServico, models.ProductTypeLicenca, models.ProductTypeAssinatura, models.ProductTypeEquipamento, models.ProductTypeMaterialConsumo}, models.ProductTypeProduto),
		Ativo:       true,
	}
	if in.Unidade != "" {
		prod.Unidade = in.Unidade
	}
	if in.Marca != "" {
		prod.Marca = &in.Marca
	}
	if in.Modelo != "" {
		prod.Modelo = &in.Modelo
	}
	if in.Fabricante != "" {
		prod.Fabricante = &in.Fabricante
	}
	if in.Descricao != "" {
		prod.Descricao = &in.Descricao
	}
	if in.Ativo != nil {
		prod.Ativo = *in.Ativo
	}
	if err := h.productRepo.Create(prod); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, prod)
}

func (h *ProcurementHandler) UpdateProduct(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	prod, err := h.productRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Produto não encontrado"})
		return
	}
	var in productInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(in.Codigo) != "" && strings.TrimSpace(in.Codigo) != prod.Codigo {
		if existing, err := h.productRepo.GetByCodigo(strings.TrimSpace(in.Codigo)); err == nil && existing.ID != prod.ID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Código de produto já cadastrado"})
			return
		}
		prod.Codigo = strings.TrimSpace(in.Codigo)
	}
	if strings.TrimSpace(in.Nome) != "" {
		prod.Nome = strings.TrimSpace(in.Nome)
	}
	if in.CategoriaID != 0 {
		prod.CategoriaID = in.CategoriaID
	}
	if strings.TrimSpace(in.Unidade) != "" {
		prod.Unidade = strings.TrimSpace(in.Unidade)
	}
	if strings.TrimSpace(in.Tipo) != "" {
		prod.Tipo = normalizeEnumValue(in.Tipo, []string{models.ProductTypeProduto, models.ProductTypeServico, models.ProductTypeLicenca, models.ProductTypeAssinatura, models.ProductTypeEquipamento, models.ProductTypeMaterialConsumo}, prod.Tipo)
	}
	if in.Marca != "" {
		prod.Marca = &in.Marca
	}
	if in.Modelo != "" {
		prod.Modelo = &in.Modelo
	}
	if in.Fabricante != "" {
		prod.Fabricante = &in.Fabricante
	}
	if in.Descricao != "" {
		prod.Descricao = &in.Descricao
	}
	if in.Ativo != nil {
		prod.Ativo = *in.Ativo
	}
	if err := h.productRepo.Update(prod); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Não foi possível atualizar o produto"})
		return
	}
	updated, _ := h.productRepo.GetByID(prod.ID)
	c.JSON(http.StatusOK, updated)
}

func (h *ProcurementHandler) DeleteProduct(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	if _, err := h.productRepo.GetByID(uint(id)); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Produto não encontrado"})
		return
	}
	hasLinks, err := h.productRepo.HasLinkedRecords(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if hasLinks {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Não é possível excluir este produto porque ele já está vinculado a solicitações, pedidos, cotações ou estoque."})
		return
	}
	if err := h.productRepo.Delete(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Produto excluído"})
}

// ---------- Cost Centers ----------

func (h *ProcurementHandler) ListCostCenters(c *gin.Context) {
	items, err := h.ccRepo.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

type costCenterInput struct {
	Codigo          string  `json:"codigo"`
	Nome            string  `json:"nome"`
	DepartamentoID  *uint   `json:"departamento_id"`
	ResponsavelID   *uint   `json:"responsavel_id"`
	OrcamentoMensal float64 `json:"orcamento_mensal"`
	OrcamentoAnual  float64 `json:"orcamento_anual"`
	AlertaLimite    *bool   `json:"alerta_limite"`
	BloquearLimite  *bool   `json:"bloquear_limite"`
}

func (h *ProcurementHandler) CreateCostCenter(c *gin.Context) {
	var in costCenterInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if in.Codigo == "" || in.Nome == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Código e nome são obrigatórios"})
		return
	}
	cc := &models.CostCenter{
		Codigo:               in.Codigo,
		Nome:                 in.Nome,
		DepartamentoID:       in.DepartamentoID,
		ResponsavelID:        in.ResponsavelID,
		OrcamentoMensal:      in.OrcamentoMensal,
		OrcamentoAnual:       in.OrcamentoAnual,
		AlertaLimite:         true,
		BloquearLimite:       false,
		OrcamentoMensalUsado: 0,
		OrcamentoAnualUsado:  0,
	}
	if in.AlertaLimite != nil {
		cc.AlertaLimite = *in.AlertaLimite
	}
	if in.BloquearLimite != nil {
		cc.BloquearLimite = *in.BloquearLimite
	}
	if err := h.ccRepo.Create(cc); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Já existe um centro de custo com este código"})
		return
	}
	c.JSON(http.StatusCreated, cc)
}

func (h *ProcurementHandler) UpdateCostCenter(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	cc, err := h.ccRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Centro de custo não encontrado"})
		return
	}
	var in costCenterInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if in.Nome != "" {
		cc.Nome = in.Nome
	}
	cc.DepartamentoID = in.DepartamentoID
	cc.ResponsavelID = in.ResponsavelID
	cc.OrcamentoMensal = in.OrcamentoMensal
	cc.OrcamentoAnual = in.OrcamentoAnual
	if in.AlertaLimite != nil {
		cc.AlertaLimite = *in.AlertaLimite
	}
	if in.BloquearLimite != nil {
		cc.BloquearLimite = *in.BloquearLimite
	}
	if err := h.ccRepo.Update(cc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cc)
}

func (h *ProcurementHandler) DeleteCostCenter(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	if _, err := h.ccRepo.GetByID(uint(id)); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Centro de custo não encontrado"})
		return
	}
	has, _ := h.ccRepo.HasRequests(uint(id))
	if has {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Não é possível excluir este Centro de Custo pois existem solicitações de compra vinculadas a ele."})
		return
	}
	if err := h.ccRepo.Delete(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Centro de custo excluído"})
}

// ---------- Purchase Requests ----------

func (h *ProcurementHandler) ListRequests(c *gin.Context) {
	status := c.Query("status")
	skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	items, err := h.requestRepo.List(status, skip, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	enrichRequests(items, h.loadApprovalLimits(c))
	c.JSON(http.StatusOK, items)
}

type requestItemInput struct {
	ProductID            uint    `json:"product_id"`
	Quantidade           float64 `json:"quantidade"`
	ValorEstimado        float64 `json:"valor_estimado"`
	FornecedorSugeridoID *uint   `json:"fornecedor_sugerido_id"`
	Observacao           string  `json:"observacao"`
}

type requestInput struct {
	CentroCustoID  uint               `json:"centro_custo_id"`
	Justificativa  string             `json:"justificativa"`
	Urgencia       string             `json:"urgencia"`
	DataNecessaria string             `json:"data_necessaria"`
	Itens          []requestItemInput `json:"itens"`
}

func (h *ProcurementHandler) CreateRequest(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	var in requestInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if in.CentroCustoID == 0 || in.Justificativa == "" || len(in.Itens) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Centro de custo, justificativa e ao menos um item são obrigatórios"})
		return
	}
	cc, err := h.ccRepo.GetByID(in.CentroCustoID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Centro de Custo não encontrado"})
		return
	}

	var estimatedTotal float64
	for _, it := range in.Itens {
		estimatedTotal += it.Quantidade * it.ValorEstimado
	}

	status := models.PRStatusPendente
	if cc.BloquearLimite && (cc.OrcamentoMensalUsado+estimatedTotal > cc.OrcamentoMensal) {
		status = models.PRStatusAguardandoOrcamento
	}

	num, err := h.requestRepo.GenerateRequestNumber(time.Now())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	deptID := uint(1)
	if user.DepartamentoID != nil {
		deptID = *user.DepartamentoID
	}

	req := &models.PurchaseRequest{
		Numero:         num,
		SolicitanteID:  user.ID,
		DepartamentoID: deptID,
		CentroCustoID:  in.CentroCustoID,
		Justificativa:  in.Justificativa,
		Urgencia:       normalizeEnumValue(in.Urgencia, []string{models.UrgencyBaixa, models.UrgencyMedia, models.UrgencyAlta, models.UrgencyUrgente}, models.UrgencyMedia),
		Status:         status,
		DataCriacao:    time.Now(),
	}
	if in.DataNecessaria != "" {
		req.DataNecessaria = parseProcDate(in.DataNecessaria)
	}
	for _, it := range in.Itens {
		item := models.PurchaseRequestItem{
			ProductID:            it.ProductID,
			Quantidade:           it.Quantidade,
			ValorEstimado:        it.ValorEstimado,
			FornecedorSugeridoID: it.FornecedorSugeridoID,
		}
		if it.Observacao != "" {
			item.Observacao = &it.Observacao
		}
		req.Itens = append(req.Itens, item)
	}
	if err := h.requestRepo.Create(req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.logHistory("purchase_requests", req.ID, user.ID, "Solicitação de Compra Criada")
	h.notifyStaff(fmt.Sprintf("Nova Solicitação de Compra %s criada por %s. Valor estimado: R$ %.2f.", req.Numero, user.Nome, estimatedTotal))
	c.JSON(http.StatusCreated, req)
}

func (h *ProcurementHandler) GetRequest(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	req, err := h.requestRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Solicitação não encontrada"})
		return
	}
	enrichRequest(req, h.loadApprovalLimits(c))
	c.JSON(http.StatusOK, req)
}

func (h *ProcurementHandler) DecideRequest(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	req, err := h.requestRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Solicitação não encontrada"})
		return
	}
	var in struct {
		Nivel      string `json:"nivel"`
		Decisao    string `json:"decisao"` // Aprovado / Reprovado
		Observacao string `json:"observacao"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	total := calcRequestEstimatedTotal(req)
	requiredLevel := suggestedApprovalLevel(total, req.Urgencia, h.loadApprovalLimits(c))
	if strings.TrimSpace(in.Nivel) == "" {
		in.Nivel = requiredLevel
	}
	if !canApproveLevel(user.Role, in.Nivel) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Não autorizado a decidir este nível de solicitação"})
		return
	}

	now := time.Now()
	approval := &models.PurchaseApproval{
		RequestID:   req.ID,
		Nivel:       in.Nivel,
		AprovadorID: &user.ID,
		Status:      in.Decisao,
		DataDecisao: &now,
	}
	if in.Observacao != "" {
		approval.Observacao = &in.Observacao
	}
	_ = h.approvalRepo.Create(approval)

	if in.Decisao == models.ApprovalReprovado {
		req.Status = models.PRStatusReprovada
	} else if approvalLevelRank(in.Nivel) >= approvalLevelRank(requiredLevel) {
		req.Status = models.PRStatusAprovada
		// Auto update cost center budget used
		if cc, err := h.ccRepo.GetByID(req.CentroCustoID); err == nil && cc != nil {
			cc.OrcamentoMensalUsado += total
			cc.OrcamentoAnualUsado += total
			_ = h.ccRepo.Update(cc)
		}
	} else {
		req.Status = models.PRStatusEmAprovacao
	}
	if err := h.requestRepo.Update(req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.logHistory("purchase_requests", req.ID, user.ID, fmt.Sprintf("Decisão de %s: %s", in.Nivel, in.Decisao))
	h.broadcastKanbanRequestUpdate(req, nil, fmt.Sprintf("Solicitação de compra %s atualizada para %s.", req.Numero, req.Status))
	c.JSON(http.StatusOK, req)
}

func (h *ProcurementHandler) CancelRequest(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	req, err := h.requestRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Solicitação não encontrada"})
		return
	}

	// Verify authorization: solicitante, staff/admin/gerente/tecnico, or comprador
	if req.SolicitanteID != user.ID && !isStaff(user.Role) && user.Role != models.RoleComprador {
		c.JSON(http.StatusForbidden, gin.H{"error": "Sem permissão para cancelar esta solicitação"})
		return
	}

	if req.Status == models.PRStatusCancelada {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Solicitação já está cancelada"})
		return
	}

	var in struct {
		Motivo string `json:"motivo"`
	}
	_ = c.ShouldBindJSON(&in)

	motivo := strings.TrimSpace(in.Motivo)
	if motivo == "" {
		motivo = "Cancelado pelo solicitante/técnico responsável"
	}

	req.Status = models.PRStatusCancelada
	if err := h.requestRepo.Update(req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.logHistory("purchase_requests", req.ID, user.ID, fmt.Sprintf("Cancelou a solicitação de compra. Motivo: %s", motivo))
	h.broadcastKanbanRequestUpdate(req, nil, fmt.Sprintf("Solicitação de compra %s foi cancelada (%s).", req.Numero, motivo))

	// Notify requester or buyers
	msg := fmt.Sprintf("A solicitação de compra %s foi cancelada por %s. Motivo: %s", req.Numero, user.Nome, motivo)
	linkRedir := fmt.Sprintf("/compras?tab=solicitacoes&id=%d", req.ID)
	_ = h.notifRepo.Create(&models.PurchaseNotification{
		UserID:               req.SolicitanteID,
		Mensagem:             msg,
		LinkRedirecionamento: &linkRedir,
		DataCriacao:          time.Now(),
	})

	c.JSON(http.StatusOK, req)
}

func (h *ProcurementHandler) ReleaseBudget(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	req, err := h.requestRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Solicitação não encontrada"})
		return
	}
	if !procurementAdmin(user) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Não autorizado a liberar orçamento"})
		return
	}
	total := calcRequestEstimatedTotal(req)
	requiredLevel := suggestedApprovalLevel(total, req.Urgencia, h.loadApprovalLimits(c))
	highestApprovedRank := 0
	for _, approval := range req.Approvals {
		if approval.Status == models.ApprovalAprovado {
			if rank := approvalLevelRank(approval.Nivel); rank > highestApprovedRank {
				highestApprovedRank = rank
			}
		}
	}
	switch {
	case highestApprovedRank >= approvalLevelRank(requiredLevel):
		req.Status = models.PRStatusAprovada
	case len(req.Approvals) > 0:
		req.Status = models.PRStatusEmAprovacao
	default:
		req.Status = models.PRStatusPendente
	}
	if err := h.requestRepo.Update(req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.logHistory("purchase_requests", req.ID, user.ID, "Orçamento Liberado pelo Administrador")
	h.broadcastKanbanRequestUpdate(req, nil, fmt.Sprintf("Solicitação de compra %s atualizada para %s.", req.Numero, req.Status))
	c.JSON(http.StatusOK, req)
}

// ---------- Quotations ----------

func (h *ProcurementHandler) ListQuotations(c *gin.Context) {
	items, err := h.quotationRepo.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

type quotationItemInput struct {
	ProductID     uint    `json:"product_id"`
	Quantidade    float64 `json:"quantidade"`
	ValorUnitario float64 `json:"valor_unitario"`
}

type quotationSupplierInput struct {
	FornecedorID     uint                 `json:"fornecedor_id"`
	Frete            float64              `json:"frete"`
	PrazoEntregaDias int                  `json:"prazo_entrega_dias"`
	GarantiaMeses    int                  `json:"garantia_meses"`
	FormaPagamento   string               `json:"forma_pagamento"`
	Observacoes      string               `json:"observacoes"`
	Itens            []quotationItemInput `json:"itens"`
}

type quotationInput struct {
	RequestID uint                     `json:"request_id"`
	Suppliers []quotationSupplierInput `json:"suppliers"`
}

func (h *ProcurementHandler) CreateQuotation(c *gin.Context) {
	var in quotationInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req, err := h.requestRepo.GetByID(in.RequestID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Solicitação não encontrada"})
		return
	}
	if req.Status != models.PRStatusAprovada || len(in.Suppliers) < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "A cotação exige uma solicitação aprovada e ao menos um fornecedor"})
		return
	}
	num, err := h.quotationRepo.GenerateQuotationNumber(time.Now())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	quotation := &models.PurchaseQuotation{
		Numero:      num,
		RequestID:   in.RequestID,
		Status:      models.QuotationEmCotacao,
		DataCriacao: time.Now(),
	}
	for _, s := range in.Suppliers {
		var total float64
		supplier := models.PurchaseQuotationSupplier{
			FornecedorID:     s.FornecedorID,
			Frete:            s.Frete,
			PrazoEntregaDias: s.PrazoEntregaDias,
			GarantiaMeses:    s.GarantiaMeses,
		}
		if s.FormaPagamento != "" {
			supplier.FormaPagamento = &s.FormaPagamento
		}
		if s.Observacoes != "" {
			supplier.Observacoes = &s.Observacoes
		}
		for _, it := range s.Itens {
			supplier.Itens = append(supplier.Itens, models.PurchaseQuotationItem{
				ProductID:     it.ProductID,
				Quantidade:    it.Quantidade,
				ValorUnitario: it.ValorUnitario,
			})
			total += it.ValorUnitario * it.Quantidade
		}
		total += s.Frete
		supplier.ValorTotal = total
		quotation.Suppliers = append(quotation.Suppliers, supplier)
	}
	if err := h.quotationRepo.Create(quotation); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// Update request status to "Convertida em cotação"
	req.Status = models.PRStatusConvertidaCotacao
	_ = h.requestRepo.Update(req)
	h.broadcastKanbanRequestUpdate(req, nil, fmt.Sprintf("Solicitação de compra %s atualizada para %s.", req.Numero, req.Status))

	c.JSON(http.StatusCreated, quotation)
}

func (h *ProcurementHandler) GetQuotation(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	quotation, err := h.quotationRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Cotação não encontrada"})
		return
	}
	// Comparison winners (cheapest / fastest / best value)
	var cheapestID, fastestID, bestValueID *uint
	if len(quotation.Suppliers) > 0 {
		cheapest := quotation.Suppliers[0]
		fastest := quotation.Suppliers[0]
		bestValue := quotation.Suppliers[0]
		bestScore := 0.0
		for i := range quotation.Suppliers {
			s := &quotation.Suppliers[i]
			if s.ValorTotal < cheapest.ValorTotal {
				cheapest = *s
			}
			if s.PrazoEntregaDias < fastest.PrazoEntregaDias {
				fastest = *s
			}
			score := s.ValorTotal*0.7 + float64(s.PrazoEntregaDias)*50*0.3
			if i == 0 || score < bestScore {
				bestScore = score
				bestValue = *s
			}
		}
		cheapestID = &cheapest.ID
		fastestID = &fastest.ID
		bestValueID = &bestValue.ID
	}
	c.JSON(http.StatusOK, gin.H{
		"quotation":     quotation,
		"cheapest_id":   cheapestID,
		"fastest_id":    fastestID,
		"best_value_id": bestValueID,
	})
}

func (h *ProcurementHandler) SelectWinner(c *gin.Context) {
	quotationID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	var in struct {
		WinnerSupplierID uint `json:"winner_supplier_id"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if exists, err := h.orderRepo.ExistsForQuotation(uint(quotationID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	} else if exists {
		c.JSON(http.StatusConflict, gin.H{"error": "Esta cotação já possui um pedido de compra emitido"})
		return
	}
	winner, err := h.quotationRepo.GetSupplierByID(in.WinnerSupplierID)
	if err != nil || winner.QuotationID != uint(quotationID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Fornecedor cotado não encontrado"})
		return
	}
	winner.Escolhido = true
	_ = h.quotationRepo.UpdateSupplier(winner)

	quotation, err := h.quotationRepo.GetByID(uint(quotationID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Cotação não encontrada"})
		return
	}
	if quotation.Status != models.QuotationEmCotacao {
		c.JSON(http.StatusBadRequest, gin.H{"error": "A cotação não está disponível para seleção"})
		return
	}
	quotation.Status = models.QuotationFinalizada
	_ = h.quotationRepo.Update(quotation)

	centroCustoID := uint(1)
	if req, err := h.requestRepo.GetByID(quotation.RequestID); err == nil && req != nil {
		centroCustoID = req.CentroCustoID
	}

	num, err := h.orderRepo.GenerateOrderNumber(time.Now())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	order := &models.PurchaseOrder{
		Numero:        num,
		FornecedorID:  winner.FornecedorID,
		CentroCustoID: centroCustoID,
		RequestID:     &quotation.RequestID,
		QuotationID:   &quotation.ID,
		ValorTotal:    winner.ValorTotal,
		Frete:         winner.Frete,
		Status:        models.POStatusAberto,
		DataEmissao:   time.Now(),
	}
	for _, it := range winner.Itens {
		order.Itens = append(order.Itens, models.PurchaseOrderItem{
			ProductID:     it.ProductID,
			Quantidade:    it.Quantidade,
			ValorUnitario: it.ValorUnitario,
			TotalItem:     it.Quantidade * it.ValorUnitario,
		})
	}
	if err := h.orderRepo.Create(order); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.notifyStaff(fmt.Sprintf("Pedido de Compra %s emitido (fornecedor #%d). Valor total: R$ %.2f.", order.Numero, winner.FornecedorID, winner.ValorTotal))
	c.JSON(http.StatusCreated, order)
}

// ---------- Purchase Orders ----------

func (h *ProcurementHandler) ListOrders(c *gin.Context) {
	status := c.Query("status")
	skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	items, err := h.orderRepo.List(status, skip, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	enrichOrders(items)
	c.JSON(http.StatusOK, items)
}

type orderItemInput struct {
	ProductID     uint    `json:"product_id"`
	Quantidade    float64 `json:"quantidade"`
	ValorUnitario float64 `json:"valor_unitario"`
}

type purchaseOrderInput struct {
	FornecedorID  uint             `json:"fornecedor_id"`
	CentroCustoID uint             `json:"centro_custo_id"`
	RequestID     *uint            `json:"request_id"`
	QuotationID   *uint            `json:"quotation_id"`
	Desconto      float64          `json:"desconto"`
	IPI           float64          `json:"ipi"`
	ICMS          float64          `json:"icms"`
	Frete         float64          `json:"frete"`
	Itens         []orderItemInput `json:"itens"`
}

func (h *ProcurementHandler) CreateOrder(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	var in purchaseOrderInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if in.FornecedorID == 0 || in.CentroCustoID == 0 || len(in.Itens) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Fornecedor, centro de custo e ao menos um item são obrigatórios"})
		return
	}
	if in.QuotationID != nil {
		if exists, err := h.orderRepo.ExistsForQuotation(*in.QuotationID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		} else if exists {
			c.JSON(http.StatusConflict, gin.H{"error": "Esta cotação já possui um pedido de compra emitido"})
			return
		}
	}
	var total float64
	for _, it := range in.Itens {
		total += it.Quantidade * it.ValorUnitario
	}
	total = total + in.Frete + in.IPI + in.ICMS - in.Desconto

	num, err := h.orderRepo.GenerateOrderNumber(time.Now())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	order := &models.PurchaseOrder{
		Numero:        num,
		FornecedorID:  in.FornecedorID,
		CentroCustoID: in.CentroCustoID,
		RequestID:     in.RequestID,
		QuotationID:   in.QuotationID,
		ValorTotal:    total,
		Desconto:      in.Desconto,
		IPI:           in.IPI,
		ICMS:          in.ICMS,
		Frete:         in.Frete,
		Status:        models.POStatusAberto,
		DataEmissao:   time.Now(),
	}
	for _, it := range in.Itens {
		order.Itens = append(order.Itens, models.PurchaseOrderItem{
			ProductID:     it.ProductID,
			Quantidade:    it.Quantidade,
			ValorUnitario: it.ValorUnitario,
			TotalItem:     it.Quantidade * it.ValorUnitario,
		})
	}
	if err := h.orderRepo.Create(order); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.logHistory("purchase_orders", order.ID, user.ID, "Pedido Emitido")
	c.JSON(http.StatusCreated, order)
}

func (h *ProcurementHandler) GetOrder(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	order, err := h.orderRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pedido não encontrado"})
		return
	}
	enrichOrder(order)
	c.JSON(http.StatusOK, order)
}

func (h *ProcurementHandler) UpdateOrderStatus(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	orderID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	order, err := h.orderRepo.GetByID(uint(orderID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pedido não encontrado"})
		return
	}
	var in struct {
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	next := normalizeOrderStatus(in.Status)
	if next == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Status do pedido inválido"})
		return
	}
	if !canTransitionOrderStatus(order.Status, next) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Transição de status não permitida para este pedido"})
		return
	}
	order.Status = next
	if err := h.orderRepo.Update(order); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.logHistory("purchase_orders", order.ID, user.ID, fmt.Sprintf("Status do pedido alterado para %s", next))
	c.JSON(http.StatusOK, order)
}

func (h *ProcurementHandler) ReconcileOrderInventory(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	orderID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	order, err := h.orderRepo.GetByID(uint(orderID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pedido não encontrado"})
		return
	}

	err = h.stockRepo.VerifyAndSyncOrderInventory(order.ID, order.Numero, order.Receivings, user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Reconciliação concluída com sucesso"})
}

// ---------- Receiving ----------

type receivingItemInput struct {
	ProductID          uint    `json:"product_id"`
	QuantidadeRecebida float64 `json:"quantidade_recebida"`
	Divergencias       string  `json:"divergencias"`
}

type receivingInput struct {
	NotaFiscalID           *uint                `json:"nota_fiscal_id"`
	Observacoes            string               `json:"observacoes"`
	CurrentLocalID         *uint                `json:"current_local_id"`
	CurrentArmazenamentoID *uint                `json:"current_armazenamento_id"`
	Itens                  []receivingItemInput `json:"itens"`
}

func (h *ProcurementHandler) ReceiveOrder(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	orderID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	order, err := h.orderRepo.GetByID(uint(orderID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pedido não encontrado"})
		return
	}
	var in receivingInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(in.Itens) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Informe ao menos um item recebido"})
		return
	}
	if in.NotaFiscalID != nil {
		invoice, err := h.invoiceRepo.GetByID(*in.NotaFiscalID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Nota fiscal não encontrada"})
			return
		}
		if invoice.FornecedorID != order.FornecedorID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "A nota fiscal selecionada não pertence ao fornecedor deste pedido"})
			return
		}
	}
	ordered := make(map[uint]float64)
	for _, item := range order.Itens {
		ordered[item.ProductID] += item.Quantidade
	}
	for _, item := range in.Itens {
		if item.ProductID == 0 || item.QuantidadeRecebida <= 0 || ordered[item.ProductID] == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Item de recebimento não pertence ao pedido ou possui quantidade inválida"})
			return
		}
		received, err := h.receivingRepo.ReceivedQuantity(order.ID, item.ProductID)
		if err != nil || received+item.QuantidadeRecebida > ordered[item.ProductID] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Quantidade recebida excede o saldo pendente do pedido"})
			return
		}
	}

	receiving := &models.PurchaseReceiving{
		OrderID:         order.ID,
		ResponsavelID:   user.ID,
		NotaFiscalID:    in.NotaFiscalID,
		DataRecebimento: time.Now(),
	}
	if in.Observacoes != "" {
		receiving.Observacoes = &in.Observacoes
	}
	for _, it := range in.Itens {
		item := models.PurchaseReceivingItem{
			ProductID:          it.ProductID,
			QuantidadeRecebida: it.QuantidadeRecebida,
		}
		if it.Divergencias != "" {
			item.Divergencias = &it.Divergencias
		}
		receiving.Itens = append(receiving.Itens, item)
	}
	if err := h.receivingRepo.Create(receiving); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Trigger asset creation & stock addition
	createdAssets := h.convertReceivingToAssets(receiving, order, user.ID, in.CurrentLocalID, in.CurrentArmazenamentoID)

	fullyReceived := true
	for productID, quantity := range ordered {
		received, _ := h.receivingRepo.ReceivedQuantity(order.ID, productID)
		if received < quantity {
			fullyReceived = false
			break
		}
	}
	if fullyReceived {
		order.Status = models.POStatusRecebidoTotal
	} else {
		order.Status = models.POStatusRecebidoParcial
	}
	_ = h.orderRepo.Update(order)

	// Perform verification step to ensure inventory consistency
	if order.Status == models.POStatusRecebidoTotal {
		if updatedOrder, err := h.orderRepo.GetByID(order.ID); err == nil && updatedOrder != nil {
			_ = h.stockRepo.VerifyAndSyncOrderInventory(updatedOrder.ID, updatedOrder.Numero, updatedOrder.Receivings, user.ID)
		}
	}

	h.logHistory("purchase_receivings", receiving.ID, user.ID, "Recebimento Registrado")

	c.JSON(http.StatusCreated, gin.H{"receiving": receiving, "created_assets": createdAssets})
}

// convertReceivingToAssets creates assets for equipment items and adds stock for consumable items.
func (h *ProcurementHandler) convertReceivingToAssets(
	receiving *models.PurchaseReceiving, order *models.PurchaseOrder, userID uint, localID, armazenamentoID *uint,
) []models.Asset {
	var created []models.Asset
	// Sequential patrimonio tag based on existing asset count.
	allAssets, err := h.assetRepo.List(0, 100000, "")
	currentCount := 0
	if err == nil {
		currentCount = len(allAssets)
	}
	year := time.Now().Year()
	for i := range receiving.Itens {
		item := &receiving.Itens[i]
		if item.ProductID == 0 {
			continue
		}
		product, err := h.productRepo.GetByID(item.ProductID)
		if err != nil {
			continue
		}
		if product.Tipo == models.ProductTypeEquipamento {
			qty := int(item.QuantidadeRecebida)
			if qty <= 0 {
				qty = 1
			}
			var lastAssetID uint
			for q := 0; q < qty; q++ {
				currentCount++
				patrimonio := fmt.Sprintf("PAT-%d-%04d", year, currentCount)
				valor := 0.0
				if len(order.Itens) > 0 {
					valor = order.ValorTotal / float64(len(order.Itens))
				}

				// Unique serial number by appending index if multiple items
				numeroSerie := product.Codigo
				if qty > 1 {
					numeroSerie = fmt.Sprintf("%s-%d", product.Codigo, q+1)
				}

				asset := models.Asset{
					Nome:                   product.Nome,
					EPatrimonio:            patrimonio,
					Modelo:                 product.Modelo,
					DataAquisicao:          timePtr(time.Now()),
					Valor:                  &valor,
					Status:                 models.AssetStatusArmazenado,
					NumeroSerie:            &numeroSerie,
					FornecedorID:           &order.FornecedorID,
					NotaFiscalID:           receiving.NotaFiscalID,
					CreatedByID:            &userID,
					CurrentLocalID:         localID,
					CurrentArmazenamentoID: armazenamentoID,
				}
				desc := fmt.Sprintf("Criado automaticamente pelo recebimento do Pedido %s", order.Numero)
				asset.Descricao = &desc
				if cc, err := h.ccRepo.GetByID(order.CentroCustoID); err == nil && cc != nil {
					asset.CurrentDepartamentoID = cc.DepartamentoID
				}
				if err := h.assetRepo.Create(&asset); err == nil {
					lastAssetID = asset.ID
					created = append(created, asset)
				}
			}
			if lastAssetID != 0 {
				item.AtivoCriadoID = &lastAssetID
			}
		} else if product.Tipo == models.ProductTypeMaterialConsumo || product.Tipo == models.ProductTypeProduto {
			_, _ = h.stockRepo.CreateOrUpdate(
				item.ProductID, item.QuantidadeRecebida, models.StockEntrada, userID,
				fmt.Sprintf("Entrada por Recebimento %d do Pedido %s", receiving.ID, order.Numero),
				"purchase_receivings", &receiving.ID,
			)
			item.EstoqueAtualizado = true
		}
	}
	return created
}

func timePtr(t time.Time) *time.Time { return &t }

// ---------- Stock ----------

func (h *ProcurementHandler) ListStock(c *gin.Context) {
	items, err := h.stockRepo.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *ProcurementHandler) ListStockTransactions(c *gin.Context) {
	productID, _ := strconv.ParseUint(c.DefaultQuery("product_id", "0"), 10, 32)
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	items, err := h.stockRepo.ListTransactions(uint(productID), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *ProcurementHandler) ConsumeStock(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	var in struct {
		StockID        uint    `json:"stock_id"`
		QuantidadeUsar float64 `json:"quantidade_usar"`
		Justificativa  string  `json:"justificativa"`
		CentroCustoID  *uint   `json:"centro_custo_id"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if in.StockID == 0 || in.QuantidadeUsar <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Informe o item de estoque e uma quantidade válida"})
		return
	}
	stock, err := h.stockRepo.GetByID(in.StockID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Item de estoque não encontrado"})
		return
	}
	if stock.QuantidadeSaldo < in.QuantidadeUsar {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Quantidade solicitada maior que o saldo disponível"})
		return
	}
	justificativa := strings.TrimSpace(in.Justificativa)
	if justificativa == "" {
		justificativa = "Consumo manual de estoque"
	}
	if in.CentroCustoID != nil && *in.CentroCustoID > 0 {
		if cc, err := h.ccRepo.GetByID(*in.CentroCustoID); err == nil && cc != nil {
			justificativa = fmt.Sprintf("%s | Centro de Custo: %s - %s", justificativa, cc.Codigo, cc.Nome)
		}
	}
	updated, err := h.stockRepo.CreateOrUpdate(
		stock.ProductID, in.QuantidadeUsar, models.StockSaida, user.ID,
		justificativa, "manual_stock_consumption", nil,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	prodName := "Material"
	if stock.Product != nil {
		prodName = stock.Product.Nome
	}
	h.logHistory("material_stock_transactions", stock.ID, user.ID, fmt.Sprintf("Baixa manual de estoque: %.2f UN de %s", in.QuantidadeUsar, prodName))
	c.JSON(http.StatusOK, gin.H{"stock": updated, "message": "Consumo de estoque registrado com sucesso"})
}

// ---------- Contracts ----------

func (h *ProcurementHandler) ListContracts(c *gin.Context) {
	items, err := h.contractRepo.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

type contractInput struct {
	FornecedorID        uint    `json:"fornecedor_id"`
	Tipo                string  `json:"tipo"`
	TipoID              *uint   `json:"tipo_id"`
	Numero              string  `json:"numero"`
	DataInicio          string  `json:"data_inicio"`
	DataFim             string  `json:"data_fim"`
	RenovacaoAutomatica bool    `json:"renovacao_automatica"`
	Valor               float64 `json:"valor"`
	Periodicidade       string  `json:"periodicidade"`
}

func (h *ProcurementHandler) CreateContract(c *gin.Context) {
	var in contractInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if in.FornecedorID == 0 || in.Numero == "" || in.DataInicio == "" || in.DataFim == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Fornecedor, número e datas são obrigatórios"})
		return
	}
	dtIni := parseProcDate(in.DataInicio)
	dtFim := parseProcDate(in.DataFim)
	if dtIni == nil || dtFim == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datas inválidas"})
		return
	}
	if dtFim.Before(*dtIni) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "A data final deve ser posterior à data inicial"})
		return
	}
	contract := &models.PurchaseContract{
		FornecedorID:        in.FornecedorID,
		Tipo:                in.Tipo,
		TipoID:              in.TipoID,
		Numero:              in.Numero,
		DataInicio:          *dtIni,
		DataFim:             *dtFim,
		RenovacaoAutomatica: in.RenovacaoAutomatica,
		Valor:               in.Valor,
		Periodicidade:       "Mensal",
	}
	if in.Periodicidade != "" {
		contract.Periodicidade = in.Periodicidade
	}
	if err := h.contractRepo.Create(contract); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Já existe um contrato com este número"})
		return
	}
	c.JSON(http.StatusCreated, contract)
}

func (h *ProcurementHandler) UpdateContract(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	contract, err := h.contractRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Contrato não encontrado"})
		return
	}
	var in contractInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if in.FornecedorID != 0 {
		contract.FornecedorID = in.FornecedorID
	}
	if in.Tipo != "" {
		contract.Tipo = in.Tipo
	}
	contract.TipoID = in.TipoID
	if in.Numero != "" {
		contract.Numero = in.Numero
	}
	if dt := parseProcDate(in.DataInicio); dt != nil {
		contract.DataInicio = *dt
	}
	if dt := parseProcDate(in.DataFim); dt != nil {
		contract.DataFim = *dt
	}
	if contract.DataFim.Before(contract.DataInicio) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "A data final deve ser posterior à data inicial"})
		return
	}
	contract.RenovacaoAutomatica = in.RenovacaoAutomatica
	contract.Valor = in.Valor
	if in.Periodicidade != "" {
		contract.Periodicidade = in.Periodicidade
	}
	if err := h.contractRepo.Update(contract); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, contract)
}

func (h *ProcurementHandler) DeleteContract(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	if _, err := h.contractRepo.GetByID(uint(id)); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Contrato não encontrado"})
		return
	}
	if err := h.contractRepo.Delete(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Contrato excluído"})
}

// ---------- Contract Types ----------

func (h *ProcurementHandler) ListContractTypes(c *gin.Context) {
	items, err := h.contractTypeRepo.List(false)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

type contractTypeInput struct {
	Nome      string `json:"nome"`
	Descricao string `json:"descricao"`
	Ativo     *bool  `json:"ativo"`
}

func (h *ProcurementHandler) CreateContractType(c *gin.Context) {
	var in contractTypeInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if in.Nome == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nome é obrigatório"})
		return
	}
	ct := &models.ContractType{Nome: in.Nome, Ativo: true}
	if in.Descricao != "" {
		ct.Descricao = &in.Descricao
	}
	if in.Ativo != nil {
		ct.Ativo = *in.Ativo
	}
	if err := h.contractTypeRepo.Create(ct); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Já existe um tipo de contrato com este nome"})
		return
	}
	c.JSON(http.StatusCreated, ct)
}

func (h *ProcurementHandler) UpdateContractType(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	ct, err := h.contractTypeRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Tipo de contrato não encontrado"})
		return
	}
	var in contractTypeInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if in.Nome != "" {
		ct.Nome = in.Nome
	}
	if in.Descricao != "" {
		ct.Descricao = &in.Descricao
	}
	if in.Ativo != nil {
		ct.Ativo = *in.Ativo
	}
	if err := h.contractTypeRepo.Update(ct); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, ct)
}

func (h *ProcurementHandler) DeleteContractType(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	if _, err := h.contractTypeRepo.GetByID(uint(id)); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Tipo de contrato não encontrado"})
		return
	}
	has, _ := h.contractTypeRepo.HasContracts(uint(id))
	if has {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Não é possível excluir este tipo pois existem contratos vinculados a ele."})
		return
	}
	if err := h.contractTypeRepo.Delete(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Tipo de contrato excluído"})
}

// ---------- Notifications ----------

func (h *ProcurementHandler) MyNotifications(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	items, err := h.notifRepo.ListByUser(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *ProcurementHandler) MarkNotificationsRead(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	if err := h.notifRepo.MarkAllRead(user.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Notificações marcadas como lidas"})
}

// ---------- Purchase Researches ----------

func (h *ProcurementHandler) ListResearches(c *gin.Context) {
	items, err := h.researchRepo.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

type researchItemInput struct {
	NomeProduto   string  `json:"nome_produto"`
	LinkProduto   string  `json:"link_produto"`
	ImagemPath    string  `json:"imagem_path"`
	ValorEstimado float64 `json:"valor_estimado"`
	Quantidade    float64 `json:"quantidade"`
	TipoProduto   string  `json:"tipo_produto"`
}

type researchInput struct {
	Titulo        string              `json:"titulo"`
	Justificativa string              `json:"justificativa"`
	Status        string              `json:"status"`
	Items         []researchItemInput `json:"items"`
}

func (h *ProcurementHandler) CreateResearch(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	var in researchInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if in.Titulo == "" || in.Justificativa == "" || len(in.Items) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Título, justificativa e ao menos um item são obrigatórios"})
		return
	}
	num, err := h.researchRepo.GenerateResearchNumber(time.Now())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	status := models.PResearchStatusPendente
	if in.Status == models.PResearchStatusRascunho {
		status = models.PResearchStatusRascunho
	}
	research := &models.PurchaseResearch{
		Numero:        num,
		SolicitanteID: user.ID,
		Titulo:        in.Titulo,
		Justificativa: in.Justificativa,
		Status:        status,
		DataCriacao:   time.Now(),
	}
	for _, it := range in.Items {
		item := models.PurchaseResearchItem{
			NomeProduto:   it.NomeProduto,
			ValorEstimado: it.ValorEstimado,
			Quantidade:    it.Quantidade,
			TipoProduto:   "Consumo",
			Aprovado:      true,
		}
		if it.Quantidade == 0 {
			item.Quantidade = 1
		}
		if it.TipoProduto != "" {
			item.TipoProduto = it.TipoProduto
		}
		if it.LinkProduto != "" {
			item.LinkProduto = &it.LinkProduto
		}
		if it.ImagemPath != "" {
			item.ImagemPath = &it.ImagemPath
		}
		research.Items = append(research.Items, item)
	}
	if err := h.researchRepo.Create(research); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.logHistory("purchase_researches", research.ID, user.ID, "Criou Pesquisa de Compra")
	c.JSON(http.StatusCreated, research)
}

func (h *ProcurementHandler) GetResearch(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	research, err := h.researchRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pesquisa não encontrada"})
		return
	}
	c.JSON(http.StatusOK, research)
}

func (h *ProcurementHandler) SendResearch(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	research, err := h.researchRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pesquisa não encontrada"})
		return
	}
	if research.Status != models.PResearchStatusRascunho {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Esta pesquisa não está em rascunho"})
		return
	}
	research.Status = models.PResearchStatusPendente
	if err := h.researchRepo.Update(research); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.logHistory("purchase_researches", research.ID, user.ID, "Enviou pesquisa para aprovação")
	c.JSON(http.StatusOK, research)
}

func (h *ProcurementHandler) DecideResearch(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	research, err := h.researchRepo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pesquisa não encontrada"})
		return
	}
	var in struct {
		Acao            string `json:"acao"` // "aprovar" / "rejeitar"
		Justificativa   string `json:"justificativa_decisao"`
		CentroCustoID   uint   `json:"centro_custo_id"`
		ApprovedItemIDs []uint `json:"approved_item_ids"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if in.Acao == "aprovar" {
		if in.CentroCustoID == 0 || len(in.ApprovedItemIDs) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Centro de custo e ao menos um item aprovado são obrigatórios"})
			return
		}
		req, err := h.convertResearchToRequest(research, user.ID, in.ApprovedItemIDs, in.CentroCustoID, in.Justificativa)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		research.Status = models.PResearchStatusAprovada
		_ = h.researchRepo.Update(research)
		h.logHistory("purchase_researches", research.ID, user.ID, "Converteu Pesquisa em Solicitação de Compra")
		c.JSON(http.StatusOK, req)
		return
	}
	research.Status = models.PResearchStatusReprovada
	_ = h.researchRepo.Update(research)
	h.logHistory("purchase_researches", research.ID, user.ID, "Rejeitou Pesquisa: "+in.Justificativa)
	c.JSON(http.StatusOK, research)
}

// convertResearchToRequest mirrors convert_research_to_purchase_request.
func (h *ProcurementHandler) convertResearchToRequest(
	research *models.PurchaseResearch, userID uint, approvedItemIDs []uint, centroCustoID uint, justificativa string,
) (*models.PurchaseRequest, error) {
	approvedSet := map[uint]bool{}
	for _, id := range approvedItemIDs {
		approvedSet[id] = true
	}

	// Default "Geral" category
	category, err := h.categoryRepo.GetByName("Geral")
	if err != nil {
		category = &models.PurchaseCategory{Nome: "Geral", Descricao: strPtr("Categoria padrão para produtos criados por cotação"), Ativo: true}
		if err := h.categoryRepo.Create(category); err != nil {
			return nil, err
		}
	}

	num, err := h.requestRepo.GenerateRequestNumber(time.Now())
	if err != nil {
		return nil, err
	}
	req := &models.PurchaseRequest{
		Numero:         num,
		SolicitanteID:  research.SolicitanteID,
		DepartamentoID: 1,
		CentroCustoID:  centroCustoID,
		Justificativa:  justificativa,
		Urgencia:       models.UrgencyMedia,
		Status:         models.PRStatusPendente,
		DataCriacao:    time.Now(),
	}
	if req.Justificativa == "" {
		req.Justificativa = fmt.Sprintf("Gerado a partir da Pesquisa de Compra %s", research.Numero)
	}
	if req.SolicitanteID == 0 {
		req.SolicitanteID = userID
	}
	if user, err := h.userRepo.GetByID(userID); err == nil && user.DepartamentoID != nil {
		req.DepartamentoID = *user.DepartamentoID
	}

	for _, item := range research.Items {
		if !approvedSet[item.ID] {
			continue
		}
		product, err := h.productRepo.GetByName(item.NomeProduto)
		if err != nil {
			prodType := models.ProductTypeEquipamento
			if item.TipoProduto == models.ResearchConsumo {
				prodType = models.ProductTypeMaterialConsumo
			}
			product = &models.PurchaseProduct{
				Codigo:      fmt.Sprintf("PRD-%s", strings.ToUpper(uuid.New().String()[:8])),
				Nome:        item.NomeProduto,
				CategoriaID: category.ID,
				Unidade:     "UN",
				Tipo:        prodType,
				Ativo:       true,
			}
			if item.ImagemPath != nil {
				product.ImagemPath = item.ImagemPath
			}
			desc := fmt.Sprintf("Produto criado automaticamente a partir da Pesquisa de Compra %s", research.Numero)
			product.Descricao = &desc
			if err := h.productRepo.Create(product); err != nil {
				return nil, err
			}
			// Initialize zero stock for consumables
			if prodType == models.ProductTypeMaterialConsumo {
				_ = h.stockRepo.Create(&models.MaterialStock{ProductID: product.ID, QuantidadeSaldo: 0})
			}
		}
		item2 := models.PurchaseRequestItem{
			ProductID:     product.ID,
			Quantidade:    item.Quantidade,
			ValorEstimado: item.ValorEstimado,
		}
		if item.LinkProduto != nil && *item.LinkProduto != "" {
			obs := fmt.Sprintf("Origem: Link %s", *item.LinkProduto)
			item2.Observacao = &obs
		}
		req.Itens = append(req.Itens, item2)
	}
	if err := h.requestRepo.Create(req); err != nil {
		return nil, err
	}
	return req, nil
}

// ---------- Kanban integration ----------

// KanbanPurchaseRequest creates a purchase request from a kanban card (Python kanban.py solicit-compra).
func (h *ProcurementHandler) KanbanPurchaseRequest(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	cardID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	card, err := h.cardRepo.GetByID(uint(cardID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Card não encontrado"})
		return
	}
	var in struct {
		TipoItem       string  `json:"tipo_item"`
		NomeProduto    string  `json:"nome_produto"`
		LinkProduto    string  `json:"link_produto"`
		Quantidade     float64 `json:"quantidade"`
		ValorEstimado  float64 `json:"valor_estimado"`
		DepartamentoID *uint   `json:"departamento_id"`
		CentroCustoID  *uint   `json:"centro_custo_id"`
		Justificativa  string  `json:"justificativa"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if in.NomeProduto == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nome do produto é obrigatório"})
		return
	}
	if in.Quantidade <= 0 {
		in.Quantidade = 1
	}

	// 1. Category
	category, err := h.categoryRepo.First()
	if err != nil {
		category = &models.PurchaseCategory{Nome: "TI / Suprimentos", Descricao: strPtr("Categoria padrão TI"), Ativo: true}
		if err := h.categoryRepo.Create(category); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	// 2. Product
	product, err := h.productRepo.GetByName(in.NomeProduto)
	if err != nil {
		prodType := models.ProductTypeEquipamento
		if in.TipoItem == models.ResearchConsumo {
			prodType = models.ProductTypeMaterialConsumo
		}
		product = &models.PurchaseProduct{
			Codigo:      fmt.Sprintf("PROD-KB-%s", strings.ToUpper(uuid.New().String()[:6])),
			Nome:        strings.TrimSpace(in.NomeProduto),
			CategoriaID: category.ID,
			Tipo:        prodType,
			Unidade:     "UN",
			Ativo:       true,
		}
		if err := h.productRepo.Create(product); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	// 3. Department & cost center
	var deptID, ccID uint
	if in.DepartamentoID != nil {
		deptID = *in.DepartamentoID
	} else if user.DepartamentoID != nil {
		deptID = *user.DepartamentoID
	} else {
		deptID = 1
	}
	if in.CentroCustoID != nil {
		ccID = *in.CentroCustoID
	} else {
		if cc, err := h.ccRepo.First(); err == nil {
			ccID = cc.ID
		} else {
			cc := &models.CostCenter{Codigo: "CC-TI-01", Nome: "TI / Operações", AlertaLimite: true}
			_ = h.ccRepo.Create(cc)
			ccID = cc.ID
		}
	}

	// 4. Request
	num, err := h.requestRepo.GenerateRequestNumber(time.Now())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	just := in.Justificativa
	if just == "" {
		just = fmt.Sprintf("Solicitação de Compra gerada via Kanban (Card #%d: %s)", card.ID, card.Titulo)
	}
	if in.LinkProduto != "" {
		just += fmt.Sprintf("\nLink do Produto: %s", in.LinkProduto)
	}

	urgencia := models.UrgencyMedia
	if card.Prioridade == models.CardPriorityAlta || card.Prioridade == models.CardPriorityUrgente {
		urgencia = models.UrgencyAlta
	}
	req := &models.PurchaseRequest{
		Numero:         num,
		SolicitanteID:  user.ID,
		DepartamentoID: deptID,
		CentroCustoID:  ccID,
		Justificativa:  just,
		Urgencia:       urgencia,
		Status:         models.PRStatusPendente,
		DataCriacao:    time.Now(),
	}
	obs := fmt.Sprintf("Item para a tarefa Kanban #%d", card.ID)
	if in.LinkProduto != "" {
		obs += fmt.Sprintf(" - Link: %s", in.LinkProduto)
	}
	req.Itens = append(req.Itens, models.PurchaseRequestItem{
		ProductID:     product.ID,
		Quantidade:    in.Quantidade,
		ValorEstimado: in.ValorEstimado,
		Observacao:    &obs,
	})
	if err := h.requestRepo.Create(req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	card.PurchaseRequestID = &req.ID
	tipoItem := in.TipoItem
	if tipoItem == "" {
		tipoItem = "Consumo"
	}
	card.TipoItemNecessario = &tipoItem
	_ = h.cardRepo.Update(card)
	h.broadcastKanbanRequestUpdate(req, card, fmt.Sprintf("Solicitação de compra %s vinculada ao cartão '%s'.", req.Numero, card.Titulo))

	_ = h.interactionRepo.Create(&models.KanbanCardInteraction{
		CardID:    card.ID,
		UsuarioID: user.ID,
		Mensagem:  fmt.Sprintf("Gerou a solicitação de compra %s para '%s' (Qtd: %.2f, Valor Est.: R$ %.2f).", num, in.NomeProduto, in.Quantidade, in.ValorEstimado),
		Tipo:      models.InteractionSistemaSupr,
	})

	// Notify buyers (comprador, admin, gerente)
	internalEnabled := service.IsNotificationSettingEnabled(context.Background(), h.settingsRepo, service.NotificationProcurementEnabled, true)
	buyers, _ := h.userRepo.ListByRoles([]string{models.RoleComprador, models.RoleAdmin, models.RoleGerente})
	for _, buyer := range buyers {
		message := fmt.Sprintf("Nova Solicitação de Compra %s recebida do Kanban (Card #%d: '%s') para o produto '%s'.", num, card.ID, card.Titulo, in.NomeProduto)
		// Purchase Notification
		linkRedir := fmt.Sprintf("/compras?tab=solicitacoes&id=%d", req.ID)
		if internalEnabled {
			_ = h.notifRepo.Create(&models.PurchaseNotification{UserID: buyer.ID, Mensagem: message, LinkRedirecionamento: &linkRedir, DataCriacao: time.Now()})
		}
		h.sendPurchaseEmail(buyer, "Nova solicitação de compra", message)

		// Kanban Notification
		kanbanLink := fmt.Sprintf("/kanban?project=%d&card=%d", card.ProjectID, card.ID)
		_ = h.userRepo.DB().Create(&models.KanbanNotification{
			UserID:    buyer.ID,
			ProjectID: &card.ProjectID,
			CardID:    &card.ID,
			AutorID:   &user.ID,
			Tipo:      models.NotifCartaoMovimentado,
			Titulo:    "Nova Solicitação de Compra no Kanban",
			Mensagem:  fmt.Sprintf("O usuário %s solicitou a compra de '%s' para a tarefa '%s'.", user.Nome, in.NomeProduto, card.Titulo),
			Link:      &kanbanLink,
			CreatedAt: time.Now(),
		}).Error
	}

	c.JSON(http.StatusCreated, req)
}

// CreateMaintenancePurchaseRequest creates a purchase request originated from maintenance (corretiva or preventiva)
func (h *ProcurementHandler) CreateMaintenancePurchaseRequest(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	var in struct {
		NomeProduto          string  `json:"nome_produto"`
		LinkProduto          string  `json:"link_produto"`
		Quantidade           float64 `json:"quantidade"`
		ValorEstimado        float64 `json:"valor_estimado"`
		Justificativa        string  `json:"justificativa"`
		Urgencia             string  `json:"urgencia"`
		TipoItem             string  `json:"tipo_item"`
		AssetID              *uint   `json:"asset_id"`
		MaintenanceOrderID   *uint   `json:"maintenance_order_id"`
		MaintenanceRequestID *uint   `json:"maintenance_request_id"`
		CentroCustoID        *uint   `json:"centro_custo_id"`
		DepartamentoID       *uint   `json:"departamento_id"`
	}

	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(in.NomeProduto) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nome da peça/produto é obrigatório"})
		return
	}
	if in.Quantidade <= 0 {
		in.Quantidade = 1
	}
	if in.Urgencia == "" {
		in.Urgencia = models.UrgencyAlta
	}

	// 1. Get or create Category
	category, err := h.categoryRepo.First()
	if err != nil {
		category = &models.PurchaseCategory{Nome: "Peças e Manutenção", Descricao: strPtr("Peças de reposição e componentes"), Ativo: true}
		_ = h.categoryRepo.Create(category)
	}

	// 2. Product
	product, err := h.productRepo.GetByName(in.NomeProduto)
	if err != nil {
		prodType := models.ProductTypeMaterialConsumo
		if in.TipoItem == "Imobilizado" || in.TipoItem == models.ProductTypeEquipamento {
			prodType = models.ProductTypeEquipamento
		}
		product = &models.PurchaseProduct{
			Codigo:      fmt.Sprintf("PECA-%s", strings.ToUpper(uuid.New().String()[:6])),
			Nome:        strings.TrimSpace(in.NomeProduto),
			CategoriaID: category.ID,
			Tipo:        prodType,
			Unidade:     "UN",
			Ativo:       true,
		}
		_ = h.productRepo.Create(product)
	}

	// 3. Department & cost center
	var deptID, ccID uint
	if in.DepartamentoID != nil {
		deptID = *in.DepartamentoID
	} else if user.DepartamentoID != nil {
		deptID = *user.DepartamentoID
	} else {
		deptID = 1
	}
	if in.CentroCustoID != nil {
		ccID = *in.CentroCustoID
	} else {
		if cc, err := h.ccRepo.First(); err == nil {
			ccID = cc.ID
		} else {
			cc := &models.CostCenter{Codigo: "CC-MANUT-01", Nome: "Manutenção e Operações", AlertaLimite: true}
			_ = h.ccRepo.Create(cc)
			ccID = cc.ID
		}
	}

	// 4. Request Number
	num, err := h.requestRepo.GenerateRequestNumber(time.Now())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	just := in.Justificativa
	var assetTag string
	if in.AssetID != nil {
		if asset, err := h.assetRepo.GetByID(*in.AssetID); err == nil && asset != nil {
			assetTag = fmt.Sprintf(" (Ativo: %s - %s)", asset.EPatrimonio, asset.Nome)
		}
	}
	if just == "" {
		just = fmt.Sprintf("Solicitação de compra de peça para manutenção%s", assetTag)
	} else {
		just = fmt.Sprintf("%s%s", just, assetTag)
	}
	if in.LinkProduto != "" {
		just += fmt.Sprintf("\nLink para compra: %s", in.LinkProduto)
	}

	req := &models.PurchaseRequest{
		Numero:         num,
		SolicitanteID:  user.ID,
		DepartamentoID: deptID,
		CentroCustoID:  ccID,
		Justificativa:  just,
		Urgencia:       in.Urgencia,
		Status:         models.PRStatusPendente,
		OrigemOSID:     in.MaintenanceOrderID,
		OrigemTicketID: in.MaintenanceRequestID,
		DataCriacao:    time.Now(),
	}

	obs := "Peça para manutenção"
	if assetTag != "" {
		obs += assetTag
	}
	if in.LinkProduto != "" {
		obs += fmt.Sprintf(" | Link: %s", in.LinkProduto)
	}

	req.Itens = append(req.Itens, models.PurchaseRequestItem{
		ProductID:     product.ID,
		Quantidade:    in.Quantidade,
		ValorEstimado: in.ValorEstimado,
		Observacao:    &obs,
	})

	if err := h.requestRepo.Create(req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// If linked to preventive order, add material record and history
	if in.MaintenanceOrderID != nil {
		_ = h.userRepo.DB().Create(&models.MaintenanceMaterial{
			OrderID:       *in.MaintenanceOrderID,
			ProductID:     &product.ID,
			Produto:       in.NomeProduto,
			Quantidade:    in.Quantidade,
			ValorUnitario: in.ValorEstimado,
			ValorTotal:    in.Quantidade * in.ValorEstimado,
			Observacao:    &obs,
		}).Error

		_ = h.userRepo.DB().Create(&models.MaintenanceHistory{
			OrderID:   *in.MaintenanceOrderID,
			Acao:      "Solicitação de Compra de Peça",
			Descricao: fmt.Sprintf("Solicitação %s gerada para compra de '%s' (Qtd: %.2f, Est.: R$ %.2f)", num, in.NomeProduto, in.Quantidade, in.ValorEstimado),
			UsuarioID: &user.ID,
			DataHora:  time.Now(),
		}).Error
		h.syncMaintenancePurchaseToKanban(req, user.ID)
	}

	// Notify buyers
	internalEnabled := service.IsNotificationSettingEnabled(context.Background(), h.settingsRepo, service.NotificationProcurementEnabled, true)
	buyers, _ := h.userRepo.ListByRoles([]string{models.RoleComprador, models.RoleAdmin, models.RoleGerente})
	for _, buyer := range buyers {
		message := fmt.Sprintf("Nova Solicitação de Compra de Peça %s para '%s'%s.", num, in.NomeProduto, assetTag)
		linkRedir := fmt.Sprintf("/compras?tab=solicitacoes&id=%d", req.ID)
		if internalEnabled {
			_ = h.notifRepo.Create(&models.PurchaseNotification{UserID: buyer.ID, Mensagem: message, LinkRedirecionamento: &linkRedir, DataCriacao: time.Now()})
		}
		h.sendPurchaseEmail(buyer, "Nova solicitação de peça", message)
	}

	c.JSON(http.StatusCreated, req)
}

// KanbanLinkStock links a material stock item to a kanban card (Python kanban.py vincular-estoque).
func (h *ProcurementHandler) KanbanLinkStock(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	cardID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	card, err := h.cardRepo.GetByID(uint(cardID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Card não encontrado"})
		return
	}
	var in struct {
		StockID         uint    `json:"stock_id"`
		QuantidadeUsar  float64 `json:"quantidade_usar"`
		DarBaixaEstoque bool    `json:"dar_baixa_estoque"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	stock, err := h.stockRepo.GetByID(in.StockID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Item de estoque não encontrado"})
		return
	}

	card.MaterialStockID = &stock.ID
	tipoItem := "Estoque"
	card.TipoItemNecessario = &tipoItem

	if in.DarBaixaEstoque && in.QuantidadeUsar > 0 {
		_, _ = h.stockRepo.CreateOrUpdate(
			stock.ProductID, in.QuantidadeUsar, models.StockSaida, user.ID,
			fmt.Sprintf("Baixa/Uso de Estoque no Card Kanban #%d (%s)", card.ID, card.Titulo),
			"kanban_cards", &card.ID,
		)
	}
	_ = h.cardRepo.Update(card)

	prodName := "Material"
	if stock.Product != nil {
		prodName = stock.Product.Nome
	}
	_ = h.interactionRepo.Create(&models.KanbanCardInteraction{
		CardID:    card.ID,
		UsuarioID: user.ID,
		Mensagem:  fmt.Sprintf("Alocou %.2f UN do item de estoque '%s'.", in.QuantidadeUsar, prodName),
		Tipo:      models.InteractionSistemaSupr,
	})

	c.JSON(http.StatusOK, card)
}
