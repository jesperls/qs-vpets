.pragma library

.import "SpeciesProfile.js" as SpeciesProfile

var SPECIES_LIST = SpeciesProfile.SPECIES_LIST;
var SPECIES_TEMPERAMENT = SpeciesProfile.SPECIES_TEMPERAMENT;

var DEFAULT_STATE_MAP = {
    idle: "Idle",
    idleOnce: "Idle",
    walk: "Walk",
    wander: "Walk",
    perch: "Idle",
    loaf: "EventSleep",
    laying: "Laying",
    sit: "EventSleep",
    sitNorth: "Sit",
    lookUpNorth: "LookUp",
    deepsleep: "Sleep",
    drag: "Float",
    airborne: "Tumble",
    leap: "Hop",
    react: "Hop",
    startle: "Hurt",
    zoomies: "Walk",
    attack: "Attack",
    hop: "Hop",
    shoot: "Shoot",
    charge: "Charge",
    double: "Double",
    strike: "Strike",
    quickStrike: "QuickStrike",
    multiStrike: "MultiStrike",
    spAttack: "SpAttack",
    swing: "Swing",
    special0: "Special0",
    appeal: "Appeal",
    tailWhip: "TailWhip",
    dance: "Dance",
    shake: "Shake",
    emit: "Emit",
    shock: "Shock",
    lick: "Lick",
    rearUp: "RearUp",
    sing: "Sing",
    multiScratch: "MultiScratch",
    rumble: "Rumble",
    hover: "Hover",
    kick: "Kick",
    lookUp: "LookUp",
    head: "Head",
    nod: "Nod",
    pose: "Pose",
    eat: "Eat",
    trip: "Trip",
    wake: "Wake",
    deepBreath: "DeepBreath",
    cringe: "Cringe",
    sitDown: "Sit",
    faint: "Faint",
    rotate: "Rotate",
    twirl: "Twirl",
    tumble: "Tumble",
    tumbleBack: "TumbleBack",
    pain: "Pain",
    hide: "Withdraw",
    sink: "Sink",
    float: "Float",
    leapForth: "LeapForth",
    hitGround: "HitGround",
    lostBalance: "LostBalance",
    pull: "Pull"
};

var FALLBACK_CHAINS = {
    idle: ["Idle", "Walk"],
    idleOnce: ["Idle", "Pose", "Walk"],
    perch: ["Idle", "Walk"],
    loaf: ["EventSleep", "Sleep", "Idle", "Walk"],
    laying: ["Laying", "EventSleep", "Sleep", "Idle", "Walk"],
    sit: ["EventSleep", "Sleep", "Idle", "Walk"],
    sitNorth: ["Sit", "Idle", "Walk"],
    lookUpNorth: ["LookUp", "Nod", "Idle", "Walk"],
    deepsleep: ["Sleep", "EventSleep", "Laying", "Faint", "Walk"],
    drag: ["Float", "LostBalance", "Pull", "Hurt", "Idle", "Walk"],
    airborne: ["Tumble", "Float", "Hop", "Hurt", "Walk"],
    leap: ["Hop", "Float", "Walk"],
    react: ["Hop", "Pose", "Nod", "Idle", "Walk"],
    startle: ["Hurt", "Cringe", "Trip", "Walk"],
    zoomies: ["Walk"],
    special0: ["Special0", "Idle", "Walk"],
    appeal: ["Appeal", "Pose", "Nod", "Idle", "Walk"],
    tailWhip: ["TailWhip", "Rotate", "Nod", "Idle", "Walk"],
    dance: ["Dance", "Twirl", "Rotate", "Idle", "Walk"],
    shake: ["Shake", "Nod", "Idle", "Walk"],
    emit: ["Emit", "Pose", "Nod", "Idle", "Walk"],
    shock: ["Shock", "Charge", "Pose", "Idle", "Walk"],
    lick: ["Lick", "Attack", "Pose", "Idle", "Walk"],
    rearUp: ["RearUp", "Pose", "Nod", "Idle", "Walk"],
    sing: ["Sing", "Twirl", "Appeal", "Pose", "Idle", "Walk"],
    multiScratch: ["MultiScratch", "MultiStrike", "QuickStrike", "Strike", "Attack", "Walk"],
    rumble: ["Rumble", "RearUp", "Charge", "Pose", "Idle", "Walk"],
    hover: ["Hover", "Float", "Twirl", "Pose", "Idle", "Walk"],
    kick: ["Kick", "Strike", "Attack", "Walk"],
    wake: ["Wake", "Nod", "Idle", "Walk"],
    deepBreath: ["DeepBreath", "Idle", "Sleep", "Walk"],
    cringe: ["Cringe", "Hurt", "Idle", "Walk"],
    lookUp: ["LookUp", "Nod", "Idle", "Walk"],
    head: ["Head", "Nod", "Pose", "Idle", "Walk"],
    nod: ["Nod", "Idle", "Walk"],
    pose: ["Pose", "Nod", "Idle", "Walk"],
    eat: ["Eat", "Nod", "Idle", "Walk"],
    trip: ["Trip", "LostBalance", "Hurt", "Walk"],
    lostBalance: ["LostBalance", "Trip", "Hurt", "Walk"],
    sitDown: ["Sit", "EventSleep", "Sleep", "Idle", "Walk"],
    faint: ["Faint", "Laying", "Sleep", "Walk"],
    rotate: ["Rotate", "Twirl", "Walk"],
    twirl: ["Twirl", "Rotate", "Walk"],
    tumble: ["Tumble", "Trip", "Hurt", "Walk"],
    tumbleBack: ["TumbleBack", "Tumble", "Hurt", "Walk"],
    pain: ["Pain", "Hurt", "Cringe", "Walk"],
    hide: ["Withdraw", "Sink", "Cringe", "Hurt", "Idle", "Walk"],
    sink: ["Sink", "Withdraw", "Cringe", "Hurt", "Idle", "Walk"],
    float: ["Float", "Idle", "Walk"],
    leapForth: ["LeapForth", "Hop", "Attack", "Walk"],
    hitGround: ["HitGround", "TumbleBack", "Trip", "Hurt", "Walk"],
    pull: ["Pull", "Charge", "Walk"]
};

