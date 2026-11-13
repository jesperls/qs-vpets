var PROFILES = {
    absol: {
        displayName: "Absol",
        biome: "Moonlit Woods",
        blurb: "Quiet sentinel that keeps calm watch below active windows.",
        nocturnalAffinity: true,
        standMode: "hold0", // Idle frame 1 is an open-mouth cry; frame 0 stands watch
        idleSpeed: 0.52,
        vocalState: "idleOnce",
        altVocalState: "pose",
        calmGestures: ["nod", "pose"],
        affectionGestures: ["nod", "pose"],
        greetGestures: ["nod", "pose"],
        settleGestures: ["nod"],
        signature: { state: "pose", minPlay: 0.44, label: "Scanning the horizon quietly" },
        loafAnim: "EventSleep",
        sleepAnim: "Sleep",
        wakeState: "wake",
        pantState: "deepBreath",
        northWatch: true,
        gait: { amble: 0.48, trot: 0.92, scamper: 1.55 },
        perchAffinity: 0.45,
        windowWatchAffinity: 1.35
    },
    charizard: {
        displayName: "Charizard",
        biome: "Warm Hearth",
        blurb: "Proud flame dragon that patrols screens and naps by warm corners.",
        nocturnalAffinity: false,
        standMode: "loop",
        idleSpeed: 0.55,
        vocalState: "charge",
        altVocalState: "hop",
        calmGestures: ["rotate"],
        affectionGestures: ["rotate", "hop"],
        greetGestures: ["rotate", "hop"],
        settleGestures: ["rotate"],
        signature: { state: "charge", minPlay: 0.52, label: "Stretching its wings wide" },
        loafAnim: "Sleep",
        sleepAnim: "Sleep",
        wakeState: "rotate",
        pantState: "",
        northWatch: false,
        gait: { amble: 0.50, trot: 0.96, scamper: 1.56 },
        perchAffinity: 0.80,
        windowWatchAffinity: 1.00
    },
    cyndaquil: {
        displayName: "Cyndaquil",
        biome: "Warm Hearth",
        blurb: "Shy hearth-mouse that curls into a warm ball near your work.",
        nocturnalAffinity: false,
        standMode: "hold0",
        idleSpeed: 0.52,
        vocalState: "idleOnce",
        altVocalState: "hop",
        calmGestures: ["nod", "pose"],
        affectionGestures: ["twirl", "nod"],
        greetGestures: ["nod"],
        settleGestures: ["rotate", "nod"],
        signature: { state: "twirl", minPlay: 0.36, label: "Warming up with a back-flame spin" },
        loafAnim: "EventSleep",
        sleepAnim: "Sleep",
        wakeState: "wake",
        pantState: "deepBreath",
        northWatch: true,
        gait: { amble: 0.46, trot: 0.92, scamper: 1.52 },
        perchAffinity: 0.65,
        windowWatchAffinity: 1.25
    },
    eevee: {
        displayName: "Eevee",
        biome: "Sunlit Meadow",
        blurb: "Inquisitive fox-kit with expressive tail-wags and adaptable habits.",
        nocturnalAffinity: false,
        standMode: "loop",
        idleSpeed: 0.50,
        vocalState: "appeal",
        altVocalState: "hop",
        calmGestures: ["nod", "tailWhip"],
        affectionGestures: ["appeal", "tailWhip", "rotate"],
        greetGestures: ["tailWhip", "nod"],
        settleGestures: ["rotate", "nod"],
        signature: { state: "appeal", minPlay: 0.34, label: "Wagging its fluffy tail happily" },
        loafAnim: "EventSleep",
        sleepAnim: "Sleep",
        wakeState: "wake",
        pantState: "deepBreath",
        northWatch: true,
        gait: { amble: 0.54, trot: 1.02, scamper: 1.70 },
        perchAffinity: 1.15,
        windowWatchAffinity: 1.28
    },
    ferrothorn: {
        displayName: "Ferrothorn",
        biome: "Moonlit Woods",
        blurb: "Stoic iron pod that anchors peacefully in a chosen sanctuary spot.",
        nocturnalAffinity: false,
        standMode: "loop",
        idleSpeed: 0.45,
        vocalState: "special0",
        altVocalState: "charge",
        calmGestures: ["special0"],
        affectionGestures: ["special0", "rotate"],
        greetGestures: ["special0"],
        settleGestures: ["special0"],
        signature: { state: "special0", minPlay: 0.28, label: "Anchoring its iron pod" },
        loafAnim: "Sleep",
        sleepAnim: "Sleep",
        wakeState: "special0",
        pantState: "",
        northWatch: false,
        gait: { amble: 0.38, trot: 0.72, scamper: 1.18 },
        perchAffinity: 0.20,
        windowWatchAffinity: 0.85
    },
    gengar: {
        displayName: "Gengar",
        biome: "Shadow Hollow",
        blurb: "Mischievous shadow spirit that melts into floors and loves night sessions.",
        nocturnalAffinity: true,
        standMode: "hold0", // Frames 1-7 are a full-body cackle
        idleSpeed: 0.54,
        vocalState: "idleOnce",
        altVocalState: "lick",
        calmGestures: ["nod", "pose"],
        affectionGestures: ["twirl", "pose"],
        greetGestures: ["pose", "nod"],
        settleGestures: ["sink", "nod"],
        signature: { state: "sink", minPlay: 0.36, label: "Melting mischievously into floor shadow" },
        loafAnim: "EventSleep",
        sleepAnim: "Sleep",
        wakeState: "wake",
        pantState: "deepBreath",
        northWatch: true,
        gait: { amble: 0.52, trot: 0.98, scamper: 1.62 },
        perchAffinity: 0.90,
        windowWatchAffinity: 1.15
    },
    giratina: {
        displayName: "Giratina",
        biome: "Shadow Hollow",
        blurb: "Ancient distortion guardian that drifts calmly during late hours.",
        nocturnalAffinity: true,
        standMode: "loop",
        idleSpeed: 0.50,
        vocalState: "spAttack",
        altVocalState: "charge",
        calmGestures: ["rotate"],
        affectionGestures: ["rotate", "spAttack"],
        greetGestures: ["rotate"],
        settleGestures: ["rotate"],
        signature: { state: "spAttack", minPlay: 0.42, label: "Rippling its shadow wings" },
        loafAnim: "Sleep",
        sleepAnim: "Sleep",
        wakeState: "rotate",
        pantState: "",
        northWatch: false,
        gait: { amble: 0.46, trot: 0.90, scamper: 1.46 },
        perchAffinity: 0.35,
        windowWatchAffinity: 1.10
    },
    grovyle: {
        displayName: "Grovyle",
        biome: "Sunlit Meadow",
        blurb: "Agile treetop scout that hops onto window titlebars to survey the screen.",
        nocturnalAffinity: false,
        standMode: "hold0", // Idle frame 1 is a battle crouch; Pose is a calm leaf-blade arm cross
        idleSpeed: 0.52,
        vocalState: "pose",
        altVocalState: "hop",
        calmGestures: ["nod", "pose"],
        affectionGestures: ["nod", "pose"],
        greetGestures: ["nod", "pose"],
        settleGestures: ["nod"],
        signature: { state: "hop", minPlay: 0.40, label: "Springing lightly on its toes" },
        loafAnim: "EventSleep",
        sleepAnim: "Sleep",
        wakeState: "wake",
        pantState: "deepBreath",
        northWatch: true,
        gait: { amble: 0.58, trot: 1.12, scamper: 1.78 },
        perchAffinity: 1.55,
        windowWatchAffinity: 1.15
    },
    infernape: {
        displayName: "Infernape",
        biome: "Warm Hearth",
        blurb: "Spirited martial acrobat with a softly flickering crown flame.",
        nocturnalAffinity: false,
        standMode: "prefix10", // Frames 0-9 flicker crown flame calmly; 10-14 leap cheering
        idleSpeed: 0.62,
        vocalState: "idleOnce",
        altVocalState: "hop",
        calmGestures: ["nod"],
        affectionGestures: ["nod", "hop"],
        greetGestures: ["nod", "hop"],
        settleGestures: ["nod"],
        signature: { state: "strike", minPlay: 0.38, label: "Practicing martial footwork" },
        loafAnim: "Sleep",
        sleepAnim: "Sleep",
        wakeState: "nod",
        pantState: "deepBreath",
        northWatch: false,
        gait: { amble: 0.60, trot: 1.14, scamper: 1.82 },
        perchAffinity: 1.25,
        windowWatchAffinity: 1.00
    },
    litwick: {
        displayName: "Litwick",
        biome: "Shadow Hollow",
        blurb: "Tiny desk-candle spirit that keeps warm company beside midnight terminals.",
        nocturnalAffinity: true,
        standMode: "loop",
        idleSpeed: 0.50,
        vocalState: "spAttack",
        altVocalState: "pose",
        calmGestures: ["nod", "pose"],
        affectionGestures: ["rotate", "pose"],
        greetGestures: ["nod"],
        settleGestures: ["nod"],
        signature: { state: "spAttack", minPlay: 0.38, label: "Flaring a warm violet candle glow" },
        loafAnim: "EventSleep",
        sleepAnim: "Sleep",
        wakeState: "wake",
        pantState: "deepBreath",
        northWatch: true,
        gait: { amble: 0.40, trot: 0.78, scamper: 1.28 },
        perchAffinity: 1.15,
        windowWatchAffinity: 1.45
    },
    mew: {
        displayName: "Mew",
        biome: "Starlight Loft",
        blurb: "Weightless psychic drifter that loves music, tosses, and multi-monitor flights.",
        nocturnalAffinity: true,
        standMode: "loop",
        idleSpeed: 0.48,
        vocalState: "pose",
        altVocalState: "twirl",
        calmGestures: ["nod", "twirl"],
        affectionGestures: ["twirl", "rotate"],
        greetGestures: ["twirl", "nod"],
        settleGestures: ["rotate"],
        signature: { state: "twirl", minPlay: 0.28, label: "Doing a weightless mid-air somersault" },
        loafAnim: "EventSleep",
        sleepAnim: "Sleep",
        wakeState: "wake",
        pantState: "deepBreath",
        northWatch: true,
        gait: { amble: 0.56, trot: 1.08, scamper: 1.76 },
        perchAffinity: 1.48,
        windowWatchAffinity: 1.15
    },
    mudkip: {
        displayName: "Mudkip",
        biome: "Tidepool Cove",
        blurb: "Unhurried marsh buddy that paddles around and naps beside friends.",
        nocturnalAffinity: false,
        standMode: "hold0", // Frames 1-6 are a 5px splash hop
        idleSpeed: 0.52,
        vocalState: "idleOnce",
        altVocalState: "hop",
        calmGestures: ["nod", "pose"],
        affectionGestures: ["twirl", "nod"],
        greetGestures: ["nod", "pose"],
        settleGestures: ["rotate", "nod"],
        signature: { state: "twirl", minPlay: 0.34, label: "Twirling happily on muddy paws" },
        loafAnim: "EventSleep",
        sleepAnim: "Sleep",
        wakeState: "wake",
        pantState: "deepBreath",
        northWatch: true,
        gait: { amble: 0.46, trot: 0.90, scamper: 1.48 },
        perchAffinity: 0.60,
        windowWatchAffinity: 1.20
    },
    munchlax: {
        displayName: "Munchlax",
        biome: "Sunlit Meadow",
        blurb: "Berry connoisseur and champion napper with an unhurried waddle.",
        nocturnalAffinity: false,
        standMode: "hold0",
        idleSpeed: 0.48,
        vocalState: "idleOnce",
        altVocalState: "pose",
        calmGestures: ["nod", "pose"],
        affectionGestures: ["twirl", "nod"],
        greetGestures: ["nod"],
        settleGestures: ["nod"],
        signature: { state: "eat", minPlay: 0.32, label: "Rummaging its fur for a hidden snack" },
        loafAnim: "EventSleep",
        sleepAnim: "Sleep",
        wakeState: "wake",
        pantState: "deepBreath",
        northWatch: true,
        gait: { amble: 0.36, trot: 0.72, scamper: 1.24 },
        perchAffinity: 0.25,
        windowWatchAffinity: 1.05
    },
    phantump: {
        displayName: "Phantump",
        biome: "Moonlit Woods",
        blurb: "Gentle forest-stump spirit that hovers quietly near quiet corners.",
        nocturnalAffinity: true,
        standMode: "loop",
        idleSpeed: 0.52,
        vocalState: "spAttack",
        altVocalState: "rotate",
        calmGestures: ["rotate"],
        affectionGestures: ["rotate", "spAttack"],
        greetGestures: ["rotate"],
        settleGestures: ["rotate"],
        signature: { state: "spAttack", minPlay: 0.34, label: "Glowing with forest-spirit light" },
        loafAnim: "Sleep",
        sleepAnim: "Sleep",
        wakeState: "rotate",
        pantState: "",
        northWatch: false,
        gait: { amble: 0.44, trot: 0.82, scamper: 1.34 },
        perchAffinity: 0.95,
        windowWatchAffinity: 1.15
    },
    pikachu: {
        displayName: "Pikachu",
        biome: "Sunlit Meadow",
        blurb: "Lively electric partner that loves tag chases, music, and window ledges.",
        nocturnalAffinity: false,
        standMode: "hold0", // Frames 1-5 leap upward cheering
        idleSpeed: 0.56,
        vocalState: "idleOnce",
        altVocalState: "hop",
        calmGestures: ["nod", "pose"],
        affectionGestures: ["pose", "rotate"],
        greetGestures: ["nod", "pose"],
        settleGestures: ["rotate", "nod"],
        signature: { state: "shock", minPlay: 0.42, label: "Crackling tiny sparks across its cheeks" },
        loafAnim: "EventSleep",
        sleepAnim: "Sleep",
        wakeState: "wake",
        pantState: "deepBreath",
        northWatch: true,
        gait: { amble: 0.56, trot: 1.08, scamper: 1.80 },
        perchAffinity: 1.30,
        windowWatchAffinity: 1.20
    },
    riolu: {
        displayName: "Riolu",
        biome: "Starlight Loft",
        blurb: "Attentive aura pup that shadows focused coding sessions and spars playfully.",
        nocturnalAffinity: false,
        standMode: "hold0",
        idleSpeed: 0.55,
        vocalState: "rearUp",
        altVocalState: "idleOnce",
        calmGestures: ["nod", "pose"],
        affectionGestures: ["pose", "rearUp"],
        greetGestures: ["nod", "pose"],
        settleGestures: ["nod"],
        signature: { state: "quickStrike", minPlay: 0.38, label: "Practicing crisp aura footwork" },
        loafAnim: "EventSleep",
        sleepAnim: "Sleep",
        wakeState: "wake",
        pantState: "deepBreath",
        northWatch: true,
        gait: { amble: 0.58, trot: 1.10, scamper: 1.76 },
        perchAffinity: 1.10,
        windowWatchAffinity: 1.35
    },
    rowlet: {
        displayName: "Rowlet",
        biome: "Moonlit Woods",
        blurb: "Round, sleepy owl that perches atop window frames and ruffles its feathers.",
        nocturnalAffinity: true,
        standMode: "hold0", // Frames 1-5 flutter-hop
        idleSpeed: 0.50,
        vocalState: "idleOnce",
        altVocalState: "dance",
        calmGestures: ["shake", "nod"],
        affectionGestures: ["dance", "shake"],
        greetGestures: ["nod", "shake"],
        settleGestures: ["shake", "nod"],
        signature: { state: "dance", minPlay: 0.32, label: "Bobbing in a sleepy owl dance" },
        loafAnim: "EventSleep",
        sleepAnim: "Sleep",
        wakeState: "wake",
        pantState: "deepBreath",
        northWatch: true,
        gait: { amble: 0.44, trot: 0.86, scamper: 1.44 },
        perchAffinity: 1.70,
        windowWatchAffinity: 1.25
    },
    shiftry: {
        displayName: "Shiftry",
        biome: "Moonlit Woods",
        blurb: "Calm canopy guardian that fans gentle breezes and enjoys high ledges.",
        nocturnalAffinity: false,
        standMode: "hold0", // Full Idle waves leaf fans purposefully
        idleSpeed: 0.55,
        vocalState: "idleOnce",
        altVocalState: "hop",
        calmGestures: ["idleOnce", "rotate"],
        affectionGestures: ["idleOnce", "rotate"],
        greetGestures: ["idleOnce"],
        settleGestures: ["rotate"],
        signature: { state: "idleOnce", minPlay: 0.32, label: "Fanning a quiet breeze" },
        loafAnim: "Sleep",
        sleepAnim: "Sleep",
        wakeState: "idleOnce",
        pantState: "",
        northWatch: false,
        gait: { amble: 0.48, trot: 0.92, scamper: 1.50 },
        perchAffinity: 1.20,
        windowWatchAffinity: 1.05
    },
    sprigatito: {
        displayName: "Sprigatito",
        biome: "Sunlit Meadow",
        blurb: "Curious desktop cat that perches on titlebars, chases cursors, and kneads paws.",
        nocturnalAffinity: false,
        standMode: "hold0", // Frames 1-6 hop/meow
        idleSpeed: 0.54,
        vocalState: "idleOnce",
        altVocalState: "appeal",
        calmGestures: ["nod", "pose"],
        affectionGestures: ["appeal", "rotate"],
        greetGestures: ["appeal", "nod"],
        settleGestures: ["rotate", "nod"],
        signature: { state: "appeal", minPlay: 0.32, label: "Kneading paws and grooming its whiskers" },
        loafAnim: "EventSleep",
        sleepAnim: "Sleep",
        wakeState: "wake",
        pantState: "deepBreath",
        northWatch: true,
        gait: { amble: 0.54, trot: 1.04, scamper: 1.74 },
        perchAffinity: 1.65,
        windowWatchAffinity: 1.30
    },
    toxapex: {
        displayName: "Toxapex",
        biome: "Tidepool Cove",
        blurb: "Unbothered reef hermit that bunkers inside its spiked shell dome.",
        nocturnalAffinity: false,
        standMode: "loop",
        idleSpeed: 0.50,
        vocalState: "hop",
        altVocalState: "hide",
        calmGestures: ["hide"],
        affectionGestures: ["hide", "hop"],
        greetGestures: ["hide"],
        settleGestures: ["hide"],
        signature: { state: "hide", minPlay: 0.24, label: "Bunkering inside its spiked shell" },
        loafAnim: "Withdraw",
        sleepAnim: "Sleep",
        wakeState: "hide",
        pantState: "",
        northWatch: false,
        gait: { amble: 0.34, trot: 0.66, scamper: 1.10 },
        perchAffinity: 0.30,
        windowWatchAffinity: 0.90
    },
    umbreon: {
        displayName: "Umbreon",
        biome: "Moonlit Woods",
        blurb: "Nocturnal moonlit companion whose rings glow softly during late-night watches.",
        nocturnalAffinity: true,
        standMode: "hold0", // Frames 1-13 rear up in a shiver/howl
        idleSpeed: 0.50,
        vocalState: "idleOnce",
        altVocalState: "emit",
        calmGestures: ["nod", "pose"],
        affectionGestures: ["emit", "nod"],
        greetGestures: ["nod", "emit"],
        settleGestures: ["rotate", "nod"],
        signature: { state: "emit", minPlay: 0.36, label: "Pulsing its golden moonlight rings" },
        loafAnim: "EventSleep",
        sleepAnim: "Sleep",
        wakeState: "wake",
        pantState: "deepBreath",
        northWatch: true,
        gait: { amble: 0.50, trot: 0.96, scamper: 1.60 },
        perchAffinity: 1.15,
        windowWatchAffinity: 1.38
    },
    vulpix: {
        displayName: "Vulpix",
        biome: "Warm Hearth",
        blurb: "Cozy six-tailed fox that curls up near active windows for warmth.",
        nocturnalAffinity: false,
        standMode: "hold0",
        idleSpeed: 0.52,
        vocalState: "idleOnce",
        altVocalState: "rearUp",
        calmGestures: ["nod", "pose"],
        affectionGestures: ["appeal", "rotate"],
        greetGestures: ["appeal", "nod"],
        settleGestures: ["rotate", "nod"],
        signature: { state: "appeal", minPlay: 0.36, label: "Fluffing its six warm tails" },
        loafAnim: "EventSleep",
        sleepAnim: "Sleep",
        wakeState: "wake",
        pantState: "deepBreath",
        northWatch: true,
        gait: { amble: 0.50, trot: 0.98, scamper: 1.64 },
        perchAffinity: 0.95,
        windowWatchAffinity: 1.28
    },
    whimsicott: {
        displayName: "Whimsicott",
        biome: "Sunlit Meadow",
        blurb: "Breezy cotton-puff sprite that rides window ledges and drifts in spins.",
        nocturnalAffinity: false,
        standMode: "hold0", // Full Idle is a 7px cotton bounce reserved for intentional gestures
        idleSpeed: 0.58,
        vocalState: "idleOnce",
        altVocalState: "hop",
        calmGestures: ["idleOnce", "rotate"],
        affectionGestures: ["idleOnce", "rotate"],
        greetGestures: ["idleOnce", "hop"],
        settleGestures: ["rotate"],
        signature: { state: "rotate", minPlay: 0.28, label: "Drifting in a dandelion spin" },
        loafAnim: "Sleep",
        sleepAnim: "Sleep",
        wakeState: "idleOnce",
        pantState: "",
        northWatch: false,
        gait: { amble: 0.50, trot: 0.94, scamper: 1.52 },
        perchAffinity: 1.45,
        windowWatchAffinity: 1.05
    },
    wooper: {
        displayName: "Wooper",
        biome: "Tidepool Cove",
        blurb: "Pure unbothered joy that waddles around calmly with a permanent smile.",
        nocturnalAffinity: false,
        standMode: "loop",
        idleSpeed: 0.46,
        vocalState: "pose",
        altVocalState: "hop",
        calmGestures: ["nod", "pose"],
        affectionGestures: ["twirl", "nod"],
        greetGestures: ["nod", "twirl"],
        settleGestures: ["nod"],
        signature: { state: "twirl", minPlay: 0.30, label: "Spinning with an unbothered grin" },
        loafAnim: "EventSleep",
        sleepAnim: "Sleep",
        wakeState: "wake",
        pantState: "deepBreath",
        northWatch: true,
        gait: { amble: 0.40, trot: 0.78, scamper: 1.32 },
        perchAffinity: 0.45,
        windowWatchAffinity: 1.15
    },
    zorua: {
        displayName: "Zorua",
        biome: "Moonlit Woods",
        blurb: "Playful illusionist fox that watches your code and pranks companions.",
        nocturnalAffinity: true,
        illusionCapable: true,
        standMode: "hold0", // Idle frames 1-3 are a double bark; frame 0 stands silently
        idleSpeed: 0.55,
        vocalState: "idleOnce",
        altVocalState: "pose", // Pose throws head up in a howl/yip
        calmGestures: ["nod"],
        affectionGestures: ["nod", "rotate"],
        greetGestures: ["nod"],
        settleGestures: ["rotate", "nod"],
        signature: { state: "sink", minPlay: 0.42, label: "Melting into an illusion shadow" },
        loafAnim: "EventSleep",
        sleepAnim: "Sleep",
        wakeState: "wake",
        pantState: "deepBreath",
        northWatch: true,
        gait: { amble: 0.54, trot: 1.00, scamper: 1.68 },
        perchAffinity: 0.70,
        windowWatchAffinity: 1.30
    }
};

