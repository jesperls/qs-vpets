.import "../SpeciesProfile.js" as SpeciesProfile
.import "Personality.js" as Personality
.import "Drives.js" as Drives
.import "Memory.js" as Memory
.import "Social.js" as Social
.import "Topology.js" as Topology

var ABILITIES = {
    illusion: {
        id: "illusion",
        label: "Illusion Craft",
        icon: "spark",
        summary: "Weaves playful shadow disguises to surprise nearby companions."
    },
    phase_blink: {
        id: "phase_blink",
        label: "Psychic Blink",
        icon: "spark",
        summary: "Blinks weightlessly across open workspace spans when exploring."
    },
    hearth_warmth: {
        id: "hearth_warmth",
        label: "Hearth Ember",
        icon: "sun",
        summary: "Radiates cozy warmth that draws companions in for shared naps."
    },
    lunar_pulse: {
        id: "lunar_pulse",
        label: "Moonlight Pulse",
        icon: "moon",
        summary: "Comes alive after dusk and keeps calm, luminous night vigils."
    },
    solar_bask: {
        id: "solar_bask",
        label: "Sunlit Bask",
        icon: "leaf",
        summary: "Soaks up daytime workspace light with contented stretches."
    },
    shell_bunker: {
        id: "shell_bunker",
        label: "Shell Bunker",
        icon: "sanctuary",
        summary: "Tucks calmly into its armored shell when startled or loafing."
    },
    sky_drift: {
        id: "sky_drift",
        label: "Wind Glide",
        icon: "wind",
        summary: "Loves high window perches and lands gentle tosses with grace."
    },
    aura_sense: {
        id: "aura_sense",
        label: "Aura Watch",
        icon: "target",
        summary: "Attuned to focused coding sessions and crisp martial katas."
    },
    chorus_lead: {
        id: "chorus_lead",
        label: "Melody Spark",
        icon: "music",
        summary: "Perks up when music plays and inspires nearby friends to sway."
    },
    shadow_meld: {
        id: "shadow_meld",
        label: "Shadow Slip",
        icon: "dream",
        summary: "Slips playfully through floor shadows during quiet or late hours."
    },
    tide_splash: {
        id: "tide_splash",
        label: "Tidepool Joy",
        icon: "compass",
        summary: "Unhurried cove spirit with carefree spins and easygoing poise."
    },
    forage_stash: {
        id: "forage_stash",
        label: "Berry Stash",
        icon: "berry",
        summary: "Sniffs out hidden snacks early and savors quiet berry breaks."
    },
    frost_calm: {
        id: "frost_calm",
        label: "Frost Serene",
        icon: "spark",
        summary: "Crisp, tranquil poise that helps cool down nearby squabbles."
    },
    soothing_ribbon: {
        id: "soothing_ribbon",
        label: "Soothing Aura",
        icon: "heart",
        summary: "Gentle presence that eases tension and fosters warm friendships."
    }
};

function _now(pet) {
    return (pet && pet._simNow) ? pet._simNow : Date.now();
}

function abilityDef(id) {
    return ABILITIES[id] || null;
}

function abilitiesFor(petOrSpecies) {
    var ids = SpeciesProfile.abilitiesOf(petOrSpecies);
    var out = [];
    for (var i = 0; i < ids.length; i++) {
        if (ABILITIES[ids[i]]) out.push(ABILITIES[ids[i]]);
    }
    return out;
}

function has(petOrSpecies, id) {
    return SpeciesProfile.hasAbility(petOrSpecies, id);
}

function forageThreshold(pet) {
    return has(pet, "forage_stash") ? 0.34 : 0.24;
}

function perchBonus(pet) {
    return has(pet, "sky_drift") ? 0.12 : 0;
}

function codeWatchBonus(pet) {
    return has(pet, "aura_sense") ? 0.14 : 0;
}

function musicGrooveBonus(pet) {
    return has(pet, "chorus_lead") ? 0.16 : 0;
}

function enjoysAcrobaticToss(pet) {
    return has(pet, "sky_drift") || has(pet, "phase_blink");
}

