import QtQuick
import "../config"

Item {
    id: root

    property bool sleeping: false
    property real altitude: 0
    property bool flipped: false

    enabled: false
    width: 48
    height: 34

    property string emoteText: ""

    function showEmote(symbol: string): void {
        if (!Config.showEmotes || !symbol) return;
        emotePopAnim.stop();
        root.emoteText = symbol;
        emoteBadge.opacity = 1;
        emoteBadge.y = root.flipped ? 2 : 14;
        emoteBadge.scale = 0.6;
        emotePopAnim.start();
    }

    // Subtle occasional sleep 'z' puff every ~22s instead of constant motion while napping.
    Text {
        id: sleepZzz
        visible: root.sleeping && Config.showEmotes && emoteBadge.opacity < 0.05
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.horizontalCenterOffset: 10
        y: root.flipped ? 6 : 12
        text: "z"
        color: Theme.subtext
        font.family: Theme.fontFamily
        font.pixelSize: 10
        font.bold: true
        opacity: 0

        SequentialAnimation on opacity {
            running: sleepZzz.visible
            loops: Animation.Infinite
            PauseAnimation { duration: 14000 }
            NumberAnimation { from: 0.0; to: 0.55; duration: 1200; easing.type: Easing.InOutSine }
            PauseAnimation { duration: 1600 }
            NumberAnimation { from: 0.55; to: 0.0; duration: 1400; easing.type: Easing.InOutSine }
            PauseAnimation { duration: 6000 }
        }
    }

    Rectangle {
        id: emoteBadge
        visible: opacity > 0.01
        opacity: 0
        width: Math.max(20, emoteLabel.implicitWidth + 10)
        height: 19
        radius: 9
        x: (root.width - width) / 2
        y: root.flipped ? 4 : (12 - root.altitude)
        color: Theme.bg
        border.width: 1
        border.color: Theme.border

        Text {
            id: emoteLabel
            anchors.centerIn: parent
            text: root.emoteText
            color: root.emoteText.indexOf("♥") !== -1 ? Theme.love
                 : root.emoteText.indexOf("♪") !== -1 ? Theme.accent
                 : root.emoteText.indexOf("💢") !== -1 ? Theme.danger
                 : Theme.warm
            font.family: Theme.fontFamily
            font.pixelSize: 11
            font.bold: true
        }

        ParallelAnimation {
            id: emotePopAnim
            NumberAnimation { target: emoteBadge; property: "scale"; from: 0.6; to: 1.0; duration: 200; easing.type: Easing.OutBack }
            NumberAnimation { target: emoteBadge; property: "y"; from: root.flipped ? 2 : 15; to: root.flipped ? 10 : 4; duration: 1250; easing.type: Easing.OutCubic }
            SequentialAnimation {
                PauseAnimation { duration: 850 }
                NumberAnimation { target: emoteBadge; property: "opacity"; from: 0.95; to: 0.0; duration: 400 }
            }
        }
    }
}
