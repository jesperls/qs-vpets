.pragma library

.import "Util.js" as Util

var TRAIT_KEYS = [
    "energy",
    "curiosity",
    "playfulness",
    "sleepiness",
    "boldness",
    "sociability",
    "patience",
    "composure"
];

var TRAIT_LABELS = {
    energy: "Energy",
    curiosity: "Curiosity",
    playfulness: "Playfulness",
    sleepiness: "Drowsiness",
    boldness: "Boldness",
    sociability: "Affection",
    patience: "Patience",
    composure: "Composure"
};

var PRESETS = {
    emergent: {
        energy: 0.50, curiosity: 0.52, playfulness: 0.50, sleepiness: 0.45,
        boldness: 0.48, sociability: 0.50, patience: 0.52, composure: 0.50
    },
    lazy: {
        energy: 0.18, curiosity: 0.25, playfulness: 0.20, sleepiness: 0.88,
        boldness: 0.30, sociability: 0.35, patience: 0.82, composure: 0.85
    },
    energetic: {
        energy: 0.92, curiosity: 0.62, playfulness: 0.84, sleepiness: 0.12,
        boldness: 0.78, sociability: 0.70, patience: 0.22, composure: 0.40
    },
    curious: {
        energy: 0.56, curiosity: 0.92, playfulness: 0.48, sleepiness: 0.30,
        boldness: 0.62, sociability: 0.52, patience: 0.54, composure: 0.55
    },
    chill: {
        energy: 0.32, curiosity: 0.38, playfulness: 0.30, sleepiness: 0.52,
        boldness: 0.48, sociability: 0.46, patience: 0.90, composure: 0.88
    },
    brave: {
        energy: 0.70, curiosity: 0.68, playfulness: 0.52, sleepiness: 0.22,
        boldness: 0.94, sociability: 0.52, patience: 0.44, composure: 0.78
    },
    shy: {
        energy: 0.34, curiosity: 0.58, playfulness: 0.34, sleepiness: 0.44,
        boldness: 0.12, sociability: 0.26, patience: 0.72, composure: 0.24
    },
    playful: {
        energy: 0.74, curiosity: 0.56, playfulness: 0.94, sleepiness: 0.18,
        boldness: 0.64, sociability: 0.82, patience: 0.32, composure: 0.52
    },
    grumpy: {
        energy: 0.40, curiosity: 0.24, playfulness: 0.14, sleepiness: 0.62,
        boldness: 0.56, sociability: 0.16, patience: 0.28, composure: 0.36
    },
    nocturnal: {
        energy: 0.54, curiosity: 0.74, playfulness: 0.44, sleepiness: 0.38,
        boldness: 0.66, sociability: 0.40, patience: 0.68, composure: 0.72
    }
};

var QUIRK_DEFS = {
    terminal_supervisor: {
        label: "Code Companion",
        icon: "terminal",
        summary: "Settles quietly beside editors and terminals while you work."
    },
    melomaniac: {
        label: "Melomaniac",
        icon: "music",
        summary: "Perks up and sways gently whenever music plays."
    },
    night_watch: {
        label: "Night Watch",
        icon: "moon",
        summary: "Stays alert to keep quiet company during late-night sessions."
    },
    screen_hopper: {
        label: "Horizon Walker",
        icon: "compass",
        summary: "Roams freely across connected displays as one wide territory."
    },
    velcro_companion: {
        label: "Devoted Shadow",
        icon: "heart",
        summary: "Deeply bonded; greets you warmly and stays near your focus."
    },
    cozy_hermit: {
        label: "Quiet Hermit",
        icon: "leaf",
        summary: "Cherishes a calm corner and restores composure there."
    },
    pack_spark: {
        label: "Pack Spark",
        icon: "spark",
        summary: "Initiates playful bouts, tag chases, and shared naps."
    },
    sky_acrobat: {
        label: "Sky Acrobat",
        icon: "wind",
        summary: "Delights in being lifted and tossed gently across the screen."
    },
    window_percher: {
        label: "Ledge Percher",
        icon: "perch",
        summary: "Hops onto top window ledges to survey the desktop below."
    },
    daydreamer: {
        label: "Daydreamer",
        icon: "dream",
        summary: "Vivid sleeper whose naps weave lasting reflections."
    }
};

var JITTER = 0.08;
var CORE_BOUND = 0.22;
var RECENT_BOUND = 0.14;
var MAX_ACTIVE_QUIRKS = 3;

