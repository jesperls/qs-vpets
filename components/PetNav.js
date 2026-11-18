.pragma library

.import "SpeciesProfile.js" as SpeciesProfile
.import "behavior/Topology.js" as Topology
.import "behavior/Brain.js" as Brain
.import "behavior/Memory.js" as Memory
.import "behavior/Social.js" as Social
.import "behavior/Util.js" as Util

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
        walkArrived: walkArrived,
        launchJumpTo: launchJumpTo,
        launchSoftDrop: launchSoftDrop,
        dropFromPerchIfNeeded: dropFromPerchIfNeeded
    };
}

function globalX(pet) { return pet.screenX() + pet.worldX; }
function globalY(pet) { return pet.screenY() + pet.worldY; }

function distToGlobal(pet, gx, gy) {
    return Math.hypot(globalX(pet) - gx, globalY(pet) - gy);
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
    if (pet.state_ === "perch" || pet.perchedWindowAddr) {
        dropFromPerchIfNeeded(pet);
        return;
    }
    pet.onJourney = false;
    pet.gait = "amble";
    if ("_wanderTurnVel" in pet) pet._wanderTurnVel = (Math.random() - 0.5) * 0.9;
    _setAngle(pet, angle !== undefined ? angle : Math.random() * 2 * Math.PI);
    pet.enterState("wander");
}

