package models

import "time"

// Product type values (display values, matching Python ProductType)
const (
	ProductTypeProduto         = "Produto"
	ProductTypeServico         = "Serviço"
	ProductTypeLicenca         = "Licença"
	ProductTypeAssinatura      = "Assinatura"
	ProductTypeEquipamento     = "Equipamento"
	ProductTypeMaterialConsumo = "Material de Consumo"
)

// Purchase request status values (display values, matching Python PurchaseRequestStatus)
const (
	PRStatusRascunho            = "Rascunho"
	PRStatusPendente            = "Pendente"
	PRStatusEmAprovacao         = "Em aprovação"
	PRStatusAprovada            = "Aprovada"
	PRStatusReprovada           = "Reprovada"
	PRStatusCancelada           = "Cancelada"
	PRStatusConvertidaCotacao   = "Convertida em cotação"
	PRStatusAguardandoOrcamento = "Aguardando Liberação de Orçamento"
)

// Purchase order status values (display values, matching Python PurchaseOrderStatus)
const (
	POStatusAberto          = "Aberto"
	POStatusEnviado         = "Enviado"
	POStatusAceito          = "Aceito"
	POStatusEmTransporte    = "Em transporte"
	POStatusRecebidoParcial = "Recebido parcialmente"
	POStatusRecebidoTotal   = "Recebido totalmente"
	POStatusCancelado       = "Cancelado"
)

// Purchase research status values (display values, matching Python PurchaseResearchStatus)
const (
	PResearchStatusRascunho  = "Rascunho"
	PResearchStatusPendente  = "Pendente"
	PResearchStatusAprovada  = "Aprovada"
	PResearchStatusReprovada = "Reprovada"
)

// Urgency values (display values)
const (
	UrgencyBaixa   = "Baixa"
	UrgencyMedia   = "Média"
	UrgencyAlta    = "Alta"
	UrgencyUrgente = "Urgente"
)

// Approval status values
const (
	ApprovalPendente         = "Pendente"
	ApprovalAprovado         = "Aprovado"
	ApprovalReprovado        = "Reprovado"
	ApprovalAjusteSolicitado = "Ajuste Solicitado"
)

// Quotation status values
const (
	QuotationEmCotacao  = "Em cotação"
	QuotationFinalizada = "Finalizada"
	QuotationCancelada  = "Cancelada"
)

// Stock movement types
const (
	StockEntrada = "Entrada"
	StockSaida   = "Saída"
)

// Research item product types
const (
	ResearchConsumo     = "Consumo"
	ResearchImobilizado = "Imobilizado"
)

type PurchaseCategory struct {
	ID        uint    `gorm:"primaryKey" json:"id"`
	Nome      string  `gorm:"size:100;unique;not null" json:"nome"`
	Descricao *string `gorm:"size:255" json:"descricao"`
	Ativo     bool    `gorm:"default:true" json:"ativo"`

	Products []PurchaseProduct `gorm:"foreignKey:CategoriaID" json:"products,omitempty"`
}

func (PurchaseCategory) TableName() string { return "purchase_categories" }

type PurchaseUnit struct {
	ID        uint    `gorm:"primaryKey" json:"id"`
	Sigla     string  `gorm:"size:20;unique;not null" json:"sigla"`
	Descricao *string `gorm:"size:100" json:"descricao"`
}

func (PurchaseUnit) TableName() string { return "purchase_units" }

