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
        if (!pet._stateFileView) return;
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
        if (saved.x !== undefined && saved.y !== undefined) {
            pet.worldX = Math.max(40, Math.min(pet.screenW() - 80, saved.x));
            pet.worldY = Math.max(40, Math.min(pet.screenH() - 80, saved.y));
        }
        if (saved.homeX !== undefined && saved.homeY !== undefined) {
            pet.homeX = Math.max(80, Math.min(pet.screenW() - 80, saved.homeX));
            pet.homeY = Math.max(80, Math.min(pet.screenH() - 80, saved.homeY));
        }
    } catch(e) {}
}
