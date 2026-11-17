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

    signal evolved()

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
    implicitHeight: evoCol.implicitHeight + 18
    radius: Theme.radius(-4)
    color: Theme.alpha(Theme.warmSoft, 0.78)
    border.width: 1
    border.color: Theme.alpha(Theme.warm, 0.65)

    ColumnLayout {
        id: evoCol
        anchors {
            left: parent.left
            right: parent.right
            top: parent.top
            margins: 9
        }
        spacing: 6

        RowLayout {
            Layout.fillWidth: true
            spacing: 6

            UiIcon {
                name: "spark"
                filled: true
                size: 12
                color: Theme.warm
            }

            Text {
                Layout.fillWidth: true
                elide: Text.ElideRight
                text: "Ready to evolve!"
                color: Theme.warm
                font.family: Theme.uiFont
                font.pixelSize: 12
                font.weight: Font.Bold
            }
        }

        Text {
            readonly property string descText: {
                if (!root.evaluation) return "";
                const opts = root.evaluation.options || [];
                if (opts.length > 0 && opts[0].reason) return opts[0].reason + ".";
                return root.evaluation.nextHint || "";
            }
            visible: descText.length > 0
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            maximumLineCount: 2
            elide: Text.ElideRight
            text: descText
            color: Theme.subtext
            font.family: Theme.uiFont
            font.pixelSize: 11
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
                    radius: Theme.radius(-6)
                    color: evoChoiceMouse.containsMouse ? Theme.warm : Theme.alpha(Theme.warm, 0.24)
                    border.width: 1
                    border.color: Theme.warm
                    Behavior on color { ColorAnimation { duration: 110 } }

                    RowLayout {
                        id: evoChoiceRow
                        anchors.centerIn: parent
                        spacing: 5

                        UiIcon {
                            name: "spark"
                            filled: true
                            size: 11
                            color: evoChoiceMouse.containsMouse ? Theme.overWarm : Theme.warm
                        }

                        Text {
                            text: "Evolve into " + (evoChoicePill.modelData.displayName || evoChoicePill.modelData.species || "")
                            color: evoChoiceMouse.containsMouse ? Theme.overWarm : Theme.text
                            font.family: Theme.uiFont
                            font.pixelSize: 11
                            font.weight: Font.DemiBold
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
                            if (evolvedName) root.evolved();
                        }
                    }
                }
            }
        }
    }
}
