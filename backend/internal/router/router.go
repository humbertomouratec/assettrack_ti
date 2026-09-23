package router

import (
	"github.com/assettrack/backend/internal/config"
	"github.com/assettrack/backend/internal/handler"
	"github.com/assettrack/backend/internal/middleware"
	"github.com/assettrack/backend/internal/repository"
	"github.com/assettrack/backend/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

func Setup(db *gorm.DB, rdb *redis.Client, cfg *config.Config) *gin.Engine {
	if cfg.GinMode == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.Use(gin.Logger())
	r.Use(gin.Recovery())
	r.Use(middleware.CORSMiddleware())
	r.Use(middleware.SecurityHeaders())
	r.Use(middleware.ProcessTime())
	r.Static("/uploads", "./uploads")

	// Repositories
	userRepo := repository.NewUserRepository(db)
	qrLogRepo := repository.NewQRLogRepository(db)
	categoryRepo := repository.NewAssetCategoryRepository(db)
	assetRepo := repository.NewAssetRepository(db)
	serviceDeskRepo := repository.NewServiceDeskRepository(db)
	maintRepo := repository.NewMaintenanceRepository(db)
	txRepo := repository.NewTransactionRepository(db)
	supplierRepo := repository.NewSupplierRepository(db)
	invoiceRepo := repository.NewInvoiceRepository(db)
	pmPlanRepo := repository.NewPMPlanRepository(db)
	pmChecklistRepo := repository.NewPMChecklistRepository(db)
	pmItemRepo := repository.NewPMChecklistItemRepository(db)
	pmPlanAssetRepo := repository.NewPMPlanAssetRepository(db)
	pmOrderRepo := repository.NewPMOrderRepository(db)
	pmExecRepo := repository.NewPMExecutionRepository(db)
	pmHistoryRepo := repository.NewPMHistoryRepository(db)
	pmMaterialRepo := repository.NewPMMaterialRepository(db)
	pmPhotoRepo := repository.NewPMPhotoRepository(db)
	pmNotifRepo := repository.NewPMNotificationRepository(db)
	pmCustomTypeRepo := repository.NewPMCustomTypeRepository(db)
	kanbanProjectRepo := repository.NewKanbanProjectRepository(db)
	kanbanColumnRepo := repository.NewKanbanColumnRepository(db)
	kanbanCardRepo := repository.NewKanbanCardRepository(db)
	kanbanInteractionRepo := repository.NewKanbanInteractionRepository(db)
	kanbanAttachmentRepo := repository.NewKanbanAttachmentRepository(db)
	kanbanNotifRepo := repository.NewKanbanNotificationRepository(db)
	kanbanBroker := handler.NewKanbanSSEBroker()
	procCategoryRepo := repository.NewProcurementCategoryRepository(db)
	procProductRepo := repository.NewProcurementProductRepository(db)
	procCCRepo := repository.NewProcurementCostCenterRepository(db)
	procRequestRepo := repository.NewProcurementRequestRepository(db)
	procApprovalRepo := repository.NewProcurementApprovalRepository(db)
	procQuotationRepo := repository.NewProcurementQuotationRepository(db)
	procOrderRepo := repository.NewProcurementOrderRepository(db)
	procReceivingRepo := repository.NewProcurementReceivingRepository(db)
	procStockRepo := repository.NewProcurementStockRepository(db)
	procContractRepo := repository.NewProcurementContractRepository(db)
	procContractTypeRepo := repository.NewProcurementContractTypeRepository(db)
	procHistoryRepo := repository.NewProcurementHistoryRepository(db)
	procNotifRepo := repository.NewProcurementNotificationRepository(db)
	procResearchRepo := repository.NewProcurementResearchRepository(db)
	alertRepo := repository.NewEmergencyAlertRepository(db)
	avisoRepo := repository.NewAvisoRepository(db)
	alertBroker := handler.NewAlertSSEBroker()
	rhRepo := repository.NewRHRepository(db)
	webhookRepo := repository.NewWebhookRepository(db)
	systemSettingsRepo := repository.NewSystemSettingsRepository(db)
	emailLogRepo := repository.NewEmailLogRepository(db)

	// Services
	authSvc := service.NewAuthService(userRepo, cfg)
	qrSvc := service.NewQRService()
	qrLogSvc := service.NewQRLogService(qrLogRepo)
	webhookDispatcher := service.NewWebhookDispatcher(webhookRepo)
	aiSvc := service.NewAIService(systemSettingsRepo)
	emailSvc := service.NewEmailService(systemSettingsRepo, emailLogRepo)

	// Rate limiter
	rateLimiter := middleware.NewRateLimiter(rdb)

	// Handlers
	authHandler := handler.NewAuthHandler(authSvc, userRepo)
	userHandler := handler.NewUserHandler(userRepo, authSvc, qrSvc)
	qrHandler := handler.NewQRHandler(userRepo, authSvc, qrSvc, qrLogSvc, txRepo, maintRepo, assetRepo)
	assetHandler := handler.NewAssetHandler(assetRepo, categoryRepo)
	serviceDeskHandler := handler.NewServiceDeskHandler(serviceDeskRepo, userRepo, systemSettingsRepo, emailSvc)
	maintenanceHandler := handler.NewMaintenanceHandler(maintRepo, assetRepo, txRepo)
	transactionHandler := handler.NewTransactionHandler(txRepo, assetRepo, userRepo)
	supplierHandler := handler.NewSupplierHandler(supplierRepo, invoiceRepo)
	preventiveHandler := handler.NewPreventiveHandler(
		pmPlanRepo, pmChecklistRepo, pmItemRepo, pmPlanAssetRepo, pmOrderRepo,
		pmExecRepo, pmHistoryRepo, pmMaterialRepo, pmPhotoRepo, pmNotifRepo,
		pmCustomTypeRepo, assetRepo, userRepo, categoryRepo, procStockRepo,
		systemSettingsRepo, emailSvc,
	)
	kanbanHandler := handler.NewKanbanHandler(
		kanbanProjectRepo, kanbanColumnRepo, kanbanCardRepo, kanbanInteractionRepo,
		kanbanAttachmentRepo, kanbanNotifRepo, userRepo, kanbanBroker,
		systemSettingsRepo, emailSvc,
	)
	alertsHandler := handler.NewAlertsHandler(alertRepo, avisoRepo, userRepo, assetRepo, alertBroker, webhookDispatcher)
	procurementHandler := handler.NewProcurementHandler(
		procCategoryRepo, procProductRepo, procCCRepo, procRequestRepo, procApprovalRepo,
		procQuotationRepo, procOrderRepo, procReceivingRepo, procStockRepo,
		procContractRepo, procContractTypeRepo, procHistoryRepo, procNotifRepo,
		procResearchRepo, invoiceRepo, assetRepo, userRepo, kanbanProjectRepo, kanbanCardRepo, kanbanInteractionRepo, kanbanBroker, systemSettingsRepo, emailSvc,
	)
	rhHandler := handler.NewRHHandler(rhRepo, userRepo, assetRepo, alertRepo, alertBroker, emailSvc)
	webhookHandler := handler.NewWebhookHandler(webhookRepo, webhookDispatcher)
	backupHandler := handler.NewBackupHandler(cfg)
	dashboardHandler := handler.NewDashboardHandler(db, rdb)
	settingsHandler := handler.NewSettingsHandler(systemSettingsRepo, emailSvc)
	emailLogHandler := handler.NewEmailLogHandler(emailLogRepo)
	aiHandler := handler.NewAIHandler(aiSvc)
	appHandler := handler.NewAppHandler()

	// Auth middleware helper
	authMW := middleware.AuthMiddleware(authSvc, userRepo)
	rActive := middleware.RequireActive()
	rAdmin := middleware.RequireAdmin()
	rManager := middleware.RequireManagerOrAbove()
	rManagerOrRH := middleware.RequireManagerOrRH()
	rRH := middleware.RequireRH()

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// API v1
	v1 := r.Group("/api/v1")
	{
		// App & APK Download routes (public)
		appGroup := v1.Group("/app")
		{
			appGroup.GET("/version", appHandler.GetAppVersion)
			appGroup.GET("/download", appHandler.DownloadAPK)
		}

		// Auth routes (public)
		auth := v1.Group("/auth")
		{
			auth.POST("/login", rateLimiter.Limit("login"), authHandler.Login)
			auth.POST("/register", authMW, rActive, rAdmin, authHandler.Register)
			auth.GET("/me", authMW, rActive, authHandler.Me)
		}

		// User routes (protected)
		users := v1.Group("/users", authMW, rActive)
		{
			users.GET("", rManagerOrRH, userHandler.List)
			users.POST("", rAdmin, userHandler.Create)
			users.GET("/:id/relatorio", rManagerOrRH, userHandler.HistoryReport)
			users.GET("/:id", userHandler.GetByID)
			users.PUT("/:id", rAdmin, userHandler.Update)
			users.DELETE("/:id", rAdmin, userHandler.Delete)
		}

		// Asset routes (protected)
		assets := v1.Group("/assets", authMW, rActive)
		{
			assets.GET("/referencias", assetHandler.GetReferences)
			assets.POST("/categorias", rManager, assetHandler.CreateCategoria)
			assets.PUT("/categorias/:id", rManager, assetHandler.UpdateCategoria)
			assets.DELETE("/categorias/:id", rManager, assetHandler.DeleteCategoria)
			assets.POST("/localizacoes", rManager, assetHandler.CreateLocalizacao)
			assets.PUT("/localizacoes/:id", rManager, assetHandler.UpdateLocalizacao)
			assets.DELETE("/localizacoes/:id", rManager, assetHandler.DeleteLocalizacao)
			assets.POST("/armazenamentos", rManager, assetHandler.CreateArmazenamento)
			assets.POST("/departamentos", rManager, assetHandler.CreateDepartamento)
			assets.DELETE("/departamentos/:id", rManager, assetHandler.DeleteDepartamento)
			assets.GET("", assetHandler.List)
			assets.GET("/export.csv", assetHandler.ExportCSV)
			assets.POST("/import.csv", rManager, assetHandler.ImportCSV)
			assets.POST("/upload-datasheet", rManager, assetHandler.UploadDatasheet)
			assets.POST("", rManager, assetHandler.Create)
			assets.POST("/bulk", rManager, assetHandler.BulkDuplicate)
			assets.GET("/:id", assetHandler.GetByID)
			assets.GET("/:id/historico", assetHandler.GetAssetHistory)
			assets.PUT("/:id", rManager, assetHandler.Update)
			assets.DELETE("/:id", rAdmin, assetHandler.Delete)
			assets.GET("/:id/qrcode", assetHandler.GetQRCode)
			assets.GET("/:id/datasheet", assetHandler.DownloadDatasheet)
			assets.POST("/scan-qr", assetHandler.ScanQRCode)
		}

		// Service Desk routes (protected)
		servicos := v1.Group("/servicos", authMW, rActive)
		{
			servicos.GET("/categorias", serviceDeskHandler.ListCategories)
			servicos.POST("/categorias", rManager, serviceDeskHandler.CreateCategory)
			servicos.GET("/definicoes", serviceDeskHandler.ListDefinitions)
			servicos.POST("/definicoes", rManager, serviceDeskHandler.CreateDefinition)
			servicos.GET("/chamados", serviceDeskHandler.ListTickets)
			servicos.POST("/chamados", serviceDeskHandler.CreateTicket)
			servicos.POST("/chamados/upload", serviceDeskHandler.UploadTicketAttachment)
			servicos.GET("/chamados/:id", serviceDeskHandler.GetTicketByID)
			servicos.PUT("/chamados/:id", serviceDeskHandler.UpdateTicket)
			servicos.POST("/chamados/:id/interacoes", serviceDeskHandler.CreateInteraction)
			servicos.POST("/chamados/:id/interacoes/upload", serviceDeskHandler.UploadInteractionAttachment)
			servicos.GET("/notificacoes", serviceDeskHandler.MyNotifications)
			servicos.POST("/notificacoes/:id/lida", serviceDeskHandler.MarkNotificationRead)
			servicos.POST("/notificacoes/lidas", serviceDeskHandler.MarkNotificationsRead)
		}

		// Maintenance routes (protected)
		maint := v1.Group("/solicitacoes-manutencao", authMW, rActive)
		{
			maint.GET("", maintenanceHandler.ListRequests)
			maint.POST("", maintenanceHandler.CreateRequest)
			maint.GET("/:id", maintenanceHandler.GetRequestByID)
			maint.POST("/:id/aceitar", rManager, maintenanceHandler.AcceptRequest)
			maint.POST("/:id/rejeitar", rManager, maintenanceHandler.RejectRequest)
			maint.POST("/:id/concluir", rManager, maintenanceHandler.ConcludeRequest)
			maint.POST("/:id/confirmar-recebimento", maintenanceHandler.ConfirmReceipt)
		}

		// Borrowing requests routes (protected)
		sols := v1.Group("/solicitacoes", authMW, rActive)
		{
			sols.GET("", transactionHandler.ListSolicitacoes)
			sols.POST("", transactionHandler.CreateSolicitacao)
			sols.PUT("/:id/approve", rManager, transactionHandler.ApproveSolicitacao)
			sols.PUT("/:id/reject", rManager, transactionHandler.RejectSolicitacao)
		}

		// Movimentacoes routes (protected)
		movs := v1.Group("/movimentacoes", authMW, rActive)
		{
			movs.POST("/transferir/:asset_id", rManager, transactionHandler.TransferirAsset)
			movs.POST("/devolver/:asset_id", transactionHandler.DevolverAsset)
		}

		// Supplier routes (protected: admin, gerente, gerente_infra, comprador)
		rSupplier := middleware.RequireSupplierManager()
		fornecedores := v1.Group("/fornecedores", authMW, rActive)
		{
			fornecedores.GET("", supplierHandler.List)
			fornecedores.POST("", rSupplier, supplierHandler.Create)
			fornecedores.GET("/:id", supplierHandler.GetByID)
			fornecedores.PUT("/:id", rSupplier, supplierHandler.Update)
			fornecedores.DELETE("/:id", rSupplier, supplierHandler.Delete)
			fornecedores.GET("/:id/notas-fiscais", supplierHandler.ListInvoices)
			fornecedores.POST("/:id/notas-fiscais/upload", rSupplier, supplierHandler.UploadInvoice)
		}

		// Notas fiscais routes (protected)
		notas := v1.Group("/notas-fiscais", authMW, rActive)
		{
			notas.POST("/parse-xml", rSupplier, supplierHandler.ParseXML)
			notas.GET("/:id", supplierHandler.GetInvoice)
			notas.DELETE("/:id", rSupplier, supplierHandler.DeleteInvoice)
		}

		// Preventive maintenance routes (protected)
		preventiva := v1.Group("/preventiva", authMW, rActive, middleware.RequireFeature(systemSettingsRepo, "preventive_maintenance_enabled", true))
		{
			preventiva.GET("/dashboard", preventiveHandler.Dashboard)
			preventiva.GET("/notificacoes", preventiveHandler.MyNotifications)
			preventiva.POST("/notificacoes/:id/lida", preventiveHandler.MarkNotificationRead)
			preventiva.POST("/notificacoes/lidas", preventiveHandler.MarkNotificationsRead)

			preventiva.GET("/planos", preventiveHandler.ListPlans)
			preventiva.POST("/planos", rManager, preventiveHandler.CreatePlan)
			preventiva.GET("/planos/:id", preventiveHandler.GetPlan)
			preventiva.PUT("/planos/:id", rManager, preventiveHandler.UpdatePlan)
			preventiva.DELETE("/planos/:id", rManager, preventiveHandler.DeletePlan)
			preventiva.POST("/planos/:id/checklists", rManager, preventiveHandler.AddChecklist)
			preventiva.DELETE("/planos/:id/checklists/:checklistId", rManager, preventiveHandler.DeleteChecklist)
			preventiva.POST("/planos/:id/checklists/:checklistId/items", rManager, preventiveHandler.AddChecklistItem)
			preventiva.DELETE("/planos/:id/checklists/:checklistId/items/:itemId", rManager, preventiveHandler.DeleteChecklistItem)
			preventiva.POST("/planos/:id/assets", rManager, preventiveHandler.AddPlanAsset)
			preventiva.DELETE("/planos/:id/assets/:linkId", rManager, preventiveHandler.RemovePlanAsset)

			preventiva.GET("/ordens", preventiveHandler.ListOrders)
			preventiva.POST("/ordens", rManager, preventiveHandler.CreateOrder)
			preventiva.GET("/ordens/:id", preventiveHandler.GetOrder)
			preventiva.PUT("/ordens/:id", rManager, preventiveHandler.UpdateOrder)
			preventiva.DELETE("/ordens/:id", rManager, preventiveHandler.DeleteOrder)
			preventiva.POST("/ordens/:id/iniciar", preventiveHandler.StartOrder)
			preventiva.POST("/ordens/:id/pausar", preventiveHandler.PauseOrder)
			preventiva.POST("/ordens/:id/concluir", preventiveHandler.CompleteOrder)
			preventiva.POST("/ordens/:id/cancelar", rManager, preventiveHandler.CancelOrder)
			preventiva.POST("/ordens/:id/executar-checklist", preventiveHandler.ExecuteChecklistItem)
			preventiva.GET("/ordens/:id/historico", preventiveHandler.OrderHistory)
			preventiva.POST("/ordens/:id/materiais", preventiveHandler.AddOrderMaterial)
			preventiva.DELETE("/ordens/:id/materiais/:materialId", preventiveHandler.RemoveOrderMaterial)
			preventiva.POST("/ordens/:id/fotos", preventiveHandler.UploadOrderPhoto)
			preventiva.DELETE("/ordens/:id/fotos/:photoId", preventiveHandler.DeleteOrderPhoto)

			preventiva.GET("/tipos", preventiveHandler.ListCustomTypes)
			preventiva.POST("/tipos", rManager, preventiveHandler.CreateCustomType)
			preventiva.PUT("/tipos/:id", rManager, preventiveHandler.UpdateCustomType)
			preventiva.DELETE("/tipos/:id", rManager, preventiveHandler.DeleteCustomType)
		}

		// Kanban routes (protected)
		kanban := v1.Group("/kanban", authMW, rActive, middleware.RequireFeature(systemSettingsRepo, "kanban_enabled", true))
		{
			kanban.GET("/sse", kanbanHandler.SSEStream)
			kanban.GET("/projetos", kanbanHandler.ListProjects)
			kanban.POST("/projetos", kanbanHandler.CreateProject)
			kanban.GET("/projetos/:id", kanbanHandler.GetProjectBoard)
			kanban.PUT("/projetos/:id", kanbanHandler.UpdateProject)
			kanban.DELETE("/projetos/:id", kanbanHandler.DeleteProject)
			kanban.POST("/projetos/:id/duplicar", kanbanHandler.DuplicateProject)
			kanban.POST("/projetos/:id/status", kanbanHandler.ToggleProjectStatus)
			kanban.POST("/projetos/:id/favorito", kanbanHandler.ToggleProjectFavorite)
			kanban.POST("/projetos/:id/preventiva/start", kanbanHandler.StartPreventiveAutomation)
			kanban.POST("/projetos/:id/preventiva/sincronizar", kanbanHandler.SyncPreventiveAutomation)
			kanban.POST("/projetos/:id/colunas", kanbanHandler.AddColumn)
			kanban.PUT("/colunas/:columnId", kanbanHandler.UpdateColumn)

			kanban.POST("/cards", kanbanHandler.CreateCard)
			kanban.GET("/cards/:id", kanbanHandler.GetCard)
			kanban.PUT("/cards/:id", kanbanHandler.UpdateCard)
			kanban.POST("/cards/:id/mover", kanbanHandler.MoveCard)
			kanban.DELETE("/cards/:id", kanbanHandler.DeleteCard)
			kanban.POST("/cards/:id/anexo", kanbanHandler.UploadAttachment)
			kanban.POST("/cards/:id/comentar", kanbanHandler.AddCardComment)
			kanban.DELETE("/anexos/:attachmentId", kanbanHandler.DeleteAttachment)
			kanban.POST("/cards/:id/solicitar-compra", procurementHandler.KanbanPurchaseRequest)
			kanban.POST("/cards/:id/vincular-estoque", procurementHandler.KanbanLinkStock)

			kanban.GET("/notificacoes/unread-count", kanbanHandler.UnreadCount)
			kanban.GET("/notificacoes", kanbanHandler.ListNotifications)
			kanban.POST("/notificacoes/:notifId/lida", kanbanHandler.MarkNotificationRead)
			kanban.POST("/notificacoes/lidas", kanbanHandler.MarkAllNotificationsRead)
		}

		// Emergency alerts + avisos routes (protected)
		alerts := v1.Group("/alertas", authMW, rActive)
		{
			alerts.POST("/alertar", alertsHandler.SendAlert)
			alerts.GET("/stream", alertsHandler.AlertStream)
			alerts.GET("/historico", alertsHandler.History)
			alerts.POST("/:alertId/ciente", alertsHandler.MarkCiente)
			alerts.POST("/:alertId/atender", alertsHandler.MarkAtendido)
		}

		emergencia := v1.Group("/emergencia", authMW, rActive)
		{
			emergencia.POST("/alertar", alertsHandler.SendAlert)
			emergencia.GET("/stream", alertsHandler.AlertStream)
			emergencia.GET("/historico", alertsHandler.History)
			emergencia.POST("/:alertId/ciente", alertsHandler.MarkCiente)
			emergencia.POST("/:alertId/atender", alertsHandler.MarkAtendido)
		}

		avisos := v1.Group("/avisos", authMW, rActive)
		{
			avisos.GET("", alertsHandler.ListAvisos)
			avisos.GET("/ativos", alertsHandler.ListActiveAvisos)
			avisos.POST("", rManager, alertsHandler.CreateAviso)
			avisos.POST("/upload", rManager, alertsHandler.UploadAvisoMedia)
			avisos.PUT("/:avisoId", rManager, alertsHandler.UpdateAviso)
			avisos.POST("/:avisoId/toggle", rManager, alertsHandler.ToggleAviso)
			avisos.DELETE("/:avisoId", rManager, alertsHandler.DeleteAviso)
		}

		// Procurement (Compras) routes (protected)
		compras := v1.Group("/compras", authMW, rActive, middleware.RequireFeature(systemSettingsRepo, "purchases_enabled", true))
		{
			compras.GET("/dashboard", procurementHandler.Dashboard)
			compras.GET("/export.csv", procurementHandler.ExportCSV)
			compras.GET("/notificacoes", procurementHandler.MyNotifications)
			compras.POST("/notificacoes/lidas", procurementHandler.MarkNotificationsRead)

			compras.GET("/categorias", procurementHandler.ListCategories)
			compras.POST("/categorias", rManager, procurementHandler.CreateCategory)
			compras.PUT("/categorias/:id", rManager, procurementHandler.UpdateCategory)
			compras.DELETE("/categorias/:id", rManager, procurementHandler.DeleteCategory)

			compras.GET("/produtos", procurementHandler.ListProducts)
			compras.POST("/produtos", rManager, procurementHandler.CreateProduct)
			compras.PUT("/produtos/:id", rManager, procurementHandler.UpdateProduct)
			compras.DELETE("/produtos/:id", rManager, procurementHandler.DeleteProduct)

			compras.GET("/centro-custos", procurementHandler.ListCostCenters)
			compras.POST("/centro-custos", rManager, procurementHandler.CreateCostCenter)
			compras.PUT("/centro-custos/:id", rManager, procurementHandler.UpdateCostCenter)
			compras.DELETE("/centro-custos/:id", rManager, procurementHandler.DeleteCostCenter)

			compras.GET("/solicitacoes", procurementHandler.ListRequests)
			compras.POST("/solicitacoes", procurementHandler.CreateRequest)
			compras.POST("/solicitar-peca", procurementHandler.CreateMaintenancePurchaseRequest)
			compras.GET("/solicitacoes/:id", procurementHandler.GetRequest)
			compras.POST("/solicitacoes/:id/decidir", procurementHandler.DecideRequest)
			compras.POST("/solicitacoes/:id/liberar-orcamento", procurementHandler.ReleaseBudget)

			compras.GET("/cotacoes", procurementHandler.ListQuotations)
			compras.POST("/cotacoes", rManager, procurementHandler.CreateQuotation)
			compras.GET("/cotacoes/:id", procurementHandler.GetQuotation)
			compras.POST("/cotacoes/:id/selecionar-vencedor", rManager, procurementHandler.SelectWinner)

			compras.GET("/pedidos", procurementHandler.ListOrders)
			compras.POST("/pedidos", rManager, procurementHandler.CreateOrder)
			compras.GET("/pedidos/:id", procurementHandler.GetOrder)
			compras.PUT("/pedidos/:id/status", rManager, procurementHandler.UpdateOrderStatus)
			compras.POST("/pedidos/:id/receber", procurementHandler.ReceiveOrder)
			compras.POST("/pedidos/:id/reconciliar", rManager, procurementHandler.ReconcileOrderInventory)

			compras.GET("/estoque", procurementHandler.ListStock)
			compras.GET("/estoque/transacoes", procurementHandler.ListStockTransactions)
			compras.POST("/estoque/consumir", procurementHandler.ConsumeStock)

			compras.GET("/contratos", procurementHandler.ListContracts)
			compras.POST("/contratos", rManager, procurementHandler.CreateContract)
			compras.PUT("/contratos/:id", rManager, procurementHandler.UpdateContract)
			compras.DELETE("/contratos/:id", rManager, procurementHandler.DeleteContract)
			compras.GET("/contratos/tipos", procurementHandler.ListContractTypes)
			compras.POST("/contratos/tipos", rManager, procurementHandler.CreateContractType)
			compras.PUT("/contratos/tipos/:id", rManager, procurementHandler.UpdateContractType)
			compras.DELETE("/contratos/tipos/:id", rManager, procurementHandler.DeleteContractType)

			compras.GET("/pesquisas", procurementHandler.ListResearches)
			compras.POST("/pesquisas", procurementHandler.CreateResearch)
			compras.GET("/pesquisas/:id", procurementHandler.GetResearch)
			compras.POST("/pesquisas/:id/enviar", procurementHandler.SendResearch)
			compras.POST("/pesquisas/:id/decidir", rManager, procurementHandler.DecideResearch)
		}

		// RH — personnel controls are scoped by handler for configured sector managers.
		rh := v1.Group("/rh", authMW, rActive)
		{
			rh.GET("/hierarquia", rRH, rhHandler.Hierarchy)
			rh.PUT("/hierarquia", rRH, rhHandler.UpdateHierarchy)
			rh.GET("/termos", rRH, rhHandler.List)
			rh.GET("/controle", rhHandler.StatusDashboard)
			rh.GET("/controle/export.csv", rhHandler.ExportStatusCSV)
			rh.POST("/status", rhHandler.CreateStatus)
			rh.DELETE("/status/:id", rhHandler.DeleteStatus)
			rh.PUT("/colaboradores/:id/monitoramento", rhHandler.UpdateMonitoringVisibility)
			rh.POST("/comunicados", rhHandler.CreateComunicado)
			rh.POST("/comunicados/upload", rhHandler.UploadComunicadoMedia)
			rh.DELETE("/comunicados/:id", rhHandler.DeleteComunicado)
			rh.GET("/solicitacoes/:id/modelo", rRH, rhHandler.GenerateTemplate)
			rh.POST("/termos", rRH, rhHandler.Create)
			rh.PUT("/termos/:id", rRH, rhHandler.Update)
			rh.POST("/termos/:id/assinar", rRH, rhHandler.Sign)
			rh.POST("/termos/:id/cancelar", rRH, rhHandler.Cancel)
			rh.GET("/termos/:id/pdf", rRH, rhHandler.PDF)
			rh.POST("/colaboradores/:id/desligamento", rRH, rhHandler.OffboardUser)
		}

		monitoring := v1.Group("/monitoramento", authMW, rActive)
		{
			monitoring.GET("/equipe-rh", rhHandler.MonitoringTeam)
		}

		// QR routes
		qr := v1.Group("/qr")
		{
			// Public: QR login
			qr.POST("/login", rateLimiter.Limit("qr_login"), qrHandler.LoginWithQR)

			// Protected: own QR management
			qrMe := qr.Group("", authMW, rActive)
			{
				qrMe.GET("/me", qrHandler.GetMyQR)
				qrMe.POST("/me/generate", rateLimiter.Limit("qr_regenerate"), qrHandler.GenerateQRToken)
				qrMe.GET("/me/badge", qrHandler.GetMyBadge)
				qrMe.POST("/me/pin", rateLimiter.Limit("pin_setup"), qrHandler.SetPIN)

				// Admin/Manager: lookup by QR token
				qrMe.GET("/user/:token", rateLimiter.Limit("qr_public_profile"), qrHandler.GetUserByQR)

				// Delivery confirm
				qrMe.POST("/delivery/confirm", rateLimiter.Limit("delivery_confirm"), qrHandler.DeliveryConfirm)
			}
		}

		// Webhooks routes (Admin only)
		wh := v1.Group("/webhooks", authMW, rActive, rAdmin)
		{
			wh.GET("", webhookHandler.List)
			wh.GET("/:id", webhookHandler.GetByID)
			wh.POST("", webhookHandler.Create)
			wh.PUT("/:id", webhookHandler.Update)
			wh.DELETE("/:id", webhookHandler.Delete)
			wh.POST("/:id/test", webhookHandler.Test)
			wh.GET("/:id/logs", webhookHandler.Logs)
		}

		// Backup routes (Admin only)
		bkp := v1.Group("/backups", authMW, rActive, rAdmin)
		{
			bkp.GET("", backupHandler.List)
			bkp.POST("/generate", backupHandler.GenerateBackup)
			bkp.GET("/status", backupHandler.GetStatus)
			bkp.GET("/download/:filename", backupHandler.Download)
			bkp.DELETE("/:filename", backupHandler.Delete)
			bkp.POST("/restore", backupHandler.Restore)
		}

		// Profile routes (Active users only)
		prof := v1.Group("/profile", authMW, rActive)
		{
			prof.PUT("", userHandler.UpdateProfile)
			prof.GET("/rh", rhHandler.MyPortal)
			prof.GET("/mensagens", rhHandler.ListMessages)
			prof.POST("/mensagens", rhHandler.CreateMessage)
			prof.POST("/mensagens/:id/confirmar", rhHandler.ConfirmMessage)
			prof.POST("/rh/comunicados/:id/lida", rhHandler.MarkMyComunicadoRead)
			prof.POST("/avatar", userHandler.UploadAvatar)
			prof.PUT("/password", userHandler.ChangePassword)
		}

		// Dashboard & Analytics
		dash := v1.Group("/dashboard", authMW, rActive)
		{
			dash.GET("/stats", dashboardHandler.GetStats)
		}

		// Admin config routes (protected: admin)
		featureSettings := v1.Group("/settings", authMW, rActive)
		{
			featureSettings.GET("/features", settingsHandler.GetFeatures)
		}

		adminSettings := v1.Group("/admin/settings", authMW, rActive, rAdmin)
		{
			adminSettings.GET("", settingsHandler.GetAll)
			adminSettings.PUT("", settingsHandler.UpdateMany)
			adminSettings.POST("/test-email", settingsHandler.TestEmail)
		}

		adminEmailLogs := v1.Group("/admin/email-logs", authMW, rActive, rAdmin)
		{
			adminEmailLogs.GET("", emailLogHandler.List)
		}

		// AI Chat route
		chat := v1.Group("/chat", authMW, rActive)
		{
			chat.POST("", aiHandler.Chat)
		}
	}

	return r
}
