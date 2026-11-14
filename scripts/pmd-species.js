#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT_DIR = path.resolve(__dirname, "..");
const SPRITES_DIR = path.join(ROOT_DIR, "assets", "sprites");
const TRACKER_URL = "https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/tracker.json";
const RAW_BASE = "https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite";

function fetchBuffer(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { "User-Agent": "qs-vpets-species-tool/1.0" } }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                fetchBuffer(res.headers.location).then(resolve, reject);
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                return;
            }
            const chunks = [];
            res.on("data", c => chunks.push(c));
            res.on("end", () => resolve(Buffer.concat(chunks)));
        });
        req.on("error", reject);
    });
}

function parseAnimXml(xml) {
    const anims = {};
    const blocks = xml.match(/<Anim>[\s\S]*?<\/Anim>/g) || [];
    for (const b of blocks) {
        const name = (b.match(/<Name>(.*?)<\/Name>/) || [])[1];
        if (!name) continue;
        const copyOf = (b.match(/<CopyOf>(.*?)<\/CopyOf>/) || [])[1];
        if (copyOf) {
            anims[name] = { name, copyOf };
            continue;
        }
        const fw = parseInt((b.match(/<FrameWidth>(\d+)<\/FrameWidth>/) || [])[1], 10) || 0;
        const fh = parseInt((b.match(/<FrameHeight>(\d+)<\/FrameHeight>/) || [])[1], 10) || 0;
        const durs = (b.match(/<Duration>(\d+)<\/Duration>/g) || []).map(x => parseInt(x.match(/\d+/)[0], 10) || 1);
        if (fw > 0 && fh > 0 && durs.length > 0) {
            anims[name] = {
                name,
                sheet: name,
                frameWidth: fw,
                frameHeight: fh,
                durations: durs,
                frameCount: durs.length
            };
        }
    }
    for (let pass = 0; pass < 8; pass++) {
        for (const k of Object.keys(anims)) {
            if (!anims[k].copyOf) continue;
            const t = anims[anims[k].copyOf];
            if (t && !t.copyOf) {
                anims[k] = Object.assign({}, t, { name: k });
            }
        }
    }
    for (const k of Object.keys(anims)) {
        if (anims[k].copyOf) delete anims[k];
    }
    return anims;
}

function paethPredictor(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
}

function decodePngRgba(buf) {
    let pos = 8;
    let width = 0, height = 0, bitDepth = 8, colorType = 6;
    let palette = null;
    let trns = null;
    const idatChunks = [];

    while (pos + 8 <= buf.length) {
        const len = buf.readUInt32BE(pos);
        const type = buf.toString("ascii", pos + 4, pos + 8);
        const data = buf.subarray(pos + 8, pos + 8 + len);
        pos += 12 + len;

        if (type === "IHDR") {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
        } else if (type === "PLTE") {
            palette = data;
        } else if (type === "tRNS") {
            trns = data;
        } else if (type === "IDAT") {
            idatChunks.push(data);
        } else if (type === "IEND") {
            break;
        }
    }

    const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4;
    const bitsPerPixel = channels * bitDepth;
    const stride = Math.ceil((width * bitsPerPixel) / 8);
    const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8));
    const raw = zlib.inflateSync(Buffer.concat(idatChunks));

    const curRow = new Uint8Array(stride);
    const prevRow = new Uint8Array(stride);
    const rgba = new Uint8Array(width * height * 4);

    let rPos = 0;
    for (let y = 0; y < height; y++) {
        const filter = raw[rPos++];
        for (let i = 0; i < stride; i++) {
            const xByte = raw[rPos++];
            const a = i >= bpp ? curRow[i - bpp] : 0;
            const b = prevRow[i];
            const c = i >= bpp ? prevRow[i - bpp] : 0;
            let val = xByte;
            if (filter === 1) val = (xByte + a) & 0xff;
            else if (filter === 2) val = (xByte + b) & 0xff;
            else if (filter === 3) val = (xByte + ((a + b) >> 1)) & 0xff;
            else if (filter === 4) val = (xByte + paethPredictor(a, b, c)) & 0xff;
            curRow[i] = val;
        }
        prevRow.set(curRow);

        for (let x = 0; x < width; x++) {
            const outIdx = (y * width + x) * 4;
            if (colorType === 6 && bitDepth === 8) {
                const s = x * 4;
                rgba[outIdx] = curRow[s];
                rgba[outIdx + 1] = curRow[s + 1];
                rgba[outIdx + 2] = curRow[s + 2];
                rgba[outIdx + 3] = curRow[s + 3];
            } else if (colorType === 3) {
                let idx = 0;
                if (bitDepth === 8) idx = curRow[x];
                else if (bitDepth === 4) idx = (curRow[x >> 1] >> ((1 - (x & 1)) * 4)) & 0x0f;
                else if (bitDepth === 2) idx = (curRow[x >> 2] >> ((3 - (x & 3)) * 2)) & 0x03;
                else if (bitDepth === 1) idx = (curRow[x >> 3] >> (7 - (x & 7))) & 0x01;
                const pOff = idx * 3;
                rgba[outIdx] = palette ? palette[pOff] : 0;
                rgba[outIdx + 1] = palette ? palette[pOff + 1] : 0;
                rgba[outIdx + 2] = palette ? palette[pOff + 2] : 0;
                rgba[outIdx + 3] = (trns && idx < trns.length) ? trns[idx] : 255;
            } else if (colorType === 2 && bitDepth === 8) {
                const s = x * 3;
                const r = curRow[s], g = curRow[s + 1], bCh = curRow[s + 2];
                const isKey = trns && trns.length >= 6 && r === trns[1] && g === trns[3] && bCh === trns[5];
                rgba[outIdx] = r;
                rgba[outIdx + 1] = g;
                rgba[outIdx + 2] = bCh;
                rgba[outIdx + 3] = isKey ? 0 : 255;
            } else if (colorType === 4 && bitDepth === 8) {
                const s = x * 2;
                rgba[outIdx] = rgba[outIdx + 1] = rgba[outIdx + 2] = curRow[s];
                rgba[outIdx + 3] = curRow[s + 1];
            } else if (colorType === 0 && bitDepth === 8) {
                const v = curRow[x];
                const isKey = trns && trns.length >= 2 && v === trns[1];
                rgba[outIdx] = rgba[outIdx + 1] = rgba[outIdx + 2] = v;
                rgba[outIdx + 3] = isKey ? 0 : 255;
            }
        }
    }
    return { width, height, rgba };
}

