const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadQmlJs, rootDir } = require("./loadQmlJs");

const SpeciesProfile = loadQmlJs("components/SpeciesProfile.js");
const SpriteSheet = loadQmlJs("components/SpriteSheet.js");
const Abilities = loadQmlJs("components/behavior/Abilities.js");

function pngDims(filePath) {
    const buf = fs.readFileSync(filePath);
    assert.equal(buf.readUInt32BE(0), 0x89504e47, `${filePath} must be PNG`);
    return {
        width: buf.readUInt32BE(16),
        height: buf.readUInt32BE(20)
    };
}

const spritesRoot = path.join(rootDir, "assets/sprites");
const assetDirs = fs.readdirSync(spritesRoot)
    .filter(d => fs.statSync(path.join(spritesRoot, d)).isDirectory())
    .sort();
assert.deepEqual(
    assetDirs,
    Array.from(SpriteSheet.SPECIES_LIST),
    "assets/sprites directories must match SPECIES_LIST 1-to-1"
);

function parseSpeciesAnims(species) {
    const xml = fs.readFileSync(path.join(spritesRoot, species, "AnimData.xml"), "utf8");
    return SpriteSheet.parseAnimData(xml).anims;
}

const zoruaIdleClip = SpriteSheet.resolveClip("idle", parseSpeciesAnims("zorua"), {}, "zorua");
assert.equal(zoruaIdleClip.holdAtFrame, 0, "Zorua stands on frame 0 without looping bark frames");

const absolIdleClip = SpriteSheet.resolveClip("idle", parseSpeciesAnims("absol"), {}, "absol");
assert.equal(absolIdleClip.holdAtFrame, 0, "Absol stands on frame 0 without looping cry frame");

const infernapeIdleClip = SpriteSheet.resolveClip("idle", parseSpeciesAnims("infernape"), {}, "infernape");
assert.equal(infernapeIdleClip.startFrame, 0, "Infernape starts at frame 0");
assert.equal(infernapeIdleClip.endFrame, 9, "Infernape loops calm crown-fire frames 0..9");
assert.equal(infernapeIdleClip.holdAtFrame, -1, "Infernape loops prefix slice continuously");

const toxAnims = parseSpeciesAnims("toxapex");
const toxLoafClip = SpriteSheet.resolveClip("loaf", toxAnims, {}, "toxapex");
assert.equal(toxLoafClip.animName, "Withdraw", "Toxapex loafs in Withdraw");
assert.equal(toxLoafClip.holdAtFrame, 5, "Toxapex holds closed shell dome at frame 5");
const toxWakeClip = SpriteSheet.resolveClip("wake", toxAnims, {}, "toxapex");
assert.equal(toxWakeClip.animName, "Withdraw", "Toxapex wakes via Withdraw pop-out slice");
assert.equal(toxWakeClip.startFrame, 6, "Toxapex wake starts at shell-opening frame 6");

const eeveeAnims = parseSpeciesAnims("eevee");
const eeveeHeadClip = SpriteSheet.resolveClip("head", eeveeAnims, {}, "eevee");
assert.equal(eeveeHeadClip.animName, "Head", "Eevee resolves dormant Head sheet");
assert.ok(eeveeHeadClip.endHoldTicks >= 18, "Single-frame Head pose holds cleanly");
const eeveePullClip = SpriteSheet.resolveClip("pull", eeveeAnims, {}, "eevee");
assert.equal(eeveePullClip.animName, "Pull", "Eevee resolves dormant Pull sheet");
const eeveeLayingClip = SpriteSheet.resolveClip("laying", eeveeAnims, {}, "eevee");
assert.equal(eeveeLayingClip.animName, "Laying", "Eevee resolves dormant Laying sheet");
assert.equal(eeveeLayingClip.loop, true, "Laying posture loops cleanly");
assert.ok(SpeciesProfile.nuzzleGesturesFor("eevee").includes("head"), "nuzzleGesturesFor prioritizes head nuzzle");

const emojiRegex = /[\p{Extended_Pictographic}]/u;

