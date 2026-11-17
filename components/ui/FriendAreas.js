.pragma library

var DEFAULT_AREA = "shore";

var AREA_LIST = [
    {
        id: "shore",
        label: "Treasure Shore",
        worldWidth: 552,
        worldHeight: 344,
        hasSky: false,
        baseMap: "camps/shore.png",
        foregroundMap: "",
        underlayAnim: {
            src: "camps/shore_waves.png",
            wx: 0,
            wy: 200,
            fw: 552,
            fh: 144,
            frames: 10,
            rate: 2,
            vertical: true
        },
        overlayAnim: null,
        walkBounds: { minX: 162, maxX: 386, minY: 88, maxY: 214 },
        props: [
            { src: "props/tent.png", wx: 384, wy: 18, fw: 80, fh: 80, frames: 1, rate: 1, footY: 98, obs: [380, 56, 466, 104] },
            { src: "props/bell_sign.png", wx: 152, wy: 36, fw: 32, fh: 32, frames: 4, rate: 2, footY: 68, obs: [148, 48, 188, 74] },
            { src: "props/flowers_yellow.png", wx: 124, wy: 52, fw: 32, fh: 32, frames: 10, rate: 2, footY: 82, obs: [120, 60, 158, 86] },
            { src: "props/flowers_pink.png", wx: 344, wy: 48, fw: 32, fh: 32, frames: 10, rate: 2, footY: 78, obs: [340, 56, 378, 84] },
            { src: "props/stump_chair.png", wx: 124, wy: 128, fw: 16, fh: 16, frames: 1, rate: 1, footY: 144, obs: [120, 118, 192, 160] },
            { src: "props/stump_table.png", wx: 140, wy: 108, fw: 48, fh: 48, frames: 1, rate: 1, footY: 155, obs: null },
            { src: "props/berry_basket_blue.png", wx: 154, wy: 115, fw: 20, fh: 20, frames: 1, rate: 1, footY: 156, obs: null },
            { src: "props/campfire.png", wx: 260, wy: 134, fw: 32, fh: 32, frames: 1, rate: 1, footY: 165, obs: [252, 138, 298, 170] },
            { src: "props/campfire_flame.png", wx: 264, wy: 134, fw: 24, fh: 24, frames: 6, rate: 1, footY: 166, obs: null }
        ]
    },
    {
        id: "forest",
        label: "Whispering Woods",
        worldWidth: 552,
        worldHeight: 344,
        hasSky: false,
        baseMap: "camps/forest.png",
        foregroundMap: "camps/forest_front.png",
        underlayAnim: null,
        overlayAnim: null,
        walkBounds: { minX: 138, maxX: 374, minY: 118, maxY: 264 },
        props: [
            { src: "props/hut.png", wx: 256, wy: 6, fw: 112, fh: 112, frames: 1, rate: 1, footY: 114, obs: [250, 66, 370, 122] },
            { src: "props/logs.png", wx: 122, wy: 68, fw: 40, fh: 40, frames: 1, rate: 1, footY: 108, obs: [118, 80, 166, 114] },
            { src: "props/berry_basket_red.png", wx: 144, wy: 148, fw: 24, fh: 24, frames: 1, rate: 1, footY: 172, obs: [140, 148, 210, 180] },
            { src: "props/campfire.png", wx: 172, wy: 142, fw: 32, fh: 32, frames: 1, rate: 1, footY: 173, obs: null },
            { src: "props/campfire_flame.png", wx: 176, wy: 142, fw: 24, fh: 24, frames: 6, rate: 1, footY: 174, obs: null },
            { src: "props/flowers_yellow.png", wx: 124, wy: 198, fw: 32, fh: 32, frames: 10, rate: 2, footY: 228, obs: [120, 206, 158, 232] },
            { src: "props/flowers_pink.png", wx: 346, wy: 186, fw: 32, fh: 32, frames: 10, rate: 2, footY: 216, obs: [342, 194, 380, 222] }
        ]
    },
    {
        id: "cliff",
        label: "Skyline Bluff",
        worldWidth: 552,
        worldHeight: 344,
        hasSky: true,
        baseMap: "camps/cliff.png",
        foregroundMap: "",
        underlayAnim: null,
        overlayAnim: null,
        walkBounds: { minX: 114, maxX: 432, minY: 178, maxY: 266 },
        props: [
            { src: "props/tent.png", wx: 346, wy: 98, fw: 80, fh: 80, frames: 1, rate: 1, footY: 178, obs: [342, 138, 430, 184] },
            { src: "props/flowers_yellow.png", wx: 278, wy: 138, fw: 32, fh: 32, frames: 10, rate: 2, footY: 168, obs: [274, 148, 312, 174] },
            { src: "props/stump_chair.png", wx: 144, wy: 164, fw: 16, fh: 16, frames: 1, rate: 1, footY: 180, obs: [140, 154, 212, 196] },
            { src: "props/stump_table.png", wx: 160, wy: 144, fw: 48, fh: 48, frames: 1, rate: 1, footY: 190, obs: null },
            { src: "props/berry_basket_blue.png", wx: 174, wy: 151, fw: 20, fh: 20, frames: 1, rate: 1, footY: 191, obs: null },
            { src: "props/sign.png", wx: 84, wy: 190, fw: 40, fh: 40, frames: 1, rate: 1, footY: 221, obs: [80, 198, 126, 226] },
            { src: "props/flowers_pink.png", wx: 220, wy: 266, fw: 32, fh: 32, frames: 10, rate: 2, footY: 296, obs: [216, 270, 256, 298] }
        ]
    },
    {
        id: "spring",
        label: "Luminous Spring",
        worldWidth: 552,
        worldHeight: 344,
        hasSky: false,
        baseMap: "camps/spring.png",
        foregroundMap: "",
        underlayAnim: null,
        overlayAnim: {
            src: "camps/spring_waterfall.png",
            wx: 240,
            wy: 0,
            fw: 72,
            fh: 60,
            frames: 3,
            rate: 1,
            vertical: true
        },
        walkBounds: { minX: 196, maxX: 350, minY: 238, maxY: 278 },
        props: [
            { src: "props/bell_sign.png", wx: 168, wy: 224, fw: 32, fh: 32, frames: 4, rate: 2, footY: 256, obs: [164, 234, 204, 260] },
            { src: "props/berry_basket_blue.png", wx: 354, wy: 244, fw: 20, fh: 20, frames: 1, rate: 1, footY: 264, obs: [348, 244, 378, 268] },
            { src: "props/flowers_pink.png", wx: 162, wy: 272, fw: 32, fh: 32, frames: 10, rate: 2, footY: 302, obs: [158, 276, 198, 304] },
            { src: "props/flowers_yellow.png", wx: 358, wy: 274, fw: 32, fh: 32, frames: 10, rate: 2, footY: 304, obs: [354, 276, 392, 304] }
        ]
    }
];

var AREA_MAP = {};
for (var i = 0; i < AREA_LIST.length; i++) {
    AREA_MAP[AREA_LIST[i].id] = AREA_LIST[i];
}

function isValidArea(id) {
    return !!(id && AREA_MAP[id]);
}

function areaFor(id) {
    return (id && AREA_MAP[id]) ? AREA_MAP[id] : AREA_MAP[DEFAULT_AREA];
}

function nextAreaId(id) {
    for (var i = 0; i < AREA_LIST.length; i++) {
        if (AREA_LIST[i].id === id) {
            return AREA_LIST[(i + 1) % AREA_LIST.length].id;
        }
    }
    return DEFAULT_AREA;
}
