.pragma library

.import "../SpeciesProfile.js" as SpeciesProfile
.import "Topology.js" as Topology
.import "Util.js" as Util

function _naturalOffsetFrom(pet, other, radius) {
    var myGX = Util.petGX(pet), myGY = Util.petGY(pet);
    var oGX = Util.petGX(other), oGY = Util.petGY(other);
    var baseAng = Math.atan2(myGY - oGY, myGX - oGX);
    var ang = baseAng + (Math.random() - 0.5) * 0.72;
    var r = radius || 82;
    return {
        offsetX: Math.round(Math.cos(ang) * r),
        offsetY: Math.round(Math.sin(ang) * r * 0.78)
    };
}

function buildShareStoryPlan(other, topic, pet) {
    var off = (pet && other && other.pet) ? _naturalOffsetFrom(pet, other.pet, 78) : { offsetX: 68, offsetY: 18 };
    return {
        name: "share_story",
        label: "Checking In with " + other.name,
        reason: "Sharing excitement with " + other.name,
        otherName: other.name,
        urgency: 0.55,
        durationMs: 55000,
        thought: "Trotted over to share news with " + other.name,
        steps: [
            { kind: "travel", gait: "trot", label: "Trotting near " + other.name, dynamic: "other_pet", offsetX: off.offsetX, offsetY: off.offsetY },
            { kind: "social", label: "Greeting", interaction: "story", topic: topic },
            { kind: "act", label: "Excited gesture", states: SpeciesProfile.showOffMovesFor(pet), faceOther: true },
            { kind: "wander_apart", dist: 135, gait: "amble", label: "Strolling onward" }
        ]
    };
}

function buildInvitePlayPlan(pet, other) {
    var steps = [];
    if (other.dist > 115) {
        steps.push({ kind: "dash_relative", maneuver: "approach_angled", gait: "trot", radius: 84, label: "Bounding near " + other.name });
    }
    var bidMoves = SpeciesProfile.affectionGesturesFor(pet).concat(["hop"]);
    steps.push({ kind: "act", label: "Play-bowing to " + other.name, states: bidMoves, faceOther: true });
    steps.push({ kind: "social", interaction: "play_bid", label: "Inviting " + other.name + " to play" });
    steps.push({ kind: "observe", durationMs: 1150, attend: "other", label: "Waiting for " + other.name });
    steps.push({ kind: "branch_social_bid", afterRetry: false, label: "Reading " + other.name + "'s mood" });
    return {
        name: "invite_play",
        label: "Inviting " + other.name + " to Play",
        reason: "Play-bowing eagerly toward " + other.name,
        otherName: other.name,
        urgency: 0.66,
        durationMs: 55000,
        thought: "Play-bowed to see if " + other.name + " wants to play",
        steps: steps
    };
}

function buildSparBoutPlan(pet, otherName, alreadyClose, skipChallenge) {
    var sparMoves = SpeciesProfile.sparMovesFor(pet);
    var dodgeMoves = SpeciesProfile.dodgeMovesFor(pet);
    var stanceMoves = SpeciesProfile.standoffMovesFor(pet);
    var steps = [];
    if (!alreadyClose) {
        steps.push({ kind: "dash_relative", maneuver: "approach_angled", gait: "trot", radius: 98, label: "Approaching " + otherName });
    }
    if (!skipChallenge) {
        steps.push({ kind: "act", label: "Martial stance", states: stanceMoves, faceOther: true });
        steps.push({ kind: "social", interaction: "spar_challenge", label: "Challenging " + otherName });
    }
    steps.push({ kind: "dash_relative", maneuver: "lunge", gait: "scamper", radius: 46, label: "Lunging in!" });
    steps.push({ kind: "act", label: "Opening strike!", states: sparMoves, faceOther: true });
    steps.push({ kind: "dash_relative", maneuver: "sidestep", gait: "scamper", radius: 98, sideSign: 1, label: "Sidestepping counter!" });
    steps.push({ kind: "act", label: "Agile evade", states: dodgeMoves, faceOther: true });
    steps.push({ kind: "dash_relative", maneuver: "lunge", gait: "scamper", radius: 48, label: "Closing in!" });
    steps.push({ kind: "act", label: "Combo finisher!", states: sparMoves, faceOther: true });
    steps.push({ kind: "social", interaction: "spar_hit", label: "Sparring clash" });
    steps.push({ kind: "dash_relative", maneuver: "retreat", gait: "trot", dist: 105, label: "Springing back" });
    steps.push({ kind: "pant", label: "Catching breath" });
    steps.push({ kind: "act", label: "Respectful nod", states: ["nod", "pose"], faceOther: true });
    steps.push({ kind: "wander_apart", dist: 145, gait: "amble", label: "Parting ways" });
    return {
        name: "spar_bout",
        label: "Sparring with " + otherName,
        reason: "Friendly martial sparring with " + otherName,
        otherName: otherName,
        urgency: 0.78,
        durationMs: 65000,
        thought: "Trading playful sparring combos with " + otherName,
        steps: steps
    };
}

