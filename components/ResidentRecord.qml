pragma ComponentBehavior: Bound

import QtQuick
import Quickshell.Io
import "../config"
import "../services"
import "PetPersistence.js" as Persist
import "ai/Personality.js" as Personality
import "ai/Memory.js" as Memory
import "ai/Sanctuary.js" as Sanctuary

Item {
    id: root
    visible: false

    required property string petId

    readonly property var petData: {
        for (let i = 0; i < Config.pets.length; i++) {
            if (Config.pets[i].id === root.petId) return Config.pets[i];
        }
        return { id: root.petId, name: root.petId, sprite: "zorua", personality: "emergent", scale: 2, monitor: "", roamMode: "auto", actions: {} };
    }

    property var stateObj: Sanctuary.createDefaultResident(petData, Date.now())
    property bool loaded: false
    property bool dirty: false

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

    onPetDataChanged: {
        if (!stateObj) return;
        stateObj.name = petData.name;
        stateObj.sprite = petData.sprite;
        stateObj.basePersonality = Personality.resolveBase(
            petData.personality ?? "emergent",
            petData.name ?? "pet",
            petData.traits ?? null
        );
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
        relationships = Object.assign({}, stateObj.relationships || {});
        thoughts = (stateObj.thoughts || []).slice(-12);
        journal = (stateObj.journal || []).slice(-12);
        penState = stateObj.penState || "idle";
        sanctuaryActivity = stateObj.sanctuaryActivity || "Relaxing in the Sanctuary";
        if (stateObj.thoughts && stateObj.thoughts.length > 0) {
            lastThoughtText = stateObj.thoughts[stateObj.thoughts.length - 1].text || sanctuaryActivity;
        } else {
            lastThoughtText = sanctuaryActivity;
        }
    }

    function saveNow(): void {
        if (!loaded || !stateObj) return;
        dirty = false;
        stateFile.setText(Persist.serializeResident(stateObj));
    }

    function saveIfDirty(): void {
        if (dirty && loaded) saveNow();
    }

    function syncFromPet(pet: var, persistNow: bool): void {
        if (!pet || !stateObj) return;
        stateObj.gx = Math.round(pet.screenX() + pet.worldX);
        stateObj.gy = Math.round(pet.screenY() + pet.worldY);
        stateObj.hasSavedPos = true;
        stateObj.homeGX = Math.round(pet.homeGX);
        stateObj.homeGY = Math.round(pet.homeGY);
        stateObj.ageSeconds = pet.ageSeconds || 0;
        stateObj.maturity = pet.maturity || 0;
        stateObj.bond = pet.bond ?? 0.30;
        stateObj.trust = pet.trust ?? 0.35;
        stateObj.satiety = pet.satiety ?? 0.50;
        stateObj.happiness = pet.happiness;
        stateObj.mood = pet.mood;
        stateObj.restDrive = pet.restDrive;
        stateObj.exploreDrive = pet.exploreDrive;
        stateObj.socialDrive = pet.socialDrive;
        stateObj.comfortDrive = pet.comfortDrive;
        stateObj.playDrive = pet.playDrive;
        stateObj.alertness = pet.alertness;
        stateObj.boredom = pet.boredom;
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
        stateObj.relationships = Object.assign({}, pet.relationships || {});
        stateObj.userRhythm = Object.assign({}, pet.userRhythm || {});
        refreshView();
        dirty = true;
        if (persistNow) saveNow();
    }

    function applyToPet(pet: var): bool {
        if (!pet || !stateObj) return false;
        const snapshot = JSON.parse(Persist.serializeResident(stateObj));
        if (!stateObj.hasSavedPos) {
            delete snapshot.gx;
            delete snapshot.gy;
        }
        return Persist.applySaved(pet, snapshot);
    }

    function markEnteredPen(note: string): void {
        if (!stateObj) return;
        stateObj.enteredPenAt = Date.now();
        if (note) {
            Memory.thinkAloud(stateObj, "enter_pen", note, { minGapMs: 3000 });
            stateObj.sanctuaryActivity = note;
        }
        dirty = true;
        refreshView();
        saveNow();
    }

    function stepSanctuary(dtSec: real, penMates: var, env: var, nowMs: double): void {
        if (!loaded || !stateObj) return;
        Sanctuary.integrateResident(stateObj, dtSec, penMates, env, nowMs);
        dirty = true;
        refreshView();
    }

    function patInPen(): void {
        if (!stateObj) return;
        stateObj.happiness = Personality.clamp01(stateObj.happiness + 0.12);
        stateObj.mood = Personality.clamp01(stateObj.mood + 0.18);
        stateObj.bond = Personality.clamp01((stateObj.bond || 0.3) + 0.015);
        stateObj.trust = Personality.clamp01((stateObj.trust || 0.35) + 0.025);
        stateObj.socialDrive = Math.max(0, stateObj.socialDrive - 0.28);
        stateObj.penState = "hop";
        stateObj.sanctuaryActivity = "Enjoying warm headpats in the Sanctuary";
        Memory.recordEpisode(stateObj, "petted", { valence: 0.65, salience: 0.6 });
        Memory.thinkAloud(stateObj, "pen_pat", "Leaned into gentle headpats in the Sanctuary", { minGapMs: 2000 });
        dirty = true;
        refreshView();
        saveNow();
    }

    function feedInPen(): void {
        if (!stateObj) return;
        stateObj.satiety = Personality.clamp01((stateObj.satiety ?? 0.5) + 0.45);
        stateObj.happiness = Personality.clamp01(stateObj.happiness + 0.16);
        stateObj.mood = Personality.clamp01(stateObj.mood + 0.22);
        stateObj.trust = Personality.clamp01((stateObj.trust || 0.35) + 0.035);
        stateObj.penState = "eat";
        stateObj.sanctuaryActivity = "Happily munching a berry snack";
        Memory.recordEpisode(stateObj, "fed_snack", { valence: 0.8, salience: 0.72 });
        Memory.thinkAloud(stateObj, "pen_fed", "Happily ate a sweet berry in the Sanctuary", { minGapMs: 2000 });
        dirty = true;
        refreshView();
        saveNow();
    }

    function playInPen(): void {
        if (!stateObj) return;
        stateObj.happiness = Personality.clamp01(stateObj.happiness + 0.10);
        stateObj.mood = Personality.clamp01(stateObj.mood + 0.16);
        stateObj.trust = Personality.clamp01((stateObj.trust || 0.35) + 0.02);
        stateObj.playDrive = Math.max(0, stateObj.playDrive - 0.25);
        stateObj.penState = "wander";
        stateObj.sanctuaryActivity = "Romping playfully across the Sanctuary pasture";
        Memory.recordEpisode(stateObj, "played_solo", { valence: 0.6, salience: 0.55 });
        Memory.thinkAloud(stateObj, "pen_play", "Played a lively game in the Sanctuary", { minGapMs: 2000 });
        dirty = true;
        refreshView();
        saveNow();
    }

    function rekeyRelationship(oldName: string, newName: string): void {
        if (!stateObj || !stateObj.relationships || !oldName || !newName || oldName === newName) return;
        if (stateObj.relationships[oldName] !== undefined) {
            const next = Object.assign({}, stateObj.relationships);
            next[newName] = next[oldName];
            delete next[oldName];
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
                try {
                    const parsed = JSON.parse(text());
                    Persist.applySaved(root.stateObj, parsed);
                } catch (e) {
                    console.warn("qs-vpets: resident state parse failed:", e);
                }
                root.loaded = true;
                root.refreshView();
                PetManager.onResidentLoaded(root.petId);
            }
        }
        onLoadFailed: {
            if (!root.loaded) legacyStateFile.reload();
        }
    }

    FileView {
        id: legacyStateFile
        path: root.legacyStatePath
        printErrors: false
        onLoaded: {
            if (!root.loaded) {
                try {
                    const parsed = JSON.parse(text());
                    Persist.applySaved(root.stateObj, parsed);
                } catch (e) {
                    console.warn("qs-vpets: legacy state parse failed:", e);
                }
                root.loaded = true;
                root.refreshView();
                root.saveNow();
                PetManager.onResidentLoaded(root.petId);
            }
        }
        onLoadFailed: {
            root.loaded = true;
            root.refreshView();
            PetManager.onResidentLoaded(root.petId);
        }
    }

    Component.onCompleted: {
        refreshView();
        PetManager.registerResident(root.petId, root);
    }

    Component.onDestruction: {
        saveIfDirty();
        PetManager.unregisterResident(root.petId, root);
    }
}
