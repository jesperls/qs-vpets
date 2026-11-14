.pragma library

.import "../SpeciesProfile.js" as SpeciesProfile
.import "../SpriteSheet.js" as SpriteSheet
.import "Personality.js" as Personality
.import "Memory.js" as Memory
.import "Drives.js" as Drives
.import "Util.js" as Util

var _now = Util.now;

function peerCooldownMs(pet, kind) {
    var p = pet.personality;
    if (kind === "squabble" || kind === "move_away") {
        return Math.round(180000 + (1 - p.sociability) * 180000);
    }
    var sparkBonus = Personality.hasQuirk(pet, "pack_spark") ? 90000 : 0;
    var hermitPad = Personality.hasQuirk(pet, "cozy_hermit") ? 120000 : 0;
    var ms = 300000 + (1 - p.sociability) * 320000 + p.sleepiness * 130000 + hermitPad - sparkBonus;
    return Math.round(Math.max(210000, ms));
}

function markPeerBout(pet, kind) {
    if (!pet) return;
    pet.nextPeerSocialAt = _now(pet) + peerCooldownMs(pet, kind || "play");
}

function canInitiatePeerBout(pet, minSceneGapMs) {
    if (!pet) return false;
    if (_now(pet) < (pet.nextPeerSocialAt || 0)) return false;
    var gap = minSceneGapMs !== undefined ? minSceneGapMs : 135000;
    if (pet.petManager && pet.petManager.allowSocialBout && !pet.petManager.allowSocialBout(gap)) {
        return false;
    }
    return true;
}

function claimPeerBout(pet, kind, minSceneGapMs) {
    var gap = minSceneGapMs !== undefined ? minSceneGapMs : 135000;
    if (pet && pet.petManager && pet.petManager.claimSocialBout) {
        pet.petManager.claimSocialBout(gap);
    }
    markPeerBout(pet, kind || "play");
}

function preferredPlayMode(pet, other) {
    var myStyle = SpeciesProfile.socialStyleOf(pet);
    var oStyle = SpeciesProfile.socialStyleOf(other);
    var rel = Memory.relationWith(pet, other.petData.name, other.personality, other.petData.sprite);
    if (myStyle === "brawler" || oStyle === "brawler"
            || (pet.personality.boldness > 0.62 && other.personality.boldness > 0.58 && (rel.sparCount || 0) >= 1)) {
        return "spar";
    }
    if (myStyle === "sprinter" || oStyle === "sprinter"
            || (pet.personality.energy + other.personality.energy > 1.24)) {
        return "tag";
    }
    return "duet";
}

function notifyBystanders(actorA, actorB, kind) {
    if (!actorA || !actorA.petManager || !actorA.petManager.pets) return;
    var all = actorA.petManager.pets;
    var sx = actorA.screenX(), sy = actorA.screenY();
    var midX = (actorA.screenX() + actorA.worldX + (actorB ? actorB.screenX() + actorB.worldX : actorA.screenX() + actorA.worldX)) * 0.5;
    var midY = (actorA.screenY() + actorA.worldY + (actorB ? actorB.screenY() + actorB.worldY : actorA.screenY() + actorA.worldY)) * 0.5;
    var maxDist = kind === "squabble" ? 560 : 400;
    var notified = 0;

    for (var i = 0; i < all.length; i++) {
        var b = all[i];
        if (!b || b === actorA || b === actorB) continue;
        if (b._retiringToPen || b.state_ === "drag" || b.state_ === "airborne") continue;
        if (b.screenX() !== sx || b.screenY() !== sy) continue;
        var bgx = b.screenX() + b.worldX, bgy = b.screenY() + b.worldY;
        if (Math.hypot(bgx - midX, bgy - midY) > maxDist) continue;
        b.socialEvent("group_" + kind, actorA, { secondPet: actorB });
        if (++notified >= 2) break;
    }
}

function greet(pet, other) {
    var oName = other.petData.name;
    markPeerBout(pet, "greet");
    Memory.adjustRelation(pet, oName, 0.014, 0.06, null, { outcome: "greet" });
    Memory.recordEpisode(pet, "greeted", { valence: 0.30, withPet: oName });
    Memory.thinkAloud(pet, "greet", "Checked in warmly with best friend " + oName);
    pet.socialDrive = Math.max(0, pet.socialDrive - 0.22);
    pet.mood = Drives.clamp01(pet.mood + 0.05);
    other.socialEvent("greet", pet);
}

