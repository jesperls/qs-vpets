.pragma library

function parseSwayTree(raw) {
    if (!raw || !raw.trim()) return null;
    var root;
    try {
        root = JSON.parse(raw);
    } catch (e) {
        return null;
    }
    if (!root || typeof root !== "object") return null;

    var insets = {};
    var wins = [];
    var allMappedAddrs = {};
    var activePos = null;
    var activeCls = "";
    var activeTitle = "";
    var isFullscreen = false;
    var focusedWsCount = 0;

    function collectLeaves(node, outList) {
        if (!node || typeof node !== "object") return;
        var children = (node.nodes || []).concat(node.floating_nodes || []);
        var isLeaf = children.length === 0
                  && (node.type === "con" || node.type === "floating_con")
                  && (node.pid > 0 || node.app_id || node.window || node.window_properties);
        if (isLeaf) {
            outList.push(node);
            return;
        }
        for (var i = 0; i < children.length; i++) {
            collectLeaves(children[i], outList);
        }
    }

    var outputs = root.nodes || [];
    var focusedWsLeaves = [];

    for (var o = 0; o < outputs.length; o++) {
        var out = outputs[o];
        if (!out || out.name === "__i3" || out.active === false) continue;
        var outRect = out.rect || { x: 0, y: 0, width: 0, height: 0 };
        var curWsName = String(out.current_workspace || "");
        var wsNodes = out.nodes || [];

        for (var w = 0; w < wsNodes.length; w++) {
            var ws = wsNodes[w];
            if (!ws || ws.type !== "workspace") continue;
            var leaves = [];
            collectLeaves(ws, leaves);
            for (var li = 0; li < leaves.length; li++) {
                if (leaves[li].id !== undefined) {
                    allMappedAddrs[String(leaves[li].id)] = true;
                }
            }

            if (String(ws.name || "") !== curWsName) continue;

            var wsRect = ws.rect || outRect;
            if (out.name && outRect.width > 0 && outRect.height > 0) {
                insets[out.name] = {
                    left: Math.max(0, Number(wsRect.x || 0) - Number(outRect.x || 0)),
                    top: Math.max(0, Number(wsRect.y || 0) - Number(outRect.y || 0)),
                    right: Math.max(0, (Number(outRect.x || 0) + Number(outRect.width || 0)) - (Number(wsRect.x || 0) + Number(wsRect.width || 0))),
                    bottom: Math.max(0, (Number(outRect.y || 0) + Number(outRect.height || 0)) - (Number(wsRect.y || 0) + Number(wsRect.height || 0)))
                };
            }

            var wsHasFocus = !!ws.focused;
            for (var k = 0; k < leaves.length; k++) {
                if (leaves[k].focused) wsHasFocus = true;
            }
            if (wsHasFocus) focusedWsLeaves = leaves;

            for (var j = 0; j < leaves.length; j++) {
                var leaf = leaves[j];
                var rect = leaf.rect || { x: 0, y: 0, width: 0, height: 0 };
                var decoH = (leaf.deco_rect && leaf.deco_rect.height > 0 && leaf.border === "normal")
                    ? Number(leaf.deco_rect.height)
                    : 0;
                var addr = String(leaf.id !== undefined ? leaf.id : "");
                var cls = String(leaf.app_id || (leaf.window_properties && leaf.window_properties.class) || "");
                var title = String(leaf.name || "");
                var fsMode = Number(leaf.fullscreen_mode || 0);
                var winFs = fsMode !== 0;
                var winTrueFs = fsMode >= 1;
                var entry = {
                    address: addr,
                    cls: cls,
                    title: title,
                    x: Number(rect.x || 0),
                    y: Number(rect.y || 0) - decoH,
                    w: Number(rect.width || 0),
                    h: Number(rect.height || 0) + decoH,
                    focused: !!leaf.focused,
                    fullscreen: winFs,
                    trueFullscreen: winTrueFs
                };
                if (entry.w > 0 && entry.h > 0) wins.push(entry);
                if (entry.focused) {
                    activePos = { address: entry.address, x: entry.x, y: entry.y, w: entry.w, h: entry.h };
                    activeCls = entry.cls;
                    activeTitle = entry.title;
                    isFullscreen = winTrueFs;
                }
            }
        }
    }

    focusedWsCount = focusedWsLeaves.length > 0 ? focusedWsLeaves.length : (wins.length === 0 ? 0 : wins.length);

    return {
        insets: insets,
        wins: wins,
        allMappedAddrs: allMappedAddrs,
        activePos: activePos,
        activeCls: activeCls,
        activeTitle: activeTitle,
        isFullscreen: isFullscreen,
        windowCount: focusedWsCount
    };
}

