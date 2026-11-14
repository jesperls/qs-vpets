pragma ComponentBehavior: Bound

import QtQuick
import "../config"
import "../services"

Rectangle {
    id: root

    required property string petId
    property string label: "Release Companion"
    property string confirmLabel: "Confirm Release?"
    property bool armed: false
    property color idleColor: Theme.bg

    signal released()

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
    radius: Theme.radius(-7)
    color: root.armed
        ? Theme.alpha(Theme.danger, 0.2)
        : (btnMouse.containsMouse ? Theme.alpha(Theme.danger, 0.1) : root.idleColor)
    border.width: 1
    border.color: Theme.alpha(Theme.danger, 0.65)

    Text {
        id: btnTxt
        anchors.centerIn: parent
        text: root.armed ? root.confirmLabel : root.label
        color: Theme.danger
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
            const id = root.petId;
            root.released();
            PetManager.releaseCompanion(id);
        }
    }
}
