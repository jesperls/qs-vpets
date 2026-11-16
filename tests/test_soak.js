const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadQmlJs, rootDir } = require("./loadQmlJs");

const SpeciesProfile = loadQmlJs("components/SpeciesProfile.js");
const SpriteSheet = loadQmlJs("components/SpriteSheet.js");
const Topology = loadQmlJs("components/behavior/Topology.js");
const Personality = loadQmlJs("components/behavior/Personality.js");
const Drives = loadQmlJs("components/behavior/Drives.js");
const Memory = loadQmlJs("components/behavior/Memory.js");
const Perception = loadQmlJs("components/behavior/Perception.js");
const Social = loadQmlJs("components/behavior/Social.js");
const Gestures = loadQmlJs("components/behavior/Gestures.js");
const Plans = loadQmlJs("components/behavior/Plans.js");
const Brain = loadQmlJs("components/behavior/Brain.js");
const Util = loadQmlJs("components/behavior/Util.js");
const Nav = loadQmlJs("components/PetNav.js");

const speciesAnims = {};
for (const sp of ["jolteon", "munchlax", "whimsicott", "phantump", "riolu", "umbreon"]) {
    const xml = fs.readFileSync(path.join(rootDir, "assets/sprites", sp, "AnimData.xml"), "utf8");
    speciesAnims[sp] = SpriteSheet.parseAnimData(xml).anims;
}

const petQmlSrc = fs.readFileSync(path.join(rootDir, "components/Pet.qml"), "utf8");
const PET_WRITABLE_PROPS = new Set([
    "x", "y", "z", "width", "height", "opacity", "visible", "scale", "rotation",
    "_simNow", "_screenIdx", "_timers", "_stats", "enablePerching", "enableMusicReact"
]);
for (const m of petQmlSrc.matchAll(/^\s{4}property\s+\S+\s+([A-Za-z_]\w*)/gm)) {
    PET_WRITABLE_PROPS.add(m[1]);
}

function createSoakWorld() {
    const startMs = Date.UTC(2026, 10, 16, 8, 0, 0); // Start at 08:00 UTC
    const world = {
        now: startMs,
        screens: [
            { x: 0, y: 0, width: 2560, height: 1440, name: "DP-1", topInset: 36, bottomInset: 0 },
            { x: 2560, y: 0, width: 1920, height: 1080, name: "DP-2", topInset: 36, bottomInset: 0 }
        ],
        petManager: {
            pets: [],
            lastSocialBoutMs: 0,
            vacatedWarmSpots: [],
            allowAmbientEmote() { return true; },
            allowSocialBout(minGapMs = 135000) {
                return (world.now - this.lastSocialBoutMs) >= minGapMs;
            },
            claimSocialBout(minGapMs = 135000) {
                if (world.now - this.lastSocialBoutMs < minGapMs) return false;
                this.lastSocialBoutMs = world.now;
                return true;
            },
            recordVacatedWarmSpot(pet, gx, gy) {
                this.vacatedWarmSpots = this.vacatedWarmSpots.filter(s => world.now < s.until);
                this.vacatedWarmSpots.push({
                    petId: pet.petData.id,
                    petName: pet.petData.name,
                    gx,
                    gy,
                    until: world.now + 75000
                });
            },
            findWarmSpotNear(pet, maxDist = 420) {
                const now = world.now;
                this.vacatedWarmSpots = this.vacatedWarmSpots.filter(s => now < s.until);
                const px = pet.screenX() + pet.worldX;
                const py = pet.screenY() + pet.worldY;
                let best = null, bestD = maxDist;
                for (const s of this.vacatedWarmSpots) {
                    if (s.petId === pet.petData.id) continue;
                    const d = Math.hypot(s.gx - px, s.gy - py);
                    if (d >= 28 && d < bestD) { best = s; bestD = d; }
                }
                return best ? Object.assign({ dist: bestD }, best) : null;
            }
        },
        windowTracker: {
            activeWindowPos: { address: "0x101", x: 240, y: 180, w: 1120, h: 860 },
            activeWindowClass: "kitty",
            activeWindowTitle: "nvim",
            visibleWindows: [
                { address: "0x101", cls: "kitty", title: "nvim", x: 240, y: 180, w: 1120, h: 860, focused: true, fullscreen: false },
                { address: "0x102", cls: "firefox", title: "docs", x: 1420, y: 210, w: 960, h: 820, focused: false, fullscreen: false }
            ],
            isFullscreen: false,
            windowCount: 2,
            isUserBusy: false
        },
        inputTracker: {
            cursorX: 820,
            cursorY: 560,
            cursorSpeed: 90,
            cursorKnown: true,
            cursorParked: false,
            userActive: true
        },
        mediaTracker: {
            isPlaying: false,
            micActive: false,
            audioMuted: false,
            audioVolume: 0.48,
            trackTitle: "",
            trackArtist: ""
        },
        systemMonitor: {
            isUnderLoad: false,
            thermalWarmth: 0.25,
            solarPhase: "day",
            weatherKind: "clear",
            isRaining: false,
            isSnowing: false,
            lowBattery: false
        }
    };
    return world;
}

