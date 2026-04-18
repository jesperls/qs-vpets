pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Wayland
import "../config"
import "../services"

PanelWindow {
    id: root

    required property var petData

    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.namespace: "qs-vpets"
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
    WlrLayershell.exclusionMode: ExclusionMode.Ignore

    anchors.top: true
    anchors.bottom: true
    anchors.left: true
    anchors.right: true
    color: "transparent"

    mask: dragArea.dragging ? null : petMask
    readonly property int _frameW: pet.sprite._currentAnim ? pet.sprite._currentAnim.frameWidth * (petSize / 32) : petSize
    readonly property int _frameH: pet.sprite._currentAnim ? pet.sprite._currentAnim.frameHeight * (petSize / 32) : petSize
    Region {
        id: petMask
        x: pet.worldX + (petSize - root._frameW) / 2
        y: pet.worldY + (petSize - root._frameH) / 2
        width: Math.max(petSize, root._frameW)
        height: Math.max(petSize, root._frameH)
    }

    readonly property int petScale: petData.scale ?? 2
    readonly property int petSize: 32 * petScale

    Pet {
        id: pet
        x: pet.worldX; y: pet.worldY
        width: root.petSize; height: root.petSize
        petData: root.petData
    }

    Timer {
        interval: {
            const s = pet.state_;
            if (s === "walk" || s === "wander" || s === "zoomies") return 16;
            return 250;
        }
        running: pet.state_ !== "drag"; repeat: true
        onTriggered: {
            pet.updateMovement(interval / 1000);
            if (pet.currentSpeed > 0) root._resolveBounds();
        }
    }

    function _resolveBounds(): void {
        const s = root.petSize;
        const maxX = root.width - s, maxY = root.height - s;
        // Clamp before checking adjacency so corner crossings don't fail
        // adjacency bounds checks on the non-primary axis.
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

    function _isRealScreen(s: var): bool { return s && s.width > 100 && s.height > 100 && !s.name.startsWith("Unknown"); }

    function _adjacentScreen(dir: string, pos: real): var {
        const cur = root.screen;
        const gx = cur.x, gy = cur.y;
        const tol = 8;
        for (const s of Quickshell.screens) {
            if (s === cur || !_isRealScreen(s)) continue;
            const gp = (dir === "left" || dir === "right") ? gy + pos : gx + pos;
            if (dir === "right" && Math.abs(s.x - (gx + cur.width)) < tol && gp >= s.y && gp <= s.y + s.height) return s;
            if (dir === "left" && Math.abs((s.x + s.width) - gx) < tol && gp >= s.y && gp <= s.y + s.height) return s;
            if (dir === "down" && Math.abs(s.y - (gy + cur.height)) < tol && gp >= s.x && gp <= s.x + s.width) return s;
            if (dir === "up" && Math.abs((s.y + s.height) - gy) < tol && gp >= s.x && gp <= s.x + s.width) return s;
        }
        return null;
    }

    function _mapY(ly: real, adj: var): real { return Math.max(0, Math.min(adj.height - petSize, root.screen.y + ly - adj.y)); }
    function _mapX(lx: real, adj: var): real { return Math.max(0, Math.min(adj.width - petSize, root.screen.x + lx - adj.x)); }
    function _hop(scr: var, nx: real, ny: real): void {
        const oldScr = root.screen;
        const dx = oldScr.x - scr.x;
        const dy = oldScr.y - scr.y;
        pet.homeX += dx;
        pet.homeY += dy;
        if (pet.onJourney) {
            const going = pet.intention && (pet.intention.action === "go_home" || pet.intention.action === "go_home_rest");
            const tx = pet.targetX + dx;
            const ty = pet.targetY + dy;
            const offScreen = tx < 0 || tx > scr.width - petSize || ty < 0 || ty > scr.height - petSize;
            if (going) {
                pet.onJourney = false;
                pet._journeyToWindow = false;
                if (pet.intention) pet.intention.journeyed = true;
                pet.enterState("idle");
            } else if (offScreen) {
                pet.onJourney = false;
                pet._journeyToWindow = false;
                pet.intention = null;
                pet.enterState("idle");
            } else {
                pet.targetX = tx;
                pet.targetY = ty;
            }
        }
        root.screen = scr; pet.worldX = nx; pet.worldY = ny;
    }

    function _screenAt(gx: real, gy: real): var {
        for (const s of Quickshell.screens)
            if (gx >= s.x && gx < s.x + s.width && gy >= s.y && gy < s.y + s.height) return s;
        return null;
    }

    MouseArea {
        id: dragArea
        anchors.fill: parent
        hoverEnabled: true
        acceptedButtons: Qt.LeftButton

        property bool dragging: false
        property real grabGlobalX: 0
        property real grabGlobalY: 0
        property real grabPetX: 0
        property real grabPetY: 0
        property bool didDrag: false
        property bool hovering: false
        property real hoverTime: 0

        onPressed: (mouse) => {
            dragging = true; didDrag = false;
            grabGlobalX = root.screen.x + mouse.x;
            grabGlobalY = root.screen.y + mouse.y;
            grabPetX = pet.worldX + root.screen.x;
            grabPetY = pet.worldY + root.screen.y;
            pet.enterState("drag");
        }
        onReleased: {
            if (dragging) {
                dragging = false; hoverTime = 0;
                pet.worldX = Math.max(0, Math.min(root.width - petSize, pet.worldX));
                pet.worldY = Math.max(0, Math.min(root.height - petSize, pet.worldY));
                const dx = pet.worldX - pet.homeX, dy = pet.worldY - pet.homeY;
                if (Math.sqrt(dx*dx + dy*dy) > pet.homeRadius * 1.5) {
                    pet.homeX = pet.worldX;
                    pet.homeY = pet.worldY;
                }
                pet.exploreDrive = Math.min(1, pet.exploreDrive + 0.3);
                pet.alertness = Math.min(1, pet.alertness + 0.3);
                pet.enterState("pose");
            }
        }
        onPositionChanged: (mouse) => {
            if (dragging) {
                didDrag = true;
                const mouseGX = root.screen.x + mouse.x;
                const mouseGY = root.screen.y + mouse.y;
                const petGX = grabPetX + (mouseGX - grabGlobalX);
                const petGY = grabPetY + (mouseGY - grabGlobalY);
                const t = root._screenAt(petGX, petGY);
                if (t && t !== root.screen) {
                    pet.homeX += root.screen.x - t.x;
                    pet.homeY += root.screen.y - t.y;
                    root.screen = t;
                }
                pet.worldX = petGX - root.screen.x;
                pet.worldY = petGY - root.screen.y;
            }
            InputTracker.registerMouseMove();
        }
        onEntered: { hovering = true; hoverTime = 0; pet.onCursorNear(); }
        onExited: { hovering = false; hoverTime = 0; }
        onClicked: { if (!didDrag) pet.enterState("react"); }
    }

    // petting: hover over pet for >1s, 3s cooldown between pets
    property real _lastPetTime: 0
    Timer {
        interval: 200; running: dragArea.hovering && !dragArea.dragging; repeat: true
        onTriggered: {
            dragArea.hoverTime += 0.2;
            if (dragArea.hoverTime > 1.0 && dragArea.hoverTime < 1.3) {
                var now = Date.now() / 1000;
                if (now - root._lastPetTime > 3.0) {
                    root._lastPetTime = now;
                    pet.onPetted();
                }
            }
        }
    }

    Connections {
        target: WindowTracker
        function onWindowOpened(windowClass: string, title: string): void { pet.onWindowOpened(windowClass); }
        function onWindowFocused(windowClass: string, title: string): void { pet.onWindowEvent(windowClass); }
        function onWorkspaceChanged(): void { pet.onWorkspaceChanged(); }
    }
    Connections {
        target: InputTracker
        function onIdleBegan(): void { pet.onIdleBegan(); }
    }

    Component.onCompleted: {
        Qt.callLater(() => {
            const maxX = root.width - petSize, maxY = root.height - petSize;
            if (pet.worldX === 0 && pet.worldY === 0) {
                pet.worldX = Math.random() * maxX;
                pet.worldY = Math.random() * maxY;
            } else {
                pet.worldX = Math.max(0, Math.min(maxX, pet.worldX));
                pet.worldY = Math.max(0, Math.min(maxY, pet.worldY));
            }
            if (pet.homeX === 0 && pet.homeY === 0) {
                pet.homeX = pet.worldX;
                pet.homeY = pet.worldY;
            }
            pet.homeX = Math.max(0, Math.min(maxX, pet.homeX));
            pet.homeY = Math.max(0, Math.min(maxY, pet.homeY));
        });
    }
}
