#!/usr/bin/env bash
set -euo pipefail

repo="${QS_VPETS_REPO:-jesperls/qs-vpets}"
branch="${QS_VPETS_BRANCH:-main}"
prefix="${QS_VPETS_PREFIX:-$HOME/.local}"
binDir="$prefix/bin"
dataDir="${XDG_DATA_HOME:-$prefix/share}"
optDir="${QS_VPETS_OPT_DIR:-$prefix/opt/qs-vpets}"

mode="auto"
autostart="1"
action="install"

log() {
	printf '==> %s\n' "$*"
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
		sudo pacman -S --needed quickshell qt6-declarative qt6-svg qt6-imageformats procps-ng
		return 0
	fi

	if command -v dnf >/dev/null 2>&1 || [[ " $osId $osLike " == *" fedora "* ]]; then
		log "Enabling COPR errornointernet/quickshell and installing Quickshell..."
		sudo dnf copr enable -y errornointernet/quickshell
		sudo dnf install -y quickshell qt6-qtdeclarative qt6-qtsvg qt6-qtimageformats procps-ng
		return 0
	fi

	if command -v apt-get >/dev/null 2>&1 && [[ " $osId $osLike " == *" ubuntu "* ]]; then
		log "Adding PPA ppa:avengemedia/danklinux and installing Quickshell..."
		sudo apt-get update
		sudo apt-get install -y software-properties-common
		sudo add-apt-repository -y ppa:avengemedia/danklinux
		sudo apt-get update
		sudo apt-get install -y quickshell qt6-declarative-dev qml6-module-qtquick qml6-module-qtquick-layouts libqt6svg6 qt6-image-formats-plugins procps
		return 0
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

if [ "$mode" = "portable" ]; then
	tryInstallPortable || die "failed to download portable release bundle from https://github.com/${repo}/releases"
	exit 0
fi

if [ "$mode" = "native" ]; then
	if ! hasQuickshell; then
		installSystemQuickshell || die "Quickshell ('qs') is not installed. Install quickshell for your distro or run with --portable."
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
	log "Detected immutable OS (SteamOS / Atomic) — using self-contained user-space portable bundle..."
	tryInstallPortable || die "portable release bundle not yet published at https://github.com/${repo}/releases (or build locally with 'nix build .#portable')"
	exit 0
fi

if tryInstallPortable; then
	exit 0
fi

log "No prebuilt portable release found; falling back to native package installation..."
installSystemQuickshell || die "could not auto-install Quickshell; install Quickshell manually or build portable bundle with 'nix build .#portable'"
installNativeFiles
