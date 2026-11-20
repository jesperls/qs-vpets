pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../config"
import "../services"
import "SpeciesProfile.js" as SpeciesProfile
import "ui/CompanionFormat.js" as Fmt

Rectangle {
    id: root

    required property var pet

    property int cardWidth: 268
    property int maxHeight: 420

    readonly property var resident: {
        void PetManager.residentRevision;
        const id = root.pet && root.pet.petData ? root.pet.petData.id : "";
        return id ? PetManager.residentFor(id) : null;
    }

    readonly property var bellyInfo: Fmt.bellyWord(root.pet, root.pet && root.pet.petData ? root.pet.petData.sprite : "")
    readonly property var energyInfo: Fmt.energyWord(root.pet, root.pet ? root.pet.state_ : "idle")
    Keys.onEscapePressed: PetManager.closeInspector()

    implicitWidth: cardWidth
    implicitHeight: Math.min(maxHeight, mainCol.implicitHeight + 26)
    width: implicitWidth
    height: implicitHeight
    radius: Theme.radius(2)
    color: Theme.panel
    border.width: 1
    border.color: Theme.border
    opacity: 0
    scale: 0.92

    Component.onCompleted: {
        opacity = 1.0;
        scale = 1.0;
    }

    Behavior on opacity { NumberAnimation { duration: Theme.animMs; easing.type: Easing.OutCubic } }
    Behavior on scale { NumberAnimation { duration: Theme.animMs; easing.type: Easing.OutBack } }

    Rectangle {
        visible: Theme.specularRim
        anchors.fill: parent
        anchors.margins: 3
        radius: Math.max(4, root.radius - 3)
        color: "transparent"
        border.width: 1
        border.color: Theme.alpha(Theme.rimHighlight, 0.55)
    }

    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
    }

    ColumnLayout {
        id: mainCol
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: 13
        spacing: 10

        RowLayout {
            Layout.fillWidth: true
            spacing: 8

            UiIcon {
                name: "pokeball"
                filled: true
                size: 16
                color: Theme.border
                accentColor: Theme.pokeball
            }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 0

                Text {
                    Layout.fillWidth: true
                    elide: Text.ElideRight
                    text: root.pet.petData.name
                    color: Theme.text
                    font.family: Theme.uiFont
                    font.pixelSize: 15
                    font.weight: Font.Bold
                }

                Text {
                    Layout.fillWidth: true
                    elide: Text.ElideRight
                    text: SpeciesProfile.profileFor(root.pet.petData.sprite).displayName
                    color: Theme.subtext
                    font.family: Theme.uiFont
                    font.pixelSize: 11
                }
            }

            PokemonHearts {
                bond: root.pet.bond
                heartSize: 12
            }

            Rectangle {
                implicitWidth: 24
                implicitHeight: 24
                radius: 12
                color: closeMouse.containsMouse ? Theme.surfaceAlt : "transparent"
                Behavior on color { ColorAnimation { duration: 110 } }

                UiIcon {
                    anchors.centerIn: parent
                    name: "close"
                    size: 11
                    color: closeMouse.containsMouse ? Theme.text : Theme.muted
                }

                MouseArea {
                    id: closeMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: PetManager.closeInspector()
                }
            }
        }

        // Classic warm Pokémon narration box
        Rectangle {
            Layout.fillWidth: true
            implicitHeight: narrationCol.implicitHeight + 18
            radius: Theme.radius(-4)
            color: Theme.parchment
            border.width: 1
            border.color: Theme.borderSubtle

            ColumnLayout {
                id: narrationCol
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                anchors.margins: 10
                spacing: 7

                Text {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    text: Fmt.dialogueLine(root.pet.petData.name, root.pet, true)
                    color: Theme.text
                    font.family: Theme.uiFont
                    font.pixelSize: 12
                    lineHeight: 1.24
                }

                Flow {
                    visible: root.bellyInfo.notable || root.energyInfo.notable
                    Layout.fillWidth: true
                    spacing: 6

                    Rectangle {
                        visible: root.bellyInfo.notable
                        implicitHeight: 20
                        implicitWidth: bellyRow.implicitWidth + 12
                        radius: 10
                        color: Theme.alpha(Theme.warm, 0.16)
                        border.width: 1
                        border.color: Theme.alpha(Theme.warm, 0.4)

                        RowLayout {
                            id: bellyRow
                            anchors.centerIn: parent
                            spacing: 4

                            Image {
                                Layout.preferredWidth: 14
                                Layout.preferredHeight: 14
                                smooth: false
                                source: Qt.resolvedUrl("../assets/sanctuary/items/oran_berry.png")
                            }

                            Text {
                                text: root.bellyInfo.label
                                color: Theme.warm
                                font.family: Theme.uiFont
                                font.pixelSize: 10
                                font.weight: Font.DemiBold
                            }
                        }
                    }

                    Rectangle {
                        visible: root.energyInfo.notable
                        implicitHeight: 20
                        implicitWidth: sleepRow.implicitWidth + 12
                        radius: 10
                        color: Theme.alpha(Theme.lavender, 0.16)
                        border.width: 1
                        border.color: Theme.alpha(Theme.lavender, 0.4)

                        RowLayout {
                            id: sleepRow
                            anchors.centerIn: parent
                            spacing: 4

                            UiIcon {
                                name: "moon"
                                size: 11
                                color: Theme.lavender
                            }

                            Text {
                                text: root.energyInfo.label
                                color: Theme.lavender
                                font.family: Theme.uiFont
                                font.pixelSize: 10
                                font.weight: Font.DemiBold
                            }
                        }
                    }
                }
            }
        }

        SanctuaryEvolutionCard {
            petId: root.pet.petData.id
            species: root.pet.petData.sprite
            livePet: root.pet
            resident: root.resident
        }

        // Tactile cushion care buttons
        RowLayout {
            Layout.fillWidth: true
            spacing: 6

            Repeater {
                model: {
                    const resting = root.pet.state_ === "loaf"
                        || root.pet.state_ === "laying"
                        || root.pet.state_ === "sit"
                        || root.pet.state_ === "deepsleep";
                    const stuffed = Fmt.isStuffed(root.pet, root.pet.petData ? root.pet.petData.sprite : "");
                    return [
                        { label: "Pet", icon: "paw", act: "pat", tint: Theme.love, muted: false },
                        { label: stuffed ? "Full" : "Berry", icon: "", act: "feed", tint: Theme.accent, muted: stuffed },
                        { label: "Play", icon: "spark", act: "play", tint: Theme.positive, muted: false },
                        { label: resting ? "Wake" : "Nap", icon: resting ? "sun" : "moon", act: "rest", tint: Theme.warm, muted: false }
                    ];
                }

                Item {
                    id: careWrap
                    required property var modelData
                    Layout.fillWidth: true
                    implicitHeight: 46
                    opacity: careWrap.modelData.muted ? 0.68 : 1.0

                    Rectangle {
                        anchors.fill: parent
                        anchors.topMargin: 2
                        radius: Theme.radius(-5)
                        color: Theme.borderSubtle
                    }

                    Rectangle {
                        anchors.fill: parent
                        anchors.bottomMargin: careArea.pressed ? 0 : 2
                        anchors.topMargin: careArea.pressed ? 2 : 0
                        radius: Theme.radius(-5)
                        color: careArea.containsMouse ? Theme.surfaceAlt : Theme.surface
                        border.width: 1
                        border.color: careArea.containsMouse ? careWrap.modelData.tint : Theme.border
                        Behavior on color { ColorAnimation { duration: 110 } }

                        ColumnLayout {
                            anchors.centerIn: parent
                            spacing: 3

                            Image {
                                visible: careWrap.modelData.act === "feed"
                                Layout.alignment: Qt.AlignHCenter
                                Layout.preferredWidth: 16
                                Layout.preferredHeight: 16
                                smooth: false
                                source: Qt.resolvedUrl("../assets/sanctuary/items/oran_berry.png")
                            }

                            UiIcon {
                                visible: careWrap.modelData.act !== "feed"
                                Layout.alignment: Qt.AlignHCenter
                                name: careWrap.modelData.icon
                                size: 14
                                color: careWrap.modelData.tint
                            }

                            Text {
                                Layout.alignment: Qt.AlignHCenter
                                text: careWrap.modelData.label
                                color: Theme.text
                                font.family: Theme.uiFont
                                font.pixelSize: 10
                                font.weight: Font.DemiBold
                            }
                        }
                    }

                    MouseArea {
                        id: careArea
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            const a = careWrap.modelData.act;
                            if (a === "pat") root.pet.onStroked();
                            else if (a === "feed") root.pet.onFed();
                            else if (a === "play") root.pet.onPlayTriggered();
                            else if (a === "rest") root.pet.toggleRest();
                        }
                    }
                }
            }
        }

        // Quiet Camp & Recall bar
        RowLayout {
            Layout.fillWidth: true
            spacing: 6

            Rectangle {
                Layout.fillWidth: true
                implicitHeight: 30
                radius: Theme.radius(-6)
                color: campArea.containsMouse ? Theme.surfaceAlt : Theme.surface
                border.width: 1
                border.color: campArea.containsMouse ? Theme.warm : Theme.borderSubtle
                Behavior on color { ColorAnimation { duration: 110 } }

                RowLayout {
                    anchors.centerIn: parent
                    spacing: 6

                    UiIcon {
                        name: "lantern"
                        size: 13
                        color: Theme.warm
                    }

                    Text {
                        text: "Visit Sanctuary"
                        color: Theme.text
                        font.family: Theme.uiFont
                        font.pixelSize: 11
                        font.weight: Font.DemiBold
                    }
                }

                MouseArea {
                    id: campArea
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: PetManager.openPen(root.pet.petData.id)
                }
            }

            Rectangle {
                implicitHeight: 30
                implicitWidth: recallRow.implicitWidth + 16
                radius: Theme.radius(-6)
                color: recallArea.containsMouse ? Theme.pokeballSoft : Theme.surface
                border.width: 1
                border.color: recallArea.containsMouse ? Theme.pokeball : Theme.borderSubtle
                Behavior on color { ColorAnimation { duration: 110 } }

                RowLayout {
                    id: recallRow
                    anchors.centerIn: parent
                    spacing: 5

                    UiIcon {
                        name: "pokeball"
                        size: 12
                        color: recallArea.containsMouse ? Theme.pokeball : Theme.subtext
                    }

                    Text {
                        text: "Return"
                        color: recallArea.containsMouse ? Theme.text : Theme.subtext
                        font.family: Theme.uiFont
                        font.pixelSize: 11
                        font.weight: Font.Medium
                    }
                }

                MouseArea {
                    id: recallArea
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                        const id = root.pet.petData.id;
                        PetManager.closeInspector();
                        PetManager.sendToPenNow(id, true);
                    }
                }

                UiTooltip {
                    active: recallArea.containsMouse
                    text: "Send back to rest in the Sanctuary clearing"
                }
            }
        }
    }
}
