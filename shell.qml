//@ pragma ShellId qs-vpets
//@ pragma Env QS_NO_RELOAD_POPUP=1
//@ pragma Env QSG_RENDER_LOOP=threaded

pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Wayland
import "services"
import "config"
import "components"

ShellRoot {
    id: root

    property var allPetIds: []

    function _reconcileIds(): void {
        const next = Config.pets.map(p => p.id);
        if (JSON.stringify(next) !== JSON.stringify(root.allPetIds)) {
            root.allPetIds = next;
        }
    }

    Variants {
        model: root.allPetIds

        ResidentRecord {
            required property string modelData
            petId: modelData
        }
    }

    Variants {
        model: PetManager.roamingIds

        PetWindow {
            required property string modelData
            petId: modelData
        }
    }

    Loader {
        active: PetManager.dragGhostActive && PetManager.dragGhostScreen !== null && !PetManager.hidden
        sourceComponent: PanelWindow {
            screen: PetManager.dragGhostScreen
            visible: true

            WlrLayershell.layer: WlrLayer.Overlay
            WlrLayershell.namespace: "qs-vpets:drag-ghost"
            WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
            WlrLayershell.exclusionMode: ExclusionMode.Ignore

            anchors {
                top: true
                bottom: true
                left: true
                right: true
            }
            color: "transparent"

            Item { id: emptyGhostMask; width: 0; height: 0 }
            mask: Region { item: emptyGhostMask }

            SpriteAnimation {
                x: PetManager.dragGhostX
                y: PetManager.dragGhostY
                width: PetManager.dragGhostSize
                height: PetManager.dragGhostSize
                speciesName: PetManager.dragGhostSprite
                currentState: "drag"
                altitude: 18
                mirror: PetManager.dragGhostMirror
                spriteDir: PetManager.dragGhostSprite
                    ? Qt.resolvedUrl("assets/sprites/" + PetManager.dragGhostSprite)
                    : ""
            }
        }
    }

    Loader {
        active: PetManager.penVisible
        sourceComponent: SanctuaryWindow {}
    }

    Connections {
        target: Config
        function onConfigReady(): void { root._reconcileIds(); }
    }

    Component.onCompleted: {
        if (Config.ready) root._reconcileIds();
    }
}
