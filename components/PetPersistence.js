// Saves to ~/.config/qs-vpets/state.json (separate from config.json
// so periodic writes don't trigger config reload).

function stateDir(pet) {
    return pet.config.configDir;
}

function save(pet) {
    var state = {
        happiness: pet.happiness,
        restDrive: pet.restDrive,
        exploreDrive: pet.exploreDrive,
        socialDrive: pet.socialDrive,
        playDrive: pet.playDrive,
        alertness: pet.alertness,
        thoughts: pet.thoughts,
        visitedCells: pet.visitedCells,
        windowPrefs: pet.windowPrefs,
        x: pet.worldX, y: pet.worldY,
        homeX: pet.homeX, homeY: pet.homeY,
    };
    var allState = {};
    try {
        if (pet._stateFileView && pet._stateFileView.text)
            allState = JSON.parse(pet._stateFileView.text());
    } catch(e) {}
    allState[pet.petData.name] = state;
    pet._statePendingJson = JSON.stringify(allState, null, 2);
    pet._stateMkdir.running = true;
}

function load(pet) {
    try {
        if (!pet._stateFileView) return;
        var allState = JSON.parse(pet._stateFileView.text());
        var saved = allState[pet.petData.name];
        if (!saved) return;
        if (saved.happiness !== undefined) pet.happiness = saved.happiness;
        if (saved.restDrive !== undefined) pet.restDrive = saved.restDrive;
        if (saved.exploreDrive !== undefined) pet.exploreDrive = saved.exploreDrive;
        if (saved.socialDrive !== undefined) pet.socialDrive = saved.socialDrive;
        if (saved.playDrive !== undefined) pet.playDrive = saved.playDrive;
        if (saved.alertness !== undefined) pet.alertness = saved.alertness;
        if (saved.thoughts && saved.thoughts.length) pet.thoughts = saved.thoughts;
        if (saved.visitedCells) pet.visitedCells = saved.visitedCells;
        if (saved.windowPrefs) pet.windowPrefs = saved.windowPrefs;
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
