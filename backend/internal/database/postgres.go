package database

import (
	"log"
	"strings"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func ConnectPostgres(dsn string) *gorm.DB {
	// Ensure TimeZone is set to America/Sao_Paulo in connection string if not present
	if !strings.Contains(dsn, "TimeZone=") && !strings.Contains(dsn, "timezone=") {
		separator := "?"
		if strings.Contains(dsn, "?") {
			separator = "&"
		}
		dsn = dsn + separator + "TimeZone=America/Sao_Paulo"
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger:                 logger.Default.LogMode(logger.Warn),
		SkipDefaultTransaction: true,
		// Restores and auto-migrations can recreate tables. Keeping prepared
		// statements across those schema changes causes PostgreSQL to return
		// "cached plan must not change result type" on the next request.
		PrepareStmt: false,
		// User and Departamento reference each other. Deferring FK creation
		// avoids a first-install migration ordering cycle on PostgreSQL.
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		log.Fatalf("Failed to connect to PostgreSQL: %v", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("Failed to get underlying sql.DB: %v", err)
	}

	sqlDB.SetMaxOpenConns(20)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(5 * time.Minute)
	sqlDB.SetConnMaxIdleTime(3 * time.Minute)

	DB = db
	log.Println("✅ PostgreSQL connected")
	return db
}
