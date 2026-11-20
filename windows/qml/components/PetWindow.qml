pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import WinPlatform
import "../services"

Scope {
    id: root

    required property string petId
    property var overlayHost: null
    property var currentWindow: null

    readonly property alias viewport: petViewport
    readonly property bool pointerPressed: petViewport.pointerPressed

    function syncWindow(): void {
        const targetWin = overlayHost ? overlayHost.screenWindowFor(petViewport.activeScreen) : null;
        if (targetWin === currentWindow) return;
        if (currentWindow) currentWindow.detachHost(root);
        currentWindow = targetWin;
        if (targetWin) {
            petViewport.parent = targetWin.stageItem;
            targetWin.attachHost(root);
        } else {
            petViewport.parent = null;
        }
    }

    PetOverlayContent {
        id: petViewport
        petId: root.petId
        sharedOverlay: true
        windowActive: !PetManager.hidden && !PetManager.penVisible && root.currentWindow !== null
        onScreenSelected: () => root.syncWindow()
        onHitRegionsUpdated: {
            if (root.currentWindow) root.currentWindow.scheduleSyncHitRegions();
        }
        onPointerPressedChanged: {
            if (root.currentWindow) root.currentWindow.syncHitRegions();
        }
    }

    Connections {
        target: root.overlayHost
        function onScreenWindowsRevisionChanged(): void { root.syncWindow(); }
    }

    Connections {
        target: WinPlatform
        function onScreensChanged(): void {
            petViewport.ensureValidScreen();
            root.syncWindow();
        }
    }

    Component.onCompleted: syncWindow()
    Component.onDestruction: {
        if (currentWindow) {
            currentWindow.detachHost(root);
            currentWindow = null;
        }
        petViewport.parent = null;
    }
}
