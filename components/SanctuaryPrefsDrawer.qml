pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../config"

Rectangle {
    id: root

    Layout.fillWidth: true
    implicitHeight: prefsRow.implicitHeight + 16
    radius: Theme.radius(-2)
    color: Theme.surface
    border.width: 1
    border.color: Theme.borderSubtle

    RowLayout {
        id: prefsRow
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        anchors.leftMargin: 14
        anchors.rightMargin: 14
        spacing: 12

        Text {
            text: "BEHAVIOR PREFERENCES"
            color: Theme.muted
            font.family: Theme.uiFont
            font.pixelSize: 9
            font.weight: Font.Bold
            font.letterSpacing: 0.6
        }

        Item { Layout.fillWidth: true }

        Flow {
            Layout.maximumWidth: Math.max(280, root.width - 190)
            spacing: 10

            Repeater {
                model: [
                    {
                        key: "emotes",
                        icon: "spark",
                        label: "Emote Droplets",
                        desc: "Show pixel-art mood droplets over companions",
                        active: Config.showEmotes
                    },
                    {
                        key: "perch",
                        icon: "perch",
                        label: "Window Perching",
                        desc: "Allow agile companions to hop onto active window titlebars",
                        active: Config.enablePerching
                    },
                    {
                        key: "music",
                        icon: "music",
                        label: "Music Sync",
                        desc: "React gently when MPRIS media playback starts",
                        active: Config.enableMusicReact
                    }
                ]

                Rectangle {
                    id: prefToggleCard
                    required property var modelData
                    implicitHeight: 30
                    implicitWidth: prefToggleInner.implicitWidth + 18
                    radius: Theme.radius(-7)
                    color: prefToggleMouse.containsMouse ? Theme.surfaceAlt : Theme.bg
                    border.width: 1
                    border.color: prefToggleCard.modelData.active
                        ? Theme.alpha(Theme.accent, 0.45)
                        : Theme.borderSubtle

                    RowLayout {
                        id: prefToggleInner
                        anchors.centerIn: parent
                        spacing: 7

                        UiIcon {
                            name: prefToggleCard.modelData.icon
                            size: 12
                            color: prefToggleCard.modelData.active ? Theme.accent : Theme.subtext
                        }

                        Text {
                            text: prefToggleCard.modelData.label
                            color: Theme.text
                            font.family: Theme.uiFont
                            font.pixelSize: 11
                            font.weight: Font.Medium
                        }

                        Rectangle {
                            implicitWidth: 28
                            implicitHeight: 15
                            radius: 8
                            color: prefToggleCard.modelData.active ? Theme.accent : Theme.surfaceAlt
                            border.width: 1
                            border.color: prefToggleCard.modelData.active ? Theme.accent : Theme.border
                            Behavior on color { ColorAnimation { duration: 140 } }

                            Rectangle {
                                width: 11
                                height: 11
                                radius: 6
                                y: 2
                                x: prefToggleCard.modelData.active ? 15 : 2
                                color: prefToggleCard.modelData.active ? Theme.overAccent : Theme.subtext
                                Behavior on x { NumberAnimation { duration: 140; easing.type: Easing.OutCubic } }
                            }
                        }
                    }

                    MouseArea {
                        id: prefToggleMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            const k = prefToggleCard.modelData.key;
                            if (k === "emotes") Config.showEmotes = !Config.showEmotes;
                            else if (k === "perch") Config.enablePerching = !Config.enablePerching;
                            else if (k === "music") Config.enableMusicReact = !Config.enableMusicReact;
                            Config.save();
                        }
                    }

                    UiTooltip {
                        active: prefToggleMouse.containsMouse
                        text: prefToggleCard.modelData.desc
                    }
                }
            }
        }
    }
}
