{
  lib,
  buildEnv,
  stdenvNoCC,
  shellcheck,
  quickshell,
  qt6,
  bash,
  coreutils,
  nodejs,
  procps,
  systemd,
  version ? "0.2.0",
}:

let
  qmlEnv = buildEnv {
    name = "qs-vpets-qml";
    paths = [
      qt6.qtdeclarative
      qt6.qtimageformats
      qt6.qtsvg
    ];
    pathsToLink = [
      "/lib/qt-6/qml"
      "/lib/qt-6/plugins"
    ];
  };

  shellSrc = stdenvNoCC.mkDerivation {
    pname = "qs-vpets-src";
    inherit version;
    src = lib.cleanSource ./..;

    nativeBuildInputs = [
      bash
      nodejs
      shellcheck
      quickshell
      qt6.qtdeclarative
    ];

    dontConfigure = true;
    dontBuild = true;
    dontWrapQtApps = true;

    doCheck = true;
    checkPhase = ''
      runHook preCheck

      export QML2_IMPORT_PATH="${qmlEnv}/lib/qt-6/qml''${QML2_IMPORT_PATH:+:$QML2_IMPORT_PATH}"
      export QML_IMPORT_PATH="$QML2_IMPORT_PATH"
      export QT_PLUGIN_PATH="${qmlEnv}/lib/qt-6/plugins''${QT_PLUGIN_PATH:+:$QT_PLUGIN_PATH}"

      node tests/test_sprites.js
      node tests/test_cognition.js
      bash -n scripts/qs-vpets.sh
      shellcheck scripts/qs-vpets.sh
      if [ -f install.sh ]; then
        bash -n install.sh
        shellcheck install.sh
      fi

      command -v qmllint >/dev/null || { echo "qmllint not on PATH" >&2; exit 1; }
      find . -name '*.qml' -exec qmllint {} + >qmllint.log 2>&1 || true
      if grep -F '[syntax]' qmllint.log; then
        cat qmllint.log >&2
        echo "qs-vpets: QML syntax errors detected" >&2
        exit 1
      fi
      rm -f qmllint.log

      runHook postCheck
    '';

    installPhase = ''
      runHook preInstall
      mkdir -p "$out/share/qs-vpets" "$out/libexec"
      cp shell.qml "$out/share/qs-vpets/"
      cp -r config services components assets "$out/share/qs-vpets/"
      install -m 0755 scripts/qs-vpets.sh "$out/libexec/qs-vpets"
      runHook postInstall
    '';
  };

  runtimeInputs = [
    quickshell
    coreutils
    procps
    systemd
  ];
in
stdenvNoCC.mkDerivation {
  pname = "qs-vpets";
  inherit version;
  src = lib.cleanSource ./..;

  dontConfigure = true;
  dontBuild = true;
  dontWrapQtApps = true;

  installPhase = ''
    runHook preInstall

    mkdir -p \
      "$out/bin" \
      "$out/share/qs-vpets" \
      "$out/share/applications" \
      "$out/share/icons/hicolor/scalable/apps" \
      "$out/share/metainfo" \
      "$out/lib/systemd/user"

    ln -s "${shellSrc}/share/qs-vpets/"* "$out/share/qs-vpets/"

    cat > "$out/bin/qs-vpets" <<EOF
    #!${bash}/bin/bash
    set -euo pipefail
    export PATH="${lib.makeBinPath runtimeInputs}\''${PATH:+:\$PATH}"
    export QML2_IMPORT_PATH="${qmlEnv}/lib/qt-6/qml\''${QML2_IMPORT_PATH:+:\$QML2_IMPORT_PATH}"
    export QML_IMPORT_PATH="\$QML2_IMPORT_PATH"
    export QT_PLUGIN_PATH="${qmlEnv}/lib/qt-6/plugins\''${QT_PLUGIN_PATH:+:\$QT_PLUGIN_PATH}"
    export QS_VPETS_SHELL_DIR="\''${QS_VPETS_SHELL_DIR:-${shellSrc}/share/qs-vpets}"
    export QS_VPETS_VERSION=${lib.escapeShellArg version}
    export QS_VPETS_LAUNCHER_BIN="\''${QS_VPETS_LAUNCHER_BIN:-$out/bin/qs-vpets}"
    exec "${shellSrc}/libexec/qs-vpets" "\$@"
    EOF
    chmod 0755 "$out/bin/qs-vpets"

    sed \
      -e "s|^Exec=qs-vpets |Exec=$out/bin/qs-vpets |" \
      -e "s|^TryExec=qs-vpets$|TryExec=$out/bin/qs-vpets|" \
      packaging/desktop/qs-vpets.desktop > "$out/share/applications/qs-vpets.desktop"

    install -m 0644 packaging/desktop/qs-vpets.svg \
      "$out/share/icons/hicolor/scalable/apps/qs-vpets.svg"
    install -m 0644 packaging/desktop/io.github.jesperls.qs_vpets.metainfo.xml \
      "$out/share/metainfo/io.github.jesperls.qs_vpets.metainfo.xml"

    sed "s|@BINDIR@|$out/bin|g" packaging/systemd/qs-vpets.service.in \
      > "$out/lib/systemd/user/qs-vpets.service"

    runHook postInstall
  '';

  passthru = {
    inherit runtimeInputs qmlEnv shellSrc;
  };

  meta = {
    description = "Interactive Pokémon desktop companions with emergent personalities for Wayland";
    license = lib.licenses.mit;
    mainProgram = "qs-vpets";
    platforms = lib.platforms.linux;
  };
}