let totalAnimsVerified = 0;
for (const species of SpriteSheet.SPECIES_LIST) {
    assert.ok(SpeciesProfile.PROFILES[species], `Explicit SpeciesProfile required for ${species}`);
    assert.ok(SpriteSheet.SPECIES_TEMPERAMENT[species], `Temperament required for ${species}`);
    const prof = SpeciesProfile.profileFor(species);
    assert.ok(SpeciesProfile.BIOME_MAP[prof.biome], `${species} biome '${prof.biome}' must be registered`);
    if (prof.kinGroup) {
        assert.ok(SpeciesProfile.KIN_GROUPS[prof.kinGroup], `${species} kinGroup '${prof.kinGroup}' must be registered`);
    }
    for (const abId of prof.abilities) {
        assert.ok(Abilities.abilityDef(abId), `${species} ability '${abId}' must be registered in Abilities.js`);
    }
    assert.ok(!emojiRegex.test(prof.blurb), `${species} blurb must be emoji-free`);
    assert.ok(!emojiRegex.test(prof.signature.label), `${species} signature label must be emoji-free`);

    const spDir = path.join(spritesRoot, species);
    assert.ok(fs.existsSync(path.join(spDir, "credits.txt")), `${species} must include PMDCollab credits.txt`);
    for (const file of fs.readdirSync(spDir)) {
        assert.ok(
            !file.endsWith("-Offsets.png") && !file.endsWith("-Shadow.png"),
            `${species}/${file} unused PNG bloat must not be committed`
        );
    }

    const xml = fs.readFileSync(path.join(spDir, "AnimData.xml"), "utf8");
    const parsed = SpriteSheet.parseAnimData(xml);
    assert.ok(parsed.anims.Walk, `${species} must resolve Walk animation`);
    assert.ok(parsed.shadowSize >= 0 && parsed.shadowSize <= 4, `${species} shadowSize in range`);

    for (const [animName, anim] of Object.entries(parsed.anims)) {
        assert.ok(!anim.copyOf, `${species}:${animName} CopyOf must be resolved`);
        assert.ok(anim.frameWidth > 0 && anim.frameHeight > 0, `${species}:${animName} positive frame size`);
        assert.equal(anim.durations.length, anim.frameCount, `${species}:${animName} frameCount matches durations`);
        const pngPath = path.join(spDir, `${anim.sheet}-Anim.png`);
        assert.ok(fs.existsSync(pngPath), `${species}:${animName} sheet ${anim.sheet}-Anim.png exists`);
        const dims = pngDims(pngPath);
        const cols = Math.floor(dims.width / anim.frameWidth);
        const rows = Math.floor(dims.height / anim.frameHeight);
        assert.ok(cols >= anim.frameCount, `${species}:${animName} PNG cols (${cols}) >= frameCount (${anim.frameCount})`);
        assert.ok(rows === 1 || rows === 8, `${species}:${animName} PNG rows (${rows}) is 1 or 8`);
        totalAnimsVerified++;
    }

    for (const state of Object.keys(SpriteSheet.DEFAULT_STATE_MAP)) {
        const clip = SpriteSheet.resolveClip(state, parsed.anims, {}, species);
        const anim = parsed.anims[clip.animName];
        assert.ok(anim, `${species} state '${state}' resolved to '${clip.animName}' which exists`);
        assert.ok(clip.startFrame >= 0 && clip.startFrame < anim.frameCount, `${species}:${state} startFrame in bounds`);
        assert.ok(clip.endFrame >= clip.startFrame && clip.endFrame < anim.frameCount, `${species}:${state} endFrame in bounds`);
        if (clip.holdAtFrame >= 0) {
            assert.ok(
                clip.holdAtFrame >= clip.startFrame && clip.holdAtFrame <= clip.endFrame,
                `${species}:${state} holdAtFrame in slice bounds`
            );
        }
    }

    assert.equal(
        SpriteSheet.resolveAnimName("zoomies", parsed.anims, {}, species),
        "Walk",
        `${species} zoomies uses 8-direction Walk rather than stationary Charge`
    );

    const loafResolved = SpriteSheet.resolveAnimName("loaf", parsed.anims, {}, species);
    assert.equal(loafResolved, prof.loafAnim, `${species} loaf resolves to species loafAnim '${prof.loafAnim}'`);
    assert.ok(parsed.anims[loafResolved], `${species} loaf animation '${loafResolved}' exists`);

    const profileStates = [
        ...prof.calmGestures,
        ...prof.affectionGestures,
        ...prof.greetGestures,
        ...prof.settleGestures,
        ...prof.sparMoves,
        ...prof.showOffMoves,
        ...prof.dodgeMoves,
        ...prof.standoffMoves,
        ...prof.dismissMoves,
        prof.vocalState,
        prof.altVocalState,
        prof.wakeState,
        prof.signature.state
    ].filter(Boolean);
    for (const st of profileStates) {
        const resolved = SpriteSheet.resolveAnimName(st, parsed.anims, {}, species);
        assert.ok(parsed.anims[resolved], `${species} profile state '${st}' resolves to '${resolved}'`);
    }

    for (const calmState of ["nod", "pose", "deepBreath", "eat", "loaf"]) {
        const resolved = SpriteSheet.resolveAnimName(calmState, parsed.anims, {}, species);
        assert.ok(
            resolved !== "Hop" && resolved !== "Sit",
            `${species} state '${calmState}' must not fall back to ${resolved}`
        );
    }
}

assert.equal(SpriteSheet.angleToDirectionRow(0), 2);
assert.equal(SpriteSheet.angleToDirectionRow(Math.PI / 2), 0);
assert.equal(SpriteSheet.angleToDirectionRow(Math.PI), 6);
assert.equal(SpriteSheet.angleToDirectionRow(-Math.PI / 2), 4);
assert.equal(SpriteSheet.angleToDirectionRow(Math.PI / 4), 1);
assert.equal(SpriteSheet.angleToDirectionRow((3 * Math.PI) / 4), 7);

const qmlFiles = [
    path.join(rootDir, "shell.qml"),
    ...["config", "services", "components"].flatMap(dir =>
        fs.readdirSync(path.join(rootDir, dir))
            .filter(f => f.endsWith(".qml"))
            .map(f => path.join(rootDir, dir, f))
    )
];
for (const qmlPath of qmlFiles) {
    const src = fs.readFileSync(qmlPath, "utf8");
    const props = new Set();
    for (const m of src.matchAll(/^\s{4}(?:(?:readonly|required|default)\s+)*property\s+\S+\s+([A-Za-z_]\w*)/gm)) {
        props.add(m[1]);
    }
    for (const m of src.matchAll(/^\s{4}signal\s+([A-Za-z_]\w*)/gm)) {
        const sig = m[1];
        if (sig.endsWith("Changed")) {
            const base = sig.slice(0, -"Changed".length);
            assert.ok(!props.has(base), `${path.basename(qmlPath)}: signal '${sig}' collides with property '${base}'`);
        }
    }
}

console.log(`Sprite verification passed: ${SpriteSheet.SPECIES_LIST.length} species, ${totalAnimsVerified} animations verified.`);
