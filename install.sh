#!/usr/bin/env bash
set -euo pipefail

repo="${QS_VPETS_REPO:-jesperls/qs-vpets}"
branch="${QS_VPETS_BRANCH:-main}"
prefix="${QS_VPETS_PREFIX:-$HOME/.local}"
binDir="$prefix/bin"
if [ -n "${QS_VPETS_PREFIX:-}" ]; then
	dataDir="${QS_VPETS_DATA_DIR:-$prefix/share}"
else
	dataDir="${QS_VPETS_DATA_DIR:-${XDG_DATA_HOME:-$prefix/share}}"
fi
optDir="${QS_VPETS_OPT_DIR:-$prefix/opt/qs-vpets}"
macAppsDir="${QS_VPETS_MACOS_APPS_DIR:-$HOME/Applications}"
hostKernel="$(uname -s)"

mode="auto"
autostart="1"
action="install"

log() {
	printf '==> %s\n' "$*"
}

warn() {
	printf 'qs-vpets installer: warning: %s\n' "$*" >&2
}

die() {
	printf 'qs-vpets installer: %s\n' "$*" >&2
	exit 1
}

usage() {
	cat <<-EOF
		Pokémon Sanctuary (qs-vpets) installer

		Usage: install.sh [OPTIONS]

		  --portable        Install self-contained portable bundle into ~/.local/opt/qs-vpets (no root)
		  --native          Install lightweight app files into ~/.local/share/qs-vpets using system Quickshell
		  --autostart       Enable login autostart (default)
		  --no-autostart    Skip configuring login autostart
		  --uninstall       Stop pets and remove ~/.local qs-vpets installation
		  -h, --help        Show this help
	EOF
}

while [ $# -gt 0 ]; do
	case "$1" in
	--portable) mode="portable" ;;
	--native) mode="native" ;;
	--autostart) autostart="1" ;;
	--no-autostart) autostart="0" ;;
	--uninstall | uninstall) action="uninstall" ;;
	-h | --help)
		usage
		exit 0
		;;
	*)
		die "unknown option '$1' (see --help)"
		;;
	esac
	shift
done

refreshDesktopCaches() {
	if command -v update-desktop-database >/dev/null 2>&1; then
		update-desktop-database "$dataDir/applications" >/dev/null 2>&1 || true
	fi
	if command -v gtk-update-icon-cache >/dev/null 2>&1; then
		gtk-update-icon-cache -f -t "$dataDir/icons/hicolor" >/dev/null 2>&1 || true
	fi
	if command -v kbuildsycoca6 >/dev/null 2>&1; then
		kbuildsycoca6 >/dev/null 2>&1 || true
	elif command -v kbuildsycoca5 >/dev/null 2>&1; then
		kbuildsycoca5 >/dev/null 2>&1 || true
	fi
}

doUninstall() {
	if [ -x "$binDir/qs-vpets" ]; then
		"$binDir/qs-vpets" stop >/dev/null 2>&1 || true
		"$binDir/qs-vpets" autostart disable >/dev/null 2>&1 || true
	fi
	if [ "$hostKernel" = "Darwin" ]; then
		rm -f "$binDir/qs-vpets"
		rm -rf \
			"$macAppsDir/Pokemon Sanctuary.app" \
			"$macAppsDir/Pokémon Sanctuary.app" \
			"$optDir"
		log "Uninstalled qs-vpets (companion memories kept in ~/.local/state/qs-vpets)."
		exit 0
	fi
	rm -f \
		"$binDir/qs-vpets" \
		"$dataDir/applications/qs-vpets.desktop" \
		"$dataDir/icons/hicolor/scalable/apps/qs-vpets.svg" \
		"$dataDir/metainfo/io.github.jesperls.qs_vpets.metainfo.xml"
	chmod -R u+w "$optDir" 2>/dev/null || true
	rm -rf "$dataDir/qs-vpets" "$optDir"
	refreshDesktopCaches
	log "Uninstalled qs-vpets (companion memories kept in ~/.local/state/qs-vpets)."
	exit 0
}

