pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Window
import Quickshell.Io
import "SpriteSheet.js" as SpriteSheet

Item {
    id: root

    property string speciesName: ""
    property string petColor: "#cba6f7"
    property bool mirror: false
    property string currentState: "idle"
    property real moveSpeed: 0
    property real altitude: 0
    property real gaitOffsetY: 0
    property string spriteDir: ""
    property var actionMap: ({})
    property bool showShadow: false
    property int shadowSize: 1
    property int forcedDirRow: -1
    property bool paused: false

    property var _animData: null
    property var _clip: null
    property string _animName: "Idle"
    property int _frame: 0
    property int _dirRow: forcedDirRow >= 0 ? ((forcedDirRow % 8) + 8) % 8 : 0
    property int _targetDirRow: _dirRow
    property int _repCount: 0
    property real _tickAccum: 0
    property double _lastFrameTickMs: 0
    property real _scheduledSpeedMult: 1.0
    property real squashX: 1.0
    property real squashY: 1.0
    property bool _inSetState: false

    signal oneShotFinished(stateName: string)

    readonly property bool useSpriteSheet: _animData !== null && !!_animData["Walk"]
    readonly property var _currentAnim: useSpriteSheet
        ? (_animData[_animName] || _animData["Walk"] || null)
        : null
    readonly property bool _holdingStaticFrame: _clip !== null
        && _clip.loop
        && _clip.holdAtFrame >= 0
        && _frame >= _clip.holdAtFrame
    readonly property bool _animActive: useSpriteSheet
        && _currentAnim !== null
        && visible
        && Window.visibility !== Window.Hidden
        && !paused
        && !_holdingStaticFrame

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
            _targetDirRow = nextClip.fixedDirRow;
        } else if (forcedDirRow >= 0) {
            const clamped = ((forcedDirRow % 8) + 8) % 8;
            _dirRow = clamped;
            _targetDirRow = clamped;
        }
        _scheduleNextFrame();
    }

    function _scheduleNextFrame(): void {
        if (!_animActive) {
            frameTimer.stop();
            return;
        }
        const anim = _currentAnim;
        if (!anim || !anim.durations || anim.durations.length === 0) {
            frameTimer.stop();
            return;
        }
        const clip = _clip || SpriteSheet.resolveClip(currentState, _animData, actionMap, root.speciesName);
        const startF = Math.max(0, Math.min(anim.frameCount - 1, clip.startFrame));
        const endF = Math.max(startF, Math.min(anim.frameCount - 1, clip.endFrame));
        if (_frame < startF || _frame > endF) {
            _frame = startF;
            _tickAccum = 0;
        }
        if (clip.loop && clip.holdAtFrame >= 0 && _frame >= clip.holdAtFrame) {
            _frame = clip.holdAtFrame;
            _tickAccum = 0;
            frameTimer.stop();
            return;
        }
        const speedMult = Math.max(0.05, _effectiveSpeedMult(clip));
        const isLastFrame = _frame >= endF;
        const needed = (anim.durations[_frame] || 4) + (isLastFrame ? clip.endHoldTicks : 0);
        const remTicks = Math.max(0, needed - _tickAccum);
        const delayMs = Math.max(16, Math.round((remTicks * SpriteSheet.PMD_TICK_MS) / speedMult));
        _scheduledSpeedMult = speedMult;
        _lastFrameTickMs = Date.now();
        frameTimer.interval = delayMs;
        frameTimer.restart();
    }

    onForcedDirRowChanged: {
        if (forcedDirRow >= 0 && (!_clip || _clip.fixedDirRow < 0)) {
            const clamped = ((forcedDirRow % 8) + 8) % 8;
            _dirRow = clamped;
            _targetDirRow = clamped;
        }
    }

    on_AnimActiveChanged: {
        if (_animActive) _scheduleNextFrame();
        else frameTimer.stop();
    }

    onMoveSpeedChanged: {
        if (!_animActive || !_clip || !_clip.dynamicWalkSpeed) return;
        const nextMult = Math.max(0.05, _effectiveSpeedMult(_clip));
        if (Math.abs(nextMult - _scheduledSpeedMult) < 0.18) return;
        const now = Date.now();
        if (_lastFrameTickMs > 0) {
            const elapsed = Math.min(500, Math.max(0, now - _lastFrameTickMs));
            _tickAccum += (elapsed / SpriteSheet.PMD_TICK_MS) * _scheduledSpeedMult;
        }
        _scheduleNextFrame();
    }

    Component.onCompleted: {
        if (_animActive) _scheduleNextFrame();
    }

    function setState(name: string): void {
        _inSetState = true;
        currentState = name;
        _inSetState = false;
        _applyState(name);
    }

    function restartClip(): void {
        if (!_animData) return;
        _clip = null;
        _applyState(currentState);
    }

    onCurrentStateChanged: {
        if (!_inSetState && _animData) _applyState(currentState);
    }

    function setDirectionRow(row: int, immediate = false): void {
        const clamped = ((row % 8) + 8) % 8;
        if (immediate || !root.visible || root.Window.visibility === Window.Hidden) {
            _dirRow = clamped;
            _targetDirRow = clamped;
            return;
        }
        _targetDirRow = clamped;
        if (_dirRow !== clamped) {
            _dirRow = SpriteSheet.stepDirectionRow(_dirRow, clamped);
        }
    }

    function setDirection(angle: real): void {
        if (!useSpriteSheet) return;
        if (_clip && _clip.lockDirection) return;
        setDirectionRow(SpriteSheet.angleToDirectionRow(angle), false);
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
        if (!spriteDir) {
            _animData = null;
            _clip = null;
            _frame = 0;
            _tickAccum = 0;
            shadowSize = 1;
            return;
        }
        const cached = SpriteSheet.cachedForDir(spriteDir);
        if (cached) {
            shadowSize = Math.max(0, Math.min(2, cached.shadowSize ?? 1));
            _animData = cached.anims;
            _applyState(currentState);
        }
    }

    FileView {
        id: animFile
        path: root.spriteDir
            ? (decodeURIComponent(root.spriteDir.replace(/^file:\/\/\/(?=[A-Za-z]:)/, "").replace(/^file:\/\//, "")) + "/AnimData.xml")
            : ""
        printErrors: false
        onLoaded: {
            const parsed = SpriteSheet.parseAnimData(text());
            if (root.spriteDir) SpriteSheet.storeDirCache(root.spriteDir, parsed);
            root.shadowSize = Math.max(0, Math.min(2, parsed.shadowSize ?? 1));
            root._animData = parsed.anims;
            root._applyState(root.currentState);
        }
    }

    Timer {
        id: frameTimer
        interval: 100
        repeat: false
        onTriggered: {
            if (!root._animActive) return;
            const now = Date.now();
            const dtMs = root._lastFrameTickMs > 0
                ? Math.min(2000, Math.max(1, now - root._lastFrameTickMs))
                : interval;
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

            const speedMult = Math.max(0.05, root._effectiveSpeedMult(clip));
            const isLastFrame = root._frame >= endF;
            const needed = (anim.durations[root._frame] || 4) + (isLastFrame ? clip.endHoldTicks : 0);

            root._tickAccum += (dtMs / SpriteSheet.PMD_TICK_MS) * speedMult;
            if (root._tickAccum >= needed) {
                root._tickAccum = Math.min(root._tickAccum - needed, needed * 0.5);
                if (isLastFrame) {
                    root._frame = startF;
                    if (!clip.loop && ++root._repCount >= clip.reps) {
                        const finishedState = root.currentState;
                        root._repCount = 0;
                        root.oneShotFinished(finishedState);
                        if (root.currentState === finishedState && root._clip === clip) {
                            root._applyState("idle");
                            return;
                        }
                    }
                } else {
                    root._frame += 1;
                }
            }
            root._scheduleNextFrame();
        }
    }

    Timer {
        id: dirTurnTimer
        interval: 52
        repeat: true
        running: root.useSpriteSheet
            && root._dirRow !== root._targetDirRow
            && root.visible
            && root.Window.visibility !== Window.Hidden
            && !root.paused
        onTriggered: {
            if (root._clip && root._clip.lockDirection) {
                root._targetDirRow = root._dirRow;
                return;
            }
            root._dirRow = SpriteSheet.stepDirectionRow(root._dirRow, root._targetDirRow);
        }
    }

    Item {
        id: groundShadow
        visible: root.showShadow && root.useSpriteSheet && sheet.status === Image.Ready
        readonly property real px: root.width / 32
        x: Math.round(-0.5 * px)
        y: Math.round(root.height - 11 * px)
        width: 32 * px
        height: 16 * px
        clip: true

        Image {
            x: -(root.shadowSize * 32 * groundShadow.px)
            y: 0
            width: 96 * groundShadow.px
            height: 16 * groundShadow.px
            smooth: false
            source: root.showShadow ? Qt.resolvedUrl("../assets/sanctuary/props/shadow.png") : ""
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
        y: Math.round(root.height - (fh * 0.5 + 8) * px - root.altitude - root.gaitOffsetY)
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
        height: root.height * ((root.currentState === "sit" || root.currentState === "loaf" || root.currentState === "laying" || root.currentState === "deepsleep") ? 0.62 : 0.76)
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
