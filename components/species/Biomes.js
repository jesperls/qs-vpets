.pragma library

var BIOME_LIST = [
    {
        id: "Sunlit Meadow",
        shortLabel: "Meadow",
        icon: "leaf"
    },
    {
        id: "Moonlit Woods",
        shortLabel: "Woods",
        icon: "moon"
    },
    {
        id: "Warm Hearth",
        shortLabel: "Hearth",
        icon: "sun"
    },
    {
        id: "Shadow Hollow",
        shortLabel: "Hollow",
        icon: "dream"
    },
    {
        id: "Tidepool Cove",
        shortLabel: "Tidepool",
        icon: "compass"
    },
    {
        id: "Starlight Loft",
        shortLabel: "Loft",
        icon: "spark"
    }
];

var BIOME_MAP = {};
for (var i = 0; i < BIOME_LIST.length; i++) {
    BIOME_MAP[BIOME_LIST[i].id] = BIOME_LIST[i];
}

var KIN_GROUPS = {
    eeveelution: { label: "Eevee Kin", affinityBonus: 0.09, respectBonus: 0.04 },
    aura_kin: { label: "Aura & Focus Kin", affinityBonus: 0.06, respectBonus: 0.10 },
    ghost_hollow: { label: "Hollow Spirits", affinityBonus: 0.08, respectBonus: 0.04 },
    marsh_pals: { label: "Tidepool Kin", affinityBonus: 0.08, respectBonus: 0.03 },
    sky_flock: { label: "Canopy & Sky Kin", affinityBonus: 0.06, respectBonus: 0.05 },
    hearth_kin: { label: "Hearth Kin", affinityBonus: 0.07, respectBonus: 0.04 },
    forest_kin: { label: "Woodland Kin", affinityBonus: 0.06, respectBonus: 0.04 },
    forager_kin: { label: "Meadow Foragers", affinityBonus: 0.07, respectBonus: 0.02 }
};
