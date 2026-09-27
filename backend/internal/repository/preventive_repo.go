package repository

import (
	"fmt"
	"regexp"
	"strconv"
	"time"

	"github.com/assettrack/backend/internal/models"
	"gorm.io/gorm"
)

// ---------- Plans ----------

type PMPlanRepository struct {
	db *gorm.DB
}

func NewPMPlanRepository(db *gorm.DB) *PMPlanRepository {
	return &PMPlanRepository{db: db}
}

func (r *PMPlanRepository) List() ([]models.MaintenancePlan, error) {
	var plans []models.MaintenancePlan
	err := r.db.Preload("Responsavel").Preload("Categoria").
		Order("nome asc").Find(&plans).Error
	return plans, err
}

func (r *PMPlanRepository) GetByID(id uint) (*models.MaintenancePlan, error) {
	var plan models.MaintenancePlan
	err := r.db.Preload("Responsavel").Preload("Categoria").
		Preload("Assets.Asset").
		Preload("Checklists", func(db *gorm.DB) *gorm.DB { return db.Order("ordem asc") }).
		Preload("Checklists.Items", func(db *gorm.DB) *gorm.DB { return db.Order("ordem asc") }).
		First(&plan, id).Error
	if err != nil {
		return nil, err
	}
	return &plan, nil
}

func (r *PMPlanRepository) Create(plan *models.MaintenancePlan) error {
	return r.db.Create(plan).Error
}

func (r *PMPlanRepository) Update(plan *models.MaintenancePlan) error {
	return r.db.Save(plan).Error
}

func (r *PMPlanRepository) Delete(id uint) error {
	return r.db.Delete(&models.MaintenancePlan{}, id).Error
}

// GeneratePlanCode creates PLAN-YYYY-NNNNN based on plans created this year.
func (r *PMPlanRepository) GeneratePlanCode(now time.Time) (string, error) {
	year := now.Year()
	var count int64
	if err := r.db.Model(&models.MaintenancePlan{}).
		Where("extract(year from data_criacao) = ?", year).Count(&count).Error; err != nil {
		return "", err
	}
	return fmt.Sprintf("PLAN-%d-%05d", year, count+1), nil
}

// CountNonCancelledOrders returns orders with status != Cancelada.
func (r *PMPlanRepository) CountNonCancelledOrders(planID uint) (int64, error) {
	var count int64
	err := r.db.Model(&models.MaintenanceOrder{}).
		Where("plan_id = ? AND status != ?", planID, models.PMStatusCancelada).Count(&count).Error
	return count, err
}

// ---------- Checklists ----------

type PMChecklistRepository struct {
	db *gorm.DB
}

func NewPMChecklistRepository(db *gorm.DB) *PMChecklistRepository {
	return &PMChecklistRepository{db: db}
}

func (r *PMChecklistRepository) ListByPlan(planID uint) ([]models.MaintenanceChecklist, error) {
	var checklists []models.MaintenanceChecklist
	err := r.db.Preload("Items", func(db *gorm.DB) *gorm.DB { return db.Order("ordem asc") }).
		Where("plan_id = ? AND order_id IS NULL", planID).Order("ordem asc").Find(&checklists).Error
	return checklists, err
}

func (r *PMChecklistRepository) ListByOrder(orderID uint) ([]models.MaintenanceChecklist, error) {
	var checklists []models.MaintenanceChecklist
	err := r.db.Preload("Items", func(db *gorm.DB) *gorm.DB { return db.Order("ordem asc") }).
		Where("order_id = ?", orderID).Order("ordem asc").Find(&checklists).Error
	return checklists, err
}

func (r *PMChecklistRepository) GetByID(id uint) (*models.MaintenanceChecklist, error) {
	var c models.MaintenanceChecklist
	err := r.db.First(&c, id).Error
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *PMChecklistRepository) CountByPlan(planID uint) (int64, error) {
	var count int64
	err := r.db.Model(&models.MaintenanceChecklist{}).Where("plan_id = ?", planID).Count(&count).Error
	return count, err
}

func (r *PMChecklistRepository) Create(c *models.MaintenanceChecklist) error {
	return r.db.Create(c).Error
}

func (r *PMChecklistRepository) Delete(id uint) error {
	return r.db.Delete(&models.MaintenanceChecklist{}, id).Error
}

func (r *PMChecklistRepository) DeleteByOrder(tx *gorm.DB, orderID uint) error {
	db := r.db
	if tx != nil {
		db = tx
	}
	subQuery := db.Model(&models.MaintenanceChecklist{}).Select("id").Where("order_id = ?", orderID)
	if err := db.Where("checklist_id IN (?)", subQuery).Delete(&models.MaintenanceChecklistItem{}).Error; err != nil {
		return err
	}
	return db.Where("order_id = ?", orderID).Delete(&models.MaintenanceChecklist{}).Error
}

