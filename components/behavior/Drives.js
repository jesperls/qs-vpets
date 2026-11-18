.pragma library

.import "../SpeciesProfile.js" as SpeciesProfile
.import "Personality.js" as Personality
.import "Util.js" as Util

var clamp01 = Util.clamp01;

var PLAYING_STATES = {
    zoomies: true, attack: true, hop: true, shoot: true, charge: true,
    rotate: true, twirl: true, sink: true, dance: true, sing: true,
    appeal: true, tailWhip: true, emit: true, spAttack: true, strike: true,
    quickStrike: true, multiStrike: true, swing: true, leapForth: true,
    double: true, rearUp: true, rumble: true, hover: true, lick: true,
    kick: true, shake: true
};

var KINETIC_STATES = {
    zoomies: true, dance: true, twirl: true, rotate: true,
    attack: true, strike: true, quickStrike: true, multiStrike: true,
    swing: true, leapForth: true, double: true, charge: true,
    shoot: true, spAttack: true, rearUp: true, rumble: true, kick: true
};

var EXPRESSIVE_STATES = {
    hop: true, appeal: true, sing: true, tailWhip: true, emit: true, airborne: true
};

function isPlayingState(s) {
    return !!(s && PLAYING_STATES[s]);
}

function noteActivityState(pet, s) {
    if (!pet || !s) return;
    var cur = pet.arousal === undefined ? 0.30 : pet.arousal;
    if (s === "zoomies" || (s === "walk" && pet.gait === "scamper")) {
        if (cur < 0.80) pet.arousal = clamp01(cur + (0.80 - cur) * 0.72);
        if (pet.sleepInertia > 0) pet.sleepInertia = Math.max(0, pet.sleepInertia * 0.45);
        pet.alertness = clamp01((pet.alertness === undefined ? 0.65 : pet.alertness) + 0.04);
    } else if (KINETIC_STATES[s]) {
        if (cur < 0.72) pet.arousal = clamp01(cur + (0.72 - cur) * 0.70);
        if (pet.sleepInertia > 0) pet.sleepInertia = Math.max(0, pet.sleepInertia * 0.55);
        pet.alertness = clamp01((pet.alertness === undefined ? 0.65 : pet.alertness) + 0.025);
    } else if (EXPRESSIVE_STATES[s]) {
        if (cur < 0.58) pet.arousal = clamp01(cur + (0.58 - cur) * 0.45);
        if (pet.sleepInertia > 0) pet.sleepInertia = Math.max(0, pet.sleepInertia * 0.75);
    }
}

function _relax(current, target, dt, tau) {
    if (tau <= 0) return target;
    return current + (target - current) * (1 - Math.exp(-dt / tau));
}

function effectivePatience(pet) {
    var base = (pet && pet.personality && pet.personality.patience !== undefined) ? pet.personality.patience : 0.5;
    var rest = (pet && pet.restDrive !== undefined) ? pet.restDrive : 0;
    var overtired = rest > 0.76 ? (rest - 0.76) * 1.15 : 0;
    var overhandled = (pet && pet._careSatiation > 0.72) ? (pet._careSatiation - 0.72) * 0.45 : 0;
    return clamp01(base - overtired - overhandled);
}

function fullThresholdFor(pet) {
    return SpeciesProfile.hasAbility(pet, "forage_stash") ? 0.88 : 0.82;
}

function appraiseMeal(pet) {
    var cur = (pet && pet.satiety !== undefined) ? pet.satiety : 0.58;
    var fullAt = fullThresholdFor(pet);
    if (cur >= fullAt) {
        return { canEat: false, fullAt: fullAt, appetite: 0 };
    }
    var appetite = clamp01((fullAt - cur) / 0.44);
    return { canEat: true, fullAt: fullAt, appetite: Math.max(0.18, appetite) };
}

