.pragma library

.import "../SpeciesProfile.js" as SpeciesProfile
.import "Personality.js" as Personality
.import "Topology.js" as Topology
.import "Util.js" as Util

var VISITED_CELL_SIZE = 200;
var PLACE_CELL_SIZE = 380;
var MAX_SPATIAL_CELLS = 256;
var MAX_CELL_VISITS = 20;
var THOUGHTS_LIMIT = 80;
var EPISODES_LIMIT = 140;
var JOURNAL_LIMIT = 24;
var FAVORITE_AFFECT_MIN = 0.18;
var FAVORITE_VISITS_MIN = 2;
var AVOID_AFFECT_MAX = -0.28;
var RHYTHM_ALPHA = 0.005;

function _cellKey(x, y, size) {
    return Math.floor(x / size) + "," + Math.floor(y / size);
}

var _now = Util.now;

function thinkAloud(pet, kind, text, opts) {
    if (!pet.thoughts) pet.thoughts = [];
    var now = _now(pet);
    var minGap = (opts && opts.minGapMs !== undefined) ? opts.minGapMs : 12000;
    for (var i = pet.thoughts.length - 1; i >= Math.max(0, pet.thoughts.length - 6); i--) {
        var prev = pet.thoughts[i];
        if (prev.kind === kind && now - prev.time < minGap) return null;
    }
    var entry = {
        kind: kind,
        text: text,
        time: now,
        mood: Math.round(pet.mood * 100) / 100,
        state: pet.state_ || "idle",
        plan: pet.activePlan ? pet.activePlan.name : (pet.intention ? pet.intention.name : "")
    };
    pet.thoughts.push(entry);
    if (pet.thoughts.length > THOUGHTS_LIMIT) pet.thoughts.shift();
    pet.lastThoughtText = text;
    pet.lastThoughtTime = now;
    Util.bumpMemoryRev(pet);
    return entry;
}

function recordEpisode(pet, type, opts) {
    if (!pet.episodes) pet.episodes = [];
    var o = opts || {};
    var now = _now(pet);
    var valence = o.valence !== undefined ? o.valence : 0;
    var salience = o.salience !== undefined
        ? o.salience
        : Math.min(1, 0.25 + Math.abs(valence) * 0.75 + (o.novelty || 0) * 0.3);

    var ep = {
        type: type,
        time: now,
        hour: pet._hour !== undefined ? pet._hour : new Date(now).getHours(),
        gx: Math.round(Util.petGX(pet)),
        gy: Math.round(Util.petGY(pet)),
        valence: Math.round(valence * 100) / 100,
        salience: Math.round(salience * 100) / 100,
        consolidated: false,
        windowClass: o.windowClass || "",
        withPet: o.withPet || "",
        otherScreen: !!o.otherScreen,
        music: !!o.music,
        note: o.note || ""
    };
    pet.episodes.push(ep);
    if (!pet.lifetimeCounts && ("lifetimeCounts" in pet || !pet.petWindow)) {
        pet.lifetimeCounts = ({});
    }
    if (pet.lifetimeCounts) {
        pet.lifetimeCounts[type] = (pet.lifetimeCounts[type] || 0) + 1;
    }
    if (pet.episodes.length > EPISODES_LIMIT) {
        var dropIdx = 0;
        for (var i = 0; i < pet.episodes.length - 1; i++) {
            if (pet.episodes[i].consolidated && pet.episodes[i].salience < 0.6) {
                dropIdx = i;
                break;
            }
        }
        pet.episodes.splice(dropIdx, 1);
    }
    Util.bumpMemoryRev(pet);
    return ep;
}

function recent(pet, type, withinMs) {
    if (!pet.episodes) return null;
    var cutoff = _now(pet) - (withinMs || 30000);
    for (var i = pet.episodes.length - 1; i >= 0; i--) {
        var ep = pet.episodes[i];
        if (ep.time <= cutoff) return null;
        if (ep.type === type) return ep;
    }
    return null;
}

