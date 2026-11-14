pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Hyprland
import "../config"
import "../services"
import "SpeciesProfile.js" as SpeciesProfile
import "SpriteSheet.js" as SpriteSheet
import "ai/Personality.js" as Personality

FloatingWindow {
    id: root

    implicitWidth: 1080
    implicitHeight: 700
    minimumSize: Qt.size(880, 580)
    title: "Pokémon Sanctuary" // Must match Pangu-Shell/hyprland/pangu/shell_rules.lua
    color: "transparent"

    property bool adoptMode: false
    property bool prefsExpanded: false
    property bool editingName: false
    property string rosterSearch: ""
    property string rosterFilter: "all"
    property string catalogSearch: ""
    property string adoptName: ""
    property string adoptNature: "emergent"
    property string adoptRoamMode: "auto"
    property bool morphExpanded: false
    property bool confirmRelease: false
    property string stageOverrideState: ""
    property var _preMapAddresses: ({})

    readonly property var naturesList: [
        "emergent", "playful", "curious", "chill", "lazy",
        "energetic", "brave", "shy", "nocturnal", "grumpy"
    ]

    readonly property string selectedPetId: {
        if (PetManager.penSelectedPetId && Config.pets.some(p => p.id === PetManager.penSelectedPetId)) {
            return PetManager.penSelectedPetId;
        }
        return Config.pets.length > 0 ? Config.pets[0].id : "";
    }

    readonly property var selectedConfig: {
        for (let i = 0; i < Config.pets.length; i++) {
            if (Config.pets[i].id === root.selectedPetId) return Config.pets[i];
        }
        return Config.pets.length > 0 ? Config.pets[0] : null;
    }

    readonly property var selectedLivePet: root.selectedPetId ? PetManager.findPetById(root.selectedPetId) : null
    readonly property var selectedResident: {
        const _rev = PetManager.residentRevision;
        return root.selectedPetId ? PetManager.residentFor(root.selectedPetId) : null;
    }
    readonly property bool selectedIsRoaming: root.selectedPetId ? PetManager.isRoaming(root.selectedPetId) : false

    readonly property var filteredRoster: {
        const q = root.rosterSearch.trim().toLowerCase();
        return Config.pets.filter(p => {
            const out = PetManager.isRoaming(p.id);
            if (root.rosterFilter === "roaming" && !out) return false;
            if (root.rosterFilter === "penned" && out) return false;
            if (!q) return true;
            const prof = SpeciesProfile.profileFor(p.sprite);
            return p.name.toLowerCase().indexOf(q) !== -1
                || p.sprite.toLowerCase().indexOf(q) !== -1
                || prof.displayName.toLowerCase().indexOf(q) !== -1
                || prof.biome.toLowerCase().indexOf(q) !== -1;
        });
    }

    readonly property var filteredCatalog: {
        const q = root.catalogSearch.trim().toLowerCase();
        return SpriteSheet.SPECIES_LIST.filter(sp => {
            if (!q) return true;
            const prof = SpeciesProfile.profileFor(sp);
            return sp.toLowerCase().indexOf(q) !== -1
                || prof.displayName.toLowerCase().indexOf(q) !== -1
                || prof.biome.toLowerCase().indexOf(q) !== -1
                || prof.blurb.toLowerCase().indexOf(q) !== -1;
        });
    }

    readonly property var connectedMonitors: {
        const out = [""];
        for (let i = 0; i < Quickshell.screens.length; i++) {
            const s = Quickshell.screens[i];
            if (s.width > 100 && s.height > 100 && !s.name.startsWith("Unknown")) {
                out.push(s.name);
            }
        }
        return out;
    }

    onSelectedPetIdChanged: {
        confirmRelease = false;
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

    function selectCompanion(id: string): void {
        PetManager.penSelectedPetId = id;
        root.adoptMode = false;
    }

    function capitalize(word: string): string {
        if (!word) return "";
        return word.charAt(0).toUpperCase() + word.slice(1);
    }

    function policyShortLabel(mode: string): string {
        if (mode === "always") return "Always";
        if (mode === "penned") return "Sanctuary";
        return "Auto";
    }

    function formatAge(sec: real): string {
        const s = Math.max(0, Math.floor(sec || 0));
        if (s < 3600) return Math.max(1, Math.floor(s / 60)) + "m";
        if (s < 86400) return Math.floor(s / 3600) + "h";
        return Math.floor(s / 86400) + "d " + Math.floor((s % 86400) / 3600) + "h";
    }

    function formatAgo(ts: double): string {
        if (!ts) return "";
        const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
        if (sec < 45) return "now";
        if (sec < 3600) return Math.floor(sec / 60) + "m";
        if (sec < 86400) return Math.floor(sec / 3600) + "h";
        return Math.floor(sec / 86400) + "d";
    }

    function companionSpecies(name: string, rel: var): string {
        if (rel && rel.species) return rel.species;
        const found = Config.pets.find(p => p.name === name);
        return found ? found.sprite : "zorua";
    }

    function companionId(name: string): string {
        const found = Config.pets.find(p => p.name === name);
        return found ? found.id : "";
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

    function _prepareHyprlandPlacement(): void {
        if (!WindowTracker.hasHyprland) return;
        const existing = {};
        for (const tl of Hyprland.toplevels.values) {
            const addr = String(tl.lastIpcObject?.address ?? tl.address ?? "");
            if (addr) existing[addr] = true;
        }
        root._preMapAddresses = existing;

        const monName = Hyprland.focusedMonitor?.name ?? "";
        if (monName) {
            for (let i = 0; i < Quickshell.screens.length; i++) {
                if (Quickshell.screens[i].name === monName) {
                    root.screen = Quickshell.screens[i];
                    break;
                }
            }
        }
        placementTimer.attempts = 0;
        placementTimer.restart();
    }

    function _placeOnFocusedWorkspace(): bool {
        if (!WindowTracker.hasHyprland) return true;
        Hyprland.refreshToplevels();
        const monRaw = Hyprland.focusedMonitor?.lastIpcObject;
        const specialName = monRaw?.specialWorkspace?.name ?? "";
        const targetSpec = specialName
            ? (specialName.startsWith("special:") ? specialName : ("special:" + specialName))
            : "";
        const targetWsId = Hyprland.focusedMonitor?.activeWorkspace?.id
            ?? Hyprland.focusedWorkspace?.id
            ?? 0;

        for (const tl of Hyprland.toplevels.values) {
            const raw = tl.lastIpcObject;
            const titleStr = String(raw?.title ?? tl.title ?? "");
            const rawAddr = String(raw?.address ?? tl.address ?? "");
            if (titleStr !== root.title || !rawAddr || root._preMapAddresses[rawAddr]) continue;

            const addr = rawAddr.startsWith("0x") ? rawAddr : ("0x" + rawAddr);
            if (targetSpec) {
                if (String(raw?.workspace?.name ?? "") !== targetSpec) {
                    Hyprland.dispatch("movetoworkspacesilent " + targetSpec + ",address:" + addr);
                }
            } else if (targetWsId > 0 && Number(raw?.workspace?.id ?? 0) !== targetWsId) {
                Hyprland.dispatch("movetoworkspacesilent " + targetWsId + ",address:" + addr);
            }
            Hyprland.dispatch("focuswindow address:" + addr);
            return true;
        }
        return false;
    }

    Timer {
        id: placementTimer
        interval: 80
        repeat: true
        property int attempts: 0
        onTriggered: {
            attempts++;
            if (root._placeOnFocusedWorkspace() || attempts >= 15) stop();
        }
    }

    Timer {
        id: stageOverrideTimer
        interval: 1650
        onTriggered: root.stageOverrideState = ""
    }

    Timer {
        id: releaseResetTimer
        interval: 3500
        onTriggered: root.confirmRelease = false
    }

    Shortcut {
        sequence: "Escape"
        context: Qt.WindowShortcut
        onActivated: {
            if (root.editingName) {
                root.cancelRename();
            } else if (root.adoptMode && catalogSearchInput.text.length > 0) {
                catalogSearchInput.text = "";
                catalogSearchInput.focus = false;
            } else if (root.adoptMode) {
                root.adoptMode = false;
            } else if (rosterSearchInput.text.length > 0) {
                rosterSearchInput.text = "";
                rosterSearchInput.focus = false;
            } else if (root.prefsExpanded) {
                root.prefsExpanded = false;
            } else {
                PetManager.closePen();
            }
        }
    }

    Shortcut {
        sequence: "/"
        context: Qt.WindowShortcut
        enabled: !rosterSearchInput.activeFocus && !catalogSearchInput.activeFocus
            && !renameInput.activeFocus && !adoptNameField.activeFocus
        onActivated: {
            if (root.adoptMode) catalogSearchInput.forceActiveFocus();
            else rosterSearchInput.forceActiveFocus();
        }
    }

    Component.onCompleted: root._prepareHyprlandPlacement()
    onClosed: PetManager.closePen()

    Rectangle {
        id: windowShell
        anchors.fill: parent
        color: Theme.bg
        border.width: 1
        border.color: Theme.border
        radius: Theme.radius(2)

        Rectangle {
            visible: Theme.specularRim
            anchors.top: parent.top
            anchors.topMargin: 1
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.leftMargin: windowShell.radius
            anchors.rightMargin: windowShell.radius
            height: 1
            color: Theme.rimHighlight
        }

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 18
            spacing: 12

            RowLayout {
                Layout.fillWidth: true
                spacing: 10

                Rectangle {
                    implicitWidth: 36
                    implicitHeight: 36
                    radius: Theme.radius(-4)
                    color: Theme.surface
                    border.width: 1
                    border.color: Theme.borderSubtle

                    UiIcon {
                        anchors.centerIn: parent
                        name: "sanctuary"
                        size: 17
                        color: Theme.accent
                    }
                }

                ColumnLayout {
                    spacing: 1

                    Text {
                        text: "Pokémon Sanctuary"
                        color: Theme.text
                        font.family: Theme.uiFont
                        font.pixelSize: 17
                        font.weight: Font.Bold
                    }

                    Text {
                        text: PetManager.roamingIds.length + " roaming on desktop  ·  "
                            + Math.max(0, Config.pets.length - PetManager.roamingIds.length) + " resting in sanctuary"
                        color: Theme.subtext
                        font.family: Theme.uiFont
                        font.pixelSize: 11
                    }
                }

                Item { Layout.fillWidth: true }

                Rectangle {
                    id: maxRoamBox
                    implicitHeight: 30
                    radius: Theme.radius(-6)
                    color: Theme.surface
                    border.width: 1
                    border.color: Theme.borderSubtle
                    implicitWidth: maxRow.implicitWidth + 16

                    RowLayout {
                        id: maxRow
                        anchors.centerIn: parent
                        spacing: 6

                        Text {
                            text: "Max Roaming"
                            color: Theme.subtext
                            font.family: Theme.uiFont
                            font.pixelSize: 11
                        }

                        Rectangle {
                            implicitWidth: 20
                            implicitHeight: 20
                            radius: Theme.radius(-9)
                            color: minusArea.containsMouse ? Theme.surfaceAlt : "transparent"

                            UiIcon {
                                anchors.centerIn: parent
                                name: "minus"
                                size: 11
                                color: Theme.text
                            }

                            MouseArea {
                                id: minusArea
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: Config.updateMaxRoaming(Config.maxActiveRoaming - 1)
                            }
                        }

                        Text {
                            Layout.minimumWidth: 16
                            horizontalAlignment: Text.AlignHCenter
                            text: String(Config.maxActiveRoaming)
                            color: Theme.accent
                            font.family: Theme.monoFont
                            font.pixelSize: 12
                            font.bold: true
                        }

                        Rectangle {
                            implicitWidth: 20
                            implicitHeight: 20
                            radius: Theme.radius(-9)
                            color: plusArea.containsMouse ? Theme.surfaceAlt : "transparent"

                            UiIcon {
                                anchors.centerIn: parent
                                name: "plus"
                                size: 11
                                color: Theme.text
                            }

                            MouseArea {
                                id: plusArea
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: Config.updateMaxRoaming(Config.maxActiveRoaming + 1)
                            }
                        }
                    }
                }

                Rectangle {
                    implicitHeight: 30
                    radius: Theme.radius(-6)
                    implicitWidth: visRow.implicitWidth + 16
                    color: PetManager.hidden
                        ? Theme.alpha(Theme.warm, 0.14)
                        : (visMouse.containsMouse ? Theme.surfaceAlt : Theme.surface)
                    border.width: 1
                    border.color: PetManager.hidden ? Theme.alpha(Theme.warm, 0.55) : Theme.borderSubtle
                    Behavior on color { ColorAnimation { duration: 120 } }

                    RowLayout {
                        id: visRow
                        anchors.centerIn: parent
                        spacing: 6

                        UiIcon {
                            name: PetManager.hidden ? "eyeOff" : "eye"
                            size: 13
                            color: PetManager.hidden ? Theme.warm : Theme.subtext
                        }

                        Text {
                            text: PetManager.hidden ? "Hidden" : "Visible"
                            color: PetManager.hidden ? Theme.warm : Theme.text
                            font.family: Theme.uiFont
                            font.pixelSize: 11
                            font.weight: Font.Medium
                        }
                    }

                    MouseArea {
                        id: visMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: PetManager.hidden = !PetManager.hidden
                    }

                    UiTooltip {
                        active: visMouse.containsMouse
                        text: "Temporarily hide or show all desktop companions"
                    }
                }

                Rectangle {
                    implicitHeight: 30
                    radius: Theme.radius(-6)
                    implicitWidth: prefBtnRow.implicitWidth + 16
                    color: root.prefsExpanded
                        ? Theme.accentSoft
                        : (prefBtnMouse.containsMouse ? Theme.surfaceAlt : Theme.surface)
                    border.width: 1
                    border.color: root.prefsExpanded ? Theme.accent : Theme.borderSubtle
                    Behavior on color { ColorAnimation { duration: 120 } }

                    RowLayout {
                        id: prefBtnRow
                        anchors.centerIn: parent
                        spacing: 6

                        UiIcon {
                            name: "sliders"
                            size: 13
                            color: root.prefsExpanded ? Theme.accent : Theme.subtext
                        }

                        Text {
                            text: "Preferences"
                            color: root.prefsExpanded ? Theme.accent : Theme.text
                            font.family: Theme.uiFont
                            font.pixelSize: 11
                            font.weight: Font.Medium
                        }
                    }

                    MouseArea {
                        id: prefBtnMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.prefsExpanded = !root.prefsExpanded
                    }
                }

                Rectangle {
                    implicitHeight: 30
                    radius: Theme.radius(-6)
                    implicitWidth: adoptToggleRow.implicitWidth + 18
                    color: root.adoptMode
                        ? Theme.surfaceAlt
                        : (adoptToggleMouse.containsMouse ? Theme.accent : Theme.accentSoft)
                    border.width: 1
                    border.color: root.adoptMode ? Theme.border : Theme.accent
                    Behavior on color { ColorAnimation { duration: 120 } }

                    RowLayout {
                        id: adoptToggleRow
                        anchors.centerIn: parent
                        spacing: 6

                        UiIcon {
                            name: root.adoptMode ? "arrowLeft" : "plus"
                            size: 12
                            color: root.adoptMode
                                ? Theme.text
                                : (adoptToggleMouse.containsMouse ? Theme.overAccent : Theme.accent)
                        }

                        Text {
                            text: root.adoptMode ? "Back to Companion" : "Adopt Companion"
                            color: root.adoptMode
                                ? Theme.text
                                : (adoptToggleMouse.containsMouse ? Theme.overAccent : Theme.accent)
                            font.family: Theme.uiFont
                            font.pixelSize: 11
                            font.weight: Font.DemiBold
                        }
                    }

                    MouseArea {
                        id: adoptToggleMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.adoptMode = !root.adoptMode
                    }
                }

                Rectangle {
                    implicitWidth: 30
                    implicitHeight: 30
                    radius: Theme.radius(-6)
                    color: closeWinArea.containsMouse ? Theme.surfaceAlt : Theme.surface
                    border.width: 1
                    border.color: closeWinArea.containsMouse ? Theme.border : Theme.borderSubtle
                    Behavior on color { ColorAnimation { duration: 120 } }

                    UiIcon {
                        anchors.centerIn: parent
                        name: "close"
                        size: 13
                        color: closeWinArea.containsMouse ? Theme.text : Theme.subtext
                    }

                    MouseArea {
                        id: closeWinArea
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: PetManager.closePen()
                    }
                }
            }

            Rectangle {
                visible: root.prefsExpanded
                Layout.fillWidth: true
                implicitHeight: 46
                radius: Theme.radius(-2)
                color: Theme.surface
                border.width: 1
                border.color: Theme.borderSubtle

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 14
                    anchors.rightMargin: 14
                    spacing: 12

                    Text {
                        text: "BEHAVIOR PREFERENCES"
                        color: Theme.muted
                        font.family: Theme.uiFont
                        font.pixelSize: 9
                        font.weight: Font.Bold
                        font.letterSpacing: 0.6
                    }

                    Item { Layout.fillWidth: true }

                    Repeater {
                        model: [
                            {
                                key: "emotes",
                                icon: "spark",
                                label: "Emote Droplets",
                                desc: "Show pixel-art mood droplets over companions",
                                active: Config.showEmotes
                            },
                            {
                                key: "perch",
                                icon: "perch",
                                label: "Window Perching",
                                desc: "Allow agile companions to hop onto active window titlebars",
                                active: Config.enablePerching
                            },
                            {
                                key: "music",
                                icon: "music",
                                label: "Music Sync",
                                desc: "React gently when MPRIS media playback starts",
                                active: Config.enableMusicReact
                            }
                        ]

                        Rectangle {
                            id: prefToggleCard
                            required property var modelData
                            implicitHeight: 30
                            implicitWidth: prefToggleInner.implicitWidth + 18
                            radius: Theme.radius(-7)
                            color: prefToggleMouse.containsMouse ? Theme.surfaceAlt : Theme.bg
                            border.width: 1
                            border.color: prefToggleCard.modelData.active
                                ? Theme.alpha(Theme.accent, 0.45)
                                : Theme.borderSubtle

                            RowLayout {
                                id: prefToggleInner
                                anchors.centerIn: parent
                                spacing: 7

                                UiIcon {
                                    name: prefToggleCard.modelData.icon
                                    size: 12
                                    color: prefToggleCard.modelData.active ? Theme.accent : Theme.subtext
                                }

                                Text {
                                    text: prefToggleCard.modelData.label
                                    color: Theme.text
                                    font.family: Theme.uiFont
                                    font.pixelSize: 11
                                    font.weight: Font.Medium
                                }

                                Rectangle {
                                    implicitWidth: 28
                                    implicitHeight: 15
                                    radius: 8
                                    color: prefToggleCard.modelData.active ? Theme.accent : Theme.surfaceAlt
                                    border.width: 1
                                    border.color: prefToggleCard.modelData.active ? Theme.accent : Theme.border
                                    Behavior on color { ColorAnimation { duration: 140 } }

                                    Rectangle {
                                        width: 11
                                        height: 11
                                        radius: 6
                                        y: 2
                                        x: prefToggleCard.modelData.active ? 15 : 2
                                        color: prefToggleCard.modelData.active ? Theme.overAccent : Theme.subtext
                                        Behavior on x { NumberAnimation { duration: 140; easing.type: Easing.OutCubic } }
                                    }
                                }
                            }

                            MouseArea {
                                id: prefToggleMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    const k = prefToggleCard.modelData.key;
                                    if (k === "emotes") Config.showEmotes = !Config.showEmotes;
                                    else if (k === "perch") Config.enablePerching = !Config.enablePerching;
                                    else if (k === "music") Config.enableMusicReact = !Config.enableMusicReact;
                                    Config.save();
                                }
                            }

                            UiTooltip {
                                active: prefToggleMouse.containsMouse
                                text: prefToggleCard.modelData.desc
                            }
                        }
                    }
                }
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 102
                radius: Theme.radius(0)
                color: Theme.surface
                border.width: 1
                border.color: Theme.borderSubtle

                Flickable {
                    id: pastureFlick
                    anchors.fill: parent
                    anchors.margins: 8
                    clip: true
                    contentWidth: Math.max(width, pastureRow.implicitWidth)
                    contentHeight: height
                    boundsBehavior: Flickable.StopAtBounds
                    interactive: contentWidth > width

                    Row {
                        id: pastureRow
                        height: parent.height
                        spacing: 8

                        Repeater {
                            model: Config.pets

                            Rectangle {
                                id: pastureTile
                                required property var modelData
                                readonly property bool isOut: PetManager.isRoaming(pastureTile.modelData.id)
                                readonly property bool isSelected: !root.adoptMode && root.selectedPetId === pastureTile.modelData.id
                                readonly property var liveRef: PetManager.findPetById(pastureTile.modelData.id)
                                readonly property var resRef: {
                                    const _r = PetManager.residentRevision;
                                    return PetManager.residentFor(pastureTile.modelData.id);
                                }
                                readonly property string animState: {
                                    if (isSelected && root.stageOverrideState.length > 0) return root.stageOverrideState;
                                    if (isOut) return (liveRef && liveRef.state_ !== "drag") ? liveRef.state_ : "idle";
                                    return resRef ? resRef.penState : "idle";
                                }

                                width: 96
                                height: pastureRow.height
                                radius: Theme.radius(-4)
                                color: isSelected
                                    ? Theme.alpha(Theme.accent, 0.14)
                                    : (pastureMouse.containsMouse ? Theme.surfaceAlt : Theme.alpha(Theme.bg, 0.45))
                                border.width: 1
                                border.color: isSelected
                                    ? Theme.accent
                                    : (pastureMouse.containsMouse ? Theme.border : Theme.borderSubtle)
                                Behavior on color { ColorAnimation { duration: 120 } }

                                ColumnLayout {
                                    anchors.fill: parent
                                    anchors.margins: 6
                                    spacing: 2

                                    Item {
                                        Layout.fillWidth: true
                                        Layout.fillHeight: true

                                        Rectangle {
                                            anchors.horizontalCenter: parent.horizontalCenter
                                            anchors.bottom: parent.bottom
                                            anchors.bottomMargin: 5
                                            width: 44
                                            height: 1
                                            color: Theme.borderSubtle
                                        }

                                        SpriteAnimation {
                                            anchors.centerIn: parent
                                            width: 48
                                            height: 48
                                            speciesName: pastureTile.modelData.sprite
                                            currentState: pastureTile.animState
                                            spriteDir: Qt.resolvedUrl("../assets/sprites/" + pastureTile.modelData.sprite)
                                        }
                                    }

                                    Text {
                                        Layout.fillWidth: true
                                        horizontalAlignment: Text.AlignHCenter
                                        elide: Text.ElideRight
                                        text: pastureTile.modelData.name
                                        color: Theme.text
                                        font.family: Theme.uiFont
                                        font.pixelSize: 11
                                        font.weight: pastureTile.isSelected ? Font.Bold : Font.Medium
                                    }

                                    RowLayout {
                                        Layout.alignment: Qt.AlignHCenter
                                        spacing: 4

                                        Rectangle {
                                            implicitWidth: 5
                                            implicitHeight: 5
                                            radius: 3
                                            color: pastureTile.isOut ? Theme.positive : Theme.warm
                                        }

                                        Text {
                                            text: pastureTile.isOut ? "Roaming" : "Sanctuary"
                                            color: Theme.subtext
                                            font.family: Theme.uiFont
                                            font.pixelSize: 9
                                        }
                                    }
                                }

                                MouseArea {
                                    id: pastureMouse
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: root.selectCompanion(pastureTile.modelData.id)
                                }
                            }
                        }
                    }
                }
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                spacing: 12

                Rectangle {
                    Layout.preferredWidth: 294
                    Layout.fillHeight: true
                    radius: Theme.radius(0)
                    color: Theme.surface
                    border.width: 1
                    border.color: Theme.borderSubtle

                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 12
                        spacing: 8

                        Rectangle {
                            Layout.fillWidth: true
                            implicitHeight: 32
                            radius: Theme.radius(-6)
                            color: Theme.bg
                            border.width: 1
                            border.color: rosterSearchInput.activeFocus ? Theme.accent : Theme.borderSubtle

                            RowLayout {
                                anchors.fill: parent
                                anchors.leftMargin: 9
                                anchors.rightMargin: 8
                                spacing: 7

                                UiIcon {
                                    name: "search"
                                    size: 13
                                    color: rosterSearchInput.activeFocus ? Theme.accent : Theme.muted
                                }

                                TextInput {
                                    id: rosterSearchInput
                                    Layout.fillWidth: true
                                    Layout.fillHeight: true
                                    verticalAlignment: TextInput.AlignVCenter
                                    selectByMouse: true
                                    color: Theme.text
                                    font.family: Theme.uiFont
                                    font.pixelSize: 11
                                    clip: true
                                    onTextChanged: root.rosterSearch = text

                                    HoverHandler {
                                        cursorShape: Qt.IBeamCursor
                                    }

                                    Text {
                                        visible: rosterSearchInput.text.length === 0
                                        anchors.verticalCenter: parent.verticalCenter
                                        text: "Search companions..."
                                        color: Theme.muted
                                        font.family: Theme.uiFont
                                        font.pixelSize: 11
                                    }
                                }

                                Rectangle {
                                    visible: rosterSearchInput.text.length > 0
                                    implicitWidth: 18
                                    implicitHeight: 18
                                    radius: 9
                                    color: clearRosterSearch.containsMouse ? Theme.surfaceAlt : "transparent"

                                    UiIcon {
                                        anchors.centerIn: parent
                                        name: "close"
                                        size: 10
                                        color: Theme.subtext
                                    }

                                    MouseArea {
                                        id: clearRosterSearch
                                        anchors.fill: parent
                                        hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: rosterSearchInput.text = ""
                                    }
                                }
                            }
                        }

                        Rectangle {
                            Layout.fillWidth: true
                            implicitHeight: 28
                            radius: Theme.radius(-6)
                            color: Theme.bg
                            border.width: 1
                            border.color: Theme.borderSubtle

                            RowLayout {
                                anchors.fill: parent
                                anchors.margins: 2
                                spacing: 2

                                Repeater {
                                    model: [
                                        { key: "all", label: "All", count: Config.pets.length },
                                        { key: "roaming", label: "Roaming", count: PetManager.roamingIds.length },
                                        { key: "penned", label: "Sanctuary", count: Math.max(0, Config.pets.length - PetManager.roamingIds.length) }
                                    ]

                                    Rectangle {
                                        id: fltTab
                                        required property var modelData
                                        readonly property bool active: root.rosterFilter === fltTab.modelData.key
                                        Layout.fillWidth: true
                                        Layout.fillHeight: true
                                        radius: Theme.radius(-8)
                                        color: active
                                            ? Theme.surfaceAlt
                                            : (fltTabMouse.containsMouse ? Theme.alpha(Theme.surfaceAlt, 0.5) : "transparent")
                                        border.width: active ? 1 : 0
                                        border.color: Theme.alpha(Theme.accent, 0.45)

                                        RowLayout {
                                            anchors.centerIn: parent
                                            spacing: 4

                                            Text {
                                                text: fltTab.modelData.label
                                                color: fltTab.active ? Theme.text : Theme.subtext
                                                font.family: Theme.uiFont
                                                font.pixelSize: 10
                                                font.weight: fltTab.active ? Font.DemiBold : Font.Normal
                                            }

                                            Text {
                                                text: String(fltTab.modelData.count)
                                                color: fltTab.active ? Theme.accent : Theme.muted
                                                font.family: Theme.monoFont
                                                font.pixelSize: 10
                                            }
                                        }

                                        MouseArea {
                                            id: fltTabMouse
                                            anchors.fill: parent
                                            hoverEnabled: true
                                            cursorShape: Qt.PointingHandCursor
                                            onClicked: root.rosterFilter = fltTab.modelData.key
                                        }
                                    }
                                }
                            }
                        }

                        Flickable {
                            id: rosterFlick
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            clip: true
                            contentWidth: width
                            contentHeight: rosterCol.implicitHeight
                            boundsBehavior: Flickable.StopAtBounds
                            interactive: contentHeight > height

                            ColumnLayout {
                                id: rosterCol
                                width: rosterFlick.width
                                spacing: 6

                                Text {
                                    visible: root.filteredRoster.length === 0
                                    Layout.fillWidth: true
                                    Layout.topMargin: 20
                                    horizontalAlignment: Text.AlignHCenter
                                    text: "No companions match this filter."
                                    color: Theme.muted
                                    font.family: Theme.uiFont
                                    font.pixelSize: 11
                                }

                                Repeater {
                                    model: root.filteredRoster

                                    Rectangle {
                                        id: rosterItem
                                        required property var modelData
                                        readonly property bool isOut: PetManager.isRoaming(rosterItem.modelData.id)
                                        readonly property bool isSelected: !root.adoptMode && root.selectedPetId === rosterItem.modelData.id
                                        readonly property var liveRef: PetManager.findPetById(rosterItem.modelData.id)
                                        readonly property var resRef: {
                                            const _r = PetManager.residentRevision;
                                            return PetManager.residentFor(rosterItem.modelData.id);
                                        }
                                        readonly property real itemMood: isOut && liveRef ? liveRef.mood : (resRef ? resRef.mood : 0.56)
                                        readonly property string itemArch: isOut && liveRef ? liveRef.archetype : (resRef ? resRef.archetype : "Curious Hatchling")

                                        Layout.fillWidth: true
                                        implicitHeight: 58
                                        radius: Theme.radius(-4)
                                        color: isSelected
                                            ? Theme.alpha(Theme.accent, 0.14)
                                            : (rosterMouse.containsMouse ? Theme.surfaceAlt : Theme.bg)
                                        border.width: 1
                                        border.color: isSelected
                                            ? Theme.accent
                                            : (rosterMouse.containsMouse ? Theme.border : Theme.borderSubtle)
                                        Behavior on color { ColorAnimation { duration: 120 } }

                                        MouseArea {
                                            id: rosterMouse
                                            anchors.fill: parent
                                            hoverEnabled: true
                                            cursorShape: Qt.PointingHandCursor
                                            onClicked: root.selectCompanion(rosterItem.modelData.id)
                                        }

                                        RowLayout {
                                            anchors.fill: parent
                                            anchors.margins: 8
                                            spacing: 9

                                            SpriteAnimation {
                                                Layout.preferredWidth: 38
                                                Layout.preferredHeight: 38
                                                speciesName: rosterItem.modelData.sprite
                                                currentState: "idle"
                                                spriteDir: Qt.resolvedUrl("../assets/sprites/" + rosterItem.modelData.sprite)
                                            }

                                            ColumnLayout {
                                                Layout.fillWidth: true
                                                spacing: 3

                                                RowLayout {
                                                    Layout.fillWidth: true
                                                    spacing: 5

                                                    Text {
                                                        Layout.fillWidth: true
                                                        elide: Text.ElideRight
                                                        text: rosterItem.modelData.name
                                                        color: Theme.text
                                                        font.family: Theme.uiFont
                                                        font.pixelSize: 12
                                                        font.weight: Font.DemiBold
                                                    }

                                                    Text {
                                                        text: root.policyShortLabel(rosterItem.modelData.roamMode || "auto")
                                                        color: Theme.muted
                                                        font.family: Theme.uiFont
                                                        font.pixelSize: 9
                                                    }
                                                }

                                                RowLayout {
                                                    Layout.fillWidth: true
                                                    spacing: 6

                                                    Text {
                                                        Layout.fillWidth: true
                                                        elide: Text.ElideRight
                                                        text: rosterItem.itemArch
                                                        color: Theme.subtext
                                                        font.family: Theme.uiFont
                                                        font.pixelSize: 10
                                                    }

                                                    Rectangle {
                                                        implicitWidth: 24
                                                        implicitHeight: 4
                                                        radius: 2
                                                        color: Theme.surface

                                                        Rectangle {
                                                            width: parent.width * Math.max(0.08, Math.min(1, rosterItem.itemMood))
                                                            height: parent.height
                                                            radius: 2
                                                            color: rosterItem.itemMood > 0.45 ? Theme.positive : Theme.warm
                                                        }
                                                    }

                                                    Text {
                                                        text: Math.round(rosterItem.itemMood * 100) + "%"
                                                        color: Theme.subtext
                                                        font.family: Theme.monoFont
                                                        font.pixelSize: 9
                                                    }
                                                }
                                            }

                                            Rectangle {
                                                implicitWidth: 46
                                                implicitHeight: 24
                                                radius: Theme.radius(-8)
                                                color: rosterToggleMouse.containsMouse
                                                    ? (rosterItem.isOut ? Theme.alpha(Theme.warm, 0.18) : Theme.alpha(Theme.positive, 0.22))
                                                    : (rosterItem.isOut ? Theme.alpha(Theme.positive, 0.14) : Theme.surface)
                                                border.width: 1
                                                border.color: rosterToggleMouse.containsMouse
                                                    ? (rosterItem.isOut ? Theme.warm : Theme.positive)
                                                    : (rosterItem.isOut ? Theme.alpha(Theme.positive, 0.55) : Theme.borderSubtle)

                                                Text {
                                                    anchors.centerIn: parent
                                                    text: rosterToggleMouse.containsMouse
                                                        ? (rosterItem.isOut ? "Rest" : "Call")
                                                        : (rosterItem.isOut ? "Out" : "In")
                                                    color: rosterToggleMouse.containsMouse
                                                        ? (rosterItem.isOut ? Theme.warm : Theme.positive)
                                                        : (rosterItem.isOut ? Theme.positive : Theme.subtext)
                                                    font.family: Theme.uiFont
                                                    font.pixelSize: 10
                                                    font.weight: Font.DemiBold
                                                }

                                                MouseArea {
                                                    id: rosterToggleMouse
                                                    anchors.fill: parent
                                                    hoverEnabled: true
                                                    cursorShape: Qt.PointingHandCursor
                                                    onClicked: {
                                                        if (rosterItem.isOut) PetManager.sendToPenNow(rosterItem.modelData.id, false);
                                                        else PetManager.callOutNow(rosterItem.modelData.id);
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

                Rectangle {
                    visible: !root.adoptMode && root.selectedConfig !== null
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

                                    RowLayout {
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
                                            border.color: Theme.alpha(Theme.accent, 0.28)
                                            implicitWidth: spTagRow.implicitWidth + 14

                                            RowLayout {
                                                id: spTagRow
                                                anchors.centerIn: parent
                                                spacing: 6

                                                Text {
                                                    text: {
                                                        if (!root.selectedConfig) return "";
                                                        const prof = SpeciesProfile.profileFor(root.selectedConfig.sprite);
                                                        return prof.displayName + "  ·  " + prof.biome;
                                                    }
                                                    color: Theme.accent
                                                    font.family: Theme.uiFont
                                                    font.pixelSize: 10
                                                    font.weight: Font.DemiBold
                                                }

                                                Text {
                                                    text: {
                                                        const age = root.selectedIsRoaming && root.selectedLivePet
                                                            ? root.selectedLivePet.ageSeconds
                                                            : (root.selectedResident ? root.selectedResident.ageSeconds : 0);
                                                        return root.formatAge(age);
                                                    }
                                                    color: Theme.subtext
                                                    font.family: Theme.monoFont
                                                    font.pixelSize: 10
                                                }
                                            }
                                        }

                                        Item { Layout.fillWidth: true }
                                    }

                                    Text {
                                        Layout.fillWidth: true
                                        wrapMode: Text.WordWrap
                                        text: {
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

                                    RowLayout {
                                        Layout.fillWidth: true
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

                                        Item { Layout.fillWidth: true }

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

                                    RowLayout {
                                        Layout.fillWidth: true
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

                                        Item { Layout.fillWidth: true }

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

                                        Text {
                                            visible: root.connectedMonitors.length > 2
                                            Layout.leftMargin: 4
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

                            RowLayout {
                                Layout.fillWidth: true
                                spacing: 12

                                Rectangle {
                                    Layout.fillWidth: true
                                    Layout.alignment: Qt.AlignTop
                                    implicitHeight: vitalsCol.implicitHeight + 24
                                    radius: Theme.radius(-3)
                                    color: Theme.bg
                                    border.width: 1
                                    border.color: Theme.borderSubtle

                                    ColumnLayout {
                                        id: vitalsCol
                                        anchors.left: parent.left
                                        anchors.right: parent.right
                                        anchors.top: parent.top
                                        anchors.margins: 12
                                        spacing: 7

                                        Text {
                                            text: "VITALS & DRIVES"
                                            color: Theme.muted
                                            font.family: Theme.uiFont
                                            font.pixelSize: 9
                                            font.weight: Font.Bold
                                            font.letterSpacing: 0.6
                                        }

                                        Repeater {
                                            model: {
                                                const lp = root.selectedIsRoaming ? root.selectedLivePet : null;
                                                const rr = root.selectedResident;
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

                                            RowLayout {
                                                id: vitalBar
                                                required property var modelData
                                                Layout.fillWidth: true
                                                spacing: 8

                                                Text {
                                                    Layout.preferredWidth: 66
                                                    text: vitalBar.modelData.name
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
                                                        width: parent.width * Math.max(0.03, Math.min(1, vitalBar.modelData.val || 0))
                                                        height: parent.height
                                                        radius: 3
                                                        color: vitalBar.modelData.tint
                                                        Behavior on width { NumberAnimation { duration: Theme.animMs; easing.type: Easing.OutCubic } }
                                                    }
                                                }

                                                Text {
                                                    Layout.preferredWidth: 34
                                                    horizontalAlignment: Text.AlignRight
                                                    text: Math.round((vitalBar.modelData.val || 0) * 100) + "%"
                                                    color: Theme.text
                                                    font.family: Theme.monoFont
                                                    font.pixelSize: 10
                                                }
                                            }
                                        }

                                        Rectangle {
                                            Layout.fillWidth: true
                                            implicitHeight: 1
                                            color: Theme.borderSubtle
                                        }

                                        Text {
                                            text: "FIELD NOTES"
                                            color: Theme.muted
                                            font.family: Theme.uiFont
                                            font.pixelSize: 9
                                            font.weight: Font.Bold
                                            font.letterSpacing: 0.6
                                        }

                                        Repeater {
                                            model: {
                                                const list = (root.selectedIsRoaming && root.selectedLivePet)
                                                    ? (root.selectedLivePet.thoughts || [])
                                                    : (root.selectedResident ? root.selectedResident.thoughts : []);
                                                return list.slice(-6).reverse();
                                            }

                                            RowLayout {
                                                id: obsNote
                                                required property var modelData
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
                                                    text: obsNote.modelData.text || ""
                                                    color: Theme.text
                                                    font.family: Theme.uiFont
                                                    font.pixelSize: 11
                                                }

                                                Text {
                                                    visible: !!obsNote.modelData.t
                                                    text: root.formatAgo(obsNote.modelData.t || 0)
                                                    color: Theme.muted
                                                    font.family: Theme.monoFont
                                                    font.pixelSize: 9
                                                }
                                            }
                                        }
                                    }
                                }

                                Rectangle {
                                    Layout.fillWidth: true
                                    Layout.alignment: Qt.AlignTop
                                    implicitHeight: soulCol.implicitHeight + 24
                                    radius: Theme.radius(-3)
                                    color: Theme.bg
                                    border.width: 1
                                    border.color: Theme.borderSubtle

                                    ColumnLayout {
                                        id: soulCol
                                        anchors.left: parent.left
                                        anchors.right: parent.right
                                        anchors.top: parent.top
                                        anchors.margins: 12
                                        spacing: 7

                                        RowLayout {
                                            Layout.fillWidth: true
                                            Text {
                                                text: "TEMPERAMENT"
                                                color: Theme.muted
                                                font.family: Theme.uiFont
                                                font.pixelSize: 9
                                                font.weight: Font.Bold
                                                font.letterSpacing: 0.6
                                            }
                                            Item { Layout.fillWidth: true }
                                            Text {
                                                text: "Tick = initial nature"
                                                color: Theme.muted
                                                font.family: Theme.uiFont
                                                font.pixelSize: 9
                                            }
                                        }

                                        Repeater {
                                            model: Personality.TRAIT_KEYS

                                            RowLayout {
                                                id: sTraitRow
                                                required property string modelData
                                                readonly property var effMap: (root.selectedIsRoaming && root.selectedLivePet)
                                                    ? root.selectedLivePet.personality
                                                    : (root.selectedResident ? root.selectedResident.effectivePersonality : ({}))
                                                readonly property var baseMap: (root.selectedIsRoaming && root.selectedLivePet)
                                                    ? root.selectedLivePet.basePersonality
                                                    : (root.selectedResident ? root.selectedResident.basePersonality : ({}))
                                                readonly property real eff: effMap[sTraitRow.modelData] ?? 0.5
                                                readonly property real baseV: baseMap[sTraitRow.modelData] ?? 0.5
                                                readonly property int delta: Math.round((eff - baseV) * 100)

                                                Layout.fillWidth: true
                                                spacing: 8

                                                Text {
                                                    Layout.preferredWidth: 74
                                                    text: Personality.TRAIT_LABELS[sTraitRow.modelData] || sTraitRow.modelData
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
                                                        width: parent.width * Math.max(0.03, Math.min(1, sTraitRow.eff))
                                                        height: parent.height
                                                        radius: 3
                                                        color: Theme.accent
                                                        Behavior on width { NumberAnimation { duration: Theme.animMs; easing.type: Easing.OutCubic } }
                                                    }

                                                    Rectangle {
                                                        x: Math.max(0, Math.min(parent.width - 2, parent.width * sTraitRow.baseV - 1))
                                                        y: -1
                                                        width: 2
                                                        height: parent.height + 2
                                                        radius: 1
                                                        color: Theme.alpha(Theme.text, 0.55)
                                                    }
                                                }

                                                Text {
                                                    Layout.preferredWidth: 54
                                                    horizontalAlignment: Text.AlignRight
                                                    text: Math.round(sTraitRow.eff * 100)
                                                        + (sTraitRow.delta !== 0 ? (" " + (sTraitRow.delta > 0 ? "+" : "") + sTraitRow.delta) : "")
                                                    color: sTraitRow.delta > 0 ? Theme.positive : (sTraitRow.delta < 0 ? Theme.warm : Theme.subtext)
                                                    font.family: Theme.monoFont
                                                    font.pixelSize: 10
                                                }
                                            }
                                        }

                                        Rectangle {
                                            Layout.fillWidth: true
                                            implicitHeight: 1
                                            color: Theme.borderSubtle
                                        }

                                        Text {
                                            text: "EARNED HABITS"
                                            color: Theme.muted
                                            font.family: Theme.uiFont
                                            font.pixelSize: 9
                                            font.weight: Font.Bold
                                            font.letterSpacing: 0.6
                                        }

                                        Text {
                                            visible: {
                                                const qList = (root.selectedIsRoaming && root.selectedLivePet)
                                                    ? (root.selectedLivePet.quirks || [])
                                                    : (root.selectedResident ? root.selectedResident.quirks : []);
                                                return qList.length === 0;
                                            }
                                            Layout.fillWidth: true
                                            wrapMode: Text.WordWrap
                                            text: "Habits emerge naturally as memories consolidate during sleep."
                                            color: Theme.muted
                                            font.family: Theme.uiFont
                                            font.pixelSize: 10
                                        }

                                        Flow {
                                            Layout.fillWidth: true
                                            spacing: 5

                                            Repeater {
                                                model: (root.selectedIsRoaming && root.selectedLivePet)
                                                    ? (root.selectedLivePet.quirks || [])
                                                    : (root.selectedResident ? root.selectedResident.quirks : [])

                                                Rectangle {
                                                    id: sqBadge
                                                    required property string modelData
                                                    readonly property var def: Personality.QUIRK_DEFS[sqBadge.modelData]
                                                    radius: Theme.radius(-8)
                                                    color: Theme.surfaceAlt
                                                    border.width: 1
                                                    border.color: sqHover.containsMouse ? Theme.accent : Theme.borderSubtle
                                                    implicitWidth: sqRow.implicitWidth + 12
                                                    implicitHeight: 22

                                                    RowLayout {
                                                        id: sqRow
                                                        anchors.centerIn: parent
                                                        spacing: 5

                                                        UiIcon {
                                                            visible: !!sqBadge.def
                                                            name: sqBadge.def ? sqBadge.def.icon : "spark"
                                                            size: 11
                                                            color: Theme.accent
                                                        }

                                                        Text {
                                                            text: sqBadge.def ? sqBadge.def.label : sqBadge.modelData
                                                            color: Theme.text
                                                            font.family: Theme.uiFont
                                                            font.pixelSize: 10
                                                            font.weight: Font.Medium
                                                        }
                                                    }

                                                    MouseArea {
                                                        id: sqHover
                                                        anchors.fill: parent
                                                        hoverEnabled: true
                                                    }

                                                    UiTooltip {
                                                        active: sqHover.containsMouse
                                                        text: sqBadge.def ? sqBadge.def.summary : ""
                                                    }
                                                }
                                            }
                                        }

                                        Text {
                                            visible: {
                                                const rels = (root.selectedIsRoaming && root.selectedLivePet)
                                                    ? (root.selectedLivePet.relationships || {})
                                                    : (root.selectedResident ? root.selectedResident.relationships : {});
                                                return Object.keys(rels).length > 0;
                                            }
                                            text: "COMPANION BONDS"
                                            color: Theme.muted
                                            font.family: Theme.uiFont
                                            font.pixelSize: 9
                                            font.weight: Font.Bold
                                            font.letterSpacing: 0.6
                                        }

                                        Repeater {
                                            model: {
                                                const rels = (root.selectedIsRoaming && root.selectedLivePet)
                                                    ? (root.selectedLivePet.relationships || {})
                                                    : (root.selectedResident ? root.selectedResident.relationships : {});
                                                return Object.keys(rels);
                                            }

                                            Rectangle {
                                                id: sRelRow
                                                required property string modelData
                                                readonly property var relMap: (root.selectedIsRoaming && root.selectedLivePet)
                                                    ? (root.selectedLivePet.relationships || {})
                                                    : (root.selectedResident ? root.selectedResident.relationships : {})
                                                readonly property var relObj: relMap[sRelRow.modelData]
                                                readonly property string spName: root.companionSpecies(sRelRow.modelData, relObj)
                                                readonly property string targetId: root.companionId(sRelRow.modelData)
                                                readonly property real aff: (relObj && relObj.affinity !== undefined) ? relObj.affinity : 0.5
                                                readonly property color affTint: aff < 0.35 ? Theme.danger : (aff < 0.52 ? Theme.warm : Theme.love)

                                                Layout.fillWidth: true
                                                implicitHeight: 28
                                                radius: Theme.radius(-8)
                                                color: sRelMouse.containsMouse && targetId ? Theme.surfaceAlt : Theme.surface
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
                                                        speciesName: sRelRow.spName
                                                        currentState: "idle"
                                                        spriteDir: Qt.resolvedUrl("../assets/sprites/" + sRelRow.spName)
                                                    }

                                                    Text {
                                                        text: sRelRow.modelData
                                                        color: Theme.text
                                                        font.family: Theme.uiFont
                                                        font.pixelSize: 11
                                                        font.weight: Font.DemiBold
                                                    }

                                                    Rectangle {
                                                        radius: 4
                                                        color: Theme.alpha(sRelRow.affTint, 0.14)
                                                        implicitWidth: sRelTagTxt.implicitWidth + 8
                                                        implicitHeight: 16

                                                        Text {
                                                            id: sRelTagTxt
                                                            anchors.centerIn: parent
                                                            text: Personality.relationshipTag(sRelRow.relObj)
                                                            color: sRelRow.affTint
                                                            font.family: Theme.uiFont
                                                            font.pixelSize: 9
                                                            font.weight: Font.Medium
                                                        }
                                                    }

                                                    Item { Layout.fillWidth: true }

                                                    Text {
                                                        text: Math.round(sRelRow.aff * 100) + "%"
                                                        color: sRelRow.affTint
                                                        font.family: Theme.monoFont
                                                        font.pixelSize: 10
                                                    }
                                                }

                                                MouseArea {
                                                    id: sRelMouse
                                                    anchors.fill: parent
                                                    hoverEnabled: true
                                                    cursorShape: sRelRow.targetId ? Qt.PointingHandCursor : Qt.ArrowCursor
                                                    onClicked: {
                                                        if (sRelRow.targetId) root.selectCompanion(sRelRow.targetId);
                                                    }
                                                }
                                            }
                                        }

                                        Text {
                                            visible: {
                                                const j = (root.selectedIsRoaming && root.selectedLivePet)
                                                    ? (root.selectedLivePet.journal || [])
                                                    : (root.selectedResident ? root.selectedResident.journal : []);
                                                return j.length > 0;
                                            }
                                            text: "MILESTONES"
                                            color: Theme.muted
                                            font.family: Theme.uiFont
                                            font.pixelSize: 9
                                            font.weight: Font.Bold
                                            font.letterSpacing: 0.6
                                        }

                                        Repeater {
                                            model: {
                                                const j = (root.selectedIsRoaming && root.selectedLivePet)
                                                    ? (root.selectedLivePet.journal || [])
                                                    : (root.selectedResident ? root.selectedResident.journal : []);
                                                return j.slice(-4).reverse();
                                            }

                                            RowLayout {
                                                id: sJournalRow
                                                required property var modelData
                                                Layout.fillWidth: true
                                                spacing: 6

                                                Text {
                                                    Layout.fillWidth: true
                                                    elide: Text.ElideRight
                                                    text: sJournalRow.modelData.text || ""
                                                    color: Theme.subtext
                                                    font.family: Theme.uiFont
                                                    font.pixelSize: 10
                                                }

                                                Text {
                                                    visible: !!sJournalRow.modelData.t
                                                    text: root.formatAgo(sJournalRow.modelData.t || 0)
                                                    color: Theme.muted
                                                    font.family: Theme.monoFont
                                                    font.pixelSize: 9
                                                }
                                            }
                                        }
                                    }
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

                                Rectangle {
                                    visible: Config.pets.length > 1
                                    implicitHeight: 28
                                    radius: Theme.radius(-7)
                                    implicitWidth: relBtnTxt.implicitWidth + 18
                                    color: root.confirmRelease
                                        ? Theme.alpha(Theme.danger, 0.2)
                                        : (relBtnMouse.containsMouse ? Theme.alpha(Theme.danger, 0.1) : Theme.bg)
                                    border.width: 1
                                    border.color: Theme.alpha(Theme.danger, 0.65)

                                    Text {
                                        id: relBtnTxt
                                        anchors.centerIn: parent
                                        text: root.confirmRelease ? "Confirm Release?" : "Release Companion"
                                        color: Theme.danger
                                        font.family: Theme.uiFont
                                        font.pixelSize: 11
                                        font.weight: root.confirmRelease ? Font.Bold : Font.Medium
                                    }

                                    MouseArea {
                                        id: relBtnMouse
                                        anchors.fill: parent
                                        hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: {
                                            if (!root.selectedConfig) return;
                                            if (!root.confirmRelease) {
                                                root.confirmRelease = true;
                                                releaseResetTimer.restart();
                                                return;
                                            }
                                            root.confirmRelease = false;
                                            Config.removePet(root.selectedConfig.id);
                                        }
                                    }
                                }
                            }

                            Flow {
                                visible: root.morphExpanded
                                Layout.fillWidth: true
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
                                                    Config.updatePetSpecies(root.selectedConfig.id, morphSpChip.modelData);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                Rectangle {
                    visible: root.adoptMode
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    radius: Theme.radius(0)
                    color: Theme.surface
                    border.width: 1
                    border.color: Theme.borderSubtle

                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 16
                        spacing: 10

                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 10

                            ColumnLayout {
                                spacing: 2
                                Text {
                                    text: "Adopt a New Companion"
                                    color: Theme.text
                                    font.family: Theme.uiFont
                                    font.pixelSize: 16
                                    font.weight: Font.Bold
                                }
                                Text {
                                    text: "25 species with distinct gaits, sleep postures, and social dynamics — hover a card to preview"
                                    color: Theme.subtext
                                    font.family: Theme.uiFont
                                    font.pixelSize: 11
                                }
                            }

                            Item { Layout.fillWidth: true }

                            Rectangle {
                                implicitWidth: 176
                                implicitHeight: 32
                                radius: Theme.radius(-6)
                                color: Theme.bg
                                border.width: 1
                                border.color: adoptNameField.activeFocus ? Theme.accent : Theme.borderSubtle

                                RowLayout {
                                    anchors.fill: parent
                                    anchors.leftMargin: 9
                                    anchors.rightMargin: 8
                                    spacing: 5

                                    TextInput {
                                        id: adoptNameField
                                        Layout.fillWidth: true
                                        Layout.fillHeight: true
                                        verticalAlignment: TextInput.AlignVCenter
                                        selectByMouse: true
                                        color: Theme.text
                                        font.family: Theme.uiFont
                                        font.pixelSize: 11
                                        clip: true
                                        onTextChanged: root.adoptName = text

                                        HoverHandler {
                                            cursorShape: Qt.IBeamCursor
                                        }

                                        Text {
                                            visible: adoptNameField.text.length === 0
                                            anchors.verticalCenter: parent.verticalCenter
                                            text: "Custom name (optional)"
                                            color: Theme.muted
                                            font.family: Theme.uiFont
                                            font.pixelSize: 11
                                        }
                                    }

                                    Rectangle {
                                        visible: adoptNameField.text.length > 0
                                        implicitWidth: 16
                                        implicitHeight: 16
                                        radius: 8
                                        color: clearAdoptName.containsMouse ? Theme.surfaceAlt : "transparent"

                                        UiIcon {
                                            anchors.centerIn: parent
                                            name: "close"
                                            size: 9
                                            color: Theme.subtext
                                        }

                                        MouseArea {
                                            id: clearAdoptName
                                            anchors.fill: parent
                                            hoverEnabled: true
                                            cursorShape: Qt.PointingHandCursor
                                            onClicked: adoptNameField.text = ""
                                        }
                                    }
                                }
                            }

                            Rectangle {
                                implicitWidth: 196
                                implicitHeight: 32
                                radius: Theme.radius(-6)
                                color: Theme.bg
                                border.width: 1
                                border.color: catalogSearchInput.activeFocus ? Theme.accent : Theme.borderSubtle

                                RowLayout {
                                    anchors.fill: parent
                                    anchors.leftMargin: 9
                                    anchors.rightMargin: 8
                                    spacing: 6

                                    UiIcon {
                                        name: "search"
                                        size: 13
                                        color: catalogSearchInput.activeFocus ? Theme.accent : Theme.muted
                                    }

                                    TextInput {
                                        id: catalogSearchInput
                                        Layout.fillWidth: true
                                        Layout.fillHeight: true
                                        verticalAlignment: TextInput.AlignVCenter
                                        selectByMouse: true
                                        color: Theme.text
                                        font.family: Theme.uiFont
                                        font.pixelSize: 11
                                        clip: true
                                        onTextChanged: root.catalogSearch = text

                                        HoverHandler {
                                            cursorShape: Qt.IBeamCursor
                                        }

                                        Text {
                                            visible: catalogSearchInput.text.length === 0
                                            anchors.verticalCenter: parent.verticalCenter
                                            text: "Filter species or biome..."
                                            color: Theme.muted
                                            font.family: Theme.uiFont
                                            font.pixelSize: 11
                                        }
                                    }

                                    Rectangle {
                                        visible: catalogSearchInput.text.length > 0
                                        implicitWidth: 16
                                        implicitHeight: 16
                                        radius: 8
                                        color: clearCatalogSearch.containsMouse ? Theme.surfaceAlt : "transparent"

                                        UiIcon {
                                            anchors.centerIn: parent
                                            name: "close"
                                            size: 9
                                            color: Theme.subtext
                                        }

                                        MouseArea {
                                            id: clearCatalogSearch
                                            anchors.fill: parent
                                            hoverEnabled: true
                                            cursorShape: Qt.PointingHandCursor
                                            onClicked: catalogSearchInput.text = ""
                                        }
                                    }
                                }
                            }
                        }

                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 5

                            Text {
                                text: "Seed Nature"
                                color: Theme.subtext
                                font.family: Theme.uiFont
                                font.pixelSize: 11
                            }

                            Repeater {
                                model: root.naturesList

                                Rectangle {
                                    id: natChip
                                    required property string modelData
                                    readonly property bool cur: root.adoptNature === natChip.modelData
                                    implicitHeight: 24
                                    radius: Theme.radius(-8)
                                    implicitWidth: natTxt.implicitWidth + 12
                                    color: cur
                                        ? Theme.accentSoft
                                        : (natMouse.containsMouse ? Theme.surfaceAlt : Theme.bg)
                                    border.width: 1
                                    border.color: cur ? Theme.accent : Theme.borderSubtle

                                    Text {
                                        id: natTxt
                                        anchors.centerIn: parent
                                        text: root.capitalize(natChip.modelData)
                                        color: natChip.cur ? Theme.accent : Theme.text
                                        font.family: Theme.uiFont
                                        font.pixelSize: 10
                                        font.weight: natChip.cur ? Font.DemiBold : Font.Normal
                                    }

                                    MouseArea {
                                        id: natMouse
                                        anchors.fill: parent
                                        hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: root.adoptNature = natChip.modelData
                                    }
                                }
                            }

                            Item { Layout.fillWidth: true }

                            Rectangle {
                                implicitHeight: 26
                                implicitWidth: initRoamRow.implicitWidth + 4
                                radius: Theme.radius(-7)
                                color: Theme.bg
                                border.width: 1
                                border.color: Theme.borderSubtle

                                RowLayout {
                                    id: initRoamRow
                                    anchors.centerIn: parent
                                    spacing: 2

                                    Repeater {
                                        model: [
                                            { k: "auto", l: "Auto" },
                                            { k: "always", l: "Always Out" },
                                            { k: "penned", l: "Sanctuary" }
                                        ]

                                        Rectangle {
                                            id: initRoamChip
                                            required property var modelData
                                            readonly property bool cur: root.adoptRoamMode === initRoamChip.modelData.k
                                            implicitHeight: 22
                                            radius: Theme.radius(-8)
                                            implicitWidth: initRoamTxt.implicitWidth + 12
                                            color: cur
                                                ? Theme.accentSoft
                                                : (initRoamMouse.containsMouse ? Theme.surfaceAlt : "transparent")
                                            border.width: cur ? 1 : 0
                                            border.color: Theme.accent

                                            Text {
                                                id: initRoamTxt
                                                anchors.centerIn: parent
                                                text: initRoamChip.modelData.l
                                                color: initRoamChip.cur ? Theme.accent : Theme.subtext
                                                font.family: Theme.uiFont
                                                font.pixelSize: 10
                                                font.weight: initRoamChip.cur ? Font.DemiBold : Font.Normal
                                            }

                                            MouseArea {
                                                id: initRoamMouse
                                                anchors.fill: parent
                                                hoverEnabled: true
                                                cursorShape: Qt.PointingHandCursor
                                                onClicked: root.adoptRoamMode = initRoamChip.modelData.k
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        Flickable {
                            id: catalogFlick
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            clip: true
                            contentWidth: width
                            contentHeight: catalogGrid.implicitHeight
                            boundsBehavior: Flickable.StopAtBounds
                            interactive: contentHeight > height

                            GridLayout {
                                id: catalogGrid
                                width: catalogFlick.width
                                columns: Math.max(2, Math.floor(catalogFlick.width / 240))
                                columnSpacing: 8
                                rowSpacing: 8

                                Repeater {
                                    model: root.filteredCatalog

                                    Rectangle {
                                        id: catCard
                                        required property string modelData
                                        readonly property var prof: SpeciesProfile.profileFor(catCard.modelData)
                                        readonly property bool cardHovered: catHover.hovered || adoptClick.containsMouse

                                        Layout.fillWidth: true
                                        implicitHeight: 114
                                        radius: Theme.radius(-3)
                                        color: cardHovered ? Theme.alpha(Theme.surfaceAlt, 0.65) : Theme.bg
                                        border.width: 1
                                        border.color: cardHovered ? Theme.accent : Theme.borderSubtle
                                        Behavior on color { ColorAnimation { duration: 120 } }

                                        HoverHandler {
                                            id: catHover
                                        }

                                        ColumnLayout {
                                            anchors.fill: parent
                                            anchors.margins: 10
                                            spacing: 6

                                            RowLayout {
                                                Layout.fillWidth: true
                                                spacing: 9

                                                SpriteAnimation {
                                                    Layout.preferredWidth: 46
                                                    Layout.preferredHeight: 46
                                                    speciesName: catCard.modelData
                                                    currentState: catCard.cardHovered && catCard.prof.signature
                                                        ? catCard.prof.signature.state
                                                        : "idle"
                                                    spriteDir: Qt.resolvedUrl("../assets/sprites/" + catCard.modelData)
                                                }

                                                ColumnLayout {
                                                    Layout.fillWidth: true
                                                    spacing: 2

                                                    RowLayout {
                                                        spacing: 5
                                                        Text {
                                                            text: catCard.prof.displayName
                                                            color: Theme.text
                                                            font.family: Theme.uiFont
                                                            font.pixelSize: 13
                                                            font.weight: Font.Bold
                                                        }

                                                        UiIcon {
                                                            visible: !!catCard.prof.nocturnalAffinity
                                                            name: "moon"
                                                            size: 11
                                                            color: Theme.warm
                                                        }
                                                    }

                                                    Text {
                                                        text: catCard.prof.biome
                                                        color: Theme.accent
                                                        font.family: Theme.uiFont
                                                        font.pixelSize: 10
                                                        font.weight: Font.Medium
                                                    }
                                                }

                                                Rectangle {
                                                    implicitHeight: 26
                                                    radius: Theme.radius(-7)
                                                    implicitWidth: adoptBtnRow.implicitWidth + 14
                                                    color: adoptClick.containsMouse
                                                        ? Theme.positive
                                                        : Theme.alpha(Theme.positive, 0.14)
                                                    border.width: 1
                                                    border.color: Theme.positive
                                                    Behavior on color { ColorAnimation { duration: 120 } }

                                                    RowLayout {
                                                        id: adoptBtnRow
                                                        anchors.centerIn: parent
                                                        spacing: 4

                                                        UiIcon {
                                                            name: "plus"
                                                            size: 10
                                                            color: adoptClick.containsMouse ? Theme.overAccent : Theme.positive
                                                        }

                                                        Text {
                                                            text: "Adopt"
                                                            color: adoptClick.containsMouse ? Theme.overAccent : Theme.positive
                                                            font.family: Theme.uiFont
                                                            font.pixelSize: 10
                                                            font.weight: Font.DemiBold
                                                        }
                                                    }

                                                    MouseArea {
                                                        id: adoptClick
                                                        anchors.fill: parent
                                                        hoverEnabled: true
                                                        cursorShape: Qt.PointingHandCursor
                                                        onClicked: {
                                                            const created = Config.addPet(
                                                                catCard.modelData,
                                                                root.adoptName,
                                                                root.adoptNature,
                                                                root.adoptRoamMode
                                                            );
                                                            adoptNameField.text = "";
                                                            root.selectCompanion(created.id);
                                                        }
                                                    }
                                                }
                                            }

                                            Text {
                                                Layout.fillWidth: true
                                                Layout.fillHeight: true
                                                wrapMode: Text.WordWrap
                                                maximumLineCount: 2
                                                elide: Text.ElideRight
                                                text: catCard.prof.blurb
                                                color: Theme.subtext
                                                font.family: Theme.uiFont
                                                font.pixelSize: 10
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
    }
}
