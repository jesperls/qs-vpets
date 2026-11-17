#!/usr/bin/env bash
set -euo pipefail

selfPath=$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || printf '%s' "${BASH_SOURCE[0]}")
scriptDir=$(cd "$(dirname "$selfPath")" && pwd)

if [ -n "${QS_VPETS_SHELL_DIR:-}" ]; then
	shellRoot="$QS_VPETS_SHELL_DIR"
elif [ -f "$scriptDir/../share/qs-vpets/shell.qml" ]; then
	shellRoot=$(cd "$scriptDir/../share/qs-vpets" && pwd)
elif [ -f "$scriptDir/../shell.qml" ]; then
	shellRoot=$(cd "$scriptDir/.." && pwd)
else
	shellRoot="$scriptDir/../share/qs-vpets"
fi

version="${QS_VPETS_VERSION:-0.5.0}"

die() {
	echo "qs-vpets: $*" >&2
	exit 1
}

findQsBin() {
	if [ -n "${QS_VPETS_QS_BIN:-}" ] && [ -x "${QS_VPETS_QS_BIN}" ]; then
		printf '%s' "$QS_VPETS_QS_BIN"
		return 0
	fi
	if command -v qs >/dev/null 2>&1; then
		command -v qs
		return 0
	fi
	if command -v quickshell >/dev/null 2>&1; then
		command -v quickshell
		return 0
	fi
	die "quickshell ('qs') not found on PATH"
}

hasUserSystemd() {
	command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1
}

serviceUnitExists() {
	hasUserSystemd && systemctl --user cat qs-vpets.service >/dev/null 2>&1
}

shellPid() {
	local pid
	if hasUserSystemd; then
		pid=$(systemctl --user show --property MainPID --value qs-vpets.service 2>/dev/null || true)
		if [ -n "$pid" ] && [ "$pid" != "0" ] && [ "$pid" != "$$" ] && kill -0 "$pid" 2>/dev/null; then
			printf '%s' "$pid"
			return 0
		fi
	fi
	local uid
	uid=$(id -u)
	pid=$(pgrep -u "$uid" -f "(quickshell|(^|/)qs)( .*)? -p .*qs-vpets" 2>/dev/null | head -n 1 || true)
	if [ -z "$pid" ]; then
		local escapedRoot
		escapedRoot=$(printf '%s' "$shellRoot" | sed 's/[][\\.^$*+?(){}|]/\\&/g')
		pid=$(pgrep -u "$uid" -f "(quickshell|(^|/)qs)( .*)? -p ${escapedRoot}" 2>/dev/null | head -n 1 || true)
	fi
	if [ -n "$pid" ] && [ "$pid" != "$$" ] && kill -0 "$pid" 2>/dev/null; then
		printf '%s' "$pid"
	fi
}

ipc() {
	local pid qsBin
	pid=$(shellPid)
	[ -n "$pid" ] || die "not running (start with 'qs-vpets open' or 'qs-vpets start')"
	qsBin=$(findQsBin)
	"$qsBin" ipc --pid "$pid" call vpets "$@"
}

prepareStateDirs() {
	local configDir="${QS_VPETS_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/qs-vpets}"
	local stateDir="${QS_VPETS_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/qs-vpets}"
	mkdir -p "$configDir" "$stateDir"
}

startBackground() {
	local mode="${1:-}"
	local stateDir="${QS_VPETS_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/qs-vpets}"
	local qsBin pid i
	[ -n "${WAYLAND_DISPLAY:-}" ] || die "WAYLAND_DISPLAY is not set (qs-vpets requires a Wayland session)"
	prepareStateDirs
	qsBin=$(findQsBin)

	if serviceUnitExists; then
		systemctl --user import-environment WAYLAND_DISPLAY XDG_CURRENT_DESKTOP HYPRLAND_INSTANCE_SIGNATURE SWAYSOCK NIRI_SOCKET 2>/dev/null || true
		systemctl --user start qs-vpets.service
	else
		local openFlag="0"
		if [ "$mode" = "open" ]; then
			openFlag="1"
		fi
		nohup env QS_VPETS_OPEN_ON_START="$openFlag" "${QS_VPETS_LAUNCHER_BIN:-$selfPath}" run >"$stateDir/qs-vpets.log" 2>&1 </dev/null &
	fi

	for ((i = 0; i < 50; i++)); do
		pid=$(shellPid)
		if [ -n "$pid" ]; then
			if [ "$mode" = "open" ]; then
				if "$qsBin" ipc --pid "$pid" call vpets open >/dev/null 2>&1; then
					echo "opened"
					return 0
				fi
			else
				return 0
			fi
		fi
		sleep 0.1
	done

	pid=$(shellPid)
	[ -n "$pid" ] || die "failed to start background overlay (check $stateDir/qs-vpets.log)"
	if [ "$mode" = "open" ]; then
		"$qsBin" ipc --pid "$pid" call vpets open >/dev/null 2>&1 || true
		echo "opened"
	fi
}

