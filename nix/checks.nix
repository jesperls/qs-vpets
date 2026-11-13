{
  lib,
  pkgs,
  self,
  home-manager,
  qs-vpets,
}:
let
  home =
    extra:
    home-manager.lib.homeManagerConfiguration {
      inherit pkgs;
      modules = [
        self.homeManagerModules.default
        {
          home.username = "vpets-test";
          home.homeDirectory = "/home/vpets-test";
          home.stateVersion = "26.05";
          programs.qs-vpets.enable = true;
        }
        extra
      ];
    };

  plain = (home { }).config;
  custom =
    (home {
      programs.qs-vpets = {
        systemd.target = "hyprland-session.target";
        pets = [
          {
            name = "Nyx";
            sprite = "zorua";
            personality = "emergent";
            scale = 2;
          }
          {
            name = "Moss";
            sprite = "grovyle";
            personality = "curious";
            scale = 2;
          }
        ];
        behavior = {
          walkSpeed = 75;
          showEmotes = true;
          enablePerching = true;
        };
      };
    }).config;
  disabled = (home { programs.qs-vpets.enable = lib.mkForce false; }).config;
  manual = (home { programs.qs-vpets.systemd.enable = false; }).config;
  valid = c: builtins.all (entry: entry.assertion) c.assertions;
in
{
  package = qs-vpets;

  cli = pkgs.runCommand "qs-vpets-cli-check" { } ''
    ${lib.getExe qs-vpets} --version | grep -F "qs-vpets"
    ${lib.getExe qs-vpets} --help | grep -F "spawn <species>"
    ${lib.getExe qs-vpets} --help | grep -F "pen | sanctuary"
    if ${lib.getExe qs-vpets} dev /missing-vpets-dir >dev.log 2>&1; then
      echo "dev accepted missing checkout" >&2
      exit 1
    fi
    grep -F "run from a qs-vpets checkout" dev.log
    touch "$out"
  '';

  home-manager =
    assert valid plain && valid custom && valid disabled && valid manual;
    assert plain.systemd.user.services.qs-vpets.Service.ExecStartPre == [ ];
    assert builtins.length custom.systemd.user.services.qs-vpets.Service.ExecStartPre == 1;
    assert custom.systemd.user.services.qs-vpets.Unit.After == [ "hyprland-session.target" ];
    assert !(disabled.systemd.user.services ? qs-vpets);
    assert !(manual.systemd.user.services ? qs-vpets);
    pkgs.runCommand "qs-vpets-hm-check" { } ''
      export HOME="$TMPDIR/home"
      export QS_VPETS_CONFIG_DIR="$HOME/.config/qs-vpets"
      mkdir -p "$QS_VPETS_CONFIG_DIR"
      echo '{"pets":[{"name":"Old","sprite":"absol"}],"behavior":{"idleTimeout":420,"walkSpeed":90}}' \
        > "$QS_VPETS_CONFIG_DIR/config.json"
      ${builtins.head custom.systemd.user.services.qs-vpets.Service.ExecStartPre}
      ${pkgs.python3}/bin/python3 - "$HOME/.config/qs-vpets/config.json" <<'PY'
      import json, sys
      with open(sys.argv[1]) as f:
          data = json.load(f)
      assert len(data["pets"]) == 2
      assert data["pets"][0]["name"] == "Nyx"
      assert data["behavior"]["idleTimeout"] == 420
      assert data["behavior"]["walkSpeed"] == 75
      PY
      touch "$out"
    '';
}