function justWokeUp(pet) { return !!recent(pet, "well_rested", 22000); }

function unconsolidatedCount(pet) {
    if (!pet.episodes) return 0;
    var n = 0;
    for (var i = 0; i < pet.episodes.length; i++) {
        if (!pet.episodes[i].consolidated) n++;
    }
    return n;
}

function addJournalEntry(pet, text, kind) {
    if (!pet.journal) pet.journal = [];
    for (var i = 0; i < pet.journal.length; i++) {
        if (pet.journal[i].text === text) return;
    }
    var now = _now(pet);
    pet.journal.push({ time: now, kind: kind || "milestone", text: text });
    if (pet.journal.length > JOURNAL_LIMIT) pet.journal.shift();
    Util.bumpMemoryRev(pet);
}

function consolidateSleep(pet) {
    if (!pet.episodes || pet.episodes.length === 0) return null;

    var unconsolidated = [];
    for (var i = 0; i < pet.episodes.length; i++) {
        if (!pet.episodes[i].consolidated) unconsolidated.push(pet.episodes[i]);
    }
    if (unconsolidated.length === 0) return null;

    // Consolidate up to 18 episodes per dream cycle so long naps process rich days gradually.
    unconsolidated.sort(function(a, b) { return b.salience - a.salience; });
    var batch = unconsolidated.slice(0, 18);

    var signals = {
        energy: 0, curiosity: 0, playfulness: 0, sleepiness: 0,
        boldness: 0, sociability: 0, patience: 0, composure: 0
    };
    var quirkInc = {};
    function bumpQuirk(k, v) {
        quirkInc[k] = (quirkInc[k] || 0) + v * Personality.quirkAffinity(pet.basePersonality, k);
    }

    var now = _now(pet);
    var dreamCandidate = batch[0];
    var totalDreamW = 0;
    var dreamWeights = [];
    var dreamPoolLen = Math.min(6, batch.length);
    for (var dw = 0; dw < dreamPoolLen; dw++) {
        var dep = batch[dw];
        var recBoost = (now - (dep.time || 0)) < 3600000 ? 0.25 : 0;
        var w = 0.25 + (dep.salience || 0.3) * 0.75 + recBoost;
        dreamWeights.push(w);
        totalDreamW += w;
    }
    if (totalDreamW > 0) {
        var pickR = Math.random() * totalDreamW;
        for (var dp = 0; dp < dreamPoolLen; dp++) {
            pickR -= dreamWeights[dp];
            if (pickR <= 0) { dreamCandidate = batch[dp]; break; }
        }
    }
    var positiveCount = 0;
    var negativeCount = 0;

    for (var j = 0; j < batch.length; j++) {
        var ep = batch[j];
        ep.consolidated = true;
        if (ep.valence > 0.1) positiveCount++;
        if (ep.valence < -0.1) negativeCount++;

        switch (ep.type) {
        case "petted":
        case "stroked":
            signals.sociability += 0.009;
            signals.boldness += 0.004;
            signals.composure += 0.005;
            bumpQuirk("velcro_companion", 0.055);
            break;
        case "fed_snack":
            signals.sociability += 0.008;
            signals.patience += 0.004;
            bumpQuirk("velcro_companion", 0.04);
            break;
        case "bid_answered":
            signals.sociability += 0.012;
            signals.boldness += 0.008;
            signals.playfulness += 0.006;
            bumpQuirk("velcro_companion", 0.07);
            break;
        case "bid_ignored":
            signals.patience += 0.006;
            signals.sociability -= 0.004;
            bumpQuirk("cozy_hermit", 0.03);
            break;
        case "adventure":
        case "scout_complete":
            signals.curiosity += 0.004;
            signals.boldness += 0.003;
            signals.energy += 0.002;
            signals.sleepiness -= 0.002;
            if (ep.otherScreen) bumpQuirk("screen_hopper", 0.048);
            break;
        case "supervised_code":
            signals.patience += 0.005;
            signals.composure += 0.005;
            signals.playfulness -= 0.002;
            bumpQuirk("terminal_supervisor", 0.048);
            break;
        case "perched_window":
            signals.boldness += 0.005;
            signals.curiosity += 0.005;
            signals.sleepiness -= 0.002;
            bumpQuirk("window_percher", 0.085);
            break;
        case "music_groove":
            signals.playfulness += 0.009;
            signals.energy += 0.005;
            bumpQuirk("melomaniac", 0.082);
            break;
        case "night_vigil":
            signals.composure += 0.006;
            signals.sleepiness -= 0.007;
            bumpQuirk("night_watch", 0.11);
            break;
        case "tossed_fun":
            signals.boldness += 0.011;
            signals.playfulness += 0.009;
            signals.composure += 0.006;
            bumpQuirk("sky_acrobat", 0.12);
            break;
        case "tossed_rough":
        case "startled":
            signals.boldness -= 0.010;
            signals.composure -= 0.008;
            signals.sociability -= 0.004;
            bumpQuirk("cozy_hermit", 0.045);
            break;
        case "played_with":
        case "chase_bout":
        case "sync_danced":
        case "sneak_boop":
            signals.playfulness += 0.005;
            signals.sociability += 0.007;
            signals.energy += 0.003;
            bumpQuirk("pack_spark", 0.030 + pet.personality.playfulness * 0.050);
            break;
        case "hearth_bask":
            signals.composure += 0.006;
            signals.patience += 0.005;
            bumpQuirk("cozy_hermit", 0.045);
            break;
        case "lunar_vigil":
            signals.composure += 0.006;
            signals.sleepiness -= 0.006;
            bumpQuirk("night_watch", 0.095);
            break;
        case "sunlit_bask":
            signals.patience += 0.006;
            signals.composure += 0.005;
            bumpQuirk("daydreamer", 0.045);
            break;
        case "aura_kata":
            signals.boldness += 0.006;
            signals.composure += 0.006;
            bumpQuirk("terminal_supervisor", 0.05);
            break;
        case "sparred":
            signals.boldness += 0.007;
            signals.playfulness += 0.005;
            signals.composure += 0.004;
            bumpQuirk("pack_spark", 0.035);
            break;
        case "unrequited_play":
            signals.patience += 0.004;
            signals.sociability -= 0.003;
            break;
        case "squabbled":
            signals.boldness += 0.005;
            signals.patience -= 0.006;
            signals.sociability -= 0.004;
            break;
        case "mediated":
            signals.composure += 0.008;
            signals.patience += 0.007;
            signals.boldness += 0.004;
            break;
        case "rested_with":
            signals.sociability += 0.007;
            signals.patience += 0.006;
            bumpQuirk("pack_spark", 0.035);
            break;
        case "sanctuary_nap":
            signals.patience += 0.007;
            signals.sleepiness += 0.005;
            signals.composure += 0.006;
            bumpQuirk("cozy_hermit", 0.075);
            if (pet.personality.sleepiness > 0.58) bumpQuirk("daydreamer", 0.038);
            break;
        case "resting":
            signals.sleepiness += 0.003;
            signals.energy -= 0.002;
            if (pet.personality.sleepiness > 0.60) bumpQuirk("daydreamer", 0.032);
            if (pet.personality.patience > 0.62 && pet.personality.energy < 0.44) bumpQuirk("cozy_hermit", 0.04);
            break;
        case "well_rested":
            signals.composure += 0.004;
            signals.patience += 0.003;
            signals.sleepiness += 0.003;
            signals.energy -= 0.002;
            if (pet.personality.sleepiness > 0.58) bumpQuirk("daydreamer", 0.048);
            break;
        case "zoomies":
        case "played_solo":
            signals.playfulness += 0.006;
            signals.energy += 0.005;
            signals.sleepiness -= 0.003;
            break;
        case "foraged":
            signals.composure += 0.003;
            signals.curiosity += 0.003;
            break;
        case "social_referenced":
            signals.boldness += 0.008;
            signals.composure += 0.006;
            break;
        case "calm_company":
            signals.composure += 0.007;
            signals.patience += 0.006;
            bumpQuirk("velcro_companion", 0.05);
            break;
        case "distracted":
            signals.curiosity += 0.005;
            signals.patience -= 0.003;
            break;
        case "warm_spot":
            signals.sleepiness += 0.004;
            bumpQuirk("cozy_hermit", 0.04);
            break;
        case "annoyed":
        case "annoyed_by":
        case "rebuffed":
            signals.patience -= 0.006;
            signals.sociability -= 0.005;
            break;
        }
    }

    var batchScale = 1 / Math.max(1, Math.sqrt(batch.length / 4));
    var sKeys = Object.keys(signals);
    for (var si = 0; si < sKeys.length; si++) {
        signals[sKeys[si]] *= batchScale;
    }
    var quirkScale = 1 / Math.max(1, Math.sqrt(batch.length / 6));
    var qIncKeys = Object.keys(quirkInc);
    for (var qi = 0; qi < qIncKeys.length; qi++) {
        quirkInc[qIncKeys[qi]] *= quirkScale;
    }

    var prevQuirks = (pet.quirks || []).slice();
    var batchWeight = Math.min(1, batch.length / 8);
    var consolidated = Personality.consolidateCore(
        pet.coreDrift, pet.recentDrift, signals, pet.maturity, batchWeight
    );
    pet.coreDrift = consolidated.core;
    pet.recentDrift = consolidated.recent;

    var qRes = Personality.updateQuirks(pet.quirkProgress, prevQuirks, quirkInc);
    pet.quirkProgress = qRes.progress;
    pet.quirks = qRes.active;

    for (var nq = 0; nq < pet.quirks.length; nq++) {
        var qid = pet.quirks[nq];
        if (prevQuirks.indexOf(qid) === -1 && Personality.QUIRK_DEFS[qid]) {
            addJournalEntry(
                pet,
                "Developed habit: " + Personality.QUIRK_DEFS[qid].label,
                "quirk"
            );
        }
    }

    var dreamEmote = "dream";
    var dreamLine = "Dreaming quietly";
    if (dreamCandidate) {
        switch (dreamCandidate.type) {
        case "petted":
        case "stroked":
        case "bid_answered":
            dreamEmote = "heart";
            dreamLine = "Dreaming of warm headpats";
            break;
        case "fed_snack":
        case "foraged":
            dreamEmote = "berry";
            dreamLine = "Dreaming about sweet berries";
            break;
        case "music_groove":
            dreamEmote = "note";
            dreamLine = "Ear twitching to a remembered melody";
            break;
        case "adventure":
        case "scout_complete":
            dreamLine = "Dreaming of wide horizons";
            break;
        case "tossed_fun":
            dreamLine = "Dreaming of soaring across the screen";
            break;
        case "played_with":
        case "chase_bout":
        case "sync_danced":
            dreamLine = "Paws twitching in sleep";
            break;
        case "sparred":
            dreamLine = "Practicing sparring footwork in sleep";
            break;
        case "mediated":
            dreamLine = "Sleeping calmly on guard";
            break;
        case "startled":
        case "tossed_rough":
            dreamEmote = "ellipses";
            dreamLine = "Shivered briefly in sleep, then settled";
            break;
        }
    }

    thinkAloud(pet, "dream", dreamLine, { minGapMs: 90000 });
    Util.bumpMemoryRev(pet);
    return {
        emote: dreamEmote,
        line: dreamLine,
        count: batch.length,
        netValence: positiveCount - negativeCount
    };
}

