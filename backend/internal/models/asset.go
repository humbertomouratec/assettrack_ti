package models

import (
	"time"
)

type AssetStatus string

const (
	AssetStatusDisponivel AssetStatus = "Disponível"
	AssetStatusEmUso      AssetStatus = "Em uso"
	AssetStatusManutencao AssetStatus = "Manutenção"
	AssetStatusArmazenado AssetStatus = "Armazenado"
	AssetStatusBaixado    AssetStatus = "Baixado"
)

type Asset struct {
	ID                     uint        `gorm:"primaryKey" json:"id"`
	Nome                   string      `gorm:"not null;index" json:"nome"`
	EPatrimonio            string      `gorm:"unique;not null;column:e_patrimonio" json:"e_patrimonio"`
	Modelo                 *string     `json:"modelo"`
	Descricao              *string     `gorm:"type:text" json:"descricao"`
	DataAquisicao          *time.Time  `json:"data_aquisicao"`
	Valor                  *float64    `gorm:"type:numeric(10,2)" json:"valor"`
	Status                 AssetStatus `gorm:"index;default:'Disponível'" json:"status"`
	QRCodePath             *string     `gorm:"column:qr_code_path" json:"qr_code_path"`
	FotoPath               *string     `gorm:"column:foto_path" json:"foto_path"`
	NumeroSerie            *string     `gorm:"index;column:numero_serie" json:"numero_serie"`
	EmPosseDe              *string     `gorm:"column:em_posse_de" json:"em_posse_de"`
	Bloqueado              bool        `gorm:"default:false" json:"bloqueado"`
	RequerTermoRH          bool        `gorm:"column:requer_termo_rh;default:false" json:"requer_termo_rh"`
	CategoriaID            *uint       `gorm:"column:categoria_id" json:"categoria_id"`
	CreatedByID            *uint       `gorm:"column:created_by_id" json:"created_by_id"`
	FornecedorID           *uint       `gorm:"column:fornecedor_id" json:"fornecedor_id"`
	NotaFiscalID           *uint       `gorm:"column:nota_fiscal_id" json:"nota_fiscal_id"`
	CurrentUserID          *uint       `gorm:"column:current_user_id" json:"current_user_id"`
	CurrentDepartamentoID  *uint       `gorm:"column:current_departamento_id" json:"current_departamento_id"`
	CurrentLocalID         *uint       `gorm:"column:current_local_id" json:"current_local_id"`
	CurrentArmazenamentoID *uint       `gorm:"column:current_armazenamento_id" json:"current_armazenamento_id"`

	// Histórico de transição (Edge Case 2: Ativo Fixo em Manutenção)
	PrevStatus          *string `gorm:"column:prev_status" json:"prev_status"`
	PrevUserID          *uint   `gorm:"column:prev_user_id" json:"prev_user_id"`
	PrevDepartamentoID  *uint   `gorm:"column:prev_departamento_id" json:"prev_departamento_id"`
	PrevLocalID         *uint   `gorm:"column:prev_local_id" json:"prev_local_id"`
	PrevArmazenamentoID *uint   `gorm:"column:prev_armazenamento_id" json:"prev_armazenamento_id"`

	// Relacionamentos GORM
	CurrentUser          *User          `gorm:"foreignKey:CurrentUserID" json:"current_user,omitempty"`
	CurrentDepartamento  *Departamento  `gorm:"foreignKey:CurrentDepartamentoID" json:"current_departamento,omitempty"`
	CurrentLocal         *Localizacao   `gorm:"foreignKey:CurrentLocalID" json:"current_local,omitempty"`
	CurrentArmazenamento *Armazenamento `gorm:"foreignKey:CurrentArmazenamentoID" json:"current_armazenamento,omitempty"`
	PrevLocal            *Localizacao   `gorm:"foreignKey:PrevLocalID" json:"prev_local,omitempty"`
	PrevArmazenamento    *Armazenamento `gorm:"foreignKey:PrevArmazenamentoID" json:"prev_armazenamento,omitempty"`
	CreatedBy            *User          `gorm:"foreignKey:CreatedByID" json:"created_by,omitempty"`
	Fornecedor           *Fornecedor    `gorm:"foreignKey:FornecedorID" json:"fornecedor,omitempty"`
	NotaFiscal           *NotaFiscal    `gorm:"foreignKey:NotaFiscalID" json:"nota_fiscal,omitempty"`
	Categoria            *AssetCategory `gorm:"foreignKey:CategoriaID" json:"categoria,omitempty"`

	Movimentacoes          []Movimentacao          `gorm:"foreignKey:AssetID;constraint:OnDelete:CASCADE" json:"movimentacoes,omitempty"`
	Solicitacoes           []Solicitacao           `gorm:"foreignKey:AssetID;constraint:OnDelete:CASCADE" json:"solicitacoes,omitempty"`
	SolicitacoesManutencao []SolicitacaoManutencao `gorm:"foreignKey:AssetID;constraint:OnDelete:CASCADE" json:"solicitacoes_manutencao,omitempty"`
	Manutencoes            []Manutencao            `gorm:"foreignKey:AssetID;constraint:OnDelete:CASCADE" json:"manutencoes,omitempty"`
}

func (Asset) TableName() string { return "assets" }
