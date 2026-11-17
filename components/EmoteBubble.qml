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
        emoteBadge.scale = 0.62;
        emoteBadge.popOffsetY = root.flipped ? 0 : 10;
        emotePopAnim.start();
    }

    onFlippedChanged: dropletCanvas.requestPaint()

    Item {
        id: sleepDrift
        visible: root.sleeping && (Config.showEmotes || root.forceEnabled) && emoteBadge.opacity < 0.05
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
                for (let r = 0; r < rows.length; r++) {
                    const line = rows[r];
                    for (let c = 0; c < line.length; c++) {
                        const ch = line[c];
                        if (ch === ".") continue;
                        ctx.fillStyle = "#2b211b";
                        ctx.fillRect(c * 2 + 1, r * 2 + 1, 2, 2);
                        ctx.fillStyle = ch === "Z" ? "#f7efe2" : "#cbb8ef";
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
                    NumberAnimation { target: sleepDrift; property: "opacity"; from: 0.0; to: 0.78; duration: 1100; easing.type: Easing.OutSine }
                    PauseAnimation { duration: 1400 }
                    NumberAnimation { target: sleepDrift; property: "opacity"; from: 0.78; to: 0.0; duration: 1300; easing.type: Easing.InSine }
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

                // Classic PMD warm cream comic speech droplet with dark cocoa pixel outline
                const bodyY = root.flipped ? 4 : 0;
                const brdCol = "#33251d";
                const bgCol = "#fbf2e3";
                const shadeCol = "#eedec4";
                const rimCol = "#fffaf2";

                ctx.fillStyle = brdCol;
                ctx.fillRect(4, bodyY, 20, 22);
                ctx.fillRect(2, bodyY + 2, 24, 18);
                ctx.fillRect(1, bodyY + 4, 26, 14);
                ctx.fillRect(3, bodyY + 1, 22, 20);

                ctx.fillStyle = bgCol;
                ctx.fillRect(4, bodyY + 1, 20, 20);
                ctx.fillRect(3, bodyY + 2, 22, 18);
                ctx.fillRect(2, bodyY + 4, 24, 14);

                ctx.fillStyle = shadeCol;
                ctx.fillRect(4, bodyY + 19, 20, 2);

                ctx.fillStyle = rimCol;
                ctx.fillRect(5, bodyY + 1, 18, 2);

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
                    palette = { "X": "#e3546d", "D": "#ba374f", "H": "#ffffff" };
                    pattern = [
                        ".XX...XX.",
                        "XHXX.XXXX",
                        "XHXXXXXXD",
                        "XXXXXXXXD",
                        ".XXXXXXD.",
                        "..XXXXD..",
                        "...XXD...",
                        "....D...."
                    ];
                    break;

                case "note":
                    palette = { "X": "#3e8ec4", "A": "#e59934" };
                    pattern = [
                        "...XXXXXX",
                        "...XX..XX",
                        "...X....X",
                        "...X....X",
                        "...X..AAX",
                        ".AAX..AAA",
                        "AAAA...A.",
                        ".AA......"
                    ];
                    break;

                case "exclaim":
                    palette = { "X": "#df8a26", "D": "#b56514" };
                    pattern = [
                        "...XXX...",
                        "...XXX...",
                        "...XXX...",
                        "...XXD...",
                        "....D....",
                        ".........",
                        "...XXX...",
                        "...XXD..."
                    ];
                    break;

                case "question":
                    palette = { "X": "#3b8bc2" };
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
                    palette = { "X": "#6b5647" };
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
                    palette = { "X": "#db5046" };
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
                        "L": "#4da65b",
                        "B": "#3e92cc",
                        "D": "#2b6ea1",
                        "H": "#ffffff"
                    };
                    pattern = [
                        "..LL.LL..",
                        "...LLL...",
                        "..BBBBB..",
                        ".BHBBBBD.",
                        ".BBBBBBD.",
                        ".BBBBBDD.",
                        "..BBBDD..",
                        "...BDD..."
                    ];
                    break;

                case "sleepy":
                    palette = {
                        "Z": "#6d58b5",
                        "z": "#8f7cc9"
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
                        "M": "#de9a2c",
                        "S": "#6f59b8"
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
            NumberAnimation { target: emoteBadge; property: "scale"; from: 0.62; to: 1.0; duration: 200; easing.type: Easing.OutBack }
            NumberAnimation { target: emoteBadge; property: "popOffsetY"; from: root.flipped ? 0 : 10; to: root.flipped ? 6 : 0; duration: 1250; easing.type: Easing.OutCubic }
            SequentialAnimation {
                PauseAnimation { duration: 900 }
                NumberAnimation { target: emoteBadge; property: "opacity"; from: 0.98; to: 0.0; duration: 350 }
            }
        }
    }
}