stopOverlay() {
	local pid qsBin i
	pid=$(shellPid)
	if [ -n "$pid" ]; then
		qsBin=$(findQsBin)
		"$qsBin" ipc --pid "$pid" call vpets flush >/dev/null 2>&1 || true
		sleep 0.15
	fi
	if hasUserSystemd && systemctl --user is-active --quiet qs-vpets.service; then
		systemctl --user stop qs-vpets.service
	fi
	pid=$(shellPid)
	if [ -n "$pid" ]; then
		kill "$pid" 2>/dev/null || true
		for ((i = 0; i < 20; i++)); do
			kill -0 "$pid" 2>/dev/null || break
			sleep 0.1
		done
	fi
}

manageAutostart() {
	local action="${1:-status}"
	local cfgBase="${XDG_CONFIG_HOME:-$HOME/.config}"
	local unitFile="$cfgBase/systemd/user/qs-vpets.service"
	local xdgFile="$cfgBase/autostart/qs-vpets-autostart.desktop"
	local launcherBin="${QS_VPETS_LAUNCHER_BIN:-}"
	if [ -z "$launcherBin" ]; then
		if command -v qs-vpets >/dev/null 2>&1; then
			launcherBin=$(command -v qs-vpets)
		else
			launcherBin="$selfPath"
		fi
	fi

	case "$action" in
	enable | on)
		if [ -L "$unitFile" ] && [[ "$(readlink -f "$unitFile" 2>/dev/null || true)" == /nix/store/* ]]; then
			die "autostart is managed declaratively by Home Manager (programs.qs-vpets.systemd.enable)"
		fi
		if hasUserSystemd; then
			mkdir -p "$(dirname "$unitFile")"
			cat >"$unitFile" <<-EOF
				[Unit]
				Description=Pokémon Sanctuary desktop companions
				After=graphical-session.target pipewire.service
				PartOf=graphical-session.target
				ConditionEnvironment=WAYLAND_DISPLAY

				[Service]
				Type=simple
				ExecStart=$launcherBin run
				ExecStop=$launcherBin flush
				Restart=on-failure
				RestartSec=3

				[Install]
				WantedBy=graphical-session.target
			EOF
			systemctl --user daemon-reload
			systemctl --user enable qs-vpets.service >/dev/null
		fi
		mkdir -p "$(dirname "$xdgFile")"
		cat >"$xdgFile" <<-EOF
			[Desktop Entry]
			Type=Application
			Name=Pokémon Sanctuary (Autostart)
			Comment=Start Pokémon Sanctuary desktop companions on Wayland login
			Exec=$launcherBin start
			Icon=qs-vpets
			Terminal=false
			NoDisplay=true
			X-GNOME-Autostart-enabled=true
		EOF
		if [ -n "${WAYLAND_DISPLAY:-}" ] && [ -z "$(shellPid)" ]; then
			startBackground ""
		fi
		echo "autostart enabled"
		;;
	disable | off)
		if [ -L "$unitFile" ] && [[ "$(readlink -f "$unitFile" 2>/dev/null || true)" == /nix/store/* ]]; then
			die "autostart is managed declaratively by Home Manager (programs.qs-vpets.systemd.enable)"
		fi
		if hasUserSystemd; then
			systemctl --user disable qs-vpets.service >/dev/null 2>&1 || true
		fi
		rm -f "$unitFile" "$xdgFile"
		if hasUserSystemd; then
			systemctl --user daemon-reload >/dev/null 2>&1 || true
		fi
		echo "autostart disabled"
		;;
	status)
		local enabled="disabled"
		if hasUserSystemd && systemctl --user is-enabled --quiet qs-vpets.service 2>/dev/null; then
			enabled="enabled (systemd)"
		elif [ -f "$xdgFile" ]; then
			enabled="enabled (xdg-autostart)"
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
		qs-vpets $version - interactive Pokémon companions for Wayland desktops

		Usage: qs-vpets [COMMAND]

		  open | app                 Launch overlay (if needed) and open Pokémon Sanctuary
		  pen | sanctuary            Toggle the floating Pokémon Sanctuary GUI
		  start                      Start the background overlay if not already running
		  stop | quit                Save companion memories and stop the overlay
		  flush                      Save all companion memories and config immediately
		  reload | restart           Save memories and restart the overlay
		  autostart [enable|disable|status]
		                             Configure login autostart for Wayland sessions
		  run                        Run overlay in foreground (systemd ExecStart entrypoint)
		  dev [dir]                  Run directly from a local checkout with debug logging
		  status                     Print live JSON status of roaming & Sanctuary pets
		  toggle                     Hide or show all desktop pets
		  pet [name]                 Stroke/pat a companion (on desktop or in Sanctuary)
		  feed [name]                Give a berry snack to a companion
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
	existingPid=$(shellPid)
	if [ -n "$existingPid" ]; then
		die "already running (pid $existingPid); use 'qs-vpets open' or 'qs-vpets reload'"
	fi
	[ -f "$shellRoot/shell.qml" ] || die "shell.qml not found in $shellRoot"
	prepareStateDirs
	qsBin=$(findQsBin)
	exec "$qsBin" -p "$shellRoot"
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
	existingPid=$(shellPid)
	if [ -n "$existingPid" ]; then
		qsBin=$(findQsBin)
		if "$qsBin" ipc --pid "$existingPid" call vpets open; then
			exit 0
		fi
	fi
	startBackground "open"
	;;
pen | sanctuary | gui)
	existingPid=$(shellPid)
	if [ -n "$existingPid" ]; then
		ipc pen
	else
		startBackground "open"
	fi
	;;
stop | quit)
	stopOverlay
	echo "stopped"
	;;
flush)
	existingPid=$(shellPid)
	if [ -n "$existingPid" ]; then
		qsBin=$(findQsBin)
		"$qsBin" ipc --pid "$existingPid" call vpets flush >/dev/null 2>&1 || true
		sleep 0.15
	fi
	;;
reload | restart)
	existingPid=$(shellPid)
	if [ -n "$existingPid" ]; then
		qsBin=$(findQsBin)
		"$qsBin" ipc --pid "$existingPid" call vpets flush >/dev/null 2>&1 || true
		sleep 0.15
	fi
	if serviceUnitExists; then
		exec systemctl --user restart qs-vpets.service
	fi
	stopOverlay
	startBackground ""
	echo "restarted"
	;;
autostart)
	manageAutostart "${1:-status}"
	;;
dev)
	targetDir="${1:-$PWD}"
	[ -f "$targetDir/shell.qml" ] || die "run from a qs-vpets checkout or pass its directory"
	prepareStateDirs
	export QS_DEBUG=1
	qsBin=$(findQsBin)
	exec "$qsBin" -p "$targetDir"
	;;
status)
	ipc status
	;;
toggle)
	ipc toggle
	;;
pet)
	ipc pet "${1:-}"
	;;
feed)
	ipc feed "${1:-}"
	;;
play)
	ipc play "${1:-}"
	;;
summon)
	ipc summon "${1:-}"
	;;
roam)
	[ $# -ge 2 ] || die "usage: qs-vpets roam <name> <auto|always|penned|out|in>"
	ipc roam "$1" "$2"
	;;
rename)
	[ $# -ge 2 ] || die "usage: qs-vpets rename <old-name> <new-name>"
	ipc rename "$1" "$2"
	;;
evolve)
	[ $# -ge 1 ] || die "usage: qs-vpets evolve <name> [species]"
	ipc evolve "$1" "${2:-}"
	;;
inspect)
	ipc inspect "${1:-}"
	;;
notify)
	existingPid=$(shellPid)
	if [ -n "$existingPid" ]; then
		ipc notify "${1:-Desktop}" "${2:-normal}"
	fi
	;;
spawn)
	[ $# -ge 1 ] || die "usage: qs-vpets spawn <species> [name]"
	ipc spawn "$1" "${2:-}"
	;;
release)
	[ $# -ge 1 ] || die "usage: qs-vpets release <name>"
	ipc release "$1"
	;;
version | --version | -V)
	echo "qs-vpets $version"
	;;
help | --help | -h)
	usage
	;;
*)
	die "unknown command '$cmd' (see 'qs-vpets --help')"
	;;
esac
