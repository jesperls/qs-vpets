.import "../SpeciesProfile.js" as SpeciesProfile
.import "Personality.js" as Personality
.import "Drives.js" as Drives
.import "Memory.js" as Memory
.import "Social.js" as Social
.import "Topology.js" as Topology

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
        windowClass: plan.windowClass || "",
        windowAddr: plan.windowAddr || "",
        watchMode: plan.watchMode || "",
        otherScreen: !!plan.otherScreen,
        waitingForBid: false,
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
                gx = targetPet.screenX() + targetPet.worldX + (step.offsetX !== undefined ? step.offsetX : 54);
                gy = targetPet.screenY() + targetPet.worldY + (step.offsetY || 0);
            }
        }
        nav.journeyToGlobal(pet, gx, gy);
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
        pet.perchedWindowAddr = plan.windowAddr || "";
        if (step.emote && pet.emitEmote) pet.emitEmote(step.emote);
        pet.enterState("perch");
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
        if (friend && _distBetween(pet, friend) < 300) {
            _faceGlobal(pet, friend.screenX() + friend.worldX, friend.screenY() + friend.worldY);
            if (step.interaction === "greet") Social.greet(pet, friend);
            else if (step.interaction === "invite") Social.invitePlay(pet, friend);
            else if (step.interaction === "chase") Social.startChase(pet, friend);
            else if (step.interaction === "groove") Social.syncGroove(pet, friend);
            else if (step.interaction === "story") Social.shareDiscovery(pet, friend, step.topic);
            else if (step.interaction === "rest") Social.restBeside(pet, friend);
            else if (step.interaction === "pounce") Social.pounce(pet, friend);
            else if (step.interaction === "illusion") Social.illusionSurprise(pet, friend);
        }
        advanceStep(pet, nav, pickFn);
        return;
    }

    case "illusion_shift": {
        var sinkChoice = pickFn ? pickFn(pet, ["sink", "rotate"]) : "sink";
        pet.enterState(sinkChoice);
        pet.illusionSpecies = step.targetSpecies || "";
        pet.illusionUntil = _now(pet) + 22000;
        return;
    }

    case "illusion_clear": {
        pet.illusionSpecies = "";
        pet.illusionUntil = 0;
        var clearChoice = pickFn ? pickFn(pet, ["rotate", "hop"]) : "rotate";
        pet.enterState(clearChoice);
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
        pet.exploreDrive = Math.max(0, pet.exploreDrive - 0.25);
        Drives.happier(pet, 0.02);
        if (plan.windowClass) Memory.recordWindowPref(pet, plan.windowClass, 0.03);
        Memory.recordEpisode(pet, "perched_window", {
            valence: 0.3,
            windowClass: plan.windowClass
        });
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
    if (pet.emitEmote) pet.emitEmote("♥", true);
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
        if (pet.emitEmote) pet.emitEmote("...");
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
        { kind: "vocal", label: "Calling for attention", excited: false, faceCursor: true, emote: hungry ? "🍎" : "?" },
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
            { kind: "act", label: "Play-crouching", states: ["nod"], facePoint: { gx: gx, gy: gy }, emote: "!" },
            { kind: "travel", gait: "scamper", label: "Scampering after cursor", dynamic: "cursor", offsetX: 0, offsetY: 0 },
            { kind: "act", label: "Playful pounce", states: ["hop"], faceCursor: true }
        ]
    };
}

function buildMusicGroovePlan(perc, friendName, pet) {
    var track = perc.mediaTitle ? ("\"" + perc.mediaTitle.slice(0, 26) + "\"") : "music";
    var swayStates = SpeciesProfile.affectionGesturesFor(pet);
    var steps = [
        { kind: "act", label: "Swaying to music", states: swayStates, emote: "♪" }
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
    return {
        name: "share_story",
        label: "Visiting " + other.name,
        reason: "Checking in with " + other.name,
        otherName: other.name,
        urgency: 0.55,
        durationMs: 120000,
        thought: "Trotted over to greet " + other.name,
        steps: [
            { kind: "travel", gait: "trot", label: "Trotting to " + other.name, dynamic: "other_pet", offsetX: 56, offsetY: 0 },
            { kind: "social", label: "Greeting", interaction: "story", topic: topic },
            { kind: "act", label: "Nose sniff", states: SpeciesProfile.greetGesturesFor(pet), faceOther: true }
        ]
    };
}

function buildPlayTagPlan(other, closeAlready) {
    var steps = [];
    if (!closeAlready) {
        steps.push({ kind: "travel", gait: "trot", label: "Trotting up to " + other.name, dynamic: "other_pet", offsetX: 54, offsetY: 0 });
    }
    steps.push({ kind: "act", label: "Play-bowing", states: ["nod"], faceOther: true });
    steps.push({ kind: "social", label: "Tagging " + other.name, interaction: "chase" });
    steps.push({ kind: "travel", gait: "scamper", label: "Chasing " + other.name, dynamic: "other_pet_chase", offsetX: -38, offsetY: 0 });
    steps.push({ kind: "act", label: "Playful pounce", states: ["hop"], faceOther: true });
    steps.push({ kind: "pant", label: "Catching breath" });
    steps.push({ kind: "loaf_watch", label: "Resting together", attend: "other", durationMs: 18000 });
    return {
        name: "play_tag",
        label: "Playing Tag with " + other.name,
        reason: "Playful chase with " + other.name,
        otherName: other.name,
        urgency: 0.78,
        durationMs: 75000,
        thought: "Chasing " + other.name + " in a game of tag",
        steps: steps
    };
}

function buildFleeTagPlan(pet, chaser) {
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

    return {
        name: "flee_tag",
        label: "Darting from " + chaser.petData.name,
        reason: "Playfully dodging " + chaser.petData.name,
        otherName: chaser.petData.name,
        urgency: 0.80,
        durationMs: 55000,
        thought: "Scampering away from " + chaser.petData.name + " in tag",
        steps: [
            { kind: "travel", gait: "scamper", label: "Scampering!", gx: leg1X, gy: leg1Y },
            { kind: "travel", gait: "scamper", label: "Dodging!", gx: leg2X, gy: leg2Y },
            { kind: "act", label: "Playful hop", states: ["hop"], faceOther: true },
            { kind: "pant", label: "Catching breath" }
        ]
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
            { kind: "travel", gait: "trot", label: "Padding up in disguise", dynamic: "other_pet", offsetX: 52, offsetY: 0 },
            { kind: "social", label: "Surprising " + other.name, interaction: "illusion" },
            { kind: "act", label: "Playful spin", states: ["hop", "rotate"], faceOther: true },
            { kind: "illusion_clear", label: "Dropping Illusion" }
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
            { kind: "act", label: sleepy ? "Yawning goodnight" : "Waving goodbye", states: sleepy ? SpeciesProfile.settleGesturesFor(pet) : SpeciesProfile.greetGesturesFor(pet), emote: sleepy ? "💤" : undefined },
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
