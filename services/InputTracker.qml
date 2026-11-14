pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import Quickshell.Wayland
import "../config"

Singleton {
    id: root

    readonly property bool hasHyprland: (Quickshell.env("HYPRLAND_INSTANCE_SIGNATURE") || "").length > 0

    signal idleBegan
    signal idleEnded(idleDurationSec: real)
    signal cursorWiggled(gx: real, gy: real)

    property bool _active: true
    property double _idleBeganMs: 0
    readonly property bool userActive: _active
    property bool cursorKnown: hasHyprland
    property real cursorX: 0
    property real cursorY: 0
    property real cursorSpeed: 0
    property real _prevCursorX: 0
    property real _prevCursorY: 0
    property double _prevSampleMs: 0
    property bool fastTracking: false

    property real _lastVecX: 0
    property real _lastVecY: 0
    property int _wiggleFlips: 0
    property double _wiggleStartMs: 0
    property real _wiggleAnchorX: 0
    property real _wiggleAnchorY: 0
    property double _lastWiggleEmitMs: 0

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
        if (dist > 4) root.registerMouseMove();
    }

    function updateFromPointer(gx: real, gy: real): void {
        root._ingestSample(gx, gy);
        root.registerMouseMove();
    }

    Process {
        id: cursorProc
        command: ["hyprctl", "cursorpos"]
        stdout: SplitParser {
            onRead: function(data) {
                const parts = data.split(",");
                if (parts.length !== 2) return;
                const nx = parseInt(parts[0].trim(), 10);
                const ny = parseInt(parts[1].trim(), 10);
                if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
                root._ingestSample(nx, ny);
            }
        }
    }

    Timer {
        interval: !root._active ? 10000 : (root.fastTracking ? 220 : 900)
        running: root.hasHyprland
        repeat: true
        triggeredOnStart: true
        onTriggered: if (!cursorProc.running) cursorProc.running = true
    }

    IdleMonitor {
        id: waylandIdle
        enabled: true
        respectInhibitors: true
        timeout: Math.max(30, Config.idleTimeout)
        onIsIdleChanged: {
            if (isIdle) {
                idleTimer.stop();
                if (root._active) {
                    root._active = false;
                    root._idleBeganMs = Date.now();
                    root.cursorSpeed = 0;
                    root.idleBegan();
                }
            } else {
                root.registerMouseMove();
            }
        }
    }

    Timer {
        id: idleTimer
        interval: Math.max(30, Config.idleTimeout) * 1000
        running: true
        onTriggered: {
            if (root._active) {
                root._active = false;
                root._idleBeganMs = Date.now();
                root.cursorSpeed = 0;
                root.idleBegan();
            }
        }
    }

    function registerMouseMove(): void {
        if (!root._active) {
            const awaySec = root._idleBeganMs > 0 ? Math.max(0, (Date.now() - root._idleBeganMs) / 1000) : 0;
            root._active = true;
            root._idleBeganMs = 0;
            root.idleEnded(awaySec);
        }
        idleTimer.restart();
    }

    Connections {
        target: root.hasHyprland ? Hyprland : null
        function onRawEvent(event: HyprlandEvent): void {
            const n = event.name;
            if (["activewindow", "workspace", "workspacev2", "focusedmon", "openwindow",
                 "closewindow", "movewindow", "fullscreen"].includes(n)) {
                root.registerMouseMove();
            }
        }
    }

    Connections {
        target: !root.hasHyprland ? WindowTracker : null
        function onWindowFocused(windowClass: string, title: string): void { root.registerMouseMove(); }
        function onWindowOpened(windowClass: string, title: string): void { root.registerMouseMove(); }
    }
}
