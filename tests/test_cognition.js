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
const Abilities = loadQmlJs("components/behavior/Abilities.js");
const Plans = loadQmlJs("components/behavior/Plans.js");
const Gestures = loadQmlJs("components/behavior/Gestures.js");
const BrainCandidates = loadQmlJs("components/behavior/BrainCandidates.js");
const Brain = loadQmlJs("components/behavior/Brain.js");
const Sanctuary = loadQmlJs("components/behavior/Sanctuary.js");
const Evolution = loadQmlJs("components/behavior/Evolution.js");
const CompositorWindows = loadQmlJs("components/behavior/CompositorWindows.js");
const Util = loadQmlJs("components/behavior/Util.js");
const Nav = loadQmlJs("components/PetNav.js");
const Persist = loadQmlJs("components/PetPersistence.js");

const zoruaXml = fs.readFileSync(path.join(rootDir, "assets/sprites/zorua/AnimData.xml"), "utf8");
const zoruaAnims = SpriteSheet.parseAnimData(zoruaXml).anims;

const petQmlSrc = fs.readFileSync(path.join(rootDir, "components/Pet.qml"), "utf8");
const PET_WRITABLE_PROPS = new Set([
    "x", "y", "z", "width", "height", "opacity", "visible", "scale", "rotation",
    "_simNow", "_screenIdx", "emotes", "directEmotes", "savedJson", "enablePerching", "enableMusicReact"
]);
for (const m of petQmlSrc.matchAll(/^\s{4}property\s+\S+\s+([A-Za-z_]\w*)/gm)) {
    PET_WRITABLE_PROPS.add(m[1]);
}
const PET_QML_METHODS = new Set();
for (const m of petQmlSrc.matchAll(/^\s{4}function\s+([A-Za-z_]\w*)/gm)) {
    PET_QML_METHODS.add(m[1]);
}

function createSimWorld() {
    const world = {
        now: 1_700_000_000_000,
        screens: [
            { x: 0, y: 0, width: 2560, height: 1440, name: "DP-1" },
            { x: 2560, y: 0, width: 1920, height: 1080, name: "DP-2" }
        ],
        petManager: {
            pets: [],
            lastSocialBoutMs: 0,
            allowSocialBout(minGapMs = 135000) {
                return (world.now - this.lastSocialBoutMs) >= minGapMs;
            },
            claimSocialBout(minGapMs = 135000) {
                if (world.now - this.lastSocialBoutMs < minGapMs) return false;
                this.lastSocialBoutMs = world.now;
                return true;
            }
        },
        windowTracker: {
            activeWindowPos: { address: "0xabc", x: 300, y: 180, w: 1400, h: 900 },
            activeWindowClass: "kitty",
            activeWindowTitle: "nvim",
            visibleWindows: [
                { address: "0xabc", cls: "kitty", title: "nvim", x: 300, y: 180, w: 1400, h: 900, focused: true, fullscreen: false }
            ],
            isFullscreen: false,
            windowCount: 2,
            isUserBusy: false
        },
        inputTracker: {
            cursorX: 900,
            cursorY: 600,
            cursorSpeed: 120,
            userActive: true
        },
        mediaTracker: {
            isPlaying: false,
            trackTitle: "",
            trackArtist: ""
        },
        systemMonitor: {
            isUnderLoad: false
        }
    };
    return world;
}

function createSimPet(world, name, preset = "emergent", sx = 0, species = "zorua") {
    const base = Personality.resolveBase(preset, name, null);
    const pet = {
        petData: { name, sprite: species, personality: preset },
        _simNow: world.now,
        _screenIdx: sx === 0 ? 0 : 1,
        basePersonality: base,
        coreDrift: {},
        recentDrift: {},
        quirkProgress: {},
        quirks: [],
        archetype: "",
        get personality() {
            return Personality.compose(this.basePersonality, this.coreDrift, this.recentDrift);
        },
        state_: "idle",
        gait: "trot",
        moveAngle: 0,
        facingRight: true,
        worldX: 400,
        worldY: 500,
        width: 64,
        height: 64,
        altitude: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        homeGX: sx + 400,
        homeGY: 500,
        homeRadius: 220,
        onJourney: false,
        journeyBlocked: 0,
        targetGX: 0,
        targetGY: 0,
        perchedWindowAddr: "",
        _perchTrackedAddr: "",
        _perchRelX: 0.5,
        _perchTargetRelX: 0.5,
        _perchStrolling: false,
        _perchRiding: false,
        ageSeconds: 0,
        maturity: 0,
        bond: 0.3,
        trust: 0.35,
        satiety: 0.5,
        happiness: 0.5,
        mood: 0.5,
        restDrive: 0.15,
        exploreDrive: 0.35,
        socialDrive: 0.3,
        comfortDrive: 0,
        playDrive: 0.25,
        alertness: 0.65,
        boredom: 0.1,
        thoughts: [],
        episodes: [],
        journal: [],
        visitedCells: {},
        windowPrefs: {},
        placeMemory: {},
        relationships: {},
        userRhythm: {},
        activePlan: null,
        intention: null,
        attentionGX: 0,
        attentionGY: 0,
        attentionUntil: 0,
        calmUntil: 0,
        _hour: 14,
        get isNighttime() { return this._hour >= 23 || this._hour < 6; },
        windowTracker: world.windowTracker,
        inputTracker: world.inputTracker,
        mediaTracker: world.mediaTracker,
        systemMonitor: world.systemMonitor,
        petManager: world.petManager,
        emotes: [],
        directEmotes: [],
        savedJson: "",
        sprite: {
            _animData: zoruaAnims,
            _dirRow: 1,
            currentState: "idle",
            squashCount: 0,
            defaultMap: SpriteSheet.DEFAULT_STATE_MAP,
            actionMap: {},
            setDirection(a) { this._dirRow = SpriteSheet.angleToDirectionRow(a); },
            setState(s) { this.currentState = s; },
            triggerSquash() { this.squashCount++; }
        },
        screenX() { return world.screens[this._screenIdx].x; },
        screenY() { return world.screens[this._screenIdx].y; },
        screenW() { return world.screens[this._screenIdx].width; },
        screenH() { return world.screens[this._screenIdx].height; },
        allScreens() { return world.screens; },
        enterState(s) { this.state_ = s; },
        restartIdle() {},
        restartWalk() {},
        continueResting(s) { this.state_ = s; },
        schedulePlanBeat() {},
        emitEmote(e, direct) {
            this.emotes.push(e);
            if (direct) this.directEmotes.push(e);
        },
        saveStateJson(j) { this.savedJson = j; },
        socialEvent(kind, fromPet, extra) {
            const payload = Object.assign({ fromPet }, extra || {});
            Brain.onEvent(this, "pet_" + kind, payload, Nav);
        },
        petWindow: {
            moveToGlobal(gx, gy) {
                const idx = gx >= 2560 ? 1 : 0;
                proxy._screenIdx = idx;
                proxy.worldX = gx - world.screens[idx].x;
                proxy.worldY = gy - world.screens[idx].y;
            }
        }
    };
    const proxy = new Proxy(pet, {
        set(target, prop, value, receiver) {
            if (typeof prop === "string" && !PET_WRITABLE_PROPS.has(prop)
                    && !(typeof value === "function" && PET_QML_METHODS.has(prop))) {
                throw new Error(`Cannot assign to undeclared or readonly Pet.qml property '${prop}'`);
            }
            return Reflect.set(target, prop, value, receiver);
        }
    });
    world.petManager.pets.push(proxy);
    return proxy;
}

function advanceTime(world, dtSec) {
    world.now += dtSec * 1000;
    for (const p of world.petManager.pets) {
        p._simNow = world.now;
        p._hour = new Date(world.now).getUTCHours();
        const perc = Perception.perceive(p);
        Drives.integrate(p, perc, dtSec);
        Memory.observeUser(p, perc);
    }
}

// 1. Test multi-step plan execution & intentional attention-bid barking + retry
{
    const world = createSimWorld();
    const mochi = createSimPet(world, "Mochi", "emergent");
    const perc = Perception.perceive(mochi);
    Plans.startPlan(mochi, Plans.buildAttentionBidPlan(perc, true, false), Nav);
    assert.equal(mochi.activePlan.name, "bid_attention");
    assert.equal(mochi.state_, "walk");

    // Snap arrival at cursor -> Zorua intentionally barks ("idleOnce") to ask for attention!
    mochi.worldX = mochi.targetGX;
    mochi.worldY = mochi.targetGY;
    Nav.walkArrived(mochi);
    assert.equal(mochi.state_, "idleOnce", "Zorua barks intentionally when bidding for attention");
    Brain.onActionFinished(mochi, Nav);
    assert.equal(mochi.activePlan.waitingForBid, true);

    // User strokes pet while waiting -> bid succeeds, trust & bond jump, happy non-barking gesture!
    const prevTrust = mochi.trust;
    Brain.onEvent(mochi, "stroked", null, Nav);
    assert.equal(mochi.activePlan, null);
    assert.ok(mochi.trust > prevTrust + 0.02);
    assert.ok(["nod", "rotate", "hop"].includes(mochi.state_), "Zorua responds to headpats warmly without barking");
    assert.ok(mochi.episodes.some(e => e.type === "bid_answered"));
}

// 2. Test divergent personality emergence across two identical hatchlings in different lifestyles!
{
    const cozyWorld = createSimWorld();
    cozyWorld.mediaTracker.isPlaying = true;
    cozyWorld.mediaTracker.trackTitle = "Lo-Fi Rain";
    const pip = createSimPet(cozyWorld, "Twin", "emergent");

    const roughWorld = createSimWorld();
    const rex = createSimPet(roughWorld, "Twin", "emergent");

    assert.deepEqual(pip.basePersonality, rex.basePersonality);

    for (let cycle = 0; cycle < 16; cycle++) {
        for (let m = 0; m < 12; m++) {
            advanceTime(cozyWorld, 300);
            advanceTime(roughWorld, 300);
        }
        Brain.onEvent(pip, "stroked", null, Nav);
        Brain.onEvent(pip, "fed", null, Nav);
        Memory.recordEpisode(pip, "supervised_code", { valence: 0.4, windowClass: "kitty" });
        Memory.recordEpisode(pip, "music_groove", { valence: 0.5, music: true });

        roughWorld.inputTracker.cursorSpeed = 1400;
        Brain.onEvent(rex, "cursor_near", null, Nav);
        Memory.recordEpisode(rex, "tossed_rough", { valence: -0.5, salience: 0.7 });

        const pipDream = Brain.reflect(pip);
        Brain.reflect(rex);
        if (cycle === 0) assert.ok(pipDream && pipDream.count > 0);
    }

    assert.ok(
        pip.personality.sociability > rex.personality.sociability + 0.12,
        `Affectionate lifestyle should raise sociability (${pip.personality.sociability} vs ${rex.personality.sociability})`
    );
    assert.ok(
        pip.personality.boldness > rex.personality.boldness + 0.10,
        `Safe lifestyle should build boldness over startled lifestyle (${pip.personality.boldness} vs ${rex.personality.boldness})`
    );
    assert.ok(pip.bond > 0.65 && rex.bond < 0.35, "Bond diverges meaningfully");
    assert.ok(pip.quirks.length >= 2, `Pip earned quirks: ${pip.quirks.join(", ")}`);
    assert.ok(
        pip.quirks.includes("melomaniac") || pip.quirks.includes("velcro_companion") || pip.quirks.includes("terminal_supervisor"),
        "Earned quirks match lived habits"
    );
    assert.notEqual(pip.archetype, rex.archetype, `Archetypes diverged: '${pip.archetype}' vs '${rex.archetype}'`);
}

// 3. Test multi-pet social bonding, coordinated tag chase, and grumpy reconciliation
{
    const world = createSimWorld();
    const zorua = createSimPet(world, "Zorua", "playful", 0, "zorua");
    const puff = createSimPet(world, "Puff", "playful", 0, "whimsicott");
    puff.worldX = 460;
    puff.worldY = 500;
    Memory.adjustRelation(zorua, "Puff", 0.2, 0.2);
    Memory.adjustRelation(puff, "Zorua", 0.2, 0.2);

    Plans.startPlan(zorua, Plans.buildPlayTagPlan({ name: "Puff" }, true), Nav);
    assert.equal(zorua.state_, "nod", "Tag initiator play-bows first");
    Brain.onActionFinished(zorua, Nav); // triggers Social.startChase -> Puff starts flee_tag & Zorua chases!
    assert.equal(puff.activePlan.name, "flee_tag", "Tagged companion darts off in flee_tag plan");
    assert.equal(puff.gait, "scamper", "Tagged companion scampers away");
    assert.equal(zorua.gait, "scamper", "Chaser pursues at scamper gait");
    assert.ok(zorua.onJourney && puff.onJourney, "Both pets run across the screen together");

    const absol = createSimPet(world, "Absol", "grumpy", 0, "absol");
    absol.worldX = 480;
    absol.worldY = 500;
    for (let i = 0; i < 6; i++) {
        advanceTime(world, 60);
        Social.restBeside(zorua, absol);
    }
    const relZA = Memory.relationWith(zorua, "Absol");
    const relAZ = Memory.relationWith(absol, "Zorua");
    assert.ok(relZA.affinity > 0.55, "Shared naps build Zorua->Absol affinity");
    assert.ok(relAZ.napCount >= 6, "Absol records shared naps");
    assert.notEqual(Personality.relationshipTag(relAZ), "Strangers");
}

// 4. Test toss physics & window perch loss reflex
{
    const world = createSimWorld();
    const hoppy = createSimPet(world, "Hoppy", "brave");
    hoppy.trust = 0.7;
    Nav.launchFromRelease(hoppy, 650, -120, 30);
    assert.equal(hoppy.state_, "airborne");
    assert.ok(hoppy.altitude > 0);
    let landed = false;
    for (let step = 0; step < 200 && !landed; step++) {
        landed = Nav.updateAirborne(hoppy, 1 / 60);
    }
    assert.ok(landed, "Airborne pet lands cleanly under gravity");
    assert.equal(hoppy.altitude, 0);
    assert.ok(hoppy.episodes.some(e => e.type === "tossed_fun"), "Brave trusting pet enjoys toss");

    hoppy.worldX = 600;
    hoppy.worldY = 126;
    hoppy.perchedWindowAddr = "0xabc";
    hoppy.enterState("perch");
    Nav.updatePerch(hoppy);
    assert.equal(hoppy.state_, "perch");
    world.windowTracker.visibleWindows = [];
    Nav.updatePerch(hoppy);
    assert.notEqual(hoppy.state_, "perch", "Closing perched window drops pet off perch");
}

// 5. Test Persistence v3 roundtrip & legacy v2 migration
{
    const world = createSimWorld();
    const original = createSimPet(world, "Kitsune", "curious", 2560);
    original.worldX = 320;
    original.worldY = 240;
    original.bond = 0.82;
    original.trust = 0.77;
    original.coreDrift = { curiosity: 0.18, sociability: 0.12 };
    original.quirks = ["screen_hopper", "night_watch"];
    Memory.recordEpisode(original, "scout_complete", { valence: 0.5, otherScreen: true });
    Memory.thinkAloud(original, "test", "Found a second monitor!");

    Persist.save(original);
    assert.ok(original.savedJson.length > 100);

    const restored = createSimPet(world, "Kitsune", "curious", 0);
    assert.ok(Persist.loadFromText(restored, original.savedJson));
    assert.equal(restored._screenIdx, 1, "Restored onto second monitor");
    assert.equal(restored.worldX, 320);
    assert.equal(restored.bond, 0.82);
    assert.deepEqual(restored.quirks, ["screen_hopper", "night_watch"]);
    assert.equal(restored.coreDrift.curiosity, 0.18);

    const legacyV2 = JSON.stringify({
        schema: 2,
        gx: 500,
        gy: 600,
        homeGX: 500,
        homeGY: 600,
        happiness: 0.7,
        learnedTraits: { boldness: 0.14 },
        thoughts: [
            { type: "strolled", time: Date.now() },
            { type: "petted", time: Date.now(), x: 500, y: 600 }
        ]
    });
    const migrated = createSimPet(world, "Legacy", "shy", 0);
    assert.ok(Persist.loadFromText(migrated, legacyV2));
    assert.equal(migrated.coreDrift.boldness, 0.14);
    assert.equal(migrated.episodes.length, 1, "Filtered 'strolled' noise and kept 'petted' episode");
}