var CODE_CLASSES = [
    "kitty", "alacritty", "foot", "wezterm", "ghostty", "neovide",
    "code", "codium", "zed", "emacs", "jetbrains", "helix", "sublime"
];

function isCodeWindow(cls) {
    if (!cls) return false;
    var low = cls.toLowerCase();
    for (var i = 0; i < CODE_CLASSES.length; i++) {
        if (low.indexOf(CODE_CLASSES[i]) !== -1) return true;
    }
    return false;
}

function windowFamiliarity(pet, cls) {
    if (!cls || !pet.episodes) return 0;
    var n = 0;
    for (var i = 0; i < pet.episodes.length; i++) {
        if (pet.episodes[i].windowClass === cls) n++;
    }
    return n;
}

function recordWindowPref(pet, cls, delta) {
    if (!cls) return;
    if (!pet.windowPrefs) pet.windowPrefs = ({});
    var cur = pet.windowPrefs[cls] !== undefined ? pet.windowPrefs[cls] : 0.5;
    pet.windowPrefs[cls] = Personality.clamp01(cur + delta);
}

function getWindowPref(pet, cls) {
    if (!cls || !pet.windowPrefs) return 0.5;
    return pet.windowPrefs[cls] !== undefined ? pet.windowPrefs[cls] : 0.5;
}

