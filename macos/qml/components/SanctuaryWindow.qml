pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Window
import MacPlatform
import "../services"

Window {
    id: root

    property var savedGeom: null
    property bool _readyToSave: false
    signal geometrySaved(geom: var)

    flags: Qt.Window | Qt.FramelessWindowHint
    width: 1080
    height: 700
    minimumWidth: 860
    minimumHeight: 560
    visible: true
    title: "Pokémon Sanctuary"
    color: "transparent"

    function _isRectVisibleOnAnyScreen(rx: real, ry: real, rw: real, rh: real): bool {
        const screens = WindowTracker.realScreens;
        for (let i = 0; i < screens.length; i++) {
            const s = screens[i];
            const ox = Math.min(rx + rw, s.x + s.width) - Math.max(rx, s.x);
            const oy = Math.min(ry + rh, s.y + s.height) - Math.max(ry, s.y);
            if (ox >= 120 && oy >= 80) return true;
        }
        return false;
    }

    function _centerOnActiveScreen(): void {
        const screens = WindowTracker.realScreens;
        if (screens.length === 0) return;
        let target = screens[0];
        if (InputTracker.cursorKnown) {
            const cx = InputTracker.cursorX;
            const cy = InputTracker.cursorY;
            for (let i = 0; i < screens.length; i++) {
                const s = screens[i];
                if (cx >= s.x && cx < s.x + s.width && cy >= s.y && cy < s.y + s.height) {
                    target = s;
                    break;
                }
            }
        }
        const availW = Math.max(860, target.width - 48);
        const availH = Math.max(560, target.height - (target.topInset || 25) - (target.bottomInset || 0) - 36);
        root.width = Math.min(1080, availW);
        root.height = Math.min(700, availH);
        root.x = Math.round(target.x + (target.width - root.width) * 0.5);
        root.y = Math.round(target.y + (target.topInset || 25) + (availH + 36 - root.height) * 0.5);
    }

    function _restoreOrCenter(): void {
        const g = root.savedGeom;
        if (g && g.width >= root.minimumWidth && g.height >= root.minimumHeight
                && _isRectVisibleOnAnyScreen(g.x, g.y, g.width, g.height)) {
            root.width = g.width;
            root.height = g.height;
            root.x = g.x;
            root.y = g.y;
            return;
        }
        _centerOnActiveScreen();
    }

    function _ensureOnScreen(): void {
        if (!_isRectVisibleOnAnyScreen(root.x, root.y, root.width, root.height)) {
            _centerOnActiveScreen();
        }
    }

    function _persistGeom(): void {
        if (!root._readyToSave || root.width < root.minimumWidth || root.height < root.minimumHeight) return;
        root.geometrySaved({ x: root.x, y: root.y, width: root.width, height: root.height });
    }

    onXChanged: _persistGeom()
    onYChanged: _persistGeom()
    onWidthChanged: _persistGeom()
    onHeightChanged: _persistGeom()

    Shortcut {
        sequence: StandardKey.Close
        context: Qt.WindowShortcut
        onActivated: PetManager.closePen()
    }

    Component.onCompleted: {
        _restoreOrCenter();
        _readyToSave = true;
        _persistGeom();
        MacPlatform.configureSanctuaryWindow(root);
        Qt.callLater(() => MacPlatform.activateSanctuaryWindow(root));
    }

    Connections {
        target: MacPlatform
        function onOpenSanctuaryRequested(): void {
            root._ensureOnScreen();
            MacPlatform.activateSanctuaryWindow(root);
        }
    }

    onClosing: close => {
        _persistGeom();
        close.accepted = true;
        PetManager.closePen();
    }

    SanctuaryContent {
        enableHeaderDrag: true
        onHeaderDragStarted: root.startSystemMove()
    }

    // Frameless edge/corner resize handles
    MouseArea { z: 50; anchors.left: parent.left; anchors.top: parent.top; anchors.bottom: parent.bottom; anchors.topMargin: 10; anchors.bottomMargin: 10; width: 6; cursorShape: Qt.SizeHorCursor; onPressed: root.startSystemResize(Qt.LeftEdge) }
    MouseArea { z: 50; anchors.right: parent.right; anchors.top: parent.top; anchors.bottom: parent.bottom; anchors.topMargin: 10; anchors.bottomMargin: 10; width: 6; cursorShape: Qt.SizeHorCursor; onPressed: root.startSystemResize(Qt.RightEdge) }
    MouseArea { z: 50; anchors.top: parent.top; anchors.left: parent.left; anchors.right: parent.right; anchors.leftMargin: 10; anchors.rightMargin: 10; height: 6; cursorShape: Qt.SizeVerCursor; onPressed: root.startSystemResize(Qt.TopEdge) }
    MouseArea { z: 50; anchors.bottom: parent.bottom; anchors.left: parent.left; anchors.right: parent.right; anchors.leftMargin: 10; anchors.rightMargin: 10; height: 6; cursorShape: Qt.SizeVerCursor; onPressed: root.startSystemResize(Qt.BottomEdge) }
    MouseArea { z: 51; anchors.left: parent.left; anchors.top: parent.top; width: 10; height: 10; cursorShape: Qt.SizeFDiagCursor; onPressed: root.startSystemResize(Qt.TopEdge | Qt.LeftEdge) }
    MouseArea { z: 51; anchors.right: parent.right; anchors.top: parent.top; width: 10; height: 10; cursorShape: Qt.SizeBDiagCursor; onPressed: root.startSystemResize(Qt.TopEdge | Qt.RightEdge) }
    MouseArea { z: 51; anchors.left: parent.left; anchors.bottom: parent.bottom; width: 10; height: 10; cursorShape: Qt.SizeBDiagCursor; onPressed: root.startSystemResize(Qt.BottomEdge | Qt.LeftEdge) }
    MouseArea { z: 51; anchors.right: parent.right; anchors.bottom: parent.bottom; width: 10; height: 10; cursorShape: Qt.SizeFDiagCursor; onPressed: root.startSystemResize(Qt.BottomEdge | Qt.RightEdge) }
}
