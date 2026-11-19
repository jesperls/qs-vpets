[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Command = "open",
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Rest = @()
)

$ErrorActionPreference = "Stop"

$Version = "0.9.0"
if ($env:QS_VPETS_VERSION) {
    $Version = $env:QS_VPETS_VERSION
} else {
    $verFile = Join-Path (Split-Path -Parent $PSScriptRoot) "VERSION"
    if (Test-Path -LiteralPath $verFile) {
        $Version = (Get-Content -LiteralPath $verFile -Raw).Trim()
    }
}

$RunRegPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$RunRegName = "PokemonSanctuary"

function Fail([string]$Msg) {
    [Console]::Error.WriteLine("qs-vpets: $Msg")
    exit 1
}

function Find-AppBin {
    if ($env:QS_VPETS_WIN_BIN -and (Test-Path -LiteralPath $env:QS_VPETS_WIN_BIN)) {
        return $env:QS_VPETS_WIN_BIN
    }
    $scriptParent = Split-Path -Parent $PSScriptRoot
    $candidates = @(
        (Join-Path $scriptParent "Pokemon Sanctuary.exe"),
        (Join-Path $PSScriptRoot "Pokemon Sanctuary.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\qs-vpets\Pokemon Sanctuary.exe")
    )
    foreach ($c in $candidates) {
        if ($c -and (Test-Path -LiteralPath $c)) {
            return $c
        }
    }
    Fail "Pokemon Sanctuary.exe not found"
}