var DEFAULT_PROFILE = {
    displayName: "Companion",
    biome: "Sunlit Meadow",
    blurb: "Quiet desktop companion.",
    nocturnalAffinity: false,
    illusionCapable: false,
    standMode: "hold0",
    idleSpeed: 0.55,
    vocalState: "nod",
    altVocalState: "hop",
    calmGestures: ["nod", "rotate"],
    affectionGestures: ["nod", "rotate"],
    greetGestures: ["nod"],
    settleGestures: ["rotate"],
    signature: { state: "rotate", minPlay: 0.45, label: "Stretching out" },
    loafAnim: "EventSleep",
    sleepAnim: "Sleep",
    wakeState: "wake",
    pantState: "deepBreath",
    northWatch: false,
    gait: { amble: 0.50, trot: 1.00, scamper: 1.60 },
    perchAffinity: 1.00,
    windowWatchAffinity: 1.00
};

function profileFor(species) {
    return (species && PROFILES[species]) ? PROFILES[species] : DEFAULT_PROFILE;
}

function speciesOf(pet) {
    if (pet && pet.illusionSpecies) return pet.illusionSpecies;
    return (pet && pet.petData && pet.petData.sprite) ? pet.petData.sprite : "";
}

function trueSpeciesOf(pet) {
    return (pet && pet.petData && pet.petData.sprite) ? pet.petData.sprite : "";
}

