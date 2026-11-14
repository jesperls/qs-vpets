pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import "../config"
import "SpeciesProfile.js" as SpeciesProfile
import "SpriteSheet.js" as SpriteSheet
import "behavior/Abilities.js" as Abilities
import "ui/CompanionFormat.js" as Fmt

Rectangle {
    id: root

    property string catalogSearch: ""
    property string catalogBiome: ""
    property string adoptName: ""
    property string adoptNature: "emergent"
    property string adoptRoamMode: "auto"

    readonly property bool searchActiveFocus: catalogSearchInput.activeFocus
    readonly property bool nameActiveFocus: adoptNameField.activeFocus
    readonly property bool hasSearchText: catalogSearchInput.text.length > 0

    signal companionAdopted(petId: string)

    readonly property var naturesList: [
        "emergent", "playful", "curious", "chill", "lazy",
        "energetic", "brave", "shy", "nocturnal", "grumpy"
    ]

    readonly property var filteredCatalog: {
        const q = root.catalogSearch.trim().toLowerCase();
        const biomeFilter = root.catalogBiome;
        return SpriteSheet.SPECIES_LIST.filter(sp => {
            const prof = SpeciesProfile.profileFor(sp);
            if (biomeFilter && prof.biome !== biomeFilter) return false;
            if (!q) return true;
            const abText = Abilities.abilitiesFor(sp)
                .map(a => a.label.toLowerCase() + " " + a.summary.toLowerCase())
                .join(" ");
            return sp.toLowerCase().indexOf(q) !== -1
                || prof.displayName.toLowerCase().indexOf(q) !== -1
                || prof.biome.toLowerCase().indexOf(q) !== -1
                || prof.blurb.toLowerCase().indexOf(q) !== -1
                || abText.indexOf(q) !== -1;
        });
    }

    function focusSearch(): void {
        catalogSearchInput.forceActiveFocus();
    }

    function clearSearch(): void {
        catalogSearchInput.text = "";
        catalogSearchInput.focus = false;
    }

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
                Layout.fillWidth: true
                spacing: 2

                Text {
                    text: "Adopt a New Companion"
                    color: Theme.text
                    font.family: Theme.uiFont
                    font.pixelSize: 16
                    font.weight: Font.Bold
                }

                Text {
                    Layout.fillWidth: true
                    elide: Text.ElideRight
                    text: SpeciesProfile.SPECIES_LIST.length + " species with distinct gaits, abilities, and social dynamics — hover a card to preview"
                    color: Theme.subtext
                    font.family: Theme.uiFont
                    font.pixelSize: 11
                }
            }

            Rectangle {
                implicitWidth: 168
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
                        maximumLength: 28
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
                implicitWidth: 188
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
            spacing: 8

            Flow {
                Layout.fillWidth: true
                spacing: 5

                Item {
                    width: seedNatLabel.implicitWidth
                    height: 24

                    Text {
                        id: seedNatLabel
                        anchors.verticalCenter: parent.verticalCenter
                        text: "Seed Nature"
                        color: Theme.subtext
                        font.family: Theme.uiFont
                        font.pixelSize: 11
                    }
                }

                Repeater {
                    model: root.naturesList

                    Rectangle {
                        id: natChip
                        required property string modelData
                        readonly property bool cur: root.adoptNature === natChip.modelData
                        height: 24
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
                            text: Fmt.capitalize(natChip.modelData)
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
            }

            Rectangle {
                Layout.alignment: Qt.AlignTop
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

        RowLayout {
            Layout.fillWidth: true
            spacing: 5

            Flow {
                Layout.fillWidth: true
                spacing: 5

                Item {
                    width: habLabel.implicitWidth
                    height: 24

                    Text {
                        id: habLabel
                        anchors.verticalCenter: parent.verticalCenter
                        text: "Habitat"
                        color: Theme.subtext
                        font.family: Theme.uiFont
                        font.pixelSize: 11
                    }
                }

                Repeater {
                    model: [{ id: "", shortLabel: "All", icon: "" }].concat(SpeciesProfile.BIOME_LIST)

                    Rectangle {
                        id: biomeChip
                        required property var modelData
                        readonly property bool cur: root.catalogBiome === biomeChip.modelData.id
                        height: 24
                        radius: Theme.radius(-8)
                        implicitWidth: biomeChipRow.implicitWidth + 12
                        color: cur
                            ? Theme.accentSoft
                            : (biomeMouse.containsMouse ? Theme.surfaceAlt : Theme.bg)
                        border.width: 1
                        border.color: cur ? Theme.accent : Theme.borderSubtle

                        RowLayout {
                            id: biomeChipRow
                            anchors.centerIn: parent
                            spacing: 4

                            UiIcon {
                                visible: biomeChip.modelData.icon !== ""
                                name: biomeChip.modelData.icon
                                size: 10
                                color: biomeChip.cur ? Theme.accent : Theme.subtext
                            }

                            Text {
                                text: biomeChip.modelData.shortLabel
                                color: biomeChip.cur ? Theme.accent : Theme.text
                                font.family: Theme.uiFont
                                font.pixelSize: 10
                                font.weight: biomeChip.cur ? Font.DemiBold : Font.Normal
                            }
                        }

                        MouseArea {
                            id: biomeMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.catalogBiome = biomeChip.modelData.id
                        }
                    }
                }
            }

            Text {
                text: root.filteredCatalog.length + " species"
                color: Theme.muted
                font.family: Theme.monoFont
                font.pixelSize: 10
            }
        }

        GridView {
            id: catalogGrid
            Layout.fillWidth: true
            Layout.fillHeight: true
            readonly property int cols: Math.max(2, Math.floor(width / 240))
            cellWidth: Math.floor(width / cols)
            cellHeight: 122
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            interactive: contentHeight > height
            model: root.filteredCatalog

            delegate: Item {
                id: cellWrap
                required property string modelData
                width: GridView.view ? GridView.view.cellWidth : 240
                height: GridView.view ? GridView.view.cellHeight : 122

                Rectangle {
                    id: catCard
                    readonly property var prof: SpeciesProfile.profileFor(cellWrap.modelData)
                    readonly property var abilities: Abilities.abilitiesFor(cellWrap.modelData)
                    readonly property string abilitySummary: abilities.length > 0
                        ? abilities.map(a => a.label + " — " + a.summary).join("\n")
                        : ""
                    readonly property bool cardHovered: catHover.hovered || adoptClick.containsMouse

                    anchors.fill: parent
                    anchors.rightMargin: 8
                    anchors.bottomMargin: 8
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
                                speciesName: cellWrap.modelData
                                currentState: catCard.cardHovered && catCard.prof.signature
                                    ? catCard.prof.signature.state
                                    : "idle"
                                spriteDir: Qt.resolvedUrl("../assets/sprites/" + cellWrap.modelData)
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

                                Item {
                                    Layout.fillWidth: true
                                    implicitHeight: abTextItem.implicitHeight

                                    Text {
                                        id: abTextItem
                                        width: parent.width
                                        elide: Text.ElideRight
                                        text: catCard.abilities.length > 0
                                            ? (catCard.prof.biome + "  ·  " + catCard.abilities[0].label)
                                            : catCard.prof.biome
                                        color: Theme.accent
                                        font.family: Theme.uiFont
                                        font.pixelSize: 10
                                        font.weight: Font.Medium
                                    }

                                    MouseArea {
                                        id: abLineHover
                                        anchors.fill: parent
                                        hoverEnabled: true
                                    }

                                    UiTooltip {
                                        active: abLineHover.containsMouse
                                        text: catCard.abilitySummary
                                    }
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
                                            cellWrap.modelData,
                                            root.adoptName,
                                            root.adoptNature,
                                            root.adoptRoamMode
                                        );
                                        adoptNameField.text = "";
                                        root.companionAdopted(created.id);
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