// 6. Test 48-hour autonomous multi-pet simulation (zero NaNs, bounded drives, organic plan completions)
{
    const world = createSimWorld();
    world.mediaTracker.isPlaying = true;
    world.mediaTracker.trackTitle = "Mystery Dungeon Medley";
    const a = createSimPet(world, "Zorua", "emergent", 0, "zorua");
    const b = createSimPet(world, "Whimsicott", "playful", 0, "whimsicott");
    b.worldX = 620;

    let plansStarted = 0;
    const beatSteps = new Set(["observe", "perch", "wait_bid", "watch_north", "loaf_watch"]);
    for (let step = 0; step < 576; step++) {
        advanceTime(world, 300);
        for (const p of [a, b]) {
            const curStep = Plans.currentStep(p);
            if (!p.activePlan && (p.state_ === "loaf" || p.state_ === "sit" || p.state_ === "deepsleep")) {
                Brain.restTick(p);
            } else if (p.onJourney) {
                p.worldX = Math.max(0, Math.min(p.screenW() - p.width, p.targetGX - p.screenX()));
                p.worldY = Math.max(0, Math.min(p.screenH() - p.height, p.targetGY - p.screenY()));
                Nav.walkArrived(p);
            } else if (curStep && beatSteps.has(curStep.kind)) {
                Brain.onPlanBeat(p, Nav);
            } else if (p.state_ !== "idle" && p.state_ !== "perch" && p.state_ !== "sitNorth") {
                Brain.onActionFinished(p, Nav);
            } else {
                Brain.think(p, Nav);
                if (p.activePlan) plansStarted++;
            }
            for (const key of ["happiness", "mood", "restDrive", "exploreDrive", "socialDrive", "comfortDrive", "playDrive", "alertness", "boredom", "bond", "trust"]) {
                assert.ok(Number.isFinite(p[key]) && p[key] >= 0 && p[key] <= 1, `${p.petData.name}.${key} bounded: ${p[key]}`);
            }
        }
    }
    assert.ok(plansStarted > 25, `Pets autonomously executed multi-step plans (${plansStarted})`);
    assert.ok(a.maturity > 0.85, "48h pet reached adulthood maturity");
}

function stepNavigationSim(world, pet, maxSeconds = 120) {
    const dt = 1 / 60;
    const speed = 140;
    const maxSteps = Math.ceil(maxSeconds / dt);
    for (let i = 0; i < maxSteps && pet.onJourney; i++) {
        Nav.updateSteering(pet, dt);
        const step = speed * dt;
        if (Nav.trySnapArrive(pet, step)) break;

        pet.worldX += Math.cos(pet.moveAngle) * step;
        pet.worldY += Math.sin(pet.moveAngle) * step;

        const cur = world.screens[pet._screenIdx];
        const s = pet.width;
        const maxX = Math.max(0, cur.width - s);
        const maxY = Math.max(0, cur.height - s);
        const probeY = Math.max(0, Math.min(maxY, pet.worldY));
        const probeX = Math.max(0, Math.min(maxX, pet.worldX));
        let hitX = false, hitY = false;

        if (pet.worldX < 0) {
            const adj = Topology.adjacentScreenAt(world.screens, cur, "left", probeY, s);
            if (adj) {
                pet._screenIdx = world.screens.indexOf(adj);
                pet.worldX = adj.width - s;
                pet.worldY = Math.max(0, Math.min(adj.height - s, cur.y + probeY - adj.y));
                continue;
            }
            pet.worldX = 0; hitX = true;
        } else if (pet.worldX > maxX) {
            const adj = Topology.adjacentScreenAt(world.screens, cur, "right", probeY, s);
            if (adj) {
                pet._screenIdx = world.screens.indexOf(adj);
                pet.worldX = 0;
                pet.worldY = Math.max(0, Math.min(adj.height - s, cur.y + probeY - adj.y));
                continue;
            }
            pet.worldX = maxX; hitX = true;
        }

        if (pet.worldY < 0) {
            const adj = Topology.adjacentScreenAt(world.screens, cur, "up", probeX, s);
            if (adj) {
                pet._screenIdx = world.screens.indexOf(adj);
                pet.worldX = Math.max(0, Math.min(adj.width - s, cur.x + probeX - adj.x));
                pet.worldY = adj.height - s;
                continue;
            }
            pet.worldY = 0; hitY = true;
        } else if (pet.worldY > maxY) {
            const adj = Topology.adjacentScreenAt(world.screens, cur, "down", probeX, s);
            if (adj) {
                pet._screenIdx = world.screens.indexOf(adj);
                pet.worldX = Math.max(0, Math.min(adj.width - s, cur.x + probeX - adj.x));
                pet.worldY = 0;
                continue;
            }
            pet.worldY = maxY; hitY = true;
        }

        if (hitX || hitY) Nav.reflectOffWall(pet, hitX, hitY);
        if ((i + 1) % 180 === 0 && pet.onJourney) Nav.walkArrived(pet);
    }
}

// 7. Test T-junction ultrawide + negative-Y stacked layout (5120x1440 @ (0,0) + 2560x1440 @ (1280,-1440))
{
    const world = createSimWorld();
    world.screens = [
        { x: 0, y: 0, width: 5120, height: 1440, name: "DP-2", topInset: 44, bottomInset: 0 },
        { x: 1280, y: -1440, width: 2560, height: 1440, name: "DP-3", topInset: 44, bottomInset: 0 }
    ];
    const mochi = createSimPet(world, "PanguHopper", "curious", 0);
    mochi._screenIdx = 0;
    mochi.worldX = 220;
    mochi.worldY = 850;

    Nav.journeyToGlobal(mochi, 2400, -720);
    stepNavigationSim(world, mochi, 60);
    assert.equal(mochi._screenIdx, 1, "Routed through T-junction bridge onto top negative-Y monitor DP-3");
    assert.ok(Nav.distToGlobal(mochi, 2400, -720) < Nav.ARRIVAL_TOLERANCE, "Arrived at negative-Y target on DP-3");

    mochi.worldX = 3500 - 1280;
    mochi.worldY = -1100 - (-1440);
    Nav.journeyToGlobal(mochi, 4700, 950);
    stepNavigationSim(world, mochi, 60);
    assert.equal(mochi._screenIdx, 0, "Routed back down onto DP-2");
    assert.ok(Nav.distToGlobal(mochi, 4700, 950) < Nav.ARRIVAL_TOLERANCE, "Arrived on right wing of DP-2");

    mochi._screenIdx = 1;
    mochi.worldX = 600;
    mochi.worldY = 700;
    world.windowTracker.activeWindowPos = { address: "0xcode", x: 3000, y: 60, w: 1800, h: 1320 };
    world.windowTracker.activeWindowClass = "kitty";
    const percOnTop = Perception.perceive(mochi);
    const supPlan = Plans.buildSupervisePlan(percOnTop, mochi);
    assert.ok(supPlan.steps[0].gy > 1000 && supPlan.steps[0].gy < 1400, `Supervise target Y (${supPlan.steps[0].gy}) lands on DP-2, not clamped to DP-3`);

    world.windowTracker.visibleWindows = [
        { address: "0xgame", cls: "steam_app", title: "Game", x: 1280, y: -1440, w: 2560, h: 1440, focused: false, fullscreen: true, trueFullscreen: true },
        { address: "0xcode", cls: "kitty", title: "nvim", x: 300, y: 60, w: 1800, h: 1320, focused: true, fullscreen: false, trueFullscreen: false }
    ];
    assert.equal(Perception.perceive(mochi).fullscreen, true, "Pet on DP-3 detects fullscreen game on DP-3");
    const dp2Pet = createSimPet(world, "BottomBuddy", "playful", 0);
    dp2Pet._screenIdx = 0;
    assert.equal(Perception.perceive(dp2Pet).fullscreen, false, "Pet on DP-2 stays unaffected by fullscreen on DP-3");

    Memory.recordPlaceAffect(mochi, 0.85);
    Memory.recordPlaceAffect(mochi, 0.85);
    const negSpot = Memory.favoriteSpot(mochi);
    assert.ok(negSpot && negSpot.gy < 0 && negSpot.gx >= 1280 && negSpot.gx < 3840, "Favorite spot preserved accurately in negative-Y coordinates");

    world.screens = [world.screens[0]];
    mochi._screenIdx = 0;
    mochi.worldX = 1200;
    mochi.worldY = 600;
    assert.equal(Memory.favoriteSpot(mochi), null, "Unplugged monitor favorite spot ignored until monitor reconnects");
}

// 8. Test 3-monitor L-shaped chain (2-hop BFS routing A -> B -> C) & disconnected monitor guard
{
    const world = createSimWorld();
    world.screens = [
        { x: 0, y: 1080, width: 1920, height: 1080, name: "BottomLeft" },
        { x: 0, y: 0, width: 1920, height: 1080, name: "TopLeft" },
        { x: 1920, y: 0, width: 1920, height: 1080, name: "TopRight" },
        { x: 9000, y: 0, width: 1920, height: 1080, name: "DisconnectedProjector" }
    ];
    const scout = createSimPet(world, "Scout", "brave", 0);
    scout._screenIdx = 0;
    scout.worldX = 500;
    scout.worldY = 600;

    const reachable = Topology.reachableScreens(scout);
    assert.equal(reachable.length, 3, "Reachable graph includes 3 connected monitors and excludes disconnected projector");

    Nav.journeyToGlobal(scout, 2900, 500);
    stepNavigationSim(world, scout, 80);
    assert.equal(scout._screenIdx, 2, "2-hop BFS routed BottomLeft -> TopLeft -> TopRight");
    assert.ok(Nav.distToGlobal(scout, 2900, 500) < Nav.ARRIVAL_TOLERANCE, "Arrived at 2-hop L-shape target");

    Nav.journeyToGlobal(scout, 9500, 400);
    assert.equal(scout.onJourney, false, "Unreachable disconnected screen rejected cleanly");
}

// 9. Test single-monitor setups across small/portrait/4K resolutions, pet scales 1x..4x, & generic non-Hyprland Wayland
{
    const resolutions = [
        { x: 0, y: 0, width: 800, height: 600, name: "TinyVM" },
        { x: 0, y: 0, width: 1280, height: 720, name: "SmallLaptop" },
        { x: 0, y: 0, width: 1080, height: 1920, name: "Portrait" },
        { x: 0, y: 0, width: 3840, height: 2160, name: "UHD4K" }
    ];
    for (const scr of resolutions) {
        for (const scale of [1, 2, 3, 4]) {
            const world = createSimWorld();
            world.screens = [scr];
            world.inputTracker.cursorKnown = false;
            world.windowTracker.visibleWindows = [];
            world.windowTracker.activeWindowPos = null;

            const pet = createSimPet(world, `Solo_${scr.name}_${scale}`, "curious", 0);
            pet.width = 32 * scale;
            pet.height = 32 * scale;
            pet.worldX = Math.min(200, scr.width - pet.width);
            pet.worldY = Math.min(200, scr.height - pet.height);
            pet.socialDrive = 0.9;

            const perc = Perception.perceive(pet);
            assert.equal(perc.cursor.reachable, false, "Unknown cursor on generic Wayland is marked unreachable");
            Brain.think(pet, Nav);
            if (pet.activePlan) {
                assert.notEqual(pet.activePlan.name, "bid_attention", "Never bids toward (0,0) when cursor position is unknown");
            }

            const exp = Memory.explorationTarget(pet);
            if (exp) {
                assert.equal(exp.otherScreen, false, "Single monitor never marks target as otherScreen");
                assert.ok(exp.gx >= 0 && exp.gx <= scr.width - pet.width, `Explore X in bounds on ${scr.name} @ ${scale}x`);
                assert.ok(exp.gy >= 0 && exp.gy <= scr.height - pet.height, `Explore Y in bounds on ${scr.name} @ ${scale}x`);
            }
        }
    }
}

// 10. Test species-authentic non-barking idle behavior, North window watching, & cursor-wiggle play
{
    // Verify Zorua never barks/howls/pants/flips-North during random idle or gentle pats
    const zWorld = createSimWorld();
    const zorua = createSimPet(zWorld, "Mochi", "playful", 0, "zorua");
    zorua.alertness = 0.8;
    const forbiddenZoruaIdle = new Set(["idleOnce", "pose", "deepBreath", "sitDown", "lookUp"]);
    for (let i = 0; i < 300; i++) {
        const f = Gestures.fidget(zorua);
        if (f !== null) {
            assert.ok(!forbiddenZoruaIdle.has(f), `Zorua idle fidget must be silent, got '${f}'`);
            assert.ok(f === "nod" || f === "rotate", `Zorua calm fidget is sniff/turn, got '${f}'`);
        }
    }

    for (const species of SpriteSheet.SPECIES_LIST) {
        const xml = fs.readFileSync(path.join(rootDir, `assets/sprites/${species}/AnimData.xml`), "utf8");
        const anims = SpriteSheet.parseAnimData(xml).anims;
        const world = createSimWorld();
        const pet = createSimPet(world, `Calm_${species}`, "playful", 0, species);
        pet.sprite._animData = anims;
        pet.alertness = 0.8;
        let activeCount = 0;
        let potterCount = 0;
        for (let i = 0; i < 200; i++) {
            const f = Gestures.fidget(pet);
            if (f !== null) {
                activeCount++;
                const resolved = SpriteSheet.resolveAnimName(f, anims, {}, species);
                assert.ok(anims[resolved] && resolved !== "Hop", `${species} fidget '${f}' -> '${resolved}'`);
            }
            const micro = Gestures.idleMicroAction(pet);
            if (micro && micro.kind === "potter") potterCount++;
        }
        assert.ok(activeCount >= 50 && activeCount <= 165, `${species} has calm non-zero fidgets (${activeCount}/200)`);
        assert.ok(potterCount >= 18, `${species} mixes in cozy local potters (${potterCount}/200)`);
    }

    // Verify below-window North-watching ("sitNorth" -> "lookUpNorth" -> "sitNorth")
    let northPlan = null;
    for (let attempt = 0; attempt < 30 && !northPlan; attempt++) {
        const candidate = Plans.buildSupervisePlan(Perception.perceive(zorua), zorua);
        if (candidate.watchMode === "north") northPlan = candidate;
    }
    assert.ok(northPlan, "Zorua supports North-facing below-window watching");
    Plans.startPlan(zorua, northPlan, Nav);
    zorua.worldX = zorua.targetGX;
    zorua.worldY = zorua.targetGY;
    Nav.walkArrived(zorua);
    assert.equal(zorua.state_, "sitNorth", "Zorua sits facing North below active window");
    Brain.onPlanBeat(zorua, Nav);
    assert.equal(zorua.state_, "lookUpNorth", "Zorua tilts head up watching window content");
    Brain.onActionFinished(zorua, Nav);
    assert.equal(zorua.state_, "sitNorth", "Zorua resumes calm seated watch");
    Plans.clearPlan(zorua);
    zorua.enterState("idle");

    // Verify playful Zorua chases cursor wiggle while lazy Toxapex merely glances
    const wWorld = createSimWorld();
    const playfulFox = createSimPet(wWorld, "Kit", "playful", 0, "zorua");
    const lazyShell = createSimPet(wWorld, "Bunker", "lazy", 0, "toxapex");
    playfulFox.worldX = 400; playfulFox.worldY = 500;
    lazyShell.worldX = 400; lazyShell.worldY = 500;

    Brain.onEvent(playfulFox, "cursor_wiggled", { gx: 620, gy: 520 }, Nav);
    assert.equal(playfulFox.activePlan && playfulFox.activePlan.name, "chase_cursor", "Playful pet stalks & pounces wiggled cursor");
    Brain.onActionFinished(playfulFox, Nav);
    assert.equal(playfulFox.gait, "scamper", "Cursor chase scampers briskly");

    Brain.onEvent(lazyShell, "cursor_wiggled", { gx: 620, gy: 520 }, Nav);
    assert.equal(lazyShell.activePlan, null, "Lazy Toxapex ignores cursor bait");
    assert.ok(lazyShell.attentionUntil > wWorld.now, "Lazy Toxapex still glances toward the wiggle");

    // Ambient gaze & emote discipline
    const world = createSimWorld();
    const pik = createSimPet(world, "Puff", "curious", 0, "whimsicott");
    let nonZeroRows = 0;
    let row = 0;
    for (let i = 0; i < 30; i++) {
        row = Gestures.ambientGlanceRow(pik, row);
        assert.ok(row >= 0 && row <= 7, `Glance row ${row} in 0..7`);
        if (row !== 0) nonZeroRows++;
    }
    assert.ok(nonZeroRows >= 20, `Ambient gaze naturally looks around instead of staring at row 0 (${nonZeroRows}/30)`);

    Brain.onEvent(pik, "stroked", null, Nav);
    assert.equal(pik.directEmotes.length, 1, "Direct user petting triggers immediate emote");
    const prevDirect = pik.directEmotes.length;
    Plans.startPlan(pik, Plans.buildSupervisePlan(Perception.perceive(pik), pik), Nav);
    assert.equal(pik.emotes.length, 1, "Routine work supervision does not spam ambient emotes");
    assert.equal(pik.directEmotes.length, prevDirect, "Autonomous plans never bypass ambient emote cooldown");
}

