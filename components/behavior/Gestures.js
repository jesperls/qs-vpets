.pragma library

.import "../SpeciesProfile.js" as SpeciesProfile
.import "../SpriteSheet.js" as SpriteSheet
.import "Perception.js" as Perception

var HIDE_STATES = ["hide", "sink", "cringe", "trip"];
var ATTACK_STATES = [
    "attack", "shoot", "charge", "double", "leapForth",
    "strike", "quickStrike", "multiStrike", "spAttack", "swing"
];

function ambientGlanceRow(pet, currentRow) {
    var cur = (currentRow >= 0 && currentRow <= 7) ? currentRow : 1;
    var perc = Perception.perceive(pet);
    var toRow = SpriteSheet.angleToDirectionRow;

    if (pet.state_ === "perch") {
        if (perc.cursor.onMyScreen && perc.cursor.active && perc.cursor.gy >= perc.petGY - 20 && perc.cursor.dist < 560) {
            var perchCursorRow = toRow(Math.atan2(Math.max(12, perc.cursor.gy - perc.petGY), perc.cursor.gx - perc.petGX));
            if (perchCursorRow <= 2 || perchCursorRow >= 6) return perchCursorRow;
        }
        var ledgeRows = [0, 1, 7, 1, 7, 2, 6];
        return ledgeRows[Math.floor(Math.random() * ledgeRows.length)];
    }

    if (perc.cursor.onMyScreen && perc.cursor.active && perc.cursor.speed > 75 && perc.cursor.dist < 560 && Math.random() < 0.55) {
        return toRow(Math.atan2(perc.cursor.gy - perc.petGY, perc.cursor.gx - perc.petGX));
    }
    if (perc.nearest && perc.nearest.sameScreen && perc.nearest.dist < 140) {
        if (Math.random() < (perc.nearest.affinity < 0.40 ? 0.72 : 0.45)) {
            var awayPeer = Math.atan2(perc.petGY - perc.nearest.gy, perc.petGX - perc.nearest.gx) + (Math.random() - 0.5) * 0.9;
            return toRow(awayPeer);
        }
    } else if (perc.nearest && perc.nearest.sameScreen && perc.nearest.dist < 480 && perc.nearest.affinity >= 0.38) {
        if (perc.nearest.attending && Math.random() < 0.18) {
            return toRow(Math.atan2(perc.nearest.attentionGY - perc.petGY, perc.nearest.attentionGX - perc.petGX));
        }
        if (Math.random() < 0.12) {
            return toRow(Math.atan2(perc.nearest.gy - perc.petGY, perc.nearest.gx - perc.petGX));
        }
    }
    if (perc.cursor.onMyScreen && perc.cursor.active && perc.cursor.dist < 500 && Math.random() < 0.28) {
        return toRow(Math.atan2(perc.cursor.gy - perc.petGY, perc.cursor.gx - perc.petGX));
    }
    if (perc.win && perc.win.onMyScreen && Math.random() < 0.24) {
        return toRow(Math.atan2(perc.win.gy - perc.petGY, perc.win.gx - perc.petGX));
    }

    if (cur !== 0 && cur !== 4 && Math.random() < 0.56) {
        return cur;
    }

    var cozyRows = [7, 1, 7, 1, 6, 2, 0];
    var target = cozyRows[Math.floor(Math.random() * cozyRows.length)];
    if (target === cur) {
        target = cur === 0 ? (Math.random() < 0.5 ? 1 : 7) : cur;
    }
    // Step across the front semicircle (6-7-0-1-2) rather than spinning through the back (3-4-5).
    var frontOrder = [6, 7, 0, 1, 2];
    var ci = frontOrder.indexOf(cur);
    var ti = frontOrder.indexOf(target);
    if (ci !== -1 && ti !== -1 && Math.abs(ti - ci) > 2) {
        return frontOrder[ci + (ti > ci ? 2 : -2)];
    }
    return target;
}

function fidget(pet) {
    var p = pet.personality;
    var sp = SpeciesProfile.speciesOf(pet);
    var hold0 = SpeciesProfile.standSpec(sp).mode === "hold0";
    var skipChance = hold0
        ? (0.28 + p.patience * 0.10 + (1 - pet.alertness) * 0.10)
        : (0.38 + p.patience * 0.14 + (1 - pet.alertness) * 0.14);
    if (Math.random() < skipChance) return null;
    var animData = pet.sprite ? pet.sprite._animData : null;
    if (!animData) return null;

    var calm = SpeciesProfile.calmGesturesFor(pet);
    var actionMap = pet.sprite.actionMap || {};
    var pool = [];

    for (var i = 0; i < calm.length; i++) {
        if (SpriteSheet.hasDirectAnim(calm[i], animData, actionMap, sp)) {
            pool.push(calm[i], calm[i], calm[i], calm[i]);
        }
    }
    if (SpriteSheet.hasDirectAnim("rotate", animData, actionMap, sp)) {
        pool.push("rotate");
    }
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
}