function fleeFrom(pet, gx, gy, dist) {
    if (pet.state_ === "perch" || pet.perchedWindowAddr) {
        dropFromPerchIfNeeded(pet);
        return;
    }
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

// Short parametric hop onto or off a nearby ledge with zero landing snap.
function launchJumpTo(pet, targetGX, targetGY, arcBoost) {
    var loco = SpeciesProfile.locomotionFor(pet);
    var pw = pet.width || 64, ph = pet.height || 64;
    var sx = pet.screenX(), sy = pet.screenY();
    var startX = pet.worldX;
    var startY = pet.worldY;
    var endX = Math.max(0, Math.min(pet.screenW() - pw, targetGX - sx));
    var endY = Math.max(0, Math.min(pet.screenH() - ph, targetGY - sy));
    var dx = endX - startX, dy = endY - startY;
    var dist = Math.hypot(dx, dy);
    if (dist > 185) {
        var scale = 185 / dist;
        endX = startX + dx * scale;
        endY = startY + dy * scale;
        dx = endX - startX;
        dy = endY - startY;
        dist = 185;
    }
    var gravScale = Math.sqrt(1 / Math.max(0.68, loco.gravityMult || 1.0));
    var duration = Math.max(0.22, Math.min(0.40, (0.20 + dist / 520) * gravScale));
    var arcHeight = Math.max(10, Math.min(28, 10 + dist * 0.14 + (arcBoost || 0) * 0.18));
    pet.vx = dx / duration;
    pet.vy = dy / duration;
    pet.vz = (4 * arcHeight) / duration;
    pet.altitude = 0;
    pet._tossPeakSpeed = 0;
    pet._bounceCount = 2;
    pet._jumpLanding = {
        parametric: true,
        startX: startX,
        startY: startY,
        endX: endX,
        endY: endY,
        elapsed: 0,
        duration: duration,
        arcHeight: arcHeight,
        gx: sx + endX,
        gy: sy + endY,
        softDrop: false,
        landAddr: ""
    };
    pet.onJourney = false;
    if (Math.abs(dx) > 3) pet.facingRight = dx >= 0;
    if (pet.sprite && pet.sprite.triggerSquash) pet.sprite.triggerSquash(0.90, 1.12);
    pet.enterState("airborne");
    if (pet.sprite) {
        pet.sprite.setState("leap");
        if (dist > 4 && pet.sprite.setDirection) pet.sprite.setDirection(Math.atan2(dy, dx));
    }
}

// Soft gravity drop when a perched window closes or shifts out from underneath.
function launchSoftDrop(pet, landGX, landGY, lowerPerchAddr) {
    var curGY = globalY(pet);
    var petH = pet.height || 64;
    var petW = pet.width || 64;
    var clampedLY = Math.max(pet.screenY(), Math.min(pet.screenY() + pet.screenH() - petH, landGY));
    var drop = Math.max(18, Math.min(260, clampedLY - curGY));
    pet.worldX = Math.max(0, Math.min(pet.screenW() - petW, landGX - pet.screenX()));
    pet.worldY = Math.max(0, Math.min(pet.screenH() - petH, clampedLY - pet.screenY()));
    pet.vx = 0;
    pet.vy = 0;
    pet.altitude = drop;
    pet.vz = 35;
    pet._tossPeakSpeed = 0;
    pet._bounceCount = 2;
    pet._jumpLanding = { gx: landGX, gy: clampedLY, softDrop: true, landAddr: lowerPerchAddr || "" };
    pet.onJourney = false;
    pet.enterState("airborne");
    if (pet.sprite) pet.sprite.setState("leap");
}

// Launch pet after drag-release; gentle drops settle immediately, throws enter ballistic flight.
function launchFromRelease(pet, vx, vy, initialAltitude) {
    pet._jumpLanding = null;
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
    var loco = SpeciesProfile.locomotionFor(pet);
    if (pet._jumpLanding && pet._jumpLanding.parametric) {
        var hop = pet._jumpLanding;
        hop.elapsed += dt;
        var u = Math.min(1, hop.elapsed / Math.max(0.05, hop.duration));
        pet.worldX = hop.startX + (hop.endX - hop.startX) * u;
        pet.worldY = hop.startY + (hop.endY - hop.startY) * u;
        pet.altitude = 4 * hop.arcHeight * u * (1 - u);
        if (u >= 1) {
            pet._jumpLanding = null;
            pet.altitude = 0;
            pet.vx = 0;
            pet.vy = 0;
            pet.vz = 0;
            if (pet.sprite && pet.sprite.triggerSquash) {
                pet.sprite.triggerSquash(
                    Math.min(1.16, (loco.landSquashX || 1.14) * 0.96),
                    Math.max(0.84, (loco.landSquashY || 0.86) * 1.02)
                );
            }
            Brain.onArrived(pet, _navHandle());
            return true;
        }
        return false;
    }

    var g = GRAVITY * (loco.gravityMult || 1.0);
    var targeted = !!pet._jumpLanding;
    pet.worldX += pet.vx * dt;
    pet.worldY += pet.vy * dt;
    if (!targeted) {
        var airDrag = loco.kind === "hover" ? 0.82 : 0.88;
        pet.vx *= Math.pow(airDrag, dt * 4);
        pet.vy *= Math.pow(airDrag, dt * 4);
    }

    pet.altitude += pet.vz * dt;
    pet.vz -= g * dt;

    if (pet.altitude <= 0) {
        pet.altitude = 0;
        var minBounceVz = loco.kind === "hover" ? 290 : 210;
        if (!targeted && Math.abs(pet.vz) > minBounceVz && (pet._bounceCount || 0) < 2) {
            pet.vz = -pet.vz * (loco.bounceMult || 0.42);
            pet.vx *= 0.65;
            pet.vy *= 0.65;
            pet._bounceCount = (pet._bounceCount || 0) + 1;
            if (pet.sprite && pet.sprite.triggerSquash) {
                pet.sprite.triggerSquash(loco.landSquashX || 1.22, loco.landSquashY || 0.78);
            }
            return false;
        }
        pet.vz = 0;
        var impactSpeed = pet._tossPeakSpeed || Math.hypot(pet.vx, pet.vy);
        pet.vx = 0;
        pet.vy = 0;
        pet._tossPeakSpeed = 0;

        if (targeted) {
            var land = pet._jumpLanding;
            pet._jumpLanding = null;
            var pw = pet.width || 64, ph = pet.height || 64;
            pet.worldX = Math.max(0, Math.min(pet.screenW() - pw, land.gx - pet.screenX()));
            pet.worldY = Math.max(0, Math.min(pet.screenH() - ph, land.gy - pet.screenY()));
            if (pet.sprite && pet.sprite.triggerSquash) {
                pet.sprite.triggerSquash(
                    Math.min(1.22, (loco.landSquashX || 1.18) * 0.98),
                    Math.max(0.78, (loco.landSquashY || 0.84) * 1.03)
                );
            }
            if (land.softDrop) {
                Brain.onEvent(pet, "perch_soft_landed", { landAddr: land.landAddr }, _navHandle());
            } else {
                Brain.onArrived(pet, _navHandle());
            }
            return true;
        }

        if (pet.sprite && pet.sprite.triggerSquash) {
            pet.sprite.triggerSquash(loco.landSquashX || 1.26, loco.landSquashY || 0.74);
        }
        Brain.onEvent(pet, "dropped", { speed: impactSpeed }, _navHandle());
        return true;
    }
    return false;
}

function _dropFromLostPerch(pet, wins) {
    pet._perchTrackedAddr = "";
    pet._perchRiding = false;
    var petW = pet.width || 64, petH = pet.height || 64;
    var curGX = globalX(pet), curGY = globalY(pet);
    var sx = pet.screenX(), sy = pet.screenY();
    var sw = pet.screenW(), sh = pet.screenH();
    var minLedgeY = Topology.minPerchY(Topology.currentScreen(pet), petH);
    var bestLedgeGY = Infinity;
    var bestAddr = "";

    for (var i = 0; i < wins.length; i++) {
        var w = wins[i];
        if (!w || w.fullscreen || w.title === "Pokémon Sanctuary" || w.w < 200 || w.h < 120 || w.y < minLedgeY) continue;
        var wcx = w.x + w.w * 0.5;
        if (wcx < sx || wcx >= sx + sw || w.y < sy || w.y >= sy + sh) continue;
        if (curGX + petW * 0.5 < w.x + 12 || curGX + petW * 0.5 > w.x + w.w - 12) continue;
        var ledgeGY = Math.max(sy, w.y - petH * 0.85);
        if (ledgeGY > curGY + 24 && ledgeGY - curGY < 380 && ledgeGY < bestLedgeGY) {
            bestLedgeGY = ledgeGY;
            bestAddr = w.address || "";
        }
    }

    var floorGY = Math.max(sy + 24, sy + sh - petH - 28);
    var landGY = bestAddr
        ? bestLedgeGY
        : Math.min(floorGY, curGY + Math.max(48, Math.min(210, floorGY - curGY)));
    Brain.onEvent(pet, "perch_dropping", { landAddr: bestAddr }, _navHandle());
    launchSoftDrop(pet, curGX, landGY, bestAddr);
}

function dropFromPerchIfNeeded(pet) {
    var wins = (pet.windowTracker && pet.windowTracker.visibleWindows) || [];
    _dropFromLostPerch(pet, wins);
}

function updatePerch(pet, dt) {
    if (pet.state_ !== "perch") return;
    var wins = (pet.windowTracker && pet.windowTracker.visibleWindows) || [];
    if (!pet.perchedWindowAddr) {
        _dropFromLostPerch(pet, wins);
        return;
    }
    var match = null;
    for (var i = 0; i < wins.length; i++) {
        if (wins[i].address === pet.perchedWindowAddr && !wins[i].fullscreen) {
            match = wins[i];
            break;
        }
    }
    var petW = pet.width || 64, petH = pet.height || 64;
    if (!match || match.y < Topology.minPerchY(Topology.currentScreen(pet), petH)) {
        _dropFromLostPerch(pet, wins);
        return;
    }

    var curGX = globalX(pet), curGY = globalY(pet);
    var span = Math.max(1, match.w - petW);

    if (pet._perchTrackedAddr !== pet.perchedWindowAddr) {
        pet._perchTrackedAddr = pet.perchedWindowAddr;
        pet._perchRelX = Math.max(0.06, Math.min(0.94, (curGX - match.x) / span));
        if ("_perchTargetRelX" in pet) pet._perchTargetRelX = pet._perchRelX;
        if ("_perchStrolling" in pet) pet._perchStrolling = false;
        pet._perchPrevWinX = match.x;
        pet._perchPrevWinY = match.y;
        pet._perchRiding = false;
        pet._perchSteadyTime = 0;
    }

    var stepDt = (dt && dt > 0) ? dt : 0.09;
    var winDX = match.x - (pet._perchPrevWinX !== undefined ? pet._perchPrevWinX : match.x);
    var winDY = match.y - (pet._perchPrevWinY !== undefined ? pet._perchPrevWinY : match.y);
    pet._perchPrevWinX = match.x;
    pet._perchPrevWinY = match.y;
    var winSpeed = Math.hypot(winDX, winDY) / stepDt;

    if (winSpeed <= 220 && !pet._perchRiding && "_perchTargetRelX" in pet && span >= 140) {
        var relDiff = pet._perchTargetRelX - pet._perchRelX;
        var pxDiff = relDiff * span;
        if (Math.abs(pxDiff) > 3) {
            var amblePx = 38 * SpeciesProfile.gaitMultiplier(pet, "amble") * stepDt;
            pet._perchRelX += Math.sign(relDiff) * Math.min(Math.abs(relDiff), amblePx / span);
            pet._perchStrolling = true;
            pet.facingRight = pxDiff >= 0;
            if (pet.sprite) {
                if (pet.sprite.currentState !== "walk") pet.sprite.setState("walk");
                if (pet.sprite.setDirection) pet.sprite.setDirection(pxDiff >= 0 ? 0 : Math.PI);
            }
        } else if (pet._perchStrolling) {
            pet._perchStrolling = false;
            pet._perchRelX = pet._perchTargetRelX;
            if (pet.sprite) {
                pet.sprite.setState("perch");
                if (pet.sprite.setDirectionRow) pet.sprite.setDirectionRow(pet.facingRight ? 1 : 7, false);
            }
        }
    }

    var wantGX = match.x + Math.max(8, Math.min(Math.max(8, span - 8), span * pet._perchRelX));
    var wantGY = Math.max(pet.screenY(), match.y - petH * 0.85);

    if (Math.hypot(wantGX - curGX, wantGY - curGY) > 640) {
        _dropFromLostPerch(pet, wins);
        return;
    }

    pet.worldX = Math.max(0, Math.min(pet.screenW() - petW, wantGX - pet.screenX()));
    pet.worldY = Math.max(0, Math.min(pet.screenH() - petH, wantGY - pet.screenY()));

    if (winSpeed > 220) {
        pet._perchRiding = true;
        pet._perchSteadyTime = 0;
        if (pet.sprite && pet.sprite.currentState !== "lostBalance") {
            pet.sprite.setState("lostBalance");
        }
    } else if (pet._perchRiding) {
        pet._perchSteadyTime = (pet._perchSteadyTime || 0) + stepDt;
        if (pet._perchSteadyTime >= 0.22) {
            pet._perchRiding = false;
            pet._perchSteadyTime = 0;
            if (pet.sprite) pet.sprite.setState("shake");
        }
    }
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

function _socialDeflection(pet) {
    if (!pet.petManager || !pet.petManager.pets) return 0;
    var all = pet.petManager.pets;
    if (all.length < 2) return 0;
    var sx = pet.screenX(), sy = pet.screenY();
    var myGX = sx + pet.worldX, myGY = sy + pet.worldY;
    var rowdy = pet.state_ === "zoomies" || pet.gait === "scamper";
    var now = Util.now(pet);
    var planOther = (pet.activePlan && pet.activePlan.otherName) ? pet.activePlan.otherName : "";
    var deflect = 0;

    for (var i = 0; i < all.length; i++) {
        var o = all[i];
        if (!o || o === pet || !o.petData || o.state_ === "drag" || o.state_ === "airborne") continue;
        if (o.screenX() !== sx || o.screenY() !== sy) continue;
        var oGX = sx + o.worldX, oGY = sy + o.worldY;
        var dx = myGX - oGX, dy = myGY - oGY;
        var d = Math.hypot(dx, dy);
        if (d > 94 || d < 1) continue;

        if (Util.isRestingState(o.state_)) {
            if (rowdy) {
                if (d < 30) Social.trampleSleeper(pet, o);
                continue;
            }
            if (planOther && o.petData.name === planOther) continue;
            var toSleeper = Math.atan2(-dy, -dx);
            var angDiff = ((toSleeper - pet.moveAngle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
            if (Math.abs(angDiff) < 1.25) {
                var side = angDiff >= 0 ? -1 : 1;
                deflect += side * ((94 - d) / 94) * 1.15;
            }
        } else if (!rowdy && (o.state_ === "walk" || o.state_ === "wander") && d < 74) {
            if (planOther && o.petData.name === planOther) continue;
            var rel = Memory.relationWith(pet, o.petData.name, o.personality, o.petData.sprite);
            if (rel.affinity >= 0.58 && (now - (pet._lastPassGreetMs || 0)) > 75000) {
                pet._lastPassGreetMs = now;
                o._lastPassGreetMs = now;
                Social.passingGreet(pet, o);
            } else if (pet.personality && o.personality
                    && (pet.personality.boldness + 0.18 < o.personality.boldness)
                    && rel.affinity < 0.52) {
                if (pet._liveSpeed !== undefined) pet._liveSpeed = Math.min(pet._liveSpeed, 24);
                deflect += (dy >= 0 ? 0.55 : -0.55) * ((74 - d) / 74);
            }
        }
    }
    return Math.max(-1.2, Math.min(1.2, deflect));
}

function _bezelSteer(pet) {
    var sw = pet.screenW ? pet.screenW() : 1920;
    var sh = pet.screenH ? pet.screenH() : 1080;
    var pw = pet.width || 64, ph = pet.height || 64;
    var wx = pet.worldX || 0, wy = pet.worldY || 0;
    var margin = pet.state_ === "zoomies" ? 78 : 54;
    var reachable = Topology.reachableScreens(pet);
    var curScr = Topology.currentScreen(pet);

    var pushX = 0, pushY = 0;
    if (wx < margin && (reachable.length <= 1 || !Topology.adjacentScreenAt(reachable, curScr, "left", wy, pw))) {
        pushX += (margin - wx) / margin;
    } else if (wx > sw - pw - margin && (reachable.length <= 1 || !Topology.adjacentScreenAt(reachable, curScr, "right", wy, pw))) {
        pushX -= (wx - (sw - pw - margin)) / margin;
    }
    if (wy < margin && (reachable.length <= 1 || !Topology.adjacentScreenAt(reachable, curScr, "up", wx, pw))) {
        pushY += (margin - wy) / margin;
    } else if (wy > sh - ph - margin && (reachable.length <= 1 || !Topology.adjacentScreenAt(reachable, curScr, "down", wx, pw))) {
        pushY -= (wy - (sh - ph - margin)) / margin;
    }
    if (pushX === 0 && pushY === 0) return 0;
    var inward = Math.atan2(pushY, pushX);
    var diff = ((inward - pet.moveAngle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    var strength = Math.min(1, Math.hypot(pushX, pushY)) * (pet.state_ === "zoomies" ? 3.8 : 2.5);
    return Math.max(-3.6, Math.min(3.6, diff * strength));
}

function updateSteering(pet, dt) {
    var loco = SpeciesProfile.locomotionFor(pet);
    var deflect = _socialDeflection(pet);
    if (!pet.onJourney) {
        var drift = (pet._wanderTurnVel || 0) + _bezelSteer(pet) + deflect * 2.2;
        if (Math.abs(drift) > 0.01) {
            _setAngle(pet, pet.moveAngle + drift * dt * (loco.turnMult || 1.0));
        }
        return;
    }
    if (Brain.checkStalkGlance && Brain.checkStalkGlance(pet, _navHandle())) return;
    if (Brain.checkMidJourneyDistraction && Brain.checkMidJourneyDistraction(pet, _navHandle())) return;
    var wp = Topology.routeWaypoint(pet, pet.targetGX, pet.targetGY);
    if (!wp.reachable) {
        pet.onJourney = false;
        Brain.onBlocked(pet);
        return;
    }
    var desired = Math.atan2(wp.gy - globalY(pet), wp.gx - globalX(pet)) + deflect;
    var turnRate = (wp.finalLeg ? (Math.PI * 2.3) : (Math.PI * 3.4)) * (loco.turnMult || 1.0);
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
    var desired = Math.atan2(wp.gy - globalY(pet), wp.gx - globalX(pet));
    _setAngle(pet, _steerAngle(pet.moveAngle, desired, Math.PI * 0.45));
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
        _setAngle(pet, a);
        return;
    }

    var sw = pet.screenW ? pet.screenW() : 1920;
    var sh = pet.screenH ? pet.screenH() : 1080;
    var toCenter = Math.atan2(sh * 0.5 - (pet.worldY || 0), sw * 0.5 - (pet.worldX || 0));
    var organicInward = toCenter + (Math.random() - 0.5) * 1.05;

    if (pet.state_ === "wander" && Math.random() < 0.58) {
        if ("_liveSpeed" in pet) pet._liveSpeed = 0;
        _setAngle(pet, organicInward);
        pet.enterState("idle");
        return;
    }
    if ("_liveSpeed" in pet) {
        pet._liveSpeed *= (pet.state_ === "zoomies" ? 0.72 : 0.42);
    }
    if ("_wanderTurnVel" in pet) {
        pet._wanderTurnVel = (Math.random() - 0.5) * (pet.state_ === "zoomies" ? 2.4 : 0.9);
    }
    if (pet.state_ === "zoomies" && pet.sprite && pet.sprite.triggerSquash) {
        pet.sprite.triggerSquash(1.09, 0.92);
    }
    _setAngle(pet, organicInward);
}
