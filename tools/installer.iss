; ============================================================================
; tools/installer.iss — Instalador Nativo Windows 7 SP1 / 10 / 11 (32 & 64-bit)
; MI-TIENDA-POS v8.0.0
;
; Compilar con Inno Setup 6 (ISCC.exe):
;   ISCC.exe tools\installer.iss
;
; Nota para Windows 7 SP1:
;   El ejecutable empaquetado (MI-TIENDA-POS.exe) usa Electron 22.3.27 ia32,
;   compatible con Windows 7 SP1 de 32 y 64 bits sin Chrome ni Node previos.
;   Para que el propio asistente Instalar-MI-TIENDA-POS.exe corra en Win7 SP1,
;   se recomienda compilar este script con Inno Setup 6.2.2 o 6.3.3.
; ============================================================================

#define MyAppName "MI TIENDA POS"
#define MyAppVersion "8.0.0"
#define MyAppPublisher "MI TIENDA POS"
#define MyAppExeName "MI-TIENDA-POS.exe"
#define MySourceDir "..\dist\MI-TIENDA-POS-win32-ia32"

[Setup]
AppId={{8F4E2D90-7C1A-4B8E-9A51-6D32F0E41080}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={sd}\Program Files\MI-TIENDA-POS
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
AllowNoIcons=yes
PrivilegesRequired=admin
#if VER < 0x06040000
MinVersion=6.1sp1
#endif
OutputDir=..\dist
OutputBaseFilename=Instalar-MI-TIENDA-POS
SetupIconFile=..\assets\img\brand-icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/normal
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Dirs]
; Carpeta única de datos y respaldos con permisos de escritura para usuarios estándar en Windows 7
Name: "C:\MI-TIENDA-DATOS"; Permissions: users-modify
Name: "C:\MI-TIENDA-DATOS\respaldos"; Permissions: users-modify
Name: "C:\MI-TIENDA-DATOS\logs"; Permissions: users-modify

[Files]
Source: "{#MySourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; UN acceso directo en el Menú Inicio y UN acceso directo en el Escritorio
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\resources\app\assets\img\brand-icon.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\resources\app\assets\img\brand-icon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
