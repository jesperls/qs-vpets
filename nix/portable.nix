{
  lib,
  pkgs,
  qs-vpets,
  version ? "0.5.0",
}:

let
  system = pkgs.stdenv.hostPlatform.system;
  archiveBase = "qs-vpets-portable-${system}";

  nsExecSrc = pkgs.writeText "vpets-ns-exec.c" ''
    #define _GNU_SOURCE
    #include <dirent.h>
    #include <errno.h>
    #include <fcntl.h>
    #include <limits.h>
    #include <sched.h>
    #include <stdio.h>
    #include <stdlib.h>
    #include <string.h>
    #include <sys/mount.h>
    #include <sys/stat.h>
    #include <sys/types.h>
    #include <unistd.h>

    static int write_file(const char *path, const char *content) {
        int fd = open(path, O_WRONLY);
        if (fd < 0) return -1;
        size_t len = strlen(content);
        ssize_t n = write(fd, content, len);
        int saved = errno;
        close(fd);
        errno = saved;
        return (n == (ssize_t)len) ? 0 : -1;
    }

    int main(int argc, char **argv) {
        if (argc < 3) {
            fprintf(stderr, "usage: vpets-ns-exec <bundle-root> <target-exe> [args...]\n");
            return 2;
        }

        const char *bundle_arg = argv[1];
        const char *target_exe = argv[2];

        /* Fast path when /nix/store path is already mounted (NixOS or nested call). */
        const char *force_ns = getenv("QS_VPETS_FORCE_NAMESPACE");
        if ((!force_ns || strcmp(force_ns, "1") != 0) && access(target_exe, X_OK) == 0) {
            argv[2] = (char *)target_exe;
            execv(target_exe, &argv[2]);
            perror("vpets-ns-exec: execv");
            return 127;
        }

        char bundle_root[PATH_MAX];
        if (!realpath(bundle_arg, bundle_root)) {
            perror("vpets-ns-exec: realpath(bundle)");
            return 1;
        }

        char bundle_nix[PATH_MAX];
        if (snprintf(bundle_nix, sizeof(bundle_nix), "%s/nix", bundle_root) >= (int)sizeof(bundle_nix)) {
            fprintf(stderr, "vpets-ns-exec: bundle path too long\n");
            return 1;
        }

        char ns_root[PATH_MAX];
        if (snprintf(ns_root, sizeof(ns_root), "%s/.ns-root", bundle_root) >= (int)sizeof(ns_root)) {
            fprintf(stderr, "vpets-ns-exec: ns-root path too long\n");
            return 1;
        }

        struct stat st;
        if (stat(bundle_nix, &st) != 0 || !S_ISDIR(st.st_mode)) {
            fprintf(stderr, "vpets-ns-exec: missing %s\n", bundle_nix);
            return 1;
        }

        char orig_cwd[PATH_MAX];
        if (!getcwd(orig_cwd, sizeof(orig_cwd))) {
            strcpy(orig_cwd, "/");
        }

        uid_t uid = getuid();
        gid_t gid = getgid();

        if (unshare(CLONE_NEWNS | CLONE_NEWUSER) != 0) {
            /* Exit code 77 signals wrapper to try host bubblewrap fallback if restricted by AppArmor. */
            if (errno == EPERM || errno == EACCES || errno == EINVAL) {
                return 77;
            }
            perror("vpets-ns-exec: unshare");
            return 1;
        }

        char map_buf[64];
        snprintf(map_buf, sizeof(map_buf), "%u %u 1\n", (unsigned)uid, (unsigned)uid);
        if (write_file("/proc/self/uid_map", map_buf) != 0) {
            if (errno == EPERM || errno == EACCES || errno == EINVAL) {
                return 77;
            }
            perror("vpets-ns-exec: uid_map");
            return 1;
        }

        (void)write_file("/proc/self/setgroups", "deny\n");
        snprintf(map_buf, sizeof(map_buf), "%u %u 1\n", (unsigned)gid, (unsigned)gid);
        if (write_file("/proc/self/gid_map", map_buf) != 0) {
            if (errno == EPERM || errno == EACCES || errno == EINVAL) {
                return 77;
            }
            perror("vpets-ns-exec: gid_map");
            return 1;
        }

        if (mount("tmpfs", ns_root, "tmpfs", 0, "mode=0755") != 0) {
            if (errno == EPERM || errno == EACCES) {
                return 77;
            }
            perror("vpets-ns-exec: mount tmpfs");
            return 1;
        }

        DIR *dir = opendir("/");
        if (!dir) {
            perror("vpets-ns-exec: opendir /");
            return 1;
        }

        struct dirent *ent;
        while ((ent = readdir(dir)) != NULL) {
            const char *name = ent->d_name;
            if (strcmp(name, ".") == 0 || strcmp(name, "..") == 0 || strcmp(name, "nix") == 0) {
                continue;
            }

            char src[PATH_MAX];
            char dst[PATH_MAX];
            if (snprintf(src, sizeof(src), "/%s", name) >= (int)sizeof(src)) continue;
            if (snprintf(dst, sizeof(dst), "%s/%s", ns_root, name) >= (int)sizeof(dst)) continue;

            struct stat lst;
            if (lstat(src, &lst) != 0) continue;

            if (S_ISLNK(lst.st_mode)) {
                char link_target[PATH_MAX];
                ssize_t r = readlink(src, link_target, sizeof(link_target) - 1);
                if (r >= 0) {
                    link_target[r] = '\0';
                    (void)symlink(link_target, dst);
                }
            } else if (S_ISDIR(lst.st_mode)) {
                if (mkdir(dst, 0755) == 0 || errno == EEXIST) {
                    (void)mount(src, dst, NULL, MS_BIND | MS_REC, NULL);
                }
            } else {
                int fd = open(dst, O_CREAT | O_WRONLY, 0644);
                if (fd >= 0) {
                    close(fd);
                    (void)mount(src, dst, NULL, MS_BIND, NULL);
                }
            }
        }
        closedir(dir);

        char dst_nix[PATH_MAX];
        snprintf(dst_nix, sizeof(dst_nix), "%s/nix", ns_root);
        if (mkdir(dst_nix, 0755) != 0 && errno != EEXIST) {
            perror("vpets-ns-exec: mkdir /nix");
            return 1;
        }
        if (mount(bundle_nix, dst_nix, NULL, MS_BIND | MS_REC, NULL) != 0) {
            perror("vpets-ns-exec: bind /nix");
            return 1;
        }

        if (chroot(ns_root) != 0) {
            perror("vpets-ns-exec: chroot");
            return 1;
        }
        if (chdir(orig_cwd) != 0) {
            (void)chdir("/");
        }

        argv[2] = (char *)target_exe;
        execv(target_exe, &argv[2]);
        perror("vpets-ns-exec: execv target");
        return 127;
    }
  '';

  nsExec = pkgs.pkgsStatic.stdenv.mkDerivation {
    pname = "vpets-ns-exec";
    inherit version;
    dontUnpack = true;
    buildPhase = ''
      $CC -O2 -Wall -Wextra -Werror -static -s -o vpets-ns-exec ${nsExecSrc}
    '';
    installPhase = ''
      install -Dm0755 vpets-ns-exec "$out/bin/vpets-ns-exec"
    '';
  };

  closure = pkgs.closureInfo {
    rootPaths = [
      qs-vpets
      pkgs.mesa
    ];
  };