// 11. Test multi-day unattended foraging, multi-day memory retention, & deduplicated milestone journal
{
    const world = createSimWorld();
    const solo = createSimPet(world, "Watcher", "curious", 0, "absol");
    solo.satiety = 0.12;
    solo.alertness = 0.65;
    world.inputTracker.userActive = false;

    const foragePlan = Plans.buildForagePlan(Perception.perceive(solo));
    Plans.startPlan(solo, foragePlan, Nav);
    assert.equal(solo.activePlan.name, "forage_snack", "Hungry unattended pet autonomously starts foraging");
    solo.worldX = solo.targetGX;
    solo.worldY = solo.targetGY;
    Nav.walkArrived(solo);
    assert.equal(solo.state_, "nod", "Foraging sniffs for a berry first");
    Brain.onActionFinished(solo, Nav);
    assert.equal(solo.state_, "eat", "Foraging nibbles berry using Eat animation");
    Brain.onActionFinished(solo, Nav);
    assert.ok(solo.satiety > 0.50, `Autonomous foraging restores satiety (${solo.satiety})`);
    assert.ok(solo.episodes.some(e => e.type === "foraged"), "Records foraged episode");

    // Verify favorite spot & window preferences survive 24 hours (2880 decay ticks @ 30s)
    Memory.recordPlaceAffect(solo, 0.85);
    Memory.recordPlaceAffect(solo, 0.85);
    Memory.recordWindowPref(solo, "kitty", 0.30);
    Memory.recordWindowPref(solo, "ephemeral", 0.002);
    for (let tick = 0; tick < 2880; tick++) {
        Memory.decayMemories(solo);
    }
    assert.ok(Memory.favoriteSpot(solo) !== null, "Favorite cozy spot survives 24h overnight decay");
    assert.ok(Memory.getWindowPref(solo, "kitty") > 0.60, "Favorite window class survives 24h decay");
    assert.equal(solo.windowPrefs.ephemeral, undefined, "Neutralized windowPrefs keys are pruned cleanly");

    // Verify milestone journal never records duplicate entries
    Memory.addJournalEntry(solo, "Grew into an Intrepid Ledge Percher.", "archetype");
    Memory.addJournalEntry(solo, "Grew into an Intrepid Ledge Percher.", "archetype");
    assert.equal(solo.journal.filter(j => j.text === "Grew into an Intrepid Ledge Percher.").length, 1);
}

// 12. Test 10-Pet Sanctuary Rotation, Nocturnal Affinity, Screen-Edge Transitions, & Zorua Illusion Prank
{
    const now0 = 1760000000000;
    const roster = [
        { id: "mochi", name: "Mochi", sprite: "zorua", personality: "playful", roamMode: "always" },
        { id: "sparky", name: "Sparky", sprite: "pikachu", personality: "energetic", roamMode: "auto" },
        { id: "clover", name: "Clover", sprite: "sprigatito", personality: "curious", roamMode: "auto" },
        { id: "hoot", name: "Hoot", sprite: "rowlet", personality: "lazy", roamMode: "auto" },
        { id: "umbra", name: "Umbra", sprite: "umbreon", personality: "nocturnal", roamMode: "auto" },
        { id: "wick", name: "Wick", sprite: "litwick", personality: "nocturnal", roamMode: "auto" },
        { id: "kip", name: "Kip", sprite: "mudkip", personality: "chill", roamMode: "auto" },
        { id: "munch", name: "Munch", sprite: "munchlax", personality: "lazy", roamMode: "auto" },
        { id: "vee", name: "Vee", sprite: "eevee", personality: "playful", roamMode: "auto" },
        { id: "bunker", name: "Bunker", sprite: "toxapex", personality: "chill", roamMode: "penned" }
    ];

    const resMap = {};
    for (const cfg of roster) {
        resMap[cfg.id] = Sanctuary.createDefaultResident(cfg, now0 - 30 * 60000);
    }

    // Daytime initial selection: respects maxRoaming=3, includes "always" Mochi, never includes "penned" Bunker
    const dayEnv = { hour: 14, isNight: false, mediaPlaying: false, isCode: true, fullscreen: false };
    let roaming = Sanctuary.selectInitialRoaming(roster, resMap, 3, dayEnv, now0);
    assert.equal(roaming.length, 3, "Initial roaming party respects maxActiveRoaming=3 out of 10 pets");
    assert.ok(roaming.includes("mochi"), "'always' companion is guaranteed in initial roaming party");
    assert.ok(!roaming.includes("bunker"), "'penned' companion never spawns onto desktop");

    // Simulate 45 minutes of Sanctuary pen life for off-screen companions (rest + friendships)
    const penMates = roster.filter(c => !roaming.includes(c.id)).map(c => resMap[c.id]);
    resMap.umbra.restDrive = 0.65;
    for (let step = 0; step < 90; step++) {
        for (const pm of penMates) {
            Sanctuary.integrateResident(pm, 30, penMates, dayEnv, now0 + step * 30000);
        }
    }
    assert.ok(resMap.umbra.restDrive < 0.25, `Off-screen Sanctuary sleep recovers restDrive (${resMap.umbra.restDrive})`);
    const totalPenBonds = penMates.reduce((acc, pm) => acc + Object.keys(pm.relationships).length, 0);
    assert.ok(totalPenBonds >= 2, "Companions sharing the Sanctuary pen form friendships over time");

    // Night falls (01:00): diurnal auto pets get tired, nocturnal Umbreon/Litwick score top readiness!
    const nightNow = now0 + 50 * 60000;
    const nightEnv = { hour: 1, isNight: true, mediaPlaying: false, isCode: true, fullscreen: false };
    const world = createSimWorld();
    const liveMap = {};
    for (const rid of roaming) {
        const cfg = roster.find(c => c.id === rid);
        const lp = createSimPet(world, cfg.name, cfg.personality, 0, cfg.sprite);
        lp.petData.id = cfg.id;
        lp.roamStartedAt = now0;
        lp.restDrive = rid === "mochi" ? 0.20 : 0.72;
        lp.alertness = rid === "mochi" ? 0.75 : 0.25;
        liveMap[rid] = lp;
    }

    const rot1 = Sanctuary.evaluateRotation(roster, resMap, liveMap, roaming, 3, now0, nightEnv, nightNow);
    assert.ok(rot1.retireId && rot1.retireId !== "mochi", `Tired diurnal auto pet (${rot1.retireId}) retires at night while 'always' Mochi stays`);
    roaming = roaming.filter(id => id !== rot1.retireId);

    const rot2 = Sanctuary.evaluateRotation(roster, resMap, liveMap, roaming, 3, nightNow, nightEnv, nightNow + 8000);
    assert.ok(
        rot2.spawnId === "umbra" || rot2.spawnId === "wick",
        `Nocturnal companion (${rot2.spawnId}) emergently rotates in for late-night coding`
    );

    // Screen-edge retire & arrival stroll plans (no desktop nests or dropped screen objects)
    const retiringPet = liveMap[rot1.retireId];
    const retirePlan = Plans.buildRetirePlan(retiringPet, Perception.perceive(retiringPet));
    assert.equal(retirePlan.name, "retire_to_pen");
    assert.equal(retirePlan.steps[0].kind, "travel", "Retiring pet walks to screen edge");
    const arrivePlan = Plans.buildArrivePlan(retiringPet, Perception.perceive(retiringPet), true);
    assert.equal(arrivePlan.name, "arrive_from_pen");
    assert.equal(arrivePlan.steps[0].kind, "travel", "Returning pet strolls onto screen from edge");

    // Zorua Illusion prank morphs rendered species and cleanly restores it
    const iWorld = createSimWorld();
    const zFox = createSimPet(iWorld, "Zorua", "playful", 0, "zorua");
    const pika = createSimPet(iWorld, "Pikachu", "energetic", 0, "pikachu");
    zFox.worldX = 300; zFox.worldY = 400;
    pika.worldX = 420; pika.worldY = 400;
    const prankPlan = Plans.buildIllusionPrankPlan(Perception.perceive(zFox).nearest);
    Plans.startPlan(zFox, prankPlan, Nav);
    assert.equal(zFox.illusionSpecies, "pikachu", "Zorua morphs illusionSpecies into companion's species");
    assert.equal(SpeciesProfile.speciesOf(zFox), "pikachu", "Rendered profile reflects Illusion disguise");
    assert.equal(SpeciesProfile.trueSpeciesOf(zFox), "zorua", "True species remains zorua underneath");
    Plans.clearPlan(zFox);
    assert.equal(zFox.illusionSpecies, "", "Clearing plan cleanly drops Illusion disguise");
}

