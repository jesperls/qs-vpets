const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.resolve(__dirname, "..");

function loadQmlJs(relPath, injected = {}) {
    const full = path.join(rootDir, relPath);
    const dir = path.dirname(relPath);
    let src = fs.readFileSync(full, "utf8");
    const imports = {};
    src = src.replace(/^\.import\s+"([^"]+)"\s+as\s+([A-Za-z0-9_]+)\s*$/gm, (_, impPath, alias) => {
        imports[alias] = loadQmlJs(path.join(dir, impPath));
        return "";
    });
    const ctx = Object.assign({ Math, Date, Number, Object, Array, JSON, parseInt, parseFloat, console }, imports, injected);
    vm.createContext(ctx);
    vm.runInContext(src, ctx, { filename: relPath });
    return ctx;
}

const SpeciesProfile = loadQmlJs("components/SpeciesProfile.js");
const SpriteSheet = loadQmlJs("components/SpriteSheet.js");

function pngDims(filePath) {
    const buf = fs.readFileSync(filePath);
    assert.equal(buf.readUInt32BE(0), 0x89504e47, `${filePath} must be PNG`);
    return {
        width: buf.readUInt32BE(16),
        height: buf.readUInt32BE(20)
    };
}

assert.equal(SpeciesProfile.standSpec("zorua").mode, "hold0", "Zorua stands on frame 0 without looping bark frames");
assert.equal(SpeciesProfile.standSpec("absol").mode, "hold0", "Absol stands on frame 0 without looping cry frame");
assert.equal(SpeciesProfile.standSpec("grovyle").mode, "hold0", "Grovyle stands on frame 0 without battle crouch");
assert.equal(SpeciesProfile.standSpec("whimsicott").mode, "hold0", "Whimsicott reserves cotton bounce for gestures");
assert.equal(SpeciesProfile.standSpec("shiftry").mode, "hold0", "Shiftry reserves leaf-fan wave for gestures");
assert.equal(SpeciesProfile.standSpec("infernape").mode, "prefix10", "Infernape loops calm crown-fire frames 0..9");

let totalAnimsVerified = 0;
for (const species of SpriteSheet.SPECIES_LIST) {
    assert.ok(SpeciesProfile.PROFILES[species], `Explicit SpeciesProfile required for ${species}`);
    const prof = SpeciesProfile.profileFor(species);
    const spDir = path.join(rootDir, "assets/sprites", species);
    assert.ok(fs.existsSync(spDir), `Missing species dir: ${species}`);
    const xml = fs.readFileSync(path.join(spDir, "AnimData.xml"), "utf8");
    const parsed = SpriteSheet.parseAnimData(xml);
    assert.ok(parsed.anims.Walk, `${species} must resolve Walk animation`);
    assert.ok(parsed.shadowSize >= 0 && parsed.shadowSize <= 3, `${species} shadowSize in range`);

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
        const resolved = SpriteSheet.resolveAnimName(state, parsed.anims, {}, species);
        assert.ok(parsed.anims[resolved], `${species} state '${state}' resolved to '${resolved}' which exists`);
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
        prof.vocalState,
        prof.altVocalState,
        prof.wakeState,
        prof.signature.state
    ];
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

console.log(`Sprite verification passed: ${SpriteSheet.SPECIES_LIST.length} species, ${totalAnimsVerified} animations verified.`);
