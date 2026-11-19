pragma Singleton
pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import WinPlatform
import "../config"

Singleton {
    id: root

    signal idleBegan
    signal idleEnded(idleDurationSec: real)
    signal cursorWiggled(gx: real, gy: real)
    signal cursorParkedNear(gx: real, gy: real)
    signal cursorUnparked(gx: real, gy: real, speed: real)

    property bool _active: true
    property double _idleBeganMs: 0
    readonly property bool userActive: _active

    property bool cursorKnown: WinPlatform.cursorKnown
    property real cursorX: WinPlatform.cursorX
    property real cursorY: WinPlatform.cursorY
    property real cursorSpeed: 0
    property bool cursorParked: false
    property bool fastTracking: false
    property bool trackingEnabled: false

    property real _prevCursorX: 0
    property real _prevCursorY: 0
    property double _prevSampleMs: 0
    property real _lastVecX: 0
    property real _lastVecY: 0
    property int _wiggleFlips: 0
    property double _wiggleStartMs: 0
    property real _wiggleAnchorX: 0
    property real _wiggleAnchorY: 0
    property double _lastWiggleEmitMs: 0

    property real _parkAnchorX: 0
    property real _parkAnchorY: 0
    property double _parkAnchorMs: 0
    property double _lastParkedEmitMs: 0

    function _checkParked(now: double): void {
        if (!root._active || !root.cursorKnown || root.cursorParked || root._parkAnchorMs <= 0) return;
        if ((now - root._parkAnchorMs) >= 42000 && (now - root._lastParkedEmitMs) >= 90000) {
            root.cursorParked = true;
            root._lastParkedEmitMs = now;
            root.cursorParkedNear(root.cursorX, root.cursorY);
        }
    }

    function _ingestSample(nx: real, ny: real): void {
        const now = Date.now();
        const dt = root._prevSampleMs > 0 ? Math.max(0.012, (now - root._prevSampleMs) / 1000) : 1;
        const dx = nx - root._prevCursorX;
        const dy = ny - root._prevCursorY;
        const dist = Math.hypot(dx, dy);
        if (dt >= 0.012) {
            root.cursorSpeed = root._prevSampleMs > 0 ? (dist / dt) : 0;
            if (root._prevSampleMs > 0 && dt < 0.75 && dist >= 28 && dist <= 340) {
                const dot = dx * root._lastVecX + dy * root._lastVecY;
                if (dot < -400) {
                    if (now - root._wiggleStartMs > 2200
                            || Math.hypot(nx - root._wiggleAnchorX, ny - root._wiggleAnchorY) > 320) {
                        root._wiggleFlips = 1;
                        root._wiggleStartMs = now;
                        root._wiggleAnchorX = nx;
                        root._wiggleAnchorY = ny;
                    } else {
                        root._wiggleFlips += 1;
                        if (root._wiggleFlips >= 3 && now - root._lastWiggleEmitMs > 18000) {
                            root._lastWiggleEmitMs = now;
                            root._wiggleFlips = 0;
                            root.cursorWiggled(nx, ny);
                        }
                    }
                }
                root._lastVecX = dx;
                root._lastVecY = dy;
            }
            root._prevCursorX = nx;
            root._prevCursorY = ny;
            root._prevSampleMs = now;
        }
        root.cursorX = nx;
        root.cursorY = ny;
        root.cursorKnown = true;

        if (root._parkAnchorMs <= 0) {
            root._parkAnchorX = nx;
            root._parkAnchorY = ny;
            root._parkAnchorMs = now;
        } else if (Math.hypot(nx - root._parkAnchorX, ny - root._parkAnchorY) > 36) {
            if (root.cursorParked) {
                root.cursorParked = false;
                root.cursorUnparked(nx, ny, root.cursorSpeed);
            }
            root._parkAnchorX = nx;
            root._parkAnchorY = ny;
            root._parkAnchorMs = now;
        } else {
            root._checkParked(now);
        }
    }

    function updateFromPointer(gx: real, gy: real): void {
        root._ingestSample(gx, gy);
        root.registerMouseMove();
    }

    function registerMouseMove(): void {
        if (!root._active) {
            const dur = root._idleBeganMs > 0 ? (Date.now() - root._idleBeganMs) / 1000 : 0;
            root._active = true;
            root._idleBeganMs = 0;
            root.idleEnded(dur);
        }
    }

    Timer {
        interval: 4000
        running: root._active && root.cursorKnown && !root.cursorParked
        repeat: true
        onTriggered: root._checkParked(Date.now())
    }

    Connections {
        target: WinPlatform
        function onCursorMoved(gx: real, gy: real): void {
            root._ingestSample(gx, gy);
            if (!root._active && WinPlatform.idleSeconds < 2.0) {
                root.registerMouseMove();
            }
        }
        function onIdleUpdated(): void {
            const timeoutSec = Math.max(30, Config.idleTimeout);
            if (root._active && WinPlatform.idleSeconds >= timeoutSec) {
                root._active = false;
                root._idleBeganMs = Date.now() - WinPlatform.idleSeconds * 1000;
                root.idleBegan();
            } else if (!root._active && WinPlatform.idleSeconds < 2.0) {
                root.registerMouseMove();
            }
        }
    }
}
