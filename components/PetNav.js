.import "ai/Memory.js" as Memory
.import "ai/Intentions.js" as Intentions

var ARRIVAL_TOLERANCE = 80;
var WINDOW_BOTTOM_OFFSET = 20;

function distTo(pet, tx, ty) {
    var dx = pet.worldX - tx, dy = pet.worldY - ty;
    return Math.sqrt(dx * dx + dy * dy);
}

function inHomeArea(pet) { return distTo(pet, pet.homeX, pet.homeY) < pet.homeRadius; }

function _clamp(pet, x, y) {
    var maxX = pet.screenW() - pet.width, maxY = pet.screenH() - pet.height;
    return { x: Math.max(0, Math.min(maxX, x)), y: Math.max(0, Math.min(maxY, y)) };
}

function aimAt(pet, tx, ty) {
    var t = _clamp(pet, tx, ty);
    _setAngle(pet, Math.atan2(t.y - pet.worldY, t.x - pet.worldX));
}

function _setAngle(pet, a) {
    pet.moveAngle = a;
    pet.facingRight = Math.cos(a) >= 0;
    pet.sprite.setDirection(a);
}

function randomTarget(pet) {
    var maxX = pet.screenW() - pet.width, maxY = pet.screenH() - pet.height;
    var best = null;
    for (var i = 0; i < 3; i++) {
        var t = { x: Math.random() * maxX, y: Math.random() * maxY };
        var affect = Memory.avoidedSpot(pet, t.x, t.y);
        if (affect === 0) return t;
        if (!best || affect > best.affect) best = { x: t.x, y: t.y, affect: affect };
    }
    return best;
}

function journeyRandom(pet) {
    var t = randomTarget(pet);
    pet.onJourney = true;
    pet._journeyToWindow = false;
    pet.targetX = t.x;
    pet.targetY = t.y;
    aimAt(pet, t.x, t.y);
    pet.enterState("walk");
}

function walkNearby(pet) {
    var range = 80 + Math.random() * 120;
    var angle = Math.random() * 2 * Math.PI;
    var t = _clamp(pet, pet.worldX + Math.cos(angle) * range, pet.worldY + Math.sin(angle) * range);
    pet.onJourney = false;
    _setAngle(pet, Math.atan2(t.y - pet.worldY, t.x - pet.worldX));
    pet.enterState("walk");
}

function journeyTo(pet, x, y) {
    pet.onJourney = true;
    pet._journeyToWindow = false;
    var t = _clamp(pet, x, y);
    pet.targetX = t.x;
    pet.targetY = t.y;
    _setAngle(pet, Math.atan2(y - pet.worldY, x - pet.worldX));
    pet.enterState("walk");
}

function journeyToWindow(pet) {
    var wp = pet.windowTracker.activeWindowPos;
    if (!wp) { journeyRandom(pet); return; }
    var wx = wp.x + wp.w / 2 - pet.screenX();
    var wy = wp.y + wp.h - pet.screenY() - WINDOW_BOTTOM_OFFSET;
    var t = _clamp(pet, wx, wy);
    pet.onJourney = true;
    pet._journeyToWindow = true;
    pet.targetX = t.x;
    pet.targetY = t.y;
    _setAngle(pet, Math.atan2(wy - pet.worldY, wx - pet.worldX));
    pet.enterState("walk");
}

function walkArrived(pet) {
    if (!pet.onJourney) {
        Memory.remember(pet, "arrived");
        if (pet.intention && pet.intention.action === "play_walk") Intentions.markJourneyed(pet);
        pet.enterState("idle");
        return;
    }

    if (pet._journeyToWindow) {
        var wp = pet.windowTracker.activeWindowPos;
        if (wp) {
            var t = _clamp(pet, wp.x + wp.w / 2 - pet.screenX(), wp.y + wp.h - pet.screenY() - WINDOW_BOTTOM_OFFSET);
            pet.targetX = t.x;
            pet.targetY = t.y;
        }
    }

    if (distTo(pet, pet.targetX, pet.targetY) < ARRIVAL_TOLERANCE) {
        pet.onJourney = false;
        pet._journeyToWindow = false;
        Memory.remember(pet, "arrived");
        Intentions.markJourneyed(pet);
        pet.enterState("idle");
    } else {
        aimAt(pet, pet.targetX, pet.targetY);
        pet.restartWalk();
    }
}

function randomDir(pet) {
    var t = randomTarget(pet);
    _setAngle(pet, Math.atan2(t.y - pet.worldY, t.x - pet.worldX));
}

function reflectOffWall(pet, hitX, hitY) {
    var a = pet.moveAngle;
    if (hitX) a = Math.PI - a;
    if (hitY) a = -a;
    if (pet.onJourney) {
        pet.onJourney = false;
        pet._journeyToWindow = false;
        Intentions.clear(pet);
    }
    _setAngle(pet, a);
}