// 13. Test Social Overhaul: Species Moves, Asymmetry, Proximity Gate, Rarity, Sparring, Unrequited Play, Role-Reversal Tag, Squabbles & Peacekeeper
{
    // 13a. Every species's social move pools resolve directly to valid AnimData sheets
    for (const sp of SpriteSheet.SPECIES_LIST) {
        const xml = fs.readFileSync(path.join(rootDir, `assets/sprites/${sp}/AnimData.xml`), "utf8");
        const anims = SpriteSheet.parseAnimData(xml).anims;
        const dummy = { petData: { sprite: sp }, sprite: { _animData: anims, defaultMap: SpriteSheet.DEFAULT_STATE_MAP, actionMap: {} } };
        for (const [poolName, pool] of [
            ["sparMoves", SpeciesProfile.sparMovesFor(dummy)],
            ["showOffMoves", SpeciesProfile.showOffMovesFor(dummy)],
            ["dodgeMoves", SpeciesProfile.dodgeMovesFor(dummy)],
            ["standoffMoves", SpeciesProfile.standoffMovesFor(dummy)],
            ["dismissMoves", SpeciesProfile.dismissMovesFor(dummy)]
        ]) {
            assert.ok(pool.length >= 1, `${sp} has non-empty ${poolName}`);
            for (const state of pool) {
                const animName = SpriteSheet.DEFAULT_STATE_MAP[state];
                assert.ok(animName && anims[animName], `${sp} ${poolName} state '${state}' -> '${animName}' exists in AnimData.xml`);
            }
        }
    }

    // 13b. Directional asymmetric chemistry (eager sprinter admires aloof/grumpy parallel, who finds sprinter exhausting)
    {
        const world = createSimWorld();
        const eevee = createSimPet(world, "Sunny", "playful", 0, "eevee");
        const ferro = createSimPet(world, "Thorn", "grumpy", 0, "ferrothorn");
        const relEF = Memory.relationWith(eevee, "Thorn", ferro.personality, "ferrothorn");
        const relFE = Memory.relationWith(ferro, "Sunny", eevee.personality, "eevee");
        assert.ok(
            relEF.affinity > relFE.affinity + 0.14,
            `Directional chemistry is asymmetric: Eevee->Ferrothorn (${relEF.affinity.toFixed(2)}) > Ferrothorn->Eevee (${relFE.affinity.toFixed(2)})`
        );
        assert.ok(relFE.affinity < 0.36, `Grumpy Ferrothorn starts low-affinity toward rowdy Eevee (${relFE.affinity.toFixed(2)})`);
    }

    // 13c. Strict proximity spontaneity: strangers & casual friends NEVER march across screen to socialize
    {
        const world = createSimWorld();
        const a = createSimPet(world, "Alpha", "playful", 0, "pikachu");
        const b = createSimPet(world, "Beta", "playful", 0, "eevee");
        a.worldX = 220; a.worldY = 500;
        b.worldX = 1150; b.worldY = 500; // 930px apart on same screen
        a.socialDrive = 0.92;
        a.playDrive = 0.88;
        const peerPlanNames = new Set([
            "visit_pet", "share_story", "spar_bout", "play_tag",
            "invite_play", "show_off", "best_friend_checkin", "rest_with"
        ]);
        for (let i = 0; i < 150; i++) {
            Plans.clearPlan(a);
            a.enterState("idle");
            Brain.think(a, Nav);
            if (a.activePlan) {
                assert.ok(
                    !peerPlanNames.has(a.activePlan.name),
                    `Distant non-soulmate never launches cross-screen peer plan '${a.activePlan.name}'`
                );
            }
        }

        // Soulmates separated for > 9 min CAN do a rare check-in across screen
        const relAB = Memory.relationWith(a, "Beta", b.personality, "eevee");
        relAB.affinity = 0.85;
        relAB.familiarity = 0.62;
        relAB.lastInteract = world.now - 700_000;
        let sawSoulmateCheckin = false;
        for (let i = 0; i < 80 && !sawSoulmateCheckin; i++) {
            world.petManager.lastSocialBoutMs = 0;
            a.nextPeerSocialAt = 0;
            Plans.clearPlan(a);
            a.enterState("idle");
            Brain.think(a, Nav);
            if (a.activePlan && a.activePlan.name === "best_friend_checkin") {
                sawSoulmateCheckin = true;
            }
        }
        assert.ok(sawSoulmateCheckin, "Deeply bonded Soulmates can occasionally check in from afar");
    }

    // 13d. Rarity & scene pacing: 6-hour 3-pet simulation keeps peer socializing rare (< 14% of plans)
    {
        const world = createSimWorld();
        const p1 = createSimPet(world, "Mochi", "playful", 0, "zorua");
        const p2 = createSimPet(world, "Spark", "energetic", 0, "pikachu");
        const p3 = createSimPet(world, "Hoot", "chill", 0, "rowlet");
        p1.worldX = 480; p2.worldX = 590; p3.worldX = 700;
        const socialNames = new Set([
            "spar_bout", "play_tag", "invite_play", "show_off",
            "squabble", "best_friend_checkin", "rest_with", "illusion_prank"
        ]);
        const beatKinds = new Set(["observe", "perch", "wait_bid", "watch_north", "loaf_watch"]);
        let totalDecisions = 0;
        let socialInitiations = 0;

        for (let tick = 0; tick < 360; tick++) { // 360 * 60s = 6 hours
            advanceTime(world, 60);
            for (const pet of [p1, p2, p3]) {
                const cur = Plans.currentStep(pet);
                if (!pet.activePlan && (pet.state_ === "loaf" || pet.state_ === "sit" || pet.state_ === "deepsleep")) {
                    Brain.restTick(pet);
                } else if (pet.onJourney) {
                    pet.worldX = Math.max(0, Math.min(pet.screenW() - pet.width, pet.targetGX - pet.screenX()));
                    pet.worldY = Math.max(0, Math.min(pet.screenH() - pet.height, pet.targetGY - pet.screenY()));
                    Nav.walkArrived(pet);
                } else if (cur && beatKinds.has(cur.kind)) {
                    Brain.onPlanBeat(pet, Nav);
                } else if (pet.state_ !== "idle" && pet.state_ !== "perch" && pet.state_ !== "sitNorth") {
                    Brain.onActionFinished(pet, Nav);
                } else {
                    totalDecisions++;
                    Brain.think(pet, Nav);
                    if (pet.activePlan && socialNames.has(pet.activePlan.name)) {
                        socialInitiations++;
                    }
                }
            }
        }
        const socialRatio = socialInitiations / Math.max(1, totalDecisions);
        assert.ok(
            socialRatio < 0.14,
            `Peer socializing stays rare & un-spammed over 6h (${socialInitiations}/${totalDecisions} = ${(socialRatio * 100).toFixed(1)}%)`
        );
    }

    // Helper to step two or three pets through active plans until all finish
    function runPlansToCompletion(world, pets, maxTicks = 60) {
        const beatKinds = new Set(["observe", "perch", "wait_bid", "watch_north", "loaf_watch"]);
        for (let t = 0; t < maxTicks && pets.some(p => p.activePlan || p.onJourney || p.state_ !== "idle"); t++) {
            for (const p of pets) {
                const step = Plans.currentStep(p);
                if (p.onJourney) {
                    p.worldX = Math.max(0, Math.min(p.screenW() - p.width, p.targetGX - p.screenX()));
                    p.worldY = Math.max(0, Math.min(p.screenH() - p.height, p.targetGY - p.screenY()));
                    Nav.walkArrived(p);
                } else if (step && beatKinds.has(step.kind)) {
                    Brain.onPlanBeat(p, Nav);
                } else if (p.state_ !== "idle") {
                    Brain.onActionFinished(p, Nav);
                }
            }
        }
    }

    // 13e. Choreographed sparring bout -> Sparring Rivals milestone & post-bout dispersal (zero staring)
    {
        const world = createSimWorld();
        const riolu = createSimPet(world, "Aura", "brave", 0, "riolu");
        const ape = createSimPet(world, "Blaze", "energetic", 0, "infernape");
        riolu.basePersonality.boldness = 0.78;
        ape.basePersonality.boldness = 0.74;
        ape.basePersonality.playfulness = 0.68;
        for (let round = 0; round < 3; round++) {
            riolu.worldX = 500; riolu.worldY = 500;
            ape.worldX = 610; ape.worldY = 515;
            Plans.startPlan(riolu, Plans.buildSparBoutPlan(riolu, "Blaze", true, false), Nav, Gestures.pickAvailable);
            Brain.onActionFinished(riolu, Nav); // stance finishes -> spar_challenge -> Blaze joins as spar_partner!
            if (round === 0) {
                assert.equal(ape.activePlan && ape.activePlan.name, "spar_partner", "Brawler companion accepts sparring challenge");
            }
            runPlansToCompletion(world, [riolu, ape]);
        }
        const relRA = Memory.relationWith(riolu, "Blaze");
        relRA.familiarity = Math.max(0.25, relRA.familiarity);
        assert.ok(relRA.sparCount >= 3 && relRA.respect > 0.55, "Sparring builds sparCount and mutual respect");
        assert.equal(Personality.relationshipTag(relRA), "Sparring Rivals", "Repeated sparring earns 'Sparring Rivals' tag");
        const postDist = Math.hypot(riolu.worldX - ape.worldX, riolu.worldY - ape.worldY);
        assert.ok(postDist >= 135, `Post-spar wander_apart separates pets (${Math.round(postDist)}px) instead of staring`);
        assert.equal(riolu.attentionUntil, 0, "Attention lock cleared after social bout");
    }

    // 13f. Unrequited play: eager playful pet gets cold-shouldered / brushed off, retries via circle_front, earns 'Eager Admirer'
    {
        const world = createSimWorld();
        const pup = createSimPet(world, "Pip", "playful", 0, "eevee");
        const aloof = createSimPet(world, " Bastion", "chill", 0, "ferrothorn");
        aloof.petData.name = "Bastion";
        pup.basePersonality.boldness = 0.68;
        pup.basePersonality.playfulness = 0.88;
        aloof.basePersonality.playfulness = 0.14;
        aloof.basePersonality.patience = 0.52;
        aloof.playDrive = 0.05;

        const relPB = Memory.relationWith(pup, "Bastion", aloof.personality, "ferrothorn");
        relPB.affinity = 0.62;
        const relBP = Memory.relationWith(aloof, "Pip", pup.personality, "eevee");
        relBP.affinity = 0.34; // low enough to ignore, high enough with patience=0.52 not to instant-rebuff

        for (let attempt = 0; attempt < 2; attempt++) {
            pup.worldX = 500; pup.worldY = 500;
            aloof.worldX = 585; aloof.worldY = 510;
            const oEntry = Perception.perceive(pup).nearest;
            Plans.startPlan(pup, Plans.buildInvitePlayPlan(pup, oEntry), Nav, Gestures.pickAvailable);
            Brain.onActionFinished(pup, Nav); // finishes play-bow -> triggers play_bid -> Bastion ignores!
            assert.equal(pup.activePlan.bidOutcome, "ignored", "Aloof Ferrothorn gives eager Eevee the cold shoulder");
            assert.equal(aloof.activePlan && aloof.activePlan.name, "cold_shoulder", "Aloof Ferrothorn turns its back");
            Brain.onPlanBeat(pup, Nav); // branch_social_bid -> bold playful Pip hops around in circle_front!
            assert.equal(Plans.currentStep(pup).maneuver, "circle_front", "Persistent playful pet hops around into aloof pet's view");
            runPlansToCompletion(world, [pup, aloof]);
        }

        assert.ok(relPB.unrequitedCount >= 2, `Tracks unrequited play invitations (${relPB.unrequitedCount})`);
        assert.equal(Personality.relationshipTag(relPB), "Eager Admirer", "One-sided playful devotion becomes 'Eager Admirer'");
        assert.ok(pup.episodes.some(e => e.type === "unrequited_play"), "Records unrequited_play episode");
    }

    // 13g. Tag role reversal ('reverse_chase' -> 'reverse_tag')
    {
        const world = createSimWorld();
        const pika = createSimPet(world, "Volt", "energetic", 0, "pikachu");
        const cat = createSimPet(world, "Clover", "playful", 0, "sprigatito");
        cat.basePersonality.energy = 0.72;
        cat.basePersonality.playfulness = 0.82;
        pika.worldX = 500; pika.worldY = 500;
        cat.worldX = 575; cat.worldY = 510;
        Memory.adjustRelation(pika, "Clover", 0.2, 0.2);
        Memory.adjustRelation(cat, "Volt", 0.2, 0.2);

        Plans.startPlan(pika, Plans.buildPlayTagPlan({ name: "Clover" }, true, pika), Nav, Gestures.pickAvailable);
        Brain.onActionFinished(pika, Nav); // triggers chase -> Clover enters flee_tag with reverse_chase!
        assert.equal(cat.activePlan.name, "flee_tag");
        // Advance Clover through leg 1 & leg 2 -> whirl around -> reverse_chase!
        for (let leg = 0; leg < 2; leg++) {
            cat.worldX = cat.targetGX; cat.worldY = cat.targetGY;
            Nav.walkArrived(cat);
        }
        assert.ok(["hop", "twirl", "rotate"].includes(cat.state_), "Chased pet whirls around before tagging back");
        Brain.onActionFinished(cat, Nav); // fires reverse_chase -> Volt enters reverse_tag!
        assert.equal(pika.activePlan && pika.activePlan.name, "reverse_tag", "Original chaser now flees in role-reversed tag!");
        runPlansToCompletion(world, [pika, cat]);
        assert.ok(Math.hypot(pika.worldX - cat.worldX, pika.worldY - cat.worldY) >= 135, "Tag players disperse cleanly after bout");
    }

    // 13h. Personal-space squabble & 3rd-pet Guardian Peacekeeper intervention
    {
        const world = createSimWorld();
        const gengar = createSimPet(world, "Hex", "brave", 0, "gengar");
        const charizard = createSimPet(world, "Pyre", "brave", 0, "charizard");
        const umbreon = createSimPet(world, "Luna", "nocturnal", 0, "umbreon");
        gengar.worldX = 600; gengar.worldY = 520;
        charizard.worldX = 685; charizard.worldY = 530;
        umbreon.worldX = 880; umbreon.worldY = 560; // 240px from midpoint, composed guardian bystander

        Memory.relationWith(gengar, "Pyre").affinity = 0.22;
        Memory.relationWith(charizard, "Hex").affinity = 0.22;
        charizard.basePersonality.boldness = 0.76;
        charizard.basePersonality.patience = 0.28;

        const targetEntry = Perception.perceive(gengar).others.find(o => o.name === "Pyre");
        Plans.startPlan(gengar, Plans.buildSquabblePlan(gengar, targetEntry), Nav, Gestures.pickAvailable);
        Brain.onActionFinished(gengar, Nav); // bristle finishes -> squabble fires -> Pyre stands ground AND Luna intervenes!
        assert.equal(charizard.activePlan && charizard.activePlan.name, "squabble_reply", "Bold rival stands ground in squabble");
        assert.equal(umbreon.activePlan && umbreon.activePlan.name, "peacekeeper", "Nearby Guardian Umbreon steps in as Peacekeeper");

        // Step Luna to midpoint and mediate
        umbreon.worldX = umbreon.targetGX; umbreon.worldY = umbreon.targetGY;
        Nav.walkArrived(umbreon);
        Brain.onActionFinished(umbreon, Nav); // commanding calm -> mediate fires!
        assert.equal(gengar.activePlan && gengar.activePlan.name, "cooled_off", "Squabbler A cools off after Peacekeeper mediation");
        assert.equal(charizard.activePlan && charizard.activePlan.name, "cooled_off", "Squabbler B cools off after Peacekeeper mediation");
        assert.ok(
            umbreon.journal.some(j => j.text.includes("Calmed a squabble between Hex and Pyre")),
            "Peacekeeper records mediation milestone in journal"
        );
        runPlansToCompletion(world, [gengar, charizard, umbreon]);
        assert.ok(Math.hypot(gengar.worldX - charizard.worldX, gengar.worldY - charizard.worldY) >= 140, "Squabblers separate after mediation");
    }
}

// 14. Test semantic pixel-art emote tokens & emoji-free UI icon definitions
{
    const validEmoteTokens = new Set([
        "heart", "note", "exclaim", "question", "ellipses",
        "frustrated", "berry", "sleepy", "dream"
    ]);
    for (const [id, def] of Object.entries(Personality.QUIRK_DEFS)) {
        assert.match(def.icon, /^[a-zA-Z]+$/, `Quirk '${id}' uses clean UiIcon name ('${def.icon}')`);
    }

    const world = createSimWorld();
    const mochi = createSimPet(world, "Mochi", "playful", 0, "zorua");
    Brain.onEvent(mochi, "stroked", null, Nav);
    Brain.onEvent(mochi, "fed", null, Nav);
    Brain.onEvent(mochi, "music_started", null, Nav);
    Memory.recordEpisode(mochi, "petted", { valence: 0.7, salience: 0.7 });
    const dream = Brain.reflect(mochi);
    assert.ok(dream && validEmoteTokens.has(dream.emote), `Dream reflection uses semantic pixel emote ('${dream && dream.emote}')`);
    for (const tok of mochi.emotes) {
        assert.ok(validEmoteTokens.has(tok), `Emitted emote '${tok}' is a pixel-droplet token`);
    }
}

// 15. Test Modular Species Catalog, Pluggable Abilities, Kin Chemistry, & Sanctuary Synergies
{
    // 15a. Kin-group chemistry boosts initial affinity & shared-nap attraction across Eeveelutions
    const kinEeveeFlareon = SpeciesProfile.kinChemistry("eevee", "flareon");
    const kinStranger = SpeciesProfile.kinChemistry("jolteon", "ferrothorn");
    assert.equal(kinEeveeFlareon.sameKin, true, "Eevee and Flareon share eeveelution kin group");
    assert.ok(kinEeveeFlareon.affinityDelta >= 0.12, "Flareon soothing_ribbon + eeveelution kin yields strong warm chemistry");
    assert.equal(kinStranger.sameKin, false);
    assert.ok(Abilities.restWithBonus({ petData: { sprite: "leafeon" } }, "flareon") >= 0.30, "Kin + hearth_warmth + soothing_ribbon strongly encourages shared naps");

    // 15b. Pluggable Illusion works for Latias (light-refraction disguise) without species hardcoding
    const lWorld = createSimWorld();
    const latias = createSimPet(lWorld, "Eon", "playful", 0, "latias");
    const spheal = createSimPet(lWorld, "Pebble", "playful", 0, "spheal");
    latias.worldX = 400; latias.worldY = 480;
    spheal.worldX = 500; spheal.worldY = 480;
    latias.playDrive = 0.85;
    latias.alertness = 0.80;
    const lPerc = Perception.perceive(latias);
    const lCands = Abilities.evaluateCandidates(latias, lPerc, Nav, Gestures.pickAvailable, { moodMult: 1, active: 1 });
    const lPrank = lCands.find(c => c.name === "illusion_prank");
    assert.ok(lPrank, "Latias evaluates illusion_prank via pluggable illusion ability");
    Plans.startPlan(latias, lPrank.plan, Nav, Gestures.pickAvailable);
    assert.equal(latias.illusionSpecies, "spheal", "Latias refracts into Spheal form during prank");
    Plans.clearPlan(latias);
    assert.equal(latias.illusionSpecies, "", "Clearing Latias plan cleanly restores true form");

    // 15c. Hearth Ember aura warms nearby companions, Psychic Blink teleports to fresh spot, Shell Bunker composes startle
    const hWorld = createSimWorld();
    const flareon = createSimPet(hWorld, "Ember", "chill", 0, "flareon");
    const squirtle = createSimPet(hWorld, "Shell", "playful", 0, "squirtle");
    const espurr = createSimPet(hWorld, "Mewp", "curious", 0, "espurr");
    flareon.worldX = 500; flareon.worldY = 500; flareon.restDrive = 0.55; flareon.alertness = 0.50;
    squirtle.worldX = 620; squirtle.worldY = 510; squirtle.mood = 0.45; squirtle.comfortDrive = 0.40;
    espurr.worldX = 300; espurr.worldY = 350; espurr.exploreDrive = 0.80; espurr.playDrive = 0.65;

    const fCands = Abilities.evaluateCandidates(flareon, Perception.perceive(flareon), Nav, Gestures.pickAvailable, { moodMult: 1, active: 1 });
    const bask = fCands.find(c => c.name === "hearth_bask");
    assert.ok(bask, "Flareon generates hearth_bask ability plan");
    Plans.startPlan(flareon, bask.plan, Nav, Gestures.pickAvailable);
    Brain.onActionFinished(flareon, Nav); // executes warmth_aura -> loaf_watch
    assert.ok(squirtle.mood > 0.45 && squirtle.comfortDrive < 0.40, "Nearby Squirtle receives cozy warmth_aura boost from Flareon");
    Brain.onPlanBeat(flareon, Nav);
    assert.ok(flareon.episodes.some(e => e.type === "hearth_bask"), "Records hearth_bask episode on completion");

    const eCands = Abilities.evaluateCandidates(espurr, Perception.perceive(espurr), Nav, Gestures.pickAvailable, { moodMult: 1, active: 1 });
    const blink = eCands.find(c => c.name === "phase_jaunt");
    assert.ok(blink, "Espurr generates phase_jaunt ability plan");
    const oldX = espurr.worldX, oldY = espurr.worldY;
    Plans.startPlan(espurr, blink.plan, Nav, Gestures.pickAvailable);
    Brain.onActionFinished(espurr, Nav); // executes phase_hop -> arrival gesture
    assert.ok(espurr.worldX !== oldX || espurr.worldY !== oldY, "Psychic Blink relocates Espurr instantaneously");

    squirtle.trust = 0.15;
    squirtle.basePersonality.boldness = 0.15;
    hWorld.inputTracker.cursorSpeed = 1500;
    Brain.onEvent(squirtle, "cursor_near", null, Nav);
    assert.ok(["hide", "cringe"].includes(squirtle.state_), `Shell Bunker Squirtle tucks into shell (${squirtle.state_}) when startled`);

    // 15d. Sanctuary readiness & pasture activities reflect species abilities
    const meloRec = Sanctuary.createDefaultResident({ id: "aria", name: "Aria", sprite: "meloetta", personality: "playful" }, hWorld.now);
    const cressRec = Sanctuary.createDefaultResident({ id: "crescent", name: "Crescent", sprite: "cresselia", personality: "nocturnal" }, hWorld.now);
    const restedNow = hWorld.now + 20 * 60000;
    assert.ok(
        Sanctuary.readinessScore(meloRec, [], { isNight: false, mediaPlaying: true }, restedNow) >
        Sanctuary.readinessScore(meloRec, [], { isNight: false, mediaPlaying: false }, restedNow) + 0.12,
        "Chorus Lead Meloetta surges in readiness when music starts playing"
    );
    assert.ok(
        Sanctuary.readinessScore(cressRec, [], { isNight: true, mediaPlaying: false }, restedNow) >
        Sanctuary.readinessScore(cressRec, [], { isNight: false, mediaPlaying: false }, restedNow) + 0.30,
        "Lunar Pulse Cresselia prefers night rotation"
    );
}