// ---------- Checklist Items ----------

type PMChecklistItemRepository struct {
	db *gorm.DB
}

func NewPMChecklistItemRepository(db *gorm.DB) *PMChecklistItemRepository {
	return &PMChecklistItemRepository{db: db}
}

func (r *PMChecklistItemRepository) CountByChecklist(checklistID uint) (int64, error) {
	var count int64
	err := r.db.Model(&models.MaintenanceChecklistItem{}).Where("checklist_id = ?", checklistID).Count(&count).Error
	return count, err
}

func (r *PMChecklistItemRepository) Create(item *models.MaintenanceChecklistItem) error {
	return r.db.Create(item).Error
}

func (r *PMChecklistItemRepository) Delete(id uint) error {
	return r.db.Delete(&models.MaintenanceChecklistItem{}, id).Error
}

func (r *PMChecklistItemRepository) GetByID(id uint) (*models.MaintenanceChecklistItem, error) {
	var item models.MaintenanceChecklistItem
	err := r.db.Preload("Checklist").First(&item, id).Error
	if err != nil {
		return nil, err
	}
	return &item, nil
}

// ---------- Plan Assets ----------

type PMPlanAssetRepository struct {
	db *gorm.DB
}

func NewPMPlanAssetRepository(db *gorm.DB) *PMPlanAssetRepository {
	return &PMPlanAssetRepository{db: db}
}

func (r *PMPlanAssetRepository) GetByPlanAndAsset(planID, assetID uint) (*models.MaintenancePlanAsset, error) {
	var link models.MaintenancePlanAsset
	err := r.db.Where("plan_id = ? AND asset_id = ?", planID, assetID).First(&link).Error
	if err != nil {
		return nil, err
	}
	return &link, nil
}

func (r *PMPlanAssetRepository) Create(link *models.MaintenancePlanAsset) error {
	return r.db.Create(link).Error
}

func (r *PMPlanAssetRepository) Delete(id uint) error {
	return r.db.Delete(&models.MaintenancePlanAsset{}, id).Error
}

// ---------- Orders ----------

type PMOrderRepository struct {
	db *gorm.DB
}

func NewPMOrderRepository(db *gorm.DB) *PMOrderRepository {
	return &PMOrderRepository{db: db}
}

func (r *PMOrderRepository) List(status string, skip, limit int) ([]models.MaintenanceOrder, error) {
	var orders []models.MaintenanceOrder
	q := r.db.Preload("Asset").Preload("Tecnico").Preload("Plan").
		Preload("Checklists", func(db *gorm.DB) *gorm.DB { return db.Order("ordem asc") }).
		Preload("Checklists.Items", func(db *gorm.DB) *gorm.DB { return db.Order("ordem asc") }).
		Preload("Executions")
	if status != "" {
		q = q.Where("status = ?", status)
	}
	err := q.Order("data_abertura desc").Offset(skip).Limit(limit).Find(&orders).Error
	return orders, err
}

func (r *PMOrderRepository) GetByID(id uint) (*models.MaintenanceOrder, error) {
	var order models.MaintenanceOrder
	err := r.db.Preload("Asset").Preload("Tecnico").Preload("Plan").
		Preload("Checklists", func(db *gorm.DB) *gorm.DB { return db.Order("ordem asc") }).
		Preload("Checklists.Items", func(db *gorm.DB) *gorm.DB { return db.Order("ordem asc") }).
		Preload("Executions.ChecklistItem").
		Preload("Materials").
		Preload("Photos").
		Preload("History", func(db *gorm.DB) *gorm.DB { return db.Order("data_hora desc") }).
		Preload("History.Usuario").
		First(&order, id).Error
	if err != nil {
		return nil, err
	}
	return &order, nil
}

func (r *PMOrderRepository) Create(order *models.MaintenanceOrder) error {
	return r.db.Create(order).Error
}

func (r *PMOrderRepository) Update(order *models.MaintenanceOrder) error {
	return r.db.Save(order).Error
}

func (r *PMOrderRepository) Delete(id uint) error {
	return r.db.Delete(&models.MaintenanceOrder{}, id).Error
}

