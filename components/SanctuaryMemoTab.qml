pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../config"
import "../services"
import "behavior/Personality.js" as Personality
import "ui/CompanionFormat.js" as Fmt

ColumnLayout {
    id: root

    required property var selectedConfig
    required property var stateSource
    required property bool selectedIsRoaming
    required property var speciesAbilities
    required property real currentAgeSec
    required property double nowMs

    property bool optionsExpanded: false
    property alias confirmRelease: releaseBtn.armed

    signal companionSelected(petId: string)

    readonly property var natureData: {
        const src = root.stateSource;
        const eff = src
            ? (root.selectedIsRoaming ? (src.personality || ({})) : (src.effectivePersonality || ({})))
            : ({});
        const base = src ? (src.basePersonality || ({})) : ({});
        return Fmt.natureProfile(eff, base, root.currentAgeSec);
    }

    readonly property var activeQuirks: root.stateSource ? (root.stateSource.quirks || []) : []
    readonly property var activeRelationships: root.stateSource ? (root.stateSource.relationships || ({})) : ({})
    readonly property var relationshipNames: Object.keys(root.activeRelationships)

    readonly property var recentMoments: {
        const src = root.stateSource;
        if (!src) return [];
        const combined = (src.journal || []).concat(src.thoughts || []);
        if (combined.length === 0) return [];
        const sorted = combined.slice().sort((a, b) => {
            const ta = Number(a ? (a.time ?? a.t ?? 0) : 0);
            const tb = Number(b ? (b.time ?? b.t ?? 0) : 0);
            return tb - ta;
        });
        const out = [];
        const seen = {};
        for (let i = 0; i < sorted.length && out.length < 4; i++) {
            const entry = sorted[i];
            const txt = entry && entry.text ? String(entry.text).trim() : "";
            if (!txt || seen[txt]) continue;
            seen[txt] = true;
            out.push(entry);
        }
        return out;
    }

    readonly property var connectedMonitors: {
        const screens = WindowTracker.realScreens;
        const out = [""];
        for (let i = 0; i < screens.length; i++) {
            if (out.indexOf(screens[i].name) === -1) out.push(screens[i].name);
        }
        const pinned = root.selectedConfig ? String(root.selectedConfig.monitor || "") : "";
        if (pinned && out.indexOf(pinned) === -1) out.push(pinned);
        return out;
    }

    spacing: 10

    Rectangle {
        Layout.fillWidth: true
        implicitHeight: natureCol.implicitHeight + 22
        radius: Theme.radius(-3)
        color: Theme.parchment
        border.width: 1
        border.color: Theme.borderSubtle

        ColumnLayout {
            id: natureCol
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: 11
            spacing: 5

            RowLayout {
                Layout.fillWidth: true
                spacing: 6

                Text {
                    Layout.fillWidth: true
                    elide: Text.ElideRight
                    text: root.natureData.title
                    color: Theme.warm
                    font.family: Theme.uiFont
                    font.pixelSize: 13
                    font.weight: Font.Bold
                }

                Text {
                    text: Fmt.togetherDuration(root.currentAgeSec)
                    color: Theme.muted
                    font.family: Theme.uiFont
                    font.pixelSize: 10
                }
            }

            Text {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                text: root.natureData.memo
                color: Theme.text
                font.family: Theme.uiFont
                font.pixelSize: 12
                lineHeight: 1.28
            }
        }
    }

    Rectangle {
        visible: root.speciesAbilities.length > 0
        Layout.fillWidth: true
        implicitHeight: abCol.implicitHeight + 20
        radius: Theme.radius(-4)
        color: Theme.parchment
        border.width: 1
        border.color: Theme.borderSubtle

        ColumnLayout {
            id: abCol
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: 10
            spacing: 3

            RowLayout {
                spacing: 6

                UiIcon {
                    name: root.speciesAbilities.length > 0 && root.speciesAbilities[0].icon
                        ? root.speciesAbilities[0].icon
                        : "spark"
                    filled: name === "spark"
                    size: 12
                    color: Theme.accent
                }

                Text {
                    text: "Ability  ·  " + (root.speciesAbilities.length > 0 ? root.speciesAbilities[0].label : "")
                    color: Theme.accent
                    font.family: Theme.uiFont
                    font.pixelSize: 11
                    font.weight: Font.Bold
                }
            }

            Text {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                text: root.speciesAbilities.length > 0 ? root.speciesAbilities[0].summary : ""
                color: Theme.subtext
                font.family: Theme.uiFont
                font.pixelSize: 11
                lineHeight: 1.22
            }
        }
    }

    Rectangle {
        Layout.fillWidth: true
        implicitHeight: ribbonsCol.implicitHeight + 20
        radius: Theme.radius(-4)
        color: Theme.parchment
        border.width: 1
        border.color: Theme.borderSubtle

        ColumnLayout {
            id: ribbonsCol
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: 10
            spacing: 7

            RowLayout {
                spacing: 6

                Image {
                    Layout.preferredWidth: 16
                    Layout.preferredHeight: 16
                    smooth: false
                    source: Qt.resolvedUrl("../assets/sanctuary/items/ribbon_pink.png")
                }

                Text {
                    text: "Ribbons & Habits"
                    color: Theme.text
                    font.family: Theme.uiFont
                    font.pixelSize: 12
                    font.weight: Font.DemiBold
                }
            }

            Text {
                visible: root.activeQuirks.length === 0
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                text: "Ribbons are earned naturally as shared moments settle during sleep."
                color: Theme.muted
                font.family: Theme.uiFont
                font.pixelSize: 11
            }

            Flow {
                visible: root.activeQuirks.length > 0
                Layout.fillWidth: true
                spacing: 6

                Repeater {
                    model: root.activeQuirks

                    Rectangle {
                        id: ribbonPill
                        required property string modelData
                        readonly property var def: Personality.QUIRK_DEFS[ribbonPill.modelData]
                        implicitHeight: 26
                        implicitWidth: ribRow.implicitWidth + 14
                        radius: 13
                        color: Theme.loveSoft
                        border.width: 1
                        border.color: Theme.alpha(Theme.love, 0.55)

                        RowLayout {
                            id: ribRow
                            anchors.centerIn: parent
                            spacing: 5

                            UiIcon {
                                name: ribbonPill.def ? ribbonPill.def.icon : "ribbon"
                                size: 12
                                color: Theme.love
                            }

                            Text {
                                text: ribbonPill.def ? ribbonPill.def.label : ribbonPill.modelData
                                color: Theme.text
                                font.family: Theme.uiFont
                                font.pixelSize: 11
                                font.weight: Font.Medium
                            }
                        }

                        MouseArea {
                            id: ribHover
                            anchors.fill: parent
                            hoverEnabled: true
                        }

                        UiTooltip {
                            active: ribHover.containsMouse
                            text: ribbonPill.def ? ribbonPill.def.summary : ""
                        }
                    }
                }
            }
        }
    }

    Rectangle {
        visible: root.relationshipNames.length > 0
        Layout.fillWidth: true
        implicitHeight: palsCol.implicitHeight + 20
        radius: Theme.radius(-4)
        color: Theme.parchment
        border.width: 1
        border.color: Theme.borderSubtle

        ColumnLayout {
            id: palsCol
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: 10
            spacing: 6

            Text {
                text: "Camp Friends"
                color: Theme.text
                font.family: Theme.uiFont
                font.pixelSize: 12
                font.weight: Font.DemiBold
            }

            Repeater {
                model: root.relationshipNames

                Rectangle {
                    id: palRow
                    required property string modelData
                    readonly property var relObj: root.activeRelationships[palRow.modelData]
                    readonly property string spName: Fmt.companionSpecies(Config.pets, palRow.modelData, relObj)
                    readonly property string targetId: Fmt.companionId(Config.pets, palRow.modelData)

                    Layout.fillWidth: true
                    implicitHeight: 38
                    radius: Theme.radius(-6)
                    color: palMouse.containsMouse && targetId ? Theme.surfaceAlt : Theme.surface
                    border.width: 1
                    border.color: Theme.borderSubtle

                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 6
                        anchors.rightMargin: 10
                        spacing: 8

                        SpriteAnimation {
                            Layout.preferredWidth: 32
                            Layout.preferredHeight: 32
                            speciesName: palRow.spName
                            currentState: "idle"
                            spriteDir: Qt.resolvedUrl("../assets/sprites/" + palRow.spName)
                        }

                        Text {
                            Layout.maximumWidth: 112
                            elide: Text.ElideRight
                            text: palRow.modelData
                            color: Theme.text
                            font.family: Theme.uiFont
                            font.pixelSize: 11
                            font.weight: Font.DemiBold
                        }

                        Item { Layout.fillWidth: true }

                        Text {
                            text: Fmt.friendlyRelationshipPhrase(palRow.relObj)
                            color: Theme.subtext
                            font.family: Theme.uiFont
                            font.pixelSize: 10
                        }
                    }

                    MouseArea {
                        id: palMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: palRow.targetId ? Qt.PointingHandCursor : Qt.ArrowCursor
                        onClicked: {
                            if (palRow.targetId) root.companionSelected(palRow.targetId);
                        }
                    }
                }
            }
        }
    }

    Rectangle {
        visible: root.recentMoments.length > 0
        Layout.fillWidth: true
        implicitHeight: diaryCol.implicitHeight + 20
        radius: Theme.radius(-4)
        color: Theme.parchment
        border.width: 1
        border.color: Theme.borderSubtle

        ColumnLayout {
            id: diaryCol
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: 10
            spacing: 6

            Text {
                text: "Recent Memories"
                color: Theme.text
                font.family: Theme.uiFont
                font.pixelSize: 12
                font.weight: Font.DemiBold
            }

            Repeater {
                model: root.recentMoments

                RowLayout {
                    id: memItem
                    required property var modelData
                    readonly property double ts: Number(memItem.modelData.time ?? memItem.modelData.t ?? 0)
                    Layout.fillWidth: true
                    spacing: 6

                    Rectangle {
                        Layout.alignment: Qt.AlignTop
                        Layout.topMargin: 5
                        implicitWidth: 4
                        implicitHeight: 4
                        radius: 2
                        color: Theme.warm
                    }

                    Text {
                        Layout.fillWidth: true
                        wrapMode: Text.WordWrap
                        maximumLineCount: 2
                        elide: Text.ElideRight
                        text: memItem.modelData.text || ""
                        color: Theme.subtext
                        font.family: Theme.uiFont
                        font.pixelSize: 11
                        lineHeight: 1.18
                    }

                    Text {
                        visible: memItem.ts > 0
                        Layout.alignment: Qt.AlignTop
                        text: Fmt.formatAgo(memItem.ts, root.nowMs)
                        color: Theme.muted
                        font.family: Theme.uiFont
                        font.pixelSize: 10
                    }
                }
            }
        }
    }

    RowLayout {
        Layout.fillWidth: true

        Rectangle {
            implicitHeight: 26
            implicitWidth: optBtnRow.implicitWidth + 16
            radius: 13
            color: optBtnMouse.containsMouse ? Theme.surfaceAlt : "transparent"

            RowLayout {
                id: optBtnRow
                anchors.centerIn: parent
                spacing: 5

                UiIcon {
                    name: "dots"
                    size: 12
                    color: Theme.muted
                }

                Text {
                    text: root.optionsExpanded ? "Hide options" : "Companion options"
                    color: Theme.muted
                    font.family: Theme.uiFont
                    font.pixelSize: 11
                }
            }

            MouseArea {
                id: optBtnMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: root.optionsExpanded = !root.optionsExpanded
            }
        }

        Item { Layout.fillWidth: true }
    }

    Rectangle {
        visible: root.optionsExpanded
        Layout.fillWidth: true
        implicitHeight: extraOptsCol.implicitHeight + 20
        radius: Theme.radius(-4)
        color: Theme.parchment
        border.width: 1
        border.color: Theme.borderSubtle

        ColumnLayout {
            id: extraOptsCol
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: 10
            spacing: 8

            RowLayout {
                Layout.fillWidth: true
                spacing: 6

                Text {
                    text: "Desktop size"
                    color: Theme.subtext
                    font.family: Theme.uiFont
                    font.pixelSize: 11
                }

                Item { Layout.fillWidth: true }

                Repeater {
                    model: [1, 2, 3, 4]

                    Rectangle {
                        id: scChip
                        required property int modelData
                        readonly property bool cur: root.selectedConfig !== null
                            && (root.selectedConfig.scale ?? 2) === scChip.modelData
                        implicitWidth: 32
                        implicitHeight: 26
                        radius: Theme.radius(-7)
                        color: cur ? Theme.warmSoft : Theme.surface
                        border.width: 1
                        border.color: cur ? Theme.warm : Theme.borderSubtle

                        Text {
                            anchors.centerIn: parent
                            text: scChip.modelData + "×"
                            color: scChip.cur ? Theme.warm : Theme.text
                            font.family: Theme.uiFont
                            font.pixelSize: 11
                            font.weight: scChip.cur ? Font.Bold : Font.Normal
                        }

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                if (root.selectedConfig) {
                                    Config.updatePetScale(root.selectedConfig.id, scChip.modelData);
                                }
                            }
                        }
                    }
                }
            }

            RowLayout {
                id: displayRow
                readonly property bool showDisplayRow: root.connectedMonitors.length > 2
                    || (root.selectedConfig !== null && (root.selectedConfig.monitor || "") !== "")
                visible: showDisplayRow
                Layout.fillWidth: true
                spacing: 6

                Text {
                    text: "Display"
                    color: Theme.subtext
                    font.family: Theme.uiFont
                    font.pixelSize: 11
                }

                Item { Layout.fillWidth: true }

                Flow {
                    Layout.maximumWidth: 210
                    spacing: 4

                    Repeater {
                        model: displayRow.showDisplayRow ? root.connectedMonitors : []

                        Rectangle {
                            id: monBtn
                            required property string modelData
                            readonly property bool cur: root.selectedConfig !== null
                                && (root.selectedConfig.monitor || "") === monBtn.modelData
                            implicitHeight: 26
                            implicitWidth: monBtnTxt.implicitWidth + 14
                            radius: Theme.radius(-7)
                            color: cur ? Theme.warmSoft : Theme.surface
                            border.width: 1
                            border.color: cur ? Theme.warm : Theme.borderSubtle

                            Text {
                                id: monBtnTxt
                                anchors.centerIn: parent
                                text: monBtn.modelData === "" ? "Any" : monBtn.modelData
                                color: monBtn.cur ? Theme.warm : Theme.text
                                font.family: Theme.uiFont
                                font.pixelSize: 10
                            }

                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    if (root.selectedConfig) {
                                        Config.updatePetMonitor(root.selectedConfig.id, monBtn.modelData);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            RowLayout {
                Layout.fillWidth: true

                Item { Layout.fillWidth: true }

                SanctuaryConfirmReleaseButton {
                    id: releaseBtn
                    petId: root.selectedConfig ? root.selectedConfig.id : ""
                }
            }
        }
    }
}
