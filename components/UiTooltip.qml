import QtQuick
import "../config"

Rectangle {
    id: root

    property string text: ""
    property bool active: false
    property int delayMs: 420

    visible: opacity > 0.01 && text.length > 0
    opacity: _showing ? 1.0 : 0.0
    z: 200
    radius: Theme.radius(-6)
    color: Theme.elevated
    border.width: 1
    border.color: Theme.border
    implicitWidth: Math.min(240, label.implicitWidth + 16)
    implicitHeight: label.implicitHeight + 10
    width: implicitWidth
    height: implicitHeight
    x: parent ? Math.round((parent.width - width) * 0.5) : 0
    y: -height - 6

    property bool _showing: false

    onActiveChanged: {
        if (active && text.length > 0) {
            hoverDelay.restart();
        } else {
            hoverDelay.stop();
            _showing = false;
        }
    }

    Timer {
        id: hoverDelay
        interval: root.delayMs
        onTriggered: {
            if (root.active && root.text.length > 0) root._showing = true;
        }
    }

    Behavior on opacity {
        NumberAnimation { duration: 130; easing.type: Easing.OutCubic }
    }

    Text {
        id: label
        anchors.centerIn: parent
        width: Math.min(224, implicitWidth)
        wrapMode: Text.WordWrap
        horizontalAlignment: Text.AlignHCenter
        text: root.text
        color: Theme.text
        font.family: Theme.uiFont
        font.pixelSize: 11
    }
}
