package models

type AssetCategory struct {
	ID        uint    `gorm:"primaryKey" json:"id"`
	Nome      string  `gorm:"unique;not null;size:100" json:"nome"`
	Descricao *string `gorm:"type:text" json:"descricao"`
}

func (AssetCategory) TableName() string { return "asset_categories" }
