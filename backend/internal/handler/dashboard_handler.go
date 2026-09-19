package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/assettrack/backend/internal/dto"
	"github.com/assettrack/backend/internal/middleware"
	"github.com/assettrack/backend/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

type DashboardHandler struct {
	db  *gorm.DB
	rdb *redis.Client
}

func NewDashboardHandler(db *gorm.DB, rdb *redis.Client) *DashboardHandler {
	return &DashboardHandler{db: db, rdb: rdb}
}

// GetStats GET /api/v1/dashboard/stats
func (h *DashboardHandler) GetStats(c *gin.Context) {
	cacheKey := "dashboard:stats"

	if h.rdb != nil {
		if cachedBytes, err := h.rdb.Get(c.Request.Context(), cacheKey).Bytes(); err == nil && len(cachedBytes) > 0 {
			var cachedResp dto.DashboardStatsResponse
			if jsonErr := json.Unmarshal(cachedBytes, &cachedResp); jsonErr == nil {
				c.Header("X-Cache", "HIT")
				c.JSON(http.StatusOK, cachedResp)
				return
			}
		}
	}

	var response dto.DashboardStatsResponse

	// 1. Total Assets & Assets count by Status
	h.db.Model(&models.Asset{}).Count(&response.TotalAssets)
	var totalAssetVal *float64
	h.db.Model(&models.Asset{}).Select("COALESCE(SUM(valor), 0)").Scan(&totalAssetVal)
	if totalAssetVal != nil {
		response.TotalAssetsValue = *totalAssetVal
	}

	h.db.Model(&models.Asset{}).Where("LOWER(status) IN ('manutenção', 'manutencao', 'em manutenção', 'em_manutencao') OR LOWER(status) LIKE '%manuten%'").Count(&response.TotalAssetsInMaintenance)
	h.db.Model(&models.Asset{}).Where("LOWER(status) IN ('disponível', 'disponivel')").Count(&response.TotalAssetsDisponivel)
	h.db.Model(&models.Asset{}).Where("LOWER(status) IN ('em uso', 'em_uso', 'uso')").Count(&response.TotalAssetsEmUso)
	h.db.Model(&models.Asset{}).Where("LOWER(status) IN ('armazenado', 'armazenamento')").Count(&response.TotalAssetsArmazenado)
	h.db.Model(&models.Asset{}).Where("LOWER(status) IN ('baixado', 'baixa')").Count(&response.TotalAssetsBaixado)

	// 1.1 Assets by Category
	type catCount struct {
		Category string
		Count    int64
	}
	var catCounts []catCount
	h.db.Table("assets").
		Select("COALESCE(asset_categories.nome, 'Sem Categoria') as category, count(assets.id) as count").
		Joins("LEFT JOIN asset_categories ON asset_categories.id = assets.categoria_id").
		Group("COALESCE(asset_categories.nome, 'Sem Categoria')").
		Order("count DESC").
		Limit(7).
		Scan(&catCounts)

	for _, cc := range catCounts {
		response.AssetsByCategory = append(response.AssetsByCategory, dto.CategoryStat{
			Category: cc.Category,
			Count:    cc.Count,
		})
	}

	// 2. Open vs Resolved vs Closed Tickets
	h.db.Model(&models.ServiceTicket{}).Count(&response.TicketsTotal)
	h.db.Model(&models.ServiceTicket{}).Where("LOWER(status) NOT IN ('resolvido', 'fechado', 'cancelado')").Count(&response.TicketsOpen)
	h.db.Model(&models.ServiceTicket{}).Where("LOWER(status) = ?", "resolvido").Count(&response.TicketsResolved)
	h.db.Model(&models.ServiceTicket{}).Where("LOWER(status) IN ('fechado', 'cancelado')").Count(&response.TicketsClosed)

	// 2.1 Average Rating of Tickets
	var avgRating *float64
	h.db.Model(&models.ServiceTicket{}).Where("avaliacao IS NOT NULL AND avaliacao > 0").Select("COALESCE(AVG(avaliacao), 0)").Scan(&avgRating)
	if avgRating != nil {
		response.TicketsAvgRating = *avgRating
	}

	// 2.2 Tickets by Priority
	h.db.Model(&models.ServiceTicket{}).Where("LOWER(prioridade) = ?", "urgente").Count(&response.TicketsByPriority.Urgente)
	h.db.Model(&models.ServiceTicket{}).Where("LOWER(prioridade) = ?", "alta").Count(&response.TicketsByPriority.Alta)
	h.db.Model(&models.ServiceTicket{}).Where("LOWER(prioridade) IN ('média', 'media')").Count(&response.TicketsByPriority.Media)
	h.db.Model(&models.ServiceTicket{}).Where("LOWER(prioridade) = ?", "baixa").Count(&response.TicketsByPriority.Baixa)

	// 3. Supplier Cost Monthly
	now := time.Now()
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	
	var totalCost *float64
	h.db.Model(&models.PurchaseOrder{}).
		Select("SUM(valor_total)").
		Where("UPPER(status) IN ('APROVADO', 'RECEBIDO', 'ACEITO', 'RECEBIDO TOTALMENTE') AND data_emissao >= ?", startOfMonth).
		Scan(&totalCost)

	if totalCost != nil {
		response.SupplierCostMonthly = *totalCost
	} else {
		response.SupplierCostMonthly = 0.0
	}

	// 4. Pending Asset Requests
	h.db.Model(&models.Solicitacao{}).Where("LOWER(status) = ?", "pendente").Count(&response.PendingAssetRequests)

	// 4.1 Recent Activities (Timeline)
	var recentMovs []models.Movimentacao
	h.db.Preload("Asset").Preload("ParaUser").Preload("DeUser").Order("data DESC").Limit(5).Find(&recentMovs)
	for _, m := range recentMovs {
		assetName := "Ativo"
		if m.Asset != nil {
			assetName = m.Asset.Nome
		}
		userName := "Sistema"
		if m.ParaUser != nil {
			userName = m.ParaUser.Nome
		} else if m.DeUser != nil {
			userName = m.DeUser.Nome
		}
		response.RecentActivities = append(response.RecentActivities, dto.RecentActivityItem{
			ID:        m.ID,
			Type:      "movimentacao",
			Title:     string(m.Tipo) + ": " + assetName,
			Subtitle:  "Usuário: " + userName,
			Status:    string(m.Tipo),
			CreatedAt: m.Data.Format(time.RFC3339),
		})
	}

	var recentSols []models.Solicitacao
	h.db.Preload("Asset").Preload("Solicitante").Order("data_solicitacao DESC").Limit(4).Find(&recentSols)
	for _, s := range recentSols {
		assetName := "Equipamento"
		if s.Asset != nil {
			assetName = s.Asset.Nome
		}
		userName := "Colaborador"
		if s.Solicitante != nil {
			userName = s.Solicitante.Nome
		}
		response.RecentActivities = append(response.RecentActivities, dto.RecentActivityItem{
			ID:        s.ID,
			Type:      "solicitacao",
			Title:     "Empréstimo: " + assetName,
			Subtitle:  "Solicitado por " + userName,
			Status:    string(s.Status),
			CreatedAt: s.DataSolicitacao.Format(time.RFC3339),
		})
	}


	// 5. Main Alerts (Emergency Alerts + Pending Asset Requests + Assets in Maintenance)
	var alerts []models.EmergencyAlert
	h.db.Where("atendido = ?", false).Order("created_at DESC").Limit(5).Find(&alerts)
	
	for _, a := range alerts {
		response.ActiveAlerts = append(response.ActiveAlerts, dto.AlertSummary{
			ID:        a.ID,
			Title:     "Alerta Crítico: " + a.UsuarioNome + " (" + a.Motivo + ")",
			Severity:  "CRITICAL",
			CreatedAt: a.CreatedAt.Format(time.RFC3339),
		})
	}

	// Also fetch active maintenance items (Oficina / Manutenções) to display as Alerts
	var activeMaint []models.Manutencao
	h.db.Preload("Asset").Where("LOWER(status) IN ?", []string{"em_andamento", "pendente"}).Order("data_entrada DESC").Limit(5).Find(&activeMaint)

	for _, m := range activeMaint {
		assetStr := "Equipamento"
		if m.Asset != nil {
			assetStr = m.Asset.Nome
			if m.Asset.EPatrimonio != "" {
				assetStr += " (" + m.Asset.EPatrimonio + ")"
			}
		}
		response.ActiveAlerts = append(response.ActiveAlerts, dto.AlertSummary{
			ID:        m.ID,
			Title:     "Equipamento em Manutenção (Oficina): " + assetStr + " — " + m.Motivo,
			Severity:  "WARNING",
			CreatedAt: m.DataEntrada.Format(time.RFC3339),
		})
	}

	// Also fetch pending or approved asset solicitations to display as Alerts on the main dashboard!
	var pendingSol []models.Solicitacao
	h.db.Preload("Solicitante").Preload("Asset").Where("LOWER(status) IN ?", []string{"pendente", "aprovada"}).Order("data_solicitacao DESC").Limit(5).Find(&pendingSol)

	for _, s := range pendingSol {
		userStr := "Usuário"
		if s.Solicitante != nil {
			userStr = s.Solicitante.Nome
		}
		assetStr := "Equipamento"
		if s.Asset != nil {
			assetStr = s.Asset.Nome
		}

		title := ""
		severity := "WARNING"
		if strings.EqualFold(string(s.Status), "pendente") {
			title = "Solicitação de Ativo Pendente: " + userStr + " solicitou " + assetStr
			severity = "WARNING"
		} else {
			title = "Ativo Aprovado Aguardando Entrega: " + assetStr + " para " + userStr
			severity = "INFO"
		}

		response.ActiveAlerts = append(response.ActiveAlerts, dto.AlertSummary{
			ID:        s.ID,
			Title:     title,
			Severity:  severity,
			CreatedAt: s.DataSolicitacao.Format(time.RFC3339),
		})
	}

	// 5. Pending Maintenance Requests (SolicitacaoManutencao)
	h.db.Model(&models.SolicitacaoManutencao{}).Where("LOWER(status) = ?", "pendente").Count(&response.PendingMaintenanceReqs)

	var pendingReqs []models.SolicitacaoManutencao
	h.db.Preload("Solicitante").Preload("Asset").Where("LOWER(status) = ?", "pendente").Order("data_solicitacao DESC").Limit(5).Find(&pendingReqs)

	for _, r := range pendingReqs {
		userStr := "Usuário"
		if r.Solicitante != nil {
			userStr = r.Solicitante.Nome
		}
		assetStr := "Equipamento"
		if r.Asset != nil {
			assetStr = r.Asset.Nome
		}
		response.ActiveAlerts = append(response.ActiveAlerts, dto.AlertSummary{
			ID:        r.ID,
			Title:     "Nova Solicitação de Manutenção: " + assetStr + " (por " + userStr + ")",
			Severity:  "CRITICAL",
			CreatedAt: r.DataSolicitacao.Format(time.RFC3339),
		})
	}

	// 6. Open Service Desk Ticket Alerts (for Admins, Managers and Technicians)
	currentUser := middleware.GetCurrentUser(c)
	if currentUser != nil && currentUser.IsManagerOrAbove() {
		var openTickets []models.ServiceTicket
		h.db.Preload("Solicitante").Where("LOWER(status) = ?", "aberto").Order("data_abertura DESC").Limit(5).Find(&openTickets)

		for _, t := range openTickets {
			solicitanteName := "Usuário"
			if t.Solicitante != nil {
				solicitanteName = t.Solicitante.Nome
			}
			response.ActiveAlerts = append(response.ActiveAlerts, dto.AlertSummary{
				ID:        t.ID,
				Title:     "Chamado Aberto: " + summarizeTicketDescription(t.Descricao) + " (por " + solicitanteName + ")",
				Severity:  "WARNING",
				CreatedAt: t.DataAbertura.Format(time.RFC3339),
				Link:      fmt.Sprintf("/servicos?status=aberto&ticketId=%d", t.ID),
			})
		}
	}

	if h.rdb != nil {
		if jsonBytes, err := json.Marshal(response); err == nil {
			_ = h.rdb.Set(c.Request.Context(), cacheKey, jsonBytes, 30*time.Second).Err()
		}
	}

	c.Header("X-Cache", "MISS")
	c.JSON(http.StatusOK, response)
}

func summarizeTicketDescription(description string) string {
	normalized := strings.Join(strings.Fields(description), " ")
	if normalized == "" {
		return "Sem descrição"
	}
	const maxLength = 72
	if len(normalized) <= maxLength {
		return normalized
	}
	return strings.TrimSpace(normalized[:maxLength-1]) + "…"
}