if [ "$action" = "uninstall" ]; then
	doUninstall
fi

isImmutableOs() {
	if command -v steamos-readonly >/dev/null 2>&1 || command -v rpm-ostree >/dev/null 2>&1 || command -v transactional-update >/dev/null 2>&1; then
		return 0
	fi
	if [ -f /etc/os-release ]; then
		local osId=""
		# shellcheck disable=SC1091
		osId=$(. /etc/os-release && printf '%s' "${ID:-}")
		case "$osId" in
		steamos | bazzite | silverblue | kinoite | aurora | bluefin)
			return 0
			;;
		esac
	fi
	return 1
}

hasQuickshell() {
	command -v qs >/dev/null 2>&1 || command -v quickshell >/dev/null 2>&1
}

isUsernsRestricted() {
	[ -r /proc/sys/kernel/apparmor_restrict_unprivileged_userns ] &&
		[ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)" = "1" ]
}

warnUnsupportedLinuxSession() {
	local desktop="${XDG_CURRENT_DESKTOP:-}"
	local desktopLower
	desktopLower=$(printf '%s' "$desktop" | tr '[:upper:]' '[:lower:]')
	if [[ "$desktopLower" == *"gnome"* ]] &&
		[[ "$desktopLower" != *"hyprland"* ]] &&
		[[ "$desktopLower" != *"sway"* ]] &&
		[[ "$desktopLower" != *"niri"* ]] &&
		[[ "$desktopLower" != *"kde"* ]] &&
		[[ "$desktopLower" != *"cosmic"* ]] &&
		[[ "$desktopLower" != *"river"* ]] &&
		[[ "$desktopLower" != *"wayfire"* ]] &&
		[[ "$desktopLower" != *"labwc"* ]]; then
		warn "GNOME (Mutter) does not support wlr-layer-shell; qs-vpets requires a wlr-layer-shell Wayland compositor (KDE Plasma Wayland, Hyprland, Sway, Niri, COSMIC, River, Wayfire, Labwc)."
	elif [ "${XDG_SESSION_TYPE:-}" = "x11" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
		warn "X11 sessions are not supported; qs-vpets requires a wlr-layer-shell Wayland session."
	fi
}

runSudo() {
	if [ "$(id -u)" -eq 0 ]; then
		"$@"
		return $?
	fi
	if ! command -v sudo >/dev/null 2>&1; then
		warn "'sudo' is required to install system packages"
		return 1
	fi
	if [ -t 0 ] || sudo -n true 2>/dev/null; then
		sudo "$@"
		return $?
	fi
	if [ -r /dev/tty ]; then
		{ sudo "$@"; } </dev/tty
		return $?
	fi
	warn "cannot prompt for sudo password from a non-interactive shell; download install.sh and run it from a terminal"
	return 1
}

detectArchSystem() {
	case "$(uname -m)" in
	x86_64 | amd64) printf 'x86_64-linux' ;;
	aarch64 | arm64) printf 'aarch64-linux' ;;
	*) die "unsupported CPU architecture '$(uname -m)'" ;;
	esac
}

