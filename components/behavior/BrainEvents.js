.pragma library

.import "../SpeciesProfile.js" as SpeciesProfile
.import "Personality.js" as Personality
.import "Drives.js" as Drives
.import "Memory.js" as Memory
.import "Perception.js" as Perception
.import "Social.js" as Social
.import "Abilities.js" as Abilities
.import "Plans.js" as Plans
.import "Gestures.js" as Gestures
.import "Util.js" as Util

function _cooldown(pet, key, ms) {
    if (!pet._eventCooldowns) pet._eventCooldowns = ({});
    var now = Util.now(pet);
    if (now - (pet._eventCooldowns[key] || 0) < ms) return true;
    pet._eventCooldowns[key] = now;
    return false;
}

function _findNearbyGuardian(pet, maxDist) {
    if (!pet.petManager || !pet.petManager.pets) return null;
    var all = pet.petManager.pets;
    var myGX = Util.petGX(pet);
    var myGY = Util.petGY(pet);
    var best = null;
    var bestDist = maxDist || 380;
    for (var i = 0; i < all.length; i++) {
        var g = all[i];
        if (!g || g === pet || g.state_ === "drag" || Util.isRestingState(g.state_)) continue;
        if (typeof g.screenX === "function" && typeof pet.screenX === "function"
                && (g.screenX() !== pet.screenX() || g.screenY() !== pet.screenY())) continue;
        var isGuard = SpeciesProfile.socialStyleOf(g) === "guardian"
                   || (g.personality && g.personality.boldness >= 0.58);
        if (!isGuard) continue;
        var d = Math.hypot(Util.petGX(g) - myGX, Util.petGY(g) - myGY);
        if (d < bestDist) {
            bestDist = d;
            best = g;
        }
    }
    return best;
}

function _cancelRetire(pet) {
    if (pet && typeof pet.cancelRetireIfInterrupted === "function") {
        pet.cancelRetireIfInterrupted();
    }
}

