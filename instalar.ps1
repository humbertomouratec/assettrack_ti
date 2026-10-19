# ==============================================================================
# AssetTrack TI - Instalador e Inicializador para Windows
# ==============================================================================
# Este script automatiza a verificacao de pre-requisitos (winget/docker/git),
# inicializacao do Docker Desktop, configuracao de portas/.env, build e execucao
# dos containers da aplicacao, e criacao de atalho na Area de Trabalho.
# ==============================================================================

$ErrorActionPreference = "Continue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Cores e funcoes utilitarias de log (ASCII puro para total compatibilidade)
function Log-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Log-Success {
    param([string]$Message)
    Write-Host "[OK]   $Message" -ForegroundColor Green
}

function Log-Warning {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Log-Error {
    param([string]$Message)
    Write-Host "[ERRO] $Message" -ForegroundColor Red
}

function Log-Step {
    param([string]$Message)
    Write-Host "`n=== $Message ===" -ForegroundColor Blue
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "         AssetTrack TI - Instalador Windows               " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Diretorio do Projeto: $ScriptDir"
Write-Host ""

# ------------------------------------------------------------------------------
# 1. Verificacao de Privilegios de Administrador
# ------------------------------------------------------------------------------
Log-Step "1/7 - Verificando Privilegios do Sistema"
$isAdmin = $false
try {
    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
    $isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
catch {
    $isAdmin = $false
}

if ($isAdmin) {
    Log-Success "Executando com privilegios de Administrador."
}
else {
    Log-Warning "Script executado como usuario padrao."
    Log-Info "A instalacao de pacotes via winget podera solicitar confirmacao de UAC."
}

# ------------------------------------------------------------------------------
# 2. Verificacao de Pre-requisitos (winget, git, docker)
# ------------------------------------------------------------------------------
Log-Step "2/7 - Verificando Pre-requisitos do Sistema"

$hasWinget = [bool](Get-Command "winget" -ErrorAction SilentlyContinue)
$hasGit = [bool](Get-Command "git" -ErrorAction SilentlyContinue)
$hasDocker = [bool](Get-Command "docker" -ErrorAction SilentlyContinue)

# Git
if ($hasGit) {
    $gitVer = (git --version 2>$null)
    Log-Success "Git instalado: $gitVer"
}
else {
    Log-Warning "Git nao foi detectado no PATH."
    if ($hasWinget) {
        $installGit = Read-Host "Deseja instalar o Git automaticamente agora via winget? (S/N) [Padrao: S]"
        if (-not $installGit -or ($installGit -match "^[SsYy]")) {
            Log-Info "Instalando Git via winget..."
            winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        }
    }
    else {
        Log-Warning "Instale o Git manualmente em: https://git-scm.com/download/win"
    }
}

# Docker
if ($hasDocker) {
    Log-Success "Docker CLI detectado."
}
else {
    Log-Error "Docker nao foi encontrado no sistema!"
    if ($hasWinget) {
        $installDocker = Read-Host "Deseja instalar o Docker Desktop via winget agora? (S/N) [Padrao: S]"
        if (-not $installDocker -or ($installDocker -match "^[SsYy]")) {
            Log-Info "Instalando Docker Desktop..."
            winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
            Log-Warning "Docker Desktop foi instalado. Pode ser necessario reiniciar o Windows para concluir a configuracao do WSL2."
            Read-Host "Pressione ENTER apos reiniciar/configurar o Docker Desktop para continuar..."
        }
    }
    else {
        Log-Error "Instale o Docker Desktop em: https://www.docker.com/products/docker-desktop/"
        exit 1
    }
}

# ------------------------------------------------------------------------------
# 3. Verificacao e Inicializacao do Daemon do Docker Desktop
# ------------------------------------------------------------------------------
Log-Step "3/7 - Verificando Status do Docker Desktop"

$dockerRunning = $false
try {
    $null = docker info 2>$null
    if ($LASTEXITCODE -eq 0) {
        $dockerRunning = $true
    }
}
catch {
    $dockerRunning = $false
}

if (-not $dockerRunning) {
    Log-Warning "Docker Desktop nao esta em execucao no momento."
    Log-Info "Tentando iniciar o servico Docker Desktop automaticamente..."

    $possiblePaths = @(
        (Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Docker\Docker\Docker Desktop.exe"),
        (Join-Path $env:LocalAppData "Programs\Docker\Docker\Docker Desktop.exe")
    )

    $dockerExePath = $null
    foreach ($path in $possiblePaths) {
        if ($path -and (Test-Path $path)) {
            $dockerExePath = $path
            break
        }
    }

    if ($dockerExePath) {
        Log-Info "Iniciando Docker Desktop a partir de: $dockerExePath"
        Start-Process -FilePath $dockerExePath -WindowStyle Minimized
    }
    else {
        Log-Warning "Executavel do Docker Desktop nao localizado automaticamente nas pastas padrao."
        Log-Info "Abra o Docker Desktop manualmente pelo menu Iniciar do Windows."
    }

    Log-Info "Aguardando o daemon do Docker responder (limite: 90 segundos)..."
    $maxWait = 90
    $waited = 0
    while ($waited -lt $maxWait) {
        Start-Sleep -Seconds 3
        $waited += 3
        $null = docker info 2>$null
        if ($LASTEXITCODE -eq 0) {
            $dockerRunning = $true
            break
        }
        Write-Host -NoNewline "."
    }
    Write-Host ""

    if (-not $dockerRunning) {
        Log-Error "O daemon do Docker nao respondeu a tempo."
        Log-Error "Verifique se o Docker Desktop esta aberto e configurado corretamente com o backend WSL2."
        exit 1
    }
}

Log-Success "Docker Daemon esta online e pronto para uso."

# ------------------------------------------------------------------------------
# 4. Configuracao do Ambiente (.env) e Validacao de Portas
# ------------------------------------------------------------------------------
Log-Step "4/7 - Configuracao de Ambiente e Portas"

$envFile = Join-Path $ScriptDir ".env"
$envExample = Join-Path $ScriptDir ".env.example"

if (-not (Test-Path $envFile)) {
    Log-Info "Arquivo .env nao encontrado. Criando a partir de .env.example..."
    if (Test-Path $envExample) {
        Copy-Item -Path $envExample -Destination $envFile
        
        # Gerar SECRET_KEY aleatoria segura
        $randomBytes = New-Object byte[] 32
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $rng.GetBytes($randomBytes)
        $secretKey = -join ($randomBytes | ForEach-Object { "{0:x2}" -f $_ })
        
        (Get-Content $envFile) -replace "SECRET_KEY=.*", "SECRET_KEY=$secretKey" | Set-Content $envFile
        Log-Success "Arquivo .env criado com chave SECRET_KEY gerada aleatoriamente."
    }
    else {
        Log-Warning "Arquivo .env.example nao encontrado. Criando .env basico..."
        $defaultEnv = @"
PROJECT_NAME=AssetTrack TI
TZ=America/Sao_Paulo
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=assettrack
DATABASE_URL=postgres://user:password@db:5432/assettrack?sslmode=disable
REDIS_URL=redis://redis:6379/0
VITE_API_URL=/api/v1
SECRET_KEY=assettrack_windows_secret_key_change_me
ACCESS_TOKEN_EXPIRE_MINUTES=480
"@
        Set-Content -Path $envFile -Value $defaultEnv
        Log-Success "Arquivo .env basico criado com sucesso."
    }
}
else {
    Log-Success "Arquivo .env ja existe e foi preservado."
}

# Criar diretorio local dummy para android-sdk se necessario para evitar erro de volume no compose
$androidSdkDir = Join-Path $ScriptDir "android-sdk"
if (-not (Test-Path $androidSdkDir)) {
    New-Item -ItemType Directory -Path $androidSdkDir -Force | Out-Null
}
$env:ANDROID_SDK_PATH = $androidSdkDir

# Ler ou definir portas
$webPort = 8000
$apiPort = 8080
$dbPort = 5456
$redisPort = 6380

# Funcao de teste de porta ocupada
function Test-PortInUse {
    param([int]$Port)
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($connections -and ($connections.Count -gt 0 -or $connections.LocalPort -eq $Port)) {
        return $true
    }
    return $false
}

$portsToCheck = @(
    @{ Name = "Frontend Web"; Port = $webPort; EnvVar = "WEB_PORT" },
    @{ Name = "API Backend";  Port = $apiPort; EnvVar = "API_PORT" },
    @{ Name = "PostgreSQL";   Port = $dbPort;  EnvVar = "DB_PORT" },
    @{ Name = "Redis Cache";  Port = $redisPort; EnvVar = "REDIS_PORT" }
)

foreach ($item in $portsToCheck) {
    $portNum = $item.Port
    $name = $item.Name
    if (Test-PortInUse -Port $portNum) {
        Log-Warning "Porta $portNum ($name) ja parece estar em uso no Windows."
        Log-Info "Se for um container antigo do proprio AssetTrack, ele sera reiniciado na proxima etapa."
    }
    else {
        Log-Success "Porta $portNum ($name) disponivel."
    }
}

# ------------------------------------------------------------------------------
# 5. Build e Execucao dos Containers via Docker Compose
# ------------------------------------------------------------------------------
Log-Step "5/7 - Construindo e Iniciando Containers com Docker Compose"

# Variaveis de versionamento compativeis com o frontend Vite
$epochSeconds = [int][double]::Parse((Get-Date -UFormat %s))
$versionName = (Get-Date -Format "yyyy.MM.dd.HHmm")
$buildTimestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")

$env:VITE_APP_VERSION_CODE = "$epochSeconds"
$env:VITE_APP_VERSION_NAME = "$versionName"
$env:VITE_APP_BUILD_TIMESTAMP = "$buildTimestamp"
$env:VITE_API_URL = "/api/v1"

Log-Info "Parando eventuais containers antigos do projeto..."
docker compose down --remove-orphans 2>$null

Log-Info "Iniciando build e inicializacao dos servicos (db, redis, api, web)..."
Log-Info "Este processo pode levar alguns minutos no primeiro build..."
docker compose up -d --build

if ($LASTEXITCODE -ne 0) {
    Log-Error "Falha ao executar 'docker compose up -d --build'."
    Log-Error "Consulte os logs executando: docker compose logs"
    exit 1
}

Log-Success "Comando Docker Compose executado com sucesso."

# ------------------------------------------------------------------------------
# 6. Healthcheck da Aplicacao
# ------------------------------------------------------------------------------
Log-Step "6/7 - Verificando Saude da Aplicacao"

$healthUrl = "http://localhost:$apiPort/health"
Log-Info "Aguardando API responder em $healthUrl (limite: 60s)..."

$maxHealthWait = 60
$healthWaited = 0
$apiReady = $false

while ($healthWaited -lt $maxHealthWait) {
    Start-Sleep -Seconds 2
    $healthWaited += 2

    try {
        $response = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response -and ($response.status -eq "ok" -or $response.message -eq "ok")) {
            $apiReady = $true
            break
        }
    }
    catch {
        # Aguardando subir
    }
    Write-Host -NoNewline "."
}
Write-Host ""

if ($apiReady) {
    Log-Success "API Backend esta online e respondendo com status 200 OK!"
}
else {
    Log-Warning "A API demorou mais que o esperado para responder no endpoint /health."
    Log-Info "Verifique os logs com: docker compose logs api"
}

# ------------------------------------------------------------------------------
# 7. Criacao de Atalho na Area de Trabalho
# ------------------------------------------------------------------------------
Log-Step "7/7 - Criando Atalhos de Acesso"

$desktopPath = [Environment]::GetFolderPath("Desktop")
if ($desktopPath -and (Test-Path $desktopPath)) {
    try {
        $shortcutFile = Join-Path $desktopPath "AssetTrack TI.url"
        $shortcutContent = @"
[InternetShortcut]
URL=http://localhost:$webPort
IconIndex=0
"@
        Set-Content -Path $shortcutFile -Value $shortcutContent -Encoding ASCII
        Log-Success "Atalho criado na Area de Trabalho: AssetTrack TI"
    }
    catch {
        Log-Warning "Nao foi possivel criar o atalho na Area de Trabalho: $_"
    }
}

# ------------------------------------------------------------------------------
# Conclusao e Resumo
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "       AssetTrack TI Instalado e Pronto para Uso!         " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Painel Web (Frontend): http://localhost:$webPort" -ForegroundColor Cyan
Write-Host "  API Backend (Swagger): http://localhost:$apiPort/api/v1" -ForegroundColor Cyan
Write-Host "  Verificacao de Saude:  http://localhost:$apiPort/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Usuario Administrador Padrao:" -ForegroundColor White
Write-Host "  E-mail: admin@example.com" -ForegroundColor Yellow
Write-Host "  Senha:  admin" -ForegroundColor Yellow
Write-Host ""
Write-Host "----------------------------------------------------------"
Write-Host "  Comandos Uteis para o Dia a Dia:"
Write-Host "  - Iniciar sistema:   .\iniciar.bat  (ou docker compose up -d)"
Write-Host "  - Parar sistema:     .\parar.bat    (ou docker compose down)"
Write-Host "  - Ver logs em tempo real: docker compose logs -f"
Write-Host "  - Status dos servicos:    docker compose ps"
Write-Host "----------------------------------------------------------"
Write-Host ""

$openBrowser = Read-Host "Deseja abrir o AssetTrack TI no seu navegador agora? (S/N) [Padrao: S]"
if (-not $openBrowser -or ($openBrowser -match "^[SsYy]")) {
    Start-Process "http://localhost:$webPort"
}
