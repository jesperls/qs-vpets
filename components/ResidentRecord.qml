pragma ComponentBehavior: Bound

import QtQuick
import Quickshell.Io
import "../config"
import "../services"
import "PetPersistence.js" as Persist
import "SpeciesProfile.js" as SpeciesProfile
import "behavior/Personality.js" as Personality
import "behavior/Memory.js" as Memory
import "behavior/Sanctuary.js" as Sanctuary

Item {
    id: root
    visible: false

    required property string petId

    readonly property var petData: {
        void Config.pets;
        return Config.petById(root.petId) ?? {
            id: root.petId,
            name: root.petId,
            sprite: "zorua",
            personality: "emergent",
            scale: 2,
            monitor: "",
            roamMode: "auto",
            color: "#cba6f7",
            traits: null,
            actions: {}
        };
    }

    property var stateObj: Sanctuary.createDefaultResident(petData, Date.now())
    property bool loaded: false
    property bool hasSavedState: false
    property bool dirty: false
    property bool _tryLegacy: false
    property bool _released: false
    property int revision: 0

    property string _lastPreset: ""
    property string _lastSprite: ""
    property string _lastTraitsSig: ""

    property string archetype: "Curious Hatchling"
    property real mood: 0.56
    property real happiness: 0.56
    property real bond: 0.30
    property real trust: 0.35
    property real satiety: 0.65
    property real restDrive: 0.14
    property real exploreDrive: 0.34
    property real socialDrive: 0.26
    property real playDrive: 0.22
    property real alertness: 0.68
    property real ageSeconds: 0
    property real maturity: 0
    property real homeGX: 0
    property real homeGY: 0
    property var basePersonality: ({})
    property var effectivePersonality: ({})
    property var quirks: []
    property var relationships: ({})
    property var thoughts: []
    property var journal: []
    property string lastThoughtText: "Relaxing in the Sanctuary"
    property string penState: "idle"
    property string sanctuaryActivity: "Relaxing in the Sanctuary"

    readonly property string statePath: Config.stateDir + "/state-" + root.petId + ".json"
    readonly property string legacyStatePath: Config.configDir + "/state-" + root.petData.name + ".json"

    function _cloneRelationships(src: var): var {
        const out = {};
        if (!src || typeof src !== "object") return out;
        const keys = Object.keys(src);
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (src[k] && typeof src[k] === "object") {
                out[k] = Object.assign({}, src[k]);
            }
        }
        return out;
    }

    onPetDataChanged: {
        if (!stateObj) return;
        const nextSprite = petData.sprite || "zorua";
        const nextPreset = petData.personality || "emergent";
        const nextTraitsSig = JSON.stringify(petData.traits ?? null);

        stateObj.name = petData.name;
        if ((_lastPreset !== "" && nextPreset !== _lastPreset)
                || (_lastTraitsSig !== "" && nextTraitsSig !== _lastTraitsSig)) {
            stateObj.basePersonality = Personality.resolveBase(
                nextPreset,
                petData.id || petData.name || "pet",
                petData.traits ?? null
            );
            dirty = true;
        }
        if (_lastSprite !== "" && nextSprite !== _lastSprite) {
            stateObj.sprite = nextSprite;
            stateObj.sanctuaryActivity = "Relaxing quietly in " + SpeciesProfile.profileFor(nextSprite).biome;
            dirty = true;
        } else {
            stateObj.sprite = nextSprite;
        }
        _lastPreset = nextPreset;
        _lastSprite = nextSprite;
        _lastTraitsSig = nextTraitsSig;
        refreshView();
    }

    function refreshView(): void {
        if (!stateObj) return;
        const eff = Personality.compose(stateObj.basePersonality, stateObj.coreDrift, stateObj.recentDrift);
        basePersonality = Object.assign({}, stateObj.basePersonality);
        effectivePersonality = eff;
        archetype = stateObj.archetype || Personality.archetypeTitle(eff, stateObj.quirks, stateObj.maturity, stateObj.bond);
        mood = stateObj.mood ?? 0.56;
        happiness = stateObj.happiness ?? 0.56;
        bond = stateObj.bond ?? 0.30;
        trust = stateObj.trust ?? 0.35;
        satiety = stateObj.satiety ?? 0.65;
        restDrive = stateObj.restDrive ?? 0.14;
        exploreDrive = stateObj.exploreDrive ?? 0.34;
        socialDrive = stateObj.socialDrive ?? 0.26;
        playDrive = stateObj.playDrive ?? 0.22;
        alertness = stateObj.alertness ?? 0.68;
        ageSeconds = stateObj.ageSeconds ?? 0;
        maturity = stateObj.maturity ?? 0;
        homeGX = stateObj.homeGX ?? 0;
        homeGY = stateObj.homeGY ?? 0;
        quirks = (stateObj.quirks || []).slice();
        relationships = _cloneRelationships(stateObj.relationships);
        thoughts = (stateObj.thoughts || []).slice(-12);
        journal = (stateObj.journal || []).slice(-12);
        penState = stateObj.penState || "idle";
        sanctuaryActivity = stateObj.sanctuaryActivity || "Relaxing in the Sanctuary";
        if (stateObj.thoughts && stateObj.thoughts.length > 0) {
            lastThoughtText = stateObj.thoughts[stateObj.thoughts.length - 1].text || sanctuaryActivity;
        } else {
            lastThoughtText = sanctuaryActivity;
        }
        revision++;
    }

    function saveNow(): void {
        if (!loaded || !stateObj || _released) return;
        dirty = false;
        stateFile.setText(Persist.serializeResident(stateObj));
    }

    function saveIfDirty(): void {
        if (dirty && loaded && !_released) saveNow();
    }

    function syncFromPet(pet: var, persistNow: bool): void {
        if (!pet || !stateObj || _released) return;
        stateObj.gx = Math.round(pet.screenX() + pet.worldX);
        stateObj.gy = Math.round(pet.screenY() + pet.worldY);
        stateObj.hasSavedPos = true;
        stateObj.homeGX = Math.round(pet.homeGX);
        stateObj.homeGY = Math.round(pet.homeGY);
        stateObj.ageSeconds = pet.ageSeconds || 0;
        stateObj.maturity = pet.maturity || 0;
        stateObj.bond = pet.bond ?? 0.30;
        stateObj.trust = pet.trust ?? 0.35;
        stateObj.satiety = pet.satiety ?? 0.65;
        stateObj.happiness = pet.happiness;
        stateObj.mood = pet.mood;
        stateObj.restDrive = pet.restDrive;
        stateObj.exploreDrive = pet.exploreDrive;
        stateObj.socialDrive = pet.socialDrive;
        stateObj.comfortDrive = pet.comfortDrive;
        stateObj.playDrive = pet.playDrive;
        stateObj.alertness = pet.alertness;
        stateObj.boredom = pet.boredom;
        if (pet.basePersonality && typeof pet.basePersonality === "object") {
            stateObj.basePersonality = Object.assign({}, pet.basePersonality);
        }
        stateObj.coreDrift = Object.assign({}, pet.coreDrift || {});
        stateObj.recentDrift = Object.assign({}, pet.recentDrift || {});
        stateObj.quirkProgress = Object.assign({}, pet.quirkProgress || {});
        stateObj.quirks = (pet.quirks || []).slice();
        stateObj.archetype = pet.archetype || "";
        stateObj.thoughts = (pet.thoughts || []).slice(-60);
        stateObj.episodes = (pet.episodes || []).slice(-120);
        stateObj.journal = (pet.journal || []).slice(-24);
        stateObj.visitedCells = Object.assign({}, pet.visitedCells || {});
        stateObj.windowPrefs = Object.assign({}, pet.windowPrefs || {});
        stateObj.placeMemory = Object.assign({}, pet.placeMemory || {});
        stateObj.relationships = _cloneRelationships(pet.relationships);
        stateObj.userRhythm = Object.assign({}, pet.userRhythm || {});
        hasSavedState = true;
        refreshView();
        dirty = true;
        if (persistNow) saveNow();
    }

    function applyToPet(pet: var): bool {
        if (!pet || !stateObj || !hasSavedState) return false;
        try {
            const snapshot = JSON.parse(Persist.serializeResident(stateObj));
            if (!stateObj.hasSavedPos) {
                delete snapshot.gx;
                delete snapshot.gy;
            }
            return Persist.applySaved(pet, snapshot);
        } catch (e) {
            console.warn("qs-vpets: failed to apply resident state:", e);
            return false;
        }
    }

    function markEnteredPen(note: string): void {
        if (!stateObj || _released) return;
        stateObj.enteredPenAt = Date.now();
        if (note) {
            Memory.thinkAloud(stateObj, "enter_pen", note, { minGapMs: 3000 });
            stateObj.sanctuaryActivity = note;
        }
        hasSavedState = true;
        dirty = true;
        refreshView();
        saveNow();
    }

    function stepSanctuary(dtSec: real, penMates: var, env: var, nowMs: double): void {
        if (!loaded || !stateObj || _released) return;
        Sanctuary.integrateResident(stateObj, dtSec, penMates, env, nowMs);
        hasSavedState = true;
        dirty = true;
        refreshView();
    }

    function patInPen(): void {
        if (!stateObj || _released) return;
        Sanctuary.patInPen(stateObj);
        hasSavedState = true;
        dirty = true;
        refreshView();
        saveNow();
    }

    function feedInPen(): void {
        if (!stateObj || _released) return;
        Sanctuary.feedInPen(stateObj);
        hasSavedState = true;
        dirty = true;
        refreshView();
        saveNow();
    }

    function playInPen(): void {
        if (!stateObj || _released) return;
        Sanctuary.playInPen(stateObj);
        hasSavedState = true;
        dirty = true;
        refreshView();
        saveNow();
    }

    function rekeyRelationship(oldName: string, newName: string): void {
        if (!stateObj || _released || !oldName || !newName || oldName === newName) return;
        let changed = false;
        if (stateObj.relationships && stateObj.relationships[oldName] !== undefined) {
            const next = _cloneRelationships(stateObj.relationships);
            next[newName] = next[oldName];
            delete next[oldName];
            stateObj.relationships = next;
            changed = true;
        }
        if (Array.isArray(stateObj.episodes)) {
            for (let i = 0; i < stateObj.episodes.length; i++) {
                const ep = stateObj.episodes[i];
                if (ep && ep.withPet === oldName) {
                    ep.withPet = newName;
                    changed = true;
                }
            }
        }
        if (changed) {
            dirty = true;
            refreshView();
            saveNow();
        }
    }

    function removePeerReferences(removedName: string): void {
        if (!stateObj || _released || !removedName || !stateObj.relationships) return;
        if (stateObj.relationships[removedName] !== undefined) {
            const next = _cloneRelationships(stateObj.relationships);
            delete next[removedName];
            stateObj.relationships = next;
            dirty = true;
            refreshView();
            saveNow();
        }
    }

    function updatePeerSpecies(peerName: string, newSpecies: string): void {
        if (!stateObj || _released || !peerName || !newSpecies || !stateObj.relationships) return;
        if (stateObj.relationships[peerName]) {
            const next = _cloneRelationships(stateObj.relationships);
            next[peerName].species = newSpecies;
            stateObj.relationships = next;
            dirty = true;
            refreshView();
            saveNow();
        }
    }

    FileView {
        id: stateFile
        path: root.statePath
        printErrors: false
        onLoaded: {
            if (!root.loaded) {
                let ok = false;
                try {
                    ok = Persist.applySaved(root.stateObj, text());
                } catch (e) {
                    console.warn("qs-vpets: resident state parse failed:", e);
                }
                root.hasSavedState = ok;
                root.loaded = true;
                root.refreshView();
                PetManager.onResidentLoaded(root.petId);
            }
        }
        onLoadFailed: {
            if (!root.loaded) root._tryLegacy = true;
        }
    }

    FileView {
        id: legacyStateFile
        path: root._tryLegacy ? root.legacyStatePath : ""
        printErrors: false
        onLoaded: {
            if (!root.loaded) {
                let ok = false;
                try {
                    ok = Persist.applySaved(root.stateObj, text());
                } catch (e) {
                    console.warn("qs-vpets: legacy state parse failed:", e);
                }
                root.hasSavedState = ok;
                root.loaded = true;
                root.refreshView();
                if (ok) root.saveNow();
                PetManager.onResidentLoaded(root.petId);
            }
        }
        onLoadFailed: {
            if (!root.loaded && root._tryLegacy) {
                root.loaded = true;
                root.refreshView();
                PetManager.onResidentLoaded(root.petId);
            }
        }
    }

    Component.onCompleted: {
        _lastPreset = petData.personality || "emergent";
        _lastSprite = petData.sprite || "zorua";
        _lastTraitsSig = JSON.stringify(petData.traits ?? null);
        refreshView();
        PetManager.registerResident(root.petId, root);
    }

    Component.onDestruction: {
        if (!_released) saveIfDirty();
        PetManager.unregisterResident(root.petId, root);
    }
}
