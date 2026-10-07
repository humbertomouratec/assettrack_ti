#!/bin/bash

# ==========================================
# AssetTrack TI - Inicialização Docker (Decoupled Go + React)
# ==========================================

set -e

echo "------------------------------------------------"
echo "🚀 Iniciando AssetTrack TI (Go + React)"
echo "------------------------------------------------"

# Ir para pasta do projeto
cd "$(dirname "$0")"

# Verificar Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker não encontrado."
    exit 1
fi

if ! command -v curl &> /dev/null; then
    echo "❌ curl não encontrado. Instale curl antes de iniciar a aplicação."
    exit 1
fi

# Verificar Docker Compose
source "./scripts/resolve_compose.sh"
resolve_compose "$(pwd)"

echo "✅ Docker OK"
echo "✅ Docker Compose OK"

# Gerar identificador único para a release atual e compartilhar com o build web
export VITE_APP_VERSION_CODE="$(date -u +%s)"
export VITE_APP_VERSION_NAME="$(date -u +%Y.%m.%d.%H%M)"
export VITE_APP_BUILD_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
HOST_IP="${ASSETTRACK_HOST_IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
HOST_IP="${HOST_IP:-127.0.0.1}"
# The local web container proxies /api/v1 to the API container. Keep the
# browser on one origin and avoid exposing the API port in the frontend build.
export VITE_API_URL="${VITE_API_URL:-/api/v1}"

# Derrubar ambiente antigo se estiver ativo
echo "🛑 Parando containers antigos..."
"${COMPOSE_CMD[@]}" down --remove-orphans 2>/dev/null || true

# Garantir remoção de processos conflitantes nas portas 8080, 8000, 5456 e 6380
PORT_8080=$(docker ps -a --filter "publish=${API_PORT:-8080}" -q 2>/dev/null || true)
PORT_8000=$(docker ps -a --filter "publish=${WEB_PORT:-8000}" -q 2>/dev/null || true)
PORT_5456=$(docker ps -a --filter "publish=${DB_PORT:-5456}" -q 2>/dev/null || true)
PORT_6380=$(docker ps -a --filter "publish=${REDIS_PORT:-6380}" -q 2>/dev/null || true)
CONFLICT_CONTAINERS=$(echo "$PORT_8080 $PORT_8000 $PORT_5456 $PORT_6380" | xargs)
if [ -n "$CONFLICT_CONTAINERS" ]; then
    echo "🧹 Removendo containers conflitantes nas portas da aplicacao..."
    docker rm -f $CONFLICT_CONTAINERS 2>/dev/null || true
fi

# Build e Start
echo "🏗️ Construindo e iniciando os containers (API, Web, DB, Redis)..."
"${COMPOSE_CMD[@]}" up -d --build

# Aguardar inicialização da API
echo "⏳ Aguardando API (Go) ficar saudável..."
MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -s http://localhost:8080/health | grep -q '"status":"ok"'; then
        echo "✅ API (Go) está ativa e saudável!"
        break
    fi
    sleep 2
    WAITED=$((WAITED + 2))
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo "⚠️ Timeout aguardando API. Verifique os logs com: ${COMPOSE_CMD[*]} logs api"
fi

# Status
echo "📦 Containers ativos:"
docker ps --format "table {{.Names}}\t{{.Status}}" 2>/dev/null || docker ps

# Informações finais
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -z "$IP" ] && IP="<IP da máquina>"

echo ""
echo "------------------------------------------------"
echo "✅ AssetTrack TI iniciado com sucesso!"
echo "------------------------------------------------"
echo "🌐 Frontend URL: http://${HOST_IP}:8000"
echo "🌐 Backend API:  http://${HOST_IP}:8080/api/v1"
echo "🌐 API Health:   http://localhost:8080/health"
echo "📱 APK Android:  gere pelo terminal e anexe com: ./scripts/publish_mobile_apk.sh /caminho/arquivo.apk"
echo "👤 Admin Padrão: admin@example.com"
echo "🔑 Senha:        admin"
echo "------------------------------------------------"
echo "📜 Logs:"
echo "${COMPOSE_CMD[*]} logs -f"
echo "------------------------------------------------"
