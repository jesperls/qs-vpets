import QtQuick
import Quickshell.Io
import "SpeciesProfile.js" as SpeciesProfile
import "SpriteSheet.js" as SpriteSheet

Item {
    id: root

    property string speciesName: ""
    property string petColor: "#cba6f7"
    property bool mirror: false
    property string currentState: "idle"
    property real happiness: 0.5
    property real moveSpeed: 0
    property real restDrive: 0
    property real altitude: 0
    property string spriteDir: ""
    property var actionMap: ({})

    readonly property var defaultMap: SpriteSheet.DEFAULT_STATE_MAP
    property var _animData: null
    property string _animName: "Idle"
    property int _frame: 0
    property int _dirRow: 0
    property int _repCount: 0
    property real _tickAccum: 0
    property double _lastFrameTickMs: 0
    property real squashX: 1.0
    property real squashY: 1.0

    signal oneShotFinished(stateName: string)

    readonly property bool useSpriteSheet: _animData !== null && !!_animData["Walk"]
    readonly property var _currentAnim: useSpriteSheet
        ? (_animData[_animName] || _animData["Walk"] || null)
        : null

    function triggerSquash(sx: real, sy: real): void {
        squashAnim.stop();
        root.squashX = sx;
        root.squashY = sy;
        squashAnim.start();
    }

    ParallelAnimation {
        id: squashAnim
        NumberAnimation { target: root; property: "squashX"; to: 1.0; duration: 240; easing.type: Easing.OutBack }
        NumberAnimation { target: root; property: "squashY"; to: 1.0; duration: 240; easing.type: Easing.OutBack }
    }

    function _stateSpeedMult(s: string): real {
        if (s === "walk" || s === "wander" || s === "zoomies") {
            return Math.max(0.38, Math.min(1.85, root.moveSpeed / 82));
        }
        if (s === "idle" || s === "perch") {
            return SpeciesProfile.standSpec(root.speciesName).speed;
        }
        if (s === "idleOnce") return 0.74;
        if (s === "loaf" || s === "sit" || s === "deepsleep") return 0.58;
        if (s === "sitNorth") return 0.65;
        if (s === "rotate" || s === "twirl" || s === "dance") return 0.54;
        if (s === "lookUpNorth" || s === "lookUp" || s === "nod" || s === "pose" || s === "sitDown"
                || s === "appeal" || s === "tailWhip" || s === "shake" || s === "emit" || s === "rearUp") return 0.58;
        if (s === "charge" || s === "hide" || s === "sink" || s === "special0" || s === "shock" || s === "lick") return 0.62;
        if (s === "deepBreath" || s === "wake" || s === "eat") return 0.68;
        return 1.0;
    }

    function _endHoldTicks(s: string): int {
        if (s === "sitDown") return 45;
        if (s === "lookUpNorth" || s === "lookUp") return 34;
        if (s === "pose") return 14;
        if (s === "nod" || s === "idleOnce") return 10;
        return 0;
    }

    function _leadSkipTicks(s: string, anim: var): int {
        if (s === "idleOnce" && anim && anim.durations && anim.durations.length > 1 && anim.durations[0] > 12) {
            return anim.durations[0] - 8;
        }
        return 0;
    }

    function setState(name: string): void {
        currentState = name;
        const nextAnim = SpriteSheet.resolveAnimName(name, _animData, actionMap, root.speciesName);
        if (nextAnim !== _animName || !SpriteSheet.isLoopingState(name)) {
            _animName = nextAnim;
            _frame = 0;
            _repCount = 0;
            _tickAccum = 0;
        }
        const anim = _animData ? (_animData[_animName] || null) : null;
        if (name === "idleOnce") {
            _tickAccum = _leadSkipTicks(name, anim);
        }
        if (name === "deepsleep") {
            _dirRow = 0;
        } else if (name === "sitNorth" || name === "lookUpNorth" || name === "sitDown" || name === "lookUp") {
            _dirRow = 4; // PMD Sit and LookUp sheets are drawn facing North (row 4)
        }
    }

    function setDirection(angle: real): void {
        if (!useSpriteSheet) return;
        if (currentState === "deepsleep" || currentState === "loaf" || currentState === "sit"
                || currentState === "sitNorth" || currentState === "lookUpNorth") {
            return;
        }
        _dirRow = SpriteSheet.angleToDirectionRow(angle);
    }

    function currentAnimDurationMs(): int {
        const anim = _currentAnim;
        if (!anim || !anim.totalTicks) return 750;
        const mult = _stateSpeedMult(currentState);
        const total = Math.max(8, anim.totalTicks - _leadSkipTicks(currentState, anim)) + _endHoldTicks(currentState);
        return Math.round((total * SpriteSheet.PMD_TICK_MS) / mult);
    }

    onSpeciesNameChanged: {
        if (_animData) setState(currentState);
    }

    onSpriteDirChanged: {
        _animData = null;
        _frame = 0;
        _tickAccum = 0;
    }

    FileView {
        id: animFile
        path: root.spriteDir ? (root.spriteDir.replace(/^file:\/\//, "") + "/AnimData.xml") : ""
        printErrors: false
        onLoaded: {
            const parsed = SpriteSheet.parseAnimData(text());
            root._animData = parsed.anims;
            root.setState(root.currentState);
        }
    }

    Timer {
        interval: 32
        running: root.useSpriteSheet && root._currentAnim !== null && root.visible
        repeat: true
        onRunningChanged: root._lastFrameTickMs = Date.now()
        onTriggered: {
            const now = Date.now();
            const dtMs = root._lastFrameTickMs > 0 ? Math.min(100, now - root._lastFrameTickMs) : 32;
            root._lastFrameTickMs = now;

            const anim = root._currentAnim;
            if (!anim || !anim.durations || anim.durations.length === 0) return;
            if (root._frame >= anim.frameCount) {
                root._frame = 0;
                root._tickAccum = 0;
            }

            const s = root.currentState;
            const stand = SpeciesProfile.standSpec(root.speciesName);
            if ((s === "idle" || s === "perch") && root._animName === "Idle" && stand.mode === "hold0") {
                root._frame = 0;
                root._tickAccum = 0;
                return;
            }
            if ((s === "sitNorth" || s === "sit" || s === "loaf") && root._animName === "Sit" && root._frame >= anim.frameCount - 1) {
                return; // Hold seated frame instead of looping stand->sit
            }
            if ((s === "loaf" || s === "sit") && root._animName === "Withdraw" && root._frame >= Math.min(5, anim.frameCount - 1)) {
                return; // Hold closed Toxapex shell dome at frame 5; frames 6..13 pop back out
            }

            const speedMult = root._stateSpeedMult(s);
            const isLastFrame = root._frame + 1 >= anim.frameCount;
            const needed = (anim.durations[root._frame] || 4) + (isLastFrame ? root._endHoldTicks(s) : 0);

            root._tickAccum += (dtMs / SpriteSheet.PMD_TICK_MS) * speedMult;
            if (root._tickAccum >= needed) {
                root._tickAccum = Math.min(root._tickAccum - needed, needed);
                if ((s === "idle" || s === "perch") && root._animName === "Idle"
                        && stand.mode === "prefix10" && root._frame >= Math.min(9, anim.frameCount - 1)) {
                    root._frame = 0;
                    return;
                }
                if (isLastFrame) {
                    if (SpriteSheet.isLoopingState(s)) {
                        root._frame = 0;
                    } else {
                        const targetReps = s === "eat" ? 2 : 1;
                        root._frame = 0;
                        if (++root._repCount >= targetReps) {
                            root._repCount = 0;
                            root.oneShotFinished(s);
                        }
                    }
                } else {
                    root._frame += 1;
                }
            }
        }
    }

    Item {
        id: viewport
        visible: root.useSpriteSheet && root._currentAnim !== null && sheet.status === Image.Ready
        readonly property real px: root.width / 32
        readonly property int fw: root._currentAnim ? root._currentAnim.frameWidth : 32
        readonly property int fh: root._currentAnim ? root._currentAnim.frameHeight : 32
        width: fw * px
        height: fh * px
        x: Math.round((root.width - width) / 2)
        // PMD Collab sprites anchor ground contact at y = fh/2 + 4 across every animation size.
        y: Math.round(root.height - (fh * 0.5 + 8) * px - root.altitude)
        clip: true

        transform: Scale {
            origin.x: viewport.width / 2
            origin.y: (viewport.fh * 0.5 + 4) * viewport.px
            xScale: root.squashX
            yScale: root.squashY
        }

        Image {
            id: sheet
            source: root.spriteDir && root._currentAnim
                ? (root.spriteDir + "/" + root._currentAnim.sheet + "-Anim.png")
                : ""
            smooth: false
            width: sourceSize.width * viewport.px
            height: sourceSize.height * viewport.px
            readonly property int cols: viewport.fw > 0 && sourceSize.width > 0
                ? Math.max(1, Math.floor(sourceSize.width / viewport.fw))
                : 1
            readonly property int rows: viewport.fh > 0 && sourceSize.height > 0
                ? Math.max(1, Math.floor(sourceSize.height / viewport.fh))
                : 1
            readonly property int effectiveRow: rows <= 1 ? 0 : Math.min(root._dirRow, rows - 1)
            x: -Math.min(root._frame, cols - 1) * viewport.fw * viewport.px
            y: -effectiveRow * viewport.fh * viewport.px
        }
    }

    Rectangle {
        id: fallbackBody
        visible: !root.useSpriteSheet || sheet.status === Image.Error
        width: root.width * 0.78
        height: root.height * ((root.currentState === "sit" || root.currentState === "loaf" || root.currentState === "deepsleep") ? 0.62 : 0.76)
        x: (root.width - width) / 2
        y: root.height - height - 4 - root.altitude
        radius: width * 0.28
        color: root.petColor
        transform: Scale {
            origin.x: fallbackBody.width / 2
            origin.y: fallbackBody.height
            xScale: (root.mirror ? -1 : 1) * root.squashX
            yScale: root.squashY
        }
    }
}
