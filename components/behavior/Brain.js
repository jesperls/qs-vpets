.pragma library

.import "../SpeciesProfile.js" as SpeciesProfile
.import "Personality.js" as Personality
.import "Drives.js" as Drives
.import "Memory.js" as Memory
.import "Perception.js" as Perception
.import "Social.js" as Social
.import "Plans.js" as Plans
.import "Gestures.js" as Gestures
.import "BrainCandidates.js" as BrainCandidates
.import "BrainEvents.js" as BrainEvents
.import "Util.js" as Util

var COMMIT_BONUS = 0.24;
var SCORE_NOISE = 0.10;
var CANDIDATE_WINDOW = 0.48;

var _pick = Gestures.pickAvailable;

function _softmaxPick(pet, cands) {
    var max = -Infinity;
    var committed = pet.intention && Util.now(pet) < pet.intention.until;
    for (var i = 0; i < cands.length; i++) {
        cands[i].score += (Math.random() - 0.5) * SCORE_NOISE;
        if (committed && cands[i].name === pet.intention.name
                && (!pet.intention.otherName || cands[i].otherName === pet.intention.otherName)) {
            cands[i].score += COMMIT_BONUS;
        }
        if (cands[i].score > max) max = cands[i].score;
    }
    var temp = 0.09 + (1 - pet.personality.patience) * 0.06;
    var total = 0, weights = [];
    for (var j = 0; j < cands.length; j++) {
        var d = cands[j].score - max;
        var w = d < -CANDIDATE_WINDOW ? 0 : Math.exp(d / temp);
        weights.push(w);
        total += w;
    }
    if (total <= 0) return cands[0];
    var r = Math.random() * total;
    for (var k = 0; k < cands.length; k++) {
        r -= weights[k];
        if (r <= 0) return cands[k];
    }
    return cands[cands.length - 1];
}

function think(pet, nav) {
    if (Plans.hasActivePlan(pet)) {
        if (pet.onJourney && retarget(pet)) {
            nav.resumeJourney(pet);
            return;
        }
        Plans.advanceStep(pet, nav, _pick);
        return;
    }

    var perc = Perception.perceive(pet);
    var cands = BrainCandidates.scoreCandidates(pet, perc, nav, _pick);
    if (cands.length === 0) {
        pet.restartIdle();
        return;
    }

    var choice = _softmaxPick(pet, cands);
    if (!choice) {
        pet.restartIdle();
        return;
    }
    choice.exec();
}

function onPlanBeat(pet, nav) {
    if (Plans.hasActivePlan(pet)) {
        Plans.advanceStep(pet, nav, _pick);
    } else {
        think(pet, nav);
    }
}

function checkStalkGlance(pet, nav) {
    if (!pet.activePlan || pet.activePlan.name !== "sneak_boop") return false;
    if (pet.activePlan.stepIndex > 0) return false;
    var target = Util.findPet(pet, pet.activePlan.otherName);
    if (!target || !Social.isPeerLookingAt(target, pet)) return false;
    pet.activePlan.stepIndex = -1;
    Plans.advanceStep(pet, nav, _pick);
    return true;
}

function onActionFinished(pet, nav) {
    if (Plans.hasActivePlan(pet)) {
        var step = Plans.currentStep(pet);
        if (step && (step.kind === "act" || step.kind === "vocal" || step.kind === "pant"
                || step.kind === "face_away" || step.kind === "zoomies"
                || step.kind === "ability_effect")) {
            Plans.advanceStep(pet, nav, _pick);
            return;
        }
    }
    pet.enterState("idle");
}

function restTick(pet) {
    var perc = Perception.perceive(pet);
    var p = pet.personality;
    var deep = pet.state_ === "deepsleep";
    var quietHour = 1 - Memory.usualUserActivity(pet, perc.hour);

    if (deep || (pet.episodes && pet.episodes.length >= 4)) {
        var dream = Memory.consolidateSleep(pet);
        syncArchetype(pet);
        if (deep && dream && pet.emitEmote) {
            pet.emitEmote(dream.emote);
        }
    }

    var stay = pet.restDrive * 1.12
             + p.sleepiness * 0.48
             - pet.alertness * 0.40
             + (perc.isNight ? 0.36 + p.sleepiness * 0.34 : 0)
             + quietHour * 0.16
             + (deep ? 0.16 : 0)
             + (perc.userIdle ? 0.10 : 0);

    if (stay > 0.52 + Math.random() * 0.28) {
        var wantDeep = pet.restDrive > 0.56
                    || (perc.isNight && p.sleepiness > 0.25)
                    || (!deep && pet.restDrive > 0.42 && p.sleepiness > 0.48);
        pet.continueResting(wantDeep ? "deepsleep" : "loaf");
        return;
    }

    Memory.recordEpisode(pet, "well_rested", { valence: 0.3 });
    Memory.thinkAloud(pet, "woke_up", "Stretched awake refreshed");
    Plans.clearPlan(pet);
    pet.enterState(SpeciesProfile.wakeStateFor(pet));
}

function syncArchetype(pet) {
    var title = Personality.archetypeTitle(pet.personality, pet.quirks, pet.maturity, pet.bond);
    if (title !== pet.archetype && pet.archetype && pet.archetype !== "Curious Hatchling" && (pet.maturity || 0) >= 0.08) {
        var art = /^[AEIOU]/i.test(title) ? "an " : "a ";
        Memory.addJournalEntry(pet, "Grew into " + art + title + ".", "archetype");
    }
    pet.archetype = title;
    return title;
}

function reflect(pet) {
    var dream = Memory.consolidateSleep(pet);
    syncArchetype(pet);
    return dream;
}

function retarget(pet) {
    var plan = pet.activePlan;
    if (!plan) return true;
    if (Util.now(pet) > plan.until) return false;
    var step = Plans.currentStep(pet);
    if (!step || step.kind !== "travel") return true;
    var target = Plans.resolveStepTarget(pet, true);
    if (!target) return false;
    pet.targetGX = target.gx;
    pet.targetGY = target.gy;
    return true;
}

function onArrived(pet, nav) {
    if (Plans.hasActivePlan(pet)) {
        Plans.advanceStep(pet, nav, _pick);
        return;
    }
    Drives.eventful(pet, 0.18);
    pet.enterState("idle");
}

function onBlocked(pet) {
    if (Plans.hasActivePlan(pet)) {
        Plans.abortPlan(pet, "blocked");
    }
    pet.enterState("idle");
}

function onEvent(pet, type, data, nav) {
    BrainEvents.handleEvent(pet, type, data, nav, _pick);
}

var ambientGlanceRow = Gestures.ambientGlanceRow;
var fidget = Gestures.fidget;
var idleMicroAction = Gestures.idleMicroAction;
