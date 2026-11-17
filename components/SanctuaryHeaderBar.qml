pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../config"
import "../services"
import "ui/FriendAreas.js" as FriendAreas

RowLayout {
    id: root

    required property bool prefsExpanded
    required property bool adoptMode

    signal togglePrefs()
    signal toggleAdoptMode()
    signal closeRequested()

    function _cycleCamp(): void {
        Config.updateSanctuaryCamp(FriendAreas.nextAreaId(Config.sanctuaryCamp));
    }

    height: implicitHeight
    spacing: 10

    Rectangle {
        implicitHeight: 44
        implicitWidth: signRow.implicitWidth + 24
        radius: Theme.radius(2)
        color: Theme.alpha(Theme.panel, 0.92)
        border.width: 1
        border.color: Theme.border

        RowLayout {
            id: signRow
            anchors.centerIn: parent
            spacing: 10

            Rectangle {
                implicitWidth: 30
                implicitHeight: 30
                radius: 15
                color: Theme.surfaceAlt
                border.width: 1
                border.color: Theme.borderSubtle

                UiIcon {
                    anchors.centerIn: parent
                    name: "pokeball"
                    filled: true
                    size: 17
                    color: Theme.border
                    accentColor: Theme.pokeball
                }
            }

            ColumnLayout {
                spacing: 0

                RowLayout {
                    spacing: 7

                    Text {
                        text: "Pokémon Sanctuary"
                        color: Theme.text
                        font.family: Theme.uiFont
                        font.pixelSize: 14
                        font.weight: Font.Bold
                    }

                    Rectangle {
                        implicitHeight: 20
                        implicitWidth: areaBadgeTxt.implicitWidth + 14
                        radius: 10
                        color: areaBadgeMouse.containsMouse ? Theme.warmSoft : Theme.surfaceAlt
                        border.width: 1
                        border.color: areaBadgeMouse.containsMouse ? Theme.warm : Theme.borderSubtle

                        Text {
                            id: areaBadgeTxt
                            anchors.centerIn: parent
                            text: FriendAreas.areaFor(Config.sanctuaryCamp).label
                            color: Theme.warm
                            font.family: Theme.uiFont
                            font.pixelSize: 10
                            font.weight: Font.DemiBold
                        }

                        MouseArea {
                            id: areaBadgeMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root._cycleCamp()
                        }

                        UiTooltip {
                            active: areaBadgeMouse.containsMouse
                            text: "Switch Friend Area"
                        }
                    }
                }

                Text {
                    readonly property int outCount: PetManager.roamingIds.length
                    readonly property int campCount: Math.max(0, Config.pets.length - outCount)
                    text: (PetManager.hidden ? "Desktop paused  ·  " : "")
                        + outCount + " exploring  ·  " + campCount + " at camp"
                    color: PetManager.hidden ? Theme.warm : Theme.subtext
                    font.family: Theme.uiFont
                    font.pixelSize: 11
                }
            }
        }
    }

    Item { Layout.fillWidth: true }

    // Welcome Pokémon (Field Guide) button with authentic PMD Adventure Log sprite
    Item {
        implicitHeight: 38
        implicitWidth: welcomeInner.implicitWidth + 28

        Rectangle {
            anchors.fill: parent
            anchors.topMargin: 2
            radius: Theme.radius(0)
            color: root.adoptMode ? Theme.borderSubtle : "#3b2816"
        }

        Rectangle {
            anchors.fill: parent
            anchors.bottomMargin: welcomeMouse.pressed ? 0 : 2
            anchors.topMargin: welcomeMouse.pressed ? 2 : 0
            radius: Theme.radius(0)
            color: root.adoptMode
                ? Theme.surfaceAlt
                : (welcomeMouse.containsMouse ? Theme.warm : Theme.alpha(Theme.panel, 0.94))
            border.width: 1
            border.color: root.adoptMode ? Theme.border : Theme.warm
            Behavior on color { ColorAnimation { duration: 120 } }

            RowLayout {
                id: welcomeInner
                anchors.centerIn: parent
                spacing: 7

                Image {
                    visible: !root.adoptMode
                    Layout.preferredWidth: 22
                    Layout.preferredHeight: 22
                    smooth: false
                    source: Qt.resolvedUrl("../assets/sanctuary/items/diary_closed.png")
                }

                UiIcon {
                    visible: root.adoptMode
                    name: "arrowLeft"
                    size: 14
                    color: Theme.warm
                }

                Text {
                    text: root.adoptMode ? "Back to Clearing" : "Welcome Pokémon"
                    color: !root.adoptMode && welcomeMouse.containsMouse ? Theme.overWarm : Theme.text
                    font.family: Theme.uiFont
                    font.pixelSize: 12
                    font.weight: Font.DemiBold
                }
            }
        }

        MouseArea {
            id: welcomeMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: root.toggleAdoptMode()
        }
    }

    // Camp Settings button
    Rectangle {
        implicitWidth: 38
        implicitHeight: 38
        radius: 19
        color: root.prefsExpanded
            ? Theme.warmSoft
            : (prefsMouse.containsMouse ? Theme.surfaceAlt : Theme.alpha(Theme.panel, 0.90))
        border.width: 1
        border.color: root.prefsExpanded ? Theme.warm : Theme.border
        Behavior on color { ColorAnimation { duration: 110 } }

        UiIcon {
            anchors.centerIn: parent
            name: "sliders"
            size: 14
            color: root.prefsExpanded ? Theme.warm : Theme.subtext
        }

        MouseArea {
            id: prefsMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: root.togglePrefs()
        }

        UiTooltip {
            active: prefsMouse.containsMouse && !root.prefsExpanded
            text: "Camp & desktop settings"
        }
    }

    // Close Sanctuary button
    Rectangle {
        implicitWidth: 38
        implicitHeight: 38
        radius: 19
        color: closeMouse.containsMouse ? Theme.surfaceAlt : Theme.alpha(Theme.panel, 0.90)
        border.width: 1
        border.color: closeMouse.containsMouse ? Theme.pokeball : Theme.border
        Behavior on color { ColorAnimation { duration: 110 } }

        UiIcon {
            anchors.centerIn: parent
            name: "close"
            size: 13
            color: closeMouse.containsMouse ? Theme.text : Theme.subtext
        }

        MouseArea {
            id: closeMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: root.closeRequested()
        }
    }
}
