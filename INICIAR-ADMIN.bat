@echo off
title MI TIENDA POS - Panel Administrativo Windows 7
cd /d "%~dp0"

echo ========================================================
echo   INICIANDO MI TIENDA POS - PANEL ADMINISTRATIVO
echo   Optimizado para Windows 7 / Sin Consumo de GPU
echo ========================================================
echo.

:: 1. Detectar disponibilidad de Node.js (PATH o local portable)
set "NODE_CMD="
where node.exe >nul 2>nul
if %ERRORLEVEL% equ 0 (
    set "NODE_CMD=node"
) else (
    if exist "%~dp0node\node.exe" (
        set "NODE_CMD=%~dp0node\node.exe"
    ) else if exist "%~dp0server\node.exe" (
        set "NODE_CMD=%~dp0server\node.exe"
    ) else if exist "%ProgramFiles%\nodejs\node.exe" (
        set "NODE_CMD=%ProgramFiles%\nodejs\node.exe"
    ) else if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
        set "NODE_CMD=%ProgramFiles(x86)%\nodejs\node.exe"
    )
)

:: 2. Si Node.js está disponible, arrancar servidor en segundo plano
set "APP_TARGET=%~dp0admin\index.html"
if defined NODE_CMD (
    echo [+] Node.js detectado (%NODE_CMD%^)
    echo [+] Verificando servidor local en puerto 7070...
    netstat -ano | findstr :7070 >nul 2>nul
    if %ERRORLEVEL% neq 0 (
        echo [+] Iniciando Servidor Local y Journal Anti-Apagones...
        start "MTP-SERVER-7070" /min "%NODE_CMD%" "%~dp0server\server.js"
        ping -n 2 127.0.0.1 >nul
    ) else (
        echo [OK] Servidor local ya se encuentra activo en puerto 7070.
    )
    set "APP_TARGET=http://localhost:7070/admin/index.html"
) else (
    echo [!] Node.js no detectado. Iniciando en modo offline directo (archivo local^)...
)

echo [+] Abriendo Panel Administrativo...
echo.

:: 3. Buscar Google Chrome en rutas tradicionales de Windows 7
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="%APP_TARGET%"
    exit /b
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app="%APP_TARGET%"
    exit /b
)
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" --app="%APP_TARGET%"
    exit /b
)

:: 4. Buscar Microsoft Edge si no tiene Chrome
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="%APP_TARGET%"
    exit /b
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app="%APP_TARGET%"
    exit /b
)

:: 5. Si no encuentra ejecutables directos, abrir con el navegador predeterminado
start "" "%APP_TARGET%"
exit /b
