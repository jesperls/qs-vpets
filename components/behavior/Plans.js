.pragma library

.import "../SpeciesProfile.js" as SpeciesProfile
.import "Personality.js" as Personality
.import "Drives.js" as Drives
.import "Memory.js" as Memory
.import "Perception.js" as Perception
.import "Social.js" as Social
.import "Topology.js" as Topology
.import "Abilities.js" as Abilities
.import "Util.js" as Util
.import "PlanBuildersEnv.js" as PlanBuildersEnv
.import "PlanBuildersSocial.js" as PlanBuildersSocial

function hasActivePlan(pet) {
    if (!pet.activePlan) return false;
    if (Util.now(pet) > pet.activePlan.until) {
        clearPlan(pet);
        return false;
    }
    return true;
}

function currentStep(pet) {
    if (!pet.activePlan || !pet.activePlan.steps) return null;
    return pet.activePlan.steps[pet.activePlan.stepIndex] || null;
}

function clearPlan(pet, keepIntention) {
    var keepBerry = !!(pet.activePlan && pet.activePlan.keepBerryOnClear);
    pet.activePlan = null;
    if (!keepIntention) {
        pet.intention = null;
    } else if (pet.intention) {
        if (pet.intention.name === "rest") {
            pet.intention = null;
        } else {
            pet.intention.until = Math.min(pet.intention.until, Util.now(pet) + 90000);
        }
    }
    pet.perchedWindowAddr = "";
    pet.onJourney = false;
    pet.gait = "trot";
    if ("_attentiveRest" in pet) pet._attentiveRest = false;
    if (!keepBerry && ("berryPresent" in pet) && pet.berryPresent) {
        pet.berryPresent = false;
        pet.berryUntil = 0;
    }
    if (pet.illusionSpecies) {
        pet.illusionSpecies = "";
        pet.illusionUntil = 0;
    }
}

function startPlan(pet, plan, nav, pickFn) {
    if (pet.illusionSpecies) {
        pet.illusionSpecies = "";
        pet.illusionUntil = 0;
    }
    if ("_attentiveRest" in pet) pet._attentiveRest = false;
    if (plan.name !== "retire_to_pen" && plan.name !== "joint_retire"
            && typeof pet.cancelRetireIfInterrupted === "function") {
        pet.cancelRetireIfInterrupted();
    }
    var rawSteps = (plan.steps || []).slice();
    if (Util.isRestingState(pet.state_) && rawSteps.length > 0) {
        var firstKind = rawSteps[0].kind;
        if (firstKind !== "rest" && firstKind !== "loaf_watch") {
            var wakeSt = SpeciesProfile.wakeStateFor(pet);
            var alreadyWaking = firstKind === "act"
                && Array.isArray(rawSteps[0].states)
                && rawSteps[0].states.indexOf(wakeSt) !== -1;
            if (!alreadyWaking) {
                rawSteps.unshift({ kind: "act", label: "Stretching awake", states: [wakeSt] });
            }
        }
    } else if (pet.state_ === "perch" && rawSteps.length > 0) {
        var pFirst = rawSteps[0].kind;
        if (pFirst !== "travel" && pFirst !== "jump_to" && pFirst !== "perch" && nav && nav.launchJumpTo) {
            var pScr = Topology.currentScreen(pet);
            var pFloorY = pScr.y + pScr.height - (pScr.bottomInset || 0) - (pet.height || 64) - 28;
            var curPGX = Util.petGX(pet), curPGY = Util.petGY(pet);
            if (curPGY < pFloorY - 48) {
                rawSteps.unshift({
                    kind: "jump_to",
                    gx: curPGX,
                    gy: Math.min(pFloorY, curPGY + 96),
                    arcBoost: 14,
                    label: "Hopping down from ledge"
                });
            }
        }
    }
    var now = Util.now(pet);
    pet.activePlan = {
        name: plan.name,
        label: plan.label || plan.name,
        reason: plan.reason || plan.label || plan.name,
        thought: plan.thought || "",
        urgency: Drives.clamp01(plan.urgency === undefined ? 0.5 : plan.urgency),
        otherName: plan.otherName || "",
        secondOtherName: plan.secondOtherName || "",
        windowClass: plan.windowClass || "",
        windowAddr: plan.windowAddr || "",
        watchMode: plan.watchMode || "",
        otherScreen: !!plan.otherScreen,
        waitingForBid: false,
        bidOutcome: "",
        bidPlayMode: "",
        sparAccepted: undefined,
        chaseRejected: false,
        stalkFreezes: 0,
        trailLegsDone: 0,
        started: now,
        until: now + (plan.durationMs || 150000),
        stepIndex: -1,
        steps: rawSteps
    };
    pet.intention = {
        name: plan.name,
        urgency: pet.activePlan.urgency,
        started: now,
        until: pet.activePlan.until,
        otherName: pet.activePlan.otherName || undefined,
        reason: pet.activePlan.reason,
        stepLabel: ""
    };
    advanceStep(pet, nav, pickFn);
}

function resolveStepTarget(pet, isRetarget) {
    var plan = pet.activePlan;
    var step = currentStep(pet);
    if (!plan || !step) return null;

    if (step.dynamic === "cursor") {
        if (isRetarget && (!pet.inputTracker || !pet.inputTracker.userActive)) return null;
        if (pet.inputTracker) {
            return {
                gx: pet.inputTracker.cursorX + (step.offsetX || 0),
                gy: pet.inputTracker.cursorY + (step.offsetY || 0)
            };
        }
        return { gx: step.gx, gy: step.gy };
    }

    if (step.dynamic === "other_pet" || step.dynamic === "other_pet_chase") {
        var other = Util.findPet(pet, plan.otherName);
        if (!other) return null;
        if (step.dynamic === "other_pet_chase" && other.onJourney && Util.distBetween(pet, other) < 120) {
            return {
                gx: other.targetGX + (step.offsetX || -38),
                gy: other.targetGY + (step.offsetY || 0)
            };
        }
        var defOffX = isRetarget ? 54 : 68;
        return {
            gx: Util.petGX(other) + (step.offsetX !== undefined ? step.offsetX : defOffX),
            gy: Util.petGY(other) + (step.offsetY || 0)
        };
    }

    if (isRetarget) {
        if (plan.name === "supervise_work" || plan.name === "inspect_window") {
            var perc = Perception.perceive(pet);
            if (!perc.win) return null;
            if (plan.watchMode === "north" && perc.win.canSitBelow) {
                return { gx: perc.win.watchBelowGX, gy: perc.win.watchBelowGY };
            }
            return { gx: perc.win.loafBesideGX, gy: perc.win.loafBesideGY };
        }
        if (plan.name === "watch_fullscreen") {
            if (!pet.windowTracker || !pet.windowTracker.isFullscreen) return null;
            return { gx: pet.targetGX, gy: pet.targetGY };
        }
        return { gx: pet.targetGX, gy: pet.targetGY };
    }

    return { gx: step.gx, gy: step.gy };
}

