import QtQuick
import Quickshell.Io
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
    property var _clip: null
    property string _animName: "Idle"
    property int _frame: 0
    property int _dirRow: 0
    property int _repCount: 0
    property real _tickAccum: 0
    property double _lastFrameTickMs: 0
    property real squashX: 1.0
    property real squashY: 1.0
    property bool _inSetState: false

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

    function _effectiveSpeedMult(clip: var): real {
        if (!clip) return 1.0;
        if (clip.dynamicWalkSpeed) {
            const spd = root.moveSpeed > 0 ? root.moveSpeed : 68;
            return Math.max(0.38, Math.min(1.85, spd / 82));
        }
        return clip.speed > 0 ? clip.speed : 1.0;
    }

    function _applyState(name: string): void {
        const nextClip = SpriteSheet.resolveClip(name, _animData, actionMap, root.speciesName);
        const prev = _clip;
        const resetPlayback = !prev
            || nextClip.animName !== _animName
            || !nextClip.loop
            || nextClip.startFrame !== prev.startFrame
            || nextClip.endFrame !== prev.endFrame
            || nextClip.holdAtFrame !== prev.holdAtFrame;

        _clip = nextClip;
        _animName = nextClip.animName;
        if (resetPlayback) {
            _frame = nextClip.startFrame;
            _repCount = 0;
            _tickAccum = nextClip.leadSkipTicks;
        }
        if (nextClip.fixedDirRow >= 0) {
            _dirRow = nextClip.fixedDirRow;
        }
    }

    function setState(name: string): void {
        _inSetState = true;
        currentState = name;
        _inSetState = false;
        _applyState(name);
    }

    onCurrentStateChanged: {
        if (!_inSetState && _animData) _applyState(currentState);
    }

    function setDirection(angle: real): void {
        if (!useSpriteSheet) return;
        if (_clip && _clip.lockDirection) return;
        _dirRow = SpriteSheet.angleToDirectionRow(angle);
    }

    function currentAnimDurationMs(): int {
        const anim = _currentAnim;
        if (!anim || !anim.totalTicks) return 750;
        const clip = _clip || SpriteSheet.resolveClip(currentState, _animData, actionMap, root.speciesName);
        return SpriteSheet.clipDurationMs(clip, anim, _effectiveSpeedMult(clip));
    }

    onSpeciesNameChanged: {
        if (_animData) setState(currentState);
    }

    onSpriteDirChanged: {
        _animData = null;
        _clip = null;
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
            const clip = root._clip || SpriteSheet.resolveClip(root.currentState, root._animData, root.actionMap, root.speciesName);
            const startF = Math.max(0, Math.min(anim.frameCount - 1, clip.startFrame));
            const endF = Math.max(startF, Math.min(anim.frameCount - 1, clip.endFrame));

            if (root._frame < startF || root._frame > endF) {
                root._frame = startF;
                root._tickAccum = 0;
            }

            if (clip.loop && clip.holdAtFrame >= 0 && root._frame >= clip.holdAtFrame) {
                root._frame = clip.holdAtFrame;
                root._tickAccum = 0;
                return;
            }

            const speedMult = root._effectiveSpeedMult(clip);
            const isLastFrame = root._frame >= endF;
            const needed = (anim.durations[root._frame] || 4) + (isLastFrame ? clip.endHoldTicks : 0);

            root._tickAccum += (dtMs / SpriteSheet.PMD_TICK_MS) * speedMult;
            if (root._tickAccum >= needed) {
                root._tickAccum = Math.min(root._tickAccum - needed, needed);
                if (isLastFrame) {
                    root._frame = startF;
                    if (!clip.loop && ++root._repCount >= clip.reps) {
                        root._repCount = 0;
                        root.oneShotFinished(root.currentState);
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
