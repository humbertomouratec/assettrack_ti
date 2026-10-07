package main

import (
	"fmt"
	"log"
	"time"

	"github.com/assettrack/backend/internal/config"
	"github.com/assettrack/backend/internal/database"
	"github.com/assettrack/backend/internal/models"
	"github.com/assettrack/backend/internal/repository"
	"github.com/assettrack/backend/internal/router"
	"github.com/assettrack/backend/internal/service"
	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	// Load .env (ignore error if not present — env vars may come from Docker)
	_ = godotenv.Load()

	cfg := config.Load()

	// Connect databases
	db := database.ConnectPostgres(cfg.DatabaseURL)
	rdb := database.ConnectRedis(cfg.RedisURL)

	// Auto-migrate (safe: doesn't drop columns or tables)
	log.Println("🔄 Running auto-migration...")
	if err := db.AutoMigrate(
		&models.User{},
		&models.QRLog{},
		&models.Departamento{},
		&models.Localizacao{},
		&models.Armazenamento{},
		&models.Fornecedor{},
		&models.NotaFiscal{},
		&models.AssetCategory{},
		&models.Asset{},
		&models.ServiceCategory{},
		&models.ServiceDefinition{},
		&models.ServiceTicket{},
		&models.ServiceTicketInteraction{},
		&models.ServiceDeskNotification{},
		&models.SolicitacaoManutencao{},
		&models.Manutencao{},
		&models.Movimentacao{},
		&models.Solicitacao{},
		&models.MaintenancePlan{},
		&models.MaintenancePlanAsset{},
		&models.MaintenanceChecklist{},
		&models.MaintenanceChecklistItem{},
		&models.MaintenanceOrder{},
		&models.MaintenanceExecution{},
		&models.MaintenanceMaterial{},
		&models.MaintenancePhoto{},
		&models.MaintenanceHistory{},
		&models.MaintenanceNotification{},
		&models.CustomMaintenanceType{},
		&models.KanbanProject{},
		&models.KanbanProjectFavorite{},
		&models.KanbanColumn{},
		&models.KanbanCard{},
		&models.KanbanCardInteraction{},
		&models.KanbanAttachment{},
		&models.KanbanNotification{},
		&models.EmergencyAlert{},
		&models.Aviso{},
		&models.PurchaseCategory{},
		&models.PurchaseUnit{},
		&models.PurchaseProduct{},
		&models.CostCenter{},
		&models.PurchaseRequest{},
		&models.PurchaseRequestItem{},
		&models.PurchaseApproval{},
		&models.PurchaseQuotation{},
		&models.PurchaseQuotationSupplier{},
		&models.PurchaseQuotationItem{},
		&models.PurchaseOrder{},
		&models.PurchaseOrderItem{},
		&models.PurchaseReceiving{},
		&models.PurchaseReceivingItem{},
		&models.ContractType{},
		&models.PurchaseContract{},
		&models.PurchaseAttachment{},
		&models.PurchaseHistory{},
		&models.PurchaseNotification{},
		&models.MaterialStock{},
		&models.MaterialStockTransaction{},
		&models.PurchaseResearch{},
		&models.PurchaseResearchItem{},
		&models.KanbanAttachment{},
		&models.TermoResponsabilidade{},
		&models.RHStatus{},
		&models.RHComunicado{},
		&models.RHComunicadoLeitura{},
		&models.RHMensagem{},
		&models.Webhook{},
		&models.WebhookLog{},
		&models.SystemSetting{},
		&models.EmailLog{},
		&models.UserGamificationProfile{},
		&models.GamificationActivityLog{},
		&models.GamificationBadge{},
		&models.UserBadge{},
		&models.HomeAssistantEntity{},
		&models.HomeAssistantCategory{},
	); err != nil {
		log.Fatalf("❌ Auto-migration failed: %v", err)
	}

	if db.Migrator().HasColumn(&models.ServiceTicket{}, "titulo") {
		log.Println("🧹 Removing legacy service_tickets.titulo column...")
		if err := db.Migrator().DropColumn(&models.ServiceTicket{}, "titulo"); err != nil {
			log.Printf("⚠️ Failed to remove legacy service_tickets.titulo column: %v", err)
		}
	}

	log.Println("✅ Migration complete")

	// Seed Admin user
	var count int64
	db.Model(&models.User{}).Where("email = ?", "admin@example.com").Count(&count)
	if count == 0 {
		log.Println("👤 Seeding default admin user...")
		hash, err := bcrypt.GenerateFromPassword([]byte("admin"), bcrypt.DefaultCost)
		if err != nil {
			log.Fatalf("Failed to hash default admin password: %v", err)
		}
		adminMat := "AAAA001"
		adminCargo := "Super Admin"
		admin := &models.User{
			Email:          "admin@example.com",
			Nome:           "Administrador",
			HashedPassword: string(hash),
			Role:           models.RoleAdmin,
			IsActive:       true,
			Matricula:      &adminMat,
			Cargo:          &adminCargo,
		}
		if err := db.Create(admin).Error; err != nil {
			log.Printf("⚠️ Failed to seed admin user: %v", err)
		} else {
			log.Println("✅ Default admin user created (admin@example.com / admin)")
		}
	}

	// Start preventive maintenance scheduler (generates orders from due plans)
	scheduler := service.NewMaintenanceScheduler(
		db,
		repository.NewPMPlanRepository(db),
		repository.NewPMPlanAssetRepository(db),
		repository.NewPMOrderRepository(db),
		repository.NewPMHistoryRepository(db),
		repository.NewPMNotificationRepository(db),
		repository.NewAssetCategoryRepository(db),
		repository.NewSystemSettingsRepository(db),
	)
	scheduler.Start(time.Hour)

	// Setup router
	r := router.Setup(db, rdb, cfg)

	// Start server
	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("🚀 %s API starting on %s", cfg.ProjectName, addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