function parseSwayEvent(line) {
    if (!line || !line.trim()) return null;
    try {
        var ev = JSON.parse(line);
        if (!ev || typeof ev !== "object") return null;
        var change = String(ev.change || "");
        var c = ev.container || null;
        var cls = c ? String(c.app_id || (c.window_properties && c.window_properties.class) || "") : "";
        var title = c ? String(c.name || "") : "";
        var rect = (c && c.rect) ? c.rect : null;
        var addr = (c && c.id !== undefined) ? String(c.id) : "";
        return {
            change: change,
            hasContainer: !!c,
            hasCurrent: !!ev.current,
            cls: cls,
            title: title,
            address: addr,
            urgent: !!(c && c.urgent),
            gx: rect ? (Number(rect.x || 0) + Number(rect.width || 0) * 0.5) : 0,
            gy: rect ? (Number(rect.y || 0) + Number(rect.height || 0) * 0.5) : 0
        };
    } catch (e) {
        return null;
    }
}

function createNiriState() {
    return {
        outputs: {},
        workspaces: {},
        windows: {},
        focusedWindowId: null,
        booted: false
    };
}

function ingestNiriOutputs(state, raw) {
    if (!state || !raw || !raw.trim()) return false;
    try {
        var data = JSON.parse(raw);
        if (!data || typeof data !== "object") return false;
        var next = {};
        var keys = Object.keys(data);
        for (var i = 0; i < keys.length; i++) {
            var out = data[keys[i]];
            if (!out || !out.logical) continue;
            var name = String(out.name || keys[i]);
            next[name] = {
                name: name,
                x: Number(out.logical.x || 0),
                y: Number(out.logical.y || 0),
                width: Number(out.logical.width || 0),
                height: Number(out.logical.height || 0)
            };
        }
        state.outputs = next;
        return true;
    } catch (e) {
        return false;
    }
}