function consumeMeal(pet, appetite) {
    var app = clamp01(appetite === undefined ? 0.6 : appetite);
    var curSat = pet.satiety === undefined ? 0.58 : pet.satiety;
    var nextSat = clamp01(curSat + 0.40);
    pet.satiety = nextSat;
    if ("_stuffedRefusals" in pet || !pet.petWindow) {
        pet._stuffedRefusals = 0;
    }
    happier(pet, 0.14 * app);
    shiftTrust(pet, 0.028 * app);
    pet.mood = clamp01((pet.mood === undefined ? 0.5 : pet.mood) + 0.16 * app);
    pet.boredom = clamp01((pet.boredom || 0) - 0.14 * app);
    if (pet.alertness !== undefined && pet.alertness < 0.48) {
        pet.alertness = clamp01(pet.alertness + 0.08 * app);
    }
    if ("arousal" in pet || !pet.petWindow) {
        var curAr = pet.arousal === undefined ? 0.30 : pet.arousal;
        pet.arousal = clamp01(curAr + (0.24 - curAr) * 0.25);
    }
    if (nextSat > 0.80) {
        pet.restDrive = clamp01((pet.restDrive || 0) + 0.035);
    }
    pet.calmUntil = Math.max(pet.calmUntil || 0, Util.now(pet) + 45000);
}

function sleepPropensity(pet, perc) {
    var p = pet.personality;
    var spProf = SpeciesProfile.profileFor(SpeciesProfile.trueSpeciesOf(pet));
    var isNocturnal = !!(spProf.nocturnalAffinity
        || Personality.hasQuirk(pet, "night_watch")
        || SpeciesProfile.hasAbility(pet, "lunar_pulse"));
    var circadian = (perc && perc.isNight)
        ? (isNocturnal ? (perc.userIdle ? 0.08 : -0.14) : 0.24)
        : (spProf.nocturnalAffinity && perc && !perc.isNight && !perc.isDusk ? 0.10 : 0);
    var arousal = pet.arousal === undefined ? 0.28 : pet.arousal;
    var arousalInhibit = Math.max(0, arousal - 0.34) * 1.15;
    var moodLiftInhibit = Math.max(0, (pet.mood === undefined ? 0.5 : pet.mood) - 0.74) * 0.35;
    var inertiaPull = (pet.sleepInertia || 0) * 0.12;
    return (pet.restDrive || 0) * (0.82 + p.sleepiness * 0.56)
         + Math.max(0, 0.58 - (pet.alertness === undefined ? 0.65 : pet.alertness)) * 0.30
         + circadian
         + inertiaPull
         - arousalInhibit
         - moodLiftInhibit;
}

