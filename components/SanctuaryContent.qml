pragma ComponentBehavior: Bound

import QtQuick
import "../config"
import "../services"

Item {
    id: root
    anchors.fill: parent

    property bool enableHeaderDrag: false
    signal headerDragStarted

    property bool adoptMode: false
    property bool prefsExpanded: false
    property bool cardOpen: true

    readonly property string selectedPetId: {
        void Config.pets;
        if (PetManager.penSelectedPetId && Config.petById(PetManager.penSelectedPetId)) {
            return PetManager.penSelectedPetId;
        }
        return Config.pets.length > 0 ? Config.pets[0].id : "";
    }

    readonly property var selectedConfig: {
        void Config.pets;
        return Config.petById(root.selectedPetId) ?? (Config.pets.length > 0 ? Config.pets[0] : null);
    }

    readonly property var selectedLivePet: root.selectedPetId ? PetManager.findPetById(root.selectedPetId) : null
    readonly property var selectedResident: {
        void PetManager.residentRevision;
        return root.selectedPetId ? PetManager.residentFor(root.selectedPetId) : null;
    }
    readonly property bool selectedIsRoaming: root.selectedPetId ? PetManager.isRoaming(root.selectedPetId) : false

    function selectCompanion(id: string, toggleIfSame = false): void {
        detailPane.cancelRename();
        detailPane.confirmRelease = false;
        if (toggleIfSame && !root.adoptMode && root.cardOpen && root.selectedPetId === id) {
            root.cardOpen = false;
            return;
        }
        PetManager.penSelectedPetId = id;
        root.adoptMode = false;
        root.prefsExpanded = false;
        root.cardOpen = true;
    }

    onAdoptModeChanged: {
        if (adoptMode) {
            detailPane.cancelRename();
            detailPane.confirmRelease = false;
            prefsExpanded = false;
        }
    }

    Connections {
        target: PetManager
        function onPenSelectedPetIdChanged(): void {
            if (PetManager.penSelectedPetId) {
                root.adoptMode = false;
                root.cardOpen = true;
            }
        }
    }

    readonly property var adoptPaneItem: adoptLoader.item as SanctuaryAdoptPane
    readonly property bool _textInputFocused: detailPane.renameActiveFocus
        || (root.adoptPaneItem !== null && (root.adoptPaneItem.searchActiveFocus || root.adoptPaneItem.nameActiveFocus))

    function _stepCompanion(delta: int): void {
        const list = Config.pets;
        if (!list || list.length === 0) return;
        const curIdx = list.findIndex(p => p.id === root.selectedPetId);
        const base = curIdx >= 0 ? curIdx : 0;
        const nextIdx = (base + delta + list.length) % list.length;
        root.selectCompanion(list[nextIdx].id, false);
    }

    function _selectPartySlot(idx: int): void {
        const list = Config.pets;
        if (!list || idx < 0 || idx >= list.length) return;
        root.selectCompanion(list[idx].id, false);
    }

    Shortcut {
        sequence: "Escape"
        context: Qt.WindowShortcut
        onActivated: {
            if (detailPane.visible && detailPane.editingName) {
                detailPane.cancelRename();
            } else if (detailPane.visible && detailPane.confirmRelease) {
                detailPane.confirmRelease = false;
            } else if (root.prefsExpanded) {
                root.prefsExpanded = false;
            } else if (root.adoptMode && root.adoptPaneItem && (root.adoptPaneItem.searchActiveFocus || root.adoptPaneItem.nameActiveFocus)) {
                root.adoptPaneItem.blurInputs();
            } else if (root.adoptMode && root.adoptPaneItem && root.adoptPaneItem.hasSearchText) {
                root.adoptPaneItem.clearSearch();
            } else if (root.adoptMode) {
                root.adoptMode = false;
            } else if (root.cardOpen) {
                root.cardOpen = false;
            } else {
                PetManager.closePen();
            }
        }
    }

    Shortcut {
        sequence: "/"
        context: Qt.WindowShortcut
        enabled: root.adoptMode && !root._textInputFocused
        onActivated: {
            if (root.adoptPaneItem) root.adoptPaneItem.focusSearch();
        }
    }

    Shortcut {
        sequence: "Left"
        context: Qt.WindowShortcut
        enabled: !root._textInputFocused
        onActivated: {
            if (root.adoptMode && root.adoptPaneItem) root.adoptPaneItem.moveSelection(-1);
            else if (!root.adoptMode) root._stepCompanion(-1);
        }
    }

    Shortcut {
        sequence: "Right"
        context: Qt.WindowShortcut
        enabled: !root._textInputFocused
        onActivated: {
            if (root.adoptMode && root.adoptPaneItem) root.adoptPaneItem.moveSelection(1);
            else if (!root.adoptMode) root._stepCompanion(1);
        }
    }

    Shortcut {
        sequence: "Up"
        context: Qt.WindowShortcut
        enabled: root.adoptMode && !root._textInputFocused
        onActivated: {
            if (root.adoptPaneItem) root.adoptPaneItem.moveSelection(-root.adoptPaneItem.gridColumns);
        }
    }

    Shortcut {
        sequence: "Down"
        context: Qt.WindowShortcut
        enabled: root.adoptMode && !root._textInputFocused
        onActivated: {
            if (root.adoptPaneItem) root.adoptPaneItem.moveSelection(root.adoptPaneItem.gridColumns);
        }
    }

    Shortcut {
        sequences: ["Return", "Enter"]
        context: Qt.WindowShortcut
        enabled: root.adoptMode && !root._textInputFocused
        onActivated: {
            if (root.adoptPaneItem) root.adoptPaneItem.adoptSelected();
        }
    }

    Shortcut {
        sequence: "Tab"
        context: Qt.WindowShortcut
        enabled: !root.adoptMode && !root._textInputFocused && root.cardOpen
        onActivated: detailPane.activePage = detailPane.activePage === 0 ? 1 : 0
    }

    Shortcut { sequence: "1"; context: Qt.WindowShortcut; enabled: !root.adoptMode && !root._textInputFocused; onActivated: root._selectPartySlot(0) }
    Shortcut { sequence: "2"; context: Qt.WindowShortcut; enabled: !root.adoptMode && !root._textInputFocused; onActivated: root._selectPartySlot(1) }
    Shortcut { sequence: "3"; context: Qt.WindowShortcut; enabled: !root.adoptMode && !root._textInputFocused; onActivated: root._selectPartySlot(2) }
    Shortcut { sequence: "4"; context: Qt.WindowShortcut; enabled: !root.adoptMode && !root._textInputFocused; onActivated: root._selectPartySlot(3) }
    Shortcut { sequence: "5"; context: Qt.WindowShortcut; enabled: !root.adoptMode && !root._textInputFocused; onActivated: root._selectPartySlot(4) }
    Shortcut { sequence: "6"; context: Qt.WindowShortcut; enabled: !root.adoptMode && !root._textInputFocused; onActivated: root._selectPartySlot(5) }
    Shortcut { sequence: "7"; context: Qt.WindowShortcut; enabled: !root.adoptMode && !root._textInputFocused; onActivated: root._selectPartySlot(6) }
    Shortcut { sequence: "8"; context: Qt.WindowShortcut; enabled: !root.adoptMode && !root._textInputFocused; onActivated: root._selectPartySlot(7) }
    Shortcut { sequence: "9"; context: Qt.WindowShortcut; enabled: !root.adoptMode && !root._textInputFocused; onActivated: root._selectPartySlot(8) }

    // Warm wooden window frame around the full-bleed clearing
    Rectangle {
        id: windowShell
        anchors.fill: parent
        color: Theme.panel
        border.width: 1
        border.color: Theme.border
        radius: Theme.radius(4)

        // Full-bleed Living Camp Clearing
        SanctuaryClearingScene {
            id: clearingScene
            anchors.fill: parent
            anchors.margins: 6
            cornerRadius: Math.max(4, windowShell.radius - 6)
            selectedPetId: root.selectedPetId
            cardOpen: !root.adoptMode && root.cardOpen && root.selectedConfig !== null
            paused: root.adoptMode
            onCompanionClicked: petId => root.selectCompanion(petId, false)
            onBackgroundClicked: {
                root.prefsExpanded = false;
                root.cardOpen = false;
            }
        }

        // Rounded wooden bezel mask + outer/inner rim so pixel map corners stay cleanly rounded
        Rectangle {
            z: 5
            anchors.fill: parent
            radius: windowShell.radius
            color: "transparent"
            border.width: 7
            border.color: Theme.panel
        }

        Rectangle {
            z: 6
            anchors.fill: parent
            radius: windowShell.radius
            color: "transparent"
            border.width: 1
            border.color: Theme.border
        }

        Rectangle {
            z: 6
            anchors.fill: clearingScene
            radius: clearingScene.cornerRadius
            color: "transparent"
            border.width: 1
            border.color: Theme.alpha(Theme.border, 0.72)
        }

        // Optional native system-move drag strip along the top header area (macOS)
        Item {
            z: 8
            visible: root.enableHeaderDrag
            anchors.top: parent.top
            anchors.left: parent.left
            anchors.right: parent.right
            height: 68

            DragHandler {
                enabled: root.enableHeaderDrag
                target: null
                onActiveChanged: {
                    if (active) root.headerDragStarted();
                }
            }
        }

        // Floating Top Camp Signpost & Controls
        SanctuaryHeaderBar {
            id: headerBar
            z: 10
            anchors.top: clearingScene.top
            anchors.left: clearingScene.left
            anchors.right: clearingScene.right
            anchors.margins: 14
            prefsExpanded: root.prefsExpanded
            adoptMode: root.adoptMode
            onTogglePrefs: root.prefsExpanded = !root.prefsExpanded
            onToggleAdoptMode: {
                root.prefsExpanded = false;
                root.adoptMode = !root.adoptMode;
            }
            onCloseRequested: PetManager.closePen()
        }

        // Floating Bottom Pokéball Party Belt
        SanctuaryPartyBelt {
            id: partyBelt
            z: 10
            visible: !root.adoptMode && Config.pets.length > 0
            anchors.bottom: clearingScene.bottom
            anchors.bottomMargin: 12
            anchors.horizontalCenter: clearingScene.horizontalCenter
            maxBeltWidth: Math.max(240, clearingScene.width - 36)
            selectedPetId: root.selectedPetId
            cardOpen: root.cardOpen
            onCompanionSelected: petId => root.selectCompanion(petId, true)
        }

        // Floating Pokémon Care & Summary Card (Right-docked over clearing)
        SanctuaryDetailPane {
            id: detailPane
            z: 12
            visible: !root.adoptMode && root.cardOpen && root.selectedConfig !== null
            anchors.top: headerBar.bottom
            anchors.topMargin: 10
            anchors.bottom: partyBelt.visible ? partyBelt.top : clearingScene.bottom
            anchors.bottomMargin: 10
            anchors.right: clearingScene.right
            anchors.rightMargin: 14
            isNight: clearingScene.isNight
            selectedPetId: root.selectedPetId
            selectedConfig: root.selectedConfig
            selectedLivePet: root.selectedLivePet
            selectedResident: root.selectedResident
            selectedIsRoaming: root.selectedIsRoaming
            onCompanionSelected: petId => root.selectCompanion(petId, false)
            onCloseCardRequested: root.cardOpen = false
            onCareTriggered: (petId, animState, emoteKind) => clearingScene.playCareReaction(petId, animState, emoteKind)
            onInteracted: root.prefsExpanded = false
        }

        // Floating Camp Settings Popover (Top-right)
        SanctuaryPrefsDrawer {
            z: 25
            visible: root.prefsExpanded
            anchors.top: headerBar.bottom
            anchors.topMargin: 8
            anchors.right: clearingScene.right
            anchors.rightMargin: 14
        }

        // Habitat Field Guide Scrim + Modal Sheet
        Rectangle {
            z: 18
            visible: root.adoptMode
            anchors.fill: clearingScene
            radius: clearingScene.cornerRadius
            color: "#6b120d0a"

            MouseArea {
                anchors.fill: parent
                onClicked: root.adoptMode = false
            }
        }

        Loader {
            id: adoptLoader
            z: 20
            active: root.adoptMode
            visible: root.adoptMode
            anchors.top: headerBar.bottom
            anchors.topMargin: 10
            anchors.left: clearingScene.left
            anchors.right: clearingScene.right
            anchors.bottom: clearingScene.bottom
            anchors.leftMargin: 28
            anchors.rightMargin: 28
            anchors.bottomMargin: 18
            sourceComponent: SanctuaryAdoptPane {
                isNight: clearingScene.isNight
                onCompanionAdopted: petId => root.selectCompanion(petId, false)
                onCloseGuideRequested: root.adoptMode = false
            }
        }
    }
}
