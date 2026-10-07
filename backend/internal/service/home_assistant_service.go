package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/assettrack/backend/internal/models"
	"github.com/assettrack/backend/internal/repository"
)

type HAEntityState struct {
	EntityID     string                 `json:"entity_id"`
	Domain       string                 `json:"domain"`
	State        string                 `json:"state"`
	Attributes   map[string]interface{} `json:"attributes"`
	LastChanged  string                 `json:"last_changed"`
	LastUpdated  string                 `json:"last_updated"`
	FriendlyName string                 `json:"friendly_name"`
	Category     string                 `json:"category"`
	IsPinned     bool                   `json:"is_pinned"`
	IsVisible    bool                   `json:"is_visible"`
	DisplayOrder int                    `json:"display_order"`
	AssetID      *uint                  `json:"asset_id,omitempty"`
	AssetTag     string                 `json:"asset_tag,omitempty"`
	AssetName    string                 `json:"asset_name,omitempty"`
}

type HAOverviewResponse struct {
	IsOnline   bool            `json:"is_online"`
	Error      string          `json:"error,omitempty"`
	LastSyncAt time.Time       `json:"last_sync_at"`
	Entities   []HAEntityState `json:"entities"`
}

type CallServiceRequest struct {
	Domain      string                 `json:"domain" binding:"required"`
	Service     string                 `json:"service" binding:"required"`
	EntityID    string                 `json:"entity_id" binding:"required"`
	ServiceData map[string]interface{} `json:"service_data"`
}

type SaveBindingRequest struct {
	EntityID     string `json:"entity_id" binding:"required"`
	FriendlyName string `json:"friendly_name"`
	Category     string `json:"category"`
	AssetID      *uint  `json:"asset_id"`
	IsPinned     bool   `json:"is_pinned"`
	IsVisible    bool   `json:"is_visible"`
	DisplayOrder int    `json:"display_order"`
}

type SetVisibilityRequest struct {
	EntityID  string `json:"entity_id" binding:"required"`
	IsVisible bool   `json:"is_visible"`
}

type HomeAssistantService interface {
	IsEnabled(ctx context.Context) bool
	TestConnection(ctx context.Context) (map[string]interface{}, error)
	GetStates(ctx context.Context, forceRefresh bool) (*HAOverviewResponse, error)
	CallService(ctx context.Context, req *CallServiceRequest) error
	SaveBinding(ctx context.Context, req *SaveBindingRequest) error
	SetVisibility(ctx context.Context, entityID string, isVisible bool) error
	DeleteBinding(ctx context.Context, id uint) error
	GetAssetTelemetry(ctx context.Context, assetID uint) ([]HAEntityState, error)

	// Categories
	ListCategories(ctx context.Context) ([]models.HomeAssistantCategory, error)
	CreateCategory(ctx context.Context, nome string, icone string, cor string) (*models.HomeAssistantCategory, error)
	UpdateCategory(ctx context.Context, id uint, nome string, icone string, cor string) error
	DeleteCategory(ctx context.Context, id uint) error
}

type homeAssistantService struct {
	repo         repository.HomeAssistantRepository
	settingsRepo repository.SystemSettingsRepository
	httpClient   *http.Client

	mu          sync.RWMutex
	cachedData  *HAOverviewResponse
	cacheExpiry time.Time
}

func NewHomeAssistantService(
	repo repository.HomeAssistantRepository,
	settingsRepo repository.SystemSettingsRepository,
) HomeAssistantService {
	return &homeAssistantService{
		repo:         repo,
		settingsRepo: settingsRepo,
		httpClient: &http.Client{
			Timeout: 7 * time.Second,
		},
	}
}

func (s *homeAssistantService) getHAConfig(ctx context.Context) (url string, token string, enabled bool, err error) {
	enabledSetting, _ := s.settingsRepo.GetSetting(ctx, "home_assistant_enabled")
	enabled = enabledSetting != nil && strings.EqualFold(strings.TrimSpace(enabledSetting.SettingValue), "true")

	urlSetting, errUrl := s.settingsRepo.GetSetting(ctx, "home_assistant_url")
	if errUrl != nil || urlSetting == nil || strings.TrimSpace(urlSetting.SettingValue) == "" {
		return "", "", enabled, errors.New("URL do Home Assistant não configurada")
	}
	url = strings.TrimRight(strings.TrimSpace(urlSetting.SettingValue), "/")

	tokenSetting, errTok := s.settingsRepo.GetSetting(ctx, "home_assistant_token")
	if errTok != nil || tokenSetting == nil || strings.TrimSpace(tokenSetting.SettingValue) == "" {
		return url, "", enabled, errors.New("Token de Acesso do Home Assistant não configurado")
	}
	token = strings.TrimSpace(tokenSetting.SettingValue)

	return url, token, enabled, nil
}

func (s *homeAssistantService) IsEnabled(ctx context.Context) bool {
	enabledSetting, _ := s.settingsRepo.GetSetting(ctx, "home_assistant_enabled")
	return enabledSetting != nil && strings.EqualFold(strings.TrimSpace(enabledSetting.SettingValue), "true")
}

