function tick(pet, nav) {
    var ai = pet._ai;

    if (pet.intention && !ai.Intentions.isStale(pet)) {
        if (ai.Intentions.fulfill(pet, nav)) return;
    }

    // Drowsy: too tired to decide, drift toward resting
    if (pet.alertness < 0.15) {
        if (pet.restDrive > 0.3) {
            var perc0 = ai.Perception.perceive(pet);
            _doRest(pet, nav, perc0, pet.restDrive * (1 + pet.personality.sleepiness * 0.5), ai);
        } else {
            pet.restartIdle();
        }
        return;
    }

    var perc = ai.Perception.perceive(pet);
    var drives = ai.Drives.evaluate(pet);
    var dominant = drives[0];

    var chillThreshold = 0.3 + pet.personality.patience * 0.15;
    if (dominant.value < chillThreshold && Math.random() < 0.6) {
        pet.restartIdle();
        return;
    }

    switch (dominant.name) {
    case "rest":    _doRest(pet, nav, perc, dominant.value, ai); break;
    case "explore": _doExplore(pet, nav, perc, dominant.value, ai); break;
    case "social":  _doSocial(pet, nav, perc, dominant.value, ai); break;
    case "play":    _doPlay(pet, nav, perc, dominant.value, ai); break;
    case "comfort": _doComfort(pet, nav, perc, dominant.value, ai); break;
    }
}

function onEvent(pet, type, data) {
    var ai = pet._ai;
    var wp = pet.windowTracker.activeWindowPos;
    var richData = {};
    if (data) {
        var dk = Object.keys(data);
        for (var d = 0; d < dk.length; d++) richData[dk[d]] = data[dk[d]];
    }
    if (wp) {
        if (!richData.windowClass) richData.windowClass = pet.windowTracker.activeWindowClass;
        richData.windowTitle = pet.windowTracker.activeWindowTitle;
        richData.windowX = wp.x; richData.windowY = wp.y;
        richData.windowW = wp.w; richData.windowH = wp.h;
        richData.fullscreen = pet.windowTracker.isFullscreen;
    }
    if (ai && ai.Memory && type !== "window_focused") ai.Memory.add(pet, type, richData);

    switch (type) {
    case "cursor_near":
        if (ai && ai.Drives) ai.Drives.stimulate(pet, 0.15);
        if (pet.state_ !== "sit" && pet.state_ !== "deepsleep" && pet.state_ !== "drag")
            pet.enterState("react");
        break;

    case "petted":
        pet.socialDrive = Math.max(0, pet.socialDrive - 0.3);
        pet.happiness = Math.min(1, pet.happiness + 0.15);
        pet.playDrive = Math.min(1, pet.playDrive + 0.1);
        if (ai && ai.Drives) ai.Drives.stimulate(pet, 0.2);
        if (ai && ai.Memory) {
            var cls = pet.windowTracker.activeWindowClass;
            if (cls) ai.Memory.recordWindowPref(pet, cls, 0.1);
        }
        if (pet.state_ !== "drag") pet.enterState("react");
        break;

    case "window_opened":
        if (ai && ai.Drives) ai.Drives.stimulate(pet, 0.05 + pet.personality.curiosity * 0.1);
        if (pet.state_ === "idle" && Math.random() < 0.15 + pet.personality.curiosity * 0.3)
            pet.enterState("react");
        break;

    case "workspace_changed":
        if (ai && ai.Drives) ai.Drives.stimulate(pet, 0.05 + pet.personality.boldness * 0.15);
        if (pet.state_ === "idle" && Math.random() < 0.1 + pet.personality.curiosity * 0.25)
            pet.enterState("react");
        break;

    case "window_focused":
        // light stimulation — curious pets notice focus changes more
        if (ai && ai.Drives) ai.Drives.stimulate(pet, pet.personality.curiosity * 0.05);
        break;

    case "user_idle":
        // personality filters: energetic/bold pets resist sleeping,
        // lazy/shy pets respond immediately
        var idleResist = pet.personality.energy * 0.4 + pet.personality.boldness * 0.2;
        pet.restDrive = Math.min(1, pet.restDrive + 0.15 + (1 - idleResist) * 0.15);
        if (Math.random() > idleResist
                && pet.state_ !== "drag" && pet.state_ !== "sit" && pet.state_ !== "deepsleep")
            pet.enterState("sit");
        break;
    }
}

function _doRest(pet, nav, perc, urgency, ai) {
    // stretch after waking up
    if (ai.Memory.justWokeUp(pet)) {
        pet.enterState(_pick(pet, ["deepBreath", "hop", "charge"]));
        return;
    }

    if (!perc.atHome && urgency > 0.5) {
        ai.Intentions.set(pet, "go_home_rest", "tired, heading home", urgency);
        ai.Memory.add(pet, "heading_home");
        nav.journeyTo(pet, pet.homeX, pet.homeY);
        return;
    }

    if (urgency > 0.6) {
        ai.Intentions.set(pet, "rest", "exhausted", urgency);
        pet.enterState("deepsleep");
        return;
    }

    if (urgency > 0.4) {
        if (Math.random() < 0.25) {
            pet.enterState(_pick(pet, ["deepBreath", "cringe", "nod"]));
            return;
        }
        ai.Intentions.set(pet, "rest", "tired", urgency);
        ai.Memory.add(pet, "resting");
        pet.enterState("sit");
        return;
    }

    // slightly tired, just yawn
    pet.enterState(_pick(pet, ["deepBreath", "nod"]));
}

