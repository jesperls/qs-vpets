pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../config"

RowLayout {
    id: root

    required property string label
    required property real value
    property color tint: Theme.accent
    property real baselineValue: -1
    property int labelWidth: 66

    readonly property bool hasBaseline: baselineValue >= 0
    readonly property int deltaPct: hasBaseline ? Math.round((value - baselineValue) * 100) : 0

    Layout.fillWidth: true
    spacing: 8

    Text {
        Layout.preferredWidth: root.labelWidth
        elide: Text.ElideRight
        text: root.label
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
            width: parent.width * Math.max(0.03, Math.min(1, root.value || 0))
            height: parent.height
            radius: 3
            color: root.tint
            Behavior on width { NumberAnimation { duration: Theme.animMs; easing.type: Easing.OutCubic } }
        }

        Rectangle {
            visible: root.hasBaseline
            x: Math.max(0, Math.min(parent.width - 2, parent.width * Math.max(0, Math.min(1, root.baselineValue)) - 1))
            y: -1
            width: 2
            height: parent.height + 2
            radius: 1
            color: Theme.alpha(Theme.text, 0.55)
        }
    }

    Text {
        Layout.preferredWidth: root.hasBaseline ? 54 : 34
        horizontalAlignment: Text.AlignRight
        text: root.hasBaseline
            ? (Math.round((root.value || 0) * 100) + (root.deltaPct !== 0 ? (" " + (root.deltaPct > 0 ? "+" : "") + root.deltaPct) : ""))
            : (Math.round((root.value || 0) * 100) + "%")
        color: root.hasBaseline
            ? (root.deltaPct > 0 ? Theme.positive : (root.deltaPct < 0 ? Theme.warm : Theme.subtext))
            : Theme.text
        font.family: Theme.monoFont
        font.pixelSize: 10
    }
}