function isNaturalPeacekeeper(pet) {
    if (SpeciesProfile.socialStyleOf(pet) === "guardian") return true;
    if (has(pet, "soothing_ribbon")) return true;
    if (has(pet, "frost_calm") && pet.personality && pet.personality.composure >= 0.45) return true;
    return false;
}

function restWithBonus(pet, otherPetOrSpecies) {
    var mySp = SpeciesProfile.trueSpeciesOf(pet);
    var oSp = typeof otherPetOrSpecies === "string"
        ? otherPetOrSpecies
        : SpeciesProfile.trueSpeciesOf(otherPetOrSpecies);
    var bonus = 0;
    if (has(oSp, "hearth_warmth")) bonus += 0.14;
    if (has(oSp, "soothing_ribbon") || has(mySp, "soothing_ribbon")) bonus += 0.10;
    var kin = SpeciesProfile.kinChemistry(mySp, oSp);
    if (kin.sameKin) bonus += 0.10;
    return bonus;
}

function startledStates(pet) {
    if (has(pet, "shell_bunker")) {
        var sp = SpeciesProfile.speciesOf(pet);
        var prof = SpeciesProfile.profileFor(sp);
        if (prof.calmGestures && prof.calmGestures.indexOf("special0") !== -1) {
            return ["special0", "hide"];
        }
        return ["hide", "cringe"];
    }
    return null;
}

function evaluateCandidates(pet, perc, nav, pickFn, m) {
    var out = [];
    var trueSp = SpeciesProfile.trueSpeciesOf(pet);
    var prof = SpeciesProfile.profileFor(trueSp);
    var abs = prof.abilities || [];
    if (abs.length === 0 || perc.fullscreen) return out;

    var p = pet.personality;

    for (var i = 0; i < abs.length; i++) {
        var aid = abs[i];

        if (aid === "illusion" && !pet.illusionSpecies
                && Social.canInitiatePeerBout(pet, 150000)
                && perc.nearest && perc.nearest.sameScreen && perc.nearest.dist < 270
                && !perc.nearest.resting && !perc.nearest.busySocial
                && pet.playDrive > 0.42 && pet.alertness > 0.40
                && !Memory.recent(pet, "illusion_prank", 900000)) {
            out.push({
                name: "illusion_prank",
                otherName: perc.nearest.name,
                score: pet.playDrive * (0.38 + p.playfulness * 0.62) * m.moodMult * m.active * 0.88,
                claimSocial: "show_off",
                claimGapMs: 150000,
                plan: _buildIllusionPlan(perc.nearest)
            });
        }

        if (aid === "phase_blink"
                && pet.exploreDrive > 0.44 && pet.playDrive > 0.30 && pet.alertness > 0.42
                && !Memory.recent(pet, "phase_jaunt", 480000)) {
            var target = _sameScreenBlinkTarget(pet, perc);
            if (target) {
                out.push({
                    name: "phase_jaunt",
                    score: (pet.exploreDrive * 0.55 + pet.playDrive * 0.45) * (0.42 + p.curiosity * 0.58) * m.moodMult * m.active * 0.82,
                    plan: _buildPhaseJauntPlan(pet, target)
                });
            }
        }

        if (aid === "hearth_warmth"
                && pet.restDrive > 0.24 && pet.alertness > 0.26 && pet.alertness < 0.76
                && !Memory.recent(pet, "hearth_bask", 540000)) {
            out.push({
                name: "hearth_bask",
                score: (pet.restDrive * 0.60 + (1 - pet.mood) * 0.25 + 0.18) * (0.45 + p.composure * 0.55) * 0.84,
                plan: _buildHearthBaskPlan(pet, perc, prof)
            });
        }

        if (aid === "lunar_pulse" && perc.isNight
                && pet.alertness > 0.28
                && !Memory.recent(pet, "lunar_vigil", 480000)) {
            out.push({
                name: "lunar_vigil",
                score: (0.38 + (pet.bond || 0.3) * 0.35 + p.composure * 0.30) * 0.90,
                plan: _buildLunarVigilPlan(pet, perc, prof)
            });
        }

        if (aid === "solar_bask" && !perc.isNight
                && pet.restDrive > 0.20 && pet.alertness > 0.30
                && !Memory.recent(pet, "sunlit_bask", 540000)) {
            out.push({
                name: "sunlit_bask",
                score: (0.30 + pet.restDrive * 0.45 + p.patience * 0.28) * m.active * 0.82,
                plan: _buildSunlitBaskPlan(pet, perc, prof)
            });
        }

        if (aid === "aura_sense"
                && pet.playDrive > 0.44 && pet.alertness > 0.44
                && !Memory.recent(pet, "aura_kata", 480000)) {
            out.push({
                name: "aura_kata",
                score: pet.playDrive * (0.40 + p.boldness * 0.38 + p.composure * 0.28) * m.moodMult * m.active * 0.84,
                plan: _buildAuraKataPlan(pet, prof)
            });
        }

        if (aid === "shadow_meld"
                && (perc.isNight || perc.userIdle)
                && pet.exploreDrive > 0.34 && pet.alertness > 0.34
                && !Memory.recent(pet, "shadow_prowl", 540000)) {
            out.push({
                name: "shadow_prowl",
                score: (pet.exploreDrive * 0.58 + pet.playDrive * 0.42) * (0.44 + p.curiosity * 0.56) * 0.86,
                plan: _buildShadowProwlPlan(pet, perc, prof)
            });
        }

        if (aid === "tide_splash"
                && pet.playDrive > 0.36 && pet.alertness > 0.34
                && !Memory.recent(pet, "puddle_spin", 480000)) {
            out.push({
                name: "puddle_spin",
                score: pet.playDrive * (0.42 + p.playfulness * 0.48 + p.composure * 0.20) * m.moodMult * m.active * 0.82,
                plan: _buildPuddleSpinPlan(pet, prof)
            });
        }
    }

    return out;
}

