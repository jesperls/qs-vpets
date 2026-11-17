.pragma library

.import "../SpeciesProfile.js" as SpeciesProfile
.import "Personality.js" as Personality
.import "Memory.js" as Memory

function _countEpisodes(target, types) {
    var eps = (target && target.episodes) ? target.episodes : [];
    var set = Array.isArray(types) ? types : [types];
    var count = 0;
    for (var i = 0; i < eps.length; i++) {
        if (eps[i] && set.indexOf(eps[i].type) !== -1) count++;
    }
    return count;
}

function _traitsOf(target) {
    if (!target) return Personality.PRESETS.emergent;
    if (target.personality && target.personality.energy !== undefined) return target.personality;
    return Personality.compose(target.basePersonality, target.coreDrift, target.recentDrift);
}

function _hasCloseFriend(target, minAff) {
    var rels = (target && target.relationships) ? target.relationships : {};
    var ks = Object.keys(rels);
    for (var i = 0; i < ks.length; i++) {
        if (rels[ks[i]] && (rels[ks[i]].affinity || 0) >= minAff) return true;
    }
    return false;
}

function _totalSparCount(target) {
    var rels = (target && target.relationships) ? target.relationships : {};
    var ks = Object.keys(rels);
    var total = 0;
    for (var i = 0; i < ks.length; i++) {
        if (rels[ks[i]]) total += (rels[ks[i]].sparCount || 0);
    }
    return total;
}

function _scoreBranch(branch, target, p) {
    if (typeof branch.scoreFn === "function") {
        return branch.scoreFn(target, p);
    }
    var epCount = branch.episodes ? _countEpisodes(target, branch.episodes) : 0;
    if (branch.includeSpars) epCount += _totalSparCount(target);
    var epWeight = branch.episodeWeight !== undefined ? branch.episodeWeight : 0.16;

    var hasMatchedQuirk = false;
    if (Array.isArray(branch.quirks)) {
        for (var i = 0; i < branch.quirks.length; i++) {
            if (Personality.hasQuirk(target, branch.quirks[i])) {
                hasMatchedQuirk = true;
                break;
            }
        }
    }
    if (!hasMatchedQuirk && branch.friendMinAffinity && _hasCloseFriend(target, branch.friendMinAffinity)) {
        hasMatchedQuirk = true;
    }

    var traitBonus = 0;
    if (branch.trait && p[branch.trait] >= (branch.traitMin !== undefined ? branch.traitMin : 0.58)) {
        traitBonus = branch.traitBonus !== undefined ? branch.traitBonus : 0.20;
    }

    var fit = epCount * epWeight + (hasMatchedQuirk ? (branch.quirkBonus !== undefined ? branch.quirkBonus : 0.40) : 0) + traitBonus;
    var threshold = branch.minFit !== undefined ? branch.minFit : 0.44;
    if (fit < threshold) return 0;
    var baseScore = branch.baseScore !== undefined ? branch.baseScore : 0.58;
    return baseScore + Math.min(0.38, fit * 0.35);
}

