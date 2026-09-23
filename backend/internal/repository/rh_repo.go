package repository

import (
	"github.com/assettrack/backend/internal/models"
	"gorm.io/gorm"
	"time"
)

type RHRepository struct {
	db *gorm.DB
}

func (r *RHRepository) ListStatuses() ([]models.RHStatus, error) {
	var statuses []models.RHStatus
	err := r.db.Preload("Usuario.Departamento").Preload("CriadoPor").Order("inicio desc, created_at desc").Find(&statuses).Error
	return statuses, err
}

func (r *RHRepository) ListStatusesForUser(userID uint) ([]models.RHStatus, error) {
	var statuses []models.RHStatus
	err := r.db.Where("usuario_id = ?", userID).Order("inicio asc").Find(&statuses).Error
	return statuses, err
}

func (r *RHRepository) CreateStatus(status *models.RHStatus) error { return r.db.Create(status).Error }
func (r *RHRepository) DeleteStatus(id uint) error                 { return r.db.Delete(&models.RHStatus{}, id).Error }

func (r *RHRepository) ListComunicados() ([]models.RHComunicado, error) {
	var comunicados []models.RHComunicado
	err := r.db.Preload("Usuario").Preload("Departamento").Preload("CriadoPor").Order("inicio desc, created_at desc").Find(&comunicados).Error
	return comunicados, err
}

func (r *RHRepository) ListComunicadosForUser(userID uint, departamentoID *uint, now time.Time) ([]models.RHComunicado, error) {
	var comunicados []models.RHComunicado
	query := r.db.Preload("CriadoPor").Preload("Departamento").Where("ativo = true AND inicio <= ? AND (fim IS NULL OR fim >= ?)", now, now)
	if departamentoID != nil && *departamentoID > 0 {
		query = query.Where("( (usuario_id IS NULL AND departamento_id IS NULL) OR usuario_id = ? OR departamento_id = ? )", userID, *departamentoID)
	} else {
		query = query.Where("( (usuario_id IS NULL AND departamento_id IS NULL) OR usuario_id = ? )", userID)
	}
	err := query.Order("inicio desc").Find(&comunicados).Error
	return comunicados, err
}

func (r *RHRepository) CreateComunicado(comunicado *models.RHComunicado) error {
	return r.db.Create(comunicado).Error
}
func (r *RHRepository) DeleteComunicado(id uint) error {
	return r.db.Delete(&models.RHComunicado{}, id).Error
}

func (r *RHRepository) ListReadComunicadoIDs(userID uint) ([]uint, error) {
	var ids []uint
	err := r.db.Model(&models.RHComunicadoLeitura{}).Where("usuario_id = ?", userID).Pluck("comunicado_id", &ids).Error
	return ids, err
}

func (r *RHRepository) MarkComunicadoRead(comunicadoID, userID uint) error {
	item := models.RHComunicadoLeitura{ComunicadoID: comunicadoID, UsuarioID: userID}
	return r.db.Where("comunicado_id = ? AND usuario_id = ?", comunicadoID, userID).FirstOrCreate(&item).Error
}

func NewRHRepository(db *gorm.DB) *RHRepository {
	return &RHRepository{db: db}
}

func (r *RHRepository) ListTermos() ([]models.TermoResponsabilidade, error) {
	var termos []models.TermoResponsabilidade
	err := r.db.Preload("Usuario").Preload("Asset").Preload("Solicitacao").Find(&termos).Error
	return termos, err
}

func (r *RHRepository) GetTermoByID(id uint) (*models.TermoResponsabilidade, error) {
	var termo models.TermoResponsabilidade
	err := r.db.Preload("Usuario").Preload("Asset").Preload("Solicitacao").First(&termo, id).Error
	return &termo, err
}

func (r *RHRepository) CreateTermo(termo *models.TermoResponsabilidade) error {
	return r.db.Create(termo).Error
}

func (r *RHRepository) UpdateTermo(termo *models.TermoResponsabilidade) error {
	return r.db.Save(termo).Error
}

func (r *RHRepository) GetPendingSolicitacoesRH() ([]models.Solicitacao, error) {
	var solicitacoes []models.Solicitacao
	// Solicitacoes Entregues that do not have a termo yet
	subQuery := r.db.Model(&models.TermoResponsabilidade{}).Select("solicitacao_id").Where("solicitacao_id IS NOT NULL")
	err := r.db.Preload("Solicitante").Preload("Asset").
		Joins("JOIN assets ON assets.id = solicitacoes.asset_id").
		Where("solicitacoes.status = ?", "Entregue").
		Where("assets.requer_termo_rh = ?", true).
		Where("solicitacoes.id NOT IN (?)", subQuery).
		Find(&solicitacoes).Error
	return solicitacoes, err
}

func (r *RHRepository) GetSolicitacaoWithDetails(id uint) (*models.Solicitacao, error) {
	var sol models.Solicitacao
	err := r.db.Preload("Solicitante").Preload("Asset").First(&sol, id).Error
	return &sol, err
}