function _buildIllusionPlan(other) {
    var targetSp = (other && other.pet && other.pet.petData) ? other.pet.petData.sprite : "";
    return {
        name: "illusion_prank",
        label: "Illusion Prank on " + other.name,
        reason: "Morphing into " + other.name + "'s form with Illusion",
        otherName: other.name,
        urgency: 0.64,
        durationMs: 42000,
        thought: "Weaving a playful Illusion to surprise " + other.name,
        steps: [
            { kind: "ability_effect", effect: "illusion_shift", targetSpecies: targetSp, label: "Weaving Illusion" },
            { kind: "dash_relative", maneuver: "approach_angled", gait: "trot", radius: 74, label: "Padding up in disguise" },
            { kind: "social", label: "Surprising " + other.name, interaction: "illusion" },
            { kind: "act", label: "Playful spin", states: ["hop", "rotate"], faceOther: true },
            { kind: "ability_effect", effect: "illusion_clear", label: "Dropping Illusion" },
            { kind: "wander_apart", dist: 145, gait: "trot", label: "Scampering off" }
        ]
    };
}

function _sameScreenBlinkTarget(pet, perc) {
    var target = Memory.explorationTarget(pet);
    if (target && !target.otherScreen) return target;
    if (!perc || !perc.screen) return null;
    var pw = perc.petW || 64, ph = perc.petH || 64;
    var minX = perc.screen.x + 32;
    var maxX = Math.max(minX, perc.screen.x + perc.screen.w - pw - 32);
    var minY = perc.screen.y + (perc.screen.topInset || 0) + 32;
    var maxY = Math.max(minY, perc.screen.y + perc.screen.h - (perc.screen.bottomInset || 0) - ph - 28);
    if (maxX - minX < 96 && maxY - minY < 96) return null;
    var gx = perc.petGX < (minX + maxX) * 0.5
        ? (maxX - Math.random() * Math.min(180, (maxX - minX) * 0.35))
        : (minX + Math.random() * Math.min(180, (maxX - minX) * 0.35));
    var gy = Topology.clamp(minY + (maxY - minY) * (0.25 + Math.random() * 0.5), minY, maxY);
    return { gx: gx, gy: gy, otherScreen: false };
}