function trackPosition(pet) {
    if (pet.state_ !== "walk" && pet.state_ !== "wander" && pet.state_ !== "zoomies") return;
    var now = _now(pet);
    if (now - (pet._lastTrackTime || 0) < 4500) return;
    pet._lastTrackTime = now;
    if (!pet.visitedCells) pet.visitedCells = ({});
    var key = _cellKey(Util.petGX(pet), Util.petGY(pet), VISITED_CELL_SIZE);
    pet.visitedCells[key] = Math.min(MAX_CELL_VISITS, (pet.visitedCells[key] || 0) + 1);
    var keys = Object.keys(pet.visitedCells);
    if (keys.length > MAX_SPATIAL_CELLS) {
        delete pet.visitedCells[keys[0]];
    }
}

function visitsAt(pet, gx, gy) {
    if (!pet.visitedCells) return 0;
    return pet.visitedCells[_cellKey(gx, gy, VISITED_CELL_SIZE)] || 0;
}

function explorationTarget(pet) {
    var screens = Topology.reachableScreens(pet);
    if (!screens || screens.length === 0) return null;
    var gx = pet.screenX() + pet.worldX, gy = pet.screenY() + pet.worldY;
    var pw = pet.width || 64, ph = pet.height || 64;
    var best = null, bestScore = -Infinity;
    var hopper = Personality.hasQuirk(pet, "screen_hopper");

    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var si = 0; si < screens.length; si++) {
        minX = Math.min(minX, screens[si].x);
        maxX = Math.max(maxX, screens[si].x + screens[si].width);
        minY = Math.min(minY, screens[si].y);
        maxY = Math.max(maxY, screens[si].y + screens[si].height);
    }
    var worldSpan = Math.max(1600, Math.hypot(maxX - minX, maxY - minY));
    var minExploreDist = Math.min(160, Math.max(64, Math.min(pet.screenW(), pet.screenH()) * 0.2));

    for (var i = 0; i < 10; i++) {
        var s = screens[Math.floor(Math.random() * screens.length)];
        var padX = Math.min(64, Math.max(12, s.width * 0.06));
        var topPad = Math.max(s.topInset || 0, 16) + 8;
        var botPad = Math.max(s.bottomInset || 0, 12) + ph + 8;
        var tx = Topology.clamp(
            s.x + padX + Math.random() * Math.max(1, s.width - pw - padX * 2),
            s.x,
            s.x + s.width - pw
        );
        var ty = Topology.clamp(
            s.y + topPad + Math.random() * Math.max(1, s.height - topPad - botPad),
            s.y,
            s.y + s.height - ph
        );
        var visits = visitsAt(pet, tx, ty);
        var dist = Math.hypot(tx - gx, ty - gy);
        if (dist < minExploreDist) continue;
        var affect = placeAffectAt(pet, tx, ty);
        if (affect < AVOID_AFFECT_MAX && Math.random() < 0.85) continue;
        var otherScreen = s.x !== pet.screenX() || s.y !== pet.screenY();
        var distPenalty = dist / Math.max(2200, worldSpan * (hopper ? 1.15 : 0.72));
        var score = -visits * 1.1 - distPenalty + affect * 2.2
                  + (otherScreen && hopper ? 0.8 : 0) + Math.random() * 1.3;
        if (score > bestScore) {
            bestScore = score;
            best = { gx: tx, gy: ty, visits: visits, otherScreen: otherScreen, screenName: s.name || "" };
        }
    }
    return best;
}

