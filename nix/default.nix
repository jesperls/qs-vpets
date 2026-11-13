{
  lib,
  buildEnv,
  stdenvNoCC,
  writeShellApplication,
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
      bash -n nix/cli.sh

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
      mkdir -p "$out/share/qs-vpets"
      cp shell.qml "$out/share/qs-vpets/"
      cp -r config services components assets "$out/share/qs-vpets/"
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
writeShellApplication {
  name = "qs-vpets";
  runtimeInputs = [ ]; # Prepend below so session hyprctl stays reachable on PATH.

  text = ''
    export PATH="${lib.makeBinPath runtimeInputs}''${PATH:+:$PATH}"
    export QML2_IMPORT_PATH="${qmlEnv}/lib/qt-6/qml''${QML2_IMPORT_PATH:+:$QML2_IMPORT_PATH}"
    export QML_IMPORT_PATH="$QML2_IMPORT_PATH"
    export QT_PLUGIN_PATH="${qmlEnv}/lib/qt-6/plugins''${QT_PLUGIN_PATH:+:$QT_PLUGIN_PATH}"

    shellRoot="''${QS_VPETS_SHELL_DIR:-${shellSrc}/share/qs-vpets}"
    version=${lib.escapeShellArg version}
  ''
  + builtins.readFile ./cli.sh;

  passthru = {
    inherit runtimeInputs qmlEnv shellSrc;
  };

  meta = {
    description = "Interactive desktop virtual pets with emergent personalities for Hyprland/Wayland";
    license = lib.licenses.mit;
    mainProgram = "qs-vpets";
    platforms = lib.platforms.linux;
  };
}