func (r *PMOrderRepository) DeleteCascade(orderID uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("order_id = ?", orderID).Delete(&models.MaintenancePhoto{}).Error; err != nil {
			return err
		}

		if err := tx.Where("order_id = ?", orderID).Delete(&models.MaintenanceMaterial{}).Error; err != nil {
			return err
		}

		if err := tx.Where("order_id = ?", orderID).Delete(&models.MaintenanceExecution{}).Error; err != nil {
			return err
		}

		if err := tx.Where("order_id = ?", orderID).Delete(&models.MaintenanceHistory{}).Error; err != nil {
			return err
		}

		subQuery := tx.Model(&models.MaintenanceChecklist{}).Select("id").Where("order_id = ?", orderID)
		if err := tx.Where("checklist_id IN (?)", subQuery).Delete(&models.MaintenanceChecklistItem{}).Error; err != nil {
			return err
		}

		if err := tx.Where("order_id = ?", orderID).Delete(&models.MaintenanceChecklist{}).Error; err != nil {
			return err
		}

		return tx.Delete(&models.MaintenanceOrder{}, orderID).Error
	})
}

var osNumberRegex = regexp.MustCompile(`OS-\d{4}-(\d+)`)

// GenerateOrderNumber creates OS-YYYY-NNNNN (sequential per year, gap-aware).
func (r *PMOrderRepository) GenerateOrderNumber(now time.Time) (string, error) {
	year := now.Year()
	prefix := fmt.Sprintf("OS-%d-", year)

	var numeros []string
	if err := r.db.Model(&models.MaintenanceOrder{}).
		Where("numero LIKE ?", prefix+"%").Pluck("numero", &numeros).Error; err != nil {
		return "", err
	}

	maxSeq := 0
	for _, num := range numeros {
		m := osNumberRegex.FindStringSubmatch(num)
		if m != nil {
			if val, err := strconv.Atoi(m[1]); err == nil && val > maxSeq {
				maxSeq = val
			}
		}
	}
	return fmt.Sprintf("OS-%d-%05d", year, maxSeq+1), nil
}

func (r *PMOrderRepository) CountByYear(year int) (int64, error) {
	var count int64
	err := r.db.Model(&models.MaintenanceOrder{}).
		Where("extract(year from data_abertura) = ?", year).Count(&count).Error
	return count, err
}

// ExistingOrderToday checks idempotency: an open order for plan+asset created today.
func (r *PMOrderRepository) ExistingOrderToday(planID, assetID uint, todayStart, todayEnd time.Time) (*models.MaintenanceOrder, error) {
	var order models.MaintenanceOrder
	activeStatuses := []string{
		models.PMStatusAberta, models.PMStatusAgendada, models.PMStatusEmAndamento,
		models.PMStatusPausada, models.PMStatusAguardandoPeca,
	}
	err := r.db.Where("plan_id = ? AND asset_id = ?", planID, assetID).
		Where("data_abertura >= ? AND data_abertura < ?", todayStart, todayEnd).
		Where("status IN ?", activeStatuses).
		First(&order).Error
	if err != nil {
		return nil, err
	}
	return &order, nil
}

// ---------- Executions ----------

type PMExecutionRepository struct {
	db *gorm.DB
}

func NewPMExecutionRepository(db *gorm.DB) *PMExecutionRepository {
	return &PMExecutionRepository{db: db}
}

func (r *PMExecutionRepository) GetByOrderAndItem(orderID, itemID uint) (*models.MaintenanceExecution, error) {
	var exec models.MaintenanceExecution
	err := r.db.Where("order_id = ? AND checklist_item_id = ?", orderID, itemID).First(&exec).Error
	if err != nil {
		return nil, err
	}
	return &exec, nil
}

func (r *PMExecutionRepository) Create(exec *models.MaintenanceExecution) error {
	return r.db.Create(exec).Error
}

func (r *PMExecutionRepository) Update(exec *models.MaintenanceExecution) error {
	return r.db.Save(exec).Error
}

// ---------- History ----------

type PMHistoryRepository struct {
	db *gorm.DB
}

func NewPMHistoryRepository(db *gorm.DB) *PMHistoryRepository {
	return &PMHistoryRepository{db: db}
}

func (r *PMHistoryRepository) Create(h *models.MaintenanceHistory) error {
	return r.db.Create(h).Error
}

func (r *PMHistoryRepository) ListByOrder(orderID uint) ([]models.MaintenanceHistory, error) {
	var history []models.MaintenanceHistory
	err := r.db.Preload("Usuario").Where("order_id = ?", orderID).
		Order("data_hora desc").Find(&history).Error
	return history, err
}

// ---------- Materials ----------

type PMMaterialRepository struct {
	db *gorm.DB
}