function integrate(pet, perc, dt) {
    if (!(dt > 0)) return;
    var p = pet.personality;
    var s = pet.state_;
    var loafing = s === "loaf" || s === "laying" || s === "sit";
    var deep = s === "deepsleep";
    var attentiveLoaf = loafing && !!pet._attentiveRest;
    var trueSleeping = (loafing && !attentiveLoaf) || deep;
    var resting = loafing || deep;
    var moving = s === "walk" || s === "wander" || s === "zoomies";
    var playing = isPlayingState(s);
    var perched = s === "perch";
    var watching = perched || s === "sitNorth" || s === "lookUpNorth" || attentiveLoaf;

    var spProf = SpeciesProfile.profileFor(SpeciesProfile.trueSpeciesOf(pet));
    var hasNightWatch = Personality.hasQuirk(pet, "night_watch");
    var isNocturnal = !!(spProf.nocturnalAffinity
        || hasNightWatch
        || SpeciesProfile.hasAbility(pet, "lunar_pulse"));
    var hasMelomaniac = Personality.hasQuirk(pet, "melomaniac");
    var hasHermit = Personality.hasQuirk(pet, "cozy_hermit");
    var hasSupervisor = Personality.hasQuirk(pet, "terminal_supervisor");
    var hasDaydreamer = Personality.hasQuirk(pet, "daydreamer");

    pet.ageSeconds = (pet.ageSeconds || 0) + dt;
    pet.maturity = clamp01(1 - Math.exp(-pet.ageSeconds / 86400));

    var curSat = pet.satiety === undefined ? 0.58 : pet.satiety;
    var satTau = trueSleeping ? 9600 : (moving ? 4500 : 5400);
    pet.satiety = clamp01(_relax(curSat, 0.36, dt, satTau));
    if (pet._stuffedRefusals > 0 && pet.satiety < fullThresholdFor(pet) - 0.08) {
        pet._stuffedRefusals = 0;
    }

    if (trueSleeping) {
        var drain = (0.000095 - p.sleepiness * 0.000030) * (deep ? 1.50 : 0.85) * (hasDaydreamer ? 1.18 : 1.0);
        if (perc.atHome && hasHermit) drain *= 1.25;
        pet.restDrive = clamp01(pet.restDrive - drain * dt);
    } else {
        var build = 0.000038 + p.sleepiness * 0.000072;
        if (attentiveLoaf) {
            build *= 0.28;
        } else {
            if (perc.isNight) {
                build *= isNocturnal ? (perc.userIdle ? 0.92 : 0.72) : 1.85;
            } else if (spProf.nocturnalAffinity && !perc.isDusk && !perc.isDawn) {
                build *= 1.18;
            }
            if (perc.systemBusy) build *= 1.15;
            if (perc.lowBattery) build *= 1.18;
            if (watching) build *= 0.55;
            if (moving) build *= (pet.gait === "scamper" || s === "zoomies") ? 1.65 : 1.22;
            else if (playing) build *= 1.35;
        }
        pet.restDrive = clamp01(pet.restDrive + build * dt);
    }

    if (trueSleeping) {
        var recover = (0.000065 + p.energy * 0.000055) * (deep ? 1.55 : 0.72) * (hasDaydreamer ? 1.15 : 1.0);
        pet.alertness = clamp01(pet.alertness + recover * dt);
    } else if (playing || s === "zoomies" || pet.gait === "scamper") {
        pet.alertness = clamp01(pet.alertness + 0.00022 * dt);
    } else if (attentiveLoaf) {
        pet.alertness = clamp01(pet.alertness - 0.000010 * dt);
    } else {
        var fade = 0.000020 + (1 - p.energy) * 0.000036;
        if (perc.isNight) fade *= isNocturnal ? 0.82 : 2.45;
        else if (spProf.nocturnalAffinity && !perc.isDusk && !perc.isDawn) fade *= 1.22;
        if (perc.mediaPlaying && hasMelomaniac) fade *= 0.65;
        if (perc.audioMuted) fade *= 1.14;
        pet.alertness = clamp01(pet.alertness - fade * dt);
    }

    var curArousal = pet.arousal === undefined ? 0.30 : pet.arousal;
    var curInertia = pet.sleepInertia || 0;
    if (trueSleeping) {
        curArousal = clamp01(_relax(curArousal, deep ? 0.06 : 0.12, dt, 38));
        var inertiaTarget = deep ? (0.64 + p.sleepiness * 0.24) : (0.22 + p.sleepiness * 0.16);
        curInertia = clamp01(_relax(curInertia, inertiaTarget, dt, 140));
    } else {
        var targetArousal;
        if (s === "zoomies" || pet.gait === "scamper") {
            targetArousal = 0.86;
        } else if (playing) {
            targetArousal = 0.74;
        } else if (moving) {
            targetArousal = 0.42 + p.energy * 0.18;
        } else if (watching) {
            targetArousal = 0.22 + p.energy * 0.10;
        } else {
            targetArousal = 0.16 + p.energy * 0.16 + (perc.mediaPlaying ? 0.08 : 0) - (perc.isNight ? 0.06 : 0);
        }
        curArousal = clamp01(_relax(curArousal, clamp01(targetArousal), dt, (playing || s === "zoomies") ? 12 : 78));
        curInertia = clamp01(_relax(curInertia, 0, dt, (moving || playing) ? 18 : 42));
    }
    pet.arousal = curArousal;
    pet.sleepInertia = curInertia;
    if (pet._careSatiation > 0) {
        pet._careSatiation = Math.max(0, pet._careSatiation * Math.exp(-dt / 75));
    }

    if (moving) {
        pet.exploreDrive = clamp01(pet.exploreDrive - 0.00050 * dt);
    } else if (resting) {
        pet.exploreDrive = clamp01(pet.exploreDrive - 0.00012 * dt);
    } else {
        var er = (0.00018 + p.curiosity * 0.00038) * (0.3 + pet.alertness * 0.7);
        if (s === "idle" && !pet.activePlan) er *= 1.35;
        if (perc.windowCount > 3) er *= 1.25;
        if (perc.userBusy && !watching) {
            var steadyAnchor = p.composure >= 0.56
                            || SpeciesProfile.hasAbility(pet, "soothing_ribbon")
                            || Personality.hasQuirk(pet, "velcro_companion");
            var calmPeerNear = !!(perc.nearest && perc.nearest.sameScreen && perc.nearest.dist < 220
                                  && perc.nearest.pet && perc.nearest.pet.personality
                                  && perc.nearest.pet.personality.composure >= 0.60);
            er *= steadyAnchor ? 0.62 : (calmPeerNear ? 0.85 : 1.28);
        }
        if (perc.lowBattery) er *= 0.72;
        pet.exploreDrive = clamp01(pet.exploreDrive + er * dt);
    }

    if (deep) {
        pet.socialDrive = clamp01(pet.socialDrive - 0.00008 * dt);
    } else {
        var sr = 0.000055 + p.sociability * 0.00020 + (pet.bond || 0.3) * 0.00006;
        if ((perc.hour >= 8 && perc.hour <= 11) || (perc.hour >= 18 && perc.hour <= 22)) sr *= 1.20;
        if ((watching || loafing) && perc.win && perc.win.dist < 340) sr *= 0.28;
        pet.socialDrive = clamp01(pet.socialDrive + sr * dt);
    }
    if (perc.nearest && perc.nearest.dist < 220 && perc.nearest.affinity > 0.52) {
        pet.socialDrive = clamp01(pet.socialDrive - 0.00018 * perc.nearest.affinity * dt);
    } else if (perc.nearest && perc.nearest.dist < 150 && perc.nearest.affinity < 0.36 && !deep) {
        pet.mood = clamp01(pet.mood - 0.000045 * (1 - p.patience * 0.6) * dt);
    }

    if (playing) {
        pet.playDrive = clamp01(pet.playDrive - 0.0045 * dt);
    } else if (deep) {
        pet.playDrive = clamp01(pet.playDrive - 0.00008 * dt);
    } else if (loafing) {
        var restPlay = p.playfulness > 0.55 ? 0.00003 * p.playfulness : -0.00003;
        pet.playDrive = clamp01(pet.playDrive + restPlay * dt);
    } else {
        var pr = (0.000045 + p.playfulness * 0.00034) * (0.2 + pet.alertness * 0.8);
        if (pet.happiness > 0.6) pr *= 1.35;
        if (perc.mediaPlaying) pr *= hasMelomaniac ? 1.65 : 1.2;
        if (perc.isRaining && SpeciesProfile.hasAbility(pet, "tide_splash")) pr *= 1.35;
        if (perc.micActive) pr *= 0.35;
        if (perc.lowBattery) pr *= 0.60;
        pet.playDrive = clamp01(pet.playDrive + pr * dt);
    }

    if (resting || playing) {
        pet.boredom = clamp01(pet.boredom - 0.00055 * dt);
    } else if (moving) {
        pet.boredom = clamp01(pet.boredom - 0.00030 * dt);
    } else if (watching && !perc.userIdle) {
        pet.boredom = clamp01(pet.boredom - 0.00012 * dt);
    } else {
        var idleMult = (s === "idle" && !pet.activePlan) ? 2.2 : 1.0;
        var br = (0.00030 + p.energy * 0.00052) * idleMult * (perc.micActive ? 0.45 : 1.0);
        pet.boredom = clamp01(pet.boredom + br * dt);
    }

    var homeNeed = clamp01((perc.distFromHome - 280) / 650) * (1 - p.boldness * 0.62);
    if (perc.fullscreen) homeNeed = Math.max(homeNeed, 0.32 + (1 - p.boldness) * 0.42);
    if ((pet.trust !== undefined ? pet.trust : 0.35) < 0.25 && perc.cursor.dist < 180 && perc.cursor.speed > 450) {
        homeNeed = Math.max(homeNeed, 0.55 * (1 - p.composure * 0.5));
    }
    homeNeed += (1 - pet.alertness) * 0.12 * (1 - p.boldness);
    pet.comfortDrive = clamp01(_relax(pet.comfortDrive, homeNeed, dt, 40));

    if (perc.atHome && resting) {
        pet.happiness = clamp01(pet.happiness + 0.000045 * (1 + p.patience + (hasHermit ? 0.5 : 0)) * dt);
    }
    if (trueSleeping && hasDaydreamer) {
        pet.happiness = clamp01(pet.happiness + 0.000035 * dt);
    }
    if (perc.mediaPlaying && !deep) {
        var musicLift = (0.00003 + p.playfulness * 0.00003) * (hasMelomaniac ? 2.0 : 1.0);
        pet.mood = clamp01(pet.mood + musicLift * dt);
    }
    var winEdgeDist = (perc.win && perc.win.edgeDist !== undefined) ? perc.win.edgeDist : (perc.win ? perc.win.dist : 9999);
    if (hasSupervisor && perc.win && perc.win.isCode && winEdgeDist < 260 && !deep) {
        pet.happiness = clamp01(pet.happiness + 0.00004 * dt);
    }
    var onActiveDesktop = !perc.userIdle && (perc.cursor.onMyScreen || (perc.win && perc.win.onMyScreen));
    var curTrust = pet.trust === undefined ? 0.35 : pet.trust;
    var curMood = pet.mood === undefined ? 0.5 : pet.mood;
    if (onActiveDesktop && !deep && perc.cursor.speed < 650 && curTrust < 0.62 && curMood >= 0.46) {
        curTrust = clamp01(curTrust + 0.000012 * (0.45 + p.composure * 0.55) * dt);
        pet.trust = curTrust;
    }
    if (onActiveDesktop && perc.cursor.speed < 750 && curTrust > 0.38 && curMood >= 0.46) {
        var curBond = pet.bond === undefined ? 0.3 : pet.bond;
        var nearActiveWin = perc.win && perc.win.onMyScreen && winEdgeDist < 260;
        var coPresenceRate = (nearActiveWin ? 0.000014 : 0.000009) * (0.55 + p.sociability * 0.75) * (1 - curBond * 0.82);
        pet.bond = clamp01(curBond + coPresenceRate * dt);
    }

    var mealGlow = Math.max(0, pet.satiety - 0.58) * 0.10;
    var baselineHappiness = 0.47 + (pet.bond || 0.3) * 0.14 + mealGlow;
    pet.happiness = clamp01(_relax(pet.happiness, clamp01(baselineHappiness), dt, 12600));
    pet.mood = clamp01(_relax(pet.mood, pet.happiness, dt, 540));
}

