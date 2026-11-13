.import "../SpeciesProfile.js" as SpeciesProfile
.import "Personality.js" as Personality
.import "Memory.js" as Memory

var MIN_ROAM_MS = 14 * 60000;
var ROTATION_COOLDOWN_MS = 150000;
var OPEN_SLOT_DELAY_MS = 6000;
var SOLO_EXPEDITION_MIN_ROAM_MS = 45 * 60000;
var MIN_PEN_REST_MS = 8 * 60000;

function clamp01(v) {
    if (!Number.isFinite(v)) return 0.5;
    return Math.max(0, Math.min(1, v));
}

function createDefaultResident(petCfg, nowMs) {
    var sprite = (petCfg && petCfg.sprite) || "zorua";
    var preset = (petCfg && petCfg.personality) || "emergent";
    var name = (petCfg && petCfg.name) || "Companion";
    var base = Personality.resolveBase(preset, name, petCfg ? petCfg.traits : null);
    var eff = Personality.compose(base, {}, {});
    return {
        id: (petCfg && petCfg.id) || "pet",
        name: name,
        sprite: sprite,
        personalityPreset: preset,
        basePersonality: base,
        coreDrift: {},
        recentDrift: {},
        quirkProgress: {},
        quirks: [],
        get personality() {
            return Personality.compose(this.basePersonality, this.coreDrift, this.recentDrift);
        },
        archetype: Personality.archetypeTitle(eff, [], 0, 0.3),
        gx: 0,
        gy: 0,
        homeGX: 0,
        homeGY: 0,
        hasSavedPos: false,
        ageSeconds: 0,
        maturity: 0,
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
        boredom: 0.05,
        thoughts: [],
        episodes: [],
        journal: [],
        visitedCells: {},
        windowPrefs: {},
        placeMemory: {},
        relationships: {},
        userRhythm: {},
        penState: "idle",
        sanctuaryActivity: "Relaxing in the Sanctuary",
        enteredPenAt: nowMs || Date.now()
    };
}

