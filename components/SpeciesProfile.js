.import "species/Biomes.js" as Biomes
.import "species/Meadow.js" as Meadow
.import "species/Woods.js" as Woods
.import "species/Hearth.js" as Hearth
.import "species/Hollow.js" as Hollow
.import "species/Tidepool.js" as Tidepool
.import "species/Loft.js" as Loft

var BIOME_LIST = Biomes.BIOME_LIST;
var BIOME_MAP = Biomes.BIOME_MAP;
var KIN_GROUPS = Biomes.KIN_GROUPS;

var DEFAULT_PROFILE = {
    id: "companion",
    displayName: "Companion",
    temperament: "emergent",
    biome: "Sunlit Meadow",
    kinGroup: "",
    abilities: [],
    blurb: "Quiet desktop companion.",
    nocturnalAffinity: false,
    illusionCapable: false,
    socialStyle: "parallel",
    standMode: "hold0",
    idleSpeed: 0.55,
    clips: {
        idle: { holdAtFrame: 0, speed: 0.55 },
        perch: { holdAtFrame: 0, speed: 0.55 }
    },
    vocalState: "nod",
    altVocalState: "hop",
    calmGestures: ["nod", "rotate"],
    affectionGestures: ["nod", "rotate"],
    greetGestures: ["nod"],
    settleGestures: ["rotate"],
    sparMoves: ["attack", "strike", "double", "hop"],
    showOffMoves: ["rotate", "hop", "nod"],
    dodgeMoves: ["hop", "rotate"],
    standoffMoves: ["charge", "nod"],
    dismissMoves: ["rotate", "nod"],
    signature: { state: "rotate", minPlay: 0.45, label: "Stretching out" },
    loafAnim: "EventSleep",
    sleepAnim: "Sleep",
    wakeState: "wake",
    pantState: "deepBreath",
    northWatch: false,
    gait: { amble: 0.50, trot: 1.00, scamper: 1.60 },
    perchAffinity: 1.00,
    windowWatchAffinity: 1.00
};

function _cloneClip(c) {
    if (!c) return null;
    var out = {};
    var ks = Object.keys(c);
    for (var i = 0; i < ks.length; i++) out[ks[i]] = c[ks[i]];
    return out;
}