function applyNiriEvent(state, line) {
    if (!state || !line || !line.trim()) return null;
    var ev;
    try {
        ev = JSON.parse(line);
    } catch (e) {
        return null;
    }
    if (!ev || typeof ev !== "object") return null;

    var signals = [];

    if (ev.WorkspacesChanged && Array.isArray(ev.WorkspacesChanged.workspaces)) {
        var wsMap = {};
        var list = ev.WorkspacesChanged.workspaces;
        for (var i = 0; i < list.length; i++) {
            var ws = list[i];
            if (!ws || ws.id === undefined) continue;
            wsMap[String(ws.id)] = {
                id: String(ws.id),
                output: String(ws.output || ""),
                isActive: !!ws.is_active,
                isFocused: !!ws.is_focused
            };
        }
        state.workspaces = wsMap;
    } else if (ev.WorkspaceActivated && ev.WorkspaceActivated.id !== undefined) {
        var actId = String(ev.WorkspaceActivated.id);
        var actWs = state.workspaces[actId];
        var actOut = actWs ? actWs.output : "";
        var focusedFlag = !!ev.WorkspaceActivated.focused;
        var wKeys = Object.keys(state.workspaces);
        for (var wk = 0; wk < wKeys.length; wk++) {
            var item = state.workspaces[wKeys[wk]];
            if (actOut && item.output === actOut) item.isActive = (item.id === actId);
            if (focusedFlag) item.isFocused = (item.id === actId);
        }
        signals.push({ kind: "workspace" });
    } else if (ev.WindowsChanged && Array.isArray(ev.WindowsChanged.windows)) {
        var winMap = {};
        var wList = ev.WindowsChanged.windows;
        var focusId = null;
        for (var j = 0; j < wList.length; j++) {
            var wObj = wList[j];
            if (!wObj || wObj.id === undefined) continue;
            var wid = String(wObj.id);
            winMap[wid] = wObj;
            if (wObj.is_focused) focusId = wid;
        }
        state.windows = winMap;
        state.focusedWindowId = focusId;
        state.booted = true;
    } else if (ev.WindowOpenedOrChanged && ev.WindowOpenedOrChanged.window) {
        var win = ev.WindowOpenedOrChanged.window;
        if (win.id !== undefined) {
            var openId = String(win.id);
            var existed = !!state.windows[openId];
            state.windows[openId] = win;
            if (win.is_focused) {
                state.focusedWindowId = openId;
                signals.push({ kind: "focused", cls: String(win.app_id || ""), title: String(win.title || "") });
            }
            if (state.booted && !existed) {
                signals.push({ kind: "opened", cls: String(win.app_id || ""), title: String(win.title || "") });
            }
        }
    } else if (ev.WindowClosed && ev.WindowClosed.id !== undefined) {
        var closeId = String(ev.WindowClosed.id);
        delete state.windows[closeId];
        if (state.focusedWindowId === closeId) state.focusedWindowId = null;
    } else if (ev.WindowFocusChanged) {
        var nextFocus = ev.WindowFocusChanged.id !== undefined && ev.WindowFocusChanged.id !== null
            ? String(ev.WindowFocusChanged.id)
            : null;
        state.focusedWindowId = nextFocus;
        var fKeys = Object.keys(state.windows);
        for (var fk = 0; fk < fKeys.length; fk++) {
            state.windows[fKeys[fk]].is_focused = (fKeys[fk] === nextFocus);
        }
        if (nextFocus && state.windows[nextFocus]) {
            var fw = state.windows[nextFocus];
            signals.push({ kind: "focused", cls: String(fw.app_id || ""), title: String(fw.title || "") });
        }
    } else if (ev.WindowLayoutsChanged && Array.isArray(ev.WindowLayoutsChanged.changes)) {
        var changes = ev.WindowLayoutsChanged.changes;
        for (var ci = 0; ci < changes.length; ci++) {
            var pair = changes[ci];
            if (!Array.isArray(pair) || pair.length < 2) continue;
            var lid = String(pair[0]);
            if (state.windows[lid]) state.windows[lid].layout = pair[1];
        }
    } else if (ev.WindowUrgencyChanged && ev.WindowUrgencyChanged.id !== undefined) {
        var uid = String(ev.WindowUrgencyChanged.id);
        if (state.windows[uid]) {
            state.windows[uid].is_urgent = !!ev.WindowUrgencyChanged.urgent;
            if (ev.WindowUrgencyChanged.urgent) {
                signals.push({ kind: "urgent", address: uid, cls: String(state.windows[uid].app_id || "") });
            }
        }
    } else {
        return null;
    }

    return { signals: signals };
}

