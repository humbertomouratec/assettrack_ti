package models

import "time"

// Maintenance type values (display values, matching Python MaintenanceType)
const (
	MaintTypePreventiva    = "Preventiva"
	MaintTypePreditiva     = "Preditiva"
	MaintTypeInspecao      = "Inspeção"
	MaintTypeCalibracao    = "Calibração"
	MaintTypeLubrificacao  = "Lubrificação"
	MaintTypeLimpeza       = "Limpeza"
	MaintTypeAtualizacao   = "Atualização"
	MaintTypeCorretiva     = "Corretiva"
	MaintTypePersonalizada = "Personalizada"
)

// Periodicity values
const (
	PeriodicidadeDiaria        = "Diária"
	PeriodicidadeSemanal       = "Semanal"
	PeriodicidadeQuinzenal     = "Quinzenal"
	PeriodicidadeMensal        = "Mensal"
	PeriodicidadeBimestral     = "Bimestral"
	PeriodicidadeTrimestral    = "Trimestral"
	PeriodicidadeSemestral     = "Semestral"
	PeriodicidadeAnual         = "Anual"
	PeriodicidadePersonalizada = "Personalizada"
)

// Priority values
const (
	PriorityBaixa   = "Baixa"
	PriorityMedia   = "Média"
	PriorityAlta    = "Alta"
	PriorityUrgente = "Urgente"
)

// Criticality values
const (
	CriticalityBaixa   = "Baixa"
	CriticalityMedia   = "Média"
	CriticalityAlta    = "Alta"
	CriticalityCritica = "Crítica"
)

// PM order status values
const (
	PMStatusAberta         = "Aberta"
	PMStatusAgendada       = "Agendada"
	PMStatusEmAndamento    = "Em andamento"
	PMStatusAguardandoPeca = "Aguardando peça"
	PMStatusPausada        = "Pausada"
	PMStatusConcluida      = "Concluída"
	PMStatusCancelada      = "Cancelada"
)

// Photo type values
const (
	PhotoAntes   = "Antes"
	PhotoDurante = "Durante"
	PhotoDepois  = "Depois"
)

type MaintenancePlan struct {
	ID                 uint     `gorm:"primaryKey" json:"id"`
	Nome               string   `gorm:"size:200;not null;index" json:"nome"`
	Codigo             string   `gorm:"size:50;unique;not null" json:"codigo"`
	Descricao          *string  `gorm:"type:text" json:"descricao"`
	Tipo               string   `gorm:"size:30;default:'Preventiva'" json:"tipo"`
	Periodicidade      string   `gorm:"size:30;default:'Mensal'" json:"periodicidade"`
	DiasPersonalizado  *int     `gorm:"column:dias_personalizado" json:"dias_personalizado"`
	TempoEstimadoHoras *float64 `gorm:"column:tempo_estimado_horas;type:numeric(5,2)" json:"tempo_estimado_horas"`
	Criticidade        string   `gorm:"size:30;default:'Média'" json:"criticidade"`
	Prioridade         string   `gorm:"size:30;default:'Média'" json:"prioridade"`
	Ativo              bool     `gorm:"default:true" json:"ativo"`

	ResponsavelID  *uint `gorm:"column:responsavel_id" json:"responsavel_id"`
	DepartamentoID *uint `gorm:"column:departamento_id" json:"departamento_id"`
	CategoriaID    *uint `gorm:"column:categoria_id" json:"categoria_id"`

	DataCriacao        time.Time  `gorm:"column:data_criacao;default:CURRENT_TIMESTAMP" json:"data_criacao"`
	DataUltimaExecucao *time.Time `gorm:"column:data_ultima_execucao" json:"data_ultima_execucao"`
	ProximaExecucao    time.Time  `gorm:"column:proxima_execucao;not null" json:"proxima_execucao"`

	Responsavel  *User                  `gorm:"foreignKey:ResponsavelID" json:"responsavel,omitempty"`
	Departamento *Departamento          `gorm:"foreignKey:DepartamentoID" json:"departamento,omitempty"`
	Categoria    *AssetCategory         `gorm:"foreignKey:CategoriaID" json:"categoria,omitempty"`
	Assets       []MaintenancePlanAsset `gorm:"foreignKey:PlanID" json:"assets,omitempty"`
	Checklists   []MaintenanceChecklist `gorm:"foreignKey:PlanID" json:"checklists,omitempty"`
}

