pragma Singleton
pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import WinPlatform

Singleton {
    id: root

    readonly property bool hasHyprland: false
    readonly property bool hasSway: false
    readonly property bool hasNiri: false
    readonly property bool hasIpcWindows: true

    readonly property var realScreens: WinPlatform.screens
    readonly property var activeWindowPos: WinPlatform.activeWindowPos
    readonly property string activeWindowClass: WinPlatform.activeWindowClass
    readonly property string activeWindowTitle: WinPlatform.activeWindowTitle
    readonly property bool isFullscreen: WinPlatform.isFullscreen
    readonly property int windowCount: WinPlatform.windowCount
    readonly property var visibleWindows: WinPlatform.visibleWindows
    readonly property var monitorInsets: WinPlatform.monitorInsets

    property int _focusChanges: 0
    readonly property bool isUserBusy: _focusChanges > 4

    signal windowOpened(windowClass: string, title: string)
    signal windowFocused(windowClass: string, title: string)
    signal windowClosed(windowClass: string, gx: real, gy: real, w: real, h: real, address: string)
    signal windowShifted(windowClass: string, x: real, y: real, w: real, h: real, address: string)
    signal windowUrgent(windowClass: string, gx: real, gy: real)
    signal workspaceChanged
    signal workspaceCleared
    signal monitorConnected(screenName: string)

    function insetsFor(screenName: string): var {
        if (screenName && root.monitorInsets[screenName]) {
            return root.monitorInsets[screenName];
        }
        const screens = root.realScreens;
        if (screens.length > 0 && screens[0]) {
            return {
                top: screens[0].topInset || 0,
                bottom: screens[0].bottomInset || 0,
                left: screens[0].leftInset || 0,
                right: screens[0].rightInset || 0
            };
        }
        return { top: 0, bottom: 48, left: 0, right: 0 };
    }

    function focusWindowAddress(address: string): void {
        void address;
    }

    function moveWindowToWorkspaceSilent(workspaceSpec: string, address: string): void {
        void workspaceSpec;
        void address;
    }

    Timer {
        interval: 30000
        running: root._focusChanges > 0
        repeat: true
        onTriggered: root._focusChanges = Math.max(0, root._focusChanges - 2)
    }

    Connections {
        target: WinPlatform
        function onWindowOpened(cls: string, title: string): void {
            root.windowOpened(cls, title);
        }
        function onWindowFocused(cls: string, title: string): void {
            root._focusChanges = Math.min(20, root._focusChanges + 1);
            root.windowFocused(cls, title);
        }
        function onWindowClosed(cls: string, gx: real, gy: real, w: real, h: real, addr: string): void {
            root.windowClosed(cls, gx, gy, w, h, addr);
        }
        function onWindowShifted(cls: string, x: real, y: real, w: real, h: real, addr: string): void {
            root.windowShifted(cls, x, y, w, h, addr);
        }
        function onWorkspaceChanged(): void {
            root.workspaceChanged();
        }
        function onWorkspaceCleared(): void {
            root.workspaceCleared();
        }
        function onMonitorConnected(screenName: string): void {
            root.monitorConnected(screenName);
        }
    }
}
