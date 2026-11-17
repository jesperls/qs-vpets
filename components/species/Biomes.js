.pragma library

var BIOME_LIST = [
    {
        id: "Sunlit Meadow",
        shortLabel: "Meadow",
        icon: "leaf",
        backdrop: "meadow.png",
        turf: "#396340",
        nightTurf: "#264233",
        turfRim: "#5a9160",
        nightTurfRim: "#3f6b52",
        accent: "#8bd496",
        thermalAffinity: true,
        tagline: "Soft clover clearings and warm breezes where easygoing pals roam."
    },
    {
        id: "Moonlit Woods",
        shortLabel: "Woods",
        icon: "moon",
        backdrop: "woods.png",
        turf: "#28443d",
        nightTurf: "#28443d",
        turfRim: "#3c665b",
        nightTurfRim: "#3c665b",
        accent: "#8ec5f0",
        thermalAffinity: false,
        tagline: "Starlit pines where nocturnal tricksters and quiet watchers gather."
    },
    {
        id: "Warm Hearth",
        shortLabel: "Hearth",
        icon: "flame",
        backdrop: "hearth.png",
        turf: "#4d3527",
        nightTurf: "#4d3527",
        turfRim: "#785139",
        nightTurfRim: "#785139",
        accent: "#f3b866",
        thermalAffinity: true,
        tagline: "Toasty embers and sunlit stones favored by warm-hearted companions."
    },
    {
        id: "Shadow Hollow",
        shortLabel: "Hollow",
        icon: "dream",
        backdrop: "hollow.png",
        turf: "#2c2842",
        nightTurf: "#2c2842",
        turfRim: "#4a426e",
        nightTurfRim: "#4a426e",
        accent: "#bba1f2",
        thermalAffinity: false,
        tagline: "Misty twilight glade home to playful spirits and quiet stargazers."
    },
    {
        id: "Tidepool Cove",
        shortLabel: "Tidepool",
        icon: "droplet",
        backdrop: "tidepool.png",
        turf: "#284c47",
        nightTurf: "#284c47",
        turfRim: "#467d75",
        nightTurfRim: "#467d75",
        accent: "#72d1e8",
        thermalAffinity: false,
        tagline: "Calm shore pools and smooth pebbles with a cool sea breeze."
    },
    {
        id: "Starlight Loft",
        shortLabel: "Loft",
        icon: "spark",
        backdrop: "loft.png",
        turf: "#2f3a57",
        nightTurf: "#2f3a57",
        turfRim: "#53648f",
        nightTurfRim: "#53648f",
        accent: "#f2cf7e",
        thermalAffinity: false,
        tagline: "Breezy high perches under drifting clouds and night stars."
    }
];

var BIOME_MAP = {};
for (var i = 0; i < BIOME_LIST.length; i++) {
    BIOME_MAP[BIOME_LIST[i].id] = BIOME_LIST[i];
}

function biomeFor(biomeId, isNight) {
    var entry = BIOME_MAP[biomeId] || BIOME_LIST[0];
    return {
        id: entry.id,
        shortLabel: entry.shortLabel,
        icon: entry.icon,
        backdrop: entry.backdrop,
        turf: isNight ? entry.nightTurf : entry.turf,
        turfRim: isNight ? entry.nightTurfRim : entry.turfRim,
        accent: entry.accent,
        thermalAffinity: entry.thermalAffinity,
        tagline: entry.tagline
    };
}

var KIN_GROUPS = {
    eeveelution: { label: "Eevee Kin", affinityBonus: 0.09, respectBonus: 0.04, rainAffinity: false },
    aura_kin: { label: "Aura & Focus Kin", affinityBonus: 0.06, respectBonus: 0.10, rainAffinity: false },
    ghost_hollow: { label: "Hollow Spirits", affinityBonus: 0.08, respectBonus: 0.04, rainAffinity: false },
    marsh_pals: { label: "Tidepool Kin", affinityBonus: 0.08, respectBonus: 0.03, rainAffinity: true },
    sky_flock: { label: "Canopy & Sky Kin", affinityBonus: 0.06, respectBonus: 0.05, rainAffinity: false },
    hearth_kin: { label: "Hearth Kin", affinityBonus: 0.07, respectBonus: 0.04, rainAffinity: false },
    forest_kin: { label: "Woodland Kin", affinityBonus: 0.06, respectBonus: 0.04, rainAffinity: false },
    forager_kin: { label: "Meadow Foragers", affinityBonus: 0.07, respectBonus: 0.02, rainAffinity: false }
};