func (MaintenancePlan) TableName() string { return "maintenance_plans" }

type MaintenancePlanAsset struct {
	ID      uint `gorm:"primaryKey" json:"id"`
	PlanID  uint `gorm:"column:plan_id;not null" json:"plan_id"`
	AssetID uint `gorm:"column:asset_id;not null" json:"asset_id"`

	Plan  *MaintenancePlan `gorm:"foreignKey:PlanID" json:"plan,omitempty"`
	Asset *Asset           `gorm:"foreignKey:AssetID" json:"asset,omitempty"`
}

func (MaintenancePlanAsset) TableName() string { return "maintenance_plan_assets" }

type MaintenanceChecklist struct {
	ID      uint   `gorm:"primaryKey" json:"id"`
	PlanID  *uint  `gorm:"column:plan_id;index" json:"plan_id"`
	OrderID *uint  `gorm:"column:order_id;index" json:"order_id"`
	Nome    string `gorm:"size:200;not null" json:"nome"`
	Ordem   int    `gorm:"default:0" json:"ordem"`

	Plan  *MaintenancePlan           `gorm:"foreignKey:PlanID" json:"plan,omitempty"`
	Order *MaintenanceOrder          `gorm:"foreignKey:OrderID" json:"order,omitempty"`
	Items []MaintenanceChecklistItem `gorm:"foreignKey:ChecklistID" json:"items,omitempty"`
}

func (MaintenanceChecklist) TableName() string { return "maintenance_checklists" }

type MaintenanceChecklistItem struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	ChecklistID uint   `gorm:"column:checklist_id;not null" json:"checklist_id"`
	Descricao   string `gorm:"type:text;not null" json:"descricao"`
	Obrigatorio bool   `gorm:"default:true" json:"obrigatorio"`
	Ordem       int    `gorm:"default:0" json:"ordem"`
	RequerFoto  bool   `gorm:"column:requer_foto;default:false" json:"requer_foto"`

	Checklist *MaintenanceChecklist `gorm:"foreignKey:ChecklistID" json:"checklist,omitempty"`
}

func (MaintenanceChecklistItem) TableName() string { return "maintenance_checklist_items" }

