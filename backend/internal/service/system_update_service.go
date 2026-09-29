package service

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
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

func (s *systemUpdateService) ApplyUpdate(ctx context.Context) (*UpdateJobResponse, error) {
	s.mu.Lock()
	if s.isRunning {
		s.mu.Unlock()
		return nil, errors.New("uma atualização já está em execução")
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
	s.mu.Unlock()

	go s.executeAsyncUpdate(jobID)

	return &UpdateJobResponse{
		JobID:   jobID,
		Status:  "updating",
		Message: "Processo de atualização iniciado com sucesso.",
	}, nil
}

func (s *systemUpdateService) appendLog(format string, a ...interface{}) {
	s.mu.Lock()
	defer s.mu.Unlock()
	msg := fmt.Sprintf("[%s] %s", time.Now().Format("15:04:05"), fmt.Sprintf(format, a...))
	s.logs = append(s.logs, msg)
	if len(s.logs) > 500 {
		s.logs = s.logs[len(s.logs)-500:]
	}
}

func (s *systemUpdateService) executeAsyncUpdate(jobID string) {
	defer func() {
		s.mu.Lock()
		s.isRunning = false
		s.mu.Unlock()
	}()

	s.appendLog("📥 Executando git pull...")
	_ = exec.Command("git", "config", "--global", "--add", "safe.directory", "*").Run()
	_ = exec.Command("git", "config", "--global", "--add", "safe.directory", s.repoDir).Run()
	pullCmd := exec.Command("git", "pull")
	pullCmd.Dir = s.repoDir
	out, err := pullCmd.CombinedOutput()
	outputStr := strings.TrimSpace(string(out))
	if outputStr != "" {
		for _, l := range strings.Split(outputStr, "\n") {
			s.appendLog("git: %s", l)
		}
	}

	if err != nil {
		s.mu.Lock()
		s.status = "error"
		s.lastErr = fmt.Sprintf("Falha no git pull: %v", err)
		s.mu.Unlock()
		s.appendLog("❌ Erro ao atualizar repositório Git: %v", err)
		return
	}

	s.appendLog("✅ Repositório atualizado com sucesso via Git!")

	// 2. Verificar se existe script de atualização/rebuild
	scriptPath := filepath.Join(s.repoDir, "update_docker.sh")
	if _, err := os.Stat(scriptPath); err == nil {
		s.appendLog("🚀 Script update_docker.sh localizado. Disparando recompilação dos containers...")

		cmd := exec.Command("/bin/bash", scriptPath)
		cmd.Dir = s.repoDir
		cmd.Env = append(os.Environ(), "COMPOSE_PROJECT_NAME=assettrack_ti")

		stdoutPipe, errOut := cmd.StdoutPipe()
		stderrPipe, errErr := cmd.StderrPipe()

		if errOut != nil || errErr != nil {
			s.appendLog("⚠️ Não foi possível capturar pipes de stdout/stderr: %v %v", errOut, errErr)
			if startErr := cmd.Start(); startErr != nil {
				s.mu.Lock()
				s.status = "error"
				s.lastErr = startErr.Error()
				s.mu.Unlock()
				s.appendLog("❌ Falha ao iniciar script update_docker.sh: %v", startErr)
				return
			}
		} else {
			if startErr := cmd.Start(); startErr != nil {
				s.mu.Lock()
				s.status = "error"
				s.lastErr = startErr.Error()
				s.mu.Unlock()
				s.appendLog("❌ Falha ao iniciar script update_docker.sh: %v", startErr)
				return
			}

			// Ler saídas assincronamente
			var wg sync.WaitGroup
			wg.Add(2)

			readPipe := func(reader io.Reader) {
				defer wg.Done()
				scanner := bufio.NewScanner(reader)
				for scanner.Scan() {
					s.appendLog("%s", scanner.Text())
				}
			}

			go readPipe(stdoutPipe)
			go readPipe(stderrPipe)

			wg.Wait()
		}

		if waitErr := cmd.Wait(); waitErr != nil {
			s.mu.Lock()
			s.status = "error"
			s.lastErr = fmt.Sprintf("update_docker.sh falhou: %v", waitErr)
			s.mu.Unlock()
			s.appendLog("❌ Falha durante a execução de update_docker.sh: %v", waitErr)
			return
		}
	} else {
		s.appendLog("ℹ️ update_docker.sh não encontrado em %s. Git pull aplicado.", s.repoDir)
	}

	s.mu.Lock()
	s.status = "completed"
	s.mu.Unlock()
	s.appendLog("🎉 Atualização do sistema concluída com êxito!")
}

func (s *systemUpdateService) GetUpdateStatus(ctx context.Context) (*UpdateStatusResponse, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	logsCopy := make([]string, len(s.logs))
	copy(logsCopy, s.logs)

	return &UpdateStatusResponse{
		JobID:     s.jobID,
		IsRunning: s.isRunning,
		Status:    s.status,
		Logs:      logsCopy,
		Error:     s.lastErr,
	}, nil
}