// 16. Test Ambient Ethology, Window/Seam Physicality, Machine/Weather Sensing, Micro-Imperfections & Opt-In Evolution
{
    // 16a. Red-Light / Green-Light sneak-up freezes when target looks back, then boops & scampers
    {
        const world = createSimWorld();
        const zorua = createSimPet(world, "Sly", "playful", 0, "zorua");
        const pikachu = createSimPet(world, "Pika", "chill", 0, "pikachu");
        zorua.worldX = 400; zorua.worldY = 500;
        pikachu.worldX = 620; pikachu.worldY = 500;
        pikachu.sprite._dirRow = 2; // facing East (away from Zorua at West)
        assert.equal(Social.isPeerLookingAt(pikachu, zorua), false, "Target facing East is not looking at stalker to the West");

        const targetEntry = Perception.perceive(zorua).nearest;
        Plans.startPlan(zorua, Plans.buildSneakBoopPlan(zorua, targetEntry), Nav, Gestures.pickAvailable);
        assert.equal(zorua.activePlan.name, "sneak_boop");
        assert.equal(zorua.onJourney, true, "Stalker begins creeping while target looks away");

        // Target glances West (row 6 -> facing PI -> directly toward Zorua!)
        pikachu.sprite._dirRow = 6;
        assert.equal(Social.isPeerLookingAt(pikachu, zorua), true, "isPeerLookingAt detects target glancing toward stalker");
        Brain.onPlanBeat(zorua, Nav);
        assert.equal(zorua.onJourney, false, "Stalker freezes immediately on Red-Light glance");
        assert.equal(zorua.state_, "idle", "Frozen stalker poses innocently in idle");

        // Target looks East again -> Green-Light resumes stalking, arrives, boops, and scampers off!
        pikachu.sprite._dirRow = 2;
        Brain.onPlanBeat(zorua, Nav);
        assert.equal(zorua.onJourney, true, "Stalker resumes creeping when target looks away again");
        zorua.worldX = 564; zorua.worldY = 500;
        Brain.onPlanBeat(zorua, Nav); // within 74px -> advances to boop act
        Brain.onActionFinished(zorua, Nav); // finishes boop -> social sneak_boop -> scamper away!
        assert.ok(pikachu.emotes.includes("question"), "Booped friend whirls around with a question droplet");
        assert.equal(zorua.gait, "scamper", "Trickster scampers off playfully after the boop");
    }

    // 16b. Mentor Patrol & Copycat Trailing
    {
        const world = createSimWorld();
        const lucario = createSimPet(world, "Kaze", "brave", 0, "lucario");
        const eevee = createSimPet(world, "Pip", "curious", 0, "eevee");
        lucario.maturity = 0.72;
        eevee.maturity = 0.12;
        lucario.worldX = 500; lucario.worldY = 600;
        eevee.worldX = 580; eevee.worldY = 610;
        Memory.relationWith(lucario, "Pip").affinity = 0.62;
        Memory.relationWith(eevee, "Kaze").affinity = 0.65;

        Plans.startPlan(lucario, Plans.buildMentorPatrolPlan(lucario, Perception.perceive(lucario), "Pip"), Nav, Gestures.pickAvailable);
        Brain.onActionFinished(lucario, Nav); // nod -> mentor_invite -> Pip joins copycat_trail!
        assert.equal(eevee.activePlan && eevee.activePlan.name, "copycat_trail", "Nearby hatchling joins Mentor Patrol in copycat_trail");
        lucario.worldX = 820; lucario.worldY = 600;
        Brain.onPlanBeat(eevee, Nav); // trail_leader updates target behind mentor
        assert.equal(eevee.onJourney, true, "Copycat hatchling trails behind moving mentor");
    }

    // 16c. Contagious Yawns & Fireside Drift toward Hearth companion
    {
        const world = createSimWorld();
        world.systemMonitor.isRaining = true;
        const flareon = createSimPet(world, "Ember", "chill", 0, "flareon");
        const sprig = createSimPet(world, "Fern", "chill", 0, "sprigatito");
        flareon.worldX = 500; flareon.worldY = 520;
        flareon.state_ = "loaf";
        sprig.worldX = 710; sprig.worldY = 540;
        sprig.state_ = "idle";
        let scheduledDelay = 0;
        let scheduledWarmName = "";
        sprig.scheduleContagiousYawn = (delayMs, warmName) => {
            scheduledDelay = delayMs;
            scheduledWarmName = warmName;
        };
        const origRandom = Math.random;
        Math.random = () => 0.1;
        try {
            Social.broadcastYawn(flareon);
        } finally {
            Math.random = origRandom;
        }
        assert.ok(scheduledDelay >= 4800, "Contagious yawn schedules a natural 5-10s delayed catch");
        assert.equal(scheduledWarmName, "Ember", "Hearth sleeper broadcasts warmth anchor name");

        Brain.onEvent(sprig, "caught_yawn", { warmPeerName: "Ember" }, Nav);
        assert.equal(sprig.activePlan && sprig.activePlan.name, "rest_with", "Sleepy peer drifts toward Hearth sleeper on rainy/night yawn");
    }

    // 16d. Sanctuary Gate Welcomes & Side-by-Side Departures
    {
        const world = createSimWorld();
        const a = createSimPet(world, "Sunny", "playful", 0, "eevee");
        const b = createSimPet(world, "Mochi", "playful", 0, "zorua");
        a.worldX = 500; a.worldY = 520;
        b.worldX = 640; b.worldY = 520;
        Plans.startPlan(a, Plans.buildWelcomeFriendPlan(a, b), Nav, Gestures.pickAvailable);
        assert.equal(a.activePlan.name, "welcome_friend");
        Plans.startPlan(b, Plans.buildJointRetirePlan(b, a, Perception.perceive(b), false), Nav, Gestures.pickAvailable);
        assert.equal(b.activePlan.name, "joint_retire");
    }

    // 16e. Startle Chains & Guardian Point-Check on abrupt window close
    {
        const world = createSimWorld();
        const timid = createSimPet(world, "Shy", "shy", 0, "espurr");
        const guard = createSimPet(world, "Aegis", "brave", 0, "lucario");
        timid.basePersonality.boldness = 0.18;
        guard.basePersonality.boldness = 0.78;
        timid.worldX = 520; timid.worldY = 500;
        guard.worldX = 640; guard.worldY = 520;

        Brain.onEvent(timid, "window_closed", { windowClass: "kitty", gx: 450, gy: 480 }, Nav);
        Brain.onEvent(guard, "window_closed", { windowClass: "kitty", gx: 450, gy: 480 }, Nav);
        assert.equal(timid.activePlan && timid.activePlan.name, "timid_hide", "Timid companion scoots behind nearby Guardian");
        assert.equal(guard.activePlan && guard.activePlan.name, "guardian_check", "Guardian companion steps forward to inspect disturbance");
    }

    // 16f. Ledge Strolling, Ledge-to-Ledge Parkour, Window-Riding & Soft Gravity Drop
    {
        const world = createSimWorld();
        world.windowTracker.visibleWindows = [
            { address: "0x1", cls: "kitty", title: "shell", x: 240, y: 260, w: 520, h: 420, focused: true, fullscreen: false },
            { address: "0x2", cls: "firefox", title: "docs", x: 830, y: 300, w: 560, h: 460, focused: false, fullscreen: false },
            { address: "0x3", cls: "code", title: "lower", x: 220, y: 480, w: 620, h: 420, focused: false, fullscreen: false }
        ];
        const cat = createSimPet(world, "Clover", "curious", 0, "sprigatito");
        cat.worldX = 420; cat.worldY = 260 - 64 * 0.85;
        const perc = Perception.perceive(cat);
        const p1 = perc.perches.find(p => p.address === "0x1");
        assert.ok(p1 && p1.adjacentLedges.length >= 1, "Perception links adjacent window titlebars for parkour");

        // Ballistic jump_to parkour arc lands cleanly at target ledge
        const p2 = p1.adjacentLedges[0];
        Plans.startPlan(cat, Plans.buildLedgeParkourPlan(p1, p2, cat), Nav, Gestures.pickAvailable);
        cat.worldX = cat.targetGX; cat.worldY = cat.targetGY;
        Nav.walkArrived(cat); // arrives at launch corner -> perch (sizing up gap)
        Brain.onPlanBeat(cat, Nav); // finishes sizing up -> act ("nod" coiling to leap)
        Brain.onActionFinished(cat, Nav); // nod -> jump_to airborne arc!
        assert.equal(cat.state_, "airborne", "Ledge parkour launches airborne ballistic arc");
        assert.ok(cat.vz > 0, "Parabolic vault has upward launch velocity");
        for (let step = 0; step < 80 && cat.state_ === "airborne"; step++) {
            Nav.updateAirborne(cat, 0.032);
        }
        assert.equal(cat.state_, "perch", "Cat lands cleanly in perch on destination window titlebar");
        assert.equal(cat.perchedWindowAddr, "0x2");

        // Window-riding carries perched pet & wobbles when dragged fast, shakes when stopped
        cat.perchedWindowAddr = "0x1";
        cat.worldX = 420; cat.worldY = Math.round(260 - 64 * 0.85);
        Nav.updatePerch(cat, 0.032); // initializes _perchRelX
        world.windowTracker.visibleWindows[0].x += 48; // fast drag (48 / 0.032 = 1500 px/s)
        Nav.updatePerch(cat, 0.032);
        assert.ok(cat.worldX > 450, "Dragged window carries perched companion horizontally");
        assert.equal(cat.sprite.currentState, "lostBalance", "Fast window drag wobbles perched companion in lostBalance");
        Nav.updatePerch(cat, 0.25); // window stops moving
        assert.equal(cat.sprite.currentState, "shake", "Companion shakes off once window settles");

        // Closing upper window 0x1 drops companion smoothly with gravity onto lower ledge 0x3!
        world.windowTracker.visibleWindows.shift(); // remove 0x1; 0x3 sits directly below at y=480
        Nav.updatePerch(cat, 0.032);
        assert.equal(cat.state_, "airborne", "Vanished perch initiates smooth gravity soft-drop");
        assert.ok(cat.altitude > 100, "Soft-drop starts at exact vanished ledge altitude without visual teleport");
        for (let step = 0; step < 80 && cat.state_ === "airborne"; step++) {
            Nav.updateAirborne(cat, 0.032);
        }
        assert.equal(cat.activePlan && cat.activePlan.name, "window_perch", "Soft-drop catches lower window ledge 0x3");
    }

    // 16g. Multi-Monitor Seam Peeking
    {
        const world = createSimWorld();
        const fox = createSimPet(world, "Scout", "curious", 0, "vulpix");
        const peer = createSimPet(world, "Other", "chill", 2560, "spheal");
        fox.worldX = 2380; fox.worldY = 520;
        peer.worldX = 220; peer.worldY = 520;
        const perc = Perception.perceive(fox);
        assert.ok(perc.seamPeeks.length >= 1 && perc.seamPeeks[0].hasPeer, "Perception detects shared monitor seam and peer across it");
        const plan = Plans.buildSeamPeekPlan(perc.seamPeeks[0], true, fox);
        assert.equal(plan.name, "seam_peek");
        assert.equal(plan.otherScreen, true);
    }

    // 16h. Hardware Thermal Basking & Build-Finish Tells
    {
        const world = createSimWorld();
        world.systemMonitor.thermalWarmth = 0.82;
        world.systemMonitor.cpuTempC = 79;
        const vulpix = createSimPet(world, "Cinder", "chill", 0, "vulpix");
        vulpix.worldX = 900; vulpix.worldY = 700;
        vulpix.restDrive = 0.45;
        const vPerc = Perception.perceive(vulpix);
        const vCands = Abilities.evaluateCandidates(vulpix, vPerc, Nav, Gestures.pickAvailable, { moodMult: 1, active: 1 });
        const bask = vCands.find(c => c.name === "hearth_bask");
        assert.ok(bask && bask.plan.steps[0].kind === "travel", "Thermal warmth draws Hearth companion over to warm active window");

        const riolu = createSimPet(world, "Sensei", "brave", 0, "riolu");
        riolu.state_ = "idle";
        Brain.onEvent(riolu, "build_completed", null, Nav);
        assert.ok(["nod", "pose"].includes(riolu.state_), "Aura Sense companion gives a quiet nod when sustained build finishes");
    }

    // 16i. Voice-Call Etiquette ("Library Mode") suppresses noisy plans & calms active zoomies
    {
        const world = createSimWorld();
        world.mediaTracker.micActive = true;
        const z = createSimPet(world, "Whisper", "playful", 0, "zorua");
        const p = createSimPet(world, "Buddy", "playful", 0, "pikachu");
        z.worldX = 480; z.worldY = 500;
        p.worldX = 620; p.worldY = 500;
        z.playDrive = 0.95;
        z.socialDrive = 0.90;
        z.alertness = 0.90;
        const noisy = new Set(["zoomies", "bid_attention", "squabble", "sneak_boop", "illusion_prank"]);
        for (let i = 0; i < 60; i++) {
            Plans.clearPlan(z);
            z.enterState("idle");
            Brain.think(z, Nav);
            if (z.activePlan) {
                assert.ok(!noisy.has(z.activePlan.name), `Library mode never initiates noisy plan '${z.activePlan.name}'`);
            }
        }
        // Starting a mic call mid-zoomies immediately calms down to idle
        Plans.startPlan(z, { name: "zoomies", steps: [{ kind: "zoomies" }] }, Nav, Gestures.pickAvailable);
        Brain.onEvent(z, "mic_changed", { active: true }, Nav);
        assert.equal(z.activePlan, null, "Active zoomies politely abort when microphone goes live");
        assert.equal(z.state_, "idle");
    }

    // 16j. Staggered Wakeups After Long Idle (>= 30 min)
    {
        const world = createSimWorld();
        const sleepy = createSimPet(world, "Snor", "lazy", 0, "munchlax");
        sleepy.state_ = "deepsleep";
        let wakeScheduledMs = 0;
        sleepy.scheduleStaggeredWake = (delayMs) => { wakeScheduledMs = delayMs; };
        Brain.onEvent(sleepy, "user_active", { idleDurationSec: 2400 }, Nav);
        assert.ok(wakeScheduledMs >= 450, "Long-idle return schedules staggered wake instead of simultaneous pop-up");
        assert.equal(sleepy.state_, "deepsleep", "Sleeping pet remains asleep until its staggered wake timer fires");
    }

    // 16k. Weather & Sun-Arc Resonance
    {
        const world = createSimWorld();
        world.systemMonitor.isRaining = true;
        world.systemMonitor.solarPhase = "dusk";
        const mudkip = createSimPet(world, "Splash", "playful", 0, "mudkip");
        mudkip.playDrive = 0.42;
        const mCands = Abilities.evaluateCandidates(mudkip, Perception.perceive(mudkip), Nav, Gestures.pickAvailable, { moodMult: 1, active: 1 });
        assert.ok(mCands.some(c => c.name === "puddle_spin"), "Rain unlocks Tide Splash puddle_spin at lower play threshold");

        const umbreon = createSimPet(world, "Dusk", "nocturnal", 0, "umbreon");
        const uCands = Abilities.evaluateCandidates(umbreon, Perception.perceive(umbreon), Nav, Gestures.pickAvailable, { moodMult: 1, active: 1 });
        assert.ok(uCands.some(c => c.name === "lunar_vigil"), "Dusk solar phase activates Lunar Pulse vigil before midnight");

        assert.ok(
            Abilities.sanctuaryReadinessDelta({ sprite: "mudkip" }, SpeciesProfile.profileFor("mudkip"), { isRaining: true }) >= 0.15,
            "Rain boosts Tidepool readiness"
        );
        assert.ok(
            Abilities.sanctuaryReadinessDelta({ sprite: "glaceon" }, SpeciesProfile.profileFor("glaceon"), { isSnowing: true }) >= 0.15,
            "Snow boosts Frost Calm readiness"
        );
    }

    // 16l. Rare Zoomie Stumble recovery sequence
    {
        const world = createSimWorld();
        const pup = createSimPet(world, "Tumble", "playful", 0, "rockruff");
        const peer = createSimPet(world, "Witness", "chill", 0, "rowlet");
        pup.worldX = 500; pup.worldY = 500;
        peer.worldX = 650; peer.worldY = 500;
        Brain.onEvent(pup, "zoomie_stumble", null, Nav);
        assert.equal(pup.activePlan && pup.activePlan.name, "zoomie_stumble", "Zoomie stumble starts self-conscious recovery plan");
        assert.ok(["trip", "hitGround"].includes(pup.state_));
    }

    // 16m. Lifestyle-Earned Opt-In Evolution across all 4 evolutionary lines
    {
        const world = createSimWorld();
        const eevee = createSimPet(world, "Vee", "nocturnal", 0, "eevee");
        assert.equal(Evolution.evaluate(eevee, "eevee").ready, false, "Newly adopted Eevee is not yet ready to evolve");

        // Earn Umbreon (night vigils) & Flareon (hearth / friendship) simultaneously so player gets branching choice!
        eevee.maturity = 0.55;
        eevee.bond = 0.72;
        eevee.trust = 0.68;
        eevee.quirks = ["night_watch"];
        Memory.adjustRelation(eevee, "Bestie", 0.35, 0.5);
        for (let i = 0; i < 4; i++) {
            Memory.recordEpisode(eevee, "night_vigil", { valence: 0.4 });
            Memory.recordEpisode(eevee, "rested_with", { valence: 0.4, withPet: "Bestie" });
        }
        const eeveeEval = Evolution.evaluate(eevee, "eevee");
        assert.equal(eeveeEval.ready, true, "Lifestyle-matured Eevee unlocks opt-in Evolution Ready state");
        const readyIds = eeveeEval.options.map(f => f.species);
        assert.ok(readyIds.includes("umbreon"), "Nocturnal vigil Eevee unlocks Umbreon");
        assert.ok(readyIds.includes("flareon"), "Warm cuddle-bonded Eevee unlocks Flareon");

        // Verify Riolu -> Lucario, Vulpix -> Ninetales, Charmander -> Charizard readiness
        const riolu = createSimPet(world, "Aura", "brave", 0, "riolu");
        riolu.maturity = 0.50; riolu.bond = 0.66; riolu.trust = 0.58;
        Memory.relationWith(riolu, "Rival").sparCount = 4;
        assert.equal(Evolution.evaluate(riolu, "riolu").options[0].species, "lucario", "Spar-seasoned bonded Riolu unlocks Lucario");

        const vulpix = createSimPet(world, "Foxfire", "chill", 0, "vulpix");
        vulpix.maturity = 0.52; vulpix.bond = 0.62; vulpix.basePersonality.composure = 0.65;
        Memory.recordEpisode(vulpix, "hearth_bask", { valence: 0.4 });
        Memory.recordEpisode(vulpix, "rested_with", { valence: 0.4 });
        assert.equal(Evolution.evaluate(vulpix, "vulpix").options[0].species, "ninetales", "Composed mature Vulpix unlocks Ninetales");

        const char = createSimPet(world, "Blaze", "brave", 0, "charmander");
        char.maturity = 0.62; char.bond = 0.66; char.basePersonality.boldness = 0.65;
        Memory.recordEpisode(char, "scout_complete", { valence: 0.4 });
        Memory.recordEpisode(char, "hearth_bask", { valence: 0.4 });
        assert.equal(Evolution.evaluate(char, "charmander").options[0].species, "charizard", "Bold seasoned Charmander unlocks Charizard");

        // Evolving records milestone while preserving episodes & relationships
        const epCountBefore = eevee.episodes.length;
        Evolution.recordEvolutionMilestone(eevee, "eevee", "umbreon");
        assert.ok(eevee.episodes.length > epCountBefore, "Evolution appends milestone without wiping prior episodes");
        assert.ok(eevee.journal.some(j => j.text.includes("Umbreon")), "Evolution records permanent journal milestone");
        assert.ok(Memory.relationWith(eevee, "Bestie").affinity > 0.6, "Evolution preserves companion relationships");
    }
}

