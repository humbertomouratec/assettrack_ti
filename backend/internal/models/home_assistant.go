package models

import "time"

type HomeAssistantEntity struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	EntityID     string    `gorm:"size:255;uniqueIndex;not null" json:"entity_id"`
	FriendlyName string    `gorm:"size:255" json:"friendly_name"`
	Domain       string    `gorm:"size:100;not null;index" json:"domain"`
	Category     string    `gorm:"size:100;default:'Geral'" json:"category"`
	AssetID      *uint     `gorm:"index" json:"asset_id"`
	Asset        *Asset    `gorm:"foreignKey:AssetID;constraint:OnDelete:SET NULL" json:"asset,omitempty"`
	IsPinned     bool      `json:"is_pinned"`
	IsVisible    bool      `json:"is_visible"`
	DisplayOrder int       `gorm:"default:0" json:"display_order"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type HomeAssistantCategory struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Nome      string    `gorm:"size:100;uniqueIndex;not null" json:"nome"`
	Icone     string    `gorm:"size:50;default:'folder'" json:"icone"`
	Cor       string    `gorm:"size:50;default:'blue'" json:"cor"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
