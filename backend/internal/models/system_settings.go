package models

type SystemSetting struct {
	ID           uint    `gorm:"primaryKey" json:"id"`
	SettingKey   string  `gorm:"unique;not null" json:"setting_key"`
	SettingValue string  `gorm:"not null" json:"setting_value"`
	Descricao    *string `json:"descricao"`
}

func (SystemSetting) TableName() string { return "system_settings" }
