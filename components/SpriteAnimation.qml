import QtQuick
import Quickshell.Io

Item {
    id: root

    property string petColor: "#cba6f7"
    property bool mirror: false
    property string currentState: "idle"
    property real happiness: 0.5
    property real moveSpeed: 0
    property real restDrive: 0
    property string spriteDir: ""
    property var actionMap: ({})

    property var _animData: null
    property string _animName: "Walk"
    property int _frame: 0
    property int _dirRow: 0
    property real danceHue: 0

    readonly property bool useSpriteSheet: _animData !== null && !!_animData["Walk"]

    readonly property var _defaultMap: ({
        "idle": "Walk", "walk": "Walk", "wander": "Walk",
        "sit": "Sleep", "deepsleep": "Laying",
        "react": "Hurt", "dance": "Charge", "drag": "Walk",
        "attack": "Attack", "hop": "Hop", "shoot": "Shoot",
        "charge": "Charge", "double": "Double",
        "lookUp": "LookUp", "nod": "Nod", "pose": "Pose",
        "eat": "Eat", "trip": "Trip", "wake": "Wake",
        "deepBreath": "DeepBreath", "cringe": "Cringe",
        "sitDown": "Sit", "faint": "Faint"
    })

    readonly property var _singleRowAnims: ({"Sleep": true, "Laying": true, "Eat": true, "Sit": true})

    function _resolveAnim(state: string): string {
        return actionMap[state] ?? _defaultMap[state] ?? "Walk";
    }

    function setState(name: string): void {
        currentState = name;
        if (name !== "dance") danceHue = 0;
        var newAnim = _resolveAnim(name);
        if (_animData && !_animData[newAnim]) {
            var fallbacks = {
                "deepsleep": ["Laying", "Faint", "Sleep"],
                "sit": ["Sleep", "Sit", "Walk"],
                "wake": ["Wake", "Hurt", "Walk"],
                "deepBreath": ["DeepBreath", "Sleep", "Walk"],
                "cringe": ["Cringe", "Hurt", "Walk"],
                "lookUp": ["Pose", "Hurt", "Walk"],
                "nod": ["Nod", "Walk"],
                "pose": ["Pose", "Hop", "Walk"],
                "eat": ["Eat", "Walk"],
                "trip": ["Trip", "Hurt", "Walk"],
                "sitDown": ["Sit", "Sleep", "Walk"],
                "faint": ["Faint", "Sleep", "Walk"],
            };
            var chain = fallbacks[name] || [newAnim, "Walk"];
            newAnim = "Walk";
            for (var i = 0; i < chain.length; i++) {
                if (_animData[chain[i]]) { newAnim = chain[i]; break; }
            }
        }
        if (newAnim !== _animName) { _animName = newAnim; _frame = 0; _ticksInFrame = 0; }
        if (_singleRowAnims[newAnim] || name === "drag" || name === "deepsleep") _dirRow = 0;
        if (!useSpriteSheet) _resetBody();
    }

    function setDirection(angle: real): void {
        if (!useSpriteSheet) return;
        if (_singleRowAnims[_animName] || currentState === "drag") return;
        // map angle to PMD 8-direction row order
        var a = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        var sector = Math.round(a / (Math.PI / 4)) % 8;
        var map = [2, 1, 0, 7, 6, 5, 4, 3];
        _dirRow = map[sector];
    }

    FileView {
        id: animFile
        path: root.spriteDir ? root.spriteDir + "/AnimData.xml" : ""
        onLoaded: root._animData = root._parseAnimData(text())
    }

    function _parseAnimData(xml: string): var {
        var anims = {};
        var blocks = xml.match(/<Anim>[\s\S]*?<\/Anim>/g) || [];
        for (var i = 0; i < blocks.length; i++) {
            var b = blocks[i];
            var name = (b.match(/<Name>(.*?)<\/Name>/) || [])[1];
            var copyOf = (b.match(/<CopyOf>(.*?)<\/CopyOf>/) || [])[1];
            if (copyOf) { anims[name] = { copyOf: copyOf }; continue; }
            var fw = parseInt((b.match(/<FrameWidth>(.*?)<\/FrameWidth>/) || [])[1]) || 0;
            var fh = parseInt((b.match(/<FrameHeight>(.*?)<\/FrameHeight>/) || [])[1]) || 0;
            var durMatches = b.match(/<Duration>(\d+)<\/Duration>/g) || [];
            var durs = [];
            for (var j = 0; j < durMatches.length; j++)
                durs.push(parseInt(durMatches[j].match(/\d+/)[0]));
            anims[name] = { frameWidth: fw, frameHeight: fh, durations: durs, frameCount: durs.length };
        }
        // multi-pass CopyOf resolution for chained references
        var maxPasses = 10;
        for (var pass = 0; pass < maxPasses; pass++) {
            var unresolved = false;
            for (var n in anims) {
                if (anims[n].copyOf) {
                    var target = anims[anims[n].copyOf];
                    if (target && !target.copyOf) {
                        anims[n] = Object.assign({}, target);
                    } else if (target) {
                        unresolved = true;
                    }
                }
            }
            if (!unresolved) break;
        }
        return anims;
    }

    property var _currentAnim: useSpriteSheet ? (_animData ? (_animData[_animName] || _animData["Walk"] || null) : null) : null
    property int _ticksInFrame: 0

    // tick speed varies by state for natural feel
    Timer {
        running: root.useSpriteSheet && root._currentAnim !== null
        interval: {
            var s = root.currentState;
            if (s === "walk" || s === "wander" || s === "dance") {
                var sf = Math.max(0.3, root.moveSpeed / 120);
                return Math.max(15, 30 / sf);
            }
            if (s === "sit") return Math.max(60, 250 * root.restDrive);
            if (s === "idle") return 120;
            return 50;
        }
        repeat: true
        onTriggered: {
            var anim = root._currentAnim;
            if (!anim || anim.durations.length === 0) return;
            if (root.currentState === "drag") return;
            root._ticksInFrame++;
            if (root._ticksInFrame >= anim.durations[root._frame]) {
                root._ticksInFrame = 0;
                root._frame = (root._frame + 1) % anim.frameCount;
            }
        }
    }

    Image {
        visible: root.useSpriteSheet && root._currentAnim !== null
        anchors.centerIn: parent
        property int fw: root._currentAnim ? root._currentAnim.frameWidth : 1
        property int fh: root._currentAnim ? root._currentAnim.frameHeight : 1
        source: root.spriteDir ? root.spriteDir + "/" + root._animName + "-Anim.png" : ""
        sourceClipRect: Qt.rect(root._frame * fw, root._dirRow * fh, fw, fh)
        width: fw * (root.width / 32); height: fh * (root.width / 32)
        smooth: false; fillMode: Image.PreserveAspectFit
    }

    // dev mode fallback when no sprite sheets available

    function _resetBody(): void {
        body.scale = 1.0;
        body.opacity = (currentState === "drag") ? 0.75 : 1.0;
        body.width = (currentState === "sit") ? root.width * 1.15 : root.width;
        body.height = (currentState === "sit") ? root.height * 0.75 : root.height;
        root.rotation = 0;
    }

    Rectangle {
        id: body; visible: !root.useSpriteSheet; anchors.centerIn: parent
        width: parent.width; height: parent.height
        radius: (currentState === "sit") ? width * 0.25 : width * 0.2
        color: (currentState === "dance") ? Qt.hsla(danceHue, 0.6, 0.7, 1.0)
             : (currentState === "sit") ? Qt.darker(petColor, 1.15)
             : (currentState === "react") ? Qt.lighter(petColor, 1.3)
             : (currentState === "drag") ? Qt.lighter(petColor, 1.2) : petColor
        transform: Scale { origin.x: body.width / 2; origin.y: body.height / 2; xScale: root.mirror ? -1 : 1 }
        Behavior on color { ColorAnimation { duration: 250 } }
        Row {
            anchors.horizontalCenter: parent.horizontalCenter; anchors.top: parent.top; anchors.topMargin: parent.height * 0.22
            spacing: parent.width * 0.22; visible: root.currentState !== "sit"
            Repeater { model: 2; Rectangle { width: body.width * 0.14; height: width; radius: width / 2; color: Qt.darker(root.petColor, 2.5) } }
        }
        Rectangle {
            anchors.horizontalCenter: parent.horizontalCenter; anchors.top: parent.top; anchors.topMargin: parent.height * 0.52
            width: body.width * (0.12 + root.happiness * 0.12); height: body.height * 0.06
            radius: height / 2; color: Qt.darker(root.petColor, 2.2); visible: root.currentState !== "sit"
        }
    }
    SequentialAnimation { running: !useSpriteSheet && currentState === "idle"; loops: Animation.Infinite
        NumberAnimation { target: body; property: "scale"; from: 1.0; to: 1.03; duration: 1200; easing.type: Easing.InOutSine }
        NumberAnimation { target: body; property: "scale"; from: 1.03; to: 1.0; duration: 1200; easing.type: Easing.InOutSine }
    }
    SequentialAnimation { running: !useSpriteSheet && currentState === "walk"; loops: Animation.Infinite
        ParallelAnimation {
            NumberAnimation { target: body; property: "width"; from: root.width; to: root.width * 1.08; duration: 180 }
            NumberAnimation { target: body; property: "height"; from: root.height; to: root.height * 0.92; duration: 180 }
        }
        ParallelAnimation {
            NumberAnimation { target: body; property: "width"; from: root.width * 1.08; to: root.width; duration: 180 }
            NumberAnimation { target: body; property: "height"; from: root.height * 0.92; to: root.height; duration: 180 }
        }
    }
    SequentialAnimation { running: !useSpriteSheet && currentState === "react"
        NumberAnimation { target: body; property: "scale"; from: 1.0; to: 1.35; duration: 100; easing.type: Easing.OutBack }
        NumberAnimation { target: body; property: "scale"; from: 1.35; to: 0.9; duration: 120; easing.type: Easing.InQuad }
        NumberAnimation { target: body; property: "scale"; from: 0.9; to: 1.0; duration: 200; easing.type: Easing.OutBounce }
    }
    NumberAnimation on danceHue { running: !useSpriteSheet && currentState === "dance"; loops: Animation.Infinite; from: 0; to: 1; duration: 3000 }
}
