package repository

import (
	"time"

	"github.com/assettrack/backend/internal/models"
	"gorm.io/gorm"
)

type TransactionRepository struct {
	db *gorm.DB
}

func NewTransactionRepository(db *gorm.DB) *TransactionRepository {
	return &TransactionRepository{db: db}
}

// Movimentacao methods
func (r *TransactionRepository) ListMovements(skip, limit int) ([]models.Movimentacao, error) {
	var movs []models.Movimentacao
	err := r.db.Preload("Asset").
		Preload("DeUser").
		Preload("ParaUser").
		Order("data desc").
		Offset(skip).
		Limit(limit).
		Find(&movs).Error
	return movs, err
}

func (r *TransactionRepository) CreateMovement(mov *models.Movimentacao) error {
	mov.Data = time.Now()
	return r.db.Create(mov).Error
}

// Solicitacao methods
func (r *TransactionRepository) ListSolicitacoes(userID *uint, skip, limit int) ([]models.Solicitacao, error) {
	var sols []models.Solicitacao
	query := r.db.Model(&models.Solicitacao{}).
		Preload("Solicitante").
		Preload("Aprovador").
		Preload("Confirmador").
		Preload("Recebedor").
		Preload("Asset").
		Preload("Asset.Categoria").
		Preload("Termo")

	if userID != nil {
		query = query.Where("solicitante_id = ?", *userID)
	}

	err := query.Order("data_solicitacao desc").
		Offset(skip).
		Limit(limit).
		Find(&sols).Error
	return sols, err
}

func (r *TransactionRepository) GetSolicitacaoByID(id uint) (*models.Solicitacao, error) {
	var sol models.Solicitacao
	err := r.db.Preload("Solicitante").
		Preload("Aprovador").
		Preload("Confirmador").
		Preload("Recebedor").
		Preload("Asset").
		Preload("Asset.Categoria").
		Preload("Termo").
		First(&sol, id).Error
	if err != nil {
		return nil, err
	}
	return &sol, nil
}

func (r *TransactionRepository) CreateSolicitacao(sol *models.Solicitacao) error {
	sol.DataSolicitacao = time.Now()
	return r.db.Create(sol).Error
}

func (r *TransactionRepository) UpdateSolicitacao(sol *models.Solicitacao) error {
	return r.db.Save(sol).Error
}

func (r *TransactionRepository) GetActiveSolicitacaoByAssetID(assetID uint) (*models.Solicitacao, error) {
	var sol models.Solicitacao
	err := r.db.Preload("Solicitante").
		Preload("Aprovador").
		Preload("Confirmador").
		Preload("Recebedor").
		Preload("Asset").
		Preload("Termo").
		Where("asset_id = ? AND status IN (?)", assetID, []string{string(models.StatusSolicitacaoEntregue), string(models.StatusSolicitacaoAprovada)}).
		Order("data_entrega desc, data_solicitacao desc").
		First(&sol).Error
	if err != nil {
		return nil, err
	}
	return &sol, nil
}
