package service

import (
	"math"
	"sync"
	"time"

	"github.com/assettrack/backend/internal/models"
	"github.com/assettrack/backend/internal/repository"
)

type GamificationService struct {
	repo *repository.GamificationRepository
	mu   sync.Mutex
}

func NewGamificationService(repo *repository.GamificationRepository) *GamificationService {
	// Seed default badges
	_ = repo.SeedDefaultBadges()
	return &GamificationService{repo: repo}
}

// XP Threshold calculation: XP = floor(100 * (L - 1)^1.6 + 150 * (L - 1))
func (s *GamificationService) GetXPForLevel(level int) int64 {
	if level <= 1 {
		return 0
	}
	l := float64(level - 1)
	return int64(math.Floor(100*math.Pow(l, 1.6) + 150*l))
}

// CalculateLevel finds the current level based on total XP
func (s *GamificationService) CalculateLevel(totalXP int64) int {
	if totalXP <= 0 {
		return 1
	}
	level := 1
	for {
		nextXP := s.GetXPForLevel(level + 1)
		if totalXP < nextXP {
			break
		}
		level++
		if level >= 100 {
			break
		}
	}
	return level
}

// GetLevelTitle returns a thematic title for the technician's level
func (s *GamificationService) GetLevelTitle(level int) string {
	switch {
	case level < 5:
		return "Recruta de TI"
	case level < 10:
		return "Técnico de Suporte"
	case level < 20:
		return "Especialista em Sistemas"
	case level < 35:
		return "Mestre da Infraestrutura"
	case level < 50:
		return "Engenheiro Sênior de TI"
	default:
		return "Lenda do AssetTrack TI"
	}
}

// LevelProgressData detalha o status do nível para a interface
type LevelProgressData struct {
	CurrentLevel   int     `json:"current_level"`
	Title          string  `json:"title"`
	CurrentLevelXP int64   `json:"current_level_xp"`
	NextLevelXP    int64   `json:"next_level_xp"`
	XPInLevel      int64   `json:"xp_in_level"`
	XPNeeded       int64   `json:"xp_needed"`
	ProgressPct    float64 `json:"progress_pct"`
	TotalXP        int64   `json:"total_xp"`
}

func (s *GamificationService) GetLevelProgress(totalXP int64) LevelProgressData {
	lvl := s.CalculateLevel(totalXP)
	currentXP := s.GetXPForLevel(lvl)
	nextXP := s.GetXPForLevel(lvl + 1)

	xpInLevel := totalXP - currentXP
	xpNeeded := nextXP - currentXP
	if xpNeeded <= 0 {
		xpNeeded = 1
	}

	pct := (float64(xpInLevel) / float64(xpNeeded)) * 100
	if pct > 100 {
		pct = 100
	} else if pct < 0 {
		pct = 0
	}

	return LevelProgressData{
		CurrentLevel:   lvl,
		Title:          s.GetLevelTitle(lvl),
		CurrentLevelXP: currentXP,
		NextLevelXP:    nextXP,
		XPInLevel:      xpInLevel,
		XPNeeded:       xpNeeded,
		ProgressPct:    math.Round(pct*10) / 10,
		TotalXP:        totalXP,
	}
}

// AwardXPResult descreve o resultado da concessão de pontuação
type AwardXPResult struct {
	UserID         uint                     `json:"user_id"`
	XPGained       int                      `json:"xp_gained"`
	CoinsGained    int                      `json:"coins_gained"`
	OldLevel       int                      `json:"old_level"`
	NewLevel       int                      `json:"new_level"`
	LeveledUp      bool                     `json:"leveled_up"`
	NewBadges      []models.GamificationBadge `json:"new_badges,omitempty"`
	TotalXP        int64                    `json:"total_xp"`
	CurrentStreak  int                      `json:"current_streak"`
	ActivityDesc   string                   `json:"activity_desc"`
}

