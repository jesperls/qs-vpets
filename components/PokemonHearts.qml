pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../config"
import "ui/CompanionFormat.js" as Fmt

Item {
    id: root

    property real bond: 0.30
    property int heartSize: 13
    property bool showLabel: false

    readonly property var info: Fmt.friendshipInfo(root.bond)

    implicitWidth: heartsRow.implicitWidth
    implicitHeight: heartsRow.implicitHeight

    RowLayout {
        id: heartsRow
        anchors.centerIn: parent
        spacing: 2

        Repeater {
            model: 5

            UiIcon {
                id: hIcon
                required property int index
                readonly property bool isFull: hIcon.index < root.info.full
                readonly property bool isHalf: hIcon.index === root.info.full && root.info.half
                name: isFull ? "heartFill" : (isHalf ? "heartHalf" : "heart")
                size: root.heartSize
                color: (isFull || isHalf) ? Theme.love : Theme.alpha(Theme.muted, 0.55)
            }
        }

        Text {
            visible: root.showLabel
            Layout.leftMargin: 5
            text: root.info.title
            color: Theme.subtext
            font.family: Theme.uiFont
            font.pixelSize: 11
            font.weight: Font.Medium
        }
    }

    MouseArea {
        id: hoverArea
        anchors.fill: parent
        hoverEnabled: true
        acceptedButtons: Qt.NoButton
    }

    UiTooltip {
        active: hoverArea.containsMouse && !root.showLabel
        text: "Friendship: " + root.info.title
    }
}
