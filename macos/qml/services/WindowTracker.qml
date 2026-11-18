pragma Singleton
pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import MacPlatform

Singleton {
    id: root

    readonly property bool hasHyprland: false
    readonly property bool hasSway: false
    readonly property bool hasNiri: false
    readonly property bool hasIpcWindows: true

    readonly property var realScreens: MacPlatform.screens
    readonly property var activeWindowPos: MacPlatform.activeWindowPos
    readonly property string activeWindowClass: MacPlatform.activeWindowClass
    readonly property string activeWindowTitle: MacPlatform.activeWindowTitle
    readonly property bool isFullscreen: MacPlatform.isFullscreen
    readonly property int windowCount: MacPlatform.windowCount
    readonly property var visibleWindows: MacPlatform.visibleWindows
    readonly property var monitorInsets: MacPlatform.monitorInsets

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
                top: screens[0].topInset || 25,
                bottom: screens[0].bottomInset || 0,
                left: screens[0].leftInset || 0,
                right: screens[0].rightInset || 0
            };
        }
        return { top: 25, bottom: 0, left: 0, right: 0 };
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
        target: MacPlatform
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