function advanceStep(pet, nav, pickFn) {
    var plan = pet.activePlan;
    if (!plan) {
        pet.enterState("idle");
        return;
    }
    if (Util.now(pet) > plan.until) {
        finishPlan(pet, pickFn);
        return;
    }

    var prev = plan.stepIndex >= 0 ? plan.steps[plan.stepIndex] : null;
    if (prev && prev.kind === "eat_berry" && ("berryPresent" in pet)) {
        pet.berryPresent = false;
        pet.berryUntil = 0;
    }
    if (prev && prev.kind === "wait_bid" && plan.waitingForBid) {
        plan.waitingForBid = false;
        if (!prev.allowRetry) {
            _onBidIgnored(pet, pickFn);
            return;
        }
    }

    plan.stepIndex++;
    if (plan.stepIndex >= plan.steps.length) {
        finishPlan(pet, pickFn);
        return;
    }

    var step = plan.steps[plan.stepIndex];
    if (pet.intention) pet.intention.stepLabel = step.label || step.kind;

    switch (step.kind) {
    case "travel": {
        if (!nav) { finishPlan(pet, pickFn); return; }
        pet.gait = step.gait || "trot";
        var target = resolveStepTarget(pet, false);
        if (!target) {
            clearPlan(pet);
            pet.enterState("idle");
            return;
        }
        if ((pet.state_ === "perch" || pet.perchedWindowAddr) && nav.launchJumpTo) {
            var pCurGX = Util.petGX(pet), pCurGY = Util.petGY(pet);
            if (Math.abs(target.gy - pCurGY) > 40) {
                pet.perchedWindowAddr = "";
                if (Math.hypot(target.gx - pCurGX, target.gy - pCurGY) <= 115) {
                    nav.launchJumpTo(pet, target.gx, target.gy, 16);
                    return;
                }
                var signX = (target.gx - pCurGX) >= 0 ? 1 : -1;
                var signY = (target.gy - pCurGY) >= 0 ? 1 : -1;
                var hopX = pCurGX + signX * Math.min(42, Math.max(16, Math.abs(target.gx - pCurGX) * 0.22));
                var hopY = pCurGY + signY * Math.min(78, Math.abs(target.gy - pCurGY));
                var hopPt = Util.clampToScreen(pet, hopX, hopY, 12, 12);
                plan.stepIndex--;
                nav.launchJumpTo(pet, hopPt.gx, hopPt.gy, 16);
                return;
            }
        }
        nav.journeyToGlobal(pet, target.gx, target.gy);
        return;
    }

    case "jump_to": {
        if (!nav || !nav.launchJumpTo) {
            advanceStep(pet, nav, pickFn);
            return;
        }
        var jGoalGX = step.gx, jGoalGY = step.gy;
        var wAddr = step.windowAddr || "";
        if (wAddr && pet.windowTracker && pet.windowTracker.visibleWindows) {
            var wins = pet.windowTracker.visibleWindows;
            var liveWin = null;
            for (var wi = 0; wi < wins.length; wi++) {
                if (wins[wi] && wins[wi].address === wAddr && !wins[wi].fullscreen) {
                    liveWin = wins[wi];
                    break;
                }
            }
            var jpw = pet.width || 64, jph = pet.height || 64;
            if (!liveWin || liveWin.y < Topology.minPerchY(Topology.currentScreen(pet), jph)) {
                clearPlan(pet);
                pet.enterState("idle");
                return;
            }
            var wSpan = Math.max(1, liveWin.w - jpw);
            var minLX = liveWin.x + Math.min(12, wSpan * 0.5);
            var maxLX = Math.max(minLX, liveWin.x + wSpan - 12);
            jGoalGX = Util.clamp(jGoalGX, minLX, maxLX);
            jGoalGY = liveWin.y - jph * 0.85;
        }
        var jCurGX = Util.petGX(pet), jCurGY = Util.petGY(pet);
        var jScr = Topology.currentScreen(pet);
        jGoalGY = Math.max(jScr.y, jGoalGY);
        var onSameScr = jGoalGX >= jScr.x && jGoalGX < jScr.x + jScr.width
                     && jGoalGY >= jScr.y && jGoalGY < jScr.y + jScr.height;
        if (!onSameScr) {
            pet.perchedWindowAddr = "";
            pet.gait = "trot";
            nav.journeyToGlobal(pet, jGoalGX, jGoalGY);
            return;
        }
        if (Math.hypot(jGoalGX - jCurGX, jGoalGY - jCurGY) > 180) {
            var stageX = Util.clamp(jCurGX, jGoalGX - 28, jGoalGX + 28);
            var stageY = jCurGY >= jGoalGY ? Math.min(jCurGY, jGoalGY + 92) : Math.max(jCurGY, jGoalGY - 58);
            var stagePt = Util.clampToScreen(pet, stageX, stageY, 12, 12);
            if (Math.hypot(stagePt.gx - jCurGX, stagePt.gy - jCurGY) > 20) {
                pet.perchedWindowAddr = "";
                plan.stepIndex--;
                pet.gait = "trot";
                nav.journeyToGlobal(pet, stagePt.gx, stagePt.gy);
                return;
            }
        }
        pet.perchedWindowAddr = "";
        nav.launchJumpTo(pet, jGoalGX, jGoalGY, step.arcBoost || 0);
        return;
    }

    case "stalk_step": {
        var stalkTarget = Util.findPet(pet, plan.otherName);
        if (!stalkTarget || stalkTarget.state_ === "deepsleep" || stalkTarget.state_ === "zoomies" || !nav) {
            finishPlan(pet, pickFn);
            return;
        }
        var sDist = Util.distBetween(pet, stalkTarget);
        if (sDist <= (step.boopRadius || 68)) {
            advanceStep(pet, nav, pickFn);
            return;
        }
        if (Social.isPeerLookingAt(stalkTarget, pet)) {
            plan.stalkFreezes = (plan.stalkFreezes || 0) + 1;
            if (plan.stalkFreezes > 3) {
                Memory.thinkAloud(pet, "sneak_spotted", "Froze and played innocent when " + plan.otherName + " glanced over");
                plan.steps = plan.steps.slice(0, plan.stepIndex + 1).concat([
                    { kind: "act", label: "Playing innocent", states: ["nod", "pose"] },
                    { kind: "wander_apart", dist: 140, gait: "amble", label: "Sauntering off casually" }
                ]);
                advanceStep(pet, nav, pickFn);
                return;
            }
            plan.stepIndex--;
            pet.onJourney = false;
            pet.enterState("idle");
            pet.schedulePlanBeat(1350);
            return;
        }
        var stMyGX = Util.petGX(pet), stMyGY = Util.petGY(pet);
        var toTarget = Math.atan2(Util.petGY(stalkTarget) - stMyGY, Util.petGX(stalkTarget) - stMyGX);
        var creepDist = Math.min(92, Math.max(28, sDist - 54));
        var creepPt = Util.clampToScreen(pet, stMyGX + Math.cos(toTarget) * creepDist, stMyGY + Math.sin(toTarget) * creepDist);
        if (sDist - creepDist > 66) plan.stepIndex--;
        pet.gait = "amble";
        nav.journeyToGlobal(pet, creepPt.gx, creepPt.gy);
        return;
    }

    case "trail_leader": {
        var leader = Util.findPet(pet, plan.otherName);
        if (!leader || !nav || (plan.trailLegsDone || 0) >= (step.maxLegs || 2)) {
            advanceStep(pet, nav, pickFn);
            return;
        }
        plan.trailLegsDone = (plan.trailLegsDone || 0) + 1;
        var lGX = Util.petGX(leader), lGY = Util.petGY(leader);
        var lAng = leader.moveAngle || 0;
        var trailPt = Util.clampToScreen(pet, lGX - Math.cos(lAng) * 68, lGY - Math.sin(lAng) * 52);
        if (plan.trailLegsDone < (step.maxLegs || 2)) plan.stepIndex--;
        pet.gait = "amble";
        nav.journeyToGlobal(pet, trailPt.gx, trailPt.gy);
        return;
    }

    case "dash_relative": {
        if (!nav) { finishPlan(pet, pickFn); return; }
        var relPet = Util.findPet(pet, step.otherName || plan.otherName);
        if (!relPet || relPet.state_ === "drag" || Util.distBetween(pet, relPet) > 480) {
            finishPlan(pet, pickFn);
            return;
        }
        var myGX = Util.petGX(pet), myGY = Util.petGY(pet);
        var oGX = Util.petGX(relPet), oGY = Util.petGY(relPet);
        var fromOther = Math.atan2(myGY - oGY, myGX - oGX);
        var dest;
        if (step.maneuver === "lunge") {
            var lRad = step.radius || 46;
            dest = Util.clampToScreen(pet, oGX + Math.cos(fromOther) * lRad, oGY + Math.sin(fromOther) * lRad);
        } else if (step.maneuver === "sidestep") {
            var sSign = step.sideSign || (Math.random() < 0.5 ? 1 : -1);
            var sAng = fromOther + sSign * (Math.PI * 0.52);
            var sRad = step.radius || 96;
            dest = Util.clampToScreen(pet, oGX + Math.cos(sAng) * sRad, oGY + Math.sin(sAng) * sRad);
        } else if (step.maneuver === "circle_front") {
            var cSign = Math.random() < 0.5 ? 1 : -1;
            var cAng = fromOther + cSign * 2.25;
            var cRad = step.radius || 76;
            dest = Util.clampToScreen(pet, oGX + Math.cos(cAng) * cRad, oGY + Math.sin(cAng) * cRad);
        } else if (step.maneuver === "retreat") {
            var rDist = step.dist || 115;
            var rAng = fromOther + (Math.random() - 0.5) * 0.55;
            dest = Util.clampToScreen(pet, myGX + Math.cos(rAng) * rDist, myGY + Math.sin(rAng) * rDist);
        } else {
            var aAng = fromOther + (step.angleOffset !== undefined ? step.angleOffset : ((Math.random() - 0.5) * 0.65));
            var aRad = step.radius || 84;
            dest = Util.clampToScreen(pet, oGX + Math.cos(aAng) * aRad, oGY + Math.sin(aAng) * aRad);
        }
        pet.gait = step.gait || "trot";
        nav.journeyToGlobal(pet, dest.gx, dest.gy);
        return;
    }

    case "wander_apart": {
        pet.attentionUntil = 0;
        if (!nav) { finishPlan(pet, pickFn); return; }
        var sepOther = Util.findPet(pet, step.otherName || plan.otherName);
        if (!sepOther || Util.distBetween(pet, sepOther) >= (step.minDist || step.dist || 175)) {
            advanceStep(pet, nav, pickFn);
            return;
        }
        var curGX = Util.petGX(pet), curGY = Util.petGY(pet);
        var sepGX = Util.petGX(sepOther), sepGY = Util.petGY(sepOther);
        var awayAng = Math.atan2(curGY - sepGY, curGX - sepGX) + (Math.random() - 0.5) * 0.85;
        var sepDist = (step.dist || 135) + Math.random() * 45;
        var pt = Util.clampToScreen(pet, curGX + Math.cos(awayAng) * sepDist, curGY + Math.sin(awayAng) * sepDist);
        if (Math.hypot(pt.gx - sepGX, pt.gy - sepGY) < 95) {
            var scr = Topology.currentScreen(pet);
            var toCenter = Math.atan2((scr.y + scr.height * 0.5) - curGY, (scr.x + scr.width * 0.5) - curGX);
            pt = Util.clampToScreen(pet, curGX + Math.cos(toCenter) * sepDist, curGY + Math.sin(toCenter) * sepDist);
        }
        pet.gait = step.gait || "amble";
        nav.journeyToGlobal(pet, pt.gx, pt.gy);
        return;
    }

    case "face_away": {
        pet.attentionUntil = 0;
        var ignOther = Util.findPet(pet, step.otherName || plan.otherName);
        var fMyGX = Util.petGX(pet), fMyGY = Util.petGY(pet);
        var turnAng = ignOther
            ? (Math.atan2(fMyGY - Util.petGY(ignOther), fMyGX - Util.petGX(ignOther)) + (Math.random() < 0.5 ? 0.35 : -0.35))
            : (pet.facingRight ? Math.PI : 0);
        pet.facingRight = Math.cos(turnAng) >= 0;
        if (pet.sprite && pet.sprite.setDirection) pet.sprite.setDirection(turnAng);
        var dismissPool = step.states || SpeciesProfile.dismissMovesFor(pet);
        pet.enterState(pickFn ? pickFn(pet, dismissPool) : dismissPool[0]);
        return;
    }

    case "branch_social_bid": {
        _resolvePeerPlayBid(pet, plan, step, nav, pickFn);
        return;
    }

    case "act": {
        if (step.spawnForageBerry && ("berryPresent" in pet)) {
            var fgx = Util.petGX(pet), fgy = Util.petGY(pet);
            var fpw = pet.width || 64, fph = pet.height || 64;
            pet.berryGX = fgx + fpw * 0.5 + (pet.facingRight ? 18 : -18);
            pet.berryGY = fgy + fph - 10;
            pet.berryPresent = true;
            pet.berryUntil = Util.now(pet) + 9000;
        }
        if (step.emote && pet.emitEmote) pet.emitEmote(step.emote, !!step.directEmote);
        _orientForStep(pet, plan, step);
        var chosen = pickFn ? pickFn(pet, step.states || ["nod"]) : ((step.states && step.states[0]) || "nod");
        pet.enterState(chosen);
        return;
    }

    case "eat_berry": {
        if (step.emote && pet.emitEmote) pet.emitEmote(step.emote, !!step.directEmote);
        _orientForStep(pet, plan, step);
        pet.enterState("eat");
        return;
    }

    case "vocal": {
        if (step.emote && pet.emitEmote) pet.emitEmote(step.emote, !!step.directEmote);
        _orientForStep(pet, plan, step);
        var vocal = SpeciesProfile.vocalStateFor(pet, !!step.excited);
        pet.enterState(pickFn ? pickFn(pet, [vocal]) : vocal);
        return;
    }

    case "pant": {
        var pant = SpeciesProfile.pantStateFor(pet);
        if (!pant) {
            advanceStep(pet, nav, pickFn);
            return;
        }
        pet.enterState(pant);
        return;
    }

    case "observe": {
        if (step.emote && pet.emitEmote) pet.emitEmote(step.emote, !!step.directEmote);
        _setStepAttention(pet, plan, step);
        if (step.facePoint) {
            pet.attentionGX = step.facePoint.gx;
            pet.attentionGY = step.facePoint.gy;
            pet.attentionUntil = Util.now(pet) + (step.durationMs || 6000);
            Util.faceGlobal(pet, step.facePoint.gx, step.facePoint.gy);
        }
        pet.enterState("idle");
        pet.schedulePlanBeat(step.durationMs || 6000);
        return;
    }

    case "watch_north": {
        if (pet.windowTracker && pet.windowTracker.activeWindowPos) {
            var nwp = pet.windowTracker.activeWindowPos;
            pet.attentionGX = nwp.x + nwp.w * 0.5;
            pet.attentionGY = nwp.y + nwp.h * 0.5;
            pet.attentionUntil = Util.now(pet) + (step.durationMs || 22000);
        }
        pet.enterState("sitNorth");
        pet.schedulePlanBeat(step.durationMs || 22000);
        return;
    }

    case "loaf_watch": {
        _orientForAttend(pet, plan, step.attend);
        _setStepAttention(pet, plan, step);
        pet.enterState("loaf");
        if ("_attentiveRest" in pet) pet._attentiveRest = true;
        pet.schedulePlanBeat(step.durationMs || 36000);
        return;
    }

    case "perch": {
        pet.perchedWindowAddr = step.windowAddr || plan.windowAddr || "";
        plan.windowAddr = pet.perchedWindowAddr;
        if (step.emote && pet.emitEmote) pet.emitEmote(step.emote);
        pet.enterState("perch");
        if (step.dirRow !== undefined && pet.sprite) {
            if (pet.sprite.setDirectionRow) pet.sprite.setDirectionRow(step.dirRow, false);
            else pet.sprite._dirRow = step.dirRow;
            pet.facingRight = step.dirRow >= 1 && step.dirRow <= 3;
        }
        pet.schedulePlanBeat(step.durationMs || 22000);
        return;
    }

    case "wait_bid": {
        plan.waitingForBid = true;
        if (pet.inputTracker) {
            pet.attentionGX = pet.inputTracker.cursorX;
            pet.attentionGY = pet.inputTracker.cursorY;
            pet.attentionUntil = Util.now(pet) + (step.durationMs || 9000);
        }
        pet.enterState("idle");
        pet.schedulePlanBeat(step.durationMs || 9000);
        return;
    }

    case "social": {
        var friend = Util.findPet(pet, plan.otherName);
        var maxDist = step.interaction === "reverse_chase" ? 720 : (step.interaction === "mediate" ? 380 : 340);
        if (friend && Util.distBetween(pet, friend) < maxDist) {
            Util.faceGlobal(pet, Util.petGX(friend), Util.petGY(friend));
            if (step.interaction === "greet") Social.greet(pet, friend);
            else if (step.interaction === "invite" || step.interaction === "play_bid") Social.bidPlay(pet, friend, false);
            else if (step.interaction === "play_bid_retry") Social.bidPlay(pet, friend, true);
            else if (step.interaction === "spar_challenge") {
                Social.startSpar(pet, friend);
                if (plan.sparAccepted === false) {
                    plan.steps = plan.steps.slice(0, plan.stepIndex + 1).concat([
                        { kind: "act", label: "Lowering stance", states: ["nod"] },
                        { kind: "wander_apart", dist: 140, gait: "amble", label: "Stepping away" }
                    ]);
                }
            } else if (step.interaction === "spar_hit") Social.sparExchange(pet, friend);
            else if (step.interaction === "chase") {
                Social.startChase(pet, friend);
                if (plan.chaseRejected) {
                    plan.steps = plan.steps.slice(0, plan.stepIndex + 1).concat([
                        { kind: "act", label: "Stopped short", states: ["cringe", "nod"] },
                        { kind: "wander_apart", dist: 145, gait: "amble", label: "Ambling off" }
                    ]);
                }
            } else if (step.interaction === "reverse_chase") Social.reverseChase(pet, friend);
            else if (step.interaction === "show_off") Social.showOff(pet, friend);
            else if (step.interaction === "squabble") Social.squabble(pet, friend);
            else if (step.interaction === "mediate") {
                var second = Util.findPet(pet, plan.secondOtherName);
                if (second) Social.mediate(pet, friend, second);
            } else if (step.interaction === "groove") Social.syncGroove(pet, friend);
            else if (step.interaction === "rest") Social.restBeside(pet, friend);
            else if (step.interaction === "illusion") Social.illusionSurprise(pet, friend);
            else if (step.interaction === "sneak_boop") Social.sneakBoop(pet, friend);
            else if (step.interaction === "mentor_invite") Social.inviteCopycat(pet, friend);
        }
        advanceStep(pet, nav, pickFn);
        return;
    }

    case "ability_effect": {
        Abilities.executeStep(pet, plan, step, nav, pickFn, advanceStep);
        return;
    }

    case "retire_finish": {
        if (plan.thought) {
            Memory.thinkAloud(pet, "plan_" + plan.name, plan.thought, { minGapMs: 25000 });
        }
        clearPlan(pet);
        if (pet.petManager && pet.petManager.completeRetire && pet.petData) {
            pet.petManager.completeRetire(pet.petData.id);
        } else {
            pet.enterState("loaf");
        }
        return;
    }

    case "zoomies": {
        if (nav) nav.randomDir(pet);
        pet.enterState("zoomies");
        return;
    }

    case "rest": {
        var deep = !!step.deep;
        var postState = deep ? "deepsleep" : (step.postState || "loaf");
        var reason = plan.reason || "resting";
        if (plan.thought) {
            Memory.thinkAloud(pet, "plan_" + plan.name, plan.thought, { minGapMs: 25000 });
        }
        if (plan.name === "steal_warm_spot") {
            Memory.recordEpisode(pet, "warm_spot", { valence: 0.36, withPet: plan.otherName || "" });
            if (plan.otherName) {
                var prevOwner = Util.findPet(pet, plan.otherName);
                if (prevOwner && Util.distBetween(pet, prevOwner) < 175) {
                    prevOwner.socialEvent("spot_stolen", pet);
                }
            }
        }
        if (step.faceOther && plan.otherName) {
            var companion = Util.findPet(pet, plan.otherName);
            if (companion) Util.faceGlobal(pet, Util.petGX(companion), Util.petGY(companion));
        }
        clearPlan(pet);
        var restNow = Util.now(pet);
        pet.intention = {
            name: "rest",
            urgency: pet.restDrive,
            started: restNow,
            until: restNow + 300000,
            reason: reason,
            stepLabel: deep ? "Deep sleep" : (postState === "laying" ? "Sprawled out" : "Loafing")
        };
        Memory.recordEpisode(pet, step.sanctuary ? "sanctuary_nap" : "resting", {
            valence: 0.25,
            salience: step.sanctuary ? 0.45 : 0.25
        });
        if ("_attentiveRest" in pet) pet._attentiveRest = false;
        pet.enterState(postState);
        return;
    }

    default:
        finishPlan(pet, pickFn);
    }
}

