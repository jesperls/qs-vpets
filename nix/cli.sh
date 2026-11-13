die() {
	echo "qs-vpets: $*" >&2
	exit 1
}

shellPid() {
	local pid
	pid=$(systemctl --user show --property MainPID --value qs-vpets.service 2>/dev/null || true)
	if [ -n "$pid" ] && [ "$pid" != "0" ]; then
		printf '%s' "$pid"
		return 0
	fi
	pgrep -f "(quickshell|(^|/)qs) -p .*qs-vpets" | head -n 1 || true
}

ipc() {
	local pid
	pid=$(shellPid)
	[ -n "$pid" ] || die "not running"
	qs ipc --pid "$pid" call vpets "$@"
}

prepareStateDirs() {
	local configDir="${QS_VPETS_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/qs-vpets}"
	local stateDir="${QS_VPETS_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/qs-vpets}"
	mkdir -p "$configDir" "$stateDir"
}

usage() {
	cat <<-EOF
		qs-vpets $version — desktop virtual pets for Hyprland/Wayland

		Usage: qs-vpets [COMMAND]

		  (none) | run               Run the pet overlay (default service entrypoint)
		  dev [dir]                  Run directly from a local checkout
		  pen | sanctuary            Toggle the floating Pokémon Sanctuary / Pet Pen GUI
		  status                     Print live JSON status of roaming & Sanctuary pets
		  toggle                     Hide or show all pets
		  pet [name]                 Stroke/pat a pet (on desktop or in Sanctuary)
		  feed [name]                Give a berry snack to a pet
		  play [name]                Trigger a playful bout with a pet
		  summon [name]              Call a pet to the cursor (or out from Sanctuary)
		  roam <name> <mode>         Set roam mode: auto | always | penned | out | in
		  rename <old> <new>         Rename a companion while preserving memories & bonds
		  inspect [name]             Toggle the interactive inspector card
		  spawn <species> [name]     Adopt a new companion into the Sanctuary
		  reload                     Restart the user service
		  version                    Print version
	EOF
}

cmd="${1:-run}"
shift || true

case "$cmd" in
run)
	prepareStateDirs
	exec qs -p "$shellRoot"
	;;
dev)
	targetDir="${1:-$PWD}"
	[ -f "$targetDir/shell.qml" ] || die "run from a qs-vpets checkout or pass its directory"
	prepareStateDirs
	export QS_DEBUG=1
	exec qs -p "$targetDir"
	;;
pen | sanctuary | gui)
	ipc pen
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
inspect)
	ipc inspect "${1:-}"
	;;
spawn)
	[ $# -ge 1 ] || die "usage: qs-vpets spawn <species> [name]"
	ipc spawn "$1" "${2:-}"
	;;
reload)
	exec systemctl --user restart qs-vpets.service
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
