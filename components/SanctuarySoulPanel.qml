pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import QtQuick.Window
import "../config"
import "behavior/Personality.js" as Personality
import "ui/CompanionFormat.js" as Fmt

ColumnLayout {
    id: root

    property var livePet: null
    property var resident: null
    property int maxMilestones: 4
    property int labelWidth: 74
    property double nowMs: Date.now()

    signal selectPeerRequested(peerId: string)

    spacing: 7

    Timer {
        interval: 30000
        running: root.visible && root.Window.visibility !== Window.Hidden
        repeat: true
        onTriggered: root.nowMs = Date.now()
    }

    readonly property var effectiveTraits: {
        void (root.livePet ? root.livePet.memoryRevision : 0);
        void (root.resident ? root.resident.revision : 0);
        if (root.livePet) return root.livePet.personality || ({});
        return root.resident ? (root.resident.effectivePersonality || ({})) : ({});
    }

    readonly property var baselineTraits: {
        void (root.livePet ? root.livePet.memoryRevision : 0);
        void (root.resident ? root.resident.revision : 0);
        if (root.livePet) return root.livePet.basePersonality || ({});
        return root.resident ? (root.resident.basePersonality || ({})) : ({});
    }

    readonly property var activeQuirks: {
        void (root.livePet ? root.livePet.memoryRevision : 0);
        void (root.resident ? root.resident.revision : 0);
        if (root.livePet) return root.livePet.quirks || [];
        return root.resident ? (root.resident.quirks || []) : [];
    }

    readonly property var activeRelationships: {
        void (root.livePet ? root.livePet.memoryRevision : 0);
        void (root.resident ? root.resident.revision : 0);
        if (root.livePet) return root.livePet.relationships || ({});
        return root.resident ? (root.resident.relationships || ({})) : ({});
    }

    readonly property var relationshipNames: Object.keys(root.activeRelationships)

    readonly property var activeMilestones: {
        void (root.livePet ? root.livePet.memoryRevision : 0);
        void (root.resident ? root.resident.revision : 0);
        const j = root.livePet ? (root.livePet.journal || []) : (root.resident ? (root.resident.journal || []) : []);
        return j.slice(-root.maxMilestones).reverse();
    }

    UiSectionHeader {
        title: "TEMPERAMENT"
        subtitle: "Tick = initial nature"
    }

    Repeater {
        model: Personality.TRAIT_KEYS

        UiStatBar {
            id: traitRow
            required property string modelData
            label: Personality.TRAIT_LABELS[traitRow.modelData] || traitRow.modelData
            value: root.effectiveTraits[traitRow.modelData] ?? 0.5
            baselineValue: root.baselineTraits[traitRow.modelData] ?? 0.5
            tint: Theme.accent
            labelWidth: root.labelWidth
        }
    }

    Rectangle {
        Layout.fillWidth: true
        implicitHeight: 1
        color: Theme.borderSubtle
    }

    UiSectionHeader {
        title: "EARNED HABITS"
    }

    Text {
        visible: root.activeQuirks.length === 0
        Layout.fillWidth: true
        wrapMode: Text.WordWrap
        text: "Habits emerge naturally as memories consolidate during sleep."
        color: Theme.muted
        font.family: Theme.uiFont
        font.pixelSize: 10
    }

    Flow {
        visible: root.activeQuirks.length > 0
        Layout.fillWidth: true
        spacing: 5

        Repeater {
            model: root.activeQuirks

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

    UiSectionHeader {
        visible: root.relationshipNames.length > 0
        title: "COMPANION BONDS"
    }

    Repeater {
        model: root.relationshipNames

        Rectangle {
            id: relRow
            required property string modelData
            readonly property var relObj: root.activeRelationships[relRow.modelData]
            readonly property string spName: Fmt.companionSpecies(Config.pets, relRow.modelData, relObj)
            readonly property string targetId: Fmt.companionId(Config.pets, relRow.modelData)
            readonly property real aff: (relObj && relObj.affinity !== undefined) ? relObj.affinity : 0.5
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
                spacing: 7

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
                        text: Personality.relationshipTag(relRow.relObj)
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
                    if (relRow.targetId) root.selectPeerRequested(relRow.targetId);
                }
            }
        }
    }

    UiSectionHeader {
        visible: root.activeMilestones.length > 0
        title: "MILESTONES"
    }

    Repeater {
        model: root.activeMilestones

        RowLayout {
            id: milestoneRow
            required property var modelData
            readonly property double entryTs: Number(milestoneRow.modelData.time ?? milestoneRow.modelData.t ?? 0)
            Layout.fillWidth: true
            spacing: 6

            Text {
                Layout.fillWidth: true
                elide: Text.ElideRight
                text: milestoneRow.modelData.text || ""
                color: Theme.subtext
                font.family: Theme.uiFont
                font.pixelSize: 10
            }

            Text {
                visible: milestoneRow.entryTs > 0
                text: Fmt.formatAgo(milestoneRow.entryTs, root.nowMs)
                color: Theme.muted
                font.family: Theme.monoFont
                font.pixelSize: 9
            }
        }
    }
}
