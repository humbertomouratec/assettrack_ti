package repository

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/assettrack/backend/internal/models"
	"gorm.io/gorm"
)

type HomeAssistantRepository interface {
	ListEntities(ctx context.Context) ([]models.HomeAssistantEntity, error)
	GetEntityByEntityID(ctx context.Context, entityID string) (*models.HomeAssistantEntity, error)
	UpsertEntity(ctx context.Context, entity *models.HomeAssistantEntity) error
	UpdateEntityBinding(ctx context.Context, entityID string, assetID *uint, category string, friendlyName string, isPinned bool, isVisible bool, displayOrder int) error
	SetEntityVisibility(ctx context.Context, entityID string, isVisible bool) error
	DeleteEntity(ctx context.Context, id uint) error
	GetEntitiesByAssetID(ctx context.Context, assetID uint) ([]models.HomeAssistantEntity, error)

	// Categories
	ListCategories(ctx context.Context) ([]models.HomeAssistantCategory, error)
	CreateCategory(ctx context.Context, cat *models.HomeAssistantCategory) error
	UpdateCategory(ctx context.Context, id uint, nome string, icone string, cor string) error
	DeleteCategory(ctx context.Context, id uint) error
}

type homeAssistantRepository struct {
	db *gorm.DB
}

func NewHomeAssistantRepository(db *gorm.DB) HomeAssistantRepository {
	return &homeAssistantRepository{db: db}
}

func (r *homeAssistantRepository) ListEntities(ctx context.Context) ([]models.HomeAssistantEntity, error) {
	var entities []models.HomeAssistantEntity
	err := r.db.WithContext(ctx).
		Preload("Asset").
		Order("is_pinned DESC, display_order ASC, category ASC, friendly_name ASC").
		Find(&entities).Error
	return entities, err
}

func (r *homeAssistantRepository) GetEntityByEntityID(ctx context.Context, entityID string) (*models.HomeAssistantEntity, error) {
	var entity models.HomeAssistantEntity
	err := r.db.WithContext(ctx).
		Preload("Asset").
		Where("entity_id = ?", entityID).
		First(&entity).Error
	if err != nil {
		return nil, err
	}
	return &entity, nil
}

func (r *homeAssistantRepository) UpsertEntity(ctx context.Context, entity *models.HomeAssistantEntity) error {
	now := time.Now()
	entity.UpdatedAt = now

	var existing models.HomeAssistantEntity
	err := r.db.WithContext(ctx).Where("entity_id = ?", entity.EntityID).First(&existing).Error
	if err == nil {
		return r.db.WithContext(ctx).
			Model(&models.HomeAssistantEntity{}).
			Where("id = ?", existing.ID).
			Updates(map[string]interface{}{
				"friendly_name": entity.FriendlyName,
				"domain":        entity.Domain,
				"category":      entity.Category,
				"asset_id":      entity.AssetID,
				"is_pinned":     entity.IsPinned,
				"is_visible":    entity.IsVisible,
				"display_order": entity.DisplayOrder,
				"updated_at":    now,
			}).Error
	}

	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	entity.CreatedAt = now
	return r.db.WithContext(ctx).
		Select("EntityID", "FriendlyName", "Domain", "Category", "AssetID", "IsPinned", "IsVisible", "DisplayOrder", "CreatedAt", "UpdatedAt").
		Create(entity).Error
}

func (r *homeAssistantRepository) UpdateEntityBinding(ctx context.Context, entityID string, assetID *uint, category string, friendlyName string, isPinned bool, isVisible bool, displayOrder int) error {
	domain := ""
	parts := strings.Split(entityID, ".")
	if len(parts) > 0 {
		domain = parts[0]
	}

	entity := models.HomeAssistantEntity{
		EntityID:     entityID,
		Domain:       domain,
		FriendlyName: friendlyName,
		Category:     category,
		AssetID:      assetID,
		IsPinned:     isPinned,
		IsVisible:    isVisible,
		DisplayOrder: displayOrder,
	}

	return r.UpsertEntity(ctx, &entity)
}

