.import "SpeciesProfile.js" as SpeciesProfile

var SPECIES_LIST = [
    "absol", "charizard", "cyndaquil", "eevee", "ferrothorn",
    "gengar", "giratina", "grovyle", "infernape", "litwick",
    "mew", "mudkip", "munchlax", "phantump", "pikachu",
    "riolu", "rowlet", "shiftry", "sprigatito", "toxapex",
    "umbreon", "vulpix", "whimsicott", "wooper", "zorua"
];

var SPECIES_TEMPERAMENT = {
    absol: "shy",
    charizard: "brave",
    cyndaquil: "shy",
    eevee: "curious",
    ferrothorn: "grumpy",
    gengar: "playful",
    giratina: "nocturnal",
    grovyle: "curious",
    infernape: "energetic",
    litwick: "nocturnal",
    mew: "playful",
    mudkip: "chill",
    munchlax: "lazy",
    phantump: "shy",
    pikachu: "energetic",
    riolu: "brave",
    rowlet: "lazy",
    shiftry: "chill",
    sprigatito: "curious",
    toxapex: "lazy",
    umbreon: "nocturnal",
    vulpix: "chill",
    whimsicott: "playful",
    wooper: "chill",
    zorua: "playful"
};

var DEFAULT_STATE_MAP = {
    idle: "Idle",
    idleOnce: "Idle",
    walk: "Walk",
    wander: "Walk",
    perch: "Idle",
    loaf: "EventSleep",
    sit: "EventSleep",
    sitNorth: "Sit",
    lookUpNorth: "LookUp",
    deepsleep: "Sleep",
    drag: "Float",
    airborne: "Tumble",
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
    lookUp: "LookUp",
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
    loaf: ["EventSleep", "Withdraw", "Sleep", "Idle", "Walk"],
    sit: ["EventSleep", "Sleep", "Idle", "Walk"],
    sitNorth: ["Sit", "Idle", "Walk"],
    lookUpNorth: ["LookUp", "Nod", "Idle", "Walk"],
    deepsleep: ["Sleep", "EventSleep", "Laying", "Faint", "Walk"],
    drag: ["Float", "LostBalance", "Pull", "Hurt", "Idle", "Walk"],
    airborne: ["Tumble", "Float", "Hop", "Hurt", "Walk"],
    react: ["Hop", "Pose", "Nod", "Idle", "Walk"],
    startle: ["Hurt", "Cringe", "Trip", "Walk"],
    zoomies: ["Walk"],
    special0: ["Special0", "Idle", "Walk"],
    appeal: ["Appeal", "Pose", "Nod", "Idle", "Walk"],
    tailWhip: ["TailWhip", "Rotate", "Nod", "Idle", "Walk"],
    dance: ["Dance", "Twirl", "Rotate", "Idle", "Walk"],
    shake: ["Shake", "Nod", "Rotate", "Idle", "Walk"],
    emit: ["Emit", "Pose", "Nod", "Idle", "Walk"],
    shock: ["Shock", "Charge", "Pose", "Idle", "Walk"],
    lick: ["Lick", "Attack", "Pose", "Idle", "Walk"],
    rearUp: ["RearUp", "Pose", "Nod", "Idle", "Walk"],
    wake: ["Wake", "Nod", "Idle", "Walk"],
    deepBreath: ["DeepBreath", "Idle", "Sleep", "Walk"],
    cringe: ["Cringe", "Hurt", "Idle", "Walk"],
    lookUp: ["LookUp", "Nod", "Idle", "Walk"],
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

var LOOPING_STATES = {
    idle: true,
    perch: true,
    walk: true,
    wander: true,
    loaf: true,
    sit: true,
    sitNorth: true,
    deepsleep: true,
    zoomies: true,
    drag: true,
    airborne: true
};

function isLoopingState(state) {
    return !!LOOPING_STATES[state];
}

function parseAnimData(xml) {
    if (!xml) return { shadowSize: 1, anims: {} };
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

    return { shadowSize: shadowSize, anims: anims };
}

function resolveAnimName(state, anims, actionMap, species) {
    if ((state === "loaf" || state === "sit") && !(actionMap && actionMap[state]) && species && anims) {
        return SpeciesProfile.loafAnimName(species, anims);
    }
    var desired = (actionMap && actionMap[state]) || DEFAULT_STATE_MAP[state] || "Walk";
    if (!anims) return desired;
    if (anims[desired]) return desired;
    var chain = FALLBACK_CHAINS[state] || [desired, "Idle", "Walk"];
    for (var i = 0; i < chain.length; i++) {
        if (anims[chain[i]]) return chain[i];
    }
    var available = Object.keys(anims);
    return available.indexOf("Walk") !== -1 ? "Walk" : (available[0] || "Walk");
}

function hasDirectAnim(state, anims, actionMap) {
    if (!anims) return false;
    var desired = (actionMap && actionMap[state]) || DEFAULT_STATE_MAP[state];
    return !!(desired && anims[desired]);
}

// Screen angle (+x right, +y down) -> PMD 8-direction row (0=S,1=SE,2=E,3=NE,4=N,5=NW,6=W,7=SW).
var ANGLE_SECTOR_TO_PMD_ROW = [2, 1, 0, 7, 6, 5, 4, 3];

function angleToDirectionRow(angle) {
    var a = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    var sector = Math.round(a / (Math.PI / 4)) % 8;
    return ANGLE_SECTOR_TO_PMD_ROW[sector];
}

// PMD durations are authored at 60Hz (~16.67ms/tick).
var PMD_TICK_MS = 1000 / 60;

function animDurationMs(anim, speedFactor) {
    if (!anim || !anim.totalTicks) return 750;
    var sf = speedFactor && speedFactor > 0 ? speedFactor : 1;
    return Math.round((anim.totalTicks * PMD_TICK_MS) / sf);
}
