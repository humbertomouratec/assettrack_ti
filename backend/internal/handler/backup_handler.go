package handler

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/assettrack/backend/internal/config"
	"github.com/gin-gonic/gin"
)

type BackupHandler struct {
	cfg *config.Config
}

func NewBackupHandler(cfg *config.Config) *BackupHandler {
	// Ensure backups dir exists
	os.MkdirAll("backups", os.ModePerm)
	return &BackupHandler{cfg: cfg}
}

// Struct for status response
type BackupJobStatus struct {
	IsRunning bool   `json:"is_running"`
	Progress  string `json:"progress"`
	Error     string `json:"error,omitempty"`
}

var (
	backupMutex   sync.Mutex
	backupRunning bool
	backupMsg     string
)

func setStatus(running bool, msg string) {
	backupMutex.Lock()
	defer backupMutex.Unlock()
	backupRunning = running
	backupMsg = msg
}

func getStatus() (bool, string) {
	backupMutex.Lock()
	defer backupMutex.Unlock()
	return backupRunning, backupMsg
}

// normalizePostgresDump keeps dumps produced by newer pg_dump clients
// restorable on the PostgreSQL version used by the application.
func normalizePostgresDump(sqlBytes []byte) []byte {
	sql := string(sqlBytes)
	sql = strings.ReplaceAll(sql, "SET transaction_timeout = 0;\r\n", "")
	sql = strings.ReplaceAll(sql, "SET transaction_timeout = 0;\n", "")
	return []byte(sql)
}

// GenerateBackup triggers an async pg_dump + zip
func (h *BackupHandler) GenerateBackup(c *gin.Context) {
	running, _ := getStatus()
	if running {
		c.JSON(http.StatusConflict, gin.H{"error": "Um backup já está em andamento."})
		return
	}

	setStatus(true, "Iniciando geração de backup...")

	go func() {
		defer setStatus(false, "Concluído")

		timestamp := time.Now().Format("20060102_150405")
		zipFileName := fmt.Sprintf("backups/backup_assettrack_%s.zip", timestamp)

		// Create zip file
		zipFile, err := os.Create(zipFileName)
		if err != nil {
			setStatus(false, "Erro ao criar arquivo ZIP: "+err.Error())
			return
		}
		defer zipFile.Close()

		zipWriter := zip.NewWriter(zipFile)
		defer zipWriter.Close()

		setStatus(true, "Gerando dump do banco de dados (pg_dump)...")

		// Run pg_dump
		// Note: Requires postgresql-client to be installed in the server/docker environment
		cmd := exec.Command("pg_dump", "--clean", "--if-exists", "--no-owner", "--no-privileges", "--inserts", h.cfg.DatabaseURL)

		var out bytes.Buffer
		var stderr bytes.Buffer
		cmd.Stdout = &out
		cmd.Stderr = &stderr

		if err := cmd.Run(); err != nil {
			setStatus(false, "Erro no pg_dump: "+err.Error()+"\nDetails: "+stderr.String())
			os.Remove(zipFileName)
			return
		}

		// Add database.sql to zip
		setStatus(true, "Adicionando dump ao ZIP...")
		dbWriter, err := zipWriter.Create("database.sql")
		if err != nil {
			setStatus(false, "Erro ao adicionar SQL no ZIP: "+err.Error())
			return
		}
		if _, err := dbWriter.Write(normalizePostgresDump(out.Bytes())); err != nil {
			setStatus(false, "Erro ao escrever dump SQL no ZIP: "+err.Error())
			return
		}

		// Zip uploads folder
		setStatus(true, "Comprimindo arquivos de mídia (uploads/)...")
		err = filepath.Walk("uploads", func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil // skip errors if folder missing
			}
			if info.IsDir() {
				return nil
			}

			// Add file to zip
			relPath := strings.Replace(path, "\\", "/", -1)
			fileWriter, err := zipWriter.Create(relPath)
			if err != nil {
				return err
			}

			srcFile, err := os.Open(path)
			if err != nil {
				return err
			}
			defer srcFile.Close()

			_, err = io.Copy(fileWriter, srcFile)
			return err
		})

		if err != nil {
			fmt.Printf("[BACKUP] Aviso: Falha ao incluir alguns arquivos de upload: %v\n", err)
		}

		setStatus(false, "Backup concluído com sucesso!")
	}()

	c.JSON(http.StatusAccepted, gin.H{"message": "Geração de backup iniciada em background."})
}

// GetStatus returns the current backup generation status
func (h *BackupHandler) GetStatus(c *gin.Context) {
	running, msg := getStatus()
	c.JSON(http.StatusOK, BackupJobStatus{
		IsRunning: running,
		Progress:  msg,
	})
}