function recordPlaceAffect(pet, valence) {
    if (!pet.placeMemory) pet.placeMemory = ({});
    var gx = Util.petGX(pet), gy = Util.petGY(pet);
    var key = _cellKey(gx, gy, PLACE_CELL_SIZE);
    var e = pet.placeMemory[key] || { affect: 0, visits: 0, lastVisit: 0, gx: Math.round(gx), gy: Math.round(gy) };
    var baseWeight = Math.min(0.32, 1.0 / (e.visits + 2));
    var weight = valence < -0.15 ? Math.min(0.46, baseWeight * 1.45) : baseWeight;
    e.affect = Math.max(-1, Math.min(1, e.affect * (1 - weight) + valence * weight));
    e.gx = Math.round((e.gx !== undefined ? e.gx : gx) * (1 - weight) + gx * weight);
    e.gy = Math.round((e.gy !== undefined ? e.gy : gy) * (1 - weight) + gy * weight);
    e.visits++;
    e.lastVisit = _now(pet);
    pet.placeMemory[key] = e;

    var keys = Object.keys(pet.placeMemory);
    if (keys.length > MAX_SPATIAL_CELLS) {
        var evictKey = keys[0], evictScore = Infinity;
        for (var i = 0; i < keys.length; i++) {
            var pm = pet.placeMemory[keys[i]];
            var sc = (pm.visits || 0) * 1e13 + (pm.lastVisit || 0);
            if (sc < evictScore) { evictScore = sc; evictKey = keys[i]; }
        }
        delete pet.placeMemory[evictKey];
    }
}

