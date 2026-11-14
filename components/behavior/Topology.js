.pragma library

var SEAM_TOLERANCE = 56;

function clamp(v, lo, hi) {
    if (!Number.isFinite(v)) return (lo + hi) * 0.5;
    if (hi < lo) return (lo + hi) * 0.5;
    return Math.max(lo, Math.min(hi, v));
}

function sameScreen(a, b) {
    return !!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function pointOnScreen(s, gx, gy) {
    return !!s && gx >= s.x && gx < s.x + s.width && gy >= s.y && gy < s.y + s.height;
}

function screenAt(screens, gx, gy) {
    if (!screens) return null;
    for (var i = 0; i < screens.length; i++) {
        if (pointOnScreen(screens[i], gx, gy)) return screens[i];
    }
    return null;
}

function nearestScreen(screens, gx, gy) {
    var exact = screenAt(screens, gx, gy);
    if (exact || !screens || screens.length === 0) return exact;
    var best = screens[0], bestDist = Infinity;
    for (var i = 0; i < screens.length; i++) {
        var s = screens[i];
        var cx = clamp(gx, s.x, s.x + s.width - 1);
        var cy = clamp(gy, s.y, s.y + s.height - 1);
        var d = Math.hypot(gx - cx, gy - cy);
        if (d < bestDist) {
            bestDist = d;
            best = s;
        }
    }
    return best;
}

function currentScreen(pet) {
    var sx = pet.screenX(), sy = pet.screenY();
    var screens = pet.allScreens ? pet.allScreens() : [];
    for (var i = 0; i < screens.length; i++) {
        if (screens[i].x === sx && screens[i].y === sy) return screens[i];
    }
    return { x: sx, y: sy, width: pet.screenW(), height: pet.screenH(), name: "", topInset: 0, bottomInset: 0 };
}

function seamBetween(a, b, petW, petH) {
    if (!a || !b || sameScreen(a, b)) return null;
    var minOvX = Math.min(petW || 64, 32);
    var minOvY = Math.min(petH || 64, 32);

    if (Math.abs(b.x - (a.x + a.width)) < SEAM_TOLERANCE) {
        var rLo = Math.max(a.y, b.y), rHi = Math.min(a.y + a.height, b.y + b.height);
        if (rHi - rLo >= minOvY) return { dir: "right", lo: rLo, hi: rHi };
    }
    if (Math.abs((b.x + b.width) - a.x) < SEAM_TOLERANCE) {
        var lLo = Math.max(a.y, b.y), lHi = Math.min(a.y + a.height, b.y + b.height);
        if (lHi - lLo >= minOvY) return { dir: "left", lo: lLo, hi: lHi };
    }
    if (Math.abs(b.y - (a.y + a.height)) < SEAM_TOLERANCE) {
        var dLo = Math.max(a.x, b.x), dHi = Math.min(a.x + a.width, b.x + b.width);
        if (dHi - dLo >= minOvX) return { dir: "down", lo: dLo, hi: dHi };
    }
    if (Math.abs((b.y + b.height) - a.y) < SEAM_TOLERANCE) {
        var uLo = Math.max(a.x, b.x), uHi = Math.min(a.x + a.width, b.x + b.width);
        if (uHi - uLo >= minOvX) return { dir: "up", lo: uLo, hi: uHi };
    }
    return null;
}

function adjacentScreenAt(screens, cur, dir, localPos, petSize) {
    if (!cur || !screens) return null;
    var half = (petSize || 64) * 0.5;
    var gp = (dir === "left" || dir === "right") ? (cur.y + localPos + half) : (cur.x + localPos + half);
    for (var i = 0; i < screens.length; i++) {
        var s = screens[i];
        var seam = seamBetween(cur, s, petSize, petSize);
        if (seam && seam.dir === dir && gp >= seam.lo && gp <= seam.hi) return s;
    }
    return null;
}

function reachableScreens(pet) {
    var screens = pet.allScreens ? pet.allScreens() : [];
    var cur = currentScreen(pet);
    if (screens.length <= 1) return screens.length === 1 ? screens : [cur];

    var pw = pet.width || 64, ph = pet.height || 64;
    var startIdx = -1;
    for (var i = 0; i < screens.length; i++) {
        if (sameScreen(screens[i], cur)) { startIdx = i; break; }
    }
    if (startIdx === -1) return [cur];

    var visited = {};
    visited[startIdx] = true;
    var queue = [startIdx];
    var out = [];
    while (queue.length > 0) {
        var u = queue.shift();
        out.push(screens[u]);
        for (var v = 0; v < screens.length; v++) {
            if (!visited[v] && seamBetween(screens[u], screens[v], pw, ph)) {
                visited[v] = true;
                queue.push(v);
            }
        }
    }
    return out;
}

function routeWaypoint(pet, targetGX, targetGY) {
    var pw = pet.width || 64, ph = pet.height || 64;
    var cur = currentScreen(pet);
    var screens = pet.allScreens ? pet.allScreens() : [];

    if (screens.length <= 1) {
        return {
            gx: clamp(targetGX, cur.x, cur.x + cur.width - pw),
            gy: clamp(targetGY, cur.y, cur.y + cur.height - ph),
            finalLeg: true,
            reachable: true
        };
    }

    var dest = screenAt(screens, targetGX + pw * 0.5, targetGY + ph * 0.5)
            || screenAt(screens, targetGX, targetGY)
            || nearestScreen(screens, targetGX, targetGY);

    if (!dest || sameScreen(cur, dest)) {
        return {
            gx: clamp(targetGX, cur.x, cur.x + cur.width - pw),
            gy: clamp(targetGY, cur.y, cur.y + cur.height - ph),
            finalLeg: true,
            reachable: true
        };
    }

    // BFS shortest monitor chain from cur -> dest.
    var startIdx = -1, destIdx = -1;
    for (var i = 0; i < screens.length; i++) {
        if (sameScreen(screens[i], cur)) startIdx = i;
        if (sameScreen(screens[i], dest)) destIdx = i;
    }
    if (startIdx === -1 || destIdx === -1) {
        return { gx: targetGX, gy: targetGY, finalLeg: true, reachable: false };
    }

    var parent = {};
    var seen = {};
    seen[startIdx] = true;
    var q = [startIdx];
    while (q.length > 0) {
        var u = q.shift();
        if (u === destIdx) break;
        for (var v = 0; v < screens.length; v++) {
            if (!seen[v] && seamBetween(screens[u], screens[v], pw, ph)) {
                seen[v] = true;
                parent[v] = u;
                q.push(v);
            }
        }
    }
    if (!seen[destIdx]) {
        return { gx: targetGX, gy: targetGY, finalLeg: true, reachable: false };
    }

    var hopIdx = destIdx;
    while (parent[hopIdx] !== startIdx) {
        hopIdx = parent[hopIdx];
    }
    var nextScr = screens[hopIdx];
    var seam = seamBetween(cur, nextScr, pw, ph);
    var curGX = cur.x + pet.worldX, curGY = cur.y + pet.worldY;
    var refGX = hopIdx === destIdx ? targetGX : (nextScr.x + (nextScr.width - pw) * 0.5);
    var refGY = hopIdx === destIdx ? targetGY : (nextScr.y + (nextScr.height - ph) * 0.5);

    if (seam.dir === "up" || seam.dir === "down") {
        var padX = Math.min(24, Math.max(4, (seam.hi - seam.lo - pw) * 0.15));
        var minGX = seam.lo + padX;
        var maxGX = seam.hi - pw - padX;
        var borderY = seam.dir === "up" ? cur.y : (cur.y + cur.height - ph);
        var tY = Math.abs(refGY - curGY) > 1 ? clamp((borderY - curGY) / (refGY - curGY), 0, 1) : 0.5;
        var crossX = clamp(curGX + (refGX - curGX) * tY, minGX, maxGX);

        // Align horizontally with a partial T-junction bridge before crossing the border.
        if (curGX + pw * 0.5 < seam.lo + 12 || curGX + pw * 0.5 > seam.hi - 12) {
            var stageY = seam.dir === "up" ? (cur.y + Math.min(28, cur.height * 0.1))
                                           : (cur.y + cur.height - ph - Math.min(28, cur.height * 0.1));
            return { gx: crossX, gy: stageY, finalLeg: false, reachable: true };
        }
        var stepIntoY = seam.dir === "up" ? (cur.y - Math.min(36, ph * 0.6))
                                          : (cur.y + cur.height - ph + Math.min(36, ph * 0.6));
        return { gx: crossX, gy: stepIntoY, finalLeg: false, reachable: true };
    }

    var padY = Math.min(24, Math.max(4, (seam.hi - seam.lo - ph) * 0.15));
    var minGY = seam.lo + padY;
    var maxGY = seam.hi - ph - padY;
    var borderX = seam.dir === "left" ? cur.x : (cur.x + cur.width - pw);
    var tX = Math.abs(refGX - curGX) > 1 ? clamp((borderX - curGX) / (refGX - curGX), 0, 1) : 0.5;
    var crossY = clamp(curGY + (refGY - curGY) * tX, minGY, maxGY);

    if (curGY + ph * 0.5 < seam.lo + 12 || curGY + ph * 0.5 > seam.hi - 12) {
        var stageX = seam.dir === "left" ? (cur.x + Math.min(28, cur.width * 0.1))
                                         : (cur.x + cur.width - pw - Math.min(28, cur.width * 0.1));
        return { gx: stageX, gy: crossY, finalLeg: false, reachable: true };
    }
    var stepIntoX = seam.dir === "left" ? (cur.x - Math.min(36, pw * 0.6))
                                        : (cur.x + cur.width - pw + Math.min(36, pw * 0.6));
    return { gx: stepIntoX, gy: crossY, finalLeg: false, reachable: true };
}
