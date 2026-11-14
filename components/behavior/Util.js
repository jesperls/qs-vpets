.pragma library

.import "Topology.js" as Topology

function now(pet) {
    return (pet && pet._simNow) ? pet._simNow : Date.now();
}

function clamp(v, lo, hi, fallback) {
    if (!Number.isFinite(v)) return fallback !== undefined ? fallback : (lo + hi) * 0.5;
    if (hi < lo) return (lo + hi) * 0.5;
    return Math.max(lo, Math.min(hi, v));
}

function clamp01(v, fallback) {
    return clamp(v, 0, 1, fallback !== undefined ? fallback : 0.5);
}

function petGX(pet) {
    if (!pet) return 0;
    if (typeof pet.screenX === "function") return pet.screenX() + (pet.worldX || 0);
    return Number(pet.gx || 0);
}

function petGY(pet) {
    if (!pet) return 0;
    if (typeof pet.screenY === "function") return pet.screenY() + (pet.worldY || 0);
    return Number(pet.gy || 0);
}

function distBetween(a, b) {
    return Math.hypot(petGX(b) - petGX(a), petGY(b) - petGY(a));
}

function findPet(pet, name) {
    if (!name || !pet || !pet.petManager || !pet.petManager.pets) return null;
    var all = pet.petManager.pets;
    for (var i = 0; i < all.length; i++) {
        var o = all[i];
        if (o && o !== pet && o.petData && o.petData.name === name) return o;
    }
    return null;
}

function faceGlobal(pet, gx, gy) {
    if (!pet) return;
    var dx = gx - petGX(pet);
    var dy = gy - petGY(pet);
    pet.facingRight = dx >= 0;
    if (pet.sprite && pet.sprite.setDirection) {
        pet.sprite.setDirection(Math.atan2(dy, dx));
    }
}

function clampToScreen(pet, gx, gy, padX, padY) {
    var scr = Topology.currentScreen(pet);
    var pw = pet.width || 64, ph = pet.height || 64;
    var px = padX !== undefined ? padX : 28;
    var py = padY !== undefined ? padY : 28;
    var minX = scr.x + px;
    var maxX = Math.max(minX, scr.x + scr.width - pw - px);
    var minY = scr.y + (scr.topInset || 0) + py;
    var maxY = Math.max(minY, scr.y + scr.height - (scr.bottomInset || 0) - ph - Math.max(20, py - 4));
    return {
        gx: Topology.clamp(gx, minX, maxX),
        gy: Topology.clamp(gy, minY, maxY)
    };
}

function isRestingState(state) {
    return state === "loaf" || state === "sit" || state === "deepsleep";
}

function bumpMemoryRev(pet) {
    if (pet && typeof pet.memoryRevision === "number") {
        pet.memoryRevision = pet.memoryRevision + 1;
    }
}
