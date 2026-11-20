#ifndef MyAppVersion
  #define MyAppVersion "0.10.0"
#endif

#ifndef StageDir
  #define StageDir "..\dist-stage\qs-vpets-windows-x86_64"
#endif

#ifndef OutputDir
  #define OutputDir "..\dist"
#endif

[Setup]
AppId={{8E4C7D2A-3B19-4F0E-9A61-7C5E8F2B4D10}
AppName=Pokémon Sanctuary
AppVersion={#MyAppVersion}
AppVerName=Pokémon Sanctuary {#MyAppVersion}
AppPublisher=jesperls
AppPublisherURL=https://github.com/jesperls/qs-vpets
AppSupportURL=https://github.com/jesperls/qs-vpets/issues
AppUpdatesURL=https://github.com/jesperls/qs-vpets/releases
DefaultDirName={localappdata}\Programs\qs-vpets
DefaultGroupName=Pokémon Sanctuary
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename=qs-vpets-windows-x86_64-setup
SetupIconFile=AppIcon.ico
UninstallDisplayIcon={app}\Pokemon Sanctuary.exe
UninstallDisplayName=Pokémon Sanctuary (qs-vpets)
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ChangesEnvironment=yes
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "autostart"; Description: "Start Pokémon Sanctuary automatically when you sign in to Windows"; GroupDescription: "Startup:"
Name: "addpath"; Description: "Add qs-vpets CLI to your user PATH"; GroupDescription: "Command line:"
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Files]
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Pokémon Sanctuary"; Filename: "{app}\Pokemon Sanctuary.exe"
Name: "{autodesktop}\Pokémon Sanctuary"; Filename: "{app}\Pokemon Sanctuary.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "PokemonSanctuary"; ValueData: """{app}\Pokemon Sanctuary.exe"" --background"; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{app}\Pokemon Sanctuary.exe"; Parameters: "--open"; Description: "Launch Pokémon Sanctuary"; Flags: nowait postinstall skipifsilent

[Code]
procedure StopRunningApp(const ExePath: String);
var
  ResultCode: Integer;
begin
  if (ExePath <> '') and FileExists(ExePath) then
  begin
    Exec(ExePath, '--ipc quit', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(600);
  end;
  Exec('taskkill.exe', '/F /IM "Pokemon Sanctuary.exe"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(250);
end;

function NormalizePathPart(const P: String): String;
begin
  Result := Trim(P);
  while (Length(Result) > 1) and (Result[Length(Result)] = '\') do
    Delete(Result, Length(Result), 1);
  Result := Lowercase(Result);
end;

procedure AddToUserPath(const DirToAdd: String);
var
  OrigPath, TargetNorm, Part, Rest: String;
  SepPos: Integer;
begin
  TargetNorm := NormalizePathPart(DirToAdd);
  if TargetNorm = '' then Exit;

  if not RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', OrigPath) then
    OrigPath := '';

  Rest := OrigPath;
  while Rest <> '' do
  begin
    SepPos := Pos(';', Rest);
    if SepPos > 0 then
    begin
      Part := Copy(Rest, 1, SepPos - 1);
      Delete(Rest, 1, SepPos);
    end
    else
    begin
      Part := Rest;
      Rest := '';
    end;
    if NormalizePathPart(Part) = TargetNorm then
      Exit;
  end;

  if (OrigPath <> '') and (OrigPath[Length(OrigPath)] <> ';') then
    OrigPath := OrigPath + ';';
  OrigPath := OrigPath + DirToAdd;
  RegWriteExpandStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', OrigPath);
end;

procedure RemoveFromUserPath(const DirToRemove: String);
var
  OrigPath, NewPath, TargetNorm, Part, Rest: String;
  SepPos: Integer;
begin
  TargetNorm := NormalizePathPart(DirToRemove);
  if TargetNorm = '' then Exit;

  if not RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', OrigPath) then
    Exit;

  NewPath := '';
  Rest := OrigPath;
  while Rest <> '' do
  begin
    SepPos := Pos(';', Rest);
    if SepPos > 0 then
    begin
      Part := Copy(Rest, 1, SepPos - 1);
      Delete(Rest, 1, SepPos);
    end
    else
    begin
      Part := Rest;
      Rest := '';
    end;
    if (Trim(Part) <> '') and (NormalizePathPart(Part) <> TargetNorm) then
    begin
      if NewPath <> '' then NewPath := NewPath + ';';
      NewPath := NewPath + Part;
    end;
  end;

  RegWriteExpandStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', NewPath);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  StopRunningApp(ExpandConstant('{app}\Pokemon Sanctuary.exe'));
  Result := '';
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep = ssPostInstall) and WizardIsTaskSelected('addpath') then
    AddToUserPath(ExpandConstant('{app}\bin'));
end;

function InitializeUninstall(): Boolean;
begin
  StopRunningApp(ExpandConstant('{app}\Pokemon Sanctuary.exe'));
  Result := True;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    RemoveFromUserPath(ExpandConstant('{app}\bin'));
end;
