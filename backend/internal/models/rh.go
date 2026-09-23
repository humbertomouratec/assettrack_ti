package models

import "time"

type TermoResponsabilidade struct {
	ID             uint       `gorm:"primaryKey" json:"id"`
	SolicitacaoID  *uint      `gorm:"column:solicitacao_id" json:"solicitacao_id"`
	AssetID        uint       `gorm:"column:asset_id;not null" json:"asset_id"`
	UsuarioID      uint       `gorm:"column:usuario_id;not null" json:"usuario_id"`
	Status         string     `gorm:"type:varchar(30);default:'Pendente'" json:"status"`
	ConteudoTermo  string     `gorm:"type:text;not null" json:"conteudo_termo"`
	DataGeracao    time.Time  `gorm:"column:data_geracao;autoCreateTime" json:"data_geracao"`
	DataAssinatura *time.Time `gorm:"column:data_assinatura" json:"data_assinatura"`

	Solicitacao *Solicitacao `gorm:"foreignKey:SolicitacaoID" json:"solicitacao,omitempty"`
	Asset       *Asset       `gorm:"foreignKey:AssetID" json:"asset,omitempty"`
	Usuario     *User        `gorm:"foreignKey:UsuarioID" json:"usuario,omitempty"`
}

func (TermoResponsabilidade) TableName() string { return "termos_responsabilidade" }

// RHStatus is an HR-managed period in an employee's work calendar.  The
// effective status is calculated from the periods that are active right now,
// so a scheduled vacation never needs a manual status change on its first day.
type RHStatus struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	UsuarioID   uint       `gorm:"column:usuario_id;not null;index" json:"usuario_id"`
	Tipo        string     `gorm:"type:varchar(30);not null;index" json:"tipo"`
	Inicio      time.Time  `gorm:"column:inicio;not null;index" json:"inicio"`
	Fim         *time.Time `gorm:"column:fim;index" json:"fim"`
	Horas       *float64   `gorm:"column:horas" json:"horas"`
	Observacao  *string    `gorm:"type:text" json:"observacao"`
	CriadoPorID uint       `gorm:"column:criado_por_id;not null" json:"criado_por_id"`
	CreatedAt   time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`

	Usuario   *User `gorm:"foreignKey:UsuarioID" json:"usuario,omitempty"`
	CriadoPor *User `gorm:"foreignKey:CriadoPorID" json:"criado_por,omitempty"`
}

func (RHStatus) TableName() string { return "rh_status" }

// RHComunicado is an individual, sector-wide or company-wide message, independently kept
// from the general system notices so it can be shown only to its recipient.
type RHComunicado struct {
	ID             uint          `gorm:"primaryKey" json:"id"`
	UsuarioID      *uint         `gorm:"column:usuario_id;index" json:"usuario_id"`
	DepartamentoID *uint         `gorm:"column:departamento_id;index" json:"departamento_id"`
	Titulo         string        `gorm:"not null" json:"titulo"`
	Mensagem       string        `gorm:"type:text;not null" json:"mensagem"`
	Inicio         time.Time     `gorm:"column:inicio;not null;index" json:"inicio"`
	Fim            *time.Time    `gorm:"column:fim;index" json:"fim"`
	Ativo          bool          `gorm:"default:true" json:"ativo"`
	ImagemURL      *string       `gorm:"column:imagem_url;type:text" json:"imagem_url"`
	AudioURL       *string       `gorm:"column:audio_url;type:text" json:"audio_url"`
	VideoURL       *string       `gorm:"column:video_url;type:text" json:"video_url"`
	MidiaTipo      *string       `gorm:"column:midia_tipo;type:varchar(20)" json:"midia_tipo"`
	CriadoPorID    uint          `gorm:"column:criado_por_id;not null" json:"criado_por_id"`
	CreatedAt      time.Time     `gorm:"column:created_at;autoCreateTime" json:"created_at"`

	Usuario      *User         `gorm:"foreignKey:UsuarioID" json:"usuario,omitempty"`
	Departamento *Departamento `gorm:"foreignKey:DepartamentoID" json:"departamento,omitempty"`
	CriadoPor    *User         `gorm:"foreignKey:CriadoPorID" json:"criado_por,omitempty"`
}

func (RHComunicado) TableName() string { return "rh_comunicados" }

// RHComunicadoLeitura stores acknowledgement per recipient, including for
// company-wide messages, without mutating the message for other employees.
type RHComunicadoLeitura struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	ComunicadoID uint      `gorm:"column:comunicado_id;not null;uniqueIndex:idx_rh_comunicado_leitura" json:"comunicado_id"`
	UsuarioID    uint      `gorm:"column:usuario_id;not null;uniqueIndex:idx_rh_comunicado_leitura" json:"usuario_id"`
	LidoEm       time.Time `gorm:"column:lido_em;autoCreateTime" json:"lido_em"`
}

func (RHComunicadoLeitura) TableName() string { return "rh_comunicado_leituras" }

type RHMensagem struct {
	ID             uint       `gorm:"primaryKey" json:"id"`
	RemetenteID    uint       `gorm:"column:remetente_id;not null;index" json:"remetente_id"`
	DestinatarioID uint       `gorm:"column:destinatario_id;not null;index" json:"destinatario_id"`
	Assunto        string     `gorm:"not null" json:"assunto"`
	Mensagem       string     `gorm:"type:text;not null" json:"mensagem"`
	CriadoEm       time.Time  `gorm:"column:criado_em;autoCreateTime" json:"criado_em"`
	ConfirmadoEm   *time.Time `gorm:"column:confirmado_em" json:"confirmado_em"`
	Remetente      *User      `gorm:"foreignKey:RemetenteID" json:"remetente,omitempty"`
	Destinatario   *User      `gorm:"foreignKey:DestinatarioID" json:"destinatario,omitempty"`
}

func (RHMensagem) TableName() string { return "rh_mensagens" }
