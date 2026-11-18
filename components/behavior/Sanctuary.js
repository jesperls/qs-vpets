.pragma library

.import "../SpeciesProfile.js" as SpeciesProfile
.import "../PetPersistence.js" as Persist
.import "Personality.js" as Personality
.import "Memory.js" as Memory
.import "Abilities.js" as Abilities
.import "Util.js" as Util

var MIN_ROAM_MS = 14 * 60000;
var ROTATION_COOLDOWN_MS = 150000;
var OPEN_SLOT_DELAY_MS = 6000;
var SOLO_EXPEDITION_MIN_ROAM_MS = 45 * 60000;
var MIN_PEN_REST_MS = 8 * 60000;

var clamp01 = Util.clamp01;

function _isNocturnal(target, prof, sp) {
    return !!(prof.nocturnalAffinity
        || Personality.hasQuirk(target, "night_watch")
        || Abilities.has(sp, "lunar_pulse"));
}

function createDefaultResident(petCfg, nowMs) {
    var sprite = (petCfg && petCfg.sprite) || SpeciesProfile.DEFAULT_SPECIES;
    var preset = (petCfg && petCfg.personality) || "emergent";
    var name = (petCfg && petCfg.name) || "Companion";
    var seedKey = (petCfg && petCfg.id) || name;
    var base = Personality.resolveBase(preset, seedKey, petCfg ? petCfg.traits : null);
    var eff = Personality.compose(base, {}, {});
    var d = Persist.SOUL_DEFAULTS;
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
        archetype: Personality.archetypeTitle(eff, [], 0, d.bond),
        gx: 0,
        gy: 0,
        homeGX: 0,
        homeGY: 0,
        hasSavedPos: false,
        ageSeconds: 0,
        maturity: 0,
        bond: d.bond,
        trust: d.trust,
        satiety: d.satiety,
        happiness: d.happiness,
        mood: d.mood,
        restDrive: d.restDrive,
        exploreDrive: d.exploreDrive,
        socialDrive: d.socialDrive,
        comfortDrive: d.comfortDrive,
        playDrive: d.playDrive,
        alertness: d.alertness,
        arousal: d.arousal,
        sleepInertia: d.sleepInertia,
        boredom: d.boredom,
        thoughts: [],
        episodes: [],
        lifetimeCounts: {},
        journal: [],
        visitedCells: {},
        windowPrefs: {},
        placeMemory: {},
        relationships: {},
        userRhythm: {},
        penState: "idle",
        sanctuaryActivity: "",
        careWakeUntil: 0,
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

    var careAwake = now < (rec.careWakeUntil || 0);
    var sleepingInPen = !careAwake && (rec.restDrive > 0.30 || (isNight && !_isNocturnal(rec, prof, rec.sprite) && p.sleepiness > 0.32));
    var curAr = rec.arousal === undefined ? 0.30 : rec.arousal;
    var curInert = rec.sleepInertia || 0;
    if (sleepingInPen) {
        rec.restDrive = clamp01(rec.restDrive - (0.00018 + (1 - p.sleepiness) * 0.00006) * dtSec);
        rec.alertness = clamp01(rec.alertness + (0.00016 + p.energy * 0.00008) * dtSec);
        rec.arousal = clamp01(curAr + (0.08 - curAr) * (1 - Math.exp(-dtSec / 45)));
        rec.sleepInertia = clamp01(curInert + (0.45 - curInert) * (1 - Math.exp(-dtSec / 180)));
        rec.penState = rec.restDrive > 0.52 ? "deepsleep" : "loaf";
        if (!Memory.recent(rec, "sanctuary_nap", 1500000) && Math.random() < 0.08) {
            Memory.recordEpisode(rec, "sanctuary_nap", { valence: 0.32 });
        }
    } else {
        if (rec.penState === "deepsleep" || rec.penState === "loaf" || rec.penState === "laying") {
            rec.penState = "idle";
        }
        rec.restDrive = clamp01(rec.restDrive - 0.00005 * dtSec);
        rec.alertness = clamp01(rec.alertness + 0.00008 * dtSec);
        rec.arousal = clamp01(curAr + ((0.24 + p.energy * 0.16) - curAr) * (1 - Math.exp(-dtSec / 75)));
        rec.sleepInertia = clamp01(curInert * Math.exp(-dtSec / 45));
        rec.exploreDrive = clamp01(rec.exploreDrive + (0.00009 + p.curiosity * 0.00015) * dtSec);
        rec.playDrive = clamp01(rec.playDrive + (0.00006 + p.playfulness * 0.00012) * dtSec);
        rec.socialDrive = clamp01(rec.socialDrive + (0.00005 + p.sociability * 0.00012) * dtSec);
    }

    if (rec._careSatiation > 0) {
        rec._careSatiation = Math.max(0, rec._careSatiation * Math.exp(-dtSec / 75));
    }

    var curPenSat = rec.satiety === undefined ? 0.58 : rec.satiety;
    var penFullAt = (prof.abilities && prof.abilities.indexOf("forage_stash") !== -1) ? 0.88 : 0.82;
    if (curPenSat > 0.62) {
        rec.satiety = clamp01(curPenSat + (0.58 - curPenSat) * (1 - Math.exp(-dtSec / 5400)));
        if (rec._stuffedRefusals > 0 && rec.satiety < penFullAt - 0.08) {
            rec._stuffedRefusals = 0;
        }
        if (rec.penState === "eat") rec.penState = "idle";
    } else if (curPenSat < 0.58) {
        rec.satiety = clamp01(curPenSat + 0.00018 * dtSec);
        if (!sleepingInPen && curPenSat < 0.50) {
            rec.penState = "eat";
            if (!Memory.recent(rec, "foraged", 1200000) && Math.random() < 0.15) {
                Memory.recordEpisode(rec, "foraged", { valence: 0.25 });
            }
        } else if (rec.penState === "eat") {
            rec.penState = "idle";
        }
    } else if (rec.penState === "eat") {
        rec.penState = "idle";
    }
    var targetHappy = 0.54 + (rec.bond || 0.3) * 0.16;
    rec.happiness = clamp01(rec.happiness + (targetHappy - rec.happiness) * Math.min(1, dtSec / 3600));
    rec.mood = clamp01(rec.mood + (rec.happiness - rec.mood) * Math.min(1, dtSec / 420));
    rec.boredom = clamp01(rec.boredom - 0.00025 * dtSec);

    if (sleepingInPen && rec.episodes && rec.episodes.some(function(e) { return !e.consolidated; })) {
        Memory.consolidateSleep(rec);
    }

    var nextTitle = Personality.archetypeTitle(p, rec.quirks, rec.maturity, rec.bond);
    if (nextTitle !== rec.archetype && rec.archetype && rec.archetype !== "Curious Hatchling" && rec.maturity >= 0.08) {
        var art = /^[AEIOU]/i.test(nextTitle) ? "an " : "a ";
        Memory.addJournalEntry(rec, "Grew into " + art + nextTitle + ".", "archetype");
    }
    rec.archetype = nextTitle;

    if (penMates && penMates.length > 0 && Math.random() < 0.055) {
        var mate = penMates[Math.floor(Math.random() * penMates.length)];
        if (mate && mate.id !== rec.id && mate.name) {
            var mateTraits = Personality.compose(mate.basePersonality, mate.coreDrift, mate.recentDrift);
            var rel = Memory.relationWith(rec, mate.name, mateTraits, mate.sprite);
            var myStyle = SpeciesProfile.socialStyleOf(rec.sprite);
            var mateStyle = SpeciesProfile.socialStyleOf(mate.sprite);
            var kin = SpeciesProfile.kinChemistry(rec.sprite, mate.sprite);
            var baseAff = rel.initialAffinity !== undefined ? rel.initialAffinity : 0.48;
            var eqPull = (baseAff - rel.affinity) * 0.05;
            if (rel.affinity < 0.36) {
                if (p.patience < 0.38 && !sleepingInPen) {
                    Memory.adjustRelation(rec, mate.name, -0.006 + eqPull, 0.015, "friction", { outcome: "squabble" });
                    rec.penState = "idle";
                    rec.sanctuaryActivity = "Grumbling over a sunny spot with " + mate.name;
                } else {
                    Memory.adjustRelation(rec, mate.name, eqPull, 0.012);
                    rec.sanctuaryActivity = "Keeping distance from " + mate.name + " in " + prof.biome;
                }
            } else if (rel.affinity < 0.48) {
                Memory.adjustRelation(rec, mate.name, 0.002 + eqPull, 0.016);
                rec.sanctuaryActivity = "Sharing the shade quietly near " + mate.name;
            } else if (sleepingInPen) {
                Memory.adjustRelation(rec, mate.name, 0.007 * (1 - Math.max(0, rel.affinity - 0.5) * 1.4) + eqPull, 0.024, "nap");
                if (!Memory.recent(rec, "rested_with", 1200000)) {
                    Memory.recordEpisode(rec, "rested_with", { valence: 0.38, withPet: mate.name });
                }
                rec.sanctuaryActivity = Abilities.has(mate.sprite, "hearth_warmth")
                    ? ("Curled up in warm hearth glow beside " + mate.name)
                    : ("Napping in " + prof.biome + " beside " + mate.name);
            } else if ((myStyle === "brawler" || mateStyle === "brawler") && p.boldness > 0.50 && p.playfulness > 0.42) {
                Memory.adjustRelation(rec, mate.name, 0.006 * (1 - Math.max(0, rel.affinity - 0.5) * 1.4) + eqPull, 0.024, "spar");
                if (!Memory.recent(rec, "sparred", 1200000)) {
                    Memory.recordEpisode(rec, "sparred", { valence: 0.42, withPet: mate.name });
                }
                rec.penState = "wander";
                rec.sanctuaryActivity = "Practicing sparring footwork with " + mate.name;
            } else if (p.playfulness > 0.48) {
                Memory.adjustRelation(rec, mate.name, 0.007 * (1 - Math.max(0, rel.affinity - 0.5) * 1.4) + eqPull, 0.024, "play");
                if (!Memory.recent(rec, "played_with", 1200000)) {
                    Memory.recordEpisode(rec, "played_with", { valence: 0.42, withPet: mate.name });
                }
                rec.penState = "wander";
                rec.sanctuaryActivity = kin.sameKin
                    ? ("Romping happily with fellow kin " + mate.name)
                    : ("Playing in " + prof.biome + " with " + mate.name);
            } else {
                Memory.adjustRelation(rec, mate.name, 0.004 * (1 - Math.max(0, rel.affinity - 0.5) * 1.4) + eqPull, 0.018);
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
        rec.sanctuaryActivity = "Rested in " + prof.biome + " and ready to roam";
    } else {
        rec.penState = "idle";
        var abLine = Math.random() < 0.55 ? Abilities.sanctuaryActivity(rec, prof, isNight) : "";
        rec.sanctuaryActivity = abLine || ("Relaxing quietly in " + prof.biome);
    }
}

function readinessScore(rec, activeDesktopNames, env, nowMs, ignoreRestCooldown) {
    var now = nowMs || Date.now();
    var p = Personality.compose(rec.basePersonality, rec.coreDrift, rec.recentDrift);
    var prof = SpeciesProfile.profileFor(rec.sprite);
    var inPenMs = ignoreRestCooldown
        ? (MIN_PEN_REST_MS + 60000)
        : Math.max(0, now - (rec.enteredPenAt || 0));
    if (inPenMs < MIN_PEN_REST_MS) return -1;

    var rested = (1 - rec.restDrive) * 0.55 + rec.alertness * 0.45;
    if (rested < 0.42) return rested * 0.4;

    var score = rested * 0.62
              + (rec.exploreDrive * 0.22 + rec.socialDrive * 0.20 + rec.playDrive * 0.12)
              + Math.min(0.28, (inPenMs / (45 * 60000)) * 0.28)
              + (rec.bond || 0.3) * 0.12;

    var e = env || {};
    if (e.isNight) {
        if (_isNocturnal(rec, prof, rec.sprite)) score += 0.28;
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
    score += Abilities.sanctuaryReadinessDelta(rec, prof, e);

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
        if (_isNocturnal(livePet, prof, SpeciesProfile.trueSpeciesOf(livePet))) desire -= 0.26;
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
            var s = rec ? readinessScore(rec, [], env, now, true) : 0.5;
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

function evaluateRotation(petConfigs, residentMap, livePetMap, currentRoamingIds, maxRoaming, lastRotationMs, env, nowMs) {
    var now = nowMs || Date.now();
    var cap = Math.max(1, maxRoaming || 3);

    for (var pIdx = 0; pIdx < petConfigs.length; pIdx++) {
        var pCfg = petConfigs[pIdx];
        if ((pCfg.roamMode || "auto") === "penned" && currentRoamingIds.indexOf(pCfg.id) !== -1) {
            return { spawnId: "", retireId: pCfg.id, immediate: true };
        }
    }
    for (var i = 0; i < petConfigs.length; i++) {
        var cfg = petConfigs[i];
        if ((cfg.roamMode || "auto") === "always" && currentRoamingIds.indexOf(cfg.id) === -1) {
            return { spawnId: cfg.id, retireId: "", immediate: true };
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

    // If over cap (e.g. user lowered maxActiveRoaming), retire most tired auto pet promptly.
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

    // Fill an open auto slot after a brief settle pause.
    if (activeAuto.length < openAutoSlots && waitingAuto.length > 0) {
        if (now - (lastRotationMs || 0) >= OPEN_SLOT_DELAY_MS) {
            return { spawnId: waitingAuto[0].id, retireId: "", immediate: false };
        }
        return { spawnId: "", retireId: "", immediate: false };
    }

    if (now - (lastRotationMs || 0) < ROTATION_COOLDOWN_MS) {
        return { spawnId: "", retireId: "", immediate: false };
    }

    // Check if a currently roaming auto pet naturally wants to swap with a rested campmate.
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

function patInPen(stateObj, nowMs) {
    if (!stateObj) return "busy";
    var now = nowMs || Date.now();
    if (nowMs) stateObj._simNow = nowMs;
    var careSat = stateObj._careSatiation || 0;
    var satMult = Math.max(0.15, 1 - careSat * 0.82);
    stateObj._careSatiation = Math.min(1, careSat + 0.30);
    var curBond = stateObj.bond === undefined ? 0.3 : stateObj.bond;
    stateObj.happiness = Util.clamp01(stateObj.happiness + 0.12 * satMult * (1 - stateObj.happiness * 0.75));
    stateObj.mood = Util.clamp01(stateObj.mood + 0.16 * satMult);
    stateObj.bond = Util.clamp01(curBond + 0.015 * satMult * (1 - curBond * 0.80));
    stateObj.trust = Util.clamp01((stateObj.trust || 0.35) + 0.025 * satMult);
    stateObj.socialDrive = Math.max(0, stateObj.socialDrive - 0.28 * satMult);
    stateObj.restDrive = Math.max(0, (stateObj.restDrive || 0) - 0.08 * satMult);
    stateObj.alertness = Util.clamp01((stateObj.alertness === undefined ? 0.6 : stateObj.alertness) + 0.08 * satMult);
    stateObj.arousal = Util.clamp01((stateObj.arousal === undefined ? 0.30 : stateObj.arousal) + 0.08 * satMult);
    stateObj.careWakeUntil = now + 180000;
    stateObj.penState = "idle";
    stateObj.sanctuaryActivity = "Enjoying warm headpats in the Sanctuary";
    Memory.recordEpisode(stateObj, "petted", { valence: 0.65 * satMult, salience: 0.6 * satMult });
    Memory.thinkAloud(stateObj, "pen_pat", "Leaned into gentle headpats in the Sanctuary", { minGapMs: 2000 });
    if (nowMs) delete stateObj._simNow;
    return "pat";
}

function feedInPen(stateObj, nowMs) {
    if (!stateObj) return "busy";
    var now = nowMs || Date.now();
    if (stateObj._lastFedAt && now >= stateObj._lastFedAt && (now - stateObj._lastFedAt) < 4500) {
        return "busy";
    }
    if (nowMs) stateObj._simNow = nowMs;
    var curSat = stateObj.satiety === undefined ? 0.58 : stateObj.satiety;
    var curBond = stateObj.bond === undefined ? 0.3 : stateObj.bond;
    var spProf = SpeciesProfile.profileFor(stateObj.sprite || "eevee");
    var fullAt = (spProf.abilities && spProf.abilities.indexOf("forage_stash") !== -1) ? 0.88 : 0.82;
    stateObj.careWakeUntil = now + 180000;
    stateObj.penState = "idle";
    if (curSat >= fullAt) {
        var refCount = (stateObj._stuffedRefusals || 0) + 1;
        stateObj._stuffedRefusals = refCount;
        if (refCount >= 2) {
            stateObj.mood = Math.max(0, (stateObj.mood === undefined ? 0.56 : stateObj.mood) - 0.05);
            stateObj.happiness = Math.max(0, (stateObj.happiness === undefined ? 0.56 : stateObj.happiness) - 0.02);
            if (refCount >= 3) {
                stateObj.trust = Math.max(0, (stateObj.trust === undefined ? 0.35 : stateObj.trust) - 0.018);
                stateObj.bond = Math.max(0, curBond - 0.005);
                Memory.recordEpisode(stateObj, "annoyed", { valence: -0.25, note: "overfed" });
            }
            stateObj.sanctuaryActivity = "Turned away uncomfortably, much too stuffed for another berry";
            Memory.thinkAloud(stateObj, "pen_overfed", "Much too stuffed and turned away from another Oran Berry", { minGapMs: 2000 });
            if (nowMs) delete stateObj._simNow;
            return "annoyed";
        }
        stateObj.sanctuaryActivity = "Already well-fed, sniffed the Oran Berry and turned away";
        Memory.thinkAloud(stateObj, "pen_full", "Already well-fed, sniffed the Oran Berry politely and left it", { minGapMs: 2000 });
        if (nowMs) delete stateObj._simNow;
        return "refused";
    }
    var appetite = Math.max(0.18, Util.clamp01((fullAt - curSat) / 0.44));
    stateObj._stuffedRefusals = 0;
    stateObj._lastFedAt = now;
    stateObj.satiety = Util.clamp01(curSat + 0.40);
    if (stateObj.satiety > 0.80) {
        stateObj.restDrive = Util.clamp01((stateObj.restDrive || 0) + 0.03);
    }
    stateObj.alertness = Util.clamp01((stateObj.alertness === undefined ? 0.6 : stateObj.alertness) + 0.06 * appetite);
    var prevAr = stateObj.arousal === undefined ? 0.30 : stateObj.arousal;
    stateObj.arousal = Util.clamp01(prevAr + (0.24 - prevAr) * 0.25);
    stateObj.happiness = Util.clamp01(stateObj.happiness + 0.14 * appetite * (1 - stateObj.happiness * 0.78));
    stateObj.mood = Util.clamp01(stateObj.mood + 0.16 * appetite);
    stateObj.bond = Util.clamp01(curBond + 0.015 * appetite * (1 - curBond * 0.82));
    stateObj.trust = Util.clamp01((stateObj.trust || 0.35) + 0.026 * appetite);
    stateObj.sanctuaryActivity = "Happily munching an Oran Berry";
    Memory.recordEpisode(stateObj, "fed_snack", { valence: 0.45 + 0.35 * appetite, salience: 0.55 + 0.20 * appetite });
    Memory.thinkAloud(stateObj, "pen_fed", "Happily ate an Oran Berry in the Sanctuary", { minGapMs: 2000 });
    if (nowMs) delete stateObj._simNow;
    return "ate";
}

function playInPen(stateObj, nowMs) {
    if (!stateObj) return "busy";
    var now = nowMs || Date.now();
    if (nowMs) stateObj._simNow = nowMs;
    var careSat = stateObj._careSatiation || 0;
    var satMult = Math.max(0.15, 1 - careSat * 0.82);
    stateObj._careSatiation = Math.min(1, careSat + 0.32);
    var curBond = stateObj.bond === undefined ? 0.3 : stateObj.bond;
    stateObj.happiness = Util.clamp01(stateObj.happiness + 0.10 * satMult * (1 - stateObj.happiness * 0.75));
    stateObj.mood = Util.clamp01(stateObj.mood + 0.16 * satMult);
    stateObj.bond = Util.clamp01(curBond + 0.012 * satMult * (1 - curBond * 0.80));
    stateObj.trust = Util.clamp01((stateObj.trust || 0.35) + 0.02 * satMult);
    stateObj.playDrive = Math.max(0, stateObj.playDrive - 0.25);
    stateObj.restDrive = Math.max(0, (stateObj.restDrive || 0) - 0.06 * satMult);
    stateObj.alertness = Util.clamp01((stateObj.alertness === undefined ? 0.6 : stateObj.alertness) + 0.14 * satMult);
    stateObj.arousal = Util.clamp01((stateObj.arousal === undefined ? 0.30 : stateObj.arousal) + 0.24);
    stateObj.careWakeUntil = now + 210000;
    stateObj.penState = "idle";
    stateObj.sanctuaryActivity = "Romping playfully across the Sanctuary clearing";
    Memory.recordEpisode(stateObj, "played_solo", { valence: 0.6 * satMult, salience: 0.55 * satMult });
    Memory.thinkAloud(stateObj, "pen_play", "Played a lively game in the Sanctuary", { minGapMs: 2000 });
    if (nowMs) delete stateObj._simNow;
    return "play";
}
