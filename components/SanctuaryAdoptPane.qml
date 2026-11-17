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
    property string selectedSpecies: SpeciesProfile.DEFAULT_SPECIES
    property string adoptName: ""
    property int natureIndex: 0
    property bool isNight: false

    readonly property var naturesList: [
        "emergent", "playful", "curious", "chill", "lazy",
        "energetic", "brave", "shy", "nocturnal"
    ]
    readonly property string adoptNature: naturesList[natureIndex % naturesList.length]

    readonly property bool searchActiveFocus: catalogSearchInput.activeFocus
    readonly property bool nameActiveFocus: adoptNameField.activeFocus
    readonly property bool hasSearchText: catalogSearchInput.text.length > 0

    signal companionAdopted(petId: string)
    signal closeGuideRequested()

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

    onFilteredCatalogChanged: {
        if (filteredCatalog.length > 0 && filteredCatalog.indexOf(selectedSpecies) === -1) {
            selectedSpecies = filteredCatalog[0];
        }
    }

    readonly property var selectedProfile: SpeciesProfile.profileFor(root.selectedSpecies)
    readonly property var activeBiomeTheme: Fmt.biomePalette(
        root.catalogBiome || root.selectedProfile.biome,
        root.isNight
    )

    function focusSearch(): void {
        catalogSearchInput.forceActiveFocus();
    }

    function clearSearch(): void {
        catalogSearchInput.text = "";
        catalogSearchInput.focus = false;
    }

    function blurInputs(): void {
        catalogSearchInput.focus = false;
        adoptNameField.focus = false;
    }

    function _welcomeSelected(sp: string): void {
        if (!sp || filteredCatalog.length === 0) return;
        const created = Config.addPet(sp, root.adoptName, root.adoptNature, "auto");
        adoptNameField.text = "";
        root.companionAdopted(created.id);
    }

    radius: Theme.radius(3)
    color: Theme.alpha(Theme.panel, 0.97)
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

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 18
        spacing: 12

        // Field Guide Header
        RowLayout {
            Layout.fillWidth: true
            spacing: 12

            Rectangle {
                implicitWidth: 38
                implicitHeight: 38
                radius: 19
                color: Theme.warmSoft
                border.width: 1
                border.color: Theme.alpha(Theme.warm, 0.6)

                Image {
                    anchors.centerIn: parent
                    width: 24
                    height: 24
                    smooth: false
                    source: Qt.resolvedUrl("../assets/sanctuary/items/diary_open.png")
                }
            }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 1

                Text {
                    text: "Habitat Field Guide"
                    color: Theme.text
                    font.family: Theme.uiFont
                    font.pixelSize: 17
                    font.weight: Font.Bold
                }

                Text {
                    Layout.fillWidth: true
                    elide: Text.ElideRight
                    text: root.catalogBiome
                        ? (root.catalogBiome + "  ·  " + root.activeBiomeTheme.tagline)
                        : "Choose a habitat or browse Pokémon looking for a cozy home."
                    color: Theme.subtext
                    font.family: Theme.uiFont
                    font.pixelSize: 12
                }
            }

            // Search box
            Rectangle {
                implicitWidth: 210
                implicitHeight: 34
                radius: 17
                color: Theme.parchment
                border.width: 1
                border.color: catalogSearchInput.activeFocus ? Theme.warm : Theme.borderSubtle

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 11
                    anchors.rightMargin: 9
                    spacing: 7

                    UiIcon {
                        name: "search"
                        size: 13
                        color: catalogSearchInput.activeFocus ? Theme.warm : Theme.muted
                    }

                    TextInput {
                        id: catalogSearchInput
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        verticalAlignment: TextInput.AlignVCenter
                        selectByMouse: true
                        color: Theme.text
                        font.family: Theme.uiFont
                        font.pixelSize: 12
                        clip: true
                        onTextChanged: root.catalogSearch = text

                        HoverHandler {
                            cursorShape: Qt.IBeamCursor
                        }

                        Text {
                            visible: catalogSearchInput.text.length === 0
                            anchors.verticalCenter: parent.verticalCenter
                            text: "Find a Pokémon..."
                            color: Theme.muted
                            font.family: Theme.uiFont
                            font.pixelSize: 12
                        }
                    }

                    Rectangle {
                        visible: catalogSearchInput.text.length > 0
                        implicitWidth: 18
                        implicitHeight: 18
                        radius: 9
                        color: clearSearchMouse.containsMouse ? Theme.surfaceAlt : "transparent"

                        UiIcon {
                            anchors.centerIn: parent
                            name: "close"
                            size: 9
                            color: Theme.subtext
                        }

                        MouseArea {
                            id: clearSearchMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: catalogSearchInput.text = ""
                        }
                    }
                }
            }

            Rectangle {
                implicitWidth: 34
                implicitHeight: 34
                radius: 17
                color: closeGuideMouse.containsMouse ? Theme.surfaceAlt : Theme.parchment
                border.width: 1
                border.color: Theme.borderSubtle

                UiIcon {
                    anchors.centerIn: parent
                    name: "close"
                    size: 12
                    color: closeGuideMouse.containsMouse ? Theme.text : Theme.subtext
                }

                MouseArea {
                    id: closeGuideMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.closeGuideRequested()
                }
            }
        }

        // Habitat Bookmarks Row
        Flow {
            Layout.fillWidth: true
            spacing: 7

            Repeater {
                model: [{ id: "", shortLabel: "All Habitats", icon: "compass" }].concat(SpeciesProfile.BIOME_LIST)

                Rectangle {
                    id: biomeTab
                    required property var modelData
                    readonly property bool cur: root.catalogBiome === biomeTab.modelData.id
                    readonly property var pal: Fmt.biomePalette(biomeTab.modelData.id || "Sunlit Meadow", root.isNight)
                    implicitHeight: 30
                    implicitWidth: biomeTabRow.implicitWidth + 18
                    radius: 15
                    color: cur
                        ? Theme.warmSoft
                        : (biomeTabMouse.containsMouse ? Theme.surfaceAlt : Theme.parchment)
                    border.width: 1
                    border.color: cur ? Theme.warm : Theme.borderSubtle

                    RowLayout {
                        id: biomeTabRow
                        anchors.centerIn: parent
                        spacing: 6

                        UiIcon {
                            name: biomeTab.modelData.id === "" ? "compass" : biomeTab.pal.icon
                            size: 12
                            color: biomeTab.cur ? Theme.warm : biomeTab.pal.accent
                        }

                        Text {
                            text: biomeTab.modelData.shortLabel
                            color: biomeTab.cur ? Theme.warm : Theme.text
                            font.family: Theme.uiFont
                            font.pixelSize: 12
                            font.weight: biomeTab.cur ? Font.Bold : Font.Medium
                        }
                    }

                    MouseArea {
                        id: biomeTabMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.catalogBiome = biomeTab.modelData.id
                    }
                }
            }
        }

        // Spacious Pokédex / Field Guide Grid
        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true

            Text {
                visible: root.filteredCatalog.length === 0
                anchors.centerIn: parent
                text: "No Pokémon found in this habitat."
                color: Theme.muted
                font.family: Theme.uiFont
                font.pixelSize: 13
            }

            GridView {
                id: guideGrid
                anchors.fill: parent
                readonly property int cols: Math.max(2, Math.floor(width / 270))
                cellWidth: Math.floor(width / cols)
                cellHeight: 116
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                interactive: contentHeight > height
                model: root.filteredCatalog

                WheelHandler {
                    onWheel: event => {
                        if (guideGrid.contentHeight <= guideGrid.height) return;
                        const maxY = Math.max(0, guideGrid.contentHeight - guideGrid.height);
                        guideGrid.contentY = Math.max(0, Math.min(maxY, guideGrid.contentY - event.angleDelta.y * 0.7));
                    }
                }

                delegate: Item {
                    id: cellWrap
                    required property string modelData
                    width: GridView.view ? GridView.view.cellWidth : 270
                    height: GridView.view ? GridView.view.cellHeight : 116

                    Rectangle {
                        id: spCard
                        readonly property var prof: SpeciesProfile.profileFor(cellWrap.modelData)
                        readonly property var pal: Fmt.biomePalette(prof.biome, root.isNight)
                        readonly property var abilities: Abilities.abilitiesFor(cellWrap.modelData)
                        readonly property bool isChosen: root.selectedSpecies === cellWrap.modelData
                        readonly property bool hovered: cardMouse.containsMouse

                        anchors.fill: parent
                        anchors.rightMargin: 9
                        anchors.bottomMargin: 9
                        radius: Theme.radius(-1)
                        color: isChosen
                            ? Theme.surfaceAlt
                            : (hovered ? Theme.alpha(Theme.surfaceAlt, 0.72) : Theme.parchment)
                        border.width: isChosen ? 2 : 1
                        border.color: isChosen ? Theme.warm : (hovered ? Theme.border : Theme.borderSubtle)
                        Behavior on color { ColorAnimation { duration: 110 } }

                        RowLayout {
                            anchors.fill: parent
                            anchors.margins: 10
                            spacing: 11

                            Rectangle {
                                Layout.preferredWidth: 76
                                Layout.preferredHeight: 84
                                radius: Theme.radius(-4)
                                clip: true
                                color: spCard.pal.turf
                                border.width: 1
                                border.color: Theme.alpha(spCard.pal.turfRim, 0.75)

                                Image {
                                    anchors.fill: parent
                                    smooth: false
                                    fillMode: Image.PreserveAspectCrop
                                    source: Qt.resolvedUrl("../assets/sanctuary/biomes/" + spCard.pal.backdrop)
                                }

                                Rectangle {
                                    visible: root.isNight
                                    anchors.fill: parent
                                    color: "#2b12182c"
                                }

                                Image {
                                    anchors.horizontalCenter: parent.horizontalCenter
                                    anchors.bottom: parent.bottom
                                    anchors.bottomMargin: 2
                                    width: 64
                                    height: 32
                                    smooth: false
                                    source: Qt.resolvedUrl("../assets/sanctuary/props/shadow.png")
                                }

                                SpriteAnimation {
                                    anchors.horizontalCenter: parent.horizontalCenter
                                    anchors.bottom: parent.bottom
                                    anchors.bottomMargin: 1
                                    width: 64
                                    height: 64
                                    speciesName: cellWrap.modelData
                                    currentState: (spCard.hovered || spCard.isChosen) && spCard.prof.signature
                                        ? spCard.prof.signature.state
                                        : "idle"
                                    spriteDir: Qt.resolvedUrl("../assets/sprites/" + cellWrap.modelData)
                                }
                            }

                            ColumnLayout {
                                Layout.fillWidth: true
                                Layout.fillHeight: true
                                spacing: 3

                                RowLayout {
                                    Layout.fillWidth: true
                                    spacing: 5

                                    Text {
                                        text: spCard.prof.displayName
                                        color: spCard.isChosen ? Theme.warm : Theme.text
                                        font.family: Theme.uiFont
                                        font.pixelSize: 14
                                        font.weight: Font.Bold
                                    }

                                    UiIcon {
                                        visible: !!spCard.prof.nocturnalAffinity
                                        name: "moon"
                                        size: 11
                                        color: Theme.warm
                                    }

                                    Item { Layout.fillWidth: true }
                                }

                                Text {
                                    Layout.fillWidth: true
                                    elide: Text.ElideRight
                                    text: spCard.abilities.length > 0
                                        ? (spCard.abilities[0].label + "  ·  " + spCard.prof.biome)
                                        : spCard.prof.biome
                                    color: spCard.pal.accent
                                    font.family: Theme.uiFont
                                    font.pixelSize: 11
                                    font.weight: Font.DemiBold
                                }

                                Text {
                                    Layout.fillWidth: true
                                    Layout.fillHeight: true
                                    wrapMode: Text.WordWrap
                                    maximumLineCount: 2
                                    elide: Text.ElideRight
                                    text: spCard.prof.blurb
                                    color: Theme.subtext
                                    font.family: Theme.uiFont
                                    font.pixelSize: 11
                                    lineHeight: 1.18
                                }
                            }
                        }

                        MouseArea {
                            id: cardMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.selectedSpecies = cellWrap.modelData
                            onDoubleClicked: root._welcomeSelected(cellWrap.modelData)
                        }
                    }
                }
            }
        }

        // Bottom Welcome Pedestal Bar
        Rectangle {
            Layout.fillWidth: true
            implicitHeight: 62
            radius: Theme.radius(1)
            color: Theme.parchment
            border.width: 1
            border.color: Theme.border

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 12
                anchors.rightMargin: 12
                spacing: 12

                SpriteAnimation {
                    Layout.preferredWidth: 32
                    Layout.preferredHeight: 32
                    speciesName: root.selectedSpecies
                    currentState: "idle"
                    spriteDir: Qt.resolvedUrl("../assets/sprites/" + root.selectedSpecies)
                }

                ColumnLayout {
                    Layout.maximumWidth: 164
                    spacing: 0

                    Text {
                        Layout.fillWidth: true
                        elide: Text.ElideRight
                        text: root.selectedProfile.displayName
                        color: Theme.text
                        font.family: Theme.uiFont
                        font.pixelSize: 13
                        font.weight: Font.Bold
                    }

                    Text {
                        Layout.fillWidth: true
                        elide: Text.ElideRight
                        text: root.selectedProfile.biome
                        color: Theme.subtext
                        font.family: Theme.uiFont
                        font.pixelSize: 11
                    }
                }

                Item { Layout.fillWidth: true }

                Rectangle {
                    implicitWidth: 164
                    implicitHeight: 34
                    radius: Theme.radius(-5)
                    color: Theme.panel
                    border.width: 1
                    border.color: adoptNameField.activeFocus ? Theme.warm : Theme.borderSubtle

                    TextInput {
                        id: adoptNameField
                        anchors.fill: parent
                        anchors.leftMargin: 10
                        anchors.rightMargin: 10
                        verticalAlignment: TextInput.AlignVCenter
                        selectByMouse: true
                        maximumLength: 24
                        color: Theme.text
                        font.family: Theme.uiFont
                        font.pixelSize: 12
                        clip: true
                        onTextChanged: root.adoptName = text
                        onAccepted: root._welcomeSelected(root.selectedSpecies)

                        HoverHandler {
                            cursorShape: Qt.IBeamCursor
                        }

                        Text {
                            visible: adoptNameField.text.length === 0
                            anchors.verticalCenter: parent.verticalCenter
                            text: "Nickname (optional)"
                            color: Theme.muted
                            font.family: Theme.uiFont
                            font.pixelSize: 12
                        }
                    }
                }

                Rectangle {
                    implicitHeight: 34
                    implicitWidth: natCycleRow.implicitWidth + 20
                    radius: Theme.radius(-5)
                    color: natCycleMouse.containsMouse ? Theme.surfaceAlt : Theme.panel
                    border.width: 1
                    border.color: Theme.borderSubtle

                    RowLayout {
                        id: natCycleRow
                        anchors.centerIn: parent
                        spacing: 6

                        UiIcon {
                            name: "spark"
                            size: 12
                            color: Theme.warm
                        }

                        Text {
                            text: "Nature: " + Fmt.natureLabel(root.adoptNature)
                            color: Theme.text
                            font.family: Theme.uiFont
                            font.pixelSize: 12
                            font.weight: Font.Medium
                        }
                    }

                    MouseArea {
                        id: natCycleMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.natureIndex = (root.natureIndex + 1) % root.naturesList.length
                    }

                    UiTooltip {
                        active: natCycleMouse.containsMouse
                        text: "Click to choose initial nature (or leave on Surprise Me)"
                    }
                }

                Item {
                    id: welcomeCtaWrap
                    readonly property bool canWelcome: root.filteredCatalog.length > 0
                    opacity: canWelcome ? 1.0 : 0.5
                    implicitHeight: 38
                    implicitWidth: welcomeCtaRow.implicitWidth + 26

                    Rectangle {
                        anchors.fill: parent
                        anchors.topMargin: 2
                        radius: Theme.radius(-4)
                        color: "#1e3824"
                    }

                    Rectangle {
                        anchors.fill: parent
                        anchors.bottomMargin: welcomeCtaMouse.pressed && welcomeCtaWrap.canWelcome ? 0 : 2
                        anchors.topMargin: welcomeCtaMouse.pressed && welcomeCtaWrap.canWelcome ? 2 : 0
                        radius: Theme.radius(-4)
                        color: welcomeCtaMouse.containsMouse && welcomeCtaWrap.canWelcome ? Theme.positive : Theme.positiveSoft
                        border.width: 1
                        border.color: Theme.positive
                        Behavior on color { ColorAnimation { duration: 110 } }

                        RowLayout {
                            id: welcomeCtaRow
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
                                text: "Welcome " + root.selectedProfile.displayName + "!"
                                color: welcomeCtaMouse.containsMouse && welcomeCtaWrap.canWelcome ? Theme.overPositive : Theme.text
                                font.family: Theme.uiFont
                                font.pixelSize: 12
                                font.weight: Font.Bold
                            }
                        }
                    }

                    MouseArea {
                        id: welcomeCtaMouse
                        anchors.fill: parent
                        enabled: welcomeCtaWrap.canWelcome
                        hoverEnabled: welcomeCtaWrap.canWelcome
                        cursorShape: welcomeCtaWrap.canWelcome ? Qt.PointingHandCursor : Qt.ArrowCursor
                        onClicked: root._welcomeSelected(root.selectedSpecies)
                    }
                }
            }
        }
    }
}
