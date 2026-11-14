const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.resolve(__dirname, "..");
const moduleCache = new Map();

function loadQmlJs(relPath, injected = {}) {
    const norm = path.normalize(relPath);
    const useCache = Object.keys(injected).length === 0;
    if (useCache && moduleCache.has(norm)) return moduleCache.get(norm);
    const full = path.join(rootDir, norm);
    const dir = path.dirname(norm);
    let src = fs.readFileSync(full, "utf8");
    src = src.replace(/^\.pragma\s+library\s*$/gm, "");
    const imports = {};
    src = src.replace(/^\.import\s+"([^"]+)"\s+as\s+([A-Za-z0-9_]+)\s*$/gm, (_, impPath, alias) => {
        imports[alias] = loadQmlJs(path.join(dir, impPath));
        return "";
    });
    const ctx = Object.assign(
        { Math, Date, Number, Object, Array, String, Boolean, JSON, parseInt, parseFloat, isFinite, console },
        imports,
        injected
    );
    vm.createContext(ctx);
    vm.runInContext(src, ctx, { filename: norm });
    if (useCache) moduleCache.set(norm, ctx);
    return ctx;
}

module.exports = { loadQmlJs, rootDir };