function bidPlay(pet, other, isRetry) {
    var oName = other.petData.name;
    markPeerBout(pet, "invite");
    pet.socialDrive = Math.max(0, pet.socialDrive - 0.10);
    Memory.thinkAloud(
        pet,
        isRetry ? "play_bid_retry" : "play_bid",
        isRetry ? ("Hopped around trying one more play-bow for " + oName) : ("Play-bowed eagerly to " + oName)
    );
    other.socialEvent("play_bid", pet, { retry: !!isRetry });
}

function invitePlay(pet, other) {
    bidPlay(pet, other, false);
}

function startSpar(pet, other) {
    var oName = other.petData.name;
    markPeerBout(pet, "spar");
    Memory.thinkAloud(pet, "spar_challenge", "Squared up for a friendly spar with " + oName);
    other.socialEvent("spar_challenge", pet);
    if (!pet.activePlan || pet.activePlan.sparAccepted !== false) {
        notifyBystanders(pet, other, "spar");
    }
}

function sparExchange(pet, other) {
    var oName = other.petData.name;
    Memory.adjustRelation(pet, oName, 0.016, 0.06, "spar", { respectDelta: 0.04, outcome: "spar" });
    Memory.recordEpisode(pet, "sparred", { valence: 0.48, salience: 0.66, withPet: oName });
    Memory.thinkAloud(pet, "spar_clash", "Traded crisp sparring moves with " + oName);
    pet.playDrive = Math.max(0, pet.playDrive - 0.24);
    pet.socialDrive = Math.max(0, pet.socialDrive - 0.16);
    pet.mood = Drives.clamp01(pet.mood + 0.07);
    Drives.happier(pet, 0.03);
    other.socialEvent("spar_hit", pet);
}

function startChase(pet, other) {
    var oName = other.petData.name;
    markPeerBout(pet, "chase");
    other.socialEvent("chase", pet);
    if (pet.activePlan && pet.activePlan.chaseRejected) return;
    Memory.adjustRelation(pet, oName, 0.018, 0.07, "play", { outcome: "tag" });
    Memory.recordEpisode(pet, "chase_bout", { valence: 0.52, salience: 0.66, withPet: oName });
    Memory.thinkAloud(pet, "chase", "Chasing " + oName + " in a game of tag");
    pet.playDrive = Math.max(0, pet.playDrive - 0.24);
    pet.socialDrive = Math.max(0, pet.socialDrive - 0.16);
    pet.mood = Drives.clamp01(pet.mood + 0.07);
    Drives.happier(pet, 0.03);
    if (pet.emitEmote) pet.emitEmote("exclaim");
    notifyBystanders(pet, other, "chase");
}

function reverseChase(pet, other) {
    var oName = other.petData.name;
    Memory.adjustRelation(pet, oName, 0.014, 0.04, "play", { outcome: "tag" });
    Memory.thinkAloud(pet, "reverse_chase", "Whirled around to chase " + oName + " right back");
    if (pet.emitEmote) pet.emitEmote("exclaim");
    other.socialEvent("reverse_chase", pet);
}

function showOff(pet, other) {
    var oName = other.petData.name;
    markPeerBout(pet, "show_off");
    pet.playDrive = Math.max(0, pet.playDrive - 0.18);
    Memory.thinkAloud(pet, "show_off", "Showed off a flair move near " + oName);
    other.socialEvent("show_off", pet);
    notifyBystanders(pet, other, "duet");
}

function syncGroove(pet, other) {
    var oName = other.petData.name;
    Memory.adjustRelation(pet, oName, 0.015, 0.05, "play", { outcome: "duet" });
    Memory.recordEpisode(pet, "music_groove", { valence: 0.45, music: true, withPet: oName });
    pet.mood = Drives.clamp01(pet.mood + 0.05);
    other.socialEvent("groove", pet);
}

function shareDiscovery(pet, other, topic) {
    var oName = other.petData.name;
    markPeerBout(pet, "greet");
    Memory.adjustRelation(pet, oName, 0.016, 0.06, null, { outcome: "greet" });
    Memory.recordEpisode(pet, "greeted", { valence: 0.35, withPet: oName, note: topic || "story" });
    Memory.thinkAloud(pet, "story", "Checked in happily with " + oName);
    pet.socialDrive = Math.max(0, pet.socialDrive - 0.22);
    pet.mood = Drives.clamp01(pet.mood + 0.05);
    other.socialEvent("story", pet, { topic: topic || "adventure" });
}

