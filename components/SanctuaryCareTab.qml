pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../config"
import "ui/CompanionFormat.js" as Fmt

ColumnLayout {
    id: root

    required property var selectedConfig
    required property var selectedLivePet
    required property var selectedResident
    required property bool selectedIsRoaming
    required property var stateSource
    required property string currentAnimState

    signal careRequested(act: string)
    signal evolvedCeremony()

    readonly property string speciesId: root.selectedConfig ? (root.selectedConfig.sprite ?? "") : ""
    readonly property var moodBadge: Fmt.moodWord(root.stateSource)
    readonly property var bellyBadge: Fmt.bellyWord(root.stateSource, root.speciesId)
    readonly property var energyBadge: Fmt.energyWord(root.stateSource, root.currentAnimState)
    readonly property bool isStuffed: Fmt.isStuffed(root.stateSource, root.speciesId)

    function _toneColor(tone: string): color {
        switch (tone) {
        case "love": return Theme.love;
        case "positive": return Theme.positive;
        case "warm": return Theme.warm;
        case "pokeball": return Theme.pokeball;
        case "lavender": return Theme.lavender;
        default: return Theme.accent;
        }
    }

    spacing: 8

    SanctuaryEvolutionCard {
        petId: root.selectedConfig ? root.selectedConfig.id : ""
        species: root.selectedConfig ? root.selectedConfig.sprite : ""
        livePet: root.selectedIsRoaming ? root.selectedLivePet : null
        resident: root.selectedResident
        onEvolved: root.evolvedCeremony()
    }

    Rectangle {
        Layout.fillWidth: true
        implicitHeight: dialogueTxt.implicitHeight + 18
        radius: Theme.radius(-3)
        color: Theme.parchment
        border.width: 1
        border.color: Theme.borderSubtle

        Text {
            id: dialogueTxt
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: 9
            wrapMode: Text.WordWrap
            text: Fmt.dialogueLine(
                root.selectedConfig ? root.selectedConfig.name : "",
                root.stateSource,
                root.selectedIsRoaming
            )
            color: Theme.text
            font.family: Theme.uiFont
            font.pixelSize: 12
            lineHeight: 1.24
        }
    }

    RowLayout {
        Layout.fillWidth: true
        spacing: 6

        Repeater {
            model: [
                { title: "Mood", info: root.moodBadge },
                { title: "Belly", info: root.bellyBadge },
                { title: "Energy", info: root.energyBadge }
            ]

            Rectangle {
                id: condCard
                required property var modelData
                readonly property color tint: root._toneColor(condCard.modelData.info.tone)
                readonly property string itemSprite: condCard.modelData.info.itemSprite || ""
                Layout.fillWidth: true
                implicitHeight: 40
                radius: Theme.radius(-5)
                color: Theme.parchment
                border.width: 1
                border.color: Theme.borderSubtle

                ColumnLayout {
                    anchors.centerIn: parent
                    spacing: 1

                    Text {
                        Layout.alignment: Qt.AlignHCenter
                        text: condCard.modelData.title
                        color: Theme.muted
                        font.family: Theme.uiFont
                        font.pixelSize: 10
                    }

                    RowLayout {
                        Layout.alignment: Qt.AlignHCenter
                        spacing: 4

                        Image {
                            visible: condCard.itemSprite.length > 0
                            Layout.preferredWidth: 14
                            Layout.preferredHeight: 14
                            smooth: false
                            source: condCard.itemSprite.length > 0
                                ? Qt.resolvedUrl("../assets/sanctuary/items/" + condCard.itemSprite)
                                : ""
                        }

                        UiIcon {
                            visible: condCard.itemSprite.length === 0
                            name: condCard.modelData.info.icon || ""
                            filled: condCard.modelData.info.icon === "heartFill"
                            size: 12
                            color: condCard.tint
                        }

                        Text {
                            text: condCard.modelData.info.label
                            color: Theme.text
                            font.family: Theme.uiFont
                            font.pixelSize: 11
                            font.weight: Font.DemiBold
                        }
                    }
                }
            }
        }
    }

    RowLayout {
        Layout.fillWidth: true
        spacing: 7

        Repeater {
            model: [
                { label: "Pet", icon: "paw", act: "pat", tint: Theme.love, muted: false },
                { label: root.isStuffed ? "Berry (Full)" : "Oran Berry", icon: "", act: "feed", tint: Theme.accent, muted: root.isStuffed },
                { label: "Play", icon: "spark", act: "play", tint: Theme.positive, muted: false }
            ]

            Item {
                id: treatBtn
                required property var modelData
                Layout.fillWidth: true
                implicitHeight: 50
                opacity: treatBtn.modelData.muted ? 0.68 : 1.0

                Rectangle {
                    anchors.fill: parent
                    anchors.topMargin: 2
                    radius: Theme.radius(-4)
                    color: Theme.borderSubtle
                }

                Rectangle {
                    anchors.fill: parent
                    anchors.bottomMargin: treatMouse.pressed ? 0 : 2
                    anchors.topMargin: treatMouse.pressed ? 2 : 0
                    radius: Theme.radius(-4)
                    color: treatMouse.containsMouse ? Theme.surfaceAlt : Theme.surface
                    border.width: 1
                    border.color: treatMouse.containsMouse ? treatBtn.modelData.tint : Theme.border
                    Behavior on color { ColorAnimation { duration: 110 } }

                    ColumnLayout {
                        anchors.centerIn: parent
                        spacing: 2

                        Image {
                            visible: treatBtn.modelData.act === "feed"
                            Layout.alignment: Qt.AlignHCenter
                            Layout.preferredWidth: 16
                            Layout.preferredHeight: 16
                            smooth: false
                            source: Qt.resolvedUrl("../assets/sanctuary/items/oran_berry.png")
                        }

                        UiIcon {
                            visible: treatBtn.modelData.act !== "feed"
                            Layout.alignment: Qt.AlignHCenter
                            name: treatBtn.modelData.icon
                            size: 15
                            color: treatBtn.modelData.tint
                        }

                        Text {
                            Layout.alignment: Qt.AlignHCenter
                            text: treatBtn.modelData.label
                            color: Theme.text
                            font.family: Theme.uiFont
                            font.pixelSize: 11
                            font.weight: Font.DemiBold
                        }
                    }
                }

                MouseArea {
                    id: treatMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.careRequested(treatBtn.modelData.act)
                }
            }
        }
    }

    Rectangle {
        Layout.fillWidth: true
        implicitHeight: routineCol.implicitHeight + 18
        radius: Theme.radius(-4)
        color: Theme.parchment
        border.width: 1
        border.color: Theme.borderSubtle

        ColumnLayout {
            id: routineCol
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: 9
            spacing: 6

            Text {
                text: "Daily Routine"
                color: Theme.subtext
                font.family: Theme.uiFont
                font.pixelSize: 11
                font.weight: Font.Medium
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 4

                Repeater {
                    model: [
                        { mode: "auto", label: "Free Roam", tip: "Naturally rotates between your desktop and the camp clearing" },
                        { mode: "always", label: "Stay Out", tip: "Keeps you company on your desktop until called back" },
                        { mode: "penned", label: "Camp Only", tip: "Relaxes here in the Sanctuary clearing until called out" }
                    ]

                    Rectangle {
                        id: routineChip
                        required property var modelData
                        readonly property bool active: root.selectedConfig !== null
                            && (root.selectedConfig.roamMode || "auto") === routineChip.modelData.mode
                        Layout.fillWidth: true
                        implicitHeight: 28
                        radius: Theme.radius(-7)
                        color: active
                            ? Theme.warmSoft
                            : (routineMouse.containsMouse ? Theme.surfaceAlt : Theme.surface)
                        border.width: 1
                        border.color: active ? Theme.warm : Theme.borderSubtle

                        Text {
                            anchors.centerIn: parent
                            text: routineChip.modelData.label
                            color: routineChip.active ? Theme.warm : Theme.subtext
                            font.family: Theme.uiFont
                            font.pixelSize: 11
                            font.weight: routineChip.active ? Font.DemiBold : Font.Normal
                        }

                        MouseArea {
                            id: routineMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                if (root.selectedConfig) {
                                    Config.updatePetRoamMode(root.selectedConfig.id, routineChip.modelData.mode);
                                }
                            }
                        }

                        UiTooltip {
                            active: routineMouse.containsMouse
                            text: routineChip.modelData.tip
                        }
                    }
                }
            }
        }
    }
}
