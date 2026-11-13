@echo off
title Instalador MI TIENDA POS - Windows 7 SP1 / 10 / 11
echo ========================================================
echo   MI TIENDA POS v8.0.0 - Instalador Nativo de Escritorio
echo ========================================================
echo.
echo Iniciando el asistente de instalacion...
echo.

if exist "%~dp0dist\Instalar-MI-TIENDA-POS.exe" (
    start "" "%~dp0dist\Instalar-MI-TIENDA-POS.exe"
) else if exist "%~dp0Instalar-MI-TIENDA-POS.exe" (
    start "" "%~dp0Instalar-MI-TIENDA-POS.exe"
) else (
    echo [ERROR] No se encontro el archivo Instalar-MI-TIENDA-POS.exe.
    echo Asegurese de que la carpeta dist contenga el instalador.
    echo.
    pause
)
