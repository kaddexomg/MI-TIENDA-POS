<#
.SYNOPSIS
    Compila y firma las APK moviles de MI TIENDA POS.

.DESCRIPTION
    Dos sabores, mismo codigo fuente Java, mismo keystore:

      Admin    -> MI-TIENDA-ADMIN.apk    (com.mitienda.admin,    1.3.0)
      Escaner  -> MI-TIENDA-ESCANER.apk  (com.mitienda.scanner,  1.0.0)

    - Cada sabor se compila en su propia carpeta: mobile/android-app/build/<sabor>/
    - Los manifiestos viven en mobile/android-app/manifests/<sabor>/AndroidManifest.xml
    - Los recursos se copian a build/<sabor>/res y alli se reescribe
      res/values/strings.xml con el app_name y el local_start_url del sabor
      (asi no se duplican recursos).
    - Para el sabor Escaner se copia src/ a build/Escaner/src y se reescribe
      "package com.mitienda.admin;" por "package com.mitienda.scanner;" en las
      clases compiladas, para que R y .MainActivity resuelvan sin duplicar
      codigo fuente permanente en el repositorio.

    Usa el JDK 21 y el Android SDK locales (sin Gradle ni descargas).

.PARAMETER Flavor
    All (por defecto), Admin o Scanner.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools/build-mobile-apk.ps1 -Flavor All

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools/build-mobile-apk.ps1 -Flavor Scanner
#>
param(
    [ValidateSet('All', 'Admin', 'Scanner')]
    [string]$Flavor = 'All'
)

$ErrorActionPreference = 'Stop'

$RootDir = Split-Path -Parent $PSScriptRoot
$MobileWebDir = Join-Path $RootDir 'mobile'
$AndroidDir = Join-Path $MobileWebDir 'android-app'
$BuildRootDir = Join-Path $AndroidDir 'build'
$KeystoreDir = Join-Path $AndroidDir 'keystore'
$KeystorePath = Join-Path $KeystoreDir 'mitienda-admin.jks'
$KeystoreAlias = 'mitienda_admin'
$KeystorePass = 'mitienda2026'

$SdkDir = if ($env:ANDROID_HOME -and (Test-Path $env:ANDROID_HOME)) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$BuildTools = Join-Path $SdkDir 'build-tools\35.0.0'
$PlatformJar = Join-Path $SdkDir 'platforms\android-35\android.jar'

if (-not (Test-Path $BuildTools)) { throw "No se encontro build-tools\35.0.0 en $SdkDir" }
if (-not (Test-Path $PlatformJar)) { throw "No se encontro android-35\android.jar en $SdkDir" }

$Aapt2 = Join-Path $BuildTools 'aapt2.exe'
$ZipAlign = Join-Path $BuildTools 'zipalign.exe'
$D8Bat = Join-Path $BuildTools 'd8.bat'
$ApkSignerBat = Join-Path $BuildTools 'apksigner.bat'

# El acento se arma por codigo: asi el script funciona igual si Windows
# PowerShell 5.1 lo lee como ANSI o si PowerShell 7 lo lee como UTF-8.
$ScannerAppName = 'MI TIENDA ESC' + [char]0x00C1 + 'NER'

function Get-FlavorConfig {
    param([string]$Name)

    if ($Name -eq 'Scanner') {
        return @{
            Name        = 'Scanner'
            Package     = 'com.mitienda.scanner'
            AppName     = $ScannerAppName
            LocalStart  = 'http://localhost/scanner.html?app=scanner'
            Manifest    = Join-Path $AndroidDir 'manifests\scanner\AndroidManifest.xml'
            OutApk      = Join-Path $RootDir 'MI-TIENDA-ESCANER.apk'
            WebAssets   = @('scanner.html', 'mobile.css', 'barcode-scanner.js')
            RewritePkg  = $true
        }
    }

    return @{
        Name        = 'Admin'
        Package     = 'com.mitienda.admin'
        AppName     = 'MI TIENDA ADMIN'
        LocalStart  = 'http://localhost/index.html'
        Manifest    = Join-Path $AndroidDir 'manifests\admin\AndroidManifest.xml'
        OutApk      = Join-Path $RootDir 'MI-TIENDA-ADMIN.apk'
        WebAssets   = @('index.html', 'mobile.css', 'mobile.js', 'barcode-scanner.js', 'scanner.html')
        RewritePkg  = $false
    }
}

function Write-Step {
    param([string]$Text)
    Write-Host "  ==> $Text" -ForegroundColor Cyan
}