// Integrate a Sanctuary resident's drives, dreams, and pen-mate friendships while off-screen.
function integrateResident(rec, dtSec, penMates, env, nowMs) {
    if (!(dtSec > 0) || !rec) return;
    var now = nowMs || Date.now();
    rec._simNow = now;
    rec._hour = env && env.hour !== undefined ? env.hour : new Date(now).getHours();
    var p = Personality.compose(rec.basePersonality, rec.coreDrift, rec.recentDrift);
    var prof = SpeciesProfile.profileFor(rec.sprite);
    var isNight = env ? !!env.isNight : (rec._hour >= 23 || rec._hour < 6);

    rec.ageSeconds = (rec.ageSeconds || 0) + dtSec;
    rec.maturity = clamp01(1 - Math.exp(-rec.ageSeconds / 86400));

    var sleepingInPen = rec.restDrive > 0.30 || (isNight && !prof.nocturnalAffinity && p.sleepiness > 0.32);
    if (sleepingInPen) {
        rec.restDrive = clamp01(rec.restDrive - (0.00018 + (1 - p.sleepiness) * 0.00006) * dtSec);
        rec.alertness = clamp01(rec.alertness + (0.00016 + p.energy * 0.00008) * dtSec);
        rec.penState = rec.restDrive > 0.52 ? "deepsleep" : "loaf";
    } else {
        rec.restDrive = clamp01(rec.restDrive - 0.00005 * dtSec);
        rec.alertness = clamp01(rec.alertness + 0.00008 * dtSec);
        rec.exploreDrive = clamp01(rec.exploreDrive + (0.00009 + p.curiosity * 0.00015) * dtSec);
        rec.playDrive = clamp01(rec.playDrive + (0.00006 + p.playfulness * 0.00012) * dtSec);
        rec.socialDrive = clamp01(rec.socialDrive + (0.00005 + p.sociability * 0.00012) * dtSec);
    }

    if (rec.satiety < 0.72) {
        rec.satiety = clamp01(rec.satiety + 0.00028 * dtSec);
        if (rec.satiety < 0.50) rec.penState = "eat";
    }
    var targetHappy = 0.54 + (rec.bond || 0.3) * 0.16;
    rec.happiness = clamp01(rec.happiness + (targetHappy - rec.happiness) * Math.min(1, dtSec / 3600));
    rec.mood = clamp01(rec.mood + (rec.happiness - rec.mood) * Math.min(1, dtSec / 420));
    rec.boredom = clamp01(rec.boredom - 0.00025 * dtSec);

    if (rec.episodes && rec.episodes.some(function(e) { return !e.consolidated; })) {
        Memory.consolidateSleep(rec);
    }

    var nextTitle = Personality.archetypeTitle(p, rec.quirks, rec.maturity, rec.bond);
    if (nextTitle !== rec.archetype && rec.archetype && rec.archetype !== "Curious Hatchling" && rec.maturity >= 0.08) {
        var art = /^[AEIOU]/i.test(nextTitle) ? "an " : "a ";
        Memory.addJournalEntry(rec, "Grew into " + art + nextTitle + ".", "archetype");
    }
    rec.archetype = nextTitle;

    // Occasional social camaraderie among companions sharing the Sanctuary pen.
    if (penMates && penMates.length > 0 && Math.random() < 0.09) {
        var mate = penMates[Math.floor(Math.random() * penMates.length)];
        if (mate && mate.id !== rec.id && mate.name) {
            var mateTraits = Personality.compose(mate.basePersonality, mate.coreDrift, mate.recentDrift);
            Memory.relationWith(rec, mate.name, mateTraits);
            if (sleepingInPen) {
                Memory.adjustRelation(rec, mate.name, 0.010, 0.025, "nap");
                rec.sanctuaryActivity = "Napping in " + prof.biome + " beside " + mate.name;
            } else if (p.playfulness > 0.48) {
                Memory.adjustRelation(rec, mate.name, 0.010, 0.025, "play");
                rec.penState = "wander";
                rec.sanctuaryActivity = "Playing in " + prof.biome + " with " + mate.name;
            } else {
                Memory.adjustRelation(rec, mate.name, 0.006, 0.02);
                rec.penState = "idle";
                rec.sanctuaryActivity = "Hanging out peacefully with " + mate.name;
            }
            return;
        }
    }

    if (rec.penState === "eat") {
        rec.sanctuaryActivity = "Nibbling berries in " + prof.biome;
    } else if (rec.penState === "deepsleep") {
        rec.sanctuaryActivity = "Sleeping deeply in " + prof.biome;
    } else if (rec.penState === "loaf") {
        rec.sanctuaryActivity = "Loafing comfortably in " + prof.biome;
    } else if (rec.alertness > 0.62 && rec.restDrive < 0.26) {
        rec.penState = Math.random() < 0.35 ? "wander" : "idle";
        rec.sanctuaryActivity = "Rested in " + prof.biome + " & ready to roam";
    } else {
        rec.penState = "idle";
        rec.sanctuaryActivity = "Relaxing quietly in " + prof.biome;
    }
}

// Score how eager & context-appropriate an "auto" Sanctuary resident is to step onto the desktop.
function readinessScore(rec, activeDesktopNames, env, nowMs) {
    var now = nowMs || Date.now();
    var p = Personality.compose(rec.basePersonality, rec.coreDrift, rec.recentDrift);
    var prof = SpeciesProfile.profileFor(rec.sprite);
    var inPenMs = Math.max(0, now - (rec.enteredPenAt || 0));
    if (inPenMs < MIN_PEN_REST_MS) return -1;

    var rested = (1 - rec.restDrive) * 0.55 + rec.alertness * 0.45;
    if (rested < 0.42) return rested * 0.4;

    var score = rested * 0.62
              + (rec.exploreDrive * 0.22 + rec.socialDrive * 0.20 + rec.playDrive * 0.12)
              + Math.min(0.28, (inPenMs / (45 * 60000)) * 0.28)
              + (rec.bond || 0.3) * 0.12;

    var e = env || {};
    if (e.isNight) {
        if (prof.nocturnalAffinity || Personality.hasQuirk(rec, "night_watch")) score += 0.28;
        else score -= 0.18 + p.sleepiness * 0.16;
    } else if (prof.nocturnalAffinity) {
        score -= 0.18;
    }

    if (e.mediaPlaying && (Personality.hasQuirk(rec, "melomaniac") || p.playfulness > 0.62)) {
        score += 0.20;
    }
    if (e.isCode && (Personality.hasQuirk(rec, "terminal_supervisor") || prof.windowWatchAffinity >= 1.28)) {
        score += 0.16;
    }
    if (e.fullscreen) {
        score -= 0.24;
    }

    // Best friends / soulmates currently roaming pull companions out to join them!
    if (activeDesktopNames && rec.relationships) {
        for (var i = 0; i < activeDesktopNames.length; i++) {
            var rel = rec.relationships[activeDesktopNames[i]];
            if (rel && rel.affinity > 0.62 && rel.familiarity > 0.20) {
                score += (rel.affinity - 0.5) * 0.32;
            } else if (rel && rel.affinity < 0.32) {
                score -= 0.14;
            }
        }
    }
    return score;
}