function _resolvePeerPlayBid(pet, plan, step, nav, pickFn) {
    var outcome = plan.bidOutcome || "ignored";
    var other = Util.findPet(pet, plan.otherName);
    if (outcome === "accepted" && other) {
        var wasRetry = !!step.afterRetry;
        var mode = plan.bidPlayMode || Social.preferredPlayMode(pet, other);
        Memory.adjustRelation(pet, plan.otherName, wasRetry ? 0.028 : 0.018, 0.07, wasRetry ? "won_over" : "play", { outcome: mode });
        Memory.recordEpisode(pet, mode === "spar" ? "sparred" : "played_with", {
            valence: 0.50,
            salience: 0.64,
            withPet: plan.otherName
        });
        pet.playDrive = Math.max(0, pet.playDrive - 0.22);
        pet.socialDrive = Math.max(0, pet.socialDrive - 0.18);
        Drives.happier(pet, 0.035);
        if (mode === "spar") {
            startPlan(pet, PlanBuildersSocial.buildSparBoutPlan(pet, plan.otherName, true, true), nav, pickFn);
        } else if (mode === "tag") {
            startPlan(pet, PlanBuildersSocial.buildPlayTagPlan({ name: plan.otherName }, true, pet), nav, pickFn);
        } else {
            startPlan(pet, PlanBuildersSocial.buildSyncDancePlan(pet, plan.otherName), nav, pickFn);
        }
        return;
    }

    if (outcome === "ignored") {
        var canRetry = !step.afterRetry && other
                    && pet.personality.boldness >= 0.52 && pet.personality.playfulness >= 0.56;
        if (canRetry) {
            plan.bidOutcome = "";
            plan.steps = plan.steps.slice(0, plan.stepIndex + 1).concat([
                { kind: "dash_relative", maneuver: "circle_front", gait: "trot", radius: 74, label: "Hopping into " + plan.otherName + "'s view" },
                { kind: "act", label: "Trying one more trick", states: SpeciesProfile.showOffMovesFor(pet), faceOther: true },
                { kind: "social", interaction: "play_bid_retry", label: "Play-bowing eagerly" },
                { kind: "observe", durationMs: 1100, attend: "other", label: "Waiting hopefully" },
                { kind: "branch_social_bid", afterRetry: true, label: "Reading reaction" }
            ]);
            advanceStep(pet, nav, pickFn);
            return;
        }
        Memory.adjustRelation(pet, plan.otherName, -0.010, 0.04, "unrequited", { outcome: "ignored" });
        Memory.recordEpisode(pet, "unrequited_play", { valence: -0.22, salience: 0.55, withPet: plan.otherName });
        Memory.thinkAloud(pet, "unrequited", "Wanted to play with " + plan.otherName + ", who gave the cold shoulder");
        pet.mood = Math.max(0, pet.mood - 0.04);
        pet.playDrive = Math.max(0, pet.playDrive - 0.08);
        plan.steps = plan.steps.slice(0, plan.stepIndex + 1).concat([
            { kind: "act", label: "Wilting quietly", states: ["cringe", "sitDown", "nod"], emote: "ellipses" },
            { kind: "wander_apart", dist: 150, gait: "amble", label: "Ambling off quietly" }
        ]);
        advanceStep(pet, nav, pickFn);
        return;
    }

    Memory.adjustRelation(pet, plan.otherName, -0.024, 0.04, "unrequited", { outcome: "rebuffed" });
    Memory.recordEpisode(pet, "unrequited_play", { valence: -0.38, salience: 0.62, withPet: plan.otherName });
    Memory.thinkAloud(pet, "rebuffed_play", "Got brushed off sharply by " + plan.otherName);
    pet.mood = Math.max(0, pet.mood - 0.06);
    plan.steps = plan.steps.slice(0, plan.stepIndex + 1).concat([
        { kind: "act", label: "Backing off", states: ["tumbleBack", "cringe", "hop"] },
        { kind: "wander_apart", dist: 175, gait: "trot", label: "Giving " + plan.otherName + " space" }
    ]);
    advanceStep(pet, nav, pickFn);
}

