.pragma library

.import "../SpeciesProfile.js" as SpeciesProfile
.import "Personality.js" as Personality
.import "Drives.js" as Drives
.import "Memory.js" as Memory
.import "Perception.js" as Perception
.import "Social.js" as Social
.import "Abilities.js" as Abilities
.import "Plans.js" as Plans
.import "Util.js" as Util

function handleSocialEvent(pet, type, data, nav, pickFn, ctx) {
    var p = ctx.p;
    var now = ctx.now;
    var loafing = ctx.loafing;
    var resting = ctx.resting;
    var cooldown = ctx.cooldown;
    var trySocialReference = ctx.trySocialReference;

    switch (type) {
    case "caught_yawn": {
        if ((pet.state_ !== "idle" && pet.state_ !== "wander") || Plans.hasActivePlan(pet) || cooldown(pet, "caught_yawn", 240000)) return true;
        pet.restDrive = Drives.clamp01(pet.restDrive + 0.14);
        var yPerc = Perception.perceive(pet);
        var warmPeerName = (data && data.warmPeerName) || "";
        var warmPeer = warmPeerName ? Util.findPet(pet, warmPeerName) : null;
        var coolState = yPerc.isNight || yPerc.isDusk || yPerc.isRaining || yPerc.isSnowing;
        if (warmPeer && coolState && nav) {
            var wPeerGX = Util.petGX(warmPeer), wPeerGY = Util.petGY(warmPeer);
            var wpDist = Math.hypot(wPeerGX - yPerc.petGX, wPeerGY - yPerc.petGY);
            if (wpDist > 72 && wpDist < 340) {
                var wAng = Math.atan2(yPerc.petGY - wPeerGY, yPerc.petGX - wPeerGX);
                Plans.startPlan(pet, Plans.buildRestWithPlan(
                    pet,
                    warmPeerName,
                    Math.round(Math.cos(wAng) * 68),
                    Math.round(Math.sin(wAng) * 52),
                    true
                ), nav, pickFn);
                return true;
            }
        }
        if (nav) {
            Memory.thinkAloud(pet, "caught_yawn", "Caught a sleepy yawn and curled down", { minGapMs: 120000 });
            Plans.startPlan(pet, Plans.buildRestPlan(pet, yPerc, false, null, false), nav, pickFn);
        }
        return true;
    }

    case "pet_greet": {
        var fromG = data.fromPet;
        Memory.adjustRelation(pet, fromG.petData.name, 0.010, 0.06);
        Memory.recordEpisode(pet, "greeted", { valence: 0.25, withPet: fromG.petData.name });
        pet.mood = Drives.clamp01(pet.mood + 0.04);
        pet.socialDrive = Math.max(0, pet.socialDrive - 0.12);
        if (!resting && pet.state_ === "idle" && !Plans.hasActivePlan(pet)) {
            Util.faceGlobal(pet, Util.petGX(fromG), Util.petGY(fromG));
            pet.enterState(pickFn(pet, SpeciesProfile.greetGesturesFor(pet)));
        }
        return true;
    }

    case "pet_groove": {
        var fromM = data.fromPet;
        var relM = Memory.relationWith(pet, fromM.petData.name, fromM.personality);
        if (!resting && relM.affinity > 0.38 && (p.playfulness > 0.35 || Personality.hasQuirk(pet, "melomaniac"))) {
            Memory.adjustRelation(pet, fromM.petData.name, 0.014, 0.05, "play");
            Memory.recordEpisode(pet, "music_groove", { valence: 0.45, music: true, withPet: fromM.petData.name });
            Plans.startPlan(pet, Plans.buildSharedGroovePlan(pet, fromM.petData.name), nav, pickFn);
        }
        return true;
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
            // For tag, reserve playDrive until the follow-up pet_chase arrives so Pet B doesn't reject the chase!
            pet.playDrive = Math.max(0, pet.playDrive - (mode === "tag" ? 0.04 : 0.18));
            pet.mood = Drives.clamp01(pet.mood + 0.06);
            if (mode === "spar") {
                Plans.startPlan(pet, Plans.buildSparPartnerPlan(pet, fromPb), nav, pickFn);
            } else if (mode === "duet") {
                Plans.startPlan(pet, Plans.buildSyncDancePlan(pet, fromPb.petData.name), nav, pickFn);
            } else {
                Plans.clearPlan(pet);
                Util.faceGlobal(pet, Util.petGX(fromPb), Util.petGY(fromPb));
                pet.enterState(pickFn(pet, ["hop", "nod"]));
            }
        } else if (shouldRebuff) {
            if (fromPb.activePlan) fromPb.activePlan.bidOutcome = "rebuffed";
            Social.rebuff(pet, fromPb);
            Plans.clearPlan(pet);
            if (loafing) {
                pet.enterState(SpeciesProfile.wakeStateFor(pet));
            } else {
                Util.faceGlobal(pet, Util.petGX(fromPb), Util.petGY(fromPb));
                pet.enterState(pickFn(pet, SpeciesProfile.standoffMovesFor(pet)));
            }
        } else {
            if (fromPb.activePlan) fromPb.activePlan.bidOutcome = "ignored";
            Memory.adjustRelation(pet, fromPb.petData.name, -0.004, 0.02, null, { outcome: "ignored" });
            Memory.thinkAloud(pet, "cold_shoulder", "Gave " + fromPb.petData.name + "'s play invitation the cold shoulder");
            if (!resting && nav) {
                Plans.startPlan(pet, Plans.buildColdShoulderPlan(fromPb.petData.name, "Aloof Turn"), nav, pickFn);
            }
        }
        return true;
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
            Plans.startPlan(pet, Plans.buildSparPartnerPlan(pet, fromCh), nav, pickFn);
        } else if (p.boldness < 0.34 && !resting && nav) {
            if (fromCh.activePlan) fromCh.activePlan.sparAccepted = false;
            Memory.adjustRelation(pet, fromCh.petData.name, -0.015, 0.03, "friction", { outcome: "ignored" });
            Memory.thinkAloud(pet, "shy_spar", "Backed away shyly from " + fromCh.petData.name + "'s sparring stance");
            Plans.clearPlan(pet);
            pet.gait = "scamper";
            nav.fleeFrom(pet, Util.petGX(fromCh), Util.petGY(fromCh), 175);
        } else {
            if (fromCh.activePlan) fromCh.activePlan.sparAccepted = false;
            if (relCh.affinity < 0.34 || p.patience < 0.35) {
                Social.rebuff(pet, fromCh);
            }
            if (!resting && nav) {
                Plans.startPlan(pet, Plans.buildColdShoulderPlan(fromCh.petData.name, "Declining Spar"), nav, pickFn);
            }
        }
        return true;
    }

    case "pet_spar_hit": {
        var fromSh = data.fromPet;
        Memory.adjustRelation(pet, fromSh.petData.name, 0.016, 0.06, "spar", { respectDelta: 0.04, outcome: "spar" });
        Memory.recordEpisode(pet, "sparred", { valence: 0.48, salience: 0.65, withPet: fromSh.petData.name });
        pet.playDrive = Math.max(0, pet.playDrive - 0.20);
        pet.mood = Drives.clamp01(pet.mood + 0.06);
        Drives.happier(pet, 0.025);
        return true;
    }

    case "pet_chase": {
        var fromI = data.fromPet;
        var rel = Memory.relationWith(pet, fromI.petData.name, fromI.personality, fromI.petData.sprite);
        Drives.eventful(pet, 0.3);
        if (rel.affinity > 0.34 && pet.alertness > 0.24 && !resting && pet.playDrive > 0.12 && nav) {
            Social.markPeerBout(pet, "chase");
            Memory.adjustRelation(pet, fromI.petData.name, 0.014, 0.05, "play", { outcome: "tag" });
            Memory.recordEpisode(pet, "chase_bout", {
                valence: 0.45,
                withPet: fromI.petData.name
            });
            pet.playDrive = Math.max(0, pet.playDrive - 0.14);
            pet.mood = Drives.clamp01(pet.mood + 0.06);
            Plans.startPlan(pet, Plans.buildFleeTagPlan(pet, fromI, true), nav, pickFn);
        } else {
            if (fromI.activePlan) fromI.activePlan.chaseRejected = true;
            if (rel.affinity < 0.32 || p.patience < 0.28) {
                Social.rebuff(pet, fromI);
            } else {
                Memory.adjustRelation(pet, fromI.petData.name, -0.008, 0.02, "friction");
                if (!resting && nav) {
                    Plans.startPlan(pet, Plans.buildColdShoulderPlan(fromI.petData.name, "Ignoring Tag"), nav, pickFn);
                }
            }
        }
        return true;
    }

    case "pet_reverse_chase": {
        var fromRev = data.fromPet;
        if (!resting && nav) {
            Memory.adjustRelation(pet, fromRev.petData.name, 0.014, 0.04, "play", { outcome: "tag" });
            Plans.startPlan(pet, Plans.buildReverseFleePlan(pet, fromRev), nav, pickFn);
        }
        return true;
    }

    case "pet_show_off": {
        var fromShow = data.fromPet;
        if (resting) return true;
        var relShow = Memory.relationWith(pet, fromShow.petData.name, fromShow.personality, fromShow.petData.sprite);
        if (relShow.affinity >= 0.50 && p.playfulness > 0.44 && pet.playDrive > 0.18 && nav) {
            Social.markPeerBout(pet, "duet");
            Memory.adjustRelation(pet, fromShow.petData.name, 0.016, 0.05, "play", { outcome: "duet" });
            Plans.startPlan(pet, Plans.buildSyncDancePlan(pet, fromShow.petData.name), nav, pickFn);
        } else if (relShow.affinity < 0.36 && nav) {
            Memory.adjustRelation(pet, fromShow.petData.name, -0.006, 0.02, null, {
                respectDelta: fromShow.personality.boldness > 0.6 ? 0.01 : -0.01
            });
            Memory.thinkAloud(pet, "unimpressed", "Looked away unimpressed by " + fromShow.petData.name);
            Plans.startPlan(pet, Plans.buildColdShoulderPlan(fromShow.petData.name, "Unimpressed"), nav, pickFn);
        } else if (p.boldness < 0.26 && pet.state_ === "idle" && !Plans.hasActivePlan(pet)) {
            pet.enterState(pickFn(pet, ["hop", "cringe"]));
        } else if (pet.state_ === "idle" && !Plans.hasActivePlan(pet)) {
            Memory.adjustRelation(pet, fromShow.petData.name, 0.008, 0.03);
            Util.faceGlobal(pet, Util.petGX(fromShow), Util.petGY(fromShow));
            pet.enterState(pickFn(pet, SpeciesProfile.greetGesturesFor(pet)));
        }
        return true;
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
            Plans.startPlan(pet, Plans.buildSquabbleReplyPlan(pet, fromSq), nav, pickFn);
        } else if (nav) {
            Plans.clearPlan(pet);
            if (resting) pet.enterState(SpeciesProfile.wakeStateFor(pet));
            else nav.fleeFrom(pet, Util.petGX(fromSq), Util.petGY(fromSq), 185);
        }
        return true;
    }

    case "pet_mediated": {
        var peacekeeper = data.fromPet;
        var otherSq = data.otherSquabbler;
        Memory.adjustRelation(pet, peacekeeper.petData.name, 0.012, 0.04, null, { respectDelta: 0.06, outcome: "greet" });
        if (otherSq) Memory.adjustRelation(pet, otherSq.petData.name, 0.008, 0.01);
        Memory.thinkAloud(pet, "calmed_by", "Cooled down when " + peacekeeper.petData.name + " stepped in");
        if (nav) {
            var sepTarget = otherSq ? otherSq.petData.name : peacekeeper.petData.name;
            Plans.startPlan(pet, Plans.buildCooledOffPlan(sepTarget), nav, pickFn);
        }
        return true;
    }

    case "pet_group_squabble": {
        if (resting || Plans.hasActivePlan(pet) || !nav) return true;
        if ((Abilities.isNaturalPeacekeeper(pet) || (p.composure >= 0.60 && p.boldness >= 0.50)) && data.secondPet) {
            Social.markPeerBout(pet, "mediate");
            Plans.startPlan(pet, Plans.buildPeacekeeperPlan(pet, data.fromPet, data.secondPet), nav, pickFn);
        } else if (p.boldness < 0.32) {
            Plans.clearPlan(pet);
            nav.fleeFrom(pet, Util.petGX(data.fromPet), Util.petGY(data.fromPet), 165);
        }
        return true;
    }

    case "pet_group_chase":
    case "pet_group_duet": {
        if (resting || Plans.hasActivePlan(pet) || !nav) return true;
        if (p.playfulness >= 0.56 && pet.playDrive >= 0.28 && pet.alertness >= 0.38
                && !cooldown(pet, "pack_rally", 240000)) {
            Social.markPeerBout(pet, "chase");
            Plans.startPlan(pet, Plans.buildPackRallyPlan(pet, data.fromPet), nav, pickFn);
        }
        return true;
    }

    case "pet_group_spar": {
        if (resting || Plans.hasActivePlan(pet) || !nav) return true;
        if ((p.curiosity >= 0.45 || p.patience >= 0.50) && !cooldown(pet, "spectate", 180000)) {
            Plans.startPlan(pet, Plans.buildSpectatePlan(pet, data.fromPet), nav, pickFn);
        }
        return true;
    }

    case "pet_cuddle": {
        var fromC = data.fromPet;
        var relC = Memory.relationWith(pet, fromC.petData.name, fromC.personality);
        Memory.adjustRelation(pet, fromC.petData.name, relC.affinity < 0.4 ? 0.025 : 0.016, 0.05, "nap");
        Memory.recordEpisode(pet, "rested_with", { valence: 0.4, withPet: fromC.petData.name });
        pet.mood = Drives.clamp01(pet.mood + 0.04);
        if (pet.emitEmote) pet.emitEmote("heart");
        return true;
    }

    case "pet_rebuff":
    case "pet_annoy": {
        var fromR = data.fromPet;
        Memory.adjustRelation(pet, fromR.petData.name, -0.015, 0.025, "friction", { outcome: "rebuffed" });
        Memory.recordEpisode(pet, "rebuffed", { valence: -0.35, withPet: fromR.petData.name });
        pet.mood = Math.max(0, pet.mood - 0.04);
        var activeName = pet.activePlan ? pet.activePlan.name : "";
        if (activeName === "invite_play" || activeName === "spar_bout" || activeName === "play_tag") {
            return true;
        }
        if (nav && !resting) {
            Plans.startPlan(pet, Plans.buildBackedOffPlan(fromR.petData.name), nav, pickFn);
        } else {
            Plans.clearPlan(pet);
            if (pet.state_ === "idle") pet.enterState(pickFn(pet, ["cringe", "nod"]));
        }
        return true;
    }

    case "pet_illusion": {
        var fromIl = data.fromPet;
        Memory.adjustRelation(pet, fromIl.petData.name, 0.012, 0.05, "play");
        Memory.recordEpisode(pet, "greeted", { valence: 0.35, withPet: fromIl.petData.name, note: "illusion" });
        Memory.thinkAloud(pet, "saw_illusion", "Did a double-take at " + fromIl.petData.name + "'s Illusion");
        if (!resting) {
            Util.faceGlobal(pet, Util.petGX(fromIl), Util.petGY(fromIl));
            if (pet.emitEmote) pet.emitEmote("question");
            if (pet.state_ === "idle" && !Plans.hasActivePlan(pet)) {
                pet.enterState(pickFn(pet, ["nod", "hop"]));
            }
        }
        return true;
    }

    case "pet_sneak_boop": {
        var fromSb = data.fromPet;
        Memory.adjustRelation(pet, fromSb.petData.name, 0.012, 0.05, "play");
        Memory.recordEpisode(pet, "greeted", { valence: 0.36, withPet: fromSb.petData.name, note: "sneak_boop" });
        Memory.thinkAloud(pet, "booped", "Whirled around after " + fromSb.petData.name + " snuck up from behind");
        if (!resting) {
            Util.faceGlobal(pet, Util.petGX(fromSb), Util.petGY(fromSb));
            if (pet.emitEmote) pet.emitEmote("question");
            if (pet.state_ === "idle" && !Plans.hasActivePlan(pet)) {
                pet.enterState(pickFn(pet, ["hop", "nod"]));
            }
        }
        return true;
    }

    case "pet_mentor_patrol": {
        var fromMp = data.fromPet;
        if (!resting && !Plans.hasActivePlan(pet) && nav) {
            Social.markPeerBout(pet, "greet");
            Plans.startPlan(pet, Plans.buildCopycatTrailPlan(pet, fromMp), nav, pickFn);
        }
        return true;
    }

    case "pet_alarm_ripple": {
        if (pet.state_ === "deepsleep" || cooldown(pet, "alarm_ripple", 45000)) return true;
        var alarmOriginGX = (data && data.gx !== undefined) ? data.gx : Util.petGX(data.fromPet);
        var alarmOriginGY = (data && data.gy !== undefined) ? data.gy : Util.petGY(data.fromPet);
        if (p.boldness < 0.38) {
            if (trySocialReference(pet, pickFn)) return true;
            if (nav) {
                Plans.clearPlan(pet);
                if (loafing) {
                    pet.enterState(SpeciesProfile.wakeStateFor(pet));
                } else {
                    pet.gait = "scamper";
                    Memory.thinkAloud(pet, "flock_bolt", "Bolted instinctively when " + data.fromPet.petData.name + " spooked", { minGapMs: 45000 });
                    nav.fleeFrom(pet, alarmOriginGX, alarmOriginGY, 155);
                }
            }
        } else if ((SpeciesProfile.socialStyleOf(pet) === "guardian" || p.boldness >= 0.66)
                && pet.state_ === "idle" && !Plans.hasActivePlan(pet) && nav) {
            Plans.startPlan(pet, Plans.buildGuardianCheckPlan(pet, alarmOriginGX, alarmOriginGY, data.fromPet.petData.name + "'s startle"), nav, pickFn);
        } else if (!resting && pet.state_ === "idle" && !Plans.hasActivePlan(pet)) {
            pet.attentionGX = Util.petGX(data.fromPet);
            pet.attentionGY = Util.petGY(data.fromPet);
            pet.attentionUntil = now + 4500;
            Util.faceGlobal(pet, pet.attentionGX, pet.attentionGY);
        }
        return true;
    }

    case "pet_friend_lifted": {
        var lifted = data.fromPet;
        if (resting || !lifted || (pet.state_ !== "idle" && pet.state_ !== "perch")) return true;
        pet.attentionGX = Util.petGX(lifted);
        pet.attentionGY = Util.petGY(lifted) - 24;
        pet.attentionUntil = now + 6000;
        Util.faceGlobal(pet, pet.attentionGX, pet.attentionGY);
        if (pet.state_ === "idle" && !Plans.hasActivePlan(pet) && Math.random() < 0.45) {
            pet.enterState(pickFn(pet, ["lookUp", "nod"]));
        }
        return true;
    }

    case "pet_friend_tossed": {
        var tossed = data.fromPet;
        if (resting || !tossed || cooldown(pet, "friend_tossed", 12000)) return true;
        var cleanLand = !!(data && data.cleanLanding);
        Util.faceGlobal(pet, Util.petGX(tossed), Util.petGY(tossed));
        if (p.boldness < 0.34) {
            if (!Plans.hasActivePlan(pet)) {
                Memory.thinkAloud(pet, "toss_worry", "Winced in concern watching " + tossed.petData.name + " fly across the screen", { minGapMs: 25000 });
                pet.enterState(pickFn(pet, ["cringe", "tumbleBack"]));
            }
        } else if (cleanLand && (Personality.hasQuirk(pet, "sky_acrobat") || SpeciesProfile.socialStyleOf(pet) === "brawler" || p.playfulness > 0.56)) {
            if (!Plans.hasActivePlan(pet)) {
                Memory.thinkAloud(pet, "toss_judge_cheer", "Cheered " + tossed.petData.name + "'s clean landing", { minGapMs: 25000 });
                if (pet.emitEmote) pet.emitEmote("exclaim");
                pet.enterState(pickFn(pet, ["hop", "pose"]));
            }
        } else if (!cleanLand && !Plans.hasActivePlan(pet)) {
            pet.enterState(pickFn(pet, ["cringe", "nod"]));
        }
        return true;
    }

    case "pet_peer_pampered": {
        var pampered = data.fromPet;
        if (resting || !pampered || Plans.hasActivePlan(pet) || cooldown(pet, "peer_pampered", 90000)) return true;
        var relPam = Memory.relationWith(pet, pampered.petData.name, pampered.personality, pampered.petData.sprite);
        var effPatP = Drives.effectivePatience(pet);
        if ((Personality.hasQuirk(pet, "velcro_companion") || (p.sociability > 0.56 && (pet.bond || 0.3) > 0.42)) && nav) {
            pet.socialDrive = Drives.clamp01(pet.socialDrive + 0.18);
            var hasCur = !!(pet.inputTracker && pet.inputTracker.cursorKnown);
            var cgxP = hasCur ? pet.inputTracker.cursorX : 0;
            var cgyP = hasCur ? pet.inputTracker.cursorY : 0;
            Plans.startPlan(pet, Plans.buildJealousWedgePlan(pet, pampered, cgxP, cgyP, hasCur), nav, pickFn);
        } else if ((effPatP < 0.36 || relPam.affinity < 0.36) && nav) {
            Memory.thinkAloud(pet, "pamper_sulk", "Turned away aloofly while " + pampered.petData.name + " soaked up attention", { minGapMs: 60000 });
            Plans.startPlan(pet, Plans.buildColdShoulderPlan(pampered.petData.name, "Aloof Sulk"), nav, pickFn);
        }
        return true;
    }

    case "pet_trampled": {
        var runner = data.fromPet;
        if (!resting || !runner) return true;
        Plans.clearPlan(pet);
        var effPatT = Drives.effectivePatience(pet);
        var relTr = Memory.relationWith(pet, runner.petData.name, runner.personality, runner.petData.sprite);
        if (effPatT < 0.46 || relTr.affinity < 0.40) {
            Social.rebuff(pet, runner);
            Util.faceGlobal(pet, Util.petGX(runner), Util.petGY(runner));
            Memory.thinkAloud(pet, "trampled_mad", "Snapped awake after " + runner.petData.name + " barreled right past", { minGapMs: 20000 });
            pet.enterState(pickFn(pet, SpeciesProfile.standoffMovesFor(pet)));
        } else {
            Memory.thinkAloud(pet, "trampled_wake", "Blinked awake as " + runner.petData.name + " scampered past", { minGapMs: 20000 });
            pet.enterState(SpeciesProfile.wakeStateFor(pet));
        }
        return true;
    }

    case "pet_spot_stolen": {
        var thief = data.fromPet;
        if (!thief || resting || cooldown(pet, "spot_stolen", 90000)) return true;
        if (Drives.effectivePatience(pet) < 0.48) {
            Social.annoy(pet, thief);
            Util.faceGlobal(pet, Util.petGX(thief), Util.petGY(thief));
            Memory.thinkAloud(pet, "spot_stolen", "Huffed watching " + thief.petData.name + " curl up in its warm spot", { minGapMs: 45000 });
            if (pet.state_ === "idle" && !Plans.hasActivePlan(pet)) {
                pet.enterState(pickFn(pet, ["pull", "cringe"]));
            }
        }
        return true;
    }
    }

    return false;
}
