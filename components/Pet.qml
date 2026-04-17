import QtQuick
import Quickshell.Io
import "../config"
import "../services"
import "ai/Personality.js" as Personality
import "ai/Brain.js" as Brain
import "ai/Perception.js" as Perception
import "ai/Drives.js" as Drives
import "ai/Memory.js" as Memory
import "ai/Intentions.js" as Intentions
import "PetNav.js" as Nav
import "PetPersistence.js" as Persist

Item {
    id: root

    required property var petData
    readonly property var _basePersonality: Personality.resolve(petData.personality ?? "curious")
    readonly property var personality: {
        if (!traits) return _basePersonality;
        var p = {};
        var keys = Object.keys(_basePersonality);
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            p[k] = Math.max(0, Math.min(1, _basePersonality[k] + (traits[k] || 0)));
        }
        return p;
    }

    property string state_: "idle"
    property real moveAngle: 0
    property bool facingRight: true
    property real worldX: 0
    property real worldY: 0

    property real happiness: 0.5
    property real restDrive: 0.1
    property real exploreDrive: 0.3
    property real socialDrive: 0.2
    property real comfortDrive: 0.0
    property real playDrive: 0.1
    property real alertness: 0.5
    property var thoughts: []
    property var intention: null
    property var visitedCells: ({})
    property var windowPrefs: ({})
    property var placeMemory: ({})
    property var traits: null
    property real mood: 0.5
    property real _lastTrackTime: 0
    property int _hour: new Date().getHours()
    readonly property bool isNighttime: _hour >= 23 || _hour < 6

    property real homeX: 0
    property real homeY: 0
    readonly property real homeRadius: 200
    property bool onJourney: false
    property bool _journeyToWindow: false
    property real targetX: 0
    property real targetY: 0

    readonly property var config: Config
    readonly property var windowTracker: WindowTracker
    readonly property var petManager: PetManager
    readonly property var systemMonitor: SystemMonitor
    readonly property var inputTracker: InputTracker
    readonly property var _ai: ({ Perception: Perception, Drives: Drives, Memory: Memory, Intentions: Intentions })
    property alias sprite: sprite

    function screenW() { return parent ? parent.width : 1920; }
    function screenH() { return parent ? parent.height : 1080; }
    function screenX() { return parent ? (parent.screen?.x ?? 0) : 0; }
    function screenY() { return parent ? (parent.screen?.y ?? 0) : 0; }

    function enterState(s) {
        if (state_ === s) return;
        _stopAllTimers();
        if (s !== "walk" && s !== "wander" && s !== "dance") {
            onJourney = false;
            _journeyToWindow = false;
        }
        state_ = s;
        sprite.setState(s);
        if (s === "idle") _applyRestlessAnim();
        if (s === "walk" || s === "wander" || s === "dance") sprite.setDirection(moveAngle);

        switch (s) {
        case "idle":
            idleTimer.interval = alertness > 0.5 ? (3000 + Math.random() * 5000)
                               : alertness > 0.25 ? (5000 + Math.random() * 10000)
                               : (8000 + Math.random() * 20000);
            idleTimer.restart(); break;
        case "walk":
            walkTimer.interval = 2000 + Math.random() * 3000;
            walkTimer.restart(); break;
        case "wander":
            wanderDirTimer.restart();
            wanderEndTimer.interval = 5000 + Math.random() * 10000;
            wanderEndTimer.restart(); break;
        case "sit":
            var sitMult = 1 + root.personality.sleepiness * 1.2;
            sitTimer.interval = restDrive > 0.7 ? (60000 + Math.random() * 120000) * sitMult
                              : restDrive > 0.4 ? (20000 + Math.random() * 40000) * sitMult
                              : (8000 + Math.random() * 15000) * sitMult;
            sitTimer.restart(); break;
        case "deepsleep":
            sitTimer.interval = (90000 + Math.random() * 180000) * (1 + root.personality.sleepiness * 1.5);
            sitTimer.restart(); break;
        case "dance":
            danceTimer.interval = 5000 + Math.random() * 10000;
            danceTimer.restart(); break;
        case "drag":
            break;
        default:
            var fallback = ({ react: 600, hop: 800, attack: 1000, shoot: 900,
                lookUp: 1500, nod: 800, pose: 1500, eat: 2000, trip: 1000,
                wake: 1200, deepBreath: 2000, cringe: 800, sitDown: 1500,
                faint: 1500, charge: 1200, double: 1000 })[s] || 800;
            actionTimer.interval = _animDuration() || fallback;
            actionTimer.restart(); break;
        }
    }

    function _animDuration() {
        var anim = sprite._animData ? sprite._animData[sprite._animName] : null;
        if (!anim || !anim.durations) return 0;
        var total = 0;
        for (var i = 0; i < anim.durations.length; i++) total += anim.durations[i];
        return total * 50;
    }

    function restartIdle() {
        idleTimer.interval = alertness > 0.5 ? (2000 + Math.random() * 4000)
                           : alertness > 0.25 ? (4000 + Math.random() * 8000)
                           : (6000 + Math.random() * 15000);
        idleTimer.restart();
    }
    function restartWalk() { walkTimer.interval = 2000 + Math.random() * 3000; walkTimer.restart(); }

    function _stopAllTimers() {
        idleTimer.stop(); walkTimer.stop();
        wanderDirTimer.stop(); wanderEndTimer.stop();
        sitTimer.stop(); actionTimer.stop(); danceTimer.stop();
    }

    Timer { id: idleTimer; onTriggered: Brain.tick(root, Nav) }
    Timer { id: walkTimer; onTriggered: Nav.walkArrived(root) }
    Timer { id: wanderEndTimer; onTriggered: root.enterState("idle") }
    Timer { id: actionTimer; onTriggered: root.enterState("idle") }

    Timer { id: sitTimer; onTriggered: {
        Memory.add(root, "well_rested");
        root.enterState("wake");
    }}

    Timer { id: danceTimer; onTriggered: root.enterState("idle") }

    Timer { id: wanderDirTimer; interval: 2000; repeat: true; onTriggered: {
        var diff = (Math.random() - 0.5) * Math.PI * 0.5;
        root.moveAngle += diff;
        root.facingRight = Math.cos(root.moveAngle) >= 0;
        sprite.setDirection(root.moveAngle);
    }}

    Timer {
        interval: 4000 + Math.random() * 6000
        running: root.state_ === "idle"; repeat: true
        onTriggered: {
            var r = Math.random();
            if (r < 0.15) {
                root.facingRight = !root.facingRight;
                sprite.setDirection(root.facingRight ? 0 : Math.PI);
                faceUserTimer._ticks = 0;
            } else if (r < 0.35) {
                var fidgets = ["attack", "hop", "shoot", "nod", "pose", "charge"];
                sprite.setState(Brain._pick(root, fidgets));
                var animDur = _animDuration() || 800;
                fidgetRevert.interval = animDur;
                fidgetRevert.restart();
                if (idleTimer.interval < animDur + 500) {
                    idleTimer.interval = animDur + 500;
                    idleTimer.restart();
                }
            }
            interval = 3000 + Math.random() * 5000;
        }
    }
    Timer {
        id: fidgetRevert
        onTriggered: {
            if (root.state_ !== "idle") return;
            sprite.setState("idle");
            _applyRestlessAnim();
        }
    }

    function _applyRestlessAnim() {
        var restless = Math.max(exploreDrive, socialDrive, playDrive, restDrive * 0.6);
        if (restless > 0.35 && alertness > 0.3 && sprite._animData && sprite._animData["Walk"]) {
            sprite._animName = "Walk";
            sprite._frame = 0;
            sprite._ticksInFrame = 0;
        }
    }

    readonly property var _restingAnims: ({ Idle: true, Walk: true, Sleep: true, Laying: true })

    Timer {
        id: faceUserTimer
        property int _ticks: 0
        interval: 400; repeat: true
        running: root.state_ === "idle" || root.state_ === "sit" || root.state_ === "deepsleep"
        onTriggered: {
            if (fidgetRevert.running) return;
            if (!root._restingAnims[sprite._animName]) return;
            _ticks++;
            if (_ticks >= 4 && sprite._dirRow !== 0) sprite._dirRow = 0;
        }
        onRunningChanged: _ticks = 0
    }

    Timer { interval: 60000; running: true; repeat: true; onTriggered: {
        root._hour = new Date().getHours();
        root.happiness = Math.max(0.1, root.happiness - 0.005);
        root.mood = root.mood * 0.9 + root.happiness * 0.1;
    }}

    Timer {
        interval: 30 * 60000; running: true; repeat: true
        onTriggered: Brain.reflect(root)
    }

    Timer {
        interval: 30000; running: true; repeat: true
        onTriggered: {
            var perc = Perception.perceive(root);
            Drives.update(root, perc);
            Memory.decayPreferences(root);
            Memory.decayPlaceMemory(root);
        }
        Component.onCompleted: interval = 28000 + Math.random() * 4000
    }

    readonly property real currentSpeed: {
        if (state_ === "walk") {
            var u = intention ? intention.priority : 0.5;
            return Config.walkSpeed * (0.7 + u * 0.5);
        }
        if (state_ === "wander") return Config.walkSpeed * 0.35;
        if (state_ === "dance") return Config.walkSpeed * 1.4;
        return 0;
    }

    function updateMovement(dt) {
        if (currentSpeed > 0) {
            var step = currentSpeed * dt;
            if (onJourney) {
                var dx = targetX - worldX, dy = targetY - worldY;
                var dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < step + 20) {
                    worldX = targetX;
                    worldY = targetY;
                    Nav.walkArrived(root);
                    return;
                }
            }
            worldX += Math.cos(moveAngle) * step;
            worldY += Math.sin(moveAngle) * step;
            Memory.trackPosition(root);
        }
    }

    function bounce() { Nav.bounce(root); }

    function onCursorNear() { Brain.onEvent(root, "cursor_near"); }
    function onPetted() { Brain.onEvent(root, "petted"); }
    function onWindowEvent(cls) { Brain.onEvent(root, "window_focused", { windowClass: cls }); }
    function onWindowOpened(cls) { Brain.onEvent(root, "window_opened", { windowClass: cls }); }
    function onWorkspaceChanged() { Brain.onEvent(root, "workspace_changed"); }
    function onIdleBegan() { Brain.onEvent(root, "user_idle"); }

    SpriteAnimation {
        id: sprite
        anchors.fill: parent
        petColor: petData.color ?? "#cba6f7"
        mirror: !root.facingRight
        happiness: root.happiness
        actionMap: petData.actions ?? {}
        moveSpeed: root.currentSpeed
        restDrive: root.restDrive
        spriteDir: petData.sprite ? Qt.resolvedUrl("../assets/sprites/" + petData.sprite) : ""
    }

    property alias _stateFileView: stateFile
    property alias _stateMkdir: stateMkdir
    property string _statePendingJson: ""

    FileView {
        id: stateFile
        path: Config.configDir + "/state-" + root.petData.name + ".json"
        onLoadFailed: function(err) {}
        onLoaded: Persist.load(root)
    }
    Process { id: stateMkdir; command: ["mkdir", "-p", Config.configDir]; onExited: stateFile.setText(root._statePendingJson) }
    Timer { interval: 30000; running: true; repeat: true; onTriggered: Persist.save(root) }

    Component.onCompleted: { PetManager.register(root); enterState("react"); }
    Component.onDestruction: { Persist.save(root); PetManager.unregister(root); }
}
