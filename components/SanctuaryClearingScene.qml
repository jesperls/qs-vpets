pragma ComponentBehavior: Bound

import QtQuick
import "../config"
import "../services"
import "ui/FriendAreas.js" as FriendAreas

Item {
    id: root

    required property string selectedPetId
    required property bool cardOpen
    property int cornerRadius: 12

    signal companionClicked(petId: string)
    signal backgroundClicked()

    readonly property var area: FriendAreas.areaFor(Config.sanctuaryCamp)
    readonly property string campId: area.id
    readonly property int worldW: area.worldWidth
    readonly property int worldH: area.worldHeight
    readonly property int px: Math.max(
        2,
        Math.ceil(Math.max(Math.max(1, width) / worldW, Math.max(1, height) / worldH))
    )

    readonly property string solarPhase: {
        const sp = SystemMonitor.solarPhase || "";
        if (sp === "dawn" || sp === "day" || sp === "dusk" || sp === "night") return sp;
        const hr = (new Date()).getHours();
        if (hr >= 21 || hr < 6) return "night";
        if (hr >= 18) return "dusk";
        if (hr < 8) return "dawn";
        return "day";
    }

    readonly property bool isNight: solarPhase === "night"
    readonly property bool isTwilight: solarPhase === "dawn" || solarPhase === "dusk"

    readonly property var campCompanions: {
        void Config.pets;
        void PetManager.roamingIds;
        return Config.pets.filter(p => !PetManager.isRoaming(p.id));
    }

    property int animTick: 0
    property var _savedActorSpots: ({})

    Timer {
        interval: 150
        running: root.visible
        repeat: true
        onTriggered: root.animTick = (root.animTick + 1) % 1200
    }

    // Intersect Friend Area walkable turf with viewport-safe margins so UI chrome never obscures companions.
    readonly property var campBounds: {
        const wb = root.area.walkBounds;
        const effW = root.width >= 200 ? root.width : 1008;
        const effH = root.height >= 200 ? root.height : 648;
        const p = Math.max(2, Math.ceil(Math.max(effW / root.worldW, effH / root.worldH)));
        const wx = Math.floor((effW - root.worldW * p) * 0.5);
        const wy = Math.floor((effH - root.worldH * p) * 0.5);
        const viewMinX = Math.ceil((20 - wx) / p) + 16;
        const viewMaxX = Math.floor((effW - 20 - wx) / p) - 16;
        const viewCardMaxX = Math.floor((effW - 378 - wx) / p) - 16;
        const viewMinY = Math.ceil((64 - wy) / p) + 28;
        const viewMaxY = Math.floor((effH - 82 - wy) / p) - 4;

        const minX = Math.max(wb.minX, viewMinX);
        const maxX = Math.max(minX + 16, Math.min(wb.maxX, viewMaxX));
        const cardMaxX = Math.max(minX + 12, Math.min(maxX, viewCardMaxX));
        const minY = Math.max(wb.minY, viewMinY);
        const maxY = Math.max(minY + 10, Math.min(wb.maxY, viewMaxY));
        return { minX: minX, maxX: maxX, cardMaxX: cardMaxX, minY: minY, maxY: maxY };
    }

    function _hitsPropObstacle(wx: real, wy: real): bool {
        const props = root.area.props;
        for (let i = 0; i < props.length; i++) {
            const o = props[i].obs;
            if (!o) continue;
            if (wx >= o[0] - 8 && wx <= o[2] + 8 && wy >= o[1] - 4 && wy <= o[3] + 6) {
                return true;
            }
        }
        return false;
    }

    function _crowdsPeer(wx: real, wy: real, ignorePetId: string): bool {
        for (let i = 0; i < actorsRepeater.count; i++) {
            const peer = actorsRepeater.itemAt(i) as ClearingActor;
            if (!peer || peer.petId === ignorePetId) continue;
            const px = peer.walking ? peer.targetWorldX : peer.worldX;
            const py = peer.walking ? peer.targetWorldY : peer.worldY;
            if (Math.hypot(wx - px, wy - py) < 34) return true;
        }
        return false;
    }

    function _rememberSpot(campKey: string, petId: string, wx: real, wy: real, dirRow: int): void {
        if (!campKey || !petId || root.width < 200 || root.height < 200) return;
        root._savedActorSpots[campKey + ":" + petId] = { x: wx, y: wy, dirRow: dirRow };
    }

    function _recalledSpot(campKey: string, petId: string): var {
        if (!campKey || !petId) return null;
        return root._savedActorSpots[campKey + ":" + petId] || null;
    }

    function playCareReaction(petId: string, animState: string, emoteKind: string): void {
        for (let i = 0; i < actorsRepeater.count; i++) {
            const item = actorsRepeater.itemAt(i) as ClearingActor;
            if (item && item.petId === petId) {
                item.reactToCare(animState, emoteKind);
                break;
            }
        }
    }

    clip: true

    Item {
        id: worldContainer
        width: root.worldW * root.px
        height: root.worldH * root.px
        x: Math.floor((root.width - width) * 0.5)
        y: Math.floor((root.height - height) * 0.5)

        Image {
            visible: root.area.hasSky
            x: 0
            y: 0
            width: root.worldW * root.px
            height: 160 * root.px
            smooth: false
            source: {
                if (root.isNight) return Qt.resolvedUrl("../assets/sanctuary/skies/night.png");
                if (root.isTwilight) return Qt.resolvedUrl("../assets/sanctuary/skies/dusk.png");
                return Qt.resolvedUrl("../assets/sanctuary/skies/day.png");
            }
        }

        Item {
            readonly property var anim: root.area.underlayAnim
            visible: anim !== null
            x: anim ? anim.wx * root.px : 0
            y: anim ? anim.wy * root.px : 0
            width: anim ? anim.fw * root.px : 0
            height: anim ? anim.fh * root.px : 0
            clip: true

            Image {
                readonly property var anim: root.area.underlayAnim
                readonly property int frameIdx: anim && anim.frames > 1
                    ? (Math.floor(root.animTick / anim.rate) % anim.frames)
                    : 0
                x: anim && !anim.vertical ? -(frameIdx * anim.fw * root.px) : 0
                y: anim && anim.vertical ? -(frameIdx * anim.fh * root.px) : 0
                width: anim ? (anim.fw * (anim.vertical ? 1 : anim.frames) * root.px) : 0
                height: anim ? (anim.fh * (anim.vertical ? anim.frames : 1) * root.px) : 0
                smooth: false
                source: anim ? Qt.resolvedUrl("../assets/sanctuary/" + anim.src) : ""
            }
        }

        Image {
            x: 0
            y: 0
            width: root.worldW * root.px
            height: root.worldH * root.px
            smooth: false
            source: Qt.resolvedUrl("../assets/sanctuary/" + root.area.baseMap)
        }

        Item {
            readonly property var anim: root.area.overlayAnim
            visible: anim !== null
            x: anim ? anim.wx * root.px : 0
            y: anim ? anim.wy * root.px : 0
            width: anim ? anim.fw * root.px : 0
            height: anim ? anim.fh * root.px : 0
            clip: true

            Image {
                readonly property var anim: root.area.overlayAnim
                readonly property int frameIdx: anim && anim.frames > 1
                    ? (Math.floor(root.animTick / anim.rate) % anim.frames)
                    : 0
                x: anim && !anim.vertical ? -(frameIdx * anim.fw * root.px) : 0
                y: anim && anim.vertical ? -(frameIdx * anim.fh * root.px) : 0
                width: anim ? (anim.fw * (anim.vertical ? 1 : anim.frames) * root.px) : 0
                height: anim ? (anim.fh * (anim.vertical ? anim.frames : 1) * root.px) : 0
                smooth: false
                source: anim ? Qt.resolvedUrl("../assets/sanctuary/" + anim.src) : ""
            }
        }

        MouseArea {
            anchors.fill: parent
            acceptedButtons: Qt.LeftButton
            onClicked: root.backgroundClicked()
        }

        Repeater {
            model: root.area.props

            Item {
                id: propItem
                required property var modelData
                readonly property int frameIdx: propItem.modelData.frames > 1
                    ? (Math.floor(root.animTick / propItem.modelData.rate) % propItem.modelData.frames)
                    : 0

                x: propItem.modelData.wx * root.px
                y: propItem.modelData.wy * root.px
                z: Math.round(propItem.modelData.footY * root.px)
                width: propItem.modelData.fw * root.px
                height: propItem.modelData.fh * root.px
                clip: propItem.modelData.frames > 1

                Image {
                    x: -(propItem.frameIdx * propItem.modelData.fw * root.px)
                    y: 0
                    width: propItem.modelData.fw * propItem.modelData.frames * root.px
                    height: propItem.modelData.fh * root.px
                    smooth: false
                    source: Qt.resolvedUrl("../assets/sanctuary/" + propItem.modelData.src)
                }
            }
        }

        Repeater {
            id: actorsRepeater
            model: root.campCompanions

            delegate: ClearingActor {
                required property var modelData
                required property int index
                petConfig: modelData
                slotIndex: index
                totalCount: root.campCompanions.length
                pxScale: root.px
                campKey: root.campId
                bounds: root.campBounds
                cardOpen: root.cardOpen
                isSelected: root.cardOpen && root.selectedPetId === modelData.id
                onClickedActor: id => root.companionClicked(id)
            }
        }

        Image {
            visible: root.area.foregroundMap.length > 0
            z: 2000
            x: 0
            y: 0
            width: root.worldW * root.px
            height: root.worldH * root.px
            smooth: false
            source: root.area.foregroundMap.length > 0
                ? Qt.resolvedUrl("../assets/sanctuary/" + root.area.foregroundMap)
                : ""
        }

        Rectangle {
            visible: root.isNight || root.isTwilight
            z: 2100
            anchors.fill: parent
            color: root.isNight ? "#36121930" : "#1a592d14"
        }
    }

    Rectangle {
        visible: root.campCompanions.length === 0
        z: 10
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.horizontalCenterOffset: root.cardOpen ? -Math.round(root.width * 0.16) : 0
        y: Math.round(root.height * 0.54)
        implicitWidth: emptyCol.implicitWidth + 32
        implicitHeight: emptyCol.implicitHeight + 22
        radius: Theme.radius(0)
        color: Theme.alpha(Theme.panel, 0.90)
        border.width: 1
        border.color: Theme.border

        Behavior on anchors.horizontalCenterOffset {
            NumberAnimation { duration: Theme.animMs; easing.type: Easing.OutCubic }
        }

        Column {
            id: emptyCol
            anchors.centerIn: parent
            spacing: 4

            Text {
                anchors.horizontalCenter: parent.horizontalCenter
                text: "The camp clearing is quiet right now"
                color: Theme.text
                font.family: Theme.uiFont
                font.pixelSize: 13
                font.weight: Font.DemiBold
            }

            Text {
                anchors.horizontalCenter: parent.horizontalCenter
                text: "All of your Pokémon are out exploring your desktop!"
                color: Theme.subtext
                font.family: Theme.uiFont
                font.pixelSize: 11
            }
        }
    }

    component ClearingActor: Item {
        id: actor

        required property var petConfig
        required property int slotIndex
        required property int totalCount
        required property int pxScale
        required property string campKey
        required property var bounds
        required property bool cardOpen
        required property bool isSelected

        signal clickedActor(id: string)

        readonly property string petId: petConfig.id
        readonly property var resRef: {
            void PetManager.residentRevision;
            return PetManager.residentFor(actor.petId);
        }
        readonly property string penState: {
            void (actor.resRef ? actor.resRef.revision : 0);
            return actor.resRef ? actor.resRef.penState : "idle";
        }
        readonly property bool isDeepSleeping: penState === "deepsleep" || penState === "laying"
        readonly property bool isResting: isDeepSleeping || penState === "loaf" || penState === "sit"

        property real worldX: 240
        property real worldY: 160
        property real targetWorldX: 240
        property real targetWorldY: 160
        property bool walking: false
        property string overrideAnim: ""

        readonly property real effMaxX: cardOpen ? bounds.cardMaxX : bounds.maxX
        readonly property real clampedWX: Math.max(bounds.minX, Math.min(bounds.maxX, worldX))
        readonly property real clampedWY: Math.max(bounds.minY, Math.min(bounds.maxY, worldY))

        x: Math.round((clampedWX - 16) * pxScale)
        y: Math.round((clampedWY - 29) * pxScale)
        z: Math.round(clampedWY * pxScale)
        width: 32 * pxScale
        height: 32 * pxScale

        function _pickSafeSpot(prefX: real, prefY: real, checkPeers = true): var {
            const minX = actor.bounds.minX;
            const maxX = actor.effMaxX;
            const minY = actor.bounds.minY;
            const maxY = actor.bounds.maxY;
            const bx = Math.max(minX, Math.min(maxX, prefX));
            const by = Math.max(minY, Math.min(maxY, prefY));
            if (!root._hitsPropObstacle(bx, by) && (!checkPeers || !root._crowdsPeer(bx, by, actor.petId))) {
                return { x: bx, y: by };
            }

            for (let attempt = 0; attempt < 18; attempt++) {
                const ang = (attempt / 9.0) * Math.PI * 2 + actor.slotIndex * 1.9;
                const rad = 26 + attempt * 8;
                const cx = Math.max(minX, Math.min(maxX, bx + Math.cos(ang) * rad));
                const cy = Math.max(minY, Math.min(maxY, by + Math.sin(ang) * rad * 0.78));
                if (!root._hitsPropObstacle(cx, cy) && (!checkPeers || !root._crowdsPeer(cx, cy, actor.petId))) {
                    return { x: cx, y: cy };
                }
            }
            for (let fallback = 0; fallback < 12; fallback++) {
                const fx = minX + (((actor.slotIndex * 53 + fallback * 29) % 100) / 100.0) * Math.max(12, maxX - minX);
                const fy = minY + (((actor.slotIndex * 37 + fallback * 41) % 100) / 100.0) * Math.max(10, maxY - minY);
                if (!root._hitsPropObstacle(fx, fy)) return { x: fx, y: fy };
            }
            return { x: (minX + maxX) * 0.5, y: (minY + maxY) * 0.65 };
        }

        function _seedPosition(): void {
            const recalled = root._recalledSpot(actor.campKey, actor.petId);
            if (recalled) {
                const spot = _pickSafeSpot(recalled.x, recalled.y, false);
                actor.worldX = spot.x;
                actor.worldY = spot.y;
                actor.targetWorldX = spot.x;
                actor.targetWorldY = spot.y;
                actor.walking = false;
                actorSprite.setDirectionRow(recalled.dirRow ?? 0, true);
                return;
            }
            const minX = actor.bounds.minX;
            const maxX = actor.effMaxX;
            const minY = actor.bounds.minY;
            const maxY = actor.bounds.maxY;
            const golden = 2.399963;
            const t = (actor.slotIndex + 0.65) / Math.max(1.5, actor.totalCount + 0.3);
            const rx = (maxX - minX) * (0.24 + Math.sqrt(t) * 0.22);
            const ry = (maxY - minY) * (0.24 + Math.sqrt(t) * 0.22);
            const ang = actor.slotIndex * golden + 0.6;
            const cx = (minX + maxX) * 0.5;
            const cy = (minY + maxY) * 0.54;
            const spot = _pickSafeSpot(cx + Math.cos(ang) * rx, cy + Math.sin(ang) * ry, true);
            const initRow = (actor.slotIndex % 2 === 0) ? 0 : 7;
            actor.worldX = spot.x;
            actor.worldY = spot.y;
            actor.targetWorldX = spot.x;
            actor.targetWorldY = spot.y;
            actor.walking = false;
            actorSprite.setDirectionRow(initRow, true);
            root._rememberSpot(actor.campKey, actor.petId, spot.x, spot.y, initRow);
        }

        function reactToCare(animState: string, emoteKind: string): void {
            actor.walking = false;
            actor.overrideAnim = animState;
            actorSprite.setDirectionRow(0, false);
            actorSprite.triggerSquash(1.15, 0.86);
            actorBubble.showEmote(emoteKind);
            overrideResetTimer.restart();
        }

        Component.onCompleted: _seedPosition()
        onCampKeyChanged: _seedPosition()

        onBoundsChanged: {
            if (!walking) {
                const spot = _pickSafeSpot(worldX, worldY, false);
                if (Math.hypot(spot.x - worldX, spot.y - worldY) > 1) {
                    worldX = spot.x;
                    worldY = spot.y;
                    targetWorldX = spot.x;
                    targetWorldY = spot.y;
                    root._rememberSpot(campKey, petId, spot.x, spot.y, actorSprite._dirRow);
                }
            }
        }

        onCardOpenChanged: {
            if (cardOpen && worldX > bounds.cardMaxX) {
                const fallbackX = bounds.minX + ((slotIndex * 37) % Math.max(24, bounds.cardMaxX - bounds.minX));
                const spot = _pickSafeSpot(fallbackX, worldY);
                targetWorldX = spot.x;
                targetWorldY = spot.y;
                if (isResting) {
                    worldX = spot.x;
                    worldY = spot.y;
                    root._rememberSpot(campKey, petId, spot.x, spot.y, actorSprite._dirRow);
                } else {
                    walking = true;
                }
            }
        }

        Timer {
            id: overrideResetTimer
            interval: 1650
            onTriggered: actor.overrideAnim = ""
        }

        Timer {
            interval: 5000 + (actor.slotIndex % 5) * 1400
            running: actor.visible && !actor.isResting && actor.overrideAnim.length === 0
            repeat: true
            onTriggered: {
                if (actor.walking || Math.random() < 0.34) return;
                const candX = actor.worldX + (Math.random() - 0.5) * 84;
                const candY = actor.worldY + (Math.random() - 0.5) * 48;
                const spot = actor._pickSafeSpot(candX, candY);
                if (Math.hypot(spot.x - actor.worldX, spot.y - actor.worldY) < 14) {
                    const restRows = [0, 1, 7];
                    const nextRow = restRows[Math.floor(Math.random() * restRows.length)];
                    actorSprite.setDirectionRow(nextRow, false);
                    root._rememberSpot(actor.campKey, actor.petId, actor.worldX, actor.worldY, nextRow);
                    return;
                }
                actor.targetWorldX = spot.x;
                actor.targetWorldY = spot.y;
                actor.walking = true;
            }
        }

        Timer {
            interval: 40
            running: actor.visible && actor.walking
            repeat: true
            onTriggered: {
                const dx = actor.targetWorldX - actor.worldX;
                const dy = actor.targetWorldY - actor.worldY;
                const dist = Math.hypot(dx, dy);
                if (dist <= 1.6) {
                    actor.worldX = actor.targetWorldX;
                    actor.worldY = actor.targetWorldY;
                    actor.walking = false;
                    const settleRow = dx >= 0 ? 1 : 7;
                    actorSprite.setDirectionRow(settleRow, false);
                    root._rememberSpot(actor.campKey, actor.petId, actor.worldX, actor.worldY, settleRow);
                    return;
                }
                const step = 22 * 0.04;
                actorSprite.setDirection(Math.atan2(dy, dx));
                actor.worldX += (dx / dist) * step;
                actor.worldY += (dy / dist) * step;
            }
        }

        Rectangle {
            visible: actor.isSelected || actorMouse.containsMouse
            readonly property int ringW: actorSprite.shadowSize === 2 ? 26 : (actorSprite.shadowSize === 0 ? 14 : 20)
            readonly property int ringH: actorSprite.shadowSize === 2 ? 10 : 8
            x: Math.round((15.5 - ringW * 0.5) * actor.pxScale)
            y: Math.round((29.0 - ringH * 0.5) * actor.pxScale)
            width: ringW * actor.pxScale
            height: ringH * actor.pxScale
            radius: (ringH * 0.5) * actor.pxScale
            color: actor.isSelected ? Theme.alpha(Theme.warm, 0.25) : Theme.alpha(Theme.text, 0.14)
            border.width: actor.isSelected ? 2 : 1
            border.color: actor.isSelected ? Theme.warm : Theme.alpha(Theme.text, 0.42)
        }

        SpriteAnimation {
            id: actorSprite
            anchors.fill: parent
            speciesName: actor.petConfig.sprite
            showShadow: true
            moveSpeed: actor.walking ? 52 : 0
            currentState: {
                if (actor.overrideAnim.length > 0) return actor.overrideAnim;
                if (actor.walking) return "walk";
                if (actor.penState === "wander" || actor.penState === "walk") return "idle";
                return actor.penState || "idle";
            }
            spriteDir: Qt.resolvedUrl("../assets/sprites/" + actor.petConfig.sprite)
        }

        EmoteBubble {
            id: actorBubble
            anchors.horizontalCenter: parent.horizontalCenter
            y: -14
            z: 10
            sleeping: actor.isDeepSleeping
            forceEnabled: true
        }

        Rectangle {
            visible: actorMouse.containsMouse || actor.isSelected
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.top: parent.bottom
            anchors.topMargin: -2
            implicitWidth: actorNameTxt.implicitWidth + 12
            implicitHeight: 19
            radius: 10
            color: Theme.alpha(Theme.panel, 0.92)
            border.width: 1
            border.color: actor.isSelected ? Theme.warm : Theme.borderSubtle

            Text {
                id: actorNameTxt
                anchors.centerIn: parent
                text: actor.petConfig.name
                color: actor.isSelected ? Theme.warm : Theme.text
                font.family: Theme.uiFont
                font.pixelSize: 10
                font.weight: Font.DemiBold
            }
        }

        MouseArea {
            id: actorMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: {
                if (!actor.isDeepSleeping) {
                    if (actor.resRef) actor.resRef.patInPen();
                    actorSprite.setDirectionRow(0, false);
                    actorSprite.triggerSquash(1.14, 0.87);
                    actorBubble.showEmote("heart");
                }
                actor.clickedActor(actor.petId);
            }
        }
    }
}