var STATE_CLIP_DEFAULTS = {
    idle: { anim: "Idle", loop: true, speed: 0.55 },
    perch: { anim: "Idle", loop: true, speed: 0.55 },
    idleOnce: { anim: "Idle", loop: false, speed: 0.74, endHoldTicks: 10, trimLeadIdle: true },
    walk: { anim: "Walk", loop: true, dynamicWalkSpeed: true },
    wander: { anim: "Walk", loop: true, dynamicWalkSpeed: true },
    zoomies: { anim: "Walk", loop: true, dynamicWalkSpeed: true },
    loaf: { anim: "EventSleep", loop: true, speed: 0.50, lockDirection: true },
    laying: { anim: "Laying", loop: true, holdAtFrame: "last", speed: 0.50, lockDirection: true },
    sit: { anim: "EventSleep", loop: true, speed: 0.50, lockDirection: true },
    sitNorth: { anim: "Sit", loop: true, holdAtFrame: "last", speed: 0.65, fixedDirRow: 4, lockDirection: true }, // PMD Sit/LookUp face North (row 4)
    lookUpNorth: { anim: "LookUp", loop: false, speed: 0.58, endHoldTicks: 34, fixedDirRow: 4, lockDirection: true },
    deepsleep: { anim: "Sleep", loop: true, speed: 0.38, lockDirection: true },
    drag: { anim: "Float", loop: true, speed: 1.0 },
    airborne: { anim: "Tumble", loop: true, speed: 1.0 },
    leap: { anim: "Hop", loop: true, speed: 0.95 },
    sitDown: { anim: "Sit", loop: false, speed: 0.58, endHoldTicks: 45 },
    lookUp: { anim: "LookUp", loop: false, speed: 0.58, endHoldTicks: 34 },
    head: { anim: "Head", loop: false, speed: 0.58, endHoldTicks: 22 },
    pull: { anim: "Pull", loop: false, speed: 0.65 },
    pose: { anim: "Pose", loop: false, speed: 0.58, endHoldTicks: 14 },
    nod: { anim: "Nod", loop: false, speed: 0.58, endHoldTicks: 10 },
    appeal: { anim: "Appeal", loop: false, speed: 0.58 },
    tailWhip: { anim: "TailWhip", loop: false, speed: 0.58 },
    shake: { anim: "Shake", loop: false, speed: 0.58 },
    emit: { anim: "Emit", loop: false, speed: 0.58 },
    rearUp: { anim: "RearUp", loop: false, speed: 0.58 },
    rotate: { anim: "Rotate", loop: false, speed: 0.54 },
    twirl: { anim: "Twirl", loop: false, speed: 0.54 },
    dance: { anim: "Dance", loop: false, speed: 0.54 },
    charge: { anim: "Charge", loop: false, speed: 0.62 },
    hide: { anim: "Withdraw", loop: false, speed: 0.62 },
    sink: { anim: "Sink", loop: false, speed: 0.62 },
    special0: { anim: "Special0", loop: false, speed: 0.62 },
    shock: { anim: "Shock", loop: false, speed: 0.62 },
    lick: { anim: "Lick", loop: false, speed: 0.62 },
    sing: { anim: "Sing", loop: false, speed: 0.56 },
    multiScratch: { anim: "MultiScratch", loop: false, speed: 0.66 },
    rumble: { anim: "Rumble", loop: false, speed: 0.60 },
    hover: { anim: "Hover", loop: false, speed: 0.56 },
    kick: { anim: "Kick", loop: false, speed: 0.66 },
    deepBreath: { anim: "DeepBreath", loop: false, speed: 0.68 },
    wake: { anim: "Wake", loop: false, speed: 0.68 },
    eat: { anim: "Eat", loop: false, speed: 0.68, reps: 2 }
};

