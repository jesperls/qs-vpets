pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Window
import QtQml.Models
import Quickshell
import WinPlatform
import "services"
import "config"
import "components"

Scope {
    id: root

    ListModel { id: residentIdsModel }
    ListModel { id: roamingIdsModel }

    function _syncIdModel(model: ListModel, nextIds: var): void {
        const want = Array.isArray(nextIds) ? nextIds : [];
        const wantSet = {};
        for (let i = 0; i < want.length; i++) wantSet[want[i]] = true;

        for (let i = model.count - 1; i >= 0; i--) {
            const curId = model.get(i).petId;
            if (!wantSet[curId]) model.remove(i, 1);
        }

        const haveSet = {};
        for (let i = 0; i < model.count; i++) {
            haveSet[model.get(i).petId] = true;
        }
        for (let i = 0; i < want.length; i++) {
            const id = want[i];
            if (!haveSet[id]) model.append({ petId: id });
        }
    }

    function _reconcileResidents(): void {
        _syncIdModel(residentIdsModel, Config.pets.map(p => p.id));
    }

    function _reconcileRoaming(): void {
        _syncIdModel(roamingIdsModel, PetManager.roamingIds);
    }

    Instantiator {
        model: residentIdsModel
        delegate: ResidentRecord {}
    }

    Instantiator {
        model: roamingIdsModel
        delegate: PetWindow {}
    }

    Instantiator {
        active: PetManager.dragGhostActive && PetManager.dragGhostScreen !== null && !PetManager.hidden
        model: 1
        delegate: Window {
            id: ghostWin
            flags: Qt.Window | Qt.Tool | Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.WindowDoesNotAcceptFocus
            color: "transparent"
            x: PetManager.dragGhostScreen ? PetManager.dragGhostScreen.x : 0
            y: PetManager.dragGhostScreen ? PetManager.dragGhostScreen.y : 0
            width: PetManager.dragGhostScreen ? PetManager.dragGhostScreen.width : 1920
            height: PetManager.dragGhostScreen ? PetManager.dragGhostScreen.height : 1080
            visible: true

            Component.onCompleted: WinPlatform.configureOverlayWindow(ghostWin)
            Component.onDestruction: WinPlatform.unregisterOverlayWindow(ghostWin)

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

    Instantiator {
        active: PetManager.penVisible
        model: 1
        delegate: SanctuaryWindow {}
    }

    VpetsIpc {
        id: ipcHandler
    }

    Connections {
        target: Config
        function onConfigReady(): void { root._reconcileResidents(); }
        function onPetsChanged(): void { root._reconcileResidents(); }
    }

    Connections {
        target: PetManager
        function onRoamingIdsChanged(): void { root._reconcileRoaming(); }
        function onHiddenChanged(): void { WinPlatform.setPetsHiddenState(PetManager.hidden); }
    }

    Connections {
        target: WinPlatform
        function onOpenSanctuaryRequested(): void {
            PetManager.hidden = false;
            PetManager.openPen();
        }
        function onToggleHiddenRequested(): void {
            PetManager.hidden = !PetManager.hidden;
            if (PetManager.hidden) PetManager.closeInspector();
        }
        function onSummonRequested(): void {
            ipcHandler.summon("");
        }
        function onQuitRequested(): void {
            PetManager.flushAll();
            Qt.quit();
        }
    }

    Component.onCompleted: {
        if (Config.ready) _reconcileResidents();
        _reconcileRoaming();
        WinPlatform.setPetsHiddenState(PetManager.hidden);
    }
}
