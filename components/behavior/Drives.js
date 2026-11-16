.pragma library

.import "../SpeciesProfile.js" as SpeciesProfile
.import "Personality.js" as Personality
.import "Util.js" as Util

var clamp01 = Util.clamp01;

function _relax(current, target, dt, tau) {
    if (tau <= 0) return target;
    return current + (target - current) * (1 - Math.exp(-dt / tau));
}

function effectivePatience(pet) {
    var base = (pet && pet.personality && pet.personality.patience !== undefined) ? pet.personality.patience : 0.5;
    var rest = (pet && pet.restDrive !== undefined) ? pet.restDrive : 0;
    var overtired = rest > 0.76 ? (rest - 0.76) * 1.15 : 0;
    return clamp01(base - overtired);
}

function integrate(pet, perc, dt) {
    if (!(dt > 0)) return;
    var p = pet.personality;
    var s = pet.state_;
    var loafing = s === "loaf" || s === "laying" || s === "sit";
    var deep = s === "deepsleep";
    var resting = loafing || deep;
    var moving = s === "walk" || s === "wander" || s === "zoomies";
    var playing = s === "zoomies" || s === "attack" || s === "hop" || s === "shoot"
               || s === "charge" || s === "rotate" || s === "twirl" || s === "sink";
    var perched = s === "perch";
    var watching = perched || s === "sitNorth" || s === "lookUpNorth";

    var hasNightWatch = Personality.hasQuirk(pet, "night_watch");
    var hasMelomaniac = Personality.hasQuirk(pet, "melomaniac");
    var hasHermit = Personality.hasQuirk(pet, "cozy_hermit");
    var hasSupervisor = Personality.hasQuirk(pet, "terminal_supervisor");

    pet.ageSeconds = (pet.ageSeconds || 0) + dt;
    pet.maturity = clamp01(1 - Math.exp(-pet.ageSeconds / 86400));

    var satDrain = resting ? 0.000018 : (moving ? 0.000055 : 0.000038);
    pet.satiety = clamp01((pet.satiety === undefined ? 0.55 : pet.satiety) - satDrain * dt);

    if (resting) {
        var drain = (0.000095 - p.sleepiness * 0.000030) * (deep ? 1.50 : 0.85);
        if (perc.atHome && hasHermit) drain *= 1.25;
        pet.restDrive = clamp01(pet.restDrive - drain * dt);
    } else {
        var build = 0.000038 + p.sleepiness * 0.000072;
        if (perc.isNight && !(hasNightWatch && !perc.userIdle)) build *= 1.75;
        if (perc.systemBusy) build *= 1.15;
        if (perc.lowBattery) build *= 1.18;
        if (watching) build *= 0.55;
        if (moving) build *= (pet.gait === "scamper" || s === "zoomies") ? 1.65 : 1.22;
        pet.restDrive = clamp01(pet.restDrive + build * dt);
    }

    if (resting) {
        var recover = (0.000065 + p.energy * 0.000055) * (deep ? 1.55 : 0.72);
        pet.alertness = clamp01(pet.alertness + recover * dt);
    } else {
        var fade = 0.000020 + (1 - p.energy) * 0.000036;
        if (perc.isNight) fade *= (hasNightWatch && !perc.userIdle) ? 1.15 : 2.35;
        if (perc.mediaPlaying && hasMelomaniac) fade *= 0.65;
        if (perc.audioMuted) fade *= 1.14;
        pet.alertness = clamp01(pet.alertness - fade * dt);
    }

    if (moving) {
        pet.exploreDrive = clamp01(pet.exploreDrive - 0.00055 * dt);
    } else if (resting) {
        pet.exploreDrive = clamp01(pet.exploreDrive - 0.00012 * dt);
    } else {
        var er = (0.00011 + p.curiosity * 0.00028) * (0.3 + pet.alertness * 0.7);
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
    } else {
        var pr = (0.000065 + p.playfulness * 0.00030) * (0.2 + pet.alertness * 0.8);
        if (pet.happiness > 0.6) pr *= 1.35;
        if (perc.mediaPlaying) pr *= hasMelomaniac ? 1.65 : 1.2;
        if (perc.isRaining && SpeciesProfile.hasAbility(pet, "tide_splash")) pr *= 1.35;
        if (perc.micActive) pr *= 0.35;
        if (perc.lowBattery) pr *= 0.60;
        pet.playDrive = clamp01(pet.playDrive + pr * dt);
    }

    if (resting || playing) {
        pet.boredom = clamp01(pet.boredom - 0.0006 * dt);
    } else if (watching && !perc.userIdle) {
        pet.boredom = clamp01(pet.boredom - 0.00018 * dt);
    } else {
        var br = 0.00026 * (0.45 + p.energy * 0.8) * (perc.micActive ? 0.45 : 1.0);
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
    if (perc.mediaPlaying && !deep) {
        var musicLift = (0.00003 + p.playfulness * 0.00003) * (hasMelomaniac ? 2.0 : 1.0);
        pet.mood = clamp01(pet.mood + musicLift * dt);
    }
    if (hasSupervisor && perc.win && perc.win.isCode && perc.win.dist < 320 && !deep) {
        pet.happiness = clamp01(pet.happiness + 0.00004 * dt);
    }
    if (!perc.userIdle && perc.win && perc.win.dist < 340 && (pet.trust || 0.35) > 0.4) {
        pet.bond = clamp01((pet.bond || 0.3) + 0.000012 * (0.5 + p.sociability) * dt);
    }

    var baselineHappiness = 0.46 + (pet.bond || 0.3) * 0.14 + (pet.satiety - 0.5) * 0.08;
    pet.happiness = clamp01(_relax(pet.happiness, clamp01(baselineHappiness), dt, 12600));
    pet.mood = clamp01(_relax(pet.mood, pet.happiness, dt, 540));
}

function stimulate(pet, amount) {
    pet.alertness = clamp01(pet.alertness + amount);
    pet.exploreDrive = clamp01(pet.exploreDrive + amount * 0.28);
    pet.playDrive = clamp01(pet.playDrive + amount * 0.16);
    pet.boredom = clamp01(pet.boredom - Math.abs(amount) * 0.9);
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
    if (delta > 0) {
        pet.bond = clamp01((pet.bond === undefined ? 0.3 : pet.bond) + delta * 0.55);
    } else if (delta < -0.05) {
        pet.bond = clamp01((pet.bond === undefined ? 0.3 : pet.bond) + delta * 0.25);
    }
}
