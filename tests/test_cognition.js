const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.resolve(__dirname, "..");

const moduleCache = new Map();
function loadQmlJs(relPath) {
    const norm = path.normalize(relPath);
    if (moduleCache.has(norm)) return moduleCache.get(norm);
    const full = path.join(rootDir, norm);
    const dir = path.dirname(norm);
    let src = fs.readFileSync(full, "utf8");
    const imports = {};
    src = src.replace(/^\.import\s+"([^"]+)"\s+as\s+([A-Za-z0-9_]+)\s*$/gm, (_, impPath, alias) => {
        imports[alias] = loadQmlJs(path.join(dir, impPath));
        return "";
    });
    const ctx = Object.assign(
        { Math, Date, Number, Object, Array, String, Boolean, JSON, parseInt, parseFloat, isFinite, console },
        imports
    );
    vm.createContext(ctx);
    vm.runInContext(src, ctx, { filename: norm });
    moduleCache.set(norm, ctx);
    return ctx;
}

const SpeciesProfile = loadQmlJs("components/SpeciesProfile.js");
const SpriteSheet = loadQmlJs("components/SpriteSheet.js");
const Topology = loadQmlJs("components/ai/Topology.js");
const Personality = loadQmlJs("components/ai/Personality.js");
const Drives = loadQmlJs("components/ai/Drives.js");
const Memory = loadQmlJs("components/ai/Memory.js");
const Perception = loadQmlJs("components/ai/Perception.js");
const Social = loadQmlJs("components/ai/Social.js");
const Plans = loadQmlJs("components/ai/Plans.js");
const Brain = loadQmlJs("components/ai/Brain.js");
const Sanctuary = loadQmlJs("components/ai/Sanctuary.js");
const Nav = loadQmlJs("components/PetNav.js");
const Persist = loadQmlJs("components/PetPersistence.js");

const zoruaXml = fs.readFileSync(path.join(rootDir, "assets/sprites/zorua/AnimData.xml"), "utf8");
const zoruaAnims = SpriteSheet.parseAnimData(zoruaXml).anims;

function createSimWorld() {
    const world = {
        now: 1_700_000_000_000,
        screens: [
            { x: 0, y: 0, width: 2560, height: 1440, name: "DP-1" },
            { x: 2560, y: 0, width: 1920, height: 1080, name: "DP-2" }
        ],
        petManager: { pets: [] },
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
            defaultMap: SpriteSheet.DEFAULT_STATE_MAP,
            actionMap: {},
            setDirection(a) { this._dirRow = SpriteSheet.angleToDirectionRow(a); },
            setState() {},
            triggerSquash() {}
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
                pet._screenIdx = idx;
                pet.worldX = gx - world.screens[idx].x;
                pet.worldY = gy - world.screens[idx].y;
            }
        }
    };
    world.petManager.pets.push(pet);
    return pet;
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
        const f = Brain.fidget(zorua);
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
            const f = Brain.fidget(pet);
            if (f !== null) {
                activeCount++;
                const resolved = SpriteSheet.resolveAnimName(f, anims, {}, species);
                assert.ok(anims[resolved] && resolved !== "Hop", `${species} fidget '${f}' -> '${resolved}'`);
            }
            const micro = Brain.idleMicroAction(pet);
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
        row = Brain.ambientGlanceRow(pik, row);
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

console.log("All cognitive, developmental, social, Sanctuary rotation, physics, multi-monitor, species ethology, and persistence tests passed!");
