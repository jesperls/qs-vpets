.import "ai/Topology.js" as Topology
.import "ai/Memory.js" as Memory
.import "ai/Brain.js" as Brain

var ARRIVAL_TOLERANCE = 44;
var MAX_BLOCKS = 2;
var GRAVITY = 1450; // px/s^2 for vertical altitude arc

function _navHandle() {
    return {
        journeyToGlobal: journeyToGlobal,
        resumeJourney: resumeJourney,
        wanderStart: wanderStart,
        fleeFrom: fleeFrom,
        randomDir: randomDir,
        walkArrived: walkArrived
    };
}

function globalX(pet) { return pet.screenX() + pet.worldX; }
function globalY(pet) { return pet.screenY() + pet.worldY; }

function distToGlobal(pet, gx, gy) {
    return Math.hypot(globalX(pet) - gx, globalY(pet) - gy);
}

function inHomeArea(pet) {
    return distToGlobal(pet, pet.homeGX, pet.homeGY) < pet.homeRadius;
}

function _setAngle(pet, a) {
    pet.moveAngle = a;
    pet.facingRight = Math.cos(a) >= 0;
    pet.sprite.setDirection(a);
}

function _steerAngle(current, target, maxTurn) {
    var diff = ((target - current + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    if (Math.abs(diff) <= maxTurn) return target;
    return current + Math.sign(diff) * maxTurn;
}

function _aimLeg(pet) {
    var wp = Topology.routeWaypoint(pet, pet.targetGX, pet.targetGY);
    _setAngle(pet, Math.atan2(wp.gy - globalY(pet), wp.gx - globalX(pet)));
}

function journeyToGlobal(pet, gx, gy) {
    var wp = Topology.routeWaypoint(pet, gx, gy);
    if (!wp.reachable) {
        pet.onJourney = false;
        Brain.onBlocked(pet);
        return;
    }
    pet.onJourney = true;
    pet.journeyBlocked = 0;
    pet.targetGX = gx;
    pet.targetGY = gy;
    if (pet.intention) pet.intention.travel = true;
    _setAngle(pet, Math.atan2(wp.gy - globalY(pet), wp.gx - globalX(pet)));
    pet.enterState("walk");
}

function resumeJourney(pet) {
    pet.journeyBlocked = 0;
    _aimLeg(pet);
    pet.enterState("walk");
}

function wanderStart(pet, angle) {
    pet.onJourney = false;
    pet.gait = "amble";
    _setAngle(pet, angle !== undefined ? angle : Math.random() * 2 * Math.PI);
    pet.enterState("wander");
}

function fleeFrom(pet, gx, gy, dist) {
    var away = Math.atan2(globalY(pet) - gy, globalX(pet) - gx) + (Math.random() - 0.5) * 0.55;
    var sx = pet.screenX(), sy = pet.screenY();
    var tx = Math.max(sx, Math.min(sx + pet.screenW() - pet.width, globalX(pet) + Math.cos(away) * dist));
    var ty = Math.max(sy, Math.min(sy + pet.screenH() - pet.height, globalY(pet) + Math.sin(away) * dist));
    pet.onJourney = true;
    pet.journeyBlocked = 0;
    pet.targetGX = tx;
    pet.targetGY = ty;
    _aimLeg(pet);
    pet.enterState("walk");
}

function randomDir(pet) {
    _setAngle(pet, Math.random() * 2 * Math.PI);
}

// Launch pet after drag-release; gentle drops settle immediately, throws enter ballistic flight.
function launchFromRelease(pet, vx, vy, initialAltitude) {
    var speed = Math.hypot(vx, vy);
    if (speed < 150 && (initialAltitude || 0) < 10) {
        pet.altitude = 0;
        pet.vx = 0;
        pet.vy = 0;
        pet.vz = 0;
        Brain.onEvent(pet, "dropped", { speed: speed }, _navHandle());
        return;
    }

    var capped = Math.min(1350, speed);
    var scale = speed > 0 ? capped / speed : 0;
    pet.vx = vx * scale;
    pet.vy = vy * scale;
    pet.altitude = Math.max(8, initialAltitude || 18);
    pet.vz = Math.min(480, 110 + capped * 0.24);
    pet._tossPeakSpeed = capped;
    pet._bounceCount = 0;
    pet.onJourney = false;
    if (Math.abs(pet.vx) > 10) pet.facingRight = pet.vx >= 0;
    pet.enterState("airborne");
}

function updateAirborne(pet, dt) {
    pet.worldX += pet.vx * dt;
    pet.worldY += pet.vy * dt;
    pet.vx *= Math.pow(0.88, dt * 4);
    pet.vy *= Math.pow(0.88, dt * 4);

    pet.altitude += pet.vz * dt;
    pet.vz -= GRAVITY * dt;

    if (pet.altitude <= 0) {
        pet.altitude = 0;
        if (Math.abs(pet.vz) > 210 && (pet._bounceCount || 0) < 2) {
            pet.vz = -pet.vz * 0.42;
            pet.vx *= 0.65;
            pet.vy *= 0.65;
            pet._bounceCount = (pet._bounceCount || 0) + 1;
            if (pet.sprite && pet.sprite.triggerSquash) pet.sprite.triggerSquash(1.22, 0.78);
            return false;
        }
        pet.vz = 0;
        var impactSpeed = pet._tossPeakSpeed || Math.hypot(pet.vx, pet.vy);
        pet.vx = 0;
        pet.vy = 0;
        pet._tossPeakSpeed = 0;
        if (pet.sprite && pet.sprite.triggerSquash) pet.sprite.triggerSquash(1.26, 0.74);
        Brain.onEvent(pet, "dropped", { speed: impactSpeed }, _navHandle());
        return true;
    }
    return false;
}

// Keep a perched pet anchored to its window's top edge, or hop down if the window disappears/jumps.
function updatePerch(pet) {
    if (pet.state_ !== "perch" || !pet.perchedWindowAddr) return;
    var wins = (pet.windowTracker && pet.windowTracker.visibleWindows) || [];
    var match = null;
    for (var i = 0; i < wins.length; i++) {
        if (wins[i].address === pet.perchedWindowAddr && !wins[i].fullscreen) {
            match = wins[i];
            break;
        }
    }
    if (!match) {
        Brain.onEvent(pet, "perch_lost", null, _navHandle());
        return;
    }
    var petH = pet.height || 64;
    var wantGY = Math.max(pet.screenY(), match.y - petH * 0.85);
    var curGX = globalX(pet), curGY = globalY(pet);
    if (Math.abs(curGY - wantGY) > 180 || curGX < match.x - 40 || curGX > match.x + match.w + 40) {
        Brain.onEvent(pet, "perch_lost", null, _navHandle());
        return;
    }
    pet.worldY = Math.max(0, Math.min(pet.screenH() - petH, wantGY - pet.screenY()));
}

function trySnapArrive(pet, step) {
    if (!pet.onJourney) return false;
    var wp = Topology.routeWaypoint(pet, pet.targetGX, pet.targetGY);
    if (!wp.finalLeg) return false;
    if (distToGlobal(pet, wp.gx, wp.gy) > step) return false;
    pet.worldX = Math.max(0, Math.min(pet.screenW() - pet.width, wp.gx - pet.screenX()));
    pet.worldY = Math.max(0, Math.min(pet.screenH() - pet.height, wp.gy - pet.screenY()));
    walkArrived(pet);
    return true;
}

function updateSteering(pet, dt) {
    if (!pet.onJourney) return;
    var wp = Topology.routeWaypoint(pet, pet.targetGX, pet.targetGY);
    if (!wp.reachable) {
        pet.onJourney = false;
        Brain.onBlocked(pet);
        return;
    }
    var desired = Math.atan2(wp.gy - globalY(pet), wp.gx - globalX(pet));
    var turnRate = wp.finalLeg ? (Math.PI * 2.4) : (Math.PI * 3.6);
    var next = _steerAngle(pet.moveAngle, desired, turnRate * dt);
    if (Math.abs(next - pet.moveAngle) > 0.01) {
        _setAngle(pet, next);
    }
}

function walkArrived(pet) {
    if (!pet.onJourney) {
        pet.enterState("idle");
        return;
    }
    if (!Brain.retarget(pet)) {
        pet.onJourney = false;
        Brain.onBlocked(pet);
        return;
    }
    var wp = Topology.routeWaypoint(pet, pet.targetGX, pet.targetGY);
    if (!wp.reachable) {
        pet.onJourney = false;
        Brain.onBlocked(pet);
        return;
    }
    if (wp.finalLeg && distToGlobal(pet, wp.gx, wp.gy) < ARRIVAL_TOLERANCE) {
        pet.onJourney = false;
        Brain.onArrived(pet, _navHandle());
        return;
    }
    _setAngle(pet, Math.atan2(wp.gy - globalY(pet), wp.gx - globalX(pet)));
    pet.restartWalk();
}

function reflectOffWall(pet, hitX, hitY) {
    if (pet.state_ === "airborne") {
        if (hitX) pet.vx = -pet.vx * 0.65;
        if (hitY) pet.vy = -pet.vy * 0.65;
        pet.facingRight = pet.vx >= 0;
        return;
    }

    var a = pet.moveAngle;
    if (hitX) a = Math.PI - a;
    if (hitY) a = -a;

    if (pet.onJourney) {
        var wp = Topology.routeWaypoint(pet, pet.targetGX, pet.targetGY);
        if (!wp.reachable) {
            pet.onJourney = false;
            Brain.onBlocked(pet);
            return;
        }
        if (!wp.finalLeg) {
            _setAngle(pet, Math.atan2(wp.gy - globalY(pet), wp.gx - globalX(pet)));
            return;
        }
        pet.journeyBlocked = (pet.journeyBlocked || 0) + 1;
        var beyondX = hitX && Math.abs(wp.gx - globalX(pet)) > 40
                   && Math.sign(wp.gx - globalX(pet)) === Math.sign(Math.cos(pet.moveAngle));
        var beyondY = hitY && Math.abs(wp.gy - globalY(pet)) > 40
                   && Math.sign(wp.gy - globalY(pet)) === Math.sign(Math.sin(pet.moveAngle));
        if (pet.journeyBlocked > MAX_BLOCKS || beyondX || beyondY) {
            pet.onJourney = false;
            Brain.onBlocked(pet);
            return;
        }
    }
    _setAngle(pet, a);
}
