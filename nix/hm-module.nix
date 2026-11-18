{ packageFor }:
{
  config,
  pkgs,
  lib,
  ...
}:
let
  cfg = config.programs.qs-vpets;
  configDir = "${config.xdg.configHome}/qs-vpets";
  stateDir = "${config.xdg.stateHome}/qs-vpets";

  speciesList = lib.attrNames (
    lib.filterAttrs (_: kind: kind == "directory") (builtins.readDir ../assets/sprites)
  );

  petSubmodule = lib.types.submodule {
    options = {
      id = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Optional stable companion identifier used for state files.";
      };
      name = lib.mkOption {
        type = lib.types.str;
        description = "Display name for this companion.";
      };
      sprite = lib.mkOption {
        type = lib.types.enum speciesList;
        default = "zorua";
        description = "Bundled PMD Collab species sprite sheet.";
      };
      personality = lib.mkOption {
        type = lib.types.enum [
          "emergent"
          "lazy"
          "energetic"
          "curious"
          "chill"
          "brave"
          "shy"
          "playful"
          "grumpy"
          "nocturnal"
        ];
        default = "emergent";
        description = "Starting temperament seed before lived experience shapes character.";
      };
      scale = lib.mkOption {
        type = lib.types.ints.between 1 5;
        default = 2;
        description = "Integer pixel-art scale multiplier.";
      };
      monitor = lib.mkOption {
        type = lib.types.str;
        default = "";
        description = "Initial monitor name to spawn on, or empty for primary.";
      };
      roamMode = lib.mkOption {
        type = lib.types.enum [
          "auto"
          "always"
          "penned"
        ];
        default = "auto";
        description = "Whether this companion rotates automatically, always roams, or stays in the Sanctuary pen.";
      };
      color = lib.mkOption {
        type = lib.types.str;
        default = "";
        description = "Optional hex accent color override.";
      };
      traits = lib.mkOption {
        type = lib.types.nullOr (lib.types.attrsOf (lib.types.numbers.between 0 1));
        default = null;
        description = "Optional initial trait overrides between 0 and 1.";
      };
      actions = lib.mkOption {
        type = lib.types.attrsOf lib.types.str;
        default = { };
        description = "Optional state-to-PMD animation overrides.";
      };
    };
  };

  cleanPet = pet: lib.filterAttrs (k: v: v != null && !(k == "color" && v == "")) pet;

  behaviorOverrides = lib.filterAttrs (_: v: v != null) {
    inherit (cfg.behavior)
      idleTimeout
      walkSpeed
      showEmotes
      enablePerching
      enableMusicReact
      maxActiveRoaming
      sanctuaryCamp
      ;
  };

  hasDeclarativeConfig = cfg.pets != null || behaviorOverrides != { };

  declarativePayload = pkgs.writeText "qs-vpets-overrides.json" (
    builtins.toJSON (
      (lib.optionalAttrs (cfg.pets != null) { pets = map cleanPet cfg.pets; })
      // (lib.optionalAttrs (behaviorOverrides != { }) { behavior = behaviorOverrides; })
    )
  );

  applyConfig = pkgs.writeShellApplication {
    name = "qs-vpets-apply-config";
    runtimeInputs = [ pkgs.python3 ];
    text = ''
      cfg_dir="''${QS_VPETS_CONFIG_DIR:-${lib.escapeShellArg configDir}}"
      python3 - "$cfg_dir/config.json" ${lib.escapeShellArg declarativePayload} <<'PY'
      import json, os, sys, tempfile

      EVOLUTIONS = {
          "eevee": {"umbreon", "leafeon", "flareon", "jolteon", "glaceon"},
          "riolu": {"lucario"},
          "vulpix": {"ninetales"},
          "charmander": {"charizard"},
      }

      target_path, override_path = sys.argv[1], sys.argv[2]
      os.makedirs(os.path.dirname(target_path), exist_ok=True)
      current = {}
      if os.path.exists(target_path):
          try:
              with open(target_path, "r", encoding="utf-8") as f:
                  loaded = json.load(f)
              if isinstance(loaded, dict):
                  current = loaded
          except Exception:
              current = {}

      with open(override_path, "r", encoding="utf-8") as f:
          overrides = json.load(f)

      if "pets" in overrides:
          prev_by_id = {}
          prev_by_name = {}
          for item in current.get("pets", []) if isinstance(current.get("pets"), list) else []:
              if not isinstance(item, dict):
                  continue
              if isinstance(item.get("id"), str) and item["id"]:
                  prev_by_id[item["id"]] = item
              if isinstance(item.get("name"), str) and item["name"]:
                  prev_by_name[item["name"].strip().lower()] = item

          merged_pets = []
          for decl in overrides["pets"]:
              pet = dict(decl)
              prev = (
                  prev_by_id.get(pet.get("id", ""))
                  if pet.get("id")
                  else prev_by_name.get(str(pet.get("name", "")).strip().lower())
              )
              if isinstance(prev, dict):
                  if not pet.get("id") and isinstance(prev.get("id"), str) and prev["id"]:
                      pet["id"] = prev["id"]
                  prev_sp = prev.get("sprite")
                  decl_sp = pet.get("sprite")
                  if isinstance(prev_sp, str) and prev_sp in EVOLUTIONS.get(decl_sp, set()):
                      pet["sprite"] = prev_sp
              merged_pets.append(pet)
          current["pets"] = merged_pets

      if "behavior" in overrides:
          beh = current.get("behavior")
          if not isinstance(beh, dict):
              beh = {}
          beh.update(overrides["behavior"])
          current["behavior"] = beh

      fd, tmp = tempfile.mkstemp(dir=os.path.dirname(target_path), prefix=".config.", suffix=".json")
      with os.fdopen(fd, "w", encoding="utf-8") as f:
          json.dump(current, f, indent=2)
          f.write("\n")
      os.replace(tmp, target_path)
      PY
    '';
  };
  darwinStartCmd = pkgs.writeShellScript "qs-vpets-launchd-start" ''
    set -euo pipefail
    ${lib.optionalString hasDeclarativeConfig "${lib.getExe applyConfig}"}
    exec ${lib.getExe cfg.package} run
  '';
