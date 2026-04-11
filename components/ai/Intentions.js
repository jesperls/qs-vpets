function set(pet, action, reason, priority, target) {
    // never replace a higher-priority intention
    if (pet.intention && pet.intention.priority > priority) return;
    // don't refresh identical intention at same priority
    if (pet.intention && pet.intention.priority === priority && pet.intention.action === action) return;
    pet.intention = { action: action, reason: reason, priority: priority, startTime: Date.now(), target: target || null };
}

function clear(pet) { pet.intention = null; }

function isStale(pet) {
    if (!pet.intention) return true;
    var elapsed = Date.now() - pet.intention.startTime;
    // rest can persist longer when very tired
    if (pet.intention.action === "rest" && pet.intention.priority > 0.7) return elapsed > 180000;
    // journeys get more time proportional to priority
    if (pet.intention.action === "adventure" || pet.intention.action === "go_home" || pet.intention.action === "go_home_rest")
        return elapsed > 120000;
    return elapsed > 60000;
}

function fulfill(pet, nav) {
    var intent = pet.intention;
    if (!intent) return false;

    switch (intent.action) {
    case "go_home_rest":
    case "go_home":
        if (nav.inHomeArea(pet)) {
            clear(pet);
            pet.enterState(intent.action === "go_home_rest" ? "sit" : "idle");
            return true;
        }
        if (!pet.onJourney && pet.state_ !== "walk") {
            nav.journeyTo(pet, pet.homeX, pet.homeY);
        }
        return true;

    case "rest":
        if (pet.restDrive < 0.15) { clear(pet); return false; }
        if (pet.state_ !== "sit" && pet.state_ !== "deepsleep") pet.enterState("sit");
        return true;

    case "investigate":
    case "be_near_user":
    case "watch_work":
    case "adventure":
    case "play_walk":
    case "revisit_spot":
    case "follow_cursor":
        if (!pet.onJourney && pet.state_ !== "walk") { clear(pet); return false; }
        return true;

    case "watch_fullscreen":
        if (pet.onJourney || pet.state_ === "walk") return true;
        // arrived at edge, sit and watch
        if (pet.state_ !== "sit" && pet.state_ !== "deepsleep") {
            var wp = pet.windowTracker.activeWindowPos;
            if (wp) pet.sprite.setDirection(Math.atan2(wp.y + wp.h/2 - pet.screenY() - pet.worldY, wp.x + wp.w/2 - pet.screenX() - pet.worldX));
            pet.enterState("sit");
        }
        if (!pet.windowTracker.isFullscreen) { clear(pet); return false; }
        return true;

    case "zoomies":
        if (pet.state_ !== "dance") { clear(pet); return false; }
        return true;

    default:
        clear(pet);
        return false;
    }
}