function _buildPhaseJauntPlan(pet, target) {
    var moves = SpeciesProfile.showOffMovesFor(pet);
    return {
        name: "phase_jaunt",
        label: "Psychic Blink",
        reason: "Blinking lightly across the desktop",
        urgency: 0.56,
        durationMs: 32000,
        thought: "Blinked weightlessly to a fresh vantage point",
        steps: [
            { kind: "act", label: "Focusing psychic spark", states: ["pose", "twirl", "rotate"] },
            { kind: "ability_effect", effect: "phase_hop", gx: target.gx, gy: target.gy, label: "Phase blink" },
            { kind: "act", label: "Floating arrival", states: moves },
            { kind: "observe", label: "Surveying spot", durationMs: 7000 }
        ]
    };
}

function _buildHearthBaskPlan(pet, perc, prof) {
    var sigState = (prof.signature && prof.signature.state) ? prof.signature.state : "rotate";
    return {
        name: "hearth_bask",
        label: "Warming the Hearth",
        reason: "Kindling a warm, cozy spot",
        urgency: 0.48,
        durationMs: 75000,
        thought: "Kindling gentle warmth before curling down",
        steps: [
            { kind: "act", label: "Kindling warm embers", states: [sigState, "rotate"] },
            { kind: "ability_effect", effect: "warmth_aura", label: "Sharing gentle warmth" },
            { kind: "loaf_watch", label: "Resting in warm glow", attend: perc.win ? "window" : "", durationMs: 32000 }
        ]
    };
}

function _buildLunarVigilPlan(pet, perc, prof) {
    var sigState = (prof.signature && prof.signature.state) ? prof.signature.state : "pose";
    var steps = [];
    if (perc.win) {
        steps.push({ kind: "travel", gait: "amble", label: "Padding near night work", gx: perc.win.loafBesideGX, gy: perc.win.loafBesideGY });
    }
    steps.push({ kind: "act", label: "Moonlit poise", states: [sigState, "pose", "nod"], attendWindow: !!perc.win });
    steps.push({ kind: "ability_effect", effect: "lunar_glow", label: "Quiet night watch" });
    steps.push({ kind: "loaf_watch", label: "Keeping moonlit vigil", attend: perc.win ? "window" : "cursor", durationMs: 42000 });
    return {
        name: "lunar_vigil",
        label: "Moonlit Vigil",
        reason: "Keeping serene moonlit watch",
        urgency: 0.52,
        durationMs: 120000,
        thought: "Keeping calm moonlit company through the night",
        steps: steps
    };
}

function _buildSunlitBaskPlan(pet, perc, prof) {
    var calm = SpeciesProfile.calmGesturesFor(pet);
    return {
        name: "sunlit_bask",
        label: "Sunlit Bask",
        reason: "Soaking up calm workspace light",
        urgency: 0.44,
        durationMs: 68000,
        thought: "Stretching out comfortably in the daylight",
        steps: [
            { kind: "act", label: "Leafy stretch", states: calm },
            { kind: "ability_effect", effect: "solar_stretch", label: "Basking in light" },
            { kind: "loaf_watch", label: "Basking peacefully", attend: perc.win ? "window" : "", durationMs: 28000 }
        ]
    };
}

function _buildAuraKataPlan(pet, prof) {
    var spar = SpeciesProfile.sparMovesFor(pet);
    return {
        name: "aura_kata",
        label: "Focus Kata",
        reason: "Practicing crisp martial form",
        urgency: 0.58,
        durationMs: 32000,
        thought: "Practicing a crisp solo focus kata",
        steps: [
            { kind: "act", label: "Centering stance", states: ["pose", "nod"] },
            { kind: "act", label: "Crisp strike form", states: spar },
            { kind: "act", label: "Follow-through", states: spar },
            { kind: "pant", label: "Steady breath" }
        ]
    };
}

function _buildShadowProwlPlan(pet, perc, prof) {
    var pw = perc.petW || 64, ph = perc.petH || 64;
    var minX = perc.screen.x + 32;
    var maxX = Math.max(minX, perc.screen.x + perc.screen.w - pw - 32);
    var minY = perc.screen.y + (perc.screen.topInset || 0) + 32;
    var maxY = Math.max(minY, perc.screen.y + perc.screen.h - (perc.screen.bottomInset || 0) - ph - 28);
    var ang = Math.random() * Math.PI * 2;
    var tx = Topology.clamp(perc.petGX + Math.cos(ang) * 210, minX, maxX);
    var ty = Topology.clamp(perc.petGY + Math.sin(ang) * 150, minY, maxY);
    return {
        name: "shadow_prowl",
        label: "Shadow Slip",
        reason: "Drifting playfully through shadows",
        urgency: 0.54,
        durationMs: 42000,
        thought: "Slipped playfully across the floor shadows",
        steps: [
            { kind: "act", label: "Melting into shadow", states: ["sink", "rotate", "hide"] },
            { kind: "travel", gait: "trot", label: "Gliding quietly", gx: tx, gy: ty },
            { kind: "act", label: "Popping back up", states: SpeciesProfile.showOffMovesFor(pet) }
        ]
    };
}

