.pragma library

.import "../SpeciesProfile.js" as SpeciesProfile
.import "Personality.js" as Personality
.import "Drives.js" as Drives
.import "Memory.js" as Memory
.import "Social.js" as Social
.import "Abilities.js" as Abilities
.import "Plans.js" as Plans
.import "Util.js" as Util

function _distCost(pet, dist, refSpan) {
    var hopper = Personality.hasQuirk(pet, "screen_hopper") ? 0.6 : 1.0;
    var span = Math.max(2000, refSpan || (pet.screenW ? pet.screenW() * 0.85 : 2300));
    return (dist / span) * (1.1 - pet.personality.energy * 0.5) * hopper;
}

function _quietCornerNear(perc) {
    var pw = perc.petW || 64, ph = perc.petH || 64;
    var padX = 24;
    var gx = perc.petGX < perc.screen.x + perc.screen.w / 2
        ? perc.screen.x + padX
        : Math.max(perc.screen.x + padX, perc.screen.x + perc.screen.w - pw - padX);
    var gy = Math.max(perc.screen.y + 12, perc.screen.y + perc.screen.h - (perc.screen.bottomInset || 0) - ph - 20);
    return { gx: gx, gy: gy };
}

function _attendToSomething(pet, perc) {
    var now = Util.now(pet);
    if (perc.cursor.onMyScreen && perc.cursor.dist < 620 && perc.cursor.active) {
        pet.attentionGX = perc.cursor.gx;
        pet.attentionGY = perc.cursor.gy;
    } else if (perc.nearest && perc.nearest.playing && perc.nearest.dist > 135 && perc.nearest.dist < 520) {
        pet.attentionGX = perc.nearest.gx;
        pet.attentionGY = perc.nearest.gy;
    } else if (perc.win && perc.win.onMyScreen) {
        pet.attentionGX = perc.win.gx;
        pet.attentionGY = perc.win.gy;
    } else {
        pet.attentionUntil = 0;
        return;
    }
    pet.attentionUntil = now + 7000 + Math.random() * 6000;
}