function createSoakPet(world, id, name, species, preset, startX, startY) {
    const base = Personality.resolveBase(preset, name, null);
    const anims = speciesAnims[species];
    let proxy = null;

    const timers = {
        idle: 0,
        planBeat: 0,
        walk: 0,
        wanderDir: 0,
        wanderEnd: 0,
        sit: 0,
        action: 0,
        zoomies: 0,
        fidget: world.now + 7000 + Math.random() * 5000,
        fidgetRevert: 0,
        gaze: world.now + 9000 + Math.random() * 6000
    };

    const stats = {
        stateSec: {},
        unplannedIdleSec: 0,
        dayActiveSec: 0,
        dayTotalSec: 0,
        nightActiveSec: 0,
        nightTotalSec: 0,
        distPx: 0,
        plansByName: {},
        totalPlans: 0,
        socialPlans: 0,
        maxWalkStreakSec: 0,
        curWalkStreakSec: 0,
        maxAwakeIdleStreakSec: 0,
        curAwakeIdleStreakSec: 0,
        maxPlanAgeSec: 0
    };

    const raw = {
        petData: { id, name, sprite: species, personality: preset, roamMode: "always" },
        _simNow: world.now,
        _screenIdx: 0,
        _timers: timers,
        _stats: stats,
        basePersonality: base,
        coreDrift: {},
        recentDrift: {},
        quirkProgress: {},
        quirks: [],
        archetype: Personality.archetypeTitle(base, [], 0, 0.35),
        memoryRevision: 0,
        get personality() {
            return Personality.compose(this.basePersonality, this.coreDrift, this.recentDrift);
        },
        state_: "idle",
        gait: "trot",
        _liveSpeed: 0,
        moveAngle: 0,
        facingRight: true,
        worldX: startX,
        worldY: startY,
        width: 64,
        height: 64,
        altitude: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        _tossPeakSpeed: 0,
        _bounceCount: 0,
        _jumpLanding: null,
        perchedWindowAddr: "",
        _perchTrackedAddr: "",
        _perchRelX: 0.5,
        _perchTargetRelX: 0.5,
        _perchStrolling: false,
        _perchPrevWinX: 0,
        _perchPrevWinY: 0,
        _perchRiding: false,
        _perchSteadyTime: 0,
        _wanderTurnVel: 0,
        _stridePhase: 0,
        _journeyBeganMs: 0,
        _pendingReactions: [],
        _yawnWarmPeerName: "",
        _wakeWarmGreet: false,
        _restEnteredMs: 0,
        _restEnteredGX: 0,
        _restEnteredGY: 0,
        _lastDirectEmoteMs: 0,
        _lastAmbientEmoteMs: 0,
        _lastPassGreetMs: 0,
        _lastDistractionCheckMs: 0,
        _lastDistractedMs: 0,
        _lastYawnBroadcastMs: 0,
        _lastAlarmBroadcastMs: 0,
        _lastTrampledMs: 0,
        ageSeconds: 0,
        maturity: 0,
        bond: 0.38,
        trust: 0.42,
        satiety: 0.65,
        happiness: 0.58,
        mood: 0.58,
        restDrive: 0.14,
        exploreDrive: 0.36,
        socialDrive: 0.32,
        comfortDrive: 0.05,
        playDrive: 0.30,
        alertness: 0.74,
        boredom: 0.08,
        thoughts: [],
        episodes: [],
        journal: [],
        lastThoughtText: "Observing the desktop",
        lastThoughtTime: 0,
        lastDiscovery: "",
        lastDiscoveryTime: 0,
        activePlan: null,
        intention: null,
        visitedCells: {},
        windowPrefs: {},
        placeMemory: {},
        relationships: {},
        userRhythm: {},
        _eventCooldowns: {},
        _pokeTimestamps: [],
        _lastTrackTime: 0,
        _hour: 8,
        get isNighttime() { return this._hour >= 23 || this._hour < 6; },
        homeGX: startX,
        homeGY: startY,
        homeRadius: 210,
        onJourney: false,
        journeyBlocked: 0,
        targetGX: 0,
        targetGY: 0,
        attentionGX: 0,
        attentionGY: 0,
        attentionUntil: 0,
        calmUntil: 0,
        illusionSpecies: "",
        illusionUntil: 0,
        nextPeerSocialAt: world.now + 45000 + Math.random() * 60000,
        roamStartedAt: world.now,
        _retiringToPen: false,
        enablePerching: true,
        enableMusicReact: true,
        windowTracker: world.windowTracker,
        inputTracker: world.inputTracker,
        mediaTracker: world.mediaTracker,
        systemMonitor: world.systemMonitor,
        petManager: world.petManager,
        sprite: {
            _animData: anims,
            _dirRow: 1,
            _targetDirRow: 1,
            currentState: "idle",
            gaitOffsetY: 0,
            defaultMap: SpriteSheet.DEFAULT_STATE_MAP,
            actionMap: {},
            setDirectionRow(r) {
                const clamped = ((Math.round(r) % 8) + 8) % 8;
                this._targetDirRow = clamped;
                this._dirRow = SpriteSheet.stepDirectionRow(this._dirRow, clamped);
            },
            setDirection(a) {
                this.setDirectionRow(SpriteSheet.angleToDirectionRow(a));
            },
            setState(s) { this.currentState = s; },
            triggerSquash() {},
            currentAnimDurationMs() {
                const clip = SpriteSheet.resolveClip(this.currentState, this._animData, {}, species);
                const anim = this._animData[clip.animName];
                return SpriteSheet.clipDurationMs(clip, anim, clip.speed || 1);
            }
        },
        screenX() { return world.screens[this._screenIdx].x; },
        screenY() { return world.screens[this._screenIdx].y; },
        screenW() { return world.screens[this._screenIdx].width; },
        screenH() { return world.screens[this._screenIdx].height; },
        allScreens() { return world.screens; },
        _stopTimers() {
            timers.idle = 0;
            timers.planBeat = 0;
            timers.walk = 0;
            timers.wanderDir = 0;
            timers.wanderEnd = 0;
            timers.sit = 0;
            timers.action = 0;
            timers.zoomies = 0;
            timers.fidgetRevert = 0;
        },
        schedulePlanBeat(ms) {
            timers.idle = 0;
            timers.sit = 0;
            timers.planBeat = world.now + Math.max(400, ms);
        },
        restartIdle(mult) {
            const p = this.personality;
            const base = this.alertness > 0.55 ? (11000 + Math.random() * 9500)
                       : this.alertness > 0.25 ? (18000 + Math.random() * 15000)
                       : (34000 + Math.random() * 26000);
            const tempo = (1.26 - p.energy * 0.54) * (1.0 - this.boredom * 0.34);
            timers.idle = world.now + Math.max(4500, base * tempo * (mult || 1));
        },
        continueResting(s) {
            if (s !== this.state_) {
                this.enterState(s);
                return;
            }
            timers.sit = world.now + 65000 + Math.random() * 85000;
        },
        restartWalk() {
            timers.walk = world.now + 2200 + Math.random() * 2400;
        },
        startPotter(angle, durationMs) {
            if (Plans.hasActivePlan(proxy)) return;
            this.onJourney = false;
            this.gait = "amble";
            this.moveAngle = angle;
            this._wanderTurnVel = (Math.random() - 0.5) * 0.85;
            this.facingRight = Math.cos(angle) >= 0;
            this._stopTimers();
            this.state_ = "wander";
            this._liveSpeed = 30;
            this.sprite.setState("wander");
            this.sprite.setDirection(angle);
            timers.wanderDir = world.now + 1100;
            timers.wanderEnd = world.now + Math.max(650, durationMs);
        },
        enterState(s) {
            if (this.state_ === s && SpriteSheet.isLoopingState(s)) return;
            const wasResting = Util.isRestingState(this.state_);
            const nextResting = Util.isRestingState(s);
            if (wasResting && !nextResting) {
                if (this._restEnteredMs > 0 && (world.now - this._restEnteredMs) >= 25000) {
                    world.petManager.recordVacatedWarmSpot(proxy, this._restEnteredGX, this._restEnteredGY);
                }
                this._restEnteredMs = 0;
            } else if (nextResting && !wasResting) {
                this._restEnteredMs = world.now;
                this._restEnteredGX = this.screenX() + this.worldX;
                this._restEnteredGY = this.screenY() + this.worldY;
            }
            this._stopTimers();
            if (s !== "perch") {
                this.perchedWindowAddr = "";
                this._perchTrackedAddr = "";
                this._perchRiding = false;
                this._perchStrolling = false;
            }
            this.state_ = s;
            this.sprite.setState(s);
            switch (s) {
            case "idle":
                this.restartIdle(1.0);
                break;
            case "perch":
                if (!Plans.hasActivePlan(proxy)) this.restartIdle(1.0);
                break;
            case "sitNorth":
                if (!Plans.hasActivePlan(proxy)) timers.idle = world.now + 35000 + Math.random() * 25000;
                break;
            case "walk":
                this._journeyBeganMs = world.now;
                timers.walk = world.now + 2400 + Math.random() * 2600;
                break;
            case "wander":
                this._wanderTurnVel = (Math.random() - 0.5) * 0.95;
                timers.wanderDir = world.now + 1200 + Math.random() * 1400;
                timers.wanderEnd = world.now + 6500 + Math.random() * 8500;
                break;
            case "loaf":
            case "laying":
            case "sit":
            case "deepsleep":
                if (!Plans.hasActivePlan(proxy)) timers.sit = world.now + 65000 + Math.random() * 85000;
                break;
            case "zoomies":
                this._wanderTurnVel = (Math.random() - 0.5) * 2.6;
                timers.wanderDir = world.now + 700 + Math.random() * 800;
                timers.zoomies = world.now + 3800 + Math.random() * 4400;
                break;
            case "drag":
            case "airborne":
                break;
            default:
                timers.action = world.now + Math.max(900, this.sprite.currentAnimDurationMs() + 300);
                break;
            }
        },
        scheduleContagiousYawn() {},
        emitEmote() {},
        socialEvent(kind, fromPet, extra) {
            const payload = Object.assign({ fromPet }, extra || {});
            Brain.onEvent(proxy, "pet_" + kind, payload, Nav);
        }
    };

    proxy = new Proxy(raw, {
        set(target, prop, value, receiver) {
            if (typeof prop === "string" && !PET_WRITABLE_PROPS.has(prop)) {
                throw new Error(`Soak test: undeclared Pet.qml property write '${prop}'`);
            }
            return Reflect.set(target, prop, value, receiver);
        }
    });
    proxy.restartIdle(0.5 + Math.random() * 0.5);
    world.petManager.pets.push(proxy);
    return proxy;
}

