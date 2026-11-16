.pragma library

.import "../SpeciesProfile.js" as SpeciesProfile
.import "Topology.js" as Topology
.import "Util.js" as Util

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

function _mountLedgeSteps(pet, perch, landGX, cls) {
    if (pet && pet.perchedWindowAddr === perch.address) {
        return [{ kind: "travel", gait: "amble", label: "Stepping along " + cls, gx: landGX, gy: perch.gy }];
    }
    if (pet) {
        var curGX = Util.petGX(pet), curGY = Util.petGY(pet);
        var steps = [];
        var below = curGY >= perch.gy;
        var launchX = Util.clamp(curGX, landGX - 28, landGX + 28);
        var launchY = below ? Math.min(curGY, perch.gy + 92) : Math.max(curGY, perch.gy - 58);
        var launchPt = Util.clampToScreen(pet, launchX, launchY, 12, 12);
        var walkDist = Math.hypot(launchPt.gx - curGX, launchPt.gy - curGY);
        var hopDist = Math.hypot(landGX - launchPt.gx, perch.gy - launchPt.gy);
        if (hopDist <= 30) {
            return [{ kind: "travel", gait: "trot", label: "Stepping onto " + cls, gx: landGX, gy: perch.gy }];
        }
        if (walkDist > 24) {
            steps.push({ kind: "travel", gait: "trot", label: "Trotting up to " + cls, gx: launchPt.gx, gy: launchPt.gy });
        }
        steps.push({ kind: "act", label: "Sizing up " + cls + " ledge", states: ["nod", "pose"], facePoint: { gx: landGX, gy: perch.gy } });
        steps.push({ kind: "jump_to", gx: landGX, gy: perch.gy, windowAddr: perch.address, arcBoost: below ? 18 : 12, label: "Hopping onto " + cls });
        return steps;
    }
    return [{ kind: "travel", gait: "trot", label: "Heading to " + cls + " ledge", gx: landGX, gy: perch.gy }];
}

