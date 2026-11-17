.pragma library

.import "../SpeciesProfile.js" as SpeciesProfile
.import "Personality.js" as Personality
.import "Drives.js" as Drives
.import "Memory.js" as Memory
.import "Perception.js" as Perception
.import "Social.js" as Social
.import "Abilities.js" as Abilities
.import "Plans.js" as Plans
.import "Topology.js" as Topology
.import "Gestures.js" as Gestures
.import "Util.js" as Util

function _cancelRetire(pet) {
    if (pet && typeof pet.cancelRetireIfInterrupted === "function") {
        pet.cancelRetireIfInterrupted();
    }
}

function handleUserEvent(pet, type, data, nav, pickFn, ctx) {
    var p = ctx.p;
    var now = ctx.now;
    var loafing = ctx.loafing;
    var resting = ctx.resting;
    var trust = ctx.trust;
    var cooldown = ctx.cooldown;

    switch (type) {
    case "cursor_near": {
        if (cooldown(pet, "cursor_near", 45000)) return true;
        var cursorSpeed = (pet.inputTracker && pet.inputTracker.cursorSpeed) || 0;
        var suddenRush = cursorSpeed > 1250 && trust < 0.50 && p.composure < 0.55;
        var valence = p.boldness * 0.4 + p.sociability * 0.3 + trust * 0.45 - 0.35
                    + pet.mood * 0.15 - (suddenRush ? 0.50 : 0);

        if (valence >= 0) {
            pet.mood = Drives.clamp01(pet.mood + 0.02);
            Memory.recordPlaceAffect(pet, 0.06);
            if (!resting && pet.state_ === "idle" && pet.inputTracker) {
                Util.faceGlobal(pet, pet.inputTracker.cursorX, pet.inputTracker.cursorY);
            }
        } else {
            pet.alertness = Drives.clamp01(pet.alertness + 0.24);
            pet.mood = Math.max(0, pet.mood - 0.04);
            Memory.recordPlaceAffect(pet, -0.08);
            Memory.recordEpisode(pet, "startled", { valence: -0.35 });
            Memory.thinkAloud(pet, "startled", "Startled by fast cursor movement", { minGapMs: 25000 });
            if (pet.emitEmote) pet.emitEmote("exclaim");
            if (!resting) {
                Plans.clearPlan(pet);
                var bunkerStates = Abilities.startledStates(pet);
                if (bunkerStates) {
                    pet.mood = Drives.clamp01(pet.mood + 0.02);
                    pet.enterState(pickFn(pet, bunkerStates));
                } else if (p.boldness < 0.28 && nav && pet.inputTracker) {
                    pet.gait = "scamper";
                    nav.fleeFrom(pet, pet.inputTracker.cursorX, pet.inputTracker.cursorY, 170 + Math.random() * 110);
                    Social.broadcastAlarm(pet, pet.inputTracker.cursorX, pet.inputTracker.cursorY);
                } else {
                    pet.enterState(pickFn(pet, Gestures.HIDE_STATES));
                }
            } else if (loafing) {
                Plans.clearPlan(pet);
                pet.enterState(SpeciesProfile.wakeStateFor(pet));
            }
        }
        return true;
    }

    case "cursor_wiggled": {
        if (resting || (pet.state_ !== "idle" && pet.state_ !== "wander")) return true;
        var wgx = data ? data.gx : (pet.inputTracker ? pet.inputTracker.cursorX : 0);
        var wgy = data ? data.gy : (pet.inputTracker ? pet.inputTracker.cursorY : 0);
        var wPerc = Perception.perceive(pet);
        if (wPerc.fullscreen || !wPerc.cursor.reachable) return true;
        var wDist = Math.hypot(wgx - wPerc.petGX, wgy - wPerc.petGY);
        if (wDist < 45 || wDist > 450) return true;

        var chaseDrive = p.playfulness * 0.55 + p.curiosity * 0.35 + p.energy * 0.20 - p.sleepiness * 0.20;
        if (chaseDrive > 0.52 && trust > 0.24 && nav && !cooldown(pet, "cursor_wiggled", 22000)) {
            Drives.stimulate(pet, 0.14);
            Plans.startPlan(pet, Plans.buildCursorChasePlan(wgx, wgy), nav, pickFn);
        } else if (p.boldness < 0.28 && trust < 0.35 && wDist < 180 && nav) {
            Plans.clearPlan(pet);
            pet.gait = "trot";
            nav.fleeFrom(pet, wgx, wgy, 140);
        } else {
            pet.attentionGX = wgx;
            pet.attentionGY = wgy;
            pet.attentionUntil = now + 5000;
            if (pet.state_ === "idle") Util.faceGlobal(pet, wgx, wgy);
        }
        return true;
    }

    case "cursor_parked": {
        if (resting || pet.state_ !== "idle" || Plans.hasActivePlan(pet) || !nav) return true;
        if (cooldown(pet, "cursor_parked", 120000)) return true;
        var cpPerc = Perception.perceive(pet);
        if (cpPerc.fullscreen || cpPerc.micActive) return true;
        var pgx = (data && data.gx !== undefined) ? data.gx : cpPerc.cursor.gx;
        var pgy = (data && data.gy !== undefined) ? data.gy : cpPerc.cursor.gy;
        var pDist = Math.hypot(pgx - cpPerc.petGX, pgy - cpPerc.petGY);
        if (pDist < 52 || pDist > 360 || !Topology.pointOnScreen(Topology.currentScreen(pet), pgx, pgy)) return true;
        var drawnToCursor = (pet.bond || 0.3) > 0.44 || Personality.hasQuirk(pet, "velcro_companion") || p.curiosity > 0.56;
        if (!drawnToCursor) return true;
        var sideOff = cpPerc.petGX < pgx ? -46 : 46;
        Plans.startPlan(pet, Plans.buildParkedCursorCompanyPlan(pgx, pgy, sideOff, pet), nav, pickFn);
        return true;
    }

    case "cursor_unparked": {
        var ugxC = (data && data.gx !== undefined) ? data.gx : 0;
        var ugyC = (data && data.gy !== undefined) ? data.gy : 0;
        var uSpd = (data && data.speed !== undefined) ? data.speed : 0;
        var uDistC = Math.hypot(ugxC - Util.petGX(pet), ugyC - Util.petGY(pet));
        var byPointer = (pet.activePlan && pet.activePlan.name === "parked_cursor_company") || uDistC < 105;
        if (!byPointer) return true;
        if (pet.activePlan && pet.activePlan.name === "parked_cursor_company") {
            Plans.clearPlan(pet);
        }
        if (loafing && uSpd > 260) {
            pet.enterState(SpeciesProfile.wakeStateFor(pet));
        } else if (pet.state_ === "idle") {
            Util.faceGlobal(pet, ugxC, ugyC);
            pet.enterState(pickFn(pet, ["nod"]));
        }
        return true;
    }

    case "petted":
    case "stroked": {
        _cancelRetire(pet);
        if (Plans.resolveBidSuccess(pet, nav, pickFn)) return true;

        if (pet.state_ === "deepsleep") {
            Drives.happier(pet, 0.06);
            Drives.shiftTrust(pet, 0.025);
            pet.mood = Drives.clamp01(pet.mood + 0.1);
            Memory.recordEpisode(pet, "petted", { valence: 0.6 });
            Memory.thinkAloud(pet, "sleepy_pat", "Stirred softly under gentle pats");
            if (pet.emitEmote) pet.emitEmote("heart", true);
            Plans.clearPlan(pet);
            pet.enterState(SpeciesProfile.wakeStateFor(pet));
            return true;
        }

        pet.socialDrive = Math.max(0, pet.socialDrive - 0.36);
        Drives.happier(pet, 0.14);
        Drives.shiftTrust(pet, 0.032);
        pet.mood = Drives.clamp01(pet.mood + 0.22);
        pet.playDrive = Drives.clamp01(pet.playDrive + 0.06);
        Drives.stimulate(pet, 0.08);
        Memory.recordPlaceAffect(pet, 0.45);
        var cls = pet.windowTracker ? pet.windowTracker.activeWindowClass : "";
        if (cls) Memory.recordWindowPref(pet, cls, 0.09);
        Memory.recordEpisode(pet, type, { valence: 0.65, salience: 0.65, windowClass: cls });
        pet.recentDrift = Personality.shiftRecent(pet.recentDrift, "sociability", 0.01);
        Memory.thinkAloud(pet, "petted", "Leaning into warm headpats", { minGapMs: 8000 });
        if (pet.emitEmote) pet.emitEmote("heart", true);
        if (pet.petManager && pet.petManager.recordUserAffection) {
            pet.petManager.recordUserAffection(pet);
        }
        if (!resting && pet.state_ !== "sitNorth" && pet.state_ !== "perch") {
            Plans.clearPlan(pet);
            var aff = (pet.bond || 0.3) > 0.50
                ? SpeciesProfile.nuzzleGesturesFor(pet)
                : SpeciesProfile.affectionGesturesFor(pet);
            if (p.playfulness > 0.68) aff = aff.concat(["hop"]);
            pet.enterState(pickFn(pet, aff));
        }
        return true;
    }

    case "clicked": {
        _cancelRetire(pet);
        if (Plans.resolveBidSuccess(pet, nav, pickFn)) return true;

        pet._pokeTimestamps = (pet._pokeTimestamps || []).filter(function(t) { return now - t < 6000; });
        pet._pokeTimestamps.push(now);
        if (pet._pokeTimestamps.length >= (3 + Math.round(p.patience * 3))) {
            pet.mood = Math.max(0, pet.mood - 0.08);
            Drives.shiftTrust(pet, -0.015);
            Memory.recordEpisode(pet, "annoyed", { valence: -0.35, note: "over-poked" });
            Memory.thinkAloud(pet, "overpoked", "Annoyed by repeated poking", { minGapMs: 4000 });
            if (pet.emitEmote) pet.emitEmote("frustrated", true);
            Plans.clearPlan(pet);
            if (!resting) pet.enterState(pickFn(pet, ["cringe", "pain", "attack"]));
            else pet.enterState(SpeciesProfile.wakeStateFor(pet));
            return true;
        }

        if (resting) {
            Memory.thinkAloud(pet, "woken_poke", "Stretched awake when nudged");
            if (pet.emitEmote) pet.emitEmote("question", true);
            Plans.clearPlan(pet);
            pet.enterState(SpeciesProfile.wakeStateFor(pet));
            return true;
        }

        Drives.stimulate(pet, 0.08);
        if (pet.inputTracker && pet.inputTracker.cursorKnown) {
            Util.faceGlobal(pet, pet.inputTracker.cursorX, pet.inputTracker.cursorY);
        }
        if (pet.state_ !== "perch") Plans.clearPlan(pet);
        if (trust > 0.35 || p.sociability > 0.45) {
            Drives.happier(pet, 0.04);
            Drives.shiftTrust(pet, 0.01);
            if (pet.emitEmote && pet.mood > 0.55) pet.emitEmote("note", true);
            if (pet.state_ !== "perch") pet.enterState(pickFn(pet, SpeciesProfile.affectionGesturesFor(pet)));
        } else {
            if (pet.emitEmote) pet.emitEmote("question", true);
            if (pet.state_ !== "perch") pet.enterState(pickFn(pet, ["cringe", "nod"]));
        }
        return true;
    }

    case "fed": {
        _cancelRetire(pet);
        Plans.resolveBidSuccess(pet, nav, pickFn);
        pet.satiety = Drives.clamp01((pet.satiety === undefined ? 0.5 : pet.satiety) + 0.45);
        pet.restDrive = Math.max(0, pet.restDrive - 0.12);
        pet.alertness = Drives.clamp01(pet.alertness + 0.12);
        Drives.happier(pet, 0.20);
        Drives.shiftTrust(pet, 0.045);
        pet.mood = Drives.clamp01(pet.mood + 0.28);
        Memory.recordPlaceAffect(pet, 0.55);
        Memory.recordEpisode(pet, "fed_snack", { valence: 0.8, salience: 0.78 });
        Memory.thinkAloud(pet, "fed", "Happily eating an Oran Berry", { minGapMs: 3000 });
        if (pet.emitEmote) pet.emitEmote("berry", true);
        Plans.clearPlan(pet);
        pet.enterState("eat");
        return true;
    }

    case "play_triggered": {
        _cancelRetire(pet);
        Plans.resolveBidSuccess(pet, nav, pickFn);
        Drives.stimulate(pet, 0.20);
        Drives.happier(pet, 0.10);
        Drives.shiftTrust(pet, 0.025);
        pet.mood = Drives.clamp01(pet.mood + 0.18);
        pet.playDrive = Math.max(0, pet.playDrive - 0.25);
        Memory.recordEpisode(pet, "played_solo", { valence: 0.6, salience: 0.6 });
        Memory.thinkAloud(pet, "play_user", "Playing energetically", { minGapMs: 4000 });
        if (pet.emitEmote) pet.emitEmote("note", true);
        Plans.startPlan(pet, Plans.buildUserPlayPlan(pet), nav, pickFn);
        return true;
    }

    case "dropped": {
        var speed = (data && data.speed) || 0;
        var acrobat = Personality.hasQuirk(pet, "sky_acrobat")
                   || Abilities.enjoysAcrobaticToss(pet)
                   || (p.boldness > 0.62 && p.playfulness > 0.58 && trust > 0.45);
        if (speed < 360) {
            if (speed < 220 && pet.petData && (pet.petData.roamMode || "auto") === "auto"
                    && (pet.restDrive || 0) >= 0.56 && typeof pet.beginRetireToPen === "function") {
                var curScr = Topology.currentScreen(pet);
                var allScr = pet.allScreens ? pet.allScreens() : [curScr];
                var pw = pet.width || 64;
                var nearLeftBezel = pet.worldX <= 26 && !Topology.adjacentScreenAt(allScr, curScr, "left", pet.worldY, pw);
                var nearRightBezel = pet.worldX >= (curScr.width - pw - 26)
                                  && !Topology.adjacentScreenAt(allScr, curScr, "right", pet.worldY, pw);
                if (nearLeftBezel || nearRightBezel) {
                    Memory.thinkAloud(pet, "tucked_to_pen", "Took the gentle nudge to the edge and headed in to rest", { minGapMs: 4000 });
                    pet.beginRetireToPen();
                    return true;
                }
            }
            Drives.shiftTrust(pet, 0.015);
            pet.exploreDrive = Drives.clamp01(pet.exploreDrive + 0.15);
            Memory.thinkAloud(pet, "gentle_drop", "Set down in a new spot", { minGapMs: 8000 });
            pet.enterState(pickFn(pet, SpeciesProfile.calmGesturesFor(pet)));
        } else if (acrobat) {
            Drives.happier(pet, 0.08);
            Drives.shiftTrust(pet, 0.02);
            pet.mood = Drives.clamp01(pet.mood + 0.14);
            pet.playDrive = Math.max(0, pet.playDrive - 0.18);
            pet.recentDrift = Personality.shiftRecent(pet.recentDrift, "boldness", 0.01);
            Memory.recordEpisode(pet, "tossed_fun", { valence: 0.65, salience: 0.72 });
            Memory.thinkAloud(pet, "toss_whee", "Landed an acrobatic toss", { minGapMs: 4000 });
            if (pet.emitEmote) pet.emitEmote("note", true);
            pet.enterState(pickFn(pet, ["hop", "rotate"]));
            if (pet.petManager && pet.petManager.notifyPetTossLanded) {
                pet.petManager.notifyPetTossLanded(pet, speed, true);
            }
        } else {
            pet.mood = Math.max(0, pet.mood - 0.08);
            Drives.shiftTrust(pet, -0.025);
            pet.alertness = Drives.clamp01(pet.alertness + 0.25);
            pet.recentDrift = Personality.shiftRecent(pet.recentDrift, "boldness", -0.008);
            Memory.recordEpisode(pet, "tossed_rough", { valence: -0.5, salience: 0.7 });
            Memory.thinkAloud(pet, "toss_oof", "Dizzy from a fast toss", { minGapMs: 4000 });
            if (pet.emitEmote) pet.emitEmote("exclaim", true);
            pet.enterState(pickFn(pet, ["hitGround", "trip", "tumbleBack", "cringe"]));
            if (pet.petManager && pet.petManager.notifyPetTossLanded) {
                pet.petManager.notifyPetTossLanded(pet, speed, false);
            }
        }
        return true;
    }

    case "perch_dropping": {
        Plans.abortPlan(pet, "perch_lost");
        return true;
    }

    case "perch_soft_landed": {
        if (data && data.landAddr && nav) {
            Plans.startPlan(pet, Plans.buildLowerLedgePerchPlan(data.landAddr), nav, pickFn);
        } else {
            pet.enterState(pickFn(pet, SpeciesProfile.calmGesturesFor(pet)));
        }
        return true;
    }

    case "user_idle": {
        var liveliness = p.energy * 0.5 + p.curiosity * 0.3 + p.playfulness * 0.2 - p.sleepiness * 0.25;
        if (liveliness < 0.42) {
            pet.restDrive = Drives.clamp01(pet.restDrive + 0.14);
            Memory.thinkAloud(pet, "user_away_nap", "Loafing quietly while the desktop is still");
            if (!resting && !Plans.hasActivePlan(pet) && Math.random() < 0.72) {
                pet.enterState("loaf");
            }
        } else {
            pet.exploreDrive = Drives.clamp01(pet.exploreDrive + 0.10 + p.curiosity * 0.08);
            Memory.thinkAloud(pet, "user_away_roam", "Exploring the quiet desktop");
        }
        return true;
    }

    case "user_active": {
        var idleSec = (data && data.idleDurationSec) || 0;
        if (idleSec >= 1800 && resting && typeof pet.scheduleStaggeredWake === "function") {
            if (cooldown(pet, "user_active", 90000)) return true;
            var wDelay = Math.round(450 + p.sleepiness * 10500 + Math.random() * 2200);
            pet.scheduleStaggeredWake(wDelay, (pet.bond || 0.3) > 0.58);
            return true;
        }
        if (cooldown(pet, "user_active", 90000)) return true;
        Drives.stimulate(pet, 0.08 + p.sociability * 0.08);
        pet.socialDrive = Drives.clamp01(pet.socialDrive + p.sociability * 0.12);
        if ((pet.bond || 0.3) > 0.65) {
            Memory.thinkAloud(pet, "user_back", "Perked up when you returned", { minGapMs: 90000 });
            if (pet.emitEmote) pet.emitEmote("heart");
        }
        if (loafing && !Plans.hasActivePlan(pet) && Math.random() < 0.30 + p.sociability * 0.35) {
            pet.enterState(SpeciesProfile.wakeStateFor(pet));
        }
        return true;
    }

    case "zoomie_stumble": {
        if (!nav) return true;
        var zPerc = Perception.perceive(pet);
        var nearPeer = (zPerc.nearest && zPerc.nearest.sameScreen && zPerc.nearest.dist < 420)
            ? zPerc.nearest.name : "";
        Plans.startPlan(pet, Plans.buildZoomieStumblePlan(pet, nearPeer), nav, pickFn);
        return true;
    }
    }

    return false;
}