function _buildPuddleSpinPlan(pet, prof) {
    var sigState = (prof.signature && prof.signature.state) ? prof.signature.state : "twirl";
    return {
        name: "puddle_spin",
        label: "Carefree Spin",
        reason: "Unbothered tidepool twirl",
        urgency: 0.52,
        durationMs: 28000,
        thought: "Did a carefree, unbothered spin",
        steps: [
            { kind: "act", label: "Carefree spin", states: [sigState, "twirl", "rotate"] },
            { kind: "act", label: "Happy hop", states: ["hop", "nod"] }
        ]
    };
}

function executeStep(pet, plan, step, nav, pickFn, advanceFn) {
    var eff = step.effect || "";
    if (eff === "illusion_shift") {
        var sinkChoice = pickFn ? pickFn(pet, ["sink", "rotate"]) : "sink";
        pet.enterState(sinkChoice);
        pet.illusionSpecies = step.targetSpecies || "";
        pet.illusionUntil = _now(pet) + 22000;
        return;
    }
    if (eff === "illusion_clear") {
        pet.illusionSpecies = "";
        pet.illusionUntil = 0;
        var clearChoice = pickFn ? pickFn(pet, ["rotate", "hop"]) : "rotate";
        pet.enterState(clearChoice);
        return;
    }
    if (eff === "phase_hop") {
        var scr = Topology.currentScreen(pet);
        if (step.gx !== undefined && step.gy !== undefined && scr) {
            pet.worldX = step.gx - scr.x;
            pet.worldY = step.gy - scr.y;
        }
        if (pet.sprite && pet.sprite.triggerSquash) {
            pet.sprite.triggerSquash(0.86, 1.16);
        }
        advanceFn(pet, nav, pickFn);
        return;
    }
    if (eff === "warmth_aura") {
        pet.mood = Drives.clamp01(pet.mood + 0.04);
        pet.comfortDrive = Math.max(0, pet.comfortDrive - 0.18);
        if (pet.petManager && pet.petManager.pets) {
            var sx = pet.screenX(), sy = pet.screenY();
            var myGX = sx + pet.worldX, myGY = sy + pet.worldY;
            for (var i = 0; i < pet.petManager.pets.length; i++) {
                var o = pet.petManager.pets[i];
                if (!o || o === pet || o.screenX() !== sx || o.screenY() !== sy) continue;
                var d = Math.hypot((o.screenX() + o.worldX) - myGX, (o.screenY() + o.worldY) - myGY);
                if (d < 240) {
                    o.mood = Drives.clamp01(o.mood + 0.03);
                    o.comfortDrive = Math.max(0, o.comfortDrive - 0.12);
                }
            }
        }
        advanceFn(pet, nav, pickFn);
        return;
    }
    if (eff === "lunar_glow") {
        pet.mood = Drives.clamp01(pet.mood + 0.04);
        pet.alertness = Drives.clamp01(pet.alertness + 0.06);
        advanceFn(pet, nav, pickFn);
        return;
    }
    if (eff === "solar_stretch") {
        pet.mood = Drives.clamp01(pet.mood + 0.05);
        pet.restDrive = Math.max(0, pet.restDrive - 0.10);
        advanceFn(pet, nav, pickFn);
        return;
    }
    advanceFn(pet, nav, pickFn);
}