// AwardActivityXP calcula e adiciona XP de forma segura e atômica
func (s *GamificationService) AwardActivityXP(
	userID uint,
	activityType string,
	referenceID *uint,
	baseXP int,
	baseCoins int,
	description string,
	extraBonusXP int,
) (*AwardXPResult, error) {
	if userID == 0 {
		return nil, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	profile, err := s.repo.GetOrCreateProfile(userID)
	if err != nil {
		return nil, err
	}

	now := time.Now()

	// Update Streak
	streakBonusPct := 0
	if profile.LastActivityDate == nil {
		profile.CurrentStreak = 1
	} else {
		last := *profile.LastActivityDate
		// Compare date (year and day of year)
		lastDate := time.Date(last.Year(), last.Month(), last.Day(), 0, 0, 0, 0, last.Location())
		todayDate := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		diffDays := int(todayDate.Sub(lastDate).Hours() / 24)

		if diffDays == 1 {
			profile.CurrentStreak++
		} else if diffDays > 1 {
			profile.CurrentStreak = 1
		}
		// If diffDays == 0, keep same streak
	}
	profile.LastActivityDate = &now

	// Streak bonus: +5% per consecutive day (capped at 25%)
	if profile.CurrentStreak > 1 {
		streakBonusPct = (profile.CurrentStreak - 1) * 5
		if streakBonusPct > 25 {
			streakBonusPct = 25
		}
	}

	// Calculate total XP with bonuses
	rawXP := baseXP + extraBonusXP
	streakAdd := int(float64(rawXP) * (float64(streakBonusPct) / 100.0))
	finalXP := rawXP + streakAdd
	finalCoins := baseCoins

	oldLevel := profile.NivelAtual
	profile.XPTotal += int64(finalXP)
	profile.TechCoins += int64(finalCoins)
	profile.AtividadesAtendidas++

	// Update activity specific counters
	switch activityType {
	case "service_desk":
		profile.ChamadosResolvidos++
	case "preventive_maintenance":
		profile.PreventivasConcluidas++
	case "maintenance", "manutencao_corretiva":
		profile.ManutencoesConcluidas++
	case "kanban":
		profile.KanbanConcluidos++
	case "qr_scan":
		profile.QRScansRealizados++
	case "rating_5_star":
		profile.AvaliacoesCincoEstrelas++
	}

	newLevel := s.CalculateLevel(profile.XPTotal)
	profile.NivelAtual = newLevel
	leveledUp := newLevel > oldLevel

	// Persist profile
	if err := s.repo.UpdateProfile(profile); err != nil {
		return nil, err
	}

	// Log activity
	logEntry := models.GamificationActivityLog{
		UserID:        userID,
		TipoAtividade: activityType,
		ReferenciaID:  referenceID,
		XPGanho:       finalXP,
		CoinsGanho:    finalCoins,
		Descricao:     description,
	}
	_ = s.repo.CreateActivityLog(&logEntry)

	// Check badges to unlock
	newBadges := s.checkBadges(profile)

	return &AwardXPResult{
		UserID:        userID,
		XPGained:      finalXP,
		CoinsGained:   finalCoins,
		OldLevel:      oldLevel,
		NewLevel:      newLevel,
		LeveledUp:     leveledUp,
		NewBadges:     newBadges,
		TotalXP:       profile.XPTotal,
		CurrentStreak: profile.CurrentStreak,
		ActivityDesc:  description,
	}, nil
}

// checkBadges verifica os marcos e concede insígnias automáticas
func (s *GamificationService) checkBadges(profile *models.UserGamificationProfile) []models.GamificationBadge {
	var awarded []models.GamificationBadge

	tryAward := func(codigo string) {
		has, err := s.repo.HasBadge(profile.UserID, codigo)
		if err == nil && !has {
			badge, err := s.repo.GetBadgeByCodigo(codigo)
			if err == nil && badge != nil {
				_, errAward := s.repo.AwardBadge(profile.UserID, badge.ID)
				if errAward == nil {
					awarded = append(awarded, *badge)
					// Conceder XP bônus da insígnia
					if badge.XPBonus > 0 {
						profile.XPTotal += int64(badge.XPBonus)
						profile.NivelAtual = s.CalculateLevel(profile.XPTotal)
						_ = s.repo.UpdateProfile(profile)
						_ = s.repo.CreateActivityLog(&models.GamificationActivityLog{
							UserID:        profile.UserID,
							TipoAtividade: "badge_unlock",
							ReferenciaID:  &badge.ID,
							XPGanho:       badge.XPBonus,
							Descricao:     "Bônus de Insígnia Desbloqueada: " + badge.Nome,
						})
					}
				}
			}
		}
	}

	if profile.AtividadesAtendidas >= 1 {
		tryAward("primeiro_passo")
	}
	if profile.ChamadosResolvidos >= 5 {
		tryAward("relampago")
	}
	if profile.PreventivasConcluidas >= 10 {
		tryAward("mestre_checklist")
	}
	if profile.AvaliacoesCincoEstrelas >= 5 {
		tryAward("cinco_estrelas")
	}
	if profile.QRScansRealizados >= 25 {
		tryAward("guardiao_patrimonio")
	}
	if profile.CurrentStreak >= 7 {
		tryAward("streak_7d")
	}
	if profile.KanbanConcluidos >= 15 {
		tryAward("mestre_kanban")
	}
	if profile.ManutencoesConcluidas >= 5 {
		tryAward("mestre_reparos")
	}

	return awarded
}

// UserProfileSummary agrega tudo o que a interface do técnico precisa
type UserProfileSummary struct {
	Profile       models.UserGamificationProfile `json:"profile"`
	LevelProgress LevelProgressData              `json:"level_progress"`
	Badges        []models.UserBadge             `json:"badges"`
	AllBadges     []models.GamificationBadge     `json:"all_badges"`
	RecentLogs    []models.GamificationActivityLog `json:"recent_logs"`
}

func (s *GamificationService) GetUserProfile(userID uint) (*UserProfileSummary, error) {
	profile, err := s.repo.GetOrCreateProfile(userID)
	if err != nil {
		return nil, err
	}

	progress := s.GetLevelProgress(profile.XPTotal)
	userBadges, _ := s.repo.GetUserBadges(userID)
	allBadges, _ := s.repo.GetAllBadges()
	recentLogs, _ := s.repo.GetRecentLogs(userID, 15)

	return &UserProfileSummary{
		Profile:       *profile,
		LevelProgress: progress,
		Badges:        userBadges,
		AllBadges:     allBadges,
		RecentLogs:    recentLogs,
	}, nil
}

func (s *GamificationService) GetLeaderboard(period string, limit, offset int) (interface{}, error) {
	if limit <= 0 {
		limit = 20
	}

	switch period {
	case "weekly":
		since := time.Now().AddDate(0, 0, -7)
		return s.repo.GetLeaderboardPeriodo(since, limit)
	case "monthly":
		since := time.Now().AddDate(0, -1, 0)
		return s.repo.GetLeaderboardPeriodo(since, limit)
	default:
		entries, total, err := s.repo.GetLeaderboardVitalicio(limit, offset)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{
			"entries": entries,
			"total":   total,
		}, nil
	}
}