function buildSparPartnerPlan(pet, challenger) {
    var cName = challenger.petData.name;
    var sparMoves = SpeciesProfile.sparMovesFor(pet);
    var dodgeMoves = SpeciesProfile.dodgeMovesFor(pet);
    var stanceMoves = SpeciesProfile.standoffMovesFor(pet);
    return {
        name: "spar_partner",
        label: "Sparring with " + cName,
        reason: "Trading sparring moves with " + cName,
        otherName: cName,
        urgency: 0.78,
        durationMs: 65000,
        thought: "Accepted " + cName + "'s sparring challenge!",
        steps: [
            { kind: "act", label: "Ready stance", states: stanceMoves, faceOther: true },
            { kind: "dash_relative", maneuver: "sidestep", gait: "scamper", radius: 94, sideSign: -1, label: "Weaving aside!" },
            { kind: "act", label: "Dodging!", states: dodgeMoves, faceOther: true },
            { kind: "dash_relative", maneuver: "lunge", gait: "scamper", radius: 46, label: "Counter-lunging!" },
            { kind: "act", label: "Counter strike!", states: sparMoves, faceOther: true },
            { kind: "act", label: "Parrying!", states: dodgeMoves, faceOther: true },
            { kind: "dash_relative", maneuver: "retreat", gait: "trot", dist: 105, label: "Hopping back" },
            { kind: "pant", label: "Catching breath" },
            { kind: "act", label: "Respectful nod", states: ["nod", "pose"], faceOther: true },
            { kind: "wander_apart", dist: 145, gait: "amble", label: "Parting ways" }
        ]
    };
}

function buildPlayTagPlan(other, closeAlready, pet) {
    var steps = [];
    if (!closeAlready) {
        steps.push({ kind: "dash_relative", maneuver: "approach_angled", gait: "trot", radius: 82, label: "Bounding near " + other.name });
    }
    steps.push({ kind: "act", label: "Play-bowing", states: ["nod"], faceOther: true });
    steps.push({ kind: "social", label: "Tagging " + other.name, interaction: "chase" });
    steps.push({ kind: "travel", gait: "scamper", label: "Chasing " + other.name, dynamic: "other_pet_chase", offsetX: -38, offsetY: 16 });
    steps.push({ kind: "act", label: "Playful pounce", states: pet ? SpeciesProfile.dodgeMovesFor(pet) : ["hop"], faceOther: true });
    steps.push({ kind: "pant", label: "Catching breath" });
    steps.push({ kind: "wander_apart", dist: 150, gait: "amble", label: "Cooling down" });
    return {
        name: "play_tag",
        label: "Playing Tag with " + other.name,
        reason: "Playful chase with " + other.name,
        otherName: other.name,
        urgency: 0.78,
        durationMs: 65000,
        thought: "Chasing " + other.name + " in a game of tag",
        steps: steps
    };
}