var _DEFAULT_ONESHOT = { loop: false, speed: 1.0, reps: 1, endHoldTicks: 0, fixedDirRow: -1, lockDirection: false };

function isLoopingState(state) {
    var d = STATE_CLIP_DEFAULTS[state];
    return !!(d && d.loop);
}

var _animParseCache = {};
var _dirParseCache = {};

function cachedForDir(dir) {
    if (!dir) return null;
    return _dirParseCache[dir] || null;
}

function storeDirCache(dir, parsed) {
    if (!dir || !parsed) return;
    _dirParseCache[dir] = parsed;
}

function _xmlCacheKey(xml) {
    var h = 2166136261;
    var step = Math.max(1, Math.floor(xml.length / 256));
    for (var i = 0; i < xml.length; i += step) {
        h ^= xml.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return xml.length + ":" + h + ":" + xml.slice(0, 48);
}

function parseAnimData(xml) {
    if (!xml) return { shadowSize: 1, anims: {} };
    var cacheKey = _xmlCacheKey(xml);
    if (_animParseCache[cacheKey]) return _animParseCache[cacheKey];
    var shadowMatch = xml.match(/<ShadowSize>(\d+)<\/ShadowSize>/);
    var shadowSize = shadowMatch ? parseInt(shadowMatch[1], 10) : 1;
    var anims = {};
    var blocks = xml.match(/<Anim>[\s\S]*?<\/Anim>/g) || [];

    for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        var name = (b.match(/<Name>(.*?)<\/Name>/) || [])[1];
        if (!name) continue;
        var copyOf = (b.match(/<CopyOf>(.*?)<\/CopyOf>/) || [])[1];
        if (copyOf) {
            anims[name] = { copyOf: copyOf };
            continue;
        }
        var fw = parseInt((b.match(/<FrameWidth>(\d+)<\/FrameWidth>/) || [])[1], 10) || 0;
        var fh = parseInt((b.match(/<FrameHeight>(\d+)<\/FrameHeight>/) || [])[1], 10) || 0;
        var rush = b.match(/<RushFrame>(\d+)<\/RushFrame>/);
        var hit = b.match(/<HitFrame>(\d+)<\/HitFrame>/);
        var ret = b.match(/<ReturnFrame>(\d+)<\/ReturnFrame>/);
        var durMatches = b.match(/<Duration>(\d+)<\/Duration>/g) || [];
        var durs = [];
        var totalTicks = 0;
        for (var j = 0; j < durMatches.length; j++) {
            var d = Math.max(1, parseInt(durMatches[j].match(/\d+/)[0], 10) || 1);
            durs.push(d);
            totalTicks += d;
        }
        if (fw > 0 && fh > 0 && durs.length > 0) {
            anims[name] = {
                name: name,
                sheet: name, // CopyOf targets keep the real PNG sheet name
                frameWidth: fw,
                frameHeight: fh,
                durations: durs,
                frameCount: durs.length,
                totalTicks: totalTicks,
                rushFrame: rush ? parseInt(rush[1], 10) : -1,
                hitFrame: hit ? parseInt(hit[1], 10) : -1,
                returnFrame: ret ? parseInt(ret[1], 10) : -1
            };
        }
    }

    for (var pass = 0; pass < 10; pass++) {
        var pending = false;
        var keys = Object.keys(anims);
        for (var k = 0; k < keys.length; k++) {
            var entry = anims[keys[k]];
            if (!entry.copyOf) continue;
            var target = anims[entry.copyOf];
            if (target && !target.copyOf) {
                var resolved = {};
                var tKeys = Object.keys(target);
                for (var tk = 0; tk < tKeys.length; tk++) resolved[tKeys[tk]] = target[tKeys[tk]];
                resolved.name = keys[k];
                anims[keys[k]] = resolved;
            } else if (target) {
                pending = true;
            }
        }
        if (!pending) break;
    }

    var cleanupKeys = Object.keys(anims);
    for (var c = 0; c < cleanupKeys.length; c++) {
        if (anims[cleanupKeys[c]].copyOf) delete anims[cleanupKeys[c]];
    }

    var parsed = { shadowSize: shadowSize, anims: anims };
    _animParseCache[cacheKey] = parsed;
    return parsed;
}

