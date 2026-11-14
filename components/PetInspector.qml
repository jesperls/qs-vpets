pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../config"
import "../services"
import "SpeciesProfile.js" as SpeciesProfile
import "behavior/Personality.js" as Personality

Rectangle {
    id: root

    required property var pet

    property int cardWidth: 324
    property int maxHeight: 640
    property int activeTab: 0
    property bool spawnExpanded: false
    property bool confirmRelease: false

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

    Timer {
        id: releaseResetTimer
        interval: 3500
        onTriggered: root.confirmRelease = false
    }

    function formatAge(sec: real): string {
        const s = Math.max(0, Math.floor(sec || 0));
        if (s < 3600) return Math.max(1, Math.floor(s / 60)) + "m";
        if (s < 86400) return Math.floor(s / 3600) + "h";
        return Math.floor(s / 86400) + "d " + Math.floor((s % 86400) / 3600) + "h";
    }

    function formatAgo(ts: double): string {
        if (!ts) return "";
        const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
        if (sec < 45) return "now";
        if (sec < 3600) return Math.floor(sec / 60) + "m";
        if (sec < 86400) return Math.floor(sec / 3600) + "h";
        return Math.floor(sec / 86400) + "d";
    }

    function companionSpecies(name: string, rel: var): string {
        if (rel && rel.species) return rel.species;
        const found = Config.pets.find(p => p.name === name);
        return found ? found.sprite : "zorua";
    }

    function companionId(name: string): string {
        const found = Config.pets.find(p => p.name === name);
        return found ? found.id : "";
    }

    // Specular top rim matching Pangu surfaces.
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

    // Swallow clicks on the card background so they don't fall through.
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
                                    text: root.formatAge(root.pet.ageSeconds)
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

            ColumnLayout {
                visible: root.activeTab === 0
                Layout.fillWidth: true
                spacing: 6

                Repeater {
                    model: [
                        { name: "Mood", val: root.pet.mood, tint: Theme.positive },
                        { name: "Bond", val: root.pet.bond, tint: Theme.love },
                        { name: "Trust", val: root.pet.trust, tint: Theme.accent },
                        { name: "Satiety", val: root.pet.satiety, tint: Theme.positive },
                        { name: "Energy", val: 1.0 - root.pet.restDrive, tint: Theme.warm },
                        { name: "Curiosity", val: root.pet.exploreDrive, tint: Theme.accent },
                        { name: "Social", val: root.pet.socialDrive, tint: Theme.love },
                        { name: "Play", val: root.pet.playDrive, tint: Theme.positive }
                    ]

                    RowLayout {
                        id: driveRow
                        required property var modelData
                        Layout.fillWidth: true
                        spacing: 8

                        Text {
                            Layout.preferredWidth: 62
                            text: driveRow.modelData.name
                            color: Theme.subtext
                            font.family: Theme.uiFont
                            font.pixelSize: 11
                        }

                        Rectangle {
                            Layout.fillWidth: true
                            implicitHeight: 6
                            radius: 3
                            color: Theme.surface

                            Rectangle {
                                width: parent.width * Math.max(0.03, Math.min(1, driveRow.modelData.val || 0))
                                height: parent.height
                                radius: 3
                                color: driveRow.modelData.tint
                                Behavior on width { NumberAnimation { duration: Theme.animMs; easing.type: Easing.OutCubic } }
                            }
                        }

                        Text {
                            Layout.preferredWidth: 32
                            horizontalAlignment: Text.AlignRight
                            text: Math.round((driveRow.modelData.val || 0) * 100) + "%"
                            color: Theme.text
                            font.family: Theme.monoFont
                            font.pixelSize: 10
                        }
                    }
                }

                Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: 1
                    color: Theme.borderSubtle
                }

                Text {
                    text: "FIELD NOTES"
                    color: Theme.muted
                    font.family: Theme.uiFont
                    font.pixelSize: 9
                    font.weight: Font.Bold
                    font.letterSpacing: 0.6
                }

                Repeater {
                    model: (root.pet.thoughts || []).slice(-4).reverse()

                    RowLayout {
                        id: monoLine
                        required property var modelData
                        Layout.fillWidth: true
                        spacing: 6

                        Rectangle {
                            implicitWidth: 4
                            implicitHeight: 4
                            radius: 2
                            color: Theme.border
                        }

                        Text {
                            Layout.fillWidth: true
                            elide: Text.ElideRight
                            text: monoLine.modelData.text || ""
                            color: Theme.text
                            font.family: Theme.uiFont
                            font.pixelSize: 11
                        }

                        Text {
                            visible: !!monoLine.modelData.t
                            text: root.formatAgo(monoLine.modelData.t || 0)
                            color: Theme.muted
                            font.family: Theme.monoFont
                            font.pixelSize: 9
                        }
                    }
                }
            }

            ColumnLayout {
                visible: root.activeTab === 1
                Layout.fillWidth: true
                spacing: 6

                Repeater {
                    model: Personality.TRAIT_KEYS

                    RowLayout {
                        id: traitRow
                        required property string modelData
                        readonly property real eff: root.pet.personality[traitRow.modelData] ?? 0.5
                        readonly property real baseVal: root.pet.basePersonality[traitRow.modelData] ?? 0.5
                        readonly property int deltaPct: Math.round((eff - baseVal) * 100)
                        Layout.fillWidth: true
                        spacing: 8

                        Text {
                            Layout.preferredWidth: 70
                            text: Personality.TRAIT_LABELS[traitRow.modelData] || traitRow.modelData
                            color: Theme.subtext
                            font.family: Theme.uiFont
                            font.pixelSize: 11
                        }

                        Rectangle {
                            Layout.fillWidth: true
                            implicitHeight: 6
                            radius: 3
                            color: Theme.surface

                            Rectangle {
                                width: parent.width * Math.max(0.03, Math.min(1, traitRow.eff))
                                height: parent.height
                                radius: 3
                                color: Theme.accent
                                Behavior on width { NumberAnimation { duration: Theme.animMs; easing.type: Easing.OutCubic } }
                            }

                            // Baseline tick mark showing initial nature before lived drift.
                            Rectangle {
                                x: Math.max(0, Math.min(parent.width - 2, parent.width * traitRow.baseVal - 1))
                                y: -1
                                width: 2
                                height: parent.height + 2
                                radius: 1
                                color: Theme.alpha(Theme.text, 0.55)
                            }
                        }

                        Text {
                            Layout.preferredWidth: 54
                            horizontalAlignment: Text.AlignRight
                            text: Math.round(traitRow.eff * 100)
                                + (traitRow.deltaPct !== 0 ? (" " + (traitRow.deltaPct > 0 ? "+" : "") + traitRow.deltaPct) : "")
                            color: traitRow.deltaPct > 0 ? Theme.positive : (traitRow.deltaPct < 0 ? Theme.warm : Theme.subtext)
                            font.family: Theme.monoFont
                            font.pixelSize: 10
                        }
                    }
                }

                Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: 1
                    color: Theme.borderSubtle
                }

                Text {
                    text: "EARNED HABITS"
                    color: Theme.muted
                    font.family: Theme.uiFont
                    font.pixelSize: 9
                    font.weight: Font.Bold
                    font.letterSpacing: 0.6
                }

                Text {
                    visible: !root.pet.quirks || root.pet.quirks.length === 0
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    text: "Habits emerge naturally as memories consolidate during sleep."
                    color: Theme.muted
                    font.family: Theme.uiFont
                    font.pixelSize: 10
                }

                Flow {
                    visible: (root.pet.quirks || []).length > 0
                    Layout.fillWidth: true
                    spacing: 5

                    Repeater {
                        model: root.pet.quirks || []

                        Rectangle {
                            id: quirkBadge
                            required property string modelData
                            readonly property var def: Personality.QUIRK_DEFS[quirkBadge.modelData]
                            radius: Theme.radius(-8)
                            color: Theme.surfaceAlt
                            border.width: 1
                            border.color: quirkHover.containsMouse ? Theme.accent : Theme.borderSubtle
                            implicitWidth: qRow.implicitWidth + 12
                            implicitHeight: 22

                            RowLayout {
                                id: qRow
                                anchors.centerIn: parent
                                spacing: 5

                                UiIcon {
                                    visible: !!quirkBadge.def
                                    name: quirkBadge.def ? quirkBadge.def.icon : "spark"
                                    size: 11
                                    color: Theme.accent
                                }

                                Text {
                                    text: quirkBadge.def ? quirkBadge.def.label : quirkBadge.modelData
                                    color: Theme.text
                                    font.family: Theme.uiFont
                                    font.pixelSize: 10
                                    font.weight: Font.Medium
                                }
                            }

                            MouseArea {
                                id: quirkHover
                                anchors.fill: parent
                                hoverEnabled: true
                            }

                            UiTooltip {
                                active: quirkHover.containsMouse
                                text: quirkBadge.def ? quirkBadge.def.summary : ""
                            }
                        }
                    }
                }

                Text {
                    visible: Object.keys(root.pet.relationships || {}).length > 0
                    text: "COMPANION BONDS"
                    color: Theme.muted
                    font.family: Theme.uiFont
                    font.pixelSize: 9
                    font.weight: Font.Bold
                    font.letterSpacing: 0.6
                }

                Repeater {
                    model: Object.keys(root.pet.relationships || {})

                    Rectangle {
                        id: relRow
                        required property string modelData
                        readonly property var rel: root.pet.relationships[relRow.modelData]
                        readonly property string spName: root.companionSpecies(relRow.modelData, rel)
                        readonly property string targetId: root.companionId(relRow.modelData)
                        readonly property real aff: (rel && rel.affinity !== undefined) ? rel.affinity : 0.5
                        readonly property color affTint: aff < 0.35 ? Theme.danger : (aff < 0.52 ? Theme.warm : Theme.love)

                        Layout.fillWidth: true
                        implicitHeight: 28
                        radius: Theme.radius(-8)
                        color: relMouse.containsMouse && targetId ? Theme.surfaceAlt : Theme.surface
                        border.width: 1
                        border.color: Theme.borderSubtle

                        RowLayout {
                            anchors.fill: parent
                            anchors.leftMargin: 6
                            anchors.rightMargin: 8
                            spacing: 6

                            SpriteAnimation {
                                Layout.preferredWidth: 20
                                Layout.preferredHeight: 20
                                speciesName: relRow.spName
                                currentState: "idle"
                                spriteDir: Qt.resolvedUrl("../assets/sprites/" + relRow.spName)
                            }

                            Text {
                                text: relRow.modelData
                                color: Theme.text
                                font.family: Theme.uiFont
                                font.pixelSize: 11
                                font.weight: Font.DemiBold
                            }

                            Rectangle {
                                radius: 4
                                color: Theme.alpha(relRow.affTint, 0.14)
                                implicitWidth: relTagTxt.implicitWidth + 8
                                implicitHeight: 16
                                Text {
                                    id: relTagTxt
                                    anchors.centerIn: parent
                                    text: Personality.relationshipTag(relRow.rel)
                                    color: relRow.affTint
                                    font.family: Theme.uiFont
                                    font.pixelSize: 9
                                    font.weight: Font.Medium
                                }
                            }

                            Item { Layout.fillWidth: true }

                            Text {
                                text: Math.round(relRow.aff * 100) + "%"
                                color: relRow.affTint
                                font.family: Theme.monoFont
                                font.pixelSize: 10
                            }
                        }

                        MouseArea {
                            id: relMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: relRow.targetId ? Qt.PointingHandCursor : Qt.ArrowCursor
                            onClicked: {
                                if (relRow.targetId) PetManager.openPen(relRow.targetId);
                            }
                        }
                    }
                }

                Text {
                    visible: (root.pet.journal || []).length > 0
                    text: "MILESTONES"
                    color: Theme.muted
                    font.family: Theme.uiFont
                    font.pixelSize: 9
                    font.weight: Font.Bold
                    font.letterSpacing: 0.6
                }

                Repeater {
                    model: (root.pet.journal || []).slice(-3).reverse()

                    Text {
                        id: journalLine
                        required property var modelData
                        Layout.fillWidth: true
                        elide: Text.ElideRight
                        text: journalLine.modelData.text || ""
                        color: Theme.subtext
                        font.family: Theme.uiFont
                        font.pixelSize: 10
                    }
                }
            }

            ColumnLayout {
                visible: root.activeTab === 2
                Layout.fillWidth: true
                spacing: 8

                Text {
                    text: "SPECIES FORM"
                    color: Theme.muted
                    font.family: Theme.uiFont
                    font.pixelSize: 9
                    font.weight: Font.Bold
                    font.letterSpacing: 0.6
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
                                onClicked: Config.updatePetSpecies(root.pet.petData.id, spChip.modelData)
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

                    Rectangle {
                        visible: Config.pets.length > 1
                        implicitWidth: relTxt.implicitWidth + 18
                        implicitHeight: 28
                        radius: Theme.radius(-7)
                        color: root.confirmRelease ? Theme.alpha(Theme.danger, 0.2) : Theme.surface
                        border.width: 1
                        border.color: Theme.alpha(Theme.danger, 0.65)

                        Text {
                            id: relTxt
                            anchors.centerIn: parent
                            text: root.confirmRelease ? "Confirm?" : "Release"
                            color: Theme.danger
                            font.family: Theme.uiFont
                            font.pixelSize: 11
                            font.weight: root.confirmRelease ? Font.Bold : Font.Medium
                        }

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                if (!root.confirmRelease) {
                                    root.confirmRelease = true;
                                    releaseResetTimer.restart();
                                    return;
                                }
                                root.confirmRelease = false;
                                const targetId = root.pet.petData.id;
                                PetManager.closeInspector();
                                Config.removePet(targetId);
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