func (s *homeAssistantService) TestConnection(ctx context.Context) (map[string]interface{}, error) {
	url, token, _, err := s.getHAConfig(ctx)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/api/config", url), nil)
	if err != nil {
		return nil, fmt.Errorf("erro ao criar requisição: %w", err)
	}
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("não foi possível conectar ao Home Assistant em %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Home Assistant respondeu com código %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var haConfig map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&haConfig); err != nil {
		return nil, fmt.Errorf("falha ao interpretar resposta do Home Assistant: %w", err)
	}

	version, _ := haConfig["version"].(string)
	locationName, _ := haConfig["location_name"].(string)
	state, _ := haConfig["state"].(string)

	return map[string]interface{}{
		"connected":     true,
		"version":       version,
		"location_name": locationName,
		"state":         state,
		"url":           url,
	}, nil
}

type rawHAState struct {
	EntityID    string                 `json:"entity_id"`
	State       string                 `json:"state"`
	Attributes  map[string]interface{} `json:"attributes"`
	LastChanged string                 `json:"last_changed"`
	LastUpdated string                 `json:"last_updated"`
}

func (s *homeAssistantService) GetStates(ctx context.Context, forceRefresh bool) (*HAOverviewResponse, error) {
	now := time.Now()

	s.mu.RLock()
	if !forceRefresh && s.cachedData != nil && now.Before(s.cacheExpiry) {
		cached := *s.cachedData
		s.mu.RUnlock()
		return &cached, nil
	}
	s.mu.RUnlock()

	url, token, _, err := s.getHAConfig(ctx)
	if err != nil {
		// If not configured or error, return cached if exists, else error
		s.mu.RLock()
		if s.cachedData != nil {
			cached := *s.cachedData
			cached.IsOnline = false
			cached.Error = err.Error()
			s.mu.RUnlock()
			return &cached, nil
		}
		s.mu.RUnlock()
		return &HAOverviewResponse{
			IsOnline:   false,
			Error:      err.Error(),
			LastSyncAt: now,
			Entities:   []HAEntityState{},
		}, nil
	}

	// Fetch database bindings
	bindings, _ := s.repo.ListEntities(ctx)
	bindingsMap := make(map[string]models.HomeAssistantEntity, len(bindings))
	for _, b := range bindings {
		bindingsMap[b.EntityID] = b
	}

	// Fetch from Home Assistant
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/api/states", url), nil)
	if err != nil {
		return s.handleFallback(err.Error(), now)
	}
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return s.handleFallback(fmt.Sprintf("Falha ao comunicar com Home Assistant: %v", err), now)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return s.handleFallback(fmt.Sprintf("Home Assistant respondeu com código HTTP %d", resp.StatusCode), now)
	}

	var rawStates []rawHAState
	if err := json.NewDecoder(resp.Body).Decode(&rawStates); err != nil {
		return s.handleFallback(fmt.Sprintf("Falha ao decodificar estados: %v", err), now)
	}

	// Filter and convert entities
	// We are interested in telemetry/control domains: sensor, binary_sensor, switch, light, climate, lock, fan, cover, update
	allowedDomains := map[string]bool{
		"sensor":        true,
		"binary_sensor": true,
		"switch":        true,
		"light":         true,
		"climate":       true,
		"lock":          true,
		"fan":           true,
		"cover":         true,
		"update":        true,
	}

	entities := make([]HAEntityState, 0, len(rawStates))
	for _, raw := range rawStates {
		parts := strings.Split(raw.EntityID, ".")
		if len(parts) < 2 {
			continue
		}
		domain := parts[0]
		if !allowedDomains[domain] {
			continue
		}

		friendlyName := raw.EntityID
		if fn, ok := raw.Attributes["friendly_name"].(string); ok && fn != "" {
			friendlyName = fn
		}

		category := "Geral"
		isPinned := false
		isVisible := true
		displayOrder := 0
		var assetID *uint
		var assetTag, assetName string

		if b, exists := bindingsMap[raw.EntityID]; exists {
			if b.FriendlyName != "" {
				friendlyName = b.FriendlyName
			}
			if b.Category != "" {
				category = b.Category
			}
			isPinned = b.IsPinned
			isVisible = b.IsVisible
			displayOrder = b.DisplayOrder
			if b.AssetID != nil {
				assetID = b.AssetID
				if b.Asset != nil {
					assetTag = b.Asset.EPatrimonio
					assetName = b.Asset.Nome
				}
			}
		}

		entities = append(entities, HAEntityState{
			EntityID:     raw.EntityID,
			Domain:       domain,
			State:        raw.State,
			Attributes:   raw.Attributes,
			LastChanged:  raw.LastChanged,
			LastUpdated:  raw.LastUpdated,
			FriendlyName: friendlyName,
			Category:     category,
			IsPinned:     isPinned,
			IsVisible:    isVisible,
			DisplayOrder: displayOrder,
			AssetID:      assetID,
			AssetTag:     assetTag,
			AssetName:    assetName,
		})
	}

	response := &HAOverviewResponse{
		IsOnline:   true,
		LastSyncAt: now,
		Entities:   entities,
	}

	// Update cache (TTL 10s)
	s.mu.Lock()
	s.cachedData = response
	s.cacheExpiry = now.Add(10 * time.Second)
	s.mu.Unlock()

	return response, nil
}