var clamp = Util.clamp;
var clamp01 = Util.clamp01;

function _hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h || 1;
}

function _seeded01(seed) {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5; seed >>>= 0;
    return (seed >>> 0) / 4294967296;
}

function resolveBase(preset, name, overrides) {
    var base = (preset && typeof preset === "object")
        ? preset
        : (PRESETS[preset] || PRESETS.emergent);
    var jitterSpan = preset === "emergent" ? 0.12 : JITTER;
    var seed = _hash(name || "pet");
    var p = {};
    for (var i = 0; i < TRAIT_KEYS.length; i++) {
        var k = TRAIT_KEYS[i];
        var r = _seeded01(seed + (i + 1) * 7919);
        var b = base[k] !== undefined ? base[k] : 0.5;
        p[k] = clamp01(b + (r - 0.5) * 2 * jitterSpan);
    }
    if (overrides && typeof overrides === "object") {
        for (var j = 0; j < TRAIT_KEYS.length; j++) {
            var ok = TRAIT_KEYS[j];
            if (overrides[ok] !== undefined) p[ok] = clamp01(overrides[ok]);
        }
    }
    return p;
}

function compose(base, coreDrift, recentDrift) {
    var out = {};
    for (var i = 0; i < TRAIT_KEYS.length; i++) {
        var k = TRAIT_KEYS[i];
        var b = base && base[k] !== undefined ? base[k] : 0.5;
        var cd = coreDrift && coreDrift[k] ? clamp(coreDrift[k], -CORE_BOUND, CORE_BOUND) : 0;
        var rd = recentDrift && recentDrift[k] ? clamp(recentDrift[k], -RECENT_BOUND, RECENT_BOUND) : 0;
        out[k] = clamp01(b + cd + rd);
    }
    return out;
}

function totalDelta(base, effective) {
    var out = {};
    for (var i = 0; i < TRAIT_KEYS.length; i++) {
        var k = TRAIT_KEYS[i];
        out[k] = Math.round(((effective[k] || 0.5) - (base[k] || 0.5)) * 100) / 100;
    }
    return out;
}

function hasQuirk(pet, id) {
    return !!(pet.quirks && pet.quirks.indexOf(id) !== -1);
}

// Plasticity tapers gently with maturity so veterans feel established yet still alive.
function plasticityRate(maturity) {
    var m = clamp01(maturity || 0);
    return 1.0 - m * 0.45;
}

function shiftRecent(recentDrift, key, delta) {
    var next = Object.assign({}, recentDrift || {});
    next[key] = clamp((next[key] || 0) + delta, -RECENT_BOUND, RECENT_BOUND);
    return next;
}

function consolidateCore(coreDrift, recentDrift, episodeSignals, maturity) {
    var rate = plasticityRate(maturity);
    var nextCore = Object.assign({}, coreDrift || {});
    var nextRecent = Object.assign({}, recentDrift || {});

    for (var i = 0; i < TRAIT_KEYS.length; i++) {
        var k = TRAIT_KEYS[i];
        var sig = (episodeSignals && episodeSignals[k]) || 0;
        var carry = (nextRecent[k] || 0) * 0.26;
        var delta = (sig + carry) * rate;
        var cur = nextCore[k] || 0;
        // Homeostatic pull preserves innate identity while letting sustained lifestyle differences stick.
        var homeo = -cur * 0.062;
        var updated = clamp(cur + delta + homeo, -CORE_BOUND, CORE_BOUND);
        if (Math.abs(updated) < 0.003) delete nextCore[k];
        else nextCore[k] = Math.round(updated * 10000) / 10000;

        var rem = (nextRecent[k] || 0) * 0.62;
        if (Math.abs(rem) < 0.003) delete nextRecent[k];
        else nextRecent[k] = Math.round(rem * 10000) / 10000;
    }
    return { core: nextCore, recent: nextRecent };
}