function _normalizeSpecies(id, raw, defaultBiome) {
    var r = raw || {};
    var rawClips = r.clips || {};
    var clips = {};
    var cKeys = Object.keys(rawClips);
    for (var i = 0; i < cKeys.length; i++) {
        clips[cKeys[i]] = _cloneClip(rawClips[cKeys[i]]);
    }

    if (!clips.idle) {
        var idleClip = { speed: r.idleSpeed !== undefined ? r.idleSpeed : 0.55 };
        if (r.standMode === "hold0") idleClip.holdAtFrame = 0;
        else if (r.standMode === "prefix10") { idleClip.startFrame = 0; idleClip.endFrame = 9; }
        clips.idle = idleClip;
    } else if (clips.idle.speed === undefined) {
        clips.idle.speed = r.idleSpeed !== undefined ? r.idleSpeed : 0.55;
    }

    if (!clips.perch) {
        clips.perch = _cloneClip(clips.idle);
    }
    if (!clips.loaf && r.loafAnim) {
        clips.loaf = { anim: r.loafAnim };
    }
    if (clips.loaf && !clips.sit) {
        clips.sit = _cloneClip(clips.loaf);
    }
    if (!clips.deepsleep && r.sleepAnim && r.sleepAnim !== "Sleep") {
        clips.deepsleep = { anim: r.sleepAnim };
    }

    var abilities = Array.isArray(r.abilities) ? r.abilities.slice() : [];
    if (r.illusionCapable && abilities.indexOf("illusion") === -1) {
        abilities.unshift("illusion");
    }

    var standMode = "loop";
    if (clips.idle.holdAtFrame === 0) standMode = "hold0";
    else if (clips.idle.endFrame !== undefined) standMode = "slice";

    var gaitSrc = r.gait || DEFAULT_PROFILE.gait;
    var sigSrc = r.signature || DEFAULT_PROFILE.signature;

    return {
        id: id,
        displayName: r.displayName || (id.charAt(0).toUpperCase() + id.slice(1)),
        temperament: r.temperament || "emergent",
        biome: r.biome || defaultBiome || DEFAULT_PROFILE.biome,
        kinGroup: r.kinGroup || "",
        abilities: abilities,
        blurb: r.blurb || DEFAULT_PROFILE.blurb,
        nocturnalAffinity: !!r.nocturnalAffinity,
        illusionCapable: abilities.indexOf("illusion") !== -1,
        socialStyle: r.socialStyle || DEFAULT_PROFILE.socialStyle,
        standMode: standMode,
        idleSpeed: clips.idle.speed,
        clips: clips,
        vocalState: r.vocalState || DEFAULT_PROFILE.vocalState,
        altVocalState: r.altVocalState !== undefined ? r.altVocalState : DEFAULT_PROFILE.altVocalState,
        calmGestures: (r.calmGestures || DEFAULT_PROFILE.calmGestures).slice(),
        affectionGestures: (r.affectionGestures || DEFAULT_PROFILE.affectionGestures).slice(),
        greetGestures: (r.greetGestures || DEFAULT_PROFILE.greetGestures).slice(),
        settleGestures: (r.settleGestures || DEFAULT_PROFILE.settleGestures).slice(),
        sparMoves: (r.sparMoves || DEFAULT_PROFILE.sparMoves).slice(),
        showOffMoves: (r.showOffMoves || DEFAULT_PROFILE.showOffMoves).slice(),
        dodgeMoves: (r.dodgeMoves || DEFAULT_PROFILE.dodgeMoves).slice(),
        standoffMoves: (r.standoffMoves || DEFAULT_PROFILE.standoffMoves).slice(),
        dismissMoves: (r.dismissMoves || DEFAULT_PROFILE.dismissMoves).slice(),
        signature: {
            state: sigSrc.state || "rotate",
            minPlay: sigSrc.minPlay !== undefined ? sigSrc.minPlay : 0.40,
            label: sigSrc.label || "Stretching out"
        },
        loafAnim: (clips.loaf && clips.loaf.anim) || r.loafAnim || "EventSleep",
        sleepAnim: (clips.deepsleep && clips.deepsleep.anim) || r.sleepAnim || "Sleep",
        wakeState: r.wakeState !== undefined ? r.wakeState : DEFAULT_PROFILE.wakeState,
        pantState: r.pantState !== undefined ? r.pantState : DEFAULT_PROFILE.pantState,
        northWatch: r.northWatch !== undefined ? !!r.northWatch : false,
        gait: {
            amble: gaitSrc.amble !== undefined ? gaitSrc.amble : 0.50,
            trot: gaitSrc.trot !== undefined ? gaitSrc.trot : 1.00,
            scamper: gaitSrc.scamper !== undefined ? gaitSrc.scamper : 1.60
        },
        perchAffinity: r.perchAffinity !== undefined ? r.perchAffinity : 1.00,
        windowWatchAffinity: r.windowWatchAffinity !== undefined ? r.windowWatchAffinity : 1.00
    };
}

var _MODULES = [Meadow, Woods, Hearth, Hollow, Tidepool, Loft];
var PROFILES = {};

for (var m = 0; m < _MODULES.length; m++) {
    var mod = _MODULES[m];
    var map = mod.SPECIES || {};
    var ids = Object.keys(map);
    for (var s = 0; s < ids.length; s++) {
        var spId = ids[s];
        PROFILES[spId] = _normalizeSpecies(spId, map[spId], mod.BIOME);
    }
}

var SPECIES_LIST = Object.keys(PROFILES).sort();
var SPECIES_TEMPERAMENT = {};
for (var ti = 0; ti < SPECIES_LIST.length; ti++) {
    var spKey = SPECIES_LIST[ti];
    SPECIES_TEMPERAMENT[spKey] = PROFILES[spKey].temperament;
}

function profileFor(species) {
    return (species && PROFILES[species]) ? PROFILES[species] : DEFAULT_PROFILE;
}

function speciesOf(pet) {
    if (pet && pet.illusionSpecies) return pet.illusionSpecies;
    if (pet && pet.petData && pet.petData.sprite) return pet.petData.sprite;
    if (pet && typeof pet.sprite === "string") return pet.sprite;
    return "";
}

function trueSpeciesOf(pet) {
    if (pet && pet.petData && pet.petData.sprite) return pet.petData.sprite;
    if (pet && typeof pet.sprite === "string") return pet.sprite;
    return "";
}

function socialStyleOf(petOrSpecies) {
    var sp = typeof petOrSpecies === "string" ? petOrSpecies : trueSpeciesOf(petOrSpecies);
    return profileFor(sp).socialStyle || "parallel";
}

