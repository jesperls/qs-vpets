pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../config"
import "../services"
import "behavior/Evolution.js" as Evolution

Rectangle {
    id: root

    required property string selectedPetId
    required property bool cardOpen
    property int maxBeltWidth: 880

    signal companionSelected(petId: string)

    implicitHeight: 62
    implicitWidth: Math.min(maxBeltWidth, Math.max(140, beltList.contentWidth + 18))
    radius: Theme.radius(4)
    color: Theme.alpha(Theme.panel, 0.92)
    border.width: 1
    border.color: Theme.border

    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
    }

    ListView {
        id: beltList
        anchors.fill: parent
        anchors.margins: 7
        orientation: ListView.Horizontal
        spacing: 7
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentWidth > width
        model: Config.pets

        WheelHandler {
            onWheel: event => {
                if (beltList.contentWidth <= beltList.width) return;
                const raw = event.angleDelta.x !== 0 ? event.angleDelta.x : event.angleDelta.y;
                const maxX = Math.max(0, beltList.contentWidth - beltList.width);
                beltList.contentX = Math.max(0, Math.min(maxX, beltList.contentX - raw * 0.6));
            }
        }

        delegate: Rectangle {
            id: partySlot
            required property var modelData
            readonly property bool isOut: PetManager.isRoaming(partySlot.modelData.id)
            readonly property bool isSelected: root.cardOpen && root.selectedPetId === partySlot.modelData.id
            readonly property var liveRef: PetManager.findPetById(partySlot.modelData.id)
            readonly property var resRef: {
                void PetManager.residentRevision;
                return PetManager.residentFor(partySlot.modelData.id);
            }
            readonly property bool evoReady: {
                void (resRef ? resRef.revision : 0);
                void (liveRef ? liveRef.memoryRevision : 0);
                const src = isOut && liveRef ? liveRef : (resRef ? resRef.stateObj : null);
                const ev = src ? Evolution.evaluate(src, partySlot.modelData.sprite) : null;
                return !!(ev && ev.ready);
            }

            width: Math.max(114, slotRow.implicitWidth + 20)
            height: ListView.view ? ListView.view.height : 48
            radius: Theme.radius(0)
            color: isSelected
                ? Theme.warmSoft
                : (slotMouse.containsMouse ? Theme.surfaceAlt : Theme.parchment)
            border.width: 1
            border.color: isSelected
                ? Theme.warm
                : (slotMouse.containsMouse ? Theme.border : Theme.borderSubtle)
            Behavior on color { ColorAnimation { duration: 110 } }

            RowLayout {
                id: slotRow
                anchors.centerIn: parent
                spacing: 8

                Item {
                    Layout.preferredWidth: 32
                    Layout.preferredHeight: 32

                    // Exact 1x (32x32) integer PMD pixel scale
                    SpriteAnimation {
                        anchors.fill: parent
                        speciesName: partySlot.modelData.sprite
                        currentState: "idle"
                        spriteDir: Qt.resolvedUrl("../assets/sprites/" + partySlot.modelData.sprite)
                    }

                    UiIcon {
                        visible: partySlot.evoReady
                        anchors.right: parent.right
                        anchors.top: parent.top
                        anchors.margins: -2
                        name: "spark"
                        filled: true
                        size: 10
                        color: Theme.warm
                    }
                }

                ColumnLayout {
                    spacing: 1

                    Text {
                        Layout.maximumWidth: 96
                        elide: Text.ElideRight
                        text: partySlot.modelData.name
                        color: partySlot.isSelected ? Theme.warm : Theme.text
                        font.family: Theme.uiFont
                        font.pixelSize: 12
                        font.weight: Font.DemiBold
                    }

                    RowLayout {
                        spacing: 4

                        UiIcon {
                            name: partySlot.isOut ? "pokeball" : "lantern"
                            filled: partySlot.isOut
                            size: 11
                            color: partySlot.isOut ? Theme.border : Theme.warm
                            accentColor: Theme.pokeball
                        }

                        Text {
                            text: partySlot.isOut ? "Exploring" : "At camp"
                            color: partySlot.isOut ? Theme.subtext : Theme.muted
                            font.family: Theme.uiFont
                            font.pixelSize: 10
                        }
                    }
                }
            }

            MouseArea {
                id: slotMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: root.companionSelected(partySlot.modelData.id)
            }
        }
    }
}
