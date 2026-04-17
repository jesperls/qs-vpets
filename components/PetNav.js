var _margin = 60;

function distTo(pet, tx, ty) {
    var dx = pet.worldX - tx, dy = pet.worldY - ty;
    return Math.sqrt(dx * dx + dy * dy);
}

function inHomeArea(pet) { return distTo(pet, pet.homeX, pet.homeY) < pet.homeRadius; }

function _clamp(pet, x, y) {
    var w = pet.screenW(), h = pet.screenH();
    return { x: Math.max(_margin, Math.min(w - _margin, x)), y: Math.max(_margin, Math.min(h - _margin, y)) };
}

function aimAt(pet, tx, ty) {
    var t = _clamp(pet, tx, ty);
    _setAngle(pet, Math.atan2(t.y - pet.worldY, t.x - pet.worldX));
}

function aimAtRaw(pet, tx, ty) {
    _setAngle(pet, Math.atan2(ty - pet.worldY, tx - pet.worldX));
}

function _setAngle(pet, a) {
    pet.moveAngle = a;
    pet.facingRight = Math.cos(a) >= 0;
    pet.sprite.setDirection(a);
}

function randomTarget(pet) {
    var w = pet.screenW(), h = pet.screenH(), m = _margin * 2;
    // Up to 3 tries to avoid known-bad spots
    var best = null;
    for (var i = 0; i < 3; i++) {
        var t = { x: m + Math.random() * Math.max(1, w - m * 2), y: m + Math.random() * Math.max(1, h - m * 2) };
        if (!pet._ai || !pet._ai.Memory) return t;
        var affect = pet._ai.Memory.avoidedSpot(pet, t.x, t.y);
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
    var w = pet.screenW(), h = pet.screenH();
    var tx = Math.max(_margin, Math.min(w - _margin, pet.worldX + Math.cos(angle) * range));
    var ty = Math.max(_margin, Math.min(h - _margin, pet.worldY + Math.sin(angle) * range));
    pet.onJourney = false;
    _setAngle(pet, Math.atan2(ty - pet.worldY, tx - pet.worldX));
    pet.enterState("walk");
}

function journeyTo(pet, x, y) {
    var t = _clamp(pet, x, y);
    pet.onJourney = true;
    pet._journeyToWindow = false;
    pet.targetX = t.x;
    pet.targetY = t.y;
    aimAt(pet, t.x, t.y);
    pet.enterState("walk");
}

function journeyToWindow(pet) {
    var wp = pet.windowTracker.activeWindowPos;
    if (!wp) { journeyRandom(pet); return; }
    var wx = wp.x + wp.w / 2 - pet.screenX();
    var wy = wp.y + wp.h - pet.screenY() - 20;
    var t = _clamp(pet, wx, wy);
    pet.onJourney = true;
    pet._journeyToWindow = true;
    pet.targetX = t.x;
    pet.targetY = t.y;
    aimAt(pet, t.x, t.y);
    pet.enterState("walk");
}

function walkArrived(pet) {
    if (!pet.onJourney) {
        if (pet._ai && pet._ai.Memory) pet._ai.Memory.add(pet, "arrived");
        if (pet._ai && pet._ai.Intentions) pet._ai.Intentions.markJourneyed(pet);
        pet.enterState("idle");
        return;
    }

    if (pet._journeyToWindow) {
        var wp = pet.windowTracker.activeWindowPos;
        if (wp) {
            var t = _clamp(pet, wp.x + wp.w / 2 - pet.screenX(), wp.y + wp.h - pet.screenY() - 20);
            pet.targetX = t.x;
            pet.targetY = t.y;
        }
    }

    if (distTo(pet, pet.targetX, pet.targetY) < 80) {
        pet.onJourney = false;
        pet._journeyToWindow = false;
        if (pet._ai && pet._ai.Memory) pet._ai.Memory.add(pet, "arrived");
        if (pet._ai && pet._ai.Intentions) pet._ai.Intentions.markJourneyed(pet);
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

function bounce(pet) {
    pet.onJourney = false;
    pet._journeyToWindow = false;
    pet.enterState("idle");
}
