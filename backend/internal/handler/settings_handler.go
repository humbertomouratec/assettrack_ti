package handler

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/assettrack/backend/internal/middleware"
	"github.com/assettrack/backend/internal/repository"
	"github.com/assettrack/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type SettingsHandler struct {
	settingsRepo repository.SystemSettingsRepository
	emailSvc     service.EmailService
}

func NewSettingsHandler(settingsRepo repository.SystemSettingsRepository, emailSvc service.EmailService) *SettingsHandler {
	return &SettingsHandler{settingsRepo: settingsRepo, emailSvc: emailSvc}
}

// GetFeatures is available to every active authenticated user so module visibility
// is controlled by one server-side value instead of per-browser local state.
func (h *SettingsHandler) GetFeatures(c *gin.Context) {
	keys := []string{"preventive_maintenance_enabled", "purchases_enabled", "kanban_enabled", "ai_enabled", "home_assistant_enabled"}
	result := make(map[string]bool, len(keys))
	for _, key := range keys {
		setting, err := h.settingsRepo.GetSetting(c.Request.Context(), key)
		if err != nil || setting == nil {
			// Existing installations predate feature rows; preserve their active modules.
			result[key] = key != "ai_enabled" && key != "home_assistant_enabled"
			continue
		}
		result[key] = strings.EqualFold(strings.TrimSpace(setting.SettingValue), "true")
	}
	c.JSON(http.StatusOK, result)
}

type testEmailRequest struct {
	Email string `json:"email"`
}

// TestEmail sends a harmless message to the requesting admin's address (or to
// the explicitly supplied address) using the SMTP settings currently saved.
func (h *SettingsHandler) TestEmail(c *gin.Context) {
	if h.emailSvc == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Serviço de e-mail indisponível"})
		return
	}
	var request testEmailRequest
	if c.Request.ContentLength != 0 && c.Request.Body != nil {
		if err := c.ShouldBindJSON(&request); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Informe um destinatário de teste válido"})
			return
		}
	}
	request.Email = strings.TrimSpace(request.Email)
	if request.Email == "" {
		if user := middleware.GetCurrentUser(c); user != nil {
			request.Email = strings.TrimSpace(user.Email)
		}
	}
	if request.Email == "" || !strings.Contains(request.Email, "@") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Informe o e-mail que receberá o teste"})
		return
	}
	if err := h.emailSvc.SendEmail(c.Request.Context(), request.Email, "Teste SMTP — AssetTrack TI", "<p>Este é um envio de teste do servidor SMTP do AssetTrack TI.</p>"); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("Não foi possível enviar o teste SMTP: %v", err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "E-mail de teste enviado", "recipient": request.Email})
}

func (h *SettingsHandler) GetAll(c *gin.Context) {
	settings, err := h.settingsRepo.GetAllSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch settings"})
		return
	}

	// Format as a map for easier frontend consumption
	result := make(map[string]interface{})
	for _, s := range settings {
		result[s.SettingKey] = s.SettingValue
	}
	// Keep notification controls visible and enabled by default on installations
	// created before they were introduced.
	for _, key := range []string{
		service.EmailNotificationRHStatus,
		service.EmailNotificationKanban,
		service.EmailNotificationMaintenance,
		service.EmailNotificationProcurement,
		service.EmailNotificationServiceDesk,
		service.NotificationKanbanEnabled,
		service.NotificationMaintenanceEnabled,
		service.NotificationProcurementEnabled,
		service.NotificationServiceDeskEnabled,
	} {
		if _, exists := result[key]; !exists {
			result[key] = "true"
		}
	}
	// Older installations did not persist the SMTP security mode. Infer the
	// conventional secure choice from their already configured port.
	if _, exists := result["smtp_security"]; !exists {
		if result["smtp_port"] == "465" {
			result["smtp_security"] = service.SMTPSecuritySSLTLS
		} else {
			result["smtp_security"] = service.SMTPSecuritySTARTTLS
		}
	}

	c.JSON(http.StatusOK, result)
}

func (h *SettingsHandler) UpdateMany(c *gin.Context) {
	var body map[string]string
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	for k, v := range body {
		err := h.settingsRepo.SetSetting(c.Request.Context(), k, v, nil)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update setting: " + k})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Settings updated successfully"})
}
