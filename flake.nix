{
  description = "Interactive desktop virtual pets with emergent personalities for Hyprland/Wayland via Quickshell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      home-manager,
    }:
    let
      inherit (nixpkgs) lib;
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = lib.genAttrs systems;
      version = self.shortRev or self.dirtyShortRev or "0.5.0";
      packageFor = pkgs: pkgs.callPackage ./nix { inherit version; };
      pkgsFor = system: nixpkgs.legacyPackages.${system};
    in
    {
      overlays.default = final: _: {
        qs-vpets = packageFor final;
      };

      packages = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
        in
        rec {
          qs-vpets = packageFor pkgs;
          portable = import ./nix/portable.nix {
            inherit
              lib
              pkgs
              qs-vpets
              version
              ;
          };
          default = qs-vpets;
        }
      );

      homeModules.default = import ./nix/hm-module.nix { inherit packageFor; };

      checks = forAllSystems (
        system:
        import ./nix/checks.nix {
          inherit lib self home-manager;
          pkgs = pkgsFor system;
          inherit (self.packages.${system}) qs-vpets portable;
        }
      );

      formatter = forAllSystems (system: (pkgsFor system).nixfmt-tree);

      apps = forAllSystems (
        system:
        let
          pkg = self.packages.${system}.qs-vpets;
        in
        {
          default = {
            type = "app";
            program = lib.getExe pkg;
            meta.description = "Run qs-vpets";
          };
        }
      );

      devShells = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
          pkg = self.packages.${system}.qs-vpets;
        in
        {
          default = pkgs.mkShell {
            packages = pkg.runtimeInputs ++ [
              pkg
              pkgs.nodejs
              pkgs.python3
              pkgs.shellcheck
              pkgs.qt6.qtdeclarative
              pkgs.nixfmt-tree
            ];
            QML2_IMPORT_PATH = "${pkg.qmlEnv}/lib/qt-6/qml";
            QML_IMPORT_PATH = "${pkg.qmlEnv}/lib/qt-6/qml";
            QT_PLUGIN_PATH = "${pkg.qmlEnv}/lib/qt-6/plugins";
          };
        }
      );
    };
}
