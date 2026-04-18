var VISITED_CELL_SIZE = 200;
var PLACE_CELL_SIZE = 400;
var THOUGHTS_LIMIT = 200;
var FAMILIAR_VISITS = 3;
var FAVORITE_AFFECT_MIN = 0.2;
var FAVORITE_VISITS_MIN = 2;
var AVOID_AFFECT_MAX = -0.3;
var PETTED_WINDOW_MS = 30000;
var STARTLED_WINDOW_MS = 15000;
var WOKE_WINDOW_MS = 15000;
var IDLE_LONG_WINDOW_MS = 120000;
var CELL_DECAY_CHANCE = 0.15;
var PREF_DECAY_TO_NEUTRAL = 0.02;
var PLACE_DECAY = 0.995;
var PLACE_PURGE_AFFECT = 0.02;
var PLACE_PURGE_CHANCE = 0.05;

function remember(pet, type, data) {
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
    if (pet.thoughts.length > THOUGHTS_LIMIT) pet.thoughts.shift();
}

var RECENT_DEFAULT_MS = 30000;
var COUNT_DEFAULT_MS = 60000;

function recent(pet, type, withinMs) {
    var cutoff = Date.now() - (withinMs || RECENT_DEFAULT_MS);
    for (var i = pet.thoughts.length - 1; i >= 0; i--)
        if (pet.thoughts[i].type === type && pet.thoughts[i].time > cutoff) return pet.thoughts[i];
    return null;
}

function count(pet, type, withinMs) {
    var cutoff = Date.now() - (withinMs || COUNT_DEFAULT_MS);
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
    var key = Math.floor(pet.worldX / VISITED_CELL_SIZE) + "," + Math.floor(pet.worldY / VISITED_CELL_SIZE);
    pet.visitedCells[key] = (pet.visitedCells[key] || 0) + 1;
}

function leastVisitedDir(pet) {
    var bestAngle = Math.random() * 2 * Math.PI;
    var bestScore = Infinity;
    var maxX = pet.screenW() - pet.width, maxY = pet.screenH() - pet.height;
    var step = 300, skipClose = 30;
    for (var i = 0; i < 8; i++) {
        var angle = i * Math.PI / 4;
        var tx = Math.max(0, Math.min(maxX, pet.worldX + Math.cos(angle) * step));
        var ty = Math.max(0, Math.min(maxY, pet.worldY + Math.sin(angle) * step));
        if (Math.abs(tx - pet.worldX) < skipClose && Math.abs(ty - pet.worldY) < skipClose) continue;
        var key = Math.floor(tx / VISITED_CELL_SIZE) + "," + Math.floor(ty / VISITED_CELL_SIZE);
        var score = (pet.visitedCells[key] || 0) + Math.random() * 2;
        if (score < bestScore) { bestScore = score; bestAngle = angle; }
    }
    return bestAngle;
}

function wasRecentlyPetted(pet) { return !!recent(pet, "petted", PETTED_WINDOW_MS); }
function wasRecentlyStartled(pet) { return !!recent(pet, "cursor_near", STARTLED_WINDOW_MS); }
function justWokeUp(pet) { return !!recent(pet, "well_rested", WOKE_WINDOW_MS); }
function hasBeenIdleLong(pet) {
    return count(pet, "adventure", IDLE_LONG_WINDOW_MS) < 1 && count(pet, "arrived", IDLE_LONG_WINDOW_MS) < 1;
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
        pet.windowPrefs[prefKeys[i]] = v + (0.5 - v) * PREF_DECAY_TO_NEUTRAL;
    }
    var cellKeys = Object.keys(pet.visitedCells);
    for (var j = 0; j < cellKeys.length; j++) {
        if (Math.random() < CELL_DECAY_CHANCE) {
            if (--pet.visitedCells[cellKeys[j]] <= 0) delete pet.visitedCells[cellKeys[j]];
        }
    }
}

function isFamiliarArea(pet) {
    var key = Math.floor(pet.worldX / VISITED_CELL_SIZE) + "," + Math.floor(pet.worldY / VISITED_CELL_SIZE);
    var homeKey = Math.floor(pet.homeX / VISITED_CELL_SIZE) + "," + Math.floor(pet.homeY / VISITED_CELL_SIZE);
    if (key === homeKey) return true;
    return (pet.visitedCells[key] || 0) > FAMILIAR_VISITS;
}

function recordPlaceAffect(pet, valence) {
    if (!pet.placeMemory) pet.placeMemory = ({});
    var key = Math.floor(pet.worldX / PLACE_CELL_SIZE) + "," + Math.floor(pet.worldY / PLACE_CELL_SIZE);
    var e = pet.placeMemory[key] || { affect: 0, visits: 0, lastVisit: 0 };
    var weight = Math.min(0.3, 1.0 / (e.visits + 2));
    e.affect = e.affect * (1 - weight) + valence * weight;
    e.visits++;
    e.lastVisit = Date.now();
    pet.placeMemory[key] = e;
}

function placeAffectAt(pet, x, y) {
    if (!pet.placeMemory) return 0;
    var key = Math.floor(x / PLACE_CELL_SIZE) + "," + Math.floor(y / PLACE_CELL_SIZE);
    var e = pet.placeMemory[key];
    return e ? e.affect : 0;
}

function favoriteSpot(pet) {
    if (!pet.placeMemory) return null;
    var best = null, bestScore = FAVORITE_AFFECT_MIN;
    var keys = Object.keys(pet.placeMemory);
    for (var i = 0; i < keys.length; i++) {
        var e = pet.placeMemory[keys[i]];
        if (e.affect > bestScore && e.visits >= FAVORITE_VISITS_MIN) {
            bestScore = e.affect;
            var parts = keys[i].split(",");
            var half = PLACE_CELL_SIZE / 2;
            best = {
                x: parseInt(parts[0]) * PLACE_CELL_SIZE + half,
                y: parseInt(parts[1]) * PLACE_CELL_SIZE + half,
                affect: e.affect,
            };
        }
    }
    return best;
}

function avoidedSpot(pet, x, y) {
    if (!pet.placeMemory) return 0;
    var key = Math.floor(x / PLACE_CELL_SIZE) + "," + Math.floor(y / PLACE_CELL_SIZE);
    var e = pet.placeMemory[key];
    return e && e.affect < AVOID_AFFECT_MAX ? e.affect : 0;
}

function decayPlaceMemory(pet) {
    if (!pet.placeMemory) return;
    var keys = Object.keys(pet.placeMemory);
    for (var i = 0; i < keys.length; i++) {
        var e = pet.placeMemory[keys[i]];
        e.affect *= PLACE_DECAY;
        if (Math.abs(e.affect) < PLACE_PURGE_AFFECT && Math.random() < PLACE_PURGE_CHANCE) delete pet.placeMemory[keys[i]];
    }
}
