.pragma library

.import "../SpeciesProfile.js" as SpeciesProfile
.import "../SpriteSheet.js" as SpriteSheet
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

function _isElectricSpecies(pet) {
    if (SpeciesProfile.hasElectricAffinity(pet)) return true;
    var sp = SpeciesProfile.trueSpeciesOf(pet);
    var animData = pet.sprite ? pet.sprite._animData : null;
    return !!(animData && SpriteSheet.hasDirectAnim("shock", animData, pet.sprite.actionMap || {}, sp));
}

function handleDesktopEvent(pet, type, data, nav, pickFn, ctx) {
    var p = ctx.p;
    var now = ctx.now;
    var loafing = ctx.loafing;
    var resting = ctx.resting;
    var cooldown = ctx.cooldown;
    var findNearbyGuardian = ctx.findNearbyGuardian;
    var trySocialReference = ctx.trySocialReference;

    switch (type) {
    case "music_started": {
        if (pet.enableMusicReact === false || resting) return true;
        if (cooldown(pet, "music_started", 90000)) return true;
        var melo = Personality.hasQuirk(pet, "melomaniac");
        if (melo || (p.playfulness > 0.58 && Math.random() < 0.45)) {
            if (pet.emitEmote) pet.emitEmote("note");
            Memory.thinkAloud(pet, "music_start", "Ears perked up at music", { minGapMs: 60000 });
            if (pet.state_ === "idle" && !Plans.hasActivePlan(pet)) {
                pet.enterState(pickFn(pet, SpeciesProfile.affectionGesturesFor(pet)));
            }
        }
        return true;
    }

    case "music_paused": {
        if (pet.enableMusicReact === false) return true;
        var activeNameMp = pet.activePlan ? pet.activePlan.name : "";
        var wasGrooving = activeNameMp === "music_groove" || activeNameMp === "sync_dance";
        if (!wasGrooving && (resting || !Personality.hasQuirk(pet, "melomaniac") || pet.state_ !== "idle")) return true;
        if (cooldown(pet, "music_paused", 15000)) return true;
        var groovePartner = (pet.activePlan && pet.activePlan.otherName) ? Util.findPet(pet, pet.activePlan.otherName) : null;
        if (wasGrooving) Plans.clearPlan(pet);
        if (groovePartner) {
            Util.faceGlobal(pet, Util.petGX(groovePartner), Util.petGY(groovePartner));
        } else if (pet.windowTracker && pet.windowTracker.activeWindowPos) {
            var mwp = pet.windowTracker.activeWindowPos;
            Util.faceGlobal(pet, mwp.x + mwp.w * 0.5, mwp.y + mwp.h * 0.5);
        }
        Memory.thinkAloud(pet, "music_paused", "Froze mid-sway wondering where the music went", { minGapMs: 20000 });
        if (pet.emitEmote) pet.emitEmote("question", wasGrooving);
        pet.enterState(pickFn(pet, ["lookUp", "nod"]));
        return true;
    }

    case "window_opened": {
        if (cooldown(pet, "window_opened", 60000)) return true;
        Drives.stimulate(pet, 0.03 + p.curiosity * 0.05);
        var oPerc = Perception.perceive(pet);
        if (!resting && pet.state_ === "idle" && !Plans.hasActivePlan(pet) && oPerc.win && !oPerc.fullscreen) {
            if (nav && p.curiosity > 0.52 && pet.alertness > 0.36 && Math.random() < 0.28 + p.curiosity * 0.35) {
                Plans.startPlan(pet, Plans.buildInspectWindowPlan(oPerc, pet), nav, pickFn);
                return true;
            }
            pet.attentionGX = oPerc.win.gx;
            pet.attentionGY = oPerc.win.gy;
            pet.attentionUntil = now + 7000;
            Util.faceGlobal(pet, oPerc.win.gx, oPerc.win.gy);
        }
        return true;
    }

    case "window_focused": {
        Drives.stimulate(pet, p.curiosity * 0.02);
        if (!resting && pet.state_ === "idle" && pet.windowTracker && pet.windowTracker.activeWindowPos && Math.random() < p.curiosity * 0.4) {
            var fwp = pet.windowTracker.activeWindowPos;
            pet.attentionGX = fwp.x + fwp.w * 0.5;
            pet.attentionGY = fwp.y + fwp.h * 0.5;
            pet.attentionUntil = now + 5500;
        }
        return true;
    }

    case "window_closed": {
        if (resting || !data || cooldown(pet, "window_closed", 75000)) return true;
        var cPerc = Perception.perceive(pet);
        var cDist = Math.hypot((data.gx || 0) - cPerc.petGX, (data.gy || 0) - cPerc.petGY);
        if (cDist >= 320) return true;
        Drives.stimulate(pet, 0.06);
        if (p.boldness < 0.36) {
            var guardC = findNearbyGuardian(pet, 380);
            if (guardC && nav) {
                Plans.startPlan(pet, Plans.buildTimidHideBehindPlan(pet, guardC, data.gx || 0, data.gy || 0), nav, pickFn);
            } else if (trySocialReference(pet, pickFn)) {
                return true;
            } else if (nav) {
                Plans.clearPlan(pet);
                pet.gait = "scamper";
                nav.fleeFrom(pet, data.gx || 0, data.gy || 0, 140);
                Social.broadcastAlarm(pet, data.gx || 0, data.gy || 0);
            } else {
                Plans.clearPlan(pet);
                pet.enterState(pickFn(pet, Gestures.HIDE_STATES));
            }
        } else if ((SpeciesProfile.socialStyleOf(pet) === "guardian" || p.boldness >= 0.64)
                && pet.state_ === "idle" && !Plans.hasActivePlan(pet) && nav) {
            Plans.startPlan(pet, Plans.buildGuardianCheckPlan(pet, data.gx || 0, data.gy || 0, data.windowClass || "closed window"), nav, pickFn);
        }
        return true;
    }

    case "window_urgent": {
        if (resting || cooldown(pet, "window_urgent", 90000)) return true;
        if ((pet.bond || 0.3) > 0.28 && data) {
            Drives.stimulate(pet, 0.08);
            var ugx = data.gx || 0, ugy = data.gy || 0;
            var uDist = Math.hypot(ugx - Util.petGX(pet), ugy - Util.petGY(pet));
            if (p.boldness < 0.36 && uDist < 480 && nav) {
                var guardU = findNearbyGuardian(pet, 380);
                if (guardU) {
                    Plans.startPlan(pet, Plans.buildTimidHideBehindPlan(pet, guardU, ugx, ugy), nav, pickFn);
                    return true;
                }
            } else if ((SpeciesProfile.socialStyleOf(pet) === "guardian" || p.boldness >= 0.66)
                    && pet.state_ === "idle" && !Plans.hasActivePlan(pet) && uDist < 520 && nav) {
                Plans.startPlan(pet, Plans.buildGuardianCheckPlan(pet, ugx, ugy, data.windowClass || "window alert"), nav, pickFn);
                return true;
            }
            pet.attentionGX = ugx;
            pet.attentionGY = ugy;
            pet.attentionUntil = now + 9000;
            Util.faceGlobal(pet, pet.attentionGX, pet.attentionGY);
            if (pet.emitEmote) pet.emitEmote("exclaim");
            Memory.thinkAloud(pet, "urgent_win", "Perked up at an alert in " + (data.windowClass || "a window"), { minGapMs: 60000 });
        }
        return true;
    }

    case "workspace_changed": {
        if (pet.state_ === "perch") {
            Plans.abortPlan(pet, "perch_lost");
            if (nav && nav.dropFromPerchIfNeeded) {
                nav.dropFromPerchIfNeeded(pet);
            } else {
                pet.enterState("idle");
            }
            return true;
        }
        if (pet.state_ === "sitNorth") {
            Plans.abortPlan(pet, "perch_lost");
            pet.enterState("idle");
            return true;
        }
        Drives.stimulate(pet, 0.03 + p.boldness * 0.04);
        if (!resting && pet.state_ === "idle" && !Plans.hasActivePlan(pet) && p.curiosity > 0.50 && Math.random() < 0.45) {
            pet.enterState(pickFn(pet, ["lookUp", "nod"]));
        }
        return true;
    }

    case "workspace_cleared": {
        Drives.stimulate(pet, 0.12 + p.energy * 0.08);
        pet.exploreDrive = Drives.clamp01(pet.exploreDrive + 0.16);
        pet.playDrive = Drives.clamp01(pet.playDrive + 0.12 * p.playfulness);
        Memory.thinkAloud(pet, "open_field", "Perked up as the workspace cleared into open room", { minGapMs: 90000 });
        if (loafing && !Plans.hasActivePlan(pet) && Math.random() < 0.32 + p.energy * 0.35) {
            pet.enterState(SpeciesProfile.wakeStateFor(pet));
        }
        return true;
    }

    case "window_shifted": {
        if (!data || cooldown(pet, "window_shifted", 18000)) return true;
        var sPetGX = Util.petGX(pet), sPetGY = Util.petGY(pet);
        var pwS = pet.width || 64, phS = pet.height || 64;
        var wx = Number(data.x || 0), wy = Number(data.y || 0), ww = Number(data.w || 0), wh = Number(data.h || 0);
        var nearMovedWin = sPetGX + pwS >= wx - 42 && sPetGX <= wx + ww + 42
                        && sPetGY + phS >= wy - 42 && sPetGY <= wy + wh + 42;
        if (!nearMovedWin) return true;
        if (pet.state_ === "perch" && pet.perchedWindowAddr === data.address) return true;
        if (pet.state_ === "deepsleep" && p.sleepiness > 0.68 && p.composure > 0.55) return true;
        if (!nav) return true;

        var curScrS = Topology.currentScreen(pet);
        var leftEdgeGX = wx - pwS - 16;
        var rightEdgeGX = wx + ww + 16;
        var pickLeft = leftEdgeGX >= curScrS.x + 8
                    && (rightEdgeGX > curScrS.x + curScrS.width - pwS - 8 || sPetGX < wx + ww * 0.5);
        var rawOutX = pickLeft ? leftEdgeGX : (rightEdgeGX <= curScrS.x + curScrS.width - pwS - 8 ? rightEdgeGX : (sPetGX < curScrS.x + curScrS.width * 0.5 ? curScrS.x + 18 : curScrS.x + curScrS.width - pwS - 18));
        var outPt = Util.clampToScreen(pet, rawOutX, sPetGY);
        var fav = Memory.favoriteSpot(pet);
        var coveredFav = !!(fav && fav.gx >= wx - 24 && fav.gx <= wx + ww + 24 && fav.gy >= wy - 24 && fav.gy <= wy + wh + 24);
        var annoyedShift = (resting || coveredFav) && Drives.effectivePatience(pet) < 0.46;
        Drives.stimulate(pet, 0.08);
        Plans.startPlan(pet, Plans.buildWindowShiftInspectPlan(outPt.gx, outPt.gy, wx + ww * 0.5, wy + wh * 0.5, data.windowClass || "window", annoyedShift), nav, pickFn);
        return true;
    }

    case "power_plugged": {
        if (cooldown(pet, "power_plugged", 20000)) return true;
        var pluggedIn = !!(data && data.pluggedIn);
        if (pluggedIn) {
            if (_isElectricSpecies(pet) && pet.state_ !== "deepsleep") {
                Drives.stimulate(pet, 0.14);
                pet.mood = Drives.clamp01(pet.mood + 0.08);
                Memory.thinkAloud(pet, "charger_spark", "Perked up at the static hum of the charger", { minGapMs: 45000 });
                if (pet.emitEmote) pet.emitEmote("exclaim");
                if (!Plans.hasActivePlan(pet)) {
                    pet.enterState(pickFn(pet, ["shock", "charge", "hop"]));
                }
            } else if (!resting && pet.state_ === "idle" && !Plans.hasActivePlan(pet) && p.curiosity > 0.58 && Math.random() < 0.35) {
                pet.enterState(pickFn(pet, ["nod"]));
            }
        } else if (data && data.batteryLevel !== undefined && data.batteryLevel <= 0.25 && !resting) {
            pet.alertness = Math.max(0.2, pet.alertness - 0.06);
        }
        return true;
    }

    case "low_battery": {
        if (cooldown(pet, "low_battery", 180000)) return true;
        pet.restDrive = Drives.clamp01(pet.restDrive + 0.10);
        if (!resting && (SpeciesProfile.socialStyleOf(pet) === "guardian" || (pet.bond || 0.3) > 0.52)
                && pet.state_ === "idle" && !Plans.hasActivePlan(pet)) {
            var lbScr = Topology.currentScreen(pet);
            Util.faceGlobal(pet, lbScr.x + lbScr.width * 0.85, lbScr.y + 12);
            Memory.thinkAloud(pet, "low_battery", "Perked up cautiously as the battery ran low", { minGapMs: 120000 });
            if (pet.emitEmote) pet.emitEmote("exclaim");
            pet.enterState(pickFn(pet, ["lookUp", "nod"]));
        }
        return true;
    }

    case "toast_arrived": {
        if (resting || cooldown(pet, "toast_arrived", 28000)) return true;
        var tPerc = Perception.perceive(pet);
        if (tPerc.fullscreen) return true;
        var cornerGX = tPerc.screen.x + tPerc.screen.w - 48;
        var cornerGY = tPerc.screen.y + (tPerc.screen.topInset || 0) + 28;
        var quietMode = !!(data && data.silent) || tPerc.micActive;
        if (quietMode) {
            if ((SpeciesProfile.socialStyleOf(pet) === "guardian" || p.composure >= 0.62)
                    && pet.state_ === "idle" && !Plans.hasActivePlan(pet)) {
                Util.faceGlobal(pet, cornerGX, cornerGY);
                Memory.thinkAloud(pet, "toast_guard", "Kept silent watch over an incoming notification", { minGapMs: 60000 });
                pet.enterState(pickFn(pet, ["pose", "nod"]));
            }
            return true;
        }
        if (trySocialReference(pet, pickFn)) return true;
        if ((pet.state_ === "idle" || pet.state_ === "perch") && !Plans.hasActivePlan(pet)
                && (p.curiosity > 0.36 || (data && data.urgency === "critical"))) {
            pet.attentionGX = cornerGX;
            pet.attentionGY = cornerGY;
            pet.attentionUntil = now + 5200;
            Util.faceGlobal(pet, cornerGX, cornerGY);
            Memory.thinkAloud(pet, "toast_perk", "Ears perked toward a notification from " + ((data && data.appName) || "the desktop"), { minGapMs: 45000 });
            if (pet.state_ === "idle") {
                pet.enterState(pickFn(pet, ["lookUp", "nod"]));
            }
        }
        return true;
    }

    case "monitor_connected": {
        if (resting || cooldown(pet, "monitor_connected", 45000)) return true;
        pet.exploreDrive = Drives.clamp01(pet.exploreDrive + 0.22);
        var mcPerc = Perception.perceive(pet);
        if (nav && !mcPerc.fullscreen && mcPerc.seamPeeks && mcPerc.seamPeeks.length > 0
                && pet.state_ === "idle" && !Plans.hasActivePlan(pet)
                && (p.curiosity > 0.42 || Personality.hasQuirk(pet, "screen_hopper"))) {
            var seamTarget = mcPerc.seamPeeks[0];
            for (var si = 0; si < mcPerc.seamPeeks.length; si++) {
                if (data && data.screenName && mcPerc.seamPeeks[si].screenName === data.screenName) {
                    seamTarget = mcPerc.seamPeeks[si];
                    break;
                }
            }
            var crossNew = p.boldness >= 0.48 || Personality.hasQuirk(pet, "screen_hopper");
            Plans.startPlan(pet, Plans.buildSeamPeekPlan(seamTarget, crossNew, pet), nav, pickFn);
        }
        return true;
    }

    case "displaced_monitor": {
        Plans.clearPlan(pet);
        pet.alertness = Drives.clamp01(pet.alertness + 0.18);
        Memory.recordEpisode(pet, "displaced_monitor", { valence: -0.18 });
        Memory.thinkAloud(pet, "displaced_mon", "Tumbled back onto the main screen when the display disconnected", { minGapMs: 10000 });
        if (pet.emitEmote) pet.emitEmote("question");
        pet.enterState(pickFn(pet, ["lostBalance", "cringe", "shake"]));
        if (pet.petManager && pet.petManager.notifyDisplacedCompanion) {
            pet.petManager.notifyDisplacedCompanion(pet);
        }
        return true;
    }

    case "system_resumed": {
        var sleptSec = Math.min(28800, Math.max(0, Number(data && data.sleptSec) || 0));
        if (sleptSec < 180) return true;
        var spProfR = SpeciesProfile.profileFor(SpeciesProfile.trueSpeciesOf(pet));
        var nightNow = !!pet.isNighttime;
        var activeShift = nightNow
            ? (spProfR.nocturnalAffinity || Personality.hasQuirk(pet, "night_watch") || Abilities.has(pet, "lunar_pulse"))
            : !spProfR.nocturnalAffinity;
        if (activeShift) {
            pet.restDrive = Math.max(0.08, pet.restDrive - Math.min(0.45, sleptSec / 18000));
            pet.alertness = Drives.clamp01(pet.alertness + 0.22);
            pet.exploreDrive = Drives.clamp01(pet.exploreDrive + 0.16);
            Plans.clearPlan(pet);
            Memory.thinkAloud(pet, "resume_wake", "Stretched awake after a quiet nap", { minGapMs: 30000 });
            pet.enterState(SpeciesProfile.wakeStateFor(pet));
        } else {
            pet.restDrive = Drives.clamp01(pet.restDrive + 0.24);
            pet.alertness = Math.max(0.15, pet.alertness - 0.18);
            if (!resting && !Plans.hasActivePlan(pet)) {
                Memory.thinkAloud(pet, "resume_sleepy", "Blinked sleepily after a long quiet stretch and curled back down", { minGapMs: 30000 });
                pet.enterState("loaf");
            }
        }
        return true;
    }

    case "weather_changed": {
        if (!data || cooldown(pet, "weather_changed", 60000)) return true;
        var nextW = data.newKind || "";
        if (nextW === "storm" && !resting) {
            if (p.boldness < 0.38 && !trySocialReference(pet, pickFn)) {
                var guardSt = findNearbyGuardian(pet, 380);
                var stScr = Topology.currentScreen(pet);
                if (guardSt && nav) {
                    Plans.startPlan(pet, Plans.buildTimidHideBehindPlan(pet, guardSt, stScr.x + stScr.width * 0.5, stScr.y), nav, pickFn);
                } else {
                    Plans.clearPlan(pet);
                    pet.enterState(pickFn(pet, ["cringe", "hide"]));
                }
                Memory.thinkAloud(pet, "storm_flinch", "Flinched as stormy weather rolled in", { minGapMs: 60000 });
                return true;
            }
        }
        if ((nextW === "rain" || nextW === "storm") && !resting
                && SpeciesProfile.hasRainAffinity(pet)
                && pet.state_ === "idle" && !Plans.hasActivePlan(pet)) {
            Drives.happier(pet, 0.04);
            pet.playDrive = Drives.clamp01(pet.playDrive + 0.12);
            Memory.thinkAloud(pet, "rain_perk", "Perked up happily as rain began outside", { minGapMs: 60000 });
            pet.enterState(pickFn(pet, ["lookUp", "twirl", "hop"]));
        } else if (nextW === "snow" && !resting && Abilities.has(pet, "frost_calm")
                && pet.state_ === "idle" && !Plans.hasActivePlan(pet)) {
            Drives.happier(pet, 0.04);
            Memory.thinkAloud(pet, "snow_perk", "Tilted head calmly at snowy weather", { minGapMs: 60000 });
            pet.enterState(pickFn(pet, ["lookUp", "pose"]));
        }
        return true;
    }

    case "solar_changed": {
        if (!data || cooldown(pet, "solar_changed", 120000)) return true;
        var nextPhase = data.newPhase || "";
        if (nextPhase === "dawn") {
            if ((Personality.hasQuirk(pet, "night_watch") || Abilities.has(pet, "lunar_pulse")) && !resting) {
                pet.restDrive = Drives.clamp01(pet.restDrive + 0.16);
                Memory.thinkAloud(pet, "dawn_yawn", "Let out a long breath at dawn after night watch", { minGapMs: 120000 });
                if (pet.state_ === "idle" && !Plans.hasActivePlan(pet)) {
                    pet.enterState(pickFn(pet, ["deepBreath", "nod"]));
                }
            } else if (Abilities.has(pet, "solar_bask") && loafing && !Plans.hasActivePlan(pet)) {
                Memory.thinkAloud(pet, "dawn_wake", "Stretched awake with the morning light", { minGapMs: 120000 });
                pet.enterState(SpeciesProfile.wakeStateFor(pet));
            }
        } else if ((nextPhase === "dusk" || nextPhase === "night")
                && (Abilities.has(pet, "lunar_pulse") || SpeciesProfile.profileFor(SpeciesProfile.trueSpeciesOf(pet)).nocturnalAffinity)) {
            pet.alertness = Drives.clamp01(pet.alertness + 0.14);
            if (loafing && !Plans.hasActivePlan(pet)) {
                Memory.thinkAloud(pet, "dusk_wake", "Stirred awake as evening fell", { minGapMs: 120000 });
                pet.enterState(SpeciesProfile.wakeStateFor(pet));
            }
        }
        return true;
    }

    case "audio_spiked": {
        if (pet.state_ === "deepsleep" || cooldown(pet, "audio_spiked", 45000)) return true;
        if (trySocialReference(pet, pickFn)) return true;
        if (loafing && p.composure < 0.65) {
            pet.alertness = Drives.clamp01(pet.alertness + 0.14);
            Plans.clearPlan(pet);
            Memory.thinkAloud(pet, "audio_stir", "Ears flicked awake at a sudden jump in volume", { minGapMs: 45000 });
            pet.enterState(SpeciesProfile.wakeStateFor(pet));
        } else if (pet.state_ === "idle" && !Plans.hasActivePlan(pet) && p.composure < 0.55) {
            if (pet.emitEmote) pet.emitEmote("exclaim");
            pet.enterState(pickFn(pet, ["hop", "cringe", "lookUp"]));
        }
        return true;
    }

    case "audio_muted": {
        if (!resting) {
            pet.alertness = Math.max(0.15, pet.alertness - 0.04);
        }
        return true;
    }

    case "build_completed": {
        if (resting || pet.state_ !== "idle" || Plans.hasActivePlan(pet) || cooldown(pet, "build_completed", 180000)) return true;
        var sensesBuild = Abilities.has(pet, "aura_sense")
                       || Personality.hasQuirk(pet, "terminal_supervisor")
                       || ((pet.bond || 0.3) > 0.52 && p.composure > 0.50);
        if (!sensesBuild) return true;
        if (pet.windowTracker && pet.windowTracker.activeWindowPos) {
            var bwp = pet.windowTracker.activeWindowPos;
            Util.faceGlobal(pet, bwp.x + bwp.w * 0.5, bwp.y + bwp.h * 0.5);
        }
        Memory.thinkAloud(pet, "build_done", "Noticed a busy task finish and gave a quiet nod", { minGapMs: 120000 });
        pet.enterState(pickFn(pet, ["nod", "pose"]));
        return true;
    }

    case "mic_changed": {
        if (data && data.active && pet.activePlan) {
            var noisyPlans = ["zoomies", "bid_attention", "squabble", "sneak_boop", "illusion_prank"];
            if (noisyPlans.indexOf(pet.activePlan.name) !== -1) {
                Plans.clearPlan(pet);
                pet.enterState("idle");
            }
        }
        return true;
    }
    }

    return false;
}