function buildFleeTagPlan(pet, chaser, allowReverse) {
    var scr = Topology.currentScreen(pet);
    var pw = pet.width || 64, ph = pet.height || 64;
    var minX = scr.x + 36, maxX = Math.max(minX, scr.x + scr.width - pw - 36);
    var minY = scr.y + (scr.topInset || 0) + 36;
    var maxY = Math.max(minY, scr.y + scr.height - (scr.bottomInset || 0) - ph - 36);
    var curGX = scr.x + pet.worldX, curGY = scr.y + pet.worldY;
    var chaserGX = Util.petGX(chaser), chaserGY = Util.petGY(chaser);
    var awayAngle = Math.atan2(curGY - chaserGY, curGX - chaserGX) + (Math.random() - 0.5) * 0.9;
    var leg1X = Math.max(minX, Math.min(maxX, curGX + Math.cos(awayAngle) * 290));
    var leg1Y = Math.max(minY, Math.min(maxY, curGY + Math.sin(awayAngle) * 210));
    if (Math.hypot(leg1X - curGX, leg1Y - curGY) < 140) {
        leg1X = curGX < (minX + maxX) * 0.5 ? Math.min(maxX, curGX + 280) : Math.max(minX, curGX - 280);
    }
    var leg2Angle = awayAngle + (Math.random() < 0.5 ? 1.35 : -1.35);
    var leg2X = Math.max(minX, Math.min(maxX, leg1X + Math.cos(leg2Angle) * 240));
    var leg2Y = Math.max(minY, Math.min(maxY, leg1Y + Math.sin(leg2Angle) * 180));

    var steps = [
        { kind: "travel", gait: "scamper", label: "Scampering!", gx: leg1X, gy: leg1Y },
        { kind: "travel", gait: "scamper", label: "Zig-zagging!", gx: leg2X, gy: leg2Y }
    ];

    var canReverse = allowReverse !== false && pet.personality
                  && (SpeciesProfile.socialStyleOf(pet) === "sprinter"
                      || (pet.personality.energy + pet.personality.playfulness > 0.92));
    if (canReverse) {
        steps.push({ kind: "act", label: "Whirling around!", states: ["hop", "twirl", "rotate"], faceOther: true });
        steps.push({ kind: "social", interaction: "reverse_chase", label: "Tagging " + chaser.petData.name + " back!" });
        steps.push({ kind: "travel", gait: "scamper", label: "Chasing " + chaser.petData.name + " back!", dynamic: "other_pet_chase", offsetX: 36, offsetY: -16 });
    }
    steps.push({ kind: "act", label: "Happy tumble", states: ["hop", "tumble", "twirl"], faceOther: true });
    steps.push({ kind: "pant", label: "Catching breath" });
    steps.push({ kind: "wander_apart", dist: 145, gait: "amble", label: "Trotting off happily" });

    return {
        name: "flee_tag",
        label: "Playing Tag with " + chaser.petData.name,
        reason: "Darting & zig-zagging with " + chaser.petData.name,
        otherName: chaser.petData.name,
        urgency: 0.80,
        durationMs: 62000,
        thought: "Scampering in zig-zags with " + chaser.petData.name + " in tag",
        steps: steps
    };
}

function buildReverseFleePlan(pet, counterChaser) {
    var scr = Topology.currentScreen(pet);
    var pw = pet.width || 64, ph = pet.height || 64;
    var minX = scr.x + 36, maxX = Math.max(minX, scr.x + scr.width - pw - 36);
    var minY = scr.y + (scr.topInset || 0) + 36;
    var maxY = Math.max(minY, scr.y + scr.height - (scr.bottomInset || 0) - ph - 36);
    var curGX = scr.x + pet.worldX, curGY = scr.y + pet.worldY;
    var cGX = Util.petGX(counterChaser), cGY = Util.petGY(counterChaser);
    var away = Math.atan2(curGY - cGY, curGX - cGX) + (Math.random() - 0.5) * 0.8;
    var tx = Math.max(minX, Math.min(maxX, curGX + Math.cos(away) * 260));
    var ty = Math.max(minY, Math.min(maxY, curGY + Math.sin(away) * 190));
    if (Math.hypot(tx - curGX, ty - curGY) < 120) {
        tx = curGX < (minX + maxX) * 0.5 ? Math.min(maxX, curGX + 250) : Math.max(minX, curGX - 250);
    }
    return {
        name: "reverse_tag",
        label: "Dodging " + counterChaser.petData.name + "!",
        reason: counterChaser.petData.name + " turned the chase around!",
        otherName: counterChaser.petData.name,
        urgency: 0.82,
        durationMs: 42000,
        thought: counterChaser.petData.name + " tagged back — darting away!",
        steps: [
            { kind: "travel", gait: "scamper", label: "Darting away!", gx: tx, gy: ty },
            { kind: "act", label: "Playful spin", states: SpeciesProfile.dodgeMovesFor(pet), faceOther: true },
            { kind: "pant", label: "Catching breath" },
            { kind: "wander_apart", dist: 150, gait: "amble", label: "Parting ways" }
        ]
    };
}

function buildShowOffPlan(pet, other) {
    var moves = SpeciesProfile.showOffMovesFor(pet);
    return {
        name: "show_off",
        label: "Showing Off near " + other.name,
        reason: "Performing signature flair near " + other.name,
        otherName: other.name,
        urgency: 0.62,
        durationMs: 36000,
        thought: "Showing off a neat trick near " + other.name,
        steps: [
            { kind: "act", label: "Flair move!", states: moves, faceOther: true },
            { kind: "social", interaction: "show_off", label: "Looking to see " + other.name + "'s reaction" },
            { kind: "act", label: "Encore spin", states: moves.concat(["rotate", "hop"]), faceOther: true },
            { kind: "wander_apart", dist: 135, gait: "amble", label: "Sauntering onward" }
        ]
    };
}