function _orientForStep(pet, plan, step) {
    if (step.faceCursor && pet.inputTracker) {
        Util.faceGlobal(pet, pet.inputTracker.cursorX, pet.inputTracker.cursorY);
    } else if (step.faceOther && plan.otherName) {
        var o = Util.findPet(pet, plan.otherName);
        if (o) Util.faceGlobal(pet, Util.petGX(o), Util.petGY(o));
    } else if (step.attendWindow && pet.windowTracker && pet.windowTracker.activeWindowPos) {
        var wp = pet.windowTracker.activeWindowPos;
        Util.faceGlobal(pet, wp.x + wp.w * 0.5, wp.y + wp.h * 0.5);
    } else if (step.facePoint) {
        Util.faceGlobal(pet, step.facePoint.gx, step.facePoint.gy);
    }
}

function _orientForAttend(pet, plan, attend) {
    if (attend === "window" && pet.windowTracker && pet.windowTracker.activeWindowPos) {
        var wp = pet.windowTracker.activeWindowPos;
        Util.faceGlobal(pet, wp.x + wp.w * 0.5, wp.y + wp.h * 0.5);
    } else if (attend === "other" && plan.otherName) {
        var o = Util.findPet(pet, plan.otherName);
        if (o) Util.faceGlobal(pet, Util.petGX(o), Util.petGY(o));
    } else if (attend === "cursor" && pet.inputTracker) {
        Util.faceGlobal(pet, pet.inputTracker.cursorX, pet.inputTracker.cursorY);
    }
}

