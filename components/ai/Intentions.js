function set(pet, action, reason, priority, target) {
    if (pet.intention && pet.intention.priority > priority) return;
    if (pet.intention && pet.intention.priority === priority && pet.intention.action === action) return;
    pet.intention = {
        action: action,
        reason: reason,
        priority: priority,
        startTime: Date.now(),
        target: target || null,
        journeyed: false,
    };
}

function markJourneyed(pet) {
    if (pet.intention) pet.intention.journeyed = true;
}

function clear(pet) { pet.intention = null; }

function isStale(pet) {
    if (!pet.intention) return true;
    var elapsed = Date.now() - pet.intention.startTime;
    var action = pet.intention.action;
    if (action === "rest" && pet.intention.priority > 0.7) return elapsed > 180000;
    if (action === "adventure" || action === "go_home" || action === "go_home_rest") return elapsed > 120000;
    return elapsed > 60000;
}

function _arrivedReward(pet, drive, amount, happyBonus) {
    pet[drive] = Math.max(0, pet[drive] - amount);
    if (happyBonus) pet.happiness = Math.min(1, pet.happiness + happyBonus);
    clear(pet);
}

function fulfill(pet, nav) {
    var intent = pet.intention;
    if (!intent) return false;
    var arrived = intent.journeyed && !pet.onJourney && pet.state_ !== "walk";

    switch (intent.action) {
    case "go_home_rest":
    case "go_home":
        if (nav.inHomeArea(pet)) {
            clear(pet);
            pet.enterState(intent.action === "go_home_rest" ? "sit" : "idle");
            return true;
        }
        if (arrived) nav.journeyTo(pet, pet.homeX, pet.homeY);
        return true;

    case "rest":
        if (pet.restDrive < 0.15) { clear(pet); return false; }
        if (pet.state_ !== "sit" && pet.state_ !== "deepsleep") pet.enterState("sit");
        return true;

    case "investigate":
        if (arrived) { _arrivedReward(pet, "exploreDrive", 0.25, 0.02); return false; }
        return true;

    case "adventure":
        if (arrived) { _arrivedReward(pet, "exploreDrive", 0.35, 0.02); return false; }
        return true;

    case "be_near_user":
    case "follow_cursor":
        if (arrived) { _arrivedReward(pet, "socialDrive", 0.2, 0.03); return false; }
        return true;

    case "revisit_spot":
        if (arrived) { _arrivedReward(pet, "socialDrive", 0.15, 0.04); return false; }
        return true;

    case "play_walk":
        if (arrived) { _arrivedReward(pet, "playDrive", 0.2, 0); return false; }
        return true;

    case "watch_fullscreen":
        if (!arrived) return true;
        if (pet.state_ !== "sit" && pet.state_ !== "deepsleep") {
            var wp = pet.windowTracker.activeWindowPos;
            if (wp) {
                var ax = wp.x + wp.w/2 - pet.screenX() - pet.worldX;
                var ay = wp.y + wp.h/2 - pet.screenY() - pet.worldY;
                pet.sprite.setDirection(Math.atan2(ay, ax));
            }
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
