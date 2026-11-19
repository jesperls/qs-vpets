#!/usr/bin/env bash
set -euo pipefail

selfPath="$0"
if command -v python3 >/dev/null 2>&1; then
	selfPath=$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$0")
fi
scriptDir=$(cd "$(dirname "$selfPath")" && pwd)

if [ -n "${QS_VPETS_VERSION:-}" ]; then
	version="$QS_VPETS_VERSION"
elif [ -f "$scriptDir/../VERSION" ]; then
	version=$(tr -d '[:space:]' <"$scriptDir/../VERSION")
else
	version="0.10.0"
fi
plistId="io.github.jesperls.qs-vpets"

die() {
	echo "qs-vpets: $*" >&2
	exit 1
}

findAppBin() {
	if [ -n "${QS_VPETS_MACOS_BIN:-}" ] && [ -x "${QS_VPETS_MACOS_BIN}" ]; then
		printf '%s' "$QS_VPETS_MACOS_BIN"
		return 0
	fi
	local cands=(
		"$scriptDir/../Applications/Pokemon Sanctuary.app/Contents/MacOS/Pokemon Sanctuary"
		"$scriptDir/../Applications/Pokémon Sanctuary.app/Contents/MacOS/Pokemon Sanctuary"
		"$scriptDir/../Contents/MacOS/Pokemon Sanctuary"
		"$HOME/Applications/Pokemon Sanctuary.app/Contents/MacOS/Pokemon Sanctuary"
		"$HOME/Applications/Pokémon Sanctuary.app/Contents/MacOS/Pokemon Sanctuary"
		"/Applications/Pokemon Sanctuary.app/Contents/MacOS/Pokemon Sanctuary"
		"/Applications/Pokémon Sanctuary.app/Contents/MacOS/Pokemon Sanctuary"
	)
	local c
	for c in "${cands[@]}"; do
		if [ -x "$c" ]; then
			printf '%s' "$c"
			return 0
		fi
	done
	die "Pokemon Sanctuary.app binary not found"
}

socketPath() {
	if [ -n "${QS_VPETS_SOCKET:-}" ]; then
		printf '%s' "$QS_VPETS_SOCKET"
	else
		printf '/tmp/qs-vpets-%s.sock' "$(id -u)"
	fi
}

shellPid() {
	local uid pid
	uid=$(id -u)
	pid=$(pgrep -u "$uid" -f "Contents/MacOS/Pokemon Sanctuary" 2>/dev/null | head -n 1 || true)
	if [ -n "$pid" ] && [ "$pid" != "$$" ] && kill -0 "$pid" 2>/dev/null; then
		printf '%s' "$pid"
	fi
}

ipc() {
	local appBin
	appBin=$(findAppBin)
	"$appBin" --ipc "$@"
}

prepareStateDirs() {
	local configDir="${QS_VPETS_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/qs-vpets}"
	local stateDir="${QS_VPETS_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/qs-vpets}"
	mkdir -p "$configDir" "$stateDir"
}

startBackground() {
	local mode="${1:-}"
	local stateDir="${QS_VPETS_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/qs-vpets}"
	local appBin pid i
	prepareStateDirs
	appBin=$(findAppBin)

	local openFlag="0"
	if [ "$mode" = "open" ]; then
		openFlag="1"
	fi

	nohup env QS_VPETS_OPEN_ON_START="$openFlag" "$appBin" --background >"$stateDir/qs-vpets.log" 2>&1 </dev/null &

	for ((i = 0; i < 50; i++)); do
		if [ -S "$(socketPath)" ] && [ -n "$(shellPid)" ]; then
			if [ "$mode" = "open" ]; then
				"$appBin" --ipc open >/dev/null 2>&1 || true
				echo "opened"
			fi
			return 0
		fi
		sleep 0.1
	done

	pid=$(shellPid)
	[ -n "$pid" ] || die "failed to start Pokémon Sanctuary (check $stateDir/qs-vpets.log)"
	if [ "$mode" = "open" ]; then
		"$appBin" --ipc open >/dev/null 2>&1 || true
		echo "opened"
	fi
}

