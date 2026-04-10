pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import "../config"

Singleton {
    id: root

    signal idleBegan

    property bool _active: true
    property real cursorX: 0
    property real cursorY: 0

    Process {
        id: cursorProc
        command: ["hyprctl", "cursorpos"]
        stdout: SplitParser {
            onRead: function(data) {
                var parts = data.split(",");
                if (parts.length === 2) {
                    root.cursorX = parseInt(parts[0].trim()) || 0;
                    root.cursorY = parseInt(parts[1].trim()) || 0;
                }
            }
        }
    }
    Timer { interval: 2000; running: true; repeat: true; onTriggered: cursorProc.running = true }

    Timer {
        id: idleTimer
        interval: Config.idleTimeout * 1000
        running: true
        onTriggered: { root._active = false; root.idleBegan(); }
    }

    function registerMouseMove(): void {
        if (!root._active) root._active = true;
        idleTimer.restart();
    }

    Connections {
        target: Hyprland
        function onRawEvent(event: HyprlandEvent): void {
            const n = event.name;
            if (["activewindow", "workspace", "focusedmon", "openwindow",
                 "closewindow", "movewindow", "fullscreen"].includes(n)) {
                if (!root._active) root._active = true;
                idleTimer.restart();
            }
        }
    }
}
