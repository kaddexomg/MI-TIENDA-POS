@echo off
title MI TIENDA POS - Panel Administrativo Windows 7
cd /d "%~dp0"

echo ========================================================
echo   INICIANDO MI TIENDA POS - PANEL ADMINISTRATIVO
echo   Optimizado para Windows 7 / Sin Consumo de GPU
echo ========================================================
echo.

set "HTML_PATH=%~dp0admin\index.html"

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
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="%HTML_PATH%"
    exit /b
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app="%HTML_PATH%"
    exit /b
)

start "" "%HTML_PATH%"
exit /b
