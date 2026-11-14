pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../config"
import "../services"

RowLayout {
    id: root

    required property bool prefsExpanded
    required property bool adoptMode

    signal togglePrefs()
    signal toggleAdoptMode()
    signal closeRequested()

    Layout.fillWidth: true
    spacing: 10

    Rectangle {
        implicitWidth: 36
        implicitHeight: 36
        radius: Theme.radius(-4)
        color: Theme.surface
        border.width: 1
        border.color: Theme.borderSubtle

        UiIcon {
            anchors.centerIn: parent
            name: "sanctuary"
            size: 17
            color: Theme.accent
        }
    }

    ColumnLayout {
        spacing: 1

        Text {
            text: "Pokémon Sanctuary"
            color: Theme.text
            font.family: Theme.uiFont
            font.pixelSize: 17
            font.weight: Font.Bold
        }

        Text {
            text: PetManager.roamingIds.length + " roaming on desktop  ·  "
                + Math.max(0, Config.pets.length - PetManager.roamingIds.length) + " resting in sanctuary"
            color: Theme.subtext
            font.family: Theme.uiFont
            font.pixelSize: 11
        }
    }

    Item { Layout.fillWidth: true }

    Rectangle {
        implicitHeight: 30
        radius: Theme.radius(-6)
        color: Theme.surface
        border.width: 1
        border.color: Theme.borderSubtle
        implicitWidth: maxRow.implicitWidth + 16

        RowLayout {
            id: maxRow
            anchors.centerIn: parent
            spacing: 6

            Text {
                text: "Max Roaming"
                color: Theme.subtext
                font.family: Theme.uiFont
                font.pixelSize: 11
            }

            Rectangle {
                implicitWidth: 20
                implicitHeight: 20
                radius: Theme.radius(-9)
                color: minusArea.containsMouse ? Theme.surfaceAlt : "transparent"

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
                Layout.minimumWidth: 16
                horizontalAlignment: Text.AlignHCenter
                text: String(Config.maxActiveRoaming)
                color: Theme.accent
                font.family: Theme.monoFont
                font.pixelSize: 12
                font.bold: true
            }

            Rectangle {
                implicitWidth: 20
                implicitHeight: 20
                radius: Theme.radius(-9)
                color: plusArea.containsMouse ? Theme.surfaceAlt : "transparent"

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

    Rectangle {
        implicitHeight: 30
        radius: Theme.radius(-6)
        implicitWidth: visRow.implicitWidth + 16
        color: PetManager.hidden
            ? Theme.alpha(Theme.warm, 0.14)
            : (visMouse.containsMouse ? Theme.surfaceAlt : Theme.surface)
        border.width: 1
        border.color: PetManager.hidden ? Theme.alpha(Theme.warm, 0.55) : Theme.borderSubtle
        Behavior on color { ColorAnimation { duration: 120 } }

        RowLayout {
            id: visRow
            anchors.centerIn: parent
            spacing: 6

            UiIcon {
                name: PetManager.hidden ? "eyeOff" : "eye"
                size: 13
                color: PetManager.hidden ? Theme.warm : Theme.subtext
            }

            Text {
                text: PetManager.hidden ? "Hidden" : "Visible"
                color: PetManager.hidden ? Theme.warm : Theme.text
                font.family: Theme.uiFont
                font.pixelSize: 11
                font.weight: Font.Medium
            }
        }

        MouseArea {
            id: visMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: PetManager.hidden = !PetManager.hidden
        }

        UiTooltip {
            active: visMouse.containsMouse
            text: "Temporarily hide or show all desktop companions"
        }
    }

    Rectangle {
        implicitHeight: 30
        radius: Theme.radius(-6)
        implicitWidth: prefBtnRow.implicitWidth + 16
        color: root.prefsExpanded
            ? Theme.accentSoft
            : (prefBtnMouse.containsMouse ? Theme.surfaceAlt : Theme.surface)
        border.width: 1
        border.color: root.prefsExpanded ? Theme.accent : Theme.borderSubtle
        Behavior on color { ColorAnimation { duration: 120 } }

        RowLayout {
            id: prefBtnRow
            anchors.centerIn: parent
            spacing: 6

            UiIcon {
                name: "sliders"
                size: 13
                color: root.prefsExpanded ? Theme.accent : Theme.subtext
            }

            Text {
                text: "Preferences"
                color: root.prefsExpanded ? Theme.accent : Theme.text
                font.family: Theme.uiFont
                font.pixelSize: 11
                font.weight: Font.Medium
            }
        }

        MouseArea {
            id: prefBtnMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: root.togglePrefs()
        }
    }

    Rectangle {
        implicitHeight: 30
        radius: Theme.radius(-6)
        implicitWidth: adoptToggleRow.implicitWidth + 18
        color: root.adoptMode
            ? Theme.surfaceAlt
            : (adoptToggleMouse.containsMouse ? Theme.accent : Theme.accentSoft)
        border.width: 1
        border.color: root.adoptMode ? Theme.border : Theme.accent
        Behavior on color { ColorAnimation { duration: 120 } }

        RowLayout {
            id: adoptToggleRow
            anchors.centerIn: parent
            spacing: 6

            UiIcon {
                name: root.adoptMode ? "arrowLeft" : "plus"
                size: 12
                color: root.adoptMode
                    ? Theme.text
                    : (adoptToggleMouse.containsMouse ? Theme.overAccent : Theme.accent)
            }

            Text {
                text: root.adoptMode ? "Back to Companion" : "Adopt Companion"
                color: root.adoptMode
                    ? Theme.text
                    : (adoptToggleMouse.containsMouse ? Theme.overAccent : Theme.accent)
                font.family: Theme.uiFont
                font.pixelSize: 11
                font.weight: Font.DemiBold
            }
        }

        MouseArea {
            id: adoptToggleMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: root.toggleAdoptMode()
        }
    }

    Rectangle {
        implicitWidth: 30
        implicitHeight: 30
        radius: Theme.radius(-6)
        color: closeWinArea.containsMouse ? Theme.surfaceAlt : Theme.surface
        border.width: 1
        border.color: closeWinArea.containsMouse ? Theme.border : Theme.borderSubtle
        Behavior on color { ColorAnimation { duration: 120 } }

        UiIcon {
            anchors.centerIn: parent
            name: "close"
            size: 13
            color: closeWinArea.containsMouse ? Theme.text : Theme.subtext
        }

        MouseArea {
            id: closeWinArea
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: root.closeRequested()
        }
    }
}