type BackupFile struct {
	Filename string `json:"filename"`
	Size     int64  `json:"size"`
	Date     string `json:"date"`
}

// List available backups
func (h *BackupHandler) List(c *gin.Context) {
	var files []BackupFile

	entries, err := os.ReadDir("backups")
	if err != nil {
		c.JSON(http.StatusOK, []BackupFile{}) // return empty if folder missing
		return
	}

	for _, e := range entries {
		if !e.IsDir() && (strings.HasSuffix(e.Name(), ".zip") || strings.HasSuffix(e.Name(), ".sql")) {
			info, err := e.Info()
			if err == nil {
				files = append(files, BackupFile{
					Filename: e.Name(),
					Size:     info.Size(),
					Date:     info.ModTime().Format(time.RFC3339),
				})
			}
		}
	}

	// Sort newest first
	sort.Slice(files, func(i, j int) bool {
		return files[i].Date > files[j].Date
	})

	c.JSON(http.StatusOK, files)
}

// Download stream
func (h *BackupHandler) Download(c *gin.Context) {
	filename := c.Param("filename")
	if strings.Contains(filename, "/") || strings.Contains(filename, "\\") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Filename inválido"})
		return
	}

	path := filepath.Join("backups", filename)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Arquivo não encontrado"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	if strings.HasSuffix(filename, ".sql") {
		c.Header("Content-Type", "application/sql")
	} else {
		c.Header("Content-Type", "application/zip")
	}
	c.File(path)
}

// Delete backup
func (h *BackupHandler) Delete(c *gin.Context) {
	filename := c.Param("filename")
	if strings.Contains(filename, "/") || strings.Contains(filename, "\\") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Filename inválido"})
		return
	}

	path := filepath.Join("backups", filename)
	if err := os.Remove(path); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro ao excluir arquivo"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Excluído com sucesso"})
}

