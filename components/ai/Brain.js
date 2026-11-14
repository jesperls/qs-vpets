.import "../SpeciesProfile.js" as SpeciesProfile
.import "Personality.js" as Personality
.import "Drives.js" as Drives
.import "Memory.js" as Memory
.import "Perception.js" as Perception
.import "Social.js" as Social
.import "Plans.js" as Plans

var COMMIT_BONUS = 0.24;
var SCORE_NOISE = 0.10;
var CANDIDATE_WINDOW = 0.48;

var HIDE_STATES = ["hide", "sink", "cringe", "trip"];
var ATTACK_STATES = [
    "attack", "shoot", "charge", "double", "leapForth",
    "strike", "quickStrike", "multiStrike", "spAttack", "swing"
];

function _now(pet) {
    return (pet && pet._simNow) ? pet._simNow : Date.now();
}

function think(pet, nav) {
    if (Plans.hasActivePlan(pet)) {
        if (pet.onJourney && retarget(pet)) {
            nav.resumeJourney(pet);
            return;
        }
        Plans.advanceStep(pet, nav, _pick);
        return;
    }

    var perc = Perception.perceive(pet);
    var cands = _candidates(pet, perc, nav);
    if (cands.length === 0) {
        pet.restartIdle();
        return;
    }

    var choice = _softmaxPick(pet, cands);
    if (!choice) {
        pet.restartIdle();
        return;
    }
    choice.exec();
}

function onPlanBeat(pet, nav) {
    if (Plans.hasActivePlan(pet)) {
        Plans.advanceStep(pet, nav, _pick);
    } else {
        think(pet, nav);
    }
}

function onActionFinished(pet, nav) {
    if (Plans.hasActivePlan(pet)) {
        var step = Plans.currentStep(pet);
        if (step && (step.kind === "act" || step.kind === "vocal" || step.kind === "pant"
                || step.kind === "face_away" || step.kind === "zoomies"
                || step.kind === "illusion_shift" || step.kind === "illusion_clear")) {
            Plans.advanceStep(pet, nav, _pick);
            return;
        }
    }
    pet.enterState("idle");
}

function _softmaxPick(pet, cands) {
    var max = -Infinity;
    var committed = pet.intention && _now(pet) < pet.intention.until;
    for (var i = 0; i < cands.length; i++) {
        cands[i].score += (Math.random() - 0.5) * SCORE_NOISE;
        if (committed && cands[i].name === pet.intention.name
                && (!pet.intention.otherName || cands[i].otherName === pet.intention.otherName)) {
            cands[i].score += COMMIT_BONUS;
        }
        if (cands[i].score > max) max = cands[i].score;
    }
    var temp = 0.09 + (1 - pet.personality.patience) * 0.06;
    var total = 0, weights = [];
    for (var j = 0; j < cands.length; j++) {
        var d = cands[j].score - max;
        var w = d < -CANDIDATE_WINDOW ? 0 : Math.exp(d / temp);
        weights.push(w);
        total += w;
    }
    if (total <= 0) return cands[0];
    var r = Math.random() * total;
    for (var k = 0; k < cands.length; k++) {
        r -= weights[k];
        if (r <= 0) return cands[k];
    }
    return cands[cands.length - 1];
}

function _distCost(pet, dist, refSpan) {
    var hopper = Personality.hasQuirk(pet, "screen_hopper") ? 0.6 : 1.0;
    var span = Math.max(2000, refSpan || (pet.screenW ? pet.screenW() * 0.85 : 2300));
    return (dist / span) * (1.1 - pet.personality.energy * 0.5) * hopper;
}

function _candidates(pet, perc, nav) {
    var p = pet.personality;
    var spProf = SpeciesProfile.profileFor(SpeciesProfile.speciesOf(pet));
    var cands = [];
    var now = _now(pet);
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
             + (justWoke ? 0.22 : 0) + (settled ? 0.22 : 0),
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
        restScore *= 1 + (quietHour - 0.5) * 0.48;
        if (justWoke) restScore *= 0.2;

        var deep = pet.restDrive > 0.68 || (perc.isNight && pet.restDrive > 0.44);
        var favSpot = Memory.favoriteSpot(pet);

        cands.push({
            name: "rest",
            score: restScore,
            exec: function() {
                Plans.startPlan(pet, Plans.buildRestPlan(pet, perc, false, null, deep), nav, _pick);
            }
        });

        if (!perc.atHome && perc.homeReachable && pet.restDrive > 0.38) {
            cands.push({
                name: "go_home_rest",
                score: restScore * 0.88 + pet.comfortDrive * 0.32 - _distCost(pet, perc.distFromHome),
                exec: function() {
                    Plans.startPlan(pet, Plans.buildRestPlan(pet, perc, true, null, deep), nav, _pick);
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
                    Plans.startPlan(pet, Plans.buildRestPlan(pet, perc, false, favSpot, deep), nav, _pick);
                }
            });
        }
    }

    if (!perc.atHome && perc.homeReachable && pet.comfortDrive > 0.3) {
        cands.push({
            name: "go_home",
            score: pet.comfortDrive * (1.18 - p.boldness * 0.5)
                 - _distCost(pet, perc.distFromHome) * 0.5
                 + (perc.isNight ? 0.14 : 0),
            exec: function() {
                Plans.startPlan(pet, {
                    name: "go_home",
                    label: "Heading Home",
                    reason: "Returning to home territory",
                    urgency: pet.comfortDrive,
                    thought: "Padding back to home spot",
                    steps: [
                        { kind: "travel", gait: "amble", label: "Walking home", gx: pet.homeGX, gy: pet.homeGY },
                        { kind: "act", label: "Settling in", states: SpeciesProfile.settleGesturesFor(pet) }
                    ]
                }, nav, _pick);
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
                    Plans.startPlan(pet, Plans.buildScoutPlan(target), nav, _pick);
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
    }

    if (perc.win && !perc.fullscreen && pet.alertness > 0.30 && !justWoke) {
        var cls = perc.win.cls;
        var pref = Memory.getWindowPref(pet, cls);
        var novelty = 1 / (1 + Memory.windowFamiliarity(pet, cls) * 0.14);
        var supBoost = (perc.win.isCode && Personality.hasQuirk(pet, "terminal_supervisor")) ? 0.28 : 0;
        var supScore = (pet.exploreDrive * 0.58 + pet.socialDrive * 0.42)
                     * (0.45 + p.curiosity * 0.72) * (0.55 + pref * 0.55) * (0.65 + novelty * 0.45)
                     * spProf.windowWatchAffinity * active * nightMult + supBoost
                     - _distCost(pet, perc.win.dist);
        if (Memory.recent(pet, "supervised_code", 180000)) supScore *= 0.32;
        cands.push({
            name: "supervise_work",
            score: supScore,
            exec: function() {
                Plans.startPlan(pet, Plans.buildSupervisePlan(perc, pet), nav, _pick);
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
        var perchBonus = Personality.hasQuirk(pet, "window_percher") ? 0.26 : 0;
        var perchScore = (pet.exploreDrive * 0.52 + pet.playDrive * 0.28)
                       * (0.38 + p.boldness * 0.45 + p.curiosity * 0.35)
                       * spProf.perchAffinity * active * nightMult + perchBonus
                       - _distCost(pet, bestPerch.dist);
        cands.push({
            name: "window_perch",
            score: perchScore,
            exec: function() {
                Plans.startPlan(pet, Plans.buildWindowPerchPlan(bestPerch, pet), nav, _pick);
            }
        });
    }

    if (pet.enableMusicReact !== false && perc.mediaPlaying && !perc.fullscreen
            && pet.alertness > 0.32 && !Memory.recent(pet, "music_groove", 210000)) {
        var melo = Personality.hasQuirk(pet, "melomaniac") ? 0.30 : 0;
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
                    Plans.startPlan(pet, Plans.buildMusicGroovePlan(perc, grooveFriend, pet), nav, _pick);
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
                Plans.startPlan(pet, Plans.buildNightVigilPlan(perc, pet), nav, _pick);
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
                Plans.startPlan(pet, {
                    name: "watch_fullscreen",
                    label: "Quiet Fullscreen Watch",
                    reason: "Loafing in a polite corner",
                    urgency: 0.45,
                    thought: "Tucking into a quiet corner out of the way",
                    steps: [
                        { kind: "travel", gait: "amble", label: "Moving to corner", gx: corner.gx, gy: corner.gy },
                        { kind: "rest", label: "Loafing quietly", deep: false }
                    ]
                }, nav, _pick);
            }
        });
    }

    var satiety = pet.satiety === undefined ? 0.55 : pet.satiety;
    if (satiety < 0.24 && pet.alertness > 0.22 && !justWoke && !Memory.recent(pet, "foraged", 600000)) {
        cands.push({
            name: "forage_snack",
            score: (0.36 + (0.24 - satiety) * 2.2) * fsCalm,
            exec: function() {
                Plans.startPlan(pet, Plans.buildForagePlan(perc), nav, _pick);
            }
        });
    }

    var askSnack = satiety < 0.22 && bond > 0.45 && p.sociability > 0.40
                && !Memory.recent(pet, "bid_ignored", 900000)
                && !Memory.recent(pet, "foraged", 600000);
    if ((pet.socialDrive > 0.38 || askSnack) && !justWoke && trust > 0.22) {
        if (perc.cursor.active && perc.cursor.reachable && perc.cursor.dist > 115 && !perc.fullscreen
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
                    Plans.startPlan(pet, Plans.buildAttentionBidPlan(perc, p.boldness > 0.58, askSnack), nav, _pick);
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
                        Plans.startPlan(pet, {
                            name: "revisit_sanctuary",
                            label: "Visiting Favorite Spot",
                            reason: "Warm memories at favorite spot",
                            urgency: 0.42,
                            thought: "Padding back to a favorite spot",
                            steps: [
                                { kind: "travel", gait: "amble", label: "Returning to favorite spot", gx: spot.gx, gy: spot.gy },
                                { kind: "act", label: "Settling in", states: SpeciesProfile.settleGesturesFor(pet) }
                            ]
                        }, nav, _pick);
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
                Plans.startPlan(pet, {
                    name: "play_solo",
                    label: sig.label,
                    reason: sig.label,
                    urgency: pet.playDrive,
                    durationMs: 32000,
                    thought: sig.label,
                    steps: [
                        { kind: "act", label: sig.label, states: [sig.state, sig.state, sig.state, "hop"] }
                    ]
                }, nav, _pick);
            }
        });

        if (pet.playDrive > 0.76 && pet.alertness > 0.55 && !Memory.recent(pet, "zoomies", 480000)) {
            cands.push({
                name: "zoomies",
                score: Math.pow(pet.playDrive, 1.55) * (0.38 + p.playfulness * 0.75)
                     * (0.3 + p.energy * 0.7) * moodMult * boredomBoost
                     * (perc.fullscreen ? 0.25 : 1) * (perc.isNight ? 0.35 : 1) - 0.12,
                exec: function() {
                    pet.playDrive = Math.max(0, pet.playDrive - 0.28);
                    Memory.recordEpisode(pet, "zoomies", { valence: 0.35 });
                    Plans.startPlan(pet, {
                        name: "zoomies",
                        label: "Zoomies",
                        reason: "Burst of playful zoomies",
                        urgency: 0.85,
                        durationMs: 28000,
                        thought: "Scampering in a burst of zoomies",
                        steps: [
                            { kind: "zoomies", label: "Scampering around" },
                            { kind: "pant", label: "Catching breath" },
                            { kind: "act", label: "Shaking off", states: SpeciesProfile.calmGesturesFor(pet) }
                        ]
                    }, nav, _pick);
                }
            });
        }
    }

    var trueProf = SpeciesProfile.profileFor(SpeciesProfile.trueSpeciesOf(pet));
    if (trueProf.illusionCapable && !pet.illusionSpecies
            && Social.canInitiatePeerBout(pet, 150000)
            && perc.nearest && perc.nearest.sameScreen && perc.nearest.dist < 270
            && !perc.nearest.resting && !perc.nearest.busySocial
            && pet.playDrive > 0.42 && pet.alertness > 0.40 && !perc.fullscreen
            && !Memory.recent(pet, "illusion_prank", 900000)) {
        cands.push({
            name: "illusion_prank",
            otherName: perc.nearest.name,
            score: pet.playDrive * (0.38 + p.playfulness * 0.62) * moodMult * active * 0.88,
            exec: function() {
                Social.claimPeerBout(pet, "show_off", 150000);
                Plans.startPlan(pet, Plans.buildIllusionPrankPlan(perc.nearest), nav, _pick);
            }
        });
    }

    _socialCandidates(pet, perc, nav, cands, { active: active, nightMult: nightMult, moodMult: moodMult });

    return cands;
}