function standSpec(species) {
    var p = profileFor(species);
    return { mode: p.standMode, speed: p.idleSpeed };
}

function loafAnimName(species, anims) {
    var p = profileFor(species);
    if (anims && anims[p.loafAnim]) return p.loafAnim;
    if (anims && anims.EventSleep) return "EventSleep";
    if (anims && anims.Sleep) return "Sleep";
    return "Idle";
}

function canWatchNorth(pet) {
    var p = profileFor(speciesOf(pet));
    if (!p.northWatch) return false;
    var anims = pet && pet.sprite ? pet.sprite._animData : null;
    return !anims || (!!anims.Sit && !!anims.LookUp);
}

function vocalStateFor(pet, excited) {
    var p = profileFor(speciesOf(pet));
    if (excited && p.altVocalState) return p.altVocalState;
    return p.vocalState || "nod";
}

function calmGesturesFor(pet) {
    return profileFor(speciesOf(pet)).calmGestures.slice();
}

function affectionGesturesFor(pet) {
    return profileFor(speciesOf(pet)).affectionGestures.slice();
}

function greetGesturesFor(pet) {
    return profileFor(speciesOf(pet)).greetGestures.slice();
}

function settleGesturesFor(pet) {
    return profileFor(speciesOf(pet)).settleGestures.slice();
}

function wakeStateFor(pet) {
    return profileFor(speciesOf(pet)).wakeState || "wake";
}

function pantStateFor(pet) {
    var p = profileFor(speciesOf(pet));
    var anims = pet && pet.sprite ? pet.sprite._animData : null;
    if (p.pantState && (!anims || anims.DeepBreath)) return p.pantState;
    return "";
}

function gaitMultiplier(pet, gaitName) {
    var g = profileFor(speciesOf(pet)).gait;
    if (gaitName === "amble") return g.amble;
    if (gaitName === "scamper") return g.scamper;
    return g.trot;
}
