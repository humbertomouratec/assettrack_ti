package service

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

type CommitInfo struct {
	Hash    string `json:"hash"`
	Author  string `json:"author"`
	Date    string `json:"date"`
	Message string `json:"message"`
}

type SystemVersionInfo struct {
	CommitHash    string `json:"commit_hash"`
	FullHash      string `json:"full_hash"`
	Branch        string `json:"branch"`
	CommitDate    string `json:"commit_date"`
	CommitMessage string `json:"commit_message"`
	CommitAuthor  string `json:"commit_author"`
	RepoPath      string `json:"repo_path"`
}

type UpdateCheckResult struct {
	HasUpdates    bool         `json:"has_updates"`
	BehindCount   int          `json:"behind_count"`
	CurrentBranch string       `json:"current_branch"`
	CheckedAt     string       `json:"checked_at"`
	Commits       []CommitInfo `json:"commits"`
}

type UpdateJobResponse struct {
	JobID   string `json:"job_id"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

type UpdateStatusResponse struct {
	JobID     string   `json:"job_id"`
	IsRunning bool     `json:"is_running"`
	Status    string   `json:"status"` // "idle", "checking", "updating", "completed", "error"
	Logs      []string `json:"logs"`
	Error     string   `json:"error,omitempty"`
}

type SystemUpdateService interface {
	GetVersion(ctx context.Context) (*SystemVersionInfo, error)
	CheckUpdates(ctx context.Context) (*UpdateCheckResult, error)
	ApplyUpdate(ctx context.Context) (*UpdateJobResponse, error)
	GetUpdateStatus(ctx context.Context) (*UpdateStatusResponse, error)
}

type systemUpdateService struct {
	repoDir string

	mu        sync.RWMutex
	isRunning bool
	jobID     string
	status    string
	logs      []string
	lastErr   string
}

func NewSystemUpdateService() SystemUpdateService {
	repo := locateRepoDir()
	// Configurar safe.directory no git global para evitar erro de 'dubious ownership' em containers Docker
	_ = exec.Command("git", "config", "--global", "--add", "safe.directory", "*").Run()
	if repo != "" && repo != "." {
		_ = exec.Command("git", "config", "--global", "--add", "safe.directory", repo).Run()
	}
	return &systemUpdateService{
		repoDir: repo,
		status:  "idle",
		logs:    make([]string, 0, 100),
	}
}

func locateRepoDir() string {
	candidates := []string{
		".",
		"..",
		"/workspace",
		"/workspace/project",
		"/workspace/repo",
		"/app",
	}

	for _, c := range candidates {
		gitDir := filepath.Join(c, ".git")
		if st, err := os.Stat(gitDir); err == nil && (st.IsDir() || !st.IsDir()) {
			if abs, err := filepath.Abs(c); err == nil {
				return abs
			}
			return c
		}
	}

	cmd := exec.Command("git", "rev-parse", "--show-toplevel")
	if out, err := cmd.Output(); err == nil {
		p := strings.TrimSpace(string(out))
		if p != "" {
			return p
		}
	}

	return "."
}

func (s *systemUpdateService) runGitCmd(ctx context.Context, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = s.repoDir
	out, err := cmd.CombinedOutput()
	if err != nil {
		outStr := strings.TrimSpace(string(out))
		if strings.Contains(outStr, "safe.directory") || strings.Contains(outStr, "dubious ownership") {
			_ = exec.Command("git", "config", "--global", "--add", "safe.directory", "*").Run()
			_ = exec.Command("git", "config", "--global", "--add", "safe.directory", s.repoDir).Run()
			retryCmd := exec.CommandContext(ctx, "git", args...)
			retryCmd.Dir = s.repoDir
			retryOut, retryErr := retryCmd.CombinedOutput()
			if retryErr == nil {
				return strings.TrimSpace(string(retryOut)), nil
			}
			out = retryOut
			err = retryErr
		}
		return strings.TrimSpace(string(out)), fmt.Errorf("git %s falhou: %w (output: %s)", strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return strings.TrimSpace(string(out)), nil
}

func (s *systemUpdateService) GetVersion(ctx context.Context) (*SystemVersionInfo, error) {
	shortHash, err := s.runGitCmd(ctx, "rev-parse", "--short", "HEAD")
	if err != nil {
		return nil, fmt.Errorf("erro ao obter commit curto: %w", err)
	}

	fullHash, _ := s.runGitCmd(ctx, "rev-parse", "HEAD")
	branch, _ := s.runGitCmd(ctx, "rev-parse", "--abbrev-ref", "HEAD")

	// Formato customizado do commit: %cd|%s|%an
	logOut, _ := s.runGitCmd(ctx, "log", "-1", "--format=%cd|%s|%an", "--date=iso")
	parts := strings.SplitN(logOut, "|", 3)

	commitDate := ""
	commitMsg := ""
	commitAuthor := ""

	if len(parts) >= 1 {
		commitDate = parts[0]
	}
	if len(parts) >= 2 {
		commitMsg = parts[1]
	}
	if len(parts) >= 3 {
		commitAuthor = parts[2]
	}

	return &SystemVersionInfo{
		CommitHash:    shortHash,
		FullHash:      fullHash,
		Branch:        branch,
		CommitDate:    commitDate,
		CommitMessage: commitMsg,
		CommitAuthor:  commitAuthor,
		RepoPath:      s.repoDir,
	}, nil
}

func (s *systemUpdateService) CheckUpdates(ctx context.Context) (*UpdateCheckResult, error) {
	s.mu.Lock()
	if s.isRunning {
		s.mu.Unlock()
		return nil, errors.New("uma atualização já está em andamento")
	}
	s.mu.Unlock()

	// 1. Descobrir branch atual
	branch, err := s.runGitCmd(ctx, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil || branch == "" {
		branch = "main"
	}

	// 2. Timeout context para fetch
	fetchCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	_, fetchErr := s.runGitCmd(fetchCtx, "fetch", "origin", branch)
	if fetchErr != nil {
		// Tenta fetch genérico
		_, fetchErr = s.runGitCmd(fetchCtx, "fetch")
		if fetchErr != nil {
			return nil, fmt.Errorf("falha ao conectar no repositório remoto: %w", fetchErr)
		}
	}

	// 3. Contar commits atrás
	targetRemote := fmt.Sprintf("origin/%s", branch)
	rangeSpec := fmt.Sprintf("HEAD..%s", targetRemote)
	countStr, err := s.runGitCmd(ctx, "rev-list", rangeSpec, "--count")
	if err != nil {
		// Se a branch remota não existir ou range inválido, assume 0
		countStr = "0"
	}

	behindCount, _ := strconv.Atoi(countStr)
	commits := make([]CommitInfo, 0)

	if behindCount > 0 {
		// Formato: %h|%an|%ad|%s
		logOut, err := s.runGitCmd(ctx, "log", rangeSpec, "--pretty=format:%h|%an|%ad|%s", "--date=iso", "-n", "20")
		if err == nil && logOut != "" {
			lines := strings.Split(logOut, "\n")
			for _, line := range lines {
				line = strings.TrimSpace(line)
				if line == "" {
					continue
				}
				tokens := strings.SplitN(line, "|", 4)
				c := CommitInfo{}
				if len(tokens) >= 1 {
					c.Hash = tokens[0]
				}
				if len(tokens) >= 2 {
					c.Author = tokens[1]
				}
				if len(tokens) >= 3 {
					c.Date = tokens[2]
				}
				if len(tokens) >= 4 {
					c.Message = tokens[3]
				}
				commits = append(commits, c)
			}
		}
	}

	return &UpdateCheckResult{
		HasUpdates:    behindCount > 0,
		BehindCount:   behindCount,
		CurrentBranch: branch,
		CheckedAt:     time.Now().Format(time.RFC3339),
		Commits:       commits,
	}, nil
}

type UpdateStatePersisted struct {
	JobID     string `json:"job_id"`
	Status    string `json:"status"` // "idle", "updating", "completed", "error"
	IsRunning bool   `json:"is_running"`
	Error     string `json:"error"`
	UpdatedAt string `json:"updated_at"`
}

func (s *systemUpdateService) isInsideDocker() bool {
	if _, err := os.Stat("/.dockerenv"); err == nil {
		return true
	}
	if os.Getenv("DOCKER_CONTAINER") != "" {
		return true
	}
	if _, err := os.Stat("/var/run/docker.sock"); err == nil {
		return true
	}
	return false
}

func (s *systemUpdateService) getHostRepoDir() string {
	if h := os.Getenv("ASSETTRACK_HOST_REPO_DIR"); h != "" {
		return h
	}
	hostname, err := os.Hostname()
	if err == nil && hostname != "" {
		cmd := exec.Command("docker", "inspect", hostname, "--format", "{{range .Mounts}}{{if eq .Destination \"/workspace/repo\"}}{{.Source}}{{end}}{{end}}")
		if out, err := cmd.Output(); err == nil {
			p := strings.TrimSpace(string(out))
			if p != "" {
				return p
			}
		}
	}
	return s.repoDir
}

func (s *systemUpdateService) isUpdaterRunning() bool {
	cmd := exec.Command("docker", "ps", "-q", "-f", "name=assettrack_updater")
	if out, err := cmd.Output(); err == nil {
		if strings.TrimSpace(string(out)) != "" {
			return true
		}
	}
	return false
}

func (s *systemUpdateService) readPersistedState() (*UpdateStatePersisted, []string) {
	statePath := filepath.Join(s.repoDir, ".system_update_state.json")
	logPath := filepath.Join(s.repoDir, ".system_update_state.log")

	var state UpdateStatePersisted
	data, err := os.ReadFile(statePath)
	if err == nil {
		_ = json.Unmarshal(data, &state)
	}

	var logs []string
	if logData, err := os.ReadFile(logPath); err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(logData)))
		for scanner.Scan() {
			logs = append(logs, scanner.Text())
		}
		if len(logs) > 500 {
			logs = logs[len(logs)-500:]
		}
	}

	return &state, logs
}

func (s *systemUpdateService) writePersistedState(state *UpdateStatePersisted) {
	statePath := filepath.Join(s.repoDir, ".system_update_state.json")
	tmpPath := statePath + ".tmp"
	data, err := json.MarshalIndent(state, "", "  ")
	if err == nil {
		if err := os.WriteFile(tmpPath, data, 0644); err == nil {
			_ = os.Rename(tmpPath, statePath)
		}
	}
}

func (s *systemUpdateService) appendLog(format string, a ...interface{}) {
	s.mu.Lock()
	defer s.mu.Unlock()
	msg := fmt.Sprintf("[%s] %s", time.Now().Format("15:04:05"), fmt.Sprintf(format, a...))
	s.logs = append(s.logs, msg)
	if len(s.logs) > 500 {
		s.logs = s.logs[len(s.logs)-500:]
	}

	logPath := filepath.Join(s.repoDir, ".system_update_state.log")
	if f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
		defer f.Close()
		_, _ = f.WriteString(msg + "\n")
	}
}

func (s *systemUpdateService) ApplyUpdate(ctx context.Context) (*UpdateJobResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	persisted, _ := s.readPersistedState()
	if s.isRunning || (persisted != nil && persisted.IsRunning && s.isUpdaterRunning()) {
		return nil, errors.New("uma atualização já está em andamento")
	}

	jobID := fmt.Sprintf("upd-%d", time.Now().Unix())
	s.isRunning = true
	s.jobID = jobID
	s.status = "updating"
	s.logs = []string{
		fmt.Sprintf("[%s] Iniciando atualização do AssetTrack TI (Job: %s)...", time.Now().Format("15:04:05"), jobID),
		fmt.Sprintf("[%s] Diretório do repositório: %s", time.Now().Format("15:04:05"), s.repoDir),
	}
	s.lastErr = ""

	// Escreve estado inicial persistido
	s.writePersistedState(&UpdateStatePersisted{
		JobID:     jobID,
		Status:    "updating",
		IsRunning: true,
		Error:     "",
		UpdatedAt: time.Now().UTC().Format(time.RFC3339),
	})

	// Inicializa arquivo de log limpo
	logPath := filepath.Join(s.repoDir, ".system_update_state.log")
	initialLog := fmt.Sprintf("=== Registro de Atualização do AssetTrack TI (%s) ===\n[%s] Ordem de atualização recebida pela API.\n", jobID, time.Now().Format("15:04:05"))
	_ = os.WriteFile(logPath, []byte(initialLog), 0644)

	go s.executeDecoupledUpdate(jobID)

	return &UpdateJobResponse{
		JobID:   jobID,
		Status:  "updating",
		Message: "Processo de atualização desacoplado iniciado com sucesso.",
	}, nil
}

func (s *systemUpdateService) executeDecoupledUpdate(jobID string) {
	// Se estiver rodando dentro de um container Docker:
	if s.isInsideDocker() {
		hostRepoDir := s.getHostRepoDir()
		scriptHostPath := filepath.Join(hostRepoDir, "scripts", "docker_self_update.sh")

		// Remove qualquer container anterior residual
		_ = exec.Command("docker", "rm", "-f", "assettrack_updater").Run()

		s.appendLog("🚀 Disparando container runner desacoplado (assettrack_updater)...")
		s.appendLog("📂 Mapeamento do host: %s", hostRepoDir)

		runnerCmd := exec.Command("docker", "run", "-d", "--rm",
			"--name", "assettrack_updater",
			"-v", "/var/run/docker.sock:/var/run/docker.sock",
			"-v", fmt.Sprintf("%s:%s", hostRepoDir, hostRepoDir),
			"-w", hostRepoDir,
			"assettrack_ti-api:latest",
			"/bin/bash", scriptHostPath, jobID,
		)

		out, err := runnerCmd.CombinedOutput()
		if err != nil {
			errStr := strings.TrimSpace(string(out))
			s.mu.Lock()
			s.status = "error"
			s.isRunning = false
			s.lastErr = fmt.Sprintf("Falha ao iniciar assettrack_updater: %v (%s)", err, errStr)
			s.mu.Unlock()

			s.writePersistedState(&UpdateStatePersisted{
				JobID:     jobID,
				Status:    "error",
				IsRunning: false,
				Error:     fmt.Sprintf("Falha ao iniciar runner: %v (%s)", err, errStr),
				UpdatedAt: time.Now().UTC().Format(time.RFC3339),
			})
			s.appendLog("❌ Erro ao disparar container runner: %v (%s)", err, errStr)
			return
		}

		s.appendLog("✅ Runner desacoplado iniciado no Docker (ID: %s)", strings.TrimSpace(string(out)))
		s.appendLog("ℹ️ Os containers api e web serão recriados sem interromper o processo de atualização.")
		return
	}

	// Caso o backend esteja rodando diretamente no host do sistema operacional:
	scriptPath := filepath.Join(s.repoDir, "scripts", "docker_self_update.sh")
	if _, err := os.Stat(scriptPath); err != nil {
		scriptPath = filepath.Join(s.repoDir, "update_docker.sh")
	}

	s.appendLog("🚀 Executando script de atualização no host: %s", scriptPath)
	cmd := exec.Command("/bin/bash", scriptPath, jobID)
	cmd.Dir = s.repoDir
	cmd.Env = append(os.Environ(), "COMPOSE_PROJECT_NAME=assettrack_ti")

	if err := cmd.Start(); err != nil {
		s.mu.Lock()
		s.status = "error"
		s.isRunning = false
		s.lastErr = err.Error()
		s.mu.Unlock()

		s.writePersistedState(&UpdateStatePersisted{
			JobID:     jobID,
			Status:    "error",
			IsRunning: false,
			Error:     err.Error(),
			UpdatedAt: time.Now().UTC().Format(time.RFC3339),
		})
		s.appendLog("❌ Falha ao iniciar script: %v", err)
		return
	}

	go func() {
		err := cmd.Wait()
		s.mu.Lock()
		defer s.mu.Unlock()
		s.isRunning = false
		if err != nil {
			s.status = "error"
			s.lastErr = err.Error()
			s.writePersistedState(&UpdateStatePersisted{
				JobID:     jobID,
				Status:    "error",
				IsRunning: false,
				Error:     err.Error(),
				UpdatedAt: time.Now().UTC().Format(time.RFC3339),
			})
		} else {
			s.status = "completed"
			s.writePersistedState(&UpdateStatePersisted{
				JobID:     jobID,
				Status:    "completed",
				IsRunning: false,
				Error:     "",
				UpdatedAt: time.Now().UTC().Format(time.RFC3339),
			})
		}
	}()
}

func (s *systemUpdateService) GetUpdateStatus(ctx context.Context) (*UpdateStatusResponse, error) {
	s.mu.RLock()
	inMemoryRunning := s.isRunning
	inMemoryStatus := s.status
	inMemoryJobID := s.jobID
	inMemoryLogs := make([]string, len(s.logs))
	copy(inMemoryLogs, s.logs)
	inMemoryErr := s.lastErr
	s.mu.RUnlock()

	persisted, diskLogs := s.readPersistedState()
	if persisted != nil && persisted.JobID != "" {
		finalLogs := diskLogs
		if len(finalLogs) == 0 {
			finalLogs = inMemoryLogs
		}

		status := persisted.Status
		isRunning := persisted.IsRunning
		errStr := persisted.Error

		// Valida se o runner ainda está rodando caso o status seja "updating"
		if isRunning {
			if s.isInsideDocker() && !s.isUpdaterRunning() {
				// Runner terminou. Verificar nos logs se concluiu ou deu erro
				isRunning = false
				foundSuccess := false
				for _, line := range finalLogs {
					if strings.Contains(line, "concluída com êxito") || strings.Contains(line, "atualizado com sucesso") {
						foundSuccess = true
						break
					}
				}
				if foundSuccess {
					status = "completed"
				} else if status == "updating" {
					status = "error"
					if errStr == "" {
						errStr = "O processo de atualização foi encerrado antes da confirmação de sucesso."
					}
				}
			}
		}

		return &UpdateStatusResponse{
			JobID:     persisted.JobID,
			IsRunning: isRunning,
			Status:    status,
			Logs:      finalLogs,
			Error:     errStr,
		}, nil
	}

	return &UpdateStatusResponse{
		JobID:     inMemoryJobID,
		IsRunning: inMemoryRunning,
		Status:    inMemoryStatus,
		Logs:      inMemoryLogs,
		Error:     inMemoryErr,
	}, nil
}
