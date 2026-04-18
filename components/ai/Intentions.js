var STALE_REST_HIGH_MS = 180000;
var STALE_JOURNEY_MS = 120000;
var STALE_DEFAULT_MS = 60000;
var REST_HIGH_PRIORITY = 0.7;
var REST_DRIVE_END = 0.15;

// Reward tuning for arrived intents: [drive, amount, happinessBonus]
var REWARDS = {
    investigate:   ["exploreDrive", 0.25, 0.02],
    adventure:     ["exploreDrive", 0.35, 0.02],
    be_near_user:  ["socialDrive",  0.20, 0.03],
    follow_cursor: ["socialDrive",  0.20, 0.03],
    revisit_spot:  ["socialDrive",  0.15, 0.04],
    play_walk:     ["playDrive",    0.20, 0.00],
};

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
    if (action === "rest" && pet.intention.priority > REST_HIGH_PRIORITY) return elapsed > STALE_REST_HIGH_MS;
    if (action === "adventure" || action === "go_home" || action === "go_home_rest") return elapsed > STALE_JOURNEY_MS;
    return elapsed > STALE_DEFAULT_MS;
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
    var reward = REWARDS[intent.action];
    if (arrived && reward) {
        _arrivedReward(pet, reward[0], reward[1], reward[2]);
        return false;
    }
    var interrupted = !pet.onJourney && pet.state_ !== "walk" && !intent.journeyed;

    switch (intent.action) {
    case "go_home_rest":
    case "go_home":
        if (nav.inHomeArea(pet)) {
            clear(pet);
            pet.enterState(intent.action === "go_home_rest" ? "sit" : "idle");
            return true;
        }
        if (arrived || interrupted) nav.journeyTo(pet, pet.homeX, pet.homeY);
        return true;

    case "rest":
        if (pet.restDrive < REST_DRIVE_END) { clear(pet); return false; }
        if (pet.state_ !== "sit" && pet.state_ !== "deepsleep") pet.enterState("sit");
        return true;

    case "watch_fullscreen":
        if (!pet.windowTracker.isFullscreen) { clear(pet); return false; }
        if (interrupted) { clear(pet); return false; }
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
        return true;

    case "zoomies":
        if (pet.state_ !== "zoomies") { clear(pet); return false; }
        return true;

    case "investigate":
    case "be_near_user":
        if (interrupted) { nav.journeyToWindow(pet); return true; }
        return true;

    case "adventure":
        if (interrupted) { nav.journeyRandom(pet); return true; }
        return true;

    case "follow_cursor":
    case "revisit_spot":
    case "play_walk":
        if (interrupted) { clear(pet); return false; }
        return true;

    default:
        clear(pet);
        return false;
    }
}