type MaintenanceOrder struct {
	ID                  uint    `gorm:"primaryKey" json:"id"`
	Numero              string  `gorm:"size:50;unique;not null" json:"numero"`
	PlanID              *uint   `gorm:"column:plan_id" json:"plan_id"`
	AssetID             *uint   `gorm:"column:asset_id" json:"asset_id"`
	InfraPredialServico *string `gorm:"column:infra_predial_servico;size:255" json:"infra_predial_servico"`

	TecnicoID     *uint `gorm:"column:tecnico_id" json:"tecnico_id"`
	SolicitanteID *uint `gorm:"column:solicitante_id" json:"solicitante_id"`

	Status      string `gorm:"size:30;default:'Aberta'" json:"status"`
	Prioridade  string `gorm:"size:30;default:'Média'" json:"prioridade"`
	Criticidade string `gorm:"size:30;default:'Média'" json:"criticidade"`
	Tipo        string `gorm:"size:30;default:'Preventiva'" json:"tipo"`

	DataAbertura      time.Time  `gorm:"column:data_abertura;default:CURRENT_TIMESTAMP" json:"data_abertura"`
	DataAgendada      *time.Time `gorm:"column:data_agendada" json:"data_agendada"`
	DataInicio        *time.Time `gorm:"column:data_inicio" json:"data_inicio"`
	DataPausa         *time.Time `gorm:"column:data_pausa" json:"data_pausa"`
	DataConclusao     *time.Time `gorm:"column:data_conclusao" json:"data_conclusao"`
	DataValidacao     *time.Time `gorm:"column:data_validacao" json:"data_validacao"`
	TempoTotalMinutos *int       `gorm:"column:tempo_total_minutos" json:"tempo_total_minutos"`

	Observacoes         *string `gorm:"type:text" json:"observacoes"`
	Diagnostico         *string `gorm:"column:diagnostico;type:text" json:"diagnostico"`
	Solucao             *string `gorm:"type:text" json:"solucao"`
	Recomendacoes       *string `gorm:"column:recomendacoes;type:text" json:"recomendacoes"`
	StatusPosManutencao *string `gorm:"column:status_pos_manutencao;size:40" json:"status_pos_manutencao"`

	CustoTotal *float64 `gorm:"column:custo_total;type:numeric(10,2);default:0" json:"custo_total"`

	ServiceTicketID *uint `gorm:"column:service_ticket_id" json:"service_ticket_id"`
	ValidadoPorID   *uint `gorm:"column:validado_por_id" json:"validado_por_id"`

	Plan        *MaintenancePlan       `gorm:"foreignKey:PlanID" json:"plan,omitempty"`
	Asset       *Asset                 `gorm:"foreignKey:AssetID" json:"asset,omitempty"`
	Tecnico     *User                  `gorm:"foreignKey:TecnicoID" json:"tecnico,omitempty"`
	ValidadoPor *User                  `gorm:"foreignKey:ValidadoPorID" json:"validado_por,omitempty"`
	Checklists  []MaintenanceChecklist `gorm:"foreignKey:OrderID" json:"order_checklists,omitempty"`
	Executions  []MaintenanceExecution `gorm:"foreignKey:OrderID" json:"executions,omitempty"`
	Materials   []MaintenanceMaterial  `gorm:"foreignKey:OrderID" json:"materials,omitempty"`
	Photos      []MaintenancePhoto     `gorm:"foreignKey:OrderID" json:"photos,omitempty"`
	History     []MaintenanceHistory   `gorm:"foreignKey:OrderID" json:"history,omitempty"`
}

func (MaintenanceOrder) TableName() string { return "maintenance_orders" }

type MaintenanceExecution struct {
	ID              uint       `gorm:"primaryKey" json:"id"`
	OrderID         uint       `gorm:"column:order_id;not null" json:"order_id"`
	ChecklistItemID uint       `gorm:"column:checklist_item_id;not null" json:"checklist_item_id"`
	Concluido       bool       `gorm:"default:false" json:"concluido"`
	Observacao      *string    `gorm:"type:text" json:"observacao"`
	DataExecucao    *time.Time `gorm:"column:data_execucao" json:"data_execucao"`
	ExecutadoPorID  *uint      `gorm:"column:executado_por_id" json:"executado_por_id"`

	Order         *MaintenanceOrder         `gorm:"foreignKey:OrderID" json:"order,omitempty"`
	ChecklistItem *MaintenanceChecklistItem `gorm:"foreignKey:ChecklistItemID" json:"checklist_item,omitempty"`
	ExecutadoPor  *User                     `gorm:"foreignKey:ExecutadoPorID" json:"executado_por,omitempty"`
}

func (MaintenanceExecution) TableName() string { return "maintenance_executions" }

type MaintenanceMaterial struct {
	ID            uint    `gorm:"primaryKey" json:"id"`
	OrderID       uint    `gorm:"column:order_id;not null" json:"order_id"`
	ProductID     *uint   `gorm:"column:product_id" json:"product_id"`
	Produto       string  `gorm:"size:200;not null" json:"produto"`
	Quantidade    float64 `gorm:"type:numeric(10,2);not null" json:"quantidade"`
	ValorUnitario float64 `gorm:"column:valor_unitario;type:numeric(10,2);not null" json:"valor_unitario"`
	ValorTotal    float64 `gorm:"column:valor_total;type:numeric(10,2);not null" json:"valor_total"`
	Observacao    *string `gorm:"type:text" json:"observacao"`

	Order *MaintenanceOrder `gorm:"foreignKey:OrderID" json:"order,omitempty"`
}

