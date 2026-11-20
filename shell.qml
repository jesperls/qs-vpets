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

    property var screenWindows: ({})
    property int screenWindowsRevision: 0

    function registerScreenWindow(name: string, win: var): void {
        const next = Object.assign({}, screenWindows);
        next[name] = win;
        screenWindows = next;
        screenWindowsRevision++;
    }

    function unregisterScreenWindow(name: string, win: var): void {
        if (screenWindows[name] !== win) return;
        const next = Object.assign({}, screenWindows);
        delete next[name];
        screenWindows = next;
        screenWindowsRevision++;
    }

    function screenWindowFor(scr: var): var {
        if (!scr || !scr.name) return null;
        return screenWindows[scr.name] ?? null;
    }

    Variants {
        model: Quickshell.screens

        PanelWindow {
            id: screenOverlay
            required property ShellScreen modelData
            property string registeredName: ""
            property var attachedHosts: []
            property int maskRevision: 0

            screen: modelData
            visible: !PetManager.hidden && !PetManager.penVisible && attachedHosts.length > 0

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

            function attachHost(host: var): void {
                if (!host || attachedHosts.indexOf(host) !== -1) return;
                attachedHosts = attachedHosts.concat([host]);
                maskRevision++;
            }

            function detachHost(host: var): void {
                const idx = attachedHosts.indexOf(host);
                if (idx === -1) return;
                attachedHosts = attachedHosts.filter(h => h !== host);
                maskRevision++;
            }

            readonly property alias stageItem: petStage
            readonly property bool anyPointerPressed: {
                void maskRevision;
                for (let i = 0; i < attachedHosts.length; i++) {
                    if (attachedHosts[i] && attachedHosts[i].pointerPressed) return true;
                }
                return false;
            }
            readonly property var activeMaskRegions: {
                void maskRevision;
                const list = [];
                for (let i = 0; i < attachedHosts.length; i++) {
                    const h = attachedHosts[i];
                    if (!h) continue;
                    list.push(h.hitRegion);
                    list.push(h.inspectorRegion);
                }
                return list;
            }

            Item {
                id: fullScreenMask
                anchors.fill: parent
            }

            Item {
                id: petStage
                anchors.fill: parent
            }

            mask: Region {
                item: screenOverlay.anyPointerPressed ? fullScreenMask : null
                regions: screenOverlay.activeMaskRegions
            }

            Component.onCompleted: {
                if (modelData && modelData.name) {
                    registeredName = modelData.name;
                    root.registerScreenWindow(registeredName, screenOverlay);
                }
            }

            Component.onDestruction: {
                for (let i = 0; i < attachedHosts.length; i++) {
                    const h = attachedHosts[i];
                    if (h && h.viewport && h.viewport.parent === petStage) {
                        h.viewport.parent = null;
                    }
                }
                attachedHosts = [];
                if (registeredName) root.unregisterScreenWindow(registeredName, screenOverlay);
            }
        }
    }

    Variants {
        model: PetManager.roamingIds

        Scope {
            id: petHost
            required property string modelData
            property var currentWindow: null
            readonly property alias viewport: petViewport
            readonly property bool pointerPressed: petViewport.pointerPressed
            readonly property alias hitRegion: petHitRegion
            readonly property alias inspectorRegion: petInspectorRegion

            function syncWindow(): void {
                const targetWin = root.screenWindowFor(petViewport.activeScreen);
                if (targetWin === currentWindow) return;
                if (currentWindow) currentWindow.detachHost(petHost);
                currentWindow = targetWin;
                if (targetWin) {
                    petViewport.parent = targetWin.stageItem;
                    targetWin.attachHost(petHost);
                } else {
                    petViewport.parent = null;
                }
            }

            PetOverlayContent {
                id: petViewport
                petId: petHost.modelData
                sharedOverlay: true
                windowActive: !PetManager.hidden && !PetManager.penVisible && petHost.currentWindow !== null
                onScreenSelected: () => petHost.syncWindow()
                onPointerPressedChanged: {
                    if (petHost.currentWindow) petHost.currentWindow.maskRevision++;
                }
            }

            Region {
                id: petHitRegion
                item: petViewport.petHitboxItem
            }

            Region {
                id: petInspectorRegion
                item: petViewport.inspectorRegionActive ? petViewport.inspectorItem : null
            }

            Connections {
                target: root
                function onScreenWindowsRevisionChanged(): void { petHost.syncWindow(); }
            }

            Connections {
                target: Quickshell
                function onScreensChanged(): void {
                    petViewport.ensureValidScreen();
                    petHost.syncWindow();
                }
            }

            Component.onCompleted: syncWindow()
            Component.onDestruction: {
                if (currentWindow) {
                    currentWindow.detachHost(petHost);
                    currentWindow = null;
                }
                petViewport.parent = null;
            }
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

    VpetsIpc {}

    Connections {
        target: Config
        function onConfigReady(): void { root._reconcileIds(); }
    }

    Component.onCompleted: {
        if (Config.ready) root._reconcileIds();
    }
}