function scoreCandidates(pet, perc, nav, pickFn) {
    var p = pet.personality;
    var spProf = SpeciesProfile.profileFor(SpeciesProfile.speciesOf(pet));
    var cands = [];
    var now = Util.now(pet);
    var justWoke = Memory.justWokeUp(pet);
    var settled = now < (pet.calmUntil || 0);
    var quietHour = 1 - Memory.usualUserActivity(pet, perc.hour);
    var active = Math.max(0.28, 1 - (Math.max(0, p.sleepiness - 0.45) * 0.62 + (1 - p.energy) * 0.24));
    var nightMult = perc.isNight ? (0.42 + p.energy * 0.25) : 1;
    var fsCalm = perc.fullscreen ? 0.45 : 1;
    var boredomBoost = 1 + pet.boredom * 0.85;
    var moodMult = 0.62 + pet.mood * 0.76;
    var bond = pet.bond === undefined ? 0.3 : pet.bond;
    var trust = pet.trust === undefined ? 0.35 : pet.trust;

    cands.push({
        name: "idle_watch",
        score: 0.38 + p.patience * 0.18 + p.composure * 0.08 - pet.boredom * 0.22
             + (justWoke ? 0.22 : 0) + (settled ? 0.22 : 0) + (perc.micActive ? 0.22 : 0),
        exec: function() {
            _attendToSomething(pet, perc);
            pet.restartIdle(0.95 + p.patience * 0.55);
        }
    });

    var restThreshold = Math.max(0.20, 0.36 - p.sleepiness * 0.18);
    if ((pet.restDrive > restThreshold && pet.alertness < 0.78) || pet.alertness < 0.18) {
        var restScore = pet.restDrive * (0.72 + p.sleepiness * 0.96)
                      + p.sleepiness * 0.18
                      + (1 - pet.alertness) * 0.36 - pet.alertness * 0.20
                      + perc.placeAffectHere * 0.28
                      + (perc.atHome ? 0.12 : 0);
        if (perc.isNight) restScore *= Personality.hasQuirk(pet, "night_watch") && !perc.userIdle ? 0.9 : 1.38;
        if (perc.micActive) restScore *= 1.16;
        if (perc.isRaining && (spProf.biome === "Warm Hearth" || spProf.biome === "Sunlit Meadow")) restScore *= 1.15;
        restScore *= 1 + (quietHour - 0.5) * 0.48;
        if (justWoke) restScore *= 0.2;

        var deep = pet.restDrive > 0.68 || (perc.isNight && pet.restDrive > 0.44);
        var wantSploot = !deep && (((perc.thermalWarmth || 0) > 0.54 && (spProf.biome === "Warm Hearth" || p.sleepiness > 0.52))
                                   || pet.restDrive > 0.60);
        var favSpot = Memory.favoriteSpot(pet);

        cands.push({
            name: "rest",
            score: restScore,
            exec: function() {
                Plans.startPlan(pet, Plans.buildRestPlan(pet, perc, false, null, deep, wantSploot), nav, pickFn);
            }
        });

        if (!perc.atHome && perc.homeReachable && pet.restDrive > 0.38) {
            cands.push({
                name: "go_home_rest",
                score: restScore * 0.88 + pet.comfortDrive * 0.32 - _distCost(pet, perc.distFromHome),
                exec: function() {
                    Plans.startPlan(pet, Plans.buildRestPlan(pet, perc, true, null, deep, wantSploot), nav, pickFn);
                }
            });
        }

        if (favSpot && Math.hypot(favSpot.gx - perc.petGX, favSpot.gy - perc.petGY) > 180) {
            var dSanct = Math.hypot(favSpot.gx - perc.petGX, favSpot.gy - perc.petGY);
            cands.push({
                name: "sanctuary_rest",
                score: restScore * (Personality.hasQuirk(pet, "cozy_hermit") ? 1.15 : 0.92)
                     + favSpot.affect * 0.25 - _distCost(pet, dSanct),
                exec: function() {
                    Plans.startPlan(pet, Plans.buildRestPlan(pet, perc, false, favSpot, deep, wantSploot), nav, pickFn);
                }
            });
        }
    }

    if (perc.warmSpot && !justWoke && !perc.fullscreen && pet.alertness < 0.82
            && (pet.restDrive > 0.18 || p.sleepiness > 0.48 || spProf.socialStyle === "trickster")) {
        var wsScore = (0.34 + pet.restDrive * 0.55 + p.sleepiness * 0.32)
                    + (spProf.socialStyle === "trickster" ? 0.18 : 0)
                    + (Abilities.has(pet, "hearth_warmth") ? 0.12 : 0)
                    - _distCost(pet, perc.warmSpot.dist);
        cands.push({
            name: "steal_warm_spot",
            otherName: perc.warmSpot.petName,
            score: wsScore,
            exec: function() {
                Plans.startPlan(pet, Plans.buildStealWarmSpotPlan(perc.warmSpot, pet), nav, pickFn);
            }
        });
    }

    if (perc.userBusy && !perc.fullscreen && !justWoke && pet.alertness > 0.24
            && (p.composure >= 0.58 || Abilities.has(pet, "soothing_ribbon") || Personality.hasQuirk(pet, "velcro_companion"))
            && !Memory.recent(pet, "calm_company", 300000)) {
        var calmScore = (0.34 + bond * 0.36 + p.composure * 0.30)
                      + (Abilities.has(pet, "soothing_ribbon") ? 0.16 : 0);
        cands.push({
            name: "calm_company",
            score: calmScore,
            exec: function() {
                Plans.startPlan(pet, Plans.buildCalmCompanyPlan(perc, pet), nav, pickFn);
            }
        });
    }

    if (!perc.atHome && perc.homeReachable && pet.comfortDrive > 0.3) {
        cands.push({
            name: "go_home",
            score: pet.comfortDrive * (1.18 - p.boldness * 0.5)
                 - _distCost(pet, perc.distFromHome) * 0.5
                 + (perc.isNight ? 0.14 : 0),
            exec: function() {
                Plans.startPlan(pet, Plans.buildGoHomePlan(pet), nav, pickFn);
            }
        });
    }

    if (pet.alertness > 0.30 && pet.exploreDrive > 0.25 && !justWoke) {
        var target = Memory.explorationTarget(pet);
        if (target && pet.exploreDrive > 0.32) {
            var dTarget = Math.hypot(target.gx - perc.petGX, target.gy - perc.petGY);
            cands.push({
                name: "scout_expedition",
                score: pet.exploreDrive * (0.56 + p.curiosity * 0.74)
                     * active * nightMult * fsCalm * boredomBoost
                     + (target.visits === 0 ? 0.14 : 0)
                     + (target.otherScreen ? p.boldness * 0.14 + (Personality.hasQuirk(pet, "screen_hopper") ? 0.18 : 0) : 0)
                     - _distCost(pet, dTarget) * 0.5,
                exec: function() {
                    Plans.startPlan(pet, Plans.buildScoutPlan(target), nav, pickFn);
                }
            });
        }
        cands.push({
            name: "wander",
            score: pet.exploreDrive * (0.32 + p.curiosity * 0.28) * active * nightMult * fsCalm
                 + pet.boredom * 0.12,
            exec: function() {
                nav.wanderStart(pet, target ? Math.atan2(target.gy - perc.petGY, target.gx - perc.petGX) : undefined);
            }
        });

        if (perc.seamPeeks && perc.seamPeeks.length > 0 && !perc.fullscreen
                && pet.alertness > 0.34 && pet.exploreDrive > 0.28 && p.curiosity > 0.38
                && !Memory.recent(pet, "seam_peeked", 300000)) {
            var sp0 = perc.seamPeeks[0];
            var shouldCross = (p.boldness > 0.48 || Personality.hasQuirk(pet, "screen_hopper") || sp0.hasPeer)
                           && Math.random() < 0.55;
            cands.push({
                name: "seam_peek",
                score: pet.exploreDrive * (0.44 + p.curiosity * 0.52) * active * fsCalm
                     + (sp0.hasPeer ? 0.16 : 0) + (sp0.hasWindow ? 0.10 : 0)
                     - _distCost(pet, sp0.dist) * 0.5,
                exec: function() {
                    Plans.startPlan(pet, Plans.buildSeamPeekPlan(sp0, shouldCross, pet), nav, pickFn);
                }
            });
        }
    }

    if (perc.win && !perc.fullscreen && pet.alertness > 0.30 && !justWoke) {
        var cls = perc.win.cls;
        var pref = Memory.getWindowPref(pet, cls);
        var novelty = 1 / (1 + Memory.windowFamiliarity(pet, cls) * 0.14);
        var supBoost = perc.win.isCode
            ? ((Personality.hasQuirk(pet, "terminal_supervisor") ? 0.28 : 0) + Abilities.codeWatchBonus(pet))
            : 0;
        if ((perc.thermalWarmth || 0) > 0.48 && (Abilities.has(pet, "hearth_warmth") || spProf.biome === "Warm Hearth")) {
            supBoost += 0.22 * perc.thermalWarmth;
        }
        if (perc.isRaining && (spProf.biome === "Warm Hearth" || spProf.biome === "Sunlit Meadow")) {
            supBoost += 0.14;
        }
        var supScore = (pet.exploreDrive * 0.58 + pet.socialDrive * 0.42)
                     * (0.45 + p.curiosity * 0.72) * (0.55 + pref * 0.55) * (0.65 + novelty * 0.45)
                     * spProf.windowWatchAffinity * active * nightMult + supBoost
                     - _distCost(pet, perc.win.dist);
        if (Memory.recent(pet, "supervised_code", 180000)) supScore *= 0.32;
        cands.push({
            name: "supervise_work",
            score: supScore,
            exec: function() {
                Plans.startPlan(pet, Plans.buildSupervisePlan(perc, pet), nav, pickFn);
            }
        });
    }

    if (pet.enablePerching !== false && perc.perches && perc.perches.length > 0
            && !perc.fullscreen && pet.alertness > 0.40 && !justWoke
            && !Memory.recent(pet, "perched_window", 210000)) {
        var bestPerch = perc.perches[0];
        for (var pi = 1; pi < perc.perches.length; pi++) {
            if (perc.perches[pi].focused) { bestPerch = perc.perches[pi]; break; }
        }
        var perchBonus = (Personality.hasQuirk(pet, "window_percher") ? 0.26 : 0) + Abilities.perchBonus(pet);
        if ((perc.thermalWarmth || 0) > 0.48 && Abilities.has(pet, "frost_calm")) {
            perchBonus += 0.24 * perc.thermalWarmth;
        }
        var perchScore = (pet.exploreDrive * 0.52 + pet.playDrive * 0.28)
                       * (0.38 + p.boldness * 0.45 + p.curiosity * 0.35)
                       * spProf.perchAffinity * active * nightMult + perchBonus
                       - _distCost(pet, bestPerch.dist);
        cands.push({
            name: "window_perch",
            score: perchScore,
            exec: function() {
                Plans.startPlan(pet, Plans.buildWindowPerchPlan(bestPerch, pet), nav, pickFn);
            }
        });

        var agilePercher = spProf.perchAffinity >= 1.08
                        || Personality.hasQuirk(pet, "window_percher")
                        || Abilities.has(pet, "sky_drift");
        if (agilePercher && bestPerch.spanW >= 140 && p.curiosity > 0.36) {
            cands.push({
                name: "ledge_stroll",
                score: perchScore * 0.96 + p.curiosity * 0.08,
                exec: function() {
                    Plans.startPlan(pet, Plans.buildLedgeStrollPlan(bestPerch), nav, pickFn);
                }
            });
        }
        if (agilePercher && !perc.micActive
                && bestPerch.adjacentLedges && bestPerch.adjacentLedges.length > 0
                && p.boldness > 0.42 && pet.playDrive > 0.22) {
            var nextLedge = bestPerch.adjacentLedges[0];
            cands.push({
                name: "ledge_parkour",
                score: perchScore * 1.02 + p.boldness * 0.10,
                exec: function() {
                    Plans.startPlan(pet, Plans.buildLedgeParkourPlan(bestPerch, nextLedge), nav, pickFn);
                }
            });
        }
    }

    if (pet.enableMusicReact !== false && perc.mediaPlaying && !perc.fullscreen
            && pet.alertness > 0.32 && !Memory.recent(pet, "music_groove", 210000)) {
        var melo = (Personality.hasQuirk(pet, "melomaniac") ? 0.30 : 0) + Abilities.musicGrooveBonus(pet);
        var grooveAffinity = p.playfulness * 0.68 + p.energy * 0.32;
        if (grooveAffinity > 0.34 || melo > 0) {
            var grooveFriend = (perc.nearest && perc.nearest.dist < 260 && perc.nearest.affinity > 0.45 && !perc.nearest.resting)
                ? perc.nearest.name : "";
            var grooveScore = (0.20 + pet.playDrive * 0.48) * (0.28 + grooveAffinity * 0.92)
                            * moodMult * active + melo;
            cands.push({
                name: "music_groove",
                score: grooveScore,
                exec: function() {
                    Plans.startPlan(pet, Plans.buildMusicGroovePlan(perc, grooveFriend, pet), nav, pickFn);
                }
            });
        }
    }

    if (perc.isNight && !perc.userIdle && !perc.fullscreen
            && bond > 0.38 && pet.alertness > 0.25
            && !Memory.recent(pet, "night_vigil", 420000)) {
        var vigilScore = (0.35 + bond * 0.4 + p.sociability * 0.35)
                       + (Personality.hasQuirk(pet, "night_watch") ? 0.28 : 0);
        cands.push({
            name: "night_vigil",
            score: vigilScore,
            exec: function() {
                Plans.startPlan(pet, Plans.buildNightVigilPlan(perc, pet), nav, pickFn);
            }
        });
    }

    if (perc.fullscreen && p.curiosity > 0.32 && pet.alertness > 0.32) {
        var corner = _quietCornerNear(perc);
        var dCorner = Math.hypot(corner.gx - perc.petGX, corner.gy - perc.petGY);
        cands.push({
            name: "watch_fullscreen",
            score: pet.exploreDrive * p.curiosity * 0.72 * (0.6 + p.patience * 0.4) - _distCost(pet, dCorner),
            exec: function() {
                Plans.startPlan(pet, Plans.buildWatchFullscreenPlan(corner), nav, pickFn);
            }
        });
    }

    var satiety = pet.satiety === undefined ? 0.55 : pet.satiety;
    var forageAt = Abilities.forageThreshold(pet);
    if (satiety < forageAt && pet.alertness > 0.22 && !justWoke && !Memory.recent(pet, "foraged", 600000)) {
        cands.push({
            name: "forage_snack",
            score: (0.36 + (forageAt - satiety) * 2.2) * fsCalm,
            exec: function() {
                Plans.startPlan(pet, Plans.buildForagePlan(perc), nav, pickFn);
            }
        });
    }

    var askSnack = satiety < 0.22 && bond > 0.45 && p.sociability > 0.40
                && !Memory.recent(pet, "bid_ignored", 900000)
                && !Memory.recent(pet, "foraged", 600000);
    if ((pet.socialDrive > 0.38 || askSnack) && !justWoke && trust > 0.22) {
        if (perc.cursor.active && perc.cursor.reachable && perc.cursor.dist > 115
                && !perc.fullscreen && !perc.micActive
                && !Memory.recent(pet, "bid_ignored", 420000)
                && !Memory.recent(pet, "bid_answered", 300000)) {
            var velcro = Personality.hasQuirk(pet, "velcro_companion") ? 0.22 : 0;
            var hungerDrive = askSnack ? 0.20 : 0;
            cands.push({
                name: "bid_attention",
                score: (pet.socialDrive + hungerDrive) * (0.48 + p.sociability * 0.82)
                     * (0.45 + bond * 0.65) * (0.42 + p.boldness * 0.58)
                     * moodMult * active * nightMult + velcro
                     - _distCost(pet, perc.cursor.dist),
                exec: function() {
                    Plans.startPlan(pet, Plans.buildAttentionBidPlan(perc, p.boldness > 0.58, askSnack), nav, pickFn);
                }
            });
        }

        var spot = Memory.favoriteSpot(pet);
        if (spot) {
            var dSpot = Math.hypot(spot.gx - perc.petGX, spot.gy - perc.petGY);
            if (dSpot > 200) {
                cands.push({
                    name: "revisit_sanctuary",
                    score: (pet.socialDrive * 0.25 + pet.comfortDrive * 0.35 + (1 - pet.mood) * 0.28)
                         * (0.45 + spot.affect) - _distCost(pet, dSpot),
                    exec: function() {
                        Plans.startPlan(pet, Plans.buildRevisitSanctuaryPlan(pet, spot), nav, pickFn);
                    }
                });
            }
        }
    }

    var sig = spProf.signature;
    if (pet.playDrive > sig.minPlay && pet.alertness > 0.38 && !justWoke) {
        var soloScore = pet.playDrive * (0.46 + p.playfulness * 0.72) * moodMult * active * fsCalm * nightMult;
        if (Memory.recent(pet, "played_solo", 320000)) soloScore *= 0.25;
        cands.push({
            name: "play_solo",
            score: soloScore,
            exec: function() {
                pet.playDrive = Math.max(0, pet.playDrive - 0.20);
                Memory.recordEpisode(pet, "played_solo", { valence: 0.3 });
                Plans.startPlan(pet, Plans.buildPlaySoloPlan(pet, sig), nav, pickFn);
            }
        });

        if (!perc.micActive && pet.playDrive > 0.76 && pet.alertness > 0.55 && !Memory.recent(pet, "zoomies", 480000)) {
            cands.push({
                name: "zoomies",
                score: Math.pow(pet.playDrive, 1.55) * (0.38 + p.playfulness * 0.75)
                     * (0.3 + p.energy * 0.7) * moodMult * boredomBoost
                     * (perc.fullscreen ? 0.25 : 1) * (perc.isNight ? 0.35 : 1) - 0.12,
                exec: function() {
                    pet.playDrive = Math.max(0, pet.playDrive - 0.28);
                    Memory.recordEpisode(pet, "zoomies", { valence: 0.35 });
                    Plans.startPlan(pet, Plans.buildZoomiesPlan(pet), nav, pickFn);
                }
            });
        }
    }

    var abilityCands = Abilities.evaluateCandidates(pet, perc, nav, pickFn, {
        active: active,
        nightMult: nightMult,
        moodMult: moodMult
    });
    for (var ac = 0; ac < abilityCands.length; ac++) {
        (function(ab) {
            cands.push({
                name: ab.name,
                otherName: ab.otherName,
                score: ab.score,
                exec: function() {
                    if (ab.claimSocial) {
                        Social.claimPeerBout(pet, ab.claimSocial, ab.claimGapMs || 135000);
                    }
                    Plans.startPlan(pet, ab.plan, nav, pickFn);
                }
            });
        })(abilityCands[ac]);
    }

    _socialCandidates(pet, perc, nav, pickFn, cands, { active: active, nightMult: nightMult, moodMult: moodMult });

    return cands;
}