function _setStepAttention(pet, plan, step) {
    var dur = step.durationMs || 8000;
    if (step.attend === "window" && pet.windowTracker && pet.windowTracker.activeWindowPos) {
        var wp = pet.windowTracker.activeWindowPos;
        pet.attentionGX = wp.x + wp.w * 0.5;
        pet.attentionGY = wp.y + wp.h * 0.5;
        pet.attentionUntil = Util.now(pet) + dur;
    } else if (step.attend === "cursor" && pet.inputTracker) {
        pet.attentionGX = pet.inputTracker.cursorX;
        pet.attentionGY = pet.inputTracker.cursorY;
        pet.attentionUntil = Util.now(pet) + dur;
    } else if (step.attend === "other" && plan.otherName) {
        var o = Util.findPet(pet, plan.otherName);
        if (o) {
            pet.attentionGX = Util.petGX(o);
            pet.attentionGY = Util.petGY(o);
            pet.attentionUntil = Util.now(pet) + dur;
        }
    }
}

function finishPlan(pet, pickFn) {
    var plan = pet.activePlan;
    if (!plan) {
        pet.enterState("idle");
        return;
    }
    var now = Util.now(pet);
    var elapsedSec = Math.max(2, (now - (plan.started || now)) / 1000);
    Drives.eventful(pet, Math.min(0.30, 0.08 + elapsedSec * 0.005));
    pet.calmUntil = now + 14000 + pet.personality.patience * 40000;
    if (plan.thought) {
        Memory.thinkAloud(pet, "plan_" + plan.name, plan.thought, { minGapMs: 25000 });
    }
    if (plan.otherName) {
        pet.attentionUntil = 0;
    }

    switch (plan.name) {
    case "scout_expedition":
        pet.exploreDrive = Math.max(0, pet.exploreDrive - 0.34);
        Drives.happier(pet, 0.02);
        Memory.recordPlaceAffect(pet, 0.08);
        Memory.recordEpisode(pet, "scout_complete", {
            valence: 0.35,
            novelty: 0.5,
            otherScreen: plan.otherScreen
        });
        pet.recentDrift = Personality.shiftRecent(pet.recentDrift, "curiosity", 0.008);
        if (plan.otherScreen) pet.recentDrift = Personality.shiftRecent(pet.recentDrift, "boldness", 0.008);
        break;

    case "supervise_work":
    case "inspect_window":
        pet.exploreDrive = Math.max(0, pet.exploreDrive - 0.22);
        pet.socialDrive = Math.max(0, pet.socialDrive - 0.20);
        Drives.happier(pet, 0.025);
        if (plan.windowClass) Memory.recordWindowPref(pet, plan.windowClass, 0.035);
        Memory.recordEpisode(pet, "supervised_code", {
            valence: 0.35,
            windowClass: plan.windowClass
        });
        pet.recentDrift = Personality.shiftRecent(pet.recentDrift, "patience", 0.006);
        break;

    case "window_perch":
    case "ledge_stroll":
    case "ledge_parkour":
        pet.exploreDrive = Math.max(0, pet.exploreDrive - 0.25);
        Drives.happier(pet, 0.025);
        if (plan.windowClass) Memory.recordWindowPref(pet, plan.windowClass, 0.03);
        Memory.recordEpisode(pet, "perched_window", {
            valence: plan.name === "ledge_parkour" ? 0.40 : 0.32,
            windowClass: plan.windowClass
        });
        break;

    case "seam_peek":
        pet.exploreDrive = Math.max(0, pet.exploreDrive - (plan.otherScreen ? 0.30 : 0.16));
        Memory.recordEpisode(pet, "seam_peeked", { valence: 0.26, otherScreen: plan.otherScreen });
        if (plan.otherScreen) {
            Drives.happier(pet, 0.02);
            Memory.recordEpisode(pet, "scout_complete", { valence: 0.34, novelty: 0.45, otherScreen: true });
        }
        break;

    case "mentor_patrol":
        pet.exploreDrive = Math.max(0, pet.exploreDrive - 0.22);
        Drives.happier(pet, 0.02);
        Memory.recordEpisode(pet, "mentor_patrol", { valence: 0.32, withPet: plan.otherName });
        break;

    case "copycat_trail":
        pet.exploreDrive = Math.max(0, pet.exploreDrive - 0.20);
        pet.socialDrive = Math.max(0, pet.socialDrive - 0.16);
        Drives.happier(pet, 0.03);
        if (plan.otherName) {
            Memory.adjustRelation(pet, plan.otherName, 0.014, 0.05, "play", { respectDelta: 0.03, outcome: "greet" });
        }
        Memory.recordEpisode(pet, "played_with", { valence: 0.38, withPet: plan.otherName, note: "copycat_trail" });
        break;

    case "guardian_check":
        pet.recentDrift = Personality.shiftRecent(pet.recentDrift, "boldness", 0.005);
        Memory.recordEpisode(pet, "mediated", { valence: 0.34, note: "guardian_check" });
        break;

    case "chase_cursor":
        pet.playDrive = Math.max(0, pet.playDrive - 0.22);
        Drives.happier(pet, 0.035);
        Drives.shiftTrust(pet, 0.015);
        Memory.recordEpisode(pet, "played_solo", { valence: 0.5, note: "cursor_chase" });
        pet.recentDrift = Personality.shiftRecent(pet.recentDrift, "playfulness", 0.008);
        break;

    case "music_groove":
        pet.playDrive = Math.max(0, pet.playDrive - 0.22);
        Drives.happier(pet, 0.03);
        Memory.recordEpisode(pet, "music_groove", { valence: 0.45, music: true });
        pet.recentDrift = Personality.shiftRecent(pet.recentDrift, "playfulness", 0.007);
        break;

    case "sync_dance":
    case "pack_rally":
        pet.playDrive = Math.max(0, pet.playDrive - 0.22);
        pet.socialDrive = Math.max(0, pet.socialDrive - 0.16);
        Drives.happier(pet, 0.035);
        Memory.recordEpisode(pet, "sync_danced", { valence: 0.48, withPet: plan.otherName });
        pet.recentDrift = Personality.shiftRecent(pet.recentDrift, "playfulness", 0.006);
        break;

    case "night_vigil":
        pet.socialDrive = Math.max(0, pet.socialDrive - 0.22);
        Drives.shiftTrust(pet, 0.015);
        Memory.recordEpisode(pet, "night_vigil", { valence: 0.4, salience: 0.55 });
        break;

    case "revisit_sanctuary":
        pet.comfortDrive *= 0.3;
        pet.mood = Drives.clamp01(pet.mood + 0.06);
        break;

    case "go_home":
        pet.comfortDrive *= 0.25;
        Drives.happier(pet, 0.015);
        break;

    case "forage_snack":
        pet.satiety = Drives.clamp01((pet.satiety === undefined ? 0.58 : pet.satiety) + 0.40);
        Drives.happier(pet, 0.03);
        Memory.recordEpisode(pet, "foraged", { valence: 0.25, salience: 0.30 });
        break;

    case "calm_company":
        pet.socialDrive = Math.max(0, pet.socialDrive - 0.22);
        Drives.happier(pet, 0.03);
        Drives.shiftTrust(pet, 0.015);
        Memory.recordEpisode(pet, "calm_company", { valence: 0.42, windowClass: plan.windowClass || "" });
        break;

    case "parked_cursor_company":
        pet.socialDrive = Math.max(0, pet.socialDrive - 0.18);
        Drives.shiftTrust(pet, 0.015);
        Memory.recordEpisode(pet, "calm_company", { valence: 0.38, note: "parked_cursor" });
        break;

    case "social_mingle":
        pet.socialDrive = Math.max(0, pet.socialDrive - 0.18);
        Drives.happier(pet, 0.02);
        break;

    default:
        Abilities.onPlanFinished(pet, plan);
        break;
    }

    var stayPerchedAddr = pet.state_ === "perch" ? (pet.perchedWindowAddr || "") : "";
    clearPlan(pet);
    if (stayPerchedAddr) {
        pet.perchedWindowAddr = stayPerchedAddr;
        pet.enterState("perch");
        if (pet.restartIdle) pet.restartIdle(0.85);
        return;
    }
    pet.enterState("idle");
    if (pet.restartIdle) pet.restartIdle(0.68);
}

