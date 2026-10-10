package models

import (
	"time"
)

// UserGamificationProfile armazena a pontuação vitalícia, nível e estatísticas do técnico
type UserGamificationProfile struct {
	ID                     uint       `gorm:"primaryKey" json:"id"`
	UserID                 uint       `gorm:"uniqueIndex;not null" json:"user_id"`
	XPTotal                int64      `gorm:"default:0;not null" json:"xp_total"`
	NivelAtual             int        `gorm:"default:1;not null" json:"nivel_atual"`
	TechCoins              int64      `gorm:"default:0;not null" json:"tech_coins"`
	CurrentStreak          int        `gorm:"default:0;not null" json:"current_streak"`
	LastActivityDate       *time.Time `json:"last_activity_date"`
	AtividadesAtendidas    int        `gorm:"default:0;not null" json:"atividades_atendidas"`
	ChamadosResolvidos     int        `gorm:"default:0;not null" json:"chamados_resolvidos"`
	PreventivasConcluidas  int        `gorm:"default:0;not null" json:"preventivas_concluidas"`
	ManutencoesConcluidas  int        `gorm:"default:0;not null" json:"manutencoes_concluidas"`
	KanbanConcluidos       int        `gorm:"default:0;not null" json:"kanban_concluidos"`
	QRScansRealizados      int        `gorm:"default:0;not null" json:"qr_scans_realizados"`
	AvaliacoesCincoEstrelas int       `gorm:"default:0;not null" json:"avaliacoes_cinco_estrelas"`
	EmergenciasAtendidas    int       `gorm:"default:0;not null" json:"emergencias_atendidas"`
	CreatedAt              time.Time  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt              time.Time  `gorm:"autoUpdateTime" json:"updated_at"`

	User *User `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"user,omitempty"`
}

func (UserGamificationProfile) TableName() string {
	return "user_gamification_profiles"
}

// GamificationActivityLog audita cada evento que concedeu XP ao técnico
type GamificationActivityLog struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	UserID        uint      `gorm:"index;not null" json:"user_id"`
	TipoAtividade string    `gorm:"type:varchar(50);not null;index" json:"tipo_atividade"`
	ReferenciaID  *uint     `json:"referencia_id"`
	XPGanho       int       `gorm:"not null" json:"xp_ganho"`
	CoinsGanho    int       `gorm:"default:0;not null" json:"coins_ganho"`
	Descricao     string    `gorm:"type:varchar(255);not null" json:"descricao"`
	CreatedAt     time.Time `gorm:"autoCreateTime;index" json:"created_at"`

	User *User `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"user,omitempty"`
}

func (GamificationActivityLog) TableName() string {
	return "gamification_activity_logs"
}

// GamificationBadge define uma insígnia/conquista desbloqueável
type GamificationBadge struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Codigo    string    `gorm:"type:varchar(50);uniqueIndex;not null" json:"codigo"`
	Nome      string    `gorm:"type:varchar(100);not null" json:"nome"`
	Descricao string    `gorm:"type:varchar(255);not null" json:"descricao"`
	Icone     string    `gorm:"type:varchar(50);not null" json:"icone"`
	Categoria string    `gorm:"type:varchar(50);not null" json:"categoria"`
	XPBonus   int       `gorm:"default:0;not null" json:"xp_bonus"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}

func (GamificationBadge) TableName() string {
	return "gamification_badges"
}

// UserBadge registra o desbloqueio de uma insígnia por um usuário
type UserBadge struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	UserID        uint      `gorm:"uniqueIndex:idx_user_badge;not null" json:"user_id"`
	BadgeID       uint      `gorm:"uniqueIndex:idx_user_badge;not null" json:"badge_id"`
	DataConquista time.Time `gorm:"autoCreateTime" json:"data_conquista"`

	User  *User              `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"user,omitempty"`
	Badge *GamificationBadge `gorm:"foreignKey:BadgeID;constraint:OnDelete:CASCADE" json:"badge,omitempty"`
}

func (UserBadge) TableName() string {
	return "user_badges"
}
