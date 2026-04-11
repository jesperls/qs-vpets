function update(pet, perc) {
    var p = pet.personality;

    // Rest: ~45 min to fill while awake, drops while sitting
    if (pet.state_ === "sit" || pet.state_ === "deepsleep") {
        pet.restDrive = Math.max(0, pet.restDrive - 0.02);
    } else {
        var restRate = 0.002 + p.sleepiness * 0.003;
        if (perc.isNight) restRate *= 2.0;
        if (perc.systemBusy) restRate *= 1.3;
        if (p.patience < 0.3) restRate *= 1.2;
        pet.restDrive = Math.min(1, pet.restDrive + restRate);
    }

    // Explore: drops while moving, builds while stationary
    if (pet.state_ === "walk" || pet.state_ === "wander" || pet.state_ === "dance") {
        pet.exploreDrive = Math.max(0, pet.exploreDrive - 0.015);
    } else {
        var exploreRate = 0.001 + p.curiosity * 0.002;
        if (perc.windowCount > 3) exploreRate *= 1.4;
        if (perc.userBusy) exploreRate *= 1.8;
        if (p.boldness > 0.7) exploreRate *= 1.3;
        pet.exploreDrive = Math.min(1, pet.exploreDrive + exploreRate);
    }

    // Social: builds over time, reduced by nearby friends
    var socialRate = perc.userBusy ? 0.002 : 0.001;
    socialRate *= (0.5 + p.sociability);
    pet.socialDrive = Math.min(1, pet.socialDrive + socialRate);
    if (perc.hasFriends) pet.socialDrive = Math.max(0, pet.socialDrive - 0.01);

    // Comfort: smooth blend toward distance-based need
    var homeNeed = Math.min(1, perc.distFromHome / 600);
    homeNeed *= (1.2 - p.boldness * 0.5);
    // fullscreen makes the pet feel exposed
    if (perc.fullscreen) homeNeed = Math.max(homeNeed, 0.3 + (1 - p.boldness) * 0.3);
    pet.comfortDrive = pet.comfortDrive * 0.95 + homeNeed * 0.05;

    // Play: builds slowly, drops during play actions
    var playRate = 0.0005 + p.playfulness * 0.001;
    if (pet.happiness > 0.6) playRate *= 2;
    if (pet.restDrive < 0.3) playRate *= 1.5;
    pet.playDrive = Math.min(1, pet.playDrive + playRate);
    if (pet.state_ === "attack" || pet.state_ === "hop" || pet.state_ === "dance" || pet.state_ === "shoot")
        pet.playDrive = Math.max(0, pet.playDrive - 0.04);
}

function evaluate(pet) {
    var p = pet.personality;
    var fs = pet.windowTracker.isFullscreen;
    var drives = [
        { name: "rest",    value: pet.restDrive * (1 + p.sleepiness * 0.5) },
        { name: "explore", value: pet.exploreDrive * (1 + p.curiosity * 0.5) * (fs ? 0.6 : 1) },
        { name: "social",  value: pet.socialDrive * (1 + p.sociability * 0.4) * (fs ? 0.5 : 1) },
        { name: "comfort", value: pet.comfortDrive * (1.2 - p.boldness * 0.4) },
        { name: "play",    value: pet.playDrive * (1 + p.playfulness * 0.5) * (fs ? 0.7 : 1) },
    ];
    for (var i = 0; i < drives.length; i++)
        drives[i].value += (Math.random() - 0.5) * 0.1;
    drives.sort(function(a, b) { return b.value - a.value; });
    return drives;
}

function stimulate(pet, amount) {
    pet.alertness = Math.min(1, pet.alertness + amount);
    pet.exploreDrive = Math.min(1, pet.exploreDrive + amount * 0.3);
    pet.playDrive = Math.min(1, pet.playDrive + amount * 0.15);
}