function stimulate(pet, amount) {
    pet.alertness = clamp01(pet.alertness + amount);
    pet.exploreDrive = clamp01(pet.exploreDrive + amount * 0.28);
    pet.playDrive = clamp01(pet.playDrive + amount * 0.16);
    pet.boredom = clamp01(pet.boredom - Math.abs(amount) * 0.9);
    if (amount > 0) {
        pet.arousal = clamp01((pet.arousal === undefined ? 0.30 : pet.arousal) + amount * 1.15);
        pet.sleepInertia = clamp01((pet.sleepInertia || 0) - amount * 0.60);
    }
}

function eventful(pet, amount) {
    pet.boredom = clamp01(pet.boredom - amount);
}

function happier(pet, amount) {
    if (amount >= 0) {
        pet.happiness = clamp01(pet.happiness + amount * (1 - pet.happiness * 0.85));
    } else {
        pet.happiness = clamp01(pet.happiness + amount);
    }
}

function shiftTrust(pet, delta) {
    var cur = pet.trust === undefined ? 0.35 : pet.trust;
    var composureGuard = delta < 0 ? (1 - pet.personality.composure * 0.45) : 1.0;
    pet.trust = clamp01(cur + delta * composureGuard);
    var curBond = pet.bond === undefined ? 0.3 : pet.bond;
    if (delta > 0) {
        pet.bond = clamp01(curBond + delta * 0.55 * (1 - curBond * 0.72));
    } else if (delta < -0.05) {
        pet.bond = clamp01(curBond + delta * 0.25);
    }
}
