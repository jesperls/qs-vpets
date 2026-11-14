pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import "../components/SpriteSheet.js" as SpriteSheet

Singleton {
    id: root

    property var pets: [
        {
            id: "mochi",
            name: "Mochi",
            sprite: "zorua",
            personality: "emergent",
            scale: 2,
            monitor: "",
            actions: {}
        },
        {
            id: "puff",
            name: "Puff",
            sprite: "whimsicott",
            personality: "curious",
            scale: 2,
            monitor: "",
            actions: {}
        }
    ]

    property int idleTimeout: 300
    property real walkSpeed: 72
    property bool showEmotes: true
    property bool enablePerching: true
    property bool enableMusicReact: true
    property int maxActiveRoaming: 3
    property bool ready: false

    readonly property var speciesList: SpriteSheet.SPECIES_LIST

    readonly property string configDir: {
        const envDir = Quickshell.env("QS_VPETS_CONFIG_DIR");
        if (envDir && envDir.length > 0) return envDir;
        const xdg = Quickshell.env("XDG_CONFIG_HOME");
        const base = xdg && xdg.length > 0 ? xdg : (Quickshell.env("HOME") + "/.config");
        return base + "/qs-vpets";
    }

    readonly property string stateDir: {
        const envDir = Quickshell.env("QS_VPETS_STATE_DIR");
        if (envDir && envDir.length > 0) return envDir;
        const xdg = Quickshell.env("XDG_STATE_HOME");
        const base = xdg && xdg.length > 0 ? xdg : (Quickshell.env("HOME") + "/.local/state");
        return base + "/qs-vpets";
    }

    readonly property string configPath: configDir + "/config.json"

    property string _lastSavedJson: ""
    property string _pendingJson: ""
    property bool _dirsCreated: false

    signal configReady

    function _slug(name: string): string {
        return String(name || "pet").toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "pet";
    }

    function _normalizePets(list: var): var {
        if (!Array.isArray(list)) return root.pets;
        const usedIds = {};
        const out = [];
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            if (!p || typeof p !== "object") continue;
            const name = String(p.name || ("Pet " + (i + 1))).trim() || ("Pet " + (i + 1));
            let id = String(p.id || _slug(name));
            let suffix = 2;
            while (usedIds[id]) {
                id = _slug(name) + "-" + suffix++;
            }
            usedIds[id] = true;
            const sprite = SpriteSheet.SPECIES_LIST.indexOf(p.sprite) !== -1 ? p.sprite : "zorua";
            const rawRoam = String(p.roamMode || "auto");
            const roamMode = (rawRoam === "always" || rawRoam === "penned") ? rawRoam : "auto";
            out.push({
                id: id,
                name: name,
                sprite: sprite,
                personality: p.personality || SpriteSheet.SPECIES_TEMPERAMENT[sprite] || "emergent",
                scale: Math.max(1, Math.min(5, Math.round(Number(p.scale) || 2))),
                monitor: p.monitor ? String(p.monitor) : "",
                roamMode: roamMode,
                color: p.color || "#cba6f7",
                traits: p.traits || null,
                actions: p.actions || {}
            });
        }
        return out;
    }

    function _matchesPet(p: var, idOrName: string): bool {
        if (!p || !idOrName) return false;
        const q = String(idOrName).trim().toLowerCase();
        return String(p.id).toLowerCase() === q || String(p.name).toLowerCase() === q;
    }

    function _serialize(): string {
        return JSON.stringify({
            pets: root.pets,
            behavior: {
                idleTimeout: root.idleTimeout,
                walkSpeed: root.walkSpeed,
                showEmotes: root.showEmotes,
                enablePerching: root.enablePerching,
                enableMusicReact: root.enableMusicReact,
                maxActiveRoaming: root.maxActiveRoaming
            }
        }, null, 2);
    }

    function save(): void {
        saveTimer.restart();
    }

    function flush(): void {
        if (!saveTimer.running && root._pendingJson === root._lastSavedJson && root._lastSavedJson.length > 0) {
            return;
        }
        saveTimer.stop();
        root._pendingJson = root._serialize();
        root._lastSavedJson = root._pendingJson;
        if (root._dirsCreated) {
            configFile.setText(root._pendingJson);
        }
    }

    function load(): void {
        const raw = configFile.text();
        if (!raw || !raw.trim() || raw === root._lastSavedJson) return;
        try {
            const data = JSON.parse(raw);
            if (Array.isArray(data.pets)) root.pets = root._normalizePets(data.pets);
            if (data.behavior && typeof data.behavior === "object") {
                const b = data.behavior;
                if (b.idleTimeout !== undefined) root.idleTimeout = Math.max(30, Number(b.idleTimeout) || 300);
                if (b.walkSpeed !== undefined) root.walkSpeed = Math.max(30, Math.min(400, Number(b.walkSpeed) || 72));
                if (b.showEmotes !== undefined) root.showEmotes = !!b.showEmotes;
                if (b.enablePerching !== undefined) root.enablePerching = !!b.enablePerching;
                if (b.enableMusicReact !== undefined) root.enableMusicReact = !!b.enableMusicReact;
                if (b.maxActiveRoaming !== undefined) {
                    root.maxActiveRoaming = Math.max(1, Math.min(10, Math.round(Number(b.maxActiveRoaming) || 3)));
                }
            }
        } catch (e) {
            console.warn("qs-vpets: failed to parse config.json:", e);
        }
    }

    function addPet(species: string, customName: string, preset: string, roamMode = "auto"): var {
        const sp = SpriteSheet.SPECIES_LIST.indexOf(species) !== -1 ? species : "zorua";
        const defaultName = customName && customName.trim().length > 0
            ? customName.trim()
            : (sp.charAt(0).toUpperCase() + sp.slice(1));
        let finalName = defaultName;
        let idx = 2;
        while (root.pets.some(p => p.name.toLowerCase() === finalName.toLowerCase())) {
            finalName = defaultName + " " + idx++;
        }
        const rm = (roamMode === "always" || roamMode === "penned") ? roamMode : "auto";
        const entry = {
            id: _slug(finalName) + "-" + Date.now().toString(36).slice(-4),
            name: finalName,
            sprite: sp,
            personality: preset || "emergent",
            scale: 2,
            monitor: "",
            roamMode: rm,
            actions: {}
        };
        root.pets = root._normalizePets(root.pets.concat([entry]));
        root.save();
        root.configReady();
        return entry;
    }

    function removePet(idOrName: string): bool {
        if (root.pets.length <= 1) return false;
        const next = root.pets.filter(p => !root._matchesPet(p, idOrName));
        if (next.length === root.pets.length) return false;
        root.pets = next;
        root.save();
        root.configReady();
        return true;
    }

    function renamePet(idOrName: string, newName: string): string {
        const trimmed = String(newName || "").trim();
        if (!trimmed) return "";
        const target = root.pets.find(p => root._matchesPet(p, idOrName));
        if (!target) return "";
        let finalName = trimmed;
        let idx = 2;
        while (root.pets.some(p => p.id !== target.id && p.name.toLowerCase() === finalName.toLowerCase())) {
            finalName = trimmed + " " + idx++;
        }
        if (finalName === target.name) return finalName;
        root.pets = root.pets.map(p => p.id === target.id ? Object.assign({}, p, { name: finalName }) : p);
        root.save();
        root.configReady();
        return finalName;
    }

    function updatePetSpecies(idOrName: string, species: string): void {
        if (SpriteSheet.SPECIES_LIST.indexOf(species) === -1) return;
        root.pets = root.pets.map(p => root._matchesPet(p, idOrName) ? Object.assign({}, p, { sprite: species }) : p);
        root.save();
        root.configReady();
    }

    function updatePetScale(idOrName: string, scale: int): void {
        const s = Math.max(1, Math.min(5, scale));
        root.pets = root.pets.map(p => root._matchesPet(p, idOrName) ? Object.assign({}, p, { scale: s }) : p);
        root.save();
        root.configReady();
    }

    function updatePetRoamMode(idOrName: string, mode: string): bool {
        if (mode !== "auto" && mode !== "always" && mode !== "penned") return false;
        let changed = false;
        root.pets = root.pets.map(p => {
            if (!root._matchesPet(p, idOrName)) return p;
            changed = true;
            return Object.assign({}, p, { roamMode: mode });
        });
        if (!changed) return false;
        root.save();
        root.configReady();
        return true;
    }

    function updatePetMonitor(idOrName: string, monitorName: string): void {
        const m = String(monitorName || "");
        root.pets = root.pets.map(p => root._matchesPet(p, idOrName) ? Object.assign({}, p, { monitor: m }) : p);
        root.save();
        root.configReady();
    }

    function updateMaxRoaming(count: int): void {
        root.maxActiveRoaming = Math.max(1, Math.min(10, count));
        root.save();
        root.configReady();
    }

    Timer {
        id: saveTimer
        interval: 350
        onTriggered: {
            root._pendingJson = root._serialize();
            root._lastSavedJson = root._pendingJson;
            if (!root._dirsCreated) {
                initDirsProc.running = true;
            } else {
                configFile.setText(root._pendingJson);
            }
        }
    }

    Process {
        id: initDirsProc
        command: ["mkdir", "-p", root.configDir, root.stateDir]
        onExited: {
            root._dirsCreated = true;
            if (root._pendingJson.length > 0) {
                configFile.setText(root._pendingJson);
            }
        }
    }

    Component.onCompleted: {
        root.pets = root._normalizePets(root.pets);
        initDirsProc.running = true;
    }

    FileView {
        id: configFile
        path: root.configPath
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
        onLoaded: {
            root.load();
            root.ready = true;
            root.configReady();
        }
        onLoadFailed: err => {
            if (err !== FileViewError.FileNotFound) {
                console.warn("qs-vpets: config read failed:", err);
            }
            root.ready = true;
            root.save();
            root.configReady();
        }
    }
}
