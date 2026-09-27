package repository

import (
	"fmt"
	"strconv"
	"time"

	"github.com/assettrack/backend/internal/models"
	"gorm.io/gorm"
)

type ServiceDeskRepository struct {
	db *gorm.DB
}

func NewServiceDeskRepository(db *gorm.DB) *ServiceDeskRepository {
	return &ServiceDeskRepository{db: db}
}

// ServiceCategory methods
func (r *ServiceDeskRepository) ListCategories() ([]models.ServiceCategory, error) {
	var cats []models.ServiceCategory
	err := r.db.Order("nome asc").Find(&cats).Error
	return cats, err
}

func (r *ServiceDeskRepository) GetCategoryByID(id uint) (*models.ServiceCategory, error) {
	var cat models.ServiceCategory
	err := r.db.First(&cat, id).Error
	if err != nil {
		return nil, err
	}
	return &cat, nil
}

func (r *ServiceDeskRepository) CreateCategory(cat *models.ServiceCategory) error {
	return r.db.Create(cat).Error
}

// ServiceDefinition methods
func (r *ServiceDeskRepository) ListDefinitions() ([]models.ServiceDefinition, error) {
	var defs []models.ServiceDefinition
	err := r.db.Preload("Categoria").Order("nome asc").Find(&defs).Error
	return defs, err
}

func (r *ServiceDeskRepository) GetDefinitionByID(id uint) (*models.ServiceDefinition, error) {
	var def models.ServiceDefinition
	err := r.db.Preload("Categoria").First(&def, id).Error
	if err != nil {
		return nil, err
	}
	return &def, nil
}

func (r *ServiceDeskRepository) CreateDefinition(def *models.ServiceDefinition) error {
	return r.db.Create(def).Error
}

// ServiceTicket methods
func (r *ServiceDeskRepository) ListTickets(solicitanteID *uint, skip, limit int) ([]models.ServiceTicket, error) {
	var tickets []models.ServiceTicket
	query := r.db.Preload("Servico").Preload("Solicitante").Preload("Tecnico").Preload("Interacoes").Preload("Interacoes.Usuario")
	if solicitanteID != nil {
		query = query.Where("solicitante_id = ?", *solicitanteID)
	}
	err := query.Order("data_abertura desc").Offset(skip).Limit(limit).Find(&tickets).Error
	return tickets, err
}

func (r *ServiceDeskRepository) GetTicketByID(id uint) (*models.ServiceTicket, error) {
	var ticket models.ServiceTicket
	// Preload nested interactions and their users, ordering interactions by creation date
	err := r.db.Preload("Servico").
		Preload("Solicitante").
		Preload("Tecnico").
		Preload("Interacoes", func(db *gorm.DB) *gorm.DB {
			return db.Order("service_ticket_interactions.data_criacao asc")
		}).
		Preload("Interacoes.Usuario").
		First(&ticket, id).Error
	if err != nil {
		return nil, err
	}
	return &ticket, nil
}

func (r *ServiceDeskRepository) CreateTicket(ticket *models.ServiceTicket) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		// Generate autocode: CH-YYYY-NNNN
		currentYear := time.Now().Year()
		prefix := fmt.Sprintf("CH-%d-", currentYear)

		var lastTicket models.ServiceTicket
		err := tx.Where("codigo LIKE ?", prefix+"%").
			Order("codigo desc").
			Limit(1).
			Find(&lastTicket).Error

		nextNum := 1
		if err == nil && lastTicket.Codigo != "" {
			// Extract NNNN suffix
			suffixStr := lastTicket.Codigo[len(prefix):]
			if val, parseErr := strconv.Atoi(suffixStr); parseErr == nil {
				nextNum = val + 1
			}
		}

		ticket.Codigo = fmt.Sprintf("%s%04d", prefix, nextNum)
		ticket.DataAbertura = time.Now()
		ticket.DataAtualizacao = time.Now()

		return tx.Create(ticket).Error
	})
}

func (r *ServiceDeskRepository) UpdateTicket(ticket *models.ServiceTicket) error {
	ticket.DataAtualizacao = time.Now()
	return r.db.Save(ticket).Error
}

// ServiceTicketInteraction methods
func (r *ServiceDeskRepository) CreateInteraction(inter *models.ServiceTicketInteraction) error {
	inter.DataCriacao = time.Now()
	return r.db.Create(inter).Error
}

// Service desk notifications
func (r *ServiceDeskRepository) CreateNotification(notification *models.ServiceDeskNotification) error {
	return r.db.Create(notification).Error
}

func (r *ServiceDeskRepository) ListNotificationsByUser(userID uint, limit int) ([]models.ServiceDeskNotification, error) {
	var notifications []models.ServiceDeskNotification
	err := r.db.Preload("Autor").Preload("Ticket").Where("user_id = ?", userID).
		Order("data_criacao desc").Limit(limit).Find(&notifications).Error
	return notifications, err
}

func (r *ServiceDeskRepository) MarkNotificationRead(notificationID, userID uint) error {
	return r.db.Model(&models.ServiceDeskNotification{}).
		Where("id = ? AND user_id = ?", notificationID, userID).
		Update("lida", true).Error
}

func (r *ServiceDeskRepository) MarkTicketNotificationsRead(ticketID uint) error {
	return r.db.Model(&models.ServiceDeskNotification{}).
		Where("ticket_id = ? AND lida = false", ticketID).
		Update("lida", true).Error
}

func (r *ServiceDeskRepository) MarkTicketNotificationsReadForUser(ticketID, userID uint) error {
	return r.db.Model(&models.ServiceDeskNotification{}).
		Where("ticket_id = ? AND user_id = ? AND lida = false", ticketID, userID).
		Update("lida", true).Error
}

func (r *ServiceDeskRepository) MarkAllNotificationsRead(userID uint) error {
	return r.db.Model(&models.ServiceDeskNotification{}).
		Where("user_id = ? AND lida = false", userID).
		Update("lida", true).Error
}