function resolveClip(state, anims, actionMap, species) {
    var st = state || "idle";
    var stateDef = STATE_CLIP_DEFAULTS[st] || _DEFAULT_ONESHOT;
    var spClip = species ? SpeciesProfile.clipOverrideFor(species, st) : null;
    var userAnim = (actionMap && actionMap[st]) || "";
    var desired = userAnim || (spClip && spClip.anim) || stateDef.anim || DEFAULT_STATE_MAP[st] || "Walk";

    var animName = desired;
    if (anims) {
        if (!anims[desired]) {
            var chain = FALLBACK_CHAINS[st] || [desired, "Idle", "Walk"];
            animName = "";
            for (var i = 0; i < chain.length; i++) {
                if (anims[chain[i]]) { animName = chain[i]; break; }
            }
            if (!animName) {
                var available = Object.keys(anims);
                animName = available.indexOf("Walk") !== -1 ? "Walk" : (available[0] || "Walk");
            }
        }
    }

    var anim = (anims && anims[animName]) ? anims[animName] : null;
    var fc = (anim && anim.frameCount > 0) ? anim.frameCount : 1;
    var sliceTarget = (spClip && spClip.anim) || stateDef.anim || DEFAULT_STATE_MAP[st] || animName;
    var sliceMatches = !userAnim && animName === sliceTarget;

    var rawStart = sliceMatches
        ? ((spClip && spClip.startFrame !== undefined) ? spClip.startFrame : stateDef.startFrame)
        : 0;
    var startFrame = rawStart !== undefined ? Math.max(0, Math.min(fc - 1, rawStart)) : 0;

    var rawEnd = sliceMatches
        ? ((spClip && spClip.endFrame !== undefined) ? spClip.endFrame : stateDef.endFrame)
        : undefined;
    var endFrame = (rawEnd !== undefined && rawEnd >= 0)
        ? Math.max(startFrame, Math.min(fc - 1, rawEnd))
        : (fc - 1);

    var rawHold = sliceMatches
        ? ((spClip && spClip.holdAtFrame !== undefined) ? spClip.holdAtFrame : stateDef.holdAtFrame)
        : -1;
    var holdAtFrame = -1;
    if (rawHold === "last") {
        holdAtFrame = endFrame;
    } else if (typeof rawHold === "number" && rawHold >= 0) {
        holdAtFrame = Math.max(startFrame, Math.min(endFrame, rawHold));
    }

    var trimLead = sliceMatches && !!(spClip && spClip.trimLeadIdle !== undefined ? spClip.trimLeadIdle : stateDef.trimLeadIdle);
    var leadSkipTicks = 0;
    if (trimLead && anim && anim.durations && startFrame === 0 && endFrame > 0 && anim.durations[0] > 12) {
        leadSkipTicks = anim.durations[0] - 8;
    }

    var loop = (spClip && spClip.loop !== undefined) ? !!spClip.loop : !!stateDef.loop;
    var dynamicWalkSpeed = !!(spClip && spClip.dynamicWalkSpeed !== undefined ? spClip.dynamicWalkSpeed : stateDef.dynamicWalkSpeed);
    var speed = (spClip && spClip.speed !== undefined)
        ? spClip.speed
        : (stateDef.speed !== undefined ? stateDef.speed : 1.0);
    var reps = (spClip && spClip.reps !== undefined) ? spClip.reps : (stateDef.reps || 1);
    var endHoldTicks = (spClip && spClip.endHoldTicks !== undefined) ? spClip.endHoldTicks : (stateDef.endHoldTicks || 0);
    var fixedDirRow = (spClip && spClip.fixedDirRow !== undefined)
        ? spClip.fixedDirRow
        : (stateDef.fixedDirRow !== undefined ? stateDef.fixedDirRow : -1);
    var lockDirection = (spClip && spClip.lockDirection !== undefined) ? !!spClip.lockDirection : !!stateDef.lockDirection;

    return {
        state: st,
        animName: animName,
        loop: loop,
        startFrame: startFrame,
        endFrame: endFrame,
        holdAtFrame: holdAtFrame,
        speed: speed,
        dynamicWalkSpeed: dynamicWalkSpeed,
        reps: Math.max(1, reps),
        endHoldTicks: endHoldTicks,
        leadSkipTicks: leadSkipTicks,
        fixedDirRow: fixedDirRow,
        lockDirection: lockDirection
    };
}