function buildSyncDancePlan(pet, partnerName) {
    var moves = SpeciesProfile.showOffMovesFor(pet).concat(SpeciesProfile.affectionGesturesFor(pet));
    return {
        name: "sync_dance",
        label: "Dancing with " + partnerName,
        reason: "Synchronized joyful duet with " + partnerName,
        otherName: partnerName,
        urgency: 0.72,
        durationMs: 36000,
        thought: "Dancing in sync with " + partnerName,
        steps: [
            { kind: "act", label: "Synchronized spin", states: moves, faceOther: true, emote: "note" },
            { kind: "act", label: "Joyful hop", states: ["twirl", "dance", "hop", "rotate"], faceOther: true },
            { kind: "wander_apart", dist: 140, gait: "amble", label: "Parting cheerfully" }
        ]
    };
}

function buildSquabblePlan(pet, other) {
    var bristle = SpeciesProfile.standoffMovesFor(pet);
    return {
        name: "squabble",
        label: "Bickering with " + other.name,
        reason: "Disagreement over personal space with " + other.name,
        otherName: other.name,
        urgency: 0.74,
        durationMs: 32000,
        thought: "Bristled at " + other.name + " over personal space",
        steps: [
            { kind: "act", label: "Bristling!", states: bristle, faceOther: true },
            { kind: "social", interaction: "squabble", label: "Confronting " + other.name },
            { kind: "observe", durationMs: 1200, attend: "other", label: "Tense standoff" },
            { kind: "face_away", label: "Turning away in a huff" },
            { kind: "wander_apart", dist: 185, gait: "trot", label: "Stalking off" }
        ]
    };
}

function buildSquabbleReplyPlan(pet, instigator) {
    var iName = instigator.petData.name;
    var bristle = SpeciesProfile.standoffMovesFor(pet);
    return {
        name: "squabble_reply",
        label: "Standing Ground vs " + iName,
        reason: "Refusing to back down from " + iName,
        otherName: iName,
        urgency: 0.76,
        durationMs: 30000,
        thought: "Stood ground and huffed right back at " + iName,
        steps: [
            { kind: "act", label: "Standing ground!", states: bristle, faceOther: true },
            { kind: "face_away", label: "Huffing away" },
            { kind: "wander_apart", dist: 185, gait: "trot", label: "Taking own corner" }
        ]
    };
}

function buildPeacekeeperPlan(pet, petA, petB) {
    var midGX = (Util.petGX(petA) + Util.petGX(petB)) * 0.5;
    var midGY = (Util.petGY(petA) + Util.petGY(petB)) * 0.5;
    var pt = Util.clampToScreen(pet, midGX, midGY);
    var calmAuth = SpeciesProfile.standoffMovesFor(pet).concat(SpeciesProfile.calmGesturesFor(pet));
    return {
        name: "peacekeeper",
        label: "Calming Squabble",
        reason: "Stepping between " + petA.petData.name + " & " + petB.petData.name,
        otherName: petA.petData.name,
        secondOtherName: petB.petData.name,
        urgency: 0.82,
        durationMs: 38000,
        thought: "Stepping in to calm " + petA.petData.name + " and " + petB.petData.name,
        steps: [
            { kind: "travel", gait: "trot", label: "Stepping between them", gx: pt.gx, gy: pt.gy },
            { kind: "act", label: "Commanding calm", states: calmAuth, faceOther: true },
            { kind: "social", interaction: "mediate", label: "Restoring peace" },
            { kind: "act", label: "Reassuring nod", states: SpeciesProfile.calmGesturesFor(pet) },
            { kind: "wander_apart", dist: 135, gait: "amble", label: "Resuming watch" }
        ]
    };
}

function buildSpectatePlan(pet, actorA) {
    var aName = actorA.petData.name;
    return {
        name: "spectate_bout",
        label: "Watching " + aName + "'s Match",
        reason: "Watching companions spar from nearby",
        otherName: aName,
        urgency: 0.56,
        durationMs: 24000,
        thought: "Paused to watch " + aName + "'s match",
        steps: [
            { kind: "observe", durationMs: 3600, attend: "other", label: "Watching match" },
            { kind: "act", label: "Impressed nod", states: SpeciesProfile.calmGesturesFor(pet).concat(["hop"]), faceOther: true }
        ]
    };
}

