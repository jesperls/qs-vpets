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

    property var screenWindows: ({})
    property int screenWindowsRevision: 0
    property var sanctuaryGeom: null

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
        model: WinPlatform.screens
        delegate: Window {
            id: screenOverlay
            required property var modelData
            property string registeredName: ""
            property var attachedHosts: []
            property bool _hitSyncQueued: false

            flags: Qt.Window | Qt.Tool | Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.WindowDoesNotAcceptFocus
            color: "transparent"
            x: modelData ? modelData.x : 0
            y: modelData ? modelData.y : 0
            width: modelData ? modelData.width : 1920
            height: modelData ? modelData.height : 1080
            visible: !PetManager.hidden && !PetManager.penVisible && attachedHosts.length > 0

            readonly property alias stageItem: petStage

            function syncHitRegions(): void {
                const rects = [];
                let captureAll = false;
                for (let i = 0; i < attachedHosts.length; i++) {
                    const h = attachedHosts[i];
                    if (!h || !h.viewport) continue;
                    if (h.pointerPressed) captureAll = true;
                    const list = h.viewport.hitRects();
                    for (let j = 0; j < list.length; j++) rects.push(list[j]);
                }
                WinPlatform.setOverlayInteractiveRects(screenOverlay, rects, captureAll);
            }

            function scheduleSyncHitRegions(): void {
                if (_hitSyncQueued || !visible) return;
                _hitSyncQueued = true;
                Qt.callLater(() => {
                    screenOverlay._hitSyncQueued = false;
                    screenOverlay.syncHitRegions();
                });
            }

            function attachHost(host: var): void {
                if (!host || attachedHosts.indexOf(host) !== -1) return;
                attachedHosts = attachedHosts.concat([host]);
                syncHitRegions();
            }

            function detachHost(host: var): void {
                const idx = attachedHosts.indexOf(host);
                if (idx === -1) return;
                attachedHosts = attachedHosts.filter(h => h !== host);
                syncHitRegions();
            }

            onVisibleChanged: {
                if (visible) {
                    WinPlatform.configureOverlayWindow(screenOverlay);
                    syncHitRegions();
                }
            }

            Item {
                id: petStage
                anchors.fill: parent
            }

            Component.onCompleted: {
                WinPlatform.configureOverlayWindow(screenOverlay);
                if (modelData && modelData.name) {
                    registeredName = modelData.name;
                    root.registerScreenWindow(registeredName, screenOverlay);
                }
                syncHitRegions();
            }

            Component.onDestruction: {
                for (let i = 0; i < attachedHosts.length; i++) {
                    const h = attachedHosts[i];
                    if (!h) continue;
                    if (h.viewport && h.viewport.parent === petStage) h.viewport.parent = null;
                    if (h.currentWindow === screenOverlay) h.currentWindow = null;
                }
                attachedHosts = [];
                WinPlatform.unregisterOverlayWindow(screenOverlay);
                if (registeredName) root.unregisterScreenWindow(registeredName, screenOverlay);
            }
        }
    }

    Instantiator {
        model: roamingIdsModel
        delegate: PetWindow {
            overlayHost: root
        }
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
                forcedDirRow: PetManager.dragGhostMirror ? 6 : 2
                spriteDir: PetManager.dragGhostSprite
                    ? Qt.resolvedUrl("assets/sprites/" + PetManager.dragGhostSprite)
                    : ""
            }
        }
    }

    Instantiator {
        active: PetManager.penVisible
        model: 1
        delegate: SanctuaryWindow {
            savedGeom: root.sanctuaryGeom
            onGeometrySaved: geom => { root.sanctuaryGeom = geom; }
        }
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
