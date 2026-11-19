pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Window
import Quickshell
import WinPlatform
import "../services"

Scope {
    id: root

    required property string petId
    property var screen: null

    onScreenChanged: {
        if (viewport.activeScreen !== root.screen) {
            viewport.activeScreen = root.screen;
        }
        _syncHitRegions();
    }

    function _syncHitRegions(): void {
        WinPlatform.setOverlayInteractiveRects(overlayWin, viewport.hitRects(), viewport.pointerPressed);
    }

    Window {
        id: overlayWin
        flags: Qt.Window | Qt.Tool | Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.WindowDoesNotAcceptFocus
        color: "transparent"
        x: root.screen ? root.screen.x : 0
        y: root.screen ? root.screen.y : 0
        width: root.screen ? root.screen.width : 1920
        height: root.screen ? root.screen.height : 1080
        visible: !PetManager.hidden && !PetManager.penVisible && root.screen !== null

        onVisibleChanged: {
            if (visible) {
                WinPlatform.configureOverlayWindow(overlayWin);
                root._syncHitRegions();
            }
        }

        PetOverlayContent {
            id: viewport
            petId: root.petId
            windowActive: overlayWin.visible
            onScreenSelected: nextScreen => {
                if (root.screen !== nextScreen) root.screen = nextScreen;
            }
            onHitRegionsUpdated: root._syncHitRegions()
        }
    }

    Connections {
        target: WinPlatform
        function onScreensChanged(): void { viewport.ensureValidScreen(); }
    }

    Component.onCompleted: {
        WinPlatform.configureOverlayWindow(overlayWin);
        root._syncHitRegions();
    }

    Component.onDestruction: {
        WinPlatform.unregisterOverlayWindow(overlayWin);
    }
}