function buildPackRallyPlan(pet, leader) {
    var lName = leader.petData.name;
    return {
        name: "pack_rally",
        label: "Joining " + lName + "'s Play!",
        reason: "Swept up in contagious pack energy",
        otherName: lName,
        urgency: 0.74,
        durationMs: 28000,
        thought: "Joined in the contagious zoomies with " + lName + "!",
        steps: [
            { kind: "act", label: "Perking up!", states: ["hop", "twirl", "rotate"], faceOther: true },
            { kind: "zoomies", label: "Pack zoomies!" },
            { kind: "pant", label: "Catching breath" },
            { kind: "wander_apart", dist: 140, gait: "amble", label: "Settling down" }
        ]
    };
}

function buildBestFriendVisitPlan(pet, other) {
    var myGX = Util.petGX(pet), myGY = Util.petGY(pet);
    var midX = myGX + (other.gx - myGX) * 0.55 + (Math.random() - 0.5) * 90;
    var midY = myGY + (other.gy - myGY) * 0.55 + (Math.random() - 0.5) * 70;
    var midPt = Util.clampToScreen(pet, midX, midY);
    var off = other.pet ? _naturalOffsetFrom(pet, other.pet, 76) : { offsetX: 68, offsetY: 20 };
    var steps = [];
    if (other.dist > 420) {
        steps.push({ kind: "travel", gait: "trot", label: "Strolling toward " + other.name, gx: midPt.gx, gy: midPt.gy });
        steps.push({ kind: "act", label: "Glancing ahead", states: SpeciesProfile.calmGesturesFor(pet), faceOther: true });
    }
    steps.push({ kind: "travel", gait: "trot", label: "Joining " + other.name, dynamic: "other_pet", offsetX: off.offsetX, offsetY: off.offsetY });
    steps.push({ kind: "social", label: "Warm greeting", interaction: "greet" });
    steps.push({ kind: "act", label: "Happy greeting", states: SpeciesProfile.affectionGesturesFor(pet).concat(["hop"]), faceOther: true });
    if (pet.restDrive > 0.34) {
        steps.push({ kind: "social", label: "Curling up nearby", interaction: "rest" });
        steps.push({ kind: "rest", label: "Resting near " + other.name, deep: pet.restDrive > 0.68, faceOther: true });
    } else {
        steps.push({ kind: "wander_apart", dist: 145, gait: "amble", label: "Continuing stroll" });
    }
    return {
        name: "best_friend_checkin",
        label: "Checking In on " + other.name,
        reason: "Checking in on best friend " + other.name,
        otherName: other.name,
        urgency: 0.58,
        durationMs: 95000,
        thought: "Strolled over to check in on best friend " + other.name,
        steps: steps
    };
}

function buildSocialMinglePlan(pet, other) {
    var off = other.pet ? _naturalOffsetFrom(pet, other.pet, 74) : { offsetX: 66, offsetY: 18 };
    return {
        name: "social_mingle",
        label: "Saying Hi to " + other.name,
        reason: "Trotting over to greet " + other.name,
        otherName: other.name,
        urgency: 0.54,
        durationMs: 55000,
        thought: "Trotted over to say hello to " + other.name,
        steps: [
            { kind: "travel", gait: "trot", label: "Trotting toward " + other.name, dynamic: "other_pet", offsetX: off.offsetX, offsetY: off.offsetY },
            { kind: "social", interaction: "greet", label: "Friendly sniff" },
            { kind: "act", label: "Warm greeting", states: SpeciesProfile.greetGesturesFor(pet), faceOther: true },
            { kind: "observe", durationMs: 1800, attend: "other", label: "Hanging out briefly" },
            { kind: "wander_apart", dist: 125, gait: "amble", label: "Ambling onward" }
        ]
    };
}

function buildSneakBoopPlan(pet, other) {
    return {
        name: "sneak_boop",
        label: "Sneaking Up on " + other.name,
        reason: "Creeping up behind " + other.name + " while unobserved",
        otherName: other.name,
        urgency: 0.66,
        durationMs: 52000,
        thought: "Creeping quietly toward " + other.name + " whenever they look away",
        steps: [
            { kind: "stalk_step", boopRadius: 68, label: "Creeping softly" },
            { kind: "act", label: "Quick boop!", states: ["hop", "lick", "nod"], faceOther: true },
            { kind: "social", interaction: "sneak_boop", label: "Surprising " + other.name },
            { kind: "wander_apart", dist: 195, gait: "scamper", label: "Scampering away!" }
        ]
    };
}

