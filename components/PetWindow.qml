pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Wayland
import "../services"

PanelWindow {
    id: root

    required property string petId

    visible: !PetManager.hidden && !PetManager.penVisible

    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.namespace: "qs-vpets"
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
    WlrLayershell.exclusionMode: ExclusionMode.Ignore

    anchors {
        top: true
        bottom: true
        left: true
        right: true
    }
    color: "transparent"

    onScreenChanged: {
        if (viewport.activeScreen !== root.screen) {
            viewport.activeScreen = root.screen;
        }
    }

    Item {
        id: fullScreenMask
        anchors.fill: parent
    }

    mask: Region {
        item: viewport.pointerPressed ? fullScreenMask : null
        regions: [
            Region {
                item: viewport.petHitboxItem
            },
            Region {
                item: viewport.inspectorRegionActive ? viewport.inspectorItem : null
            }
        ]
    }

    PetOverlayContent {
        id: viewport
        petId: root.petId
        windowActive: root.visible
        onScreenSelected: nextScreen => {
            if (root.screen !== nextScreen) root.screen = nextScreen;
        }
    }

    Connections {
        target: Quickshell
        function onScreensChanged(): void { viewport.ensureValidScreen(); }
    }
}
