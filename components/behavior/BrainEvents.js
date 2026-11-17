.pragma library

.import "../SpeciesProfile.js" as SpeciesProfile
.import "Personality.js" as Personality
.import "Memory.js" as Memory
.import "Plans.js" as Plans
.import "Util.js" as Util
.import "BrainEventsUser.js" as EventsUser
.import "BrainEventsDesktop.js" as EventsDesktop
.import "BrainEventsSocial.js" as EventsSocial

function _cooldown(pet, key, ms) {
    if (!pet._eventCooldowns) pet._eventCooldowns = ({});
    var now = Util.now(pet);
    if (now - (pet._eventCooldowns[key] || 0) < ms) return true;
    pet._eventCooldowns[key] = now;
    return false;
}

function _findNearbyGuardian(pet, maxDist) {
    if (!pet.petManager || !pet.petManager.pets) return null;
    var all = pet.petManager.pets;
    var myGX = Util.petGX(pet);
    var myGY = Util.petGY(pet);
    var best = null;
    var bestDist = maxDist || 380;
    for (var i = 0; i < all.length; i++) {
        var g = all[i];
        if (!g || g === pet || g.state_ === "drag" || Util.isRestingState(g.state_)) continue;
        if (typeof g.screenX === "function" && typeof pet.screenX === "function"
                && (g.screenX() !== pet.screenX() || g.screenY() !== pet.screenY())) continue;
        var isGuard = SpeciesProfile.socialStyleOf(g) === "guardian"
                   || (g.personality && g.personality.boldness >= 0.58);
        if (!isGuard) continue;
        var d = Math.hypot(Util.petGX(g) - myGX, Util.petGY(g) - myGY);
        if (d < bestDist) {
            bestDist = d;
            best = g;
        }
    }
    return best;
}

function _findCalmElder(pet, maxDist) {
    if (!pet.petManager || !pet.petManager.pets) return null;
    var all = pet.petManager.pets;
    var myGX = Util.petGX(pet), myGY = Util.petGY(pet);
    var best = null;
    var bestDist = maxDist || 250;
    for (var i = 0; i < all.length; i++) {
        var e = all[i];
        if (!e || e === pet || e.state_ === "drag" || e.state_ === "airborne" || e.state_ === "zoomies") continue;
        if (typeof e.screenX === "function" && typeof pet.screenX === "function"
                && (e.screenX() !== pet.screenX() || e.screenY() !== pet.screenY())) continue;
        var ep = e.personality;
        var isElder = Util.isRestingState(e.state_) && ep && ep.composure >= 0.60 && (e.maturity || 0) >= 0.25;
        if (!isElder) continue;
        var d = Math.hypot(Util.petGX(e) - myGX, Util.petGY(e) - myGY);
        if (d < bestDist) {
            bestDist = d;
            best = e;
        }
    }
    return best;
}

function _trySocialReference(pet, pickFn) {
    var p = pet.personality;
    if (p.boldness >= 0.40 && (pet.maturity || 0) >= 0.25) return false;
    var elder = _findCalmElder(pet, 250);
    if (!elder) return false;
    var now = Util.now(pet);
    pet.attentionGX = Util.petGX(elder);
    pet.attentionGY = Util.petGY(elder);
    pet.attentionUntil = now + 4500;
    Util.faceGlobal(pet, pet.attentionGX, pet.attentionGY);
    pet.recentDrift = Personality.shiftRecent(pet.recentDrift, "boldness", 0.006);
    pet.recentDrift = Personality.shiftRecent(pet.recentDrift, "composure", 0.005);
    Memory.adjustRelation(pet, elder.petData.name, 0.008, 0.03, null, { respectDelta: 0.02 });
    Memory.recordEpisode(pet, "social_referenced", { valence: 0.28, withPet: elder.petData.name });
    Memory.thinkAloud(pet, "social_ref", "Checked " + elder.petData.name + "'s calm posture and relaxed", { minGapMs: 30000 });
    if (pet.state_ === "idle" && !Plans.hasActivePlan(pet)) {
        pet.enterState(pickFn(pet, ["nod"]));
    }
    return true;
}

function handleEvent(pet, type, data, nav, pickFn) {
    if (pet.state_ === "drag" && type !== "dropped") return;

    var loafing = pet.state_ === "loaf" || pet.state_ === "laying" || pet.state_ === "sit";
    var ctx = {
        p: pet.personality,
        now: Util.now(pet),
        loafing: loafing,
        resting: loafing || pet.state_ === "deepsleep",
        trust: pet.trust === undefined ? 0.35 : pet.trust,
        cooldown: _cooldown,
        findNearbyGuardian: _findNearbyGuardian,
        trySocialReference: _trySocialReference
    };

    if (EventsUser.handleUserEvent(pet, type, data, nav, pickFn, ctx)) return;
    if (EventsDesktop.handleDesktopEvent(pet, type, data, nav, pickFn, ctx)) return;
    EventsSocial.handleSocialEvent(pet, type, data, nav, pickFn, ctx);
}