function idleMicroAction(pet) {
    var p = pet.personality;
    var perc = Perception.perceive(pet);
    if (pet.state_ === "perch" && !pet._perchRiding && Math.random() < 0.36) {
        var curRel = pet._perchRelX !== undefined ? pet._perchRelX : 0.5;
        var nextRel;
        if (perc.cursor.onMyScreen && perc.cursor.active && perc.win
                && perc.win.address === pet.perchedWindowAddr && perc.win.w >= 280) {
            var cRel = Math.max(0.08, Math.min(0.92, (perc.cursor.gx - perc.win.x) / Math.max(1, perc.win.w - (pet.width || 64))));
            nextRel = curRel + Math.max(-0.34, Math.min(0.34, cRel - curRel));
        } else {
            var anchors = [0.10, 0.24, 0.50, 0.76, 0.90];
            nextRel = anchors[Math.floor(Math.random() * anchors.length)];
        }
        if (Math.abs(nextRel - curRel) >= 0.12) {
            return { kind: "ledge_shift", targetRelX: nextRel };
        }
    }
    if (pet.state_ === "idle" && perc.nearest && perc.nearest.sameScreen
            && (perc.nearest.dist < 115 || (perc.nearest.dist < 190 && perc.nearest.affinity < 0.38))
            && Math.random() < 0.58) {
        var away = Math.atan2(perc.petGY - perc.nearest.gy, perc.petGX - perc.nearest.gx) + (Math.random() - 0.5) * 1.0;
        return {
            kind: "potter",
            angle: away,
            durationMs: Math.round(1150 + Math.random() * 1200)
        };
    }

    if (pet.state_ === "idle" && (p.sleepiness > 0.58 || pet.restDrive > 0.42) && Math.random() < 0.14) {
        return { kind: "loaf" };
    }

    if (pet.state_ === "idle" && pet.alertness > 0.22 && Math.random() < 0.26) {
        var sw = pet.screenW ? pet.screenW() : 1920;
        var sh = pet.screenH ? pet.screenH() : 1080;
        var cx = sw * 0.5, cy = sh * 0.55;
        var wx = pet.worldX || 0, wy = pet.worldY || 0;
        var margin = 120;
        var angle;
        if (wx < margin || wx > sw - margin || wy < margin || wy > sh - margin) {
            angle = Math.atan2(cy - wy, cx - wx) + (Math.random() - 0.5) * 0.9;
        } else {
            angle = Math.random() * 2 * Math.PI;
        }
        return {
            kind: "potter",
            angle: angle,
            durationMs: Math.round(950 + Math.random() * 1150)
        };
    }

    var state = fidget(pet);
    if (!state) return null;
    return {
        kind: "fidget",
        state: state,
        frontRow: false
    };
}

function attackPool(pet) {
    var animData = pet.sprite ? pet.sprite._animData : null;
    if (!animData) return ATTACK_STATES.slice();
    var sp = SpeciesProfile.speciesOf(pet);
    var actionMap = pet.sprite.actionMap || {};
    var out = [];
    for (var i = 0; i < ATTACK_STATES.length; i++) {
        if (SpriteSheet.hasDirectAnim(ATTACK_STATES[i], animData, actionMap, sp)) {
            out.push(ATTACK_STATES[i]);
        }
    }
    return out;
}

function pickAvailable(pet, states) {
    if (!states || states.length === 0) return "idle";
    var animData = pet.sprite ? pet.sprite._animData : null;
    if (animData) {
        var sp = SpeciesProfile.speciesOf(pet);
        var actionMap = pet.sprite.actionMap || {};
        var available = [];
        for (var i = 0; i < states.length; i++) {
            if (SpriteSheet.hasDirectAnim(states[i], animData, actionMap, sp)) {
                available.push(states[i]);
            }
        }
        if (available.length > 0) return available[Math.floor(Math.random() * available.length)];
        if (animData.Nod) return "nod";
    }
    return states[Math.floor(Math.random() * states.length)];
}