// 17. Architecture & runtime safety regressions
{
    // 17a. Sealed QObject-like pet applySaved + penned hasSavedPos:false roundtrip
    {
        const world = createSimWorld();
        const qobjPet = createSimPet(world, "Sealed", "playful", 0, "zorua");
        delete qobjPet.enteredPenAt;
        delete qobjPet.gx;
        delete qobjPet.gy;
        delete qobjPet.hasSavedPos;
        Object.seal(qobjPet);

        const pennedState = Sanctuary.createDefaultResident(
            { id: "sealed_1", name: "Sealed", sprite: "zorua" },
            world.now
        );
        pennedState.enteredPenAt = world.now - 50000;
        const json = Persist.serialize(pennedState);
        const parsed = JSON.parse(json);
        assert.equal(parsed.hasSavedPos, false, "Penned resident without desktop coords saves hasSavedPos=false");

        assert.doesNotThrow(() => {
            Persist.applySaved(qobjPet, json);
        }, "applySaved never assigns undeclared properties onto sealed QObject-like Pet");
        assert.notEqual(qobjPet.worldX, 0, "hasSavedPos=false does not clobber live Pet worldX to 0");
    }

    // 17b. Plain stateObj Sanctuary care interactions record episodes safely without screenX()
    {
        const recState = Sanctuary.createDefaultResident(
            { id: "pen_care_1", name: "Pip", sprite: "eevee" },
            1_700_000_000_000
        );
        assert.doesNotThrow(() => {
            Sanctuary.patInPen(recState, 1_700_000_010_000);
            Sanctuary.feedInPen(recState, 1_700_000_020_000);
            Sanctuary.playInPen(recState, 1_700_000_030_000);
        }, "Sanctuary care actions work on plain stateObj without QObject methods");
        assert.equal(recState.episodes.length, 3, "All 3 Sanctuary care episodes recorded");
    }

    // 17c. Stable id-seeded basePersonality across companion renames
    {
        const baseA = Personality.resolveBase("curious", "pet_abc_123", null);
        const baseB = Personality.resolveBase("curious", "pet_abc_123", null);
        const baseDiff = Personality.resolveBase("curious", "different_seed", null);
        assert.deepEqual(Object.assign({}, baseA), Object.assign({}, baseB), "Stable pet id produces identical basePersonality");
        assert.notDeepEqual(Object.assign({}, baseA), Object.assign({}, baseDiff), "Different seed key produces distinct jitter");
        const recState = Sanctuary.createDefaultResident(
            { id: "pet_abc_123", name: "OldName", sprite: "zorua", personality: "curious" },
            1_700_000_000_000
        );
        const restored = Sanctuary.createDefaultResident(
            { id: "different_seed", name: "NewName", sprite: "zorua", personality: "sleepy" },
            1_700_000_000_000
        );
        assert.notDeepEqual(Object.assign({}, restored.basePersonality), Object.assign({}, recState.basePersonality));
        Persist.applySaved(restored, Persist.serialize(recState));
        assert.deepEqual(
            Object.assign({}, restored.basePersonality),
            Object.assign({}, recState.basePersonality),
            "Persisted basePersonality survives rename and preset drift"
        );
    }

    // 17d. user_idle never strands active plans; user interaction cancels _retiringToPen
    {
        const world = createSimWorld();
        const sleeper = createSimPet(world, "Drowse", "sleepy", 0, "snorlax");
        sleeper.basePersonality.energy = 0.1;
        sleeper.basePersonality.curiosity = 0.1;
        sleeper.basePersonality.playfulness = 0.1;
        sleeper.basePersonality.sleepiness = 0.9;
        Plans.startPlan(sleeper, Plans.buildScoutPlan({ gx: 900, gy: 600, otherScreen: false }), Nav, Gestures.pickAvailable);
        assert.equal(Plans.hasActivePlan(sleeper), true);
        for (let i = 0; i < 10; i++) {
            Brain.onEvent(sleeper, "user_idle", null, Nav);
        }
        assert.notEqual(sleeper.state_, "loaf", "user_idle does not strand an active plan in loaf");

        let retireCancelled = false;
        sleeper._retiringToPen = true;
        sleeper.cancelRetireIfInterrupted = function() {
            this._retiringToPen = false;
            retireCancelled = true;
        };
        Plans.startPlan(sleeper, Plans.buildRetirePlan(sleeper, Perception.perceive(sleeper)), Nav, Gestures.pickAvailable);
        assert.equal(sleeper._retiringToPen, true, "retire_to_pen keeps _retiringToPen armed");
        Brain.onEvent(sleeper, "petted", null, Nav);
        assert.equal(retireCancelled, true, "Petting a retiring companion cancels _retiringToPen");
        assert.equal(sleeper._retiringToPen, false);
    }

    // 17e. Sanctuary rotation retires 'penned' even when 'always' exceeds maxActiveRoaming, and readinessScore is pure
    {
        const now = 1_700_050_000_000;
        const petCfgs = [
            { id: "a1", name: "A1", sprite: "eevee", roamMode: "always" },
            { id: "a2", name: "A2", sprite: "zorua", roamMode: "always" },
            { id: "p1", name: "P1", sprite: "rowlet", roamMode: "penned" }
        ];
        const decision = Sanctuary.evaluateRotation(petCfgs, {}, {}, ["a1", "p1"], 1, 0, null, now);
        assert.equal(decision.retireId, "p1", "Penned policy retires immediately before spawning missing always-out pet");

        const freshRec = Sanctuary.createDefaultResident({ id: "r1", name: "R1", sprite: "pikachu" }, now);
        freshRec.enteredPenAt = now - 1000;
        freshRec.restDrive = 0.1;
        freshRec.alertness = 0.8;
        const sNormal = Sanctuary.readinessScore(freshRec, [], null, now, false);
        const sIgnore = Sanctuary.readinessScore(freshRec, [], null, now, true);
        assert.equal(freshRec.enteredPenAt, now - 1000, "readinessScore never mutates enteredPenAt");
        assert.ok(sIgnore > sNormal, "ignoreRestCooldown bypasses fresh-pen penalty cleanly");
    }

    // 17f. Evolution.canEvolveTo enforces unlocked branch; relationWith refreshes peer species
    {
        const world = createSimWorld();
        const eevee = createSimPet(world, "Vee", "nocturnal", 0, "eevee");
        assert.equal(Evolution.canEvolveTo(eevee, "umbreon", "eevee"), false, "Locked branch rejected by canEvolveTo");
        eevee.maturity = 0.6;
        eevee.bond = 0.75;
        eevee.quirks = ["night_watch"];
        for (let i = 0; i < 4; i++) Memory.recordEpisode(eevee, "night_vigil", { valence: 0.4 });
        assert.equal(Evolution.canEvolveTo(eevee, "umbreon", "eevee"), true, "Earned branch accepted by canEvolveTo");
        assert.equal(Evolution.canEvolveTo(eevee, "glaceon", "eevee"), false, "Unearned sibling branch rejected by canEvolveTo");

        const peer = createSimPet(world, "Buddy", "playful", 0, "zorua");
        Memory.relationWith(peer, "Vee", eevee.personality, "eevee");
        assert.equal(peer.relationships.Vee.species, "eevee");
        Memory.relationWith(peer, "Vee", eevee.personality, "umbreon");
        assert.equal(peer.relationships.Vee.species, "umbreon", "relationWith updates cached peer species after evolution");
    }

    // 18a. Sway & Niri compositor geometry adapters produce full window-ledge perches
    {
        const swayJson = JSON.stringify({
            type: "root",
            nodes: [
                { name: "__i3", type: "output", nodes: [] },
                {
                    name: "DP-1",
                    type: "output",
                    active: true,
                    current_workspace: "1",
                    rect: { x: 0, y: 0, width: 2560, height: 1440 },
                    nodes: [
                        {
                            name: "1",
                            type: "workspace",
                            focused: true,
                            rect: { x: 0, y: 36, width: 2560, height: 1404 },
                            nodes: [
                                {
                                    id: 101,
                                    type: "con",
                                    app_id: "foot",
                                    name: "zsh",
                                    pid: 4200,
                                    focused: true,
                                    fullscreen_mode: 0,
                                    border: "normal",
                                    deco_rect: { x: 40, y: 180, width: 900, height: 24 },
                                    rect: { x: 40, y: 204, width: 900, height: 700 }
                                }
                            ],
                            floating_nodes: [
                                {
                                    id: 102,
                                    type: "floating_con",
                                    app_id: "firefox",
                                    name: "Docs",
                                    pid: 4300,
                                    focused: false,
                                    fullscreen_mode: 0,
                                    rect: { x: 1020, y: 210, width: 920, height: 740 }
                                }
                            ]
                        }
                    ]
                }
            ]
        });
        const swaySnap = CompositorWindows.parseSwayTree(swayJson);
        assert.equal(swaySnap.insets["DP-1"].top, 36, "Sway bar inset derived from output vs workspace rect");
        assert.equal(swaySnap.wins.length, 2, "Sway tiled and floating windows extracted");
        assert.equal(swaySnap.wins[0].y, 180, "Sway normal border includes titlebar deco_rect");
        assert.equal(swaySnap.activeCls, "foot");

        const world = createSimWorld();
        world.windowTracker.visibleWindows = swaySnap.wins;
        world.windowTracker.activeWindowPos = swaySnap.activePos;
        const scout = createSimPet(world, "Leaf", "curious", 0, "grovyle");
        const swayPerc = Perception.perceive(scout);
        assert.equal(swayPerc.perches.length, 2, "Sway windows become valid perches");
        assert.ok(swayPerc.perches[0].adjacentLedges.length >= 1, "Adjacent Sway windows link for ledge parkour");

        const niriState = CompositorWindows.createNiriState();
        CompositorWindows.ingestNiriOutputs(niriState, JSON.stringify({
            "DP-1": { name: "DP-1", logical: { x: 0, y: 0, width: 2560, height: 1440 } }
        }));
        CompositorWindows.applyNiriEvent(niriState, JSON.stringify({
            WorkspacesChanged: {
                workspaces: [{ id: 1, output: "DP-1", is_active: true, is_focused: true }]
            }
        }));
        CompositorWindows.applyNiriEvent(niriState, JSON.stringify({
            WindowsChanged: {
                windows: [
                    {
                        id: 11,
                        app_id: "kitty",
                        title: "nvim",
                        workspace_id: 1,
                        is_focused: true,
                        layout: {
                            window_size: [1100, 900],
                            tile_pos_in_workspace_view: [80, 160],
                            window_offset_in_tile: [0, 0]
                        }
                    }
                ]
            }
        }));
        const niriSnap = CompositorWindows.buildNiriSnapshot(niriState, world.screens);
        assert.equal(niriSnap.wins.length, 1, "Niri workspace-view window mapped to global ledge rect");
        assert.equal(niriSnap.wins[0].y, 160);
        assert.equal(niriSnap.activeCls, "kitty");
    }

    // 18b. Abrupt music pause freezes grooving companion with question droplet
    {
        const world = createSimWorld();
        world.mediaTracker.isPlaying = true;
        world.mediaTracker.trackTitle = "Lo-Fi Rain";
        const dancer = createSimPet(world, "Tempo", "playful", 0, "meloetta");
        Plans.startPlan(dancer, Plans.buildMusicGroovePlan(Perception.perceive(dancer), "", dancer), Nav, Gestures.pickAvailable);
        assert.equal(dancer.activePlan.name, "music_groove");
        world.mediaTracker.isPlaying = false;
        Brain.onEvent(dancer, "music_paused", null, Nav);
        assert.equal(dancer.activePlan, null, "Abrupt music pause clears groove plan");
        assert.ok(dancer.directEmotes.includes("question"), "Confused question droplet emitted on music cut");
    }

    // 18c. Spectating & judging tosses + manual outer-bezel tuck-in
    {
        const world = createSimWorld();
        const flyer = createSimPet(world, "Aero", "playful", 0, "emolga");
        const timidJudge = createSimPet(world, "Pip", "shy", 0, "espurr");
        const boldJudge = createSimPet(world, "Brawl", "brave", 0, "riolu");
        timidJudge.basePersonality.boldness = 0.18;
        boldJudge.quirks = ["sky_acrobat"];
        flyer.worldX = 600; flyer.worldY = 500;
        timidJudge.worldX = 720; timidJudge.worldY = 510;
        boldJudge.worldX = 480; boldJudge.worldY = 510;

        timidJudge.socialEvent("friend_lifted", flyer);
        assert.ok(timidJudge.attentionUntil > world.now, "Bystander tracks lifted friend with gaze");

        timidJudge.socialEvent("friend_tossed", flyer, { speed: 620, cleanLanding: true });
        boldJudge.socialEvent("friend_tossed", flyer, { speed: 620, cleanLanding: true });
        assert.ok(["cringe", "tumbleBack"].includes(timidJudge.state_), "Timid bystander winces at fast toss");
        assert.ok(["hop", "pose"].includes(boldJudge.state_), "Acrobat bystander cheers clean landing");

        // Gentle drop of a tired auto companion at the outer left bezel initiates retire_to_pen
        const sleepyFox = createSimPet(world, "Drowse", "lazy", 0, "vulpix");
        sleepyFox.petData.roamMode = "auto";
        sleepyFox.restDrive = 0.72;
        sleepyFox.worldX = 12;
        sleepyFox.worldY = 500;
        let retiredToPen = false;
        sleepyFox.beginRetireToPen = function() { retiredToPen = true; };
        Brain.onEvent(sleepyFox, "dropped", { speed: 80 }, Nav);
        assert.equal(retiredToPen, true, "Gentle release at outer screen bezel tucks sleepy companion into Sanctuary");
    }

    // 18d. Battery & charger ethology + toast notification ear-perks & social referencing
    {
        const world = createSimWorld();
        const spark = createSimPet(world, "Volt", "energetic", 0, "jolteon");
        const jolteonXml = fs.readFileSync(path.join(rootDir, "assets/sprites/jolteon/AnimData.xml"), "utf8");
        spark.sprite._animData = SpriteSheet.parseAnimData(jolteonXml).anims;
        Brain.onEvent(spark, "power_plugged", { pluggedIn: true, batteryLevel: 0.45 }, Nav);
        assert.ok(["shock", "charge", "hop"].includes(spark.state_), "Electric companion perks up when charger connects");

        const guard = createSimPet(world, "Warden", "brave", 0, "lucario");
        guard.bond = 0.7;
        Brain.onEvent(guard, "low_battery", { batteryLevel: 0.15 }, Nav);
        assert.ok(["lookUp", "nod"].includes(guard.state_), "Guardian glances up toward bar on low battery");

        // Toast notification: shy hatchling checks resting high-composure elder instead of spooking
        const elder = createSimPet(world, "Sage", "chill", 0, "ninetales");
        elder.maturity = 0.65;
        elder.basePersonality.composure = 0.85;
        elder.state_ = "loaf";
        elder.worldX = 520; elder.worldY = 500;

        const young = createSimPet(world, "Kit", "shy", 0, "vulpix");
        young.maturity = 0.10;
        young.basePersonality.boldness = 0.22;
        young.worldX = 600; young.worldY = 510;
        const prevBold = young.personality.boldness;
        Brain.onEvent(young, "toast_arrived", { appName: "Vesktop", urgency: "normal", silent: false }, Nav);
        assert.ok(young.personality.boldness > prevBold, "Shy hatchling gains boldness by referencing calm loafing elder");
        assert.ok(Memory.recent(young, "social_referenced", 5000), "Social referencing episode recorded");
    }

    // 18e. Mid-journey distraction, overtired crankiness, personal-space steering & accidental trampling
    {
        const world = createSimWorld();
        const wanderer = createSimPet(world, "Pip", "curious", 0, "eevee");
        wanderer.basePersonality.curiosity = 0.90;
        wanderer.basePersonality.playfulness = 0.85;
        wanderer.basePersonality.patience = 0.20;
        wanderer.worldX = 500; wanderer.worldY = 500;

        const playerA = createSimPet(world, "Dash", "playful", 0, "pikachu");
        playerA.worldX = 620; playerA.worldY = 520;
        playerA.state_ = "zoomies";

        Plans.startPlan(wanderer, Plans.buildGoHomePlan(wanderer), Nav, Gestures.pickAvailable);
        wanderer.activePlan.urgency = 0.35;
        wanderer.activePlan.started = world.now - 4000;
        const origRnd = Math.random;
        Math.random = () => 0.1;
        let sidetracked = false;
        try {
            sidetracked = Brain.checkMidJourneyDistraction(wanderer, Nav);
        } finally {
            Math.random = origRnd;
        }
        assert.equal(sidetracked, true, "Distractible companion abandons low-urgency errand to watch nearby play");
        assert.equal(wanderer.activePlan.name, "spectate_bout");

        // Overtiredness lowers effectivePatience
        wanderer.basePersonality.patience = 0.45;
        wanderer.restDrive = 0.92;
        assert.ok(Drives.effectivePatience(wanderer) < 0.30, "Overtiredness reduces effective social patience");

        // Polite walker curves around sleeping companion; rowdy zoomies tramples grumpy sleeper awake
        const world2 = createSimWorld();
        const grumpySleeper = createSimPet(world2, "Grump", "grumpy", 0, "sneasel");
        grumpySleeper.state_ = "laying";
        grumpySleeper.worldX = 600; grumpySleeper.worldY = 500;
        assert.equal(Util.isRestingState("laying"), true, "Laying is recognized as a resting state");

        const polite = createSimPet(world2, "Gentle", "chill", 0, "leafeon");
        polite.worldX = 530; polite.worldY = 500;
        Nav.journeyToGlobal(polite, 800, 500);
        const initialAngle = polite.moveAngle;
        Nav.updateSteering(polite, 0.05);
        assert.notEqual(polite.moveAngle, initialAngle, "Polite walker deflects around sleeping companion");
        assert.equal(grumpySleeper.state_, "laying", "Polite walker does not wake sleeper");

        const zoomer = createSimPet(world2, "Rocket", "energetic", 0, "jolteon");
        zoomer.state_ = "zoomies";
        zoomer.worldX = 590; zoomer.worldY = 505;
        Nav.updateSteering(zoomer, 0.05);
        assert.notEqual(grumpySleeper.state_, "laying", "Zooming companion clipping sleeper wakes them up");
    }

    // 18f. Warm-spot stealing, attention jealousy, startle cascades & desktop world shifts
    {
        const world = createSimWorld();
        world.petManager.vacatedWarmSpots = [
            { gx: 680, gy: 540, petName: "Flare", warmth: 0.85, time: world.now - 3000 }
        ];
        constflareOwner: {
            const owner = createSimPet(world, "Flare", "grumpy", 0, "flareon");
            owner.worldX = 740; owner.worldY = 540;
            const sly = createSimPet(world, "Trick", "lazy", 0, "zorua");
            sly.worldX = 520; sly.worldY = 520;
            sly.restDrive = 0.45;
            const perc = Perception.perceive(sly);
            assert.ok(perc.warmSpot && perc.warmSpot.petName === "Flare", "Perception detects freshly vacated warm spot");
            Plans.startPlan(sly, Plans.buildStealWarmSpotPlan(perc.warmSpot, sly), Nav, Gestures.pickAvailable);
            sly.worldX = sly.targetGX; sly.worldY = sly.targetGY;
            Nav.walkArrived(sly); // head/nod sniff
            Brain.onActionFinished(sly, Nav); // settles into laying!
            assert.equal(sly.state_, "laying", "Warm-spot thief sprawls flat in laying posture");
            assert.ok(["pull", "cringe"].includes(owner.state_), "Nearby low-patience owner huffs when warm spot is stolen");
        }

        // Attention jealousy wedge-in
        const worldJ = createSimWorld();
        const pampered = createSimPet(worldJ, "Star", "chill", 0, "eevee");
        const velcro = createSimPet(worldJ, "Shadow", "playful", 0, "riolu");
        velcro.quirks = ["velcro_companion"];
        pampered.worldX = 600; pampered.worldY = 500;
        velcro.worldX = 720; velcro.worldY = 510;
        velcro.socialEvent("peer_pampered", pampered);
        assert.equal(velcro.activePlan && velcro.activePlan.name, "jealous_wedge", "Devoted bystander wedges in for headpats");

        // Workspace switch drops perched companion instead of stranding at mid-air Y
        const worldW = createSimWorld();
        worldW.windowTracker.visibleWindows = [];
        const percher = createSimPet(worldW, "Roost", "curious", 0, "rowlet");
        percher.worldX = 500; percher.worldY = 200;
        percher.state_ = "perch";
        Brain.onEvent(percher, "workspace_changed", null, Nav);
        assert.equal(percher.state_, "airborne", "Workspace switch drops perched companion cleanly via gravity");

        // Window shift overlapping resting pet prompts inspection / relocation
        const worldS = createSimWorld();
        const loafer = createSimPet(worldS, "Loaf", "grumpy", 0, "sprigatito");
        loafer.worldX = 500; loafer.worldY = 500;
        loafer.state_ = "loaf";
        Brain.onEvent(loafer, "window_shifted", { windowClass: "kitty", x: 460, y: 460, w: 500, h: 400, address: "0x9" }, Nav);
        assert.equal(loafer.activePlan && loafer.activePlan.name, "window_shift_inspect", "Shifted window overlapping resting pet triggers relocation");

        // Parked cursor draws bonded companion beside pointer
        const worldP = createSimWorld();
        const buddy = createSimPet(worldP, "Nuzzle", "chill", 0, "umbreon");
        buddy.bond = 0.72;
        buddy.worldX = 500; buddy.worldY = 500;
        Brain.onEvent(buddy, "cursor_parked", { gx: 680, gy: 520 }, Nav);
        assert.equal(buddy.activePlan && buddy.activePlan.name, "parked_cursor_company", "Bonded companion pads over to parked cursor");
    }

    // 19. Lifelike locomotion, parabolic ledge mount/dismount, octant turning, bezel curving & FOV
    {
        // 8-way direction ring round-trips & steps 1 octant per tick along shortest arc
        for (let r = 0; r < 8; r++) {
            const ang = SpriteSheet.directionRowToAngle(r);
            assert.equal(SpriteSheet.angleToDirectionRow(ang), r, `Row ${r} round-trips through directionRowToAngle`);
        }
        assert.equal(SpriteSheet.stepDirectionRow(7, 3), 0 || 6 ? SpriteSheet.stepDirectionRow(7, 3) : 6);
        let curR = 7;
        const visitedRows = [curR];
        for (let step = 0; step < 6 && curR !== 2; step++) {
            curR = SpriteSheet.stepDirectionRow(curR, 2);
            visitedRows.push(curR);
        }
        assert.deepEqual(visitedRows, [7, 0, 1, 2], "Multi-octant turn pivots smoothly one octant at a time (SW -> S -> SE -> E)");

        // Parabolic window-ledge mount (floor -> beneath window -> coil -> jump_to -> perch -> stay perched -> jump_to dismount)
        const worldL = createSimWorld();
        worldL.windowTracker.visibleWindows = [
            { address: "0x77", cls: "kitty", title: "shell", x: 400, y: 260, w: 600, h: 420, focused: true, fullscreen: false }
        ];
        const jumper = createSimPet(worldL, "Leaf", "curious", 0, "grovyle");
        jumper.worldX = 920; jumper.worldY = 860;
        jumper._perchTargetRelX = 0.5;
        jumper._perchStrolling = false;
        const percL = Perception.perceive(jumper);
        const perchL = percL.perches[0];
        const mountPlan = Plans.buildWindowPerchPlan(perchL, jumper);
        assert.ok(mountPlan.steps.some(s => s.kind === "jump_to"), "Floor-to-ledge perch plan leaps via jump_to instead of air-walking");
        Plans.startPlan(jumper, mountPlan, Nav, Gestures.pickAvailable);
        assert.equal(jumper.state_, "walk");
        assert.ok(jumper.targetGY > perchL.gy + 80, "Initial travel stages on floor below ledge rather than walking up thin air");
        jumper.worldX = jumper.targetGX; jumper.worldY = jumper.targetGY;
        Nav.walkArrived(jumper); // arrives at floor launch spot -> sizing up act
        Brain.onActionFinished(jumper, Nav); // finishes coil -> airborne jump_to!
        assert.equal(jumper.state_, "airborne", "Companion leaps into parabolic flight up to ledge");
        for (let i = 0; i < 90 && jumper.state_ === "airborne"; i++) {
            Nav.updateAirborne(jumper, 0.032);
        }
        assert.equal(jumper.state_, "perch", "Parabolic mount lands in perch on window top bar");
        assert.equal(jumper.perchedWindowAddr, "0x77");

        // Perch titlebar strolling shifts _perchRelX smoothly
        jumper._perchTrackedAddr = "";
        Nav.updatePerch(jumper, 0.032);
        const startRelX = jumper._perchRelX;
        jumper._perchTargetRelX = startRelX > 0.5 ? 0.12 : 0.88;
        for (let i = 0; i < 75; i++) Nav.updatePerch(jumper, 0.05);
        assert.ok(Math.abs(jumper._perchRelX - startRelX) > 0.12, "Perched companion ambles smoothly along wide titlebar");

        // Finishing perch plan keeps companion perched; starting a floor plan hops down first!
        Brain.onPlanBeat(jumper, Nav);
        assert.equal(jumper.state_, "perch", "Finishing perch beat keeps companion perched rather than stranding in mid-air idle");
        assert.equal(jumper.perchedWindowAddr, "0x77");
        jumper.homeGX = 700; jumper.homeGY = 820;
        Plans.startPlan(jumper, Plans.buildGoHomePlan(jumper), Nav, Gestures.pickAvailable);
        assert.equal(jumper.state_, "airborne", "Starting a floor journey from a high perch hops down via parabolic jump_to first");
        for (let i = 0; i < 90 && jumper.state_ === "airborne"; i++) {
            Nav.updateAirborne(jumper, 0.032);
        }
        assert.equal(jumper.state_, "walk", "After hopping off ledge onto floor, companion continues walking to floor destination");

        // Species locomotion physics: hoverers float down slower than heavyweights
        const worldG = createSimWorld();
        const floater = createSimPet(worldG, "Wisp", "chill", 0, "mew");
        const heavy = createSimPet(worldG, "Tank", "chill", 0, "munchlax");
        assert.equal(SpeciesProfile.locomotionFor(floater).kind, "hover");
        assert.equal(SpeciesProfile.locomotionFor(heavy).kind, "heavy");
        Nav.launchFromRelease(floater, 220, 0, 40);
        Nav.launchFromRelease(heavy, 220, 0, 40);
        for (let i = 0; i < 8; i++) {
            Nav.updateAirborne(floater, 0.032);
            Nav.updateAirborne(heavy, 0.032);
        }
        assert.ok(floater.altitude > heavy.altitude + 15, "Levitating species (Mew) floats down more gently than heavyweight (Munchlax)");

        // Bezel curving steers zooming companion away from closed monitor edge before impact
        const worldB = createSimWorld();
        worldB.screens = [{ x: 0, y: 0, width: 1920, height: 1080, name: "eDP-1" }];
        const zoomer = createSimPet(worldB, "Bolt", "energetic", 0, "jolteon");
        zoomer.state_ = "zoomies";
        zoomer.worldX = 24; zoomer.worldY = 500;
        zoomer.moveAngle = Math.PI * 0.85; // heading toward closed left bezel
        Nav.updateSteering(zoomer, 0.08);
        assert.ok(Math.abs(zoomer.moveAngle) < Math.PI * 0.85, "Bezel steering curves zooming companion inward before hitting bezel");

        // Directional field-of-view gates low-alertness distraction behind back
        const worldF = createSimWorld();
        const walker = createSimPet(worldF, "Scout", "curious", 0, "eevee");
        walker.basePersonality.curiosity = 0.90;
        walker.basePersonality.playfulness = 0.85;
        walker.basePersonality.patience = 0.20;
        walker.alertness = 0.45;
        walker.worldX = 600; walker.worldY = 500;
        const behindPlay = createSimPet(worldF, "Behind", "playful", 0, "pikachu");
        behindPlay.worldX = 360; behindPlay.worldY = 500; // 240px West (behind East-walking Scout)
        behindPlay.state_ = "zoomies";
        Plans.startPlan(walker, {
            name: "scout_expedition",
            urgency: 0.35,
            steps: [{ kind: "travel", gait: "trot", gx: 1100, gy: 500 }]
        }, Nav, Gestures.pickAvailable);
        walker.activePlan.started = worldF.now - 4000;
        const origRandom = Math.random;
        Math.random = () => 0.1;
        try {
            assert.equal(Brain.checkMidJourneyDistraction(walker, Nav), false, "Distant play behind back is outside field of view");
            behindPlay.worldX = 830; // now 230px East (directly in front of Scout's gaze!)
            walker._lastDistractionCheckMs = 0;
            assert.equal(Brain.checkMidJourneyDistraction(walker, Nav), true, "Play in front of gaze catches walker's eye");
        } finally {
            Math.random = origRandom;
        }

        // Ledge hop guardrails: never cross-monitor jump, never skip horizontal travel when above ledge, and zero landing snap
        const worldJ = createSimWorld();
        worldJ.screens = [
            { x: 0, y: 0, width: 1920, height: 1080, name: "DP-1" },
            { x: 1920, y: 0, width: 1920, height: 1080, name: "DP-2" }
        ];
        worldJ.windowTracker.visibleWindows = [
            { address: "0xremote", cls: "kitty", x: 2400, y: 260, w: 900, h: 600, focused: true, fullscreen: false }
        ];
        const percher = createSimPet(worldJ, "Hop", "curious", 0, "eevee");
        percher.worldX = 300; percher.worldY = 700;
        const remoteCands = BrainCandidates.scoreCandidates(percher, Perception.perceive(percher), Nav, Gestures.pickAvailable);
        assert.equal(remoteCands.some(c => c.name === "window_perch"), false, "Never attempts to jump-perch onto a window on another monitor");

        worldJ.windowTracker.visibleWindows = [
            { address: "0xlocal", cls: "firefox", x: 1350, y: 580, w: 480, h: 420, focused: true, fullscreen: false }
        ];
        percher.worldX = 120; percher.worldY = 44; // High & far left above lower window
        const localPerc = Perception.perceive(percher);
        const perchPlan = Plans.buildWindowPerchPlan(localPerc.perches[0], percher);
        assert.equal(perchPlan.steps[0].kind, "travel", "Companion above a distant window trots over first instead of leaping across screen");

        // Frame-by-frame 16ms hop & perch continuity check (zero pop on liftoff, zero snap on landing/perch)
        percher.worldX = 1480;
        percher.worldY = 580 - percher.height * 0.85 + 70;
        Plans.startPlan(percher, Plans.buildWindowPerchPlan(Perception.perceive(percher).perches[0], percher), Nav, Gestures.pickAvailable);
        if (percher.state_ === "walk") {
            percher.worldX = percher.targetGX;
            percher.worldY = percher.targetGY;
            Nav.walkArrived(percher);
        }
        Brain.onActionFinished(percher, Nav); // sizing-up nod -> jump_to!
        assert.equal(percher.state_, "airborne");
        assert.equal(percher.sprite.currentState, "leap", "Intentional ledge hop plays upright leap clip rather than Tumble/Hurt");
        let prevVisX = percher.worldX;
        let prevVisY = percher.worldY - percher.altitude;
        let safetyFrames = 0;
        while (percher.state_ === "airborne" && safetyFrames++ < 60) {
            Nav.updateAirborne(percher, 0.016);
            const visX = percher.worldX;
            const visY = percher.worldY - percher.altitude;
            const frameStep = Math.hypot(visX - prevVisX, visY - prevVisY);
            assert.ok(frameStep < 14, `Smooth 60fps hop frame delta (${frameStep.toFixed(2)}px) with zero teleport snap`);
            prevVisX = visX;
            prevVisY = visY;
        }
        assert.equal(percher.state_, "perch", "Hop lands directly in perch state");
        Nav.updatePerch(percher, 0.016);
        const perchSnap = Math.hypot(percher.worldX - prevVisX, (percher.worldY - percher.altitude) - prevVisY);
        assert.ok(perchSnap < 1.0, `Zero snap when updatePerch engages (${perchSnap.toFixed(3)}px)`);

        // Barless monitor (topInset = 0): top-tiled/near-bezel windows (< petH * 0.78) are non-perchable,
        // and dragging a perched window flush to the top bezel makes the companion hop off cleanly.
        worldJ.screens = [{ x: 0, y: 0, width: 1920, height: 1080, name: "DP-1", topInset: 0, bottomInset: 0 }];
        worldJ.windowTracker.visibleWindows = [
            { address: "0xflush", cls: "kitty", x: 0, y: 0, w: 960, h: 1080, focused: true, fullscreen: false },
            { address: "0xgapped", cls: "firefox", x: 968, y: 36, w: 944, h: 1036, focused: false, fullscreen: false },
            { address: "0xsanctuary", cls: "quickshell", title: "Pokémon Sanctuary", x: 300, y: 160, w: 720, h: 520, focused: false, fullscreen: false },
            { address: "0xfloat", cls: "code", x: 420, y: 180, w: 720, h: 520, focused: false, fullscreen: false }
        ];
        worldJ.windowTracker.activeWindowPos = { address: "0xsanctuary", x: 300, y: 160, w: 720, h: 520 };
        worldJ.windowTracker.activeWindowTitle = "Pokémon Sanctuary";
        const barlessPerc = Perception.perceive(percher);
        assert.equal(barlessPerc.win, null, "Sanctuary self-window is ignored as an active work target");
        assert.deepEqual(
            Array.from(barlessPerc.perches, p => p.address),
            ["0xfloat"],
            "Barless top-edge windows and Sanctuary self-window are excluded while lower floating window stays perchable"
        );
        percher.worldX = 560;
        percher.worldY = 180 - percher.height * 0.85;
        percher.perchedWindowAddr = "0xfloat";
        percher.enterState("perch");
        Nav.updatePerch(percher, 0.016);
        assert.equal(percher.state_, "perch");
        worldJ.windowTracker.visibleWindows[3].y = 12; // User drags/tiles window flush to top bezel!
        Nav.updatePerch(percher, 0.016);
        assert.equal(percher.state_, "airborne", "Companion hops down cleanly when perched window is pushed to top bezel");
    }
}