type PurchaseProduct struct {
	ID          uint    `gorm:"primaryKey" json:"id"`
	Codigo      string  `gorm:"size:50;unique;not null" json:"codigo"`
	Nome        string  `gorm:"size:150;index;not null" json:"nome"`
	CategoriaID uint    `gorm:"column:categoria_id;not null" json:"categoria_id"`
	Unidade     string  `gorm:"size:20;default:'UN'" json:"unidade"`
	Marca       *string `gorm:"size:50" json:"marca"`
	Modelo      *string `gorm:"size:50" json:"modelo"`
	Fabricante  *string `gorm:"size:50" json:"fabricante"`
	Descricao   *string `gorm:"type:text" json:"descricao"`
	Tipo        string  `gorm:"size:30;default:'Produto'" json:"tipo"`
	ImagemPath  *string `gorm:"column:imagem_path;size:255" json:"imagem_path"`
	Ativo       bool    `gorm:"default:true" json:"ativo"`

	Categoria *PurchaseCategory `gorm:"foreignKey:CategoriaID" json:"categoria,omitempty"`
	Stock     *MaterialStock    `gorm:"foreignKey:ProductID" json:"stock,omitempty"`
}

func (PurchaseProduct) TableName() string { return "purchase_products" }

type CostCenter struct {
	ID             uint   `gorm:"primaryKey" json:"id"`
	Codigo         string `gorm:"size:50;unique;not null" json:"codigo"`
	Nome           string `gorm:"size:100;index;not null" json:"nome"`
	DepartamentoID *uint  `gorm:"column:departamento_id" json:"departamento_id"`
	ResponsavelID  *uint  `gorm:"column:responsavel_id" json:"responsavel_id"`

	OrcamentoAnual       float64 `gorm:"column:orcamento_anual;type:numeric(12,2);default:0" json:"orcamento_anual"`
	OrcamentoMensal      float64 `gorm:"column:orcamento_mensal;type:numeric(12,2);default:0" json:"orcamento_mensal"`
	OrcamentoAnualUsado  float64 `gorm:"column:orcamento_anual_usado;type:numeric(12,2);default:0" json:"orcamento_anual_usado"`
	OrcamentoMensalUsado float64 `gorm:"column:orcamento_mensal_usado;type:numeric(12,2);default:0" json:"orcamento_mensal_usado"`

	AlertaLimite   bool `gorm:"column:alerta_limite;default:true" json:"alerta_limite"`
	BloquearLimite bool `gorm:"column:bloquear_limite;default:false" json:"bloquear_limite"`

	Departamento *Departamento `gorm:"foreignKey:DepartamentoID" json:"departamento,omitempty"`
	Responsavel  *User         `gorm:"foreignKey:ResponsavelID" json:"responsavel,omitempty"`
}

func (CostCenter) TableName() string { return "cost_centers" }

type PurchaseRequest struct {
	ID             uint   `gorm:"primaryKey" json:"id"`
	Numero         string `gorm:"size:50;unique;not null" json:"numero"`
	SolicitanteID  uint   `gorm:"column:solicitante_id;not null" json:"solicitante_id"`
	DepartamentoID uint   `gorm:"column:departamento_id;not null" json:"departamento_id"`
	CentroCustoID  uint   `gorm:"column:centro_custo_id;not null" json:"centro_custo_id"`

	Justificativa  string     `gorm:"type:text;not null" json:"justificativa"`
	Urgencia       string     `gorm:"size:20;default:'Média'" json:"urgencia"`
	DataNecessaria *time.Time `gorm:"column:data_necessaria" json:"data_necessaria"`
	Status         string     `gorm:"size:40;default:'Rascunho';index" json:"status"`
	DataCriacao    time.Time  `gorm:"column:data_criacao;default:CURRENT_TIMESTAMP" json:"data_criacao"`

	OrigemOSID     *uint `gorm:"column:origem_os_id" json:"origem_os_id"`
	OrigemTicketID *uint `gorm:"column:origem_ticket_id" json:"origem_ticket_id"`

	Solicitante  *User                 `gorm:"foreignKey:SolicitanteID" json:"solicitante,omitempty"`
	Departamento *Departamento         `gorm:"foreignKey:DepartamentoID" json:"departamento,omitempty"`
	CentroCusto  *CostCenter           `gorm:"foreignKey:CentroCustoID" json:"centro_custo,omitempty"`
	Itens        []PurchaseRequestItem `gorm:"foreignKey:RequestID" json:"itens,omitempty"`
	Approvals    []PurchaseApproval    `gorm:"foreignKey:RequestID" json:"approvals,omitempty"`

	ValorEstimadoTotal      float64 `gorm:"-" json:"valor_estimado_total"`
	NivelAprovacaoSugerido  string  `gorm:"-" json:"nivel_aprovacao_sugerido"`
	SituacaoOrcamentoCentro string  `gorm:"-" json:"situacao_orcamento_centro"`
}

