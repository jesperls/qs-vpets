{
  lib,
  stdenv,
  buildEnv,
  cmake,
  ninja,
  qt6,
  bash,
  nodejs,
  python3,
  shellcheck,
  version ? "0.5.0",
}:

let
  qmlEnv = buildEnv {
    name = "qs-vpets-macos-qml";
    paths = [
      qt6.qtbase
      qt6.qtdeclarative
      qt6.qtimageformats
      qt6.qtsvg
    ];
    pathsToLink = [
      "/lib/qt-6/qml"
      "/lib/qt-6/plugins"
    ];
  };

  runtimeInputs = [
    bash
    python3
  ];
in
stdenv.mkDerivation {
  pname = "qs-vpets";
  inherit version;
  src = lib.cleanSource ./..;

  nativeBuildInputs = [
    cmake
    ninja
    nodejs
    shellcheck
    qt6.qtdeclarative
  ];

  buildInputs = [
    qt6.qtbase
    qt6.qtdeclarative
    qt6.qtimageformats
    qt6.qtsvg
  ];

  dontWrapQtApps = true;

  cmakeDir = "../macos";
  cmakeFlags = [
    "-DQS_VPETS_VERSION=${version}"
  ];

  doCheck = true;
  checkPhase = ''
    runHook preCheck
    (
      cd "$NIX_BUILD_TOP/$sourceRoot"
      node tests/test_sprites.js
      node tests/test_cognition.js
      node tests/test_soak.js
      bash -n scripts/qs-vpets-macos.sh
      bash -n macos/build-icns.sh
      shellcheck scripts/qs-vpets-macos.sh macos/build-icns.sh
    )
    runHook postCheck
  '';

  postInstall = ''
    appBin="$out/Applications/Pokemon Sanctuary.app/Contents/MacOS/Pokemon Sanctuary"
    mv "$appBin" "$appBin.unwrapped"
    cat > "$appBin" <<EOF
    #!${bash}/bin/bash
    set -euo pipefail
    export QML2_IMPORT_PATH="${qmlEnv}/lib/qt-6/qml\''${QML2_IMPORT_PATH:+:\$QML2_IMPORT_PATH}"
    export QML_IMPORT_PATH="\$QML2_IMPORT_PATH"
    export QT_PLUGIN_PATH="${qmlEnv}/lib/qt-6/plugins\''${QT_PLUGIN_PATH:+:\$QT_PLUGIN_PATH}"
    exec "$appBin.unwrapped" "\$@"
    EOF
    chmod 0755 "$appBin"

    rm -f "$out/bin/qs-vpets"
    mkdir -p "$out/libexec" "$out/bin"
    install -m 0755 "$NIX_BUILD_TOP/$sourceRoot/scripts/qs-vpets-macos.sh" "$out/libexec/qs-vpets"

    cat > "$out/bin/qs-vpets" <<EOF
    #!${bash}/bin/bash
    set -euo pipefail
    export PATH="${lib.makeBinPath runtimeInputs}\''${PATH:+:\$PATH}:/usr/bin:/bin"
    export QS_VPETS_VERSION=${lib.escapeShellArg version}
    export QS_VPETS_MACOS_BIN="$out/Applications/Pokemon Sanctuary.app/Contents/MacOS/Pokemon Sanctuary"
    exec "$out/libexec/qs-vpets" "\$@"
    EOF
    chmod 0755 "$out/bin/qs-vpets"
    shellcheck "$out/bin/qs-vpets"
  '';

  passthru = {
    inherit qmlEnv runtimeInputs;
  };

  meta = {
    description = "Interactive pixel-art Pokémon companions for macOS desktops";
    license = lib.licenses.mit;
    mainProgram = "qs-vpets";
    platforms = lib.platforms.darwin;
  };
}
