var HOME_NEED_MIN_DIST = 250;
var HOME_NEED_RAMP = 600;
var COMFORT_INERTIA = 0.93;
var COMFORT_INERTIA_FS = 0.85;
var PLAY_DISCHARGE = 0.04;
var FRIEND_SOCIAL_RELIEF = 0.01;

function update(pet, perc) {
    var p = pet.personality;
    var resting = pet.state_ === "sit" || pet.state_ === "deepsleep";
    var moving = pet.state_ === "walk" || pet.state_ === "wander" || pet.state_ === "zoomies";

    if (resting) {
        var restRecovery = 0.015 + p.sleepiness * 0.02;
        if (pet.state_ === "deepsleep") restRecovery *= 1.5;
        pet.restDrive = Math.max(0, pet.restDrive - restRecovery);
    } else {
        var restRate = 0.0012 + p.sleepiness * 0.002;
        if (perc.isNight) restRate *= 2.0;
        if (perc.systemBusy) restRate *= 1.3;
        if (p.patience < 0.3) restRate *= 1.2;
        pet.restDrive = Math.min(1, pet.restDrive + restRate);
    }

    if (resting) {
        var alertRecovery = 0.005 + p.energy * 0.01;
        if (pet.state_ === "deepsleep") alertRecovery *= 1.5;
        pet.alertness = Math.min(1, pet.alertness + alertRecovery);
    } else {
        var alertDecay = 0.003 + (1 - p.energy) * 0.005;
        if (perc.isNight) alertDecay *= 2.5;
        pet.alertness = Math.max(0, pet.alertness - alertDecay);
    }

    if (moving) {
        pet.exploreDrive = Math.max(0, pet.exploreDrive - 0.015);
    } else if (resting) {
        pet.exploreDrive = Math.max(0, pet.exploreDrive - (0.005 + p.patience * 0.005));
    } else {
        var exploreRate = 0.0006 + p.curiosity * 0.0018;
        exploreRate *= (0.3 + pet.alertness * 0.7);
        if (perc.windowCount > 3) exploreRate *= 1.4;
        if (perc.userBusy) exploreRate *= 1.8;
        if (p.boldness > 0.7) exploreRate *= 1.3;
        if (perc.hour >= 11 && perc.hour <= 15) exploreRate *= 1.3;
        pet.exploreDrive = Math.min(1, pet.exploreDrive + exploreRate);
    }

    if (resting) {
        pet.socialDrive = Math.max(0, pet.socialDrive - 0.002 * (1 - p.sociability));
    } else {
        var socialRate = (perc.userBusy ? 0.004 : 0.0025) * (0.5 + p.sociability);
        if ((perc.hour >= 7 && perc.hour <= 10) || (perc.hour >= 18 && perc.hour <= 22))
            socialRate *= 1.4;
        pet.socialDrive = Math.min(1, pet.socialDrive + socialRate);
    }
    if (perc.hasFriends) pet.socialDrive = Math.max(0, pet.socialDrive - FRIEND_SOCIAL_RELIEF);

    var homeNeed = Math.min(1, Math.max(0, perc.distFromHome - HOME_NEED_MIN_DIST) / HOME_NEED_RAMP);
    homeNeed *= (1.0 - p.boldness * 0.6);
    if (perc.fullscreen) {
        homeNeed = Math.max(homeNeed, 0.35 + (1 - p.boldness) * 0.4) + 0.1;
    }
    homeNeed += (1 - pet.alertness) * 0.1 * (1 - p.boldness);
    var comfortInertia = perc.fullscreen ? COMFORT_INERTIA_FS : COMFORT_INERTIA;
    pet.comfortDrive = Math.min(1, pet.comfortDrive * comfortInertia + homeNeed * (1 - comfortInertia));

    var playRate = 0.0012 + p.playfulness * 0.0022;
    if (pet.happiness > 0.6) playRate *= 2;
    if (pet.restDrive < 0.3) playRate *= 1.5;
    playRate *= (0.2 + pet.alertness * 0.8);
    if (perc.hour >= 11 && perc.hour <= 17) playRate *= 1.2;
    pet.playDrive = Math.min(1, pet.playDrive + playRate);
    if (pet.state_ === "attack" || pet.state_ === "hop" || pet.state_ === "zoomies" || pet.state_ === "shoot")
        pet.playDrive = Math.max(0, pet.playDrive - PLAY_DISCHARGE);

    if (perc.atHome && resting)
        pet.happiness = Math.min(1, pet.happiness + 0.002 * (1 + p.patience * 0.5));
}

var DRIVE_NOISE = 0.1;
var ACTIVE_FLOOR = 0.25;

function evaluate(pet) {
    var p = pet.personality;
    var fs = pet.windowTracker.isFullscreen;
    var apathy = Math.max(0, p.sleepiness - 0.5) * 0.7 + (1 - p.energy) * 0.2;
    var active = Math.max(ACTIVE_FLOOR, 1 - apathy);

    // Drive values combine raw drive level with personality multipliers,
    // apathy-scaled activity, and fullscreen dampening for active drives.
    var drives = [
        { name: "rest",    value: pet.restDrive    * (1 + p.sleepiness   * 1.4) },
        { name: "explore", value: pet.exploreDrive * (1 + p.curiosity    * 0.8) * active * (fs ? 0.40 : 1) },
        { name: "social",  value: pet.socialDrive  * (1 + p.sociability  * 2.5) * active * (fs ? 0.35 : 1) },
        { name: "comfort", value: pet.comfortDrive * (1.2 - p.boldness   * 0.4)          * (fs ? 1.30 : 1) },
        { name: "play",    value: pet.playDrive    * (1 + p.playfulness  * 0.9) * active * (fs ? 0.50 : 1) },
    ];
    for (var i = 0; i < drives.length; i++)
        drives[i].value += (Math.random() - 0.5) * DRIVE_NOISE;
    drives.sort(function(a, b) { return b.value - a.value; });
    return drives;
}

function stimulate(pet, amount) {
    pet.alertness = Math.min(1, pet.alertness + amount);
    pet.exploreDrive = Math.min(1, pet.exploreDrive + amount * 0.3);
    pet.playDrive = Math.min(1, pet.playDrive + amount * 0.15);
}
