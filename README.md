# qs-vpets — Pokémon Sanctuary for Wayland

Interactive pixel-art Pokémon companions for **any `wlr-layer-shell` Wayland desktop** — built on [Quickshell](https://quickshell.outfoxxed.me/) with multi-timescale cognition, sleep memory consolidation, inter-Pokémon social dynamics, pluggable species abilities, a full **Pokémon Sanctuary** desktop app & launcher, and 56 pixel-verified [PMD Collab](https://sprites.pmdcollab.org/#/) species.

---

## Highlights

- **Full Desktop Application & Launcher (`Pokémon Sanctuary`)**:
  - Ships with a standard desktop launcher (`qs-vpets.desktop`), vector icon, AppStream metadata, and login autostart (`qs-vpets autostart enable`).
  - Launching **Pokémon Sanctuary** from your app menu (`qs-vpets open`) automatically starts the background overlay if needed and opens the Sanctuary GUI.
- **Sanctuary Pasture & Emergent Rotation (`qs-vpets pen`)**:
  - Adopt 10–25+ companions without cluttering your screen: set `maxActiveRoaming` (default `3`) and per-pet roaming policy (`Auto Rotate`, `Always Out`, or `Stay in Pen`).
  - Off-screen companions rest in the Sanctuary with zero Wayland window overhead while eating snacks, consolidating dreams, and forming friendships.
  - Roaming companions emergently pad off the screen edge into the Sanctuary when sleepy, while rested, nocturnal, or music-loving companions stroll out to take their turn.
- **56 Pixel-Verified PMDCollab Species, Pluggable Abilities & Deep Social Dynamics**:
  - Modular biome catalogs (`components/species/*.js`), declarative frame-slice clip playback (`SpriteSheet.resolveClip`), kin-group chemistry, and 14 composable abilities (`components/behavior/Abilities.js`: *Illusion Craft*, *Psychic Blink*, *Hearth Ember*, *Moonlight Pulse*, *Sunlit Bask*, *Shell Bunker*, *Wind Glide*, *Aura Watch*, *Melody Spark*, *Shadow Slip*, *Tidepool Joy*, *Berry Stash*, *Frost Serene*, *Soothing Aura*).
  - Spontaneous proximity-gated social interactions: tag/chase games with role-reversal, choreographed play-sparring, side-by-side loafing, synchronized music dancing, unrequited play bids, personal-space squabbles, and peacekeeper mediation.
- **Works Across Wayland Desktops**:
  - Runs on **KDE Plasma Wayland (including SteamOS Desktop Mode)**, **Hyprland**, **Sway**, **Niri**, **COSMIC**, **River**, **Wayfire**, **Labwc**, and **MangoWC**.
  - Uses `Quickshell.Wayland` (`wlr-layer-shell`, `ToplevelManager`, `IdleMonitor`) for fullscreen game awareness, active-app perception, window focus activation, and compositor idle tracking — with enhanced Hyprland IPC window-ledge perching when running under Hyprland.

---

## Installation

### Quick Install (Any Wayland Linux / SteamOS)

Installs into `~/.local/` (`~/.local/bin/qs-vpets` + **Pokémon Sanctuary** app launcher + login autostart). Automatically selects the zero-root portable bundle on **SteamOS / Bazzite / Atomic** distros, or native Quickshell mode when available:

```sh
curl -fsSL https://raw.githubusercontent.com/jesperls/qs-vpets/main/install.sh | bash
```

Launch from your application menu (**Pokémon Sanctuary**) or run:

```sh
~/.local/bin/qs-vpets open
```

Uninstall cleanly at any time (preserving companion memories in `~/.local/state/qs-vpets`):

```sh
curl -fsSL https://raw.githubusercontent.com/jesperls/qs-vpets/main/install.sh | bash -s -- --uninstall
```

---

### SteamOS / Steam Deck (Desktop Mode)

SteamOS Desktop Mode runs **KDE Plasma Wayland**, which supports `qs-vpets` out of the box without disabling `steamos-readonly` or using `sudo`:

1. Switch your Steam Deck to **Desktop Mode**.
2. Open **Konsole** and run:
   ```sh
   curl -fsSL https://raw.githubusercontent.com/jesperls/qs-vpets/main/install.sh | bash -s -- --portable
   ```
3. Open the Application Launcher and click **Pokémon Sanctuary** (under *Games* / *Utilities*).

> **Note:** Gaming Mode uses `gamescope` (a single-game micro-compositor without desktop layer-shell overlays), so companions automatically live in **Desktop Mode** and stay completely out of Gaming Mode's way.

---

### Arch Linux / CachyOS / EndeavourOS

`quickshell` is in the official Arch `[extra]` repository. Build and install cleanly as a native pacman package via `makepkg`:

```sh
git clone https://github.com/jesperls/qs-vpets.git
cd qs-vpets/packaging/aur
makepkg -si
qs-vpets autostart enable
qs-vpets open
```

---

### Fedora & Ubuntu

Using the native installer (enables the community Quickshell COPR on Fedora or PPA on Ubuntu, then installs `qs-vpets` into `~/.local/`):

```sh
git clone https://github.com/jesperls/qs-vpets.git
cd qs-vpets
./install.sh --native
```

Or use `./install.sh --portable` to run completely in `~/.local/opt/qs-vpets` without adding system repositories.

---

### Portable Tarball (Manual Download / Offline Install)

Download `qs-vpets-portable-x86_64-linux.tar.zst` (or `aarch64-linux`) from [GitHub Releases](https://github.com/jesperls/qs-vpets/releases):

```sh
tar -I zstd -xf qs-vpets-portable-x86_64-linux.tar.zst
cd qs-vpets-portable-x86_64-linux
./install
```

You can also build the portable bundle yourself from any machine with Nix installed:

```sh
nix build github:jesperls/qs-vpets#portable
ls -lh result/
```

---

### NixOS & Home Manager

```nix
# flake.nix
inputs.qs-vpets = {
  url = "github:jesperls/qs-vpets";
  inputs.nixpkgs.follows = "nixpkgs";
  inputs.home-manager.follows = "home-manager";
};

# home-manager module
{ inputs, ... }: {
  imports = [ inputs.qs-vpets.homeModules.default ];

  programs.qs-vpets = {
    enable = true;
    systemd.target = "graphical-session.target"; # or "hyprland-session.target"
    behavior = {
      maxActiveRoaming = 3;
      showEmotes = true;
      enablePerching = true;
      enableMusicReact = true;
    };
  };
}
```

Leave `programs.qs-vpets.pets = null` (the default) to adopt, rename, and manage your roster interactively through **Pokémon Sanctuary** (`~/.config/qs-vpets/config.json`). Memories, friendships, and personality growth persist in `~/.local/state/qs-vpets/`.

---

## Wayland Compositor Compatibility

| Desktop / Compositor | Overlay & Input | Fullscreen & Active App | Idle Detection | Window Ledge Perching |
| :--- | :---: | :---: | :---: | :---: |
| **Hyprland** | Yes | Yes | Yes | Yes (Hyprland IPC) |
| **KDE Plasma Wayland / SteamOS** | Yes | Yes | Yes | Graceful ground roam |
| **Sway / Scroll** | Yes | Yes | Yes | Graceful ground roam |
| **Niri** | Yes | Yes | Yes | Graceful ground roam |
| **COSMIC / River / Wayfire / Labwc** | Yes | Yes | Yes | Graceful ground roam |
| **GNOME Wayland (Mutter)** | No (`wlr-layer-shell` unsupported by Mutter) | — | — | — |
| **X11 Sessions** | No (Wayland required) | — | — | — |

---

## Bundled Species (56 across 6 Biomes)

- **Sunlit Meadow (11)**: `bulbasaur`, `eevee`, `grovyle`, `jolteon`, `leafeon`, `munchlax`, `pikachu`, `shaymin`, `shinx`, `sprigatito`, `whimsicott`
- **Moonlit Woods (11)**: `absol`, `celebi`, `emolga`, `ferrothorn`, `phantump`, `rockruff`, `rowlet`, `shiftry`, `turtwig`, `umbreon`, `zorua`
- **Warm Hearth (9)**: `charizard`, `charmander`, `cyndaquil`, `fennekin`, `flareon`, `fuecoco`, `infernape`, `ninetales`, `vulpix`
- **Shadow Hollow (8)**: `darkrai`, `espurr`, `gengar`, `giratina`, `litwick`, `marshadow`, `misdreavus`, `sneasel`
- **Tidepool Cove (9)**: `glaceon`, `mudkip`, `oshawott`, `piplup`, `spheal`, `squirtle`, `totodile`, `toxapex`, `wooper`
- **Starlight Loft (8)**: `altaria`, `cresselia`, `jirachi`, `latias`, `lucario`, `meloetta`, `mew`, `riolu`

Sprite sheets and animations courtesy of the [PMD Sprite Repository (SpriteCollab)](https://sprites.pmdcollab.org/#/) community artists; per-species artist attributions are included in `assets/sprites/<species>/credits.txt`.

---

## Adding New Species & Abilities

Species, clips, and abilities are data-driven with zero per-species engine branches:

1. Search and import clean `*-Anim.png` sheets + `credits.txt` from PMDCollab:
   ```sh
   node scripts/pmd-species.js search <name>
   node scripts/pmd-species.js import <dexId> <slug>
   node scripts/pmd-species.js audit --frames <slug>
   ```
2. Add the species entry to its habitat module in `components/species/{Meadow,Woods,Hearth,Hollow,Tidepool,Loft}.js` with declarative `clips`, `kinGroup`, `abilities` (from `components/behavior/Abilities.js`), gait speeds, and gesture pools. `SPECIES_LIST`, Sanctuary habitat filters, and the Home Manager `sprite` enum derive automatically.

---

## CLI & Keybind Control

```sh
qs-vpets open                   # Start overlay (if needed) and open Pokémon Sanctuary
qs-vpets pen                    # Toggle the floating Pokémon Sanctuary GUI (ideal for keybinds)
qs-vpets start                  # Start background overlay if not already running
qs-vpets stop                   # Save companion memories and stop overlay
qs-vpets flush                  # Save all companion memories and config immediately
qs-vpets autostart enable       # Start automatically on Wayland login (systemd / XDG autostart)
qs-vpets status                 # Live JSON dump of roaming & Sanctuary companions
qs-vpets roam <name> <mode>     # Set mode: auto | always | penned | out | in
qs-vpets rename <old> <new>     # Rename a companion (preserves memories & friendships)
qs-vpets evolve <name> [species]# Opt-in evolution when lifestyle milestones are met
qs-vpets inspect [name]         # Toggle right-click inspector card (or open Sanctuary)
qs-vpets pet [name]             # Stroke/pat a companion
qs-vpets feed [name]            # Give a berry snack
qs-vpets play [name]            # Trigger a playful bout
qs-vpets summon [name]          # Call a companion to cursor (or out from Sanctuary)
qs-vpets spawn <species> [name] # Adopt a new companion into your Sanctuary
qs-vpets release <name>         # Release a companion and remove its state file
qs-vpets toggle                 # Hide/show all desktop pets
```

---

## Verification

```sh
node tests/test_sprites.js && node tests/test_cognition.js
nix fmt -- --ci
nix flake check -L
```
