.pragma library

.import "behavior/Personality.js" as Personality
.import "behavior/Memory.js" as Memory
.import "behavior/Util.js" as Util

var SCHEMA = 3;

var SOUL_DEFAULTS = {
    bond: 0.30,
    trust: 0.35,
    satiety: 0.65,
    happiness: 0.56,
    mood: 0.56,
    restDrive: 0.14,
    exploreDrive: 0.34,
    socialDrive: 0.26,
    comfortDrive: 0.0,
    playDrive: 0.22,
    alertness: 0.68,
    boredom: 0.05
};

function _buildStateObject(src, gx, gy, hasPos) {
    return {
        schema: SCHEMA,
        savedAt: Date.now(),
        hasSavedPos: !!hasPos,
        gx: Math.round(gx || 0),
        gy: Math.round(gy || 0),
        homeGX: Math.round(src.homeGX || 0),
        homeGY: Math.round(src.homeGY || 0),
        ageSeconds: Math.round(src.ageSeconds || 0),
        maturity: Math.round((src.maturity || 0) * 10000) / 10000,
        bond: Math.round((src.bond === undefined ? SOUL_DEFAULTS.bond : src.bond) * 1000) / 1000,
        trust: Math.round((src.trust === undefined ? SOUL_DEFAULTS.trust : src.trust) * 1000) / 1000,
        satiety: Math.round((src.satiety === undefined ? SOUL_DEFAULTS.satiety : src.satiety) * 1000) / 1000,
        happiness: Math.round(Util.clamp01(src.happiness, SOUL_DEFAULTS.happiness) * 1000) / 1000,
        mood: Math.round(Util.clamp01(src.mood, SOUL_DEFAULTS.mood) * 1000) / 1000,
        restDrive: Math.round(Util.clamp01(src.restDrive, SOUL_DEFAULTS.restDrive) * 1000) / 1000,
        exploreDrive: Math.round(Util.clamp01(src.exploreDrive, SOUL_DEFAULTS.exploreDrive) * 1000) / 1000,
        socialDrive: Math.round(Util.clamp01(src.socialDrive, SOUL_DEFAULTS.socialDrive) * 1000) / 1000,
        comfortDrive: Math.round(Util.clamp01(src.comfortDrive || 0, 0) * 1000) / 1000,
        playDrive: Math.round(Util.clamp01(src.playDrive, SOUL_DEFAULTS.playDrive) * 1000) / 1000,
        alertness: Math.round(Util.clamp01(src.alertness, SOUL_DEFAULTS.alertness) * 1000) / 1000,
        boredom: Math.round(Util.clamp01(src.boredom || 0, 0) * 1000) / 1000,
        basePersonality: src.basePersonality || null,
        coreDrift: src.coreDrift || {},
        recentDrift: src.recentDrift || {},
        quirkProgress: src.quirkProgress || {},
        quirks: src.quirks || [],
        archetype: src.archetype || "",
        thoughts: (src.thoughts || []).slice(-60),
        episodes: (src.episodes || []).slice(-120),
        journal: (src.journal || []).slice(-24),
        visitedCells: src.visitedCells || {},
        windowPrefs: src.windowPrefs || {},
        placeMemory: src.placeMemory || {},
        relationships: src.relationships || {},
        userRhythm: src.userRhythm || {},
        enteredPenAt: src.enteredPenAt || 0
    };
}

function serialize(pet) {
    var live = typeof pet.screenX === "function";
    var gx = live ? (pet.screenX() + pet.worldX) : (pet.gx || 0);
    var gy = live ? (pet.screenY() + pet.worldY) : (pet.gy || 0);
    var hasPos = live ? true : !!pet.hasSavedPos;
    return JSON.stringify(_buildStateObject(pet, gx, gy, hasPos), null, 2);
}

function serializeResident(rec) {
    return JSON.stringify(_buildStateObject(rec, rec.gx || 0, rec.gy || 0, !!rec.hasSavedPos), null, 2);
}

function save(pet) {
    if (!pet || !pet.saveStateJson) return;
    pet.saveStateJson(serialize(pet));
}