func (r *homeAssistantRepository) SetEntityVisibility(ctx context.Context, entityID string, isVisible bool) error {
	domain := ""
	parts := strings.Split(entityID, ".")
	if len(parts) > 0 {
		domain = parts[0]
	}

	now := time.Now()
	res := r.db.WithContext(ctx).
		Model(&models.HomeAssistantEntity{}).
		Where("entity_id = ?", entityID).
		Updates(map[string]interface{}{
			"is_visible": isVisible,
			"updated_at": now,
		})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected > 0 {
		return nil
	}

	entity := models.HomeAssistantEntity{
		EntityID:  entityID,
		Domain:    domain,
		IsVisible: isVisible,
		Category:  "Geral",
		CreatedAt: now,
		UpdatedAt: now,
	}

	return r.db.WithContext(ctx).
		Select("EntityID", "Domain", "IsVisible", "Category", "CreatedAt", "UpdatedAt").
		Create(&entity).Error
}

func (r *homeAssistantRepository) DeleteEntity(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Delete(&models.HomeAssistantEntity{}, id).Error
}

func (r *homeAssistantRepository) GetEntitiesByAssetID(ctx context.Context, assetID uint) ([]models.HomeAssistantEntity, error) {
	var entities []models.HomeAssistantEntity
	err := r.db.WithContext(ctx).
		Where("asset_id = ?", assetID).
		Find(&entities).Error
	return entities, err
}

func (r *homeAssistantRepository) ensureDefaultCategories(ctx context.Context) {
	var count int64
	r.db.WithContext(ctx).Model(&models.HomeAssistantCategory{}).Count(&count)
	if count == 0 {
		defaults := []models.HomeAssistantCategory{
			{Nome: "CPD & Servidores", Icone: "server", Cor: "blue"},
			{Nome: "Nobreak & UPS", Icone: "battery", Cor: "emerald"},
			{Nome: "Energia & Tomadas", Icone: "zap", Cor: "amber"},
			{Nome: "Climatização", Icone: "thermometer", Cor: "cyan"},
			{Nome: "Rede & Telecom", Icone: "wifi", Cor: "indigo"},
			{Nome: "Geral", Icone: "folder", Cor: "slate"},
		}
		for _, d := range defaults {
			r.db.WithContext(ctx).Create(&d)
		}
	}
}

func (r *homeAssistantRepository) ListCategories(ctx context.Context) ([]models.HomeAssistantCategory, error) {
	r.ensureDefaultCategories(ctx)
	var categories []models.HomeAssistantCategory
	err := r.db.WithContext(ctx).Order("nome ASC").Find(&categories).Error
	return categories, err
}

func (r *homeAssistantRepository) CreateCategory(ctx context.Context, cat *models.HomeAssistantCategory) error {
	return r.db.WithContext(ctx).Create(cat).Error
}

func (r *homeAssistantRepository) UpdateCategory(ctx context.Context, id uint, nome string, icone string, cor string) error {
	var oldCat models.HomeAssistantCategory
	if err := r.db.WithContext(ctx).First(&oldCat, id).Error; err != nil {
		return err
	}

	oldName := oldCat.Nome
	oldCat.Nome = nome
	if icone != "" {
		oldCat.Icone = icone
	}
	if cor != "" {
		oldCat.Cor = cor
	}

	if err := r.db.WithContext(ctx).Save(&oldCat).Error; err != nil {
		return err
	}

	// If name changed, migrate existing entities using the old category name
	if oldName != nome {
		r.db.WithContext(ctx).Model(&models.HomeAssistantEntity{}).
			Where("category = ?", oldName).
			Update("category", nome)
	}

	return nil
}

func (r *homeAssistantRepository) DeleteCategory(ctx context.Context, id uint) error {
	var cat models.HomeAssistantCategory
	if err := r.db.WithContext(ctx).First(&cat, id).Error; err != nil {
		return err
	}

	// Update all entities that had this category to "Geral"
	r.db.WithContext(ctx).Model(&models.HomeAssistantEntity{}).
		Where("category = ?", cat.Nome).
		Update("category", "Geral")

	return r.db.WithContext(ctx).Delete(&models.HomeAssistantCategory{}, id).Error
}
