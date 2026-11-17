pragma ComponentBehavior: Bound

import QtQuick
import "../config"
import "../services"

Rectangle {
    id: root

    required property string petId
    property bool armed: false

    onPetIdChanged: {
        armed = false;
        resetTimer.stop();
    }

    Timer {
        id: resetTimer
        interval: 3500
        onTriggered: root.armed = false
    }

    visible: Config.pets.length > 1
    implicitHeight: 28
    implicitWidth: btnTxt.implicitWidth + 18
    radius: Theme.radius(-6)
    color: root.armed
        ? Theme.alpha(Theme.danger, 0.24)
        : (btnMouse.containsMouse ? Theme.alpha(Theme.danger, 0.12) : Theme.parchment)
    border.width: 1
    border.color: root.armed ? Theme.danger : Theme.alpha(Theme.danger, 0.45)

    Text {
        id: btnTxt
        anchors.centerIn: parent
        text: root.armed ? "Part Ways?" : "Say Goodbye"
        color: root.armed ? Theme.text : Theme.danger
        font.family: Theme.uiFont
        font.pixelSize: 11
        font.weight: root.armed ? Font.Bold : Font.Medium
    }

    MouseArea {
        id: btnMouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: {
            if (!root.petId) return;
            if (!root.armed) {
                root.armed = true;
                resetTimer.restart();
                return;
            }
            root.armed = false;
            resetTimer.stop();
            PetManager.releaseCompanion(root.petId);
        }
    }
}
