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

var EVOLUTION_LINES = {
    eevee: [
        {
            species: "umbreon",
            minBond: 0.56,
            minMaturity: 0.28,
            reason: "Deep bond forged through calm late-night vigils",
            hint: "Keep quiet late-night company together",
            scoreFn: function(t, p) {
                var vigils = _countEpisodes(t, ["night_vigil", "lunar_vigil"]);
                var hasWatch = Personality.hasQuirk(t, "night_watch");
                var fit = vigils * 0.22 + (hasWatch ? 0.48 : 0) + (p.composure >= 0.58 ? 0.18 : 0);
                return fit >= 0.44 ? (0.60 + Math.min(0.38, fit * 0.35)) : 0;
            }
        },
        {
            species: "leafeon",
            minBond: 0.54,
            minMaturity: 0.28,
            reason: "Peaceful daytime naps, foraging, and unhurried patience",
            hint: "Share peaceful daytime naps and berry breaks",
            scoreFn: function(t, p) {
                var calmEps = _countEpisodes(t, ["sunlit_bask", "foraged", "sanctuary_nap", "well_rested"]);
                var calmQuirk = Personality.hasQuirk(t, "cozy_hermit") || Personality.hasQuirk(t, "daydreamer");
                var fit = calmEps * 0.16 + (calmQuirk ? 0.42 : 0) + (p.patience >= 0.60 ? 0.20 : 0);
                return fit >= 0.44 ? (0.58 + Math.min(0.38, fit * 0.35)) : 0;
            }
        },
        {
            species: "flareon",
            minBond: 0.56,
            minMaturity: 0.28,
            reason: "Warm affection, shared naps, and devoted companionship",
            hint: "Build warm affection and cozy tandem naps",
            scoreFn: function(t, p) {
                var warmEps = _countEpisodes(t, ["hearth_bask", "rested_with", "petted", "stroked", "bid_answered"]);
                var devoted = Personality.hasQuirk(t, "velcro_companion") || _hasCloseFriend(t, 0.68);
                var fit = warmEps * 0.14 + (devoted ? 0.40 : 0) + (p.sociability >= 0.60 ? 0.20 : 0);
                return fit >= 0.44 ? (0.58 + Math.min(0.38, fit * 0.35)) : 0;
            }
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
            reason: "Crisp composure atop high window perches and focused work",
            hint: "Perch on window ledges and supervise focused work",
            scoreFn: function(t, p) {
                var poiseEps = _countEpisodes(t, ["perched_window", "supervised_code", "mediated"]);
                var poiseQuirk = Personality.hasQuirk(t, "window_percher") || Personality.hasQuirk(t, "terminal_supervisor");
                var fit = poiseEps * 0.18 + (poiseQuirk ? 0.42 : 0) + (p.composure >= 0.62 ? 0.20 : 0);
                return fit >= 0.44 ? (0.58 + Math.min(0.38, fit * 0.35)) : 0;
            }
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
            reason: "Serene hearth wisdom and composed companionship",
            hint: "Grow together through calm hearth naps and quiet evenings",
            scoreFn: function(t, p) {
                var hearthEps = _countEpisodes(t, ["hearth_bask", "night_vigil", "rested_with", "mediated"]);
                var calmQuirk = Personality.hasQuirk(t, "night_watch") || Personality.hasQuirk(t, "cozy_hermit");
                var fit = hearthEps * 0.18 + (calmQuirk ? 0.38 : 0) + (p.composure >= 0.55 ? 0.22 : 0);
                return fit >= 0.44 ? (0.60 + Math.min(0.35, fit * 0.35)) : 0;
            }
        }
    ],
    charmander: [
        {
            species: "charizard",
            minBond: 0.58,
            minMaturity: 0.36,
            reason: "Bold spirit tempered by sparring and wide-ranging expeditions",
            hint: "Gain experience through bold sparring and desktop expeditions",
            scoreFn: function(t, p) {
                var boldEps = _countEpisodes(t, ["sparred", "scout_complete", "tossed_fun", "hearth_bask"]) + _totalSparCount(t);
                var boldQuirk = Personality.hasQuirk(t, "screen_hopper") || Personality.hasQuirk(t, "sky_acrobat");
                var fit = boldEps * 0.16 + (boldQuirk ? 0.38 : 0) + (p.boldness >= 0.56 ? 0.22 : 0);
                return fit >= 0.44 ? (0.60 + Math.min(0.35, fit * 0.35)) : 0;
            }
        }
    ]
};

function hasEvolutionLine(species) {
    return !!(species && EVOLUTION_LINES[species]);
}

function evaluate(target, explicitSpecies) {
    var sp = explicitSpecies || SpeciesProfile.trueSpeciesOf(target);
    var branches = sp ? EVOLUTION_LINES[sp] : null;
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
        var sc = b.scoreFn(target, p);
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
        "Evolved into " + toName + " while keeping every shared memory",
        { minGapMs: 0 }
    );
    if (target.episodes) {
        target.episodes.push({
            type: "evolved",
            time: Date.now(),
            hour: new Date().getHours(),
            gx: target.gx || 0,
            gy: target.gy || 0,
            valence: 0.92,
            salience: 1.0,
            consolidated: true,
            windowClass: "",
            withPet: "",
            otherScreen: false,
            music: false,
            note: fromSpecies + "->" + toSpecies
        });
    }
}
