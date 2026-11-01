@echo off
chcp 65001 >nul
title INSTALADOR MI TIENDA POS - WINDOWS 7
color 0A
cd /d "%~dp0"

echo ======================================================================
echo    INSTALADOR Y CONFIGURADOR DE ACCESOS DIRECTOS — WINDOWS 7 / 10 / 11
echo    MI-TIENDA-POS (Restaurante Venezolano + Minimercado / Abasto)
echo ======================================================================
echo.

:: 1. Crear carpeta de persistencia y respaldos locales en disco C:\
if not exist "C:\MI-TIENDA-DATOS\respaldos" (
    echo [+] Creando carpeta de datos y respaldos en C:\MI-TIENDA-DATOS\respaldos\ ...
    mkdir "C:\MI-TIENDA-DATOS\respaldos" 2>nul
) else (
    echo [OK] Directorio C:\MI-TIENDA-DATOS\respaldos ya existe.
)

:: 2. Detectar ruta del escritorio
set "DESKTOP_DIR=%USERPROFILE%\Desktop"
if not exist "%DESKTOP_DIR%" (
    for /f "tokens=2*" %%a in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders" /v Desktop 2^>nul') do set "DESKTOP_DIR=%%b"
)

echo [+] Ruta de escritorio detectada: %DESKTOP_DIR%
echo.

:: 3. Generar accesos directos en el escritorio mediante VBScript
set "VBS_SCRIPT=%TEMP%\crear_accesos_mtp.vbs"
(
echo Set oWS = WScript.CreateObject("WScript.Shell"^)
echo sDesktop = oWS.SpecialFolders("Desktop"^)
echo.
echo ' Acceso directo 1: CAJA REGISTRADORA (POS)
echo Set oLink1 = oWS.CreateShortcut(sDesktop ^& "\MI TIENDA - CAJA.lnk"^)
echo oLink1.TargetPath = "%~dp0INICIAR-POS.bat"
echo oLink1.WorkingDirectory = "%~dp0"
echo oLink1.Description = "MI TIENDA POS - Caja Registradora y Ventas"
echo oLink1.WindowStyle = 1
echo oLink1.Save
echo.
echo ' Acceso directo 2: PANEL ADMINISTRADOR
echo Set oLink2 = oWS.CreateShortcut(sDesktop ^& "\MI TIENDA - ADMINISTRADOR.lnk"^)
echo oLink2.TargetPath = "%~dp0INICIAR-ADMIN.bat"
echo oLink2.WorkingDirectory = "%~dp0"
echo oLink2.Description = "MI TIENDA POS - Panel de Control, Kardex e Inventario"
echo oLink2.WindowStyle = 1
echo oLink2.Save
) > "%VBS_SCRIPT%"

cscript //nologo "%VBS_SCRIPT%"
del "%VBS_SCRIPT%" 2>nul

echo [OK] Accesos directos creados exitosamente en el Escritorio:
echo      1. MI TIENDA - CAJA.lnk
echo      2. MI TIENDA - ADMINISTRADOR.lnk
echo.
echo ======================================================================
echo   ¡INSTALACIÓN COMPLETADA!
echo   Ya puedes abrir cualquiera de los dos accesos directos en tu PC.
echo ======================================================================
echo.
pause