func (PurchaseRequest) TableName() string { return "purchase_requests" }

type PurchaseRequestItem struct {
	ID                   uint    `gorm:"primaryKey" json:"id"`
	RequestID            uint    `gorm:"column:request_id;not null" json:"request_id"`
	ProductID            uint    `gorm:"column:product_id;not null" json:"product_id"`
	Quantidade           float64 `gorm:"type:numeric(10,2);not null" json:"quantidade"`
	ValorEstimado        float64 `gorm:"column:valor_estimado;type:numeric(10,2);not null" json:"valor_estimado"`
	FornecedorSugeridoID *uint   `gorm:"column:fornecedor_sugerido_id" json:"fornecedor_sugerido_id"`
	Observacao           *string `gorm:"type:text" json:"observacao"`

	Request            *PurchaseRequest `gorm:"foreignKey:RequestID" json:"request,omitempty"`
	Product            *PurchaseProduct `gorm:"foreignKey:ProductID" json:"product,omitempty"`
	FornecedorSugerido *Fornecedor      `gorm:"foreignKey:FornecedorSugeridoID" json:"fornecedor_sugerido,omitempty"`
}

func (PurchaseRequestItem) TableName() string { return "purchase_request_items" }

type PurchaseApproval struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	RequestID   uint       `gorm:"column:request_id;not null" json:"request_id"`
	Nivel       string     `gorm:"size:50;not null" json:"nivel"`
	AprovadorID *uint      `gorm:"column:aprovador_id" json:"aprovador_id"`
	Status      string     `gorm:"size:20;default:'Pendente'" json:"status"`
	Observacao  *string    `gorm:"type:text" json:"observacao"`
	DataDecisao *time.Time `gorm:"column:data_decisao" json:"data_decisao"`

	Request   *PurchaseRequest `gorm:"foreignKey:RequestID" json:"request,omitempty"`
	Aprovador *User            `gorm:"foreignKey:AprovadorID" json:"aprovador,omitempty"`
}

func (PurchaseApproval) TableName() string { return "purchase_approvals" }

type PurchaseQuotation struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Numero      string    `gorm:"size:50;unique;not null" json:"numero"`
	RequestID   uint      `gorm:"column:request_id;not null" json:"request_id"`
	DataCriacao time.Time `gorm:"column:data_criacao;default:CURRENT_TIMESTAMP" json:"data_criacao"`
	Status      string    `gorm:"size:20;default:'Em cotação'" json:"status"`

	Request   *PurchaseRequest            `gorm:"foreignKey:RequestID" json:"request,omitempty"`
	Suppliers []PurchaseQuotationSupplier `gorm:"foreignKey:QuotationID" json:"suppliers,omitempty"`
}

func (PurchaseQuotation) TableName() string { return "purchase_quotations" }