function _doExplore(pet, nav, perc, urgency, ai) {
    var r = Math.random();

    // just arrived somewhere, look around first
    if (ai.Memory.recent(pet, "adventure", 15000) || ai.Memory.recent(pet, "arrived", 20000)) {
        pet.enterState(_pick(pet, ["pose", "nod", "react", "charge"]));
        return;
    }

    // fullscreen: observe from screen edge
    if (perc.fullscreen && perc.activeWindow && r < 0.4 * pet.personality.curiosity) {
        var wx = perc.activeWindow.x, wy = perc.activeWindow.y;
        var edgeX, edgeY;
        if (perc.activeWindow.onScreen) {
            edgeX = pet.worldX < perc.screenW / 2 ? 80 : perc.screenW - 80;
            edgeY = perc.screenH - 80;
        } else {
            edgeX = wx < 0 ? 80 : wx > perc.screenW ? perc.screenW - 80 : pet.worldX;
            edgeY = wy < 0 ? 80 : wy > perc.screenH ? perc.screenH - 80 : pet.worldY;
        }
        ai.Intentions.set(pet, "watch_fullscreen", "something interesting!", urgency * 0.8);
        ai.Memory.add(pet, "watching_fullscreen");
        nav.journeyTo(pet, edgeX, edgeY);
        return;
    }

    // more likely to investigate familiar/liked windows
    if (perc.activeWindow && perc.activeWindow.onScreen && !perc.fullscreen && r < 0.3) {
        var cls = pet.windowTracker.activeWindowClass;
        var pref = ai.Memory.getWindowPref(pet, cls);
        var familiarity = ai.Memory.windowFamiliarity(pet, cls);
        if (Math.random() < 0.2 + pref * 0.3 + Math.min(familiarity * 0.05, 0.2)) {
            ai.Intentions.set(pet, "investigate", "curious about " + cls, urgency);
            nav.journeyToWindow(pet);
            return;
        }
    }

    // most common: short local walk
    if (r < 0.65) {
        nav.walkNearby(pet);
        return;
    }

    if (r < 0.8) {
        ai.Intentions.set(pet, "adventure", "exploring", urgency);
        ai.Memory.add(pet, "adventure");
        nav.journeyRandom(pet);
        return;
    }

    // wander toward least-visited area
    var angle = ai.Memory.leastVisitedDir(pet);
    nav._setAngle(pet, angle);
    pet.enterState("wander");
}

function _doSocial(pet, nav, perc, urgency, ai) {
    if (ai.Memory.wasRecentlyPetted(pet)) {
        pet.enterState(_pick(pet, ["nod", "pose"]));
        return;
    }

    if (perc.cursorOnScreen && Math.random() < 0.5) {
        var dx = perc.cursorX - pet.worldX, dy = perc.cursorY - pet.worldY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 100) {
            ai.Intentions.set(pet, "follow_cursor", "following the user", urgency);
            nav.journeyTo(pet, perc.cursorX, perc.cursorY);
            return;
        }
    }

    // revisit spots where good things happened
    var goodSpot = ai.Memory.lastPositiveSpot(pet);
    if (goodSpot && Date.now() - goodSpot.time < 300000 && Math.random() < 0.35) {
        ai.Intentions.set(pet, "revisit_spot", "good memories here", urgency);
        nav.journeyTo(pet, goodSpot.x, goodSpot.y);
        return;
    }

    if (perc.activeWindow && perc.activeWindow.onScreen) {
        ai.Intentions.set(pet, "be_near_user", "wants attention", urgency);
        nav.journeyToWindow(pet);
        return;
    }

    pet.enterState(_pick(pet, ["cringe", "react"]));
}

function _doPlay(pet, nav, perc, urgency, ai) {
    ai.Memory.add(pet, "feeling_playful");
    var r = Math.random();

    if (r < 0.35) {
        ai.Intentions.set(pet, "zoomies", "pent up energy!", urgency);
        nav.randomDir(pet);
        pet.enterState("dance");
        return;
    }

    if (r < 0.7) {
        pet.enterState(_pick(pet, ["attack", "hop", "shoot", "pose", "trip", "charge"]));
        return;
    }

    ai.Intentions.set(pet, "play_walk", "bouncy walk", urgency);
    nav.walkNearby(pet);
}

function _doComfort(pet, nav, perc, urgency, ai) {
    if (ai.Memory.isFamiliarArea(pet)) {
        pet.comfortDrive = Math.max(0, pet.comfortDrive - 0.08);
        if (pet.comfortDrive < 0.15) {
            pet.enterState(_pick(pet, ["nod", "pose", "deepBreath"]));
            return;
        }
    }
    ai.Intentions.set(pet, "go_home", "homesick", urgency);
    ai.Memory.add(pet, "homesick");
    nav.journeyTo(pet, pet.homeX, pet.homeY);
}

// pick a random state, preferring ones the sprite actually has
function _pick(pet, states) {
    var animData = pet.sprite._animData;
    if (animData) {
        var available = [];
        var defaultMap = pet.sprite._defaultMap;
        for (var i = 0; i < states.length; i++) {
            var anim = pet.sprite.actionMap[states[i]] || defaultMap[states[i]] || "Walk";
            if (animData[anim]) available.push(states[i]);
        }
        if (available.length > 0) return available[Math.floor(Math.random() * available.length)];
    }
    return states[Math.floor(Math.random() * states.length)];
}