function buildMentorPatrolPlan(pet, perc, followerName) {
    var pw = perc.petW || 64, ph = perc.petH || 64;
    var minX = perc.screen.x + 36, maxX = Math.max(minX, perc.screen.x + perc.screen.w - pw - 36);
    var minY = perc.screen.y + (perc.screen.topInset || 0) + 36;
    var maxY = Math.max(minY, perc.screen.y + perc.screen.h - (perc.screen.bottomInset || 0) - ph - 36);
    var goRight = perc.petGX < (minX + maxX) * 0.5;
    var leg1X = Topology.clamp(perc.petGX + (goRight ? 220 : -220), minX, maxX);
    var leg1Y = Topology.clamp(perc.petGY + (Math.random() - 0.5) * 120, minY, maxY);
    var leg2X = Topology.clamp(leg1X + (goRight ? 160 : -160), minX, maxX);
    var leg2Y = Topology.clamp(leg1Y + (Math.random() - 0.5) * 110, minY, maxY);
    var steps = [];
    if (followerName) {
        steps.push({ kind: "social", interaction: "mentor_invite", label: "Leading quiet patrol" });
    }
    steps.push({ kind: "travel", gait: "amble", label: "Strolling calm patrol", gx: leg1X, gy: leg1Y });
    steps.push({ kind: "act", label: "Surveying desktop", states: ["pose", "nod"] });
    steps.push({ kind: "travel", gait: "amble", label: "Continuing patrol", gx: leg2X, gy: leg2Y });
    steps.push({ kind: "act", label: "Unhurried stretch", states: [SpeciesProfile.wakeStateFor(pet), "nod"] });
    return {
        name: "mentor_patrol",
        label: "Quiet Patrol",
        reason: followerName ? ("Calm patrol with " + followerName + " trailing along") : "Unhurried perimeter stroll",
        otherName: followerName || "",
        urgency: 0.52,
        durationMs: 75000,
        thought: followerName ? ("Taking an unhurried patrol while " + followerName + " tags along") : "Taking a calm patrol across the workspace",
        steps: steps
    };
}

function buildCopycatTrailPlan(pet, leader) {
    var lName = leader.petData.name;
    return {
        name: "copycat_trail",
        label: "Trailing " + lName,
        reason: "Following along behind " + lName + " and copying moves",
        otherName: lName,
        urgency: 0.64,
        durationMs: 75000,
        thought: "Padding along behind " + lName + " and copying their stance",
        steps: [
            { kind: "trail_leader", maxLegs: 2, label: "Padding behind " + lName },
            { kind: "observe", durationMs: 1600, attend: "other", label: "Watching " + lName },
            { kind: "act", label: "Copying stretch", states: [SpeciesProfile.wakeStateFor(pet), "nod"], faceOther: true }
        ]
    };
}

function buildWelcomeFriendPlan(pet, arrivingPet) {
    var aName = arrivingPet.petData.name;
    var aGX = Util.petGX(arrivingPet), aGY = Util.petGY(arrivingPet);
    var myGX = Util.petGX(pet), myGY = Util.petGY(pet);
    var meetPt = Util.clampToScreen(pet, myGX + (aGX - myGX) * 0.58, myGY + (aGY - myGY) * 0.58);
    return {
        name: "welcome_friend",
        label: "Welcoming " + aName,
        reason: "Trotting over to greet " + aName + " returning from the Sanctuary",
        otherName: aName,
        urgency: 0.66,
        durationMs: 42000,
        thought: "Perked up to welcome " + aName + " back onto the desktop",
        steps: [
            { kind: "travel", gait: "trot", label: "Trotting to greet " + aName, gx: meetPt.gx, gy: meetPt.gy },
            { kind: "social", interaction: "greet", label: "Welcoming " + aName },
            { kind: "act", label: "Warm greeting", states: SpeciesProfile.greetGesturesFor(pet).concat(["hop"]), faceOther: true },
            { kind: "wander_apart", dist: 120, gait: "amble", label: "Walking inward together" }
        ]
    };
}