installSystemQuickshell() {
	hasQuickshell && return 0
	isImmutableOs && return 1

	local osId=""
	local osLike=""
	if [ -f /etc/os-release ]; then
		# shellcheck disable=SC1091
		osId=$(. /etc/os-release && printf '%s' "${ID:-}")
		# shellcheck disable=SC1091
		osLike=$(. /etc/os-release && printf '%s' "${ID_LIKE:-}")
	fi

	if command -v pacman >/dev/null 2>&1 || [[ " $osId $osLike " == *" arch "* ]]; then
		log "Installing Quickshell & Qt6 dependencies via pacman..."
		runSudo pacman -S --needed quickshell qt6-declarative qt6-svg qt6-imageformats procps-ng || return 1
		hasQuickshell
		return $?
	fi

	if command -v dnf >/dev/null 2>&1 || [[ " $osId $osLike " == *" fedora "* ]]; then
		log "Enabling COPR errornointernet/quickshell and installing Quickshell..."
		runSudo dnf copr enable -y errornointernet/quickshell || return 1
		runSudo dnf install -y quickshell qt6-qtdeclarative qt6-qtsvg qt6-qtimageformats procps-ng || return 1
		hasQuickshell
		return $?
	fi

	if command -v apt-get >/dev/null 2>&1 && [[ " $osId $osLike " == *" ubuntu "* ]]; then
		log "Adding PPA ppa:avengemedia/danklinux and installing Quickshell..."
		runSudo apt-get update || return 1
		runSudo env DEBIAN_FRONTEND=noninteractive apt-get install -y software-properties-common || return 1
		runSudo add-apt-repository -y ppa:avengemedia/danklinux || return 1
		runSudo apt-get update || return 1
		runSudo env DEBIAN_FRONTEND=noninteractive apt-get install -y quickshell qt6-declarative-dev qml6-module-qtquick qml6-module-qtquick-layouts libqt6svg6 qt6-image-formats-plugins procps || return 1
		hasQuickshell
		return $?
	fi

	return 1
}

tryInstallPortable() {
	local sys archive url tmpWork
	sys=$(detectArchSystem)
	archive="qs-vpets-portable-${sys}.tar.zst"
	url="${QS_VPETS_PORTABLE_URL:-https://github.com/${repo}/releases/latest/download/${archive}}"

	command -v curl >/dev/null 2>&1 || die "'curl' is required to download ${archive}"
	command -v zstd >/dev/null 2>&1 || die "'zstd' is required to extract ${archive}"

	tmpWork=$(mktemp -d)
	trap 'rm -rf "$tmpWork"' RETURN

	log "Downloading portable bundle (${archive})..."
	if ! curl -fL --retry 2 -o "$tmpWork/$archive" "$url"; then
		return 1
	fi

	if curl -fsSL "${url}.sha256" -o "$tmpWork/${archive}.sha256" 2>/dev/null; then
		(cd "$tmpWork" && sha256sum -c "${archive}.sha256" >/dev/null)
	fi

	tar -I zstd -xf "$tmpWork/$archive" -C "$tmpWork"
	local extracted="$tmpWork/qs-vpets-portable-${sys}"
	[ -x "$extracted/install" ] || die "portable archive missing ./install"

	if [ "$autostart" = "1" ]; then
		QS_VPETS_PREFIX="$prefix" QS_VPETS_OPT_DIR="$optDir" "$extracted/install" --autostart
	else
		QS_VPETS_PREFIX="$prefix" QS_VPETS_OPT_DIR="$optDir" "$extracted/install" --no-autostart
	fi
	if isUsernsRestricted && ! command -v bwrap >/dev/null 2>&1; then
		warn "AppArmor restricts unprivileged user namespaces on this host and 'bwrap' is not installed."
		warn "Install bubblewrap so the portable bundle can launch: sudo apt install bubblewrap"
	fi
	return 0
}