function resolveBidSuccess(pet, nav, pickFn) {
    if (!pet.activePlan || !pet.activePlan.waitingForBid) return false;
    pet.activePlan.waitingForBid = false;
    Drives.shiftTrust(pet, 0.035);
    Drives.happier(pet, 0.06);
    pet.socialDrive = Math.max(0, pet.socialDrive - 0.32);
    pet.calmUntil = Util.now(pet) + 36000;
    pet.recentDrift = Personality.shiftRecent(pet.recentDrift, "sociability", 0.012);
    Memory.recordEpisode(pet, "bid_answered", { valence: 0.75, salience: 0.8 });
    Memory.thinkAloud(pet, "bid_yes", "Delighted to get attention", { minGapMs: 5000 });
    clearPlan(pet);
    if (pet.emitEmote) pet.emitEmote("heart", true);
    var happyPool = SpeciesProfile.affectionGesturesFor(pet);
    pet.enterState(pickFn ? pickFn(pet, happyPool) : happyPool[0]);
    return true;
}

function _onBidIgnored(pet, pickFn) {
    var p = pet.personality;
    Memory.recordEpisode(pet, "bid_ignored", { valence: -0.2, salience: 0.45 });
    clearPlan(pet);
    if (p.patience >= 0.50 || p.composure >= 0.52) {
        pet.recentDrift = Personality.shiftRecent(pet.recentDrift, "patience", 0.006);
        var perc = Perception.perceive(pet);
        if (Drives.sleepPropensity(pet, perc) > 0.30) {
            Memory.thinkAloud(pet, "bid_patient", "Settled down quietly nearby");
            pet.enterState("loaf");
        } else {
            Memory.thinkAloud(pet, "bid_patient", "Waited politely, then went back to its own business");
            pet.enterState(pickFn ? pickFn(pet, SpeciesProfile.calmGesturesFor(pet)) : "nod");
        }
    } else {
        pet.mood = Math.max(0, pet.mood - 0.05);
        pet.recentDrift = Personality.shiftRecent(pet.recentDrift, "sociability", -0.006);
        Memory.thinkAloud(pet, "bid_pout", "Gave up and wandered off quietly");
        if (pet.emitEmote) pet.emitEmote("ellipses");
        pet.enterState(pickFn ? pickFn(pet, ["cringe", "nod"]) : "nod");
    }
}

