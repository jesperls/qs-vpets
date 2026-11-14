pragma Singleton
pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Io

Singleton {
    id: root

    property color bg: "#f2060b11"
    property color panel: "#0c141e"
    property color surface: "#0c141e"
    property color surfaceAlt: "#121d2b"
    property color elevated: "#182638"
    property color border: "#263a4f"
    property color borderSubtle: "#1c2c3d"
    property color rimHighlight: "#26cbe4ff"

    property color text: "#e2eef8"
    property color subtext: "#95acc2"
    property color muted: "#627b94"

    property color accent: "#53bdfa"
    property color overAccent: "#00263b"
    property color accentSoft: "#0c3b59"

    property color positive: "#6ce5b1"
    property color positiveSoft: "#154b36"

    property color warm: "#f5cb78"
    property color warmSoft: "#523d14"

    property color danger: "#ff7a8a"
    property color dangerSoft: "#5c1f28"

    property color love: "#b79cff"
    property color loveSoft: "#3b2c63"

    property string uiFont: "Noto Sans"
    property string monoFont: "JetBrainsMono Nerd Font"
    readonly property string fontFamily: uiFont

    property int roundness: 14
    property int animMs: 180
    property bool specularRim: true

    function radius(offset = 0): int {
        return root.roundness > 0 ? Math.max(4, root.roundness + offset) : 0;
    }

    function alpha(c: color, a: real): color {
        return Qt.rgba(c.r, c.g, c.b, a);
    }

    function luminance(hexOrColor: var): real {
        if (hexOrColor && typeof hexOrColor === "object" && hexOrColor.r !== undefined) {
            return 0.2126 * hexOrColor.r + 0.7152 * hexOrColor.g + 0.0722 * hexOrColor.b;
        }
        let s = String(hexOrColor || "").trim().replace(/^#/, "");
        if (s.length === 3) {
            s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
        } else if (s.length === 8) {
            s = s.slice(2);
        }
        if (s.length !== 6) return 0.1;
        const r = (parseInt(s.slice(0, 2), 16) || 0) / 255;
        const g = (parseInt(s.slice(2, 4), 16) || 0) / 255;
        const b = (parseInt(s.slice(4, 6), 16) || 0) / 255;
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    readonly property string panguPalettePath: {
        const xdg = Quickshell.env("XDG_CACHE_HOME");
        const base = xdg && xdg.length > 0 ? xdg : (Quickshell.env("HOME") + "/.cache");
        return base + "/pangu/colors.json";
    }

    readonly property string panguThemePath: {
        const xdg = Quickshell.env("XDG_CONFIG_HOME");
        const base = xdg && xdg.length > 0 ? xdg : (Quickshell.env("HOME") + "/.config");
        return base + "/pangu/config/theme.json";
    }

    function _applyPalette(raw: string): void {
        if (!raw || !raw.trim()) return;
        try {
            const c = JSON.parse(raw);
            let low = String(c.surfaceContainerLow || c.surface || c.background || "#080d14").replace(/^#/, "");
            if (low.length === 8) low = low.slice(2);
            if (low.length === 6) root.bg = "#f2" + low;
            if (c.surfaceContainer || c.whiteContainer) {
                root.panel = c.surfaceContainer || c.whiteContainer;
                root.surface = root.panel;
            }
            if (c.surfaceContainerHigh || c.blueContainer) {
                root.surfaceAlt = c.surfaceContainerHigh || c.blueContainer;
            }
            if (c.surfaceContainerHighest || c.surfaceBright) {
                root.elevated = c.surfaceContainerHighest || c.surfaceBright;
            }
            if (c.outline) root.border = c.outline;
            else if (c.outlineVariant) root.border = c.outlineVariant;
            if (c.outlineVariant) root.borderSubtle = c.outlineVariant;

            if (c.overSurface || c.overBackground || c.onSurface || c.white) {
                root.text = c.overSurface || c.overBackground || c.onSurface || c.white;
            }
            if (c.overSurfaceVariant || c.onSurfaceVariant) {
                root.subtext = c.overSurfaceVariant || c.onSurfaceVariant;
                const sv = root.subtext;
                root.muted = Qt.rgba(sv.r, sv.g, sv.b, 0.68);
            }

            if (c.primary || c.blue) root.accent = c.primary || c.blue;
            if (c.overPrimary || c.overBlue) root.overAccent = c.overPrimary || c.overBlue;
            if (c.primaryContainer || c.blueContainer) root.accentSoft = c.primaryContainer || c.blueContainer;

            if (c.green || c.lightGreen) root.positive = c.green || c.lightGreen;
            if (c.greenContainer) root.positiveSoft = c.greenContainer;

            if (c.yellow || c.lightYellow) root.warm = c.yellow || c.lightYellow;
            if (c.yellowContainer) root.warmSoft = c.yellowContainer;

            if (c.error || c.red || c.lightRed) root.danger = c.error || c.red || c.lightRed;
            if (c.errorContainer || c.redContainer) root.dangerSoft = c.errorContainer || c.redContainer;

            if (c.magenta || c.lightMagenta) root.love = c.magenta || c.lightMagenta;
            if (c.magentaContainer) root.loveSoft = c.magentaContainer;

            const t = root.text;
            root.rimHighlight = Qt.rgba(t.r, t.g, t.b, 0.11);
        } catch (e) {
            // Ignore partial writes while matugen regenerates colors.json.
        }
    }

    function _applyThemeConfig(raw: string): void {
        if (!raw || !raw.trim()) return;
        try {
            const t = JSON.parse(raw);
            if (typeof t.font === "string" && t.font.trim().length > 0) {
                root.uiFont = t.font.trim();
            }
            if (typeof t.monoFont === "string" && t.monoFont.trim().length > 0) {
                root.monoFont = t.monoFont.trim();
            }
            if (typeof t.roundness === "number") {
                root.roundness = Math.max(0, Math.min(24, Math.round(t.roundness)));
            }
            if (typeof t.animDuration === "number") {
                root.animMs = Math.max(0, Math.min(400, Math.round(t.animDuration * 0.85)));
            }
            if (typeof t.specularRim === "boolean") {
                root.specularRim = t.specularRim;
            }
        } catch (e) {
            // Ignore partial writes while Pangu saves theme.json.
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

    FileView {
        id: themeConfigFile
        path: root.panguThemePath
        watchChanges: true
        printErrors: false
        onLoaded: root._applyThemeConfig(text())
        onFileChanged: reload()
    }
}