in
pkgs.runCommand archiveBase
  {
    nativeBuildInputs = [
      pkgs.zstd
      pkgs.gnutar
      pkgs.coreutils
      pkgs.shellcheck
      pkgs.bash
    ];
    passthru = {
      inherit nsExec archiveBase;
    };
  }
  ''
    stage="$TMPDIR/${archiveBase}"
    mkdir -p \
      "$stage/bin" \
      "$stage/nix/store" \
      "$stage/.ns-root" \
      "$stage/share/applications" \
      "$stage/share/icons/hicolor/scalable/apps" \
      "$stage/share/metainfo" \
      "$stage/systemd"

    while IFS= read -r storePath; do
      [ -n "$storePath" ] || continue
      cp -a "$storePath" "$stage/nix/store/"
    done < "${closure}/store-paths"
    chmod -R u+w "$stage/nix/store"

    install -m 0755 "${nsExec}/bin/vpets-ns-exec" "$stage/bin/vpets-ns-exec"

    cat > "$stage/bin/qs-vpets" <<'WRAPPER'
    #!/bin/sh
    set -eu

    self="$0"
    if command -v readlink >/dev/null 2>&1; then
      resolved=$(readlink -f "$self" 2>/dev/null || true)
      if [ -n "$resolved" ]; then
        self="$resolved"
      fi
    fi
    unset CDPATH
    binDir=$(cd -- "$(dirname -- "$self")" && pwd)
    bundleRoot=$(cd -- "$binDir/.." && pwd)
    targetExe="@TARGET_EXE@"
    mesaStore="@MESA_STORE@"

    export QT_QPA_PLATFORM="''${QT_QPA_PLATFORM:-wayland}"
    export QS_VPETS_LAUNCHER_BIN="''${QS_VPETS_LAUNCHER_BIN:-$binDir/qs-vpets}"
    export __EGL_VENDOR_LIBRARY_DIRS="''${__EGL_VENDOR_LIBRARY_DIRS:-/run/opengl-driver/share/glvnd/egl_vendor.d:$mesaStore/share/glvnd/egl_vendor.d:/usr/share/glvnd/egl_vendor.d:/etc/glvnd/egl_vendor.d}"
    export LIBGL_DRIVERS_PATH="''${LIBGL_DRIVERS_PATH:-/run/opengl-driver/lib/dri:$mesaStore/lib/dri}"
    export GBM_BACKENDS_PATH="''${GBM_BACKENDS_PATH:-/run/opengl-driver/lib/gbm:$mesaStore/lib/gbm}"

    if [ -e /proc/driver/nvidia/version ] && [ ! -d /run/opengl-driver ] && [ -z "''${QSG_RHI_BACKEND:-}" ]; then
      export QSG_RHI_BACKEND=software
    fi

    if [ "''${QS_VPETS_FORCE_NAMESPACE:-0}" != "1" ] && [ -x "$targetExe" ]; then
      exec "$targetExe" "$@"
    fi

    set +e
    "$binDir/vpets-ns-exec" "$bundleRoot" "$targetExe" "$@"
    rc=$?
    set -e
    if [ "$rc" -ne 77 ]; then
      exit "$rc"
    fi

    if command -v bwrap >/dev/null 2>&1; then
      # Dynamic root bind for hosts where AppArmor restricts raw unshare (e.g. Ubuntu 24.04).
      exec "$bundleRoot/bin/vpets-bwrap-exec" "$bundleRoot" "$targetExe" "$@"
    fi

    echo "qs-vpets: unprivileged user namespaces are restricted on this host and 'bwrap' is not installed." >&2
    echo "qs-vpets: install 'bubblewrap' (sudo apt install bubblewrap) or use native package mode." >&2
    exit 1
    WRAPPER

    sed -i \
      -e "s|@TARGET_EXE@|${lib.getExe qs-vpets}|g" \
      -e "s|@MESA_STORE@|${pkgs.mesa}|g" \
      "$stage/bin/qs-vpets"
    chmod 0755 "$stage/bin/qs-vpets"

    cat > "$stage/bin/vpets-bwrap-exec" <<'BWRAP'
    #!/usr/bin/env bash
    set -euo pipefail
    bundleRoot="$1"
    targetExe="$2"
    shift 2

    args=(bwrap --unshare-user --uid "$(id -u)" --gid "$(id -g)")
    for entry in /*; do
      name="''${entry#/}"
      [ "$name" = "nix" ] && continue
      if [ -L "$entry" ]; then
        args+=(--symlink "$(readlink "$entry")" "$entry")
      elif [ "$name" = "dev" ]; then
        args+=(--dev-bind /dev /dev)
      elif [ "$name" = "proc" ]; then
        args+=(--proc /proc)
      elif [ -d "$entry" ] || [ -e "$entry" ]; then
        args+=(--bind "$entry" "$entry")
      fi
    done
    args+=(--ro-bind "$bundleRoot/nix" /nix -- "$targetExe" "$@")
    exec "''${args[@]}"
    BWRAP
    chmod 0755 "$stage/bin/vpets-bwrap-exec"

    install -m 0644 "${qs-vpets.src}/packaging/desktop/qs-vpets.desktop" \
      "$stage/share/applications/qs-vpets.desktop"
    install -m 0644 "${qs-vpets.src}/packaging/desktop/qs-vpets.svg" \
      "$stage/share/icons/hicolor/scalable/apps/qs-vpets.svg"
    install -m 0644 "${qs-vpets.src}/packaging/desktop/io.github.jesperls.qs_vpets.metainfo.xml" \
      "$stage/share/metainfo/io.github.jesperls.qs_vpets.metainfo.xml"
    install -m 0644 "${qs-vpets.src}/packaging/systemd/qs-vpets.service.in" \
      "$stage/systemd/qs-vpets.service.in"

    cat > "$stage/install" <<'INSTALLER'
    #!/bin/sh
    set -eu

    unset CDPATH
    srcDir=$(cd -- "$(dirname -- "$0")" && pwd)
    prefix="''${QS_VPETS_PREFIX:-$HOME/.local}"
    optDir="''${QS_VPETS_OPT_DIR:-$prefix/opt/qs-vpets}"
    binDir="$prefix/bin"
    dataDir="''${XDG_DATA_HOME:-$prefix/share}"
    autostart="1"

    for arg in "$@"; do
      case "$arg" in
        --no-autostart) autostart="0" ;;
        --autostart) autostart="1" ;;
        --help|-h)
          echo "Usage: ./install [--autostart | --no-autostart]"
          exit 0
          ;;
        *)
          echo "qs-vpets install: unknown option '$arg'" >&2
          exit 1
          ;;
      esac
    done

    if [ -x "$binDir/qs-vpets" ]; then
      "$binDir/qs-vpets" stop >/dev/null 2>&1 || true
    fi

    mkdir -p "$(dirname "$optDir")" "$binDir" \
      "$dataDir/applications" \
      "$dataDir/icons/hicolor/scalable/apps" \
      "$dataDir/metainfo"

    if [ "$srcDir" != "$optDir" ]; then
      rm -rf "$optDir.new"
      cp -a "$srcDir" "$optDir.new"
      chmod -R u+w "$optDir" 2>/dev/null || true
      rm -rf "$optDir"
      mv "$optDir.new" "$optDir"
    fi

    mkdir -p "$optDir/.ns-root"
    ln -sfn "$optDir/bin/qs-vpets" "$binDir/qs-vpets"

    sed \
      -e "s|^Exec=qs-vpets |Exec=$binDir/qs-vpets |" \
      -e "s|^TryExec=qs-vpets$|TryExec=$binDir/qs-vpets|" \
      "$optDir/share/applications/qs-vpets.desktop" > "$dataDir/applications/qs-vpets.desktop"

    install -m 0644 "$optDir/share/icons/hicolor/scalable/apps/qs-vpets.svg" \
      "$dataDir/icons/hicolor/scalable/apps/qs-vpets.svg"
    install -m 0644 "$optDir/share/metainfo/io.github.jesperls.qs_vpets.metainfo.xml" \
      "$dataDir/metainfo/io.github.jesperls.qs_vpets.metainfo.xml"

    command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$dataDir/applications" >/dev/null 2>&1 || true
    command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -f -t "$dataDir/icons/hicolor" >/dev/null 2>&1 || true
    command -v kbuildsycoca6 >/dev/null 2>&1 && kbuildsycoca6 >/dev/null 2>&1 || true
    command -v kbuildsycoca5 >/dev/null 2>&1 && kbuildsycoca5 >/dev/null 2>&1 || true

    if [ "$autostart" = "1" ]; then
      QS_VPETS_LAUNCHER_BIN="$binDir/qs-vpets" "$binDir/qs-vpets" autostart enable >/dev/null || true
    fi

    echo "Installed Pokémon Sanctuary (qs-vpets) to $optDir"
    echo "  Launcher: Pokémon Sanctuary ($dataDir/applications/qs-vpets.desktop)"
    echo "  CLI:      $binDir/qs-vpets open"
    INSTALLER
    chmod 0755 "$stage/install"

    cat > "$stage/uninstall" <<'UNINSTALLER'
    #!/bin/sh
    set -eu

    prefix="''${QS_VPETS_PREFIX:-$HOME/.local}"
    optDir="''${QS_VPETS_OPT_DIR:-$prefix/opt/qs-vpets}"
    binDir="$prefix/bin"
    dataDir="''${XDG_DATA_HOME:-$prefix/share}"

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
    rm -rf "$optDir"

    command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$dataDir/applications" >/dev/null 2>&1 || true
    command -v kbuildsycoca6 >/dev/null 2>&1 && kbuildsycoca6 >/dev/null 2>&1 || true

    echo "Uninstalled qs-vpets (companion memories preserved in ~/.local/state/qs-vpets)."
    UNINSTALLER
    chmod 0755 "$stage/uninstall"

    shellcheck "$stage/bin/qs-vpets" "$stage/bin/vpets-bwrap-exec" "$stage/install" "$stage/uninstall"

    mkdir -p "$out"
    tar -C "$TMPDIR" --owner=0 --group=0 --numeric-owner \
      -I 'zstd -9 -T0' \
      -cf "$out/${archiveBase}.tar.zst" "${archiveBase}"
    (
      cd "$out"
      sha256sum "${archiveBase}.tar.zst" > "${archiveBase}.tar.zst.sha256"
    )
  ''
