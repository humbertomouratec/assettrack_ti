package repository

import (
	"errors"
	"time"

	"github.com/assettrack/backend/internal/models"
	"gorm.io/gorm"
)

type GamificationRepository struct {
	db *gorm.DB
}

func NewGamificationRepository(db *gorm.DB) *GamificationRepository {
	return &GamificationRepository{db: db}
}

// GetOrCreateProfile busca o perfil ou cria um novo com nível 1 e 0 XP
func (r *GamificationRepository) GetOrCreateProfile(userID uint) (*models.UserGamificationProfile, error) {
	var profile models.UserGamificationProfile
	err := r.db.Preload("User").Where("user_id = ?", userID).First(&profile).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		profile = models.UserGamificationProfile{
			UserID:      userID,
			XPTotal:     0,
			NivelAtual:  1,
			TechCoins:   0,
			CurrentStreak: 0,
		}
		if err := r.db.Create(&profile).Error; err != nil {
			return nil, err
		}
		// Preload user
		_ = r.db.Preload("User").First(&profile, profile.ID)
		return &profile, nil
	}
	return &profile, err
}

func (r *GamificationRepository) UpdateProfile(profile *models.UserGamificationProfile) error {
	return r.db.Save(profile).Error
}

func (r *GamificationRepository) CreateActivityLog(log *models.GamificationActivityLog) error {
	return r.db.Create(log).Error
}

func (r *GamificationRepository) GetRecentLogs(userID uint, limit int) ([]models.GamificationActivityLog, error) {
	var logs []models.GamificationActivityLog
	err := r.db.Where("user_id = ?", userID).Order("created_at desc").Limit(limit).Find(&logs).Error
	return logs, err
}

// LeaderboardEntry representa uma linha formatada do ranking
type LeaderboardEntry struct {
	UserID     uint   `json:"user_id"`
	Nome       string `json:"nome"`
	Email      string `json:"email"`
	Foto       string `json:"foto"`
	Cargo      string `json:"cargo"`
	Matricula  string `json:"matricula"`
	XPTotal    int64  `json:"xp_total"`
	NivelAtual int    `json:"nivel_atual"`
	TechCoins  int64  `json:"tech_coins"`
	Streak     int    `json:"current_streak"`
	Atividades int    `json:"atividades_atendidas"`
	Posicao    int    `json:"posicao"`
}

// GetLeaderboardVitalicio retorna o ranking geral de XP acumulado
func (r *GamificationRepository) GetLeaderboardVitalicio(limit, offset int) ([]LeaderboardEntry, int64, error) {
	var total int64
	r.db.Model(&models.UserGamificationProfile{}).Count(&total)

	var profiles []models.UserGamificationProfile
	err := r.db.Preload("User").Order("xp_total desc, updated_at asc").
		Limit(limit).Offset(offset).Find(&profiles).Error
	if err != nil {
		return nil, 0, err
	}

	entries := make([]LeaderboardEntry, 0, len(profiles))
	for i, p := range profiles {
		nome := ""
		email := ""
		foto := ""
		cargo := ""
		mat := ""
		if p.User != nil {
			nome = p.User.Nome
			email = p.User.Email
			if p.User.AvatarURL != nil {
				foto = *p.User.AvatarURL
			}
			if p.User.Cargo != nil {
				cargo = *p.User.Cargo
			}
			if p.User.Matricula != nil {
				mat = *p.User.Matricula
			}
		}
		entries = append(entries, LeaderboardEntry{
			UserID:     p.UserID,
			Nome:       nome,
			Email:      email,
			Foto:       foto,
			Cargo:      cargo,
			Matricula:  mat,
			XPTotal:    p.XPTotal,
			NivelAtual: p.NivelAtual,
			TechCoins:  p.TechCoins,
			Streak:     p.CurrentStreak,
			Atividades: p.AtividadesAtendidas,
			Posicao:    offset + i + 1,
		})
	}

	return entries, total, nil
}

// GetLeaderboardPeriodo filtra os pontos ganhos a partir de uma data (semanal ou mensal)
func (r *GamificationRepository) GetLeaderboardPeriodo(since time.Time, limit int) ([]LeaderboardEntry, error) {
	type AggregatedScore struct {
		UserID     uint  `gorm:"column:user_id"`
		XPSoma     int64 `gorm:"column:xp_soma"`
		Atividades int   `gorm:"column:atividades_count"`
	}

	var scores []AggregatedScore
	err := r.db.Model(&models.GamificationActivityLog{}).
		Select("user_id, sum(xp_ganho) as xp_soma, count(*) as atividades_count").
		Where("created_at >= ?", since).
		Group("user_id").
		Order("xp_soma desc").
		Limit(limit).
		Scan(&scores).Error
	if err != nil {
		return nil, err
	}

	entries := make([]LeaderboardEntry, 0, len(scores))
	for i, s := range scores {
		var user models.User
		_ = r.db.First(&user, s.UserID)

		var profile models.UserGamificationProfile
		_ = r.db.Where("user_id = ?", s.UserID).First(&profile)

		foto := ""
		if user.AvatarURL != nil {
			foto = *user.AvatarURL
		}
		cargo := ""
		if user.Cargo != nil {
			cargo = *user.Cargo
		}
		mat := ""
		if user.Matricula != nil {
			mat = *user.Matricula
		}

		entries = append(entries, LeaderboardEntry{
			UserID:     s.UserID,
			Nome:       user.Nome,
			Email:      user.Email,
			Foto:       foto,
			Cargo:      cargo,
			Matricula:  mat,
			XPTotal:    s.XPSoma,
			NivelAtual: profile.NivelAtual,
			TechCoins:  profile.TechCoins,
			Streak:     profile.CurrentStreak,
			Atividades: s.Atividades,
			Posicao:    i + 1,
		})
	}

	return entries, nil
}