function buildWindowPerchPlan(perch, pet) {
    var cls = perch.cls || "window";
    var left = perch.leftGX !== undefined ? perch.leftGX : (perch.x + 16);
    var span = perch.spanW !== undefined ? perch.spanW : Math.max(0, perch.w - ((pet && pet.width) || 64) - 32);
    var inset = Math.min(48, span * 0.18);
    var px = left + inset + Math.random() * Math.max(0, span - inset * 2);
    var steps = _mountLedgeSteps(pet, perch, px, cls);
    steps.push({ kind: "perch", windowAddr: perch.address, label: "Perched on " + cls, durationMs: 45000 + Math.random() * 50000 });
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

function buildLowerLedgePerchPlan(landAddr) {
    return {
        name: "window_perch",
        label: "Perched on lower ledge",
        reason: "Dropped gracefully onto a lower window ledge",
        windowAddr: landAddr,
        urgency: 0.52,
        durationMs: 120000,
        thought: "Hopped down onto a lower ledge",
        steps: [
            { kind: "act", label: "Catching balance", states: ["hop", "shake"] },
            { kind: "perch", label: "Perched on lower ledge", windowAddr: landAddr, durationMs: 36000 + Math.random() * 35000 }
        ]
    };
}

function buildLedgeStrollPlan(perch, pet) {
    var cls = perch.cls || "window";
    var goRight = Math.random() < 0.5;
    var startGX = goRight ? perch.leftGX : perch.rightGX;
    var cornerGX = goRight ? perch.rightGX : perch.leftGX;
    var cornerDirRow = goRight ? 1 : 7;
    var steps = _mountLedgeSteps(pet, perch, startGX, cls).concat([
        { kind: "perch", windowAddr: perch.address, durationMs: 7500, label: "Settling on ledge" },
        { kind: "travel", gait: "amble", label: "Strolling across titlebar", gx: cornerGX, gy: perch.gy },
        { kind: "perch", windowAddr: perch.address, dirRow: cornerDirRow, durationMs: 28000 + Math.random() * 24000, label: "Peering over corner" }
    ]);
    return {
        name: "ledge_stroll",
        label: "Strolling " + cls + " Ledge",
        reason: "Walking along " + cls + "'s titlebar and peering over the corner",
        windowClass: cls,
        windowAddr: perch.address,
        urgency: 0.50,
        durationMs: 180000,
        thought: "Strolled along " + cls + "'s top ledge and peered down over the corner",
        steps: steps
    };
}

function buildLedgeParkourPlan(fromPerch, jumpInfo, pet) {
    var fromCls = fromPerch.cls || "window";
    var toPerch = jumpInfo.perch;
    var toCls = toPerch.cls || "window";
    var steps = _mountLedgeSteps(pet, fromPerch, jumpInfo.fromGX, fromCls).concat([
        { kind: "perch", windowAddr: fromPerch.address, durationMs: 2400, label: "Sizing up the gap" },
        { kind: "act", label: "Coiling to leap", states: ["nod"], facePoint: { gx: jumpInfo.toGX, gy: jumpInfo.toGY } },
        { kind: "jump_to", gx: jumpInfo.toGX, gy: jumpInfo.toGY, windowAddr: toPerch.address, arcBoost: 20, label: "Hopping across ledges" },
        { kind: "perch", windowAddr: toPerch.address, durationMs: 36000 + Math.random() * 28000, label: "Perched on " + toCls }
    ]);
    return {
        name: "ledge_parkour",
        label: "Ledge Hop to " + toCls,
        reason: "Vaulting across from " + fromCls + " onto " + toCls + "'s ledge",
        windowClass: toCls,
        windowAddr: toPerch.address,
        urgency: 0.56,
        durationMs: 180000,
        thought: "Leapt cleanly from " + fromCls + " across to " + toCls + "'s top ledge",
        steps: steps
    };
}

function buildScoutPlan(target, pet) {
    var dest = target.otherScreen ? (target.screenName || "another monitor") : "quiet corner";
    var sniffs = pet ? SpeciesProfile.calmGesturesFor(pet) : ["nod"];
    var hopX = target.gx + Math.round((Math.random() < 0.5 ? -1 : 1) * (75 + Math.random() * 75));
    var hopY = target.gy + Math.round((Math.random() - 0.5) * 95);
    var leg2 = pet ? Util.clampToScreen(pet, hopX, hopY) : { gx: target.gx, gy: target.gy };
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
            { kind: "act", label: "Sniffing around", states: sniffs },
            { kind: "travel", gait: "amble", label: "Exploring nearby", gx: leg2.gx, gy: leg2.gy },
            { kind: "act", label: "Checking surroundings", states: ["lookUp", "head", "nod"] },
            { kind: "observe", label: "Taking in the view", durationMs: 3600 + Math.random() * 2400 }
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
        if (pet && pet.personality && pet.personality.boldness < 0.46) {
            steps.push({ kind: "act", label: "Planting paws cautiously", states: ["pull", "cringe"], facePoint: { gx: seamInfo.lookGX, gy: seamInfo.lookGY } });
        }
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
    steps.push({ kind: "observe", label: "Listening", durationMs: 3400 });
    steps.push({ kind: "act", label: "Grooving along", states: ["dance", "twirl", "rotate"].concat(swayStates) });
    steps.push({ kind: "act", label: "Happy sway", states: swayStates });
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
    var ph = perc.petH || 64;
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

function buildRestPlan(pet, perc, goHomeFirst, sanctuarySpot, deep, sploot) {
    var steps = [];
    var useSploot = !deep && !!sploot;
    var label = deep ? "Curling Up to Sleep" : (useSploot ? "Sprawling Out Comfortably" : "Settling Down to Loaf");
    var reason = perc.isNight ? "Sleeping through the night" : (deep ? "Deep nap" : (useSploot ? "Sprawled flat in the warmth" : "Relaxing on its belly"));
    if (sanctuarySpot) {
        label = "Resting in Favorite Spot";
        reason = "Resting in favorite cozy spot";
        steps.push({ kind: "travel", gait: "amble", label: "Padding to favorite spot", gx: sanctuarySpot.gx, gy: sanctuarySpot.gy });
    } else if (goHomeFirst) {
        steps.push({ kind: "travel", gait: "amble", label: "Walking home to rest", gx: pet.homeGX, gy: pet.homeGY });
    }
    steps.push({ kind: "act", label: "Circling spot", states: SpeciesProfile.settleGesturesFor(pet) });
    steps.push({
        kind: "rest",
        label: deep ? "Deep sleep" : (useSploot ? "Sprawled out" : "Loafing"),
        deep: deep,
        postState: useSploot ? "laying" : "loaf",
        sanctuary: !!sanctuarySpot
    });
    return {
        name: goHomeFirst ? "go_home_rest" : "rest",
        label: label,
        reason: reason,
        urgency: Math.max(pet.restDrive, pet.comfortDrive),
        durationMs: 240000,
        thought: deep ? "Curling up to sleep" : (useSploot ? "Sprawling flat to soak up the warmth" : "Lying down to rest comfortably"),
        steps: steps
    };
}

function buildGoHomePlan(pet) {
    return {
        name: "go_home",
        label: "Heading Home",
        reason: "Returning to home territory",
        urgency: pet.comfortDrive,
        thought: "Padding back to home spot",
        steps: [
            { kind: "travel", gait: "amble", label: "Walking home", gx: pet.homeGX, gy: pet.homeGY },
            { kind: "act", label: "Settling in", states: SpeciesProfile.settleGesturesFor(pet) }
        ]
    };
}

function buildWatchFullscreenPlan(corner) {
    return {
        name: "watch_fullscreen",
        label: "Quiet Fullscreen Watch",
        reason: "Loafing in a polite corner",
        urgency: 0.45,
        thought: "Tucking into a quiet corner out of the way",
        steps: [
            { kind: "travel", gait: "amble", label: "Moving to corner", gx: corner.gx, gy: corner.gy },
            { kind: "rest", label: "Loafing quietly", deep: false }
        ]
    };
}

function buildRevisitSanctuaryPlan(pet, spot) {
    return {
        name: "revisit_sanctuary",
        label: "Visiting Favorite Spot",
        reason: "Warm memories at favorite spot",
        urgency: 0.42,
        thought: "Padding back to a favorite spot",
        steps: [
            { kind: "travel", gait: "amble", label: "Returning to favorite spot", gx: spot.gx, gy: spot.gy },
            { kind: "act", label: "Settling in", states: SpeciesProfile.settleGesturesFor(pet) }
        ]
    };
}

function buildPlaySoloPlan(pet, sig) {
    return {
        name: "play_solo",
        label: sig.label,
        reason: sig.label,
        urgency: pet.playDrive,
        durationMs: 32000,
        thought: sig.label,
        steps: [
            { kind: "act", label: sig.label, states: [sig.state, sig.state, sig.state, "hop"] }
        ]
    };
}

function buildUserPlayPlan(pet) {
    return {
        name: "play_solo",
        label: "Playtime",
        reason: "Playing with user",
        urgency: 0.80,
        durationMs: 28000,
        steps: [
            { kind: "zoomies", label: "Playful scamper" },
            { kind: "act", label: "Happy leap", states: SpeciesProfile.affectionGesturesFor(pet).concat(["hop"]) },
            { kind: "pant", label: "Catching breath" }
        ]
    };
}

function buildZoomiesPlan(pet) {
    var winded = (pet.restDrive || 0) > 0.50
              || !!(pet.systemMonitor && (pet.systemMonitor.thermalWarmth || 0) > 0.56);
    var steps = [
        { kind: "zoomies", label: "Scampering around" },
        { kind: "pant", label: "Catching breath" }
    ];
    if (winded) {
        steps.push({ kind: "rest", deep: false, postState: "laying", label: "Flopping flat after zoomies" });
    } else {
        steps.push({ kind: "act", label: "Shaking off", states: SpeciesProfile.calmGesturesFor(pet) });
    }
    return {
        name: "zoomies",
        label: "Zoomies",
        reason: "Burst of playful zoomies",
        urgency: 0.85,
        durationMs: 28000,
        thought: winded ? "Scampered in a burst of zoomies and flopped flat" : "Scampering in a burst of zoomies",
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

function buildRetirePlan(pet, perc) {
    var pw = perc.petW || 64;
    var sleepy = pet.restDrive >= 0.42;
    var nearLeft = (perc.petGX - perc.screen.x) < perc.screen.w * 0.5;
    var edgeX = nearLeft ? (perc.screen.x + 8) : Math.max(perc.screen.x + 8, perc.screen.x + perc.screen.w - pw - 8);
    var edgeY = Topology.clamp(perc.petGY, perc.screen.y + (perc.screen.topInset || 0) + 24,
                               Math.max(perc.screen.y + 24, perc.screen.y + perc.screen.h - (perc.screen.bottomInset || 0) - 80));
    var reluctant = !sleepy && pet && pet.personality
                 && pet.personality.playfulness > 0.58 && pet.personality.patience < 0.48
                 && (!!pet._forceBedtimeProtest || Math.random() < 0.26);
    var steps = [
        { kind: "travel", gait: sleepy ? "amble" : "trot", label: "Walking toward Sanctuary", gx: edgeX, gy: edgeY }
    ];
    if (reluctant) {
        steps.push({ kind: "act", label: "Planting paws stubbornly", states: ["pull"] });
        steps.push({ kind: "pant", label: "Reluctant sigh" });
    } else {
        steps.push({ kind: "act", label: sleepy ? "Yawning goodnight" : "Waving goodbye", states: sleepy ? SpeciesProfile.settleGesturesFor(pet) : SpeciesProfile.greetGesturesFor(pet), emote: sleepy ? "sleepy" : undefined });
    }
    steps.push({ kind: "retire_finish", label: "Entered Sanctuary" });
    return {
        name: "retire_to_pen",
        label: sleepy ? "Heading Off to Rest" : "Sanctuary Stroll",
        reason: sleepy ? "Padding off-screen for a Sanctuary nap" : "Wandering off into the Sanctuary pasture",
        urgency: 0.82,
        durationMs: 55000,
        thought: reluctant
            ? "Planted paws stubbornly before trudging off to the Sanctuary"
            : (sleepy ? "Padding off-screen to rest in the Sanctuary" : "Trotting off for a break in the Sanctuary"),
        steps: steps
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

function buildStealWarmSpotPlan(spot, pet) {
    var owner = spot.petName || "a friend";
    return {
        name: "steal_warm_spot",
        label: "Claiming Warm Spot",
        reason: "Settling into the warm spot " + owner + " just vacated",
        otherName: spot.petName || "",
        urgency: 0.56,
        durationMs: 120000,
        thought: "Trotted straight into the pre-warmed spot " + owner + " just left",
        steps: [
            { kind: "travel", gait: "trot", label: "Trotting to warm spot", gx: spot.gx, gy: spot.gy },
            { kind: "act", label: "Sniffing warm spot", states: ["head", "nod"] },
            { kind: "rest", deep: false, postState: "laying", label: "Sprawled in warm spot" }
        ]
    };
}

function buildParkedCursorCompanyPlan(gx, gy, sideOffset, pet) {
    var nuzzles = SpeciesProfile.nuzzleGesturesFor(pet);
    return {
        name: "parked_cursor_company",
        label: "Keeping Cursor Company",
        reason: "Resting quietly beside the stationary pointer",
        urgency: 0.52,
        durationMs: 110000,
        thought: "Crept up quietly beside the still pointer to keep company",
        steps: [
            { kind: "travel", gait: "amble", label: "Padding beside cursor", gx: gx + sideOffset, gy: gy + 8 },
            { kind: "act", label: "Gentle nuzzle", states: nuzzles, facePoint: { gx: gx, gy: gy } },
            { kind: "loaf_watch", label: "Resting by pointer", attend: "cursor", durationMs: 38000 }
        ]
    };
}

function buildCalmCompanyPlan(perc, pet) {
    var tx = perc.win ? perc.win.loafBesideGX : perc.petGX;
    var ty = perc.win ? perc.win.loafBesideGY : perc.petGY;
    return {
        name: "calm_company",
        label: "Steady Presence",
        reason: "Settling calmly nearby while the workspace is busy",
        windowClass: perc.win ? perc.win.cls : "",
        urgency: 0.54,
        durationMs: 140000,
        thought: "Settled down steadily nearby to offer calm company",
        steps: [
            { kind: "travel", gait: "amble", label: "Padding steadily nearby", gx: tx, gy: ty },
            { kind: "act", label: "Grounding breath", states: ["deepBreath", "nod"], attendWindow: !!perc.win },
            { kind: "loaf_watch", label: "Steady watch", attend: perc.win ? "window" : "", durationMs: 48000 }
        ]
    };
}

function buildWindowShiftInspectPlan(stepOutGX, stepOutGY, winCenterGX, winCenterGY, cls, annoyed) {
    var name = cls || "window";
    var steps = [
        { kind: "travel", gait: annoyed ? "trot" : "amble", label: "Stepping clear of " + name, gx: stepOutGX, gy: stepOutGY }
    ];
    if (annoyed) {
        steps.push({ kind: "act", label: "Planting paws at shifted edge", states: ["pull", "head"], facePoint: { gx: winCenterGX, gy: winCenterGY }, emote: "frustrated" });
    } else {
        steps.push({ kind: "act", label: "Sniffing shifted border", states: ["head", "nod"], facePoint: { gx: winCenterGX, gy: winCenterGY } });
        steps.push({ kind: "observe", durationMs: 3600, facePoint: { gx: winCenterGX, gy: winCenterGY }, label: "Sizing up new layout" });
    }
    return {
        name: "window_shift_inspect",
        label: annoyed ? ("Displaced by " + name) : ("Checking Moved " + name),
        reason: annoyed ? (name + " moved right across resting spot") : ("Inspecting " + name + "'s new position"),
        windowClass: cls || "",
        urgency: 0.64,
        durationMs: 32000,
        thought: annoyed
            ? ("Huffed when " + name + " expanded right over resting spot")
            : ("Stepped aside and sniffed " + name + "'s newly shifted edge"),
        steps: steps
    };
}