function abilitiesOf(petOrSpecies) {
    var sp = typeof petOrSpecies === "string" ? petOrSpecies : trueSpeciesOf(petOrSpecies);
    return profileFor(sp).abilities.slice();
}

function hasAbility(petOrSpecies, abilityId) {
    var sp = typeof petOrSpecies === "string" ? petOrSpecies : trueSpeciesOf(petOrSpecies);
    return profileFor(sp).abilities.indexOf(abilityId) !== -1;
}

function kinChemistry(spA, spB) {
    if (!spA || !spB) return { affinityDelta: 0, respectDelta: 0, sameKin: false };
    var pA = profileFor(spA);
    var pB = profileFor(spB);
    var aff = 0, resp = 0, sameKin = false;
    if (spA === spB) {
        aff += 0.05;
        resp += 0.03;
        sameKin = true;
    } else if (pA.kinGroup && pA.kinGroup === pB.kinGroup && KIN_GROUPS[pA.kinGroup]) {
        var kg = KIN_GROUPS[pA.kinGroup];
        aff += kg.affinityBonus;
        resp += kg.respectBonus;
        sameKin = true;
    } else if (pA.biome && pA.biome === pB.biome) {
        aff += 0.025;
    }
    if (pA.abilities.indexOf("soothing_ribbon") !== -1 || pB.abilities.indexOf("soothing_ribbon") !== -1) {
        aff += 0.035;
    }
    return { affinityDelta: aff, respectDelta: resp, sameKin: sameKin };
}

function clipOverrideFor(species, state) {
    var p = profileFor(species);
    return (p.clips && p.clips[state]) ? p.clips[state] : null;
}

function standSpec(species) {
    var p = profileFor(species);
    return { mode: p.standMode, speed: p.idleSpeed };
}

function loafAnimName(species, anims) {
    var p = profileFor(species);
    if (anims && anims[p.loafAnim]) return p.loafAnim;
    if (anims && anims.EventSleep) return "EventSleep";
    if (anims && anims.Sleep) return "Sleep";
    return "Idle";
}

function canWatchNorth(pet) {
    var p = profileFor(speciesOf(pet));
    if (!p.northWatch) return false;
    var anims = pet && pet.sprite ? pet.sprite._animData : null;
    return !anims || (!!anims.Sit && !!anims.LookUp);
}

function vocalStateFor(pet, excited) {
    var p = profileFor(speciesOf(pet));
    if (excited && p.altVocalState) return p.altVocalState;
    return p.vocalState || "nod";
}

function calmGesturesFor(pet) {
    return profileFor(speciesOf(pet)).calmGestures.slice();
}

function affectionGesturesFor(pet) {
    return profileFor(speciesOf(pet)).affectionGestures.slice();
}

function greetGesturesFor(pet) {
    return profileFor(speciesOf(pet)).greetGestures.slice();
}

function settleGesturesFor(pet) {
    return profileFor(speciesOf(pet)).settleGestures.slice();
}

function sparMovesFor(pet) {
    return (profileFor(speciesOf(pet)).sparMoves || DEFAULT_PROFILE.sparMoves).slice();
}

function showOffMovesFor(pet) {
    return (profileFor(speciesOf(pet)).showOffMoves || DEFAULT_PROFILE.showOffMoves).slice();
}

function dodgeMovesFor(pet) {
    return (profileFor(speciesOf(pet)).dodgeMoves || DEFAULT_PROFILE.dodgeMoves).slice();
}

function standoffMovesFor(pet) {
    return (profileFor(speciesOf(pet)).standoffMoves || DEFAULT_PROFILE.standoffMoves).slice();
}

function dismissMovesFor(pet) {
    return (profileFor(speciesOf(pet)).dismissMoves || DEFAULT_PROFILE.dismissMoves).slice();
}

function wakeStateFor(pet) {
    return profileFor(speciesOf(pet)).wakeState || "wake";
}

function pantStateFor(pet) {
    var p = profileFor(speciesOf(pet));
    if (!p.pantState) return "";
    var anims = pet && pet.sprite ? pet.sprite._animData : null;
    var clip = p.clips ? p.clips[p.pantState] : null;
    var needed = (clip && clip.anim) || (p.pantState === "deepBreath" ? "DeepBreath" : "");
    if (!needed || !anims || anims[needed]) return p.pantState;
    return "";
}

function gaitMultiplier(pet, gaitName) {
    var g = profileFor(speciesOf(pet)).gait;
    if (gaitName === "amble") return g.amble;
    if (gaitName === "scamper") return g.scamper;
    return g.trot;
}