type PurchaseQuotationSupplier struct {
	ID           uint `gorm:"primaryKey" json:"id"`
	QuotationID  uint `gorm:"column:quotation_id;not null" json:"quotation_id"`
	FornecedorID uint `gorm:"column:fornecedor_id;not null" json:"fornecedor_id"`

	ValorTotal       float64 `gorm:"column:valor_total;type:numeric(12,2);default:0" json:"valor_total"`
	Frete            float64 `gorm:"type:numeric(10,2);default:0" json:"frete"`
	PrazoEntregaDias int     `gorm:"column:prazo_entrega_dias;default:0" json:"prazo_entrega_dias"`
	GarantiaMeses    int     `gorm:"column:garantia_meses;default:0" json:"garantia_meses"`
	FormaPagamento   *string `gorm:"column:forma_pagamento;size:100" json:"forma_pagamento"`
	Observacoes      *string `gorm:"type:text" json:"observacoes"`
	Escolhido        bool    `gorm:"default:false" json:"escolhido"`

	Quotation  *PurchaseQuotation      `gorm:"foreignKey:QuotationID" json:"quotation,omitempty"`
	Fornecedor *Fornecedor             `gorm:"foreignKey:FornecedorID" json:"fornecedor,omitempty"`
	Itens      []PurchaseQuotationItem `gorm:"foreignKey:QuotationSupplierID" json:"itens,omitempty"`
}

func (PurchaseQuotationSupplier) TableName() string { return "purchase_quotation_suppliers" }

type PurchaseQuotationItem struct {
	ID                  uint    `gorm:"primaryKey" json:"id"`
	QuotationSupplierID uint    `gorm:"column:quotation_supplier_id;not null" json:"quotation_supplier_id"`
	ProductID           uint    `gorm:"column:product_id;not null" json:"product_id"`
	Quantidade          float64 `gorm:"type:numeric(10,2);not null" json:"quantidade"`
	ValorUnitario       float64 `gorm:"column:valor_unitario;type:numeric(10,2);not null" json:"valor_unitario"`

	QuotationSupplier *PurchaseQuotationSupplier `gorm:"foreignKey:QuotationSupplierID" json:"quotation_supplier,omitempty"`
	Product           *PurchaseProduct           `gorm:"foreignKey:ProductID" json:"product,omitempty"`
}

func (PurchaseQuotationItem) TableName() string { return "purchase_quotation_items" }

type PurchaseOrder struct {
	ID            uint   `gorm:"primaryKey" json:"id"`
	Numero        string `gorm:"size:50;unique;not null" json:"numero"`
	FornecedorID  uint   `gorm:"column:fornecedor_id;not null" json:"fornecedor_id"`
	CentroCustoID uint   `gorm:"column:centro_custo_id;not null" json:"centro_custo_id"`
	RequestID     *uint  `gorm:"column:request_id" json:"request_id"`
	QuotationID   *uint  `gorm:"column:quotation_id" json:"quotation_id"`

	ValorTotal float64 `gorm:"column:valor_total;type:numeric(12,2);not null" json:"valor_total"`
	Desconto   float64 `gorm:"type:numeric(10,2);default:0" json:"desconto"`
	IPI        float64 `gorm:"column:ipi;type:numeric(10,2);default:0" json:"ipi"`
	ICMS       float64 `gorm:"column:icms;type:numeric(10,2);default:0" json:"icms"`
	Frete      float64 `gorm:"type:numeric(10,2);default:0" json:"frete"`

	Status      string    `gorm:"size:30;default:'Aberto';index" json:"status"`
	DataEmissao time.Time `gorm:"column:data_emissao;default:CURRENT_TIMESTAMP" json:"data_emissao"`

	Fornecedor  *Fornecedor         `gorm:"foreignKey:FornecedorID" json:"fornecedor,omitempty"`
	CentroCusto *CostCenter         `gorm:"foreignKey:CentroCustoID" json:"centro_custo,omitempty"`
	Request     *PurchaseRequest    `gorm:"foreignKey:RequestID" json:"request,omitempty"`
	Quotation   *PurchaseQuotation  `gorm:"foreignKey:QuotationID" json:"quotation,omitempty"`
	Itens       []PurchaseOrderItem `gorm:"foreignKey:OrderID" json:"itens,omitempty"`
	Receivings  []PurchaseReceiving `gorm:"foreignKey:OrderID" json:"receivings,omitempty"`

	RequestValorEstimadoTotal float64    `gorm:"-" json:"request_valor_estimado_total"`
	EconomiaEstimada          float64    `gorm:"-" json:"economia_estimada"`
	PrazoEntregaDias          int        `gorm:"-" json:"prazo_entrega_dias"`
	SLAStatus                 string     `gorm:"-" json:"sla_status"`
	DataPrevistaEntrega       *time.Time `gorm:"-" json:"data_prevista_entrega"`
	UltimaDataRecebimento     *time.Time `gorm:"-" json:"ultima_data_recebimento"`
}