function restBeside(pet, other) {
    var oName = other.petData.name;
    markPeerBout(pet, "nap");
    var rel = Memory.relationWith(pet, oName, other.personality, other.petData.sprite);
    var bonus = rel.affinity < 0.4 ? 0.024 : 0.016;
    Memory.adjustRelation(pet, oName, bonus, 0.05, "nap", { outcome: "nap" });
    Memory.recordEpisode(pet, "rested_with", { valence: 0.4, withPet: oName });
    Memory.thinkAloud(pet, "nap_buddy", "Settled down beside " + oName);
    pet.mood = Drives.clamp01(pet.mood + 0.04);
    other.socialEvent("cuddle", pet);
}

function squabble(pet, other) {
    var oName = other.petData.name;
    markPeerBout(pet, "squabble");
    Memory.adjustRelation(pet, oName, -0.028, 0.04, "friction", { outcome: "squabble" });
    Memory.recordEpisode(pet, "squabbled", { valence: -0.38, salience: 0.58, withPet: oName });
    Memory.thinkAloud(pet, "squabble", "Bristled over personal space with " + oName);
    pet.mood = Math.max(0, pet.mood - 0.04);
    if (pet.emitEmote) pet.emitEmote("frustrated");
    other.socialEvent("squabble", pet);
    notifyBystanders(pet, other, "squabble");
}

function mediate(peacekeeper, petA, petB) {
    if (!peacekeeper || !petA || !petB) return;
    markPeerBout(peacekeeper, "mediate");
    Memory.recordEpisode(peacekeeper, "mediated", {
        valence: 0.42,
        salience: 0.68,
        withPet: petA.petData.name
    });
    Memory.thinkAloud(
        peacekeeper,
        "mediate",
        "Stepped in calmly to settle " + petA.petData.name + " and " + petB.petData.name
    );
    Memory.addJournalEntry(
        peacekeeper,
        "Calmed a squabble between " + petA.petData.name + " and " + petB.petData.name + ".",
        "social"
    );
    peacekeeper.mood = Drives.clamp01(peacekeeper.mood + 0.04);
    petA.socialEvent("mediated", peacekeeper, { otherSquabbler: petB });
    petB.socialEvent("mediated", peacekeeper, { otherSquabbler: petA });
}

function annoy(pet, other) {
    var oName = other.petData.name;
    markPeerBout(pet, "move_away");
    Memory.adjustRelation(pet, oName, -0.022, 0.03, "friction", { outcome: "squabble" });
    Memory.recordEpisode(pet, "annoyed", { valence: -0.32, withPet: oName });
    Memory.thinkAloud(pet, "annoy", "Stepped away for personal space from " + oName);
    pet.mood = Math.max(0, pet.mood - 0.03);
    other.socialEvent("annoy", pet);
}

function pounce(pet, other) {
    var oName = other.petData.name;
    markPeerBout(pet, "spar");
    Memory.adjustRelation(pet, oName, 0.006, 0.05, "play", { outcome: "spar" });
    Memory.recordEpisode(pet, "pounced", { valence: 0.35, withPet: oName });
    Memory.thinkAloud(pet, "pounce", "Play-pounced " + oName);
    pet.playDrive = Math.max(0, pet.playDrive - 0.18);
    pet.socialDrive = Math.max(0, pet.socialDrive - 0.08);
    pet.mood = Drives.clamp01(pet.mood + 0.05);
    Drives.happier(pet, 0.02);
    other.socialEvent("pounce", pet);
}

function sparBack(pet, other) {
    var oName = other.petData.name;
    markPeerBout(pet, "spar");
    Memory.adjustRelation(pet, oName, 0.018, 0.06, "spar", { respectDelta: 0.035, outcome: "spar" });
    Memory.recordEpisode(pet, "sparred", { valence: 0.45, withPet: oName });
    Memory.thinkAloud(pet, "spar", "Tumbled playfully with " + oName);
    pet.playDrive = Math.max(0, pet.playDrive - 0.18);
    pet.mood = Drives.clamp01(pet.mood + 0.06);
    Drives.happier(pet, 0.025);
    other.socialEvent("spar", pet);
}

function rebuff(pet, other) {
    var oName = other.petData.name;
    markPeerBout(pet, "squabble");
    Memory.adjustRelation(pet, oName, -0.024, 0.03, "friction", { outcome: "rebuffed" });
    Memory.recordEpisode(pet, "annoyed_by", { valence: -0.4, withPet: oName });
    Memory.thinkAloud(pet, "rebuff", "Snapped a warning at " + oName);
    pet.mood = Math.max(0, pet.mood - 0.06);
    if (pet.emitEmote) pet.emitEmote("frustrated");
    other.socialEvent("rebuff", pet);
}

