package models

import (
	"time"
)

type TipoManutencao string

const (
	TipoManutencaoPreventiva TipoManutencao = "preventiva"
	TipoManutencaoCorretiva  TipoManutencao = "corretiva"
	TipoManutencaoUpgrade    TipoManutencao = "upgrade"
	TipoManutencaoOutro      TipoManutencao = "outro"
)

type StatusManutencao string

const (
	StatusManutencaoEmAndamento StatusManutencao = "em_andamento"
	StatusManutencaoConcluida   StatusManutencao = "concluida"
	StatusManutencaoCancelada   StatusManutencao = "cancelada"
)

type DestinoManutencao string

const (
	DestinoManutencaoArmazenamento DestinoManutencao = "armazenamento"
	DestinoManutencaoUsuario       DestinoManutencao = "usuario"
)

type PrioridadeSolicitacao string

const (
	PrioridadeSolicitacaoBaixa   PrioridadeSolicitacao = "baixa"
	PrioridadeSolicitacaoMedia   PrioridadeSolicitacao = "media"
	PrioridadeSolicitacaoAlta    PrioridadeSolicitacao = "alta"
	PrioridadeSolicitacaoCritica PrioridadeSolicitacao = "critica"
)

type StatusSolicitacaoManutencao string

const (
	StatusMaintPendente          StatusSolicitacaoManutencao = "pendente"
	StatusMaintAceita            StatusSolicitacaoManutencao = "aceita"
	StatusMaintEmAndamento       StatusSolicitacaoManutencao = "em_andamento"
	StatusMaintAguardandoEntrega StatusSolicitacaoManutencao = "aguardando_entrega"
	StatusMaintEntregue          StatusSolicitacaoManutencao = "entregue"
	StatusMaintConcluida         StatusSolicitacaoManutencao = "concluida"
	StatusMaintRejeitada         StatusSolicitacaoManutencao = "rejeitada"
)

type SolicitacaoManutencao struct {
	ID                   uint                        `gorm:"primaryKey" json:"id"`
	SolicitanteID        *uint                       `gorm:"column:solicitante_id" json:"solicitante_id"`
	AssetID              uint                        `gorm:"column:asset_id;not null" json:"asset_id"`
	Descricao            string                      `gorm:"type:text;not null" json:"descricao"`
	Prioridade           PrioridadeSolicitacao       `gorm:"type:varchar(20);default:'media'" json:"prioridade"`
	DataSolicitacao      time.Time                   `gorm:"column:data_solicitacao;autoCreateTime" json:"data_solicitacao"`
	DataResposta         *time.Time                  `gorm:"column:data_resposta" json:"data_resposta"`
	DataConclusaoTecnico *time.Time                  `gorm:"column:data_conclusao_tecnico" json:"data_conclusao_tecnico"`
	DataEntrega          *time.Time                  `gorm:"column:data_entrega" json:"data_entrega"`
	Status               StatusSolicitacaoManutencao `gorm:"type:varchar(30);default:'pendente'" json:"status"`
	ResponsavelID        *uint                       `gorm:"column:responsavel_id" json:"responsavel_id"`
	ObservacaoResposta   *string                     `gorm:"column:observacao_resposta;type:text" json:"observacao_resposta"`
	ManutencaoID         *uint                       `gorm:"column:manutencao_id" json:"manutencao_id"`

	Solicitante *User       `gorm:"foreignKey:SolicitanteID" json:"solicitante,omitempty"`
	Responsavel *User       `gorm:"foreignKey:ResponsavelID" json:"responsavel,omitempty"`
	Asset       *Asset      `gorm:"foreignKey:AssetID" json:"asset,omitempty"`
	Manutencao  *Manutencao `gorm:"foreignKey:ManutencaoID" json:"manutencao,omitempty"`
	SolicitacoesCompra []PurchaseRequest `gorm:"foreignKey:OrigemTicketID" json:"solicitacoes_compra,omitempty"`
}

func (SolicitacaoManutencao) TableName() string { return "solicitacoes_manutencao" }

type Manutencao struct {
	ID                  uint               `gorm:"primaryKey" json:"id"`
	AssetID             uint               `gorm:"column:asset_id;not null" json:"asset_id"`
	ResponsavelID       *uint              `gorm:"column:responsavel_id" json:"responsavel_id"`
	Motivo              string             `gorm:"type:text;not null" json:"motivo"`
	Tipo                TipoManutencao     `gorm:"type:varchar(20);default:'corretiva'" json:"tipo"`
	DataEntrada         time.Time          `gorm:"column:data_entrada;autoCreateTime" json:"data_entrada"`
	DataPrevisao        *time.Time         `gorm:"column:data_previsao" json:"data_previsao"`
	DataConclusao       *time.Time         `gorm:"column:data_conclusao" json:"data_conclusao"`
	Status              StatusManutencao   `gorm:"type:varchar(20);default:'em_andamento'" json:"status"`
	ObservacaoConclusao *string            `gorm:"column:observacao_conclusao;type:text" json:"observacao_conclusao"`
	Custo               *float64           `gorm:"type:numeric(10,2)" json:"custo"`
	DestinoTipo         *DestinoManutencao `gorm:"column:destino_tipo;type:varchar(20)" json:"destino_tipo"`
	DestinoUserID       *uint              `gorm:"column:destino_user_id" json:"destino_user_id"`

	Asset       *Asset `gorm:"foreignKey:AssetID" json:"asset,omitempty"`
	Responsavel *User  `gorm:"foreignKey:ResponsavelID" json:"responsavel,omitempty"`
	DestinoUser *User  `gorm:"foreignKey:DestinoUserID" json:"destino_user,omitempty"`
}

func (Manutencao) TableName() string { return "manutencoes" }