function _socialCandidates(pet, perc, nav, cands, m) {
    var p = pet.personality;
    var myStyle = SpeciesProfile.socialStyleOf(pet);
    var packSpark = Personality.hasQuirk(pet, "pack_spark") ? 0.16 : 0;

    for (var s = 0; s < Math.min(3, perc.others.length); s++) {
        (function(o) {
            if (o.busySocial || !o.sameScreen || o.dist >= 145) return;
            var crowdedDislike = o.affinity < 0.37
                              || (o.affinity < 0.46 && p.patience < 0.36)
                              || (o.friction >= 2 && o.affinity < 0.44);
            if (!crowdedDislike || o.sinceInteract < 45000) return;

            if (p.boldness >= 0.42 && !o.resting && Social.canInitiatePeerBout(pet, 65000)) {
                cands.push({
                    name: "squabble",
                    otherName: o.name,
                    score: (0.52 - o.affinity) * (0.95 + (1 - p.patience) * 0.65) + p.boldness * 0.16,
                    exec: function() {
                        Social.claimPeerBout(pet, "squabble", 65000);
                        Plans.startPlan(pet, Plans.buildSquabblePlan(pet, o), nav, _pick);
                    }
                });
            } else {
                cands.push({
                    name: "move_away",
                    otherName: o.name,
                    score: (0.50 - o.affinity) * (1 - p.patience * 0.45) * 1.32,
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
                        Plans.startPlan(pet, Plans.buildBestFriendVisitPlan(pet, o), nav, _pick);
                    }
                });
                return;
            }

            if (!o.resting && o.sinceInteract > 150000 && pet.playDrive > 0.28 && pet.alertness > 0.38) {
                var wantsSpar = myStyle === "brawler" || o.socialStyle === "brawler"
                             || o.sparCount >= 2 || (p.boldness > 0.58 && p.playfulness > 0.48);
                if (wantsSpar && o.affinity >= 0.38 && o.dist < (closeFriendMed ? 460 : 245)) {
                    var sparScore = pet.playDrive * (0.32 + p.boldness * 0.46 + p.playfulness * 0.40)
                                  * (0.42 + o.respect * 0.58) * m.moodMult * m.active
                                  + (myStyle === "brawler" ? 0.16 : 0)
                                  + (o.sparCount >= 2 ? 0.10 : 0)
                                  + packSpark * 0.5 - _distCost(pet, o.dist) * 0.5;
                    cands.push({
                        name: "spar_bout",
                        otherName: o.name,
                        score: sparScore,
                        exec: function() {
                            Social.claimPeerBout(pet, "spar", 135000);
                            Plans.startPlan(pet, Plans.buildSparBoutPlan(pet, o.name, o.dist < 130, false), nav, _pick);
                        }
                    });
                }

                if (o.affinity >= 0.44 && p.playfulness > 0.34) {
                    var oPlayful = o.pet.personality.playfulness;
                    var tagScore = pet.playDrive * (0.24 + p.playfulness * 0.70 + p.energy * 0.22)
                                 * (0.38 + oPlayful * 0.55) * (0.35 + o.affinity * 0.72)
                                 * m.moodMult * m.active
                                 + (myStyle === "sprinter" ? 0.15 : 0)
                                 + packSpark * 0.6 - _distCost(pet, o.dist) * 0.5;
                    cands.push({
                        name: "play_tag",
                        otherName: o.name,
                        score: tagScore,
                        exec: function() {
                            Social.claimPeerBout(pet, "chase", 135000);
                            Plans.startPlan(pet, Plans.buildPlayTagPlan(o, o.dist < 125, pet), nav, _pick);
                        }
                    });
                }
            }

            if (closeProx && o.sinceInteract > 140000 && o.affinity >= 0.42 && o.unrequitedCount < 4
                    && o.state !== "deepsleep" && pet.alertness > 0.34
                    && (pet.playDrive > 0.26 || pet.socialDrive > 0.42)
                    && (p.playfulness > 0.42 || p.sociability > 0.48)) {
                var invScore = (pet.playDrive * 0.58 + pet.socialDrive * 0.42)
                             * (0.34 + p.playfulness * 0.44 + p.sociability * 0.40)
                             * (0.38 + o.affinity * 0.70) * m.moodMult * m.active
                             - o.unrequitedCount * 0.08 + packSpark * 0.5;
                cands.push({
                    name: "invite_play",
                    otherName: o.name,
                    score: invScore,
                    exec: function() {
                        Social.claimPeerBout(pet, "invite", 135000);
                        Plans.startPlan(pet, Plans.buildInvitePlayPlan(pet, o), nav, _pick);
                    }
                });
            }

            if (closeProx && !o.resting && o.sinceInteract > 160000
                    && pet.playDrive > 0.28 && p.playfulness > 0.40 && pet.alertness > 0.36) {
                var showScore = pet.playDrive * (0.32 + p.playfulness * 0.54 + p.boldness * 0.22)
                              * m.moodMult * m.active + (myStyle === "trickster" ? 0.16 : 0);
                cands.push({
                    name: "show_off",
                    otherName: o.name,
                    score: showScore,
                    exec: function() {
                        Social.claimPeerBout(pet, "show_off", 135000);
                        Plans.startPlan(pet, Plans.buildShowOffPlan(pet, o), nav, _pick);
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
                         - _distCost(pet, o.dist),
                    exec: function() {
                        Social.claimPeerBout(pet, "nap", 135000);
                        Plans.startPlan(pet, {
                            name: "rest_with",
                            label: "Resting by " + o.name,
                            reason: "Cozy tandem nap with " + o.name,
                            otherName: o.name,
                            urgency: pet.restDrive,
                            thought: "Settling down beside " + o.name,
                            steps: [
                                { kind: "travel", gait: "amble", label: "Padding over to " + o.name, dynamic: "other_pet", offsetX: offX, offsetY: offY },
                                { kind: "social", label: "Snuggling down", interaction: "rest" },
                                { kind: "rest", label: "Resting together", deep: pet.restDrive > 0.70, faceOther: true }
                            ]
                        }, nav, _pick);
                    }
                });
            }
        })(perc.others[i]);
    }
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
    var now = _now(pet);
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

function _faceGlobal(pet, gx, gy) {
    var dx = gx - (pet.screenX() + pet.worldX);
    var dy = gy - (pet.screenY() + pet.worldY);
    pet.facingRight = dx >= 0;
    pet.sprite.setDirection(Math.atan2(dy, dx));
}

function restTick(pet) {
    var perc = Perception.perceive(pet);
    var p = pet.personality;
    var deep = pet.state_ === "deepsleep";
    var quietHour = 1 - Memory.usualUserActivity(pet, perc.hour);

    if (deep || (pet.episodes && pet.episodes.length >= 4)) {
        var dream = Memory.consolidateSleep(pet);
        syncArchetype(pet);
        if (deep && dream && pet.emitEmote) {
            pet.emitEmote(dream.emote);
        }
    }

    var stay = pet.restDrive * 1.12
             + p.sleepiness * 0.48
             - pet.alertness * 0.40
             + (perc.isNight ? 0.36 + p.sleepiness * 0.34 : 0)
             + quietHour * 0.16
             + (deep ? 0.16 : 0)
             + (perc.userIdle ? 0.10 : 0);

    if (stay > 0.52 + Math.random() * 0.28) {
        var wantDeep = pet.restDrive > 0.56
                    || (perc.isNight && p.sleepiness > 0.25)
                    || (!deep && pet.restDrive > 0.42 && p.sleepiness > 0.48);
        pet.continueResting(wantDeep ? "deepsleep" : "loaf");
        return;
    }

    Memory.recordEpisode(pet, "well_rested", { valence: 0.3 });
    Memory.thinkAloud(pet, "woke_up", "Stretched awake refreshed");
    Plans.clearPlan(pet);
    pet.enterState(SpeciesProfile.wakeStateFor(pet));
}

function syncArchetype(pet) {
    var title = Personality.archetypeTitle(pet.personality, pet.quirks, pet.maturity, pet.bond);
    if (title !== pet.archetype && pet.archetype && pet.archetype !== "Curious Hatchling" && (pet.maturity || 0) >= 0.08) {
        var art = /^[AEIOU]/i.test(title) ? "an " : "a ";
        Memory.addJournalEntry(pet, "Grew into " + art + title + ".", "archetype");
    }
    pet.archetype = title;
    return title;
}

function reflect(pet) {
    var dream = Memory.consolidateSleep(pet);
    syncArchetype(pet);
    return dream;
}

function retarget(pet) {
    var plan = pet.activePlan;
    if (!plan) return true;
    if (_now(pet) > plan.until) return false;
    var step = Plans.currentStep(pet);
    if (!step || step.kind !== "travel") return true;

    if (step.dynamic === "cursor") {
        if (!pet.inputTracker || !pet.inputTracker.userActive) return false;
        pet.targetGX = pet.inputTracker.cursorX + (step.offsetX || 0);
        pet.targetGY = pet.inputTracker.cursorY + (step.offsetY || 0);
        return true;
    }
    if (step.dynamic === "other_pet" || step.dynamic === "other_pet_chase") {
        var other = _findPet(pet, plan.otherName);
        if (!other) return false;
        var ogx = other.screenX() + other.worldX;
        var ogy = other.screenY() + other.worldY;
        var d = Math.hypot(ogx - (pet.screenX() + pet.worldX), ogy - (pet.screenY() + pet.worldY));
        if (step.dynamic === "other_pet_chase" && other.onJourney && d < 120) {
            pet.targetGX = other.targetGX + (step.offsetX || -38);
            pet.targetGY = other.targetGY + (step.offsetY || 0);
        } else {
            pet.targetGX = ogx + (step.offsetX !== undefined ? step.offsetX : 54);
            pet.targetGY = ogy + (step.offsetY || 0);
        }
        return true;
    }
    if (plan.name === "supervise_work" || plan.name === "inspect_window") {
        var perc = Perception.perceive(pet);
        if (!perc.win) return false;
        if (plan.watchMode === "north" && perc.win.canSitBelow) {
            pet.targetGX = perc.win.watchBelowGX;
            pet.targetGY = perc.win.watchBelowGY;
        } else {
            pet.targetGX = perc.win.loafBesideGX;
            pet.targetGY = perc.win.loafBesideGY;
        }
        return true;
    }
    if (plan.name === "watch_fullscreen") {
        return !!(pet.windowTracker && pet.windowTracker.isFullscreen);
    }
    return true;
}

function onArrived(pet, nav) {
    if (Plans.hasActivePlan(pet)) {
        Plans.advanceStep(pet, nav, _pick);
        return;
    }
    Drives.eventful(pet, 0.18);
    pet.enterState("idle");
}

function onBlocked(pet) {
    if (Plans.hasActivePlan(pet)) {
        Plans.abortPlan(pet, "blocked");
    }
    pet.enterState("idle");
}

function _findPet(pet, name) {
    if (!name || !pet.petManager || !pet.petManager.pets) return null;
    var all = pet.petManager.pets;
    for (var i = 0; i < all.length; i++) {
        if (all[i] !== pet && all[i].petData.name === name) return all[i];
    }
    return null;
}

function _cooldown(pet, key, ms) {
    if (!pet._eventCooldowns) pet._eventCooldowns = ({});
    var now = _now(pet);
    if (now - (pet._eventCooldowns[key] || 0) < ms) return true;
    pet._eventCooldowns[key] = now;
    return false;
}

function onEvent(pet, type, data, nav) {
    var p = pet.personality;
    var now = _now(pet);
    var loafing = pet.state_ === "loaf" || pet.state_ === "sit";
    var resting = loafing || pet.state_ === "deepsleep";
    var trust = pet.trust === undefined ? 0.35 : pet.trust;
    if (pet.state_ === "drag" && type !== "dropped") return;

    switch (type) {
    case "cursor_near": {
        if (_cooldown(pet, "cursor_near", 45000)) return;
        var cursorSpeed = (pet.inputTracker && pet.inputTracker.cursorSpeed) || 0;
        var suddenRush = cursorSpeed > 1250 && trust < 0.50 && p.composure < 0.55;
        var valence = p.boldness * 0.4 + p.sociability * 0.3 + trust * 0.45 - 0.35
                    + pet.mood * 0.15 - (suddenRush ? 0.50 : 0);

        if (valence >= 0) {
            pet.mood = Drives.clamp01(pet.mood + 0.02);
            Memory.recordPlaceAffect(pet, 0.06);
            if (!resting && pet.state_ === "idle" && pet.inputTracker) {
                _faceGlobal(pet, pet.inputTracker.cursorX, pet.inputTracker.cursorY);
            }
        } else {
            pet.alertness = Drives.clamp01(pet.alertness + 0.24);
            pet.mood = Math.max(0, pet.mood - 0.04);
            Memory.recordPlaceAffect(pet, -0.08);
            Memory.recordEpisode(pet, "startled", { valence: -0.35 });
            Memory.thinkAloud(pet, "startled", "Startled by fast cursor movement", { minGapMs: 25000 });
            if (pet.emitEmote) pet.emitEmote("exclaim");
            if (!resting) {
                Plans.clearPlan(pet);
                if (p.boldness < 0.28 && nav && pet.inputTracker) {
                    pet.gait = "scamper";
                    nav.fleeFrom(pet, pet.inputTracker.cursorX, pet.inputTracker.cursorY, 170 + Math.random() * 110);
                } else {
                    pet.enterState(_pick(pet, HIDE_STATES));
                }
            } else if (loafing) {
                pet.enterState(SpeciesProfile.wakeStateFor(pet));
            }
        }
        break;
    }

    case "cursor_wiggled": {
        if (resting || (pet.state_ !== "idle" && pet.state_ !== "wander")) return;
        var wgx = data ? data.gx : (pet.inputTracker ? pet.inputTracker.cursorX : 0);
        var wgy = data ? data.gy : (pet.inputTracker ? pet.inputTracker.cursorY : 0);
        var wPerc = Perception.perceive(pet);
        if (wPerc.fullscreen || !wPerc.cursor.reachable) return;
        var wDist = Math.hypot(wgx - wPerc.petGX, wgy - wPerc.petGY);
        if (wDist < 45 || wDist > 450) return;

        var chaseDrive = p.playfulness * 0.55 + p.curiosity * 0.35 + p.energy * 0.20 - p.sleepiness * 0.20;
        if (chaseDrive > 0.52 && trust > 0.24 && nav && !_cooldown(pet, "cursor_wiggled", 22000)) {
            Drives.stimulate(pet, 0.14);
            Plans.startPlan(pet, Plans.buildCursorChasePlan(wgx, wgy), nav, _pick);
        } else if (p.boldness < 0.28 && trust < 0.35 && wDist < 180 && nav) {
            pet.gait = "trot";
            nav.fleeFrom(pet, wgx, wgy, 140);
        } else {
            pet.attentionGX = wgx;
            pet.attentionGY = wgy;
            pet.attentionUntil = now + 5000;
            if (pet.state_ === "idle") _faceGlobal(pet, wgx, wgy);
        }
        break;
    }

    case "petted":
    case "stroked": {
        if (Plans.resolveBidSuccess(pet, nav, _pick)) break;

        if (pet.state_ === "deepsleep") {
            Drives.happier(pet, 0.06);
            Drives.shiftTrust(pet, 0.025);
            pet.mood = Drives.clamp01(pet.mood + 0.1);
            Memory.recordEpisode(pet, "petted", { valence: 0.6 });
            Memory.thinkAloud(pet, "sleepy_pat", "Stirred softly under gentle pats");
            if (pet.emitEmote) pet.emitEmote("heart", true);
            pet.enterState(SpeciesProfile.wakeStateFor(pet));
            break;
        }

        pet.socialDrive = Math.max(0, pet.socialDrive - 0.36);
        Drives.happier(pet, 0.14);
        Drives.shiftTrust(pet, 0.032);
        pet.mood = Drives.clamp01(pet.mood + 0.22);
        pet.playDrive = Drives.clamp01(pet.playDrive + 0.06);
        Drives.stimulate(pet, 0.08);
        Memory.recordPlaceAffect(pet, 0.45);
        var cls = pet.windowTracker ? pet.windowTracker.activeWindowClass : "";
        if (cls) Memory.recordWindowPref(pet, cls, 0.09);
        Memory.recordEpisode(pet, type, { valence: 0.65, salience: 0.65, windowClass: cls });
        pet.recentDrift = Personality.shiftRecent(pet.recentDrift, "sociability", 0.01);
        Memory.thinkAloud(pet, "petted", "Leaning into warm headpats", { minGapMs: 8000 });
        if (pet.emitEmote) pet.emitEmote("heart", true);
        if (!resting && pet.state_ !== "sitNorth") {
            var aff = SpeciesProfile.affectionGesturesFor(pet);
            if (p.playfulness > 0.68) aff = aff.concat(["hop"]);
            pet.enterState(_pick(pet, aff));
        }
        break;
    }

    case "clicked": {
        if (Plans.resolveBidSuccess(pet, nav, _pick)) break;

        pet._pokeTimestamps = (pet._pokeTimestamps || []).filter(function(t) { return now - t < 6000; });
        pet._pokeTimestamps.push(now);
        if (pet._pokeTimestamps.length >= (3 + Math.round(p.patience * 3))) {
            pet.mood = Math.max(0, pet.mood - 0.08);
            Drives.shiftTrust(pet, -0.015);
            Memory.recordEpisode(pet, "annoyed", { valence: -0.35, note: "over-poked" });
            Memory.thinkAloud(pet, "overpoked", "Annoyed by repeated poking", { minGapMs: 4000 });
            if (pet.emitEmote) pet.emitEmote("frustrated", true);
            Plans.clearPlan(pet);
            if (!resting) pet.enterState(_pick(pet, ["cringe", "pain", "attack"]));
            else pet.enterState(SpeciesProfile.wakeStateFor(pet));
            break;
        }

        if (resting) {
            Memory.thinkAloud(pet, "woken_poke", "Stretched awake when nudged");
            if (pet.emitEmote) pet.emitEmote("question", true);
            pet.enterState(SpeciesProfile.wakeStateFor(pet));
            break;
        }

        Drives.stimulate(pet, 0.08);
        if (pet.inputTracker && pet.inputTracker.cursorKnown) {
            _faceGlobal(pet, pet.inputTracker.cursorX, pet.inputTracker.cursorY);
        }
        if (trust > 0.35 || p.sociability > 0.45) {
            Drives.happier(pet, 0.04);
            Drives.shiftTrust(pet, 0.01);
            if (pet.emitEmote && pet.mood > 0.55) pet.emitEmote("note", true);
            pet.enterState(_pick(pet, SpeciesProfile.affectionGesturesFor(pet)));
        } else {
            if (pet.emitEmote) pet.emitEmote("question", true);
            pet.enterState(_pick(pet, ["cringe", "nod"]));
        }
        break;
    }

    case "fed": {
        Plans.resolveBidSuccess(pet, nav, _pick);
        pet.satiety = Drives.clamp01((pet.satiety === undefined ? 0.5 : pet.satiety) + 0.45);
        pet.restDrive = Math.max(0, pet.restDrive - 0.12);
        pet.alertness = Drives.clamp01(pet.alertness + 0.12);
        Drives.happier(pet, 0.20);
        Drives.shiftTrust(pet, 0.045);
        pet.mood = Drives.clamp01(pet.mood + 0.28);
        Memory.recordPlaceAffect(pet, 0.55);
        Memory.recordEpisode(pet, "fed_snack", { valence: 0.8, salience: 0.78 });
        pet.lastDiscovery = "a berry snack";
        pet.lastDiscoveryTime = now;
        Memory.thinkAloud(pet, "fed", "Happily eating a berry snack", { minGapMs: 3000 });
        if (pet.emitEmote) pet.emitEmote("berry", true);
        Plans.clearPlan(pet);
        pet.enterState("eat");
        break;
    }

    case "play_triggered": {
        Plans.resolveBidSuccess(pet, nav, _pick);
        Drives.stimulate(pet, 0.20);
        Drives.happier(pet, 0.10);
        Drives.shiftTrust(pet, 0.025);
        pet.mood = Drives.clamp01(pet.mood + 0.18);
        pet.playDrive = Math.max(0, pet.playDrive - 0.25);
        Memory.recordEpisode(pet, "played_solo", { valence: 0.6, salience: 0.6 });
        Memory.thinkAloud(pet, "play_user", "Playing energetically", { minGapMs: 4000 });
        if (pet.emitEmote) pet.emitEmote("note", true);
        Plans.startPlan(pet, {
            name: "play_solo",
            label: "Playtime",
            reason: "Playing with user",
            urgency: 0.80,
            durationMs: 28000,
            steps: [
                { kind: "zoomies", label: "Playful scamper" },
                { kind: "act", label: "Happy leap", states: SpeciesProfile.affectionGesturesFor(pet).concat(["hop"]) },
                { kind: "pant", label: "Catching breath" }
            ]
        }, nav, _pick);
        break;
    }

    case "dropped": {
        var speed = (data && data.speed) || 0;
        var acrobat = Personality.hasQuirk(pet, "sky_acrobat")
                   || (p.boldness > 0.62 && p.playfulness > 0.58 && trust > 0.45);
        if (speed < 360) {
            Drives.shiftTrust(pet, 0.015);
            pet.exploreDrive = Drives.clamp01(pet.exploreDrive + 0.15);
            Memory.thinkAloud(pet, "gentle_drop", "Set down in a new spot", { minGapMs: 8000 });
            pet.enterState(_pick(pet, SpeciesProfile.calmGesturesFor(pet)));
        } else if (acrobat) {
            Drives.happier(pet, 0.08);
            Drives.shiftTrust(pet, 0.02);
            pet.mood = Drives.clamp01(pet.mood + 0.14);
            pet.playDrive = Math.max(0, pet.playDrive - 0.18);
            pet.recentDrift = Personality.shiftRecent(pet.recentDrift, "boldness", 0.01);
            Memory.recordEpisode(pet, "tossed_fun", { valence: 0.65, salience: 0.72 });
            Memory.thinkAloud(pet, "toss_whee", "Landed an acrobatic toss", { minGapMs: 4000 });
            if (pet.emitEmote) pet.emitEmote("note", true);
            pet.enterState(_pick(pet, ["hop", "rotate"]));
        } else {
            pet.mood = Math.max(0, pet.mood - 0.08);
            Drives.shiftTrust(pet, -0.025);
            pet.alertness = Drives.clamp01(pet.alertness + 0.25);
            pet.recentDrift = Personality.shiftRecent(pet.recentDrift, "boldness", -0.008);
            Memory.recordEpisode(pet, "tossed_rough", { valence: -0.5, salience: 0.7 });
            Memory.thinkAloud(pet, "toss_oof", "Dizzy from a fast toss", { minGapMs: 4000 });
            if (pet.emitEmote) pet.emitEmote("exclaim", true);
            pet.enterState(_pick(pet, ["hitGround", "trip", "tumbleBack", "cringe"]));
        }
        break;
    }

    case "perch_lost": {
        Plans.abortPlan(pet, "perch_lost");
        pet.enterState(_pick(pet, ["lostBalance", "hop", "trip"]));
        break;
    }

    case "music_started": {
        if (pet.enableMusicReact === false || resting) break;
        if (_cooldown(pet, "music_started", 90000)) return;
        var melo = Personality.hasQuirk(pet, "melomaniac");
        if (melo || (p.playfulness > 0.58 && Math.random() < 0.45)) {
            if (pet.emitEmote) pet.emitEmote("note");
            Memory.thinkAloud(pet, "music_start", "Ears perked up at music", { minGapMs: 60000 });
            if (pet.state_ === "idle") pet.enterState(_pick(pet, SpeciesProfile.affectionGesturesFor(pet)));
        }
        break;
    }

    case "window_opened": {
        if (_cooldown(pet, "window_opened", 60000)) return;
        Drives.stimulate(pet, 0.03 + p.curiosity * 0.05);
        var oPerc = Perception.perceive(pet);
        if (!resting && pet.state_ === "idle" && oPerc.win && !oPerc.fullscreen) {
            if (nav && p.curiosity > 0.52 && pet.alertness > 0.36 && Math.random() < 0.28 + p.curiosity * 0.35) {
                Plans.startPlan(pet, Plans.buildInspectWindowPlan(oPerc, pet), nav, _pick);
                break;
            }
            pet.attentionGX = oPerc.win.gx;
            pet.attentionGY = oPerc.win.gy;
            pet.attentionUntil = now + 7000;
            _faceGlobal(pet, oPerc.win.gx, oPerc.win.gy);
        }
        break;
    }

    case "window_focused":
        Drives.stimulate(pet, p.curiosity * 0.02);
        if (!resting && pet.state_ === "idle" && pet.windowTracker && pet.windowTracker.activeWindowPos && Math.random() < p.curiosity * 0.4) {
            var fwp = pet.windowTracker.activeWindowPos;
            pet.attentionGX = fwp.x + fwp.w * 0.5;
            pet.attentionGY = fwp.y + fwp.h * 0.5;
            pet.attentionUntil = now + 5500;
        }
        break;

    case "window_urgent": {
        if (resting || _cooldown(pet, "window_urgent", 90000)) return;
        if ((pet.bond || 0.3) > 0.28 && data) {
            Drives.stimulate(pet, 0.08);
            pet.attentionGX = data.gx || 0;
            pet.attentionGY = data.gy || 0;
            pet.attentionUntil = now + 9000;
            _faceGlobal(pet, pet.attentionGX, pet.attentionGY);
            if (pet.emitEmote) pet.emitEmote("exclaim");
            Memory.thinkAloud(pet, "urgent_win", "Perked up at an alert in " + (data.windowClass || "a window"), { minGapMs: 60000 });
        }
        break;
    }

    case "workspace_changed":
        if (pet.state_ === "perch" || pet.state_ === "sitNorth") {
            Plans.abortPlan(pet, "perch_lost");
            pet.enterState("idle");
            break;
        }
        Drives.stimulate(pet, 0.03 + p.boldness * 0.04);
        break;

    case "user_idle": {
        var liveliness = p.energy * 0.5 + p.curiosity * 0.3 + p.playfulness * 0.2 - p.sleepiness * 0.25;
        if (liveliness < 0.42) {
            pet.restDrive = Drives.clamp01(pet.restDrive + 0.14);
            Memory.thinkAloud(pet, "user_away_nap", "Loafing quietly while the desktop is still");
            if (!resting && Math.random() < 0.72) pet.enterState("loaf");
        } else {
            pet.exploreDrive = Drives.clamp01(pet.exploreDrive + 0.10 + p.curiosity * 0.08);
            Memory.thinkAloud(pet, "user_away_roam", "Exploring the quiet desktop");
        }
        break;
    }

    case "user_active": {
        if (_cooldown(pet, "user_active", 90000)) return;
        Drives.stimulate(pet, 0.08 + p.sociability * 0.08);
        pet.socialDrive = Drives.clamp01(pet.socialDrive + p.sociability * 0.12);
        if ((pet.bond || 0.3) > 0.65) {
            Memory.thinkAloud(pet, "user_back", "Perked up when user returned", { minGapMs: 90000 });
            if (pet.emitEmote) pet.emitEmote("heart");
        }
        if (loafing && Math.random() < 0.30 + p.sociability * 0.35) {
            pet.enterState(SpeciesProfile.wakeStateFor(pet));
        }
        break;
    }

    case "pet_greet": {
        var fromG = data.fromPet;
        Memory.adjustRelation(pet, fromG.petData.name, 0.010, 0.06);
        Memory.recordEpisode(pet, "greeted", { valence: 0.25, withPet: fromG.petData.name });
        pet.mood = Drives.clamp01(pet.mood + 0.04);
        pet.socialDrive = Math.max(0, pet.socialDrive - 0.12);
        if (!resting && pet.state_ === "idle") {
            _faceGlobal(pet, fromG.screenX() + fromG.worldX, fromG.screenY() + fromG.worldY);
            pet.enterState(_pick(pet, SpeciesProfile.greetGesturesFor(pet)));
        }
        break;
    }

    case "pet_story": {
        var fromSt = data.fromPet;
        Memory.adjustRelation(pet, fromSt.petData.name, 0.014, 0.06);
        pet.mood = Drives.clamp01(pet.mood + 0.05);
        pet.exploreDrive = Drives.clamp01(pet.exploreDrive + 0.10 * p.curiosity);
        Memory.thinkAloud(pet, "heard_story", "Sniffed curiously with " + fromSt.petData.name);
        if (!resting && pet.state_ === "idle") {
            _faceGlobal(pet, fromSt.screenX() + fromSt.worldX, fromSt.screenY() + fromSt.worldY);
            pet.enterState(_pick(pet, SpeciesProfile.greetGesturesFor(pet)));
        }
        break;
    }

    case "pet_groove": {
        var fromM = data.fromPet;
        var relM = Memory.relationWith(pet, fromM.petData.name, fromM.personality);
        if (!resting && relM.affinity > 0.38 && (p.playfulness > 0.35 || Personality.hasQuirk(pet, "melomaniac"))) {
            Memory.adjustRelation(pet, fromM.petData.name, 0.014, 0.05, "play");
            Memory.recordEpisode(pet, "music_groove", { valence: 0.45, music: true, withPet: fromM.petData.name });
            Plans.startPlan(pet, {
                name: "music_groove",
                label: "Listening Together",
                reason: "Swaying to music with " + fromM.petData.name,
                otherName: fromM.petData.name,
                urgency: 0.6,
                durationMs: 30000,
                steps: [
                    { kind: "act", label: "Swaying together", states: SpeciesProfile.affectionGesturesFor(pet), faceOther: true, emote: "note" }
                ]
            }, nav, _pick);
        }
        break;
    }

    case "pet_play_bid": {
        var fromPb = data.fromPet;
        var isRetry = !!(data && data.retry);
        var relPb = Memory.relationWith(pet, fromPb.petData.name, fromPb.personality, fromPb.petData.sprite);
        var myStylePb = SpeciesProfile.socialStyleOf(pet);
        var willingness = relPb.affinity * 0.52
                        + p.playfulness * 0.30
                        + p.sociability * 0.16
                        + pet.playDrive * 0.20
                        + (pet.mood - 0.5) * 0.16
                        - (pet.state_ === "deepsleep" ? 0.65 : loafing ? 0.26 : 0)
                        - p.sleepiness * 0.14
                        - (myStylePb === "parallel" && p.playfulness < 0.45 ? 0.12 : 0)
                        + (isRetry && p.patience > 0.58 && relPb.affinity > 0.36 ? 0.18 : 0)
                        - (isRetry && p.patience < 0.44 ? 0.22 : 0);

        var shouldRebuff = pet.state_ !== "deepsleep"
                        && (relPb.affinity < 0.28
                            || (relPb.affinity < 0.38 && p.patience < 0.30)
                            || (isRetry && p.patience < 0.42)
                            || (loafing && p.patience < 0.34));

        if (willingness >= 0.50 && !shouldRebuff && pet.state_ !== "deepsleep" && nav) {
            var mode = Social.preferredPlayMode(fromPb, pet);
            if (fromPb.activePlan) {
                fromPb.activePlan.bidOutcome = "accepted";
                fromPb.activePlan.bidPlayMode = mode;
            }
            Social.markPeerBout(pet, mode);
            Memory.adjustRelation(pet, fromPb.petData.name, isRetry ? 0.024 : 0.016, 0.06, mode === "spar" ? "spar" : "play", { outcome: mode });
            Memory.recordEpisode(pet, mode === "spar" ? "sparred" : "played_with", { valence: 0.46, withPet: fromPb.petData.name });
            pet.playDrive = Math.max(0, pet.playDrive - 0.18);
            pet.mood = Drives.clamp01(pet.mood + 0.06);
            if (mode === "spar") {
                Plans.startPlan(pet, Plans.buildSparPartnerPlan(pet, fromPb), nav, _pick);
            } else if (mode === "duet") {
                Plans.startPlan(pet, Plans.buildSyncDancePlan(pet, fromPb.petData.name), nav, _pick);
            } else {
                Plans.clearPlan(pet);
                _faceGlobal(pet, fromPb.screenX() + fromPb.worldX, fromPb.screenY() + fromPb.worldY);
                pet.enterState(_pick(pet, ["hop", "nod"]));
            }
        } else if (shouldRebuff) {
            if (fromPb.activePlan) fromPb.activePlan.bidOutcome = "rebuffed";
            Social.rebuff(pet, fromPb);
            Plans.clearPlan(pet);
            if (loafing) {
                pet.enterState(SpeciesProfile.wakeStateFor(pet));
            } else {
                _faceGlobal(pet, fromPb.screenX() + fromPb.worldX, fromPb.screenY() + fromPb.worldY);
                pet.enterState(_pick(pet, SpeciesProfile.standoffMovesFor(pet)));
            }
        } else {
            if (fromPb.activePlan) fromPb.activePlan.bidOutcome = "ignored";
            Memory.adjustRelation(pet, fromPb.petData.name, -0.004, 0.02, null, { outcome: "ignored" });
            Memory.thinkAloud(pet, "cold_shoulder", "Gave " + fromPb.petData.name + "'s play invitation the cold shoulder");
            if (!resting && nav) {
                Plans.startPlan(pet, {
                    name: "cold_shoulder",
                    label: "Aloof Turn",
                    reason: "Not in the mood to play with " + fromPb.petData.name,
                    otherName: fromPb.petData.name,
                    urgency: 0.55,
                    durationMs: 12000,
                    steps: [
                        { kind: "face_away", otherName: fromPb.petData.name, label: "Turning away aloofly" }
                    ]
                }, nav, _pick);
            }
        }
        break;
    }

    case "pet_spar_challenge": {
        var fromCh = data.fromPet;
        var relCh = Memory.relationWith(pet, fromCh.petData.name, fromCh.personality, fromCh.petData.sprite);
        var myStyleCh = SpeciesProfile.socialStyleOf(pet);
        var sparAcceptScore = relCh.affinity * 0.36 + relCh.respect * 0.22
                            + p.boldness * 0.30 + p.playfulness * 0.26
                            + (myStyleCh === "brawler" ? 0.18 : 0)
                            - (resting ? 0.45 : 0);
        if (sparAcceptScore >= 0.52 && !resting && nav) {
            if (fromCh.activePlan) fromCh.activePlan.sparAccepted = true;
            Social.markPeerBout(pet, "spar");
            Plans.startPlan(pet, Plans.buildSparPartnerPlan(pet, fromCh), nav, _pick);
        } else if (p.boldness < 0.34 && !resting && nav) {
            if (fromCh.activePlan) fromCh.activePlan.sparAccepted = false;
            Memory.adjustRelation(pet, fromCh.petData.name, -0.015, 0.03, "friction", { outcome: "ignored" });
            Memory.thinkAloud(pet, "shy_spar", "Backed away shyly from " + fromCh.petData.name + "'s sparring stance");
            Plans.clearPlan(pet);
            pet.gait = "scamper";
            nav.fleeFrom(pet, fromCh.screenX() + fromCh.worldX, fromCh.screenY() + fromCh.worldY, 175);
        } else {
            if (fromCh.activePlan) fromCh.activePlan.sparAccepted = false;
            if (relCh.affinity < 0.34 || p.patience < 0.35) {
                Social.rebuff(pet, fromCh);
            }
            if (!resting && nav) {
                Plans.startPlan(pet, {
                    name: "cold_shoulder",
                    label: "Declining Spar",
                    otherName: fromCh.petData.name,
                    durationMs: 12000,
                    steps: [{ kind: "face_away", otherName: fromCh.petData.name, label: "Turning away" }]
                }, nav, _pick);
            }
        }
        break;
    }

    case "pet_spar_hit": {
        var fromSh = data.fromPet;
        Memory.adjustRelation(pet, fromSh.petData.name, 0.016, 0.06, "spar", { respectDelta: 0.04, outcome: "spar" });
        Memory.recordEpisode(pet, "sparred", { valence: 0.48, salience: 0.65, withPet: fromSh.petData.name });
        pet.playDrive = Math.max(0, pet.playDrive - 0.20);
        pet.mood = Drives.clamp01(pet.mood + 0.06);
        Drives.happier(pet, 0.025);
        break;
    }

    case "pet_invite":
    case "pet_chase": {
        var fromI = data.fromPet;
        var rel = Memory.relationWith(pet, fromI.petData.name, fromI.personality, fromI.petData.sprite);
        Drives.eventful(pet, 0.3);
        if (rel.affinity > 0.34 && pet.alertness > 0.24 && !resting && pet.playDrive > 0.12) {
            Social.markPeerBout(pet, "chase");
            Memory.adjustRelation(pet, fromI.petData.name, 0.014, 0.05, "play", { outcome: "tag" });
            Memory.recordEpisode(pet, type === "pet_chase" ? "chase_bout" : "played_with", {
                valence: 0.45,
                withPet: fromI.petData.name
            });
            pet.playDrive = Math.max(0, pet.playDrive - 0.14);
            pet.mood = Drives.clamp01(pet.mood + 0.06);
            if (type === "pet_chase" && nav) {
                Plans.startPlan(pet, Plans.buildFleeTagPlan(pet, fromI, true), nav, _pick);
            } else {
                _faceGlobal(pet, fromI.screenX() + fromI.worldX, fromI.screenY() + fromI.worldY);
                pet.enterState(_pick(pet, SpeciesProfile.greetGesturesFor(pet).concat(["hop"])));
            }
        } else {
            if (fromI.activePlan) fromI.activePlan.chaseRejected = true;
            if (rel.affinity < 0.32 || p.patience < 0.28) {
                Social.rebuff(pet, fromI);
            } else {
                Memory.adjustRelation(pet, fromI.petData.name, -0.008, 0.02, "friction");
                if (!resting && nav) {
                    Plans.startPlan(pet, {
                        name: "cold_shoulder",
                        label: "Ignoring Tag",
                        otherName: fromI.petData.name,
                        durationMs: 10000,
                        steps: [{ kind: "face_away", otherName: fromI.petData.name, label: "Turning away" }]
                    }, nav, _pick);
                }
            }
        }
        break;
    }

    case "pet_reverse_chase": {
        var fromRev = data.fromPet;
        if (!resting && nav) {
            Memory.adjustRelation(pet, fromRev.petData.name, 0.014, 0.04, "play", { outcome: "tag" });
            Plans.startPlan(pet, Plans.buildReverseFleePlan(pet, fromRev), nav, _pick);
        }
        break;
    }

    case "pet_show_off": {
        var fromShow = data.fromPet;
        if (resting) break;
        var relShow = Memory.relationWith(pet, fromShow.petData.name, fromShow.personality, fromShow.petData.sprite);
        if (relShow.affinity >= 0.50 && p.playfulness > 0.44 && pet.playDrive > 0.18 && nav) {
            Social.markPeerBout(pet, "duet");
            Memory.adjustRelation(pet, fromShow.petData.name, 0.016, 0.05, "play", { outcome: "duet" });
            Plans.startPlan(pet, Plans.buildSyncDancePlan(pet, fromShow.petData.name), nav, _pick);
        } else if (relShow.affinity < 0.36 && nav) {
            Memory.adjustRelation(pet, fromShow.petData.name, -0.006, 0.02, null, {
                respectDelta: fromShow.personality.boldness > 0.6 ? 0.01 : -0.01
            });
            Memory.thinkAloud(pet, "unimpressed", "Looked away unimpressed by " + fromShow.petData.name);
            Plans.startPlan(pet, {
                name: "cold_shoulder",
                label: "Unimpressed",
                otherName: fromShow.petData.name,
                durationMs: 10000,
                steps: [{ kind: "face_away", otherName: fromShow.petData.name, label: "Looking away" }]
            }, nav, _pick);
        } else if (p.boldness < 0.26 && pet.state_ === "idle") {
            pet.enterState(_pick(pet, ["hop", "cringe"]));
        } else if (pet.state_ === "idle") {
            Memory.adjustRelation(pet, fromShow.petData.name, 0.008, 0.03);
            _faceGlobal(pet, fromShow.screenX() + fromShow.worldX, fromShow.screenY() + fromShow.worldY);
            pet.enterState(_pick(pet, SpeciesProfile.greetGesturesFor(pet)));
        }
        break;
    }

    case "pet_squabble": {
        var fromSq = data.fromPet;
        Social.markPeerBout(pet, "squabble");
        Memory.adjustRelation(pet, fromSq.petData.name, -0.026, 0.04, "friction", {
            respectDelta: p.boldness > 0.52 ? 0.015 : -0.01,
            outcome: "squabble"
        });
        Memory.recordEpisode(pet, "squabbled", { valence: -0.36, salience: 0.58, withPet: fromSq.petData.name });
        pet.mood = Math.max(0, pet.mood - 0.05);
        if (p.boldness >= 0.48 && p.patience < 0.62 && !resting && nav) {
            if (pet.emitEmote) pet.emitEmote("frustrated");
            Plans.startPlan(pet, Plans.buildSquabbleReplyPlan(pet, fromSq), nav, _pick);
        } else if (nav) {
            Plans.clearPlan(pet);
            if (resting) pet.enterState(SpeciesProfile.wakeStateFor(pet));
            else nav.fleeFrom(pet, fromSq.screenX() + fromSq.worldX, fromSq.screenY() + fromSq.worldY, 185);
        }
        break;
    }

    case "pet_mediated": {
        var peacekeeper = data.fromPet;
        var otherSq = data.otherSquabbler;
        Memory.adjustRelation(pet, peacekeeper.petData.name, 0.012, 0.04, null, { respectDelta: 0.06, outcome: "greet" });
        if (otherSq) Memory.adjustRelation(pet, otherSq.petData.name, 0.008, 0.01);
        Memory.thinkAloud(pet, "calmed_by", "Cooled down when " + peacekeeper.petData.name + " stepped in");
        if (nav) {
            var sepTarget = otherSq ? otherSq.petData.name : peacekeeper.petData.name;
            Plans.startPlan(pet, {
                name: "cooled_off",
                label: "Cooling Off",
                otherName: sepTarget,
                urgency: 0.68,
                durationMs: 22000,
                steps: [
                    { kind: "act", label: "Cooling down", states: ["nod"] },
                    { kind: "wander_apart", otherName: sepTarget, dist: 175, gait: "amble", label: "Giving space" }
                ]
            }, nav, _pick);
        }
        break;
    }

    case "pet_group_squabble": {
        if (resting || Plans.hasActivePlan(pet) || !nav) break;
        var gStyle = SpeciesProfile.socialStyleOf(pet);
        if ((gStyle === "guardian" || (p.composure >= 0.60 && p.boldness >= 0.50)) && data.secondPet) {
            Social.markPeerBout(pet, "mediate");
            Plans.startPlan(pet, Plans.buildPeacekeeperPlan(pet, data.fromPet, data.secondPet), nav, _pick);
        } else if (p.boldness < 0.32) {
            nav.fleeFrom(pet, data.fromPet.screenX() + data.fromPet.worldX, data.fromPet.screenY() + data.fromPet.worldY, 165);
        }
        break;
    }

    case "pet_group_chase":
    case "pet_group_duet": {
        if (resting || Plans.hasActivePlan(pet) || !nav) break;
        if (p.playfulness >= 0.56 && pet.playDrive >= 0.28 && pet.alertness >= 0.38
                && !_cooldown(pet, "pack_rally", 240000)) {
            Social.markPeerBout(pet, "chase");
            Plans.startPlan(pet, Plans.buildPackRallyPlan(pet, data.fromPet), nav, _pick);
        }
        break;
    }

    case "pet_group_spar": {
        if (resting || Plans.hasActivePlan(pet) || !nav) break;
        if ((p.curiosity >= 0.45 || p.patience >= 0.50) && !_cooldown(pet, "spectate", 180000)) {
            Plans.startPlan(pet, Plans.buildSpectatePlan(pet, data.fromPet), nav, _pick);
        }
        break;
    }

    case "pet_cuddle": {
        var fromC = data.fromPet;
        var relC = Memory.relationWith(pet, fromC.petData.name, fromC.personality);
        Memory.adjustRelation(pet, fromC.petData.name, relC.affinity < 0.4 ? 0.025 : 0.016, 0.05, "nap");
        Memory.recordEpisode(pet, "rested_with", { valence: 0.4, withPet: fromC.petData.name });
        pet.mood = Drives.clamp01(pet.mood + 0.04);
        if (pet.emitEmote) pet.emitEmote("heart");
        break;
    }

    case "pet_pounce": {
        var fromB = data.fromPet;
        var relB = Memory.relationWith(pet, fromB.petData.name, fromB.personality);
        Drives.eventful(pet, 0.3);
        var fgx = fromB.screenX() + fromB.worldX, fgy = fromB.screenY() + fromB.worldY;
        var takesItWell = relB.affinity * 0.5 + p.playfulness * 0.35 + p.patience * 0.22 + p.composure * 0.15
                        + pet.mood * 0.15 - (pet.state_ === "deepsleep" ? 0.52 : resting ? 0.32 : 0);
        if (takesItWell > 0.58) {
            Social.sparBack(pet, fromB);
            Drives.stimulate(pet, 0.15);
            Plans.clearPlan(pet);
            _faceGlobal(pet, fgx, fgy);
            pet.enterState(_pick(pet, _attackPool(pet).concat(["hop", "tumble"])));
        } else if (takesItWell < 0.38) {
            Social.rebuff(pet, fromB);
            Plans.clearPlan(pet);
            if (resting) pet.enterState(SpeciesProfile.wakeStateFor(pet));
            else if (p.boldness < 0.3 && nav) nav.fleeFrom(pet, fgx, fgy, 160 + Math.random() * 100);
            else pet.enterState(_pick(pet, ["pain", "cringe", "attack"]));
        } else {
            Memory.adjustRelation(pet, fromB.petData.name, 0.003, 0.03);
            Plans.clearPlan(pet);
            if (resting) pet.enterState(SpeciesProfile.wakeStateFor(pet));
            else pet.enterState(_pick(pet, ["startle", "trip", "tumbleBack", "hitGround"]));
        }
        break;
    }

    case "pet_spar": {
        var fromS = data.fromPet;
        Memory.adjustRelation(pet, fromS.petData.name, 0.014, 0.05, "play");
        Memory.recordEpisode(pet, "sparred", { valence: 0.45, withPet: fromS.petData.name });
        pet.mood = Drives.clamp01(pet.mood + 0.05);
        Drives.happier(pet, 0.02);
        if (pet.state_ === "idle") pet.enterState(_pick(pet, _attackPool(pet).concat(["hop"])));
        break;
    }

    case "pet_rebuff":
    case "pet_annoy": {
        var fromR = data.fromPet;
        Memory.adjustRelation(pet, fromR.petData.name, -0.015, 0.025, "friction", { outcome: "rebuffed" });
        Memory.recordEpisode(pet, "rebuffed", { valence: -0.35, withPet: fromR.petData.name });
        pet.mood = Math.max(0, pet.mood - 0.04);
        var activeName = pet.activePlan ? pet.activePlan.name : "";
        if (activeName === "invite_play" || activeName === "spar_bout" || activeName === "play_tag") {
            break;
        }
        if (nav && !resting) {
            Plans.startPlan(pet, {
                name: "backed_off",
                label: "Giving Space",
                otherName: fromR.petData.name,
                urgency: 0.62,
                durationMs: 18000,
                steps: [
                    { kind: "act", label: "Startled back", states: ["cringe", "nod"] },
                    { kind: "wander_apart", dist: 155, gait: "trot", label: "Stepping away" }
                ]
            }, nav, _pick);
        } else {
            Plans.clearPlan(pet);
            if (pet.state_ === "idle") pet.enterState(_pick(pet, ["cringe", "nod"]));
        }
        break;
    }

    case "pet_illusion": {
        var fromIl = data.fromPet;
        Memory.adjustRelation(pet, fromIl.petData.name, 0.012, 0.05, "play");
        Memory.recordEpisode(pet, "greeted", { valence: 0.35, withPet: fromIl.petData.name, note: "illusion" });
        Memory.thinkAloud(pet, "saw_illusion", "Did a double-take at " + fromIl.petData.name + "'s Illusion");
        if (!resting) {
            _faceGlobal(pet, fromIl.screenX() + fromIl.worldX, fromIl.screenY() + fromIl.worldY);
            if (pet.emitEmote) pet.emitEmote("question");
            if (pet.state_ === "idle") pet.enterState(_pick(pet, ["nod", "hop"]));
        }
        break;
    }
    }
}

var _SECTOR_TO_ROW = [2, 1, 0, 7, 6, 5, 4, 3];

function _angleToRow(angle) {
    var a = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return _SECTOR_TO_ROW[Math.round(a / (Math.PI / 4)) % 8];
}

function ambientGlanceRow(pet, currentRow) {
    var cur = (currentRow >= 0 && currentRow <= 7) ? currentRow : 1;
    var perc = Perception.perceive(pet);

    if (pet.state_ === "perch") {
        if (perc.cursor.onMyScreen && perc.cursor.active && perc.cursor.gy >= perc.petGY - 20 && perc.cursor.dist < 560) {
            var perchCursorRow = _angleToRow(Math.atan2(Math.max(12, perc.cursor.gy - perc.petGY), perc.cursor.gx - perc.petGX));
            if (perchCursorRow <= 2 || perchCursorRow >= 6) return perchCursorRow;
        }
        var ledgeRows = [0, 1, 7, 1, 7, 2, 6];
        return ledgeRows[Math.floor(Math.random() * ledgeRows.length)];
    }

    if (perc.cursor.onMyScreen && perc.cursor.active && perc.cursor.speed > 75 && perc.cursor.dist < 560 && Math.random() < 0.55) {
        return _angleToRow(Math.atan2(perc.cursor.gy - perc.petGY, perc.cursor.gx - perc.petGX));
    }
    if (perc.nearest && perc.nearest.sameScreen && perc.nearest.dist < 140) {
        if (Math.random() < (perc.nearest.affinity < 0.40 ? 0.72 : 0.45)) {
            var awayPeer = Math.atan2(perc.petGY - perc.nearest.gy, perc.petGX - perc.nearest.gx) + (Math.random() - 0.5) * 0.9;
            return _angleToRow(awayPeer);
        }
    } else if (perc.nearest && perc.nearest.sameScreen && perc.nearest.dist < 480 && perc.nearest.affinity >= 0.38) {
        if (perc.nearest.attending && Math.random() < 0.18) {
            return _angleToRow(Math.atan2(perc.nearest.attentionGY - perc.petGY, perc.nearest.attentionGX - perc.petGX));
        }
        if (Math.random() < 0.12) {
            return _angleToRow(Math.atan2(perc.nearest.gy - perc.petGY, perc.nearest.gx - perc.petGX));
        }
    }
    if (perc.cursor.onMyScreen && perc.cursor.active && perc.cursor.dist < 500 && Math.random() < 0.28) {
        return _angleToRow(Math.atan2(perc.cursor.gy - perc.petGY, perc.cursor.gx - perc.petGX));
    }
    if (perc.win && perc.win.onMyScreen && Math.random() < 0.24) {
        return _angleToRow(Math.atan2(perc.win.gy - perc.petGY, perc.win.gx - perc.petGX));
    }

    var cozyRows = [7, 1, 7, 1, 6, 2, 0, 5, 3];
    var target = cozyRows[Math.floor(Math.random() * cozyRows.length)];
    if (target === cur) {
        target = cur === 0 ? (Math.random() < 0.5 ? 1 : 7) : ((cur + (Math.random() < 0.5 ? 1 : 7)) % 8);
    }
    var diff = ((target - cur + 12) % 8) - 4;
    if (Math.abs(diff) > 2) {
        return (cur + (diff > 0 ? 2 : 6)) % 8;
    }
    return target;
}

function fidget(pet) {
    var p = pet.personality;
    if (Math.random() < 0.38 + p.patience * 0.14 + (1 - pet.alertness) * 0.14) return null;
    var animData = pet.sprite ? pet.sprite._animData : null;
    if (!animData) return null;

    var calm = SpeciesProfile.calmGesturesFor(pet);
    var defaultMap = pet.sprite.defaultMap || {};
    var actionMap = pet.sprite.actionMap || {};
    var pool = [];

    for (var i = 0; i < calm.length; i++) {
        var anim = actionMap[calm[i]] || defaultMap[calm[i]];
        if (anim && animData[anim]) {
            pool.push(calm[i], calm[i], calm[i], calm[i]);
        }
    }
    var rotAnim = actionMap.rotate || defaultMap.rotate;
    if (rotAnim && animData[rotAnim]) {
        pool.push("rotate");
    }
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
}

function idleMicroAction(pet) {
    var p = pet.personality;
    var perc = Perception.perceive(pet);
    if (pet.state_ === "idle" && perc.nearest && perc.nearest.sameScreen
            && (perc.nearest.dist < 115 || (perc.nearest.dist < 190 && perc.nearest.affinity < 0.38))
            && Math.random() < 0.58) {
        var away = Math.atan2(perc.petGY - perc.nearest.gy, perc.petGX - perc.nearest.gx) + (Math.random() - 0.5) * 1.0;
        return {
            kind: "potter",
            angle: away,
            durationMs: Math.round(1150 + Math.random() * 1200)
        };
    }

    if (pet.state_ === "idle" && (p.sleepiness > 0.58 || pet.restDrive > 0.42) && Math.random() < 0.14) {
        return { kind: "loaf" };
    }

    if (pet.state_ === "idle" && pet.alertness > 0.22 && Math.random() < 0.26) {
        var sw = pet.screenW ? pet.screenW() : 1920;
        var sh = pet.screenH ? pet.screenH() : 1080;
        var cx = sw * 0.5, cy = sh * 0.55;
        var wx = pet.worldX || 0, wy = pet.worldY || 0;
        var margin = 120;
        var angle;
        if (wx < margin || wx > sw - margin || wy < margin || wy > sh - margin) {
            angle = Math.atan2(cy - wy, cx - wx) + (Math.random() - 0.5) * 0.9;
        } else {
            angle = Math.random() * 2 * Math.PI;
        }
        return {
            kind: "potter",
            angle: angle,
            durationMs: Math.round(950 + Math.random() * 1150)
        };
    }

    var state = fidget(pet);
    if (!state) return null;
    return {
        kind: "fidget",
        state: state,
        frontRow: false
    };
}

function _attackPool(pet) {
    var animData = pet.sprite ? pet.sprite._animData : null;
    if (!animData) return ATTACK_STATES.slice();
    var out = [];
    var defaultMap = pet.sprite.defaultMap || {};
    var actionMap = pet.sprite.actionMap || {};
    for (var i = 0; i < ATTACK_STATES.length; i++) {
        var anim = actionMap[ATTACK_STATES[i]] || defaultMap[ATTACK_STATES[i]];
        if (anim && animData[anim]) out.push(ATTACK_STATES[i]);
    }
    return out;
}

function _pick(pet, states) {
    if (!states || states.length === 0) return "idle";
    var animData = pet.sprite ? pet.sprite._animData : null;
    if (animData) {
        var available = [];
        var defaultMap = pet.sprite.defaultMap || {};
        var actionMap = pet.sprite.actionMap || {};
        for (var i = 0; i < states.length; i++) {
            var anim = actionMap[states[i]] || defaultMap[states[i]] || "Walk";
            if (animData[anim]) available.push(states[i]);
        }
        if (available.length > 0) return available[Math.floor(Math.random() * available.length)];
        if (animData.Nod) return "nod";
    }
    return states[Math.floor(Math.random() * states.length)];
}