function handleEvent(pet, type, data, nav, pickFn) {
    var p = pet.personality;
    var now = Util.now(pet);
    var loafing = pet.state_ === "loaf" || pet.state_ === "sit";
    var resting = loafing || pet.state_ === "deepsleep";
    var trust = pet.trust === undefined ? 0.35 : pet.trust;
    if (pet.state_ === "drag" && type !== "dropped") return;

    switch (type) {
    case "cursor_near": {
        if (_cooldown(pet, "cursor_near", 45000)) return;
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
                } else {
                    pet.enterState(pickFn(pet, Gestures.HIDE_STATES));
                }
            } else if (loafing) {
                Plans.clearPlan(pet);
                pet.enterState(SpeciesProfile.wakeStateFor(pet));
            }
        }
        break;
    }

    case "cursor_wiggled": {
        if (resting || (pet.state_ !== "idle" && pet.state_ !== "wander")) return;
        var wgx = data ? data.gx : (pet.inputTracker ? pet.inputTracker.cursorX : 0);
        var wgy = data ? data.gy : (pet.inputTracker ? pet.inputTracker.cursorY : 0);
        var wPerc = Perception.perceive(pet);
        if (wPerc.fullscreen || !wPerc.cursor.reachable) return;
        var wDist = Math.hypot(wgx - wPerc.petGX, wgy - wPerc.petGY);
        if (wDist < 45 || wDist > 450) return;

        var chaseDrive = p.playfulness * 0.55 + p.curiosity * 0.35 + p.energy * 0.20 - p.sleepiness * 0.20;
        if (chaseDrive > 0.52 && trust > 0.24 && nav && !_cooldown(pet, "cursor_wiggled", 22000)) {
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
        break;
    }

    case "petted":
    case "stroked": {
        _cancelRetire(pet);
        if (Plans.resolveBidSuccess(pet, nav, pickFn)) break;

        if (pet.state_ === "deepsleep") {
            Drives.happier(pet, 0.06);
            Drives.shiftTrust(pet, 0.025);
            pet.mood = Drives.clamp01(pet.mood + 0.1);
            Memory.recordEpisode(pet, "petted", { valence: 0.6 });
            Memory.thinkAloud(pet, "sleepy_pat", "Stirred softly under gentle pats");
            if (pet.emitEmote) pet.emitEmote("heart", true);
            Plans.clearPlan(pet);
            pet.enterState(SpeciesProfile.wakeStateFor(pet));
            break;
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
        if (!resting && pet.state_ !== "sitNorth" && pet.state_ !== "perch") {
            Plans.clearPlan(pet);
            var aff = SpeciesProfile.affectionGesturesFor(pet);
            if (p.playfulness > 0.68) aff = aff.concat(["hop"]);
            pet.enterState(pickFn(pet, aff));
        }
        break;
    }

    case "clicked": {
        _cancelRetire(pet);
        if (Plans.resolveBidSuccess(pet, nav, pickFn)) break;

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
            break;
        }

        if (resting) {
            Memory.thinkAloud(pet, "woken_poke", "Stretched awake when nudged");
            if (pet.emitEmote) pet.emitEmote("question", true);
            Plans.clearPlan(pet);
            pet.enterState(SpeciesProfile.wakeStateFor(pet));
            break;
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
        break;
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
        pet.lastDiscovery = "a berry snack";
        pet.lastDiscoveryTime = now;
        Memory.thinkAloud(pet, "fed", "Happily eating a berry snack", { minGapMs: 3000 });
        if (pet.emitEmote) pet.emitEmote("berry", true);
        Plans.clearPlan(pet);
        pet.enterState("eat");
        break;
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
        break;
    }

    case "dropped": {
        var speed = (data && data.speed) || 0;
        var acrobat = Personality.hasQuirk(pet, "sky_acrobat")
                   || Abilities.enjoysAcrobaticToss(pet)
                   || (p.boldness > 0.62 && p.playfulness > 0.58 && trust > 0.45);
        if (speed < 360) {
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
        } else {
            pet.mood = Math.max(0, pet.mood - 0.08);
            Drives.shiftTrust(pet, -0.025);
            pet.alertness = Drives.clamp01(pet.alertness + 0.25);
            pet.recentDrift = Personality.shiftRecent(pet.recentDrift, "boldness", -0.008);
            Memory.recordEpisode(pet, "tossed_rough", { valence: -0.5, salience: 0.7 });
            Memory.thinkAloud(pet, "toss_oof", "Dizzy from a fast toss", { minGapMs: 4000 });
            if (pet.emitEmote) pet.emitEmote("exclaim", true);
            pet.enterState(pickFn(pet, ["hitGround", "trip", "tumbleBack", "cringe"]));
        }
        break;
    }

    case "perch_lost": {
        Plans.abortPlan(pet, "perch_lost");
        pet.enterState(pickFn(pet, ["lostBalance", "hop", "trip"]));
        break;
    }

    case "perch_dropping": {
        Plans.abortPlan(pet, "perch_lost");
        break;
    }

    case "perch_soft_landed": {
        if (data && data.landAddr && nav) {
            Plans.startPlan(pet, Plans.buildLowerLedgePerchPlan(data.landAddr), nav, pickFn);
        } else {
            pet.enterState(pickFn(pet, SpeciesProfile.calmGesturesFor(pet)));
        }
        break;
    }

    case "music_started": {
        if (pet.enableMusicReact === false || resting) break;
        if (_cooldown(pet, "music_started", 90000)) return;
        var melo = Personality.hasQuirk(pet, "melomaniac");
        if (melo || (p.playfulness > 0.58 && Math.random() < 0.45)) {
            if (pet.emitEmote) pet.emitEmote("note");
            Memory.thinkAloud(pet, "music_start", "Ears perked up at music", { minGapMs: 60000 });
            if (pet.state_ === "idle" && !Plans.hasActivePlan(pet)) {
                pet.enterState(pickFn(pet, SpeciesProfile.affectionGesturesFor(pet)));
            }
        }
        break;
    }

    case "window_opened": {
        if (_cooldown(pet, "window_opened", 60000)) return;
        Drives.stimulate(pet, 0.03 + p.curiosity * 0.05);
        var oPerc = Perception.perceive(pet);
        if (!resting && pet.state_ === "idle" && !Plans.hasActivePlan(pet) && oPerc.win && !oPerc.fullscreen) {
            if (nav && p.curiosity > 0.52 && pet.alertness > 0.36 && Math.random() < 0.28 + p.curiosity * 0.35) {
                Plans.startPlan(pet, Plans.buildInspectWindowPlan(oPerc, pet), nav, pickFn);
                break;
            }
            pet.attentionGX = oPerc.win.gx;
            pet.attentionGY = oPerc.win.gy;
            pet.attentionUntil = now + 7000;
            Util.faceGlobal(pet, oPerc.win.gx, oPerc.win.gy);
        }
        break;
    }

    case "window_focused":
        Drives.stimulate(pet, p.curiosity * 0.02);
        if (!resting && pet.state_ === "idle" && pet.windowTracker && pet.windowTracker.activeWindowPos && Math.random() < p.curiosity * 0.4) {
            var fwp = pet.windowTracker.activeWindowPos;
            pet.attentionGX = fwp.x + fwp.w * 0.5;
            pet.attentionGY = fwp.y + fwp.h * 0.5;
            pet.attentionUntil = now + 5500;
        }
        break;

    case "window_closed": {
        if (resting || !data || _cooldown(pet, "window_closed", 75000)) return;
        var cPerc = Perception.perceive(pet);
        var cDist = Math.hypot((data.gx || 0) - cPerc.petGX, (data.gy || 0) - cPerc.petGY);
        if (cDist >= 320) break;
        Drives.stimulate(pet, 0.06);
        if (p.boldness < 0.36) {
            var guardC = _findNearbyGuardian(pet, 380);
            if (guardC && nav) {
                Plans.startPlan(pet, Plans.buildTimidHideBehindPlan(pet, guardC, data.gx || 0, data.gy || 0), nav, pickFn);
            } else if (nav) {
                Plans.clearPlan(pet);
                pet.gait = "scamper";
                nav.fleeFrom(pet, data.gx || 0, data.gy || 0, 140);
            } else {
                Plans.clearPlan(pet);
                pet.enterState(pickFn(pet, Gestures.HIDE_STATES));
            }
        } else if ((SpeciesProfile.socialStyleOf(pet) === "guardian" || p.boldness >= 0.64)
                && pet.state_ === "idle" && !Plans.hasActivePlan(pet) && nav) {
            Plans.startPlan(pet, Plans.buildGuardianCheckPlan(pet, data.gx || 0, data.gy || 0, data.windowClass || "closed window"), nav, pickFn);
        }
        break;
    }

    case "window_urgent": {
        if (resting || _cooldown(pet, "window_urgent", 90000)) return;
        if ((pet.bond || 0.3) > 0.28 && data) {
            Drives.stimulate(pet, 0.08);
            var ugx = data.gx || 0, ugy = data.gy || 0;
            var uDist = Math.hypot(ugx - Util.petGX(pet), ugy - Util.petGY(pet));
            if (p.boldness < 0.36 && uDist < 480 && nav) {
                var guardU = _findNearbyGuardian(pet, 380);
                if (guardU) {
                    Plans.startPlan(pet, Plans.buildTimidHideBehindPlan(pet, guardU, ugx, ugy), nav, pickFn);
                    break;
                }
            } else if ((SpeciesProfile.socialStyleOf(pet) === "guardian" || p.boldness >= 0.66)
                    && pet.state_ === "idle" && !Plans.hasActivePlan(pet) && uDist < 520 && nav) {
                Plans.startPlan(pet, Plans.buildGuardianCheckPlan(pet, ugx, ugy, data.windowClass || "window alert"), nav, pickFn);
                break;
            }
            pet.attentionGX = ugx;
            pet.attentionGY = ugy;
            pet.attentionUntil = now + 9000;
            Util.faceGlobal(pet, pet.attentionGX, pet.attentionGY);
            if (pet.emitEmote) pet.emitEmote("exclaim");
            Memory.thinkAloud(pet, "urgent_win", "Perked up at an alert in " + (data.windowClass || "a window"), { minGapMs: 60000 });
        }
        break;
    }

    case "workspace_changed":
        if (pet.state_ === "perch" || pet.state_ === "sitNorth") {
            Plans.abortPlan(pet, "perch_lost");
            pet.enterState("idle");
            break;
        }
        Drives.stimulate(pet, 0.03 + p.boldness * 0.04);
        break;

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
        break;
    }

    case "user_active": {
        var idleSec = (data && data.idleDurationSec) || 0;
        if (idleSec >= 1800 && resting && typeof pet.scheduleStaggeredWake === "function") {
            if (_cooldown(pet, "user_active", 90000)) return;
            var wDelay = Math.round(450 + p.sleepiness * 10500 + Math.random() * 2200);
            pet.scheduleStaggeredWake(wDelay, (pet.bond || 0.3) > 0.58);
            break;
        }
        if (_cooldown(pet, "user_active", 90000)) return;
        Drives.stimulate(pet, 0.08 + p.sociability * 0.08);
        pet.socialDrive = Drives.clamp01(pet.socialDrive + p.sociability * 0.12);
        if ((pet.bond || 0.3) > 0.65) {
            Memory.thinkAloud(pet, "user_back", "Perked up when user returned", { minGapMs: 90000 });
            if (pet.emitEmote) pet.emitEmote("heart");
        }
        if (loafing && !Plans.hasActivePlan(pet) && Math.random() < 0.30 + p.sociability * 0.35) {
            pet.enterState(SpeciesProfile.wakeStateFor(pet));
        }
        break;
    }

    case "build_completed": {
        if (resting || pet.state_ !== "idle" || Plans.hasActivePlan(pet) || _cooldown(pet, "build_completed", 180000)) return;
        var sensesBuild = Abilities.has(pet, "aura_sense")
                       || Personality.hasQuirk(pet, "terminal_supervisor")
                       || ((pet.bond || 0.3) > 0.52 && p.composure > 0.50);
        if (!sensesBuild) break;
        if (pet.windowTracker && pet.windowTracker.activeWindowPos) {
            var bwp = pet.windowTracker.activeWindowPos;
            Util.faceGlobal(pet, bwp.x + bwp.w * 0.5, bwp.y + bwp.h * 0.5);
        }
        Memory.thinkAloud(pet, "build_done", "Noticed the heavy workload finish and gave a quiet nod", { minGapMs: 120000 });
        pet.enterState(pickFn(pet, ["nod", "pose"]));
        break;
    }

    case "mic_changed": {
        if (data && data.active && pet.activePlan) {
            var noisyPlans = ["zoomies", "bid_attention", "squabble", "sneak_boop", "illusion_prank"];
            if (noisyPlans.indexOf(pet.activePlan.name) !== -1) {
                Plans.clearPlan(pet);
                pet.enterState("idle");
            }
        }
        break;
    }

    case "caught_yawn": {
        if ((pet.state_ !== "idle" && pet.state_ !== "wander") || Plans.hasActivePlan(pet) || _cooldown(pet, "caught_yawn", 240000)) return;
        pet.restDrive = Drives.clamp01(pet.restDrive + 0.14);
        var yPerc = Perception.perceive(pet);
        var warmPeerName = (data && data.warmPeerName) || "";
        var warmPeer = warmPeerName ? Util.findPet(pet, warmPeerName) : null;
        var coolState = yPerc.isNight || yPerc.isDusk || yPerc.isRaining || yPerc.isSnowing;
        if (warmPeer && coolState && nav) {
            var wPeerGX = Util.petGX(warmPeer), wPeerGY = Util.petGY(warmPeer);
            var wpDist = Math.hypot(wPeerGX - yPerc.petGX, wPeerGY - yPerc.petGY);
            if (wpDist > 72 && wpDist < 340) {
                var wAng = Math.atan2(yPerc.petGY - wPeerGY, yPerc.petGX - wPeerGX);
                Plans.startPlan(pet, Plans.buildRestWithPlan(
                    pet,
                    warmPeerName,
                    Math.round(Math.cos(wAng) * 68),
                    Math.round(Math.sin(wAng) * 52),
                    true
                ), nav, pickFn);
                break;
            }
        }
        if (nav) {
            Memory.thinkAloud(pet, "caught_yawn", "Caught a sleepy yawn and curled down", { minGapMs: 120000 });
            Plans.startPlan(pet, Plans.buildRestPlan(pet, yPerc, false, null, false), nav, pickFn);
        }
        break;
    }

    case "zoomie_stumble": {
        if (!nav) break;
        var zPerc = Perception.perceive(pet);
        var nearPeer = (zPerc.nearest && zPerc.nearest.sameScreen && zPerc.nearest.dist < 420)
            ? zPerc.nearest.name : "";
        Plans.startPlan(pet, Plans.buildZoomieStumblePlan(pet, nearPeer), nav, pickFn);
        break;
    }

    case "pet_greet": {
        var fromG = data.fromPet;
        Memory.adjustRelation(pet, fromG.petData.name, 0.010, 0.06);
        Memory.recordEpisode(pet, "greeted", { valence: 0.25, withPet: fromG.petData.name });
        pet.mood = Drives.clamp01(pet.mood + 0.04);
        pet.socialDrive = Math.max(0, pet.socialDrive - 0.12);
        if (!resting && pet.state_ === "idle" && !Plans.hasActivePlan(pet)) {
            Util.faceGlobal(pet, Util.petGX(fromG), Util.petGY(fromG));
            pet.enterState(pickFn(pet, SpeciesProfile.greetGesturesFor(pet)));
        }
        break;
    }

    case "pet_story": {
        var fromSt = data.fromPet;
        Memory.adjustRelation(pet, fromSt.petData.name, 0.014, 0.06);
        pet.mood = Drives.clamp01(pet.mood + 0.05);
        pet.exploreDrive = Drives.clamp01(pet.exploreDrive + 0.10 * p.curiosity);
        Memory.thinkAloud(pet, "heard_story", "Sniffed curiously with " + fromSt.petData.name);
        if (!resting && pet.state_ === "idle" && !Plans.hasActivePlan(pet)) {
            Util.faceGlobal(pet, Util.petGX(fromSt), Util.petGY(fromSt));
            pet.enterState(pickFn(pet, SpeciesProfile.greetGesturesFor(pet)));
        }
        break;
    }

    case "pet_groove": {
        var fromM = data.fromPet;
        var relM = Memory.relationWith(pet, fromM.petData.name, fromM.personality);
        if (!resting && relM.affinity > 0.38 && (p.playfulness > 0.35 || Personality.hasQuirk(pet, "melomaniac"))) {
            Memory.adjustRelation(pet, fromM.petData.name, 0.014, 0.05, "play");
            Memory.recordEpisode(pet, "music_groove", { valence: 0.45, music: true, withPet: fromM.petData.name });
            Plans.startPlan(pet, Plans.buildSharedGroovePlan(pet, fromM.petData.name), nav, pickFn);
        }
        break;
    }

    case "pet_play_bid": {
        var fromPb = data.fromPet;
        var isRetry = !!(data && data.retry);
        var relPb = Memory.relationWith(pet, fromPb.petData.name, fromPb.personality, fromPb.petData.sprite);
        var myStylePb = SpeciesProfile.socialStyleOf(pet);
        var willingness = relPb.affinity * 0.52
                        + p.playfulness * 0.30
                        + p.sociability * 0.16
                        + pet.playDrive * 0.20
                        + (pet.mood - 0.5) * 0.16
                        - (pet.state_ === "deepsleep" ? 0.65 : loafing ? 0.26 : 0)
                        - p.sleepiness * 0.14
                        - (myStylePb === "parallel" && p.playfulness < 0.45 ? 0.12 : 0)
                        + (isRetry && p.patience > 0.58 && relPb.affinity > 0.36 ? 0.18 : 0)
                        - (isRetry && p.patience < 0.44 ? 0.22 : 0);

        var shouldRebuff = pet.state_ !== "deepsleep"
                        && (relPb.affinity < 0.28
                            || (relPb.affinity < 0.38 && p.patience < 0.30)
                            || (isRetry && p.patience < 0.42)
                            || (loafing && p.patience < 0.34));

        if (willingness >= 0.50 && !shouldRebuff && pet.state_ !== "deepsleep" && nav) {
            var mode = Social.preferredPlayMode(fromPb, pet);
            if (fromPb.activePlan) {
                fromPb.activePlan.bidOutcome = "accepted";
                fromPb.activePlan.bidPlayMode = mode;
            }
            Social.markPeerBout(pet, mode);
            Memory.adjustRelation(pet, fromPb.petData.name, isRetry ? 0.024 : 0.016, 0.06, mode === "spar" ? "spar" : "play", { outcome: mode });
            Memory.recordEpisode(pet, mode === "spar" ? "sparred" : "played_with", { valence: 0.46, withPet: fromPb.petData.name });
            pet.playDrive = Math.max(0, pet.playDrive - 0.18);
            pet.mood = Drives.clamp01(pet.mood + 0.06);
            if (mode === "spar") {
                Plans.startPlan(pet, Plans.buildSparPartnerPlan(pet, fromPb), nav, pickFn);
            } else if (mode === "duet") {
                Plans.startPlan(pet, Plans.buildSyncDancePlan(pet, fromPb.petData.name), nav, pickFn);
            } else {
                Plans.clearPlan(pet);
                Util.faceGlobal(pet, Util.petGX(fromPb), Util.petGY(fromPb));
                pet.enterState(pickFn(pet, ["hop", "nod"]));
            }
        } else if (shouldRebuff) {
            if (fromPb.activePlan) fromPb.activePlan.bidOutcome = "rebuffed";
            Social.rebuff(pet, fromPb);
            Plans.clearPlan(pet);
            if (loafing) {
                pet.enterState(SpeciesProfile.wakeStateFor(pet));
            } else {
                Util.faceGlobal(pet, Util.petGX(fromPb), Util.petGY(fromPb));
                pet.enterState(pickFn(pet, SpeciesProfile.standoffMovesFor(pet)));
            }
        } else {
            if (fromPb.activePlan) fromPb.activePlan.bidOutcome = "ignored";
            Memory.adjustRelation(pet, fromPb.petData.name, -0.004, 0.02, null, { outcome: "ignored" });
            Memory.thinkAloud(pet, "cold_shoulder", "Gave " + fromPb.petData.name + "'s play invitation the cold shoulder");
            if (!resting && nav) {
                Plans.startPlan(pet, Plans.buildColdShoulderPlan(fromPb.petData.name, "Aloof Turn"), nav, pickFn);
            }
        }
        break;
    }

    case "pet_spar_challenge": {
        var fromCh = data.fromPet;
        var relCh = Memory.relationWith(pet, fromCh.petData.name, fromCh.personality, fromCh.petData.sprite);
        var myStyleCh = SpeciesProfile.socialStyleOf(pet);
        var sparAcceptScore = relCh.affinity * 0.36 + relCh.respect * 0.22
                            + p.boldness * 0.30 + p.playfulness * 0.26
                            + (myStyleCh === "brawler" ? 0.18 : 0)
                            - (resting ? 0.45 : 0);
        if (sparAcceptScore >= 0.52 && !resting && nav) {
            if (fromCh.activePlan) fromCh.activePlan.sparAccepted = true;
            Social.markPeerBout(pet, "spar");
            Plans.startPlan(pet, Plans.buildSparPartnerPlan(pet, fromCh), nav, pickFn);
        } else if (p.boldness < 0.34 && !resting && nav) {
            if (fromCh.activePlan) fromCh.activePlan.sparAccepted = false;
            Memory.adjustRelation(pet, fromCh.petData.name, -0.015, 0.03, "friction", { outcome: "ignored" });
            Memory.thinkAloud(pet, "shy_spar", "Backed away shyly from " + fromCh.petData.name + "'s sparring stance");
            Plans.clearPlan(pet);
            pet.gait = "scamper";
            nav.fleeFrom(pet, Util.petGX(fromCh), Util.petGY(fromCh), 175);
        } else {
            if (fromCh.activePlan) fromCh.activePlan.sparAccepted = false;
            if (relCh.affinity < 0.34 || p.patience < 0.35) {
                Social.rebuff(pet, fromCh);
            }
            if (!resting && nav) {
                Plans.startPlan(pet, Plans.buildColdShoulderPlan(fromCh.petData.name, "Declining Spar"), nav, pickFn);
            }
        }
        break;
    }

    case "pet_spar_hit": {
        var fromSh = data.fromPet;
        Memory.adjustRelation(pet, fromSh.petData.name, 0.016, 0.06, "spar", { respectDelta: 0.04, outcome: "spar" });
        Memory.recordEpisode(pet, "sparred", { valence: 0.48, salience: 0.65, withPet: fromSh.petData.name });
        pet.playDrive = Math.max(0, pet.playDrive - 0.20);
        pet.mood = Drives.clamp01(pet.mood + 0.06);
        Drives.happier(pet, 0.025);
        break;
    }

    case "pet_invite":
    case "pet_chase": {
        var fromI = data.fromPet;
        var rel = Memory.relationWith(pet, fromI.petData.name, fromI.personality, fromI.petData.sprite);
        Drives.eventful(pet, 0.3);
        if (rel.affinity > 0.34 && pet.alertness > 0.24 && !resting && pet.playDrive > 0.12) {
            Social.markPeerBout(pet, "chase");
            Memory.adjustRelation(pet, fromI.petData.name, 0.014, 0.05, "play", { outcome: "tag" });
            Memory.recordEpisode(pet, type === "pet_chase" ? "chase_bout" : "played_with", {
                valence: 0.45,
                withPet: fromI.petData.name
            });
            pet.playDrive = Math.max(0, pet.playDrive - 0.14);
            pet.mood = Drives.clamp01(pet.mood + 0.06);
            if (type === "pet_chase" && nav) {
                Plans.startPlan(pet, Plans.buildFleeTagPlan(pet, fromI, true), nav, pickFn);
            } else {
                Plans.clearPlan(pet);
                Util.faceGlobal(pet, Util.petGX(fromI), Util.petGY(fromI));
                pet.enterState(pickFn(pet, SpeciesProfile.greetGesturesFor(pet).concat(["hop"])));
            }
        } else {
            if (fromI.activePlan) fromI.activePlan.chaseRejected = true;
            if (rel.affinity < 0.32 || p.patience < 0.28) {
                Social.rebuff(pet, fromI);
            } else {
                Memory.adjustRelation(pet, fromI.petData.name, -0.008, 0.02, "friction");
                if (!resting && nav) {
                    Plans.startPlan(pet, Plans.buildColdShoulderPlan(fromI.petData.name, "Ignoring Tag"), nav, pickFn);
                }
            }
        }
        break;
    }

    case "pet_reverse_chase": {
        var fromRev = data.fromPet;
        if (!resting && nav) {
            Memory.adjustRelation(pet, fromRev.petData.name, 0.014, 0.04, "play", { outcome: "tag" });
            Plans.startPlan(pet, Plans.buildReverseFleePlan(pet, fromRev), nav, pickFn);
        }
        break;
    }

    case "pet_show_off": {
        var fromShow = data.fromPet;
        if (resting) break;
        var relShow = Memory.relationWith(pet, fromShow.petData.name, fromShow.personality, fromShow.petData.sprite);
        if (relShow.affinity >= 0.50 && p.playfulness > 0.44 && pet.playDrive > 0.18 && nav) {
            Social.markPeerBout(pet, "duet");
            Memory.adjustRelation(pet, fromShow.petData.name, 0.016, 0.05, "play", { outcome: "duet" });
            Plans.startPlan(pet, Plans.buildSyncDancePlan(pet, fromShow.petData.name), nav, pickFn);
        } else if (relShow.affinity < 0.36 && nav) {
            Memory.adjustRelation(pet, fromShow.petData.name, -0.006, 0.02, null, {
                respectDelta: fromShow.personality.boldness > 0.6 ? 0.01 : -0.01
            });
            Memory.thinkAloud(pet, "unimpressed", "Looked away unimpressed by " + fromShow.petData.name);
            Plans.startPlan(pet, Plans.buildColdShoulderPlan(fromShow.petData.name, "Unimpressed"), nav, pickFn);
        } else if (p.boldness < 0.26 && pet.state_ === "idle" && !Plans.hasActivePlan(pet)) {
            pet.enterState(pickFn(pet, ["hop", "cringe"]));
        } else if (pet.state_ === "idle" && !Plans.hasActivePlan(pet)) {
            Memory.adjustRelation(pet, fromShow.petData.name, 0.008, 0.03);
            Util.faceGlobal(pet, Util.petGX(fromShow), Util.petGY(fromShow));
            pet.enterState(pickFn(pet, SpeciesProfile.greetGesturesFor(pet)));
        }
        break;
    }

    case "pet_squabble": {
        var fromSq = data.fromPet;
        Social.markPeerBout(pet, "squabble");
        Memory.adjustRelation(pet, fromSq.petData.name, -0.026, 0.04, "friction", {
            respectDelta: p.boldness > 0.52 ? 0.015 : -0.01,
            outcome: "squabble"
        });
        Memory.recordEpisode(pet, "squabbled", { valence: -0.36, salience: 0.58, withPet: fromSq.petData.name });
        pet.mood = Math.max(0, pet.mood - 0.05);
        if (p.boldness >= 0.48 && p.patience < 0.62 && !resting && nav) {
            if (pet.emitEmote) pet.emitEmote("frustrated");
            Plans.startPlan(pet, Plans.buildSquabbleReplyPlan(pet, fromSq), nav, pickFn);
        } else if (nav) {
            Plans.clearPlan(pet);
            if (resting) pet.enterState(SpeciesProfile.wakeStateFor(pet));
            else nav.fleeFrom(pet, Util.petGX(fromSq), Util.petGY(fromSq), 185);
        }
        break;
    }

    case "pet_mediated": {
        var peacekeeper = data.fromPet;
        var otherSq = data.otherSquabbler;
        Memory.adjustRelation(pet, peacekeeper.petData.name, 0.012, 0.04, null, { respectDelta: 0.06, outcome: "greet" });
        if (otherSq) Memory.adjustRelation(pet, otherSq.petData.name, 0.008, 0.01);
        Memory.thinkAloud(pet, "calmed_by", "Cooled down when " + peacekeeper.petData.name + " stepped in");
        if (nav) {
            var sepTarget = otherSq ? otherSq.petData.name : peacekeeper.petData.name;
            Plans.startPlan(pet, Plans.buildCooledOffPlan(sepTarget), nav, pickFn);
        }
        break;
    }

    case "pet_group_squabble": {
        if (resting || Plans.hasActivePlan(pet) || !nav) break;
        if ((Abilities.isNaturalPeacekeeper(pet) || (p.composure >= 0.60 && p.boldness >= 0.50)) && data.secondPet) {
            Social.markPeerBout(pet, "mediate");
            Plans.startPlan(pet, Plans.buildPeacekeeperPlan(pet, data.fromPet, data.secondPet), nav, pickFn);
        } else if (p.boldness < 0.32) {
            Plans.clearPlan(pet);
            nav.fleeFrom(pet, Util.petGX(data.fromPet), Util.petGY(data.fromPet), 165);
        }
        break;
    }

    case "pet_group_chase":
    case "pet_group_duet": {
        if (resting || Plans.hasActivePlan(pet) || !nav) break;
        if (p.playfulness >= 0.56 && pet.playDrive >= 0.28 && pet.alertness >= 0.38
                && !_cooldown(pet, "pack_rally", 240000)) {
            Social.markPeerBout(pet, "chase");
            Plans.startPlan(pet, Plans.buildPackRallyPlan(pet, data.fromPet), nav, pickFn);
        }
        break;
    }

    case "pet_group_spar": {
        if (resting || Plans.hasActivePlan(pet) || !nav) break;
        if ((p.curiosity >= 0.45 || p.patience >= 0.50) && !_cooldown(pet, "spectate", 180000)) {
            Plans.startPlan(pet, Plans.buildSpectatePlan(pet, data.fromPet), nav, pickFn);
        }
        break;
    }

    case "pet_cuddle": {
        var fromC = data.fromPet;
        var relC = Memory.relationWith(pet, fromC.petData.name, fromC.personality);
        Memory.adjustRelation(pet, fromC.petData.name, relC.affinity < 0.4 ? 0.025 : 0.016, 0.05, "nap");
        Memory.recordEpisode(pet, "rested_with", { valence: 0.4, withPet: fromC.petData.name });
        pet.mood = Drives.clamp01(pet.mood + 0.04);
        if (pet.emitEmote) pet.emitEmote("heart");
        break;
    }

    case "pet_pounce": {
        var fromB = data.fromPet;
        var relB = Memory.relationWith(pet, fromB.petData.name, fromB.personality);
        Drives.eventful(pet, 0.3);
        var fgx = Util.petGX(fromB), fgy = Util.petGY(fromB);
        var takesItWell = relB.affinity * 0.5 + p.playfulness * 0.35 + p.patience * 0.22 + p.composure * 0.15
                        + pet.mood * 0.15 - (pet.state_ === "deepsleep" ? 0.52 : resting ? 0.32 : 0);
        if (takesItWell > 0.58) {
            Social.sparBack(pet, fromB);
            Drives.stimulate(pet, 0.15);
            Plans.clearPlan(pet);
            Util.faceGlobal(pet, fgx, fgy);
            pet.enterState(pickFn(pet, Gestures.attackPool(pet).concat(["hop", "tumble"])));
        } else if (takesItWell < 0.38) {
            Social.rebuff(pet, fromB);
            Plans.clearPlan(pet);
            if (resting) pet.enterState(SpeciesProfile.wakeStateFor(pet));
            else if (p.boldness < 0.3 && nav) nav.fleeFrom(pet, fgx, fgy, 160 + Math.random() * 100);
            else pet.enterState(pickFn(pet, ["pain", "cringe", "attack"]));
        } else {
            Memory.adjustRelation(pet, fromB.petData.name, 0.003, 0.03);
            Plans.clearPlan(pet);
            if (resting) pet.enterState(SpeciesProfile.wakeStateFor(pet));
            else pet.enterState(pickFn(pet, ["startle", "trip", "tumbleBack", "hitGround"]));
        }
        break;
    }

    case "pet_spar": {
        var fromS = data.fromPet;
        Memory.adjustRelation(pet, fromS.petData.name, 0.014, 0.05, "play");
        Memory.recordEpisode(pet, "sparred", { valence: 0.45, withPet: fromS.petData.name });
        pet.mood = Drives.clamp01(pet.mood + 0.05);
        Drives.happier(pet, 0.02);
        if (pet.state_ === "idle" && !Plans.hasActivePlan(pet)) {
            pet.enterState(pickFn(pet, Gestures.attackPool(pet).concat(["hop"])));
        }
        break;
    }

    case "pet_rebuff":
    case "pet_annoy": {
        var fromR = data.fromPet;
        Memory.adjustRelation(pet, fromR.petData.name, -0.015, 0.025, "friction", { outcome: "rebuffed" });
        Memory.recordEpisode(pet, "rebuffed", { valence: -0.35, withPet: fromR.petData.name });
        pet.mood = Math.max(0, pet.mood - 0.04);
        var activeName = pet.activePlan ? pet.activePlan.name : "";
        if (activeName === "invite_play" || activeName === "spar_bout" || activeName === "play_tag") {
            break;
        }
        if (nav && !resting) {
            Plans.startPlan(pet, Plans.buildBackedOffPlan(fromR.petData.name), nav, pickFn);
        } else {
            Plans.clearPlan(pet);
            if (pet.state_ === "idle") pet.enterState(pickFn(pet, ["cringe", "nod"]));
        }
        break;
    }

    case "pet_illusion": {
        var fromIl = data.fromPet;
        Memory.adjustRelation(pet, fromIl.petData.name, 0.012, 0.05, "play");
        Memory.recordEpisode(pet, "greeted", { valence: 0.35, withPet: fromIl.petData.name, note: "illusion" });
        Memory.thinkAloud(pet, "saw_illusion", "Did a double-take at " + fromIl.petData.name + "'s Illusion");
        if (!resting) {
            Util.faceGlobal(pet, Util.petGX(fromIl), Util.petGY(fromIl));
            if (pet.emitEmote) pet.emitEmote("question");
            if (pet.state_ === "idle" && !Plans.hasActivePlan(pet)) {
                pet.enterState(pickFn(pet, ["nod", "hop"]));
            }
        }
        break;
    }

    case "pet_sneak_boop": {
        var fromSb = data.fromPet;
        Memory.adjustRelation(pet, fromSb.petData.name, 0.012, 0.05, "play");
        Memory.recordEpisode(pet, "greeted", { valence: 0.36, withPet: fromSb.petData.name, note: "sneak_boop" });
        Memory.thinkAloud(pet, "booped", "Whirled around after " + fromSb.petData.name + " snuck up from behind");
        if (!resting) {
            Util.faceGlobal(pet, Util.petGX(fromSb), Util.petGY(fromSb));
            if (pet.emitEmote) pet.emitEmote("question");
            if (pet.state_ === "idle" && !Plans.hasActivePlan(pet)) {
                pet.enterState(pickFn(pet, ["hop", "nod"]));
            }
        }
        break;
    }

    case "pet_mentor_patrol": {
        var fromMp = data.fromPet;
        if (!resting && !Plans.hasActivePlan(pet) && nav) {
            Social.markPeerBout(pet, "greet");
            Plans.startPlan(pet, Plans.buildCopycatTrailPlan(pet, fromMp), nav, pickFn);
        }
        break;
    }
    }
}