var EVOLUTION_LINES = {
    eevee: [
        {
            species: "umbreon",
            minBond: 0.56,
            minMaturity: 0.28,
            reason: "Deep bond forged through calm late-night vigils",
            hint: "Keep quiet late-night company together",
            episodes: ["night_vigil", "lunar_vigil"],
            episodeWeight: 0.22,
            quirks: ["night_watch"],
            quirkBonus: 0.48,
            trait: "composure",
            traitMin: 0.58,
            traitBonus: 0.18,
            baseScore: 0.60
        },
        {
            species: "leafeon",
            minBond: 0.54,
            minMaturity: 0.28,
            reason: "Peaceful daytime naps, foraging, and unhurried patience",
            hint: "Share peaceful daytime naps and berry breaks",
            episodes: ["sunlit_bask", "foraged", "sanctuary_nap", "well_rested"],
            episodeWeight: 0.16,
            quirks: ["cozy_hermit", "daydreamer"],
            quirkBonus: 0.42,
            trait: "patience",
            traitMin: 0.60,
            traitBonus: 0.20
        },
        {
            species: "flareon",
            minBond: 0.56,
            minMaturity: 0.28,
            reason: "Warm affection, shared naps, and devoted companionship",
            hint: "Build warm affection and cozy shared naps",
            episodes: ["hearth_bask", "rested_with", "petted", "stroked", "bid_answered"],
            episodeWeight: 0.14,
            quirks: ["velcro_companion"],
            friendMinAffinity: 0.68,
            quirkBonus: 0.40,
            trait: "sociability",
            traitMin: 0.60,
            traitBonus: 0.20
        },
        {
            species: "jolteon",
            minBond: 0.54,
            minMaturity: 0.28,
            reason: "Spirited games of tag, lively zoomies, and musical spark",
            hint: "Play lively games of tag and listen to music",
            scoreFn: function(t, p) {
                var livelyEps = _countEpisodes(t, ["zoomies", "chase_bout", "music_groove", "sync_danced"]);
                var sparkQuirk = Personality.hasQuirk(t, "pack_spark") || Personality.hasQuirk(t, "melomaniac");
                var fit = livelyEps * 0.16 + (sparkQuirk ? 0.42 : 0) + ((p.energy + p.playfulness) >= 1.24 ? 0.22 : 0);
                return fit >= 0.44 ? (0.58 + Math.min(0.38, fit * 0.35)) : 0;
            }
        },
        {
            species: "glaceon",
            minBond: 0.54,
            minMaturity: 0.28,
            reason: "Steady calm atop high window perches and focused work",
            hint: "Perch on window ledges and supervise focused work",
            episodes: ["perched_window", "supervised_code", "mediated"],
            episodeWeight: 0.18,
            quirks: ["window_percher", "terminal_supervisor"],
            quirkBonus: 0.42,
            trait: "composure",
            traitMin: 0.62,
            traitBonus: 0.20
        }
    ],
    riolu: [
        {
            species: "lucario",
            minBond: 0.60,
            minMaturity: 0.32,
            reason: "Steady aura focus honed through sparring and code watch",
            hint: "Deepen bond through sparring bouts and focused coding sessions",
            scoreFn: function(t, p) {
                var auraEps = _countEpisodes(t, ["sparred", "aura_kata", "supervised_code", "mediated"]) + _totalSparCount(t);
                var sup = Personality.hasQuirk(t, "terminal_supervisor");
                var fit = auraEps * 0.18 + (sup ? 0.38 : 0) + ((p.boldness + p.composure) >= 1.15 ? 0.20 : 0);
                return fit >= 0.44 ? (0.62 + Math.min(0.35, fit * 0.35)) : 0;
            }
        }
    ],
    vulpix: [
        {
            species: "ninetales",
            minBond: 0.56,
            minMaturity: 0.32,
            reason: "Quiet hearth wisdom and steady late-hour companionship",
            hint: "Grow together through calm hearth naps and quiet evenings",
            episodes: ["hearth_bask", "night_vigil", "rested_with", "mediated"],
            episodeWeight: 0.18,
            quirks: ["night_watch", "cozy_hermit"],
            quirkBonus: 0.38,
            trait: "composure",
            traitMin: 0.55,
            traitBonus: 0.22,
            baseScore: 0.60
        }
    ],
    charmander: [
        {
            species: "charizard",
            minBond: 0.58,
            minMaturity: 0.36,
            reason: "Bold spirit tempered by sparring and wide-ranging expeditions",
            hint: "Gain experience through bold sparring and desktop expeditions",
            episodes: ["sparred", "scout_complete", "tossed_fun", "hearth_bask"],
            includeSpars: true,
            episodeWeight: 0.16,
            quirks: ["screen_hopper", "sky_acrobat"],
            quirkBonus: 0.38,
            trait: "boldness",
            traitMin: 0.56,
            traitBonus: 0.22,
            baseScore: 0.60
        }
    ]
};

function branchesFor(species) {
    if (!species) return [];
    var prof = SpeciesProfile.profileFor(species);
    if (prof.evolutions && prof.evolutions.length > 0) return prof.evolutions;
    return EVOLUTION_LINES[species] || [];
}

function evaluate(target, explicitSpecies) {
    var sp = explicitSpecies || SpeciesProfile.trueSpeciesOf(target);
    var branches = branchesFor(sp);
    if (!branches || branches.length === 0) {
        return { hasLine: false, ready: false, options: [], nextHint: "" };
    }

    var bond = (target && target.bond !== undefined) ? target.bond : 0.30;
    var maturity = (target && target.maturity !== undefined) ? target.maturity : 0;
    var p = _traitsOf(target);
    var readyOptions = [];
    var fallbackHint = branches[0].hint || "";

    for (var i = 0; i < branches.length; i++) {
        var b = branches[i];
        if (bond < b.minBond || maturity < b.minMaturity) continue;
        var sc = _scoreBranch(b, target, p);
        if (sc > 0) {
            var prof = SpeciesProfile.profileFor(b.species);
            readyOptions.push({
                species: b.species,
                displayName: prof.displayName,
                reason: b.reason,
                score: Math.round(sc * 1000) / 1000
            });
        }
    }

    readyOptions.sort(function(a, b) { return b.score - a.score; });
    return {
        hasLine: true,
        ready: readyOptions.length > 0,
        options: readyOptions,
        nextHint: readyOptions.length > 0 ? readyOptions[0].reason : fallbackHint
    };
}

function canEvolveTo(target, toSpecies, explicitSpecies) {
    if (!target || !toSpecies) return false;
    var ev = evaluate(target, explicitSpecies);
    if (!ev.ready) return false;
    for (var i = 0; i < ev.options.length; i++) {
        if (ev.options[i].species === toSpecies) return true;
    }
    return false;
}

function recordEvolutionMilestone(target, fromSpecies, toSpecies) {
    if (!target || !toSpecies) return;
    var fromName = SpeciesProfile.profileFor(fromSpecies).displayName;
    var toName = SpeciesProfile.profileFor(toSpecies).displayName;
    Memory.addJournalEntry(
        target,
        "Evolved from " + fromName + " into " + toName + ".",
        "evolution"
    );
    Memory.thinkAloud(
        target,
        "evolved",
        "Felt a warm surge of strength and evolved into " + toName,
        { minGapMs: 0 }
    );
    var ep = Memory.recordEpisode(target, "evolved", {
        valence: 0.92,
        salience: 1.0,
        note: fromSpecies + "->" + toSpecies
    });
    if (ep) ep.consolidated = true;
}