in
{
  options.programs.qs-vpets = {
    enable = lib.mkEnableOption "qs-vpets desktop virtual pets";

    package = lib.mkOption {
      type = lib.types.package;
      default = packageFor pkgs;
      defaultText = lib.literalExpression "packageFor pkgs";
      description = "qs-vpets package to run.";
    };

    pets = lib.mkOption {
      type = lib.types.nullOr (lib.types.listOf petSubmodule);
      default = null;
      description = "Declarative pet roster synced into config.json on start, or null for a mutable roster.";
    };

    behavior = {
      idleTimeout = lib.mkOption {
        type = lib.types.nullOr (lib.types.ints.between 30 86400);
        default = null;
        description = "Seconds of inactivity before user is marked idle.";
      };
      walkSpeed = lib.mkOption {
        type = lib.types.nullOr (lib.types.numbers.between 30 400);
        default = null;
        description = "Base walking speed in pixels per second.";
      };
      showEmotes = lib.mkOption {
        type = lib.types.nullOr lib.types.bool;
        default = null;
        description = "Show floating emote and dream particles.";
      };
      enablePerching = lib.mkOption {
        type = lib.types.nullOr lib.types.bool;
        default = null;
        description = "Allow pets to hop onto top window titlebar edges.";
      };
      enableMusicReact = lib.mkOption {
        type = lib.types.nullOr lib.types.bool;
        default = null;
        description = "Allow pets to sense and groove to MPRIS media playback.";
      };
      maxActiveRoaming = lib.mkOption {
        type = lib.types.nullOr (lib.types.ints.between 1 10);
        default = null;
        description = "Maximum auto-rotating companions roaming the desktop simultaneously.";
      };
      sanctuaryCamp = lib.mkOption {
        type = lib.types.nullOr (
          lib.types.enum [
            "shore"
            "forest"
            "cliff"
            "spring"
          ]
        );
        default = null;
        description = "Active Pokémon Mystery Dungeon Friend Area clearing in Pokémon Sanctuary.";
      };
    };

    systemd = {
      enable = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Start qs-vpets automatically with the Wayland session.";
      };
      target = lib.mkOption {
        type = lib.types.str;
        default = "graphical-session.target";
        description = "Systemd user target that owns qs-vpets.";
      };
    };
  };

  config = lib.mkIf cfg.enable (
    lib.mkMerge [
      {
        home.packages = [ cfg.package ];
      }
      (lib.mkIf pkgs.stdenv.hostPlatform.isLinux {
        systemd.user.tmpfiles.rules = [
          "d ${configDir} 0755 - - -"
          "d ${stateDir} 0755 - - -"
        ];
      })
      (lib.mkIf (pkgs.stdenv.hostPlatform.isLinux && cfg.systemd.enable) {
        systemd.user.services.qs-vpets = {
          Unit = {
            Description = "Pokémon Sanctuary desktop companions (Quickshell)";
            After = [
              cfg.systemd.target
              "pipewire.service"
            ];
            BindsTo = [ cfg.systemd.target ];
            PartOf = [ cfg.systemd.target ];
            ConditionEnvironment = "WAYLAND_DISPLAY";
          };

          Service = {
            ExecStart = lib.getExe cfg.package;
            ExecStartPre = lib.optional hasDeclarativeConfig (lib.getExe applyConfig);
            ExecStop = "${lib.getExe cfg.package} flush";
            Restart = "on-failure";
            RestartSec = 3;
            Slice = "session.slice";
            Environment = [
              "QS_VPETS_CONFIG_DIR=${configDir}"
              "QS_VPETS_STATE_DIR=${stateDir}"
            ];
          };

          Install.WantedBy = [ cfg.systemd.target ];
        };
      })
      (lib.mkIf (pkgs.stdenv.hostPlatform.isDarwin && cfg.systemd.enable) {
        launchd.agents.qs-vpets = {
          enable = true;
          config = {
            ProgramArguments = [ "${darwinStartCmd}" ];
            RunAtLoad = true;
            KeepAlive = {
              SuccessfulExit = false;
            };
            ProcessType = "Interactive";
            EnvironmentVariables = {
              QS_VPETS_CONFIG_DIR = configDir;
              QS_VPETS_STATE_DIR = stateDir;
              QS_VPETS_OPEN_ON_START = "0";
            };
            StandardOutPath = "${stateDir}/qs-vpets.log";
            StandardErrorPath = "${stateDir}/qs-vpets.log";
          };
        };
      })
    ]
  );
}
