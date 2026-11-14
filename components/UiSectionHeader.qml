pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../config"

RowLayout {
    id: root

    required property string title
    property string subtitle: ""

    Layout.fillWidth: true
    spacing: 6

    Text {
        text: root.title
        color: Theme.muted
        font.family: Theme.uiFont
        font.pixelSize: 9
        font.weight: Font.Bold
        font.letterSpacing: 0.6
    }

    Item {
        visible: root.subtitle.length > 0
        Layout.fillWidth: true
    }

    Text {
        visible: root.subtitle.length > 0
        text: root.subtitle
        color: Theme.muted
        font.family: Theme.uiFont
        font.pixelSize: 9
    }
}
