package repository

import (
	"time"

	"github.com/assettrack/backend/internal/models"
	"gorm.io/gorm"
)

type MaintenanceRepository struct {
	db *gorm.DB
}

func NewMaintenanceRepository(db *gorm.DB) *MaintenanceRepository {
	return &MaintenanceRepository{db: db}
}

// SolicitacaoManutencao methods
func (r *MaintenanceRepository) ListRequests(userID *uint, skip, limit int) ([]models.SolicitacaoManutencao, error) {
	var reqs []models.SolicitacaoManutencao
	query := r.db.Model(&models.SolicitacaoManutencao{}).
		Preload("Solicitante").
		Preload("Responsavel").
		Preload("Asset").
		Preload("Asset.CurrentLocal").
		Preload("Asset.CurrentArmazenamento").
		Preload("Asset.PrevLocal").
		Preload("Asset.PrevArmazenamento").
		Preload("Manutencao")

	if userID != nil {
		query = query.Where("solicitante_id = ?", *userID)
	}

	err := query.Order("data_solicitacao desc").
		Offset(skip).
		Limit(limit).
		Find(&reqs).Error
	return reqs, err
}

func (r *MaintenanceRepository) GetRequestByID(id uint) (*models.SolicitacaoManutencao, error) {
	var req models.SolicitacaoManutencao
	err := r.db.Preload("Solicitante").
		Preload("Responsavel").
		Preload("Asset").
		Preload("Asset.CurrentLocal").
		Preload("Asset.CurrentArmazenamento").
		Preload("Asset.PrevLocal").
		Preload("Asset.PrevArmazenamento").
		Preload("Manutencao").
		First(&req, id).Error
	if err != nil {
		return nil, err
	}
	return &req, nil
}

func (r *MaintenanceRepository) CreateRequest(req *models.SolicitacaoManutencao) error {
	req.DataSolicitacao = time.Now()
	return r.db.Create(req).Error
}

func (r *MaintenanceRepository) UpdateRequest(req *models.SolicitacaoManutencao) error {
	return r.db.Save(req).Error
}

// Manutencao methods
func (r *MaintenanceRepository) GetMaintenanceByID(id uint) (*models.Manutencao, error) {
	var maint models.Manutencao
	err := r.db.Preload("Asset").
		Preload("Asset.CurrentLocal").
		Preload("Asset.CurrentArmazenamento").
		Preload("Asset.PrevLocal").
		Preload("Asset.PrevArmazenamento").
		Preload("Responsavel").
		Preload("DestinoUser").
		First(&maint, id).Error
	if err != nil {
		return nil, err
	}
	return &maint, nil
}

func (r *MaintenanceRepository) CreateMaintenance(maint *models.Manutencao) error {
	maint.DataEntrada = time.Now()
	return r.db.Create(maint).Error
}

func (r *MaintenanceRepository) UpdateMaintenance(maint *models.Manutencao) error {
	return r.db.Save(maint).Error
}
