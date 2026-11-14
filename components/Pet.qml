pragma ComponentBehavior: Bound

import QtQuick
import "../config"
import "../services"
import "SpeciesProfile.js" as SpeciesProfile
import "SpriteSheet.js" as SpriteSheet
import "behavior/Personality.js" as Personality
import "behavior/Brain.js" as Brain
import "behavior/Gestures.js" as Gestures
import "behavior/Perception.js" as Perception
import "behavior/Drives.js" as Drives
import "behavior/Memory.js" as Memory
import "behavior/Plans.js" as Plans
import "behavior/PlanBuildersEnv.js" as PlanBuildersEnv
import "behavior/PlanBuildersSocial.js" as PlanBuildersSocial
import "behavior/Abilities.js" as Abilities
import "behavior/Social.js" as Social
import "PetNav.js" as Nav
import "PetPersistence.js" as Persist

Item {
    id: root

    required property var petData
    property var petScreen: null
    property var petWindow: null

    property var basePersonality: Personality.resolveBase(
        petData.personality ?? "emergent",
        petData.id || petData.name || "pet",
        petData.traits ?? null
    )
    property string _lastPreset: ""
    property string _lastTraitsSig: ""

    property var coreDrift: ({})
    property var recentDrift: ({})
    property var quirkProgress: ({})
    property var quirks: []
    readonly property var personality: Personality.compose(basePersonality, coreDrift, recentDrift)
    property string archetype: Personality.archetypeTitle(personality, quirks, maturity, bond)
    property int memoryRevision: 0

    property string state_: "idle"
    property string gait: "trot"
    property real _liveSpeed: 0
    property real moveAngle: 0
    property bool facingRight: true
    property real worldX: 0
    property real worldY: 0
    property real altitude: 0
    property real vx: 0
    property real vy: 0
    property real vz: 0
    property real _tossPeakSpeed: 0
    property int _bounceCount: 0
    property var _jumpLanding: null
    property string _perchTrackedAddr: ""
    property real _perchRelX: 0.5
    property real _perchPrevWinX: 0
    property real _perchPrevWinY: 0
    property bool _perchRiding: false
    property real _perchSteadyTime: 0
    property string _yawnWarmPeerName: ""
    property bool _wakeWarmGreet: false

    property real ageSeconds: 0
    property real maturity: 0
    property real bond: Persist.SOUL_DEFAULTS.bond
    property real trust: Persist.SOUL_DEFAULTS.trust
    property real satiety: Persist.SOUL_DEFAULTS.satiety
    property real happiness: Persist.SOUL_DEFAULTS.happiness
    property real mood: Persist.SOUL_DEFAULTS.mood
    property real restDrive: Persist.SOUL_DEFAULTS.restDrive
    property real exploreDrive: Persist.SOUL_DEFAULTS.exploreDrive
    property real socialDrive: Persist.SOUL_DEFAULTS.socialDrive
    property real comfortDrive: Persist.SOUL_DEFAULTS.comfortDrive
    property real playDrive: Persist.SOUL_DEFAULTS.playDrive
    property real alertness: Persist.SOUL_DEFAULTS.alertness
    property real boredom: Persist.SOUL_DEFAULTS.boredom

    property var thoughts: []
    property var episodes: []
    property var journal: []
    property string lastThoughtText: "Observing the desktop"
    property double lastThoughtTime: 0
    property string lastDiscovery: ""
    property double lastDiscoveryTime: 0
    property double _lastDirectEmoteMs: 0
    property double _lastAmbientEmoteMs: 0

    property var activePlan: null
    property var intention: null
    property string perchedWindowAddr: ""
    property var visitedCells: ({})
    property var windowPrefs: ({})
    property var placeMemory: ({})
    property var relationships: ({})
    property var userRhythm: ({})
    property var _eventCooldowns: ({})
    property var _pokeTimestamps: []
    property real _lastTrackTime: 0
    property int _hour: new Date().getHours()
    readonly property bool isNighttime: _hour >= 23 || _hour < 6

    property real homeGX: 0
    property real homeGY: 0
    readonly property real homeRadius: 210
    property bool onJourney: false
    property int journeyBlocked: 0
    property real targetGX: 0
    property real targetGY: 0

    property real attentionGX: 0
    property real attentionGY: 0
    property double attentionUntil: 0
    property double calmUntil: 0

    property string illusionSpecies: ""
    property double illusionUntil: 0
    property double nextPeerSocialAt: Date.now() + 90000 + Math.random() * 120000
    property double roamStartedAt: Date.now()
    property bool _retiringToPen: false
    property bool _loadedState: false
    property bool _stateReady: false

    readonly property bool enablePerching: Config.enablePerching
    readonly property bool enableMusicReact: Config.enableMusicReact

    readonly property var windowTracker: WindowTracker
    readonly property var petManager: PetManager
    readonly property var systemMonitor: SystemMonitor
    readonly property var inputTracker: InputTracker
    readonly property var mediaTracker: MediaTracker
    readonly property alias sprite: spriteAnim

    onPetDataChanged: {
        const nextPreset = petData.personality ?? "emergent";
        const nextTraitsSig = JSON.stringify(petData.traits ?? null);
        if ((_lastPreset !== "" && nextPreset !== _lastPreset)
                || (_lastTraitsSig !== "" && nextTraitsSig !== _lastTraitsSig)) {
            basePersonality = Personality.resolveBase(
                nextPreset,
                petData.id || petData.name || "pet",
                petData.traits ?? null
            );
        }
        _lastPreset = nextPreset;
        _lastTraitsSig = nextTraitsSig;
    }

    function screenW(): real { return petScreen ? petScreen.width : (parent ? parent.width : 1920); }
    function screenH(): real { return petScreen ? petScreen.height : (parent ? parent.height : 1080); }
    function screenX(): real { return petScreen ? petScreen.x : 0; }
    function screenY(): real { return petScreen ? petScreen.y : 0; }

    function allScreens(): var {
        const screens = WindowTracker.realScreens;
        const pref = petData && petData.monitor ? String(petData.monitor) : "";
        let source = screens;
        if (pref.length > 0) {
            const pinned = screens.filter(s => s.name === pref);
            if (pinned.length > 0) source = pinned;
        }
        const out = [];
        for (let i = 0; i < source.length; i++) {
            const s = source[i];
            const ins = WindowTracker.insetsFor(s.name);
            out.push({
                x: s.x,
                y: s.y,
                width: s.width,
                height: s.height,
                name: s.name,
                topInset: ins.top,
                bottomInset: ins.bottom
            });
        }
        return out;
    }

    function emitEmote(symbol: string, direct): void {
        const now = Date.now();
        if (direct) {
            if (now - _lastDirectEmoteMs < 2200) return;
            _lastDirectEmoteMs = now;
            bubbles.showEmote(symbol);
            return;
        }
        if (now - _lastAmbientEmoteMs < 120000 || !PetManager.allowAmbientEmote()) return;
        _lastAmbientEmoteMs = now;
        bubbles.showEmote(symbol);
    }

    function schedulePlanBeat(ms: int): void {
        idleTimer.stop();
        sitTimer.stop();
        planBeatTimer.interval = Math.max(400, ms);
        planBeatTimer.restart();
    }

    function _settleFacing(): void {
        if (Date.now() < attentionUntil) return;
        const row = facingRight ? (Math.random() < 0.72 ? 1 : 2) : (Math.random() < 0.72 ? 7 : 6);
        spriteAnim._dirRow = row;
    }

    function startPotter(angle: real, durationMs: int): void {
        if (Plans.hasActivePlan(root)) return;
        onJourney = false;
        gait = "amble";
        moveAngle = angle;
        facingRight = Math.cos(angle) >= 0;
        _stopAllTimers();
        state_ = "wander";
        _liveSpeed = targetSpeed * 0.4;
        spriteAnim.setState("wander");
        spriteAnim.setDirection(angle);
        wanderEndTimer.interval = Math.max(650, durationMs);
        wanderEndTimer.restart();
    }

    function enterState(s: string): void {
        if (state_ === s && SpriteSheet.isLoopingState(s)) return;
        const wasMoving = state_ === "walk" || state_ === "wander" || state_ === "zoomies";
        _stopAllTimers();
        if (s === "drag") {
            onJourney = false;
            _retiringToPen = false;
            retireSafetyTimer.stop();
            Plans.clearPlan(root);
        } else if (s !== "perch") {
            perchedWindowAddr = "";
            _perchTrackedAddr = "";
            _perchRiding = false;
        }
        state_ = s;
        if (s === "walk" || s === "wander" || s === "zoomies") {
            if (!wasMoving) _liveSpeed = targetSpeed * 0.35;
        } else {
            _liveSpeed = 0;
        }
        spriteAnim.setState(s);
        if (s === "walk" || s === "wander" || s === "zoomies") {
            spriteAnim.setDirection(moveAngle);
        } else if ((s === "idle" || s === "perch") && wasMoving) {
            _settleFacing();
        }

        switch (s) {
        case "idle":
            idleTimer.interval = alertness > 0.55 ? (14000 + Math.random() * 12000)
                               : alertness > 0.25 ? (22000 + Math.random() * 18000)
                               : (38000 + Math.random() * 30000);
            idleTimer.restart();
            break;
        case "perch":
            break;
        case "sitNorth":
            if (!Plans.hasActivePlan(root)) {
                idleTimer.interval = 35000 + Math.random() * 25000;
                idleTimer.restart();
            }
            break;
        case "walk":
            walkTimer.interval = 2400 + Math.random() * 2600;
            walkTimer.restart();
            break;
        case "wander":
            wanderDirTimer.interval = 2400;
            wanderDirTimer.restart();
            wanderEndTimer.interval = 4200 + Math.random() * 6800;
            wanderEndTimer.restart();
            break;
        case "loaf":
        case "sit":
        case "deepsleep":
            if (!Plans.hasActivePlan(root)) {
                sitTimer.interval = 65000 + Math.random() * 85000;
                sitTimer.restart();
            }
            if (s === "loaf" && !_retiringToPen && restDrive > 0.34) {
                Social.broadcastYawn(root);
            }
            break;
        case "zoomies":
            wanderDirTimer.interval = 1100;
            wanderDirTimer.restart();
            zoomiesTimer.interval = 3800 + Math.random() * 4400;
            zoomiesTimer.restart();
            if (!Personality.hasQuirk(root, "sky_acrobat") && !Abilities.enjoysAcrobaticToss(root) && Math.random() < 0.09) {
                zoomieStumbleTimer.interval = 1200 + Math.random() * 1400;
                zoomieStumbleTimer.restart();
            }
            break;
        case "drag":
        case "airborne":
            break;
        default:
            actionFallbackTimer.interval = Math.max(900, spriteAnim.currentAnimDurationMs() + 350);
            actionFallbackTimer.restart();
            break;
        }
    }

    function restartIdle(mult): void {
        const base = alertness > 0.55 ? (14000 + Math.random() * 12000)
                   : alertness > 0.25 ? (22000 + Math.random() * 18000)
                   : (38000 + Math.random() * 30000);
        idleTimer.interval = base * (mult || 1);
        idleTimer.restart();
    }

    function continueResting(s: string): void {
        if (s !== state_) {
            enterState(s);
            return;
        }
        sitTimer.interval = 65000 + Math.random() * 85000;
        sitTimer.restart();
    }

    function restartWalk(): void {
        walkTimer.interval = 2200 + Math.random() * 2400;
        walkTimer.restart();
    }

    function _stopAllTimers(): void {
        idleTimer.stop();
        planBeatTimer.stop();
        walkTimer.stop();
        wanderDirTimer.stop();
        wanderEndTimer.stop();
        sitTimer.stop();
        actionFallbackTimer.stop();
        zoomiesTimer.stop();
        zoomieStumbleTimer.stop();
        fidgetRevert.stop();
    }

    function cancelRetireIfInterrupted(): void {
        if (!_retiringToPen) return;
        _retiringToPen = false;
        retireSafetyTimer.stop();
        if (activePlan && (activePlan.name === "retire_to_pen" || activePlan.name === "joint_retire_to_pen")) {
            Plans.clearPlan(root);
            enterState("idle");
        }
    }

    function scheduleStaggeredWake(delayMs: int, warmGreet: bool): void {
        _wakeWarmGreet = !!warmGreet;
        wakeDelayTimer.interval = Math.max(250, delayMs);
        wakeDelayTimer.restart();
    }

    function scheduleContagiousYawn(delayMs: int, warmPeerName: string): void {
        if (yawnCatchTimer.running) return;
        _yawnWarmPeerName = warmPeerName || "";
        yawnCatchTimer.interval = Math.max(1500, delayMs);
        yawnCatchTimer.restart();
    }

    Timer { id: idleTimer; onTriggered: Brain.think(root, Nav) }
    Timer { id: planBeatTimer; onTriggered: Brain.onPlanBeat(root, Nav) }
    Timer { id: walkTimer; onTriggered: Nav.walkArrived(root) }
    Timer {
        id: zoomieStumbleTimer
        onTriggered: {
            if (root.state_ === "zoomies") {
                Brain.onEvent(root, "zoomie_stumble", null, Nav);
            }
        }
    }
    Timer {
        id: wakeDelayTimer
        onTriggered: {
            if (root.state_ === "loaf" || root.state_ === "sit" || root.state_ === "deepsleep") {
                Plans.clearPlan(root);
                Memory.thinkAloud(root, "staggered_wake", "Stretched awake as the desktop came back to life", { minGapMs: 60000 });
                if (root._wakeWarmGreet) root.emitEmote("heart", false);
                root.enterState(SpeciesProfile.wakeStateFor(root));
            }
        }
    }
    Timer {
        id: yawnCatchTimer
        onTriggered: {
            Brain.onEvent(root, "caught_yawn", { warmPeerName: root._yawnWarmPeerName }, Nav);
            root._yawnWarmPeerName = "";
        }
    }
    Timer {
        id: dreamTwitchTimer
        interval: 22000 + Math.random() * 16000
        repeat: true
        running: !PetManager.hidden && root.state_ === "deepsleep"
        onTriggered: {
            interval = 22000 + Math.random() * 16000;
            if (Math.random() < 0.14) spriteAnim.triggerSquash(1.05, 0.96);
        }
    }
    Timer {
        id: wanderEndTimer
        onTriggered: {
            root.enterState("idle");
            if (Math.random() < 0.38) {
                const f = Gestures.fidget(root);
                if (f) {
                    spriteAnim.setState(f);
                    fidgetRevert.interval = Math.max(700, spriteAnim.currentAnimDurationMs() + 260);
                    fidgetRevert.restart();
                }
            }
        }
    }
    Timer { id: actionFallbackTimer; onTriggered: Brain.onActionFinished(root, Nav) }
    Timer { id: sitTimer; onTriggered: Brain.restTick(root) }
    Timer { id: zoomiesTimer; onTriggered: Brain.onActionFinished(root, Nav) }

    Timer {
        id: wanderDirTimer
        interval: 2000
        repeat: true
        onTriggered: {
            root.moveAngle += (Math.random() - 0.5) * Math.PI * 0.48;
            root.facingRight = Math.cos(root.moveAngle) >= 0;
            spriteAnim.setDirection(root.moveAngle);
        }
    }

    Timer {
        id: idleFidgetTimer
        interval: 10000 + Math.random() * 11000
        running: !PetManager.hidden
            && (root.state_ === "idle" || (root.state_ === "perch" && !root._perchRiding))
            && !fidgetRevert.running
        repeat: true
        onTriggered: {
            const act = Gestures.idleMicroAction(root);
            if (act) {
                if (act.kind === "loaf" && !planBeatTimer.running && root.state_ === "idle") {
                    root.enterState("loaf");
                } else if (act.kind === "potter" && !planBeatTimer.running && root.state_ === "idle") {
                    root.startPotter(act.angle, act.durationMs);
                } else if (act.kind === "fidget") {
                    spriteAnim.setState(act.state);
                    fidgetRevert.interval = Math.max(700, spriteAnim.currentAnimDurationMs() + 280);
                    fidgetRevert.restart();
                }
            }
            interval = 10000 + Math.random() * 11500;
        }
    }

    Timer {
        id: fidgetRevert
        onTriggered: {
            if (root.state_ === "idle" || root.state_ === "perch") {
                spriteAnim.setState(root.state_);
            }
        }
    }

    Timer {
        id: faceAttentionTimer
        interval: 420
        repeat: true
        running: !PetManager.hidden
            && (root.state_ === "idle" || root.state_ === "perch")
            && Date.now() < root.attentionUntil
        onTriggered: {
            if (fidgetRevert.running) return;
            const dx = root.attentionGX - (root.screenX() + root.worldX);
            const dy = root.attentionGY - (root.screenY() + root.worldY);
            if (Math.abs(dx) + Math.abs(dy) > 40) {
                root.facingRight = dx >= 0;
                if (root.state_ === "perch") {
                    const row = SpriteSheet.angleToDirectionRow(Math.atan2(Math.max(12, dy), dx));
                    if (row <= 2 || row >= 6) spriteAnim._dirRow = row;
                } else {
                    spriteAnim.setDirection(Math.atan2(dy, dx));
                }
            }
        }
    }

    Timer {
        id: ambientGazeTimer
        interval: 5400 + Math.random() * 6800
        repeat: true
        running: !PetManager.hidden && (root.state_ === "idle" || root.state_ === "perch")
        onTriggered: {
            interval = 5400 + Math.random() * 6800;
            if (fidgetRevert.running || Date.now() < root.attentionUntil) return;
            const nextRow = Gestures.ambientGlanceRow(root, spriteAnim._dirRow);
            spriteAnim._dirRow = nextRow;
            if (nextRow === 1 || nextRow === 2 || nextRow === 3) root.facingRight = true;
            else if (nextRow === 5 || nextRow === 6 || nextRow === 7) root.facingRight = false;
        }
    }

    property double _lastMetabolism: Date.now()
    property int _metabolismTicks: 0
    Timer {
        interval: 5000
        running: !PetManager.hidden
        repeat: true
        onRunningChanged: {
            if (running) root._lastMetabolism = Date.now();
        }
        onTriggered: {
            root._hour = new Date().getHours();
            const now = Date.now();
            if (root.illusionSpecies !== "" && now > root.illusionUntil) {
                root.illusionSpecies = "";
                root.illusionUntil = 0;
            }
            const dt = Math.min(60, Math.max(0.1, (now - root._lastMetabolism) / 1000));
            root._lastMetabolism = now;
            const perc = Perception.perceive(root);
            Drives.integrate(root, perc, dt);
            Memory.observeUser(root, perc);
            Brain.syncArchetype(root);
            if (++root._metabolismTicks % 6 === 0) {
                Memory.decayMemories(root);
            }
        }
        Component.onCompleted: interval = 4600 + Math.random() * 800
    }

    Timer {
        interval: 15 * 60000
        running: !PetManager.hidden
        repeat: true
        onTriggered: Brain.reflect(root)
    }

    readonly property real targetSpeed: {
        if (state_ === "walk") {
            let spd = Config.walkSpeed * SpeciesProfile.gaitMultiplier(root, gait);
            if (onJourney) {
                const rem = Math.hypot((screenX() + worldX) - targetGX, (screenY() + worldY) - targetGY);
                if (rem < 64) spd *= Math.max(0.42, rem / 64);
            }
            return spd;
        }
        if (state_ === "wander") {
            return Config.walkSpeed * SpeciesProfile.gaitMultiplier(root, "amble") * 0.72;
        }
        if (state_ === "zoomies") {
            return Config.walkSpeed * SpeciesProfile.gaitMultiplier(root, "scamper");
        }
        return 0;
    }

    readonly property real currentSpeed: targetSpeed > 0 ? Math.max(18, _liveSpeed) : 0

    function updateMovement(dt: real): void {
        if (state_ === "airborne") {
            Nav.updateAirborne(root, dt);
            return;
        }
        if (state_ === "perch") {
            Nav.updatePerch(root, dt);
            return;
        }
        if (targetSpeed <= 0) {
            _liveSpeed = 0;
            return;
        }

        _liveSpeed += (targetSpeed - _liveSpeed) * Math.min(1, dt * 7.5);
        Nav.updateSteering(root, dt);
        const step = currentSpeed * dt;
        if (onJourney && Nav.trySnapArrive(root, step)) return;

        worldX += Math.cos(moveAngle) * step;
        worldY += Math.sin(moveAngle) * step;
        Memory.trackPosition(root);
    }

    function reflectOffWall(hitX: bool, hitY: bool): void { Nav.reflectOffWall(root, hitX, hitY); }

    function onCursorNear(): void { Brain.onEvent(root, "cursor_near", null, Nav); }
    function onCursorWiggled(gx: real, gy: real): void { Brain.onEvent(root, "cursor_wiggled", { gx: gx, gy: gy }, Nav); }
    function onPetted(): void {
        spriteAnim.triggerSquash(1.08, 0.93);
        Brain.onEvent(root, "petted", null, Nav);
    }
    function onStroked(): void {
        spriteAnim.triggerSquash(1.10, 0.91);
        Brain.onEvent(root, "stroked", null, Nav);
    }
    function onClicked(): void {
        spriteAnim.triggerSquash(1.06, 0.95);
        Brain.onEvent(root, "clicked", null, Nav);
    }
    function onFed(): void {
        spriteAnim.triggerSquash(1.10, 0.91);
        Brain.onEvent(root, "fed", null, Nav);
    }
    function onPlayTriggered(): void {
        spriteAnim.triggerSquash(0.92, 1.09);
        Brain.onEvent(root, "play_triggered", null, Nav);
    }
    function onWindowEvent(cls: string): void { Brain.onEvent(root, "window_focused", { windowClass: cls }, Nav); }
    function onWindowOpened(cls: string): void { Brain.onEvent(root, "window_opened", { windowClass: cls }, Nav); }
    function onWindowClosed(cls: string, gx: real, gy: real, w: real, h: real, addr: string): void {
        Brain.onEvent(root, "window_closed", { windowClass: cls, gx: gx, gy: gy, w: w, h: h, address: addr }, Nav);
    }
    function onWindowUrgent(cls: string, gx: real, gy: real): void { Brain.onEvent(root, "window_urgent", { windowClass: cls, gx: gx, gy: gy }, Nav); }
    function onWorkspaceChanged(): void { Brain.onEvent(root, "workspace_changed", null, Nav); }
    function onIdleBegan(): void { Brain.onEvent(root, "user_idle", null, Nav); }
    function onIdleEnded(idleDurationSec = 0): void { Brain.onEvent(root, "user_active", { idleDurationSec: idleDurationSec }, Nav); }
    function onMusicStarted(): void { Brain.onEvent(root, "music_started", null, Nav); }
    function onMicStateChanged(active: bool): void { Brain.onEvent(root, "mic_changed", { active: active }, Nav); }
    function onBuildCompleted(durationSec: real): void { Brain.onEvent(root, "build_completed", { durationSec: durationSec }, Nav); }

    function toggleRest(): void {
        if (state_ === "loaf" || state_ === "sit" || state_ === "deepsleep") {
            Plans.clearPlan(root);
            Memory.thinkAloud(root, "woke_manual", "Stretched awake", { minGapMs: 2000 });
            enterState(SpeciesProfile.wakeStateFor(root));
        } else {
            restDrive = Math.max(0.45, restDrive);
            Plans.clearPlan(root);
            Memory.thinkAloud(root, "tuck_in", "Settled down to rest", { minGapMs: 2000 });
            enterState("loaf");
        }
    }

    function summonToCursor(): void {
        const travelStep = InputTracker.cursorKnown
            ? { kind: "travel", gait: "trot", label: "Trotting to cursor", dynamic: "cursor", offsetX: 0, offsetY: 0 }
            : { kind: "travel", gait: "trot", label: "Trotting to center", gx: screenX() + (screenW() - width) * 0.5, gy: screenY() + (screenH() - height) * 0.5 };
        Plans.startPlan(root, {
            name: "summoned",
            label: "Called Over",
            reason: "Summoned by user",
            urgency: 0.78,
            thought: "Trotted over when called",
            steps: [
                travelStep,
                { kind: "act", label: "Arrived", states: SpeciesProfile.greetGesturesFor(root), faceCursor: InputTracker.cursorKnown, emote: "exclaim", directEmote: true }
            ]
        }, Nav, Gestures.pickAvailable);
    }

    function socialEvent(kind: string, fromPet: var, extra): void {
        const payload = Object.assign({ fromPet: fromPet }, extra || {});
        Brain.onEvent(root, "pet_" + kind, payload, Nav);
    }

    function beginRetireToPen(): void {
        if (_retiringToPen || state_ === "drag") return;
        _retiringToPen = true;
        retireSafetyTimer.restart();
        const perc = Perception.perceive(root);
        Plans.startPlan(root, PlanBuildersEnv.buildRetirePlan(root, perc), Nav, Gestures.pickAvailable);
    }

    function beginJointRetireWith(partner: var, isFollower: bool): void {
        if (_retiringToPen || state_ === "drag" || !partner) return;
        _retiringToPen = true;
        retireSafetyTimer.restart();
        const perc = Perception.perceive(root);
        Plans.startPlan(root, PlanBuildersSocial.buildJointRetirePlan(root, partner, perc, isFollower), Nav, Gestures.pickAvailable);
    }

    function greetSanctuaryArrival(arrivingPet: var): void {
        if (!arrivingPet || _retiringToPen || state_ === "drag" || state_ === "airborne") return;
        Plans.startPlan(root, PlanBuildersSocial.buildWelcomeFriendPlan(root, arrivingPet), Nav, Gestures.pickAvailable);
    }

    function playEvolutionCeremony(): void {
        if (state_ === "drag" || _retiringToPen) return;
        spriteAnim.triggerSquash(0.86, 1.18);
        emitEmote("heart", true);
        Plans.startPlan(root, {
            name: "evolved_ceremony",
            label: "Evolved!",
            reason: "Celebrating evolution into " + SpeciesProfile.profileFor(petData.sprite).displayName,
            urgency: 0.92,
            durationMs: 24000,
            steps: [
                { kind: "act", label: "Radiant spin", states: ["twirl", "rotate"] },
                { kind: "act", label: "Evolution flourish", states: ["emit", "pose", "hop"] },
                { kind: "act", label: "Joyful hop", states: ["hop", "nod"] }
            ]
        }, Nav, Gestures.pickAvailable);
    }

    Timer {
        id: retireSafetyTimer
        interval: 34000
        onTriggered: {
            if (root._retiringToPen && root.petData) {
                PetManager.completeRetire(root.petData.id);
            }
        }
    }

    readonly property string renderedSpecies: root.illusionSpecies !== ""
        ? root.illusionSpecies
        : (root.petData.sprite ?? "")

    SpriteAnimation {
        id: spriteAnim
        anchors.fill: parent
        speciesName: root.renderedSpecies
        petColor: root.petData.color ?? "#cba6f7"
        mirror: !root.facingRight
        happiness: root.happiness
        actionMap: root.petData.actions ?? ({})
        moveSpeed: root.currentSpeed
        restDrive: root.restDrive
        altitude: root.altitude
        spriteDir: root.renderedSpecies ? Qt.resolvedUrl("../assets/sprites/" + root.renderedSpecies) : ""
        onOneShotFinished: {
            if (root.state_ === "idle" || root.state_ === "perch") {
                fidgetRevert.stop();
                spriteAnim.setState(root.state_);
                return;
            }
            actionFallbackTimer.stop();
            Brain.onActionFinished(root, Nav);
        }
    }

    EmoteBubble {
        id: bubbles
        readonly property bool flipBelow: (root.worldY - root.altitude) < 42
        x: Math.max(
            4 - root.worldX,
            Math.min(root.screenW() - width - 4 - root.worldX, (root.width - width) / 2)
        )
        y: flipBelow ? (root.height - 2) : (-height + 6)
        flipped: flipBelow
        sleeping: root.state_ === "deepsleep"
        altitude: root.altitude
    }

    Component.onCompleted: {
        _lastPreset = petData.personality ?? "emergent";
        _lastTraitsSig = JSON.stringify(petData.traits ?? null);
        roamStartedAt = Date.now();
        PetManager.register(root);
        const rec = PetManager.residentFor(petData.id || "");
        if (rec && rec.loaded) {
            _loadedState = rec.hasSavedState ? rec.applyToPet(root) : false;
            _stateReady = true;
        }
        const arrivedFromPen = PetManager.consumeArrivalFlag(petData.id || "");
        facingRight = Math.random() < 0.5;
        enterState("idle");
        _settleFacing();
        idleTimer.interval = 5000 + Math.random() * 7000;
        idleTimer.restart();

        if (arrivedFromPen) {
            Qt.callLater(() => {
                const fromLeft = Math.random() < 0.5;
                if (root.petWindow) {
                    const entryX = fromLeft
                        ? (root.screenX() + 6)
                        : Math.max(root.screenX() + 6, root.screenX() + root.screenW() - root.width - 6);
                    const entryY = Math.max(
                        root.screenY() + 60,
                        Math.min(root.screenY() + root.screenH() - root.height - 80, root.screenY() + root.worldY)
                    );
                    root.petWindow.moveToGlobal(entryX, entryY);
                    root.facingRight = fromLeft;
                }
                const perc = Perception.perceive(root);
                Plans.startPlan(root, PlanBuildersEnv.buildArrivePlan(root, perc, fromLeft), Nav, Gestures.pickAvailable);
                PetManager.notifySanctuaryArrival(root);
            });
        }
    }

    Component.onDestruction: {
        const rec = PetManager.residentFor(petData.id || "");
        if (rec && !rec._released && root._stateReady) {
            rec.syncFromPet(root, true);
        }
        PetManager.unregister(root);
    }
}
