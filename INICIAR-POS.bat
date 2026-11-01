@echo off
title MI TIENDA POS - Modo Caja Windows 7
cd /d "%~dp0"

echo ========================================================
echo   INICIANDO MI TIENDA POS - MODO CAJA DE COBRANZAS
echo   Optimizado para Windows 7 / Sin Consumo de GPU
echo ========================================================
echo.

set "HTML_PATH=%~dp0caja\pos.html"

:: Buscar Google Chrome en rutas tradicionales de Windows 7
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="%HTML_PATH%"
    exit /b
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app="%HTML_PATH%"
    exit /b
)
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" --app="%HTML_PATH%"
    exit /b
)

:: Buscar Microsoft Edge si no tiene Chrome
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="%HTML_PATH%"
    exit /b
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app="%HTML_PATH%"
    exit /b
)

:: Si no encuentra ejecutables directos, abrir con el navegador predeterminado
start "" "%HTML_PATH%"
exit /b
