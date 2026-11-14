pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import "../config"
import "../components/PetPersistence.js" as Persist
import "../components/ai/Memory.js" as Memory
import "../components/ai/Sanctuary.js" as Sanctuary

Singleton {
    id: root

    property var pets: []
    property var residentsById: ({})
    property int residentRevision: 0
    property var roamingIds: []
    property bool hidden: false
    property var inspectedPet: null

    property bool penVisible: false
    property string penSelectedPetId: ""
    readonly property bool _openOnStart: Quickshell.env("QS_VPETS_OPEN_ON_START") === "1"
    property bool _didOpenOnStart: false

    property double lastAmbientEmoteMs: 0
    property double lastSocialBoutMs: 0
    property bool _initialPartyPicked: false
    property double _lastRotationMs: 0
    property double _lastSanctuaryTickMs: Date.now()
    property int _sanctuarySaveTicks: 0
    property var _arrivingIds: ({})
    property var _knownConfigIds: ({})

    // Cross-monitor drag preview state so dragging across displays is visually seamless.
    property bool dragGhostActive: false
    property var dragGhostScreen: null
    property real dragGhostX: 0
    property real dragGhostY: 0
    property int dragGhostSize: 64
    property string dragGhostSprite: ""
    property bool dragGhostMirror: false

    function allowAmbientEmote(): bool {
        const now = Date.now();
        if (now - lastAmbientEmoteMs < 45000) return false;
        lastAmbientEmoteMs = now;
        return true;
    }

    function allowSocialBout(minGapMs = 135000): bool {
        return (Date.now() - lastSocialBoutMs) >= minGapMs;
    }

    function claimSocialBout(minGapMs = 135000): bool {
        const now = Date.now();
        if (now - lastSocialBoutMs < minGapMs) return false;
        lastSocialBoutMs = now;
        return true;
    }

    function _envSnapshot(): var {
        const now = new Date();
        const hr = now.getHours();
        return {
            hour: hr,
            isNight: hr >= 23 || hr < 6,
            mediaPlaying: MediaTracker.isPlaying,
            isCode: Memory.isCodeWindow(WindowTracker.activeWindowClass || ""),
            fullscreen: WindowTracker.isFullscreen
        };
    }

    function _residentStateMap(): var {
        const out = {};
        const keys = Object.keys(residentsById);
        for (let i = 0; i < keys.length; i++) {
            const r = residentsById[keys[i]];
            if (r && r.stateObj) out[keys[i]] = r.stateObj;
        }
        return out;
    }

    function _livePetMap(): var {
        const out = {};
        for (let i = 0; i < pets.length; i++) {
            const p = pets[i];
            if (p && p.petData && p.petData.id) out[p.petData.id] = p;
        }
        return out;
    }

    function registerResident(id: string, rec: var): void {
        const next = Object.assign({}, residentsById);
        next[id] = rec;
        residentsById = next;
        residentRevision++;
        if (Config.ready && !_initialPartyPicked) initBootTimer.restart();
    }

    function unregisterResident(id: string, rec: var): void {
        if (residentsById[id] !== rec) return;
        const next = Object.assign({}, residentsById);
        delete next[id];
        residentsById = next;
        residentRevision++;
    }

    function residentFor(id: string): var {
        return residentsById[id] ?? null;
    }

    function onResidentLoaded(id: string): void {
        residentRevision++;
        const lp = findPetById(id);
        const rec = residentsById[id];
        if (lp && rec && !lp._loadedState) {
            lp._loadedState = rec.applyToPet(lp);
            lp._stateReady = true;
        }
        if (Config.ready && !_initialPartyPicked) {
            const allLoaded = Config.pets.every(c => residentsById[c.id] && residentsById[c.id].loaded);
            if (allLoaded) _ensureInitialParty();
        }
    }

    function _ensureInitialParty(): void {
        if (_initialPartyPicked || !Config.ready) return;
        _initialPartyPicked = true;
        const known = {};
        for (let i = 0; i < Config.pets.length; i++) known[Config.pets[i].id] = true;
        _knownConfigIds = known;
        roamingIds = Sanctuary.selectInitialRoaming(
            Config.pets,
            _residentStateMap(),
            Config.maxActiveRoaming,
            _envSnapshot(),
            Date.now()
        );
        _lastRotationMs = Date.now();
        if (root._openOnStart && !root._didOpenOnStart) {
            root._didOpenOnStart = true;
            Qt.callLater(() => root.openPen());
        }
    }

    function flushAll(): void {
        for (let i = 0; i < root.pets.length; i++) {
            const lp = root.pets[i];
            if (!lp || !lp._stateReady || !lp.petData) continue;
            const rec = root.residentFor(lp.petData.id);
            if (rec) rec.syncFromPet(lp, true);
            else Persist.save(lp);
        }
        const rKeys = Object.keys(root.residentsById);
        for (let i = 0; i < rKeys.length; i++) {
            const rec = root.residentsById[rKeys[i]];
            if (rec) rec.saveIfDirty();
        }
        Config.flush();
    }

    function isRoaming(id: string): bool {
        return roamingIds.indexOf(id) !== -1;
    }

    function consumeArrivalFlag(id: string): bool {
        if (!_arrivingIds[id]) return false;
        const next = Object.assign({}, _arrivingIds);
        delete next[id];
        _arrivingIds = next;
        return true;
    }

    function callOutNow(id: string): bool {
        const cfg = Config.pets.find(p => p.id === id);
        if (!cfg) return false;
        if (cfg.roamMode === "penned") {
            Config.updatePetRoamMode(id, "auto");
        }
        if (isRoaming(id)) return true;

        // If calling out an "auto" pet while auto slots are full, tuck the sleepiest auto pet in.
        const mode = cfg.roamMode === "always" ? "always" : "auto";
        if (mode === "auto") {
            let alwaysCount = 0;
            const activeAuto = [];
            for (let i = 0; i < roamingIds.length; i++) {
                const rid = roamingIds[i];
                const rc = Config.pets.find(p => p.id === rid);
                if (!rc) continue;
                if (rc.roamMode === "always") alwaysCount++;
                else activeAuto.push(rid);
            }
            const openAuto = Math.max(1, Config.maxActiveRoaming - alwaysCount);
            if (activeAuto.length >= openAuto && activeAuto.length > 0) {
                let retireTarget = activeAuto[0];
                let maxFatigue = -1;
                const liveMap = _livePetMap();
                for (let j = 0; j < activeAuto.length; j++) {
                    const lp = liveMap[activeAuto[j]];
                    const fat = lp ? (lp.restDrive * 0.7 + (1 - lp.alertness) * 0.3) : 0.5;
                    if (fat > maxFatigue) {
                        maxFatigue = fat;
                        retireTarget = activeAuto[j];
                    }
                }
                sendToPenNow(retireTarget, false);
            }
        }

        const arr = Object.assign({}, _arrivingIds);
        arr[id] = true;
        _arrivingIds = arr;
        if (!isRoaming(id)) roamingIds = roamingIds.concat([id]);
        _lastRotationMs = Date.now();
        return true;
    }

    function sendToPenNow(id: string, walkFirst = false): bool {
        const cfg = Config.pets.find(p => p.id === id);
        if (!cfg) return false;
        if (cfg.roamMode === "always") {
            Config.updatePetRoamMode(id, "auto");
        }
        if (!isRoaming(id)) return true;
        const lp = findPetById(id);
        if (walkFirst && lp && lp.beginRetireToPen) {
            lp.beginRetireToPen();
            return true;
        }
        if (lp) {
            const rec = residentFor(id);
            if (rec) {
                rec.syncFromPet(lp, false);
                rec.markEnteredPen("Resting cozily in the Sanctuary pen");
            }
        } else {
            const rec = residentFor(id);
            if (rec) rec.markEnteredPen("Resting cozily in the Sanctuary pen");
        }
        if (inspectedPet && inspectedPet.petData && inspectedPet.petData.id === id) {
            closeInspector();
        }
        roamingIds = roamingIds.filter(rid => rid !== id);
        return true;
    }

    function completeRetire(id: string): void {
        const lp = findPetById(id);
        const rec = residentFor(id);
        if (lp && rec) {
            rec.syncFromPet(lp, false);
            rec.markEnteredPen("Curled up in the Sanctuary after roaming");
        } else if (rec) {
            rec.markEnteredPen("Curled up in the Sanctuary after roaming");
        }
        if (inspectedPet && inspectedPet.petData && inspectedPet.petData.id === id) {
            closeInspector();
        }
        roamingIds = roamingIds.filter(rid => rid !== id);
        _lastRotationMs = Date.now();
    }

    function _reconcileConfigChange(): void {
        if (!Config.ready) return;
        if (!_initialPartyPicked) {
            initBootTimer.restart();
            return;
        }
        const validSet = {};
        for (let i = 0; i < Config.pets.length; i++) validSet[Config.pets[i].id] = true;

        let nextRoaming = roamingIds.filter(id => !!validSet[id]);

        // Check for newly adopted pets: bring them straight out if mode allows and slots permit!
        const nextKnown = Object.assign({}, _knownConfigIds);
        for (let i = 0; i < Config.pets.length; i++) {
            const cfg = Config.pets[i];
            if (!nextKnown[cfg.id]) {
                nextKnown[cfg.id] = true;
                if (cfg.roamMode === "always" || (cfg.roamMode !== "penned" && nextRoaming.length < Config.maxActiveRoaming)) {
                    const arr = Object.assign({}, _arrivingIds);
                    arr[cfg.id] = true;
                    _arrivingIds = arr;
                    nextRoaming.push(cfg.id);
                }
            }
        }
        _knownConfigIds = nextKnown;
        if (JSON.stringify(nextRoaming) !== JSON.stringify(roamingIds)) {
            roamingIds = nextRoaming;
        }
        if (penSelectedPetId && !validSet[penSelectedPetId]) {
            penSelectedPetId = Config.pets.length > 0 ? Config.pets[0].id : "";
        }
        _evaluateRotationStep();
    }

    function _evaluateRotationStep(): void {
        if (!_initialPartyPicked || Config.pets.length === 0) return;
        const now = Date.now();
        const decision = Sanctuary.evaluateRotation(
            Config.pets,
            _residentStateMap(),
            _livePetMap(),
            roamingIds,
            Config.maxActiveRoaming,
            _lastRotationMs,
            _envSnapshot(),
            now
        );
        if (decision.spawnId && !isRoaming(decision.spawnId)) {
            const arr = Object.assign({}, _arrivingIds);
            arr[decision.spawnId] = true;
            _arrivingIds = arr;
            roamingIds = roamingIds.concat([decision.spawnId]);
            _lastRotationMs = now;
        } else if (decision.retireId && isRoaming(decision.retireId)) {
            if (decision.immediate) {
                sendToPenNow(decision.retireId, false);
            } else {
                const lp = findPetById(decision.retireId);
                if (lp && lp.beginRetireToPen) lp.beginRetireToPen();
                else completeRetire(decision.retireId);
            }
            _lastRotationMs = now;
        }
    }

    function register(pet: var): void {
        if (pets.indexOf(pet) === -1) pets = pets.concat([pet]);
        _syncCursorTracking();
    }

    function unregister(pet: var): void {
        if (inspectedPet === pet) inspectedPet = null;
        pets = pets.filter(p => p !== pet);
        _syncCursorTracking();
    }

    function toggleInspector(pet: var): void {
        inspectedPet = (inspectedPet === pet) ? null : pet;
    }

    function closeInspector(): void {
        inspectedPet = null;
    }

    function openPen(selectId = ""): void {
        if (selectId) {
            penSelectedPetId = selectId;
        } else if (!penSelectedPetId && Config.pets.length > 0) {
            penSelectedPetId = roamingIds.length > 0 ? roamingIds[0] : Config.pets[0].id;
        }
        closeInspector();
        penVisible = true;
    }

    function closePen(): void {
        penVisible = false;
    }

    function togglePen(): void {
        if (penVisible) closePen();
        else openPen();
    }

    function renameCompanion(idOrName: string, newName: string): string {
        const target = Config.pets.find(p =>
            p.id.toLowerCase() === String(idOrName).trim().toLowerCase()
            || p.name.toLowerCase() === String(idOrName).trim().toLowerCase()
        );
        if (!target) return "";
        const oldName = target.name;
        const finalName = Config.renamePet(target.id, newName);
        if (!finalName || finalName === oldName) return finalName;

        for (let i = 0; i < pets.length; i++) {
            const lp = pets[i];
            if (lp && lp.relationships && lp.relationships[oldName] !== undefined) {
                const nextRel = Object.assign({}, lp.relationships);
                nextRel[finalName] = nextRel[oldName];
                delete nextRel[oldName];
                lp.relationships = nextRel;
            }
        }
        const rKeys = Object.keys(residentsById);
        for (let i = 0; i < rKeys.length; i++) {
            const rec = residentsById[rKeys[i]];
            if (rec) rec.rekeyRelationship(oldName, finalName);
        }
        return finalName;
    }

    function updateDragGhost(scr: var, lx: real, ly: real, size: int, spriteName: string, mirror: bool): void {
        dragGhostScreen = scr;
        dragGhostX = lx;
        dragGhostY = ly;
        dragGhostSize = size;
        dragGhostSprite = spriteName;
        dragGhostMirror = mirror;
        dragGhostActive = scr !== null;
    }

    function clearDragGhost(): void {
        dragGhostActive = false;
        dragGhostScreen = null;
    }

    function findPetById(id: string): var {
        for (let i = 0; i < pets.length; i++) {
            if (pets[i].petData && pets[i].petData.id === id) return pets[i];
        }
        return null;
    }

    function findPet(nameOrEmpty: string): var {
        if (pets.length === 0) return null;
        if (!nameOrEmpty || nameOrEmpty.trim() === "") return pets[0];
        const q = nameOrEmpty.trim().toLowerCase();
        for (let i = 0; i < pets.length; i++) {
            if (String(pets[i].petData.name).toLowerCase() === q
                    || String(pets[i].petData.id).toLowerCase() === q) {
                return pets[i];
            }
        }
        return null;
    }

    function findConfigPet(nameOrId: string): var {
        if (!nameOrId || !nameOrId.trim()) return Config.pets.length > 0 ? Config.pets[0] : null;
        const q = nameOrId.trim().toLowerCase();
        return Config.pets.find(p => p.name.toLowerCase() === q || p.id.toLowerCase() === q) ?? null;
    }

    function _syncCursorTracking(): void {
        let fast = false;
        for (let i = 0; i < pets.length; i++) {
            const p = pets[i];
            const planName = p.activePlan ? p.activePlan.name : "";
            if (planName === "bid_attention" || planName === "chase_cursor" || p.state_ === "drag") {
                fast = true;
                break;
            }
            if (InputTracker.cursorKnown && p.state_ !== "deepsleep") {
                const d = Math.hypot((p.screenX() + p.worldX) - InputTracker.cursorX,
                                     (p.screenY() + p.worldY) - InputTracker.cursorY);
                if (d < 420) {
                    fast = true;
                    break;
                }
            }
        }
        InputTracker.fastTracking = fast;
    }

    Timer {
        id: initBootTimer
        interval: 380
        onTriggered: root._ensureInitialParty()
    }

    Timer {
        interval: 1500
        running: true
        repeat: true
        onTriggered: root._syncCursorTracking()
    }

    Timer {
        interval: 18000
        running: true
        repeat: true
        onTriggered: {
            root._evaluateRotationStep();
        }
    }

    Timer {
        interval: 30000
        running: true
        repeat: true
        onTriggered: {
            const now = Date.now();
            const dt = Math.min(90, Math.max(1, (now - root._lastSanctuaryTickMs) / 1000));
            root._lastSanctuaryTickMs = now;
            const env = root._envSnapshot();

            // Mirror live pets into their ResidentRecords for live Sanctuary GUI accuracy.
            for (let i = 0; i < root.pets.length; i++) {
                const lp = root.pets[i];
                if (lp && lp._stateReady && lp.petData) {
                    const rec = root.residentFor(lp.petData.id);
                    if (rec) rec.syncFromPet(lp, false);
                }
            }

            // Integrate off-screen Sanctuary companions!
            const pennedRecords = [];
            const penMates = [];
            for (let i = 0; i < Config.pets.length; i++) {
                const cid = Config.pets[i].id;
                if (!root.isRoaming(cid)) {
                    const r = root.residentFor(cid);
                    if (r && r.loaded) {
                        pennedRecords.push(r);
                        penMates.push(r.stateObj);
                    }
                }
            }
            const saveBatch = (++root._sanctuarySaveTicks % 2) === 0;
            for (let i = 0; i < pennedRecords.length; i++) {
                pennedRecords[i].stepSanctuary(dt, penMates, env, now);
                if (saveBatch) pennedRecords[i].saveIfDirty();
            }
        }
    }

    Connections {
        target: Config
        function onConfigReady(): void { root._reconcileConfigChange(); }
    }

    IpcHandler {
        target: "vpets"

        function status(): string {
            const sanctuaryList = [];
            for (let i = 0; i < Config.pets.length; i++) {
                const cfg = Config.pets[i];
                if (!root.isRoaming(cfg.id)) {
                    const rec = root.residentFor(cfg.id);
                    sanctuaryList.push({
                        name: cfg.name,
                        species: cfg.sprite,
                        roamMode: cfg.roamMode || "auto",
                        archetype: rec ? rec.archetype : "Curious Hatchling",
                        state: rec ? rec.penState : "idle",
                        activity: rec ? rec.sanctuaryActivity : "Resting in Sanctuary",
                        mood: Math.round((rec ? rec.mood : 0.56) * 100),
                        energy: Math.round((1 - (rec ? rec.restDrive : 0.14)) * 100),
                        bond: Math.round((rec ? rec.bond : 0.3) * 100)
                    });
                }
            }
            return JSON.stringify({
                hidden: root.hidden,
                penVisible: root.penVisible,
                maxActiveRoaming: Config.maxActiveRoaming,
                totalCount: Config.pets.length,
                roamingCount: root.pets.length,
                sanctuaryCount: sanctuaryList.length,
                pets: root.pets.map(p => ({
                    name: p.petData.name,
                    species: p.petData.sprite,
                    roamMode: p.petData.roamMode || "auto",
                    archetype: p.archetype,
                    state: p.state_,
                    mood: Math.round(p.mood * 100),
                    bond: Math.round(p.bond * 100),
                    trust: Math.round(p.trust * 100),
                    plan: p.activePlan ? p.activePlan.label : "Idle",
                    thought: p.lastThoughtText,
                    quirks: p.quirks
                })),
                sanctuary: sanctuaryList
            }, null, 2);
        }

        function open(): string {
            root.hidden = false;
            root.openPen();
            return "opened";
        }

        function pen(): string {
            root.togglePen();
            return root.penVisible ? "opened" : "closed";
        }

        function flush(): string {
            root.flushAll();
            return "flushed";
        }

        function toggle(): string {
            root.hidden = !root.hidden;
            if (root.hidden) root.closeInspector();
            return root.hidden ? "hidden" : "visible";
        }

        function pet(name: string): string {
            const lp = root.findPet(name);
            if (lp) {
                lp.onStroked();
                return "petted " + lp.petData.name;
            }
            const cfg = root.findConfigPet(name);
            const rec = cfg ? root.residentFor(cfg.id) : null;
            if (cfg && rec) {
                rec.patInPen();
                return "petted " + cfg.name + " in Sanctuary";
            }
            return "not found";
        }

        function feed(name: string): string {
            const lp = root.findPet(name);
            if (lp) {
                lp.onFed();
                return "fed " + lp.petData.name;
            }
            const cfg = root.findConfigPet(name);
            const rec = cfg ? root.residentFor(cfg.id) : null;
            if (cfg && rec) {
                rec.feedInPen();
                return "fed " + cfg.name + " in Sanctuary";
            }
            return "not found";
        }

        function play(name: string): string {
            const lp = root.findPet(name);
            if (lp) {
                lp.onPlayTriggered();
                return "playing with " + lp.petData.name;
            }
            const cfg = root.findConfigPet(name);
            const rec = cfg ? root.residentFor(cfg.id) : null;
            if (cfg && rec) {
                rec.playInPen();
                return "played with " + cfg.name + " in Sanctuary";
            }
            return "not found";
        }

        function summon(name: string): string {
            const lp = root.findPet(name);
            if (lp) {
                lp.summonToCursor();
                return "summoned " + lp.petData.name;
            }
            const cfg = root.findConfigPet(name);
            if (cfg) {
                root.callOutNow(cfg.id);
                return "called " + cfg.name + " out from Sanctuary";
            }
            return "not found";
        }

        function roam(name: string, mode: string): string {
            const cfg = root.findConfigPet(name);
            if (!cfg) return "not found";
            const m = String(mode || "").trim().toLowerCase();
            if (m === "out" || m === "call") {
                root.callOutNow(cfg.id);
                return cfg.name + " called out to roam";
            }
            if (m === "in" || m === "pen") {
                root.sendToPenNow(cfg.id, false);
                return cfg.name + " sent to Sanctuary";
            }
            if (m !== "auto" && m !== "always" && m !== "penned") {
                return "invalid mode (use auto, always, penned, out, or in)";
            }
            Config.updatePetRoamMode(cfg.id, m);
            return cfg.name + " roamMode=" + m;
        }

        function rename(oldName: string, newName: string): string {
            const updated = root.renameCompanion(oldName, newName);
            if (!updated) return "rename failed";
            return "renamed to " + updated;
        }

        function inspect(name: string): string {
            const lp = root.findPet(name);
            if (lp) {
                root.toggleInspector(lp);
                return root.inspectedPet === lp ? ("opened " + lp.petData.name) : "closed";
            }
            const cfg = root.findConfigPet(name);
            if (cfg) {
                root.openPen(cfg.id);
                return "opened Sanctuary for " + cfg.name;
            }
            return "not found";
        }

        function spawn(species: string, name: string): string {
            const added = Config.addPet(species, name, "emergent");
            return "spawned " + added.name + " (" + added.sprite + ")";
        }
    }
}
