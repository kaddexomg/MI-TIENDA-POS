<#
.SYNOPSIS
Empaqueta MI-TIENDA-POS para Windows 7 SP1 (32/64 bits, Electron 22.3.27 ia32)
y genera el instalador dist\Instalar-MI-TIENDA-POS.exe con Inno Setup.
#>
[CmdletBinding()]
param(
  [switch]$ForceNpmInstall,
  [switch]$PackageOnly,
  [switch]$InstallInnoSetup
)

$ErrorActionPreference = 'Stop'

$RootDir = Split-Path -Parent $PSScriptRoot
$DesktopDir = Join-Path $RootDir 'desktop'
$DistDir = Join-Path $RootDir 'dist'
$PackOutDir = Join-Path $DistDir 'MI-TIENDA-POS-win32-ia32'
$PackExe = Join-Path $PackOutDir 'MI-TIENDA-POS.exe'
$IssPath = Join-Path $PSScriptRoot 'installer.iss'
$SetupExe = Join-Path $DistDir 'Instalar-MI-TIENDA-POS.exe'

Write-Host '==> 1. Verificando Node.js y npm...' -ForegroundColor Cyan
$nodeVer = & node -v
if ($LASTEXITCODE -ne 0) { throw 'Node.js no está disponible en el PATH.' }
Write-Host "    Node.js detectado: $nodeVer"

$DesktopNodeModules = Join-Path $DesktopDir 'node_modules'
if ($ForceNpmInstall -or -not (Test-Path $DesktopNodeModules)) {
  Write-Host '==> 2. Instalando dependencias de desktop/ (Electron 22.3.27)...' -ForegroundColor Cyan
  Push-Location $DesktopDir
  $prevPref = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm install en desktop/ falló.' }
  } finally {
    $ErrorActionPreference = $prevPref
    Pop-Location
  }
} else {
  Write-Host '==> 2. Dependencias en desktop/node_modules presentes (omitido npm install).' -ForegroundColor DarkCyan
}

Write-Host '==> 3. Generando paquete todo-en-uno win32-ia32 (Electron 22.3.27)...' -ForegroundColor Cyan
Push-Location $DesktopDir
$prevPref = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
  & node (Join-Path $DesktopDir 'scripts\pack-win7.js')
  if ($LASTEXITCODE -ne 0) { throw 'pack-win7.js falló al generar dist\MI-TIENDA-POS-win32-ia32.' }
} finally {
  $ErrorActionPreference = $prevPref
  Pop-Location
}

if (-not (Test-Path $PackExe)) {
  throw "No se encontró el ejecutable empaquetado esperado: $PackExe"
}
$ExeMb = [math]::Round((Get-Item $PackExe).Length / 1MB, 2)
Write-Host "    Ejecutable generado: $PackExe ($ExeMb MB)" -ForegroundColor Green

if ($PackageOnly) {
  Write-Host '==> -PackageOnly activo: se omite compilación de Inno Setup.' -ForegroundColor Yellow
  exit 0
}

function Find-IsccCompiler {
  param([string]$RepoRoot)
  $candidates = @(
    'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
    'C:\Program Files\Inno Setup 6\ISCC.exe',
    'C:\Program Files (x86)\Inno Setup 5\ISCC.exe',
    'C:\Program Files\Inno Setup 5\ISCC.exe',
    (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
    (Join-Path $RepoRoot 'tools\inno-setup\ISCC.exe')
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }
  $cmd = Get-Command 'ISCC.exe' -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

Write-Host '==> 4. Buscando compilador Inno Setup 6 (ISCC.exe)...' -ForegroundColor Cyan
$IsccPath = Find-IsccCompiler -RepoRoot $RootDir

if (-not $IsccPath -and $InstallInnoSetup) {
  $wingetCmd = Get-Command 'winget.exe' -ErrorAction SilentlyContinue
  if (-not $wingetCmd) {
    throw 'Se indicó -InstallInnoSetup pero winget.exe no está disponible en esta máquina.'
  }
  Write-Host '    Instalando Inno Setup 6.7.3 (x86, alcance usuario, sin UAC) vía winget...' -ForegroundColor Cyan
  $prevPref = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & winget.exe install --id JRSoftware.InnoSetup --version 6.7.3 --scope user --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
      throw "winget falló al instalar JRSoftware.InnoSetup 6.7.3 (código $LASTEXITCODE)."
    }
  } finally {
    $ErrorActionPreference = $prevPref
  }
  $IsccPath = Find-IsccCompiler -RepoRoot $RootDir
}

if (-not $IsccPath) {
  Write-Warning 'No se encontró Inno Setup 6 (ISCC.exe) en esta PC.'
  Write-Host ''
  Write-Host '  El paquete portable todo-en-uno SI quedó listo en:' -ForegroundColor Yellow
  Write-Host "    $PackOutDir" -ForegroundColor White
  Write-Host ''
  Write-Host '  Para generar dist\Instalar-MI-TIENDA-POS.exe (100% compatible con Win7 SP1):' -ForegroundColor Yellow
  Write-Host '    Opción automática (instalación por usuario sin UAC):' -ForegroundColor White
  Write-Host '      powershell -ExecutionPolicy Bypass -File tools\build-win7-installer.ps1 -InstallInnoSetup' -ForegroundColor White
  Write-Host '    O manual vía winget (Inno Setup 6.7.3 x86 / MinVersion 6.1sp1):' -ForegroundColor White
  Write-Host '      winget install --id JRSoftware.InnoSetup --version 6.7.3 --scope user' -ForegroundColor White
  Write-Host '    Y luego volver a ejecutar: powershell -ExecutionPolicy Bypass -File tools\build-win7-installer.ps1' -ForegroundColor White
  exit 2
}

Write-Host "    ISCC encontrado: $IsccPath" -ForegroundColor Green
Write-Host '==> 5. Compilando dist\Instalar-MI-TIENDA-POS.exe...' -ForegroundColor Cyan
$prevPref = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
  & $IsccPath $IssPath
  if ($LASTEXITCODE -ne 0) {
    throw "ISCC.exe falló al compilar $IssPath (código $LASTEXITCODE)."
  }
} finally {
  $ErrorActionPreference = $prevPref
}

if (-not (Test-Path $SetupExe)) {
  throw "ISCC finalizó pero no apareció $SetupExe"
}

$SetupMb = [math]::Round((Get-Item $SetupExe).Length / 1MB, 2)
Write-Host "✅ Instalador generado con éxito: $SetupExe ($SetupMb MB)" -ForegroundColor Green