function resolveAnimName(state, anims, actionMap, species) {
    return resolveClip(state, anims, actionMap, species).animName;
}

function hasDirectAnim(state, anims, actionMap, species) {
    if (!anims) return false;
    var spClip = species ? SpeciesProfile.clipOverrideFor(species, state) : null;
    var desired = (actionMap && actionMap[state]) || (spClip && spClip.anim) || DEFAULT_STATE_MAP[state];
    return !!(desired && anims[desired]);
}

// Screen angle (+x right, +y down) -> PMD 8-direction row (0=S,1=SE,2=E,3=NE,4=N,5=NW,6=W,7=SW).
var ANGLE_SECTOR_TO_PMD_ROW = [2, 1, 0, 7, 6, 5, 4, 3];

function angleToDirectionRow(angle) {
    var a = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    var sector = Math.round(a / (Math.PI / 4)) % 8;
    return ANGLE_SECTOR_TO_PMD_ROW[sector];
}

var PMD_ROW_TO_ANGLE = [
    Math.PI * 0.5,
    Math.PI * 0.25,
    0,
    -Math.PI * 0.25,
    -Math.PI * 0.5,
    -Math.PI * 0.75,
    Math.PI,
    Math.PI * 0.75
];

function directionRowToAngle(row) {
    var r = ((Math.round(row || 0) % 8) + 8) % 8;
    return PMD_ROW_TO_ANGLE[r];
}

function stepDirectionRow(curRow, targetRow) {
    var c = ((Math.round(curRow || 0) % 8) + 8) % 8;
    var t = ((Math.round(targetRow || 0) % 8) + 8) % 8;
    if (c === t) return c;
    var diff = ((t - c + 12) % 8) - 4;
    return (c + (diff > 0 ? 1 : 7)) % 8;
}

// PMD durations are authored at 60Hz (~16.67ms/tick).
var PMD_TICK_MS = 1000 / 60;

function animDurationMs(anim, speedFactor) {
    if (!anim || !anim.totalTicks) return 750;
    var sf = speedFactor && speedFactor > 0 ? speedFactor : 1;
    return Math.round((anim.totalTicks * PMD_TICK_MS) / sf);
}

function clipDurationMs(clip, anim, speedFactor) {
    if (!anim || !anim.durations || anim.durations.length === 0) return 750;
    var c = clip || { startFrame: 0, endFrame: anim.frameCount - 1, reps: 1, leadSkipTicks: 0, endHoldTicks: 0, speed: 1 };
    var sliceTicks = 0;
    var lo = Math.max(0, c.startFrame || 0);
    var hi = Math.min(anim.durations.length - 1, c.endFrame !== undefined ? c.endFrame : (anim.durations.length - 1));
    for (var i = lo; i <= hi; i++) {
        sliceTicks += anim.durations[i] || 4;
    }
    var reps = Math.max(1, c.reps || 1);
    var total = Math.max(8, sliceTicks * reps - (c.leadSkipTicks || 0)) + (c.endHoldTicks || 0);
    var sf = speedFactor && speedFactor > 0 ? speedFactor : (c.speed || 1);
    return Math.round((total * PMD_TICK_MS) / sf);
}
