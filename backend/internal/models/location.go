package models

// Departamento maps to "departamentos" table
type Departamento struct {
	ID            uint   `gorm:"primaryKey" json:"id"`
	Nome          string `gorm:"uniqueIndex;not null" json:"nome"`
	ResponsavelID *uint  `gorm:"column:responsavel_id" json:"responsavel_id"`
	Responsavel   *User  `gorm:"foreignKey:ResponsavelID" json:"responsavel,omitempty"`
}

func (Departamento) TableName() string { return "departamentos" }

// Localizacao maps to "locais" table
type Localizacao struct {
	ID             uint   `gorm:"primaryKey" json:"id"`
	Nome           string `gorm:"not null" json:"nome"`
	DepartamentoID *uint  `gorm:"column:departamento_id" json:"departamento_id"`

	Departamento *Departamento `gorm:"foreignKey:DepartamentoID" json:"departamento,omitempty"`
}

func (Localizacao) TableName() string { return "locais" }

// Armazenamento maps to "armazenamentos" table
type Armazenamento struct {
	ID            uint    `gorm:"primaryKey" json:"id"`
	Nome          string  `gorm:"unique;not null" json:"nome"`
	CapacidadeMax int     `gorm:"default:0" json:"capacidade_max"`
	TipoItens     *string `json:"tipo_itens"`
}

func (Armazenamento) TableName() string { return "armazenamentos" }
