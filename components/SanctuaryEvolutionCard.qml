pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../config"
import "../services"
import "behavior/Evolution.js" as Evolution

Rectangle {
    id: root

    required property string petId
    required property string species
    property var livePet: null
    property var resident: null

    signal evolved(displayName: string)

    readonly property var evaluation: {
        void PetManager.residentRevision;
        void (root.resident ? root.resident.revision : 0);
        void (root.livePet ? root.livePet.memoryRevision : 0);
        void (root.livePet ? root.livePet.bond : 0);
        void (root.livePet ? root.livePet.maturity : 0);
        const src = root.livePet
            ? root.livePet
            : (root.resident ? root.resident.stateObj : null);
        return Evolution.evaluate(src, root.species);
    }

    visible: !!(evaluation && evaluation.ready)
    Layout.fillWidth: true
    implicitHeight: evoCol.implicitHeight + 22
    radius: Theme.radius(-5)
    color: Theme.alpha(Theme.accent, 0.08)
    border.width: 1
    border.color: Theme.alpha(Theme.accent, 0.34)

    ColumnLayout {
        id: evoCol
        anchors {
            left: parent.left
            right: parent.right
            top: parent.top
            margins: 11
        }
        spacing: 7

        RowLayout {
            Layout.fillWidth: true
            spacing: 6

            UiIcon {
                name: "spark"
                size: 13
                color: Theme.accent
            }

            Text {
                text: "Evolution Ready"
                color: Theme.text
                font.family: Theme.uiFont
                font.pixelSize: 11
                font.weight: Font.DemiBold
            }
        }

        Text {
            visible: !!(root.evaluation && root.evaluation.nextHint)
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            text: root.evaluation ? (root.evaluation.nextHint || "") : ""
            color: Theme.subtext
            font.family: Theme.uiFont
            font.pixelSize: 10
        }

        Flow {
            Layout.fillWidth: true
            spacing: 6

            Repeater {
                model: root.evaluation ? (root.evaluation.options || []) : []

                delegate: Rectangle {
                    id: evoChoicePill
                    required property var modelData
                    implicitHeight: 26
                    implicitWidth: evoChoiceRow.implicitWidth + 18
                    radius: Theme.radius(-7)
                    color: evoChoiceMouse.containsMouse
                        ? Theme.alpha(Theme.accent, 0.28)
                        : Theme.alpha(Theme.accent, 0.16)
                    border.width: 1
                    border.color: Theme.alpha(Theme.accent, 0.45)

                    RowLayout {
                        id: evoChoiceRow
                        anchors.centerIn: parent
                        spacing: 5

                        UiIcon {
                            name: "spark"
                            size: 11
                            color: Theme.accent
                        }

                        Text {
                            text: "Evolve into " + (evoChoicePill.modelData.displayName || evoChoicePill.modelData.species || "")
                            color: Theme.text
                            font.family: Theme.uiFont
                            font.pixelSize: 10
                            font.weight: Font.Medium
                        }
                    }

                    MouseArea {
                        id: evoChoiceMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            if (!root.petId) return;
                            const targetSp = evoChoicePill.modelData.species || "";
                            const evolvedName = PetManager.evolveCompanion(root.petId, targetSp);
                            if (evolvedName) root.evolved(evolvedName);
                        }
                    }
                }
            }
        }
    }
}