func (PurchaseOrder) TableName() string { return "purchase_orders" }

type PurchaseOrderItem struct {
	ID            uint    `gorm:"primaryKey" json:"id"`
	OrderID       uint    `gorm:"column:order_id;not null" json:"order_id"`
	ProductID     uint    `gorm:"column:product_id;not null" json:"product_id"`
	Quantidade    float64 `gorm:"type:numeric(10,2);not null" json:"quantidade"`
	ValorUnitario float64 `gorm:"column:valor_unitario;type:numeric(10,2);not null" json:"valor_unitario"`
	TotalItem     float64 `gorm:"column:total_item;type:numeric(12,2);not null" json:"total_item"`

	Order   *PurchaseOrder   `gorm:"foreignKey:OrderID" json:"order,omitempty"`
	Product *PurchaseProduct `gorm:"foreignKey:ProductID" json:"product,omitempty"`
}

func (PurchaseOrderItem) TableName() string { return "purchase_order_items" }

type PurchaseReceiving struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	OrderID         uint      `gorm:"column:order_id;not null" json:"order_id"`
	DataRecebimento time.Time `gorm:"column:data_recebimento;default:CURRENT_TIMESTAMP" json:"data_recebimento"`
	ResponsavelID   uint      `gorm:"column:responsavel_id;not null" json:"responsavel_id"`
	NotaFiscalID    *uint     `gorm:"column:nota_fiscal_id" json:"nota_fiscal_id"`
	Observacoes     *string   `gorm:"type:text" json:"observacoes"`

	Order       *PurchaseOrder          `gorm:"foreignKey:OrderID" json:"order,omitempty"`
	Responsavel *User                   `gorm:"foreignKey:ResponsavelID" json:"responsavel,omitempty"`
	NotaFiscal  *NotaFiscal             `gorm:"foreignKey:NotaFiscalID" json:"nota_fiscal,omitempty"`
	Itens       []PurchaseReceivingItem `gorm:"foreignKey:ReceivingID" json:"itens,omitempty"`
}

func (PurchaseReceiving) TableName() string { return "purchase_receivings" }

type PurchaseReceivingItem struct {
	ID                 uint    `gorm:"primaryKey" json:"id"`
	ReceivingID        uint    `gorm:"column:receiving_id;not null" json:"receiving_id"`
	ProductID          uint    `gorm:"column:product_id;not null" json:"product_id"`
	QuantidadeRecebida float64 `gorm:"column:quantidade_recebida;type:numeric(10,2);not null" json:"quantidade_recebida"`
	Divergencias       *string `gorm:"size:255" json:"divergencias"`
	EstoqueAtualizado  bool    `gorm:"column:estoque_atualizado;default:false" json:"estoque_atualizado"`
	AtivoCriadoID      *uint   `gorm:"column:ativo_criado_id" json:"ativo_criado_id"`

	Receiving *PurchaseReceiving `gorm:"foreignKey:ReceivingID" json:"receiving,omitempty"`
	Product   *PurchaseProduct   `gorm:"foreignKey:ProductID" json:"product,omitempty"`
}

func (PurchaseReceivingItem) TableName() string { return "purchase_receiving_items" }

type ContractType struct {
	ID        uint    `gorm:"primaryKey" json:"id"`
	Nome      string  `gorm:"size:100;unique;not null" json:"nome"`
	Descricao *string `gorm:"size:255" json:"descricao"`
	Ativo     bool    `gorm:"default:true" json:"ativo"`

	Contracts []PurchaseContract `gorm:"foreignKey:TipoID" json:"contracts,omitempty"`
}

