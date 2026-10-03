#!/bin/bash
# ==========================================
# AssetTrack TI - Desacoplador de Auto-Atualização Docker
# ==========================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_DIR"

JOB_ID="${1:-upd-$(date +%s)}"
STATE_FILE="$REPO_DIR/.system_update_state.json"
LOG_FILE="$REPO_DIR/.system_update_state.log"

log_line() {
  local msg="$1"
  local ts
  ts="$(date "+%H:%M:%S")"
  echo "[$ts] $msg" | tee -a "$LOG_FILE"
}

update_json_state() {
  local status="$1"
  local is_running="$2"
  local err_msg="$3"
  local now
  now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  # Atualiza estado em JSON de forma atômica
  python3 -c "
import json, sys
data = {
    'job_id': '$JOB_ID',
    'status': '$status',
    'is_running': $is_running,
    'error': '''$err_msg'''.strip(),
    'updated_at': '$now'
}
with open('$STATE_FILE.tmp', 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null || true

  if [ -f "$STATE_FILE.tmp" ]; then
    mv -f "$STATE_FILE.tmp" "$STATE_FILE"
  fi
}

echo "=== Registro de Atualização do AssetTrack TI ($JOB_ID) ===" > "$LOG_FILE"
update_json_state "updating" "True" ""

log_line "🚀 Processo de atualização desacoplado iniciado (Job: $JOB_ID)"
log_line "📂 Diretório do projeto: $REPO_DIR"

# 1. Configurar git safe.directory
git config --global --add safe.directory '*' 2>/dev/null || true

# 2. Executar Git Pull
if [ -d ".git" ]; then
  log_line "📥 Executando git pull no repositório..."
  if git pull >> "$LOG_FILE" 2>&1; then
    log_line "✅ Código-fonte atualizado com sucesso via Git!"
  else
    log_line "❌ Erro ao executar git pull."
    update_json_state "error" "False" "Falha ao executar git pull no repositório."
    exit 1
  fi
fi

# 3. Preparar variáveis de ambiente para a build
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-assettrack_ti}"
export VITE_APP_VERSION_CODE="$(date -u +%s)"
export VITE_APP_VERSION_NAME="$(date -u +%Y.%m.%d.%H%M)"
export VITE_APP_BUILD_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export VITE_API_URL="${VITE_API_URL:-/api/v1}"

# 4. Resolver Docker Compose v2
source "$REPO_DIR/scripts/resolve_compose.sh"
resolve_compose "$REPO_DIR"

log_line "🏗️ Recompilando e recriando os containers (api e web)..."
log_line "ℹ️ Os serviços web/api serão reiniciados brevemente."

if ! "${COMPOSE_CMD[@]}" up -d --build --force-recreate --no-deps api web >> "$LOG_FILE" 2>&1; then
  log_line "❌ Erro durante docker compose up dos containers api/web."
  update_json_state "error" "False" "Falha na compilação ou recriação dos containers Docker."
  exit 1
fi

log_line "✅ Containers recriados com sucesso pelo Docker!"
log_line "⏳ Aguardando a nova instância da API (Go) ficar saudável..."

# 5. Health Check da API
MAX_ATTEMPTS=45
HEALTHY=0
for i in $(seq 1 $MAX_ATTEMPTS); do
  if docker exec assettrack_ti-api-1 curl -s http://localhost:8080/health 2>/dev/null | grep -q '"status":"ok"'; then
    HEALTHY=1
    break
  fi
  sleep 2
done

if [ "$HEALTHY" -eq 1 ]; then
  log_line "✅ API reiniciada e respondendo com sucesso em /health!"
  log_line "🧹 Removendo imagens antigas suspensas (docker image prune)..."
  docker image prune -f >> "$LOG_FILE" 2>&1 || true
  log_line "🎉 Atualização do sistema concluída com êxito!"
  update_json_state "completed" "False" ""
else
  log_line "⚠️ API não respondeu dentro do tempo limite de 90s após recriação."
  update_json_state "error" "False" "API demorou mais que o esperado para responder em /health."
  exit 1
fi
