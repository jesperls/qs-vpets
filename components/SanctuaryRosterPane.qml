pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../config"
import "../services"
import "SpeciesProfile.js" as SpeciesProfile
import "ui/CompanionFormat.js" as Fmt

Rectangle {
    id: root

    required property string selectedPetId
    required property bool adoptMode

    property string rosterSearch: ""
    property string rosterFilter: "all"

    readonly property bool searchActiveFocus: rosterSearchInput.activeFocus
    readonly property bool hasSearchText: rosterSearchInput.text.length > 0

    signal companionSelected(petId: string)

    function focusSearch(): void {
        rosterSearchInput.forceActiveFocus();
    }

    function clearSearch(): void {
        rosterSearchInput.text = "";
        rosterSearchInput.focus = false;
    }

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

        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true

            Text {
                visible: root.filteredRoster.length === 0
                anchors.horizontalCenter: parent.horizontalCenter
                y: 20
                text: "No companions match this filter."
                color: Theme.muted
                font.family: Theme.uiFont
                font.pixelSize: 11
            }

            ListView {
                id: rosterList
                anchors.fill: parent
                spacing: 6
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                interactive: contentHeight > height
                model: root.filteredRoster

                delegate: Rectangle {
                    id: rosterItem
                    required property var modelData
                    readonly property bool isOut: PetManager.isRoaming(rosterItem.modelData.id)
                    readonly property bool isSelected: !root.adoptMode && root.selectedPetId === rosterItem.modelData.id
                    readonly property var liveRef: PetManager.findPetById(rosterItem.modelData.id)
                    readonly property var resRef: {
                        void PetManager.residentRevision;
                        return PetManager.residentFor(rosterItem.modelData.id);
                    }
                    readonly property real itemMood: {
                        void (resRef ? resRef.revision : 0);
                        return isOut && liveRef ? liveRef.mood : (resRef ? resRef.mood : 0.56);
                    }
                    readonly property string itemArch: {
                        void (resRef ? resRef.revision : 0);
                        return isOut && liveRef ? liveRef.archetype : (resRef ? resRef.archetype : "Curious Hatchling");
                    }

                    width: ListView.view ? ListView.view.width : 270
                    height: 58
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
                        onClicked: root.companionSelected(rosterItem.modelData.id)
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
                                    text: Fmt.policyShortLabel(rosterItem.modelData.roamMode || "auto")
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