func (MaintenanceMaterial) TableName() string { return "maintenance_materials" }

type MaintenancePhoto struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	OrderID        uint      `gorm:"column:order_id;not null" json:"order_id"`
	ExecutionID    *uint     `gorm:"column:execution_id" json:"execution_id"`
	Tipo           string    `gorm:"size:30;default:'Durante'" json:"tipo"`
	CaminhoArquivo string    `gorm:"column:caminho_arquivo;size:255;not null" json:"caminho_arquivo"`
	Descricao      *string   `gorm:"type:text" json:"descricao"`
	DataUpload     time.Time `gorm:"column:data_upload;default:CURRENT_TIMESTAMP" json:"data_upload"`
	UploadPorID    *uint     `gorm:"column:upload_por_id" json:"upload_por_id"`

	Order     *MaintenanceOrder     `gorm:"foreignKey:OrderID" json:"order,omitempty"`
	Execution *MaintenanceExecution `gorm:"foreignKey:ExecutionID" json:"execution,omitempty"`
	UploadPor *User                 `gorm:"foreignKey:UploadPorID" json:"upload_por,omitempty"`
}

func (MaintenancePhoto) TableName() string { return "maintenance_photos" }

type MaintenanceHistory struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	OrderID        uint      `gorm:"column:order_id;not null" json:"order_id"`
	Acao           string    `gorm:"size:100;not null" json:"acao"`
	Descricao      string    `gorm:"type:text;not null" json:"descricao"`
	UsuarioID      *uint     `gorm:"column:usuario_id" json:"usuario_id"`
	DataHora       time.Time `gorm:"column:data_hora;default:CURRENT_TIMESTAMP" json:"data_hora"`
	StatusAnterior *string   `gorm:"column:status_anterior;size:50" json:"status_anterior"`
	StatusNovo     *string   `gorm:"column:status_novo;size:50" json:"status_novo"`

	Order   *MaintenanceOrder `gorm:"foreignKey:OrderID" json:"order,omitempty"`
	Usuario *User             `gorm:"foreignKey:UsuarioID" json:"usuario,omitempty"`
}

func (MaintenanceHistory) TableName() string { return "maintenance_history" }

type MaintenanceNotification struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	OrderID     *uint     `gorm:"column:order_id" json:"order_id"`
	PlanID      *uint     `gorm:"column:plan_id" json:"plan_id"`
	UsuarioID   uint      `gorm:"column:usuario_id;not null" json:"usuario_id"`
	Tipo        string    `gorm:"size:50;not null" json:"tipo"`
	Mensagem    string    `gorm:"type:text;not null" json:"mensagem"`
	Lida        bool      `gorm:"default:false" json:"lida"`
	DataCriacao time.Time `gorm:"column:data_criacao;default:CURRENT_TIMESTAMP" json:"data_criacao"`

	Order   *MaintenanceOrder `gorm:"foreignKey:OrderID" json:"order,omitempty"`
	Plan    *MaintenancePlan  `gorm:"foreignKey:PlanID" json:"plan,omitempty"`
	Usuario *User             `gorm:"foreignKey:UsuarioID" json:"usuario,omitempty"`
}

func (MaintenanceNotification) TableName() string { return "maintenance_notifications" }

type CustomMaintenanceType struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Nome      string    `gorm:"size:200;not null;unique" json:"nome"`
	Descricao *string   `gorm:"type:text" json:"descricao"`
	CriadoEm  time.Time `gorm:"column:criado_em;default:CURRENT_TIMESTAMP" json:"criado_em"`
}

func (CustomMaintenanceType) TableName() string { return "custom_maintenance_types" }
