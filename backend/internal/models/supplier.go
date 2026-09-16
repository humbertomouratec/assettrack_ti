package models

type Fornecedor struct {
	ID             uint    `gorm:"primaryKey" json:"id"`
	Nome           string  `gorm:"not null;index" json:"nome"`
	RazaoSocial    *string `json:"razao_social"`
	CNPJ           *string `gorm:"unique" json:"cnpj"`
	Email          *string `json:"email"`
	Telefone       *string `json:"telefone"`
	Endereco       *string `json:"endereco"`
	Cidade         *string `json:"cidade"`
	Estado         *string `json:"estado"`
	TipoFornecedor *string      `json:"tipo_fornecedor"`
	NotasFiscais   []NotaFiscal `gorm:"foreignKey:FornecedorID" json:"notas_fiscais,omitempty"`
}

func (Fornecedor) TableName() string { return "fornecedores" }
