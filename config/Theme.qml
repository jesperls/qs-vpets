pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

Singleton {
    id: root

    property color bg: "#dd14161e"
    property color surface: "#1e222e"
    property color surfaceAlt: "#282e3d"
    property color border: "#3b4459"
    property color text: "#e4ecf5"
    property color subtext: "#98a6bd"
    property color accent: "#7dc4e4"
    property color accentSoft: "#223b4d"
    property color positive: "#8bd5ca"
    property color warm: "#eed49f"
    property color danger: "#ed8796"
    property color love: "#f5bde6"

    readonly property string fontFamily: "JetBrainsMono Nerd Font, monospace"
    readonly property string panguPalettePath: {
        const xdg = Quickshell.env("XDG_CACHE_HOME");
        const base = xdg && xdg.length > 0 ? xdg : (Quickshell.env("HOME") + "/.cache");
        return base + "/pangu/colors.json";
    }

    function _applyPalette(raw: string): void {
        if (!raw || !raw.trim()) return;
        try {
            const c = JSON.parse(raw);
            if (c.surfaceContainerLow || c.background) {
                const baseHex = String(c.surfaceContainerLow || c.background || "#14161e").replace(/^#/, "");
                if (baseHex.length === 6) root.bg = "#" + "e0" + baseHex;
            }
            if (c.surfaceContainer || c.whiteContainer) root.surface = c.surfaceContainer || c.whiteContainer;
            if (c.surfaceContainerHigh || c.blueContainer) root.surfaceAlt = c.surfaceContainerHigh || c.blueContainer;
            if (c.outlineVariant || c.outline) root.border = c.outlineVariant || c.outline;
            if (c.onSurface || c.white) root.text = c.onSurface || c.white;
            if (c.onSurfaceVariant) root.subtext = c.onSurfaceVariant;
            if (c.primary || c.blue) root.accent = c.primary || c.blue;
            if (c.primaryContainer || c.blueContainer) root.accentSoft = c.primaryContainer || c.blueContainer;
            if (c.green || c.lightGreen) root.positive = c.green || c.lightGreen;
            if (c.yellow || c.lightYellow) root.warm = c.yellow || c.lightYellow;
            if (c.red || c.lightRed) root.danger = c.red || c.lightRed;
            if (c.magenta || c.lightMagenta) root.love = c.magenta || c.lightMagenta;
        } catch (e) {
            // Keep fallback palette if colors.json is mid-write.
        }
    }

    FileView {
        id: paletteFile
        path: root.panguPalettePath
        watchChanges: true
        printErrors: false
        onLoaded: root._applyPalette(text())
        onFileChanged: reload()
    }
}
