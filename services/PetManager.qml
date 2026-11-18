pragma Singleton
pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Io
import "../config"
import "../components/SpeciesProfile.js" as SpeciesProfile
import "../components/behavior/Memory.js" as Memory
import "../components/behavior/Sanctuary.js" as Sanctuary
import "../components/behavior/Evolution.js" as Evolution
import "../components/behavior/Plans.js" as Plans

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
    property bool _reconciling: false
    property bool _evaluatingRotation: false
    property double _lastRotationMs: 0
    property double _lastSanctuaryTickMs: Date.now()
    property int _sanctuarySaveTicks: 0
    property var _arrivingIds: ({})
    property var _knownConfigIds: ({})
    property var _pendingUnlinkPaths: []
    property var vacatedWarmSpots: []
    property string _affectionPetId: ""
    property int _affectionStreak: 0
    property double _lastAffectionMs: 0

    property bool dragGhostActive: false
    property var dragGhostScreen: null
    property real dragGhostX: 0
    property real dragGhostY: 0
    property int dragGhostSize: 64
    property string dragGhostSprite: ""
    property bool dragGhostMirror: false

    onHiddenChanged: _syncSamplingState()
    onPenVisibleChanged: _syncSamplingState()

    function _syncSamplingState(): void {
        SystemMonitor.activeSampling = !root.hidden || root.penVisible;
        _syncCursorTracking();
    }

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
            solarPhase: SystemMonitor.solarPhase,
            isDawn: SystemMonitor.solarPhase === "dawn",
            isDusk: SystemMonitor.solarPhase === "dusk",
            weatherKind: SystemMonitor.weatherKind,
            isRaining: SystemMonitor.isRaining,
            isSnowing: SystemMonitor.isSnowing,
            thermalWarmth: SystemMonitor.thermalWarmth,
            lowBattery: SystemMonitor.lowBattery,
            micActive: MediaTracker.micActive,
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
            if (r && !r._released && r.stateObj) out[keys[i]] = r.stateObj;
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
            lp._loadedState = rec.hasSavedState ? rec.applyToPet(lp) : false;
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
            if (rec && !rec._released) rec.syncFromPet(lp, true);
        }
        const rKeys = Object.keys(root.residentsById);
        for (let i = 0; i < rKeys.length; i++) {
            const rec = root.residentsById[rKeys[i]];
            if (rec && !rec._released) rec.saveIfDirty();
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
        const cfg = Config.petById(id);
        if (!cfg) return false;
        if (cfg.roamMode === "penned") {
            Config.updatePetRoamMode(id, "auto");
        }
        if (isRoaming(id)) {
            const existing = findPetById(id);
            if (existing && existing.cancelRetireIfInterrupted) {
                existing.cancelRetireIfInterrupted();
            }
            return true;
        }

        const mode = cfg.roamMode === "always" ? "always" : "auto";
        if (mode === "auto") {
            let alwaysCount = 0;
            const activeAuto = [];
            for (let i = 0; i < roamingIds.length; i++) {
                const rid = roamingIds[i];
                const rc = Config.petById(rid);
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
        const cfg = Config.petById(id);
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
        const rec = residentFor(id);
        if (lp && rec && !rec._released) {
            rec.syncFromPet(lp, false);
            rec.markEnteredPen("Resting quietly in the Sanctuary clearing");
        } else if (rec && !rec._released) {
            rec.markEnteredPen("Resting quietly in the Sanctuary clearing");
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
        if (lp && rec && !rec._released) {
            rec.syncFromPet(lp, false);
            rec.markEnteredPen("Curled up in the Sanctuary after roaming");
        } else if (rec && !rec._released) {
            rec.markEnteredPen("Curled up in the Sanctuary after roaming");
        }
        if (inspectedPet && inspectedPet.petData && inspectedPet.petData.id === id) {
            closeInspector();
        }
        roamingIds = roamingIds.filter(rid => rid !== id);
        _lastRotationMs = Date.now();
    }

    function _reconcileConfigChange(): void {
        if (!Config.ready || _reconciling) return;
        if (!_initialPartyPicked) {
            initBootTimer.restart();
            return;
        }
        _reconciling = true;
        try {
            const validSet = {};
            for (let i = 0; i < Config.pets.length; i++) validSet[Config.pets[i].id] = true;

            let nextRoaming = roamingIds.filter(id => !!validSet[id]);

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
            const knownKeys = Object.keys(nextKnown);
            for (let k = 0; k < knownKeys.length; k++) {
                if (!validSet[knownKeys[k]]) delete nextKnown[knownKeys[k]];
            }
            _knownConfigIds = nextKnown;
            if (JSON.stringify(nextRoaming) !== JSON.stringify(roamingIds)) {
                roamingIds = nextRoaming;
            }
            if (penSelectedPetId && !validSet[penSelectedPetId]) {
                penSelectedPetId = Config.pets.length > 0 ? Config.pets[0].id : "";
            }
        } finally {
            _reconciling = false;
        }
        _evaluateRotationStep();
    }

    function _evaluateRotationStep(): void {
        if (!_initialPartyPicked || _evaluatingRotation || Config.pets.length === 0) return;
        _evaluatingRotation = true;
        try {
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
                    if (!lp || !tryPairRetire(decision.retireId)) {
                        if (lp && lp.beginRetireToPen) lp.beginRetireToPen();
                        else completeRetire(decision.retireId);
                    }
                }
                _lastRotationMs = now;
            }
        } finally {
            _evaluatingRotation = false;
        }
    }

    function notifySanctuaryArrival(arrivingPet: var): void {
        if (!arrivingPet || !arrivingPet.petData) return;
        const sx = arrivingPet.screenX(), sy = arrivingPet.screenY();
        const aName = arrivingPet.petData.name;
        let bestFriend = null;
        let bestAff = 0.64;
        for (let i = 0; i < pets.length; i++) {
            const p = pets[i];
            if (!p || p === arrivingPet || p._retiringToPen) continue;
            if (p.screenX() !== sx || p.screenY() !== sy) continue;
            if (p.state_ !== "idle" && p.state_ !== "wander") continue;
            if (p.activePlan) continue;
            const rel = Memory.relationWith(p, aName, arrivingPet.personality, arrivingPet.petData.sprite);
            if (rel.affinity >= bestAff && rel.familiarity >= 0.25) {
                bestAff = rel.affinity;
                bestFriend = p;
            }
        }
        if (bestFriend && bestFriend.socialEvent) {
            bestFriend.socialEvent("friend_arrived", arrivingPet);
        } else if (bestFriend && bestFriend.greetSanctuaryArrival) {
            bestFriend.greetSanctuaryArrival(arrivingPet);
        }
    }

    function recordVacatedWarmSpot(pet: var, gx: real, gy: real): void {
        if (!pet || !pet.petData) return;
        const now = Date.now();
        const fresh = [];
        for (let i = 0; i < vacatedWarmSpots.length; i++) {
            const ws = vacatedWarmSpots[i];
            if (ws && (now - ws.time) < 28000 && ws.petName !== pet.petData.name) {
                fresh.push(ws);
            }
        }
        const spWarm = SpeciesProfile.hasAbility(pet, "hearth_warmth") ? 0.22 : 0;
        fresh.push({
            gx: gx,
            gy: gy,
            petName: pet.petData.name,
            warmth: Math.min(1, 0.55 + spWarm + SystemMonitor.thermalWarmth * 0.25),
            time: now
        });
        vacatedWarmSpots = fresh.slice(-8);
    }

    function recordUserAffection(pet: var): void {
        if (!pet || !pet.petData) return;
        const now = Date.now();
        const pid = pet.petData.id || pet.petData.name;
        if (pid === _affectionPetId && (now - _lastAffectionMs) < 25000) {
            _affectionStreak += 1;
        } else {
            _affectionPetId = pid;
            _affectionStreak = 1;
        }
        _lastAffectionMs = now;
        if (_affectionStreak < 2) return;

        const sx = pet.screenX(), sy = pet.screenY();
        const px = sx + pet.worldX, py = sy + pet.worldY;
        for (let i = 0; i < pets.length; i++) {
            const o = pets[i];
            if (!o || o === pet || o._retiringToPen || o.state_ === "drag" || o.state_ === "airborne") continue;
            if (o.screenX() !== sx || o.screenY() !== sy) continue;
            if (Math.hypot((sx + o.worldX) - px, (sy + o.worldY) - py) <= 340) {
                o.socialEvent("peer_pampered", pet);
            }
        }
    }

    function notifyPetDragBegan(draggedPet: var): void {
        if (!draggedPet) return;
        const sx = draggedPet.screenX(), sy = draggedPet.screenY();
        const dx = sx + draggedPet.worldX, dy = sy + draggedPet.worldY;
        for (let i = 0; i < pets.length; i++) {
            const o = pets[i];
            if (!o || o === draggedPet || o._retiringToPen) continue;
            if (o.screenX() !== sx || o.screenY() !== sy) continue;
            if (Math.hypot((sx + o.worldX) - dx, (sy + o.worldY) - dy) <= 460) {
                o.socialEvent("friend_lifted", draggedPet);
            }
        }
    }

    function notifyPetTossLanded(landedPet: var, speed: real, cleanLanding: bool): void {
        if (!landedPet) return;
        const sx = landedPet.screenX(), sy = landedPet.screenY();
        const lx = sx + landedPet.worldX, ly = sy + landedPet.worldY;
        for (let i = 0; i < pets.length; i++) {
            const o = pets[i];
            if (!o || o === landedPet || o._retiringToPen || o.state_ === "drag") continue;
            if (o.screenX() !== sx || o.screenY() !== sy) continue;
            if (Math.hypot((sx + o.worldX) - lx, (sy + o.worldY) - ly) <= 480) {
                o.socialEvent("friend_tossed", landedPet, { speed: speed, cleanLanding: cleanLanding });
            }
        }
    }

    function notifyDisplacedCompanion(refugeePet: var): void {
        if (!refugeePet || !refugeePet.petData) return;
        const sx = refugeePet.screenX(), sy = refugeePet.screenY();
        const rName = refugeePet.petData.name;
        let best = null;
        let bestAff = 0.48;
        for (let i = 0; i < pets.length; i++) {
            const p = pets[i];
            if (!p || p === refugeePet || p._retiringToPen) continue;
            if (p.screenX() !== sx || p.screenY() !== sy) continue;
            if (p.state_ !== "idle" && p.state_ !== "wander") continue;
            if (p.activePlan) continue;
            const rel = Memory.relationWith(p, rName, refugeePet.personality, refugeePet.petData.sprite);
            if (rel.affinity >= bestAff) {
                bestAff = rel.affinity;
                best = p;
            }
        }
        if (best && best.socialEvent) {
            best.socialEvent("friend_displaced", refugeePet);
        } else if (best && best.checkOnDisplacedFriend) {
            best.checkOnDisplacedFriend(refugeePet);
        }
    }

    function tryPairRetire(primaryId: string): bool {
        if (roamingIds.length < 3) return false;
        const lp = findPetById(primaryId);
        if (!lp || !lp.petData || lp.restDrive < 0.44 || Math.random() > 0.45) return false;
        const sx = lp.screenX(), sy = lp.screenY();
        let partner = null;
        let bestAff = 0.66;
        for (let i = 0; i < pets.length; i++) {
            const o = pets[i];
            if (!o || o === lp || !o.petData || o._retiringToPen) continue;
            if ((o.petData.roamMode || "auto") !== "auto") continue;
            if (o.screenX() !== sx || o.screenY() !== sy) continue;
            if (o.restDrive < 0.46 || o.state_ === "drag" || o.state_ === "airborne"
                    || o.state_ === "deepsleep" || o.activePlan) continue;
            const rel = Memory.relationWith(lp, o.petData.name, o.personality, o.petData.sprite);
            if (rel.affinity >= bestAff && rel.familiarity >= 0.30) {
                bestAff = rel.affinity;
                partner = o;
            }
        }
        if (!partner || !lp.beginJointRetireWith || !partner.beginJointRetireWith) return false;
        lp.beginJointRetireWith(partner, false);
        partner.beginJointRetireWith(lp, true);
        return true;
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

    function _syncRoamingResidents(): void {
        for (let i = 0; i < pets.length; i++) {
            const lp = pets[i];
            if (lp && lp._stateReady && lp.petData) {
                const rec = residentFor(lp.petData.id);
                if (rec && !rec._released) rec.syncFromPet(lp, false);
            }
        }
    }

    function _syncPeerSpecies(peerName: string, newSpecies: string): void {
        for (let i = 0; i < pets.length; i++) {
            const lp = pets[i];
            if (lp) Memory.updatePeerSpecies(lp, peerName, newSpecies);
        }
        _syncRoamingResidents();
        const rKeys = Object.keys(residentsById);
        for (let i = 0; i < rKeys.length; i++) {
            const rec = residentsById[rKeys[i]];
            if (rec) rec.updatePeerSpecies(peerName, newSpecies);
        }
    }

    function renameCompanion(idOrName: string, newName: string): string {
        const target = Config.findPet(idOrName);
        if (!target) return "";
        const oldName = target.name;
        const finalName = Config.renamePet(target.id, newName);
        if (!finalName || finalName === oldName) return finalName;

        for (let i = 0; i < pets.length; i++) {
            const lp = pets[i];
            if (!lp) continue;
            Memory.rekeyPeer(lp, oldName, finalName);
            if (lp.activePlan) {
                if (lp.activePlan.otherName === oldName) lp.activePlan.otherName = finalName;
                if (lp.activePlan.secondOtherName === oldName) lp.activePlan.secondOtherName = finalName;
            }
            if (lp.intention && lp.intention.otherName === oldName) {
                lp.intention.otherName = finalName;
            }
        }
        _syncRoamingResidents();
        const rKeys = Object.keys(residentsById);
        for (let i = 0; i < rKeys.length; i++) {
            const rec = residentsById[rKeys[i]];
            if (rec) rec.rekeyRelationship(oldName, finalName);
        }
        residentRevision++;
        return finalName;
    }

    function evolveCompanion(idOrName: string, requestedSpecies = ""): string {
        const target = findConfigPet(idOrName);
        if (!target) return "";
        const lp = findPetById(target.id);
        const rec = residentFor(target.id);
        if (lp && rec) rec.syncFromPet(lp, false);

        const evalTarget = lp || (rec ? rec.stateObj : null);
        if (!evalTarget) return "";
        const evo = Evolution.evaluate(evalTarget, target.sprite);
        if (!evo.ready || evo.options.length === 0) return "";

        const req = String(requestedSpecies || "").trim().toLowerCase();
        let chosen = evo.options[0];
        if (req.length > 0) {
            const match = evo.options.find(o => o.species === req || o.displayName.toLowerCase() === req);
            if (!match) return "";
            chosen = match;
        }

        const fromSp = target.sprite;
        const toSp = chosen.species;
        const compName = target.name;
        if (lp) {
            lp.illusionSpecies = "";
            lp.illusionUntil = 0;
            Evolution.recordEvolutionMilestone(lp, fromSp, toSp);
        }
        if (rec && rec.stateObj) {
            if (!lp) Evolution.recordEvolutionMilestone(rec.stateObj, fromSp, toSp);
            else {
                rec.stateObj.journal = (lp.journal || []).slice(-24);
                rec.stateObj.thoughts = (lp.thoughts || []).slice(-60);
                rec.stateObj.episodes = (lp.episodes || []).slice(-120);
            }
            rec.stateObj.sprite = toSp;
            rec.dirty = true;
            rec.refreshView();
            rec.saveNow();
        }
        Config.updatePetSpecies(target.id, toSp);
        _syncPeerSpecies(compName, toSp);
        if (lp && lp.playEvolutionCeremony) lp.playEvolutionCeremony();
        residentRevision++;
        return SpeciesProfile.profileFor(toSp).displayName;
    }

    function _drainUnlinkQueue(): void {
        if (unlinkProc.running || _pendingUnlinkPaths.length === 0) return;
        const batch = _pendingUnlinkPaths.slice();
        _pendingUnlinkPaths = [];
        unlinkProc.command = ["rm", "-f"].concat(batch);
        unlinkProc.running = true;
    }

    function releaseCompanion(idOrName: string): bool {
        if (Config.pets.length <= 1) return false;
        const target = Config.findPet(idOrName);
        if (!target) return false;
        const id = target.id;
        const removedName = target.name;
        if (!Config.removePet(id)) return false;

        if (inspectedPet && inspectedPet.petData && inspectedPet.petData.id === id) {
            closeInspector();
        }

        const rec = residentFor(id);
        if (rec) {
            rec._released = true;
            rec.dirty = false;
        }

        if (isRoaming(id)) {
            roamingIds = roamingIds.filter(rid => rid !== id);
        }
        if (_arrivingIds[id]) {
            const arr = Object.assign({}, _arrivingIds);
            delete arr[id];
            _arrivingIds = arr;
        }

        for (let i = 0; i < pets.length; i++) {
            const lp = pets[i];
            if (!lp || (lp.petData && lp.petData.id === id)) continue;
            Memory.removePeer(lp, removedName);
            if (lp.intention && lp.intention.otherName === removedName) {
                lp.intention = null;
            }
            if (lp.activePlan && (lp.activePlan.otherName === removedName
                    || lp.activePlan.secondOtherName === removedName)) {
                Plans.clearPlan(lp);
                lp.enterState("idle");
            }
        }

        _syncRoamingResidents();
        const rKeys = Object.keys(residentsById);
        for (let i = 0; i < rKeys.length; i++) {
            const otherRec = residentsById[rKeys[i]];
            if (otherRec && rKeys[i] !== id) {
                otherRec.removePeerReferences(removedName);
            }
        }

        if (penSelectedPetId === id) {
            penSelectedPetId = Config.pets.length > 0 ? Config.pets[0].id : "";
        }

        const safeLegacySlug = Config._slug(removedName);
        _pendingUnlinkPaths = _pendingUnlinkPaths.concat([
            Config.stateDir + "/state-" + id + ".json",
            Config.configDir + "/state-" + safeLegacySlug + ".json"
        ]);
        _drainUnlinkQueue();
        residentRevision++;
        return true;
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
        dragGhostSprite = "";
    }

    function findPetById(id: string): var {
        for (let i = 0; i < pets.length; i++) {
            if (pets[i].petData && pets[i].petData.id === id) return pets[i];
        }
        return null;
    }

    function findPet(nameOrEmpty: string): var {
        if (pets.length === 0) return null;
        const raw = String(nameOrEmpty || "").trim();
        if (!raw) return pets[0];
        const byExactId = findPetById(raw);
        if (byExactId) return byExactId;
        const q = raw.toLowerCase();
        for (let i = 0; i < pets.length; i++) {
            if (String(pets[i].petData.id).toLowerCase() === q) return pets[i];
        }
        for (let i = 0; i < pets.length; i++) {
            if (String(pets[i].petData.name).toLowerCase() === q) return pets[i];
        }
        return null;
    }

    function findConfigPet(nameOrId: string): var {
        if (!nameOrId || !nameOrId.trim()) return Config.pets.length > 0 ? Config.pets[0] : null;
        return Config.findPet(nameOrId);
    }

    function _syncCursorTracking(): void {
        const active = !root.hidden && pets.length > 0;
        let fast = false;
        if (active) {
            for (let i = 0; i < pets.length; i++) {
                const p = pets[i];
                const planName = p.activePlan ? p.activePlan.name : "";
                if (planName === "bid_attention" || planName === "chase_cursor" || p.state_ === "drag") {
                    fast = true;
                    break;
                }
            }
        }
        InputTracker.trackingEnabled = active;
        InputTracker.fastTracking = fast;
    }

    Process {
        id: unlinkProc
        onExited: root._drainUnlinkQueue()
    }

    Timer {
        id: initBootTimer
        interval: 380
        onTriggered: root._ensureInitialParty()
    }

    Timer {
        interval: 1500
        running: !root.hidden && root.pets.length > 0
        repeat: true
        onTriggered: root._syncCursorTracking()
    }

    Timer {
        interval: 18000
        running: !root.hidden && root._initialPartyPicked && Config.pets.length > 0
        repeat: true
        onTriggered: root._evaluateRotationStep()
    }

    Timer {
        interval: 30000
        running: Config.pets.length > 0
        repeat: true
        onTriggered: {
            const now = Date.now();
            const dt = Math.min(90, Math.max(1, (now - root._lastSanctuaryTickMs) / 1000));
            root._lastSanctuaryTickMs = now;
            const env = root._envSnapshot();

            for (let i = 0; i < root.pets.length; i++) {
                const lp = root.pets[i];
                if (lp && lp._stateReady && lp.petData) {
                    const rec = root.residentFor(lp.petData.id);
                    if (rec && !rec._released) rec.syncFromPet(lp, false);
                }
            }

            const pennedRecords = [];
            const penMates = [];
            for (let i = 0; i < Config.pets.length; i++) {
                const cid = Config.pets[i].id;
                if (!root.isRoaming(cid)) {
                    const r = root.residentFor(cid);
                    if (r && r.loaded && !r._released) {
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
            if (saveBatch) {
                for (let i = 0; i < root.pets.length; i++) {
                    const lp = root.pets[i];
                    if (lp && lp._stateReady && lp.petData) {
                        const rec = root.residentFor(lp.petData.id);
                        if (rec && !rec._released) rec.saveIfDirty();
                    }
                }
            }
        }
    }

    Connections {
        target: Config
        function onConfigReady(): void { root._reconcileConfigChange(); }
    }

    Connections {
        target: Qt.application
        function onAboutToQuit(): void { root.flushAll(); }
    }
}
