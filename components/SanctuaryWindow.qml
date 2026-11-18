pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Wayland
import "../services"

FloatingWindow {
    id: root

    implicitWidth: 1020
    implicitHeight: 660
    minimumSize: Qt.size(860, 560)
    title: "Pokémon Sanctuary"
    color: "transparent"

    property var _preMapAddresses: ({})
    property var _preMapToplevels: []

    function _prepareHyprlandPlacement(): void {
        if (!WindowTracker.hasHyprland) {
            const list = ToplevelManager.toplevels ? ToplevelManager.toplevels.values : [];
            root._preMapToplevels = list.slice();
            const activeTl = ToplevelManager.activeToplevel;
            if (activeTl && activeTl.screens && activeTl.screens.length > 0) {
                root.screen = activeTl.screens[0];
            }
            placementTimer.attempts = 0;
            placementTimer.restart();
            return;
        }
        const existing = {};
        for (const tl of Hyprland.toplevels.values) {
            const addr = String(tl.lastIpcObject?.address ?? tl.address ?? "");
            if (addr) existing[addr] = true;
        }
        root._preMapAddresses = existing;

        const monName = Hyprland.focusedMonitor?.name ?? "";
        if (monName) {
            const screens = WindowTracker.realScreens;
            for (let i = 0; i < screens.length; i++) {
                if (screens[i].name === monName) {
                    root.screen = screens[i];
                    break;
                }
            }
        }
        placementTimer.attempts = 0;
        placementTimer.restart();
    }

    function _placeOnFocusedWorkspace(): bool {
        if (!WindowTracker.hasHyprland) {
            const list = ToplevelManager.toplevels ? ToplevelManager.toplevels.values : [];
            for (const tl of list) {
                if (!tl || root._preMapToplevels.indexOf(tl) !== -1) continue;
                if (String(tl.title ?? "") === root.title) {
                    tl.activate();
                    return true;
                }
            }
            return false;
        }
        Hyprland.refreshToplevels();
        const monRaw = Hyprland.focusedMonitor?.lastIpcObject;
        const specialName = monRaw?.specialWorkspace?.name ?? "";
        const targetSpec = specialName
            ? (specialName.startsWith("special:") ? specialName : ("special:" + specialName))
            : "";
        const targetWsId = Hyprland.focusedMonitor?.activeWorkspace?.id
            ?? Hyprland.focusedWorkspace?.id
            ?? 0;

        for (const tl of Hyprland.toplevels.values) {
            const raw = tl.lastIpcObject;
            const titleStr = String(raw?.title ?? tl.title ?? "");
            const rawAddr = String(raw?.address ?? tl.address ?? "");
            if (titleStr !== root.title || !rawAddr || root._preMapAddresses[rawAddr]) continue;

            const addr = rawAddr.startsWith("0x") ? rawAddr : ("0x" + rawAddr);
            if (targetSpec) {
                if (String(raw?.workspace?.name ?? "") !== targetSpec) {
                    WindowTracker.moveWindowToWorkspaceSilent(targetSpec, addr);
                }
            } else if (targetWsId > 0 && Number(raw?.workspace?.id ?? 0) !== targetWsId) {
                WindowTracker.moveWindowToWorkspaceSilent(String(targetWsId), addr);
            }
            WindowTracker.focusWindowAddress(addr);
            return true;
        }
        return false;
    }

    Timer {
        id: placementTimer
        interval: 80
        repeat: true
        property int attempts: 0
        onTriggered: {
            attempts++;
            if (root._placeOnFocusedWorkspace() || attempts >= 15) stop();
        }
    }

    Component.onCompleted: root._prepareHyprlandPlacement()
    onClosed: PetManager.closePen()

    SanctuaryContent {}
}