func (s *homeAssistantService) handleFallback(errMsg string, now time.Time) (*HAOverviewResponse, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.cachedData != nil {
		cached := *s.cachedData
		cached.IsOnline = false
		cached.Error = errMsg
		return &cached, nil
	}
	return &HAOverviewResponse{
		IsOnline:   false,
		Error:      errMsg,
		LastSyncAt: now,
		Entities:   []HAEntityState{},
	}, nil
}

func (s *homeAssistantService) CallService(ctx context.Context, req *CallServiceRequest) error {
	url, token, enabled, err := s.getHAConfig(ctx)
	if err != nil {
		return err
	}
	if !enabled {
		return errors.New("módulo Home Assistant está desativado nas configurações do sistema")
	}

	payload := map[string]interface{}{
		"entity_id": req.EntityID,
	}
	for k, v := range req.ServiceData {
		payload[k] = v
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("erro ao serializar payload de serviço: %w", err)
	}

	endpoint := fmt.Sprintf("%s/api/services/%s/%s", url, req.Domain, req.Service)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payloadBytes))
	if err != nil {
		return fmt.Errorf("erro ao criar requisição de serviço: %w", err)
	}
	httpReq.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("falha ao enviar comando para o Home Assistant: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Home Assistant retornou erro %d ao executar serviço: %s", resp.StatusCode, string(bodyBytes))
	}

	// Invalidate cache immediately so UI gets updated state
	s.mu.Lock()
	s.cacheExpiry = time.Now()
	s.mu.Unlock()

	return nil
}

func (s *homeAssistantService) SaveBinding(ctx context.Context, req *SaveBindingRequest) error {
	category := req.Category
	if category == "" {
		category = "Geral"
	}
	err := s.repo.UpdateEntityBinding(ctx, req.EntityID, req.AssetID, category, req.FriendlyName, req.IsPinned, req.IsVisible, req.DisplayOrder)
	if err != nil {
		return err
	}

	// Invalidate cache
	s.mu.Lock()
	s.cachedData = nil
	s.cacheExpiry = time.Now()
	s.mu.Unlock()

	return nil
}

func (s *homeAssistantService) SetVisibility(ctx context.Context, entityID string, isVisible bool) error {
	err := s.repo.SetEntityVisibility(ctx, entityID, isVisible)
	if err != nil {
		return err
	}

	// Invalidate cache
	s.mu.Lock()
	s.cachedData = nil
	s.cacheExpiry = time.Now()
	s.mu.Unlock()

	return nil
}

func (s *homeAssistantService) DeleteBinding(ctx context.Context, id uint) error {
	err := s.repo.DeleteEntity(ctx, id)
	if err != nil {
		return err
	}

	s.mu.Lock()
	s.cachedData = nil
	s.cacheExpiry = time.Now()
	s.mu.Unlock()

	return nil
}

func (s *homeAssistantService) GetAssetTelemetry(ctx context.Context, assetID uint) ([]HAEntityState, error) {
	overview, err := s.GetStates(ctx, false)
	if err != nil {
		return nil, err
	}

	var assetEntities []HAEntityState
	for _, e := range overview.Entities {
		if e.AssetID != nil && *e.AssetID == assetID {
			assetEntities = append(assetEntities, e)
		}
	}

	return assetEntities, nil
}

func (s *homeAssistantService) ListCategories(ctx context.Context) ([]models.HomeAssistantCategory, error) {
	return s.repo.ListCategories(ctx)
}

func (s *homeAssistantService) CreateCategory(ctx context.Context, nome string, icone string, cor string) (*models.HomeAssistantCategory, error) {
	nome = strings.TrimSpace(nome)
	if nome == "" {
		return nil, errors.New("o nome da categoria é obrigatório")
	}
	if icone == "" {
		icone = "folder"
	}
	if cor == "" {
		cor = "blue"
	}

	cat := models.HomeAssistantCategory{
		Nome:  nome,
		Icone: icone,
		Cor:   cor,
	}

	if err := s.repo.CreateCategory(ctx, &cat); err != nil {
		return nil, err
	}

	s.mu.Lock()
	s.cacheExpiry = time.Now()
	s.mu.Unlock()

	return &cat, nil
}

func (s *homeAssistantService) UpdateCategory(ctx context.Context, id uint, nome string, icone string, cor string) error {
	nome = strings.TrimSpace(nome)
	if nome == "" {
		return errors.New("o nome da categoria é obrigatório")
	}
	err := s.repo.UpdateCategory(ctx, id, nome, icone, cor)
	if err != nil {
		return err
	}

	s.mu.Lock()
	s.cacheExpiry = time.Now()
	s.mu.Unlock()

	return nil
}

func (s *homeAssistantService) DeleteCategory(ctx context.Context, id uint) error {
	err := s.repo.DeleteCategory(ctx, id)
	if err != nil {
		return err
	}

	s.mu.Lock()
	s.cacheExpiry = time.Now()
	s.mu.Unlock()

	return nil
}
