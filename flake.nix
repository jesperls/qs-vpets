{
  description = "Interactive pixel-art Pokémon companions for Wayland, macOS, and Windows desktops";

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
        "aarch64-darwin"
        "x86_64-darwin"
      ];
      forAllSystems = lib.genAttrs systems;
      version = lib.strings.trim (builtins.readFile ./VERSION);
      packageFor =
        pkgs:
        if pkgs.stdenv.hostPlatform.isDarwin then
          pkgs.callPackage ./nix/macos.nix { inherit version; }
        else
          pkgs.callPackage ./nix { inherit version; };
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
          qs-vpets = packageFor pkgs;
        in
        {
          inherit qs-vpets;
          default = qs-vpets;
        }
        // lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
          portable = import ./nix/portable.nix {
            inherit
              lib
              pkgs
              qs-vpets
              version
              ;
          };
        }
      );

      homeModules.default = import ./nix/hm-module.nix { inherit packageFor; };

      checks = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
        in
        import ./nix/checks.nix {
          inherit lib self home-manager;
          inherit pkgs;
          inherit (self.packages.${system}) qs-vpets;
          portable = self.packages.${system}.portable or null;
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
            packages =
              pkg.runtimeInputs
              ++ [
                pkg
                pkgs.nodejs
                pkgs.python3
                pkgs.shellcheck
                pkgs.qt6.qtdeclarative
                pkgs.nixfmt-tree
              ]
              ++ lib.optionals pkgs.stdenv.hostPlatform.isDarwin [
                pkgs.cmake
                pkgs.ninja
              ];
            QML2_IMPORT_PATH = "${pkg.qmlEnv}/lib/qt-6/qml";
            QML_IMPORT_PATH = "${pkg.qmlEnv}/lib/qt-6/qml";
            QT_PLUGIN_PATH = "${pkg.qmlEnv}/lib/qt-6/plugins";
          };
        }
      );
    };
}
