pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../config"
import "../services"
import "ai/Personality.js" as Personality

Rectangle {
    id: root

    required property var pet

    property int cardWidth: 300
    property int maxHeight: 620
    property int activeTab: 0
    property bool spawnExpanded: false

    implicitWidth: cardWidth
    implicitHeight: Math.min(maxHeight, mainCol.implicitHeight + 24)
    width: implicitWidth
    height: implicitHeight
    radius: 14
    color: Theme.bg
    border.width: 1
    border.color: Theme.border

    function formatAge(sec: real): string {
        const s = Math.max(0, Math.floor(sec || 0));
        if (s < 3600) return Math.max(1, Math.floor(s / 60)) + "m";
        if (s < 86400) return Math.floor(s / 3600) + "h";
        return Math.floor(s / 86400) + "d " + Math.floor((s % 86400) / 3600) + "h";
    }

    // Swallow clicks on the card background so they don't fall through.
    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
    }

    Flickable {
        id: bodyFlick
        anchors.fill: parent
        anchors.margins: 12
        clip: true
        contentWidth: width
        contentHeight: mainCol.implicitHeight
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height

        ColumnLayout {
            id: mainCol
            width: bodyFlick.width
            spacing: 9

        // Header: Name, species, archetype, age, close button
        RowLayout {
            Layout.fillWidth: true
            spacing: 8

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2

                RowLayout {
                    spacing: 6
                    Text {
                        text: root.pet.petData.name
                        color: Theme.text
                        font.family: Theme.fontFamily
                        font.pixelSize: 14
                        font.bold: true
                    }
                    Rectangle {
                        radius: 6
                        color: Theme.accentSoft
                        implicitWidth: speciesTxt.implicitWidth + 10
                        implicitHeight: 18
                        Text {
                            id: speciesTxt
                            anchors.centerIn: parent
                            text: root.pet.petData.sprite + " · " + root.formatAge(root.pet.ageSeconds)
                            color: Theme.accent
                            font.family: Theme.fontFamily
                            font.pixelSize: 10
                        }
                    }
                }

                Text {
                    text: root.pet.archetype || "Curious Hatchling"
                    color: Theme.warm
                    font.family: Theme.fontFamily
                    font.pixelSize: 11
                }
            }

            Rectangle {
                implicitHeight: 24
                radius: 7
                implicitWidth: penBtnTxt.implicitWidth + 12
                color: penBtnMouse.containsMouse ? Theme.accentSoft : Theme.surface
                border.width: 1
                border.color: penBtnMouse.containsMouse ? Theme.accent : Theme.border
                Text {
                    id: penBtnTxt
                    anchors.centerIn: parent
                    text: "⌂ Pen"
                    color: Theme.accent
                    font.family: Theme.fontFamily
                    font.pixelSize: 10
                    font.bold: true
                }
                MouseArea {
                    id: penBtnMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    onClicked: PetManager.openPen(root.pet.petData.id)
                }
            }

            Rectangle {
                implicitWidth: 24
                implicitHeight: 24
                radius: 7
                color: closeMouse.containsMouse ? Theme.surfaceAlt : Theme.surface
                Text {
                    anchors.centerIn: parent
                    text: "×"
                    color: Theme.subtext
                    font.family: Theme.fontFamily
                    font.pixelSize: 14
                    font.bold: true
                }
                MouseArea {
                    id: closeMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    onClicked: PetManager.closeInspector()
                }
            }
        }

        // Live Mind: Current Plan + Thought Monologue
        Rectangle {
            Layout.fillWidth: true
            radius: 9
            color: Theme.surface
            border.width: 1
            border.color: Theme.border
            implicitHeight: mindCol.implicitHeight + 14

            ColumnLayout {
                id: mindCol
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                anchors.margins: 7
                spacing: 3

                Text {
                    Layout.fillWidth: true
                    elide: Text.ElideRight
                    text: {
                        const plan = root.pet.activePlan;
                        const step = root.pet.intention?.stepLabel ?? "";
                        if (plan) return "▸ " + plan.label + (step ? (" · " + step) : "");
                        if (root.pet.state_ === "deepsleep") return "▸ Sleeping & consolidating dreams";
                        if (root.pet.state_ === "loaf" || root.pet.state_ === "sit") return "▸ Loafing & resting quietly";
                        return "▸ Observing desktop";
                    }
                    color: Theme.accent
                    font.family: Theme.fontFamily
                    font.pixelSize: 10
                    font.bold: true
                }

                Text {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    text: root.pet.lastThoughtText || "Observing the desktop"
                    color: Theme.subtext
                    font.family: Theme.fontFamily
                    font.pixelSize: 10
                }
            }
        }

        // Quick Interaction Bar
        RowLayout {
            Layout.fillWidth: true
            spacing: 5

            Repeater {
                model: [
                    { label: "♥ Pat", act: "pat" },
                    { label: "🍎 Snack", act: "feed" },
                    { label: "✦ Play", act: "play" },
                    { label: (root.pet.state_ === "loaf" || root.pet.state_ === "sit" || root.pet.state_ === "deepsleep") ? "☀ Wake" : "☾ Nap", act: "rest" }
                ]

                Rectangle {
                    id: actionChip
                    required property var modelData
                    Layout.fillWidth: true
                    implicitHeight: 26
                    radius: 7
                    color: chipArea.containsMouse ? Theme.accentSoft : Theme.surface
                    border.width: 1
                    border.color: chipArea.containsMouse ? Theme.accent : Theme.border

                    Text {
                        anchors.centerIn: parent
                        text: actionChip.modelData.label
                        color: Theme.text
                        font.family: Theme.fontFamily
                        font.pixelSize: 10
                    }

                    MouseArea {
                        id: chipArea
                        anchors.fill: parent
                        hoverEnabled: true
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

        // Tab Switcher
        RowLayout {
            Layout.fillWidth: true
            spacing: 5

            Repeater {
                model: ["Mind", "Soul", "Party"]

                Rectangle {
                    id: tabBtn
                    required property string modelData
                    required property int index
                    Layout.fillWidth: true
                    implicitHeight: 24
                    radius: 6
                    color: root.activeTab === tabBtn.index ? Theme.accentSoft : "transparent"
                    border.width: 1
                    border.color: root.activeTab === tabBtn.index ? Theme.accent : Theme.border

                    Text {
                        anchors.centerIn: parent
                        text: tabBtn.modelData
                        color: root.activeTab === tabBtn.index ? Theme.accent : Theme.subtext
                        font.family: Theme.fontFamily
                        font.pixelSize: 10
                        font.bold: root.activeTab === tabBtn.index
                    }

                    MouseArea {
                        anchors.fill: parent
                        onClicked: root.activeTab = tabBtn.index
                    }
                }
            }
        }

        // Tab 0: Mind (Drives, Bond/Trust, Recent Thoughts)
        ColumnLayout {
            visible: root.activeTab === 0
            Layout.fillWidth: true
            spacing: 5

            Repeater {
                model: [
                    { name: "Mood", val: root.pet.mood, tint: Theme.positive },
                    { name: "Bond", val: root.pet.bond, tint: Theme.love },
                    { name: "Trust", val: root.pet.trust, tint: Theme.accent },
                    { name: "Energy", val: 1.0 - root.pet.restDrive, tint: Theme.warm },
                    { name: "Curiosity", val: root.pet.exploreDrive, tint: Theme.accent },
                    { name: "Social", val: root.pet.socialDrive, tint: Theme.love },
                    { name: "Play", val: root.pet.playDrive, tint: Theme.positive }
                ]

                RowLayout {
                    id: driveRow
                    required property var modelData
                    Layout.fillWidth: true
                    spacing: 6

                    Text {
                        Layout.preferredWidth: 62
                        text: driveRow.modelData.name
                        color: Theme.subtext
                        font.family: Theme.fontFamily
                        font.pixelSize: 10
                    }

                    Rectangle {
                        Layout.fillWidth: true
                        implicitHeight: 7
                        radius: 4
                        color: Theme.surface

                        Rectangle {
                            width: parent.width * Math.max(0.03, Math.min(1, driveRow.modelData.val))
                            height: parent.height
                            radius: 4
                            color: driveRow.modelData.tint
                        }
                    }

                    Text {
                        Layout.preferredWidth: 28
                        horizontalAlignment: Text.AlignRight
                        text: Math.round((driveRow.modelData.val || 0) * 100) + "%"
                        color: Theme.text
                        font.family: Theme.fontFamily
                        font.pixelSize: 9
                    }
                }
            }

            Rectangle {
                Layout.fillWidth: true
                implicitHeight: 1
                color: Theme.border
                opacity: 0.5
            }

            Text {
                text: "Recent Behavior"
                color: Theme.subtext
                font.family: Theme.fontFamily
                font.pixelSize: 9
                font.bold: true
            }

            Repeater {
                model: (root.pet.thoughts || []).slice(-4).reverse()

                Text {
                    id: monoLine
                    required property var modelData
                    Layout.fillWidth: true
                    elide: Text.ElideRight
                    text: "· " + (monoLine.modelData.text || "")
                    color: Theme.text
                    font.family: Theme.fontFamily
                    font.pixelSize: 9
                }
            }
        }

        // Tab 1: Soul (8 Developmental Traits + Earned Quirks + Social Bonds)
        ColumnLayout {
            visible: root.activeTab === 1
            Layout.fillWidth: true
            spacing: 5

            Repeater {
                model: Personality.TRAIT_KEYS

                RowLayout {
                    id: traitRow
                    required property string modelData
                    readonly property real eff: root.pet.personality[traitRow.modelData] ?? 0.5
                    readonly property real baseVal: root.pet.basePersonality[traitRow.modelData] ?? 0.5
                    readonly property int deltaPct: Math.round((eff - baseVal) * 100)
                    Layout.fillWidth: true
                    spacing: 6

                    Text {
                        Layout.preferredWidth: 68
                        text: Personality.TRAIT_LABELS[traitRow.modelData] || traitRow.modelData
                        color: Theme.subtext
                        font.family: Theme.fontFamily
                        font.pixelSize: 10
                    }

                    Rectangle {
                        Layout.fillWidth: true
                        implicitHeight: 7
                        radius: 4
                        color: Theme.surface

                        Rectangle {
                            width: parent.width * Math.max(0.03, Math.min(1, traitRow.eff))
                            height: parent.height
                            radius: 4
                            color: Theme.accent
                        }
                    }

                    Text {
                        Layout.preferredWidth: 52
                        horizontalAlignment: Text.AlignRight
                        text: Math.round(traitRow.eff * 100)
                            + (traitRow.deltaPct !== 0 ? (" (" + (traitRow.deltaPct > 0 ? "+" : "") + traitRow.deltaPct + ")") : "")
                        color: traitRow.deltaPct > 0 ? Theme.positive : (traitRow.deltaPct < 0 ? Theme.warm : Theme.subtext)
                        font.family: Theme.fontFamily
                        font.pixelSize: 9
                    }
                }
            }

            Text {
                text: (root.pet.quirks && root.pet.quirks.length > 0)
                    ? "Earned Habits"
                    : "Earned Habits (develops through sleep & life)"
                color: Theme.subtext
                font.family: Theme.fontFamily
                font.pixelSize: 9
                font.bold: true
            }

            Flow {
                Layout.fillWidth: true
                spacing: 5

                Repeater {
                    model: root.pet.quirks || []

                    Rectangle {
                        id: quirkBadge
                        required property string modelData
                        readonly property var def: Personality.QUIRK_DEFS[quirkBadge.modelData]
                        radius: 6
                        color: Theme.surfaceAlt
                        border.width: 1
                        border.color: Theme.accent
                        implicitWidth: qTxt.implicitWidth + 12
                        implicitHeight: 20

                        Text {
                            id: qTxt
                            anchors.centerIn: parent
                            text: (quirkBadge.def ? (quirkBadge.def.icon + " " + quirkBadge.def.label) : quirkBadge.modelData)
                            color: Theme.text
                            font.family: Theme.fontFamily
                            font.pixelSize: 9
                        }
                    }
                }
            }

            Repeater {
                model: Object.keys(root.pet.relationships || {})

                RowLayout {
                    id: relRow
                    required property string modelData
                    readonly property var rel: root.pet.relationships[relRow.modelData]
                    Layout.fillWidth: true
                    spacing: 6

                    Text {
                        Layout.fillWidth: true
                        text: "🐾 " + relRow.modelData + " · " + Personality.relationshipTag(relRow.rel)
                        color: Theme.text
                        font.family: Theme.fontFamily
                        font.pixelSize: 9
                    }

                    Text {
                        readonly property real aff: (relRow.rel && relRow.rel.affinity !== undefined) ? relRow.rel.affinity : 0.5
                        text: Math.round(aff * 100) + "%"
                        color: aff < 0.35 ? Theme.danger : (aff < 0.52 ? Theme.warm : Theme.love)
                        font.family: Theme.fontFamily
                        font.pixelSize: 9
                    }
                }
            }

            Text {
                visible: (root.pet.journal || []).length > 0
                text: "Milestones"
                color: Theme.subtext
                font.family: Theme.fontFamily
                font.pixelSize: 9
                font.bold: true
            }

            Repeater {
                model: (root.pet.journal || []).slice(-3).reverse()

                Text {
                    id: journalLine
                    required property var modelData
                    Layout.fillWidth: true
                    elide: Text.ElideRight
                    text: "· " + (journalLine.modelData.text || "")
                    color: Theme.subtext
                    font.family: Theme.fontFamily
                    font.pixelSize: 9
                }
            }
        }

        // Tab 2: Party & Preferences
        ColumnLayout {
            visible: root.activeTab === 2
            Layout.fillWidth: true
            spacing: 7

            Text {
                text: "Morph Species"
                color: Theme.subtext
                font.family: Theme.fontFamily
                font.pixelSize: 9
                font.bold: true
            }

            Flow {
                Layout.fillWidth: true
                spacing: 4

                Repeater {
                    model: Config.speciesList

                    Rectangle {
                        id: spChip
                        required property string modelData
                        readonly property bool current: root.pet.petData.sprite === spChip.modelData
                        radius: 6
                        color: current ? Theme.accentSoft : Theme.surface
                        border.width: 1
                        border.color: current ? Theme.accent : Theme.border
                        implicitWidth: spLabel.implicitWidth + 10
                        implicitHeight: 20

                        Text {
                            id: spLabel
                            anchors.centerIn: parent
                            text: spChip.modelData
                            color: spChip.current ? Theme.accent : Theme.text
                            font.family: Theme.fontFamily
                            font.pixelSize: 9
                        }

                        MouseArea {
                            anchors.fill: parent
                            onClicked: Config.updatePetSpecies(root.pet.petData.name, spChip.modelData)
                        }
                    }
                }
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 5

                Text {
                    text: "Scale:"
                    color: Theme.subtext
                    font.family: Theme.fontFamily
                    font.pixelSize: 10
                }

                Repeater {
                    model: [1, 2, 3, 4]

                    Rectangle {
                        id: scBtn
                        required property int modelData
                        implicitWidth: 28
                        implicitHeight: 22
                        radius: 6
                        color: (root.pet.petData.scale ?? 2) === scBtn.modelData ? Theme.accentSoft : Theme.surface
                        border.width: 1
                        border.color: (root.pet.petData.scale ?? 2) === scBtn.modelData ? Theme.accent : Theme.border

                        Text {
                            anchors.centerIn: parent
                            text: scBtn.modelData + "x"
                            color: Theme.text
                            font.family: Theme.fontFamily
                            font.pixelSize: 9
                        }

                        MouseArea {
                            anchors.fill: parent
                            onClicked: Config.updatePetScale(root.pet.petData.name, scBtn.modelData)
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
                        implicitHeight: 22
                        radius: 6
                        color: togChip.modelData.on ? Theme.accentSoft : Theme.surface
                        border.width: 1
                        border.color: togChip.modelData.on ? Theme.accent : Theme.border

                        Text {
                            anchors.centerIn: parent
                            text: (togChip.modelData.on ? "✓ " : "○ ") + togChip.modelData.label
                            color: Theme.text
                            font.family: Theme.fontFamily
                            font.pixelSize: 9
                        }

                        MouseArea {
                            anchors.fill: parent
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
                implicitHeight: 24
                radius: 7
                color: Theme.surface
                border.width: 1
                border.color: Theme.warm

                Text {
                    anchors.centerIn: parent
                    text: "⌂ Tuck into Sanctuary Pen"
                    color: Theme.warm
                    font.family: Theme.fontFamily
                    font.pixelSize: 10
                }

                MouseArea {
                    anchors.fill: parent
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
                    implicitHeight: 24
                    radius: 7
                    color: Theme.surfaceAlt
                    border.width: 1
                    border.color: Theme.accent

                    Text {
                        anchors.centerIn: parent
                        text: root.spawnExpanded ? "▾ Choose Companion Species" : "+ Adopt New Companion"
                        color: Theme.accent
                        font.family: Theme.fontFamily
                        font.pixelSize: 10
                    }

                    MouseArea {
                        anchors.fill: parent
                        onClicked: root.spawnExpanded = !root.spawnExpanded
                    }
                }

                Rectangle {
                    visible: Config.pets.length > 1
                    implicitWidth: 68
                    implicitHeight: 24
                    radius: 7
                    color: Theme.surface
                    border.width: 1
                    border.color: Theme.danger

                    Text {
                        anchors.centerIn: parent
                        text: "Dismiss"
                        color: Theme.danger
                        font.family: Theme.fontFamily
                        font.pixelSize: 10
                    }

                    MouseArea {
                        anchors.fill: parent
                        onClicked: {
                            const targetName = root.pet.petData.name;
                            PetManager.closeInspector();
                            Config.removePet(targetName);
                        }
                    }
                }
            }

            Flow {
                visible: root.spawnExpanded
                Layout.fillWidth: true
                spacing: 4

                Repeater {
                    model: Config.speciesList

                    Rectangle {
                        id: adoptChip
                        required property string modelData
                        radius: 6
                        color: Theme.surface
                        border.width: 1
                        border.color: Theme.positive
                        implicitWidth: adoptTxt.implicitWidth + 10
                        implicitHeight: 20

                        Text {
                            id: adoptTxt
                            anchors.centerIn: parent
                            text: "+ " + adoptChip.modelData
                            color: Theme.positive
                            font.family: Theme.fontFamily
                            font.pixelSize: 9
                        }

                        MouseArea {
                            anchors.fill: parent
                            onClicked: {
                                Config.addPet(adoptChip.modelData, "", "emergent");
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