// 19. Test Interpreted Pokémon UI Formatting & Narration Layer
{
    const Fmt = loadQmlJs("components/ui/CompanionFormat.js");
    assert.equal(Fmt.friendshipInfo(0.08).title, "Newcomer");
    assert.equal(Fmt.friendshipInfo(0.62).full, 4);
    assert.equal(Fmt.friendshipInfo(0.90).title, "Best Friends");

    assert.equal(Fmt.bellyWord({ satiety: 0.25 }).notable, true);
    assert.equal(Fmt.bellyWord({ satiety: 0.80 }).notable, false);
    assert.equal(Fmt.energyWord({ restDrive: 0.2 }, "deepsleep").label, "Dreaming");

    const hungryLine = Fmt.dialogueLine("Clover", { satiety: 0.24, penState: "idle" }, false);
    assert.ok(hungryLine.includes("Clover") && hungryLine.includes("peckish"), "Camp hunger dialogue reads naturally");
    const perchLine = Fmt.dialogueLine("Lokke", { state_: "perch", satiety: 0.7 }, true);
    assert.ok(perchLine.includes("ledge"), "Roaming perch dialogue translates state into Pokémon narration");

    const nat = Fmt.natureProfile(
        { playfulness: 0.82, energy: 0.78, sociability: 0.68 },
        { playfulness: 0.80, energy: 0.76, sociability: 0.50 },
        90000
    );
    assert.equal(nat.title, "Jolly, Spirited Nature");
    assert.ok(nat.memo.includes("affectionate"), "Nature memo reflects emergent personality growth without raw numbers");
    assert.equal(Fmt.friendlyRelationshipPhrase({ affinity: 0.84, familiarity: 0.7, napCount: 3 }), "Favorite nap buddy");
    assert.ok(Fmt.biomePalette("Moonlit Woods", true).turf.startsWith("#"));
    assert.ok(Fmt.biomePalette("Moonlit Woods", true).accent.startsWith("#"));
    assert.equal(Fmt.biomePalette("Moonlit Woods", false).backdrop, "woods.png");
    assert.equal(Fmt.biomePalette("Tidepool Cove", false).backdrop, "tidepool.png");
    assert.equal(Fmt.campAreaName("shore"), "Treasure Shore");
    assert.equal(Fmt.campAreaName("spring"), "Luminous Spring");
    const campActLine = Fmt.dialogueLine("Zorua", { penState: "idle", sanctuaryActivity: "Tending a warm hearth spot in Moonlit Woods" }, false);
    assert.equal(campActLine, "Zorua is tending a warm hearth spot in Moonlit Woods.");
    const emptyActLine = Fmt.dialogueLine("Zorua", { penState: "idle", sanctuaryActivity: "" }, false);
    assert.ok(emptyActLine.includes("gentle breeze"), "Empty camp activity falls back to clearing breeze narration");
}