installNativeFiles() {
	local checkoutDir=""
	local tmpClone=""
	local scriptSource="${BASH_SOURCE[0]:-}"

	if [ -n "$scriptSource" ] && [ -f "$(dirname "$scriptSource")/shell.qml" ] && [ -f "$(dirname "$scriptSource")/scripts/qs-vpets.sh" ]; then
		checkoutDir=$(cd "$(dirname "$scriptSource")" && pwd)
	else
		tmpClone=$(mktemp -d)
		trap 'rm -rf "$tmpClone"' RETURN
		log "Fetching qs-vpets source (${repo}@${branch})..."
		if command -v git >/dev/null 2>&1; then
			git clone --depth 1 --branch "$branch" "https://github.com/${repo}.git" "$tmpClone/src" >/dev/null
			checkoutDir="$tmpClone/src"
		else
			curl -fsSL "https://github.com/${repo}/archive/refs/heads/${branch}.tar.gz" | tar -xz -C "$tmpClone"
			checkoutDir=$(find "$tmpClone" -maxdepth 1 -mindepth 1 -type d | head -n 1)
		fi
	fi

	if [ -x "$binDir/qs-vpets" ]; then
		"$binDir/qs-vpets" stop >/dev/null 2>&1 || true
	fi

	mkdir -p \
		"$binDir" \
		"$dataDir/qs-vpets" \
		"$dataDir/applications" \
		"$dataDir/icons/hicolor/scalable/apps" \
		"$dataDir/metainfo"

	rm -rf "$dataDir/qs-vpets.new"
	mkdir -p "$dataDir/qs-vpets.new"
	cp -a "$checkoutDir/shell.qml" "$checkoutDir/config" "$checkoutDir/services" "$checkoutDir/components" "$checkoutDir/assets" \
		"$dataDir/qs-vpets.new/"
	if [ -f "$checkoutDir/VERSION" ]; then
		cp -a "$checkoutDir/VERSION" "$dataDir/qs-vpets.new/"
	fi
	rm -rf "$dataDir/qs-vpets"
	mv "$dataDir/qs-vpets.new" "$dataDir/qs-vpets"

	install -m 0755 "$checkoutDir/scripts/qs-vpets.sh" "$binDir/qs-vpets"

	sed \
		-e "s|^Exec=qs-vpets |Exec=$binDir/qs-vpets |" \
		-e "s|^TryExec=qs-vpets$|TryExec=$binDir/qs-vpets|" \
		"$checkoutDir/packaging/desktop/qs-vpets.desktop" >"$dataDir/applications/qs-vpets.desktop"

	install -m 0644 "$checkoutDir/packaging/desktop/qs-vpets.svg" \
		"$dataDir/icons/hicolor/scalable/apps/qs-vpets.svg"
	install -m 0644 "$checkoutDir/packaging/desktop/io.github.jesperls.qs_vpets.metainfo.xml" \
		"$dataDir/metainfo/io.github.jesperls.qs_vpets.metainfo.xml"

	refreshDesktopCaches

	if [ "$autostart" = "1" ]; then
		QS_VPETS_LAUNCHER_BIN="$binDir/qs-vpets" "$binDir/qs-vpets" autostart enable >/dev/null || true
	fi

	log "Installed Pokémon Sanctuary (native mode) into $prefix"
	printf '  Launcher: Pokémon Sanctuary (%s/applications/qs-vpets.desktop)\n' "$dataDir"
	printf '  CLI:      %s/qs-vpets open\n' "$binDir"
}

detectMacArch() {
	case "$(uname -m)" in
	arm64 | aarch64) printf 'arm64' ;;
	x86_64 | amd64) printf 'x86_64' ;;
	*) die "unsupported macOS architecture '$(uname -m)'" ;;
	esac
}

