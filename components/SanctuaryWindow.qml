pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Hyprland
import Quickshell.Wayland
import "../config"
import "../services"

FloatingWindow {
    id: root

    implicitWidth: 1080
    implicitHeight: 700
    minimumSize: Qt.size(880, 580)
    title: "Pokémon Sanctuary" // Must match Pangu-Shell/hyprland/pangu/shell_rules.lua
    color: "transparent"

    property bool adoptMode: false
    property bool prefsExpanded: false
    property var _preMapAddresses: ({})
    property var _preMapToplevels: []

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

    function selectCompanion(id: string): void {
        PetManager.penSelectedPetId = id;
        root.adoptMode = false;
    }

    function _prepareHyprlandPlacement(): void {
        if (!WindowTracker.hasHyprland) {
            const list = ToplevelManager.toplevels ? ToplevelManager.toplevels.values : [];
            root._preMapToplevels = list.slice();
            const activeTl = ToplevelManager.activeToplevel;
            if (activeTl && activeTl.screens && activeTl.screens.length > 0) {
                root.screen = activeTl.screens[0];
            }
            placementTimer.attempts = 0;
            placementTimer.restart();
            return;
        }
        const existing = {};
        for (const tl of Hyprland.toplevels.values) {
            const addr = String(tl.lastIpcObject?.address ?? tl.address ?? "");
            if (addr) existing[addr] = true;
        }
        root._preMapAddresses = existing;

        const monName = Hyprland.focusedMonitor?.name ?? "";
        if (monName) {
            const screens = WindowTracker.realScreens;
            for (let i = 0; i < screens.length; i++) {
                if (screens[i].name === monName) {
                    root.screen = screens[i];
                    break;
                }
            }
        }
        placementTimer.attempts = 0;
        placementTimer.restart();
    }

    function _placeOnFocusedWorkspace(): bool {
        if (!WindowTracker.hasHyprland) {
            const list = ToplevelManager.toplevels ? ToplevelManager.toplevels.values : [];
            for (const tl of list) {
                if (!tl || root._preMapToplevels.indexOf(tl) !== -1) continue;
                if (String(tl.title ?? "") === root.title) {
                    tl.activate();
                    return true;
                }
            }
            return false;
        }
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
                    WindowTracker.moveWindowToWorkspaceSilent(targetSpec, addr);
                }
            } else if (targetWsId > 0 && Number(raw?.workspace?.id ?? 0) !== targetWsId) {
                WindowTracker.moveWindowToWorkspaceSilent(String(targetWsId), addr);
            }
            WindowTracker.focusWindowAddress(addr);
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

    readonly property var adoptPaneItem: adoptLoader.item as SanctuaryAdoptPane

    Shortcut {
        sequence: "Escape"
        context: Qt.WindowShortcut
        onActivated: {
            if (detailPane.editingName) {
                detailPane.cancelRename();
            } else if (detailPane.confirmRelease) {
                detailPane.confirmRelease = false;
            } else if (detailPane.morphExpanded) {
                detailPane.morphExpanded = false;
            } else if (root.adoptMode && root.adoptPaneItem && root.adoptPaneItem.hasSearchText) {
                root.adoptPaneItem.clearSearch();
            } else if (root.adoptMode) {
                root.adoptMode = false;
            } else if (rosterPane.hasSearchText) {
                rosterPane.clearSearch();
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
        enabled: !rosterPane.searchActiveFocus
            && !detailPane.renameActiveFocus
            && !(root.adoptPaneItem && (root.adoptPaneItem.searchActiveFocus || root.adoptPaneItem.nameActiveFocus))
        onActivated: {
            if (root.adoptMode && root.adoptPaneItem) root.adoptPaneItem.focusSearch();
            else rosterPane.focusSearch();
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

            SanctuaryHeaderBar {
                prefsExpanded: root.prefsExpanded
                adoptMode: root.adoptMode
                onTogglePrefs: root.prefsExpanded = !root.prefsExpanded
                onToggleAdoptMode: root.adoptMode = !root.adoptMode
                onCloseRequested: PetManager.closePen()
            }

            SanctuaryPrefsDrawer {
                visible: root.prefsExpanded
            }

            SanctuaryPastureStrip {
                selectedPetId: root.selectedPetId
                adoptMode: root.adoptMode
                stageOverrideState: detailPane.stageOverrideState
                onCompanionSelected: petId => root.selectCompanion(petId)
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                spacing: 12

                SanctuaryRosterPane {
                    id: rosterPane
                    selectedPetId: root.selectedPetId
                    adoptMode: root.adoptMode
                    onCompanionSelected: petId => root.selectCompanion(petId)
                }

                SanctuaryDetailPane {
                    id: detailPane
                    visible: !root.adoptMode && root.selectedConfig !== null
                    selectedPetId: root.selectedPetId
                    selectedConfig: root.selectedConfig
                    selectedLivePet: root.selectedLivePet
                    selectedResident: root.selectedResident
                    selectedIsRoaming: root.selectedIsRoaming
                    onCompanionSelected: petId => root.selectCompanion(petId)
                }

                Loader {
                    id: adoptLoader
                    active: root.adoptMode
                    visible: root.adoptMode
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    sourceComponent: SanctuaryAdoptPane {
                        onCompanionAdopted: petId => root.selectCompanion(petId)
                    }
                }
            }
        }
    }
}