function onPlanFinished(pet, plan) {
    if (!plan) return false;
    switch (plan.name) {
    case "phase_jaunt":
        pet.exploreDrive = Math.max(0, pet.exploreDrive - 0.28);
        pet.playDrive = Math.max(0, pet.playDrive - 0.14);
        Drives.happier(pet, 0.025);
        Memory.recordEpisode(pet, "phase_jaunt", { valence: 0.38 });
        return true;
    case "hearth_bask":
        pet.restDrive = Math.max(0, pet.restDrive - 0.18);
        Drives.happier(pet, 0.03);
        Memory.recordPlaceAffect(pet, 0.14);
        Memory.recordEpisode(pet, "hearth_bask", { valence: 0.35 });
        return true;
    case "lunar_vigil":
        pet.socialDrive = Math.max(0, pet.socialDrive - 0.20);
        Drives.shiftTrust(pet, 0.015);
        Memory.recordEpisode(pet, "lunar_vigil", { valence: 0.42, salience: 0.52 });
        return true;
    case "sunlit_bask":
        pet.restDrive = Math.max(0, pet.restDrive - 0.16);
        Drives.happier(pet, 0.03);
        Memory.recordEpisode(pet, "sunlit_bask", { valence: 0.34 });
        return true;
    case "aura_kata":
        pet.playDrive = Math.max(0, pet.playDrive - 0.24);
        Drives.happier(pet, 0.03);
        pet.recentDrift = Personality.shiftRecent(pet.recentDrift, "composure", 0.007);
        Memory.recordEpisode(pet, "aura_kata", { valence: 0.38 });
        return true;
    case "shadow_prowl":
        pet.exploreDrive = Math.max(0, pet.exploreDrive - 0.24);
        pet.playDrive = Math.max(0, pet.playDrive - 0.16);
        Drives.happier(pet, 0.025);
        Memory.recordEpisode(pet, "shadow_prowl", { valence: 0.36 });
        return true;
    case "puddle_spin":
        pet.playDrive = Math.max(0, pet.playDrive - 0.22);
        pet.boredom = Math.max(0, pet.boredom - 0.18);
        Drives.happier(pet, 0.03);
        Memory.recordEpisode(pet, "puddle_spin", { valence: 0.38 });
        return true;
    default:
        return false;
    }
}

function sanctuaryActivity(rec, prof, isNight) {
    var abs = (prof && prof.abilities) || [];
    if (abs.length === 0) return "";
    var primary = abs[0];
    switch (primary) {
    case "illusion":
        return "Practicing playful shadow disguises in " + prof.biome;
    case "phase_blink":
        return "Drifting weightlessly above " + prof.biome;
    case "hearth_warmth":
        return "Tending a warm hearth spot in " + prof.biome;
    case "lunar_pulse":
        return isNight
            ? ("Glowing softly under the stars in " + prof.biome)
            : ("Resting quietly in the shade of " + prof.biome);
    case "solar_bask":
        return !isNight
            ? ("Basking in a warm sunbeam across " + prof.biome)
            : ("Tucked among quiet leaves in " + prof.biome);
    case "shell_bunker":
        return "Anchored contentedly inside its shell in " + prof.biome;
    case "sky_drift":
        return "Perching along a breezy overlook in " + prof.biome;
    case "aura_sense":
        return "Practicing calm focus forms in " + prof.biome;
    case "chorus_lead":
        return "Humming a cheerful rhythm in " + prof.biome;
    case "shadow_meld":
        return "Slipping playfully through cool shadows in " + prof.biome;
    case "tide_splash":
        return "Paddling unhurriedly around " + prof.biome;
    case "forage_stash":
        return "Looking after a cozy berry stash in " + prof.biome;
    case "frost_calm":
        return "Resting in a crisp, tranquil nook of " + prof.biome;
    case "soothing_ribbon":
        return "Sharing a calm, gentle presence in " + prof.biome;
    default:
        return "";
    }
}

function sanctuaryReadinessDelta(rec, prof, env) {
    var e = env || {};
    var delta = 0;
    var sp = rec ? rec.sprite : "";
    if (e.isNight && has(sp, "lunar_pulse")) delta += 0.10;
    if (!e.isNight && has(sp, "solar_bask")) delta += 0.08;
    if (e.mediaPlaying && has(sp, "chorus_lead")) delta += 0.14;
    if (e.isCode && has(sp, "aura_sense")) delta += 0.10;
    return delta;
}