// GetAllBadges lista todas as insígnias cadastradas
func (r *GamificationRepository) GetAllBadges() ([]models.GamificationBadge, error) {
	var badges []models.GamificationBadge
	err := r.db.Order("xp_bonus asc, id asc").Find(&badges).Error
	return badges, err
}

// GetUserBadges retorna as insígnias já conquistadas pelo usuário
func (r *GamificationRepository) GetUserBadges(userID uint) ([]models.UserBadge, error) {
	var userBadges []models.UserBadge
	err := r.db.Preload("Badge").Where("user_id = ?", userID).Order("data_conquista desc").Find(&userBadges).Error
	return userBadges, err
}

// HasBadge verifica se o usuário já possui determinada insígnia
func (r *GamificationRepository) HasBadge(userID uint, badgeCodigo string) (bool, error) {
	var count int64
	err := r.db.Model(&models.UserBadge{}).
		Joins("JOIN gamification_badges ON gamification_badges.id = user_badges.badge_id").
		Where("user_badges.user_id = ? AND gamification_badges.codigo = ?", userID, badgeCodigo).
		Count(&count).Error
	return count > 0, err
}

// AwardBadge concede uma insígnia ao usuário
func (r *GamificationRepository) AwardBadge(userID uint, badgeID uint) (*models.UserBadge, error) {
	ub := &models.UserBadge{
		UserID:  userID,
		BadgeID: badgeID,
	}
	if err := r.db.Create(ub).Error; err != nil {
		return nil, err
	}
	_ = r.db.Preload("Badge").First(ub, ub.ID)
	return ub, nil
}

// GetBadgeByCodigo busca uma insígnia pelo seu código único
func (r *GamificationRepository) GetBadgeByCodigo(codigo string) (*models.GamificationBadge, error) {
	var badge models.GamificationBadge
	err := r.db.Where("codigo = ?", codigo).First(&badge).Error
	if err != nil {
		return nil, err
	}
	return &badge, nil
}

// SeedDefaultBadges cadastra as conquistas iniciais do sistema caso não existam
func (r *GamificationRepository) SeedDefaultBadges() error {
	defaultBadges := []models.GamificationBadge{
		{
			Codigo:    "primeiro_passo",
			Nome:      "Primeiro Passo",
			Descricao: "Concluiu a primeira atividade no sistema AssetTrack TI.",
			Icone:     "Rocket",
			Categoria: "Iniciação",
			XPBonus:   50,
		},
		{
			Codigo:    "relampago",
			Nome:      "Técnico Relâmpago",
			Descricao: "Resolveu chamados em tempo recorde dentro do SLA.",
			Icone:     "Zap",
			Categoria: "Eficiência",
			XPBonus:   150,
		},
		{
			Codigo:    "mestre_checklist",
			Nome:      "Mestre do Checklist",
			Descricao: "Concluiu 10 manutenções preventivas com inspeção e fotos.",
			Icone:     "CheckCircle2",
			Categoria: "Qualidade",
			XPBonus:   300,
		},
		{
			Codigo:    "cinco_estrelas",
			Nome:      "Nota Máxima",
			Descricao: "Recebeu avaliações 5 estrelas dos colaboradores atendidos.",
			Icone:     "Star",
			Categoria: "Excelência",
			XPBonus:   250,
		},
		{
			Codigo:    "guardiao_patrimonio",
			Nome:      "Guardião do Patrimônio",
			Descricao: "Realizou auditorias e leituras de QR Code dos ativos da empresa.",
			Icone:     "ShieldCheck",
			Categoria: "Auditoria",
			XPBonus:   200,
		},
		{
			Codigo:    "resolutor_crises",
			Nome:      "Herói das Emergências",
			Descricao: "Atendeu e normalizou ocorrências críticas de emergência.",
			Icone:     "Flame",
			Categoria: "Heróico",
			XPBonus:   500,
		},
		{
			Codigo:    "streak_7d",
			Nome:      "Sem Parar (7 Dias)",
			Descricao: "Manteve produtividade ativa consecutiva por 7 dias seguidos.",
			Icone:     "FlameKindling",
			Categoria: "Dedicação",
			XPBonus:   350,
		},
		{
			Codigo:    "mestre_kanban",
			Nome:      "Ágil e Veloz",
			Descricao: "Concluiu 15 cards de projetos no quadro Kanban.",
			Icone:     "Kanban",
			Categoria: "Organização",
			XPBonus:   220,
		},
		{
			Codigo:    "mestre_reparos",
			Nome:      "Especialista em Reparos",
			Descricao: "Concluiu 5 manutenções e reparos em ativos do sistema.",
			Icone:     "Wrench",
			Categoria: "Oficina",
			XPBonus:   280,
		},
	}

	for _, b := range defaultBadges {
		var existing models.GamificationBadge
		err := r.db.Where("codigo = ?", b.Codigo).First(&existing).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			_ = r.db.Create(&b)
		}
	}
	return nil
}