function _onAnyScreen(pet, gx, gy) {
    var screens = pet.allScreens ? pet.allScreens() : [];
    for (var i = 0; i < screens.length; i++) {
        var s = screens[i];
        if (gx >= s.x && gx < s.x + s.width && gy >= s.y && gy < s.y + s.height) return true;
    }
    return false;
}

function applySaved(pet, saved) {
    if (typeof saved === "string") {
        try {
            saved = JSON.parse(saved);
        } catch (e) {
            return false;
        }
    }
    if (!pet || !saved || typeof saved !== "object") return false;
    var c01 = Util.clamp01;

    if (saved.ageSeconds !== undefined) pet.ageSeconds = Math.max(0, Number(saved.ageSeconds) || 0);
    if (saved.maturity !== undefined) pet.maturity = c01(saved.maturity, 0);
    if (saved.bond !== undefined) pet.bond = c01(saved.bond, SOUL_DEFAULTS.bond);
    if (saved.trust !== undefined) pet.trust = c01(saved.trust, SOUL_DEFAULTS.trust);
    if (saved.satiety !== undefined) pet.satiety = c01(saved.satiety, SOUL_DEFAULTS.satiety);
    if (saved.happiness !== undefined) pet.happiness = c01(saved.happiness, SOUL_DEFAULTS.happiness);
    if (saved.mood !== undefined) pet.mood = c01(saved.mood, SOUL_DEFAULTS.mood);
    if (saved.restDrive !== undefined) pet.restDrive = c01(saved.restDrive, SOUL_DEFAULTS.restDrive);
    if (saved.exploreDrive !== undefined) pet.exploreDrive = c01(saved.exploreDrive, SOUL_DEFAULTS.exploreDrive);
    if (saved.socialDrive !== undefined) pet.socialDrive = c01(saved.socialDrive, SOUL_DEFAULTS.socialDrive);
    if (saved.comfortDrive !== undefined) pet.comfortDrive = c01(saved.comfortDrive, 0);
    if (saved.playDrive !== undefined) pet.playDrive = c01(saved.playDrive, SOUL_DEFAULTS.playDrive);
    if (saved.boredom !== undefined) pet.boredom = c01(saved.boredom, 0);
    if (saved.alertness !== undefined) {
        var rawAlert = c01(saved.alertness, SOUL_DEFAULTS.alertness);
        pet.alertness = c01(rawAlert + (0.5 - rawAlert) * 0.35, SOUL_DEFAULTS.alertness);
    }

    if (saved.basePersonality && typeof saved.basePersonality === "object" && "basePersonality" in pet) {
        pet.basePersonality = saved.basePersonality;
    }
    if (saved.coreDrift) {
        pet.coreDrift = saved.coreDrift;
    } else if (saved.learnedTraits || saved.traits) {
        pet.coreDrift = saved.learnedTraits || saved.traits;
    }
    if (saved.recentDrift) pet.recentDrift = saved.recentDrift;
    if (saved.quirkProgress) pet.quirkProgress = saved.quirkProgress;
    if (Array.isArray(saved.quirks)) pet.quirks = saved.quirks;
    if (saved.archetype) pet.archetype = saved.archetype;

    if (saved.windowPrefs) pet.windowPrefs = saved.windowPrefs;
    if (saved.relationships) pet.relationships = saved.relationships;
    if (saved.userRhythm) pet.userRhythm = saved.userRhythm;
    if (Array.isArray(saved.journal)) pet.journal = saved.journal;

    if (saved.schema >= 3) {
        if (Array.isArray(saved.thoughts)) pet.thoughts = saved.thoughts;
        if (Array.isArray(saved.episodes)) pet.episodes = saved.episodes;
    } else if (Array.isArray(saved.thoughts)) {
        var migrated = [];
        for (var i = 0; i < saved.thoughts.length; i++) {
            var lt = saved.thoughts[i];
            if (lt && lt.type && lt.type !== "strolled" && lt.type !== "arrived") {
                migrated.push({
                    type: lt.type,
                    time: lt.time || Date.now(),
                    hour: new Date(lt.time || Date.now()).getHours(),
                    gx: lt.x || 0,
                    gy: lt.y || 0,
                    valence: lt.type === "petted" ? 0.6 : (lt.type === "startled" ? -0.35 : 0.2),
                    salience: 0.4,
                    consolidated: false,
                    windowClass: lt.windowClass || "",
                    withPet: lt.withPet || "",
                    otherScreen: false,
                    music: false,
                    note: ""
                });
            }
        }
        pet.episodes = migrated.slice(-80);
        pet.thoughts = [];
    }

    // QML Pet QObject lacks ResidentRecord-only fields; guard writes so QObject meta-assignment never throws.
    if (saved.enteredPenAt !== undefined && "enteredPenAt" in pet) {
        pet.enteredPenAt = Number(saved.enteredPenAt) || 0;
    }

    if (saved.schema >= 2) {
        if (saved.visitedCells) pet.visitedCells = saved.visitedCells;
        if (saved.placeMemory) pet.placeMemory = saved.placeMemory;

        var hasPos = saved.hasSavedPos !== undefined
            ? !!saved.hasSavedPos
            : (saved.gx !== undefined && saved.gy !== undefined
               && (saved.gx !== 0 || saved.gy !== 0 || (saved.ageSeconds || 0) > 0));

        if (hasPos && saved.gx !== undefined && saved.gy !== undefined) {
            if ("gx" in pet) pet.gx = saved.gx;
            if ("gy" in pet) pet.gy = saved.gy;
            if ("hasSavedPos" in pet) pet.hasSavedPos = true;
            if (pet.petWindow && pet.petWindow.moveToGlobal) {
                pet.petWindow.moveToGlobal(saved.gx, saved.gy);
            }
        } else if ("hasSavedPos" in pet) {
            pet.hasSavedPos = false;
        }

        var hasHome = hasPos || !!(saved.homeGX || saved.homeGY);
        if (hasHome && saved.homeGX !== undefined && saved.homeGY !== undefined) {
            if (!pet.allScreens || _onAnyScreen(pet, saved.homeGX, saved.homeGY)) {
                pet.homeGX = saved.homeGX;
                pet.homeGY = saved.homeGY;
            } else if (pet.screenX) {
                pet.homeGX = pet.screenX() + pet.worldX;
                pet.homeGY = pet.screenY() + pet.worldY;
            }
        } else if (pet.screenX) {
            pet.homeGX = pet.screenX() + pet.worldX;
            pet.homeGY = pet.screenY() + pet.worldY;
        }
    } else if (pet.screenW) {
        var maxX = Math.max(0, pet.screenW() - (pet.width || 64));
        var maxY = Math.max(0, pet.screenH() - (pet.height || 64));
        if (saved.x !== undefined && saved.y !== undefined) {
            pet.worldX = Math.max(0, Math.min(maxX, saved.x));
            pet.worldY = Math.max(0, Math.min(maxY, saved.y));
        }
        if (saved.homeX !== undefined && saved.homeY !== undefined) {
            pet.homeGX = pet.screenX() + Math.max(0, Math.min(maxX, saved.homeX));
            pet.homeGY = pet.screenY() + Math.max(0, Math.min(maxY, saved.homeY));
        }
    }

    pet.archetype = Personality.archetypeTitle(pet.personality, pet.quirks, pet.maturity, pet.bond);
    if (pet.thoughts && pet.thoughts.length > 0) {
        pet.lastThoughtText = pet.thoughts[pet.thoughts.length - 1].text || "";
    } else {
        Memory.thinkAloud(pet, "awaken", "Back on the desktop and ready for the day.");
    }
    Util.bumpMemoryRev(pet);
    return true;
}

function loadFromText(pet, rawText) {
    if (!rawText || !rawText.trim()) return false;
    try {
        return applySaved(pet, JSON.parse(rawText));
    } catch (e) {
        console.warn("qs-vpets: failed to parse pet state:", e);
        return false;
    }
}
