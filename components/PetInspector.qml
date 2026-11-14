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

    property int cardWidth: 324
    property int maxHeight: 640
    property int activeTab: 0
    property bool spawnExpanded: false

    readonly property var resident: {
        void PetManager.residentRevision;
        const id = root.pet && root.pet.petData ? root.pet.petData.id : "";
        return id ? PetManager.residentFor(id) : null;
    }

    implicitWidth: cardWidth
    implicitHeight: Math.min(maxHeight, mainCol.implicitHeight + 28)
    width: implicitWidth
    height: implicitHeight
    radius: Theme.radius(0)
    color: Theme.bg
    border.width: 1
    border.color: Theme.border
    opacity: 0
    scale: 0.96

    Component.onCompleted: {
        opacity = 1.0;
        scale = 1.0;
    }

    Behavior on opacity { NumberAnimation { duration: Theme.animMs; easing.type: Easing.OutCubic } }
    Behavior on scale { NumberAnimation { duration: Theme.animMs; easing.type: Easing.OutCubic } }

    Rectangle {
        visible: Theme.specularRim
        anchors.top: parent.top
        anchors.topMargin: 1
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.leftMargin: root.radius
        anchors.rightMargin: root.radius
        height: 1
        color: Theme.rimHighlight
    }

    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
    }

    Flickable {
        id: bodyFlick
        anchors.fill: parent
        anchors.margins: 14
        clip: true
        contentWidth: width
        contentHeight: mainCol.implicitHeight
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height

        ColumnLayout {
            id: mainCol
            width: bodyFlick.width
            spacing: 10

            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 2

                    RowLayout {
                        spacing: 7
                        Text {
                            text: root.pet.petData.name
                            color: Theme.text
                            font.family: Theme.uiFont
                            font.pixelSize: 15
                            font.weight: Font.Bold
                        }
                        Rectangle {
                            radius: Theme.radius(-8)
                            color: Theme.alpha(Theme.accent, 0.14)
                            border.width: 1
                            border.color: Theme.alpha(Theme.accent, 0.28)
                            implicitWidth: speciesRow.implicitWidth + 12
                            implicitHeight: 20

                            RowLayout {
                                id: speciesRow
                                anchors.centerIn: parent
                                spacing: 5

                                Text {
                                    text: SpeciesProfile.profileFor(root.pet.petData.sprite).displayName
                                    color: Theme.accent
                                    font.family: Theme.uiFont
                                    font.pixelSize: 10
                                    font.weight: Font.DemiBold
                                }
                                Text {
                                    text: Fmt.formatAge(root.pet.ageSeconds)
                                    color: Theme.subtext
                                    font.family: Theme.monoFont
                                    font.pixelSize: 10
                                }
                            }
                        }
                    }

                    Text {
                        text: root.pet.archetype || "Curious Hatchling"
                        color: Theme.warm
                        font.family: Theme.uiFont
                        font.pixelSize: 11
                        font.weight: Font.Medium
                    }
                }

                Rectangle {
                    implicitHeight: 26
                    radius: Theme.radius(-7)
                    implicitWidth: penBtnRow.implicitWidth + 14
                    color: penBtnMouse.containsMouse ? Theme.accentSoft : Theme.surface
                    border.width: 1
                    border.color: penBtnMouse.containsMouse ? Theme.accent : Theme.borderSubtle
                    Behavior on color { ColorAnimation { duration: 120 } }

                    RowLayout {
                        id: penBtnRow
                        anchors.centerIn: parent
                        spacing: 5
                        UiIcon {
                            name: "sanctuary"
                            size: 12
                            color: Theme.accent
                        }
                        Text {
                            text: "Sanctuary"
                            color: Theme.accent
                            font.family: Theme.uiFont
                            font.pixelSize: 11
                            font.weight: Font.DemiBold
                        }
                    }

                    MouseArea {
                        id: penBtnMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: PetManager.openPen(root.pet.petData.id)
                    }
                }

                Rectangle {
                    implicitWidth: 26
                    implicitHeight: 26
                    radius: Theme.radius(-7)
                    color: closeMouse.containsMouse ? Theme.surfaceAlt : Theme.surface
                    border.width: 1
                    border.color: closeMouse.containsMouse ? Theme.border : Theme.borderSubtle
                    Behavior on color { ColorAnimation { duration: 120 } }

                    UiIcon {
                        anchors.centerIn: parent
                        name: "close"
                        size: 12
                        color: closeMouse.containsMouse ? Theme.text : Theme.subtext
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

            Rectangle {
                Layout.fillWidth: true
                radius: Theme.radius(-5)
                color: Theme.surface
                border.width: 1
                border.color: Theme.borderSubtle
                implicitHeight: mindCol.implicitHeight + 16

                ColumnLayout {
                    id: mindCol
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.top: parent.top
                    anchors.margins: 8
                    spacing: 4

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 6

                        Rectangle {
                            implicitWidth: 6
                            implicitHeight: 6
                            radius: 3
                            color: root.pet.state_ === "deepsleep" || root.pet.state_ === "loaf" || root.pet.state_ === "sit"
                                ? Theme.warm
                                : Theme.positive
                        }

                        Text {
                            Layout.fillWidth: true
                            elide: Text.ElideRight
                            text: {
                                const plan = root.pet.activePlan;
                                const step = root.pet.intention?.stepLabel ?? "";
                                if (plan) return plan.label + (step ? (" · " + step) : "");
                                if (root.pet.state_ === "deepsleep") return "Sleeping & consolidating dreams";
                                if (root.pet.state_ === "loaf" || root.pet.state_ === "sit") return "Loafing quietly";
                                return "Observing the desktop";
                            }
                            color: Theme.text
                            font.family: Theme.uiFont
                            font.pixelSize: 11
                            font.weight: Font.DemiBold
                        }
                    }

                    Text {
                        Layout.fillWidth: true
                        wrapMode: Text.WordWrap
                        text: root.pet.lastThoughtText || "Observing the desktop"
                        color: Theme.subtext
                        font.family: Theme.uiFont
                        font.pixelSize: 11
                    }
                }
            }

            SanctuaryEvolutionCard {
                petId: root.pet.petData.id
                species: root.pet.petData.sprite
                livePet: root.pet
                resident: root.resident
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 6

                Repeater {
                    model: {
                        const resting = root.pet.state_ === "loaf" || root.pet.state_ === "sit" || root.pet.state_ === "deepsleep";
                        return [
                            { label: "Pat", icon: "heart", act: "pat", tint: Theme.love },
                            { label: "Snack", icon: "berry", act: "feed", tint: Theme.positive },
                            { label: "Play", icon: "spark", act: "play", tint: Theme.accent },
                            { label: resting ? "Wake" : "Rest", icon: resting ? "sun" : "moon", act: "rest", tint: Theme.warm }
                        ];
                    }

                    Rectangle {
                        id: actionChip
                        required property var modelData
                        Layout.fillWidth: true
                        implicitHeight: 28
                        radius: Theme.radius(-7)
                        color: chipArea.containsMouse ? Theme.surfaceAlt : Theme.surface
                        border.width: 1
                        border.color: chipArea.containsMouse ? actionChip.modelData.tint : Theme.borderSubtle
                        Behavior on color { ColorAnimation { duration: 120 } }

                        RowLayout {
                            anchors.centerIn: parent
                            spacing: 5

                            UiIcon {
                                name: actionChip.modelData.icon
                                size: 12
                                color: chipArea.containsMouse ? actionChip.modelData.tint : Theme.subtext
                            }

                            Text {
                                text: actionChip.modelData.label
                                color: Theme.text
                                font.family: Theme.uiFont
                                font.pixelSize: 11
                                font.weight: Font.Medium
                            }
                        }

                        MouseArea {
                            id: chipArea
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                const a = actionChip.modelData.act;
                                if (a === "pat") root.pet.onStroked();
                                else if (a === "feed") root.pet.onFed();
                                else if (a === "play") root.pet.onPlayTriggered();
                                else if (a === "rest") root.pet.toggleRest();
                            }
                        }
                    }
                }
            }

            Rectangle {
                Layout.fillWidth: true
                implicitHeight: 28
                radius: Theme.radius(-6)
                color: Theme.surface
                border.width: 1
                border.color: Theme.borderSubtle

                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 2
                    spacing: 2

                    Repeater {
                        model: ["State", "Character", "Manage"]

                        Rectangle {
                            id: tabBtn
                            required property string modelData
                            required property int index
                            readonly property bool active: root.activeTab === tabBtn.index
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            radius: Theme.radius(-8)
                            color: active ? Theme.surfaceAlt : (tabArea.containsMouse ? Theme.alpha(Theme.surfaceAlt, 0.5) : "transparent")
                            border.width: active ? 1 : 0
                            border.color: Theme.alpha(Theme.accent, 0.45)
                            Behavior on color { ColorAnimation { duration: 120 } }

                            Text {
                                anchors.centerIn: parent
                                text: tabBtn.modelData
                                color: tabBtn.active ? Theme.text : Theme.subtext
                                font.family: Theme.uiFont
                                font.pixelSize: 11
                                font.weight: tabBtn.active ? Font.DemiBold : Font.Normal
                            }

                            MouseArea {
                                id: tabArea
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: root.activeTab = tabBtn.index
                            }
                        }
                    }
                }
            }

            SanctuaryVitalsPanel {
                visible: root.activeTab === 0
                Layout.fillWidth: true
                showHeader: false
                livePet: root.pet
                resident: root.resident
                maxNotes: 4
                labelWidth: 62
            }

            SanctuarySoulPanel {
                visible: root.activeTab === 1
                Layout.fillWidth: true
                livePet: root.pet
                resident: root.resident
                maxMilestones: 3
                labelWidth: 70
                onSelectPeerRequested: peerId => PetManager.openPen(peerId)
            }

            ColumnLayout {
                id: manageCol
                visible: root.activeTab === 2
                Layout.fillWidth: true
                spacing: 8

                UiSectionHeader {
                    title: "SPECIES FORM"
                }

                Loader {
                    active: root.activeTab === 2
                    visible: active
                    Layout.fillWidth: true

                    sourceComponent: Flow {
                        width: manageCol.width
                        spacing: 4

                        Repeater {
                            model: Config.speciesList

                            Rectangle {
                                id: spChip
                                required property string modelData
                                readonly property bool current: root.pet.petData.sprite === spChip.modelData
                                radius: Theme.radius(-8)
                                color: current ? Theme.accentSoft : (spMouse.containsMouse ? Theme.surfaceAlt : Theme.surface)
                                border.width: 1
                                border.color: current ? Theme.accent : Theme.borderSubtle
                                implicitWidth: spLabel.implicitWidth + 10
                                implicitHeight: 22

                                Text {
                                    id: spLabel
                                    anchors.centerIn: parent
                                    text: SpeciesProfile.profileFor(spChip.modelData).displayName
                                    color: spChip.current ? Theme.accent : Theme.text
                                    font.family: Theme.uiFont
                                    font.pixelSize: 10
                                    font.weight: spChip.current ? Font.DemiBold : Font.Normal
                                }

                                MouseArea {
                                    id: spMouse
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: PetManager.morphCompanion(root.pet.petData.id, spChip.modelData)
                                }
                            }
                        }
                    }
                }

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 6

                    Text {
                        text: "Scale"
                        color: Theme.subtext
                        font.family: Theme.uiFont
                        font.pixelSize: 11
                    }

                    Item { Layout.fillWidth: true }

                    Repeater {
                        model: [1, 2, 3, 4]

                        Rectangle {
                            id: scBtn
                            required property int modelData
                            readonly property bool cur: (root.pet.petData.scale ?? 2) === scBtn.modelData
                            implicitWidth: 32
                            implicitHeight: 24
                            radius: Theme.radius(-8)
                            color: cur ? Theme.accentSoft : (scMouse.containsMouse ? Theme.surfaceAlt : Theme.surface)
                            border.width: 1
                            border.color: cur ? Theme.accent : Theme.borderSubtle

                            Text {
                                anchors.centerIn: parent
                                text: scBtn.modelData + "×"
                                color: scBtn.cur ? Theme.accent : Theme.text
                                font.family: Theme.monoFont
                                font.pixelSize: 10
                                font.bold: scBtn.cur
                            }

                            MouseArea {
                                id: scMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: Config.updatePetScale(root.pet.petData.id, scBtn.modelData)
                            }
                        }
                    }
                }

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 5

                    Repeater {
                        model: [
                            { label: "Emotes", on: Config.showEmotes, key: "emotes" },
                            { label: "Perch", on: Config.enablePerching, key: "perch" },
                            { label: "Music", on: Config.enableMusicReact, key: "music" }
                        ]

                        Rectangle {
                            id: togChip
                            required property var modelData
                            Layout.fillWidth: true
                            implicitHeight: 26
                            radius: Theme.radius(-8)
                            color: togChip.modelData.on ? Theme.accentSoft : Theme.surface
                            border.width: 1
                            border.color: togChip.modelData.on ? Theme.accent : Theme.borderSubtle

                            RowLayout {
                                anchors.centerIn: parent
                                spacing: 5

                                Rectangle {
                                    implicitWidth: 6
                                    implicitHeight: 6
                                    radius: 3
                                    color: togChip.modelData.on ? Theme.accent : Theme.muted
                                }

                                Text {
                                    text: togChip.modelData.label
                                    color: togChip.modelData.on ? Theme.text : Theme.subtext
                                    font.family: Theme.uiFont
                                    font.pixelSize: 10
                                    font.weight: togChip.modelData.on ? Font.DemiBold : Font.Normal
                                }
                            }

                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    const k = togChip.modelData.key;
                                    if (k === "emotes") Config.showEmotes = !Config.showEmotes;
                                    else if (k === "perch") Config.enablePerching = !Config.enablePerching;
                                    else if (k === "music") Config.enableMusicReact = !Config.enableMusicReact;
                                    Config.save();
                                }
                            }
                        }
                    }
                }

                Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: 28
                    radius: Theme.radius(-7)
                    color: tuckMouse.containsMouse ? Theme.alpha(Theme.warm, 0.16) : Theme.surface
                    border.width: 1
                    border.color: Theme.alpha(Theme.warm, 0.55)

                    Text {
                        anchors.centerIn: parent
                        text: "Walk Off to Sanctuary"
                        color: Theme.warm
                        font.family: Theme.uiFont
                        font.pixelSize: 11
                        font.weight: Font.Medium
                    }

                    MouseArea {
                        id: tuckMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            const id = root.pet.petData.id;
                            PetManager.closeInspector();
                            PetManager.sendToPenNow(id, true);
                        }
                    }
                }

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 6

                    Rectangle {
                        Layout.fillWidth: true
                        implicitHeight: 28
                        radius: Theme.radius(-7)
                        color: adoptToggleArea.containsMouse ? Theme.accentSoft : Theme.surfaceAlt
                        border.width: 1
                        border.color: Theme.alpha(Theme.accent, 0.55)

                        RowLayout {
                            anchors.centerIn: parent
                            spacing: 5

                            UiIcon {
                                name: root.spawnExpanded ? "chevronDown" : "plus"
                                size: 11
                                color: Theme.accent
                            }

                            Text {
                                text: root.spawnExpanded ? "Hide Species List" : "Quick Adopt"
                                color: Theme.accent
                                font.family: Theme.uiFont
                                font.pixelSize: 11
                                font.weight: Font.DemiBold
                            }
                        }

                        MouseArea {
                            id: adoptToggleArea
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.spawnExpanded = !root.spawnExpanded
                        }
                    }

                    SanctuaryConfirmReleaseButton {
                        petId: root.pet.petData.id
                        label: "Release"
                        confirmLabel: "Confirm?"
                        idleColor: Theme.surface
                        onReleased: PetManager.closeInspector()
                    }
                }

                Loader {
                    active: root.spawnExpanded
                    visible: active
                    Layout.fillWidth: true

                    sourceComponent: Flow {
                        width: manageCol.width
                        spacing: 4

                        Repeater {
                            model: Config.speciesList

                            Rectangle {
                                id: adoptChip
                                required property string modelData
                                radius: Theme.radius(-8)
                                color: adoptChipArea.containsMouse ? Theme.alpha(Theme.positive, 0.16) : Theme.surface
                                border.width: 1
                                border.color: Theme.alpha(Theme.positive, 0.45)
                                implicitWidth: adoptTxt.implicitWidth + 10
                                implicitHeight: 22

                                Text {
                                    id: adoptTxt
                                    anchors.centerIn: parent
                                    text: SpeciesProfile.profileFor(adoptChip.modelData).displayName
                                    color: Theme.positive
                                    font.family: Theme.uiFont
                                    font.pixelSize: 10
                                }

                                MouseArea {
                                    id: adoptChipArea
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: {
                                        Config.addPet(adoptChip.modelData, "", "");
                                        root.spawnExpanded = false;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