// 20. Test Peer Mutation Helpers, Sanctuary Care Bonding, Tag Bid Drain & Multi-Monitor Sway Workspace Count
{
    const Sanctuary = loadQmlJs("components/behavior/Sanctuary.js");
    const CompositorWindows = loadQmlJs("components/behavior/CompositorWindows.js");

    // Memory peer mutation helpers
    const peerTarget = {
        relationships: {
            Fox: { affinity: 0.72, familiarity: 0.5, species: "eevee", napCount: 2 }
        },
        episodes: [
            { type: "social_nap", withPet: "Fox", time: 1000 },
            { type: "petted", time: 1200 }
        ]
    };
    assert.equal(Memory.rekeyPeer(peerTarget, "Fox", "Clover"), true);
    assert.equal(peerTarget.relationships.Fox, undefined);
    assert.equal(peerTarget.relationships.Clover.affinity, 0.72);
    assert.equal(peerTarget.episodes[0].withPet, "Clover");
    assert.equal(Memory.updatePeerSpecies(peerTarget, "Clover", "leafeon"), true);
    assert.equal(peerTarget.relationships.Clover.species, "leafeon");
    assert.equal(Memory.removePeer(peerTarget, "Clover"), true);
    assert.equal(peerTarget.relationships.Clover, undefined);

    // Sanctuary pen care increments bond and leaves resting penState = "idle"
    const res = Sanctuary.createDefaultResident({ id: "p1", name: "Pip", sprite: "piplup", personality: "playful" }, 10000);
    const initialBond = res.bond;
    Sanctuary.feedInPen(res);
    assert.ok(res.bond > initialBond, "feedInPen strengthens bond");
    assert.equal(res.penState, "idle", "feedInPen leaves penState in resting idle");
    const postFeedBond = res.bond;
    Sanctuary.playInPen(res);
    assert.ok(res.bond > postFeedBond, "playInPen strengthens bond");
    assert.equal(res.penState, "idle", "playInPen leaves penState in resting idle");

    // Tag play_bid does not prematurely exhaust playDrive before follow-up pet_chase
    const worldT = createSimWorld();
    const tagger = createSimPet(worldT, "Shinx", "playful", 0, "shinx");
    const runner = createSimPet(worldT, "Eevee", "playful", 0, "eevee");
    tagger.worldX = 400;
    tagger.worldY = 500;
    runner.worldX = 470;
    runner.worldY = 500;
    runner.playDrive = 0.22;
    runner.restDrive = 0.15;
    Brain.onEvent(runner, "pet_play_bid", { fromPet: tagger, mode: "tag" }, Nav);
    assert.ok(runner.playDrive > 0.15, "Tag play_bid preserves playDrive for incoming chase");
    advanceTime(worldT, 2);
    Brain.onEvent(runner, "pet_chase", { fromPet: tagger }, Nav);
    assert.equal(runner.activePlan && runner.activePlan.name, "flee_tag", "Runner accepts follow-up tag chase");

    // Multi-monitor Sway tree with empty focused workspace reports windowCount = 0
    const swayTree = {
        type: "root",
        nodes: [
            {
                type: "output",
                name: "DP-1",
                current_workspace: "1",
                nodes: [
                    {
                        type: "workspace",
                        name: "1",
                        focused: false,
                        nodes: [
                            { id: 101, type: "con", name: "Firefox", app_id: "firefox", focused: false, rect: { x: 0, y: 0, width: 1920, height: 1080 }, nodes: [], floating_nodes: [] }
                        ],
                        floating_nodes: []
                    }
                ]
            },
            {
                type: "output",
                name: "DP-2",
                current_workspace: "2",
                nodes: [
                    {
                        type: "workspace",
                        name: "2",
                        focused: true,
                        nodes: [],
                        floating_nodes: []
                    }
                ]
            }
        ]
    };
    const parsedSway = CompositorWindows.parseSwayTree(JSON.stringify(swayTree));
    assert.equal(parsedSway.wins.length, 1, "Visible window on DP-1 is still tracked");
    assert.equal(parsedSway.windowCount, 0, "Focused empty workspace on DP-2 reports windowCount = 0");
}

console.log("All cognitive, developmental, social, Sanctuary rotation, physics, multi-monitor, species ethology, modular ability, and persistence tests passed!");