// Score how ready a currently-roaming "auto" desktop pet is to take a break in the Sanctuary.
function retireDesire(livePet, hasWaitingPeers, env, nowMs) {
    var now = nowMs || Date.now();
    var outMs = Math.max(0, now - (livePet.roamStartedAt || now));
    if (outMs < MIN_ROAM_MS && livePet.restDrive < 0.88) return -1;
    if (!hasWaitingPeers && outMs < SOLO_EXPEDITION_MIN_ROAM_MS) return -1;

    var p = livePet.personality;
    var prof = SpeciesProfile.profileFor(SpeciesProfile.trueSpeciesOf(livePet));
    var e = env || {};

    var fatigue = livePet.restDrive * 0.65 + (1 - livePet.alertness) * 0.35;
    var durationPressure = hasWaitingPeers
        ? Math.min(0.42, ((outMs - MIN_ROAM_MS) / (40 * 60000)) * 0.42)
        : Math.min(0.18, ((outMs - SOLO_EXPEDITION_MIN_ROAM_MS) / (60 * 60000)) * 0.18);

    var desire = fatigue * 0.78 + durationPressure + p.sleepiness * 0.12 - (livePet.bond || 0.3) * 0.08;

    if (e.isNight) {
        if (prof.nocturnalAffinity || Personality.hasQuirk(livePet, "night_watch")) desire -= 0.26;
        else desire += 0.22;
    }
    if (e.fullscreen && p.boldness < 0.60) {
        desire += 0.20;
    }
    if (!hasWaitingPeers) {
        // Without waiting pen-mates, only take occasional deep-rest or explorer breaks.
        var explorerImpulse = (p.curiosity > 0.65 && p.boldness > 0.58 && livePet.exploreDrive > 0.65) ? 0.22 : 0;
        desire = Math.max(fatigue - 0.18, explorerImpulse + durationPressure * 0.5);
    }
    return desire;
}

// Select initial roaming IDs at session start respecting "always", "penned", and maxRoaming.
function selectInitialRoaming(petConfigs, residentMap, maxRoaming, env, nowMs) {
    var now = nowMs || Date.now();
    var cap = Math.max(1, maxRoaming || 3);
    var out = [];
    var autoCandidates = [];

    for (var i = 0; i < petConfigs.length; i++) {
        var cfg = petConfigs[i];
        var mode = cfg.roamMode || "auto";
        if (mode === "always") {
            out.push(cfg.id);
        } else if (mode === "auto") {
            var rec = residentMap[cfg.id];
            // Ignore MIN_PEN_REST_MS on cold boot so initial party populates immediately.
            var savedEntered = rec ? rec.enteredPenAt : 0;
            if (rec) rec.enteredPenAt = now - MIN_PEN_REST_MS - 60000;
            var s = rec ? readinessScore(rec, [], env, now) : 0.5;
            if (rec) rec.enteredPenAt = savedEntered;
            autoCandidates.push({ id: cfg.id, score: s });
        }
    }

    autoCandidates.sort(function(a, b) { return b.score - a.score; });
    var autoSlots = Math.max(0, cap - out.length);
    for (var j = 0; j < Math.min(autoSlots, autoCandidates.length); j++) {
        out.push(autoCandidates[j].id);
    }
    return out;
}

