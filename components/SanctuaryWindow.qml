pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell
import "../config"
import "../services"
import "SpeciesProfile.js" as SpeciesProfile
import "SpriteSheet.js" as SpriteSheet
import "ai/Personality.js" as Personality

FloatingWindow {
    id: root

    implicitWidth: 1080
    implicitHeight: 700
    minimumSize: Qt.size(860, 560)
    title: "Pokémon Sanctuary"
    color: "transparent"

    property bool adoptMode: false
    property string rosterSearch: ""
    property string rosterFilter: "all" // "all" | "roaming" | "penned"
    property string catalogSearch: ""
    property string adoptName: ""
    property string adoptNature: "emergent"
    property string adoptRoamMode: "auto"
    property bool morphExpanded: false
    property bool confirmRelease: false

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

    function formatAge(sec: real): string {
        const s = Math.max(0, Math.floor(sec || 0));
        if (s < 3600) return Math.max(1, Math.floor(s / 60)) + "m";
        if (s < 86400) return Math.floor(s / 3600) + "h";
        return Math.floor(s / 86400) + "d " + Math.floor((s % 86400) / 3600) + "h";
    }

    function commitRename(): void {
        if (!root.selectedConfig) return;
        const next = renameInput.text.trim();
        if (next.length > 0 && next !== root.selectedConfig.name) {
            const res = PetManager.renameCompanion(root.selectedConfig.id, next);
            if (res) renameInput.text = res;
        }
        renameInput.focus = false;
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
            if (root.adoptMode) root.adoptMode = false;
            else PetManager.closePen();
        }
    }

    onClosed: PetManager.closePen()

    Rectangle {
        anchors.fill: parent
        color: Qt.rgba(Theme.bg.r, Theme.bg.g, Theme.bg.b, 0.97)
        border.width: 1
        border.color: Theme.border
        radius: 14

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 16
            spacing: 12

            // 1. Top Header Bar
            RowLayout {
                Layout.fillWidth: true
                spacing: 10

                ColumnLayout {
                    spacing: 2
                    Text {
                        text: "🐾 Pokémon Sanctuary"
                        color: Theme.text
                        font.family: Theme.fontFamily
                        font.pixelSize: 16
                        font.bold: true
                    }
                    Text {
                        text: PetManager.roamingIds.length + " Roaming on Desktop · "
                            + Math.max(0, Config.pets.length - PetManager.roamingIds.length) + " Resting in Sanctuary · "
                            + Config.pets.length + " Companions"
                        color: Theme.subtext
                        font.family: Theme.fontFamily
                        font.pixelSize: 10
                    }
                }

                Item { Layout.fillWidth: true }

                // Max Roaming Stepper
                Rectangle {
                    implicitHeight: 28
                    radius: 8
                    color: Theme.surface
                    border.width: 1
                    border.color: Theme.border
                    implicitWidth: maxRow.implicitWidth + 16

                    RowLayout {
                        id: maxRow
                        anchors.centerIn: parent
                        spacing: 6

                        Text {
                            text: "Max Roaming:"
                            color: Theme.subtext
                            font.family: Theme.fontFamily
                            font.pixelSize: 10
                        }

                        Rectangle {
                            implicitWidth: 20
                            implicitHeight: 20
                            radius: 5
                            color: minusArea.containsMouse ? Theme.surfaceAlt : "transparent"
                            Text {
                                anchors.centerIn: parent
                                text: "−"
                                color: Theme.text
                                font.family: Theme.fontFamily
                                font.pixelSize: 12
                                font.bold: true
                            }
                            MouseArea {
                                id: minusArea
                                anchors.fill: parent
                                hoverEnabled: true
                                onClicked: Config.updateMaxRoaming(Config.maxActiveRoaming - 1)
                            }
                        }

                        Text {
                            text: String(Config.maxActiveRoaming)
                            color: Theme.accent
                            font.family: Theme.fontFamily
                            font.pixelSize: 11
                            font.bold: true
                        }

                        Rectangle {
                            implicitWidth: 20
                            implicitHeight: 20
                            radius: 5
                            color: plusArea.containsMouse ? Theme.surfaceAlt : "transparent"
                            Text {
                                anchors.centerIn: parent
                                text: "+"
                                color: Theme.text
                                font.family: Theme.fontFamily
                                font.pixelSize: 12
                                font.bold: true
                            }
                            MouseArea {
                                id: plusArea
                                anchors.fill: parent
                                hoverEnabled: true
                                onClicked: Config.updateMaxRoaming(Config.maxActiveRoaming + 1)
                            }
                        }
                    }
                }

                // Quick Global Chips
                Repeater {
                    model: [
                        { label: "💬 Emotes", active: Config.showEmotes, key: "emotes" },
                        { label: "🪟 Perch", active: Config.enablePerching, key: "perch" },
                        { label: "♪ Music", active: Config.enableMusicReact, key: "music" },
                        { label: PetManager.hidden ? "👁 Hidden" : "👁 Visible", active: !PetManager.hidden, key: "hide" }
                    ]

                    Rectangle {
                        id: hdrChip
                        required property var modelData
                        implicitHeight: 28
                        radius: 8
                        implicitWidth: hdrChipTxt.implicitWidth + 14
                        color: hdrChip.modelData.active ? Theme.accentSoft : Theme.surface
                        border.width: 1
                        border.color: hdrChipArea.containsMouse || hdrChip.modelData.active ? Theme.accent : Theme.border

                        Text {
                            id: hdrChipTxt
                            anchors.centerIn: parent
                            text: hdrChip.modelData.label
                            color: hdrChip.modelData.active ? Theme.accent : Theme.text
                            font.family: Theme.fontFamily
                            font.pixelSize: 10
                        }

                        MouseArea {
                            id: hdrChipArea
                            anchors.fill: parent
                            hoverEnabled: true
                            onClicked: {
                                const k = hdrChip.modelData.key;
                                if (k === "emotes") { Config.showEmotes = !Config.showEmotes; Config.save(); }
                                else if (k === "perch") { Config.enablePerching = !Config.enablePerching; Config.save(); }
                                else if (k === "music") { Config.enableMusicReact = !Config.enableMusicReact; Config.save(); }
                                else if (k === "hide") PetManager.hidden = !PetManager.hidden;
                            }
                        }
                    }
                }

                // Adopt Catalog Toggle Button
                Rectangle {
                    implicitHeight: 28
                    radius: 8
                    implicitWidth: adoptToggleTxt.implicitWidth + 18
                    color: root.adoptMode ? Theme.positive : Theme.accentSoft
                    border.width: 1
                    border.color: root.adoptMode ? Theme.positive : Theme.accent

                    Text {
                        id: adoptToggleTxt
                        anchors.centerIn: parent
                        text: root.adoptMode ? "← Back to Companion" : "+ Adopt Pokémon"
                        color: root.adoptMode ? Theme.bg : Theme.accent
                        font.family: Theme.fontFamily
                        font.pixelSize: 10
                        font.bold: true
                    }

                    MouseArea {
                        anchors.fill: parent
                        onClicked: root.adoptMode = !root.adoptMode
                    }
                }

                // Close Button
                Rectangle {
                    implicitWidth: 28
                    implicitHeight: 28
                    radius: 8
                    color: closeWinArea.containsMouse ? Theme.surfaceAlt : Theme.surface
                    border.width: 1
                    border.color: Theme.border

                    Text {
                        anchors.centerIn: parent
                        text: "×"
                        color: Theme.subtext
                        font.family: Theme.fontFamily
                        font.pixelSize: 15
                        font.bold: true
                    }

                    MouseArea {
                        id: closeWinArea
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: PetManager.closePen()
                    }
                }
            }

            // 2. Live Animated Sanctuary Pasture Strip
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 108
                radius: 11
                color: Theme.surface
                border.width: 1
                border.color: Theme.border
                clip: true

                Flickable {
                    id: pastureFlick
                    anchors.fill: parent
                    anchors.margins: 8
                    contentWidth: Math.max(width, pastureRow.implicitWidth)
                    contentHeight: height
                    boundsBehavior: Flickable.StopAtBounds
                    interactive: contentWidth > width

                    Row {
                        id: pastureRow
                        height: parent.height
                        spacing: 10

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
                                readonly property string animState: isOut
                                    ? (liveRef ? liveRef.state_ : "idle")
                                    : (resRef ? resRef.penState : "idle")

                                width: 92
                                height: pastureRow.height
                                radius: 9
                                color: isSelected ? Theme.accentSoft : (pastureMouse.containsMouse ? Theme.surfaceAlt : "transparent")
                                border.width: 1
                                border.color: isSelected ? Theme.accent : (isOut ? Theme.positive : Theme.border)

                                ColumnLayout {
                                    anchors.fill: parent
                                    anchors.margins: 5
                                    spacing: 2

                                    Item {
                                        Layout.fillWidth: true
                                        Layout.fillHeight: true

                                        SpriteAnimation {
                                            anchors.centerIn: parent
                                            width: 48
                                            height: 48
                                            speciesName: pastureTile.modelData.sprite
                                            currentState: pastureTile.animState === "drag" ? "idle" : pastureTile.animState
                                            spriteDir: Qt.resolvedUrl("../assets/sprites/" + pastureTile.modelData.sprite)
                                        }
                                    }

                                    Text {
                                        Layout.fillWidth: true
                                        horizontalAlignment: Text.AlignHCenter
                                        elide: Text.ElideRight
                                        text: pastureTile.modelData.name
                                        color: Theme.text
                                        font.family: Theme.fontFamily
                                        font.pixelSize: 10
                                        font.bold: pastureTile.isSelected
                                    }

                                    Text {
                                        Layout.fillWidth: true
                                        horizontalAlignment: Text.AlignHCenter
                                        text: pastureTile.isOut ? "● Roaming" : "⌂ Sanctuary"
                                        color: pastureTile.isOut ? Theme.positive : Theme.warm
                                        font.family: Theme.fontFamily
                                        font.pixelSize: 8
                                    }
                                }

                                MouseArea {
                                    id: pastureMouse
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    onClicked: root.selectCompanion(pastureTile.modelData.id)
                                }
                            }
                        }
                    }
                }
            }

            // 3. Split Main Body (Roster on Left + Detail/Adopt on Right)
            RowLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                spacing: 12

                // Left Column: Companion Roster
                Rectangle {
                    Layout.preferredWidth: 286
                    Layout.fillHeight: true
                    radius: 11
                    color: Theme.surface
                    border.width: 1
                    border.color: Theme.border

                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 10
                        spacing: 8

                        // Roster Search Box
                        Rectangle {
                            Layout.fillWidth: true
                            implicitHeight: 28
                            radius: 7
                            color: Theme.bg
                            border.width: 1
                            border.color: rosterSearchInput.activeFocus ? Theme.accent : Theme.border

                            TextInput {
                                id: rosterSearchInput
                                anchors.fill: parent
                                anchors.leftMargin: 9
                                anchors.rightMargin: 9
                                verticalAlignment: TextInput.AlignVCenter
                                color: Theme.text
                                font.family: Theme.fontFamily
                                font.pixelSize: 10
                                clip: true
                                onTextChanged: root.rosterSearch = text

                                Text {
                                    visible: rosterSearchInput.text.length === 0
                                    anchors.verticalCenter: parent.verticalCenter
                                    text: "Search companions..."
                                    color: Theme.subtext
                                    font.family: Theme.fontFamily
                                    font.pixelSize: 10
                                }
                            }
                        }

                        // Filter Tabs (All / Roaming / In Pen)
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 5

                            Repeater {
                                model: [
                                    { key: "all", label: "All (" + Config.pets.length + ")" },
                                    { key: "roaming", label: "Out (" + PetManager.roamingIds.length + ")" },
                                    { key: "penned", label: "Pen (" + Math.max(0, Config.pets.length - PetManager.roamingIds.length) + ")" }
                                ]

                                Rectangle {
                                    id: fltTab
                                    required property var modelData
                                    Layout.fillWidth: true
                                    implicitHeight: 23
                                    radius: 6
                                    color: root.rosterFilter === fltTab.modelData.key ? Theme.accentSoft : "transparent"
                                    border.width: 1
                                    border.color: root.rosterFilter === fltTab.modelData.key ? Theme.accent : Theme.border

                                    Text {
                                        anchors.centerIn: parent
                                        text: fltTab.modelData.label
                                        color: root.rosterFilter === fltTab.modelData.key ? Theme.accent : Theme.subtext
                                        font.family: Theme.fontFamily
                                        font.pixelSize: 9
                                        font.bold: root.rosterFilter === fltTab.modelData.key
                                    }

                                    MouseArea {
                                        anchors.fill: parent
                                        onClicked: root.rosterFilter = fltTab.modelData.key
                                    }
                                }
                            }
                        }

                        // Scrollable Companion List
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
                                        implicitHeight: 54
                                        radius: 8
                                        color: isSelected ? Theme.accentSoft : (rosterMouse.containsMouse ? Theme.surfaceAlt : Theme.bg)
                                        border.width: 1
                                        border.color: isSelected ? Theme.accent : Theme.border

                                        MouseArea {
                                            id: rosterMouse
                                            anchors.fill: parent
                                            hoverEnabled: true
                                            onClicked: root.selectCompanion(rosterItem.modelData.id)
                                        }

                                        RowLayout {
                                            anchors.fill: parent
                                            anchors.margins: 7
                                            spacing: 8

                                            SpriteAnimation {
                                                Layout.preferredWidth: 36
                                                Layout.preferredHeight: 36
                                                speciesName: rosterItem.modelData.sprite
                                                currentState: "idle"
                                                spriteDir: Qt.resolvedUrl("../assets/sprites/" + rosterItem.modelData.sprite)
                                            }

                                            ColumnLayout {
                                                Layout.fillWidth: true
                                                spacing: 2

                                                RowLayout {
                                                    Layout.fillWidth: true
                                                    spacing: 4
                                                    Text {
                                                        Layout.fillWidth: true
                                                        elide: Text.ElideRight
                                                        text: rosterItem.modelData.name
                                                        color: Theme.text
                                                        font.family: Theme.fontFamily
                                                        font.pixelSize: 11
                                                        font.bold: true
                                                    }
                                                    Text {
                                                        text: (rosterItem.modelData.roamMode || "auto").toUpperCase()
                                                        color: Theme.subtext
                                                        font.family: Theme.fontFamily
                                                        font.pixelSize: 8
                                                    }
                                                }

                                                Text {
                                                    Layout.fillWidth: true
                                                    elide: Text.ElideRight
                                                    text: rosterItem.itemArch + " · ♥ " + Math.round(rosterItem.itemMood * 100) + "%"
                                                    color: Theme.subtext
                                                    font.family: Theme.fontFamily
                                                    font.pixelSize: 9
                                                }
                                            }

                                            // Quick Out / Pen Toggle Button
                                            Rectangle {
                                                implicitWidth: 48
                                                implicitHeight: 24
                                                radius: 6
                                                color: rosterItem.isOut ? Qt.rgba(Theme.positive.r, Theme.positive.g, Theme.positive.b, 0.18) : Theme.surface
                                                border.width: 1
                                                border.color: rosterItem.isOut ? Theme.positive : Theme.warm

                                                Text {
                                                    anchors.centerIn: parent
                                                    text: rosterItem.isOut ? "Out" : "Pen"
                                                    color: rosterItem.isOut ? Theme.positive : Theme.warm
                                                    font.family: Theme.fontFamily
                                                    font.pixelSize: 9
                                                    font.bold: true
                                                }

                                                MouseArea {
                                                    anchors.fill: parent
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

                // Right Column Mode A: Selected Companion Detail View
                Rectangle {
                    visible: !root.adoptMode && root.selectedConfig !== null
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    radius: 11
                    color: Theme.surface
                    border.width: 1
                    border.color: Theme.border

                    Flickable {
                        id: detailFlick
                        anchors.fill: parent
                        anchors.margins: 14
                        clip: true
                        contentWidth: width
                        contentHeight: detailCol.implicitHeight
                        boundsBehavior: Flickable.StopAtBounds
                        interactive: contentHeight > height

                        ColumnLayout {
                            id: detailCol
                            width: detailFlick.width
                            spacing: 12

                            // Companion Hero + Rename + Roam Policy
                            RowLayout {
                                Layout.fillWidth: true
                                spacing: 14

                                Rectangle {
                                    implicitWidth: 78
                                    implicitHeight: 78
                                    radius: 12
                                    color: Theme.bg
                                    border.width: 1
                                    border.color: root.selectedIsRoaming ? Theme.positive : Theme.warm

                                    SpriteAnimation {
                                        anchors.centerIn: parent
                                        width: 64
                                        height: 64
                                        speciesName: root.selectedConfig ? root.selectedConfig.sprite : "zorua"
                                        currentState: root.selectedIsRoaming && root.selectedLivePet
                                            ? (root.selectedLivePet.state_ === "drag" ? "idle" : root.selectedLivePet.state_)
                                            : (root.selectedResident ? root.selectedResident.penState : "idle")
                                        spriteDir: root.selectedConfig
                                            ? Qt.resolvedUrl("../assets/sprites/" + root.selectedConfig.sprite)
                                            : ""
                                    }
                                }

                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: 5

                                    RowLayout {
                                        Layout.fillWidth: true
                                        spacing: 8

                                        Rectangle {
                                            implicitWidth: 185
                                            implicitHeight: 26
                                            radius: 7
                                            color: Theme.bg
                                            border.width: 1
                                            border.color: renameInput.activeFocus ? Theme.accent : Theme.border

                                            TextInput {
                                                id: renameInput
                                                anchors.fill: parent
                                                anchors.leftMargin: 8
                                                anchors.rightMargin: 8
                                                verticalAlignment: TextInput.AlignVCenter
                                                text: root.selectedConfig ? root.selectedConfig.name : ""
                                                color: Theme.text
                                                font.family: Theme.fontFamily
                                                font.pixelSize: 13
                                                font.bold: true
                                                clip: true
                                                onAccepted: root.commitRename()
                                            }
                                        }

                                        Rectangle {
                                            visible: root.selectedConfig !== null && renameInput.text.trim() !== root.selectedConfig.name
                                            implicitHeight: 26
                                            radius: 7
                                            implicitWidth: saveRenameTxt.implicitWidth + 14
                                            color: Theme.accentSoft
                                            border.width: 1
                                            border.color: Theme.accent

                                            Text {
                                                id: saveRenameTxt
                                                anchors.centerIn: parent
                                                text: "Save Name"
                                                color: Theme.accent
                                                font.family: Theme.fontFamily
                                                font.pixelSize: 10
                                                font.bold: true
                                            }

                                            MouseArea {
                                                anchors.fill: parent
                                                onClicked: root.commitRename()
                                            }
                                        }

                                        Rectangle {
                                            implicitHeight: 22
                                            radius: 6
                                            color: Theme.accentSoft
                                            implicitWidth: spTagTxt.implicitWidth + 12
                                            Text {
                                                id: spTagTxt
                                                anchors.centerIn: parent
                                                text: {
                                                    if (!root.selectedConfig) return "";
                                                    const prof = SpeciesProfile.profileFor(root.selectedConfig.sprite);
                                                    const age = root.selectedIsRoaming && root.selectedLivePet
                                                        ? root.selectedLivePet.ageSeconds
                                                        : (root.selectedResident ? root.selectedResident.ageSeconds : 0);
                                                    return prof.displayName + " · " + prof.biome + " · " + root.formatAge(age);
                                                }
                                                color: Theme.accent
                                                font.family: Theme.fontFamily
                                                font.pixelSize: 10
                                            }
                                        }

                                        Item { Layout.fillWidth: true }
                                    }

                                    Text {
                                        Layout.fillWidth: true
                                        text: {
                                            const arch = root.selectedIsRoaming && root.selectedLivePet
                                                ? root.selectedLivePet.archetype
                                                : (root.selectedResident ? root.selectedResident.archetype : "Curious Hatchling");
                                            const blurb = root.selectedConfig
                                                ? SpeciesProfile.profileFor(root.selectedConfig.sprite).blurb
                                                : "";
                                            return arch + " — " + blurb;
                                        }
                                        color: Theme.warm
                                        font.family: Theme.fontFamily
                                        font.pixelSize: 10
                                        wrapMode: Text.WordWrap
                                    }

                                    Text {
                                        Layout.fillWidth: true
                                        elide: Text.ElideRight
                                        text: {
                                            if (root.selectedIsRoaming && root.selectedLivePet) {
                                                const p = root.selectedLivePet;
                                                const lbl = p.activePlan ? p.activePlan.label : "Observing desktop";
                                                return "▸ Roaming: " + lbl + " — " + (p.lastThoughtText || "");
                                            }
                                            const act = root.selectedResident ? root.selectedResident.sanctuaryActivity : "Resting in Sanctuary";
                                            return "▸ In Sanctuary: " + act;
                                        }
                                        color: Theme.subtext
                                        font.family: Theme.fontFamily
                                        font.pixelSize: 10
                                    }
                                }
                            }

                            // Roam Mode Controls + Instant Call / Tuck Buttons
                            RowLayout {
                                Layout.fillWidth: true
                                spacing: 6

                                Text {
                                    text: "Roaming Policy:"
                                    color: Theme.subtext
                                    font.family: Theme.fontFamily
                                    font.pixelSize: 10
                                }

                                Repeater {
                                    model: [
                                        { mode: "auto", label: "↻ Auto Rotate" },
                                        { mode: "always", label: "☀ Always Out" },
                                        { mode: "penned", label: "⌂ Stay in Pen" }
                                    ]

                                    Rectangle {
                                        id: modeBtn
                                        required property var modelData
                                        readonly property bool active: root.selectedConfig !== null
                                            && (root.selectedConfig.roamMode || "auto") === modeBtn.modelData.mode
                                        implicitHeight: 26
                                        radius: 7
                                        implicitWidth: modeBtnTxt.implicitWidth + 16
                                        color: active ? Theme.accentSoft : Theme.bg
                                        border.width: 1
                                        border.color: active ? Theme.accent : Theme.border

                                        Text {
                                            id: modeBtnTxt
                                            anchors.centerIn: parent
                                            text: modeBtn.modelData.label
                                            color: modeBtn.active ? Theme.accent : Theme.text
                                            font.family: Theme.fontFamily
                                            font.pixelSize: 10
                                            font.bold: modeBtn.active
                                        }

                                        MouseArea {
                                            anchors.fill: parent
                                            onClicked: {
                                                if (root.selectedConfig) {
                                                    Config.updatePetRoamMode(root.selectedConfig.id, modeBtn.modelData.mode);
                                                }
                                            }
                                        }
                                    }
                                }

                                Item { Layout.fillWidth: true }

                                Rectangle {
                                    visible: !root.selectedIsRoaming
                                    implicitHeight: 26
                                    radius: 7
                                    implicitWidth: callNowTxt.implicitWidth + 16
                                    color: Qt.rgba(Theme.positive.r, Theme.positive.g, Theme.positive.b, 0.2)
                                    border.width: 1
                                    border.color: Theme.positive

                                    Text {
                                        id: callNowTxt
                                        anchors.centerIn: parent
                                        text: "↗ Call Out to Desktop"
                                        color: Theme.positive
                                        font.family: Theme.fontFamily
                                        font.pixelSize: 10
                                        font.bold: true
                                    }

                                    MouseArea {
                                        anchors.fill: parent
                                        onClicked: {
                                            if (root.selectedConfig) PetManager.callOutNow(root.selectedConfig.id);
                                        }
                                    }
                                }

                                Rectangle {
                                    visible: root.selectedIsRoaming
                                    implicitHeight: 26
                                    radius: 7
                                    implicitWidth: walkPenTxt.implicitWidth + 16
                                    color: Theme.bg
                                    border.width: 1
                                    border.color: Theme.warm

                                    Text {
                                        id: walkPenTxt
                                        anchors.centerIn: parent
                                        text: "↙ Walk Off to Pen"
                                        color: Theme.warm
                                        font.family: Theme.fontFamily
                                        font.pixelSize: 10
                                    }

                                    MouseArea {
                                        anchors.fill: parent
                                        onClicked: {
                                            if (root.selectedConfig) PetManager.sendToPenNow(root.selectedConfig.id, true);
                                        }
                                    }
                                }

                                Rectangle {
                                    visible: root.selectedIsRoaming
                                    implicitHeight: 26
                                    radius: 7
                                    implicitWidth: instPenTxt.implicitWidth + 14
                                    color: Theme.bg
                                    border.width: 1
                                    border.color: Theme.border

                                    Text {
                                        id: instPenTxt
                                        anchors.centerIn: parent
                                        text: "⌂ Instant Pen"
                                        color: Theme.subtext
                                        font.family: Theme.fontFamily
                                        font.pixelSize: 10
                                    }

                                    MouseArea {
                                        anchors.fill: parent
                                        onClicked: {
                                            if (root.selectedConfig) PetManager.sendToPenNow(root.selectedConfig.id, false);
                                        }
                                    }
                                }
                            }

                            // Care Actions + Scale & Monitor Row
                            RowLayout {
                                Layout.fillWidth: true
                                spacing: 6

                                Repeater {
                                    model: [
                                        { label: "♥ Pat", act: "pat", show: true },
                                        { label: "🍎 Feed", act: "feed", show: true },
                                        { label: "✦ Play", act: "play", show: true },
                                        { label: "📍 Summon", act: "summon", show: root.selectedIsRoaming }
                                    ]

                                    Rectangle {
                                        id: careChip
                                        required property var modelData
                                        visible: careChip.modelData.show
                                        implicitHeight: 26
                                        radius: 7
                                        implicitWidth: careTxt.implicitWidth + 14
                                        color: careMouse.containsMouse ? Theme.accentSoft : Theme.bg
                                        border.width: 1
                                        border.color: careMouse.containsMouse ? Theme.accent : Theme.border

                                        Text {
                                            id: careTxt
                                            anchors.centerIn: parent
                                            text: careChip.modelData.label
                                            color: Theme.text
                                            font.family: Theme.fontFamily
                                            font.pixelSize: 10
                                        }

                                        MouseArea {
                                            id: careMouse
                                            anchors.fill: parent
                                            hoverEnabled: true
                                            onClicked: {
                                                const a = careChip.modelData.act;
                                                if (root.selectedIsRoaming && root.selectedLivePet) {
                                                    if (a === "pat") root.selectedLivePet.onStroked();
                                                    else if (a === "feed") root.selectedLivePet.onFed();
                                                    else if (a === "play") root.selectedLivePet.onPlayTriggered();
                                                    else if (a === "summon") root.selectedLivePet.summonToCursor();
                                                } else if (root.selectedResident) {
                                                    if (a === "pat") root.selectedResident.patInPen();
                                                    else if (a === "feed") root.selectedResident.feedInPen();
                                                    else if (a === "play") root.selectedResident.playInPen();
                                                }
                                            }
                                        }
                                    }
                                }

                                Item { Layout.fillWidth: true }

                                Text {
                                    text: "Scale:"
                                    color: Theme.subtext
                                    font.family: Theme.fontFamily
                                    font.pixelSize: 10
                                }

                                Repeater {
                                    model: [1, 2, 3, 4]

                                    Rectangle {
                                        id: scaleChip
                                        required property int modelData
                                        readonly property bool cur: root.selectedConfig !== null && (root.selectedConfig.scale ?? 2) === scaleChip.modelData
                                        implicitWidth: 26
                                        implicitHeight: 24
                                        radius: 6
                                        color: cur ? Theme.accentSoft : Theme.bg
                                        border.width: 1
                                        border.color: cur ? Theme.accent : Theme.border

                                        Text {
                                            anchors.centerIn: parent
                                            text: scaleChip.modelData + "x"
                                            color: scaleChip.cur ? Theme.accent : Theme.text
                                            font.family: Theme.fontFamily
                                            font.pixelSize: 9
                                        }

                                        MouseArea {
                                            anchors.fill: parent
                                            onClicked: {
                                                if (root.selectedConfig) Config.updatePetScale(root.selectedConfig.id, scaleChip.modelData);
                                            }
                                        }
                                    }
                                }

                                Text {
                                    visible: root.connectedMonitors.length > 2
                                    text: "Screen:"
                                    color: Theme.subtext
                                    font.family: Theme.fontFamily
                                    font.pixelSize: 10
                                }

                                Repeater {
                                    model: root.connectedMonitors.length > 2 ? root.connectedMonitors : []

                                    Rectangle {
                                        id: monChip
                                        required property string modelData
                                        readonly property bool cur: root.selectedConfig !== null && (root.selectedConfig.monitor || "") === monChip.modelData
                                        implicitHeight: 24
                                        radius: 6
                                        implicitWidth: monTxt.implicitWidth + 10
                                        color: cur ? Theme.accentSoft : Theme.bg
                                        border.width: 1
                                        border.color: cur ? Theme.accent : Theme.border

                                        Text {
                                            id: monTxt
                                            anchors.centerIn: parent
                                            text: monChip.modelData === "" ? "Any" : monChip.modelData
                                            color: monChip.cur ? Theme.accent : Theme.text
                                            font.family: Theme.fontFamily
                                            font.pixelSize: 9
                                        }

                                        MouseArea {
                                            anchors.fill: parent
                                            onClicked: {
                                                if (root.selectedConfig) Config.updatePetMonitor(root.selectedConfig.id, monChip.modelData);
                                            }
                                        }
                                    }
                                }
                            }

                            // Two-Column Stats & Soul Grid
                            RowLayout {
                                Layout.fillWidth: true
                                spacing: 12

                                // Left Sub-Panel: Vitals, Drives & Observer Notes
                                Rectangle {
                                    Layout.fillWidth: true
                                    Layout.alignment: Qt.AlignTop
                                    implicitHeight: vitalsCol.implicitHeight + 20
                                    radius: 9
                                    color: Theme.bg
                                    border.width: 1
                                    border.color: Theme.border

                                    ColumnLayout {
                                        id: vitalsCol
                                        anchors.left: parent.left
                                        anchors.right: parent.right
                                        anchors.top: parent.top
                                        anchors.margins: 10
                                        spacing: 6

                                        Text {
                                            text: "Vitals & Drives"
                                            color: Theme.accent
                                            font.family: Theme.fontFamily
                                            font.pixelSize: 10
                                            font.bold: true
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
                                                spacing: 6

                                                Text {
                                                    Layout.preferredWidth: 64
                                                    text: vitalBar.modelData.name
                                                    color: Theme.subtext
                                                    font.family: Theme.fontFamily
                                                    font.pixelSize: 10
                                                }

                                                Rectangle {
                                                    Layout.fillWidth: true
                                                    implicitHeight: 7
                                                    radius: 4
                                                    color: Theme.surface

                                                    Rectangle {
                                                        width: parent.width * Math.max(0.03, Math.min(1, vitalBar.modelData.val || 0))
                                                        height: parent.height
                                                        radius: 4
                                                        color: vitalBar.modelData.tint
                                                    }
                                                }

                                                Text {
                                                    Layout.preferredWidth: 32
                                                    horizontalAlignment: Text.AlignRight
                                                    text: Math.round((vitalBar.modelData.val || 0) * 100) + "%"
                                                    color: Theme.text
                                                    font.family: Theme.fontFamily
                                                    font.pixelSize: 9
                                                }
                                            }
                                        }

                                        Rectangle {
                                            Layout.fillWidth: true
                                            implicitHeight: 1
                                            color: Theme.border
                                            opacity: 0.5
                                        }

                                        Text {
                                            text: "Recent Observer Notes"
                                            color: Theme.subtext
                                            font.family: Theme.fontFamily
                                            font.pixelSize: 10
                                            font.bold: true
                                        }

                                        Repeater {
                                            model: {
                                                const list = (root.selectedIsRoaming && root.selectedLivePet)
                                                    ? (root.selectedLivePet.thoughts || [])
                                                    : (root.selectedResident ? root.selectedResident.thoughts : []);
                                                return list.slice(-6).reverse();
                                            }

                                            Text {
                                                id: obsNote
                                                required property var modelData
                                                Layout.fillWidth: true
                                                elide: Text.ElideRight
                                                text: "· " + (obsNote.modelData.text || "")
                                                color: Theme.text
                                                font.family: Theme.fontFamily
                                                font.pixelSize: 9
                                            }
                                        }
                                    }
                                }

                                // Right Sub-Panel: 8 Developmental Traits, Quirks, Friendships & Milestones
                                Rectangle {
                                    Layout.fillWidth: true
                                    Layout.alignment: Qt.AlignTop
                                    implicitHeight: soulCol.implicitHeight + 20
                                    radius: 9
                                    color: Theme.bg
                                    border.width: 1
                                    border.color: Theme.border

                                    ColumnLayout {
                                        id: soulCol
                                        anchors.left: parent.left
                                        anchors.right: parent.right
                                        anchors.top: parent.top
                                        anchors.margins: 10
                                        spacing: 6

                                        Text {
                                            text: "Character & Emergent Soul"
                                            color: Theme.accent
                                            font.family: Theme.fontFamily
                                            font.pixelSize: 10
                                            font.bold: true
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
                                                spacing: 6

                                                Text {
                                                    Layout.preferredWidth: 72
                                                    text: Personality.TRAIT_LABELS[sTraitRow.modelData] || sTraitRow.modelData
                                                    color: Theme.subtext
                                                    font.family: Theme.fontFamily
                                                    font.pixelSize: 10
                                                }

                                                Rectangle {
                                                    Layout.fillWidth: true
                                                    implicitHeight: 7
                                                    radius: 4
                                                    color: Theme.surface

                                                    Rectangle {
                                                        width: parent.width * Math.max(0.03, Math.min(1, sTraitRow.eff))
                                                        height: parent.height
                                                        radius: 4
                                                        color: Theme.accent
                                                    }
                                                }

                                                Text {
                                                    Layout.preferredWidth: 52
                                                    horizontalAlignment: Text.AlignRight
                                                    text: Math.round(sTraitRow.eff * 100)
                                                        + (sTraitRow.delta !== 0 ? (" (" + (sTraitRow.delta > 0 ? "+" : "") + sTraitRow.delta + ")") : "")
                                                    color: sTraitRow.delta > 0 ? Theme.positive : (sTraitRow.delta < 0 ? Theme.warm : Theme.subtext)
                                                    font.family: Theme.fontFamily
                                                    font.pixelSize: 9
                                                }
                                            }
                                        }

                                        Text {
                                            text: "Earned Habits"
                                            color: Theme.subtext
                                            font.family: Theme.fontFamily
                                            font.pixelSize: 10
                                            font.bold: true
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
                                                    radius: 6
                                                    color: Theme.surfaceAlt
                                                    border.width: 1
                                                    border.color: Theme.accent
                                                    implicitWidth: sqTxt.implicitWidth + 12
                                                    implicitHeight: 20

                                                    Text {
                                                        id: sqTxt
                                                        anchors.centerIn: parent
                                                        text: sqBadge.def ? (sqBadge.def.icon + " " + sqBadge.def.label) : sqBadge.modelData
                                                        color: Theme.text
                                                        font.family: Theme.fontFamily
                                                        font.pixelSize: 9
                                                    }
                                                }
                                            }
                                        }

                                        Text {
                                            text: "Companion Bonds"
                                            color: Theme.subtext
                                            font.family: Theme.fontFamily
                                            font.pixelSize: 10
                                            font.bold: true
                                        }

                                        Repeater {
                                            model: {
                                                const rels = (root.selectedIsRoaming && root.selectedLivePet)
                                                    ? (root.selectedLivePet.relationships || {})
                                                    : (root.selectedResident ? root.selectedResident.relationships : {});
                                                return Object.keys(rels);
                                            }

                                            RowLayout {
                                                id: sRelRow
                                                required property string modelData
                                                readonly property var relMap: (root.selectedIsRoaming && root.selectedLivePet)
                                                    ? (root.selectedLivePet.relationships || {})
                                                    : (root.selectedResident ? root.selectedResident.relationships : {})
                                                readonly property var relObj: relMap[sRelRow.modelData]

                                                Layout.fillWidth: true
                                                spacing: 6

                                                Text {
                                                    Layout.fillWidth: true
                                                    text: "🐾 " + sRelRow.modelData + " · " + Personality.relationshipTag(sRelRow.relObj)
                                                    color: Theme.text
                                                    font.family: Theme.fontFamily
                                                    font.pixelSize: 9
                                                }

                                                Text {
                                                    text: Math.round(((sRelRow.relObj && sRelRow.relObj.affinity) || 0.5) * 100) + "%"
                                                    color: Theme.love
                                                    font.family: Theme.fontFamily
                                                    font.pixelSize: 9
                                                }
                                            }
                                        }

                                        Text {
                                            text: "Milestones"
                                            color: Theme.subtext
                                            font.family: Theme.fontFamily
                                            font.pixelSize: 10
                                            font.bold: true
                                        }

                                        Repeater {
                                            model: {
                                                const j = (root.selectedIsRoaming && root.selectedLivePet)
                                                    ? (root.selectedLivePet.journal || [])
                                                    : (root.selectedResident ? root.selectedResident.journal : []);
                                                return j.slice(-4).reverse();
                                            }

                                            Text {
                                                id: sJournalRow
                                                required property var modelData
                                                Layout.fillWidth: true
                                                elide: Text.ElideRight
                                                text: "· " + (sJournalRow.modelData.text || "")
                                                color: Theme.subtext
                                                font.family: Theme.fontFamily
                                                font.pixelSize: 9
                                            }
                                        }
                                    }
                                }
                            }

                            // Footer: Morph Species + Safe 2-Step Release
                            RowLayout {
                                Layout.fillWidth: true
                                spacing: 8

                                Rectangle {
                                    implicitHeight: 26
                                    radius: 7
                                    implicitWidth: morphBtnTxt.implicitWidth + 16
                                    color: Theme.bg
                                    border.width: 1
                                    border.color: Theme.border

                                    Text {
                                        id: morphBtnTxt
                                        anchors.centerIn: parent
                                        text: root.morphExpanded ? "▾ Hide Species Morph" : "▸ Morph Species"
                                        color: Theme.subtext
                                        font.family: Theme.fontFamily
                                        font.pixelSize: 10
                                    }

                                    MouseArea {
                                        anchors.fill: parent
                                        onClicked: root.morphExpanded = !root.morphExpanded
                                    }
                                }

                                Item { Layout.fillWidth: true }

                                Rectangle {
                                    visible: Config.pets.length > 1
                                    implicitHeight: 26
                                    radius: 7
                                    implicitWidth: relBtnTxt.implicitWidth + 16
                                    color: root.confirmRelease ? Qt.rgba(Theme.danger.r, Theme.danger.g, Theme.danger.b, 0.2) : Theme.bg
                                    border.width: 1
                                    border.color: Theme.danger

                                    Text {
                                        id: relBtnTxt
                                        anchors.centerIn: parent
                                        text: root.confirmRelease ? "Confirm Release?" : "Release Companion"
                                        color: Theme.danger
                                        font.family: Theme.fontFamily
                                        font.pixelSize: 10
                                        font.bold: root.confirmRelease
                                    }

                                    MouseArea {
                                        anchors.fill: parent
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
                                        readonly property bool cur: root.selectedConfig !== null && root.selectedConfig.sprite === morphSpChip.modelData
                                        height: 22
                                        radius: 6
                                        implicitWidth: morphSpTxt.implicitWidth + 12
                                        color: cur ? Theme.accentSoft : Theme.bg
                                        border.width: 1
                                        border.color: cur ? Theme.accent : Theme.border

                                        Text {
                                            id: morphSpTxt
                                            anchors.centerIn: parent
                                            text: morphSpChip.modelData
                                            color: morphSpChip.cur ? Theme.accent : Theme.text
                                            font.family: Theme.fontFamily
                                            font.pixelSize: 9
                                        }

                                        MouseArea {
                                            anchors.fill: parent
                                            onClicked: {
                                                if (root.selectedConfig) Config.updatePetSpecies(root.selectedConfig.id, morphSpChip.modelData);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Right Column Mode B: 25-Species Adoption Catalog
                Rectangle {
                    visible: root.adoptMode
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    radius: 11
                    color: Theme.surface
                    border.width: 1
                    border.color: Theme.border

                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 14
                        spacing: 10

                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 8

                            Text {
                                text: "Adopt a New Companion (25 PMDCollab Species)"
                                color: Theme.text
                                font.family: Theme.fontFamily
                                font.pixelSize: 13
                                font.bold: true
                            }

                            Item { Layout.fillWidth: true }

                            Rectangle {
                                implicitWidth: 170
                                implicitHeight: 28
                                radius: 7
                                color: Theme.bg
                                border.width: 1
                                border.color: adoptNameField.activeFocus ? Theme.accent : Theme.border

                                TextInput {
                                    id: adoptNameField
                                    anchors.fill: parent
                                    anchors.leftMargin: 8
                                    anchors.rightMargin: 8
                                    verticalAlignment: TextInput.AlignVCenter
                                    color: Theme.text
                                    font.family: Theme.fontFamily
                                    font.pixelSize: 10
                                    clip: true
                                    onTextChanged: root.adoptName = text

                                    Text {
                                        visible: adoptNameField.text.length === 0
                                        anchors.verticalCenter: parent.verticalCenter
                                        text: "Custom name (optional)..."
                                        color: Theme.subtext
                                        font.family: Theme.fontFamily
                                        font.pixelSize: 10
                                    }
                                }
                            }

                            Rectangle {
                                implicitWidth: 180
                                implicitHeight: 28
                                radius: 7
                                color: Theme.bg
                                border.width: 1
                                border.color: catalogSearchInput.activeFocus ? Theme.accent : Theme.border

                                TextInput {
                                    id: catalogSearchInput
                                    anchors.fill: parent
                                    anchors.leftMargin: 8
                                    anchors.rightMargin: 8
                                    verticalAlignment: TextInput.AlignVCenter
                                    color: Theme.text
                                    font.family: Theme.fontFamily
                                    font.pixelSize: 10
                                    clip: true
                                    onTextChanged: root.catalogSearch = text

                                    Text {
                                        visible: catalogSearchInput.text.length === 0
                                        anchors.verticalCenter: parent.verticalCenter
                                        text: "Filter species or biome..."
                                        color: Theme.subtext
                                        font.family: Theme.fontFamily
                                        font.pixelSize: 10
                                    }
                                }
                            }
                        }

                        // Starting Temperament & Initial Roam Mode Picker
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 5

                            Text {
                                text: "Seed Nature:"
                                color: Theme.subtext
                                font.family: Theme.fontFamily
                                font.pixelSize: 10
                            }

                            Repeater {
                                model: root.naturesList

                                Rectangle {
                                    id: natChip
                                    required property string modelData
                                    readonly property bool cur: root.adoptNature === natChip.modelData
                                    implicitHeight: 22
                                    radius: 6
                                    implicitWidth: natTxt.implicitWidth + 10
                                    color: cur ? Theme.accentSoft : Theme.bg
                                    border.width: 1
                                    border.color: cur ? Theme.accent : Theme.border

                                    Text {
                                        id: natTxt
                                        anchors.centerIn: parent
                                        text: natChip.modelData
                                        color: natChip.cur ? Theme.accent : Theme.text
                                        font.family: Theme.fontFamily
                                        font.pixelSize: 9
                                    }

                                    MouseArea {
                                        anchors.fill: parent
                                        onClicked: root.adoptNature = natChip.modelData
                                    }
                                }
                            }

                            Item { Layout.fillWidth: true }

                            Repeater {
                                model: [
                                    { k: "auto", l: "Auto" },
                                    { k: "always", l: "Always" },
                                    { k: "penned", l: "Pen" }
                                ]

                                Rectangle {
                                    id: initRoamChip
                                    required property var modelData
                                    readonly property bool cur: root.adoptRoamMode === initRoamChip.modelData.k
                                    implicitHeight: 22
                                    radius: 6
                                    implicitWidth: initRoamTxt.implicitWidth + 10
                                    color: cur ? Theme.accentSoft : Theme.bg
                                    border.width: 1
                                    border.color: cur ? Theme.accent : Theme.border

                                    Text {
                                        id: initRoamTxt
                                        anchors.centerIn: parent
                                        text: initRoamChip.modelData.l
                                        color: initRoamChip.cur ? Theme.accent : Theme.text
                                        font.family: Theme.fontFamily
                                        font.pixelSize: 9
                                    }

                                    MouseArea {
                                        anchors.fill: parent
                                        onClicked: root.adoptRoamMode = initRoamChip.modelData.k
                                    }
                                }
                            }
                        }

                        // Scrollable 25-Species Cards Grid
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
                                columns: Math.max(2, Math.floor(catalogFlick.width / 235))
                                columnSpacing: 8
                                rowSpacing: 8

                                Repeater {
                                    model: root.filteredCatalog

                                    Rectangle {
                                        id: catCard
                                        required property string modelData
                                        readonly property var prof: SpeciesProfile.profileFor(catCard.modelData)

                                        Layout.fillWidth: true
                                        implicitHeight: 108
                                        radius: 9
                                        color: Theme.bg
                                        border.width: 1
                                        border.color: catMouse.containsMouse ? Theme.accent : Theme.border

                                        MouseArea {
                                            id: catMouse
                                            anchors.fill: parent
                                            hoverEnabled: true
                                            acceptedButtons: Qt.NoButton
                                        }

                                        ColumnLayout {
                                            anchors.fill: parent
                                            anchors.margins: 9
                                            spacing: 4

                                            RowLayout {
                                                Layout.fillWidth: true
                                                spacing: 8

                                                SpriteAnimation {
                                                    Layout.preferredWidth: 44
                                                    Layout.preferredHeight: 44
                                                    speciesName: catCard.modelData
                                                    currentState: "idle"
                                                    spriteDir: Qt.resolvedUrl("../assets/sprites/" + catCard.modelData)
                                                }

                                                ColumnLayout {
                                                    Layout.fillWidth: true
                                                    spacing: 2

                                                    Text {
                                                        text: catCard.prof.displayName
                                                        color: Theme.text
                                                        font.family: Theme.fontFamily
                                                        font.pixelSize: 11
                                                        font.bold: true
                                                    }

                                                    Text {
                                                        text: catCard.prof.biome + (catCard.prof.nocturnalAffinity ? " · ☾ Night" : "")
                                                        color: Theme.accent
                                                        font.family: Theme.fontFamily
                                                        font.pixelSize: 9
                                                    }
                                                }

                                                Rectangle {
                                                    implicitHeight: 24
                                                    radius: 6
                                                    implicitWidth: adoptBtnLabel.implicitWidth + 12
                                                    color: adoptClick.containsMouse ? Theme.positive : Qt.rgba(Theme.positive.r, Theme.positive.g, Theme.positive.b, 0.16)
                                                    border.width: 1
                                                    border.color: Theme.positive

                                                    Text {
                                                        id: adoptBtnLabel
                                                        anchors.centerIn: parent
                                                        text: "+ Adopt"
                                                        color: adoptClick.containsMouse ? Theme.bg : Theme.positive
                                                        font.family: Theme.fontFamily
                                                        font.pixelSize: 9
                                                        font.bold: true
                                                    }

                                                    MouseArea {
                                                        id: adoptClick
                                                        anchors.fill: parent
                                                        hoverEnabled: true
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
                                                font.family: Theme.fontFamily
                                                font.pixelSize: 9
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
