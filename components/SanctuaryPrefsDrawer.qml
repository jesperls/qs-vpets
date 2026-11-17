pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../config"
import "../services"
import "ui/FriendAreas.js" as FriendAreas

Rectangle {
    id: root

    width: 288
    implicitWidth: 288
    implicitHeight: prefsCol.implicitHeight + 26
    radius: Theme.radius(2)
    color: Theme.alpha(Theme.panel, 0.97)
    border.width: 1
    border.color: Theme.border

    Rectangle {
        visible: Theme.specularRim
        anchors.fill: parent
        anchors.margins: 3
        radius: Math.max(4, root.radius - 3)
        color: "transparent"
        border.width: 1
        border.color: Theme.alpha(Theme.rimHighlight, 0.5)
    }

    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
    }

    ColumnLayout {
        id: prefsCol
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: 13
        spacing: 9

        RowLayout {
            Layout.fillWidth: true
            spacing: 7

            UiIcon {
                name: "lantern"
                size: 14
                color: Theme.warm
            }

            Text {
                text: "Camp Settings"
                color: Theme.text
                font.family: Theme.uiFont
                font.pixelSize: 13
                font.weight: Font.Bold
            }
        }

        // PMD Friend Area Selector (2x2)
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 5

            Text {
                text: "Friend Area"
                color: Theme.subtext
                font.family: Theme.uiFont
                font.pixelSize: 11
                font.weight: Font.DemiBold
            }

            GridLayout {
                Layout.fillWidth: true
                columns: 2
                rowSpacing: 5
                columnSpacing: 5

                Repeater {
                    model: FriendAreas.AREA_LIST

                    Rectangle {
                        id: areaChip
                        required property var modelData
                        readonly property bool cur: Config.sanctuaryCamp === areaChip.modelData.id
                        Layout.fillWidth: true
                        implicitHeight: 28
                        radius: Theme.radius(-6)
                        color: cur
                            ? Theme.warmSoft
                            : (areaChipMouse.containsMouse ? Theme.surfaceAlt : Theme.parchment)
                        border.width: 1
                        border.color: cur ? Theme.warm : Theme.borderSubtle

                        Text {
                            anchors.centerIn: parent
                            text: areaChip.modelData.label
                            color: areaChip.cur ? Theme.warm : Theme.text
                            font.family: Theme.uiFont
                            font.pixelSize: 11
                            font.weight: areaChip.cur ? Font.Bold : Font.Medium
                        }

                        MouseArea {
                            id: areaChipMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: Config.updateSanctuaryCamp(areaChip.modelData.id)
                        }
                    }
                }
            }
        }

        // Party size stepper
        Rectangle {
            Layout.fillWidth: true
            implicitHeight: 38
            radius: Theme.radius(-5)
            color: Theme.parchment
            border.width: 1
            border.color: Theme.borderSubtle

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 11
                anchors.rightMargin: 8
                spacing: 8

                UiIcon {
                    name: "pokeball"
                    filled: true
                    size: 14
                    color: Theme.border
                    accentColor: Theme.pokeball
                }

                Text {
                    Layout.fillWidth: true
                    text: "Exploring at once"
                    color: Theme.text
                    font.family: Theme.uiFont
                    font.pixelSize: 12
                }

                Rectangle {
                    implicitWidth: 24
                    implicitHeight: 24
                    radius: 12
                    color: minusArea.containsMouse ? Theme.surfaceAlt : Theme.surface
                    border.width: 1
                    border.color: Theme.borderSubtle

                    UiIcon {
                        anchors.centerIn: parent
                        name: "minus"
                        size: 11
                        color: Theme.text
                    }

                    MouseArea {
                        id: minusArea
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: Config.updateMaxRoaming(Config.maxActiveRoaming - 1)
                    }
                }

                Text {
                    Layout.minimumWidth: 18
                    horizontalAlignment: Text.AlignHCenter
                    text: String(Config.maxActiveRoaming)
                    color: Theme.warm
                    font.family: Theme.uiFont
                    font.pixelSize: 13
                    font.weight: Font.Bold
                }

                Rectangle {
                    implicitWidth: 24
                    implicitHeight: 24
                    radius: 12
                    color: plusArea.containsMouse ? Theme.surfaceAlt : Theme.surface
                    border.width: 1
                    border.color: Theme.borderSubtle

                    UiIcon {
                        anchors.centerIn: parent
                        name: "plus"
                        size: 11
                        color: Theme.text
                    }

                    MouseArea {
                        id: plusArea
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: Config.updateMaxRoaming(Config.maxActiveRoaming + 1)
                    }
                }
            }
        }

        Repeater {
            model: [
                {
                    key: "visible",
                    icon: PetManager.hidden ? "eyeOff" : "eye",
                    label: "Show on desktop",
                    active: !PetManager.hidden
                },
                {
                    key: "emotes",
                    icon: "heart",
                    label: "Speech droplets",
                    active: Config.showEmotes
                },
                {
                    key: "perch",
                    icon: "perch",
                    label: "Window ledge hops",
                    active: Config.enablePerching
                },
                {
                    key: "music",
                    icon: "music",
                    label: "Dance to music",
                    active: Config.enableMusicReact
                }
            ]

            Rectangle {
                id: togRow
                required property var modelData
                Layout.fillWidth: true
                implicitHeight: 34
                radius: Theme.radius(-5)
                color: togMouse.containsMouse ? Theme.surfaceAlt : Theme.parchment
                border.width: 1
                border.color: togRow.modelData.active ? Theme.alpha(Theme.warm, 0.38) : Theme.borderSubtle

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 11
                    anchors.rightMargin: 10
                    spacing: 8

                    UiIcon {
                        name: togRow.modelData.icon
                        size: 13
                        color: togRow.modelData.active ? Theme.warm : Theme.muted
                    }

                    Text {
                        Layout.fillWidth: true
                        text: togRow.modelData.label
                        color: Theme.text
                        font.family: Theme.uiFont
                        font.pixelSize: 12
                    }

                    Rectangle {
                        implicitWidth: 30
                        implicitHeight: 17
                        radius: 9
                        color: togRow.modelData.active ? Theme.positive : Theme.surface
                        border.width: 1
                        border.color: togRow.modelData.active ? Theme.positive : Theme.border
                        Behavior on color { ColorAnimation { duration: 130 } }

                        Rectangle {
                            width: 11
                            height: 11
                            radius: 6
                            y: 3
                            x: togRow.modelData.active ? 16 : 3
                            color: togRow.modelData.active ? Theme.overPositive : Theme.subtext
                            Behavior on x { NumberAnimation { duration: 130; easing.type: Easing.OutCubic } }
                        }
                    }
                }

                MouseArea {
                    id: togMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                        const k = togRow.modelData.key;
                        if (k === "visible") {
                            PetManager.hidden = !PetManager.hidden;
                        } else if (k === "emotes") {
                            Config.showEmotes = !Config.showEmotes;
                            Config.save();
                        } else if (k === "perch") {
                            Config.enablePerching = !Config.enablePerching;
                            Config.save();
                        } else if (k === "music") {
                            Config.enableMusicReact = !Config.enableMusicReact;
                            Config.save();
                        }
                    }
                }
            }
        }
    }
}
