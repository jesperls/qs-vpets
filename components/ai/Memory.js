function add(pet, type, data) {
    var thought = {
        type: type,
        time: Date.now(),
        x: Math.round(pet.worldX),
        y: Math.round(pet.worldY),
        state: pet.state_,
        drives: {
            rest: Math.round(pet.restDrive * 100) / 100,
            explore: Math.round(pet.exploreDrive * 100) / 100,
            social: Math.round(pet.socialDrive * 100) / 100,
            play: Math.round(pet.playDrive * 100) / 100,
        },
        happiness: Math.round(pet.happiness * 100) / 100,
    };
    if (data) {
        var keys = Object.keys(data);
        for (var i = 0; i < keys.length; i++) thought[keys[i]] = data[keys[i]];
    }
    pet.thoughts.push(thought);
    if (pet.thoughts.length > 200) pet.thoughts.shift();
}

function recent(pet, type, withinMs) {
    var cutoff = Date.now() - (withinMs || 30000);
    for (var i = pet.thoughts.length - 1; i >= 0; i--)
        if (pet.thoughts[i].type === type && pet.thoughts[i].time > cutoff) return pet.thoughts[i];
    return null;
}

function count(pet, type, withinMs) {
    var cutoff = Date.now() - (withinMs || 60000);
    var n = 0;
    for (var i = 0; i < pet.thoughts.length; i++)
        if (pet.thoughts[i].type === type && pet.thoughts[i].time > cutoff) n++;
    return n;
}

function lastPositiveSpot(pet) {
    for (var i = pet.thoughts.length - 1; i >= 0; i--) {
        var t = pet.thoughts[i];
        if (t.type === "petted" && t.x !== undefined)
            return { x: t.x, y: t.y, type: t.type, time: t.time };
    }
    return null;
}

function windowFamiliarity(pet, cls) {
    var n = 0;
    for (var i = 0; i < pet.thoughts.length; i++)
        if (pet.thoughts[i].windowClass === cls) n++;
    return n;
}

// track every 5s while moving, bucketed into 200px cells
function trackPosition(pet) {
    if (pet.state_ !== "walk" && pet.state_ !== "wander") return;
    var now = Date.now();
    if (now - (pet._lastTrackTime || 0) < 5000) return;
    pet._lastTrackTime = now;
    var key = Math.floor(pet.worldX / 200) + "," + Math.floor(pet.worldY / 200);
    if (!pet.visitedCells[key]) pet.visitedCells[key] = 0;
    pet.visitedCells[key]++;
}

function leastVisitedDir(pet) {
    var bestAngle = Math.random() * 2 * Math.PI;
    var bestScore = 999;
    var w = pet.screenW(), h = pet.screenH(), m = 60;
    for (var i = 0; i < 8; i++) {
        var angle = i * Math.PI / 4;
        var tx = Math.max(m, Math.min(w - m, pet.worldX + Math.cos(angle) * 300));
        var ty = Math.max(m, Math.min(h - m, pet.worldY + Math.sin(angle) * 300));
        if (Math.abs(tx - pet.worldX) < 30 && Math.abs(ty - pet.worldY) < 30) continue;
        var key = Math.floor(tx / 200) + "," + Math.floor(ty / 200);
        var score = (pet.visitedCells[key] || 0) + Math.random() * 2;
        if (score < bestScore) { bestScore = score; bestAngle = angle; }
    }
    return bestAngle;
}

function wasRecentlyPetted(pet) { return !!recent(pet, "petted", 30000); }
function wasRecentlyStartled(pet) { return !!recent(pet, "cursor_near", 15000); }
function justWokeUp(pet) { return !!recent(pet, "well_rested", 15000); }
function hasBeenIdleLong(pet) { return count(pet, "adventure", 120000) < 1 && count(pet, "arrived", 120000) < 1; }

function recordWindowPref(pet, cls, delta) {
    if (!cls) return;
    if (!pet.windowPrefs[cls]) pet.windowPrefs[cls] = 0.5;
    pet.windowPrefs[cls] = Math.max(0, Math.min(1, pet.windowPrefs[cls] + delta));
}

function getWindowPref(pet, cls) {
    if (!cls) return 0.5;
    return pet.windowPrefs[cls] !== undefined ? pet.windowPrefs[cls] : 0.5;
}

// slowly decay all preferences toward neutral (0.5)
function decayPreferences(pet) {
    var keys = Object.keys(pet.windowPrefs);
    for (var i = 0; i < keys.length; i++) {
        var v = pet.windowPrefs[keys[i]];
        pet.windowPrefs[keys[i]] = v + (0.5 - v) * 0.02;
    }
    // prune visitedCells: slow decay so exploration memory lasts ~minutes not seconds
    var cellKeys = Object.keys(pet.visitedCells);
    for (var j = 0; j < cellKeys.length; j++) {
        if (Math.random() < 0.15) {
            pet.visitedCells[cellKeys[j]]--;
            if (pet.visitedCells[cellKeys[j]] <= 0) delete pet.visitedCells[cellKeys[j]];
        }
    }
}

function isFamiliarArea(pet) {
    var key = Math.floor(pet.worldX / 200) + "," + Math.floor(pet.worldY / 200);
    return (pet.visitedCells[key] || 0) > 3;
}
