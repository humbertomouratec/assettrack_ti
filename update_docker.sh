#!/bin/bash

# ==========================================
# AssetTrack TI - Atualizar/Recompilar Docker (Go + React)
# ==========================================

set -e

echo "------------------------------------------------"
echo "🔄 Atualizando AssetTrack TI (Go + React)"
echo "------------------------------------------------"

# Ir para pasta do script
cd "$(dirname "$0")"

# Verificar Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker não encontrado."
    exit 1
fi

source "./scripts/resolve_compose.sh"
resolve_compose "$(pwd)"

# Definir o nome fixo do projeto compose para garantir integridade caso executado dentro do container (/workspace/repo)
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-assettrack_ti}"

# Configurar safe.directory para evitar erros de permissão de UID no git
git config --global --add safe.directory '*' 2>/dev/null || true

# Gerar identificador único para a release atual e compartilhar com o build web
export VITE_APP_VERSION_CODE="$(date -u +%s)"
export VITE_APP_VERSION_NAME="$(date -u +%Y.%m.%d.%H%M)"
export VITE_APP_BUILD_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
HOST_IP="${ASSETTRACK_HOST_IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
HOST_IP="${HOST_IP:-127.0.0.1}"
export VITE_API_URL="${VITE_API_URL:-/api/v1}"

# Atualizar Git
if [ -d ".git" ]; then
    echo "📥 Atualizando repositório Git..."
    git pull || true
fi

# Rebuild e Restart
echo "🏗️ Recompilando e recriando a aplicação Web/API..."
"${COMPOSE_CMD[@]}" up -d db redis
"${COMPOSE_CMD[@]}" up -d --build --force-recreate --no-deps api web

# Aguardar API ficar ativa
echo "⏳ Aguardando API (Go) ficar saudável..."
MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -s http://localhost:8080/health | grep -q '"status":"ok"'; then
        echo "✅ API (Go) ativa e saudável!"
        break
    fi
    sleep 2
    WAITED=$((WAITED + 2))
done

# Limpeza de imagens suspensas/antigas
echo "🧹 Removendo imagens antigas não utilizadas..."
docker image prune -f || true

# Status final
echo "📦 Containers ativos:"
docker ps --format "table {{.Names}}\t{{.Status}}" 2>/dev/null || docker ps

echo ""
echo "------------------------------------------------"
echo "✅ AssetTrack TI atualizado com sucesso!"
echo "------------------------------------------------"
echo "🌐 Frontend URL: http://${HOST_IP}:8000"
echo "🌐 Backend API:  http://${HOST_IP}:8080/api/v1"
echo "📱 APK Android:  gere pelo terminal e anexe com: ./scripts/publish_mobile_apk.sh /caminho/arquivo.apk"
echo "------------------------------------------------"
