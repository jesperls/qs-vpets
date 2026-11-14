pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import QtQuick.Window
import "../config"
import "ui/CompanionFormat.js" as Fmt

ColumnLayout {
    id: root

    property var livePet: null
    property var resident: null
    property bool showHeader: true
    property int maxNotes: 6
    property int labelWidth: 66
    property double nowMs: Date.now()

    spacing: 7

    Timer {
        interval: 30000
        running: root.visible && root.Window.visibility !== Window.Hidden
        repeat: true
        onTriggered: root.nowMs = Date.now()
    }

    UiSectionHeader {
        visible: root.showHeader
        title: "VITALS & DRIVES"
    }

    Repeater {
        model: {
            const lp = root.livePet;
            const rr = root.resident;
            void (rr ? rr.revision : 0);
            return [
                { name: "Mood", val: lp ? lp.mood : (rr ? rr.mood : 0.56), tint: Theme.positive },
                { name: "Bond", val: lp ? lp.bond : (rr ? rr.bond : 0.30), tint: Theme.love },
                { name: "Trust", val: lp ? lp.trust : (rr ? rr.trust : 0.35), tint: Theme.accent },
                { name: "Satiety", val: lp ? lp.satiety : (rr ? rr.satiety : 0.65), tint: Theme.positive },
                { name: "Energy", val: 1.0 - (lp ? lp.restDrive : (rr ? rr.restDrive : 0.14)), tint: Theme.warm },
                { name: "Curiosity", val: lp ? lp.exploreDrive : (rr ? rr.exploreDrive : 0.34), tint: Theme.accent },
                { name: "Social", val: lp ? lp.socialDrive : (rr ? rr.socialDrive : 0.26), tint: Theme.love },
                { name: "Play", val: lp ? lp.playDrive : (rr ? rr.playDrive : 0.22), tint: Theme.positive }
            ];
        }

        UiStatBar {
            id: vitalRow
            required property var modelData
            label: vitalRow.modelData.name
            value: vitalRow.modelData.val
            tint: vitalRow.modelData.tint
            labelWidth: root.labelWidth
        }
    }

    Rectangle {
        Layout.fillWidth: true
        implicitHeight: 1
        color: Theme.borderSubtle
    }

    UiSectionHeader {
        title: "FIELD NOTES"
    }

    Repeater {
        model: {
            const lp = root.livePet;
            const rr = root.resident;
            void (lp ? lp.memoryRevision : 0);
            void (rr ? rr.revision : 0);
            const list = lp ? (lp.thoughts || []) : (rr ? (rr.thoughts || []) : []);
            return list.slice(-root.maxNotes).reverse();
        }

        RowLayout {
            id: noteRow
            required property var modelData
            readonly property double entryTs: Number(noteRow.modelData.time ?? noteRow.modelData.t ?? 0)
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
                text: noteRow.modelData.text || ""
                color: Theme.text
                font.family: Theme.uiFont
                font.pixelSize: 11
            }

            Text {
                visible: noteRow.entryTs > 0
                text: Fmt.formatAgo(noteRow.entryTs, root.nowMs)
                color: Theme.muted
                font.family: Theme.monoFont
                font.pixelSize: 9
            }
        }
    }
}