function buildJointRetirePlan(pet, partner, perc, isFollower) {
    var pw = perc.petW || 64;
    var pName = partner && partner.petData ? partner.petData.name : "";
    var nearLeft = (perc.petGX - perc.screen.x) < perc.screen.w * 0.5;
    if (isFollower && partner) {
        nearLeft = (Util.petGX(partner) - perc.screen.x) < perc.screen.w * 0.5;
    }
    var edgeX = nearLeft ? (perc.screen.x + 8) : Math.max(perc.screen.x + 8, perc.screen.x + perc.screen.w - pw - 8);
    var baseY = partner && isFollower ? (Util.petGY(partner) + 38) : perc.petGY;
    var edgeY = Topology.clamp(baseY, perc.screen.y + (perc.screen.topInset || 0) + 24,
                               Math.max(perc.screen.y + 24, perc.screen.y + perc.screen.h - (perc.screen.bottomInset || 0) - 80));
    return {
        name: "joint_retire",
        label: pName ? ("Heading to Sanctuary with " + pName) : "Heading Off to Rest",
        reason: pName ? ("Strolling side-by-side into the Sanctuary with " + pName) : "Padding off-screen to rest",
        otherName: pName,
        urgency: 0.84,
        durationMs: 55000,
        thought: pName ? ("Walking back to the Sanctuary side-by-side with " + pName) : "Padding off-screen to rest",
        steps: [
            { kind: "travel", gait: "amble", label: "Walking side-by-side to Sanctuary", gx: edgeX, gy: edgeY },
            { kind: "act", label: "Sleepy nod", states: SpeciesProfile.settleGesturesFor(pet), faceOther: !!pName },
            { kind: "retire_finish", label: "Entered Sanctuary" }
        ]
    };
}

function buildGuardianCheckPlan(pet, gx, gy, sourceLabel) {
    var myGX = Util.petGX(pet), myGY = Util.petGY(pet);
    var toEvt = Math.atan2(gy - myGY, gx - myGX);
    var stepDist = Math.min(105, Math.max(42, Math.hypot(gx - myGX, gy - myGY) * 0.45));
    var checkPt = Util.clampToScreen(pet, myGX + Math.cos(toEvt) * stepDist, myGY + Math.sin(toEvt) * stepDist);
    return {
        name: "guardian_check",
        label: "Checking Disturbance",
        reason: "Stepping forward calmly to inspect " + (sourceLabel || "sudden alert"),
        urgency: 0.72,
        durationMs: 28000,
        thought: "Stepped forward calmly to make sure everything is safe",
        steps: [
            { kind: "travel", gait: "trot", label: "Stepping forward", gx: checkPt.gx, gy: checkPt.gy },
            { kind: "act", label: "Alert stance", states: ["pose", "nod"], facePoint: { gx: gx, gy: gy } },
            { kind: "observe", durationMs: 3200, facePoint: { gx: gx, gy: gy }, label: "Checking area" },
            { kind: "act", label: "All clear nod", states: ["nod"] }
        ]
    };
}

function buildTimidHideBehindPlan(pet, guardian, threatGX, threatGY) {
    var gName = guardian.petData.name;
    var gGX = Util.petGX(guardian), gGY = Util.petGY(guardian);
    var awayAng = Math.atan2(gGY - threatGY, gGX - threatGX);
    var hidePt = Util.clampToScreen(pet, gGX + Math.cos(awayAng) * 62, gGY + Math.sin(awayAng) * 48);
    return {
        name: "timid_hide",
        label: "Tucking Behind " + gName,
        reason: "Startled — scooting behind " + gName + " for reassurance",
        otherName: gName,
        urgency: 0.76,
        durationMs: 26000,
        thought: "Startled and scooted safely behind " + gName,
        steps: [
            { kind: "travel", gait: "scamper", label: "Scooting behind " + gName, gx: hidePt.gx, gy: hidePt.gy },
            { kind: "act", label: "Peeking out", states: ["cringe", "nod"], facePoint: { gx: threatGX, gy: threatGY } },
            { kind: "observe", durationMs: 2800, attend: "other", label: "Catching breath behind " + gName }
        ]
    };
}

function buildRestWithPlan(pet, otherName, offX, offY, fireside) {
    return {
        name: "rest_with",
        label: (fireside ? "Fireside Nap by " : "Resting by ") + otherName,
        reason: fireside
            ? ("Drifted toward " + otherName + "'s warmth after catching a yawn")
            : ("Cozy tandem nap with " + otherName),
        otherName: otherName,
        urgency: Math.max(fireside ? 0.45 : 0, pet.restDrive),
        thought: fireside
            ? ("Caught a yawn and drifted near " + otherName + "'s warmth")
            : ("Settling down beside " + otherName),
        steps: [
            { kind: "travel", gait: "amble", label: "Padding over to " + otherName, dynamic: "other_pet", offsetX: offX, offsetY: offY },
            { kind: "social", label: "Settling beside " + otherName, interaction: "rest" },
            { kind: "rest", label: "Resting together", deep: pet.restDrive > 0.70, faceOther: true }
        ]
    };
}

