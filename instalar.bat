@echo off
title AssetTrack TI - Instalador Windows
cd /d "%~dp0"

echo ========================================================
echo    AssetTrack TI - Inicializador do Instalador Windows
echo ========================================================
echo Executando script PowerShell com bypass de politica de execucao...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] Ocorreu uma falha durante a execucao do instalador.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Pressione qualquer tecla para fechar esta janela...
pause >nul
