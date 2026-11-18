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
        if (cursorSpeed < 420) {
            if (trust >= 0.32 || p.boldness >= 0.35) {
                pet.mood = Drives.clamp01(pet.mood + 0.015);
                Memory.recordPlaceAffect(pet, 0.05);
            }
            if (!resting && pet.state_ === "idle" && pet.inputTracker) {
                Util.faceGlobal(pet, pet.inputTracker.cursorX, pet.inputTracker.cursorY);
            }
            return true;
        }

        var hab = ctx.habituationFactor ? ctx.habituationFactor(pet, "cursor_near", 900000) : 1.0;
        var speedThreat = Math.min(0.68, (cursorSpeed - 420) / 1400) * hab;
        var suddenRush = cursorSpeed > 1250 && trust < 0.50 && p.composure < 0.55;
        var valence = p.boldness * 0.42 + p.sociability * 0.26 + trust * 0.48
                    + (pet.mood - 0.5) * 0.16 - 0.10 - speedThreat - (suddenRush ? 0.22 : 0);

        if (valence >= 0) {
            pet.mood = Drives.clamp01(pet.mood + 0.02);
            Memory.recordPlaceAffect(pet, 0.06);
            if (!resting && pet.state_ === "idle" && pet.inputTracker) {
                Util.faceGlobal(pet, pet.inputTracker.cursorX, pet.inputTracker.cursorY);
            }
        } else {
            Drives.stimulate(pet, 0.22 * hab);
            Drives.shiftTrust(pet, -0.012 * hab);
            pet.mood = Math.max(0, pet.mood - 0.04 * hab);
            Memory.recordPlaceAffect(pet, -0.38);
            var clsNear = pet.windowTracker ? pet.windowTracker.activeWindowClass : "";
            if (clsNear) Memory.recordWindowPref(pet, clsNear, -0.04);
            Memory.recordEpisode(pet, "startled", { valence: -0.35, windowClass: clsNear });
            Memory.thinkAloud(pet, "startled", "Startled by fast cursor movement", { minGapMs: 25000 });
            if (pet.emitEmote) pet.emitEmote("exclaim");
            if (pet.state_ === "perch") {
                if (p.boldness < 0.28 && nav && nav.dropFromPerchIfNeeded) {
                    Plans.abortPlan(pet, "perch_lost");
                    nav.dropFromPerchIfNeeded(pet);
                }
            } else if (!resting) {
                Plans.abortPlan(pet, "interrupted");
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

        var curPlay = pet.playDrive === undefined ? 0.25 : pet.playDrive;
        var curRest = pet.restDrive === undefined ? 0.15 : pet.restDrive;
        var curSatW = pet.satiety === undefined ? 0.5 : pet.satiety;
        var chaseDrive = p.playfulness * 0.46 + p.curiosity * 0.30 + p.energy * 0.18
                       + curPlay * 0.36 - curRest * 0.42 - p.sleepiness * 0.18
                       - Math.max(0, 0.22 - curSatW) * 0.60 - (pet.sleepInertia || 0) * 0.35;
        if (chaseDrive > 0.50 && trust > 0.24 && nav && !cooldown(pet, "cursor_wiggled", 22000)) {
            Drives.stimulate(pet, 0.16);
            Plans.startPlan(pet, Plans.buildCursorChasePlan(wgx, wgy), nav, pickFn);
        } else if (p.boldness < 0.28 && trust < 0.35 && wDist < 180 && nav) {
            Plans.abortPlan(pet, "interrupted");
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

        var careSat = pet._careSatiation || 0;
        var satMult = Math.max(0.18, 1 - careSat * 0.78);
        if ("_careSatiation" in pet || !pet.petWindow) {
            pet._careSatiation = Math.min(1, careSat + 0.28);
        }

        if (careSat > 0.86 && Drives.effectivePatience(pet) < 0.34 && !resting) {
            Memory.thinkAloud(pet, "pat_enough", "Had plenty of headpats for now and turned aside politely", { minGapMs: 8000 });
            if (pet.emitEmote) pet.emitEmote("ellipses", true);
            if (pet.state_ !== "perch" && pet.state_ !== "sitNorth") {
                Plans.abortPlan(pet, "interrupted");
                pet.enterState(pickFn(pet, ["nod", "cringe"]));
            }
            return true;
        }

        if (pet.state_ === "deepsleep") {
            Drives.happier(pet, 0.06 * satMult);
            Drives.shiftTrust(pet, 0.025 * satMult);
            pet.mood = Drives.clamp01(pet.mood + 0.10 * satMult);
            Memory.recordEpisode(pet, "petted", { valence: 0.6 });
            Memory.thinkAloud(pet, "sleepy_pat", "Stirred softly under gentle pats");
            if (pet.emitEmote) pet.emitEmote("heart", true);
            Plans.clearPlan(pet);
            pet.enterState(SpeciesProfile.wakeStateFor(pet));
            return true;
        }

        pet.socialDrive = Math.max(0, pet.socialDrive - 0.36 * satMult);
        Drives.happier(pet, 0.14 * satMult);
        Drives.shiftTrust(pet, 0.032 * satMult);
        pet.mood = Drives.clamp01(pet.mood + 0.22 * satMult);
        pet.playDrive = Drives.clamp01(pet.playDrive + 0.06 * satMult);
        Drives.stimulate(pet, 0.08 * satMult);
        Memory.recordPlaceAffect(pet, 0.45 * satMult);
        var cls = pet.windowTracker ? pet.windowTracker.activeWindowClass : "";
        if (cls) Memory.recordWindowPref(pet, cls, 0.09 * satMult);
        Memory.recordEpisode(pet, type, { valence: 0.65, salience: 0.65, windowClass: cls });
        pet.recentDrift = Personality.shiftRecent(pet.recentDrift, "sociability", 0.01 * satMult);
        Memory.thinkAloud(pet, "petted", "Leaning into warm headpats", { minGapMs: 8000 });
        if (pet.emitEmote) pet.emitEmote("heart", true);
        if (pet.petManager && pet.petManager.recordUserAffection) {
            pet.petManager.recordUserAffection(pet);
        }
        if (!resting && pet.state_ !== "sitNorth" && pet.state_ !== "perch"
                && (!Plans.hasActivePlan(pet) || (pet.activePlan.urgency || 0.5) < 0.76)) {
            Plans.abortPlan(pet, "interrupted");
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
            Memory.recordPlaceAffect(pet, -0.35);
            var clsPoke = pet.windowTracker ? pet.windowTracker.activeWindowClass : "";
            if (clsPoke) Memory.recordWindowPref(pet, clsPoke, -0.05);
            Memory.recordEpisode(pet, "annoyed", { valence: -0.35, note: "over-poked", windowClass: clsPoke });
            Memory.thinkAloud(pet, "overpoked", "Annoyed by repeated poking", { minGapMs: 4000 });
            if (pet.emitEmote) pet.emitEmote("frustrated", true);
            if (pet.state_ === "perch") {
                if (nav && nav.dropFromPerchIfNeeded) {
                    Plans.abortPlan(pet, "perch_lost");
                    nav.dropFromPerchIfNeeded(pet);
                }
            } else {
                Plans.clearPlan(pet);
                if (!resting) pet.enterState(pickFn(pet, ["cringe", "pain", "attack"]));
                else pet.enterState(SpeciesProfile.wakeStateFor(pet));
            }
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
        if (pet.state_ !== "perch") Plans.abortPlan(pet, "interrupted");
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
        if ((pet.activePlan && pet.activePlan.name === "eat_berry" && now < pet.activePlan.until)
                || (pet._mealUntil && now < pet._mealUntil)) {
            return true;
        }
        var meal = Drives.appraiseMeal(pet);
        var fScr = Topology.currentScreen(pet);
        var fpw = pet.width || 64, fph = pet.height || 64;
        var curFX = Util.petGX(pet), curFY = Util.petGY(pet);

        if (!meal.canEat) {
            var refCount = (pet._stuffedRefusals || 0) + 1;
            if ("_stuffedRefusals" in pet || !pet.petWindow) {
                pet._stuffedRefusals = refCount;
            }
            var annoyedFull = refCount >= 2;
            var dropRefSpot = null;
            if (!annoyedFull && ("berryPresent" in pet)) {
                var rDir = pet.facingRight ? 1 : -1;
                var rBX = Topology.clamp(curFX + fpw * 0.5 + rDir * 34, fScr.x + 20, fScr.x + fScr.width - 20);
                var rBY = Topology.clamp(curFY + fph - 10, fScr.y + 32, fScr.y + fScr.height - (fScr.bottomInset || 0) - 12);
                pet.berryGX = rBX;
                pet.berryGY = rBY;
                pet.berryPresent = true;
                pet.berryUntil = now + 3800;
                dropRefSpot = { berryGX: rBX, berryGY: rBY };
            }
            if (annoyedFull) {
                pet.mood = Math.max(0, pet.mood - 0.05);
                Drives.happier(pet, -0.02);
                if (refCount >= 3) {
                    Drives.shiftTrust(pet, -0.018);
                    Memory.recordEpisode(pet, "annoyed", { valence: -0.25, note: "overfed" });
                }
                Memory.thinkAloud(pet, "overfed", "Much too stuffed and turned away uncomfortably from another berry", { minGapMs: 2500 });
            } else {
                Memory.thinkAloud(pet, "stuffed", "Already well-fed, sniffed the Oran Berry and turned away politely", { minGapMs: 2500 });
            }
            if (!resting && pet.state_ !== "perch" && nav) {
                Plans.startPlan(pet, Plans.buildRefuseBerryPlan(dropRefSpot, annoyedFull), nav, pickFn);
            } else {
                if (pet.emitEmote) pet.emitEmote(annoyedFull ? "frustrated" : "ellipses", true);
                if (!resting && pet.state_ !== "perch") {
                    Plans.abortPlan(pet, "interrupted");
                    pet.enterState(pickFn(pet, annoyedFull ? ["cringe"] : ["head", "nod"]));
                }
            }
            return true;
        }

        if ("_mealUntil" in pet || !pet.petWindow) {
            pet._mealUntil = now + 5500;
        }
        Drives.consumeMeal(pet, meal.appetite);
        Memory.recordPlaceAffect(pet, 0.42 * meal.appetite);
        Memory.recordEpisode(pet, "fed_snack", {
            valence: 0.45 + 0.35 * meal.appetite,
            salience: 0.55 + 0.25 * meal.appetite
        });
        Memory.thinkAloud(
            pet,
            "fed",
            meal.appetite > 0.55 ? "Trotted over happily for an Oran Berry" : "Had a polite nibble of an Oran Berry",
            { minGapMs: 3000 }
        );

        var berrySpot = null;
        if (!resting && nav) {
            var tossAng = (pet.facingRight ? 0 : Math.PI) + (Math.random() - 0.5) * 0.45;
            if (pet.inputTracker && pet.inputTracker.cursorKnown) {
                var cdx = pet.inputTracker.cursorX - curFX;
                var cdy = pet.inputTracker.cursorY - curFY;
                if (Math.hypot(cdx, cdy) > 24 && Math.hypot(cdx, cdy) < 460) {
                    tossAng = Math.atan2(cdy, cdx);
                }
            }
            var tossDist = 64 + Math.random() * 24;
            var rawGX = curFX + Math.cos(tossAng) * tossDist;
            var rawGY = pet.state_ === "perch"
                ? (curFY + 76 + Math.random() * 28)
                : (curFY + Math.sin(tossAng) * tossDist * 0.55);
            var clampedSpot = Util.clampToScreen(pet, rawGX, rawGY, 24, 24);
            var visBX = clampedSpot.gx + fpw * 0.5 + (Math.cos(tossAng) >= 0 ? 12 : -12);
            var visBY = clampedSpot.gy + fph - 10;
            berrySpot = { gx: clampedSpot.gx, gy: clampedSpot.gy, berryGX: visBX, berryGY: visBY };
            if ("berryPresent" in pet) {
                pet.berryGX = visBX;
                pet.berryGY = visBY;
                pet.berryPresent = true;
                pet.berryUntil = now + 16000;
            }
        } else if ("berryPresent" in pet) {
            pet.berryGX = curFX + fpw * 0.5 + (pet.facingRight ? 20 : -20);
            pet.berryGY = curFY + fph - 10;
            pet.berryPresent = true;
            pet.berryUntil = now + 12000;
        }

        if (nav) {
            Plans.startPlan(pet, Plans.buildEatBerryPlan(pet, berrySpot, meal.appetite), nav, pickFn);
        } else {
            if (pet.emitEmote) pet.emitEmote("berry", true);
            Plans.clearPlan(pet);
            pet.enterState("eat");
        }
        return true;
    }

    case "play_triggered": {
        _cancelRetire(pet);
        Plans.resolveBidSuccess(pet, nav, pickFn);
        if ((pet.restDrive || 0) > 0.82 && (pet.alertness === undefined ? 0.65 : pet.alertness) < 0.24) {
            Memory.thinkAloud(pet, "too_tired_play", "Too sleepy for a full sprint, gave a drowsy stretch instead", { minGapMs: 4000 });
            if (pet.emitEmote) pet.emitEmote("sleepy", true);
            if (!resting && pet.state_ !== "perch") {
                Plans.abortPlan(pet, "interrupted");
                pet.enterState(pickFn(pet, ["deepBreath", "nod"]));
            }
            return true;
        }
        Drives.stimulate(pet, 0.24);
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
            Drives.stimulate(pet, 0.25);
            pet.recentDrift = Personality.shiftRecent(pet.recentDrift, "boldness", -0.008);
            Memory.recordPlaceAffect(pet, -0.44);
            var clsRough = pet.windowTracker ? pet.windowTracker.activeWindowClass : "";
            if (clsRough) Memory.recordWindowPref(pet, clsRough, -0.06);
            Memory.recordEpisode(pet, "tossed_rough", { valence: -0.5, salience: 0.7, windowClass: clsRough });
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
        if (cooldown(pet, "user_idle", 90000)) return true;
        var liveliness = p.energy * 0.5 + p.curiosity * 0.3 + p.playfulness * 0.2 - p.sleepiness * 0.25;
        if ("arousal" in pet || !pet.petWindow) {
            pet.arousal = Math.max(0.10, (pet.arousal === undefined ? 0.30 : pet.arousal) - 0.12);
        }
        if (liveliness < 0.42) {
            pet.restDrive = Drives.clamp01(pet.restDrive + 0.10);
            if (!resting && !Plans.hasActivePlan(pet)) {
                Memory.thinkAloud(pet, "user_away_nap", "Settling down as the desktop grows quiet", { minGapMs: 90000 });
            }
        } else {
            pet.exploreDrive = Drives.clamp01(pet.exploreDrive + 0.10 + p.curiosity * 0.08);
            if (!resting && !Plans.hasActivePlan(pet)) {
                Memory.thinkAloud(pet, "user_away_roam", "Exploring the quiet desktop", { minGapMs: 90000 });
            }
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