// Evaluate one calm rotation decision: returns { spawnId, retireId } (at most one action per beat).
function evaluateRotation(petConfigs, residentMap, livePetMap, currentRoamingIds, maxRoaming, lastRotationMs, env, nowMs) {
    var now = nowMs || Date.now();
    var cap = Math.max(1, maxRoaming || 3);

    // 1. Enforce explicit user overrides ("always" / "penned") immediately without cooldown!
    for (var i = 0; i < petConfigs.length; i++) {
        var cfg = petConfigs[i];
        var mode = cfg.roamMode || "auto";
        var isOut = currentRoamingIds.indexOf(cfg.id) !== -1;
        if (mode === "always" && !isOut) {
            return { spawnId: cfg.id, retireId: "", immediate: true };
        }
    if ( mode === "penned" && isOut ) {
        return { spawnId: "", retireId: cfg.id, immediate: true };
    }
    }

    var activeAuto = [];
    var activeNames = [];
    var alwaysCount = 0;
    for (var r = 0; r < currentRoamingIds.length; r++) {
        var rid = currentRoamingIds[r];
        var rCfg = null;
        for (var c = 0; c < petConfigs.length; c++) {
            if (petConfigs[c].id === rid) { rCfg = petConfigs[c]; break; }
        }
        if (!rCfg) continue;
        activeNames.push(rCfg.name);
        if ((rCfg.roamMode || "auto") === "always") alwaysCount++;
        else if ((rCfg.roamMode || "auto") === "auto") activeAuto.push(rid);
    }

    var openAutoSlots = Math.max(0, cap - alwaysCount);

    // 2. If over cap (e.g. user lowered maxActiveRoaming), retire most tired auto pet promptly.
    if (activeAuto.length > openAutoSlots) {
        var mostTired = _pickRetiringPet(activeAuto, livePetMap, true, env, now, true);
        if (mostTired) return { spawnId: "", retireId: mostTired.id, immediate: true };
    }

    var waitingAuto = [];
    for (var w = 0; w < petConfigs.length; w++) {
        var wCfg = petConfigs[w];
        if ((wCfg.roamMode || "auto") === "auto" && currentRoamingIds.indexOf(wCfg.id) === -1) {
            var rec = residentMap[wCfg.id];
            if (rec) {
                var rScore = readinessScore(rec, activeNames, env, now);
                if (rScore > 0.44) waitingAuto.push({ id: wCfg.id, score: rScore });
            }
        }
    }
    waitingAuto.sort(function(a, b) { return b.score - a.score; });

    // 3. Fill an open auto slot after a brief settle pause.
    if (activeAuto.length < openAutoSlots && waitingAuto.length > 0) {
        if (now - (lastRotationMs || 0) >= OPEN_SLOT_DELAY_MS) {
            return { spawnId: waitingAuto[0].id, retireId: "", immediate: false };
        }
        return { spawnId: "", retireId: "", immediate: false };
    }

    if (now - (lastRotationMs || 0) < ROTATION_COOLDOWN_MS) {
        return { spawnId: "", retireId: "", immediate: false };
    }

    // 4. Check if a currently roaming auto pet naturally wants to retire / swap with an eager pen-mate.
    var hasWaiting = waitingAuto.length > 0;
    // Keep at least 1 pet on screen when there are no waiting replacements unless user penned everyone.
    if (!hasWaiting && (activeAuto.length + alwaysCount) <= 1) {
        return { spawnId: "", retireId: "", immediate: false };
    }

    var candidate = _pickRetiringPet(activeAuto, livePetMap, hasWaiting, env, now, false);
    if (candidate) {
        var threshold = hasWaiting ? Math.max(0.54, 0.88 - waitingAuto[0].score * 0.36) : 0.68;
        if (candidate.desire >= threshold) {
            return { spawnId: "", retireId: candidate.id, immediate: false };
        }
    }

    return { spawnId: "", retireId: "", immediate: false };
}

function _pickRetiringPet(activeAutoIds, livePetMap, hasWaiting, env, now, ignoreMinRoam) {
    var best = null;
    for (var i = 0; i < activeAutoIds.length; i++) {
        var id = activeAutoIds[i];
        var lp = livePetMap ? livePetMap[id] : null;
        if (!lp || lp.state_ === "drag" || lp._retiringToPen) continue;
        var desire = ignoreMinRoam
            ? (lp.restDrive * 0.7 + (1 - lp.alertness) * 0.3)
            : retireDesire(lp, hasWaiting, env, now);
        if (desire < 0) continue;
        if (!best || desire > best.desire) {
            best = { id: id, desire: desire };
        }
    }
    return best;
}
