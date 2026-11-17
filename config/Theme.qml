pragma Singleton
pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Io

Singleton {
    id: root

    property color panel: "#26201c"
    property color surface: "#2e2621"
    property color surfaceAlt: "#382f28"
    property color elevated: "#453930"
    property color parchment: "#332a23"
    property color border: "#59493d"
    property color borderSubtle: "#42362d"
    property color rimHighlight: "#26fff2dc"

    property color text: "#f7efe2"
    property color subtext: "#d1c1ad"
    property color muted: "#998774"

    property color pokeball: "#ea6b5e"
    property color pokeballSoft: "#4e2723"
    property color overPokeball: "#fff8f4"

    property color accent: "#6fc2e6"

    property color positive: "#82cf8e"
    property color overPositive: "#102615"
    property color positiveSoft: "#24402a"

    property color warm: "#f3c66f"
    property color overWarm: "#281c07"
    property color warmSoft: "#4b391c"

    property color danger: "#ea6b5e"

    property color love: "#f291aa"
    property color loveSoft: "#4c2732"

    property color lavender: "#b89ef0"

    property string uiFont: "Noto Sans"
    property int roundness: 16
    property int animMs: 180
    property bool specularRim: true

    function radius(offset = 0): int {
        return root.roundness > 0 ? Math.max(6, root.roundness + offset) : 0;
    }

    function alpha(c: color, a: real): color {
        return Qt.rgba(c.r, c.g, c.b, a);
    }

    function _mix(a: color, b: color, t: real): color {
        return Qt.rgba(
            a.r + (b.r - a.r) * t,
            a.g + (b.g - a.g) * t,
            a.b + (b.b - a.b) * t,
            1.0
        );
    }

    readonly property string _cacheBase: {
        const xdg = Quickshell.env("XDG_CACHE_HOME");
        return xdg && xdg.length > 0 ? xdg : (Quickshell.env("HOME") + "/.cache");
    }
    readonly property string _configBase: {
        const xdg = Quickshell.env("XDG_CONFIG_HOME");
        return xdg && xdg.length > 0 ? xdg : (Quickshell.env("HOME") + "/.config");
    }
    readonly property string customPalettePath: _cacheBase + "/qs-vpets/colors.json"
    readonly property string customThemePath: _configBase + "/qs-vpets/theme.json"
    readonly property string panguThemePath: _configBase + "/pangu/config/theme.json"

    function _applyPalette(raw: string): void {
        if (!raw || !raw.trim()) return;
        try {
            const c = JSON.parse(raw);
            if (c.surfaceContainer) {
                root.panel = c.surfaceContainer;
                root.surface = c.surfaceContainer;
            }
            if (c.surfaceContainerHigh) root.surfaceAlt = c.surfaceContainerHigh;
            if (c.surfaceContainerHighest) root.elevated = c.surfaceContainerHighest;
            root.parchment = root._mix(root.panel, root.surfaceAlt, 0.65);

            if (c.outline) root.border = c.outline;
            if (c.outlineVariant) root.borderSubtle = c.outlineVariant;
            if (c.overSurface || c.onSurface) root.text = c.overSurface || c.onSurface;
            if (c.overSurfaceVariant || c.onSurfaceVariant) {
                root.subtext = c.overSurfaceVariant || c.onSurfaceVariant;
                const sv = root.subtext;
                root.muted = Qt.rgba(sv.r, sv.g, sv.b, 0.72);
            }
            if (c.primary) root.accent = c.primary;
            if (c.green) root.positive = c.green;
            if (c.yellow) root.warm = c.yellow;
            if (c.error || c.red) {
                root.danger = c.error || c.red;
                root.pokeball = root.danger;
            }
            if (c.magenta) root.love = c.magenta;

            root.pokeballSoft = root._mix(root.panel, root.pokeball, 0.24);
            root.positiveSoft = root._mix(root.panel, root.positive, 0.24);
            root.warmSoft = root._mix(root.panel, root.warm, 0.24);
            root.loveSoft = root._mix(root.panel, root.love, 0.24);

            const t = root.text;
            root.rimHighlight = Qt.rgba(t.r, t.g, t.b, 0.14);
        } catch (e) {
            // Ignore partial writes while colors.json is updated.
        }
    }

    function _applyThemeConfig(raw: string): void {
        if (!raw || !raw.trim()) return;
        try {
            const t = JSON.parse(raw);
            if (typeof t.font === "string" && t.font.trim().length > 0) {
                root.uiFont = t.font.trim();
            }
            if (typeof t.roundness === "number") {
                root.roundness = Math.max(8, Math.min(24, Math.round(t.roundness)));
            }
            if (typeof t.animDuration === "number") {
                root.animMs = Math.max(0, Math.min(400, Math.round(t.animDuration * 0.85)));
            }
            if (typeof t.specularRim === "boolean") {
                root.specularRim = t.specularRim;
            }
        } catch (e) {
            // Ignore partial writes while theme.json is updated.
        }
    }

    FileView {
        id: customPaletteFile
        path: root.customPalettePath
        watchChanges: true
        printErrors: false
        onLoaded: root._applyPalette(text())
        onFileChanged: reload()
    }

    FileView {
        id: customThemeFile
        path: root.customThemePath
        watchChanges: true
        printErrors: false
        onLoaded: root._applyThemeConfig(text())
        onFileChanged: reload()
    }

    FileView {
        id: themeConfigFile
        path: root.panguThemePath
        watchChanges: true
        printErrors: false
        onLoaded: {
            if (!customThemeFile.text().trim()) root._applyThemeConfig(text());
        }
        onFileChanged: reload()
    }
}
