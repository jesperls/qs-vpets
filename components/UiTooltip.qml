pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Window
import "../config"

Item {
    id: root

    property string text: ""
    property bool active: false
    property int delayMs: 420
    property bool _showing: false
    property real _posX: 0
    property real _posY: 0

    enabled: false
    width: 0
    height: 0

    function _syncVisibility(): void {
        if (active && text.length > 0) {
            hoverDelay.restart();
        } else {
            hoverDelay.stop();
            _showing = false;
        }
    }

    function _updatePosition(): void {
        const anchor = root.parent;
        const host = root.Window.contentItem ?? anchor;
        if (!anchor || !host) return;
        const topPt = anchor.mapToItem(host, anchor.width * 0.5, 0);
        const botPt = anchor.mapToItem(host, anchor.width * 0.5, anchor.height);
        const bw = bubble.width;
        const bh = bubble.height;
        const hostW = host.width > 0 ? host.width : bw + 16;
        const hostH = host.height > 0 ? host.height : bh + 16;
        root._posX = Math.round(Math.max(8, Math.min(hostW - bw - 8, topPt.x - bw * 0.5)));
        if (topPt.y - bh - 6 >= 8) {
            root._posY = Math.round(topPt.y - bh - 6);
        } else {
            root._posY = Math.round(Math.min(hostH - bh - 8, botPt.y + 6));
        }
    }

    onActiveChanged: _syncVisibility()
    onTextChanged: {
        if (text.length === 0) {
            hoverDelay.stop();
            _showing = false;
        } else if (_showing) {
            _updatePosition();
        } else if (active) {
            hoverDelay.restart();
        }
    }

    Timer {
        id: hoverDelay
        interval: root.delayMs
        onTriggered: {
            if (root.active && root.text.length > 0 && (!root.parent || root.parent.visible)) {
                root._updatePosition();
                root._showing = true;
            }
        }
    }

    Connections {
        target: root.parent
        function onXChanged(): void { if (root._showing) root._updatePosition(); }
        function onYChanged(): void { if (root._showing) root._updatePosition(); }
        function onVisibleChanged(): void {
            if (root.parent && !root.parent.visible) {
                hoverDelay.stop();
                root._showing = false;
            }
        }
    }

    // Reparent to Window.contentItem while visible so Flickable clip bounds never crop tooltips.
    Rectangle {
        id: bubble
        parent: (root._showing || bubble.opacity > 0.01) && root.Window.contentItem
            ? root.Window.contentItem
            : root
        enabled: false
        visible: opacity > 0.01 && root.text.length > 0
        opacity: root._showing ? 1.0 : 0.0
        z: 10000
        radius: Theme.radius(-6)
        color: Theme.elevated
        border.width: 1
        border.color: Theme.border
        implicitWidth: Math.min(256, label.implicitWidth + 16)
        implicitHeight: label.implicitHeight + 10
        width: implicitWidth
        height: implicitHeight
        x: root._posX
        y: root._posY

        onWidthChanged: if (root._showing) root._updatePosition()
        onHeightChanged: if (root._showing) root._updatePosition()

        Behavior on opacity {
            NumberAnimation { duration: Theme.animMs; easing.type: Easing.OutCubic }
        }

        Text {
            id: label
            anchors.centerIn: parent
            width: Math.min(240, implicitWidth)
            wrapMode: Text.WordWrap
            horizontalAlignment: Text.AlignHCenter
            text: root.text
            color: Theme.text
            font.family: Theme.uiFont
            font.pixelSize: 11
        }
    }
}
