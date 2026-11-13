<#
.SYNOPSIS
Compila y firma MI-TIENDA-ADMIN.apk usando JDK 21 + Android SDK local (sin Gradle ni descargas).
#>
$ErrorActionPreference = 'Stop'

$RootDir = Split-Path -Parent $PSScriptRoot
$MobileWebDir = Join-Path $RootDir 'mobile'
$AndroidDir = Join-Path $MobileWebDir 'android-app'
$BuildDir = Join-Path $AndroidDir 'build'
$KeystoreDir = Join-Path $AndroidDir 'keystore'
$KeystorePath = Join-Path $KeystoreDir 'mitienda-admin.jks'
$OutApk = Join-Path $RootDir 'MI-TIENDA-ADMIN.apk'

$SdkDir = if ($env:ANDROID_HOME -and (Test-Path $env:ANDROID_HOME)) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$BuildTools = Join-Path $SdkDir 'build-tools\35.0.0'
$PlatformJar = Join-Path $SdkDir 'platforms\android-35\android.jar'

if (-not (Test-Path $BuildTools)) { throw "No se encontró build-tools\35.0.0 en $SdkDir" }
if (-not (Test-Path $PlatformJar)) { throw "No se encontró android-35\android.jar en $SdkDir" }

$Aapt2 = Join-Path $BuildTools 'aapt2.exe'
$ZipAlign = Join-Path $BuildTools 'zipalign.exe'
$D8Bat = Join-Path $BuildTools 'd8.bat'
$ApkSignerBat = Join-Path $BuildTools 'apksigner.bat'

Write-Host "==> 1. Preparando carpeta build..." -ForegroundColor Cyan
if (Test-Path $BuildDir) { Remove-Item -Recurse -Force $BuildDir }
$AssetsRootDir = Join-Path $BuildDir 'assets'
$GenDir = Join-Path $BuildDir 'gen'
$ClassesDir = Join-Path $BuildDir 'classes'
$DexDir = Join-Path $BuildDir 'dex'
New-Item -ItemType Directory -Force -Path $AssetsRootDir, $GenDir, $ClassesDir, $DexDir | Out-Null

# Copiar en raiz de assets/ (sin subcarpetas para evitar barras invertidas en aapt2 sobre Windows)
Copy-Item (Join-Path $MobileWebDir 'index.html') $AssetsRootDir -Force
Copy-Item (Join-Path $MobileWebDir 'mobile.css') $AssetsRootDir -Force
Copy-Item (Join-Path $MobileWebDir 'mobile.js') $AssetsRootDir -Force
$BrandPng = Join-Path $RootDir 'assets\img\brand-icon.png'
if (Test-Path $BrandPng) {
  Copy-Item $BrandPng (Join-Path $AssetsRootDir 'brand-icon.png') -Force
}

Write-Host "==> 2. Compilando recursos Android (aapt2 compile)..." -ForegroundColor Cyan
$ResZip = Join-Path $BuildDir 'compiled_res.zip'
& $Aapt2 compile --dir (Join-Path $AndroidDir 'res') -o $ResZip
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile falló" }

Write-Host "==> 3. Enlazando manifiesto y assets (aapt2 link)..." -ForegroundColor Cyan
$UnalignedApk = Join-Path $BuildDir 'app-unaligned.apk'
& $Aapt2 link `
  --manifest (Join-Path $AndroidDir 'AndroidManifest.xml') `
  -I $PlatformJar `
  -A (Join-Path $BuildDir 'assets') `
  --java $GenDir `
  -o $UnalignedApk `
  --auto-add-overlay `
  $ResZip
if ($LASTEXITCODE -ne 0) { throw "aapt2 link falló" }

Write-Host "==> 4. Compilando fuentes Java (javac)..." -ForegroundColor Cyan
$JavaFiles = @(
  (Get-ChildItem -Path $GenDir -Recurse -Filter '*.java' | Select-Object -ExpandProperty FullName)
  (Get-ChildItem -Path (Join-Path $AndroidDir 'src') -Recurse -Filter '*.java' | Select-Object -ExpandProperty FullName)
)
& javac --release 11 -encoding UTF-8 -classpath $PlatformJar -d $ClassesDir $JavaFiles
if ($LASTEXITCODE -ne 0) { throw "javac falló" }

Write-Host "==> 5. Generando classes.dex (d8)..." -ForegroundColor Cyan
$ClassFiles = Get-ChildItem -Path $ClassesDir -Recurse -Filter '*.class' | Select-Object -ExpandProperty FullName
$QuotedClasses = ($ClassFiles | ForEach-Object { '"' + $_ + '"' }) -join ' '
$D8Cmd = "`"$D8Bat`" --min-api 26 --lib `"$PlatformJar`" --output `"$DexDir`" $QuotedClasses"
& cmd.exe /c $D8Cmd
if ($LASTEXITCODE -ne 0) { throw "d8 falló" }

Write-Host "==> 6. Empaquetando classes.dex dentro del APK (jar uf)..." -ForegroundColor Cyan
& jar uf $UnalignedApk -C $DexDir classes.dex
if ($LASTEXITCODE -ne 0) { throw "jar uf falló" }

Write-Host "==> 7. Alineando APK (zipalign)..." -ForegroundColor Cyan
$AlignedApk = Join-Path $BuildDir 'app-aligned.apk'
& $ZipAlign -f -p 4 $UnalignedApk $AlignedApk
if ($LASTEXITCODE -ne 0) { throw "zipalign falló" }

Write-Host "==> 8. Firmando MI-TIENDA-ADMIN.apk (apksigner)..." -ForegroundColor Cyan
if (-not (Test-Path $KeystoreDir)) { New-Item -ItemType Directory -Force -Path $KeystoreDir | Out-Null }
if (-not (Test-Path $KeystorePath)) {
  & keytool -genkeypair -v -keystore $KeystorePath -storepass 'mitienda2026' -keypass 'mitienda2026' `
    -alias 'mitienda_admin' -keyalg RSA -keysize 2048 -validity 10000 `
    -dname 'CN=MI TIENDA POS, OU=Admin, O=MI TIENDA, L=Caracas, S=DC, C=VE'
  if ($LASTEXITCODE -ne 0) { throw "keytool falló" }
}

$SignCmd = "`"$ApkSignerBat`" sign --ks `"$KeystorePath`" --ks-key-alias mitienda_admin --ks-pass pass:mitienda2026 --key-pass pass:mitienda2026 --out `"$OutApk`" `"$AlignedApk`""
& cmd.exe /c $SignCmd
if ($LASTEXITCODE -ne 0) { throw "apksigner sign falló" }

$VerifyCmd = "`"$ApkSignerBat`" verify --verbose `"$OutApk`""
& cmd.exe /c $VerifyCmd
if ($LASTEXITCODE -ne 0) { throw "apksigner verify falló" }

$SizeKb = [math]::Round((Get-Item $OutApk).Length / 1KB, 1)
Write-Host "✅ APK generado y firmado con éxito: $OutApk ($SizeKb KB)" -ForegroundColor Green