function Invoke-FlavorBuild {
    param($Cfg)

    $name = $Cfg.Name
    Write-Host ''
    Write-Host '==================================================================' -ForegroundColor DarkCyan
    Write-Host ("  SABOR {0}  ->  {1}" -f $name.ToUpper(), $Cfg.Package) -ForegroundColor White
    Write-Host '==================================================================' -ForegroundColor DarkCyan

    if (-not (Test-Path $Cfg.Manifest)) { throw "Falta el manifiesto del sabor $name : $($Cfg.Manifest)" }

    $buildDir = Join-Path $BuildRootDir $name
    if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir }

    $assetsDir = Join-Path $buildDir 'assets'
    $genDir = Join-Path $buildDir 'gen'
    $classesDir = Join-Path $buildDir 'classes'
    $dexDir = Join-Path $buildDir 'dex'
    $resDir = Join-Path $buildDir 'res'
    $srcDir = Join-Path $buildDir 'src'
    New-Item -ItemType Directory -Force -Path $assetsDir, $genDir, $classesDir, $dexDir, $resDir, $srcDir | Out-Null

    # ------------------------------------------------------------------
    # 1. Assets web del sabor (sin subcarpetas: aapt2 y Windows)
    # ------------------------------------------------------------------
    Write-Step "1/9 Copiando assets web del sabor $name"
    foreach ($asset in $Cfg.WebAssets) {
        $assetSrc = Join-Path $MobileWebDir $asset
        if (-not (Test-Path $assetSrc)) { throw "Falta el archivo web: $assetSrc" }
        Copy-Item $assetSrc $assetsDir -Force
    }
    $brandPng = Join-Path $RootDir 'assets\img\brand-icon.png'
    if (Test-Path $brandPng) {
        Copy-Item $brandPng (Join-Path $assetsDir 'brand-icon.png') -Force
    }

    # ------------------------------------------------------------------
    # 2. Recursos: copia limpia + strings.xml propio del sabor
    # ------------------------------------------------------------------
    Write-Step '2/9 Preparando recursos (res/) del sabor'
    Copy-Item -Path (Join-Path $AndroidDir 'res\*') -Destination $resDir -Recurse -Force
    $valuesDir = Join-Path $resDir 'values'
    if (-not (Test-Path $valuesDir)) { New-Item -ItemType Directory -Force -Path $valuesDir | Out-Null }
    $stringsXml = @"
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">$($Cfg.AppName)</string>
    <string name="local_start_url">$($Cfg.LocalStart)</string>