function abortPlan(pet, reason) {
    if (!pet.activePlan) return;
    if (reason === "blocked") {
        Memory.recordEpisode(pet, "blocked", { valence: -0.1, note: pet.activePlan.name });
        Memory.thinkAloud(pet, "blocked", "Stopped short of destination");
        pet.mood = Math.max(0, pet.mood - 0.02);
    } else if (reason === "perch_lost") {
        Memory.thinkAloud(pet, "perch_lost", "Window perch moved away", { minGapMs: 8000 });
    }
    clearPlan(pet, reason === "interrupted");
}

var buildSupervisePlan = PlanBuildersEnv.buildSupervisePlan;
var buildInspectWindowPlan = PlanBuildersEnv.buildInspectWindowPlan;
var buildWindowPerchPlan = PlanBuildersEnv.buildWindowPerchPlan;
var buildLowerLedgePerchPlan = PlanBuildersEnv.buildLowerLedgePerchPlan;
var buildLedgeStrollPlan = PlanBuildersEnv.buildLedgeStrollPlan;
var buildLedgeParkourPlan = PlanBuildersEnv.buildLedgeParkourPlan;
var buildScoutPlan = PlanBuildersEnv.buildScoutPlan;
var buildSeamPeekPlan = PlanBuildersEnv.buildSeamPeekPlan;
var buildAttentionBidPlan = PlanBuildersEnv.buildAttentionBidPlan;
var buildCursorChasePlan = PlanBuildersEnv.buildCursorChasePlan;
var buildMusicGroovePlan = PlanBuildersEnv.buildMusicGroovePlan;
var buildNightVigilPlan = PlanBuildersEnv.buildNightVigilPlan;
var buildForagePlan = PlanBuildersEnv.buildForagePlan;
var buildEatBerryPlan = PlanBuildersEnv.buildEatBerryPlan;
var buildRefuseBerryPlan = PlanBuildersEnv.buildRefuseBerryPlan;
var buildRestPlan = PlanBuildersEnv.buildRestPlan;
var buildGoHomePlan = PlanBuildersEnv.buildGoHomePlan;
var buildWatchFullscreenPlan = PlanBuildersEnv.buildWatchFullscreenPlan;
var buildRevisitSanctuaryPlan = PlanBuildersEnv.buildRevisitSanctuaryPlan;
var buildPlaySoloPlan = PlanBuildersEnv.buildPlaySoloPlan;
var buildUserPlayPlan = PlanBuildersEnv.buildUserPlayPlan;
var buildZoomiesPlan = PlanBuildersEnv.buildZoomiesPlan;
var buildZoomieStumblePlan = PlanBuildersEnv.buildZoomieStumblePlan;
var buildRetirePlan = PlanBuildersEnv.buildRetirePlan;
var buildArrivePlan = PlanBuildersEnv.buildArrivePlan;
var buildStealWarmSpotPlan = PlanBuildersEnv.buildStealWarmSpotPlan;
var buildParkedCursorCompanyPlan = PlanBuildersEnv.buildParkedCursorCompanyPlan;
var buildCalmCompanyPlan = PlanBuildersEnv.buildCalmCompanyPlan;
var buildWindowShiftInspectPlan = PlanBuildersEnv.buildWindowShiftInspectPlan;