function buildNiriSnapshot(state, fallbackScreens) {
    var wins = [];
    var allMappedAddrs = {};
    var activePos = null;
    var activeCls = "";
    var activeTitle = "";
    var isFullscreen = false;
    var focusedWsCount = 0;

    var outLookup = {};
    var outKeys = Object.keys(state.outputs || {});
    for (var ok = 0; ok < outKeys.length; ok++) {
        outLookup[outKeys[ok]] = state.outputs[outKeys[ok]];
    }
    if (Array.isArray(fallbackScreens)) {
        for (var si = 0; si < fallbackScreens.length; si++) {
            var scr = fallbackScreens[si];
            if (scr && scr.name && !outLookup[scr.name]) {
                outLookup[scr.name] = {
                    name: scr.name,
                    x: Number(scr.x || 0),
                    y: Number(scr.y || 0),
                    width: Number(scr.width || 0),
                    height: Number(scr.height || 0)
                };
            }
        }
    }

    var focusedWsId = "";
    var wsKeys = Object.keys(state.workspaces || {});
    for (var wk = 0; wk < wsKeys.length; wk++) {
        if (state.workspaces[wsKeys[wk]].isFocused) {
            focusedWsId = wsKeys[wk];
            break;
        }
    }

    var winKeys = Object.keys(state.windows || {});
    for (var i = 0; i < winKeys.length; i++) {
        var wid = winKeys[i];
        var w = state.windows[wid];
        if (!w) continue;
        allMappedAddrs[wid] = true;

        var wsId = w.workspace_id !== undefined && w.workspace_id !== null ? String(w.workspace_id) : "";
        if (focusedWsId && wsId === focusedWsId) focusedWsCount++;

        var ws = wsId ? state.workspaces[wsId] : null;
        if (ws && !ws.isActive) continue;

        var out = (ws && ws.output && outLookup[ws.output]) ? outLookup[ws.output] : null;
        if (!out && fallbackScreens && fallbackScreens.length > 0) {
            out = {
                x: Number(fallbackScreens[0].x || 0),
                y: Number(fallbackScreens[0].y || 0),
                width: Number(fallbackScreens[0].width || 0),
                height: Number(fallbackScreens[0].height || 0)
            };
        }

        var isFocused = !!w.is_focused || (state.focusedWindowId !== null && wid === state.focusedWindowId);
        var cls = String(w.app_id || "");
        var title = String(w.title || "");
        var lay = w.layout || null;
        var winSize = lay ? (lay.window_size || lay.tile_size || null) : null;
        var viewPos = lay ? (lay.tile_pos_in_workspace_view || null) : null;
        var tileOff = (lay && Array.isArray(lay.window_offset_in_tile)) ? lay.window_offset_in_tile : [0, 0];

        var ww = Array.isArray(winSize) ? Number(winSize[0] || 0) : 0;
        var wh = Array.isArray(winSize) ? Number(winSize[1] || 0) : 0;
        var winFs = !!w.is_fullscreen
                 || !!(out && out.width > 0 && out.height > 0 && ww >= out.width && wh >= out.height
                       && (!viewPos || (Math.abs(Number(viewPos[0] || 0)) <= 1 && Math.abs(Number(viewPos[1] || 0)) <= 1)));

        if (out && Array.isArray(viewPos) && ww > 0 && wh > 0) {
            var gx = out.x + Number(viewPos[0] || 0) + Number(tileOff[0] || 0);
            var gy = out.y + Number(viewPos[1] || 0) + Number(tileOff[1] || 0);
            if (gx + ww > out.x + 8 && gx < out.x + out.width - 8) {
                var entry = {
                    address: wid,
                    cls: cls,
                    title: title,
                    x: gx,
                    y: gy,
                    w: ww,
                    h: wh,
                    focused: isFocused,
                    fullscreen: winFs,
                    trueFullscreen: winFs
                };
                wins.push(entry);
                if (isFocused) {
                    activePos = { address: entry.address, x: entry.x, y: entry.y, w: entry.w, h: entry.h };
                }
            }
        } else if (winFs && out && out.width > 0 && out.height > 0) {
            wins.push({
                address: wid,
                cls: cls,
                title: title,
                x: out.x,
                y: out.y,
                w: out.width,
                h: out.height,
                focused: isFocused,
                fullscreen: true,
                trueFullscreen: true
            });
        }

        if (isFocused) {
            activeCls = cls;
            activeTitle = title;
            isFullscreen = winFs;
        }
    }

    return {
        insets: {},
        wins: wins,
        allMappedAddrs: allMappedAddrs,
        activePos: activePos,
        activeCls: activeCls,
        activeTitle: activeTitle,
        isFullscreen: isFullscreen,
        windowCount: focusedWsCount
    };
}