func (ContractType) TableName() string { return "contract_types" }

type PurchaseContract struct {
	ID                  uint      `gorm:"primaryKey" json:"id"`
	FornecedorID        uint      `gorm:"column:fornecedor_id;not null" json:"fornecedor_id"`
	Tipo                string    `gorm:"size:100;not null" json:"tipo"`
	TipoID              *uint     `gorm:"column:tipo_id" json:"tipo_id"`
	Numero              string    `gorm:"size:100;unique;not null" json:"numero"`
	DataInicio          time.Time `gorm:"column:data_inicio;not null" json:"data_inicio"`
	DataFim             time.Time `gorm:"column:data_fim;not null;index" json:"data_fim"`
	RenovacaoAutomatica bool      `gorm:"column:renovacao_automatica;default:false" json:"renovacao_automatica"`
	Valor               float64   `gorm:"type:numeric(12,2);not null" json:"valor"`
	Periodicidade       string    `gorm:"size:50;default:'Mensal'" json:"periodicidade"`
	ArquivoPDFPath      *string   `gorm:"column:arquivo_pdf_path;size:255" json:"arquivo_pdf_path"`
	AlertadoDias        *int      `gorm:"column:alertado_dias" json:"alertado_dias"`

	Fornecedor   *Fornecedor   `gorm:"foreignKey:FornecedorID" json:"fornecedor,omitempty"`
	TipoContrato *ContractType `gorm:"foreignKey:TipoID" json:"tipo_contrato,omitempty"`
}

func (PurchaseContract) TableName() string { return "purchase_contracts" }

type PurchaseAttachment struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	TabelaOrigem string    `gorm:"column:tabela_origem;size:50;not null;index" json:"tabela_origem"`
	RegistroID   uint      `gorm:"column:registro_id;not null;index" json:"registro_id"`
	ArquivoPath  string    `gorm:"column:arquivo_path;size:255;not null" json:"arquivo_path"`
	NomeOriginal string    `gorm:"column:nome_original;size:150;not null" json:"nome_original"`
	TipoArquivo  string    `gorm:"column:tipo_arquivo;size:50;not null" json:"tipo_arquivo"`
	DataEnvio    time.Time `gorm:"column:data_envio;default:CURRENT_TIMESTAMP" json:"data_envio"`
}

func (PurchaseAttachment) TableName() string { return "purchase_attachments" }

type PurchaseHistory struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	TabelaOrigem string    `gorm:"column:tabela_origem;size:50;not null;index" json:"tabela_origem"`
	RegistroID   uint      `gorm:"column:registro_id;not null;index" json:"registro_id"`
	UserID       uint      `gorm:"column:user_id;not null" json:"user_id"`
	Acao         string    `gorm:"size:100;not null" json:"acao"`
	DataAcao     time.Time `gorm:"column:data_acao;default:CURRENT_TIMESTAMP" json:"data_acao"`
	IPAddress    *string   `gorm:"column:ip_address;size:45" json:"ip_address"`
	Observacoes  *string   `gorm:"type:text" json:"observacoes"`

	User *User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

func (PurchaseHistory) TableName() string { return "purchase_history" }

