.pragma library

.import "../SpeciesProfile.js" as SpeciesProfile
.import "Memory.js" as Memory
.import "Topology.js" as Topology
.import "Util.js" as Util

var NEARBY_PET_DIST = 8000;

function perceive(pet) {
    var now = Util.now(pet);
    var curScr = Topology.currentScreen(pet);
    var sx = curScr.x, sy = curScr.y;
    var sw = curScr.width, sh = curScr.height;
    var petGX = sx + pet.worldX;
    var petGY = sy + pet.worldY;
    var petW = pet.width || 64;
    var petH = pet.height || 64;
    var reachable = Topology.reachableScreens(pet);

    var wt = pet.windowTracker || {};
    var wp = wt.activeWindowPos || null;
    var activeTitle = wt.activeWindowTitle || "";
    var win = null;
    if (wp && wp.w > 40 && wp.h > 40 && activeTitle !== "Pokémon Sanctuary") {
        var cx = wp.x + wp.w / 2, cy = wp.y + wp.h / 2;
        var winScr = Topology.screenAt(reachable, cx, cy);
        if (winScr) {
            var cls = wt.activeWindowClass || "";
            var bInset = winScr.bottomInset || 0;
            var minLedgeY = Topology.minPerchY(winScr, petH);
            var canPerchTop = wp.y >= minLedgeY && wp.w >= 180 && !wt.isFullscreen;
            var maxWinX = winScr.x + winScr.width - petW - 8;
            var maxWinY = winScr.y + winScr.height - bInset - petH - 8;

            var minBelowX = Math.max(winScr.x + 8, wp.x + 16);
            var maxBelowX = Math.max(minBelowX, Math.min(maxWinX, wp.x + wp.w - petW - 16));
            var preferRight = petGX >= cx;
            var rawBelowX = wp.x + wp.w * (preferRight ? 0.74 : 0.26) - petW * 0.5;
            var watchBelowGX = Math.max(minBelowX, Math.min(maxBelowX, rawBelowX));
            var watchBelowGY = Math.max(winScr.y + 8, Math.min(maxWinY, wp.y + wp.h - Math.round(petH * 0.12)));
            var canSitBelow = !wt.isFullscreen && wp.w >= 180 && wp.h >= 180 && watchBelowGY > wp.y + 110;

            var leftRoom = wp.x - winScr.x >= petW + 24;
            var rightRoom = (winScr.x + winScr.width) - (wp.x + wp.w) >= petW + 24;
            var loafX;
            if (leftRoom && (!rightRoom || !preferRight)) {
                loafX = wp.x - petW - 14;
            } else if (rightRoom) {
                loafX = wp.x + wp.w + 14;
            } else {
                loafX = preferRight ? (wp.x + wp.w - petW - 24) : (wp.x + 24);
            }
            var loafBesideGX = Math.max(winScr.x + 8, Math.min(maxWinX, loafX));
            var loafBesideGY = Math.max(winScr.y + 8, Math.min(maxWinY, wp.y + wp.h - Math.round(petH * 0.18)));

            win = {
                address: wp.address || "",
                gx: cx,
                gy: cy,
                x: wp.x,
                y: wp.y,
                w: wp.w,
                h: wp.h,
                top: wp.y,
                bottom: wp.y + wp.h,
                screenX: winScr.x,
                screenY: winScr.y,
                screenW: winScr.width,
                screenH: winScr.height,
                bottomInset: bInset,
                cls: cls,
                isCode: Memory.isCodeWindow(cls),
                title: wt.activeWindowTitle || "",
                onMyScreen: cx >= sx && cx < sx + sw && cy >= sy && cy < sy + sh,
                canPerchTop: canPerchTop,
                perchGX: cx,
                perchGY: Math.max(winScr.y, wp.y - petH * 0.85),
                canSitBelow: canSitBelow,
                watchBelowGX: watchBelowGX,
                watchBelowGY: watchBelowGY,
                loafBesideGX: loafBesideGX,
                loafBesideGY: loafBesideGY,
                dist: Math.hypot(cx - petGX, cy - petGY)
            };
        }
    }

    var perches = [];
    var rawWins = wt.visibleWindows || [];
    var myScreenFullscreen = false;
    for (var w = 0; w < rawWins.length; w++) {
        var rw = rawWins[w];
        if (!rw || rw.title === "Pokémon Sanctuary") continue;
        var rcx = rw.x + rw.w * 0.5, rcy = rw.y + rw.h * 0.5;
        var isTrueFs = rw.trueFullscreen !== undefined ? !!rw.trueFullscreen : !!rw.fullscreen;
        if (isTrueFs && rcx >= sx && rcx < sx + sw && rcy >= sy && rcy < sy + sh) {
            myScreenFullscreen = true;
        }
        if (rw.fullscreen || rw.w < 200 || rw.h < 120) continue;
        var wScreen = Topology.screenAt(reachable, rcx, rcy);
        if (!wScreen) continue;
        if (rw.y < Topology.minPerchY(wScreen, petH)) continue;
        var px = rw.x + rw.w * 0.5;
        var py = Math.max(wScreen.y, rw.y - petH * 0.85);
        var leftGX = Math.max(wScreen.x + 8, rw.x + 12);
        var rightGX = Math.max(leftGX, Math.min(wScreen.x + wScreen.width - petW - 8, rw.x + rw.w - petW - 12));
        perches.push({
            address: rw.address || "",
            cls: rw.cls || "",
            isCode: Memory.isCodeWindow(rw.cls || ""),
            x: rw.x,
            y: rw.y,
            w: rw.w,
            h: rw.h,
            gx: px,
            gy: py,
            leftGX: leftGX,
            rightGX: rightGX,
            spanW: Math.max(0, rightGX - leftGX),
            sameScreen: wScreen.x === sx && wScreen.y === sy,
            focused: !!rw.focused,
            dist: Math.hypot(px - petGX, py - petGY),
            adjacentLedges: []
        });
    }
    for (var pa = 0; pa < perches.length; pa++) {
        var pA = perches[pa];
        if (!pA.sameScreen) continue;
        for (var pb = 0; pb < perches.length; pb++) {
            if (pa === pb) continue;
            var pB = perches[pb];
            if (!pB.sameScreen) continue;
            if (pA.address && pA.address === pB.address) continue;
            if (Math.abs(pB.gy - pA.gy) > 90) continue;
            var fromGX = pB.gx >= pA.gx ? pA.rightGX : pA.leftGX;
            var toGX = pB.gx >= pA.gx ? pB.leftGX : pB.rightGX;
            var jDist = Math.hypot(toGX - fromGX, pB.gy - pA.gy);
            if (jDist >= 42 && jDist <= 175) {
                pA.adjacentLedges.push({
                    perch: pB,
                    fromGX: fromGX,
                    toGX: toGX,
                    toGY: pB.gy,
                    dist: jDist
                });
            }
        }
        pA.adjacentLedges.sort(function(a, b) { return a.dist - b.dist; });
    }
    if (!myScreenFullscreen && wt.isFullscreen && (!win || win.onMyScreen)) {
        myScreenFullscreen = true;
    }

    var it = pet.inputTracker || { cursorX: 0, cursorY: 0, cursorSpeed: 0, userActive: true, cursorKnown: true };
    var cgx = it.cursorX || 0, cgy = it.cursorY || 0;
    var cursorScr = Topology.screenAt(reachable, cgx, cgy);
    var cursor = {
        gx: cgx,
        gy: cgy,
        localX: cgx - sx,
        localY: cgy - sy,
        onMyScreen: cgx >= sx && cgx < sx + sw && cgy >= sy && cgy < sy + sh,
        reachable: it.cursorKnown !== false && (reachable.length === 0 || cursorScr !== null),
        dist: Math.hypot(cgx - petGX, cgy - petGY),
        inFov: Util.inFieldOfView(pet, cgx, cgy, 220),
        speed: it.cursorSpeed || 0,
        active: !!it.userActive,
        parked: !!it.cursorParked
    };

    var mt = pet.mediaTracker || { isPlaying: false, micActive: false, trackTitle: "", trackArtist: "" };
    var sm = pet.systemMonitor || {};

    var others = [];
    var allPets = (pet.petManager && pet.petManager.pets) ? pet.petManager.pets : [];
    for (var i = 0; i < allPets.length; i++) {
        var o = allPets[i];
        if (!o || o === pet) continue;
        var ogx = o.screenX() + o.worldX;
        var ogy = o.screenY() + o.worldY;
        var dist = Math.hypot(ogx - petGX, ogy - petGY);
        if (dist > NEARBY_PET_DIST) continue;
        if (reachable.length > 1 && !Topology.screenAt(reachable, ogx + (o.width || 64) * 0.5, ogy + (o.height || 64) * 0.5)) {
            continue;
        }
        var rel = Memory.relationWith(pet, o.petData.name, o.personality, o.petData.sprite);
        var oPlan = o.activePlan ? o.activePlan.name : "";
        var busySocial = oPlan === "spar_bout" || oPlan === "spar_partner"
                      || oPlan === "play_tag" || oPlan === "flee_tag" || oPlan === "reverse_tag"
                      || oPlan === "squabble" || oPlan === "squabble_reply"
                      || oPlan === "invite_play" || oPlan === "sync_dance"
                      || oPlan === "peacekeeper" || oPlan === "retire_to_pen"
                      || oPlan === "joint_retire" || oPlan === "welcome_friend"
                      || oPlan === "sneak_boop" || oPlan === "mentor_patrol"
                      || oPlan === "copycat_trail" || oPlan === "guardian_check"
                      || oPlan === "timid_hide";
        others.push({
            pet: o,
            name: o.petData.name,
            species: o.petData.sprite || "",
            socialStyle: SpeciesProfile.socialStyleOf(o),
            gx: ogx,
            gy: ogy,
            dist: dist,
            inFov: Util.inFieldOfView(pet, ogx, ogy, 220),
            state: o.state_,
            activePlanName: oPlan,
            busySocial: busySocial,
            resting: Util.isRestingState(o.state_),
            playing: o.state_ === "zoomies" || oPlan === "play_tag" || oPlan === "flee_tag"
                  || oPlan === "reverse_tag" || oPlan === "spar_bout" || oPlan === "spar_partner"
                  || oPlan === "sync_dance",
            grooving: oPlan === "music_groove",
            attending: (o.attentionUntil || 0) > now,
            attentionGX: o.attentionGX || 0,
            attentionGY: o.attentionGY || 0,
            gazeRow: (o.sprite && o.sprite._dirRow !== undefined) ? o.sprite._dirRow : 0,
            sameScreen: o.screenX() === sx && o.screenY() === sy,
            affinity: rel.affinity,
            familiarity: rel.familiarity,
            respect: rel.respect !== undefined ? rel.respect : 0.5,
            sparCount: rel.sparCount || 0,
            unrequitedCount: rel.unrequitedCount || 0,
            friction: rel.friction || 0,
            sinceInteract: now - (rel.lastInteract || 0)
        });
    }
    others.sort(function(a, b) { return a.dist - b.dist; });

    var seamPeeks = [];
    if (reachable.length > 1) {
        for (var si = 0; si < reachable.length; si++) {
            var oScr = reachable[si];
            if (Topology.sameScreen(curScr, oScr)) continue;
            var seam = Topology.seamBetween(curScr, oScr, petW, petH);
            if (!seam) continue;
            var standGX = petGX, standGY = petGY, lookGX = petGX, lookGY = petGY, crossGX = petGX, crossGY = petGY;
            var midSpan = (seam.lo + seam.hi) * 0.5;
            if (seam.dir === "right") {
                standGX = Math.max(sx + 8, sx + sw - petW - 10);
                standGY = Topology.clamp(petGY, seam.lo + 16, Math.max(seam.lo + 16, seam.hi - petH - 16));
                lookGX = oScr.x + Math.min(240, oScr.width * 0.35);
                lookGY = standGY;
                crossGX = oScr.x + Math.min(160, Math.max(36, oScr.width - petW - 36));
                crossGY = Topology.clamp(standGY, oScr.y + 28, Math.max(oScr.y + 28, oScr.y + oScr.height - petH - 28));
            } else if (seam.dir === "left") {
                standGX = sx + 10;
                standGY = Topology.clamp(petGY, seam.lo + 16, Math.max(seam.lo + 16, seam.hi - petH - 16));
                lookGX = oScr.x + oScr.width - Math.min(240, oScr.width * 0.35);
                lookGY = standGY;
                crossGX = Math.max(oScr.x + 24, oScr.x + oScr.width - petW - 160);
                crossGY = Topology.clamp(standGY, oScr.y + 28, Math.max(oScr.y + 28, oScr.y + oScr.height - petH - 28));
            } else if (seam.dir === "down") {
                standGX = Topology.clamp(midSpan - petW * 0.5, seam.lo + 16, Math.max(seam.lo + 16, seam.hi - petW - 16));
                standGY = Math.max(sy + 8, sy + sh - petH - 10);
                lookGX = standGX;
                lookGY = oScr.y + Math.min(200, oScr.height * 0.35);
                crossGX = Topology.clamp(standGX, oScr.x + 28, Math.max(oScr.x + 28, oScr.x + oScr.width - petW - 28));
                crossGY = oScr.y + Math.min(140, Math.max(32, oScr.height - petH - 32));
            } else if (seam.dir === "up") {
                standGX = Topology.clamp(midSpan - petW * 0.5, seam.lo + 16, Math.max(seam.lo + 16, seam.hi - petW - 16));
                standGY = sy + (curScr.topInset || 0) + 10;
                lookGX = standGX;
                lookGY = oScr.y + oScr.height - Math.min(200, oScr.height * 0.35);
                crossGX = Topology.clamp(standGX, oScr.x + 28, Math.max(oScr.x + 28, oScr.x + oScr.width - petW - 28));
                crossGY = Math.max(oScr.y + 28, oScr.y + oScr.height - petH - 140);
            }
            var hasPeerAcross = false;
            for (var oi = 0; oi < others.length; oi++) {
                if (Topology.pointOnScreen(oScr, others[oi].gx, others[oi].gy)) { hasPeerAcross = true; break; }
            }
            var hasWinAcross = !!(win && !win.onMyScreen && Topology.pointOnScreen(oScr, win.gx, win.gy));
            seamPeeks.push({
                dir: seam.dir,
                screenName: oScr.name || "adjacent display",
                standGX: standGX,
                standGY: standGY,
                lookGX: lookGX,
                lookGY: lookGY,
                crossGX: crossGX,
                crossGY: crossGY,
                hasPeer: hasPeerAcross,
                hasWindow: hasWinAcross,
                dist: Math.hypot(standGX - petGX, standGY - petGY)
            });
        }
        seamPeeks.sort(function(a, b) { return a.dist - b.dist; });
    }

    var dHome = Math.hypot(petGX - pet.homeGX, petGY - pet.homeGY);
    var homeReachable = reachable.length === 0 || Topology.screenAt(reachable, pet.homeGX, pet.homeGY) !== null;
    var solarPhase = sm.solarPhase || (pet.isNighttime ? "night" : "day");
    var myName = (pet.petData && pet.petData.name) ? pet.petData.name : "";

    var warmSpot = null;
    var rawWarm = (pet.petManager && Array.isArray(pet.petManager.vacatedWarmSpots))
        ? pet.petManager.vacatedWarmSpots
        : [];
    var bestWarmScore = -Infinity;
    for (var wi = 0; wi < rawWarm.length; wi++) {
        var ws = rawWarm[wi];
        if (!ws || (now - (ws.time || 0)) > 28000) continue;
        if (myName && ws.petName === myName) continue;
        if (!Topology.pointOnScreen(curScr, ws.gx, ws.gy)) continue;
        var wDist = Math.hypot(ws.gx - petGX, ws.gy - petGY);
        if (wDist < 28 || wDist > 360) continue;
        var wScore = (ws.warmth || 0.5) - (wDist / 450);
        if (wScore > bestWarmScore) {
            bestWarmScore = wScore;
            warmSpot = {
                gx: ws.gx,
                gy: ws.gy,
                petName: ws.petName || "",
                warmth: ws.warmth || 0.5,
                dist: wDist
            };
        }
    }

    return {
        now: now,
        hour: pet._hour !== undefined ? pet._hour : new Date(now).getHours(),
        isNight: !!pet.isNighttime,
        solarPhase: solarPhase,
        isDawn: solarPhase === "dawn",
        isDusk: solarPhase === "dusk",
        weatherKind: sm.weatherKind || "clear",
        isRaining: !!sm.isRaining,
        isSnowing: !!sm.isSnowing,
        thermalWarmth: sm.thermalWarmth !== undefined ? sm.thermalWarmth : 0,
        lowBattery: !!sm.lowBattery,
        isPluggedIn: !!sm.isPluggedIn,
        batteryLevel: sm.batteryLevel !== undefined ? sm.batteryLevel : 1,
        micActive: !!mt.micActive,
        audioMuted: !!mt.audioMuted,
        systemBusy: !!sm.isUnderLoad,
        userBusy: !!wt.isUserBusy,
        userIdle: !it.userActive,
        windowCount: wt.windowCount || 0,
        fullscreen: myScreenFullscreen,
        win: win,
        perches: perches,
        seamPeeks: seamPeeks,
        cursor: cursor,
        mediaPlaying: !!mt.isPlaying,
        mediaTitle: mt.trackTitle || "",
        mediaArtist: mt.trackArtist || "",
        petGX: petGX,
        petGY: petGY,
        petW: petW,
        petH: petH,
        screen: {
            x: sx,
            y: sy,
            w: sw,
            h: sh,
            topInset: curScr.topInset || 0,
            bottomInset: curScr.bottomInset || 0
        },
        distFromHome: dHome,
        atHome: dHome < pet.homeRadius,
        homeReachable: homeReachable,
        others: others,
        nearest: others.length > 0 ? others[0] : null,
        warmSpot: warmSpot,
        placeAffectHere: Memory.placeAffectAt(pet, petGX, petGY)
    };
}