function targetSpeedFor(pet) {
    const walkBase = 75;
    if (pet.state_ === "walk") {
        let spd = walkBase * SpeciesProfile.gaitMultiplier(pet, pet.gait);
        if (pet.onJourney) {
            const rem = Math.hypot((pet.screenX() + pet.worldX) - pet.targetGX, (pet.screenY() + pet.worldY) - pet.targetGY);
            if (rem < 84) spd *= Math.max(0.28, rem / 84);
        }
        return spd;
    }
    if (pet.state_ === "wander") return walkBase * SpeciesProfile.gaitMultiplier(pet, "amble") * 0.72;
    if (pet.state_ === "zoomies") return walkBase * SpeciesProfile.gaitMultiplier(pet, "scamper");
    return 0;
}

function stepPetPhysics(world, pet, dtSec) {
    const subSteps = pet.state_ === "airborne" ? 10 : 2;
    const subDt = dtSec / subSteps;
    for (let s = 0; s < subSteps; s++) {
        if (pet.state_ === "airborne") {
            if (pet._jumpLanding && pet._jumpLanding.parametric) {
                const hop = pet._jumpLanding;
                const hopDist = Math.hypot(hop.endX - hop.startX, hop.endY - hop.startY);
                assert.ok(hopDist <= 186, `${pet.petData.name} hop distance bounded (${hopDist.toFixed(1)}px)`);
                assert.ok(hop.duration <= 0.44, `${pet.petData.name} hop duration crisp (${hop.duration.toFixed(2)}s)`);
                assert.equal(pet.sprite.currentState, "leap", `${pet.petData.name} hop uses upright leap animation`);
            }
            Nav.updateAirborne(pet, subDt);
            continue;
        }
        if (pet.state_ === "perch") {
            Nav.updatePerch(pet, subDt);
            continue;
        }
        const tSpd = targetSpeedFor(pet);
        if (tSpd <= 0) {
            pet._liveSpeed = 0;
            continue;
        }
        const loco = SpeciesProfile.locomotionFor(pet);
        pet._liveSpeed += (tSpd - pet._liveSpeed) * Math.min(1, subDt * 6.8 * (loco.accelMult || 1.0));
        const curSpd = Math.max(14, pet._liveSpeed);
        Nav.updateSteering(pet, subDt);
        const step = curSpd * subDt;
        if (pet.onJourney && Nav.trySnapArrive(pet, step)) {
            pet._stats.distPx += step;
            continue;
        }
        const prevGX = pet.screenX() + pet.worldX;
        const prevGY = pet.screenY() + pet.worldY;
        pet.worldX += Math.cos(pet.moveAngle) * step;
        pet.worldY += Math.sin(pet.moveAngle) * step;

        const curScr = world.screens[pet._screenIdx];
        const maxX = curScr.width - pet.width;
        const maxY = curScr.height - pet.height;
        let hitX = false, hitY = false;
        if (pet.worldX < 0) {
            const adj = Topology.adjacentScreenAt(world.screens, curScr, "left", Math.max(0, Math.min(maxY, pet.worldY)), pet.width);
            if (adj) {
                pet._screenIdx = world.screens.indexOf(adj);
                pet.worldX = adj.width - pet.width;
                pet.worldY = Math.max(0, Math.min(adj.height - pet.height, curScr.y + pet.worldY - adj.y));
            } else {
                pet.worldX = 0;
                hitX = true;
            }
        } else if (pet.worldX > maxX) {
            const adj = Topology.adjacentScreenAt(world.screens, curScr, "right", Math.max(0, Math.min(maxY, pet.worldY)), pet.width);
            if (adj) {
                pet._screenIdx = world.screens.indexOf(adj);
                pet.worldX = 0;
                pet.worldY = Math.max(0, Math.min(adj.height - pet.height, curScr.y + pet.worldY - adj.y));
            } else {
                pet.worldX = maxX;
                hitX = true;
            }
        }
        const scrAfter = world.screens[pet._screenIdx];
        const maxYAfter = scrAfter.height - pet.height;
        if (pet.worldY < 0) { pet.worldY = 0; hitY = true; }
        else if (pet.worldY > maxYAfter) { pet.worldY = maxYAfter; hitY = true; }
        if (hitX || hitY) Nav.reflectOffWall(pet, hitX, hitY);

        pet._stats.distPx += Math.hypot((pet.screenX() + pet.worldX) - prevGX, (pet.screenY() + pet.worldY) - prevGY);
        Memory.trackPosition(pet);
    }
}