function placeAffectAt(pet, gx, gy) {
    if (!pet.placeMemory) return 0;
    var e = pet.placeMemory[_cellKey(gx, gy, PLACE_CELL_SIZE)];
    return e ? e.affect : 0;
}

function favoriteSpot(pet) {
    if (!pet.placeMemory) return null;
    var reachable = Topology.reachableScreens(pet);
    var pw = pet.width || 64, ph = pet.height || 64;
    var best = null, bestScore = FAVORITE_AFFECT_MIN;
    var keys = Object.keys(pet.placeMemory);
    for (var i = 0; i < keys.length; i++) {
        var e = pet.placeMemory[keys[i]];
        if (e.affect > bestScore && e.visits >= FAVORITE_VISITS_MIN) {
            var parts = keys[i].split(",");
            var half = PLACE_CELL_SIZE / 2;
            var candGX = e.gx !== undefined ? e.gx : (parseInt(parts[0], 10) * PLACE_CELL_SIZE + half);
            var candGY = e.gy !== undefined ? e.gy : (parseInt(parts[1], 10) * PLACE_CELL_SIZE + half);
            var scr = Topology.screenAt(reachable, candGX + pw * 0.5, candGY + ph * 0.5)
                   || Topology.screenAt(reachable, candGX, candGY);
            if (!scr) continue;
            bestScore = e.affect;
            best = {
                gx: Topology.clamp(candGX, scr.x, scr.x + scr.width - pw),
                gy: Topology.clamp(candGY, scr.y, scr.y + scr.height - ph),
                affect: e.affect
            };
        }
    }
    return best;
}