</resources>
"@
    $stringsPath = Join-Path $valuesDir 'strings.xml'
    [System.IO.File]::WriteAllText($stringsPath, $stringsXml, (New-Object System.Text.UTF8Encoding($false)))

    # ------------------------------------------------------------------
    # 3. Codigo fuente (copia temporal por sabor)
    # ------------------------------------------------------------------
    Write-Step '3/9 Copiando codigo Java'
    Copy-Item -Path (Join-Path $AndroidDir 'src\*') -Destination $srcDir -Recurse -Force
    if ($Cfg.RewritePkg) {
        $fromPkg = 'package com.mitienda.admin;'
        $toPkg = 'package ' + $Cfg.Package + ';'
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        $rewritten = 0
        Get-ChildItem -Path $srcDir -Recurse -Filter '*.java' | ForEach-Object {
            $text = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
            if ($text.Contains($fromPkg)) {
                $updated = $text.Replace($fromPkg, $toPkg)
                [System.IO.File]::WriteAllText($_.FullName, $updated, $utf8NoBom)
                $rewritten++
            }
        }
        Write-Host ("     package reescrito en {0} archivo(s) -> {1}" -f $rewritten, $toPkg)
    }

    # ------------------------------------------------------------------
    # 4. aapt2 compile
    # ------------------------------------------------------------------
    Write-Step '4/9 Compilando recursos (aapt2 compile)'
    $resZip = Join-Path $buildDir 'compiled_res.zip'
    & $Aapt2 compile --dir $resDir -o $resZip
    if ($LASTEXITCODE -ne 0) { throw "aapt2 compile fallo (sabor $name)" }

    # ------------------------------------------------------------------
    # 5. aapt2 link (manifiesto + assets + R.java)
    # ------------------------------------------------------------------
    Write-Step '5/9 Enlazando manifiesto y assets (aapt2 link)'
    $unalignedApk = Join-Path $buildDir 'app-unaligned.apk'
    & $Aapt2 link `
        --manifest $Cfg.Manifest `
        -I $PlatformJar `
        -A $assetsDir `
        --java $genDir `
        -o $unalignedApk `
        --auto-add-overlay `
        $resZip
    if ($LASTEXITCODE -ne 0) { throw "aapt2 link fallo (sabor $name)" }

    # ------------------------------------------------------------------
    # 6. javac
    # ------------------------------------------------------------------
    Write-Step '6/9 Compilando Java (javac --release 11)'
    $javaFiles = @()
    $javaFiles += Get-ChildItem -Path $genDir -Recurse -Filter '*.java' | Select-Object -ExpandProperty FullName
    $javaFiles += Get-ChildItem -Path $srcDir -Recurse -Filter '*.java' | Select-Object -ExpandProperty FullName
    & javac --release 11 -encoding UTF-8 -classpath $PlatformJar -d $classesDir $javaFiles
    if ($LASTEXITCODE -ne 0) { throw "javac fallo (sabor $name)" }

    # ------------------------------------------------------------------
    # 7. d8 -> classes.dex + jar uf dentro del APK
    # ------------------------------------------------------------------
    Write-Step '7/9 Generando classes.dex (d8) y empaquetando'
    $classFiles = Get-ChildItem -Path $classesDir -Recurse -Filter '*.class' | Select-Object -ExpandProperty FullName
    $quotedClasses = ($classFiles | ForEach-Object { '"' + $_ + '"' }) -join ' '
    $d8Cmd = "`"$D8Bat`" --min-api 26 --lib `"$PlatformJar`" --output `"$dexDir`" $quotedClasses"
    & cmd.exe /c $d8Cmd
    if ($LASTEXITCODE -ne 0) { throw "d8 fallo (sabor $name)" }

    & jar uf $unalignedApk -C $dexDir classes.dex
    if ($LASTEXITCODE -ne 0) { throw "jar uf fallo (sabor $name)" }

    # ------------------------------------------------------------------
    # 8. zipalign
    # ------------------------------------------------------------------
    Write-Step '8/9 Alineando APK (zipalign)'
    $alignedApk = Join-Path $buildDir 'app-aligned.apk'
    & $ZipAlign -f -p 4 $unalignedApk $alignedApk
    if ($LASTEXITCODE -ne 0) { throw "zipalign fallo (sabor $name)" }

    # ------------------------------------------------------------------
    # 9. Firma + verificacion
    # ------------------------------------------------------------------
    Write-Step '9/9 Firmando y verificando el APK'
    if (-not (Test-Path $KeystoreDir)) { New-Item -ItemType Directory -Force -Path $KeystoreDir | Out-Null }
    if (-not (Test-Path $KeystorePath)) {
        & keytool -genkeypair -v -keystore $KeystorePath -storepass $KeystorePass -keypass $KeystorePass `
            -alias $KeystoreAlias -keyalg RSA -keysize 2048 -validity 10000 `
            -dname 'CN=MI TIENDA POS, OU=Admin, O=MI TIENDA, L=Caracas, S=DC, C=VE'
        if ($LASTEXITCODE -ne 0) { throw 'keytool fallo' }
    }

    $signCmd = "`"$ApkSignerBat`" sign --ks `"$KeystorePath`" --ks-key-alias $KeystoreAlias --ks-pass pass:$KeystorePass --key-pass pass:$KeystorePass --out `"$($Cfg.OutApk)`" `"$alignedApk`""
    & cmd.exe /c $signCmd
    if ($LASTEXITCODE -ne 0) { throw "apksigner sign fallo (sabor $name)" }

    $verifyCmd = "`"$ApkSignerBat`" verify --verbose `"$($Cfg.OutApk)`""
    & cmd.exe /c $verifyCmd
    if ($LASTEXITCODE -ne 0) { throw "apksigner verify fallo (sabor $name)" }

    # Package + etiqueta reales que quedaron dentro del APK
    & $Aapt2 dump badging $Cfg.OutApk | Select-String -Pattern '^package:|^application-label' | ForEach-Object {
        Write-Host ("     " + $_.Line) -ForegroundColor DarkGray
    }

    $sizeKb = [math]::Round((Get-Item $Cfg.OutApk).Length / 1KB, 1)
    Write-Host ("  [OK] {0} ({1} KB)" -f $Cfg.OutApk, $sizeKb) -ForegroundColor Green
}

Write-Host ''
Write-Host '  MI TIENDA POS - Compilador de APK moviles' -ForegroundColor White
Write-Host ("  SDK     : " + $SdkDir) -ForegroundColor DarkGray
Write-Host ("  Sabor   : " + $Flavor) -ForegroundColor DarkGray

$flavorsToBuild = @()
switch ($Flavor) {
    'Admin' { $flavorsToBuild = @('Admin') }
    'Scanner' { $flavorsToBuild = @('Scanner') }
    default { $flavorsToBuild = @('Admin', 'Scanner') }
}

foreach ($flavorName in $flavorsToBuild) {
    Invoke-FlavorBuild -Cfg (Get-FlavorConfig -Name $flavorName)
}

Write-Host ''
Write-Host '==================================================================' -ForegroundColor DarkCyan
Write-Host '  APK generadas y firmadas:' -ForegroundColor Green
foreach ($apkName in @('MI-TIENDA-ADMIN.apk', 'MI-TIENDA-ESCANER.apk')) {
    $apkPath = Join-Path $RootDir $apkName
    if (Test-Path $apkPath) {
        $kb = [math]::Round((Get-Item $apkPath).Length / 1KB, 1)
        Write-Host ("   - {0}  ({1} KB)" -f $apkPath, $kb) -ForegroundColor Green
    }
}
Write-Host '==================================================================' -ForegroundColor DarkCyan
Write-Host ''