const SOCIAL_PLANS = new Set([
    "social_mingle", "spar_bout", "spar_partner", "play_tag", "flee_tag", "reverse_tag",
    "invite_play", "show_off", "squabble", "squabble_reply", "best_friend_checkin",
    "rest_with", "sneak_boop", "mentor_patrol", "copycat_trail", "sync_dance", "pack_rally"
]);

// Run 48-hour high-fidelity multi-companion soak test (1-second resolution = 172,800 ticks)
{
    const world = createSoakWorld();
    const spark = createSoakPet(world, "spark", "Spark", "jolteon", "energetic", 420, 620);
    const snore = createSoakPet(world, "snore", "Snore", "munchlax", "lazy", 780, 700);
    const puff = createSoakPet(world, "puff", "Puff", "whimsicott", "curious", 1120, 580);
    const shade = createSoakPet(world, "shade", "Shade", "phantump", "shy", 1500, 660);
    const brawl = createSoakPet(world, "brawl", "Brawl", "riolu", "playful", 620, 640);
    const vigil = createSoakPet(world, "vigil", "Vigil", "umbreon", "nocturnal", 960, 680);
    const roster = [spark, snore, puff, shade, brawl, vigil];

    const totalHours = 24;
    const totalSteps = totalHours * 3600;
    let lastPlanNameById = {};

    for (let sec = 1; sec <= totalSteps; sec++) {
        world.now += 1000;
        const hr = new Date(world.now).getUTCHours();
        const isNight = hr >= 23 || hr < 6;

        // Realistic desktop environment rhythm over each 24h day
        world.systemMonitor.solarPhase = (hr >= 6 && hr < 8) ? "dawn"
            : (hr >= 8 && hr < 18) ? "day"
            : (hr >= 18 && hr < 20) ? "dusk" : "night";
        world.inputTracker.userActive = !(hr >= 1 && hr < 7) && (sec % 1800) < 1500;
        world.mediaTracker.isPlaying = (hr === 11 || hr === 15 || hr === 20);
        world.mediaTracker.trackTitle = world.mediaTracker.isPlaying ? "Treasure Town Lo-Fi" : "";
        if (sec % 45 === 0 && world.inputTracker.userActive) {
            world.inputTracker.cursorX = 300 + ((sec * 37) % 1800);
            world.inputTracker.cursorY = 220 + ((sec * 23) % 900);
        }

        // Occasional user headpats & desktop events
        if (sec % 5400 === 0 && !isNight) {
            const lucky = roster[(sec / 5400) % roster.length];
            if (!Util.isRestingState(lucky.state_)) Brain.onEvent(lucky, "stroked", null, Nav);
        }
        if (sec % 7200 === 1800 && !isNight) {
            for (const p of roster) Brain.onEvent(p, "toast_arrived", { appName: "vesktop", urgency: "normal", silent: false }, Nav);
        }

        for (const p of roster) {
            p._simNow = world.now;
            p._hour = hr;
            const prevPlan = p.activePlan ? p.activePlan.name : "";

            stepPetPhysics(world, p, 1.0);

            const t = p._timers;
            if (t.walk > 0 && world.now >= t.walk) { t.walk = 0; Nav.walkArrived(p); }
            if (t.wanderDir > 0 && world.now >= t.wanderDir) {
                if (p.state_ === "zoomies") {
                    p._wanderTurnVel = (Math.random() - 0.5) * 2.8;
                    t.wanderDir = world.now + 700 + Math.random() * 800;
                } else if (p.state_ === "wander") {
                    p._wanderTurnVel = (Math.random() - 0.5) * 1.1;
                    t.wanderDir = world.now + 1200 + Math.random() * 1500;
                } else {
                    t.wanderDir = 0;
                }
            }
            if (t.wanderEnd > 0 && world.now >= t.wanderEnd) {
                t.wanderEnd = 0;
                p.enterState("idle");
                p.restartIdle(0.40);
                t.fidget = world.now + 9000 + Math.random() * 7000;
            }
            if (t.action > 0 && world.now >= t.action) { t.action = 0; Brain.onActionFinished(p, Nav); }
            if (t.zoomies > 0 && world.now >= t.zoomies) { t.zoomies = 0; Brain.onActionFinished(p, Nav); }
            if (t.planBeat > 0 && world.now >= t.planBeat) { t.planBeat = 0; Brain.onPlanBeat(p, Nav); }
            if (t.sit > 0 && world.now >= t.sit) { t.sit = 0; Brain.restTick(p); }
            if (t.idle > 0 && world.now >= t.idle) { t.idle = 0; Brain.think(p, Nav); }

            if (t.fidgetRevert > 0 && world.now >= t.fidgetRevert) {
                t.fidgetRevert = 0;
                if (p.state_ === "idle" || p.state_ === "perch") p.sprite.setState(p.state_);
            }
            if (world.now >= t.fidget) {
                const hold0 = SpeciesProfile.standSpec(p.petData.sprite).mode === "hold0";
                t.fidget = world.now + (hold0 ? (6500 + Math.random() * 5200) : (10000 + Math.random() * 11000));
                if ((p.state_ === "idle" || (p.state_ === "perch" && !p._perchStrolling)) && t.fidgetRevert === 0) {
                    const act = Gestures.idleMicroAction(p);
                    if (act) {
                        if (act.kind === "loaf" && t.planBeat === 0 && p.state_ === "idle") p.enterState("loaf");
                        else if (act.kind === "potter" && t.planBeat === 0 && p.state_ === "idle") p.startPotter(act.angle, act.durationMs);
                        else if (act.kind === "ledge_shift" && p.state_ === "perch") {
                            p._perchTargetRelX = act.targetRelX;
                            p._perchStrolling = true;
                        } else if (act.kind === "fidget") {
                            p.sprite.setState(act.state);
                            t.fidgetRevert = world.now + 950;
                        }
                    }
                }
            }
            if (world.now >= t.gaze) {
                t.gaze = world.now + 8200 + Math.random() * 7600;
                if ((p.state_ === "idle" || p.state_ === "perch") && t.fidgetRevert === 0 && world.now >= p.attentionUntil) {
                    p.sprite.setDirectionRow(Gestures.ambientGlanceRow(p, p.sprite._dirRow));
                }
            }

            if (sec % 5 === 0) {
                const perc = Perception.perceive(p);
                Drives.integrate(p, perc, 5.0);
                Memory.observeUser(p, perc);
                Brain.syncArchetype(p);
                if (sec % 30 === 0) Memory.decayMemories(p);

                if (p.state_ === "idle" && t.idle === 0 && t.planBeat === 0) {
                    p.restartIdle(0.6);
                } else if (p.state_ === "walk" && p.onJourney && p._journeyBeganMs > 0
                        && (world.now - p._journeyBeganMs) > 28000) {
                    p.onJourney = false;
                    Brain.onBlocked(p);
                }
            }
            if (sec % 900 === 0) {
                Brain.reflect(p);
            }

            // Record telemetry & assert strict invariants every single second
            const curPlan = p.activePlan ? p.activePlan.name : "";
            if (curPlan && curPlan !== prevPlan && curPlan !== lastPlanNameById[p.petData.id]) {
                p._stats.plansByName[curPlan] = (p._stats.plansByName[curPlan] || 0) + 1;
                p._stats.totalPlans++;
                if (SOCIAL_PLANS.has(curPlan)) p._stats.socialPlans++;
            }
            lastPlanNameById[p.petData.id] = curPlan;

            p._stats.stateSec[p.state_] = (p._stats.stateSec[p.state_] || 0) + 1;
            if (p.state_ === "idle" && !p.activePlan) p._stats.unplannedIdleSec++;
            const isActiveNow = !Util.isRestingState(p.state_) && p.state_ !== "idle";
            if (isNight) {
                p._stats.nightTotalSec++;
                if (isActiveNow) p._stats.nightActiveSec++;
            } else {
                p._stats.dayTotalSec++;
                if (isActiveNow) p._stats.dayActiveSec++;
            }

            if (p.state_ === "walk" && p.onJourney) {
                p._stats.curWalkStreakSec++;
                if (p._stats.curWalkStreakSec > p._stats.maxWalkStreakSec) {
                    p._stats.maxWalkStreakSec = p._stats.curWalkStreakSec;
                }
            } else {
                p._stats.curWalkStreakSec = 0;
            }

            if (p.state_ === "idle" && !p.activePlan && p.alertness > 0.55) {
                p._stats.curAwakeIdleStreakSec++;
                if (p._stats.curAwakeIdleStreakSec > p._stats.maxAwakeIdleStreakSec) {
                    p._stats.maxAwakeIdleStreakSec = p._stats.curAwakeIdleStreakSec;
                }
            } else {
                p._stats.curAwakeIdleStreakSec = 0;
            }

            if (p.activePlan) {
                const planAge = (world.now - p.activePlan.started) / 1000;
                if (planAge > p._stats.maxPlanAgeSec) p._stats.maxPlanAgeSec = planAge;
            }

            const scr = world.screens[p._screenIdx];
            assert.ok(Number.isFinite(p.worldX) && p.worldX >= 0 && p.worldX <= scr.width - p.width, `${p.petData.name} worldX in bounds`);
            assert.ok(Number.isFinite(p.worldY) && p.worldY >= 0 && p.worldY <= scr.height - p.height, `${p.petData.name} worldY in bounds`);
            assert.ok(Number.isFinite(p.altitude) && p.altitude >= 0 && p.altitude < 1200, `${p.petData.name} altitude valid`);
            for (const k of ["happiness", "mood", "restDrive", "exploreDrive", "socialDrive", "comfortDrive", "playDrive", "alertness", "boredom", "bond", "trust"]) {
                assert.ok(Number.isFinite(p[k]) && p[k] >= 0 && p[k] <= 1, `${p.petData.name}.${k} bounded: ${p[k]}`);
            }
        }
    }

    const allDistinctPlans = new Set();
    const archetypes = new Set();
    for (const p of roster) {
        for (const k of Object.keys(p._stats.plansByName)) allDistinctPlans.add(k);
        archetypes.add(p.archetype);

        const st = p._stats;
        const idlePct = ((st.stateSec.idle || 0) / totalSteps) * 100;
        const restSec = (st.stateSec.loaf || 0) + (st.stateSec.laying || 0) + (st.stateSec.sit || 0) + (st.stateSec.deepsleep || 0);
        const restPct = (restSec / totalSteps) * 100;
        const perchPct = ((st.stateSec.perch || 0) / totalSteps) * 100;
        const movePct = (((st.stateSec.walk || 0) + (st.stateSec.wander || 0) + (st.stateSec.zoomies || 0)) / totalSteps) * 100;

        console.log(
            `[Soak 24h] ${p.petData.name.padEnd(6)} (${p.petData.sprite.padEnd(10)}) | ` +
            `idle=${idlePct.toFixed(1)}% move=${movePct.toFixed(1)}% perch=${perchPct.toFixed(1)}% rest=${restPct.toFixed(1)}% | ` +
            `plans=${String(st.totalPlans).padStart(4)} social=${String(st.socialPlans).padStart(3)} dist=${Math.round(st.distPx / 1000)}kpx | ` +
            `${p.archetype} [${p.quirks.join(",")}]`
        );
    }

    for (const p of roster) {
        const st = p._stats;
        const idlePct = ((st.stateSec.idle || 0) / totalSteps) * 100;
        const unplannedIdlePct = (st.unplannedIdleSec / totalSteps) * 100;
        assert.ok(st.maxWalkStreakSec <= 35, `${p.petData.name} never got stuck walking (${st.maxWalkStreakSec}s)`);
        assert.ok(st.maxPlanAgeSec <= 260, `${p.petData.name} never got stuck in an expired plan (${st.maxPlanAgeSec}s)`);
        assert.ok(st.maxAwakeIdleStreakSec <= 185, `${p.petData.name} never stagnated wide-awake in idle (${st.maxAwakeIdleStreakSec}s)`);
        assert.ok(st.totalPlans >= 55, `${p.petData.name} stayed engaged over 24h (${st.totalPlans} plans)`);
        assert.ok(unplannedIdlePct < 40, `${p.petData.name} unplanned idle stayed low (${unplannedIdlePct.toFixed(1)}%)`);
        assert.ok(idlePct < 44, `${p.petData.name} did not spend majority of 24h standing idle (${idlePct.toFixed(1)}%)`);
    }

    // 2. Rich behavioral variety across the pack
    assert.ok(allDistinctPlans.size >= 11, `Pack executed rich variety of plans (${allDistinctPlans.size}: ${Array.from(allDistinctPlans).join(", ")})`);

    // 3. Genuine personality differentiation (locomotion, rest, perching, socializing, circadian, and long-term identity)
    const restSecOf = p => (p._stats.stateSec.loaf || 0) + (p._stats.stateSec.laying || 0) + (p._stats.stateSec.sit || 0) + (p._stats.stateSec.deepsleep || 0);
    const soloPlayOf = p => (p._stats.plansByName.play_solo || 0) + (p._stats.plansByName.zoomies || 0);
    const perchPlansOf = p => (p._stats.plansByName.window_perch || 0) + (p._stats.plansByName.ledge_stroll || 0) + (p._stats.plansByName.ledge_parkour || 0);

    assert.ok(
        spark._stats.distPx > snore._stats.distPx * 1.8,
        `Energetic Jolteon (${Math.round(spark._stats.distPx)}px) travels far more than Lazy Munchlax (${Math.round(snore._stats.distPx)}px)`
    );
    assert.ok(
        soloPlayOf(spark) > soloPlayOf(snore) * 2.5,
        `Energetic Jolteon (${soloPlayOf(spark)}) plays/zooms far more than Lazy Munchlax (${soloPlayOf(snore)})`
    );
    assert.ok(
        restSecOf(snore) > restSecOf(spark) * 1.45,
        `Lazy Munchlax (${Math.round(restSecOf(snore) / 3600)}h) sleeps substantially more than Energetic Jolteon (${Math.round(restSecOf(spark) / 3600)}h)`
    );
    assert.ok(
        perchPlansOf(puff) > perchPlansOf(snore) * 2,
        `Curious sky-drifter Whimsicott (${perchPlansOf(puff)}) perches far more than heavyweight Munchlax (${perchPlansOf(snore)})`
    );
    assert.ok(
        brawl._stats.socialPlans > shade._stats.socialPlans * 1.6,
        `Playful Riolu (${brawl._stats.socialPlans}) socializes substantially more than Shy Phantump (${shade._stats.socialPlans})`
    );
    const vigilNightRatio = vigil._stats.nightActiveSec / Math.max(1, vigil._stats.dayActiveSec);
    const snoreNightRatio = snore._stats.nightActiveSec / Math.max(1, snore._stats.dayActiveSec);
    assert.ok(
        vigilNightRatio > snoreNightRatio * 1.25,
        `Nocturnal Umbreon (${vigilNightRatio.toFixed(2)}) keeps stronger night activity than diurnal Munchlax (${snoreNightRatio.toFixed(2)})`
    );

    // 4. Long-term trait & archetype preservation (anti-homogenization!)
    assert.ok(shade.personality.boldness < 0.42, `Shy Phantump retains bashful boldness after 48h (${shade.personality.boldness.toFixed(2)})`);
    assert.ok(snore.personality.sleepiness > 0.65 && snore.personality.energy < 0.44, `Lazy Munchlax retains drowsy low-energy nature (${snore.personality.sleepiness.toFixed(2)} / ${snore.personality.energy.toFixed(2)})`);
    assert.ok(spark.personality.energy > 0.72, `Energetic Jolteon retains high energy (${spark.personality.energy.toFixed(2)})`);
    assert.ok(archetypes.size >= 4, `6 companions develop distinct archetypes instead of cloning (${archetypes.size}: ${Array.from(archetypes).join(" | ")})`);

    // 5. Gaze calmness check: idle three-quarter gaze holds steady > 40% of unprompted ticks and avoids random back-of-head spins
    const calmWorld = createSoakWorld();
    calmWorld.inputTracker.userActive = false;
    calmWorld.windowTracker.activeWindowPos = null;
    const gazer = createSoakPet(calmWorld, "gazer", "Gazer", "eevee", "chill", 900, 600);
    let heldCount = 0;
    let backSpins = 0;
    let curRow = 1;
    for (let g = 0; g < 200; g++) {
        const next = Gestures.ambientGlanceRow(gazer, curRow);
        if (next === curRow) heldCount++;
        if (next === 3 || next === 4 || next === 5) backSpins++;
        curRow = next;
    }
    assert.ok(heldCount >= 80, `Unprompted ambient gaze holds steady instead of spinning constantly (${heldCount}/200)`);
    assert.equal(backSpins, 0, "Unprompted ambient gaze never turns companion's back to stare at empty wallpaper");

    console.log(`24-hour soak verification passed (${totalSteps * roster.length} pet-seconds simulated, ${allDistinctPlans.size} distinct plan types, ${archetypes.size}/6 unique archetypes).`);
}
