pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
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

    property string stageOverrideState: ""
    property bool editingName: false
    property bool morphExpanded: false
    property alias confirmRelease: releaseBtn.armed
    readonly property bool renameActiveFocus: renameInput.activeFocus

    signal companionSelected(petId: string)

    readonly property var connectedMonitors: {
        const screens = WindowTracker.realScreens;
        const out = [""];
        for (let i = 0; i < screens.length; i++) out.push(screens[i].name);
        return out;
    }

    readonly property string abilityTooltip: {
        if (!root.selectedConfig) return "";
        const abs = Abilities.abilitiesFor(root.selectedConfig.sprite);
        if (abs.length === 0) return "";
        return abs.map(a => a.label + " — " + a.summary).join("\n");
    }

    onSelectedPetIdChanged: {
        morphExpanded = false;
        editingName = false;
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

    function triggerCareAction(act: string): void {
        if (!root.selectedConfig) return;
        const prof = SpeciesProfile.profileFor(root.selectedConfig.sprite);
        if (root.selectedIsRoaming && root.selectedLivePet) {
            if (act === "pat") root.selectedLivePet.onStroked();
            else if (act === "feed") root.selectedLivePet.onFed();
            else if (act === "play") root.selectedLivePet.onPlayTriggered();
            else if (act === "summon") root.selectedLivePet.summonToCursor();
        } else if (root.selectedResident) {
            if (act === "pat") root.selectedResident.patInPen();
            else if (act === "feed") root.selectedResident.feedInPen();
            else if (act === "play") root.selectedResident.playInPen();
        }

        if (act === "pat") {
            const gest = (prof.affectionGestures && prof.affectionGestures.length > 0)
                ? prof.affectionGestures[0]
                : "nod";
            root.stageOverrideState = gest;
            stageSprite.triggerSquash(1.15, 0.86);
            stageBubble.showEmote("heart");
            stageOverrideTimer.restart();
        } else if (act === "feed") {
            root.stageOverrideState = "eat";
            stageSprite.triggerSquash(1.12, 0.88);
            stageBubble.showEmote("berry");
            stageOverrideTimer.restart();
        } else if (act === "play") {
            root.stageOverrideState = (prof.signature && prof.signature.state) ? prof.signature.state : "hop";
            stageSprite.triggerSquash(0.88, 1.16);
            stageBubble.showEmote("note");
            stageOverrideTimer.restart();
        } else if (act === "summon") {
            stageSprite.triggerSquash(0.90, 1.12);
            stageBubble.showEmote("exclaim");
        }
    }

    Layout.fillWidth: true
    Layout.fillHeight: true
    radius: Theme.radius(0)
    color: Theme.surface
    border.width: 1
    border.color: Theme.borderSubtle

    Flickable {
        id: detailFlick
        anchors.fill: parent
        anchors.margins: 16
        clip: true
        contentWidth: width
        contentHeight: detailCol.implicitHeight
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height

        ColumnLayout {
            id: detailCol
            width: detailFlick.width
            spacing: 12

            RowLayout {
                Layout.fillWidth: true
                spacing: 14

                Rectangle {
                    id: heroStage
                    implicitWidth: 92
                    implicitHeight: 92
                    radius: Theme.radius(-2)
                    color: Theme.bg
                    border.width: 1
                    border.color: stageMouse.containsMouse
                        ? Theme.accent
                        : (root.selectedIsRoaming ? Theme.alpha(Theme.positive, 0.55) : Theme.alpha(Theme.warm, 0.5))

                    Rectangle {
                        anchors.centerIn: parent
                        width: 58
                        height: 58
                        radius: 29
                        color: root.selectedIsRoaming
                            ? Theme.alpha(Theme.positive, 0.08)
                            : Theme.alpha(Theme.warm, 0.08)
                    }

                    Rectangle {
                        anchors.horizontalCenter: parent.horizontalCenter
                        anchors.bottom: parent.bottom
                        anchors.bottomMargin: 15
                        width: 56
                        height: 1
                        color: Theme.borderSubtle
                    }

                    SpriteAnimation {
                        id: stageSprite
                        anchors.centerIn: parent
                        anchors.verticalCenterOffset: 4
                        width: 64
                        height: 64
                        speciesName: root.selectedConfig ? root.selectedConfig.sprite : "zorua"
                        currentState: {
                            void (root.selectedResident ? root.selectedResident.revision : 0);
                            if (root.stageOverrideState.length > 0) return root.stageOverrideState;
                            if (root.selectedIsRoaming && root.selectedLivePet) {
                                return root.selectedLivePet.state_ === "drag" ? "idle" : root.selectedLivePet.state_;
                            }
                            return root.selectedResident ? root.selectedResident.penState : "idle";
                        }
                        spriteDir: root.selectedConfig
                            ? Qt.resolvedUrl("../assets/sprites/" + root.selectedConfig.sprite)
                            : ""
                    }

                    EmoteBubble {
                        id: stageBubble
                        anchors.horizontalCenter: parent.horizontalCenter
                        y: -4
                        z: 10
                        forceEnabled: true
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
                        text: "Click to pat"
                    }
                }

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 6

                    Flow {
                        Layout.fillWidth: true
                        spacing: 8

                        RowLayout {
                            visible: !root.editingName
                            spacing: 6

                            Text {
                                text: root.selectedConfig ? root.selectedConfig.name : ""
                                color: Theme.text
                                font.family: Theme.uiFont
                                font.pixelSize: 18
                                font.weight: Font.Bold
                            }

                            Rectangle {
                                implicitWidth: 24
                                implicitHeight: 24
                                radius: Theme.radius(-8)
                                color: editNameMouse.containsMouse ? Theme.surfaceAlt : "transparent"

                                UiIcon {
                                    anchors.centerIn: parent
                                    name: "edit"
                                    size: 12
                                    color: editNameMouse.containsMouse ? Theme.accent : Theme.muted
                                }

                                MouseArea {
                                    id: editNameMouse
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: root.startRename()
                                }

                                UiTooltip {
                                    active: editNameMouse.containsMouse
                                    text: "Rename companion"
                                }
                            }
                        }

                        RowLayout {
                            visible: root.editingName
                            spacing: 6

                            Rectangle {
                                implicitWidth: 180
                                implicitHeight: 28
                                radius: Theme.radius(-7)
                                color: Theme.bg
                                border.width: 1
                                border.color: Theme.accent

                                TextInput {
                                    id: renameInput
                                    anchors.fill: parent
                                    anchors.leftMargin: 9
                                    anchors.rightMargin: 9
                                    verticalAlignment: TextInput.AlignVCenter
                                    selectByMouse: true
                                    maximumLength: 28
                                    text: root.selectedConfig ? root.selectedConfig.name : ""
                                    color: Theme.text
                                    font.family: Theme.uiFont
                                    font.pixelSize: 13
                                    font.weight: Font.DemiBold
                                    clip: true
                                    onAccepted: root.commitRename()
                                    onActiveFocusChanged: {
                                        if (!activeFocus && root.editingName) {
                                            Qt.callLater(() => {
                                                if (!renameInput.activeFocus && root.editingName) {
                                                    root.cancelRename();
                                                }
                                            });
                                        }
                                    }

                                    HoverHandler {
                                        cursorShape: Qt.IBeamCursor
                                    }
                                }
                            }

                            Rectangle {
                                implicitWidth: 28
                                implicitHeight: 28
                                radius: Theme.radius(-7)
                                color: saveRenameMouse.containsMouse ? Theme.accent : Theme.accentSoft
                                border.width: 1
                                border.color: Theme.accent

                                UiIcon {
                                    anchors.centerIn: parent
                                    name: "check"
                                    size: 12
                                    color: saveRenameMouse.containsMouse ? Theme.overAccent : Theme.accent
                                }

                                MouseArea {
                                    id: saveRenameMouse
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: root.commitRename()
                                }
                            }

                            Rectangle {
                                implicitWidth: 28
                                implicitHeight: 28
                                radius: Theme.radius(-7)
                                color: cancelRenameMouse.containsMouse ? Theme.surfaceAlt : Theme.bg
                                border.width: 1
                                border.color: Theme.borderSubtle

                                UiIcon {
                                    anchors.centerIn: parent
                                    name: "close"
                                    size: 11
                                    color: Theme.subtext
                                }

                                MouseArea {
                                    id: cancelRenameMouse
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: root.cancelRename()
                                }
                            }
                        }

                        Rectangle {
                            implicitHeight: 22
                            radius: Theme.radius(-8)
                            color: Theme.alpha(Theme.accent, 0.14)
                            border.width: 1
                            border.color: spBadgeHover.containsMouse && root.abilityTooltip.length > 0
                                ? Theme.accent
                                : Theme.alpha(Theme.accent, 0.28)
                            implicitWidth: spTagRow.implicitWidth + 14

                            RowLayout {
                                id: spTagRow
                                anchors.centerIn: parent
                                spacing: 6

                                Text {
                                    text: {
                                        if (!root.selectedConfig) return "";
                                        const prof = SpeciesProfile.profileFor(root.selectedConfig.sprite);
                                        const abs = Abilities.abilitiesFor(root.selectedConfig.sprite);
                                        const abLabel = abs.length > 0 ? ("  ·  " + abs[0].label) : "";
                                        return prof.displayName + "  ·  " + prof.biome + abLabel;
                                    }
                                    color: Theme.accent
                                    font.family: Theme.uiFont
                                    font.pixelSize: 10
                                    font.weight: Font.DemiBold
                                }

                                Text {
                                    text: {
                                        void (root.selectedResident ? root.selectedResident.revision : 0);
                                        const age = root.selectedIsRoaming && root.selectedLivePet
                                            ? root.selectedLivePet.ageSeconds
                                            : (root.selectedResident ? root.selectedResident.ageSeconds : 0);
                                        return Fmt.formatAge(age);
                                    }
                                    color: Theme.subtext
                                    font.family: Theme.monoFont
                                    font.pixelSize: 10
                                }
                            }

                            MouseArea {
                                id: spBadgeHover
                                anchors.fill: parent
                                hoverEnabled: true
                            }

                            UiTooltip {
                                active: spBadgeHover.containsMouse
                                text: root.abilityTooltip
                            }
                        }
                    }

                    Text {
                        Layout.fillWidth: true
                        wrapMode: Text.WordWrap
                        text: {
                            void (root.selectedResident ? root.selectedResident.revision : 0);
                            const arch = root.selectedIsRoaming && root.selectedLivePet
                                ? root.selectedLivePet.archetype
                                : (root.selectedResident ? root.selectedResident.archetype : "Curious Hatchling");
                            const blurb = root.selectedConfig
                                ? SpeciesProfile.profileFor(root.selectedConfig.sprite).blurb
                                : "";
                            return arch + "  —  " + blurb;
                        }
                        color: Theme.warm
                        font.family: Theme.uiFont
                        font.pixelSize: 11
                        font.weight: Font.Medium
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 6

                        Rectangle {
                            implicitWidth: 6
                            implicitHeight: 6
                            radius: 3
                            color: root.selectedIsRoaming ? Theme.positive : Theme.warm
                        }

                        Text {
                            Layout.fillWidth: true
                            elide: Text.ElideRight
                            text: {
                                void (root.selectedResident ? root.selectedResident.revision : 0);
                                if (root.selectedIsRoaming && root.selectedLivePet) {
                                    const p = root.selectedLivePet;
                                    const lbl = p.activePlan ? p.activePlan.label : "Observing desktop";
                                    const note = p.lastThoughtText || "";
                                    return "Roaming  ·  " + lbl + (note ? ("  —  " + note) : "");
                                }
                                const act = root.selectedResident
                                    ? root.selectedResident.sanctuaryActivity
                                    : "Resting quietly in the Sanctuary";
                                return "Sanctuary  ·  " + act;
                            }
                            color: Theme.subtext
                            font.family: Theme.uiFont
                            font.pixelSize: 11
                        }
                    }
                }
            }

            Rectangle {
                Layout.fillWidth: true
                radius: Theme.radius(-3)
                color: Theme.bg
                border.width: 1
                border.color: Theme.borderSubtle
                implicitHeight: controlsCol.implicitHeight + 18

                ColumnLayout {
                    id: controlsCol
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.top: parent.top
                    anchors.margins: 9
                    spacing: 8

                    Flow {
                        Layout.fillWidth: true
                        spacing: 8

                        RowLayout {
                            height: 28
                            spacing: 8

                            Text {
                                text: "Roaming"
                                color: Theme.subtext
                                font.family: Theme.uiFont
                                font.pixelSize: 11
                            }

                            Rectangle {
                                implicitHeight: 28
                                implicitWidth: policyRow.implicitWidth + 4
                                radius: Theme.radius(-6)
                                color: Theme.surface
                                border.width: 1
                                border.color: Theme.borderSubtle

                                RowLayout {
                                    id: policyRow
                                    anchors.centerIn: parent
                                    spacing: 2

                                    Repeater {
                                        model: [
                                            {
                                                mode: "auto",
                                                label: "Auto Rotate",
                                                tip: "Naturally rotates between desktop and Sanctuary based on energy and rhythm"
                                            },
                                            {
                                                mode: "always",
                                                label: "Always Out",
                                                tip: "Stays on your desktop unless manually tucked into the Sanctuary"
                                            },
                                            {
                                                mode: "penned",
                                                label: "Stay in Sanctuary",
                                                tip: "Rests permanently in the Sanctuary until called out"
                                            }
                                        ]

                                        Rectangle {
                                            id: modeBtn
                                            required property var modelData
                                            readonly property bool active: root.selectedConfig !== null
                                                && (root.selectedConfig.roamMode || "auto") === modeBtn.modelData.mode
                                            implicitHeight: 24
                                            implicitWidth: modeBtnTxt.implicitWidth + 16
                                            radius: Theme.radius(-8)
                                            color: active
                                                ? Theme.accentSoft
                                                : (modeBtnMouse.containsMouse ? Theme.surfaceAlt : "transparent")
                                            border.width: active ? 1 : 0
                                            border.color: Theme.accent

                                            Text {
                                                id: modeBtnTxt
                                                anchors.centerIn: parent
                                                text: modeBtn.modelData.label
                                                color: modeBtn.active ? Theme.accent : Theme.subtext
                                                font.family: Theme.uiFont
                                                font.pixelSize: 11
                                                font.weight: modeBtn.active ? Font.DemiBold : Font.Normal
                                            }

                                            MouseArea {
                                                id: modeBtnMouse
                                                anchors.fill: parent
                                                hoverEnabled: true
                                                cursorShape: Qt.PointingHandCursor
                                                onClicked: {
                                                    if (root.selectedConfig) {
                                                        Config.updatePetRoamMode(root.selectedConfig.id, modeBtn.modelData.mode);
                                                    }
                                                }
                                            }

                                            UiTooltip {
                                                active: modeBtnMouse.containsMouse
                                                text: modeBtn.modelData.tip
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        RowLayout {
                            height: 28
                            spacing: 6

                            Rectangle {
                                visible: !root.selectedIsRoaming
                                implicitHeight: 28
                                radius: Theme.radius(-7)
                                implicitWidth: callNowTxt.implicitWidth + 18
                                color: callNowMouse.containsMouse
                                    ? Theme.alpha(Theme.positive, 0.24)
                                    : Theme.alpha(Theme.positive, 0.14)
                                border.width: 1
                                border.color: Theme.positive

                                Text {
                                    id: callNowTxt
                                    anchors.centerIn: parent
                                    text: "Call Out to Desktop"
                                    color: Theme.positive
                                    font.family: Theme.uiFont
                                    font.pixelSize: 11
                                    font.weight: Font.DemiBold
                                }

                                MouseArea {
                                    id: callNowMouse
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: {
                                        if (root.selectedConfig) PetManager.callOutNow(root.selectedConfig.id);
                                    }
                                }
                            }

                            Rectangle {
                                visible: root.selectedIsRoaming
                                implicitHeight: 28
                                radius: Theme.radius(-7)
                                implicitWidth: walkPenTxt.implicitWidth + 16
                                color: walkPenMouse.containsMouse ? Theme.alpha(Theme.warm, 0.16) : Theme.surface
                                border.width: 1
                                border.color: Theme.alpha(Theme.warm, 0.6)

                                Text {
                                    id: walkPenTxt
                                    anchors.centerIn: parent
                                    text: "Walk Off"
                                    color: Theme.warm
                                    font.family: Theme.uiFont
                                    font.pixelSize: 11
                                    font.weight: Font.Medium
                                }

                                MouseArea {
                                    id: walkPenMouse
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: {
                                        if (root.selectedConfig) PetManager.sendToPenNow(root.selectedConfig.id, true);
                                    }
                                }

                                UiTooltip {
                                    active: walkPenMouse.containsMouse
                                    text: "Have companion stroll to the screen edge and retire to the Sanctuary"
                                }
                            }

                            Rectangle {
                                visible: root.selectedIsRoaming
                                implicitHeight: 28
                                radius: Theme.radius(-7)
                                implicitWidth: instPenTxt.implicitWidth + 16
                                color: instPenMouse.containsMouse ? Theme.surfaceAlt : Theme.surface
                                border.width: 1
                                border.color: Theme.borderSubtle

                                Text {
                                    id: instPenTxt
                                    anchors.centerIn: parent
                                    text: "Tuck In"
                                    color: Theme.subtext
                                    font.family: Theme.uiFont
                                    font.pixelSize: 11
                                    font.weight: Font.Medium
                                }

                                MouseArea {
                                    id: instPenMouse
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: {
                                        if (root.selectedConfig) PetManager.sendToPenNow(root.selectedConfig.id, false);
                                    }
                                }

                                UiTooltip {
                                    active: instPenMouse.containsMouse
                                    text: "Move immediately into the Sanctuary"
                                }
                            }
                        }
                    }

                    Flow {
                        Layout.fillWidth: true
                        spacing: 6

                        RowLayout {
                            height: 28
                            spacing: 6

                            Repeater {
                                model: [
                                    { label: "Pat", icon: "heart", act: "pat", tint: Theme.love, show: true },
                                    { label: "Snack", icon: "berry", act: "feed", tint: Theme.positive, show: true },
                                    { label: "Play", icon: "spark", act: "play", tint: Theme.accent, show: true },
                                    { label: "Summon", icon: "target", act: "summon", tint: Theme.warm, show: root.selectedIsRoaming }
                                ]

                                Rectangle {
                                    id: careChip
                                    required property var modelData
                                    visible: careChip.modelData.show
                                    implicitHeight: 28
                                    radius: Theme.radius(-7)
                                    implicitWidth: careRow.implicitWidth + 16
                                    color: careMouse.containsMouse ? Theme.surfaceAlt : Theme.surface
                                    border.width: 1
                                    border.color: careMouse.containsMouse ? careChip.modelData.tint : Theme.borderSubtle
                                    Behavior on color { ColorAnimation { duration: 120 } }

                                    RowLayout {
                                        id: careRow
                                        anchors.centerIn: parent
                                        spacing: 5

                                        UiIcon {
                                            name: careChip.modelData.icon
                                            size: 12
                                            color: careMouse.containsMouse ? careChip.modelData.tint : Theme.subtext
                                        }

                                        Text {
                                            text: careChip.modelData.label
                                            color: Theme.text
                                            font.family: Theme.uiFont
                                            font.pixelSize: 11
                                            font.weight: Font.Medium
                                        }
                                    }

                                    MouseArea {
                                        id: careMouse
                                        anchors.fill: parent
                                        hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: root.triggerCareAction(careChip.modelData.act)
                                    }
                                }
                            }
                        }

                        RowLayout {
                            height: 28
                            spacing: 6

                            Text {
                                text: "Scale"
                                color: Theme.subtext
                                font.family: Theme.uiFont
                                font.pixelSize: 11
                            }

                            Repeater {
                                model: [1, 2, 3, 4]

                                Rectangle {
                                    id: scaleChip
                                    required property int modelData
                                    readonly property bool cur: root.selectedConfig !== null
                                        && (root.selectedConfig.scale ?? 2) === scaleChip.modelData
                                    implicitWidth: 30
                                    implicitHeight: 26
                                    radius: Theme.radius(-8)
                                    color: cur
                                        ? Theme.accentSoft
                                        : (scaleMouse.containsMouse ? Theme.surfaceAlt : Theme.surface)
                                    border.width: 1
                                    border.color: cur ? Theme.accent : Theme.borderSubtle

                                    Text {
                                        anchors.centerIn: parent
                                        text: scaleChip.modelData + "×"
                                        color: scaleChip.cur ? Theme.accent : Theme.text
                                        font.family: Theme.monoFont
                                        font.pixelSize: 10
                                        font.bold: scaleChip.cur
                                    }

                                    MouseArea {
                                        id: scaleMouse
                                        anchors.fill: parent
                                        hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: {
                                            if (root.selectedConfig) {
                                                Config.updatePetScale(root.selectedConfig.id, scaleChip.modelData);
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        RowLayout {
                            visible: root.connectedMonitors.length > 2
                            height: 28
                            spacing: 6

                            Text {
                                text: "Display"
                                color: Theme.subtext
                                font.family: Theme.uiFont
                                font.pixelSize: 11
                            }

                            Repeater {
                                model: root.connectedMonitors.length > 2 ? root.connectedMonitors : []

                                Rectangle {
                                    id: monChip
                                    required property string modelData
                                    readonly property bool cur: root.selectedConfig !== null
                                        && (root.selectedConfig.monitor || "") === monChip.modelData
                                    implicitHeight: 26
                                    radius: Theme.radius(-8)
                                    implicitWidth: monTxt.implicitWidth + 12
                                    color: cur
                                        ? Theme.accentSoft
                                        : (monMouse.containsMouse ? Theme.surfaceAlt : Theme.surface)
                                    border.width: 1
                                    border.color: cur ? Theme.accent : Theme.borderSubtle

                                    Text {
                                        id: monTxt
                                        anchors.centerIn: parent
                                        text: monChip.modelData === "" ? "Any" : monChip.modelData
                                        color: monChip.cur ? Theme.accent : Theme.text
                                        font.family: monChip.modelData === "" ? Theme.uiFont : Theme.monoFont
                                        font.pixelSize: 10
                                    }

                                    MouseArea {
                                        id: monMouse
                                        anchors.fill: parent
                                        hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: {
                                            if (root.selectedConfig) {
                                                Config.updatePetMonitor(root.selectedConfig.id, monChip.modelData);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 12

                Rectangle {
                    Layout.fillWidth: true
                    Layout.alignment: Qt.AlignTop
                    implicitHeight: vitalsPanel.implicitHeight + 24
                    radius: Theme.radius(-3)
                    color: Theme.bg
                    border.width: 1
                    border.color: Theme.borderSubtle

                    SanctuaryVitalsPanel {
                        id: vitalsPanel
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: parent.top
                        anchors.margins: 12
                        livePet: root.selectedIsRoaming ? root.selectedLivePet : null
                        resident: root.selectedResident
                        maxNotes: 6
                    }
                }

                Rectangle {
                    Layout.fillWidth: true
                    Layout.alignment: Qt.AlignTop
                    implicitHeight: soulPanel.implicitHeight + 24
                    radius: Theme.radius(-3)
                    color: Theme.bg
                    border.width: 1
                    border.color: Theme.borderSubtle

                    SanctuarySoulPanel {
                        id: soulPanel
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: parent.top
                        anchors.margins: 12
                        livePet: root.selectedIsRoaming ? root.selectedLivePet : null
                        resident: root.selectedResident
                        maxMilestones: 4
                        onSelectPeerRequested: peerId => root.companionSelected(peerId)
                    }
                }
            }

            SanctuaryEvolutionCard {
                petId: root.selectedConfig ? root.selectedConfig.id : ""
                species: root.selectedConfig ? root.selectedConfig.sprite : ""
                livePet: root.selectedIsRoaming ? root.selectedLivePet : null
                resident: root.selectedResident
                onEvolved: {
                    root.stageOverrideState = "emit";
                    stageSprite.triggerSquash(1.18, 0.84);
                    stageBubble.showEmote("heart");
                    stageOverrideTimer.restart();
                }
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                Rectangle {
                    implicitHeight: 28
                    radius: Theme.radius(-7)
                    implicitWidth: morphBtnRow.implicitWidth + 16
                    color: morphBtnMouse.containsMouse ? Theme.surfaceAlt : Theme.bg
                    border.width: 1
                    border.color: Theme.borderSubtle

                    RowLayout {
                        id: morphBtnRow
                        anchors.centerIn: parent
                        spacing: 5

                        UiIcon {
                            name: root.morphExpanded ? "chevronDown" : "chevronRight"
                            size: 11
                            color: Theme.subtext
                        }

                        Text {
                            text: root.morphExpanded ? "Hide Species Form" : "Change Species Form"
                            color: Theme.subtext
                            font.family: Theme.uiFont
                            font.pixelSize: 11
                        }
                    }

                    MouseArea {
                        id: morphBtnMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.morphExpanded = !root.morphExpanded
                    }
                }

                Item { Layout.fillWidth: true }

                SanctuaryConfirmReleaseButton {
                    id: releaseBtn
                    petId: root.selectedConfig ? root.selectedConfig.id : ""
                }
            }

            Loader {
                active: root.morphExpanded
                visible: active
                Layout.fillWidth: true

                sourceComponent: Flow {
                    width: detailCol.width
                    spacing: 5

                    Repeater {
                        model: Config.speciesList

                        Rectangle {
                            id: morphSpChip
                            required property string modelData
                            readonly property bool cur: root.selectedConfig !== null
                                && root.selectedConfig.sprite === morphSpChip.modelData
                            height: 24
                            radius: Theme.radius(-8)
                            implicitWidth: morphSpTxt.implicitWidth + 12
                            color: cur
                                ? Theme.accentSoft
                                : (morphSpMouse.containsMouse ? Theme.surfaceAlt : Theme.bg)
                            border.width: 1
                            border.color: cur ? Theme.accent : Theme.borderSubtle

                            Text {
                                id: morphSpTxt
                                anchors.centerIn: parent
                                text: SpeciesProfile.profileFor(morphSpChip.modelData).displayName
                                color: morphSpChip.cur ? Theme.accent : Theme.text
                                font.family: Theme.uiFont
                                font.pixelSize: 10
                                font.weight: morphSpChip.cur ? Font.DemiBold : Font.Normal
                            }

                            MouseArea {
                                id: morphSpMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    if (root.selectedConfig) {
                                        PetManager.morphCompanion(root.selectedConfig.id, morphSpChip.modelData);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