function _socialCandidates(pet, perc, nav, pickFn, cands, m) {
    var p = pet.personality;
    var effPat = Drives.effectivePatience(pet);
    var myStyle = SpeciesProfile.socialStyleOf(pet);
    var packSpark = Personality.hasQuirk(pet, "pack_spark") ? 0.16 : 0;
    var libMult = perc.micActive ? 0.22 : 1.0;

    for (var s = 0; s < Math.min(3, perc.others.length); s++) {
        (function(o) {
            if (o.busySocial || !o.sameScreen || o.dist >= 145) return;
            var crowdedDislike = o.affinity < 0.37
                              || (o.affinity < 0.48 && effPat < 0.36)
                              || (o.friction >= 2 && o.affinity < 0.44);
            if (!crowdedDislike || o.sinceInteract < 45000) return;

            if (p.boldness >= 0.42 && !o.resting && !perc.micActive && Social.canInitiatePeerBout(pet, 65000)) {
                cands.push({
                    name: "squabble",
                    otherName: o.name,
                    score: (0.52 - o.affinity) * (0.95 + (1 - effPat) * 0.65) + p.boldness * 0.16,
                    exec: function() {
                        Social.claimPeerBout(pet, "squabble", 65000);
                        Plans.startPlan(pet, Plans.buildSquabblePlan(pet, o), nav, pickFn);
                    }
                });
            } else {
                cands.push({
                    name: "move_away",
                    otherName: o.name,
                    score: (0.50 - o.affinity) * (1 - effPat * 0.45) * 1.32,
                    exec: function() {
                        Social.annoy(pet, o.pet);
                        Plans.clearPlan(pet);
                        nav.fleeFrom(pet, o.gx, o.gy, 175 + Math.random() * 115);
                    }
                });
            }
        })(perc.others[s]);
    }

    if (perc.fullscreen || !Social.canInitiatePeerBout(pet, 135000)) return;

    for (var i = 0; i < Math.min(3, perc.others.length); i++) {
        (function(o) {
            if (o.busySocial) return;

            var closeProx = o.sameScreen && o.dist < 260;
            var closeFriendMed = o.sameScreen && o.dist >= 260 && o.dist < 500
                              && o.affinity >= 0.65 && o.familiarity >= 0.36 && o.sinceInteract > 360000;
            var soulmateFar = o.affinity >= 0.76 && o.familiarity >= 0.48
                           && o.sinceInteract > 540000 && o.dist >= 260
                           && (o.sameScreen || p.boldness > 0.50 || Personality.hasQuirk(pet, "screen_hopper"));

            if (!closeProx && !closeFriendMed && !soulmateFar) return;

            if (soulmateFar) {
                var checkScore = pet.socialDrive * (0.38 + p.sociability * 0.62)
                               * (0.45 + o.affinity * 0.65) * m.moodMult * m.active * m.nightMult
                               + packSpark * 0.5 - _distCost(pet, o.dist) * 0.85;
                cands.push({
                    name: "best_friend_checkin",
                    otherName: o.name,
                    score: checkScore,
                    exec: function() {
                        Social.claimPeerBout(pet, "greet", 180000);
                        Plans.startPlan(pet, Plans.buildBestFriendVisitPlan(pet, o), nav, pickFn);
                    }
                });
                return;
            }

            if (!perc.micActive && o.sameScreen && o.dist > 105 && o.dist < 360
                    && !o.resting && (o.state === "idle" || o.state === "sitNorth")
                    && o.affinity >= 0.46 && o.sinceInteract > 180000
                    && !Social.isPeerLookingAt(o.pet, pet)
                    && (myStyle === "trickster" || Abilities.has(pet, "shadow_meld") || Abilities.has(pet, "illusion") || p.playfulness > 0.68)
                    && pet.playDrive > 0.30 && !Memory.recent(pet, "sneak_boop", 420000)) {
                var sneakScore = pet.playDrive * (0.36 + p.playfulness * 0.52 + p.boldness * 0.20)
                               * (0.40 + o.affinity * 0.55) * m.moodMult * m.active
                               + (myStyle === "trickster" ? 0.14 : 0)
                               - _distCost(pet, o.dist) * 0.45;
                cands.push({
                    name: "sneak_boop",
                    otherName: o.name,
                    score: sneakScore,
                    exec: function() {
                        Social.claimPeerBout(pet, "play", 150000);
                        Plans.startPlan(pet, Plans.buildSneakBoopPlan(pet, o), nav, pickFn);
                    }
                });
            }

            if ((myStyle === "guardian" || ((pet.maturity || 0) >= 0.45 && p.composure >= 0.58))
                    && o.sameScreen && o.dist < 320 && !o.resting && o.affinity >= 0.48
                    && ((o.pet.maturity || 0) < 0.30 || o.respect >= 0.62)
                    && o.sinceInteract > 210000 && pet.exploreDrive > 0.24
                    && !Memory.recent(pet, "mentor_patrol", 480000)) {
                var patrolScore = (pet.exploreDrive * 0.56 + pet.socialDrive * 0.44)
                                * (0.38 + p.composure * 0.46) * (0.42 + o.affinity * 0.52)
                                * m.active * m.nightMult
                                + (myStyle === "guardian" ? 0.14 : 0)
                                - _distCost(pet, o.dist) * 0.4;
                cands.push({
                    name: "mentor_patrol",
                    otherName: o.name,
                    score: patrolScore,
                    exec: function() {
                        Social.claimPeerBout(pet, "greet", 160000);
                        Plans.startPlan(pet, Plans.buildMentorPatrolPlan(pet, perc, o.name), nav, pickFn);
                    }
                });
            }

            if (!o.resting && o.sinceInteract > 150000 && pet.playDrive > 0.28 && pet.alertness > 0.38) {
                var wantsSpar = myStyle === "brawler" || o.socialStyle === "brawler"
                             || o.sparCount >= 2 || (p.boldness > 0.58 && p.playfulness > 0.48);
                if (wantsSpar && o.affinity >= 0.38 && o.dist < (closeFriendMed ? 460 : 245)) {
                    var sparScore = (pet.playDrive * (0.32 + p.boldness * 0.46 + p.playfulness * 0.40)
                                  * (0.42 + o.respect * 0.58) * m.moodMult * m.active
                                  + (myStyle === "brawler" ? 0.16 : 0)
                                  + (o.sparCount >= 2 ? 0.10 : 0)
                                  + packSpark * 0.5 - _distCost(pet, o.dist) * 0.5) * libMult;
                    cands.push({
                        name: "spar_bout",
                        otherName: o.name,
                        score: sparScore,
                        exec: function() {
                            Social.claimPeerBout(pet, "spar", 135000);
                            Plans.startPlan(pet, Plans.buildSparBoutPlan(pet, o.name, o.dist < 130, false), nav, pickFn);
                        }
                    });
                }

                if (o.affinity >= 0.44 && p.playfulness > 0.34) {
                    var oPlayful = o.pet.personality.playfulness;
                    var tagScore = (pet.playDrive * (0.24 + p.playfulness * 0.70 + p.energy * 0.22)
                                 * (0.38 + oPlayful * 0.55) * (0.35 + o.affinity * 0.72)
                                 * m.moodMult * m.active
                                 + (myStyle === "sprinter" ? 0.15 : 0)
                                 + packSpark * 0.6 - _distCost(pet, o.dist) * 0.5) * libMult;
                    cands.push({
                        name: "play_tag",
                        otherName: o.name,
                        score: tagScore,
                        exec: function() {
                            Social.claimPeerBout(pet, "chase", 135000);
                            Plans.startPlan(pet, Plans.buildPlayTagPlan(o, o.dist < 125, pet), nav, pickFn);
                        }
                    });
                }
            }

            if (closeProx && o.sinceInteract > 140000 && o.affinity >= 0.42 && o.unrequitedCount < 4
                    && o.state !== "deepsleep" && pet.alertness > 0.34
                    && (pet.playDrive > 0.26 || pet.socialDrive > 0.42)
                    && (p.playfulness > 0.42 || p.sociability > 0.48)) {
                var invScore = ((pet.playDrive * 0.58 + pet.socialDrive * 0.42)
                             * (0.34 + p.playfulness * 0.44 + p.sociability * 0.40)
                             * (0.38 + o.affinity * 0.70) * m.moodMult * m.active
                             - o.unrequitedCount * 0.08 + packSpark * 0.5) * libMult;
                cands.push({
                    name: "invite_play",
                    otherName: o.name,
                    score: invScore,
                    exec: function() {
                        Social.claimPeerBout(pet, "invite", 135000);
                        Plans.startPlan(pet, Plans.buildInvitePlayPlan(pet, o), nav, pickFn);
                    }
                });
            }

            if (closeProx && !o.resting && o.sinceInteract > 160000
                    && pet.playDrive > 0.28 && p.playfulness > 0.40 && pet.alertness > 0.36) {
                var showScore = (pet.playDrive * (0.32 + p.playfulness * 0.54 + p.boldness * 0.22)
                              * m.moodMult * m.active + (myStyle === "trickster" ? 0.16 : 0)) * libMult;
                cands.push({
                    name: "show_off",
                    otherName: o.name,
                    score: showScore,
                    exec: function() {
                        Social.claimPeerBout(pet, "show_off", 135000);
                        Plans.startPlan(pet, Plans.buildShowOffPlan(pet, o), nav, pickFn);
                    }
                });
            }

            if (o.resting && o.dist > 64 && o.affinity >= 0.54
                    && pet.restDrive > 0.32 && pet.alertness < 0.72 && o.sinceInteract > 180000) {
                var ang = Math.atan2(perc.petGY - o.gy, perc.petGX - o.gx) + (Math.random() - 0.5) * 0.6;
                var offX = Math.round(Math.cos(ang) * 68);
                var offY = Math.round(Math.sin(ang) * 52);
                cands.push({
                    name: "rest_with",
                    otherName: o.name,
                    score: pet.restDrive * (0.50 + p.sleepiness * 0.52)
                         * (0.36 + o.affinity * 0.80) + o.familiarity * 0.12
                         + Abilities.restWithBonus(pet, o.pet)
                         - _distCost(pet, o.dist),
                    exec: function() {
                        Social.claimPeerBout(pet, "nap", 135000);
                        Plans.startPlan(pet, Plans.buildRestWithPlan(pet, o.name, offX, offY, false), nav, pickFn);
                    }
                });
            }
        })(perc.others[i]);
    }
}