function decayMemories(pet) {
    if (pet.windowPrefs) {
        var pKeys = Object.keys(pet.windowPrefs);
        for (var i = 0; i < pKeys.length; i++) {
            var v = pet.windowPrefs[pKeys[i]];
            var nextPref = v + (0.5 - v) * 0.00015;
            if (Math.abs(nextPref - 0.5) < 0.005) delete pet.windowPrefs[pKeys[i]];
            else pet.windowPrefs[pKeys[i]] = nextPref;
        }
    }
    if (pet.visitedCells) {
        var cKeys = Object.keys(pet.visitedCells);
        for (var j = 0; j < cKeys.length; j++) {
            if (Math.random() < 0.015 && --pet.visitedCells[cKeys[j]] <= 0) {
                delete pet.visitedCells[cKeys[j]];
            }
        }
    }
    if (pet.placeMemory) {
        var mKeys = Object.keys(pet.placeMemory);
        for (var k = 0; k < mKeys.length; k++) {
            var e = pet.placeMemory[mKeys[k]];
            e.affect *= e.visits >= 4 ? 0.99996 : 0.99992;
            if (Math.abs(e.affect) < 0.02 && Math.random() < 0.02) delete pet.placeMemory[mKeys[k]];
        }
    }
    if (pet.relationships) {
        var rKeys = Object.keys(pet.relationships);
        for (var r = 0; r < rKeys.length; r++) {
            var rel = pet.relationships[rKeys[r]];
            var baseline = rel.initialAffinity !== undefined ? rel.initialAffinity : 0.48;
            var anchor = rel.familiarity > 0.5 ? 0.99998 : 0.99992;
            rel.affinity = baseline + (rel.affinity - baseline) * anchor;
            rel.familiarity *= 0.99996;
        }
    }
}

function observeUser(pet, perc) {
    if (!pet.userRhythm) pet.userRhythm = ({});
    var cur = pet.userRhythm[perc.hour] !== undefined ? pet.userRhythm[perc.hour] : 0.5;
    pet.userRhythm[perc.hour] = cur + ((perc.userIdle ? 0 : 1) - cur) * RHYTHM_ALPHA;
}

function usualUserActivity(pet, hour) {
    if (!pet.userRhythm) return 0.5;
    var v = pet.userRhythm[hour];
    return v !== undefined ? v : 0.5;
}

function relationWith(pet, name, otherPersonality, otherSpecies) {
    if (!pet.relationships) pet.relationships = ({});
    var r = pet.relationships[name];
    if (!r) {
        var myName = (pet && pet.petData && pet.petData.name) || (pet && pet.name) || "pet";
        var mySp = SpeciesProfile.trueSpeciesOf(pet);
        var myStyle = SpeciesProfile.socialStyleOf(pet);
        var otherStyle = otherSpecies ? SpeciesProfile.socialStyleOf(otherSpecies) : "parallel";
        var chem = otherPersonality
            ? Personality.socialChemistry(pet.personality, otherPersonality, myStyle, otherStyle, myName, name)
            : { affinity: 0.48, respect: 0.50 };
        var kin = SpeciesProfile.kinChemistry(mySp, otherSpecies || "");
        var initAff = Personality.clamp(chem.affinity + kin.affinityDelta, 0.20, 0.78);
        var initResp = Personality.clamp(chem.respect + kin.respectDelta, 0.25, 0.85);
        r = {
            affinity: initAff,
            initialAffinity: initAff,
            respect: initResp,
            species: otherSpecies || "",
            familiarity: 0,
            playCount: 0,
            sparCount: 0,
            napCount: 0,
            unrequitedCount: 0,
            friction: 0,
            lastOutcome: "",
            lastInteract: 0
        };
        pet.relationships[name] = r;
        Util.bumpMemoryRev(pet);
    } else {
        if (otherSpecies && r.species !== otherSpecies) {
            r.species = otherSpecies;
            Util.bumpMemoryRev(pet);
        }
        if (r.respect === undefined) r.respect = 0.50;
        if (r.sparCount === undefined) r.sparCount = 0;
        if (r.unrequitedCount === undefined) r.unrequitedCount = 0;
        if (r.initialAffinity === undefined) r.initialAffinity = r.affinity;
    }
    return r;
}

