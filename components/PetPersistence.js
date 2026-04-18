function save(pet) {
    var state = {
        happiness: pet.happiness,
        mood: pet.mood,
        restDrive: pet.restDrive,
        exploreDrive: pet.exploreDrive,
        socialDrive: pet.socialDrive,
        playDrive: pet.playDrive,
        alertness: pet.alertness,
        thoughts: pet.thoughts,
        visitedCells: pet.visitedCells,
        windowPrefs: pet.windowPrefs,
        placeMemory: pet.placeMemory,
        traits: pet.traits,
        x: pet.worldX, y: pet.worldY,
        homeX: pet.homeX, homeY: pet.homeY,
    };
    pet._statePendingJson = JSON.stringify(state, null, 2);
    pet._stateMkdir.running = true;
}

function load(pet) {
    try {
        var saved = JSON.parse(pet._stateFileView.text());
        if (saved.happiness !== undefined) pet.happiness = saved.happiness;
        if (saved.mood !== undefined) pet.mood = saved.mood;
        if (saved.restDrive !== undefined) pet.restDrive = saved.restDrive;
        if (saved.exploreDrive !== undefined) pet.exploreDrive = saved.exploreDrive;
        if (saved.socialDrive !== undefined) pet.socialDrive = saved.socialDrive;
        if (saved.playDrive !== undefined) pet.playDrive = saved.playDrive;
        if (saved.alertness !== undefined) pet.alertness = saved.alertness + (0.5 - saved.alertness) * 0.5;
        if (saved.thoughts && saved.thoughts.length) pet.thoughts = saved.thoughts;
        if (saved.visitedCells) pet.visitedCells = saved.visitedCells;
        if (saved.windowPrefs) pet.windowPrefs = saved.windowPrefs;
        if (saved.placeMemory) pet.placeMemory = saved.placeMemory;
        if (saved.traits) pet.traits = saved.traits;
        var maxX = pet.screenW() - pet.width, maxY = pet.screenH() - pet.height;
        if (saved.x !== undefined && saved.y !== undefined) {
            pet.worldX = Math.max(0, Math.min(maxX, saved.x));
            pet.worldY = Math.max(0, Math.min(maxY, saved.y));
        }
        if (saved.homeX !== undefined && saved.homeY !== undefined) {
            pet.homeX = Math.max(0, Math.min(maxX, saved.homeX));
            pet.homeY = Math.max(0, Math.min(maxY, saved.homeY));
        }
    } catch (e) {
        console.warn("qs-vpets: failed to load pet state:", e);
    }
}