function isPeerLookingAt(observer, target) {
    if (!observer || !target) return false;
    var ox = Util.petGX(observer), oy = Util.petGY(observer);
    var tx = Util.petGX(target), ty = Util.petGY(target);
    var towardRow = SpriteSheet.angleToDirectionRow(Math.atan2(ty - oy, tx - ox));
    var curRow = (observer.sprite && observer.sprite._dirRow !== undefined)
        ? observer.sprite._dirRow
        : (observer.facingRight ? 2 : 6);
    var diff = Math.abs(towardRow - curRow);
    diff = Math.min(diff, 8 - diff);
    return diff <= 1;
}

function sneakBoop(pet, other) {
    var oName = other.petData.name;
    markPeerBout(pet, "play");
    Memory.adjustRelation(pet, oName, 0.015, 0.06, "play", { outcome: "tag" });
    Memory.recordEpisode(pet, "sneak_boop", { valence: 0.46, salience: 0.62, withPet: oName });
    Memory.thinkAloud(pet, "sneak_boop", "Snuck up behind " + oName + " for a playful boop");
    pet.playDrive = Math.max(0, pet.playDrive - 0.22);
    pet.socialDrive = Math.max(0, pet.socialDrive - 0.14);
    pet.mood = Drives.clamp01(pet.mood + 0.06);
    Drives.happier(pet, 0.03);
    other.socialEvent("sneak_boop", pet);
}

function inviteCopycat(leader, follower) {
    if (!leader || !follower) return;
    markPeerBout(leader, "greet");
    Memory.adjustRelation(leader, follower.petData.name, 0.012, 0.05, null, { respectDelta: 0.02, outcome: "greet" });
    follower.socialEvent("mentor_patrol", leader);
}

function broadcastYawn(pet) {
    if (!pet || !pet.petManager || !pet.petManager.pets) return;
    var now = _now(pet);
    if (now - (pet._lastYawnBroadcastMs || 0) < 240000) return;
    pet._lastYawnBroadcastMs = now;

    var all = pet.petManager.pets;
    var sx = pet.screenX(), sy = pet.screenY();
    var myGX = sx + pet.worldX, myGY = sy + pet.worldY;
    var warmPeerName = SpeciesProfile.hasAbility(pet, "hearth_warmth") ? pet.petData.name : "";

    if (!warmPeerName) {
        for (var w = 0; w < all.length; w++) {
            var wp = all[w];
            if (!wp || wp.screenX() !== sx || wp.screenY() !== sy) continue;
            if ((wp.state_ === "loaf" || wp.state_ === "deepsleep") && SpeciesProfile.hasAbility(wp, "hearth_warmth")) {
                warmPeerName = wp.petData.name;
                break;
            }
        }
    }

    for (var i = 0; i < all.length; i++) {
        var o = all[i];
        if (!o || o === pet || o._retiringToPen) continue;
        if (o.screenX() !== sx || o.screenY() !== sy) continue;
        if (o.state_ !== "idle" || o.activePlan) continue;
        var d = Math.hypot((o.screenX() + o.worldX) - myGX, (o.screenY() + o.worldY) - myGY);
        if (d > 280) continue;
        var op = o.personality;
        if (o.restDrive < 0.22 && op.sleepiness < 0.45) continue;
        if (Math.random() < 0.28 + op.sleepiness * 0.24) {
            if (typeof o.scheduleContagiousYawn === "function") {
                o.scheduleContagiousYawn(Math.round(5000 + Math.random() * 4800), warmPeerName);
            }
            break;
        }
    }
}

function illusionSurprise(pet, other) {
    var oName = other.petData.name;
    markPeerBout(pet, "show_off");
    Memory.adjustRelation(pet, oName, 0.015, 0.06, "play", { outcome: "duet" });
    Memory.recordEpisode(pet, "illusion_prank", { valence: 0.48, withPet: oName });
    Memory.thinkAloud(pet, "illusion", "Surprised " + oName + " with a shadow Illusion!");
    pet.playDrive = Math.max(0, pet.playDrive - 0.24);
    pet.mood = Drives.clamp01(pet.mood + 0.07);
    Drives.happier(pet, 0.03);
    other.socialEvent("illusion", pet);
}
