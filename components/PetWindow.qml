pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Wayland
import "../config"
import "../services"
import "PetNav.js" as Nav
import "behavior/Topology.js" as Topology

PanelWindow {
    id: root

    required property string petId

    readonly property var petData: {
        for (let i = 0; i < Config.pets.length; i++) {
            if (Config.pets[i].id === root.petId) return Config.pets[i];
        }
        return { id: root.petId, name: root.petId, sprite: "zorua", personality: "emergent", scale: 2, monitor: "", roamMode: "auto", actions: {} };
    }

    readonly property string preferredMonitor: petData.monitor ?? ""
    onPreferredMonitorChanged: {
        if (!preferredMonitor) return;
        const match = _realScreens().find(s => s.name === preferredMonitor);
        if (match && match !== root.screen) {
            root.screen = match;
            _clampToViewport();
        }
    }

    readonly property bool inspectorOpen: PetManager.inspectedPet === pet
    visible: !PetManager.hidden

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

    readonly property int _maxSafeScale: (root.width > 100 && root.height > 100)
        ? Math.max(1, Math.floor(Math.min(root.width, root.height) / 96))
        : 4
    readonly property int petScale: Math.max(1, Math.min(petData.scale ?? 2, _maxSafeScale))
    readonly property int petSize: 32 * petScale

    readonly property var barInsets: WindowTracker.insetsFor(root.screen ? root.screen.name : "")
    readonly property int topInset: barInsets.top
    readonly property int bottomInset: barInsets.bottom

    Item {
        id: fullScreenMask
        anchors.fill: parent
    }

    Item {
        id: petHitbox
        x: pet.worldX - 4
        y: pet.worldY - pet.altitude - 6
        width: root.petSize + 8
        height: root.petSize + 10
    }

    mask: Region {
        item: dragArea.pressed ? fullScreenMask : null
        regions: [
            Region {
                item: petHitbox
            },
            Region {
                item: inspectorLoader.active ? inspectorLoader : null
            }
        ]
    }

    Pet {
        id: pet
        x: pet.worldX
        y: pet.worldY
        width: root.petSize
        height: root.petSize
        opacity: dragArea.offScreenDragging ? 0.0 : 1.0
        petData: root.petData
        petScreen: root.screen
        petWindow: root
    }

    Timer {
        interval: {
            const s = pet.state_;
            if (s === "walk" || s === "wander" || s === "zoomies" || s === "airborne") return 16;
            if (s === "perch") return pet._perchRiding ? 32 : 90;
            return 250;
        }
        running: root.visible && pet.state_ !== "drag"
        repeat: true
        onTriggered: {
            pet.updateMovement(interval / 1000);
            if (pet.currentSpeed > 0 || pet.state_ === "airborne") root._resolveBounds();
        }
    }

    function _clampToViewport(): void {
        if (root.width <= 100 || root.height <= 100 || dragArea.dragging) return;
        const maxX = Math.max(0, root.width - root.petSize);
        const maxY = Math.max(0, root.height - root.petSize);
        if (pet.worldX > maxX) pet.worldX = maxX;
        else if (pet.worldX < 0) pet.worldX = 0;
        if (pet.worldY > maxY) pet.worldY = maxY;
        else if (pet.worldY < 0) pet.worldY = 0;
    }

    onWidthChanged: _clampToViewport()
    onHeightChanged: _clampToViewport()
    onPetSizeChanged: _clampToViewport()

    function _resolveBounds(): void {
        const s = root.petSize;
        const maxX = Math.max(0, root.width - s);
        const maxY = Math.max(0, root.height - s);
        const probeY = Math.max(0, Math.min(maxY, pet.worldY));
        const probeX = Math.max(0, Math.min(maxX, pet.worldX));
        let hitX = false, hitY = false;

        if (pet.worldX < 0) {
            const adj = _adjacentScreen("left", probeY);
            if (adj) { _hop(adj, adj.width - s, _mapY(probeY, adj)); return; }
            pet.worldX = 0; hitX = true;
        } else if (pet.worldX > maxX) {
            const adj = _adjacentScreen("right", probeY);
            if (adj) { _hop(adj, 0, _mapY(probeY, adj)); return; }
            pet.worldX = maxX; hitX = true;
        }
        if (pet.worldY < 0) {
            const adj = _adjacentScreen("up", probeX);
            if (adj) { _hop(adj, _mapX(probeX, adj), adj.height - s); return; }
            pet.worldY = 0; hitY = true;
        } else if (pet.worldY > maxY) {
            const adj = _adjacentScreen("down", probeX);
            if (adj) { _hop(adj, _mapX(probeX, adj), 0); return; }
            pet.worldY = maxY; hitY = true;
        }

        if (hitX || hitY) pet.reflectOffWall(hitX, hitY);
    }

    function _isRealScreen(s: var): bool {
        return s !== null && s !== undefined && s.width > 100 && s.height > 100 && !s.name.startsWith("Unknown");
    }

    function _realScreens(): var {
        const out = [];
        for (const s of Quickshell.screens) {
            if (_isRealScreen(s)) out.push(s);
        }
        return out;
    }

    function _adjacentScreen(dir: string, pos: real): var {
        return Topology.adjacentScreenAt(_realScreens(), root.screen, dir, pos, root.petSize);
    }

    function _mapY(ly: real, adj: var): real {
        return Math.max(0, Math.min(adj.height - petSize, root.screen.y + ly - adj.y));
    }

    function _mapX(lx: real, adj: var): real {
        return Math.max(0, Math.min(adj.width - petSize, root.screen.x + lx - adj.x));
    }

    function _hop(scr: var, nx: real, ny: real): void {
        root.screen = scr;
        pet.worldX = nx;
        pet.worldY = ny;
    }

    onScreenChanged: {
        dragArea.hovering = false;
        dragArea.hoverTime = 0;
        dragArea.strokeDist = 0;
    }

    function _screenAt(gx: real, gy: real): var {
        return Topology.screenAt(_realScreens(), gx, gy);
    }

    function moveToGlobal(gx: real, gy: real): void {
        const screens = _realScreens();
        const exact = Topology.screenAt(screens, gx, gy);
        const target = exact ?? Topology.nearestScreen(screens, gx, gy);
        if (target && target !== root.screen) root.screen = target;
        const scr = root.screen;
        if (!scr) return;
        const maxX = Math.max(0, scr.width - petSize);
        const maxY = Math.max(0, scr.height - petSize);
        if (exact) {
            pet.worldX = Math.max(0, Math.min(maxX, gx - scr.x));
            pet.worldY = Math.max(0, Math.min(maxY, gy - scr.y));
        } else {
            const ins = WindowTracker.insetsFor(scr.name);
            const minSafeY = Math.min(maxY, (ins.top || 0) + 20);
            const maxSafeY = Math.max(minSafeY, maxY - (ins.bottom || 0) - 20);
            pet.worldX = Math.max(Math.min(32, maxX), Math.min(Math.max(0, maxX - 32), gx - scr.x));
            pet.worldY = Math.max(minSafeY, Math.min(maxSafeY, gy - scr.y));
        }
    }

    function _ensureValidScreen(): void {
        const screens = _realScreens();
        if (screens.length === 0) return;

        if (PetManager.dragGhostScreen && screens.indexOf(PetManager.dragGhostScreen) === -1) {
            PetManager.clearDragGhost();
        }

        if (!root.screen || screens.indexOf(root.screen) === -1) {
            let next = null;
            if (root.petData.monitor) {
                next = screens.find(s => s.name === root.petData.monitor) ?? null;
            }
            if (!next) next = screens[0];
            root.screen = next;
            const maxX = Math.max(0, next.width - root.petSize);
            const maxY = Math.max(0, next.height - root.petSize);
            const ins = WindowTracker.insetsFor(next.name);
            pet.worldX = Math.max(0, Math.min(maxX, pet.worldX || Math.round(maxX * 0.5)));
            pet.worldY = Math.max(Math.min(maxY, (ins.top || 0) + 24), Math.min(maxY, pet.worldY || Math.round(maxY * 0.6)));
        }

        if (root.screen && !_screenAt(pet.homeGX, pet.homeGY)) {
            pet.homeGX = root.screen.x + pet.worldX;
            pet.homeGY = root.screen.y + pet.worldY;
        }

        if (pet.onJourney && !_screenAt(pet.targetGX, pet.targetGY)) {
            pet.onJourney = false;
            pet.enterState("idle");
        }
    }

    MouseArea {
        id: dragArea
        anchors.fill: parent
        hoverEnabled: true
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        cursorShape: dragging ? Qt.ClosedHandCursor : Qt.OpenHandCursor

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

        onPressed: mouse => {
            if (root.screen) InputTracker.updateFromPointer(root.screen.x + mouse.x, root.screen.y + mouse.y);
            if (mouse.button === Qt.RightButton) {
                PetManager.toggleInspector(pet);
                return;
            }
            didDrag = false;
            dragging = false;
            offScreenDragging = false;
            grabX = mouse.x;
            grabY = mouse.y;
            grabPetX = pet.worldX;
            grabPetY = pet.worldY;
            rawPetX = pet.worldX;
            rawPetY = pet.worldY;
            prevMouseX = mouse.x;
            prevMouseY = mouse.y;
            prevMoveMs = Date.now();
            velX = 0;
            velY = 0;
        }

        function finishInteraction(): void {
            if (!dragging) return;
            dragging = false;
            offScreenDragging = false;
            hoverTime = 0;
            strokeDist = 0;
            PetManager.clearDragGhost();

            const curScr = root.screen;
            if (!curScr) return;
            const cgx = curScr.x + rawPetX + root.petSize / 2;
            const cgy = curScr.y + rawPetY + root.petSize / 2;
            const t = root._screenAt(cgx, cgy);
            if (t && t !== root.screen) root.screen = t;

            pet.worldX = Math.max(0, Math.min(root.screen.width - root.petSize, cgx - root.petSize / 2 - root.screen.x));
            pet.worldY = Math.max(0, Math.min(root.screen.height - root.petSize, cgy - root.petSize / 2 - root.screen.y));

            const gx = root.screen.x + pet.worldX;
            const gy = root.screen.y + pet.worldY;
            if (Math.hypot(gx - pet.homeGX, gy - pet.homeGY) > pet.homeRadius * 1.8 && Math.hypot(velX, velY) < 280) {
                pet.homeGX = gx;
                pet.homeGY = gy;
            }

            // Decay stale velocity if pointer paused before release.
            const idleGap = (Date.now() - prevMoveMs) / 1000;
            const decay = idleGap > 0.08 ? Math.exp(-idleGap * 14) : 1.0;
            Nav.launchFromRelease(pet, velX * decay, velY * decay, pet.altitude);
        }

        onReleased: mouse => {
            if (mouse.button === Qt.RightButton) return;
            if (dragging) {
                finishInteraction();
            } else if (!didDrag) {
                pet.onClicked();
            }
        }

        onCanceled: finishInteraction()

        onPositionChanged: mouse => {
            if (root.screen) InputTracker.updateFromPointer(root.screen.x + mouse.x, root.screen.y + mouse.y);
            else InputTracker.registerMouseMove();
            if (pressed && (pressedButtons & Qt.LeftButton)) {
                const moveFromGrab = Math.hypot(mouse.x - grabX, mouse.y - grabY);
                if (!dragging && moveFromGrab > 5) {
                    dragging = true;
                    didDrag = true;
                    pet.altitude = 18;
                    pet.sprite.triggerSquash(0.88, 1.14);
                    pet.enterState("drag");
                }
                if (dragging) {
                    const now = Date.now();
                    const dt = Math.max(0.008, (now - prevMoveMs) / 1000);
                    const instVX = (mouse.x - prevMouseX) / dt;
                    const instVY = (mouse.y - prevMouseY) / dt;
                    velX = velX * 0.55 + instVX * 0.45;
                    velY = velY * 0.55 + instVY * 0.45;
                    prevMouseX = mouse.x;
                    prevMouseY = mouse.y;
                    prevMoveMs = now;

                    rawPetX = grabPetX + (mouse.x - grabX);
                    rawPetY = grabPetY + (mouse.y - grabY);
                    if (Math.abs(velX) > 25) pet.facingRight = velX >= 0;

                    const cgx = root.screen.x + rawPetX + root.petSize / 2;
                    const cgy = root.screen.y + rawPetY + root.petSize / 2;
                    const targetScr = root._screenAt(cgx, cgy);
                    if (targetScr && targetScr !== root.screen) {
                        offScreenDragging = true;
                        PetManager.updateDragGhost(
                            targetScr,
                            Math.max(0, Math.min(targetScr.width - root.petSize, cgx - root.petSize / 2 - targetScr.x)),
                            Math.max(0, Math.min(targetScr.height - root.petSize, cgy - root.petSize / 2 - targetScr.y)),
                            root.petSize,
                            pet.renderedSpecies,
                            !pet.facingRight
                        );
                    } else {
                        offScreenDragging = false;
                        PetManager.clearDragGhost();
                        pet.worldX = Math.max(0, Math.min(root.width - root.petSize, rawPetX));
                        pet.worldY = Math.max(0, Math.min(root.height - root.petSize, rawPetY));
                    }
                }
                return;
            }

            // Gentle back-and-forth cursor strokes across the pet trigger tactile petting!
            if (hovering && lastHoverX >= 0) {
                const d = Math.hypot(mouse.x - lastHoverX, mouse.y - lastHoverY);
                if (d > 1 && d < 60) {
                    strokeDist += d;
                    if (strokeDist >= 105) {
                        strokeDist = 0;
                        const nowSec = Date.now() / 1000;
                        if (nowSec - root._lastPetTime > 2.4) {
                            root._lastPetTime = nowSec;
                            pet.onStroked();
                        }
                    }
                }
            }
            lastHoverX = mouse.x;
            lastHoverY = mouse.y;
        }

        onEntered: {
            hovering = true;
            hoverTime = 0;
            strokeDist = 0;
            lastHoverX = -1;
            pet.onCursorNear();
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
        running: dragArea.hovering && !dragArea.pressed
        repeat: true
        onTriggered: {
            dragArea.hoverTime += 0.2;
            dragArea.strokeDist = Math.max(0, dragArea.strokeDist - 8);
            if (dragArea.hoverTime > 1.2 && dragArea.hoverTime < 1.5) {
                const now = Date.now() / 1000;
                if (now - root._lastPetTime > 3.2) {
                    root._lastPetTime = now;
                    pet.onPetted();
                }
            }
        }
    }

    Loader {
        id: inspectorLoader
        z: 10
        active: root.inspectorOpen && !dragArea.dragging
        width: item ? item.implicitWidth : 0
        height: item ? item.implicitHeight : 0
        x: {
            const rightX = pet.worldX + root.petSize + 14;
            const w = item ? item.implicitWidth : 324;
            if (rightX + w + 12 <= root.width) return rightX;
            const leftX = pet.worldX - w - 14;
            if (leftX >= 12) return leftX;
            return Math.max(12, Math.min(root.width - w - 12, (root.width - w) * 0.5));
        }
        y: {
            const h = item ? item.implicitHeight : 300;
            const minY = root.topInset + 10;
            const maxY = Math.max(minY, root.height - root.bottomInset - h - 10);
            const ideal = pet.worldY + root.petSize / 2 - h / 2;
            return Math.max(minY, Math.min(maxY, ideal));
        }
        sourceComponent: PetInspector {
            pet: pet
            cardWidth: Math.max(248, Math.min(324, root.width - 24))
            maxHeight: Math.max(220, root.height - root.topInset - root.bottomInset - 24)
        }
    }

    Connections {
        target: Quickshell
        function onScreensChanged(): void { root._ensureValidScreen(); }
    }

    Connections {
        target: WindowTracker
        function onWindowOpened(windowClass: string, title: string): void { pet.onWindowOpened(windowClass); }
        function onWindowFocused(windowClass: string, title: string): void { pet.onWindowEvent(windowClass); }
        function onWindowClosed(windowClass: string, gx: real, gy: real, w: real, h: real, address: string): void {
            pet.onWindowClosed(windowClass, gx, gy, w, h, address);
        }
        function onWindowUrgent(windowClass: string, gx: real, gy: real): void { pet.onWindowUrgent(windowClass, gx, gy); }
        function onWorkspaceChanged(): void { pet.onWorkspaceChanged(); }
    }

    Connections {
        target: InputTracker
        function onIdleBegan(): void { pet.onIdleBegan(); }
        function onIdleEnded(idleDurationSec: real): void { pet.onIdleEnded(idleDurationSec); }
        function onCursorWiggled(gx: real, gy: real): void { pet.onCursorWiggled(gx, gy); }
    }

    Connections {
        target: MediaTracker
        function onMusicStarted(title: string, artist: string): void { pet.onMusicStarted(); }
        function onMicStateChanged(active: bool): void { pet.onMicStateChanged(active); }
    }

    Connections {
        target: SystemMonitor
        function onBuildCompleted(durationSec: real): void { pet.onBuildCompleted(durationSec); }
    }

    Component.onCompleted: {
        const screens = _realScreens();
        if (!root.screen && screens.length > 0) {
            if (root.petData.monitor) {
                const match = screens.find(s => s.name === root.petData.monitor);
                if (match) root.screen = match;
            }
            if (!root.screen) root.screen = screens[0];
        }
        Qt.callLater(() => {
            const maxX = Math.max(0, root.width - root.petSize);
            const maxY = Math.max(0, root.height - root.petSize);
            const minSpawnY = Math.min(maxY, root.topInset + 48);
            const maxSpawnY = Math.max(minSpawnY, maxY - root.bottomInset - 48);
            if (!pet._loadedState && pet.worldX === 0 && pet.worldY === 0) {
                const padX = Math.min(80, Math.floor(maxX * 0.2));
                pet.worldX = padX + Math.random() * Math.max(1, maxX - padX * 2);
                pet.worldY = minSpawnY + Math.random() * Math.max(1, maxSpawnY - minSpawnY);
            } else {
                pet.worldX = Math.max(0, Math.min(maxX, pet.worldX));
                pet.worldY = Math.max(0, Math.min(maxY, pet.worldY));
            }
            if (!pet._loadedState && pet.homeGX === 0 && pet.homeGY === 0 && root.screen) {
                pet.homeGX = root.screen.x + pet.worldX;
                pet.homeGY = root.screen.y + pet.worldY;
            }
        });
    }
}
