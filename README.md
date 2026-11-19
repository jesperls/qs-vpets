# qs-vpets - Pokémon Sanctuary for Wayland, macOS & Windows

Interactive pixel-art Pokémon companions for **`wlr-layer-shell` Wayland desktops**, **Apple Silicon macOS**, and **Windows 10/11**, built on [Quickshell](https://quickshell.outfoxxed.me/) (Linux) and native **Qt6** desktop hosts (Metal + AppKit/Quartz on macOS; Direct3D11 + Win32/DWM/WinRT on Windows) with persistent personalities, sleep memory consolidation, inter-Pokémon social bonds, modular species abilities, a **Pokémon Sanctuary** camp clearing app, and 56 pixel-verified [PMD Collab](https://sprites.pmdcollab.org/#/) species.

| Desktop Companions | Pokémon Sanctuary |
| :---: | :---: |
| [Watch 60fps desktop demo (MP4)]( https://github.com/user-attachments/assets/118d0a16-2d41-40fc-885d-7a243f59eb8b ) | [Watch 60fps Sanctuary tour (MP4)]( https://github.com/user-attachments/assets/f18ce38a-09e3-4235-a9e6-15ac13c1cf93 ) |

---

## Highlights

- **Pokémon Sanctuary Camp & Desktop Launcher**:
  - Ships with a desktop entry (`qs-vpets.desktop`), vector icon, AppStream metadata, and login autostart (`qs-vpets autostart enable`).
  - Launching **Pokémon Sanctuary** (`qs-vpets open`) starts the background overlay if needed and opens a Pokémon Mystery Dungeon Friend Area clearing (`Treasure Shore`, `Whispering Woods`, `Skyline Bluff`, or `Luminous Spring`) with animated water, campfires, a bottom Pokéball party belt, a Care & Trainer's Memo card, and a Habitat Field Guide.
- **Natural Camp Rotation (`qs-vpets pen`)**:
  - Welcome a large party without crowding your screen: configure `maxActiveRoaming` (default `3`) and per-companion routines (`Free Roam`, `Stay Out`, or `Camp Only`).
  - Companions resting at camp use zero extra Wayland windows while eating Oran Berries, consolidating sleep memories, and building friendships with campmates.
  - Roaming companions walk off the screen edge back to camp when sleepy, while rested or night-loving companions head out to take their turn.
- **56 PMD Collab Species, Modular Abilities & Lifestyle Evolution**:
  - Declarative habitat catalogs (`components/species/*.js`), frame-slice clip playback (`SpriteSheet.resolveClip`), kin-group chemistry, lifestyle-based opt-in evolution (`components/behavior/Evolution.js`), and 14 composable abilities (`components/behavior/Abilities.js`).
  - Spontaneous social moments on the desktop: tag games with role reversal, play-sparring, side-by-side naps, synchronized music dancing, unrequited play bids, personal-space squabbles, and peacekeeper mediation.
- **Broad Wayland, macOS & Windows Support**:
  - **Linux Wayland**: Runs on **KDE Plasma Wayland (including SteamOS Desktop Mode)**, **Hyprland**, **Sway / Scroll**, **Niri**, **COSMIC**, **River**, **Wayfire**, **Labwc**, and **MangoWC** via `Quickshell.Wayland` (`wlr-layer-shell`, `ToplevelManager`, `IdleMonitor`) plus compositor IPC window-ledge perching.
  - **macOS (Apple Silicon / MacBook)**: Native Qt6 Metal + Objective-C++ host (`Pokemon Sanctuary.app` + Menu Bar Pokéball icon) with click-through multi-Space desktop overlays, MacBook camera-notch & Dock inset awareness, `CGWindowListCopyWindowInfo` window-ledge perching (requiring zero Screen Recording or Accessibility permissions), `IOKit` MagSafe/battery reactivity, Apple Silicon thermal/CPU warmth, CoreAudio volume/mute/mic detection, and Spotify/Apple Music Now Playing.
  - **Windows 10/11 (x64, Experimental)**: Native Qt6 + Win32/DWM/WinRT host (`Pokemon Sanctuary.exe` + System Tray Pokéball icon) with click-through multi-monitor Per-Monitor DPI v2 overlays, `DWMWA_EXTENDED_FRAME_BOUNDS` window-ledge perching, `GetLastInputInfo` idle detection, Core Audio volume/mute/mic detection, WinRT System Media Transport Controls Now Playing, and battery/sleep-wake reactivity.

---

## Installation

> **Platform Status:** **NixOS** (flake / Home Manager) and **macOS (Apple Silicon)** are currently the only platforms 100% verified working end-to-end. **Windows 10/11** and other Linux distributions (SteamOS, Arch, Fedora, Ubuntu) are **experimental / community-tested**.

| Platform / Distro | Status | Notes |
| :--- | :--- | :--- |
| **NixOS (Home Manager / flake)** | Verified | First-class package, systemd user service, and CI-checked module |
| **macOS 13+ (Apple Silicon)** | Verified | Native Qt6 Metal + AppKit `.app` and prebuilt bundle, smoke-tested in CI |
| **Windows 10/11 (x64)** | Experimental | Native Qt6 + Win32/DWM/WinRT `.exe` and prebuilt `.zip`, built & smoke-tested in CI (not yet verified on real hardware) |
| **SteamOS / Immutable Linux** | Experimental | Portable bundle runs without `sudo` in Desktop Mode (KDE Plasma Wayland) |
| **Arch / CachyOS / EndeavourOS** | Experimental | Native `PKGBUILD` using `quickshell` from `[extra]` |
| **Fedora** | Experimental | Native mode uses COPR `errornointernet/quickshell` (not CI-verified) |
| **Ubuntu** | Experimental | Portable mode needs `bubblewrap` on 24.04+ (AppArmor); native uses a third-party PPA; default GNOME desktop is unsupported |

### Quick Install (Wayland Linux / SteamOS)

Installs into `~/.local/` (`~/.local/bin/qs-vpets` + **Pokémon Sanctuary** launcher + login autostart). Selects the zero-root portable bundle on **SteamOS / Bazzite / Atomic** systems, or native Quickshell mode when available:

```sh
curl -fsSL https://raw.githubusercontent.com/jesperls/qs-vpets/main/install.sh | bash
```

Launch **Pokémon Sanctuary** from your app menu or run:

```sh
~/.local/bin/qs-vpets open
```

Uninstall cleanly at any time (preserving companion memories in `~/.local/state/qs-vpets`):

```sh
curl -fsSL https://raw.githubusercontent.com/jesperls/qs-vpets/main/install.sh | bash -s -- --uninstall
```

---

### macOS (Apple Silicon / MacBook Pro)

#### Option 1: Build & Install via Homebrew + CMake

Installs `Pokemon Sanctuary.app` into `~/Applications/`, `~/.local/bin/qs-vpets`, and configures a `launchd` LaunchAgent for login autostart:

```sh
git clone https://github.com/jesperls/qs-vpets.git
cd qs-vpets
./install.sh --native
~/.local/bin/qs-vpets open
```

#### Option 2: Self-Contained Apple Silicon Bundle

Download `qs-vpets-macos-arm64.tar.zst` from [GitHub Releases](https://github.com/jesperls/qs-vpets/releases) (or run `./install.sh --portable`):

```sh
zstd -dc qs-vpets-macos-arm64.tar.zst | tar -xf -
cd qs-vpets-macos-arm64
./install
~/.local/bin/qs-vpets open
```

On macOS, click the Pokéball icon in your **Menu Bar** to open **Pokémon Sanctuary**, summon a companion, or hide desktop pets. Right-click or `Ctrl+Click` any roaming Pokémon to open its interactive partner card.

---

### Windows 10/11 (x64, Experimental)

Installs `Pokemon Sanctuary.exe` into `%LOCALAPPDATA%\Programs\qs-vpets`, adds a **Pokémon Sanctuary** Start Menu shortcut, adds `qs-vpets` to your user `PATH`, and configures login autostart (`HKCU\...\Run`):

```powershell
irm https://raw.githubusercontent.com/jesperls/qs-vpets/main/install.ps1 | iex
```

Or download `qs-vpets-windows-x86_64.zip` from [GitHub Releases](https://github.com/jesperls/qs-vpets/releases), extract it, and run `Pokemon Sanctuary.exe` directly.

To build from source with CMake + MSVC + Qt6 (`qtbase`, `qtdeclarative`, `qtsvg`, `qtimageformats`):

```powershell
git clone https://github.com/jesperls/qs-vpets.git
cd qs-vpets
.\install.ps1 -Native
qs-vpets open
```

Uninstall cleanly at any time (preserving companion memories in `%APPDATA%\qs-vpets` and `%LOCALAPPDATA%\qs-vpets`):

```powershell
.\install.ps1 -Uninstall
```

On Windows, click the Pokéball icon in the **System Tray** to open **Pokémon Sanctuary**, or right-click it to summon a companion, hide desktop pets, or quit. Unsigned builds will trigger a Windows SmartScreen prompt on first launch (*More info → Run anyway*).

---

### SteamOS / Steam Deck (Desktop Mode)

SteamOS Desktop Mode runs **KDE Plasma Wayland**, which supports `qs-vpets` without disabling `steamos-readonly` or using `sudo`:

1. Switch your Steam Deck to **Desktop Mode**.
2. Open **Konsole** and run:
   ```sh
   curl -fsSL https://raw.githubusercontent.com/jesperls/qs-vpets/main/install.sh | bash -s -- --portable
   ```
3. Open the Application Launcher and click **Pokémon Sanctuary** (under *Games* / *Utilities*).

> **Note:** Gaming Mode uses `gamescope` (a single-game compositor without desktop layer-shell overlays), so companions live in **Desktop Mode** and stay out of Gaming Mode.

---

### Arch Linux / CachyOS / EndeavourOS

`quickshell` is in the official Arch `[extra]` repository. Build and install as a native pacman package via `makepkg`:

```sh
git clone https://github.com/jesperls/qs-vpets.git
cd qs-vpets/packaging/aur
makepkg -si
qs-vpets autostart enable
qs-vpets open
```

---

### Fedora & Ubuntu (Experimental)

Using the native installer (enables the Quickshell COPR on Fedora or `ppa:avengemedia/danklinux` on Ubuntu, then installs `qs-vpets` into `~/.local/`):

```sh
git clone https://github.com/jesperls/qs-vpets.git
cd qs-vpets
./install.sh --native
```

Or run `./install.sh --portable` to keep everything self-contained in `~/.local/opt/qs-vpets` without adding system repositories.

> **Ubuntu notes:**
> - **AppArmor (Ubuntu 24.04+):** Portable mode uses unprivileged user namespaces, which Ubuntu restricts by default. Install `bubblewrap` (`sudo apt install bubblewrap`) so the portable wrapper can use Ubuntu's allowed `bwrap` profile.
> - **Desktop environment:** Stock Ubuntu uses GNOME (Mutter), which does not support `wlr-layer-shell`. A supported Wayland compositor (such as KDE Plasma Wayland / Kubuntu, Hyprland, Sway, Niri, or COSMIC) is required.

---

### Portable Tarball (Manual / Offline Install)

Download `qs-vpets-portable-x86_64-linux.tar.zst` (or `aarch64-linux`) from [GitHub Releases](https://github.com/jesperls/qs-vpets/releases):

```sh
tar -I zstd -xf qs-vpets-portable-x86_64-linux.tar.zst
cd qs-vpets-portable-x86_64-linux
./install
```

To build the portable bundle locally with Nix:

```sh
nix build github:jesperls/qs-vpets#portable
ls -lh result/
```

---

### NixOS, nix-darwin & Home Manager

Works on both Linux (`systemd.user.services.qs-vpets`) and Apple Silicon macOS (`launchd.agents.qs-vpets`):

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
      sanctuaryCamp = "shore"; # "shore" | "forest" | "cliff" | "spring"
      showEmotes = true;
      enablePerching = true;
      enableMusicReact = true;
    };
  };
}
```

Leave `programs.qs-vpets.pets = null` (the default) to welcome, nickname, and manage companions interactively through **Pokémon Sanctuary** (`~/.config/qs-vpets/config.json`). Memories, friendships, and personality growth persist in `~/.local/state/qs-vpets/`.

---

## Desktop & Compositor Compatibility

| Desktop / Compositor | Overlay & Input | Fullscreen & Active App | Idle Detection | Window Ledge Perching |
| :--- | :---: | :---: | :---: | :---: |
| **macOS 13+ (Apple Silicon)** | Yes (AppKit + Metal) | Yes (Quartz + NSWorkspace) | Yes (CoreGraphics) | Yes (Quartz `CGWindowList`) |
| **Windows 10/11 (x64)** | Yes (Win32 + D3D11) | Yes (DWM + `SHQueryUserNotificationState`) | Yes (`GetLastInputInfo`) | Yes (DWM `ExtendedFrameBounds`) |
| **Hyprland** | Yes | Yes | Yes | Yes (Hyprland IPC) |
| **Sway / Scroll** | Yes | Yes | Yes | Yes (Sway IPC) |
| **Niri** | Yes | Yes | Yes | Yes (Niri IPC) |
| **KDE Plasma Wayland / SteamOS** | Yes | Yes | Yes | Ground roam |
| **COSMIC / River / Wayfire / Labwc** | Yes | Yes | Yes | Ground roam |
| **GNOME Wayland (Mutter)** | No (`wlr-layer-shell` unsupported by Mutter) | No | No | No |
| **X11 Sessions** | No (Wayland required) | No | No | No |

---

## Bundled Species (56 across 6 Habitats)

- **Sunlit Meadow (11)**: `bulbasaur`, `eevee`, `grovyle`, `jolteon`, `leafeon`, `munchlax`, `pikachu`, `shaymin`, `shinx`, `sprigatito`, `whimsicott`
- **Moonlit Woods (11)**: `absol`, `celebi`, `emolga`, `ferrothorn`, `phantump`, `rockruff`, `rowlet`, `shiftry`, `turtwig`, `umbreon`, `zorua`
- **Warm Hearth (9)**: `charizard`, `charmander`, `cyndaquil`, `fennekin`, `flareon`, `fuecoco`, `infernape`, `ninetales`, `vulpix`
- **Shadow Hollow (8)**: `darkrai`, `espurr`, `gengar`, `giratina`, `litwick`, `marshadow`, `misdreavus`, `sneasel`
- **Tidepool Cove (9)**: `glaceon`, `mudkip`, `oshawott`, `piplup`, `spheal`, `squirtle`, `totodile`, `toxapex`, `wooper`
- **Starlight Loft (8)**: `altaria`, `cresselia`, `jirachi`, `latias`, `lucario`, `meloetta`, `mew`, `riolu`

Sprite sheets and animations come from the [PMD Sprite Repository (SpriteCollab)](https://sprites.pmdcollab.org/#/) community artists (`assets/sprites/<species>/credits.txt`), and Sanctuary camp tiles and props come from Pokémon Mystery Dungeon (`assets/sanctuary/credits.txt`).

---

## Adding New Species, Habitats & Friend Areas

All species traits, clips, abilities, evolutions, habitats, and Friend Areas are declarative:

1. Search, import, audit, and scaffold a species profile from PMDCollab:
   ```sh
   node scripts/pmd-species.js search <name>
   node scripts/pmd-species.js import <dexId> <slug>
   node scripts/pmd-species.js audit --frames <slug>
   node scripts/pmd-species.js scaffold <slug>
   ```
2. Paste the generated profile into `components/species/{Meadow,Woods,Hearth,Hollow,Tidepool,Loft}.js` and customize its `blurb`, `kinGroup`, `abilities` (`components/behavior/Abilities.js`), `locomotion` (`"quad" | "hover" | "heavy" | "springer"`), optional `electricAffinity` / `bunkerState`, and optional `evolutions` branches.
3. Habitats live in `components/species/Biomes.js`, and Sanctuary Friend Areas live in `components/ui/FriendAreas.js`. `SPECIES_LIST`, Habitat Field Guide filters, Friend Area selectors, and the Home Manager `sprite` enum derive automatically.

---

## CLI & Keybind Control

```sh
qs-vpets open                    # Start overlay (if needed) and open Pokémon Sanctuary
qs-vpets pen                     # Toggle the floating Pokémon Sanctuary GUI
qs-vpets start                   # Start background overlay if not already running
qs-vpets stop                    # Save companion memories and stop overlay
qs-vpets flush                   # Save all companion memories and config immediately
qs-vpets autostart enable        # Start automatically on Wayland login (systemd / XDG autostart)
qs-vpets status                  # Live JSON status of roaming & Sanctuary companions
qs-vpets roam <name> <mode>      # Set routine: auto | always | penned | out | in
qs-vpets rename <old> <new>      # Rename a companion (preserves memories & friendships)
qs-vpets evolve <name> [species] # Opt-in evolution when lifestyle milestones are met
qs-vpets inspect [name]          # Toggle desktop partner card (or open Sanctuary)
qs-vpets pet [name]              # Stroke/pat a companion
qs-vpets feed [name]             # Give an Oran Berry snack
qs-vpets play [name]             # Trigger a playful bout
qs-vpets summon [name]           # Call a companion to cursor (or out from Sanctuary)
qs-vpets spawn <species> [name]  # Welcome a new companion into your Sanctuary
qs-vpets release <name>          # Part ways with a companion and remove its state file
qs-vpets toggle                  # Hide/show all desktop pets
```

---

## Verification

```sh
node tests/test_sprites.js && node tests/test_cognition.js && node tests/test_soak.js
nix fmt -- --ci
nix flake check -L
```