function quirkAffinity(traits, qid) {
    var t = traits || PRESETS.emergent;
    switch (qid) {
    case "screen_hopper":
        return clamp(0.45 + t.boldness * 0.52 + t.curiosity * 0.42 + t.energy * 0.25 - t.sleepiness * 0.22, 0.38, 1.55);
    case "window_percher":
        return clamp(0.48 + t.curiosity * 0.48 + t.boldness * 0.44 - t.sleepiness * 0.24, 0.40, 1.50);
    case "terminal_supervisor":
        return clamp(0.28 + t.patience * 0.62 + t.composure * 0.48 - t.energy * 0.28, 0.25, 1.50);
    case "melomaniac":
        return clamp(0.50 + t.playfulness * 0.56 + t.energy * 0.28, 0.44, 1.50);
    case "night_watch":
        return clamp(0.46 + t.composure * 0.54 + t.curiosity * 0.38 - t.sleepiness * 0.24 + (t.composure > 0.65 && t.patience > 0.62 ? 0.12 : 0), 0.38, 1.55);
    case "velcro_companion":
        return clamp(0.46 + t.sociability * 0.68 + t.patience * 0.22, 0.40, 1.55);
    case "cozy_hermit":
        return clamp(0.44 + t.patience * 0.44 + (1 - t.sociability) * 0.42 + (1 - t.boldness) * 0.28, 0.40, 1.55);
    case "pack_spark":
        return clamp(0.42 + t.playfulness * 0.58 + t.sociability * 0.44 + t.energy * 0.20, 0.38, 1.55);
    case "sky_acrobat":
        return clamp(0.44 + t.boldness * 0.54 + t.playfulness * 0.48, 0.40, 1.55);
    case "daydreamer":
        return clamp(0.42 + t.sleepiness * 0.68 + t.patience * 0.32 - t.energy * 0.18, 0.38, 1.55);
    default:
        return 1.0;
    }
}

function updateQuirks(quirkProgress, currentQuirks, increments) {
    var prog = Object.assign({}, quirkProgress || {});
    var qKeys = Object.keys(QUIRK_DEFS);
    for (var i = 0; i < qKeys.length; i++) {
        var k = qKeys[i];
        var inc = (increments && increments[k]) || 0;
        // Unreinforced habits slowly soften, earned ones have inertia.
        var wasActive = currentQuirks && currentQuirks.indexOf(k) !== -1;
        var decay = wasActive ? 0.992 : 0.975;
        var v = clamp01((prog[k] || 0) * decay + inc);
        if (v < 0.01) delete prog[k];
        else prog[k] = Math.round(v * 1000) / 1000;
    }

    var candidates = [];
    for (var j = 0; j < qKeys.length; j++) {
        var qid = qKeys[j];
        var score = prog[qid] || 0;
        var threshold = (currentQuirks && currentQuirks.indexOf(qid) !== -1) ? 0.42 : 0.58;
        if (score >= threshold) candidates.push({ id: qid, score: score });
    }
    var prevLead = (currentQuirks && currentQuirks.length > 0) ? currentQuirks[0] : "";
    candidates.sort(function(a, b) {
        var sa = a.score + (a.id === prevLead ? 0.08 : 0);
        var sb = b.score + (b.id === prevLead ? 0.08 : 0);
        return sb - sa;
    });
    var active = [];
    for (var c = 0; c < Math.min(MAX_ACTIVE_QUIRKS, candidates.length); c++) {
        active.push(candidates[c].id);
    }
    return { progress: prog, active: active };
}

function archetypeTitle(traits, quirks, maturity, bond) {
    var m = clamp01(maturity || 0);
    var b = clamp01(bond === undefined ? 0.3 : bond);
    if (m < 0.06 && (!quirks || quirks.length === 0)) return "Curious Hatchling";

    var adj = "Balanced";
    if (traits.boldness < 0.22) adj = "Bashful";
    else if (traits.sleepiness > 0.74) adj = "Dreamy";
    else if (traits.boldness < 0.29) adj = "Bashful";
    else if (traits.sociability < 0.28 && traits.patience < 0.42) adj = "Prickly";
    else if (traits.playfulness > 0.74 && traits.boldness > 0.60) adj = "Mischievous";
    else if (traits.energy > 0.76 && traits.playfulness > 0.58) adj = "Spirited";
    else if (traits.composure > 0.74 && traits.patience > 0.70) adj = "Serene";
    else if (b > 0.74 && traits.sociability > 0.64) adj = "Devoted";
    else if (traits.curiosity > 0.76 && traits.boldness > 0.60) adj = "Intrepid";
    else if (traits.curiosity > 0.72) adj = "Inquisitive";
    else if (traits.sociability > 0.70) adj = "Affectionate";
    else if (traits.energy > 0.70) adj = "Lively";
    else if (traits.patience > 0.72) adj = "Unhurried";

    if (quirks && quirks.length > 0) {
        var bestQ = "";
        var bestFit = -1;
        for (var i = 0; i < quirks.length; i++) {
            var qid = quirks[i];
            if (!QUIRK_DEFS[qid]) continue;
            var fit = quirkAffinity(traits, qid) + (i === 0 ? 0.10 : 0);
            if (fit > bestFit) {
                bestFit = fit;
                bestQ = qid;
            }
        }
        if (bestQ) return adj + " " + QUIRK_DEFS[bestQ].label;
    }

    var noun = "Companion";
    if (traits.sleepiness > 0.66) noun = "Loafer";
    else if (traits.boldness < 0.30) noun = "Wallflower";
    else if (traits.sociability < 0.30) noun = "Loner";
    else if (traits.playfulness > 0.66) noun = "Trickster";
    else if (traits.curiosity >= traits.playfulness && traits.curiosity > 0.62) noun = "Scout";
    else if (traits.patience > 0.70) noun = "Observer";
    else if (traits.boldness > 0.70) noun = "Vanguard";
    return adj + " " + noun;
}