function Invoke-Ipc {
    param(
        [string]$Method,
        [string[]]$CallArgs = @(),
        [switch]$Quiet
    )
    $bin = Find-AppBin
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $bin
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8

    $allArgs = @("--ipc", $Method) + @($CallArgs)
    $escaped = foreach ($a in $allArgs) {
        if ($a -match '[\s"]') {
            '"' + ($a -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
        } elseif ($a -eq "") {
            '""'
        } else {
            $a
        }
    }
    $psi.Arguments = $escaped -join " "

    $proc = [System.Diagnostics.Process]::Start($psi)
    $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
    $stderrTask = $proc.StandardError.ReadToEndAsync()
    $proc.WaitForExit()
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    $rc = $proc.ExitCode
    $proc.Dispose()

    if ($Quiet) {
        return ($rc -eq 0)
    }
    if ($stdout) {
        Write-Output ($stdout.TrimEnd("`r", "`n"))
    }
    if ($stderr) {
        [Console]::Error.Write($stderr)
    }
    if ($rc -ne 0) {
        exit $rc
    }
}

function Test-IsRunning {
    return (Invoke-Ipc -Method "status" -Quiet)
}

function Start-Background {
    param([string]$Mode = "")
    $bin = Find-AppBin
    $stateDir = if ($env:QS_VPETS_STATE_DIR) { $env:QS_VPETS_STATE_DIR } else { Join-Path $env:LOCALAPPDATA "qs-vpets" }
    if (-not (Test-Path -LiteralPath $stateDir)) {
        New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
    }

    $launchArgs = if ($Mode -eq "open") { @("--open") } else { @("--background") }
    Start-Process -FilePath $bin -ArgumentList $launchArgs | Out-Null

    for ($i = 0; $i -lt 60; $i++) {
        if (Test-IsRunning) {
            if ($Mode -eq "open") {
                $null = Invoke-Ipc -Method "open" -Quiet
                Write-Output "opened"
            }
            return
        }
        Start-Sleep -Milliseconds 120
    }
    Fail "failed to start Pokemon Sanctuary"
}

function Stop-Overlay {
    $null = Invoke-Ipc -Method "flush" -Quiet
    Start-Sleep -Milliseconds 150
    $procs = Get-Process -Name "Pokemon Sanctuary" -ErrorAction SilentlyContinue
    if ($procs) {
        foreach ($p in $procs) {
            try { $p.CloseMainWindow() | Out-Null } catch {}
        }
        Start-Sleep -Milliseconds 300
        $remaining = Get-Process -Name "Pokemon Sanctuary" -ErrorAction SilentlyContinue
        if ($remaining) {
            $remaining | Stop-Process -Force -ErrorAction SilentlyContinue
        }
    }
}

function Manage-Autostart {
    param([string]$Action = "status")
    switch ($Action.ToLowerInvariant()) {
        { $_ -in @("enable", "on") } {
            $bin = Find-AppBin
            if (-not (Test-Path -LiteralPath $RunRegPath)) {
                New-Item -Path $RunRegPath -Force | Out-Null
            }
            Set-ItemProperty -Path $RunRegPath -Name $RunRegName -Value "`"$bin`" --background"
            if (-not (Test-IsRunning)) {
                try { Start-Background -Mode "" } catch {}
            }
            Write-Output "autostart enabled"
        }
        { $_ -in @("disable", "off") } {
            if (Test-Path -LiteralPath $RunRegPath) {
                Remove-ItemProperty -Path $RunRegPath -Name $RunRegName -ErrorAction SilentlyContinue
            }
            Write-Output "autostart disabled"
        }
        "status" {
            $enabled = "disabled"
            try {
                $val = (Get-ItemProperty -Path $RunRegPath -Name $RunRegName -ErrorAction Stop).$RunRegName
                if ($val) { $enabled = "enabled (registry)" }
            } catch {}
            $daemon = if (Test-IsRunning) { "running" } else { "stopped" }
            Write-Output "autostart: $enabled | daemon: $daemon"
        }
        default {
            Fail "usage: qs-vpets autostart [enable|disable|status]"
        }
    }
}

function Show-Usage {
    @"
qs-vpets $Version - interactive Pokemon companions for Windows

Usage: qs-vpets [COMMAND]

  open | app                 Launch overlay (if needed) and open Pokemon Sanctuary
  pen | sanctuary            Toggle the floating Pokemon Sanctuary GUI
  start                      Start the background overlay if not already running
  stop | quit                Save companion memories and stop the overlay
  flush                      Save all companion memories and config immediately
  reload | restart           Save memories and restart the overlay
  autostart [enable|disable|status]
                             Configure Windows login autostart (HKCU Run)
  run                        Run overlay directly
  status                     Print live JSON status of roaming & Sanctuary pets
  toggle                     Hide or show all desktop pets
  pet [name]                 Stroke/pat a companion (on desktop or in Sanctuary)
  feed [name]                Give a berry snack to a companion
  play [name]                Trigger a playful bout with a companion
  summon [name]              Call a companion to cursor (or out from Sanctuary)
  roam <name> <mode>         Set roam mode: auto | always | penned | out | in
  rename <old> <new>         Rename a companion while preserving memories & bonds
  evolve <name> [species]    Opt-in evolution when lifestyle milestones are met
  inspect [name]             Toggle the interactive partner card
  notify [app] [urgency]     Signal an external notification to companions
  spawn <species> [name]     Adopt a new companion into the Sanctuary
  release <name>             Release a companion and remove its state file
  version                    Print version
"@ | Write-Output
}

switch ($Command.ToLowerInvariant()) {
    "run" {
        $bin = Find-AppBin
        & $bin --background
        exit $LASTEXITCODE
    }
    "start" {
        if (Test-IsRunning) {
            Write-Output "already running"
            exit 0
        }
        Start-Background -Mode ""
        Write-Output "started"
    }
    { $_ -in @("open", "app", "launch") } {
        if (Test-IsRunning) {
            Invoke-Ipc -Method "open"
            exit 0
        }
        Start-Background -Mode "open"
    }
    { $_ -in @("pen", "sanctuary", "gui") } {
        if (Test-IsRunning) {
            Invoke-Ipc -Method "pen"
        } else {
            Start-Background -Mode "open"
        }
    }
    { $_ -in @("stop", "quit") } {
        Stop-Overlay
        Write-Output "stopped"
    }
    "flush" {
        if (Test-IsRunning) {
            $null = Invoke-Ipc -Method "flush" -Quiet
            Start-Sleep -Milliseconds 150
        }
    }
    { $_ -in @("reload", "restart") } {
        Stop-Overlay
        Start-Background -Mode ""
        Write-Output "restarted"
    }
    "autostart" {
        $act = if ($Rest.Count -gt 0) { $Rest[0] } else { "status" }
        Manage-Autostart -Action $act
    }
    "status" { Invoke-Ipc -Method "status" }
    "toggle" { Invoke-Ipc -Method "toggle" }
    "pet" { Invoke-Ipc -Method "pet" -CallArgs @(if ($Rest.Count -gt 0) { $Rest[0] }) }
    "feed" { Invoke-Ipc -Method "feed" -CallArgs @(if ($Rest.Count -gt 0) { $Rest[0] }) }
    "play" { Invoke-Ipc -Method "play" -CallArgs @(if ($Rest.Count -gt 0) { $Rest[0] }) }
    "summon" { Invoke-Ipc -Method "summon" -CallArgs @(if ($Rest.Count -gt 0) { $Rest[0] }) }
    "roam" {
        if ($Rest.Count -lt 2) { Fail "usage: qs-vpets roam <name> <auto|always|penned|out|in>" }
        Invoke-Ipc -Method "roam" -CallArgs @($Rest[0], $Rest[1])
    }
    "rename" {
        if ($Rest.Count -lt 2) { Fail "usage: qs-vpets rename <old-name> <new-name>" }
        Invoke-Ipc -Method "rename" -CallArgs @($Rest[0], $Rest[1])
    }
    "evolve" {
        if ($Rest.Count -lt 1) { Fail "usage: qs-vpets evolve <name> [species]" }
        $callArgs = if ($Rest.Count -gt 1) { @($Rest[0], $Rest[1]) } else { @($Rest[0]) }
        Invoke-Ipc -Method "evolve" -CallArgs $callArgs
    }
    "inspect" { Invoke-Ipc -Method "inspect" -CallArgs @(if ($Rest.Count -gt 0) { $Rest[0] }) }
    "notify" {
        if (Test-IsRunning) {
            $appName = if ($Rest.Count -gt 0) { $Rest[0] } else { "Desktop" }
            $urg = if ($Rest.Count -gt 1) { $Rest[1] } else { "normal" }
            Invoke-Ipc -Method "notify" -CallArgs @($appName, $urg)
        }
    }
    "spawn" {
        if ($Rest.Count -lt 1) { Fail "usage: qs-vpets spawn <species> [name]" }
        $callArgs = if ($Rest.Count -gt 1) { @($Rest[0], $Rest[1]) } else { @($Rest[0]) }
        Invoke-Ipc -Method "spawn" -CallArgs $callArgs
    }
    "release" {
        if ($Rest.Count -lt 1) { Fail "usage: qs-vpets release <name>" }
        Invoke-Ipc -Method "release" -CallArgs @($Rest[0])
    }
    { $_ -in @("version", "--version", "-v") } {
        Write-Output "qs-vpets $Version"
    }
    { $_ -in @("help", "--help", "-h") } {
        Show-Usage
    }
    default {
        Fail "unknown command '$Command' (see 'qs-vpets --help')"
    }
}