func NewPMMaterialRepository(db *gorm.DB) *PMMaterialRepository {
	return &PMMaterialRepository{db: db}
}

func (r *PMMaterialRepository) Create(m *models.MaintenanceMaterial) error {
	return r.db.Create(m).Error
}

func (r *PMMaterialRepository) Delete(id uint) error {
	return r.db.Delete(&models.MaintenanceMaterial{}, id).Error
}

func (r *PMMaterialRepository) GetByID(id uint) (*models.MaintenanceMaterial, error) {
	var m models.MaintenanceMaterial
	err := r.db.First(&m, id).Error
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *PMMaterialRepository) SumByOrder(orderID uint) (float64, error) {
	var sum float64
	err := r.db.Model(&models.MaintenanceMaterial{}).
		Where("order_id = ?", orderID).
		Select("COALESCE(SUM(valor_total), 0)").Scan(&sum).Error
	return sum, err
}

// ---------- Photos ----------

type PMPhotoRepository struct {
	db *gorm.DB
}

func NewPMPhotoRepository(db *gorm.DB) *PMPhotoRepository {
	return &PMPhotoRepository{db: db}
}

func (r *PMPhotoRepository) Create(p *models.MaintenancePhoto) error {
	return r.db.Create(p).Error
}

func (r *PMPhotoRepository) Delete(id uint) error {
	return r.db.Delete(&models.MaintenancePhoto{}, id).Error
}

func (r *PMPhotoRepository) GetByID(id uint) (*models.MaintenancePhoto, error) {
	var p models.MaintenancePhoto
	err := r.db.First(&p, id).Error
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// ---------- Notifications ----------

type PMNotificationRepository struct {
	db *gorm.DB
}

func NewPMNotificationRepository(db *gorm.DB) *PMNotificationRepository {
	return &PMNotificationRepository{db: db}
}

func (r *PMNotificationRepository) Create(n *models.MaintenanceNotification) error {
	return r.db.Create(n).Error
}

func (r *PMNotificationRepository) DeleteByOrder(orderID uint) error {
	return r.db.Where("order_id = ?", orderID).Delete(&models.MaintenanceNotification{}).Error
}

func (r *PMNotificationRepository) DeleteByPlan(planID uint) error {
	return r.db.Where("plan_id = ?", planID).Delete(&models.MaintenanceNotification{}).Error
}

func (r *PMNotificationRepository) MarkReadByOrderForUser(orderID, userID uint) error {
	return r.db.Model(&models.MaintenanceNotification{}).
		Where("order_id = ? AND usuario_id = ?", orderID, userID).
		Update("lida", true).Error
}

// ---------- Custom types ----------

type PMCustomTypeRepository struct {
	db *gorm.DB
}

func NewPMCustomTypeRepository(db *gorm.DB) *PMCustomTypeRepository {
	return &PMCustomTypeRepository{db: db}
}

func (r *PMCustomTypeRepository) List() ([]models.CustomMaintenanceType, error) {
	var types []models.CustomMaintenanceType
	err := r.db.Order("nome asc").Find(&types).Error
	return types, err
}

func (r *PMCustomTypeRepository) Create(t *models.CustomMaintenanceType) error {
	return r.db.Create(t).Error
}

func (r *PMCustomTypeRepository) Update(t *models.CustomMaintenanceType) error {
	return r.db.Save(t).Error
}

func (r *PMCustomTypeRepository) Delete(id uint) error {
	return r.db.Delete(&models.CustomMaintenanceType{}, id).Error
}

func (r *PMCustomTypeRepository) GetByID(id uint) (*models.CustomMaintenanceType, error) {
	var t models.CustomMaintenanceType
	err := r.db.First(&t, id).Error
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// ListByUser returns notifications for a user, most recent first.
func (r *PMNotificationRepository) ListByUser(userID uint) ([]models.MaintenanceNotification, error) {
	var notifs []models.MaintenanceNotification
	err := r.db.Where("usuario_id = ?", userID).Order("data_criacao desc").Limit(50).Find(&notifs).Error
	return notifs, err
}

// MarkAllRead marks all of a user's notifications as read.
func (r *PMNotificationRepository) MarkAllRead(userID uint) error {
	return r.db.Model(&models.MaintenanceNotification{}).
		Where("usuario_id = ? AND lida = false", userID).
		Update("lida", true).Error
}

// MarkRead marks one notification as read only when it belongs to the user.
func (r *PMNotificationRepository) MarkRead(userID, notificationID uint) error {
	return r.db.Model(&models.MaintenanceNotification{}).
		Where("id = ? AND usuario_id = ?", notificationID, userID).
		Update("lida", true).Error
}
