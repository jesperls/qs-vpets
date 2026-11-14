pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../config"
import "../services"

Rectangle {
    id: root

    required property string selectedPetId
    required property bool adoptMode
    property string stageOverrideState: ""

    signal companionSelected(petId: string)

    Layout.fillWidth: true
    Layout.preferredHeight: 102
    radius: Theme.radius(0)
    color: Theme.surface
    border.width: 1
    border.color: Theme.borderSubtle

    ListView {
        id: pastureList
        anchors.fill: parent
        anchors.margins: 8
        orientation: ListView.Horizontal
        spacing: 8
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentWidth > width
        model: Config.pets

        WheelHandler {
            onWheel: event => {
                if (pastureList.contentWidth <= pastureList.width) return;
                const raw = event.angleDelta.x !== 0 ? event.angleDelta.x : event.angleDelta.y;
                const maxX = Math.max(0, pastureList.contentWidth - pastureList.width);
                pastureList.contentX = Math.max(0, Math.min(maxX, pastureList.contentX - raw * 0.6));
            }
        }

        delegate: Rectangle {
            id: pastureTile
            required property var modelData
            readonly property bool isOut: PetManager.isRoaming(pastureTile.modelData.id)
            readonly property bool isSelected: !root.adoptMode && root.selectedPetId === pastureTile.modelData.id
            readonly property var liveRef: PetManager.findPetById(pastureTile.modelData.id)
            readonly property var resRef: {
                void PetManager.residentRevision;
                return PetManager.residentFor(pastureTile.modelData.id);
            }
            readonly property string animState: {
                void (resRef ? resRef.revision : 0);
                if (isSelected && root.stageOverrideState.length > 0) return root.stageOverrideState;
                if (isOut) return (liveRef && liveRef.state_ !== "drag") ? liveRef.state_ : "idle";
                return resRef ? resRef.penState : "idle";
            }

            width: 96
            height: ListView.view ? ListView.view.height : 86
            radius: Theme.radius(-4)
            color: isSelected
                ? Theme.alpha(Theme.accent, 0.14)
                : (pastureMouse.containsMouse ? Theme.surfaceAlt : Theme.alpha(Theme.bg, 0.45))
            border.width: 1
            border.color: isSelected
                ? Theme.accent
                : (pastureMouse.containsMouse ? Theme.border : Theme.borderSubtle)
            Behavior on color { ColorAnimation { duration: 120 } }

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 6
                spacing: 2

                Item {
                    Layout.fillWidth: true
                    Layout.fillHeight: true

                    Rectangle {
                        anchors.horizontalCenter: parent.horizontalCenter
                        anchors.bottom: parent.bottom
                        anchors.bottomMargin: 5
                        width: 44
                        height: 1
                        color: Theme.borderSubtle
                    }

                    SpriteAnimation {
                        anchors.centerIn: parent
                        width: 48
                        height: 48
                        speciesName: pastureTile.modelData.sprite
                        currentState: pastureTile.animState
                        spriteDir: Qt.resolvedUrl("../assets/sprites/" + pastureTile.modelData.sprite)
                    }
                }

                Text {
                    Layout.fillWidth: true
                    horizontalAlignment: Text.AlignHCenter
                    elide: Text.ElideRight
                    text: pastureTile.modelData.name
                    color: Theme.text
                    font.family: Theme.uiFont
                    font.pixelSize: 11
                    font.weight: pastureTile.isSelected ? Font.Bold : Font.Medium
                }

                RowLayout {
                    Layout.alignment: Qt.AlignHCenter
                    spacing: 4

                    Rectangle {
                        implicitWidth: 5
                        implicitHeight: 5
                        radius: 3
                        color: pastureTile.isOut ? Theme.positive : Theme.warm
                    }

                    Text {
                        text: pastureTile.isOut ? "Roaming" : "Sanctuary"
                        color: Theme.subtext
                        font.family: Theme.uiFont
                        font.pixelSize: 9
                    }
                }
            }

            MouseArea {
                id: pastureMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: root.companionSelected(pastureTile.modelData.id)
            }
        }
    }
}
