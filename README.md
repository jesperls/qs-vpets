# qs-vpets

Interactive pixel-art desktop companions for Hyprland/Wayland built on [Quickshell](https://quickshell.outfoxxed.me/), featuring multi-timescale cognition, sleep memory consolidation, an emergent Sanctuary rotation & GUI Pen, and 25 pixel-verified [PMD Collab](https://sprites.pmdcollab.org/#/) species.

## Highlights

- **Sanctuary Pen GUI & Emergent Leave/Return Rotation (`qs-vpets pen`)**:
  - Adopt 10–25+ companions without screen clutter: set `maxActiveRoaming` (default `3`) and per-pet roaming policy (`Auto Rotate`, `Always Out`, or `Stay in Pen`).
  - Companions in the Sanctuary consume zero Wayland windows while resting, eating snacks, consolidating dreams, and building friendships with pen-mates.
  - Roaming companions emergently pad off the edge of the screen into the Sanctuary when sleepy, while rested/nocturnal/music-loving companions stroll back onto the screen to take their turn.
  - Full floating **Pokémon Sanctuary** window (`qs-vpets pen`) with live animated pasture strip, inline companion renaming (preserving memories & friendships), full stats/traits/quirks/milestones, direct care actions, and a searchable 25-species adoption catalog.
- **25 Pixel-Verified PMDCollab Species & Authentic Ethology**:
  - Every species has bespoke standing, loafing, vocal, gait, biome, and signature behavior profiles (`EventSleep` 8-direction belly loafing, Zorua shadow *Illusion* pranks, Umbreon moonlight ring pulses, Rowlet head-tilts, Litwick candle glow, Munchlax snack naps, Mew playful floats, Toxapex shell-bunkering, and silent frame-0 standing on vocal sheets so pets never bark or cheer in loops).
- **Direct Desktop Interactivity**:
  - **Stroke / Hover Petting, Cursor Wiggle Play, & Carry/Toss Physics**: Brush the cursor across a pet for headpats, wiggle the cursor nearby to bait playful pounces, or carry pets across monitors.
  - **Window Watching, Ledge Perching, Urgent Window Alerts & MPRIS Music**: Pets sit North below active code windows to watch upward, hop onto window titlebars, perk up at urgent window alerts, and sway together to music.
  - **Live Pangu Palette Sync**: Automatically adopts `~/.cache/pangu/colors.json` when running alongside Pangu.

## Bundled Species (25)

`absol`, `charizard`, `cyndaquil`, `eevee`, `ferrothorn`, `gengar`, `giratina`, `grovyle`, `infernape`, `litwick`, `mew`, `mudkip`, `munchlax`, `phantump`, `pikachu`, `riolu`, `rowlet`, `shiftry`, `sprigatito`, `toxapex`, `umbreon`, `vulpix`, `whimsicott`, `wooper`, `zorua`.

Sprite sheets and animations courtesy of the [PMD Sprite Repository (SpriteCollab)](https://sprites.pmdcollab.org/#/) community artists; per-species artist attributions are included in `assets/sprites/<species>/credits.txt`.

## Install (Nix / Home Manager)

```nix
# flake.nix
inputs.qs-vpets = {
  url = "github:jesperls/qs-vpets";
  inputs.nixpkgs.follows = "nixpkgs";
  inputs.home-manager.follows = "home-manager";
};

# home-manager module
{ inputs, ... }: {
  imports = [ inputs.qs-vpets.homeManagerModules.default ];

  programs.qs-vpets = {
    enable = true;
    systemd.target = "hyprland-session.target";
    behavior = {
      maxActiveRoaming = 3;
      showEmotes = true;
      enablePerching = true;
      enableMusicReact = true;
    };
  };
}
```

Leave `programs.qs-vpets.pets = null` (the default) to adopt, rename, and manage your roster interactively through `qs-vpets pen` (`~/.config/qs-vpets/config.json`). Memories, friendships, and personality growth persist in `~/.local/state/qs-vpets/`.

## CLI & IPC Control

```sh
qs-vpets                        # Start overlay
qs-vpets pen                    # Toggle the floating Pokémon Sanctuary / Pet Pen GUI
qs-vpets status                 # Live JSON dump of roaming & Sanctuary companions
qs-vpets roam <name> <mode>     # Set mode: auto | always | penned | out | in
qs-vpets rename <old> <new>     # Rename a companion (preserves memories & friendships)
qs-vpets inspect [name]         # Toggle right-click inspector card (or open Pen)
qs-vpets pet [name]             # Stroke/pat a companion
qs-vpets feed [name]            # Give a berry snack
qs-vpets play [name]            # Trigger a playful bout
qs-vpets summon [name]          # Call a companion to cursor (or out from Sanctuary)
qs-vpets spawn <species> [name] # Adopt a new companion into your Sanctuary
qs-vpets toggle                 # Hide/show all desktop pets
```

## Verification

```sh
node tests/test_sprites.js && node tests/test_cognition.js
nix fmt -- --ci
nix flake check -L
```