type PurchaseNotification struct {
	ID                   uint      `gorm:"primaryKey" json:"id"`
	UserID               uint      `gorm:"column:user_id;not null" json:"user_id"`
	Mensagem             string    `gorm:"type:text;not null" json:"mensagem"`
	Lido                 bool      `gorm:"default:false" json:"lido"`
	DataCriacao          time.Time `gorm:"column:data_criacao;default:CURRENT_TIMESTAMP" json:"data_criacao"`
	LinkRedirecionamento *string   `gorm:"column:link_redirecionamento;size:255" json:"link_redirecionamento"`

	User *User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

func (PurchaseNotification) TableName() string { return "purchase_notifications" }

type MaterialStock struct {
	ID                      uint    `gorm:"primaryKey" json:"id"`
	ProductID               uint    `gorm:"column:product_id;unique;not null" json:"product_id"`
	QuantidadeSaldo         float64 `gorm:"column:quantidade_saldo;type:numeric(10,2);default:0" json:"quantidade_saldo"`
	LocalizacaoAlmoxarifado *string `gorm:"column:localizacao_almoxarifado;size:100" json:"localizacao_almoxarifado"`

	Product *PurchaseProduct `gorm:"foreignKey:ProductID" json:"product,omitempty"`
}

func (MaterialStock) TableName() string { return "material_stocks" }

type MaterialStockTransaction struct {
	ID               uint      `gorm:"primaryKey" json:"id"`
	ProductID        uint      `gorm:"column:product_id;not null" json:"product_id"`
	Quantidade       float64   `gorm:"type:numeric(10,2);not null" json:"quantidade"`
	TipoMovimentacao string    `gorm:"column:tipo_movimentacao;size:20;not null" json:"tipo_movimentacao"`
	OrigemTabela     *string   `gorm:"column:origem_tabela;size:50" json:"origem_tabela"`
	OrigemID         *uint     `gorm:"column:origem_id" json:"origem_id"`
	DataTransacao    time.Time `gorm:"column:data_transacao;default:CURRENT_TIMESTAMP" json:"data_transacao"`
	UserID           uint      `gorm:"column:user_id;not null" json:"user_id"`
	Justificativa    *string   `gorm:"size:255" json:"justificativa"`

	Product *PurchaseProduct `gorm:"foreignKey:ProductID" json:"product,omitempty"`
	User    *User            `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

func (MaterialStockTransaction) TableName() string { return "material_stock_transactions" }

type PurchaseResearch struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	Numero        string    `gorm:"size:50;unique;not null" json:"numero"`
	SolicitanteID uint      `gorm:"column:solicitante_id;not null" json:"solicitante_id"`
	Titulo        string    `gorm:"size:100;not null" json:"titulo"`
	Justificativa string    `gorm:"type:text;not null" json:"justificativa"`
	Status        string    `gorm:"size:20;default:'Rascunho';index" json:"status"`
	DataCriacao   time.Time `gorm:"column:data_criacao;default:CURRENT_TIMESTAMP" json:"data_criacao"`

	Solicitante *User                  `gorm:"foreignKey:SolicitanteID" json:"solicitante,omitempty"`
	Items       []PurchaseResearchItem `gorm:"foreignKey:ResearchID" json:"items,omitempty"`
}

func (PurchaseResearch) TableName() string { return "purchase_researches" }

type PurchaseResearchItem struct {
	ID            uint    `gorm:"primaryKey" json:"id"`
	ResearchID    uint    `gorm:"column:research_id;not null" json:"research_id"`
	NomeProduto   string  `gorm:"column:nome_produto;size:150;index;not null" json:"nome_produto"`
	LinkProduto   *string `gorm:"column:link_produto;type:text" json:"link_produto"`
	ImagemPath    *string `gorm:"column:imagem_path;size:255" json:"imagem_path"`
	ValorEstimado float64 `gorm:"column:valor_estimado;type:numeric(10,2);not null" json:"valor_estimado"`
	Quantidade    float64 `gorm:"type:numeric(10,2);default:1" json:"quantidade"`
	TipoProduto   string  `gorm:"column:tipo_produto;size:20;default:'Consumo'" json:"tipo_produto"`
	Aprovado      bool    `gorm:"default:true" json:"aprovado"`

	Research *PurchaseResearch `gorm:"foreignKey:ResearchID" json:"research,omitempty"`
}

func (PurchaseResearchItem) TableName() string { return "purchase_research_items" }
