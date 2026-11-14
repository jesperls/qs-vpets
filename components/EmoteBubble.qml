pragma ComponentBehavior: Bound

import QtQuick
import "../config"

Item {
    id: root

    property bool sleeping: false
    property real altitude: 0
    property bool flipped: false
    property bool forceEnabled: false

    enabled: false
    width: 34
    height: 32

    property string emoteKind: ""

    function _normalizeKind(raw: string): string {
        if (!raw) return "";
        switch (raw) {
        case "heart": return "heart";
        case "note": return "note";
        case "!":
        case "exclaim": return "exclaim";
        case "?":
        case "question": return "question";
        case "...":
        case "ellipses": return "ellipses";
        case "frustrated": return "frustrated";
        case "berry": return "berry";
        case "sleepy": return "sleepy";
        case "dream": return "dream";
        default: return "exclaim";
        }
    }

    function showEmote(symbol: string): void {
        if ((!Config.showEmotes && !root.forceEnabled) || !symbol) return;
        const kind = _normalizeKind(symbol);
        if (!kind) return;
        emotePopAnim.stop();
        root.emoteKind = kind;
        dropletCanvas.requestPaint();
        emoteBadge.opacity = 1;
        emoteBadge.scale = 0.65;
        emoteBadge.popOffsetY = root.flipped ? 0 : 10;
        emotePopAnim.start();
    }

    onFlippedChanged: dropletCanvas.requestPaint()

    Connections {
        target: Theme
        function onBgChanged(): void { dropletCanvas.requestPaint(); sleepCanvas.requestPaint(); }
        function onAccentChanged(): void { dropletCanvas.requestPaint(); sleepCanvas.requestPaint(); }
        function onBorderChanged(): void { dropletCanvas.requestPaint(); }
    }

    Item {
        id: sleepDrift
        visible: root.sleeping && Config.showEmotes && emoteBadge.opacity < 0.05
        width: 18
        height: 18
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.horizontalCenterOffset: 9
        y: sleepY
        opacity: 0

        property real sleepY: root.flipped ? 6 : 10

        Canvas {
            id: sleepCanvas
            anchors.fill: parent
            smooth: false
            antialiasing: false

            onPaint: {
                const ctx = getContext("2d");
                ctx.reset();
                const rows = [
                    "....ZZZZZ",
                    ".......Z.",
                    "......Z..",
                    ".....Z...",
                    "....ZZZZZ",
                    ".zzz.....",
                    "..z......",
                    ".z.......",
                    ".zzz....."
                ];
                const hi = Theme.subtext.toString();
                const lo = Theme.muted.toString();
                for (let r = 0; r < rows.length; r++) {
                    const line = rows[r];
                    for (let c = 0; c < line.length; c++) {
                        const ch = line[c];
                        if (ch === ".") continue;
                        ctx.fillStyle = ch === "Z" ? hi : lo;
                        ctx.fillRect(c * 2, r * 2, 2, 2);
                    }
                }
            }
        }

        SequentialAnimation {
            running: sleepDrift.visible
            loops: Animation.Infinite
            PauseAnimation { duration: 14500 }
            ParallelAnimation {
                SequentialAnimation {
                    NumberAnimation { target: sleepDrift; property: "opacity"; from: 0.0; to: 0.65; duration: 1100; easing.type: Easing.OutSine }
                    PauseAnimation { duration: 1400 }
                    NumberAnimation { target: sleepDrift; property: "opacity"; from: 0.65; to: 0.0; duration: 1300; easing.type: Easing.InSine }
                }
                NumberAnimation {
                    target: sleepDrift
                    property: "sleepY"
                    from: root.flipped ? 8 : 12
                    to: root.flipped ? 2 : 3
                    duration: 3800
                    easing.type: Easing.OutSine
                }
            }
            PauseAnimation { duration: 6500 }
        }
    }

    Item {
        id: emoteBadge
        visible: opacity > 0.01
        opacity: 0
        width: 28
        height: 28
        property real popOffsetY: 0
        x: Math.round((root.width - width) * 0.5)
        y: (root.flipped ? 2 : (2 - root.altitude)) + popOffsetY

        Canvas {
            id: dropletCanvas
            anchors.fill: parent
            smooth: false
            antialiasing: false

            onPaint: {
                const ctx = getContext("2d");
                ctx.reset();
                if (!root.emoteKind) return;

                const bodyY = root.flipped ? 4 : 0;
                const bgCol = Qt.rgba(Theme.surfaceAlt.r, Theme.surfaceAlt.g, Theme.surfaceAlt.b, 0.96).toString();
                const brdCol = Theme.border.toString();
                const rimCol = Theme.rimHighlight.toString();

                ctx.fillStyle = brdCol;
                ctx.fillRect(3, bodyY, 22, 22);
                ctx.fillRect(1, bodyY + 2, 26, 18);
                ctx.fillRect(2, bodyY + 1, 24, 20);

                ctx.fillStyle = bgCol;
                ctx.fillRect(3, bodyY + 1, 22, 20);
                ctx.fillRect(2, bodyY + 2, 24, 18);

                ctx.fillStyle = rimCol;
                ctx.fillRect(4, bodyY + 1, 20, 1);

                if (root.flipped) {
                    ctx.fillStyle = brdCol;
                    ctx.fillRect(12, 0, 4, 2);
                    ctx.fillRect(11, 2, 6, 2);
                    ctx.fillStyle = bgCol;
                    ctx.fillRect(13, 2, 2, 3);
                } else {
                    ctx.fillStyle = brdCol;
                    ctx.fillRect(11, bodyY + 22, 6, 2);
                    ctx.fillRect(12, bodyY + 24, 4, 2);
                    ctx.fillStyle = bgCol;
                    ctx.fillRect(13, bodyY + 20, 2, 4);
                }

                let pattern = [];
                let palette = {};

                switch (root.emoteKind) {
                case "heart":
                    palette = { "X": Theme.love.toString(), "H": "#ffffff" };
                    pattern = [
                        ".XX...XX.",
                        "XHXX.XXXX",
                        "XHXXXXXXX",
                        "XXXXXXXXX",
                        ".XXXXXXX.",
                        "..XXXXX..",
                        "...XXX...",
                        "....X...."
                    ];
                    break;

                case "note":
                    palette = { "X": Theme.accent.toString() };
                    pattern = [
                        "...XXXXXX",
                        "...XX..XX",
                        "...X....X",
                        "...X....X",
                        "...X..XXX",
                        ".XXX..XXX",
                        "XXXX...X.",
                        ".XX......"
                    ];
                    break;

                case "exclaim":
                    palette = { "X": Theme.warm.toString() };
                    pattern = [
                        "...XXX...",
                        "...XXX...",
                        "...XXX...",
                        "...XXX...",
                        "....X....",
                        ".........",
                        "...XXX...",
                        "...XXX..."
                    ];
                    break;

                case "question":
                    palette = { "X": Theme.accent.toString() };
                    pattern = [
                        "..XXXXX..",
                        ".XX...XX.",
                        "......XX.",
                        "....XXX..",
                        "...XX....",
                        ".........",
                        "...XX....",
                        "...XX...."
                    ];
                    break;

                case "ellipses":
                    palette = { "X": Theme.subtext.toString() };
                    pattern = [
                        "..........",
                        "..........",
                        "..........",
                        "XX..XX..XX",
                        "XX..XX..XX",
                        "..........",
                        "..........",
                        ".........."
                    ];
                    break;

                case "frustrated":
                    palette = { "X": Theme.danger.toString() };
                    pattern = [
                        "..X...X..",
                        "..X...X..",
                        "XXX...XXX",
                        ".........",
                        ".........",
                        "XXX...XXX",
                        "..X...X..",
                        "..X...X.."
                    ];
                    break;

                case "berry":
                    palette = {
                        "L": Theme.positive.toString(),
                        "B": Theme.accent.toString(),
                        "H": "#ffffff"
                    };
                    pattern = [
                        "..LL.LL..",
                        "...LLL...",
                        "..BBBBB..",
                        ".BHBBBBB.",
                        ".BBBBBBB.",
                        ".BBBBBBB.",
                        "..BBBBB..",
                        "...BBB..."
                    ];
                    break;

                case "sleepy":
                    palette = {
                        "Z": Theme.accent.toString(),
                        "z": Theme.subtext.toString()
                    };
                    pattern = [
                        "....ZZZZZ",
                        ".......Z.",
                        "......Z..",
                        "....ZZZZZ",
                        ".zzz.....",
                        "..z......",
                        ".z.......",
                        ".zzz....."
                    ];
                    break;

                case "dream":
                    palette = {
                        "M": Theme.warm.toString(),
                        "S": Theme.accent.toString()
                    };
                    pattern = [
                        "...MMM.S.",
                        "..MM..SSS",
                        ".MM....S.",
                        ".MM......",
                        ".MM......",
                        "..MM...M.",
                        "...MMMMM.",
                        "....MMM.."
                    ];
                    break;
                }

                if (pattern.length > 0) {
                    const gh = pattern.length * 2;
                    const gw = pattern[0].length * 2;
                    const ox = Math.floor((28 - gw) * 0.5);
                    const oy = bodyY + Math.floor((22 - gh) * 0.5);
                    for (let r = 0; r < pattern.length; r++) {
                        const row = pattern[r];
                        for (let c = 0; c < row.length; c++) {
                            const k = row[c];
                            if (k === "." || !palette[k]) continue;
                            ctx.fillStyle = palette[k];
                            ctx.fillRect(ox + c * 2, oy + r * 2, 2, 2);
                        }
                    }
                }
            }
        }

        ParallelAnimation {
            id: emotePopAnim
            NumberAnimation { target: emoteBadge; property: "scale"; from: 0.65; to: 1.0; duration: 190; easing.type: Easing.OutBack }
            NumberAnimation { target: emoteBadge; property: "popOffsetY"; from: root.flipped ? 0 : 10; to: root.flipped ? 6 : 0; duration: 1250; easing.type: Easing.OutCubic }
            SequentialAnimation {
                PauseAnimation { duration: 880 }
                NumberAnimation { target: emoteBadge; property: "opacity"; from: 0.98; to: 0.0; duration: 370 }
            }
        }
    }
}