// Restore receives a .zip and restores DB and uploads
func (h *BackupHandler) Restore(c *gin.Context) {
	if c.PostForm("restore_confirmation") != "RESTAURAR" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Confirmação de restauração inválida"})
		return
	}

	fileHeader, err := c.FormFile("backup_file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Arquivo não fornecido"})
		return
	}

	if !strings.HasSuffix(fileHeader.Filename, ".zip") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Envie um arquivo .zip válido"})
		return
	}
	if fileHeader.Size > 1024*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "O backup excede o limite de 1 GB"})
		return
	}

	// Save zip temporarily
	tmpPath := filepath.Join("backups", "restore_tmp.zip")
	if err := c.SaveUploadedFile(fileHeader, tmpPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro ao salvar arquivo temporário"})
		return
	}
	defer os.Remove(tmpPath)

	// Unzip and restore
	zipReader, err := zip.OpenReader(tmpPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro ao ler arquivo ZIP"})
		return
	}
	defer zipReader.Close()

	// Validate the archive before changing the database or filesystem.
	hasDB := false
	for _, f := range zipReader.File {
		cleanName := filepath.Clean(f.Name)
		if cleanName == "database.sql" {
			hasDB = true
			continue
		}
		if !strings.HasPrefix(cleanName, "uploads"+string(os.PathSeparator)) || strings.HasPrefix(cleanName, "..") || filepath.IsAbs(cleanName) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "O ZIP contém um caminho inválido"})
			return
		}
	}
	if !hasDB {
		c.JSON(http.StatusBadRequest, gin.H{"error": "O arquivo ZIP não contém database.sql"})
		return
	}

	// Preserve the current database before any destructive operation.
	timestamp := time.Now().Format("20060102_150405")
	safetyPath := filepath.Join("backups", "pre_restore_database_"+timestamp+".sql")
	backupCmd := exec.Command("pg_dump", "--clean", "--if-exists", "--no-owner", "--no-privileges", "--inserts", h.cfg.DatabaseURL)
	safetyFile, err := os.Create(safetyPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Não foi possível criar o backup de segurança"})
		return
	}
	backupCmd.Stdout = safetyFile
	var backupErr bytes.Buffer
	backupCmd.Stderr = &backupErr
	if err := backupCmd.Run(); err != nil {
		safetyFile.Close()
		os.Remove(safetyPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Não foi possível gerar o backup de segurança: " + backupErr.String()})
		return
	}
	safetyFile.Close()
	// Package the safety dump in the standard restore format so it can be
	// downloaded and restored later from the same Backup & Restore screen.
	safetyArchivePath := strings.TrimSuffix(safetyPath, ".sql") + ".zip"
	safetyArchive, err := os.Create(safetyArchivePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Não foi possível empacotar o backup de segurança"})
		return
	}
	zipWriter := zip.NewWriter(safetyArchive)
	entry, err := zipWriter.Create("database.sql")
	if err == nil {
		var safetySource *os.File
		safetySource, err = os.Open(safetyPath)
		if err == nil {
			_, err = io.Copy(entry, safetySource)
			safetySource.Close()
		}
	}
	zipWriter.Close()
	safetyArchive.Close()
	if err != nil {
		os.Remove(safetyArchivePath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Não foi possível empacotar o backup de segurança"})
		return
	}
	os.Remove(safetyPath)
	safetyPath = safetyArchivePath

	// Restore database first. Media is only extracted after the SQL succeeds.
	for _, f := range zipReader.File {
		if f.Name == "database.sql" {
			// Extract to a unique temporary file. The restore operation is run in a
			// single database transaction so a failed import cannot leave the
			// current database truncated or partially restored.
			tmpSQL, err := os.CreateTemp("backups", "restore-db-*.sql")
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro IO sql"})
				return
			}
			tmpSqlPath := tmpSQL.Name()
			defer os.Remove(tmpSqlPath)
			src, _ := f.Open()
			sqlBytes, readErr := io.ReadAll(src)
			src.Close()
			if readErr != nil {
				tmpSQL.Close()
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro ao ler database.sql"})
				return
			}
			// Legacy releases used this relation name. The current Kanban model
			// stores the same card/user mapping in kanban_card_participantes.
			sqlBytes = []byte(strings.ReplaceAll(string(sqlBytes), "kanban_card_assignees", "kanban_card_participantes"))
			sqlBytes = []byte(strings.ReplaceAll(string(sqlBytes), "kanban_project_participants", "kanban_project_participantes"))
			sqlBytes = []byte(strings.ReplaceAll(string(sqlBytes), `INSERT INTO "kanban_project_participantes" ("project_id", "user_id")`, `INSERT INTO "kanban_project_participantes" ("kanban_project_id", "user_id")`))
			sqlBytes = []byte(strings.ReplaceAll(string(sqlBytes), `INSERT INTO "kanban_card_participantes" ("card_id", "user_id")`, `INSERT INTO "kanban_card_participantes" ("kanban_card_id", "user_id")`))
			// pg_dump 17 can emit this setting even when the target server is
			// PostgreSQL 15, where transaction_timeout does not exist.
			sqlBytes = normalizePostgresDump(sqlBytes)
			// The responsibility-term timestamp was renamed in the current schema.
			sqlBytes = []byte(strings.ReplaceAll(string(sqlBytes), `"conteudo_termo", "data_criacao", "data_assinatura"`, `"conteudo_termo", "data_geracao", "data_assinatura"`))
			// Legacy role values were stored in upper case; normalize them to the
			// role constants used by the current authorization middleware.
			sqlBytes = []byte(strings.NewReplacer(
				"'ADMIN'", "'admin'",
				"'GERENTE'", "'gerente_ti'",
				"'USUARIO'", "'usuario_comum'",
				"'COMPRADOR'", "'comprador'",
				"'RH'", "'rh'",
			).Replace(string(sqlBytes)))
			truncateSQL := "DO $$ DECLARE tables text; BEGIN SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') INTO tables FROM pg_tables WHERE schemaname = 'public'; IF tables IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE'; END IF; END $$;\n"
			if _, err := tmpSQL.Write(append([]byte(truncateSQL), sqlBytes...)); err != nil {
				tmpSQL.Close()
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro ao preparar SQL para restauração"})
				return
			}
			if err := tmpSQL.Close(); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro ao finalizar SQL temporário"})
				return
			}

			cmd := exec.Command("psql", h.cfg.DatabaseURL, "--single-transaction", "-v", "ON_ERROR_STOP=1", "-f", tmpSqlPath)
			var stderr bytes.Buffer
			cmd.Stderr = &stderr
			if err := cmd.Run(); err != nil {
				details := strings.TrimSpace(stderr.String())
				log.Printf("[BACKUP] restore database failed: %s", details)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro ao restaurar banco (psql): " + details})
				return
			}
		}
	}

	for _, f := range zipReader.File {
		if !strings.HasPrefix(f.Name, "uploads/") {
			continue
		}
		targetPath := filepath.Join(".", filepath.Clean(f.Name))
		if f.FileInfo().IsDir() {
			os.MkdirAll(targetPath, os.ModePerm)
			continue
		}
		os.MkdirAll(filepath.Dir(targetPath), os.ModePerm)
		dst, err := os.Create(targetPath)
		if err != nil {
			continue
		}
		src, err := f.Open()
		if err == nil {
			io.Copy(dst, src)
			src.Close()
		}
		dst.Close()
	}

	c.JSON(http.StatusOK, gin.H{"message": "Sistema restaurado com sucesso. Backup de segurança do banco: " + filepath.Base(safetyPath) + ". Recomendamos reiniciar os serviços."})
}