stopOverlay() {
	local pid appBin i uid
	uid=$(id -u)
	pid=$(shellPid)
	if [ -n "$pid" ]; then
		appBin=$(findAppBin)
		"$appBin" --ipc flush >/dev/null 2>&1 || true
		sleep 0.15
	fi
	local plistFile="$HOME/Library/LaunchAgents/${plistId}.plist"
	if [ -f "$plistFile" ] && command -v launchctl >/dev/null 2>&1; then
		launchctl bootout "gui/${uid}/${plistId}" >/dev/null 2>&1 || true
	fi
	pid=$(shellPid)
	if [ -n "$pid" ]; then
		kill "$pid" 2>/dev/null || true
		for ((i = 0; i < 20; i++)); do
			kill -0 "$pid" 2>/dev/null || break
			sleep 0.1
		done
	fi
	rm -f "$(socketPath)"
}

manageAutostart() {
	local action="${1:-status}"
	local plistDir="$HOME/Library/LaunchAgents"
	local plistFile="$plistDir/${plistId}.plist"
	local stateDir="${QS_VPETS_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/qs-vpets}"
	local uid appBin
	uid=$(id -u)

	case "$action" in
	enable | on)
		if [ -L "$plistFile" ] && [[ "$(readlink "$plistFile" 2>/dev/null || true)" == /nix/store/* ]]; then
			die "autostart is managed declaratively by Home Manager (programs.qs-vpets.enable)"
		fi
		appBin=$(findAppBin)
		mkdir -p "$plistDir" "$stateDir"
		cat >"$plistFile" <<-EOF
			<?xml version="1.0" encoding="UTF-8"?>
			<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
			<plist version="1.0">
			<dict>
			    <key>Label</key>
			    <string>${plistId}</string>
			    <key>ProgramArguments</key>
			    <array>
			        <string>${appBin}</string>
			        <string>--background</string>
			    </array>
			    <key>EnvironmentVariables</key>
			    <dict>
			        <key>QS_VPETS_OPEN_ON_START</key>
			        <string>0</string>
			    </dict>
			    <key>RunAtLoad</key>
			    <true/>
			    <key>KeepAlive</key>
			    <dict>
			        <key>SuccessfulExit</key>
			        <false/>
			    </dict>
			    <key>ProcessType</key>
			    <string>Interactive</string>
			    <key>StandardOutPath</key>
			    <string>${stateDir}/qs-vpets.log</string>
			    <key>StandardErrorPath</key>
			    <string>${stateDir}/qs-vpets.log</string>
			</dict>
			</plist>
		EOF
		launchctl bootout "gui/${uid}" "$plistFile" >/dev/null 2>&1 || true
		launchctl bootstrap "gui/${uid}" "$plistFile" >/dev/null 2>&1 || launchctl load -w "$plistFile" >/dev/null 2>&1 || true
		echo "autostart enabled"
		;;
	disable | off)
		if [ -L "$plistFile" ] && [[ "$(readlink "$plistFile" 2>/dev/null || true)" == /nix/store/* ]]; then
			die "autostart is managed declaratively by Home Manager (programs.qs-vpets.enable)"
		fi
		launchctl bootout "gui/${uid}" "$plistFile" >/dev/null 2>&1 || launchctl unload "$plistFile" >/dev/null 2>&1 || true
		rm -f "$plistFile"
		echo "autostart disabled"
		;;
	status)
		local enabled="disabled"
		if [ -f "$plistFile" ]; then
			enabled="enabled (launchd)"
		fi
		local running="stopped"
		local pid
		pid=$(shellPid)
		if [ -n "$pid" ]; then
			running="running (pid $pid)"
		fi
		echo "autostart: $enabled | daemon: $running"
		;;
	*)
		die "usage: qs-vpets autostart [enable|disable|status]"
		;;
	esac
}

usage() {
	cat <<-EOF
		qs-vpets $version - interactive Pokémon companions for macOS & Wayland desktops

		Usage: qs-vpets [COMMAND]

		  open | app                 Launch overlay (if needed) and open Pokémon Sanctuary
		  pen | sanctuary            Toggle the floating Pokémon Sanctuary GUI
		  start                      Start the background overlay if not already running
		  stop | quit                Save companion memories and stop the overlay
		  flush                      Save all companion memories and config immediately
		  reload | restart           Save memories and restart the overlay
		  autostart [enable|disable|status]
		                             Configure macOS launchd login autostart
		  run                        Stop daemon and run in foreground with live logs
		  logs [-f]                  Show (or follow) ~/.local/state/qs-vpets/qs-vpets.log
		  debug                      Print daemon, QWindow visibility, and recent log diagnostics
		  status                     Print live JSON status of roaming & Sanctuary pets
		  toggle                     Hide or show all desktop pets
		  pet [name]                 Stroke/pat a companion (on desktop or in Sanctuary)
		  feed [name]                Give an Oran Berry snack to a companion
		  play [name]                Trigger a playful bout with a companion
		  summon [name]              Call a companion to cursor (or out from Sanctuary)
		  roam <name> <mode>         Set roam mode: auto | always | penned | out | in
		  rename <old> <new>         Rename a companion while preserving memories & bonds
		  evolve <name> [species]    Opt-in evolution when lifestyle milestones are met
		  inspect [name]             Toggle the interactive inspector card
		  notify [app] [urgency]     Signal an external toast notification to companions
		  spawn <species> [name]     Adopt a new companion into the Sanctuary
		  release <name>             Release a companion and remove its state file
		  version                    Print version
	EOF
}

cmd="${1:-run}"
shift || true

case "$cmd" in
run)
	stopOverlay
	prepareStateDirs
	appBin=$(findAppBin)
	exec "$appBin" --background
	;;
logs | log)
	stateDir="${QS_VPETS_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/qs-vpets}"
	logFile="$stateDir/qs-vpets.log"
	if [ ! -f "$logFile" ]; then
		echo "No log file yet at $logFile"
		exit 0
	fi
	if [ "${1:-}" = "-f" ] || [ "${1:-}" = "--follow" ]; then
		exec tail -n 80 -f "$logFile"
	else
		cat "$logFile"
	fi
	;;
debug)
	manageAutostart status
	if [ -n "$(shellPid)" ]; then
		ipc win_debug || true
	fi
	stateDir="${QS_VPETS_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/qs-vpets}"
	if [ -f "$stateDir/qs-vpets.log" ]; then
		echo "--- recent log ($stateDir/qs-vpets.log) ---"
		tail -n 30 "$stateDir/qs-vpets.log"
	fi
	;;
start)
	if [ -n "$(shellPid)" ]; then
		echo "already running"
		exit 0
	fi
	startBackground ""
	echo "started"
	;;
open | app | launch)
	if [ -n "$(shellPid)" ]; then
		if ipc open; then
			exit 0
		fi
	fi
	startBackground "open"
	;;
stop | quit)
	stopOverlay
	echo "stopped"
	;;
flush)
	if [ -n "$(shellPid)" ]; then
		ipc flush
	else
		echo "not running"
	fi
	;;
reload | restart)
	stopOverlay
	startBackground ""
	echo "restarted"
	;;
autostart)
	manageAutostart "${1:-status}"
	;;
pen | sanctuary)
	if [ -n "$(shellPid)" ]; then
		ipc pen
	else
		startBackground "open"
	fi
	;;
status)
	ipc status
	;;
toggle | hide)
	ipc toggle
	;;
pet | pat | stroke)
	ipc pet "${1:-}"
	;;
feed | berry | snack)
	ipc feed "${1:-}"
	;;
play)
	ipc play "${1:-}"
	;;
summon | call | come)
	ipc summon "${1:-}"
	;;
roam | policy)
	[ $# -ge 2 ] || die "usage: qs-vpets roam <name> <auto|always|penned|out|in>"
	ipc roam "$1" "$2"
	;;
rename)
	[ $# -ge 2 ] || die "usage: qs-vpets rename <old-name> <new-name>"
	ipc rename "$1" "$2"
	;;
evolve)
	[ $# -ge 1 ] || die "usage: qs-vpets evolve <name> [target-species]"
	ipc evolve "$1" "${2:-}"
	;;
inspect | card)
	ipc inspect "${1:-}"
	;;
notify | toast)
	ipc notify "${1:-Desktop}" "${2:-normal}"
	;;
spawn | add | adopt)
	[ $# -ge 1 ] || die "usage: qs-vpets spawn <species> [name]"
	ipc spawn "$1" "${2:-}"
	;;
release | remove)
	[ $# -ge 1 ] || die "usage: qs-vpets release <name>"
	ipc release "$1"
	;;
version | --version | -v)
	echo "qs-vpets $version"
	;;
help | --help | -h)
	usage
	;;
*)
	die "unknown command '$cmd' (run 'qs-vpets --help')"
	;;
esac
