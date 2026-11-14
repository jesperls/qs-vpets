.import "behavior/Personality.js" as Personality
.import "behavior/Memory.js" as Memory

// Schema v3 persistence: saves complete developmental soul, memories, relationships, and global territory.

var SCHEMA = 3;

function _buildStateObject(src, gx, gy) {
    return {
        schema: SCHEMA,
        savedAt: Date.now(),
        gx: Math.round(gx || 0),
        gy: Math.round(gy || 0),
        homeGX: Math.round(src.homeGX || 0),
        homeGY: Math.round(src.homeGY || 0),
        ageSeconds: Math.round(src.ageSeconds || 0),
        maturity: Math.round((src.maturity || 0) * 10000) / 10000,
        bond: Math.round((src.bond === undefined ? 0.3 : src.bond) * 1000) / 1000,
        trust: Math.round((src.trust === undefined ? 0.35 : src.trust) * 1000) / 1000,
        satiety: Math.round((src.satiety === undefined ? 0.5 : src.satiety) * 1000) / 1000,
        happiness: Math.round(src.happiness * 1000) / 1000,
        mood: Math.round(src.mood * 1000) / 1000,
        restDrive: Math.round(src.restDrive * 1000) / 1000,
        exploreDrive: Math.round(src.exploreDrive * 1000) / 1000,
        socialDrive: Math.round(src.socialDrive * 1000) / 1000,
        comfortDrive: Math.round((src.comfortDrive || 0) * 1000) / 1000,
        playDrive: Math.round(src.playDrive * 1000) / 1000,
        alertness: Math.round(src.alertness * 1000) / 1000,
        boredom: Math.round((src.boredom || 0) * 1000) / 1000,
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
    var gx = pet.screenX ? (pet.screenX() + pet.worldX) : (pet.gx || 0);
    var gy = pet.screenY ? (pet.screenY() + pet.worldY) : (pet.gy || 0);
    return JSON.stringify(_buildStateObject(pet, gx, gy), null, 2);
}

function serializeResident(rec) {
    return JSON.stringify(_buildStateObject(rec, rec.gx || 0, rec.gy || 0), null, 2);
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
    if (!saved || typeof saved !== "object") return false;
    var c01 = Personality.clamp01;

    if (saved.ageSeconds !== undefined) pet.ageSeconds = Math.max(0, saved.ageSeconds);
    if (saved.maturity !== undefined) pet.maturity = c01(saved.maturity);
    if (saved.bond !== undefined) pet.bond = c01(saved.bond);
    if (saved.trust !== undefined) pet.trust = c01(saved.trust);
    if (saved.satiety !== undefined) pet.satiety = c01(saved.satiety);
    if (saved.happiness !== undefined) pet.happiness = c01(saved.happiness);
    if (saved.mood !== undefined) pet.mood = c01(saved.mood);
    if (saved.restDrive !== undefined) pet.restDrive = c01(saved.restDrive);
    if (saved.exploreDrive !== undefined) pet.exploreDrive = c01(saved.exploreDrive);
    if (saved.socialDrive !== undefined) pet.socialDrive = c01(saved.socialDrive);
    if (saved.comfortDrive !== undefined) pet.comfortDrive = c01(saved.comfortDrive);
    if (saved.playDrive !== undefined) pet.playDrive = c01(saved.playDrive);
    if (saved.boredom !== undefined) pet.boredom = c01(saved.boredom);
    if (saved.alertness !== undefined) {
        pet.alertness = c01(saved.alertness + (0.5 - saved.alertness) * 0.35);
    }

    // Schema v3 developmental traits, or migrate v1/v2 learnedTraits into coreDrift.
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
        // Migrate legacy v2 raw thought events into structured episodes.
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

    if (saved.enteredPenAt !== undefined) pet.enteredPenAt = Number(saved.enteredPenAt) || 0;

    if (saved.schema >= 2) {
        if (saved.visitedCells) pet.visitedCells = saved.visitedCells;
        if (saved.placeMemory) pet.placeMemory = saved.placeMemory;
        if (saved.gx !== undefined && saved.gy !== undefined) {
            pet.gx = saved.gx;
            pet.gy = saved.gy;
            pet.hasSavedPos = true;
            if (pet.petWindow) {
                pet.petWindow.moveToGlobal(saved.gx, saved.gy);
            }
        }
        if (saved.homeGX !== undefined && saved.homeGY !== undefined) {
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