var buildInvitePlayPlan = PlanBuildersSocial.buildInvitePlayPlan;
var buildSparBoutPlan = PlanBuildersSocial.buildSparBoutPlan;
var buildSparPartnerPlan = PlanBuildersSocial.buildSparPartnerPlan;
var buildPlayTagPlan = PlanBuildersSocial.buildPlayTagPlan;
var buildFleeTagPlan = PlanBuildersSocial.buildFleeTagPlan;
var buildReverseFleePlan = PlanBuildersSocial.buildReverseFleePlan;
var buildShowOffPlan = PlanBuildersSocial.buildShowOffPlan;
var buildSyncDancePlan = PlanBuildersSocial.buildSyncDancePlan;
var buildSquabblePlan = PlanBuildersSocial.buildSquabblePlan;
var buildSquabbleReplyPlan = PlanBuildersSocial.buildSquabbleReplyPlan;
var buildPeacekeeperPlan = PlanBuildersSocial.buildPeacekeeperPlan;
var buildSpectatePlan = PlanBuildersSocial.buildSpectatePlan;
var buildPackRallyPlan = PlanBuildersSocial.buildPackRallyPlan;
var buildBestFriendVisitPlan = PlanBuildersSocial.buildBestFriendVisitPlan;
var buildSocialMinglePlan = PlanBuildersSocial.buildSocialMinglePlan;
var buildSneakBoopPlan = PlanBuildersSocial.buildSneakBoopPlan;
var buildMentorPatrolPlan = PlanBuildersSocial.buildMentorPatrolPlan;
var buildCopycatTrailPlan = PlanBuildersSocial.buildCopycatTrailPlan;
var buildWelcomeFriendPlan = PlanBuildersSocial.buildWelcomeFriendPlan;
var buildJointRetirePlan = PlanBuildersSocial.buildJointRetirePlan;
var buildGuardianCheckPlan = PlanBuildersSocial.buildGuardianCheckPlan;
var buildTimidHideBehindPlan = PlanBuildersSocial.buildTimidHideBehindPlan;
var buildRestWithPlan = PlanBuildersSocial.buildRestWithPlan;
var buildColdShoulderPlan = PlanBuildersSocial.buildColdShoulderPlan;
var buildCooledOffPlan = PlanBuildersSocial.buildCooledOffPlan;
var buildBackedOffPlan = PlanBuildersSocial.buildBackedOffPlan;
var buildSharedGroovePlan = PlanBuildersSocial.buildSharedGroovePlan;
var buildJealousWedgePlan = PlanBuildersSocial.buildJealousWedgePlan;
var buildCheckDisplacedFriendPlan = PlanBuildersSocial.buildCheckDisplacedFriendPlan;
var buildIllusionPrankPlan = Abilities.buildIllusionPlan;
