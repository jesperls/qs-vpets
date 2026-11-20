pragma ComponentBehavior: Bound

import QtQuick
import "../config"
import "../services"
import "PetNav.js" as Nav
import "SpeciesProfile.js" as SpeciesProfile
import "behavior/Topology.js" as Topology

Item {
    id: root
    anchors.fill: parent
    z: dragArea.pressed || dragArea.dragging || inspectorLoader.active ? 20 : 1

    required property string petId
    property var activeScreen: null
    property bool windowActive: true
    property bool sharedOverlay: false

    signal screenSelected(nextScreen: var)
    signal hitRegionsUpdated

    readonly property alias petHitboxItem: petHitbox
    readonly property alias inspectorItem: inspectorLoader
    readonly property bool pointerPressed: dragArea.captureActive
    readonly property bool pointerDragging: dragArea.dragging
    readonly property bool inspectorRegionActive: inspectorLoader.active && !dragArea.dragging

    readonly property var petData: {
        void Config.pets;
        return Config.petById(root.petId) ?? {
            id: root.petId,
            name: root.petId,
            sprite: SpeciesProfile.DEFAULT_SPECIES,
            personality: "emergent",
            scale: 2,
            monitor: "",
            roamMode: "auto",
            color: "#cba6f7",
            traits: null,
            actions: {}
        };
    }

    function _setScreen(scr: var): void {
        if (!scr || scr === root.activeScreen) return;
        root.activeScreen = scr;
        root.screenSelected(scr);
    }

    readonly property string preferredMonitor: petData.monitor ?? ""
    onPreferredMonitorChanged: {
        if (!preferredMonitor) return;
        const match = WindowTracker.realScreens.find(s => s.name === preferredMonitor);
        if (match && match !== root.activeScreen) {
            root._setScreen(match);
            _clampToViewport();
        }
    }

    readonly property bool inspectorOpen: PetManager.inspectedPet === petItem

    readonly property int _maxSafeScale: (root.width > 100 && root.height > 100)
        ? Math.max(1, Math.floor(Math.min(root.width, root.height) / 96))
        : 4
    readonly property int petScale: Math.max(1, Math.min(petData.scale ?? 2, _maxSafeScale))
    readonly property int petSize: 32 * petScale

    readonly property var barInsets: WindowTracker.insetsFor(root.activeScreen ? root.activeScreen.name : "")
    readonly property int topInset: barInsets.top
    readonly property int bottomInset: barInsets.bottom

    function hitRects(): var {
        const rects = [
            {
                x: petHitbox.x,
                y: petHitbox.y,
                w: petHitbox.width,
                h: petHitbox.height
            }
        ];
        if (inspectorLoader.active && !dragArea.dragging && inspectorLoader.width > 0 && inspectorLoader.height > 0) {
            rects.push({
                x: inspectorLoader.x,
                y: inspectorLoader.y,
                w: inspectorLoader.width,
                h: inspectorLoader.height
            });
        }
        return rects;
    }

    Item {
        id: petHitbox
        x: petItem.worldX - 4
        y: petItem.worldY - petItem.altitude - 6
        width: root.petSize + 8
        height: root.petSize + 10
        onXChanged: root.hitRegionsUpdated()
        onYChanged: root.hitRegionsUpdated()
        onWidthChanged: root.hitRegionsUpdated()
        onHeightChanged: root.hitRegionsUpdated()
    }

    Item {
        id: droppedBerry
        visible: petItem.berryPresent && !dragArea.offScreenDragging
        x: Math.round(petItem.berryGX - petItem.screenX() - width * 0.5)
        y: Math.round(petItem.berryGY - petItem.screenY() - height * 0.85)
        width: 11 * root.petScale
        height: 11 * root.petScale
        property real dropOffset: 0

        onVisibleChanged: {
            if (visible) berryDropAnim.restart();
        }

        NumberAnimation {
            id: berryDropAnim
            target: droppedBerry
            property: "dropOffset"
            from: -22
            to: 0
            duration: 340
            easing.type: Easing.OutBounce
        }

        Rectangle {
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.bottom: parent.bottom
            width: parent.width * 0.72
            height: Math.max(3, parent.height * 0.24)
            radius: height * 0.5
            color: Qt.rgba(0, 0, 0, 0.28)
        }

        Image {
            anchors.horizontalCenter: parent.horizontalCenter
            y: droppedBerry.dropOffset
            width: parent.width
            height: parent.height
            smooth: false
            source: Qt.resolvedUrl("../assets/sanctuary/items/oran_berry.png")
        }
    }

    Pet {
        id: petItem
        x: petItem.worldX
        y: petItem.worldY
        width: root.petSize
        height: root.petSize
        opacity: dragArea.offScreenDragging ? 0.0 : 1.0
        petData: root.petData
        petScreen: root.activeScreen
        petWindow: root
    }

    readonly property bool _needsMotionTick: petItem.currentSpeed > 0
        || petItem.state_ === "airborne"
        || petItem.state_ === "perch"

    Timer {
        interval: {
            const s = petItem.state_;
            if (s === "walk" || s === "wander" || s === "zoomies" || s === "airborne") return 16;
            if (s === "perch") return (petItem._perchRiding || petItem._perchStrolling) ? 32 : 90;
            return 250;
        }
        running: root.windowActive && petItem.state_ !== "drag" && root._needsMotionTick
        repeat: true
        onTriggered: {
            petItem.updateMovement(interval / 1000);
            if (petItem.currentSpeed > 0 || petItem.state_ === "airborne") root._resolveBounds();
        }
    }

    function _clampToViewport(): void {
        if (root.width <= 100 || root.height <= 100 || dragArea.dragging) return;
        const maxX = Math.max(0, root.width - root.petSize);
        const maxY = Math.max(0, root.height - root.petSize);
        if (petItem.worldX > maxX) petItem.worldX = maxX;
        else if (petItem.worldX < 0) petItem.worldX = 0;
        if (petItem.worldY > maxY) petItem.worldY = maxY;
        else if (petItem.worldY < 0) petItem.worldY = 0;
    }

    onWidthChanged: _clampToViewport()
    onHeightChanged: _clampToViewport()
    onPetSizeChanged: {
        _clampToViewport();
        root.hitRegionsUpdated();
    }

    function _resolveBounds(): void {
        const s = root.petSize;
        const maxX = Math.max(0, root.width - s);
        const maxY = Math.max(0, root.height - s);
        const probeY = Math.max(0, Math.min(maxY, petItem.worldY));
        const probeX = Math.max(0, Math.min(maxX, petItem.worldX));
        let hitX = false, hitY = false;

        if (petItem.worldX < 0) {
            const adj = _adjacentScreen("left", probeY);
            if (adj) { _hop(adj, adj.width - s, _mapY(probeY, adj)); return; }
            petItem.worldX = 0; hitX = true;
        } else if (petItem.worldX > maxX) {
            const adj = _adjacentScreen("right", probeY);
            if (adj) { _hop(adj, 0, _mapY(probeY, adj)); return; }
            petItem.worldX = maxX; hitX = true;
        }
        if (petItem.worldY < 0) {
            const adj = _adjacentScreen("up", probeX);
            if (adj) { _hop(adj, _mapX(probeX, adj), adj.height - s); return; }
            petItem.worldY = 0; hitY = true;
        } else if (petItem.worldY > maxY) {
            const adj = _adjacentScreen("down", probeX);
            if (adj) { _hop(adj, _mapX(probeX, adj), 0); return; }
            petItem.worldY = maxY; hitY = true;
        }

        if (hitX || hitY) petItem.reflectOffWall(hitX, hitY);
    }

    function _adjacentScreen(dir: string, pos: real): var {
        if (root.preferredMonitor && root.activeScreen && root.activeScreen.name === root.preferredMonitor) {
            return null;
        }
        return Topology.adjacentScreenAt(WindowTracker.realScreens, root.activeScreen, dir, pos, root.petSize);
    }

    function _mapY(ly: real, adj: var): real {
        return Math.max(0, Math.min(adj.height - petSize, root.activeScreen.y + ly - adj.y));
    }

    function _mapX(lx: real, adj: var): real {
        return Math.max(0, Math.min(adj.width - petSize, root.activeScreen.x + lx - adj.x));
    }

    function _hop(scr: var, nx: real, ny: real): void {
        root._setScreen(scr);
        petItem.worldX = nx;
        petItem.worldY = ny;
    }

    onActiveScreenChanged: {
        dragArea.hovering = false;
        dragArea.hoverTime = 0;
        dragArea.strokeDist = 0;
        root.hitRegionsUpdated();
    }

    function _screenAt(gx: real, gy: real): var {
        return Topology.screenAt(WindowTracker.realScreens, gx, gy);
    }

    function moveToGlobal(gx: real, gy: real): void {
        const screens = WindowTracker.realScreens;
        let target = null;
        if (root.preferredMonitor) {
            target = screens.find(s => s.name === root.preferredMonitor) ?? null;
        }
        const exact = target
            ? (gx >= target.x && gx < target.x + target.width && gy >= target.y && gy < target.y + target.height ? target : null)
            : Topology.screenAt(screens, gx, gy);
        if (!target) target = exact ?? Topology.nearestScreen(screens, gx, gy);
        if (target && target !== root.activeScreen) root._setScreen(target);
        const scr = root.activeScreen;
        if (!scr) return;
        const maxX = Math.max(0, scr.width - petSize);
        const maxY = Math.max(0, scr.height - petSize);
        if (exact) {
            petItem.worldX = Math.max(0, Math.min(maxX, gx - scr.x));
            petItem.worldY = Math.max(0, Math.min(maxY, gy - scr.y));
        } else {
            const ins = WindowTracker.insetsFor(scr.name);
            const minSafeY = Math.min(maxY, (ins.top || 0) + 20);
            const maxSafeY = Math.max(minSafeY, maxY - (ins.bottom || 0) - 20);
            petItem.worldX = Math.max(Math.min(32, maxX), Math.min(Math.max(0, maxX - 32), gx - scr.x));
            petItem.worldY = Math.max(minSafeY, Math.min(maxSafeY, gy - scr.y));
        }
    }

    function ensureValidScreen(): void {
        const screens = WindowTracker.realScreens;
        if (screens.length === 0) return;

        if (PetManager.dragGhostScreen && screens.indexOf(PetManager.dragGhostScreen) === -1) {
            PetManager.clearDragGhost();
        }

        if (!root.activeScreen || screens.indexOf(root.activeScreen) === -1) {
            const wasDisplaced = root.activeScreen !== null;
            const oldScrX = root.activeScreen ? root.activeScreen.x : 0;
            let next = null;
            if (root.preferredMonitor) {
                next = screens.find(s => s.name === root.preferredMonitor) ?? null;
            }
            if (!next) next = screens[0];
            root._setScreen(next);
            const maxX = Math.max(0, next.width - root.petSize);
            const maxY = Math.max(0, next.height - root.petSize);
            const ins = WindowTracker.insetsFor(next.name);
            if (wasDisplaced) {
                petItem.worldX = oldScrX < next.x ? Math.min(20, maxX) : Math.max(0, maxX - 20);
            } else {
                petItem.worldX = Math.max(0, Math.min(maxX, petItem.worldX || Math.round(maxX * 0.5)));
            }
            petItem.worldY = Math.max(Math.min(maxY, (ins.top || 0) + 24), Math.min(maxY, petItem.worldY || Math.round(maxY * 0.6)));
            if (wasDisplaced) {
                Qt.callLater(() => petItem.onDisplacedMonitor());
            }
        }

        if (root.activeScreen && !_screenAt(petItem.homeGX, petItem.homeGY)) {
            petItem.homeGX = root.activeScreen.x + petItem.worldX;
            petItem.homeGY = root.activeScreen.y + petItem.worldY;
        }

        if (petItem.onJourney && !_screenAt(petItem.targetGX, petItem.targetGY)) {
            petItem.onJourney = false;
            petItem.enterState("idle");
        }
    }

    MouseArea {
        id: dragArea
        anchors.fill: root.sharedOverlay ? petHitbox : root
        hoverEnabled: true
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        cursorShape: dragging ? Qt.ClosedHandCursor : Qt.OpenHandCursor

        property bool captureActive: false
        property bool dragging: false
        property bool offScreenDragging: false
        property bool didDrag: false
        property real grabX: 0
        property real grabY: 0
        property real grabPetX: 0
        property real grabPetY: 0
        property real rawPetX: 0
        property real rawPetY: 0
        property real prevMouseX: 0
        property real prevMouseY: 0
        property double prevMoveMs: 0
        property real velX: 0
        property real velY: 0

        property bool hovering: false
        property real hoverTime: 0
        property real strokeDist: 0
        property real lastHoverX: -1
        property real lastHoverY: -1

        readonly property bool allowCtrlContext: Qt.platform.os === "osx"

        onCaptureActiveChanged: root.hitRegionsUpdated()
        onPressedChanged: {
            if (!pressed) captureActive = false;
            root.hitRegionsUpdated();
        }
        onDraggingChanged: root.hitRegionsUpdated()

        onPressed: mouse => {
            const pt = dragArea.mapToItem(root, mouse.x, mouse.y);
            if (root.activeScreen) InputTracker.updateFromPointer(root.activeScreen.x + pt.x, root.activeScreen.y + pt.y);
            const isContextClick = mouse.button === Qt.RightButton
                || (allowCtrlContext && mouse.button === Qt.LeftButton && (mouse.modifiers & Qt.ControlModifier));
            if (isContextClick) {
                captureActive = false;
                PetManager.toggleInspector(petItem);
                return;
            }
            captureActive = true;
            didDrag = false;
            dragging = false;
            offScreenDragging = false;
            grabX = pt.x;
            grabY = pt.y;
            grabPetX = petItem.worldX;
            grabPetY = petItem.worldY;
            rawPetX = petItem.worldX;
            rawPetY = petItem.worldY;
            prevMouseX = pt.x;
            prevMouseY = pt.y;
            prevMoveMs = Date.now();
            velX = 0;
            velY = 0;
        }

        function finishInteraction(): void {
            captureActive = false;
            if (!dragging) return;
            dragging = false;
            offScreenDragging = false;
            hoverTime = 0;
            strokeDist = 0;
            PetManager.clearDragGhost();
            PetManager._syncCursorTracking();

            const curScr = root.activeScreen;
            if (!curScr) return;
            const cgx = curScr.x + rawPetX + root.petSize / 2;
            const cgy = curScr.y + rawPetY + root.petSize / 2;
            const t = root._screenAt(cgx, cgy);
            if (t && t !== root.activeScreen) root._setScreen(t);

            petItem.worldX = Math.max(0, Math.min(root.activeScreen.width - root.petSize, cgx - root.petSize / 2 - root.activeScreen.x));
            petItem.worldY = Math.max(0, Math.min(root.activeScreen.height - root.petSize, cgy - root.petSize / 2 - root.activeScreen.y));

            const gx = root.activeScreen.x + petItem.worldX;
            const gy = root.activeScreen.y + petItem.worldY;
            if (Math.hypot(gx - petItem.homeGX, gy - petItem.homeGY) > petItem.homeRadius * 1.8 && Math.hypot(velX, velY) < 280) {
                petItem.homeGX = gx;
                petItem.homeGY = gy;
            }

            const idleGap = (Date.now() - prevMoveMs) / 1000;
            const decay = idleGap > 0.08 ? Math.exp(-idleGap * 14) : 1.0;
            Nav.launchFromRelease(petItem, velX * decay, velY * decay, petItem.altitude);
            root.hitRegionsUpdated();
        }

        onReleased: mouse => {
            captureActive = false;
            if (mouse.button === Qt.RightButton || (allowCtrlContext && (mouse.modifiers & Qt.ControlModifier))) return;
            if (dragging) {
                finishInteraction();
            } else if (!didDrag) {
                petItem.onClicked();
            }
        }

        onCanceled: finishInteraction()

        onPositionChanged: mouse => {
            const pt = dragArea.mapToItem(root, mouse.x, mouse.y);
            if (root.activeScreen) InputTracker.updateFromPointer(root.activeScreen.x + pt.x, root.activeScreen.y + pt.y);
            else InputTracker.registerMouseMove();
            if (pressed && (pressedButtons & Qt.LeftButton) && !(allowCtrlContext && (mouse.modifiers & Qt.ControlModifier))) {
                const moveFromGrab = Math.hypot(pt.x - grabX, pt.y - grabY);
                if (!dragging && moveFromGrab > 5) {
                    dragging = true;
                    didDrag = true;
                    petItem.altitude = 18;
                    petItem.sprite.triggerSquash(0.88, 1.14);
                    petItem.enterState("drag");
                    PetManager.notifyPetDragBegan(petItem);
                    PetManager._syncCursorTracking();
                }
                if (dragging) {
                    const now = Date.now();
                    const dt = Math.max(0.008, (now - prevMoveMs) / 1000);
                    const instVX = (pt.x - prevMouseX) / dt;
                    const instVY = (pt.y - prevMouseY) / dt;
                    velX = velX * 0.55 + instVX * 0.45;
                    velY = velY * 0.55 + instVY * 0.45;
                    prevMouseX = pt.x;
                    prevMouseY = pt.y;
                    prevMoveMs = now;

                    rawPetX = grabPetX + (pt.x - grabX);
                    rawPetY = grabPetY + (pt.y - grabY);
                    if (Math.abs(velX) > 25) petItem.facingRight = velX >= 0;

                    const cgx = root.activeScreen.x + rawPetX + root.petSize / 2;
                    const cgy = root.activeScreen.y + rawPetY + root.petSize / 2;
                    const targetScr = root._screenAt(cgx, cgy);
                    if (targetScr && targetScr !== root.activeScreen) {
                        offScreenDragging = true;
                        PetManager.updateDragGhost(
                            targetScr,
                            Math.max(0, Math.min(targetScr.width - root.petSize, cgx - root.petSize / 2 - targetScr.x)),
                            Math.max(0, Math.min(targetScr.height - root.petSize, cgy - root.petSize / 2 - targetScr.y)),
                            root.petSize,
                            petItem.renderedSpecies,
                            !petItem.facingRight
                        );
                    } else {
                        offScreenDragging = false;
                        PetManager.clearDragGhost();
                        petItem.worldX = Math.max(0, Math.min(root.width - root.petSize, rawPetX));
                        petItem.worldY = Math.max(0, Math.min(root.height - root.petSize, rawPetY));
                    }
                }
                return;
            }

            const insidePet = pt.x >= petHitbox.x
                && pt.x <= petHitbox.x + petHitbox.width
                && pt.y >= petHitbox.y
                && pt.y <= petHitbox.y + petHitbox.height;
            if (insidePet && !hovering) {
                hovering = true;
                hoverTime = 0;
                strokeDist = 0;
                lastHoverX = -1;
                petItem.onCursorNear();
            } else if (!insidePet && hovering) {
                hovering = false;
                hoverTime = 0;
                strokeDist = 0;
                lastHoverX = -1;
            }

            if (hovering && lastHoverX >= 0) {
                const d = Math.hypot(pt.x - lastHoverX, pt.y - lastHoverY);
                if (d > 1 && d < 60) {
                    strokeDist += d;
                    if (strokeDist >= 105) {
                        strokeDist = 0;
                        const nowSec = Date.now() / 1000;
                        if (nowSec - root._lastPetTime > 2.4) {
                            root._lastPetTime = nowSec;
                            petItem.onStroked();
                        }
                    }
                }
            }
            lastHoverX = pt.x;
            lastHoverY = pt.y;
        }

        onEntered: {
            if (!inspectorLoader.active) {
                hovering = true;
                hoverTime = 0;
                strokeDist = 0;
                lastHoverX = -1;
                petItem.onCursorNear();
            }
        }

        onExited: {
            hovering = false;
            hoverTime = 0;
            strokeDist = 0;
            lastHoverX = -1;
        }
    }

    property real _lastPetTime: 0
    Timer {
        interval: 200
        running: dragArea.hovering && !dragArea.pressed && (dragArea.hoverTime < 1.6 || dragArea.strokeDist > 0)
        repeat: true
        onTriggered: {
            dragArea.hoverTime += 0.2;
            dragArea.strokeDist = Math.max(0, dragArea.strokeDist - 8);
            if (dragArea.hoverTime > 1.2 && dragArea.hoverTime < 1.5) {
                const now = Date.now() / 1000;
                if (now - root._lastPetTime > 3.2) {
                    root._lastPetTime = now;
                    petItem.onPetted();
                }
            }
        }
    }

    Loader {
        id: inspectorLoader
        z: 10
        active: root.inspectorOpen
        visible: !dragArea.dragging
        width: active ? implicitWidth : 0
        height: active ? implicitHeight : 0
        x: {
            const rightX = petItem.worldX + root.petSize + 14;
            const w = implicitWidth > 0 ? implicitWidth : 268;
            if (rightX + w + 12 <= root.width) return rightX;
            const leftX = petItem.worldX - w - 14;
            if (leftX >= 12) return leftX;
            return Math.max(12, Math.min(root.width - w - 12, (root.width - w) * 0.5));
        }
        y: {
            const h = implicitHeight > 0 ? implicitHeight : 230;
            const minY = root.topInset + 10;
            const maxY = Math.max(minY, root.height - root.bottomInset - h - 10);
            const ideal = petItem.worldY + root.petSize / 2 - h / 2;
            return Math.max(minY, Math.min(maxY, ideal));
        }
        onActiveChanged: root.hitRegionsUpdated()
        onXChanged: root.hitRegionsUpdated()
        onYChanged: root.hitRegionsUpdated()
        onWidthChanged: root.hitRegionsUpdated()
        onHeightChanged: root.hitRegionsUpdated()

        sourceComponent: PetInspector {
            pet: petItem
            cardWidth: Math.max(236, Math.min(268, root.width - 24))
            maxHeight: Math.max(200, root.height - root.topInset - root.bottomInset - 24)
        }
    }

    Connections {
        target: WindowTracker
        function onWindowOpened(windowClass: string, title: string): void { petItem.onWindowOpened(windowClass); }
        function onWindowFocused(windowClass: string, title: string): void { petItem.onWindowEvent(windowClass); }
        function onWindowClosed(windowClass: string, gx: real, gy: real, w: real, h: real, address: string): void {
            petItem.onWindowClosed(windowClass, gx, gy, w, h, address);
        }
        function onWindowShifted(windowClass: string, x: real, y: real, w: real, h: real, address: string): void {
            petItem.onWindowShifted(windowClass, x, y, w, h, address);
        }
        function onWindowUrgent(windowClass: string, gx: real, gy: real): void { petItem.onWindowUrgent(windowClass, gx, gy); }
        function onWorkspaceChanged(): void { petItem.onWorkspaceChanged(); }
        function onWorkspaceCleared(): void { petItem.onWorkspaceCleared(); }
        function onMonitorConnected(screenName: string): void { petItem.onMonitorConnected(screenName); }
    }

    Connections {
        target: InputTracker
        function onIdleBegan(): void { petItem.onIdleBegan(); }
        function onIdleEnded(idleDurationSec: real): void { petItem.onIdleEnded(idleDurationSec); }
        function onCursorWiggled(gx: real, gy: real): void { petItem.onCursorWiggled(gx, gy); }
        function onCursorParkedNear(gx: real, gy: real): void { petItem.onCursorParked(gx, gy); }
        function onCursorUnparked(gx: real, gy: real, speed: real): void { petItem.onCursorUnparked(gx, gy, speed); }
    }

    Connections {
        target: MediaTracker
        function onMusicStarted(title: string, artist: string): void { petItem.onMusicStarted(); }
        function onMusicPausedAbruptly(title: string, artist: string): void { petItem.onMusicPaused(); }
        function onMicStateChanged(active: bool): void { petItem.onMicStateChanged(active); }
        function onAudioVolumeSpiked(volume: real): void { petItem.onAudioSpiked(volume); }
        function onAudioMuteChanged(muted: bool): void { petItem.onAudioMuteChanged(muted); }
    }

    Connections {
        target: SystemMonitor
        function onBuildCompleted(durationSec: real): void { petItem.onBuildCompleted(durationSec); }
        function onPowerPluggedChanged(pluggedIn: bool, batteryLevel: real): void { petItem.onPowerPluggedChanged(pluggedIn, batteryLevel); }
        function onLowBatteryWarn(batteryLevel: real): void { petItem.onLowBatteryWarn(batteryLevel); }
        function onWeatherChanged(oldKind: string, newKind: string): void { petItem.onWeatherChanged(oldKind, newKind); }
        function onSolarTransitioned(oldPhase: string, newPhase: string): void { petItem.onSolarTransitioned(oldPhase, newPhase); }
        function onSystemResumed(sleptSec: real): void { petItem.onSystemResumed(sleptSec); }
        function onToastArrived(appName: string, urgency: string, silent: bool): void { petItem.onToastArrived(appName, urgency, silent); }
    }

    Component.onCompleted: {
        const screens = WindowTracker.realScreens;
        if (!root.activeScreen && screens.length > 0) {
            let match = null;
            if (root.preferredMonitor) {
                match = screens.find(s => s.name === root.preferredMonitor) ?? null;
            }
            root._setScreen(match ?? screens[0]);
        }
        Qt.callLater(() => {
            const effW = root.width > 100 ? root.width : (root.activeScreen ? root.activeScreen.width : 1440);
            const effH = root.height > 100 ? root.height : (root.activeScreen ? root.activeScreen.height : 900);
            const maxX = Math.max(0, effW - root.petSize);
            const maxY = Math.max(0, effH - root.petSize);
            const minSpawnY = Math.min(maxY, root.topInset + 48);
            const maxSpawnY = Math.max(minSpawnY, maxY - root.bottomInset - 48);
            if (!petItem._loadedState && petItem.worldX === 0 && petItem.worldY === 0) {
                const padX = Math.min(80, Math.floor(maxX * 0.2));
                petItem.worldX = padX + Math.random() * Math.max(1, maxX - padX * 2);
                petItem.worldY = minSpawnY + Math.random() * Math.max(1, maxSpawnY - minSpawnY);
            } else {
                petItem.worldX = Math.max(0, Math.min(maxX, petItem.worldX));
                petItem.worldY = Math.max(0, Math.min(maxY, petItem.worldY));
            }
            if (!petItem._loadedState && petItem.homeGX === 0 && petItem.homeGY === 0 && root.activeScreen) {
                petItem.homeGX = root.activeScreen.x + petItem.worldX;
                petItem.homeGY = root.activeScreen.y + petItem.worldY;
            }
            root.hitRegionsUpdated();
        });
    }

    Component.onDestruction: {
        if (dragArea.offScreenDragging) PetManager.clearDragGhost();
    }
}
