pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Wayland

Singleton {
    id: root

    readonly property bool hasHyprland: (Quickshell.env("HYPRLAND_INSTANCE_SIGNATURE") || "").length > 0
    readonly property var _trackedWaylandActive: root.hasHyprland ? null : ToplevelManager.activeToplevel
    property var _knownWaylandToplevels: []
    property bool _waylandBooted: false

    property var activeWindowPos: null
    property string activeWindowClass: ""
    property string activeWindowTitle: ""
    property bool isFullscreen: false
    property int windowCount: 0
    property var visibleWindows: []
    property var monitorInsets: ({})

    property int _focusChanges: 0
    readonly property bool isUserBusy: _focusChanges > 4

    signal windowOpened(windowClass: string, title: string)
    signal windowFocused(windowClass: string, title: string)
    signal windowUrgent(windowClass: string, gx: real, gy: real)
    signal workspaceChanged

    readonly property var _ignoredEvents: ({
        activelayout: true,
        bell: true,
        ignoregrouplock: true,
        keymap: true,
        lockgroups: true,
        screencast: true,
        submap: true
    })

    function insetsFor(screenName: string): var {
        if (screenName && root.monitorInsets[screenName]) return root.monitorInsets[screenName];
        return { left: 0, top: 0, right: 0, bottom: 0 };
    }

    function _rebuild(): void {
        if (!root.hasHyprland) return;
        const activeWsIds = {};
        const insets = {};
        for (const mon of Hyprland.monitors.values) {
            if (mon.activeWorkspace) activeWsIds[mon.activeWorkspace.id] = true;
            const mRaw = mon.lastIpcObject;
            if (mRaw && mRaw.specialWorkspace && mRaw.specialWorkspace.name) {
                activeWsIds[mRaw.specialWorkspace.id] = true;
            }
            const res = (mRaw && Array.isArray(mRaw.reserved)) ? mRaw.reserved : [0, 0, 0, 0];
            if (mon.name) {
                insets[mon.name] = {
                    left: Number(res[0] ?? 0),
                    top: Number(res[1] ?? 0),
                    right: Number(res[2] ?? 0),
                    bottom: Number(res[3] ?? 0)
                };
            }
        }
        if (Hyprland.focusedWorkspace) activeWsIds[Hyprland.focusedWorkspace.id] = true;

        const wins = [];
        let activePos = null;
        let activeCls = "";
        let activeTitle = "";
        let fs = false;
        let focusedWsCount = 0;
        const focusedWsId = Hyprland.focusedWorkspace ? Hyprland.focusedWorkspace.id : -1;

        for (const tl of Hyprland.toplevels.values) {
            const raw = tl.lastIpcObject;
            if (!raw || raw.hidden || raw.mapped === false) continue;
            const wsId = raw.workspace ? raw.workspace.id : -999;
            if (wsId === focusedWsId) focusedWsCount++;
            if (!activeWsIds[wsId]) continue;

            const at = raw.at ?? [0, 0];
            const size = raw.size ?? [0, 0];
            const isFocused = tl === Hyprland.activeToplevel;
            const fsMode = raw.fullscreen === true ? 2 : Number(raw.fullscreen ?? 0);
            const winMaximizedOrFs = fsMode !== 0;
            const winTrueFs = fsMode >= 2;
            const entry = {
                address: String(raw.address ?? tl.address ?? ""),
                cls: String(raw.class ?? ""),
                title: String(raw.title ?? tl.title ?? ""),
                x: Number(at[0] ?? 0),
                y: Number(at[1] ?? 0),
                w: Number(size[0] ?? 0),
                h: Number(size[1] ?? 0),
                focused: isFocused,
                fullscreen: winMaximizedOrFs,
                trueFullscreen: winTrueFs
            };
            wins.push(entry);

            if (isFocused) {
                activePos = { address: entry.address, x: entry.x, y: entry.y, w: entry.w, h: entry.h };
                activeCls = entry.cls;
                activeTitle = entry.title;
                fs = winTrueFs;
            }
        }

        root.monitorInsets = insets;
        root.visibleWindows = wins;
        root.activeWindowPos = activePos;
        root.activeWindowClass = activeCls;
        root.activeWindowTitle = activeTitle;
        root.isFullscreen = fs;
        root.windowCount = focusedWsCount;
    }

    function _rebuildWayland(): void {
        if (root.hasHyprland) return;
        const list = ToplevelManager.toplevels ? ToplevelManager.toplevels.values : [];
        const prev = root._knownWaylandToplevels || [];
        const nextKnown = [];
        const wins = [];
        let openCount = 0;

        for (let i = 0; i < list.length; i++) {
            const tl = list[i];
            if (!tl) continue;
            nextKnown.push(tl);
            if (root._waylandBooted && prev.indexOf(tl) === -1) {
                root.windowOpened(String(tl.appId ?? ""), String(tl.title ?? ""));
            }
            if (!tl.minimized) openCount++;
            if (tl.fullscreen && !tl.minimized) {
                const tlScreens = (tl.screens && tl.screens.length > 0) ? tl.screens : Quickshell.screens;
                for (let s = 0; s < tlScreens.length; s++) {
                    const scr = tlScreens[s];
                    if (!scr || scr.width <= 0 || scr.height <= 0) continue;
                    wins.push({
                        address: "",
                        cls: String(tl.appId ?? ""),
                        title: String(tl.title ?? ""),
                        x: Number(scr.x ?? 0),
                        y: Number(scr.y ?? 0),
                        w: Number(scr.width ?? 0),
                        h: Number(scr.height ?? 0),
                        focused: tl === ToplevelManager.activeToplevel || !!tl.activated,
                        fullscreen: true,
                        trueFullscreen: true
                    });
                }
            }
        }

        root._knownWaylandToplevels = nextKnown;
        root._waylandBooted = true;

        let activeTl = ToplevelManager.activeToplevel;
        if (!activeTl) {
            for (let i = 0; i < list.length; i++) {
                if (list[i] && list[i].activated) {
                    activeTl = list[i];
                    break;
                }
            }
        }

        root.visibleWindows = wins;
        root.activeWindowPos = null;
        root.activeWindowClass = activeTl ? String(activeTl.appId ?? "") : "";
        root.activeWindowTitle = activeTl ? String(activeTl.title ?? "") : "";
        root.isFullscreen = !!(activeTl && activeTl.fullscreen && !activeTl.minimized);
        root.windowCount = openCount;
    }

    function _scheduleRefresh(): void {
        if (!root.hasHyprland) {
            waylandSnapshotTimer.restart();
            return;
        }
        if (!refreshTimer.running) refreshTimer.start();
    }

    Timer {
        id: waylandSnapshotTimer
        interval: 45
        onTriggered: root._rebuildWayland()
    }

    Timer {
        id: refreshTimer
        interval: 45
        onTriggered: {
            Hyprland.refreshToplevels();
            Hyprland.refreshWorkspaces();
            Hyprland.refreshMonitors();
            snapshotTimer.restart();
        }
    }

    Timer {
        id: snapshotTimer
        interval: 55
        onTriggered: root._rebuild()
    }

    Connections {
        target: root.hasHyprland ? Hyprland : null
        function onRawEvent(event: HyprlandEvent): void {
            const name = event.name;
            const data = event.data ?? "";
            if (name === "openwindow") {
                const p = data.split(",");
                if (p.length >= 4) root.windowOpened(p[2], p.slice(3).join(","));
            } else if (name === "activewindow") {
                const p = data.split(",");
                if (p.length >= 2) root.windowFocused(p[0], p.slice(1).join(","));
                root._focusChanges++;
            } else if (name === "workspace" || name === "workspacev2") {
                root.workspaceChanged();
            } else if (name === "urgent") {
                const needle = data.trim().replace(/^0x/i, "").toLowerCase();
                if (needle.length > 0) {
                    for (let i = 0; i < root.visibleWindows.length; i++) {
                        const w = root.visibleWindows[i];
                        const wAddr = String(w.address || "").replace(/^0x/i, "").toLowerCase();
                        if (wAddr === needle) {
                            root.windowUrgent(w.cls, w.x + w.w * 0.5, w.y + w.h * 0.5);
                            break;
                        }
                    }
                }
            }
            if (!root._ignoredEvents[name]) root._scheduleRefresh();
        }
        function onFocusedMonitorChanged(): void { snapshotTimer.restart(); }
        function onFocusedWorkspaceChanged(): void { snapshotTimer.restart(); }
        function onActiveToplevelChanged(): void { root._scheduleRefresh(); }
    }

    Connections {
        target: root.hasHyprland ? Hyprland.toplevels : null
        function onValuesChanged(): void { root._scheduleRefresh(); }
    }

    Connections {
        target: root.hasHyprland ? Hyprland.monitors : null
        function onValuesChanged(): void { root._scheduleRefresh(); }
    }

    Connections {
        target: !root.hasHyprland ? ToplevelManager : null
        function onActiveToplevelChanged(): void {
            const tl = ToplevelManager.activeToplevel;
            if (tl) {
                root.windowFocused(String(tl.appId ?? ""), String(tl.title ?? ""));
                root._focusChanges++;
            }
            root._scheduleRefresh();
        }
    }

    Connections {
        target: !root.hasHyprland ? ToplevelManager.toplevels : null
        function onValuesChanged(): void { root._scheduleRefresh(); }
    }

    Connections {
        target: root._trackedWaylandActive
        function onFullscreenChanged(): void { root._scheduleRefresh(); }
        function onMinimizedChanged(): void { root._scheduleRefresh(); }
        function onTitleChanged(): void { root._scheduleRefresh(); }
        function onAppIdChanged(): void { root._scheduleRefresh(); }
    }

    Timer {
        interval: 10000
        running: true
        repeat: true
        onTriggered: root._focusChanges = Math.max(0, root._focusChanges - 2)
    }

    Component.onCompleted: root._scheduleRefresh()
}