function adjustRelation(pet, name, affinityDelta, familiarityDelta, kind, extra) {
    var r = relationWith(pet, name);
    var prevTag = Personality.relationshipTag(r);
    r.affinity = Personality.clamp01(r.affinity + affinityDelta);
    r.familiarity = Personality.clamp01(r.familiarity + (familiarityDelta || 0));
    if (extra && extra.respectDelta !== undefined) {
        r.respect = Personality.clamp01((r.respect || 0.5) + extra.respectDelta);
    }
    if (extra && extra.outcome) {
        r.lastOutcome = extra.outcome;
    }
    if (kind === "play") {
        r.playCount = (r.playCount || 0) + 1;
        if ((r.unrequitedCount || 0) > 0) r.unrequitedCount--;
    } else if (kind === "spar") {
        r.sparCount = (r.sparCount || 0) + 1;
        r.playCount = (r.playCount || 0) + 1;
        r.respect = Personality.clamp01((r.respect || 0.5) + 0.035);
        if ((r.unrequitedCount || 0) > 0) r.unrequitedCount--;
    } else if (kind === "nap") {
        r.napCount = (r.napCount || 0) + 1;
    } else if (kind === "friction") {
        r.friction = (r.friction || 0) + 1;
    } else if (kind === "unrequited") {
        r.unrequitedCount = (r.unrequitedCount || 0) + 1;
    } else if (kind === "won_over") {
        var wasUnreq = r.unrequitedCount || 0;
        r.playCount = (r.playCount || 0) + 1;
        r.unrequitedCount = 0;
        if (wasUnreq >= 2) {
            addJournalEntry(pet, "Finally won over " + name + " for a game.", "social");
        }
    }
    r.lastInteract = _now(pet);
    var nextTag = Personality.relationshipTag(r);
    if (nextTag !== prevTag) {
        if (nextTag === "Friends" || nextTag === "Play Partners" || nextTag === "Sparring Rivals"
                || nextTag === "Nap Buddies" || nextTag === "Soulmates" || nextTag === "Grumpy Allies") {
            addJournalEntry(pet, "Became " + nextTag + " with " + name + ".", "social");
        } else if (nextTag === "Feuding") {
            addJournalEntry(pet, "Started a prickly rivalry with " + name + ".", "social");
        }
    }
    Util.bumpMemoryRev(pet);
    return r;
}

function rekeyPeer(target, oldName, newName) {
    if (!target || !oldName || !newName || oldName === newName) return false;
    var changed = false;
    if (target.relationships && target.relationships[oldName]) {
        var nextRels = Object.assign({}, target.relationships);
        nextRels[newName] = nextRels[oldName];
        delete nextRels[oldName];
        target.relationships = nextRels;
        changed = true;
    }
    if (Array.isArray(target.episodes)) {
        for (var i = 0; i < target.episodes.length; i++) {
            if (target.episodes[i] && target.episodes[i].withPet === oldName) {
                target.episodes[i].withPet = newName;
                changed = true;
            }
        }
    }
    if (changed) Util.bumpMemoryRev(target);
    return changed;
}

function removePeer(target, removedName) {
    if (!target || !removedName) return false;
    var changed = false;
    if (target.relationships && target.relationships[removedName]) {
        var nextRels = Object.assign({}, target.relationships);
        delete nextRels[removedName];
        target.relationships = nextRels;
        changed = true;
    }
    if (Array.isArray(target.episodes)) {
        for (var i = 0; i < target.episodes.length; i++) {
            if (target.episodes[i] && target.episodes[i].withPet === removedName) {
                target.episodes[i].withPet = "";
                changed = true;
            }
        }
    }
    if (changed) Util.bumpMemoryRev(target);
    return changed;
}

function updatePeerSpecies(target, peerName, species) {
    if (!target || !peerName || !species || !target.relationships || !target.relationships[peerName]) return false;
    if (target.relationships[peerName].species === species) return false;
    var nextRels = Object.assign({}, target.relationships);
    nextRels[peerName] = Object.assign({}, nextRels[peerName], { species: species });
    target.relationships = nextRels;
    Util.bumpMemoryRev(target);
    return true;
}