tryInstallMacosBundle() {
	local arch archive url tmpWork extracted
	arch=$(detectMacArch)
	archive="qs-vpets-macos-${arch}.tar.zst"
	url="${QS_VPETS_PORTABLE_URL:-https://github.com/${repo}/releases/latest/download/${archive}}"

	command -v curl >/dev/null 2>&1 || return 1
	command -v zstd >/dev/null 2>&1 || return 1

	tmpWork=$(mktemp -d)
	trap 'rm -rf "$tmpWork"' RETURN

	log "Downloading macOS bundle (${archive})..."
	if ! curl -fL --retry 2 -o "$tmpWork/$archive" "$url"; then
		return 1
	fi

	if curl -fsSL "${url}.sha256" -o "$tmpWork/${archive}.sha256" 2>/dev/null; then
		if command -v shasum >/dev/null 2>&1; then
			(cd "$tmpWork" && shasum -a 256 -c "${archive}.sha256" >/dev/null)
		elif command -v sha256sum >/dev/null 2>&1; then
			(cd "$tmpWork" && sha256sum -c "${archive}.sha256" >/dev/null)
		fi
	fi

	zstd -dc "$tmpWork/$archive" | tar -xf - -C "$tmpWork"
	extracted="$tmpWork/qs-vpets-macos-${arch}"
	[ -x "$extracted/install" ] || die "macOS archive missing ./install"

	if [ "$autostart" = "1" ]; then
		QS_VPETS_PREFIX="$prefix" QS_VPETS_MACOS_APPS_DIR="$macAppsDir" "$extracted/install" --autostart
	else
		QS_VPETS_PREFIX="$prefix" QS_VPETS_MACOS_APPS_DIR="$macAppsDir" "$extracted/install" --no-autostart
	fi
	return 0
}

installMacosFromSource() {
	local checkoutDir=""
	local tmpWork=""
	local scriptSource="${BASH_SOURCE[0]:-}"
	local brewBin=""
	local brewRoot=""
	local qtPrefix=""

	if command -v brew >/dev/null 2>&1; then
		brewBin=$(command -v brew)
	elif [ -x /opt/homebrew/bin/brew ]; then
		brewBin=/opt/homebrew/bin/brew
		export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"
	elif [ -x /usr/local/bin/brew ]; then
		brewBin=/usr/local/bin/brew
		export PATH="/usr/local/bin:/usr/local/sbin:$PATH"
	fi

	if ! command -v cmake >/dev/null 2>&1; then
		if [ -n "$brewBin" ]; then
			log "Installing cmake via Homebrew..."
			"$brewBin" install cmake
		else
			die "'cmake' is required to build on macOS (install Homebrew and run 'brew install cmake qtbase qtdeclarative qtsvg qtimageformats')"
		fi
	fi

	if [ -n "$brewBin" ]; then
		brewRoot=$("$brewBin" --prefix)
		if [ ! -f "$brewRoot/opt/qt/lib/cmake/Qt6Qml/Qt6QmlConfig.cmake" ]; then
			if [ ! -f "$brewRoot/opt/qtbase/lib/cmake/Qt6/Qt6Config.cmake" ] ||
				[ ! -f "$brewRoot/opt/qtdeclarative/lib/cmake/Qt6Qml/Qt6QmlConfig.cmake" ] ||
				[ ! -d "$brewRoot/opt/qtsvg/lib" ] ||
				[ ! -d "$brewRoot/opt/qtimageformats/share" ]; then
				log "Installing Qt6 runtime modules via Homebrew..."
				"$brewBin" install qtbase qtdeclarative qtsvg qtimageformats
			fi
		fi
		local cand
		for cand in \
			"$brewRoot" \
			"$brewRoot/opt/qt" \
			"$brewRoot/opt/qtbase" \
			"$brewRoot/opt/qtdeclarative" \
			"$brewRoot/opt/qtsvg" \
			"$brewRoot/opt/qtimageformats"; do
			if [ -d "$cand" ]; then
				qtPrefix="${qtPrefix:+${qtPrefix};}${cand}"
			fi
		done
	fi

	tmpWork=$(mktemp -d)
	trap 'rm -rf "$tmpWork"' RETURN

	if [ -n "$scriptSource" ] && [ -f "$(dirname "$scriptSource")/macos/CMakeLists.txt" ]; then
		checkoutDir=$(cd "$(dirname "$scriptSource")" && pwd)
	else
		log "Fetching qs-vpets source (${repo}@${branch})..."
		if command -v git >/dev/null 2>&1; then
			git clone --depth 1 --branch "$branch" "https://github.com/${repo}.git" "$tmpWork/src" >/dev/null
			checkoutDir="$tmpWork/src"
		else
			curl -fsSL "https://github.com/${repo}/archive/refs/heads/${branch}.tar.gz" | tar -xz -C "$tmpWork"
			checkoutDir=$(find "$tmpWork" -maxdepth 1 -mindepth 1 -type d | head -n 1)
		fi
	fi

	log "Building Pokemon Sanctuary.app for macOS ($(uname -m))..."
	if [ -n "$qtPrefix" ]; then
		cmake -S "$checkoutDir/macos" -B "$tmpWork/build" \
			-DCMAKE_BUILD_TYPE=Release \
			-DCMAKE_PREFIX_PATH="$qtPrefix" \
			-DQT_ADDITIONAL_PACKAGES_PREFIX_PATH="$qtPrefix" >/dev/null
	else
		cmake -S "$checkoutDir/macos" -B "$tmpWork/build" -DCMAKE_BUILD_TYPE=Release >/dev/null
	fi
	cmake --build "$tmpWork/build" --config Release --parallel

	if [ -x "$binDir/qs-vpets" ]; then
		"$binDir/qs-vpets" stop >/dev/null 2>&1 || true
	fi

	mkdir -p "$macAppsDir" "$binDir"
	rm -rf "$macAppsDir/Pokemon Sanctuary.app" "$macAppsDir/Pokémon Sanctuary.app"
	cp -R "$tmpWork/build/Pokemon Sanctuary.app" "$macAppsDir/Pokemon Sanctuary.app"
	install -m 0755 "$checkoutDir/scripts/qs-vpets-macos.sh" "$binDir/qs-vpets"

	if [ "$autostart" = "1" ]; then
		QS_VPETS_MACOS_BIN="$macAppsDir/Pokemon Sanctuary.app/Contents/MacOS/Pokemon Sanctuary" \
			"$binDir/qs-vpets" autostart enable >/dev/null || true
	fi

	log "Installed Pokémon Sanctuary for macOS"
	printf '  App: %s/Pokemon Sanctuary.app\n' "$macAppsDir"
	printf '  CLI: %s/qs-vpets open\n' "$binDir"
}

