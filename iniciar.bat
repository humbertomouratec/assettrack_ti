@echo off
title Iniciar AssetTrack TI
cd /d "%~dp0"

echo ========================================================
echo           Iniciando AssetTrack TI (Windows)
echo ========================================================
echo Subindo containers Docker...
echo.

docker compose up -d

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [OK] Containers iniciados com sucesso!
    echo Acesse: http://localhost:8000
) else (
    echo.
    echo [ERRO] Falha ao iniciar containers. Verifique se o Docker Desktop esta aberto.
)

echo.
timeout /t 5
