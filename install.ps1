[CmdletBinding()]
param(
    [switch]$Portable,
    [switch]$Native,
    [switch]$Autostart,
    [switch]$NoAutostart,
    [switch]$Uninstall,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

$Repo = if ($env:QS_VPETS_REPO) { $env:QS_VPETS_REPO } else { "jesperls/qs-vpets" }
$Branch = if ($env:QS_VPETS_BRANCH) { $env:QS_VPETS_BRANCH } else { "main" }
$InstallDir = if ($env:QS_VPETS_INSTALL_DIR) { $env:QS_VPETS_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA "Programs\qs-vpets" }
$BinDir = Join-Path $InstallDir "bin"
$StartMenuShortcut = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Pokemon Sanctuary.lnk"
$RunRegPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$RunRegName = "PokemonSanctuary"

function Log([string]$Msg) {
    Write-Host "==> $Msg"
}

function Fail([string]$Msg) {
    Write-Error "qs-vpets installer: $Msg"
    exit 1
}

function Show-Usage {
    @"
Pokemon Sanctuary (qs-vpets) Windows installer

Usage: install.ps1 [OPTIONS]

  -Portable        Install self-contained Windows bundle into %LOCALAPPDATA%\Programs\qs-vpets (default)
  -Native          Build and install from source using CMake + Qt6 + windeployqt
  -Autostart       Enable Windows login autostart (default)
  -NoAutostart     Skip configuring login autostart
  -Uninstall       Stop pets and remove qs-vpets installation (keeps companion memories)
  -Help            Show this help
"@ | Write-Host
}

if ($Help) {
    Show-Usage
    exit 0
}

$EnableAutostart = $true
if ($NoAutostart) {
    $EnableAutostart = $false
} elseif ($Autostart) {
    $EnableAutostart = $true
}

function Add-UserPathEntry([string]$Dir) {
    $current = [Environment]::GetEnvironmentVariable("Path", "User")
    $parts = @()
    if ($current) {
        $parts = $current.Split(";") | Where-Object { $_ -and $_.Trim() -ne "" }
    }
    $normTarget = $Dir.TrimEnd("\")
    foreach ($p in $parts) {
        if ($p.TrimEnd("\").Equals($normTarget, [StringComparison]::OrdinalIgnoreCase)) {
            return
        }
    }
    $updated = (@($parts) + @($Dir)) -join ";"
    [Environment]::SetEnvironmentVariable("Path", $updated, "User")
    $env:Path = "$Dir;$env:Path"
}

function Remove-UserPathEntry([string]$Dir) {
    $current = [Environment]::GetEnvironmentVariable("Path", "User")
    if (-not $current) { return }
    $normTarget = $Dir.TrimEnd("\")
    $kept = $current.Split(";") | Where-Object {
        $_ -and $_.Trim() -ne "" -and (-not $_.TrimEnd("\").Equals($normTarget, [StringComparison]::OrdinalIgnoreCase))
    }
    [Environment]::SetEnvironmentVariable("Path", ($kept -join ";"), "User")
}

function New-StartMenuShortcut([string]$ExePath) {
    try {
        $wsh = New-Object -ComObject WScript.Shell
        $sc = $wsh.CreateShortcut($StartMenuShortcut)
        $sc.TargetPath = $ExePath
        $sc.WorkingDirectory = Split-Path -Parent $ExePath
        $sc.IconLocation = "$ExePath,0"
        $sc.Description = "Pokemon Sanctuary desktop companions"
        $sc.Save()
    } catch {
        Write-Warning "Could not create Start Menu shortcut: $_"
    }
}

function Do-Uninstall {
    $cli = Join-Path $BinDir "qs-vpets.ps1"
    if (Test-Path -LiteralPath $cli) {
        try { & $cli stop | Out-Null } catch {}
        try { & $cli autostart disable | Out-Null } catch {}
    } else {
        if (Test-Path -LiteralPath $RunRegPath) {
            Remove-ItemProperty -Path $RunRegPath -Name $RunRegName -ErrorAction SilentlyContinue
        }
        $existingExe = Join-Path $InstallDir "Pokemon Sanctuary.exe"
        if (Test-Path -LiteralPath $existingExe) {
            try { & $existingExe --ipc quit | Out-Null } catch {}
            Start-Sleep -Milliseconds 600
        }
        Get-Process -Name "Pokemon Sanctuary" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $StartMenuShortcut) {
        Remove-Item -LiteralPath $StartMenuShortcut -Force -ErrorAction SilentlyContinue
    }
    Remove-UserPathEntry $BinDir
    if (Test-Path -LiteralPath $InstallDir) {
        Start-Sleep -Milliseconds 300
        Remove-Item -LiteralPath $InstallDir -Recurse -Force
    }
    Log "Uninstalled qs-vpets (companion memories kept in %APPDATA%\qs-vpets and %LOCALAPPDATA%\qs-vpets)."
    exit 0
}

if ($Uninstall) {
    Do-Uninstall
}

function Install-FromStagedDir([string]$SourceDir) {
    $existingCli = Join-Path $BinDir "qs-vpets.ps1"
    if (Test-Path -LiteralPath $existingCli) {
        try { & $existingCli stop | Out-Null } catch {}
    } else {
        $existingExe = Join-Path $InstallDir "Pokemon Sanctuary.exe"
        if (Test-Path -LiteralPath $existingExe) {
            try { & $existingExe --ipc quit | Out-Null } catch {}
            Start-Sleep -Milliseconds 600
        }
    }
    Get-Process -Name "Pokemon Sanctuary" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 250

    $parentDir = Split-Path -Parent $InstallDir
    if (-not (Test-Path -LiteralPath $parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }
    if (Test-Path -LiteralPath $InstallDir) {
        Start-Sleep -Milliseconds 300
        Remove-Item -LiteralPath $InstallDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Copy-Item -Path (Join-Path $SourceDir "*") -Destination $InstallDir -Recurse -Force

    $exePath = Join-Path $InstallDir "Pokemon Sanctuary.exe"
    if (-not (Test-Path -LiteralPath $exePath)) {
        Fail "installation missing Pokemon Sanctuary.exe"
    }

    New-StartMenuShortcut $exePath
    Add-UserPathEntry $BinDir

    if ($EnableAutostart) {
        $cli = Join-Path $BinDir "qs-vpets.ps1"
        if (Test-Path -LiteralPath $cli) {
            $env:QS_VPETS_WIN_BIN = $exePath
            try { & $cli autostart enable | Out-Null } catch {}
        }
    }

    Log "Installed Pokemon Sanctuary for Windows into $InstallDir"
    Write-Host "  App: $exePath"
    Write-Host "  CLI: $BinDir\qs-vpets.cmd open"
}

function Try-InstallPortable {
    $archive = "qs-vpets-windows-x86_64.zip"
    $url = if ($env:QS_VPETS_PORTABLE_URL) {
        $env:QS_VPETS_PORTABLE_URL
    } else {
        "https://github.com/$Repo/releases/latest/download/$archive"
    }

    $tmpWork = Join-Path ([System.IO.Path]::GetTempPath()) ("qs-vpets-install-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $tmpWork -Force | Out-Null
    try {
        $zipPath = Join-Path $tmpWork $archive
        $isLocalSource = $false
        $localSrcPath = ""
        if ($url -match '^file:///') {
            $localSrcPath = ($url -replace '^file:///', '') -replace '/', '\'
            $isLocalSource = $true
        } elseif (Test-Path -LiteralPath $url) {
            $localSrcPath = $url
            $isLocalSource = $true
        }

        if ($isLocalSource) {
            if (-not (Test-Path -LiteralPath $localSrcPath)) {
                return $false
            }
            Log "Using local Windows bundle ($localSrcPath)..."
            Copy-Item -LiteralPath $localSrcPath -Destination $zipPath -Force
            $localSha = "$localSrcPath.sha256"
            if (Test-Path -LiteralPath $localSha) {
                $expected = ((Get-Content -LiteralPath $localSha -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
                $actual = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
                if ($expected -and $expected -ne $actual) {
                    Fail "SHA-256 checksum mismatch for $archive"
                }
            }
        } else {
            Log "Downloading Windows bundle ($archive)..."
            try {
                Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
            } catch {
                return $false
            }

            $shaPath = Join-Path $tmpWork "$archive.sha256"
            try {
                Invoke-WebRequest -Uri "$url.sha256" -OutFile $shaPath -UseBasicParsing
                $expected = ((Get-Content -LiteralPath $shaPath -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
                $actual = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
                if ($expected -and $expected -ne $actual) {
                    Fail "SHA-256 checksum mismatch for $archive"
                }
            } catch {
                # Continue if checksum sidecar is unavailable
            }
        }

        $extractDir = Join-Path $tmpWork "extract"
        Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force
        $bundleRoot = Join-Path $extractDir "qs-vpets-windows-x86_64"
        if (-not (Test-Path -LiteralPath $bundleRoot)) {
            $bundleRoot = $extractDir
        }
        Install-FromStagedDir $bundleRoot
        return $true
    } finally {
        Remove-Item -LiteralPath $tmpWork -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Install-FromSource {
    if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) {
        Fail "'cmake' is required to build from source on Windows (install CMake + Visual Studio Build Tools + Qt6)"
    }

    $tmpWork = Join-Path ([System.IO.Path]::GetTempPath()) ("qs-vpets-build-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $tmpWork -Force | Out-Null
    try {
        $checkoutDir = ""
        if ($PSScriptRoot -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot "windows\CMakeLists.txt"))) {
            $checkoutDir = $PSScriptRoot
        } else {
            Log "Fetching qs-vpets source ($Repo@$Branch)..."
            if (Get-Command git -ErrorAction SilentlyContinue) {
                $srcDir = Join-Path $tmpWork "src"
                & git clone --depth 1 --branch $Branch "https://github.com/$Repo.git" $srcDir | Out-Null
                $checkoutDir = $srcDir
            } else {
                $tarZip = Join-Path $tmpWork "src.zip"
                Invoke-WebRequest -Uri "https://github.com/$Repo/archive/refs/heads/$Branch.zip" -OutFile $tarZip -UseBasicParsing
                Expand-Archive -LiteralPath $tarZip -DestinationPath (Join-Path $tmpWork "src") -Force
                $checkoutDir = (Get-ChildItem -LiteralPath (Join-Path $tmpWork "src") -Directory | Select-Object -First 1).FullName
            }
        }

        $buildDir = Join-Path $tmpWork "build"
        $cmakeArgs = @("-S", (Join-Path $checkoutDir "windows"), "-B", $buildDir, "-DCMAKE_BUILD_TYPE=Release")
        if ($env:Qt6_DIR) {
            $cmakeArgs += "-DCMAKE_PREFIX_PATH=$env:Qt6_DIR"
        } elseif ($env:QT_ROOT_DIR) {
            $cmakeArgs += "-DCMAKE_PREFIX_PATH=$env:QT_ROOT_DIR"
        }

        Log "Building Pokemon Sanctuary.exe for Windows..."
        & cmake @cmakeArgs
        if ($LASTEXITCODE -ne 0) { Fail "cmake configure failed" }
        & cmake --build $buildDir --config Release --parallel
        if ($LASTEXITCODE -ne 0) { Fail "cmake build failed" }

        $stageDir = Join-Path $tmpWork "stage"
        New-Item -ItemType Directory -Path (Join-Path $stageDir "bin") -Force | Out-Null
        $exeCand = @(
            (Join-Path $buildDir "Release\Pokemon Sanctuary.exe"),
            (Join-Path $buildDir "Pokemon Sanctuary.exe")
        ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
        if (-not $exeCand) { Fail "built Pokemon Sanctuary.exe not found" }

        $exeParent = Split-Path -Parent $exeCand
        Copy-Item -LiteralPath $exeCand -Destination $stageDir -Force
        Copy-Item -Path (Join-Path $exeParent "qml") -Destination $stageDir -Recurse -Force
        Copy-Item -LiteralPath (Join-Path $checkoutDir "scripts\qs-vpets.ps1") -Destination (Join-Path $stageDir "bin\qs-vpets.ps1") -Force
        Copy-Item -LiteralPath (Join-Path $checkoutDir "scripts\qs-vpets.cmd") -Destination (Join-Path $stageDir "bin\qs-vpets.cmd") -Force
        if (Test-Path -LiteralPath (Join-Path $checkoutDir "VERSION")) {
            Copy-Item -LiteralPath (Join-Path $checkoutDir "VERSION") -Destination (Join-Path $stageDir "VERSION") -Force
        }

        $windeploy = Get-Command windeployqt -ErrorAction SilentlyContinue
        if ($windeploy) {
            Log "Bundling Qt6 runtime with windeployqt..."
            & $windeploy.Source --release --no-translations --qmldir (Join-Path $stageDir "qml") (Join-Path $stageDir "Pokemon Sanctuary.exe")
        }

        Install-FromStagedDir $stageDir
    } finally {
        Remove-Item -LiteralPath $tmpWork -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if ($Native) {
    Install-FromSource
    exit 0
}

if ($Portable) {
    if (-not (Try-InstallPortable)) {
        Fail "failed to download Windows release bundle from https://github.com/$Repo/releases"
    }
    exit 0
}

if (Try-InstallPortable) {
    exit 0
}

Log "No prebuilt Windows release found; building from source..."
Install-FromSource
