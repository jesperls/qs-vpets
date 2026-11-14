.import "../SpeciesProfile.js" as SpeciesProfile
.import "Personality.js" as Personality
.import "Drives.js" as Drives
.import "Memory.js" as Memory
.import "Social.js" as Social
.import "Topology.js" as Topology
.import "Abilities.js" as Abilities

function _now(pet) {
    return (pet && pet._simNow) ? pet._simNow : Date.now();
}

function hasActivePlan(pet) {
    if (!pet.activePlan) return false;
    if (_now(pet) > pet.activePlan.until) {
        clearPlan(pet);
        return false;
    }
    return true;
}

function currentStep(pet) {
    if (!pet.activePlan || !pet.activePlan.steps) return null;
    return pet.activePlan.steps[pet.activePlan.stepIndex] || null;
}

function clearPlan(pet) {
    pet.activePlan = null;
    pet.intention = null;
    pet.perchedWindowAddr = "";
    pet.gait = "trot";
    if (pet.illusionSpecies) {
        pet.illusionSpecies = "";
        pet.illusionUntil = 0;
    }
}

function startPlan(pet, plan, nav, pickFn) {
    var now = _now(pet);
    pet.activePlan = {
        name: plan.name,
        label: plan.label || plan.name,
        reason: plan.reason || plan.label || plan.name,
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
        steps: plan.steps || []
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
    if (plan.thought) {
        Memory.thinkAloud(pet, "plan_" + plan.name, plan.thought, { minGapMs: 25000 });
    }
    advanceStep(pet, nav, pickFn);
}

function _clampedScreenPoint(pet, gx, gy) {
    var scr = Topology.currentScreen(pet);
    var pw = pet.width || 64, ph = pet.height || 64;
    var minX = scr.x + 28;
    var maxX = Math.max(minX, scr.x + scr.width - pw - 28);
    var minY = scr.y + (scr.topInset || 0) + 28;
    var maxY = Math.max(minY, scr.y + scr.height - (scr.bottomInset || 0) - ph - 24);
    return {
        gx: Topology.clamp(gx, minX, maxX),
        gy: Topology.clamp(gy, minY, maxY)
    };
}

function _naturalOffsetFrom(pet, other, radius) {
    var myGX = pet.screenX() + pet.worldX, myGY = pet.screenY() + pet.worldY;
    var oGX = other.screenX() + other.worldX, oGY = other.screenY() + other.worldY;
    var baseAng = Math.atan2(myGY - oGY, myGX - oGX);
    var ang = baseAng + (Math.random() - 0.5) * 0.72;
    var r = radius || 82;
    return {
        offsetX: Math.round(Math.cos(ang) * r),
        offsetY: Math.round(Math.sin(ang) * r * 0.78)
    };
}

function advanceStep(pet, nav, pickFn) {
    var plan = pet.activePlan;
    if (!plan) {
        pet.enterState("idle");
        return;
    }
    if (_now(pet) > plan.until) {
        finishPlan(pet, pickFn);
        return;
    }

    var prev = plan.stepIndex >= 0 ? plan.steps[plan.stepIndex] : null;
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
        var gx = step.gx, gy = step.gy;
        if (step.dynamic === "cursor" && pet.inputTracker) {
            gx = pet.inputTracker.cursorX + (step.offsetX || 0);
            gy = pet.inputTracker.cursorY + (step.offsetY || 0);
        } else if (step.dynamic === "other_pet" || step.dynamic === "other_pet_chase") {
            var targetPet = _findPet(pet, plan.otherName);
            if (!targetPet) { clearPlan(pet); pet.enterState("idle"); return; }
            if (step.dynamic === "other_pet_chase" && targetPet.onJourney && _distBetween(pet, targetPet) < 120) {
                gx = targetPet.targetGX + (step.offsetX || -38);
                gy = targetPet.targetGY + (step.offsetY || 0);
            } else {
                gx = targetPet.screenX() + targetPet.worldX + (step.offsetX !== undefined ? step.offsetX : 68);
                gy = targetPet.screenY() + targetPet.worldY + (step.offsetY || 0);
            }
        }
        nav.journeyToGlobal(pet, gx, gy);
        return;
    }

    case "jump_to": {
        if (!nav || !nav.launchJumpTo) {
            advanceStep(pet, nav, pickFn);
            return;
        }
        pet.perchedWindowAddr = "";
        nav.launchJumpTo(pet, step.gx, step.gy, step.arcBoost || 0);
        return;
    }

    case "stalk_step": {
        var stalkTarget = _findPet(pet, plan.otherName);
        if (!stalkTarget || stalkTarget.state_ === "deepsleep" || stalkTarget.state_ === "zoomies" || !nav) {
            finishPlan(pet, pickFn);
            return;
        }
        var sDist = _distBetween(pet, stalkTarget);
        if (sDist <= (step.boopRadius || 68)) {
            advanceStep(pet, nav, pickFn);
            return;
        }
        if (Social.isPeerLookingAt(stalkTarget, pet)) {
            plan.stalkFreezes = (plan.stalkFreezes || 0) + 1;
            if (plan.stalkFreezes > 3) {
                Memory.thinkAloud(pet, "sneak_spotted", "Froze and played innocent when " + plan.otherName + " glanced over");
                plan.steps = plan.steps.slice(0, plan.stepIndex + 1).concat([
                    { kind: "act", label: "Playing innocent", states: ["nod", "rotate"] },
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
        var stMyGX = pet.screenX() + pet.worldX, stMyGY = pet.screenY() + pet.worldY;
        var stOGX = stalkTarget.screenX() + stalkTarget.worldX, stOGY = stalkTarget.screenY() + stalkTarget.worldY;
        var toTarget = Math.atan2(stOGY - stMyGY, stOGX - stMyGX);
        var creepDist = Math.min(92, Math.max(28, sDist - 54));
        var creepPt = _clampedScreenPoint(pet, stMyGX + Math.cos(toTarget) * creepDist, stMyGY + Math.sin(toTarget) * creepDist);
        if (sDist - creepDist > 66) plan.stepIndex--;
        pet.gait = "amble";
        nav.journeyToGlobal(pet, creepPt.gx, creepPt.gy);
        return;
    }

    case "trail_leader": {
        var leader = _findPet(pet, plan.otherName);
        if (!leader || !nav || (plan.trailLegsDone || 0) >= (step.maxLegs || 2)) {
            advanceStep(pet, nav, pickFn);
            return;
        }
        plan.trailLegsDone = (plan.trailLegsDone || 0) + 1;
        var lGX = leader.screenX() + leader.worldX, lGY = leader.screenY() + leader.worldY;
        var lAng = leader.moveAngle || 0;
        var trailPt = _clampedScreenPoint(pet, lGX - Math.cos(lAng) * 68, lGY - Math.sin(lAng) * 52);
        if (plan.trailLegsDone < (step.maxLegs || 2)) plan.stepIndex--;
        pet.gait = "amble";
        nav.journeyToGlobal(pet, trailPt.gx, trailPt.gy);
        return;
    }

    case "dash_relative": {
        if (!nav) { finishPlan(pet, pickFn); return; }
        var relPet = _findPet(pet, step.otherName || plan.otherName);
        if (!relPet) { finishPlan(pet, pickFn); return; }
        var myGX = pet.screenX() + pet.worldX, myGY = pet.screenY() + pet.worldY;
        var oGX = relPet.screenX() + relPet.worldX, oGY = relPet.screenY() + relPet.worldY;
        var fromOther = Math.atan2(myGY - oGY, myGX - oGX);
        var dest;
        if (step.maneuver === "lunge") {
            var lRad = step.radius || 46;
            dest = _clampedScreenPoint(pet, oGX + Math.cos(fromOther) * lRad, oGY + Math.sin(fromOther) * lRad);
        } else if (step.maneuver === "sidestep") {
            var sSign = step.sideSign || (Math.random() < 0.5 ? 1 : -1);
            var sAng = fromOther + sSign * (Math.PI * 0.52);
            var sRad = step.radius || 96;
            dest = _clampedScreenPoint(pet, oGX + Math.cos(sAng) * sRad, oGY + Math.sin(sAng) * sRad);
        } else if (step.maneuver === "circle_front") {
            var cSign = Math.random() < 0.5 ? 1 : -1;
            var cAng = fromOther + cSign * 2.25;
            var cRad = step.radius || 76;
            dest = _clampedScreenPoint(pet, oGX + Math.cos(cAng) * cRad, oGY + Math.sin(cAng) * cRad);
        } else if (step.maneuver === "retreat") {
            var rDist = step.dist || 115;
            var rAng = fromOther + (Math.random() - 0.5) * 0.55;
            dest = _clampedScreenPoint(pet, myGX + Math.cos(rAng) * rDist, myGY + Math.sin(rAng) * rDist);
        } else {
            var aAng = fromOther + (step.angleOffset !== undefined ? step.angleOffset : ((Math.random() - 0.5) * 0.65));
            var aRad = step.radius || 84;
            dest = _clampedScreenPoint(pet, oGX + Math.cos(aAng) * aRad, oGY + Math.sin(aAng) * aRad);
        }
        pet.gait = step.gait || "trot";
        nav.journeyToGlobal(pet, dest.gx, dest.gy);
        return;
    }

    case "wander_apart": {
        pet.attentionUntil = 0;
        if (!nav) { finishPlan(pet, pickFn); return; }
        var sepOther = _findPet(pet, step.otherName || plan.otherName);
        if (!sepOther || _distBetween(pet, sepOther) >= (step.minDist || 175)) {
            advanceStep(pet, nav, pickFn);
            return;
        }
        var curGX = pet.screenX() + pet.worldX, curGY = pet.screenY() + pet.worldY;
        var sepGX = sepOther.screenX() + sepOther.worldX, sepGY = sepOther.screenY() + sepOther.worldY;
        var awayAng = Math.atan2(curGY - sepGY, curGX - sepGX) + (Math.random() - 0.5) * 0.85;
        var sepDist = (step.dist || 135) + Math.random() * 45;
        var pt = _clampedScreenPoint(pet, curGX + Math.cos(awayAng) * sepDist, curGY + Math.sin(awayAng) * sepDist);
        if (Math.hypot(pt.gx - sepGX, pt.gy - sepGY) < 95) {
            var scr = Topology.currentScreen(pet);
            var toCenter = Math.atan2((scr.y + scr.height * 0.5) - curGY, (scr.x + scr.width * 0.5) - curGX);
            pt = _clampedScreenPoint(pet, curGX + Math.cos(toCenter) * sepDist, curGY + Math.sin(toCenter) * sepDist);
        }
        pet.gait = step.gait || "amble";
        nav.journeyToGlobal(pet, pt.gx, pt.gy);
        return;
    }

    case "face_away": {
        pet.attentionUntil = 0;
        var ignOther = _findPet(pet, step.otherName || plan.otherName);
        var fMyGX = pet.screenX() + pet.worldX, fMyGY = pet.screenY() + pet.worldY;
        var turnAng = ignOther
            ? (Math.atan2(fMyGY - (ignOther.screenY() + ignOther.worldY), fMyGX - (ignOther.screenX() + ignOther.worldX)) + (Math.random() < 0.5 ? 0.35 : -0.35))
            : (pet.facingRight ? Math.PI : 0);
        pet.facingRight = Math.cos(turnAng) >= 0;
        pet.sprite.setDirection(turnAng);
        var dismissPool = step.states || SpeciesProfile.dismissMovesFor(pet);
        pet.enterState(pickFn ? pickFn(pet, dismissPool) : dismissPool[0]);
        return;
    }

    case "branch_social_bid": {
        _resolvePeerPlayBid(pet, plan, step, nav, pickFn);
        return;
    }

    case "act": {
        if (step.emote && pet.emitEmote) pet.emitEmote(step.emote, !!step.directEmote);
        _orientForStep(pet, plan, step);
        var chosen = pickFn ? pickFn(pet, step.states || ["nod"]) : ((step.states && step.states[0]) || "nod");
        pet.enterState(chosen);
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
            pet.attentionUntil = _now(pet) + (step.durationMs || 6000);
            _faceGlobal(pet, step.facePoint.gx, step.facePoint.gy);
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
            pet.attentionUntil = _now(pet) + (step.durationMs || 22000);
        }
        pet.enterState("sitNorth");
        pet.schedulePlanBeat(step.durationMs || 22000);
        return;
    }

    case "loaf_watch": {
        _orientForAttend(pet, plan, step.attend);
        _setStepAttention(pet, plan, step);
        pet.enterState("loaf");
        pet.schedulePlanBeat(step.durationMs || 36000);
        return;
    }

    case "perch": {
        pet.perchedWindowAddr = step.windowAddr || plan.windowAddr || "";
        plan.windowAddr = pet.perchedWindowAddr;
        if (step.emote && pet.emitEmote) pet.emitEmote(step.emote);
        pet.enterState("perch");
        if (step.dirRow !== undefined && pet.sprite) {
            pet.sprite._dirRow = step.dirRow;
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
            pet.attentionUntil = _now(pet) + (step.durationMs || 9000);
        }
        pet.enterState("idle");
        pet.schedulePlanBeat(step.durationMs || 9000);
        return;
    }

    case "social": {
        var friend = _findPet(pet, plan.otherName);
        var maxDist = step.interaction === "reverse_chase" ? 720 : (step.interaction === "mediate" ? 380 : 340);
        if (friend && _distBetween(pet, friend) < maxDist) {
            _faceGlobal(pet, friend.screenX() + friend.worldX, friend.screenY() + friend.worldY);
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
                var second = _findPet(pet, plan.secondOtherName);
                if (second) Social.mediate(pet, friend, second);
            } else if (step.interaction === "groove") Social.syncGroove(pet, friend);
            else if (step.interaction === "story") Social.shareDiscovery(pet, friend, step.topic);
            else if (step.interaction === "rest") Social.restBeside(pet, friend);
            else if (step.interaction === "pounce") Social.pounce(pet, friend);
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

    case "illusion_shift": {
        Abilities.executeStep(pet, plan, { effect: "illusion_shift", targetSpecies: step.targetSpecies }, nav, pickFn, advanceStep);
        return;
    }

    case "illusion_clear": {
        Abilities.executeStep(pet, plan, { effect: "illusion_clear" }, nav, pickFn, advanceStep);
        return;
    }

    case "retire_finish": {
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
        var reason = plan.reason || "resting";
        if (step.faceOther && plan.otherName) {
            var companion = _findPet(pet, plan.otherName);
            if (companion) _faceGlobal(pet, companion.screenX() + companion.worldX, companion.screenY() + companion.worldY);
        }
        clearPlan(pet);
        pet.intention = {
            name: "rest",
            urgency: pet.restDrive,
            started: _now(pet),
            until: _now(pet) + 300000,
            reason: reason,
            stepLabel: deep ? "Deep sleep" : "Loafing"
        };
        Memory.recordEpisode(pet, step.sanctuary ? "sanctuary_nap" : "resting", {
            valence: 0.25,
            salience: step.sanctuary ? 0.45 : 0.25
        });
        pet.enterState(deep ? "deepsleep" : "loaf");
        return;
    }

    default:
        finishPlan(pet, pickFn);
    }
}

function _resolvePeerPlayBid(pet, plan, step, nav, pickFn) {
    var outcome = plan.bidOutcome || "ignored";
    var other = _findPet(pet, plan.otherName);
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
            startPlan(pet, buildSparBoutPlan(pet, plan.otherName, true, true), nav, pickFn);
        } else if (mode === "tag") {
            startPlan(pet, buildPlayTagPlan({ name: plan.otherName }, true, pet), nav, pickFn);
        } else {
            startPlan(pet, buildSyncDancePlan(pet, plan.otherName), nav, pickFn);
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
        _faceGlobal(pet, pet.inputTracker.cursorX, pet.inputTracker.cursorY);
    } else if (step.faceOther && plan.otherName) {
        var o = _findPet(pet, plan.otherName);
        if (o) _faceGlobal(pet, o.screenX() + o.worldX, o.screenY() + o.worldY);
    } else if (step.attendWindow && pet.windowTracker && pet.windowTracker.activeWindowPos) {
        var wp = pet.windowTracker.activeWindowPos;
        _faceGlobal(pet, wp.x + wp.w * 0.5, wp.y + wp.h * 0.5);
    } else if (step.facePoint) {
        _faceGlobal(pet, step.facePoint.gx, step.facePoint.gy);
    }
}

function _orientForAttend(pet, plan, attend) {
    if (attend === "window" && pet.windowTracker && pet.windowTracker.activeWindowPos) {
        var wp = pet.windowTracker.activeWindowPos;
        _faceGlobal(pet, wp.x + wp.w * 0.5, wp.y + wp.h * 0.5);
    } else if (attend === "other" && plan.otherName) {
        var o = _findPet(pet, plan.otherName);
        if (o) _faceGlobal(pet, o.screenX() + o.worldX, o.screenY() + o.worldY);
    } else if (attend === "cursor" && pet.inputTracker) {
        _faceGlobal(pet, pet.inputTracker.cursorX, pet.inputTracker.cursorY);
    }
}

function _setStepAttention(pet, plan, step) {
    var dur = step.durationMs || 8000;
    if (step.attend === "window" && pet.windowTracker && pet.windowTracker.activeWindowPos) {
        var wp = pet.windowTracker.activeWindowPos;
        pet.attentionGX = wp.x + wp.w * 0.5;
        pet.attentionGY = wp.y + wp.h * 0.5;
        pet.attentionUntil = _now(pet) + dur;
    } else if (step.attend === "cursor" && pet.inputTracker) {
        pet.attentionGX = pet.inputTracker.cursorX;
        pet.attentionGY = pet.inputTracker.cursorY;
        pet.attentionUntil = _now(pet) + dur;
    } else if (step.attend === "other" && plan.otherName) {
        var o = _findPet(pet, plan.otherName);
        if (o) {
            pet.attentionGX = o.screenX() + o.worldX;
            pet.attentionGY = o.screenY() + o.worldY;
            pet.attentionUntil = _now(pet) + dur;
        }
    }
}

function finishPlan(pet, pickFn) {
    var plan = pet.activePlan;
    if (!plan) {
        pet.enterState("idle");
        return;
    }
    var now = _now(pet);
    Drives.eventful(pet, 0.22);
    pet.calmUntil = now + 14000 + pet.personality.patience * 40000;
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
        pet.lastDiscovery = plan.otherScreen ? "another monitor" : "a quiet corner";
        pet.lastDiscoveryTime = now;
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
        pet.satiety = Drives.clamp01((pet.satiety === undefined ? 0.5 : pet.satiety) + 0.44);
        Drives.happier(pet, 0.03);
        Memory.recordEpisode(pet, "foraged", { valence: 0.25, salience: 0.30 });
        break;

    default:
        Abilities.onPlanFinished(pet, plan);
        break;
    }

    clearPlan(pet);
    pet.enterState("idle");
}

function resolveBidSuccess(pet, nav, pickFn) {
    if (!pet.activePlan || !pet.activePlan.waitingForBid) return false;
    pet.activePlan.waitingForBid = false;
    Drives.shiftTrust(pet, 0.035);
    Drives.happier(pet, 0.06);
    pet.socialDrive = Math.max(0, pet.socialDrive - 0.32);
    pet.calmUntil = _now(pet) + 36000;
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
        Memory.thinkAloud(pet, "bid_patient", "Settled down quietly nearby");
        pet.enterState("loaf");
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
    clearPlan(pet);
}

function buildSupervisePlan(perc, pet) {
    var cls = perc.win ? perc.win.cls : "workspace";
    var useNorth = pet && SpeciesProfile.canWatchNorth(pet) && perc.win && perc.win.canSitBelow && Math.random() < 0.65;
    if (useNorth) {
        return {
            name: "supervise_work",
            label: "Watching " + (cls || "window"),
            reason: "Sitting below " + (cls || "active window") + " watching",
            windowClass: cls,
            watchMode: "north",
            urgency: 0.46,
            durationMs: 200000,
            thought: "Sitting below " + (cls || "active window") + " to watch",
            steps: [
                { kind: "travel", gait: "amble", label: "Padding below " + cls, gx: perc.win.watchBelowGX, gy: perc.win.watchBelowGY },
                { kind: "watch_north", label: "Sitting & watching " + cls, durationMs: 22000 + Math.random() * 18000 },
                { kind: "act", label: "Tilting head up", states: ["lookUpNorth"] },
                { kind: "watch_north", label: "Keeping watch", durationMs: 20000 + Math.random() * 22000 }
            ]
        };
    }

    var tx = perc.win ? perc.win.loafBesideGX : perc.petGX;
    var ty = perc.win ? perc.win.loafBesideGY : perc.petGY;
    return {
        name: "supervise_work",
        label: "Loafing by " + (cls || "work"),
        reason: "Keeping quiet company beside " + (cls || "active window"),
        windowClass: cls,
        watchMode: "beside",
        urgency: 0.45,
        durationMs: 210000,
        thought: "Loafing quietly beside " + (cls || "active window"),
        steps: [
            { kind: "travel", gait: "amble", label: "Walking near " + cls, gx: tx, gy: ty },
            { kind: "act", label: "Sniffing spot", states: SpeciesProfile.calmGesturesFor(pet), attendWindow: true },
            { kind: "loaf_watch", label: "Loafing beside " + cls, attend: "window", durationMs: 42000 + Math.random() * 40000 },
            { kind: "act", label: "Stretching up", states: [SpeciesProfile.wakeStateFor(pet)] }
        ]
    };
}

function buildInspectWindowPlan(perc, pet) {
    var cls = (perc.win && perc.win.cls) ? perc.win.cls : "new window";
    return {
        name: "inspect_window",
        label: "Inspecting " + cls,
        reason: "Checking out newly opened " + cls,
        windowClass: cls,
        urgency: 0.56,
        durationMs: 75000,
        thought: "Trotted over to inspect " + cls,
        steps: [
            { kind: "travel", gait: "trot", label: "Trotting to " + cls, gx: perc.win.loafBesideGX, gy: perc.win.loafBesideGY },
            { kind: "act", label: "Sniffing " + cls, states: SpeciesProfile.calmGesturesFor(pet), attendWindow: true },
            { kind: "observe", label: "Watching " + cls, attend: "window", durationMs: 8000 + Math.random() * 6000 }
        ]
    };
}

function buildWindowPerchPlan(perch, pet) {
    var cls = perch.cls || "window";
    var margin = Math.min(80, perch.w * 0.25);
    var px = perch.x + margin + Math.random() * Math.max(10, perch.w - margin * 2);
    var steps = [
        { kind: "travel", gait: "trot", label: "Heading to " + cls + " ledge", gx: px, gy: perch.gy }
    ];
    if (pet && SpeciesProfile.profileFor(SpeciesProfile.speciesOf(pet)).perchAffinity >= 1.1) {
        steps.push({ kind: "act", label: "Hopping onto ledge", states: ["hop"] });
    }
    steps.push({ kind: "perch", label: "Perched on " + cls, durationMs: 45000 + Math.random() * 50000 });
    return {
        name: "window_perch",
        label: "Perching on " + cls,
        reason: "Resting on " + cls + "'s top edge",
        windowClass: cls,
        windowAddr: perch.address,
        urgency: 0.48,
        durationMs: 240000,
        thought: "Perched atop " + cls + " watching below",
        steps: steps
    };
}

function buildScoutPlan(target) {
    var dest = target.otherScreen ? (target.screenName || "another monitor") : "quiet corner";
    return {
        name: "scout_expedition",
        label: "Exploring " + dest,
        reason: "Exploring " + dest,
        otherScreen: !!target.otherScreen,
        urgency: 0.52,
        durationMs: 180000,
        thought: "Trotting over to explore " + dest,
        steps: [
            { kind: "travel", gait: "trot", label: "Walking to " + dest, gx: target.gx, gy: target.gy },
            { kind: "act", label: "Sniffing around", states: ["nod"] },
            { kind: "observe", label: "Looking around", durationMs: 12000 + Math.random() * 14000 }
        ]
    };
}

function buildAttentionBidPlan(perc, bold, hungry) {
    var offset = bold ? 56 : 108;
    var side = perc.petGX < perc.cursor.gx ? -offset : offset;
    var steps = [
        { kind: "travel", gait: "trot", label: "Approaching cursor", dynamic: "cursor", offsetX: side, offsetY: 14 },
        { kind: "vocal", label: "Calling for attention", excited: false, faceCursor: true, emote: hungry ? "berry" : "question" },
        { kind: "wait_bid", label: "Waiting hopefully", durationMs: 8500, allowRetry: !!(bold || hungry) }
    ];
    if (bold || hungry) {
        steps.push({ kind: "travel", gait: "amble", label: "Stepping closer", dynamic: "cursor", offsetX: Math.round(side * 0.58), offsetY: 8 });
        steps.push({ kind: "vocal", label: "Asking again", excited: true, faceCursor: true });
        steps.push({ kind: "wait_bid", label: "Waiting quietly", durationMs: 6500, allowRetry: false });
    }
    return {
        name: "bid_attention",
        label: hungry ? "Asking for a Snack" : "Seeking Attention",
        reason: hungry ? "Hoping for a berry snack" : "Calling near cursor for pats",
        urgency: hungry ? 0.68 : 0.60,
        durationMs: 95000,
        thought: hungry ? "Trotted to cursor asking for a snack" : "Trotted to cursor calling for attention",
        steps: steps
    };
}

function buildCursorChasePlan(gx, gy) {
    return {
        name: "chase_cursor",
        label: "Chasing Cursor",
        reason: "Playfully pouncing after wiggling cursor",
        urgency: 0.76,
        durationMs: 35000,
        thought: "Stalked and pounced after the wiggling cursor",
        steps: [
            { kind: "act", label: "Play-crouching", states: ["nod"], facePoint: { gx: gx, gy: gy }, emote: "exclaim" },
            { kind: "travel", gait: "scamper", label: "Scampering after cursor", dynamic: "cursor", offsetX: 0, offsetY: 0 },
            { kind: "act", label: "Playful pounce", states: ["hop"], faceCursor: true }
        ]
    };
}

function buildMusicGroovePlan(perc, friendName, pet) {
    var track = perc.mediaTitle ? ("\"" + perc.mediaTitle.slice(0, 26) + "\"") : "music";
    var swayStates = SpeciesProfile.affectionGesturesFor(pet);
    var steps = [
        { kind: "act", label: "Swaying to music", states: swayStates, emote: "note" }
    ];
    if (friendName) {
        steps.unshift({ kind: "social", label: "Swaying near " + friendName, interaction: "groove" });
    }
    steps.push({ kind: "observe", label: "Listening", durationMs: 12000 });
    return {
        name: "music_groove",
        label: "Listening to Music",
        reason: "Enjoying " + track,
        otherName: friendName || "",
        urgency: 0.55,
        durationMs: 65000,
        thought: "Listening to " + track,
        steps: steps
    };
}

function buildNightVigilPlan(perc, pet) {
    var pw = perc.petW || 64, ph = perc.petH || 64;
    var tx, ty;
    if (perc.win) {
        tx = perc.win.loafBesideGX;
        ty = perc.win.loafBesideGY;
    } else if (perc.cursor.reachable) {
        tx = perc.cursor.gx + 80;
        ty = perc.cursor.gy;
    } else {
        tx = perc.screen.x + perc.screen.w * 0.5;
        ty = perc.screen.y + perc.screen.h - (perc.screen.bottomInset || 0) - ph - 16;
    }
    return {
        name: "night_vigil",
        label: "Late-Night Vigil",
        reason: "Keeping quiet company late at night",
        urgency: 0.48,
        durationMs: 210000,
        thought: "Keeping quiet company late at night",
        steps: [
            { kind: "travel", gait: "amble", label: "Padding nearby", gx: tx, gy: ty },
            { kind: "act", label: "Settling down", states: SpeciesProfile.settleGesturesFor(pet), attendWindow: !!perc.win },
            { kind: "loaf_watch", label: "Keeping quiet watch", attend: perc.win ? "window" : "cursor", durationMs: 55000 }
        ]
    };
}

function buildShareStoryPlan(other, topic, pet) {
    var off = (pet && other && other.pet) ? _naturalOffsetFrom(pet, other.pet, 78) : { offsetX: 68, offsetY: 18 };
    return {
        name: "share_story",
        label: "Checking In with " + other.name,
        reason: "Sharing excitement with " + other.name,
        otherName: other.name,
        urgency: 0.55,
        durationMs: 55000,
        thought: "Trotted over to share news with " + other.name,
        steps: [
            { kind: "travel", gait: "trot", label: "Trotting near " + other.name, dynamic: "other_pet", offsetX: off.offsetX, offsetY: off.offsetY },
            { kind: "social", label: "Greeting", interaction: "story", topic: topic },
            { kind: "act", label: "Excited gesture", states: SpeciesProfile.showOffMovesFor(pet), faceOther: true },
            { kind: "wander_apart", dist: 135, gait: "amble", label: "Strolling onward" }
        ]
    };
}

function buildInvitePlayPlan(pet, other) {
    var steps = [];
    if (other.dist > 115) {
        steps.push({ kind: "dash_relative", maneuver: "approach_angled", gait: "trot", radius: 84, label: "Bounding near " + other.name });
    }
    var bidMoves = SpeciesProfile.affectionGesturesFor(pet).concat(["hop"]);
    steps.push({ kind: "act", label: "Play-bowing to " + other.name, states: bidMoves, faceOther: true });
    steps.push({ kind: "social", interaction: "play_bid", label: "Inviting " + other.name + " to play" });
    steps.push({ kind: "observe", durationMs: 1150, attend: "other", label: "Waiting for " + other.name });
    steps.push({ kind: "branch_social_bid", afterRetry: false, label: "Reading " + other.name + "'s mood" });
    return {
        name: "invite_play",
        label: "Inviting " + other.name + " to Play",
        reason: "Play-bowing eagerly toward " + other.name,
        otherName: other.name,
        urgency: 0.66,
        durationMs: 55000,
        thought: "Play-bowed to see if " + other.name + " wants to play",
        steps: steps
    };
}

function buildSparBoutPlan(pet, otherName, alreadyClose, skipChallenge) {
    var sparMoves = SpeciesProfile.sparMovesFor(pet);
    var dodgeMoves = SpeciesProfile.dodgeMovesFor(pet);
    var stanceMoves = SpeciesProfile.standoffMovesFor(pet);
    var steps = [];
    if (!alreadyClose) {
        steps.push({ kind: "dash_relative", maneuver: "approach_angled", gait: "trot", radius: 98, label: "Approaching " + otherName });
    }
    if (!skipChallenge) {
        steps.push({ kind: "act", label: "Martial stance", states: stanceMoves, faceOther: true });
        steps.push({ kind: "social", interaction: "spar_challenge", label: "Challenging " + otherName });
    }
    steps.push({ kind: "dash_relative", maneuver: "lunge", gait: "scamper", radius: 46, label: "Lunging in!" });
    steps.push({ kind: "act", label: "Opening strike!", states: sparMoves, faceOther: true });
    steps.push({ kind: "dash_relative", maneuver: "sidestep", gait: "scamper", radius: 98, sideSign: 1, label: "Sidestepping counter!" });
    steps.push({ kind: "act", label: "Agile evade", states: dodgeMoves, faceOther: true });
    steps.push({ kind: "dash_relative", maneuver: "lunge", gait: "scamper", radius: 48, label: "Closing in!" });
    steps.push({ kind: "act", label: "Combo finisher!", states: sparMoves, faceOther: true });
    steps.push({ kind: "social", interaction: "spar_hit", label: "Sparring clash" });
    steps.push({ kind: "dash_relative", maneuver: "retreat", gait: "trot", dist: 105, label: "Springing back" });
    steps.push({ kind: "pant", label: "Catching breath" });
    steps.push({ kind: "act", label: "Respectful nod", states: ["nod", "pose"], faceOther: true });
    steps.push({ kind: "wander_apart", dist: 145, gait: "amble", label: "Parting ways" });
    return {
        name: "spar_bout",
        label: "Sparring with " + otherName,
        reason: "Friendly martial sparring with " + otherName,
        otherName: otherName,
        urgency: 0.78,
        durationMs: 65000,
        thought: "Trading playful sparring combos with " + otherName,
        steps: steps
    };
}

function buildSparPartnerPlan(pet, challenger) {
    var cName = challenger.petData.name;
    var sparMoves = SpeciesProfile.sparMovesFor(pet);
    var dodgeMoves = SpeciesProfile.dodgeMovesFor(pet);
    var stanceMoves = SpeciesProfile.standoffMovesFor(pet);
    return {
        name: "spar_partner",
        label: "Sparring with " + cName,
        reason: "Trading sparring moves with " + cName,
        otherName: cName,
        urgency: 0.78,
        durationMs: 65000,
        thought: "Accepted " + cName + "'s sparring challenge!",
        steps: [
            { kind: "act", label: "Ready stance", states: stanceMoves, faceOther: true },
            { kind: "dash_relative", maneuver: "sidestep", gait: "scamper", radius: 94, sideSign: -1, label: "Weaving aside!" },
            { kind: "act", label: "Dodging!", states: dodgeMoves, faceOther: true },
            { kind: "dash_relative", maneuver: "lunge", gait: "scamper", radius: 46, label: "Counter-lunging!" },
            { kind: "act", label: "Counter strike!", states: sparMoves, faceOther: true },
            { kind: "act", label: "Parrying!", states: dodgeMoves, faceOther: true },
            { kind: "dash_relative", maneuver: "retreat", gait: "trot", dist: 105, label: "Hopping back" },
            { kind: "pant", label: "Catching breath" },
            { kind: "act", label: "Respectful nod", states: ["nod", "pose"], faceOther: true },
            { kind: "wander_apart", dist: 145, gait: "amble", label: "Parting ways" }
        ]
    };
}

function buildPlayTagPlan(other, closeAlready, pet) {
    var steps = [];
    if (!closeAlready) {
        steps.push({ kind: "dash_relative", maneuver: "approach_angled", gait: "trot", radius: 82, label: "Bounding near " + other.name });
    }
    steps.push({ kind: "act", label: "Play-bowing", states: ["nod"], faceOther: true });
    steps.push({ kind: "social", label: "Tagging " + other.name, interaction: "chase" });
    steps.push({ kind: "travel", gait: "scamper", label: "Chasing " + other.name, dynamic: "other_pet_chase", offsetX: -38, offsetY: 16 });
    steps.push({ kind: "act", label: "Playful pounce", states: pet ? SpeciesProfile.dodgeMovesFor(pet) : ["hop"], faceOther: true });
    steps.push({ kind: "pant", label: "Catching breath" });
    steps.push({ kind: "wander_apart", dist: 150, gait: "amble", label: "Cooling down" });
    return {
        name: "play_tag",
        label: "Playing Tag with " + other.name,
        reason: "Playful chase with " + other.name,
        otherName: other.name,
        urgency: 0.78,
        durationMs: 65000,
        thought: "Chasing " + other.name + " in a game of tag",
        steps: steps
    };
}

function buildFleeTagPlan(pet, chaser, allowReverse) {
    var scr = Topology.currentScreen(pet);
    var pw = pet.width || 64, ph = pet.height || 64;
    var minX = scr.x + 36, maxX = Math.max(minX, scr.x + scr.width - pw - 36);
    var minY = scr.y + (scr.topInset || 0) + 36;
    var maxY = Math.max(minY, scr.y + scr.height - (scr.bottomInset || 0) - ph - 36);
    var curGX = scr.x + pet.worldX, curGY = scr.y + pet.worldY;
    var chaserGX = chaser.screenX() + chaser.worldX, chaserGY = chaser.screenY() + chaser.worldY;
    var awayAngle = Math.atan2(curGY - chaserGY, curGX - chaserGX) + (Math.random() - 0.5) * 0.9;
    var leg1X = Math.max(minX, Math.min(maxX, curGX + Math.cos(awayAngle) * 290));
    var leg1Y = Math.max(minY, Math.min(maxY, curGY + Math.sin(awayAngle) * 210));
    if (Math.hypot(leg1X - curGX, leg1Y - curGY) < 140) {
        leg1X = curGX < (minX + maxX) * 0.5 ? Math.min(maxX, curGX + 280) : Math.max(minX, curGX - 280);
    }
    var leg2Angle = awayAngle + (Math.random() < 0.5 ? 1.35 : -1.35);
    var leg2X = Math.max(minX, Math.min(maxX, leg1X + Math.cos(leg2Angle) * 240));
    var leg2Y = Math.max(minY, Math.min(maxY, leg1Y + Math.sin(leg2Angle) * 180));

    var steps = [
        { kind: "travel", gait: "scamper", label: "Scampering!", gx: leg1X, gy: leg1Y },
        { kind: "travel", gait: "scamper", label: "Zig-zagging!", gx: leg2X, gy: leg2Y }
    ];

    var canReverse = allowReverse !== false && pet.personality
                  && (SpeciesProfile.socialStyleOf(pet) === "sprinter"
                      || (pet.personality.energy + pet.personality.playfulness > 0.92));
    if (canReverse) {
        steps.push({ kind: "act", label: "Whirling around!", states: ["hop", "twirl", "rotate"], faceOther: true });
        steps.push({ kind: "social", interaction: "reverse_chase", label: "Tagging " + chaser.petData.name + " back!" });
        steps.push({ kind: "travel", gait: "scamper", label: "Chasing " + chaser.petData.name + " back!", dynamic: "other_pet_chase", offsetX: 36, offsetY: -16 });
    }
    steps.push({ kind: "act", label: "Happy tumble", states: ["hop", "tumble", "twirl"], faceOther: true });
    steps.push({ kind: "pant", label: "Catching breath" });
    steps.push({ kind: "wander_apart", dist: 145, gait: "amble", label: "Trotting off happily" });

    return {
        name: "flee_tag",
        label: "Playing Tag with " + chaser.petData.name,
        reason: "Darting & zig-zagging with " + chaser.petData.name,
        otherName: chaser.petData.name,
        urgency: 0.80,
        durationMs: 62000,
        thought: "Scampering in zig-zags with " + chaser.petData.name + " in tag",
        steps: steps
    };
}

function buildReverseFleePlan(pet, counterChaser) {
    var scr = Topology.currentScreen(pet);
    var pw = pet.width || 64, ph = pet.height || 64;
    var minX = scr.x + 36, maxX = Math.max(minX, scr.x + scr.width - pw - 36);
    var minY = scr.y + (scr.topInset || 0) + 36;
    var maxY = Math.max(minY, scr.y + scr.height - (scr.bottomInset || 0) - ph - 36);
    var curGX = scr.x + pet.worldX, curGY = scr.y + pet.worldY;
    var cGX = counterChaser.screenX() + counterChaser.worldX, cGY = counterChaser.screenY() + counterChaser.worldY;
    var away = Math.atan2(curGY - cGY, curGX - cGX) + (Math.random() - 0.5) * 0.8;
    var tx = Math.max(minX, Math.min(maxX, curGX + Math.cos(away) * 260));
    var ty = Math.max(minY, Math.min(maxY, curGY + Math.sin(away) * 190));
    if (Math.hypot(tx - curGX, ty - curGY) < 120) {
        tx = curGX < (minX + maxX) * 0.5 ? Math.min(maxX, curGX + 250) : Math.max(minX, curGX - 250);
    }
    return {
        name: "reverse_tag",
        label: "Dodging " + counterChaser.petData.name + "!",
        reason: counterChaser.petData.name + " turned the chase around!",
        otherName: counterChaser.petData.name,
        urgency: 0.82,
        durationMs: 42000,
        thought: counterChaser.petData.name + " tagged back — darting away!",
        steps: [
            { kind: "travel", gait: "scamper", label: "Darting away!", gx: tx, gy: ty },
            { kind: "act", label: "Playful spin", states: SpeciesProfile.dodgeMovesFor(pet), faceOther: true },
            { kind: "pant", label: "Catching breath" },
            { kind: "wander_apart", dist: 150, gait: "amble", label: "Parting ways" }
        ]
    };
}

function buildShowOffPlan(pet, other) {
    var moves = SpeciesProfile.showOffMovesFor(pet);
    return {
        name: "show_off",
        label: "Showing Off near " + other.name,
        reason: "Performing signature flair near " + other.name,
        otherName: other.name,
        urgency: 0.62,
        durationMs: 36000,
        thought: "Showing off a neat trick near " + other.name,
        steps: [
            { kind: "act", label: "Flair move!", states: moves, faceOther: true },
            { kind: "social", interaction: "show_off", label: "Looking to see " + other.name + "'s reaction" },
            { kind: "act", label: "Encore spin", states: moves.concat(["rotate", "hop"]), faceOther: true },
            { kind: "wander_apart", dist: 135, gait: "amble", label: "Sauntering onward" }
        ]
    };
}

function buildSyncDancePlan(pet, partnerName) {
    var moves = SpeciesProfile.showOffMovesFor(pet).concat(SpeciesProfile.affectionGesturesFor(pet));
    return {
        name: "sync_dance",
        label: "Dancing with " + partnerName,
        reason: "Synchronized joyful duet with " + partnerName,
        otherName: partnerName,
        urgency: 0.72,
        durationMs: 36000,
        thought: "Dancing in sync with " + partnerName,
        steps: [
            { kind: "act", label: "Synchronized spin", states: moves, faceOther: true, emote: "note" },
            { kind: "act", label: "Joyful hop", states: ["twirl", "dance", "hop", "rotate"], faceOther: true },
            { kind: "wander_apart", dist: 140, gait: "amble", label: "Parting cheerfully" }
        ]
    };
}

function buildSquabblePlan(pet, other) {
    var bristle = SpeciesProfile.standoffMovesFor(pet);
    return {
        name: "squabble",
        label: "Bickering with " + other.name,
        reason: "Disagreement over personal space with " + other.name,
        otherName: other.name,
        urgency: 0.74,
        durationMs: 32000,
        thought: "Bristled at " + other.name + " over personal space",
        steps: [
            { kind: "act", label: "Bristling!", states: bristle, faceOther: true },
            { kind: "social", interaction: "squabble", label: "Confronting " + other.name },
            { kind: "observe", durationMs: 1200, attend: "other", label: "Tense standoff" },
            { kind: "face_away", label: "Turning away in a huff" },
            { kind: "wander_apart", dist: 185, gait: "trot", label: "Stalking off" }
        ]
    };
}

function buildSquabbleReplyPlan(pet, instigator) {
    var iName = instigator.petData.name;
    var bristle = SpeciesProfile.standoffMovesFor(pet);
    return {
        name: "squabble_reply",
        label: "Standing Ground vs " + iName,
        reason: "Refusing to back down from " + iName,
        otherName: iName,
        urgency: 0.76,
        durationMs: 30000,
        thought: "Stood ground and huffed right back at " + iName,
        steps: [
            { kind: "act", label: "Standing ground!", states: bristle, faceOther: true },
            { kind: "face_away", label: "Huffing away" },
            { kind: "wander_apart", dist: 185, gait: "trot", label: "Taking own corner" }
        ]
    };
}

function buildPeacekeeperPlan(pet, petA, petB) {
    var midGX = (petA.screenX() + petA.worldX + petB.screenX() + petB.worldX) * 0.5;
    var midGY = (petA.screenY() + petA.worldY + petB.screenY() + petB.worldY) * 0.5;
    var pt = _clampedScreenPoint(pet, midGX, midGY);
    var calmAuth = SpeciesProfile.standoffMovesFor(pet).concat(SpeciesProfile.calmGesturesFor(pet));
    return {
        name: "peacekeeper",
        label: "Calming Squabble",
        reason: "Stepping between " + petA.petData.name + " & " + petB.petData.name,
        otherName: petA.petData.name,
        secondOtherName: petB.petData.name,
        urgency: 0.82,
        durationMs: 38000,
        thought: "Stepping in to calm " + petA.petData.name + " and " + petB.petData.name,
        steps: [
            { kind: "travel", gait: "trot", label: "Stepping between them", gx: pt.gx, gy: pt.gy },
            { kind: "act", label: "Commanding calm", states: calmAuth, faceOther: true },
            { kind: "social", interaction: "mediate", label: "Restoring peace" },
            { kind: "act", label: "Reassuring nod", states: SpeciesProfile.calmGesturesFor(pet) },
            { kind: "wander_apart", dist: 135, gait: "amble", label: "Resuming watch" }
        ]
    };
}

function buildSpectatePlan(pet, actorA) {
    var aName = actorA.petData.name;
    return {
        name: "spectate_bout",
        label: "Watching " + aName + "'s Match",
        reason: "Watching companions spar from nearby",
        otherName: aName,
        urgency: 0.56,
        durationMs: 24000,
        thought: "Paused to watch " + aName + "'s match",
        steps: [
            { kind: "observe", durationMs: 3600, attend: "other", label: "Watching match" },
            { kind: "act", label: "Impressed nod", states: SpeciesProfile.calmGesturesFor(pet).concat(["hop"]), faceOther: true }
        ]
    };
}

function buildPackRallyPlan(pet, leader) {
    var lName = leader.petData.name;
    return {
        name: "pack_rally",
        label: "Joining " + lName + "'s Play!",
        reason: "Swept up in contagious pack energy",
        otherName: lName,
        urgency: 0.74,
        durationMs: 28000,
        thought: "Joined in the contagious zoomies with " + lName + "!",
        steps: [
            { kind: "act", label: "Perking up!", states: ["hop", "twirl", "rotate"], faceOther: true },
            { kind: "zoomies", label: "Pack zoomies!" },
            { kind: "pant", label: "Catching breath" },
            { kind: "wander_apart", dist: 140, gait: "amble", label: "Settling down" }
        ]
    };
}

function buildBestFriendVisitPlan(pet, other) {
    var myGX = pet.screenX() + pet.worldX, myGY = pet.screenY() + pet.worldY;
    var midX = myGX + (other.gx - myGX) * 0.55 + (Math.random() - 0.5) * 90;
    var midY = myGY + (other.gy - myGY) * 0.55 + (Math.random() - 0.5) * 70;
    var midPt = _clampedScreenPoint(pet, midX, midY);
    var off = other.pet ? _naturalOffsetFrom(pet, other.pet, 76) : { offsetX: 68, offsetY: 20 };
    var steps = [];
    if (other.dist > 420) {
        steps.push({ kind: "travel", gait: "trot", label: "Strolling toward " + other.name, gx: midPt.gx, gy: midPt.gy });
        steps.push({ kind: "act", label: "Glancing ahead", states: SpeciesProfile.calmGesturesFor(pet), faceOther: true });
    }
    steps.push({ kind: "travel", gait: "trot", label: "Joining " + other.name, dynamic: "other_pet", offsetX: off.offsetX, offsetY: off.offsetY });
    steps.push({ kind: "social", label: "Warm greeting", interaction: "greet" });
    steps.push({ kind: "act", label: "Happy greeting", states: SpeciesProfile.affectionGesturesFor(pet).concat(["hop"]), faceOther: true });
    if (pet.restDrive > 0.34) {
        steps.push({ kind: "social", label: "Curling up nearby", interaction: "rest" });
        steps.push({ kind: "rest", label: "Resting near " + other.name, deep: pet.restDrive > 0.68, faceOther: true });
    } else {
        steps.push({ kind: "wander_apart", dist: 145, gait: "amble", label: "Continuing stroll" });
    }
    return {
        name: "best_friend_checkin",
        label: "Checking In on " + other.name,
        reason: "Checking in on best friend " + other.name,
        otherName: other.name,
        urgency: 0.58,
        durationMs: 95000,
        thought: "Strolled over to check in on best friend " + other.name,
        steps: steps
    };
}

function buildForagePlan(perc) {
    var pw = perc.petW || 64, ph = perc.petH || 64;
    var minX = perc.screen.x + 28;
    var maxX = Math.max(minX, perc.screen.x + perc.screen.w - pw - 28);
    var minY = perc.screen.y + (perc.screen.topInset || 0) + 28;
    var maxY = Math.max(minY, perc.screen.y + perc.screen.h - (perc.screen.bottomInset || 0) - ph - 24);
    var angle = Math.random() * Math.PI * 2;
    var dist = 110 + Math.random() * 160;
    var tx = Topology.clamp(perc.petGX + Math.cos(angle) * dist, minX, maxX);
    var ty = Topology.clamp(perc.petGY + Math.sin(angle) * dist, minY, maxY);
    return {
        name: "forage_snack",
        label: "Foraging a Berry",
        reason: "Sniffing out a small snack",
        urgency: 0.56,
        durationMs: 65000,
        thought: "Sniffed out a berry and had a quiet snack",
        steps: [
            { kind: "travel", gait: "amble", label: "Sniffing around", gx: tx, gy: ty },
            { kind: "act", label: "Found a berry", states: ["nod"] },
            { kind: "act", label: "Nibbling berry", states: ["eat"] }
        ]
    };
}

function buildRestPlan(pet, perc, goHomeFirst, sanctuarySpot, deep) {
    var steps = [];
    var label = deep ? "Curling Up to Sleep" : "Settling Down to Loaf";
    var reason = perc.isNight ? "Sleeping through the night" : (deep ? "Deep nap" : "Relaxing on its belly");
    if (sanctuarySpot) {
        label = "Resting in Favorite Spot";
        reason = "Resting in favorite cozy spot";
        steps.push({ kind: "travel", gait: "amble", label: "Padding to favorite spot", gx: sanctuarySpot.gx, gy: sanctuarySpot.gy });
    } else if (goHomeFirst) {
        steps.push({ kind: "travel", gait: "amble", label: "Walking home to rest", gx: pet.homeGX, gy: pet.homeGY });
    }
    steps.push({ kind: "act", label: "Circling spot", states: SpeciesProfile.settleGesturesFor(pet) });
    steps.push({ kind: "rest", label: deep ? "Deep sleep" : "Loafing", deep: deep, sanctuary: !!sanctuarySpot });
    return {
        name: goHomeFirst ? "go_home_rest" : "rest",
        label: label,
        reason: reason,
        urgency: Math.max(pet.restDrive, pet.comfortDrive),
        durationMs: 240000,
        thought: deep ? "Curling up to sleep" : "Lying down to rest comfortably",
        steps: steps
    };
}

function buildIllusionPrankPlan(other) {
    var targetSp = (other && other.pet && other.pet.petData) ? other.pet.petData.sprite : "";
    return {
        name: "illusion_prank",
        label: "Illusion Prank on " + other.name,
        reason: "Morphing into " + other.name + "'s form with Illusion",
        otherName: other.name,
        urgency: 0.64,
        durationMs: 42000,
        thought: "Weaving a playful Illusion to surprise " + other.name,
        steps: [
            { kind: "illusion_shift", targetSpecies: targetSp, label: "Weaving Illusion" },
            { kind: "dash_relative", maneuver: "approach_angled", gait: "trot", radius: 74, label: "Padding up in disguise" },
            { kind: "social", label: "Surprising " + other.name, interaction: "illusion" },
            { kind: "act", label: "Playful spin", states: ["hop", "rotate"], faceOther: true },
            { kind: "illusion_clear", label: "Dropping Illusion" },
            { kind: "wander_apart", dist: 145, gait: "trot", label: "Scampering off" }
        ]
    };
}

function buildRetirePlan(pet, perc) {
    var pw = perc.petW || 64;
    var sleepy = pet.restDrive >= 0.42;
    var nearLeft = (perc.petGX - perc.screen.x) < perc.screen.w * 0.5;
    var edgeX = nearLeft ? (perc.screen.x + 8) : Math.max(perc.screen.x + 8, perc.screen.x + perc.screen.w - pw - 8);
    var edgeY = Topology.clamp(perc.petGY, perc.screen.y + (perc.screen.topInset || 0) + 24,
                               Math.max(perc.screen.y + 24, perc.screen.y + perc.screen.h - (perc.screen.bottomInset || 0) - 80));
    return {
        name: "retire_to_pen",
        label: sleepy ? "Heading Off to Rest" : "Sanctuary Stroll",
        reason: sleepy ? "Padding off-screen for a Sanctuary nap" : "Wandering off into the Sanctuary pasture",
        urgency: 0.82,
        durationMs: 55000,
        thought: sleepy ? "Padding off-screen to rest in the Sanctuary" : "Trotting off for a break in the Sanctuary",
        steps: [
            { kind: "travel", gait: sleepy ? "amble" : "trot", label: "Walking toward Sanctuary", gx: edgeX, gy: edgeY },
            { kind: "act", label: sleepy ? "Yawning goodnight" : "Waving goodbye", states: sleepy ? SpeciesProfile.settleGesturesFor(pet) : SpeciesProfile.greetGesturesFor(pet), emote: sleepy ? "sleepy" : undefined },
            { kind: "retire_finish", label: "Entered Sanctuary" }
        ]
    };
}

function buildArrivePlan(pet, perc, fromLeft) {
    var pw = (perc && perc.petW) ? perc.petW : 64;
    var steps = [];
    if (perc && perc.screen) {
        var enterLeft = fromLeft !== undefined ? fromLeft : ((perc.petGX - perc.screen.x) < perc.screen.w * 0.5);
        var strollDist = 110 + Math.random() * 140;
        var strollX = enterLeft
            ? Math.min(perc.screen.x + perc.screen.w - pw - 24, perc.screen.x + strollDist)
            : Math.max(perc.screen.x + 24, perc.screen.x + perc.screen.w - pw - strollDist);
        var strollY = Topology.clamp(perc.petGY, perc.screen.y + (perc.screen.topInset || 0) + 32,
                                     Math.max(perc.screen.y + 32, perc.screen.y + perc.screen.h - (perc.screen.bottomInset || 0) - 80));
        steps.push({ kind: "travel", gait: "trot", label: "Strolling in from Sanctuary", gx: strollX, gy: strollY });
    }
    steps.push({
        kind: "act",
        label: "Stretching hello",
        states: [SpeciesProfile.wakeStateFor(pet)]
    });
    return {
        name: "arrive_from_pen",
        label: "Stepping Out to Roam",
        reason: "Freshly rested from the Sanctuary",
        urgency: 0.65,
        durationMs: 24000,
        thought: "Strolled back onto the desktop refreshed",
        steps: steps
    };
}

function buildSneakBoopPlan(pet, other) {
    return {
        name: "sneak_boop",
        label: "Sneaking Up on " + other.name,
        reason: "Creeping up behind " + other.name + " while unobserved",
        otherName: other.name,
        urgency: 0.66,
        durationMs: 52000,
        thought: "Creeping quietly toward " + other.name + " whenever they look away",
        steps: [
            { kind: "stalk_step", boopRadius: 68, label: "Creeping softly" },
            { kind: "act", label: "Quick boop!", states: ["hop", "lick", "nod"], faceOther: true },
            { kind: "social", interaction: "sneak_boop", label: "Surprising " + other.name },
            { kind: "wander_apart", dist: 195, gait: "scamper", label: "Scampering away!" }
        ]
    };
}

function buildMentorPatrolPlan(pet, perc, followerName) {
    var pw = perc.petW || 64, ph = perc.petH || 64;
    var minX = perc.screen.x + 36, maxX = Math.max(minX, perc.screen.x + perc.screen.w - pw - 36);
    var minY = perc.screen.y + (perc.screen.topInset || 0) + 36;
    var maxY = Math.max(minY, perc.screen.y + perc.screen.h - (perc.screen.bottomInset || 0) - ph - 36);
    var goRight = perc.petGX < (minX + maxX) * 0.5;
    var leg1X = Topology.clamp(perc.petGX + (goRight ? 220 : -220), minX, maxX);
    var leg1Y = Topology.clamp(perc.petGY + (Math.random() - 0.5) * 120, minY, maxY);
    var leg2X = Topology.clamp(leg1X + (goRight ? 160 : -160), minX, maxX);
    var leg2Y = Topology.clamp(leg1Y + (Math.random() - 0.5) * 110, minY, maxY);
    var steps = [];
    if (followerName) {
        steps.push({ kind: "social", interaction: "mentor_invite", label: "Leading quiet patrol" });
    }
    steps.push({ kind: "travel", gait: "amble", label: "Strolling calm patrol", gx: leg1X, gy: leg1Y });
    steps.push({ kind: "act", label: "Surveying desktop", states: ["pose", "nod"] });
    steps.push({ kind: "travel", gait: "amble", label: "Continuing patrol", gx: leg2X, gy: leg2Y });
    steps.push({ kind: "act", label: "Unhurried stretch", states: [SpeciesProfile.wakeStateFor(pet), "nod"] });
    return {
        name: "mentor_patrol",
        label: "Quiet Patrol",
        reason: followerName ? ("Calm patrol with " + followerName + " trailing along") : "Unhurried perimeter stroll",
        otherName: followerName || "",
        urgency: 0.52,
        durationMs: 75000,
        thought: followerName ? ("Taking an unhurried patrol while " + followerName + " tags along") : "Taking a calm patrol across the workspace",
        steps: steps
    };
}

function buildCopycatTrailPlan(pet, leader) {
    var lName = leader.petData.name;
    return {
        name: "copycat_trail",
        label: "Trailing " + lName,
        reason: "Following along behind " + lName + " and copying moves",
        otherName: lName,
        urgency: 0.64,
        durationMs: 75000,
        thought: "Padding along behind " + lName + " and copying their stance",
        steps: [
            { kind: "trail_leader", maxLegs: 2, label: "Padding behind " + lName },
            { kind: "observe", durationMs: 1600, attend: "other", label: "Watching " + lName },
            { kind: "act", label: "Copying stretch", states: [SpeciesProfile.wakeStateFor(pet), "nod"], faceOther: true }
        ]
    };
}

function buildWelcomeFriendPlan(pet, arrivingPet) {
    var aName = arrivingPet.petData.name;
    var aGX = arrivingPet.screenX() + arrivingPet.worldX;
    var aGY = arrivingPet.screenY() + arrivingPet.worldY;
    var myGX = pet.screenX() + pet.worldX;
    var myGY = pet.screenY() + pet.worldY;
    var meetPt = _clampedScreenPoint(pet, myGX + (aGX - myGX) * 0.58, myGY + (aGY - myGY) * 0.58);
    return {
        name: "welcome_friend",
        label: "Welcoming " + aName,
        reason: "Trotting over to greet " + aName + " returning from the Sanctuary",
        otherName: aName,
        urgency: 0.66,
        durationMs: 42000,
        thought: "Perked up to welcome " + aName + " back onto the desktop",
        steps: [
            { kind: "travel", gait: "trot", label: "Trotting to greet " + aName, gx: meetPt.gx, gy: meetPt.gy },
            { kind: "social", interaction: "greet", label: "Welcoming " + aName },
            { kind: "act", label: "Warm greeting", states: SpeciesProfile.greetGesturesFor(pet).concat(["hop"]), faceOther: true },
            { kind: "wander_apart", dist: 120, gait: "amble", label: "Walking inward together" }
        ]
    };
}

function buildJointRetirePlan(pet, partner, perc, isFollower) {
    var pw = perc.petW || 64;
    var pName = partner && partner.petData ? partner.petData.name : "";
    var nearLeft = (perc.petGX - perc.screen.x) < perc.screen.w * 0.5;
    if (isFollower && partner) {
        nearLeft = ((partner.screenX() + partner.worldX) - perc.screen.x) < perc.screen.w * 0.5;
    }
    var edgeX = nearLeft ? (perc.screen.x + 8) : Math.max(perc.screen.x + 8, perc.screen.x + perc.screen.w - pw - 8);
    var baseY = partner && isFollower ? (partner.screenY() + partner.worldY + 38) : perc.petGY;
    var edgeY = Topology.clamp(baseY, perc.screen.y + (perc.screen.topInset || 0) + 24,
                               Math.max(perc.screen.y + 24, perc.screen.y + perc.screen.h - (perc.screen.bottomInset || 0) - 80));
    return {
        name: "joint_retire",
        label: pName ? ("Heading to Sanctuary with " + pName) : "Heading Off to Rest",
        reason: pName ? ("Strolling side-by-side into the Sanctuary with " + pName) : "Padding off-screen to rest",
        otherName: pName,
        urgency: 0.84,
        durationMs: 55000,
        thought: pName ? ("Walking back to the Sanctuary side-by-side with " + pName) : "Padding off-screen to rest",
        steps: [
            { kind: "travel", gait: "amble", label: "Walking side-by-side to Sanctuary", gx: edgeX, gy: edgeY },
            { kind: "act", label: "Sleepy nod", states: SpeciesProfile.settleGesturesFor(pet), faceOther: !!pName },
            { kind: "retire_finish", label: "Entered Sanctuary" }
        ]
    };
}

function buildGuardianCheckPlan(pet, gx, gy, sourceLabel) {
    var myGX = pet.screenX() + pet.worldX, myGY = pet.screenY() + pet.worldY;
    var toEvt = Math.atan2(gy - myGY, gx - myGX);
    var stepDist = Math.min(105, Math.max(42, Math.hypot(gx - myGX, gy - myGY) * 0.45));
    var checkPt = _clampedScreenPoint(pet, myGX + Math.cos(toEvt) * stepDist, myGY + Math.sin(toEvt) * stepDist);
    return {
        name: "guardian_check",
        label: "Checking Disturbance",
        reason: "Stepping forward calmly to inspect " + (sourceLabel || "sudden alert"),
        urgency: 0.72,
        durationMs: 28000,
        thought: "Stepped forward calmly to make sure everything is safe",
        steps: [
            { kind: "travel", gait: "trot", label: "Stepping forward", gx: checkPt.gx, gy: checkPt.gy },
            { kind: "act", label: "Alert stance", states: ["pose", "nod"], facePoint: { gx: gx, gy: gy } },
            { kind: "observe", durationMs: 3200, facePoint: { gx: gx, gy: gy }, label: "Checking area" },
            { kind: "act", label: "All clear nod", states: ["nod"] }
        ]
    };
}

function buildTimidHideBehindPlan(pet, guardian, threatGX, threatGY) {
    var gName = guardian.petData.name;
    var gGX = guardian.screenX() + guardian.worldX;
    var gGY = guardian.screenY() + guardian.worldY;
    var awayAng = Math.atan2(gGY - threatGY, gGX - threatGX);
    var hidePt = _clampedScreenPoint(pet, gGX + Math.cos(awayAng) * 62, gGY + Math.sin(awayAng) * 48);
    return {
        name: "timid_hide",
        label: "Tucking Behind " + gName,
        reason: "Startled — scooting behind " + gName + " for reassurance",
        otherName: gName,
        urgency: 0.76,
        durationMs: 26000,
        thought: "Startled and scooted safely behind " + gName,
        steps: [
            { kind: "travel", gait: "scamper", label: "Scooting behind " + gName, gx: hidePt.gx, gy: hidePt.gy },
            { kind: "act", label: "Peeking out", states: ["cringe", "nod"], facePoint: { gx: threatGX, gy: threatGY } },
            { kind: "observe", durationMs: 2800, attend: "other", label: "Catching breath behind " + gName }
        ]
    };
}

function buildLedgeStrollPlan(perch, pet) {
    var cls = perch.cls || "window";
    var goRight = Math.random() < 0.5;
    var startGX = goRight ? perch.leftGX : perch.rightGX;
    var cornerGX = goRight ? perch.rightGX : perch.leftGX;
    var cornerDirRow = goRight ? 1 : 7;
    return {
        name: "ledge_stroll",
        label: "Strolling " + cls + " Ledge",
        reason: "Walking along " + cls + "'s titlebar and peering over the corner",
        windowClass: cls,
        windowAddr: perch.address,
        urgency: 0.50,
        durationMs: 180000,
        thought: "Strolled along " + cls + "'s top ledge and peered down over the corner",
        steps: [
            { kind: "travel", gait: "trot", label: "Hopping onto " + cls, gx: startGX, gy: perch.gy },
            { kind: "perch", windowAddr: perch.address, durationMs: 7500, label: "Settling on ledge" },
            { kind: "travel", gait: "amble", label: "Strolling across titlebar", gx: cornerGX, gy: perch.gy },
            { kind: "perch", windowAddr: perch.address, dirRow: cornerDirRow, durationMs: 28000 + Math.random() * 24000, label: "Peering over corner" }
        ]
    };
}

function buildLedgeParkourPlan(fromPerch, jumpInfo, pet) {
    var fromCls = fromPerch.cls || "window";
    var toPerch = jumpInfo.perch;
    var toCls = toPerch.cls || "window";
    return {
        name: "ledge_parkour",
        label: "Ledge Hop to " + toCls,
        reason: "Vaulting across from " + fromCls + " onto " + toCls + "'s ledge",
        windowClass: toCls,
        windowAddr: toPerch.address,
        urgency: 0.56,
        durationMs: 180000,
        thought: "Leapt cleanly from " + fromCls + " across to " + toCls + "'s top ledge",
        steps: [
            { kind: "travel", gait: "trot", label: "Trotting to " + fromCls + " edge", gx: jumpInfo.fromGX, gy: fromPerch.gy },
            { kind: "perch", windowAddr: fromPerch.address, durationMs: 2400, label: "Sizing up the gap" },
            { kind: "act", label: "Coiling to leap", states: ["nod"], facePoint: { gx: jumpInfo.toGX, gy: jumpInfo.toGY } },
            { kind: "jump_to", gx: jumpInfo.toGX, gy: jumpInfo.toGY, arcBoost: 38, label: "Leaping across ledges!" },
            { kind: "perch", windowAddr: toPerch.address, durationMs: 36000 + Math.random() * 28000, label: "Perched on " + toCls }
        ]
    };
}

function buildSeamPeekPlan(seamInfo, shouldCross, pet) {
    var steps = [
        { kind: "travel", gait: "amble", label: "Walking to display edge", gx: seamInfo.standGX, gy: seamInfo.standGY },
        { kind: "observe", durationMs: 3800, facePoint: { gx: seamInfo.lookGX, gy: seamInfo.lookGY }, label: "Peering into " + seamInfo.screenName },
        { kind: "act", label: "Curious head-tilt", states: ["nod"], facePoint: { gx: seamInfo.lookGX, gy: seamInfo.lookGY } }
    ];
    if (shouldCross) {
        steps.push({ kind: "travel", gait: "trot", label: "Crossing into " + seamInfo.screenName, gx: seamInfo.crossGX, gy: seamInfo.crossGY });
        steps.push({ kind: "observe", durationMs: 6500, label: "Looking around " + seamInfo.screenName });
    }
    return {
        name: "seam_peek",
        label: shouldCross ? ("Crossing to " + seamInfo.screenName) : ("Peering into " + seamInfo.screenName),
        reason: "Gazing across the monitor seam toward " + seamInfo.screenName,
        otherScreen: !!shouldCross,
        urgency: 0.48,
        durationMs: 75000,
        thought: shouldCross
            ? ("Peered across the seam and trotted over into " + seamInfo.screenName)
            : ("Paused at the monitor edge peering curiously into " + seamInfo.screenName),
        steps: steps
    };
}

function buildZoomieStumblePlan(pet, nearestName) {
    var steps = [
        { kind: "act", label: "Tripped mid-sprint!", states: ["trip", "hitGround"] },
        { kind: "act", label: "Catching balance", states: ["lostBalance", "cringe"] },
        { kind: "act", label: "Shaking it off", states: ["shake", "rotate"] }
    ];
    if (nearestName) {
        steps.push({ kind: "act", label: "Checking if anyone saw", states: ["nod"], faceOther: true });
    }
    return {
        name: "zoomie_stumble",
        label: "Shaking Off a Tumble",
        reason: "Cornered too fast mid-zoomie and shook it off",
        otherName: nearestName || "",
        urgency: 0.86,
        durationMs: 18000,
        thought: nearestName
            ? ("Tripped mid-zoomie, shook it off, and glanced at " + nearestName + " like nothing happened")
            : "Tripped over own paws mid-zoomie and shook it right off",
        steps: steps
    };
}

function _findPet(pet, name) {
    if (!name || !pet.petManager || !pet.petManager.pets) return null;
    var all = pet.petManager.pets;
    for (var i = 0; i < all.length; i++) {
        if (all[i] !== pet && all[i].petData.name === name) return all[i];
    }
    return null;
}

function _distBetween(a, b) {
    return Math.hypot(
        (b.screenX() + b.worldX) - (a.screenX() + a.worldX),
        (b.screenY() + b.worldY) - (a.screenY() + a.worldY)
    );
}

function _faceGlobal(pet, gx, gy) {
    var dx = gx - (pet.screenX() + pet.worldX);
    var dy = gy - (pet.screenY() + pet.worldY);
    pet.facingRight = dx >= 0;
    pet.sprite.setDirection(Math.atan2(dy, dx));
}
