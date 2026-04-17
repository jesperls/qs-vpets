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

function trackPosition(pet) {
    if (pet.state_ !== "walk" && pet.state_ !== "wander") return;
    var now = Date.now();
    if (now - (pet._lastTrackTime || 0) < 5000) return;
    pet._lastTrackTime = now;
    var key = Math.floor(pet.worldX / 200) + "," + Math.floor(pet.worldY / 200);
    pet.visitedCells[key] = (pet.visitedCells[key] || 0) + 1;
}

function leastVisitedDir(pet) {
    var bestAngle = Math.random() * 2 * Math.PI;
    var bestScore = Infinity;
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
function hasBeenIdleLong(pet) {
    return count(pet, "adventure", 120000) < 1 && count(pet, "arrived", 120000) < 1;
}

function recordWindowPref(pet, cls, delta) {
    if (!cls) return;
    var cur = pet.windowPrefs[cls] !== undefined ? pet.windowPrefs[cls] : 0.5;
    pet.windowPrefs[cls] = Math.max(0, Math.min(1, cur + delta));
}

function getWindowPref(pet, cls) {
    if (!cls) return 0.5;
    return pet.windowPrefs[cls] !== undefined ? pet.windowPrefs[cls] : 0.5;
}

function decayPreferences(pet) {
    var prefKeys = Object.keys(pet.windowPrefs);
    for (var i = 0; i < prefKeys.length; i++) {
        var v = pet.windowPrefs[prefKeys[i]];
        pet.windowPrefs[prefKeys[i]] = v + (0.5 - v) * 0.02;
    }
    var cellKeys = Object.keys(pet.visitedCells);
    for (var j = 0; j < cellKeys.length; j++) {
        if (Math.random() < 0.15) {
            if (--pet.visitedCells[cellKeys[j]] <= 0) delete pet.visitedCells[cellKeys[j]];
        }
    }
}

function isFamiliarArea(pet) {
    var key = Math.floor(pet.worldX / 200) + "," + Math.floor(pet.worldY / 200);
    var homeKey = Math.floor(pet.homeX / 200) + "," + Math.floor(pet.homeY / 200);
    if (key === homeKey) return true;
    return (pet.visitedCells[key] || 0) > 3;
}

function recordPlaceAffect(pet, valence) {
    if (!pet.placeMemory) pet.placeMemory = ({});
    var key = Math.floor(pet.worldX / 400) + "," + Math.floor(pet.worldY / 400);
    var e = pet.placeMemory[key] || { affect: 0, visits: 0, lastVisit: 0 };
    var weight = Math.min(0.3, 1.0 / (e.visits + 2));
    e.affect = e.affect * (1 - weight) + valence * weight;
    e.visits++;
    e.lastVisit = Date.now();
    pet.placeMemory[key] = e;
}

function placeAffectAt(pet, x, y) {
    if (!pet.placeMemory) return 0;
    var key = Math.floor(x / 400) + "," + Math.floor(y / 400);
    var e = pet.placeMemory[key];
    return e ? e.affect : 0;
}

function favoriteSpot(pet) {
    if (!pet.placeMemory) return null;
    var best = null, bestScore = 0.2;
    var keys = Object.keys(pet.placeMemory);
    for (var i = 0; i < keys.length; i++) {
        var e = pet.placeMemory[keys[i]];
        if (e.affect > bestScore && e.visits >= 2) {
            bestScore = e.affect;
            var parts = keys[i].split(",");
            best = { x: parseInt(parts[0]) * 400 + 200, y: parseInt(parts[1]) * 400 + 200, affect: e.affect };
        }
    }
    return best;
}

function avoidedSpot(pet, x, y) {
    if (!pet.placeMemory) return 0;
    var key = Math.floor(x / 400) + "," + Math.floor(y / 400);
    var e = pet.placeMemory[key];
    return e && e.affect < -0.3 ? e.affect : 0;
}

function decayPlaceMemory(pet) {
    if (!pet.placeMemory) return;
    var keys = Object.keys(pet.placeMemory);
    for (var i = 0; i < keys.length; i++) {
        var e = pet.placeMemory[keys[i]];
        e.affect *= 0.995;
        if (Math.abs(e.affect) < 0.02 && Math.random() < 0.05) delete pet.placeMemory[keys[i]];
    }
}
