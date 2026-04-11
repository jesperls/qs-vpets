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
    Region { id: petMask; x: pet.worldX; y: pet.worldY; width: petSize; height: petSize }

    readonly property int petScale: petData.scale ?? 2
    readonly property int petSize: 32 * petScale

    Pet {
        id: pet
        x: pet.worldX; y: pet.worldY
        width: root.petSize; height: root.petSize
        petData: root.petData
    }

    // 60fps when moving, 4fps when idle (saves CPU for always-on overlay)
    Timer {
        interval: {
            const s = pet.state_;
            if (s === "walk" || s === "wander" || s === "dance" || s === "drag") return 16;
            return 250;
        }
        running: true; repeat: true
        onTriggered: {
            if (pet.state_ === "drag") return;
            pet.updateMovement(interval / 1000);
            if (pet.currentSpeed > 0) root._handleEdges();
        }
    }

    function _handleEdges(): void {
        const s = root.petSize;
        const W = root.width;
        const H = root.height;

        if (pet.worldX < 0) {
            const adj = _adjacentScreen("left", pet.worldY);
            if (adj) _hop(adj, adj.width - s - 4, _mapY(pet.worldY, adj));
            else { pet.worldX = 4; pet.bounceX(); }
        } else if (pet.worldX > W - s) {
            const adj = _adjacentScreen("right", pet.worldY);
            if (adj) _hop(adj, 4, _mapY(pet.worldY, adj));
            else { pet.worldX = W - s - 4; pet.bounceX(); }
        }

        if (pet.worldY < 0) {
            const adj = _adjacentScreen("up", pet.worldX);
            if (adj) _hop(adj, _mapX(pet.worldX, adj), adj.height - s - 4);
            else { pet.worldY = 4; pet.bounceY(); }
        } else if (pet.worldY > H - s) {
            const adj = _adjacentScreen("down", pet.worldX);
            if (adj) _hop(adj, _mapX(pet.worldX, adj), 4);
            else { pet.worldY = H - s - 4; pet.bounceY(); }
        }
    }

    function _adjacentScreen(dir: string, pos: real): var {
        const cur = root.screen;
        const gx = cur.x, gy = cur.y;
        for (const s of Quickshell.screens) {
            if (s === cur) continue;
            const gp = (dir === "left" || dir === "right") ? gy + pos : gx + pos;
            if (dir === "right" && Math.abs(s.x - (gx + cur.width)) < 2 && gp >= s.y && gp <= s.y + s.height) return s;
            if (dir === "left" && Math.abs((s.x + s.width) - gx) < 2 && gp >= s.y && gp <= s.y + s.height) return s;
            if (dir === "down" && Math.abs(s.y - (gy + cur.height)) < 2 && gp >= s.x && gp <= s.x + s.width) return s;
            if (dir === "up" && Math.abs((s.y + s.height) - gy) < 2 && gp >= s.x && gp <= s.x + s.width) return s;
        }
        return null;
    }

    function _mapY(ly: real, adj: var): real { return Math.max(4, Math.min(adj.height - petSize - 4, root.screen.y + ly - adj.y)); }
    function _mapX(lx: real, adj: var): real { return Math.max(4, Math.min(adj.width - petSize - 4, root.screen.x + lx - adj.x)); }
    function _hop(scr: var, nx: real, ny: real): void {
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
                const dx = pet.worldX - pet.homeX, dy = pet.worldY - pet.homeY;
                if (Math.sqrt(dx*dx + dy*dy) > pet.homeRadius * 1.5) {
                    pet.homeX = pet.worldX;
                    pet.homeY = pet.worldY;
                }
                pet.exploreDrive = Math.min(1, pet.exploreDrive + 0.3);
                pet.alertness = Math.min(1, pet.alertness + 0.3);
                pet.enterState("lookUp");
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
                if (t && t !== root.screen) root.screen = t;
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
            var margin = 100;
            if (pet.worldX === 0 && pet.worldY === 0) {
                pet.worldX = margin + Math.random() * Math.max(1, root.width - margin * 2);
                pet.worldY = margin + Math.random() * Math.max(1, root.height - margin * 2);
            }
            if (pet.homeX === 0 && pet.homeY === 0) {
                pet.homeX = pet.worldX;
                pet.homeY = pet.worldY;
            }
            pet.homeX = Math.max(margin, Math.min(root.width - margin, pet.homeX));
            pet.homeY = Math.max(margin, Math.min(root.height - margin, pet.homeY));
        });
    }
}
