{
  lib,
  stdenvNoCC,
  makeWrapper,
  quickshell,
  hyprland,
  coreutils,
}:

stdenvNoCC.mkDerivation {
  pname = "qs-vpets";
  version = "0.1.0";
  src = ./..;

  nativeBuildInputs = [ makeWrapper ];
  dontBuild = true;

  installPhase =
    let
      runtimeDeps = [
        hyprland
        coreutils
      ];
    in
    ''
      runHook preInstall

      mkdir -p $out/share/qs-vpets $out/bin

      cp shell.qml $out/share/qs-vpets/
      cp -r config $out/share/qs-vpets/
      cp -r services $out/share/qs-vpets/
      cp -r components $out/share/qs-vpets/
      cp -r assets $out/share/qs-vpets/

      makeWrapper ${quickshell}/bin/qs $out/bin/qs-vpets \
        --prefix PATH : "${lib.makeBinPath runtimeDeps}" \
        --add-flags "-p $out/share/qs-vpets"

      runHook postInstall
    '';

  meta = {
    description = "Desktop virtual pets for Hyprland/Wayland via Quickshell";
    license = lib.licenses.mit;
    mainProgram = "qs-vpets";
  };
}