function buildColdShoulderPlan(otherName, label) {
    return {
        name: "cold_shoulder",
        label: label || "Aloof Turn",
        reason: "Not in the mood to play with " + otherName,
        otherName: otherName,
        urgency: 0.55,
        durationMs: 12000,
        steps: [
            { kind: "face_away", otherName: otherName, label: "Turning away" }
        ]
    };
}

function buildCooledOffPlan(sepTarget) {
    return {
        name: "cooled_off",
        label: "Cooling Off",
        otherName: sepTarget,
        urgency: 0.68,
        durationMs: 22000,
        steps: [
            { kind: "act", label: "Cooling down", states: ["nod"] },
            { kind: "wander_apart", otherName: sepTarget, dist: 175, gait: "amble", label: "Giving space" }
        ]
    };
}

function buildBackedOffPlan(otherName) {
    return {
        name: "backed_off",
        label: "Giving Space",
        otherName: otherName,
        urgency: 0.62,
        durationMs: 18000,
        steps: [
            { kind: "act", label: "Startled back", states: ["cringe", "nod"] },
            { kind: "wander_apart", dist: 155, gait: "trot", label: "Stepping away" }
        ]
    };
}

function buildSharedGroovePlan(pet, peerName) {
    return {
        name: "music_groove",
        label: "Listening Together",
        reason: "Swaying to music with " + peerName,
        otherName: peerName,
        urgency: 0.60,
        durationMs: 30000,
        steps: [
            { kind: "act", label: "Swaying together", states: SpeciesProfile.affectionGesturesFor(pet), faceOther: true, emote: "note" }
        ]
    };
}

function buildJealousWedgePlan(pet, pamperedPet, cursorGX, cursorGY, hasCursor) {
    var pName = pamperedPet.petData.name;
    var pGX = Util.petGX(pamperedPet), pGY = Util.petGY(pamperedPet);
    var targetGX = hasCursor ? ((pGX + cursorGX) * 0.5) : (pGX + (Util.petGX(pet) < pGX ? -58 : 58));
    var targetGY = hasCursor ? ((pGY + cursorGY) * 0.5 + 8) : (pGY + 12);
    var pt = Util.clampToScreen(pet, targetGX, targetGY);
    var nuzzles = SpeciesProfile.nuzzleGesturesFor(pet);
    return {
        name: "jealous_wedge",
        label: "Nudging In Near " + pName,
        reason: "Hoping for headpats too alongside " + pName,
        otherName: pName,
        urgency: 0.66,
        durationMs: 28000,
        thought: "Trotted over to nudge in for headpats alongside " + pName,
        steps: [
            { kind: "travel", gait: "trot", label: "Squeezing in nearby", gx: pt.gx, gy: pt.gy },
            { kind: "act", label: "Nuzzling for attention", states: nuzzles, faceCursor: !!hasCursor, faceOther: !hasCursor },
            { kind: "observe", durationMs: 4200, attend: hasCursor ? "cursor" : "other", label: "Waiting hopefully" }
        ]
    };
}

function buildCheckDisplacedFriendPlan(pet, refugeePet) {
    var rName = refugeePet.petData.name;
    var off = _naturalOffsetFrom(pet, refugeePet, 66);
    var nuzzles = SpeciesProfile.nuzzleGesturesFor(pet);
    return {
        name: "check_displaced_friend",
        label: "Checking on " + rName,
        reason: "Making sure " + rName + " is okay after monitor disconnect",
        otherName: rName,
        urgency: 0.70,
        durationMs: 34000,
        thought: "Trotted over to check on " + rName + " after their display disconnected",
        steps: [
            { kind: "travel", gait: "trot", label: "Trotting to " + rName, dynamic: "other_pet", offsetX: off.offsetX, offsetY: off.offsetY },
            { kind: "social", interaction: "greet", label: "Reassuring " + rName },
            { kind: "act", label: "Reassuring nuzzle", states: nuzzles, faceOther: true },
            { kind: "wander_apart", dist: 120, gait: "amble", label: "Walking inward" }
        ]
    };
}
