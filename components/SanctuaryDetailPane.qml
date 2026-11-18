pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import QtQuick.Window
import "../config"
import "../services"
import "SpeciesProfile.js" as SpeciesProfile
import "behavior/Abilities.js" as Abilities
import "ui/CompanionFormat.js" as Fmt

Rectangle {
    id: root

    required property string selectedPetId
    required property var selectedConfig
    required property var selectedLivePet
    required property var selectedResident
    required property bool selectedIsRoaming
    property bool isNight: false

    property string stageOverrideState: ""
    property bool editingName: false
    property int activePage: 0
    property double nowMs: Date.now()
    property alias confirmRelease: memoTab.confirmRelease
    readonly property bool renameActiveFocus: renameInput.activeFocus

    signal companionSelected(petId: string)
    signal closeCardRequested()
    signal careTriggered(petId: string, animState: string, emoteKind: string)
    signal interacted()

    readonly property var stateSource: {
        void (root.selectedResident ? root.selectedResident.revision : 0);
        void (root.selectedLivePet ? root.selectedLivePet.memoryRevision : 0);
        return root.selectedIsRoaming && root.selectedLivePet
            ? root.selectedLivePet
            : root.selectedResident;
    }

    readonly property var speciesProf: root.selectedConfig
        ? SpeciesProfile.profileFor(root.selectedConfig.sprite)
        : SpeciesProfile.profileFor(SpeciesProfile.DEFAULT_SPECIES)

    readonly property var biomeTheme: Fmt.biomePalette(root.speciesProf.biome, root.isNight)

    readonly property var speciesAbilities: root.selectedConfig
        ? Abilities.abilitiesFor(root.selectedConfig.sprite)
        : []

    readonly property real currentBond: {
        const src = root.stateSource;
        return src && src.bond !== undefined ? src.bond : 0.30;
    }

    readonly property real currentAgeSec: {
        const src = root.stateSource;
        return src && src.ageSeconds !== undefined ? src.ageSeconds : 0;
    }

    readonly property string rawActivityState: {
        if (root.stageOverrideState.length > 0) return root.stageOverrideState;
        const src = root.stateSource;
        if (!src) return "idle";
        if (root.selectedIsRoaming && root.selectedLivePet) {
            return src.state_ || "idle";
        }
        return src.penState || "idle";
    }

    readonly property string portraitAnimState: {
        if (root.stageOverrideState.length > 0) return root.stageOverrideState;
        const s = root.rawActivityState;
        if (s === "walk" || s === "wander" || s === "zoomies" || s === "airborne" || s === "drag" || s === "perch") {
            return "idle";
        }
        return s;
    }

    onSelectedPetIdChanged: {
        editingName = false;
        memoTab.optionsExpanded = false;
        stageOverrideState = "";
        stageOverrideTimer.stop();
        if (selectedConfig) renameInput.text = selectedConfig.name;
    }

    onSelectedConfigChanged: {
        if (selectedConfig && !renameInput.activeFocus) {
            renameInput.text = selectedConfig.name;
        }
    }

    Timer {
        id: stageOverrideTimer
        interval: 1650
        onTriggered: root.stageOverrideState = ""
    }

    Timer {
        interval: 30000
        running: root.visible && root.Window.visibility !== Window.Hidden
        repeat: true
        onTriggered: root.nowMs = Date.now()
    }

    function startRename(): void {
        if (!root.selectedConfig) return;
        renameInput.text = root.selectedConfig.name;
        root.editingName = true;
        renameInput.forceActiveFocus();
        renameInput.selectAll();
    }

    function cancelRename(): void {
        if (root.selectedConfig) renameInput.text = root.selectedConfig.name;
        root.editingName = false;
        renameInput.focus = false;
    }

    function commitRename(): void {
        if (!root.selectedConfig) return;
        const next = renameInput.text.trim();
        if (next.length > 0 && next !== root.selectedConfig.name) {
            const res = PetManager.renameCompanion(root.selectedConfig.id, next);
            if (res) renameInput.text = res;
        } else {
            renameInput.text = root.selectedConfig.name;
        }
        root.editingName = false;
        renameInput.focus = false;
    }

    property bool stageBerryVisible: false
    property real stageBerryDrop: 0

    Timer {
        id: stageBerryTimer
        interval: 1050
        onTriggered: root.stageBerryVisible = false
    }

    NumberAnimation {
        id: stageBerryBounce
        target: root
        property: "stageBerryDrop"
        from: -16
        to: 0
        duration: 300
        easing.type: Easing.OutBounce
    }

    function triggerCareAction(act: string): void {
        if (!root.selectedConfig) return;
        const prof = root.speciesProf;
        const prevRaw = root.rawActivityState;
        const wasSleeping = prevRaw === "deepsleep" || prevRaw === "loaf" || prevRaw === "laying" || prevRaw === "sit";
        let feedOutcome = "ate";

        if (root.selectedIsRoaming && root.selectedLivePet) {
            const lp = root.selectedLivePet;
            if (act === "pat") lp.onStroked();
            else if (act === "feed") {
                if ((lp.activePlan && lp.activePlan.name === "eat_berry") || (lp._mealUntil > Date.now())) {
                    return;
                }
                const prevSat = lp.satiety ?? 0.58;
                lp.onFed();
                if ((lp.satiety ?? 0.58) > prevSat + 0.01) {
                    feedOutcome = "ate";
                } else {
                    feedOutcome = (lp._stuffedRefusals || 0) >= 2 ? "annoyed" : "refused";
                }
            }
            else if (act === "play") lp.onPlayTriggered();
            else if (act === "summon") lp.summonToCursor();
        } else if (root.selectedResident) {
            if (act === "pat") root.selectedResident.patInPen();
            else if (act === "feed") {
                feedOutcome = root.selectedResident.feedInPen();
                if (feedOutcome === "busy") return;
            }
            else if (act === "play") root.selectedResident.playInPen();
        }

        let anim = "nod";
        let emote = "heart";
        if (act === "pat") {
            if (wasSleeping) {
                anim = SpeciesProfile.wakeStateFor({ petData: { sprite: root.selectedConfig.sprite } });
            } else {
                anim = (prof.affectionGestures && prof.affectionGestures.length > 0)
                    ? prof.affectionGestures[0]
                    : "nod";
            }
            emote = "heart";
            stageSprite.triggerSquash(1.15, 0.86);
        } else if (act === "feed") {
            if (feedOutcome === "annoyed") {
                anim = "cringe";
                emote = "frustrated";
                root.stageBerryVisible = false;
                stageSprite.triggerSquash(0.92, 1.08);
            } else if (feedOutcome === "refused") {
                anim = "nod";
                emote = "ellipses";
                root.stageBerryVisible = true;
                stageBerryBounce.restart();
                stageBerryTimer.interval = 1450;
                stageBerryTimer.restart();
                stageSprite.triggerSquash(1.04, 0.96);
            } else {
                anim = "eat";
                emote = "berry";
                root.stageBerryVisible = true;
                stageBerryBounce.restart();
                stageBerryTimer.interval = 1050;
                stageBerryTimer.restart();
                stageSprite.triggerSquash(1.12, 0.88);
            }
        } else if (act === "play") {
            anim = wasSleeping
                ? SpeciesProfile.wakeStateFor({ petData: { sprite: root.selectedConfig.sprite } })
                : ((prof.signature && prof.signature.state) ? prof.signature.state : "hop");
            emote = "note";
            stageSprite.triggerSquash(0.88, 1.16);
        } else if (act === "summon") {
            anim = "hop";
            emote = "exclaim";
            stageSprite.triggerSquash(0.90, 1.12);
        }
        const sameOverride = root.stageOverrideState === anim && anim.length > 0;
        root.stageOverrideState = anim;
        if (sameOverride) stageSprite.restartClip();
        stageBubble.showEmote(emote);
        stageOverrideTimer.restart();
        root.careTriggered(root.selectedConfig.id, anim, emote);
    }

    function _playEvolutionCeremony(): void {
        root.stageOverrideState = "emit";
        stageSprite.triggerSquash(1.18, 0.84);
        stageBubble.showEmote("heart");
        stageOverrideTimer.restart();
        if (root.selectedConfig) {
            root.careTriggered(root.selectedConfig.id, "emit", "heart");
        }
    }

    width: 358
    implicitWidth: 358
    radius: Theme.radius(3)
    color: Theme.alpha(Theme.panel, 0.96)
    border.width: 1
    border.color: Theme.border

    Rectangle {
        visible: Theme.specularRim
        anchors.fill: parent
        anchors.margins: 3
        radius: Math.max(4, root.radius - 3)
        color: "transparent"
        border.width: 1
        border.color: Theme.alpha(Theme.rimHighlight, 0.5)
    }

    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
    }

    TapHandler {
        onPressedChanged: {
            if (pressed) root.interacted();
        }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 8

        Rectangle {
            id: habitatStage
            Layout.fillWidth: true
            implicitHeight: 96
            radius: Theme.radius(0)
            clip: true
            color: root.biomeTheme.turf
            border.width: 1
            border.color: root.biomeTheme.turfRim

            Image {
                anchors.fill: parent
                smooth: false
                fillMode: Image.PreserveAspectCrop
                source: Qt.resolvedUrl("../assets/sanctuary/biomes/" + root.biomeTheme.backdrop)
            }

            Rectangle {
                anchors.fill: parent
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0.0; color: root.isNight ? "#38101628" : "#12140f0c" }
                    GradientStop { position: 0.34; color: root.isNight ? "#66121624" : "#521a1410" }
                    GradientStop { position: 1.0; color: root.isNight ? "#80121624" : "#701a1410" }
                }
            }

            Rectangle {
                z: 5
                anchors.top: parent.top
                anchors.right: parent.right
                anchors.margins: 8
                width: 24
                height: 24
                radius: 12
                color: closeCardMouse.containsMouse
                    ? Theme.alpha(Theme.panel, 0.92)
                    : Theme.alpha(Theme.panel, 0.62)
                border.width: 1
                border.color: Theme.alpha(Theme.border, 0.7)

                UiIcon {
                    anchors.centerIn: parent
                    name: "close"
                    size: 10
                    color: Theme.text
                }

                MouseArea {
                    id: closeCardMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.closeCardRequested()
                }
            }

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 14
                anchors.rightMargin: 36
                anchors.topMargin: 10
                anchors.bottomMargin: 8
                spacing: 12

                Item {
                    Layout.preferredWidth: 72
                    Layout.preferredHeight: 86

                    SpriteAnimation {
                        id: stageSprite
                        anchors.horizontalCenter: parent.horizontalCenter
                        anchors.bottom: parent.bottom
                        anchors.bottomMargin: 2
                        width: 64
                        height: 64
                        speciesName: root.selectedConfig ? root.selectedConfig.sprite : SpeciesProfile.DEFAULT_SPECIES
                        showShadow: true
                        currentState: root.portraitAnimState
                        spriteDir: root.selectedConfig
                            ? Qt.resolvedUrl("../assets/sprites/" + root.selectedConfig.sprite)
                            : ""
                    }

                    EmoteBubble {
                        id: stageBubble
                        anchors.horizontalCenter: parent.horizontalCenter
                        y: -2
                        z: 10
                        sleeping: root.rawActivityState === "deepsleep"
                        forceEnabled: true
                    }

                    Image {
                        visible: root.stageBerryVisible
                        x: parent.width - 20
                        y: parent.height - 20 + root.stageBerryDrop
                        z: 8
                        width: 16
                        height: 16
                        smooth: false
                        source: Qt.resolvedUrl("../assets/sanctuary/items/oran_berry.png")
                    }

                    MouseArea {
                        id: stageMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.triggerCareAction("pat")
                    }

                    UiTooltip {
                        active: stageMouse.containsMouse
                        text: "Click to pet!"
                    }
                }

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 4

                    RowLayout {
                        visible: !root.editingName
                        Layout.fillWidth: true
                        spacing: 5

                        Text {
                            Layout.maximumWidth: 168
                            elide: Text.ElideRight
                            text: root.selectedConfig ? root.selectedConfig.name : ""
                            color: "#fff9ee"
                            font.family: Theme.uiFont
                            font.pixelSize: 18
                            font.weight: Font.Bold
                        }

                        Rectangle {
                            implicitWidth: 22
                            implicitHeight: 22
                            radius: 11
                            color: editMouse.containsMouse
                                ? Theme.alpha(Theme.panel, 0.72)
                                : Theme.alpha(Theme.panel, 0.35)

                            UiIcon {
                                anchors.centerIn: parent
                                name: "edit"
                                size: 11
                                color: "#fff9ee"
                            }

                            MouseArea {
                                id: editMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: root.startRename()
                            }

                            UiTooltip {
                                active: editMouse.containsMouse
                                text: "Give nickname"
                            }
                        }
                    }

                    RowLayout {
                        visible: root.editingName
                        Layout.fillWidth: true
                        spacing: 4

                        Rectangle {
                            Layout.fillWidth: true
                            implicitHeight: 28
                            radius: Theme.radius(-7)
                            color: Theme.panel
                            border.width: 1
                            border.color: Theme.warm

                            TextInput {
                                id: renameInput
                                anchors.fill: parent
                                anchors.leftMargin: 8
                                anchors.rightMargin: 8
                                verticalAlignment: TextInput.AlignVCenter
                                selectByMouse: true
                                maximumLength: 24
                                text: root.selectedConfig ? root.selectedConfig.name : ""
                                color: Theme.text
                                font.family: Theme.uiFont
                                font.pixelSize: 13
                                font.weight: Font.DemiBold
                                clip: true
                                onAccepted: root.commitRename()

                                HoverHandler {
                                    cursorShape: Qt.IBeamCursor
                                }
                            }
                        }

                        Rectangle {
                            implicitWidth: 26
                            implicitHeight: 26
                            radius: 13
                            color: Theme.warm

                            UiIcon {
                                anchors.centerIn: parent
                                name: "check"
                                size: 11
                                color: Theme.overWarm
                            }

                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                                onClicked: root.commitRename()
                            }
                        }

                        Rectangle {
                            implicitWidth: 26
                            implicitHeight: 26
                            radius: 13
                            color: Theme.alpha(Theme.panel, 0.85)

                            UiIcon {
                                anchors.centerIn: parent
                                name: "close"
                                size: 10
                                color: Theme.subtext
                            }

                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                                onClicked: root.cancelRename()
                            }
                        }
                    }

                    RowLayout {
                        spacing: 5

                        UiIcon {
                            name: root.biomeTheme.icon
                            size: 11
                            color: root.biomeTheme.accent
                        }

                        Text {
                            text: root.speciesProf.displayName + "  ·  " + root.speciesProf.biome
                            color: "#ece2d0"
                            font.family: Theme.uiFont
                            font.pixelSize: 11
                            font.weight: Font.Medium
                        }
                    }

                    PokemonHearts {
                        bond: root.currentBond
                        heartSize: 13
                        showLabel: true
                    }
                }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: 7

            Item {
                Layout.fillWidth: true
                implicitHeight: 38

                Rectangle {
                    anchors.fill: parent
                    anchors.topMargin: 2
                    radius: Theme.radius(-4)
                    color: root.selectedIsRoaming ? "#3b2320" : "#1f3825"
                }

                Rectangle {
                    anchors.fill: parent
                    anchors.bottomMargin: pokeballCallMouse.pressed ? 0 : 2
                    anchors.topMargin: pokeballCallMouse.pressed ? 2 : 0
                    radius: Theme.radius(-4)
                    color: root.selectedIsRoaming
                        ? (pokeballCallMouse.containsMouse ? Theme.pokeball : Theme.pokeballSoft)
                        : (pokeballCallMouse.containsMouse ? Theme.positive : Theme.positiveSoft)
                    border.width: 1
                    border.color: root.selectedIsRoaming ? Theme.pokeball : Theme.positive
                    Behavior on color { ColorAnimation { duration: 110 } }

                    RowLayout {
                        anchors.centerIn: parent
                        spacing: 7

                        UiIcon {
                            name: "pokeball"
                            filled: true
                            size: 15
                            color: Theme.border
                            accentColor: Theme.pokeball
                        }

                        Text {
                            text: {
                                const nm = root.selectedConfig ? root.selectedConfig.name : "Partner";
                                return root.selectedIsRoaming
                                    ? ("Come back, " + nm + "!")
                                    : ("Go, " + nm + "!");
                            }
                            color: pokeballCallMouse.containsMouse
                                ? (root.selectedIsRoaming ? Theme.overPokeball : Theme.overPositive)
                                : Theme.text
                            font.family: Theme.uiFont
                            font.pixelSize: 12
                            font.weight: Font.Bold
                        }
                    }
                }

                MouseArea {
                    id: pokeballCallMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                        if (!root.selectedConfig) return;
                        if (root.selectedIsRoaming) {
                            PetManager.sendToPenNow(root.selectedConfig.id, false);
                        } else {
                            PetManager.callOutNow(root.selectedConfig.id);
                        }
                    }
                }
            }
        }

        Rectangle {
            Layout.fillWidth: true
            implicitHeight: 32
            radius: Theme.radius(-5)
            color: Theme.parchment
            border.width: 1
            border.color: Theme.borderSubtle

            RowLayout {
                anchors.fill: parent
                anchors.margins: 3
                spacing: 3

                Repeater {
                    model: [
                        { label: "Care & Treats", icon: "paw" },
                        { label: "Trainer's Memo", icon: "ribbon" }
                    ]

                    Rectangle {
                        id: pgTab
                        required property var modelData
                        required property int index
                        readonly property bool active: root.activePage === pgTab.index
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        radius: Theme.radius(-7)
                        color: active
                            ? Theme.surfaceAlt
                            : (pgTabMouse.containsMouse ? Theme.alpha(Theme.surfaceAlt, 0.5) : "transparent")
                        border.width: active ? 1 : 0
                        border.color: Theme.alpha(Theme.warm, 0.5)

                        RowLayout {
                            anchors.centerIn: parent
                            spacing: 6

                            UiIcon {
                                name: pgTab.modelData.icon
                                size: 12
                                color: pgTab.active ? Theme.warm : Theme.muted
                            }

                            Text {
                                text: pgTab.modelData.label
                                color: pgTab.active ? Theme.text : Theme.subtext
                                font.family: Theme.uiFont
                                font.pixelSize: 11
                                font.weight: pgTab.active ? Font.DemiBold : Font.Normal
                            }
                        }

                        MouseArea {
                            id: pgTabMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                root.activePage = pgTab.index;
                                cardFlick.contentY = 0;
                            }
                        }
                    }
                }
            }
        }

        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true

            Flickable {
                id: cardFlick
                anchors.fill: parent
                clip: true
                contentWidth: width
                contentHeight: root.activePage === 0 ? careTab.implicitHeight : memoTab.implicitHeight
                boundsBehavior: Flickable.StopAtBounds
                interactive: contentHeight > height

                WheelHandler {
                    onWheel: event => {
                        if (cardFlick.contentHeight <= cardFlick.height) return;
                        const maxY = Math.max(0, cardFlick.contentHeight - cardFlick.height);
                        cardFlick.contentY = Math.max(0, Math.min(maxY, cardFlick.contentY - event.angleDelta.y * 0.6));
                    }
                }

                SanctuaryCareTab {
                    id: careTab
                    visible: root.activePage === 0
                    width: cardFlick.width - (cardFlick.contentHeight > cardFlick.height ? 8 : 0)
                    selectedConfig: root.selectedConfig
                    selectedLivePet: root.selectedLivePet
                    selectedResident: root.selectedResident
                    selectedIsRoaming: root.selectedIsRoaming
                    stateSource: root.stateSource
                    currentAnimState: root.rawActivityState
                    onCareRequested: act => root.triggerCareAction(act)
                    onEvolvedCeremony: root._playEvolutionCeremony()
                }

                SanctuaryMemoTab {
                    id: memoTab
                    visible: root.activePage === 1
                    width: cardFlick.width - (cardFlick.contentHeight > cardFlick.height ? 8 : 0)
                    selectedConfig: root.selectedConfig
                    stateSource: root.stateSource
                    selectedIsRoaming: root.selectedIsRoaming
                    speciesAbilities: root.speciesAbilities
                    currentAgeSec: root.currentAgeSec
                    nowMs: root.nowMs
                    onCompanionSelected: petId => root.companionSelected(petId)
                }
            }

            Rectangle {
                visible: cardFlick.contentHeight > cardFlick.height && cardFlick.height > 24
                anchors.right: parent.right
                width: 4
                radius: 2
                color: Theme.alpha(Theme.muted, 0.45)
                readonly property real ratio: Math.min(1, cardFlick.height / Math.max(1, cardFlick.contentHeight))
                height: Math.max(24, Math.round(cardFlick.height * ratio))
                y: Math.round(
                    (cardFlick.height - height)
                    * Math.max(0, Math.min(1, cardFlick.contentY / Math.max(1, cardFlick.contentHeight - cardFlick.height)))
                )
            }
        }
    }
}
