package models

import "time"

// UserRole constants matching PostgreSQL enum values
const (
	RoleAdmin        = "admin"
	RoleGerente      = "gerente_ti"
	RoleTecnico      = "tecnico"
	RoleGerenteInfra = "gerente_infra"
	RoleComprador    = "comprador"
	RoleUsuario      = "usuario_comum"
	RoleRH           = "rh"
)

// ValidRoles for validation
var ValidRoles = []string{
	RoleAdmin, RoleGerente, RoleTecnico, RoleGerenteInfra,
	RoleComprador, RoleUsuario, RoleRH,
}

// User maps to the existing "users" table
type User struct {
	ID               uint       `gorm:"primaryKey" json:"id"`
	Email            string     `gorm:"unique;not null" json:"email"`
	HashedPassword   string     `gorm:"column:hashed_password;not null" json:"-"`
	Nome             string     `gorm:"not null" json:"nome"`
	Matricula        *string    `gorm:"unique" json:"matricula"`
	Cargo            *string    `json:"cargo"`
	Role             string     `gorm:"type:varchar(20);default:'usuario_comum'" json:"role"`
	IsActive         bool       `gorm:"default:false" json:"is_active"`
	ShowOnMonitoring bool       `gorm:"column:show_on_monitoring;default:false" json:"show_on_monitoring"`
	AvatarURL        *string    `gorm:"column:avatar_url" json:"avatar_url"`
	QRToken          *string    `gorm:"column:qr_token;unique" json:"-"`
	QRTokenCreatedAt *time.Time `gorm:"column:qr_token_created_at" json:"-"`
	PINHash          *string    `gorm:"column:pin_hash" json:"-"`
	DepartamentoID   *uint      `gorm:"column:departamento_id" json:"departamento_id"`
	GestorID         *uint      `gorm:"column:gestor_id;index" json:"gestor_id"`
	LocalizacaoID    *uint      `gorm:"column:localizacao_id" json:"localizacao_id"`

	// Relationships (loaded explicitly)
	Departamento *Departamento `gorm:"foreignKey:DepartamentoID" json:"departamento,omitempty"`
	Gestor       *User         `gorm:"foreignKey:GestorID" json:"gestor,omitempty"`
	Localizacao  *Localizacao  `gorm:"foreignKey:LocalizacaoID" json:"localizacao,omitempty"`

	SolicitacoesManutencao            []SolicitacaoManutencao `gorm:"foreignKey:SolicitanteID;constraint:OnDelete:SET NULL" json:"solicitacoes_manutencao,omitempty"`
	SolicitacoesManutencaoResponsavel []SolicitacaoManutencao `gorm:"foreignKey:ResponsavelID;constraint:OnDelete:SET NULL" json:"solicitacoes_manutencao_responsavel,omitempty"`
	ManutencoesResponsavel            []Manutencao            `gorm:"foreignKey:ResponsavelID;constraint:OnDelete:SET NULL" json:"manutencoes_responsavel,omitempty"`
	ManutencoesRecebidas              []Manutencao            `gorm:"foreignKey:DestinoUserID;constraint:OnDelete:SET NULL" json:"manutencoes_recebidas,omitempty"`
	MovimentacoesOrigem               []Movimentacao          `gorm:"foreignKey:DeUserID;constraint:OnDelete:SET NULL" json:"movimentacoes_origem,omitempty"`
	MovimentacoesDestino              []Movimentacao          `gorm:"foreignKey:ParaUserID;constraint:OnDelete:SET NULL" json:"movimentacoes_destino,omitempty"`
	Solicitacoes                      []Solicitacao           `gorm:"foreignKey:SolicitanteID;constraint:OnDelete:SET NULL" json:"solicitacoes,omitempty"`
	Aprovacoes                        []Solicitacao           `gorm:"foreignKey:AprovadorID;constraint:OnDelete:SET NULL" json:"aprovacoes,omitempty"`
}

func (User) TableName() string { return "users" }

// IsAdmin checks if user has admin role
func (u *User) IsAdmin() bool { return u.Role == RoleAdmin }

// IsManagerOrAbove checks manager-level permissions
func (u *User) IsManagerOrAbove() bool {
	return u.Role == RoleAdmin || u.Role == RoleGerente ||
		u.Role == RoleGerenteInfra || u.Role == RoleComprador || u.Role == RoleTecnico
}

// CanManageSuppliers checks supplier module access (admin, gerente, gerente_infra, comprador)
func (u *User) CanManageSuppliers() bool {
	return u.Role == RoleAdmin || u.Role == RoleGerente ||
		u.Role == RoleGerenteInfra || u.Role == RoleComprador
}

// CanManageRH checks RH module access (admin, rh, gerente, gerente_infra)
func (u *User) CanManageRH() bool {
	return u.Role == RoleAdmin || u.Role == RoleRH ||
		u.Role == RoleGerente || u.Role == RoleGerenteInfra
}

// HasPIN returns whether user has a PIN configured
func (u *User) HasPIN() bool { return u.PINHash != nil && *u.PINHash != "" }
