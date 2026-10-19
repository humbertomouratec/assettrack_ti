@echo off
title Parar AssetTrack TI
cd /d "%~dp0"

echo ========================================================
echo           Parando AssetTrack TI (Windows)
echo ========================================================
echo Parando containers Docker...
echo.

docker compose down

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [OK] Containers finalizados com sucesso!
) else (
    echo.
    echo [ERRO] Ocorreu uma falha ao parar os containers.
)

echo.
timeout /t 5
