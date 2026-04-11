function perceive(pet) {
    var wp = pet.windowTracker.activeWindowPos;
    var localWp = null;
    if (wp) {
        var lx = wp.x + wp.w / 2 - pet.screenX();
        var ly = wp.y + wp.h / 2 - pet.screenY();
        var sw = pet.screenW(), sh = pet.screenH();
        localWp = { x: lx, y: ly, onScreen: lx > 50 && lx < sw - 50 && ly > 50 && ly < sh - 50 };
    }

    // use global coordinates for multi-monitor distance
    var petGX = pet.screenX() + pet.worldX;
    var petGY = pet.screenY() + pet.worldY;
    var nearbyPets = [];
    var allPets = pet.petManager.pets;
    for (var i = 0; i < allPets.length; i++) {
        if (allPets[i] === pet) continue;
        var otherGX = allPets[i].screenX() + allPets[i].worldX;
        var otherGY = allPets[i].screenY() + allPets[i].worldY;
        var dx = otherGX - petGX, dy = otherGY - petGY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 300) nearbyPets.push({ pet: allPets[i], dist: dist });
    }

    var cursorGX = pet.inputTracker.cursorX;
    var cursorGY = pet.inputTracker.cursorY;

    return {
        hour: pet._hour,
        isNight: pet.isNighttime,
        cpuLoad: pet.systemMonitor.cpuUsage,
        systemBusy: pet.systemMonitor.isUnderLoad,
        userBusy: pet.windowTracker.isUserBusy,
        windowCount: pet.windowTracker.windowCount,
        activeWindow: localWp,
        fullscreen: pet.windowTracker.isFullscreen,
        cursorX: cursorGX - pet.screenX(),
        cursorY: cursorGY - pet.screenY(),
        cursorOnScreen: cursorGX >= pet.screenX() && cursorGX < pet.screenX() + pet.screenW()
                     && cursorGY >= pet.screenY() && cursorGY < pet.screenY() + pet.screenH(),
        distFromHome: Math.sqrt(Math.pow(pet.worldX - pet.homeX, 2) + Math.pow(pet.worldY - pet.homeY, 2)),
        atHome: Math.sqrt(Math.pow(pet.worldX - pet.homeX, 2) + Math.pow(pet.worldY - pet.homeY, 2)) < pet.homeRadius,
        nearbyPets: nearbyPets,
        hasFriends: nearbyPets.length > 0,
        screenW: pet.screenW(),
        screenH: pet.screenH(),
    };
}
