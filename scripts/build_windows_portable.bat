@echo off
title Compilar AssetTrack TI Portable (.exe)
cd /d "%~dp0\.."

echo ========================================================
echo     Compilando Executavel Windows Portatil (.exe)
echo                  AssetTrack TI Desktop
echo ========================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Node.js nao foi encontrado no sistema.
    echo Instale o Node.js em https://nodejs.org/ para compilar o executavel.
    pause
    exit /b 1
)

cd desktop

echo [1/2] Verificando e instalando dependencias do Electron...
call npm install --no-audit --no-fund

if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao instalar dependencias do Electron.
    pause
    exit /b 1
)

echo.
echo [2/2] Empacotando executavel portatil para Windows x64...
call npm run build:portable

if %ERRORLEVEL% EQU 0 (
    copy /y "dist\AssetTrack-TI-Portable.exe" "..\AssetTrack-TI-Portable.exe" >nul
    echo.
    echo ========================================================
    echo  [SUCESSO] Executavel Windows portatil gerado com sucesso!
    echo ========================================================
    echo  Arquivo na raiz: AssetTrack-TI-Portable.exe
    echo  Arquivo em dist: desktop\dist\AssetTrack-TI-Portable.exe
    echo ========================================================
    echo.
) else (
    echo.
    echo [ERRO] Ocorreu um erro durante o empacotamento do executavel.
    echo.
)

pause