function socialChemistry(me, other, myStyle, otherStyle, myName, otherName) {
    if (!me || !other) return { affinity: 0.48, respect: 0.50 };
    var ms = myStyle || "parallel";
    var os = otherStyle || "parallel";
    var rowdyOther = (os === "brawler" || os === "sprinter" || os === "trickster")
                  || other.energy > 0.68 || other.playfulness > 0.68;
    var calmMe = ms === "parallel" || me.sleepiness > 0.60 || me.sociability < 0.34;

    var playFit = 1 - Math.abs(me.playfulness - other.playfulness);
    var energyFit = 1 - Math.abs(me.energy - other.energy);
    var aff = 0.34
            + me.sociability * 0.24
            + playFit * 0.14
            + energyFit * 0.08
            + (other.composure - 0.5) * 0.08;

    if (calmMe && rowdyOther) {
        aff -= (1 - me.patience) * 0.22 + (1 - me.sociability) * 0.14;
    }
    if (me.playfulness > 0.56 && me.sociability > 0.50 && (os === "guardian" || other.boldness > 0.62 || other.composure > 0.68)) {
        aff += 0.11;
    }
    if (ms === os && (ms === "sprinter" || ms === "trickster" || ms === "parallel")) {
        aff += 0.06;
    }
    if (ms === "brawler" && os === "brawler") {
        aff += (me.patience - 0.42) * 0.14;
    }
    if (me.boldness < 0.30 && other.boldness > 0.72 && os === "brawler") {
        aff -= 0.10;
    }
    if (myName || otherName) {
        var pairJitter = (_seeded01(_hash((myName || "a") + "->" + (otherName || "b"))) - 0.5) * 0.15;
        aff += pairJitter;
    }

    var respect = 0.34
                + other.boldness * 0.22
                + other.composure * 0.22
                + (os === "guardian" ? 0.12 : os === "brawler" ? 0.08 : 0)
                - Math.max(0, 0.42 - other.patience) * 0.10;

    return {
        affinity: clamp(aff, 0.20, 0.70),
        respect: clamp(respect, 0.25, 0.80)
    };
}

function compatibility(a, b, myStyle, otherStyle) {
    var chem = socialChemistry(a, b, myStyle, otherStyle, "", "");
    return clamp((chem.affinity - 0.48) * 3.2, -1, 1);
}

function relationshipTag(rel) {
    if (!rel || rel.familiarity < 0.06) return "Strangers";
    if (rel.affinity > 0.78 && rel.familiarity > 0.45) return "Soulmates";
    if ((rel.sparCount || 0) >= 3 && (rel.respect || 0.5) >= 0.52 && rel.affinity >= 0.40 && rel.affinity <= 0.78) {
        return "Sparring Rivals";
    }
    if ((rel.unrequitedCount || 0) >= 2 && rel.affinity >= 0.44) return "Eager Admirer";
    if (rel.affinity > 0.65 && (rel.playCount || 0) > 4) return "Play Partners";
    if (rel.affinity > 0.62 && (rel.napCount || 0) > 2) return "Nap Buddies";
    if (rel.affinity < 0.24 && (rel.friction || 0) >= 3) return "Feuding";
    if (rel.affinity < 0.34 && rel.familiarity > 0.35 && (rel.napCount || 0) > 0) return "Grumpy Allies";
    if (rel.affinity < 0.34) return "Dislikes";
    if (rel.affinity < 0.42 && (rel.friction || 0) >= 1) return "Wary";
    if (rel.affinity > 0.56) return "Friends";
    return "Acquaintances";
}
