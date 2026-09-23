package handler

import (
	"net/http"

	"github.com/assettrack/backend/internal/middleware"
	"github.com/assettrack/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type AIHandler struct {
	aiService service.AIService
}

func NewAIHandler(aiService service.AIService) *AIHandler {
	return &AIHandler{aiService: aiService}
}

type ChatRequest struct {
	Messages []map[string]interface{} `json:"messages" binding:"required"`
}

func (h *AIHandler) Chat(c *gin.Context) {
	var req ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	currentUser := middleware.GetCurrentUser(c)
	response, err := h.aiService.Chat(c.Request.Context(), currentUser, req.Messages)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"response": response})
}