function analyzeSheetRow(pngPath, fw, fh, frameCount, row = 0) {
    if (!fs.existsSync(pngPath)) return null;
    const img = decodePngRgba(fs.readFileSync(pngPath));
    const rows = Math.max(1, Math.floor(img.height / fh));
    const cols = Math.max(1, Math.floor(img.width / fw));
    const effRow = Math.min(row, rows - 1);
    const frames = [];

    for (let f = 0; f < Math.min(frameCount, cols); f++) {
        let minX = fw, maxX = -1, minY = fh, maxY = -1, opaque = 0;
        for (let y = 0; y < fh; y++) {
            for (let x = 0; x < fw; x++) {
                const p = ((effRow * fh + y) * img.width + (f * fw + x)) * 4;
                if (img.rgba[p + 3] > 16) {
                    opaque++;
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        frames.push({ f, minX, maxX, minY, maxY, opaque });
    }

    if (frames.length === 0) return null;
    const f0 = frames[0];
    for (let f = 0; f < frames.length; f++) {
        let diff = 0;
        for (let y = 0; y < fh; y++) {
            for (let x = 0; x < fw; x++) {
                const p0 = ((effRow * fh + y) * img.width + x) * 4;
                const pf = ((effRow * fh + y) * img.width + (f * fw + x)) * 4;
                const a0 = img.rgba[p0 + 3] > 16;
                const af = img.rgba[pf + 3] > 16;
                if (a0 !== af) {
                    diff++;
                } else if (a0) {
                    const dc = Math.abs(img.rgba[p0] - img.rgba[pf])
                             + Math.abs(img.rgba[p0 + 1] - img.rgba[pf + 1])
                             + Math.abs(img.rgba[p0 + 2] - img.rgba[pf + 2]);
                    if (dc > 28) diff++;
                }
            }
        }
        frames[f].dyTop = f0.minY - frames[f].minY;
        frames[f].dyBot = f0.maxY - frames[f].maxY;
        frames[f].diffRatio = Number((diff / Math.max(1, f0.opaque)).toFixed(2));
    }
    return { rows, cols, frames };
}

function recommendIdleClip(idleAnim, idleAnalysis) {
    if (!idleAnim || !idleAnalysis || idleAnalysis.frames.length <= 1) {
        return { mode: "loop", reason: "single-frame Idle" };
    }
    const frames = idleAnalysis.frames;
    const durs = idleAnim.durations;
    let maxJumpTop = 0, maxLiftBot = 0, maxDiff = 0;
    let prefixEnd = -1;

    for (let i = 1; i < frames.length; i++) {
        const fr = frames[i];
        const jump = Math.abs(fr.dyTop);
        const lift = Math.max(0, fr.dyBot);
        if (jump > maxJumpTop) maxJumpTop = jump;
        if (lift > maxLiftBot) maxLiftBot = lift;
        if (fr.diffRatio > maxDiff) maxDiff = fr.diffRatio;
        if (prefixEnd === -1 && i >= 4 && (jump >= 4 || lift >= 3 || fr.diffRatio >= 0.55)) {
            prefixEnd = i - 1;
        }
    }

    if (prefixEnd >= 4) {
        return {
            mode: `slice(0..${prefixEnd})`,
            startFrame: 0,
            endFrame: prefixEnd,
            reason: `frames 0..${prefixEnd} calm, frame ${prefixEnd + 1}+ jumps (top=${maxJumpTop}px, lift=${maxLiftBot}px)`
        };
    }
    const totalOther = durs.slice(1).reduce((a, b) => a + b, 0);
    if (maxLiftBot >= 2 || maxJumpTop >= 4 || maxDiff >= 0.42 || (durs[0] >= 28 && durs[0] >= totalOther * 0.9 && maxDiff >= 0.20)) {
        return {
            mode: "hold0",
            holdAtFrame: 0,
            reason: `active Idle gesture (d0=${durs[0]}, top=${maxJumpTop}px, lift=${maxLiftBot}px, diff=${maxDiff})`
        };
    }
    return {
        mode: "loop",
        reason: `calm breathing loop (d=[${durs.join(",")}], top=${maxJumpTop}px, lift=${maxLiftBot}px, diff=${maxDiff})`
    };
}

function auditSpecies(slug, showFrames = false) {
    const dir = path.join(SPRITES_DIR, slug);
    const xmlPath = path.join(dir, "AnimData.xml");
    if (!fs.existsSync(xmlPath)) {
        console.error(`Missing AnimData.xml for ${slug}`);
        return;
    }
    const anims = parseAnimXml(fs.readFileSync(xmlPath, "utf8"));
    const idle = anims.Idle;
    const idleInfo = idle ? analyzeSheetRow(path.join(dir, `${idle.sheet}-Anim.png`), idle.frameWidth, idle.frameHeight, idle.frameCount, 0) : null;
    const rec = recommendIdleClip(idle, idleInfo);

    const has = k => !!anims[k];
    const extras = [
        "EventSleep", "Sleep", "Sit", "LookUp", "Wake", "Eat", "DeepBreath",
        "Pose", "Nod", "Appeal", "Dance", "Twirl", "TailWhip", "Shake",
        "Emit", "Shock", "Lick", "RearUp", "Withdraw", "Sink", "Special0",
        "QuickStrike", "MultiStrike", "SpAttack", "LeapForth", "Charge", "Shoot", "Strike", "Swing", "Double"
    ].filter(has);

    let withdrawSummary = "";
    let withdrawInfo = null;
    if (anims.Withdraw) {
        const w = anims.Withdraw;
        withdrawInfo = analyzeSheetRow(path.join(dir, `${w.sheet}-Anim.png`), w.frameWidth, w.frameHeight, w.frameCount, 0);
        if (withdrawInfo) {
            withdrawSummary = " | Withdraw durs=[" + w.durations.join(",") + "]";
        }
    }

    console.log(
        `${slug.padEnd(14)} | Idle: ${rec.mode.padEnd(13)} (${rec.reason})${withdrawSummary}\n` +
        `               | Anims(${Object.keys(anims).length}): ${extras.join(", ")}`
    );
    if (showFrames && idle && idleInfo) {
        const fSummary = idleInfo.frames.map((fr, idx) =>
            `f${idx}(d=${idle.durations[idx]},top=${fr.dyTop},bot=${fr.dyBot},diff=${fr.diffRatio})`
        ).join(" ");
        console.log(`               | IdleFrames: ${fSummary}`);
    }
    if (showFrames && anims.Withdraw && withdrawInfo) {
        const w = anims.Withdraw;
        const wSummary = withdrawInfo.frames.map((fr, idx) =>
            `f${idx}(d=${w.durations[idx]},h=${fr.maxY - fr.minY + 1},diff=${fr.diffRatio})`
        ).join(" ");
        console.log(`               | WithdrawFrames: ${wSummary}`);
    }
}

function cleanUnusedFiles() {
    const slugs = fs.readdirSync(SPRITES_DIR).filter(d => fs.statSync(path.join(SPRITES_DIR, d)).isDirectory()).sort();
    let removed = 0;
    let savedBytes = 0;
    for (const slug of slugs) {
        const dir = path.join(SPRITES_DIR, slug);
        const xmlPath = path.join(dir, "AnimData.xml");
        if (!fs.existsSync(xmlPath)) continue;
        const anims = parseAnimXml(fs.readFileSync(xmlPath, "utf8"));
        const neededFiles = new Set(["AnimData.xml", "credits.txt"]);
        for (const a of Object.values(anims)) {
            neededFiles.add(`${a.sheet}-Anim.png`);
        }
        for (const f of fs.readdirSync(dir)) {
            if (!neededFiles.has(f)) {
                const fp = path.join(dir, f);
                const st = fs.statSync(fp);
                if (st.isFile()) {
                    savedBytes += st.size;
                    fs.unlinkSync(fp);
                    removed++;
                }
            }
        }
    }
    console.log(`Cleaned ${removed} unused sprite files (${(savedBytes / (1024 * 1024)).toFixed(2)} MiB saved).`);
}

async function loadTracker() {
    const cacheDir = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "qs-vpets");
    const cacheFile = path.join(cacheDir, "pmdcollab-tracker.json");
    if (fs.existsSync(cacheFile) && (Date.now() - fs.statSync(cacheFile).mtimeMs) < 3600_000) {
        return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    }
    const buf = await fetchBuffer(TRACKER_URL);
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, buf);
    return JSON.parse(buf.toString("utf8"));
}

async function searchTracker(query) {
    const tracker = await loadTracker();
    const q = (query || "").toLowerCase();
    const results = [];
    for (const [dexId, entry] of Object.entries(tracker)) {
        if (!entry || !entry.name) continue;
        if (!q || entry.name.toLowerCase().includes(q) || dexId === query) {
            const sc = entry.sprite_credit || {};
            const complete = entry.sprite_complete || 0;
            const hasFiles = entry.sprite_files ? Object.keys(entry.sprite_files).length : 0;
            results.push({ dexId, name: entry.name, complete, hasFiles, primary: sc.primary || "" });
        }
    }
    results.sort((a, b) => b.hasFiles - a.hasFiles || b.complete - a.complete);
    for (const r of results.slice(0, 60)) {
        console.log(`${r.dexId.padEnd(6)} ${r.name.padEnd(20)} complete=${r.complete} files=${r.hasFiles} artist=${r.primary}`);
    }
}

async function importSpecies(dexIdRaw, slug) {
    const dexId = String(dexIdRaw).padStart(4, "0");
    if (!slug || !/^[a-z0-9_]+$/.test(slug)) {
        throw new Error(`Invalid species slug: ${slug}`);
    }
    const baseUrl = `${RAW_BASE}/${dexId}`;
    const xmlBuf = await fetchBuffer(`${baseUrl}/AnimData.xml`);
    const creditsBuf = await fetchBuffer(`${baseUrl}/credits.txt`);
    const anims = parseAnimXml(xmlBuf.toString("utf8"));
    if (!anims.Walk) {
        throw new Error(`${dexId} (${slug}) has no Walk animation`);
    }

    const sheets = Array.from(new Set(Object.values(anims).map(a => a.sheet))).sort();
    const outDir = path.join(SPRITES_DIR, slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "AnimData.xml"), xmlBuf);
    fs.writeFileSync(path.join(outDir, "credits.txt"), creditsBuf);

    for (const sheet of sheets) {
        const pngBuf = await fetchBuffer(`${baseUrl}/${sheet}-Anim.png`);
        fs.writeFileSync(path.join(outDir, `${sheet}-Anim.png`), pngBuf);
    }

    const needed = new Set(["AnimData.xml", "credits.txt", ...sheets.map(s => `${s}-Anim.png`)]);
    for (const f of fs.readdirSync(outDir)) {
        if (!needed.has(f)) fs.unlinkSync(path.join(outDir, f));
    }

    console.log(`Imported ${slug} (dex ${dexId}): ${sheets.length} animation sheets.`);
    auditSpecies(slug);
}

async function main() {
    const [cmd, ...args] = process.argv.slice(2);
    if (cmd === "clean") {
        cleanUnusedFiles();
        return;
    }
    if (cmd === "audit") {
        const showFrames = args.includes("--frames");
        const filtered = args.filter(a => a !== "--frames");
        const slugs = filtered.length > 0
            ? filtered
            : fs.readdirSync(SPRITES_DIR).filter(d => fs.statSync(path.join(SPRITES_DIR, d)).isDirectory()).sort();
        for (const s of slugs) auditSpecies(s, showFrames);
        return;
    }
    if (cmd === "search") {
        await searchTracker(args.join(" "));
        return;
    }
    if (cmd === "import") {
        if (args.length < 2) throw new Error("Usage: import <dexId> <slug>");
        await importSpecies(args[0], args[1]);
        return;
    }
    console.log("Usage: node scripts/pmd-species.js <audit|clean|search|import> [...]");
}

main().catch(err => {
    console.error(err.message || err);
    process.exit(1);
});