if [ "$hostKernel" = "Darwin" ]; then
	if [ "$mode" = "portable" ]; then
		tryInstallMacosBundle || die "failed to download macOS release bundle from https://github.com/${repo}/releases"
		exit 0
	fi
	if [ "$mode" = "native" ]; then
		installMacosFromSource
		exit 0
	fi
	if tryInstallMacosBundle; then
		exit 0
	fi
	installMacosFromSource
	exit 0
fi

warnUnsupportedLinuxSession

if [ "$mode" = "portable" ]; then
	tryInstallPortable || die "failed to download portable release bundle from https://github.com/${repo}/releases"
	exit 0
fi

if [ "$mode" = "native" ]; then
	if ! hasQuickshell; then
		if ! installSystemQuickshell; then
			die "Quickshell ('qs') could not be installed automatically. Install quickshell for your distro manually or run with --portable."
		fi
	fi
	installNativeFiles
	exit 0
fi

# Auto mode: prefer native if Quickshell is already present, portable on SteamOS/immutable distros.
if hasQuickshell; then
	installNativeFiles
	exit 0
fi

if isImmutableOs; then
	log "Detected immutable OS (SteamOS / Atomic): using self-contained user-space portable bundle..."
	tryInstallPortable || die "portable release bundle not yet published at https://github.com/${repo}/releases (or build locally with 'nix build .#portable')"
	exit 0
fi

if tryInstallPortable; then
	exit 0
fi

log "No prebuilt portable release found; falling back to native package installation..."
if ! installSystemQuickshell; then
	die "could not auto-install Quickshell; install Quickshell manually or build portable bundle with 'nix build .#portable'"
fi
installNativeFiles
