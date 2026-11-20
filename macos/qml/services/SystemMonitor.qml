pragma Singleton
pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Io
import MacPlatform

Singleton {
    id: root

    property bool activeSampling: true
    readonly property real cpuUsage: MacPlatform.cpuUsage
    readonly property real memUsage: MacPlatform.memUsage
    readonly property bool isUnderLoad: cpuUsage > 0.72 || memUsage > 0.86
    readonly property real thermalWarmth: MacPlatform.thermalWarmth

    readonly property bool hasBattery: MacPlatform.hasBattery
    readonly property real batteryLevel: MacPlatform.batteryLevel
    readonly property bool onBattery: MacPlatform.onBattery
    readonly property bool isPluggedIn: MacPlatform.isPluggedIn
    readonly property bool lowBattery: onBattery && batteryLevel <= 0.20

    property string solarPhase: "day"
    property string weatherKind: "clear"
    property real outdoorTempC: 16
    property bool weatherAvailable: false
    readonly property bool isRaining: weatherKind === "rain" || weatherKind === "storm"
    readonly property bool isSnowing: weatherKind === "snow"

    signal buildCompleted(durationSec: real)
    signal powerPluggedChanged(pluggedIn: bool, batteryLevel: real)
    signal lowBatteryWarn(batteryLevel: real)
    signal weatherChanged(oldKind: string, newKind: string)
    signal solarTransitioned(oldPhase: string, newPhase: string)
    signal systemResumed(sleptSec: real)
    signal toastArrived(appName: string, urgency: string, silent: bool)

    property double _bootMs: Date.now()
    property double _heavyLoadSinceMs: 0
    property double _lastBuildSignalMs: 0
    property string _sunrise: ""
    property string _sunset: ""
    property bool _solarBaselineReady: false
    property bool _weatherBaselineReady: false
    property bool _powerBaselineReady: false
    property bool _prevPluggedIn: false
    property int _lastLowBatteryTier: 0
    property string _lastToastSig: ""
    property double _lastToastEmitMs: 0

    readonly property string _cacheBase: {
        const xdg = Quickshell.env("XDG_CACHE_HOME");
        return (xdg && xdg.length > 0) ? xdg : (Quickshell.env("HOME") + "/.cache");
    }
    readonly property string _customWeatherPath: {
        const envFile = Quickshell.env("QS_VPETS_WEATHER_FILE");
        return (envFile && envFile.length > 0) ? envFile : (_cacheBase + "/qs-vpets/weather.json");
    }
    readonly property string _customToastPath: {
        const envFile = Quickshell.env("QS_VPETS_TOAST_FILE");
        return (envFile && envFile.length > 0) ? envFile : (_cacheBase + "/qs-vpets/toast.json");
    }

    function _parseClockHour(hhmm: string, fallback: real): real {
        if (!hhmm || hhmm.indexOf(":") === -1) return fallback;
        const parts = hhmm.split(":");
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
        return h + m / 60;
    }

    function _refreshSolarPhase(): void {
        const now = new Date();
        const curH = now.getHours() + now.getMinutes() / 60;
        const rise = _parseClockHour(root._sunrise, 6.5);
        const set = _parseClockHour(root._sunset, 19.5);
        let next = "day";
        if (curH < rise - 0.6 || curH >= set + 0.9) next = "night";
        else if (curH < rise + 0.75) next = "dawn";
        else if (curH >= set - 0.75) next = "dusk";

        const prev = root.solarPhase;
        root.solarPhase = next;
        if (!root._solarBaselineReady) {
            root._solarBaselineReady = true;
            return;
        }
        if (next !== prev) root.solarTransitioned(prev, next);
    }

    function _classifyWeatherCode(code: int): string {
        if (code <= 1) return "clear";
        if (code <= 48) return "clouds";
        if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
        if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return "snow";
        if (code >= 95) return "storm";
        return "clear";
    }

    function _normalizeWeatherKind(rawKind: string): string {
        const kind = String(rawKind || "clear").toLowerCase();
        if (/storm|thunder/.test(kind)) return "storm";
        if (/rain|drizzle|shower/.test(kind)) return "rain";
        if (/snow|sleet|blizzard/.test(kind)) return "snow";
        if (/fog|mist|haze/.test(kind)) return "fog";
        if (/cloud|overcast/.test(kind)) return "clouds";
        return "clear";
    }

    function _ingestWeatherJson(raw: string): void {
        if (!raw || !raw.trim()) return;
        try {
            const w = JSON.parse(raw);
            if (!w || typeof w !== "object") return;
            if (w.updatedAt !== undefined) {
                const rawTs = Number(w.updatedAt);
                if (Number.isFinite(rawTs) && rawTs > 0) {
                    const tsMs = rawTs < 1e11 ? (rawTs * 1000) : rawTs;
                    if ((Date.now() - tsMs) > 3 * 3600 * 1000) return;
                }
            }
            let norm = root.weatherKind;
            if (typeof w.weatherKind === "string" && w.weatherKind.length > 0) {
                norm = _normalizeWeatherKind(w.weatherKind);
            } else if (w.weatherCode !== undefined) {
                norm = _classifyWeatherCode(parseInt(w.weatherCode, 10) || 0);
            } else {
                norm = _normalizeWeatherKind(w.kind || w.condition || "clear");
            }

            if (w.tempC !== undefined && Number.isFinite(Number(w.tempC))) root.outdoorTempC = Number(w.tempC);
            if (typeof w.sunrise === "string") root._sunrise = w.sunrise;
            if (typeof w.sunset === "string") root._sunset = w.sunset;
            root.weatherAvailable = true;

            const prev = root.weatherKind;
            root.weatherKind = norm;
            if (!root._weatherBaselineReady) root._weatherBaselineReady = true;
            else if (norm !== prev) root.weatherChanged(prev, norm);
            root._refreshSolarPhase();
        } catch (e) {}
    }

    function _normalizeUrgency(u: var): string {
        if (typeof u === "number") {
            if (u >= 2) return "critical";
            if (u <= 0) return "low";
            return "normal";
        }
        const s = String(u || "normal").trim().toLowerCase();
        if (s === "critical" || s === "high" || s === "2") return "critical";
        if (s === "low" || s === "0") return "low";
        return "normal";
    }

    function emitExternalToast(appName: string, urgency: string, silent: bool): void {
        const now = Date.now();
        if (now - root._lastToastEmitMs < 2500) return;
        root._lastToastEmitMs = now;
        root.toastArrived(String(appName || "Desktop"), _normalizeUrgency(urgency), !!silent);
    }

    onCpuUsageChanged: {
        const now = Date.now();
        if (cpuUsage >= 0.58) {
            if (_heavyLoadSinceMs <= 0) _heavyLoadSinceMs = now;
        } else if (_heavyLoadSinceMs > 0) {
            const dur = (now - _heavyLoadSinceMs) / 1000;
            _heavyLoadSinceMs = 0;
            if (dur >= 14 && (now - _lastBuildSignalMs) > 60000) {
                _lastBuildSignalMs = now;
                root.buildCompleted(dur);
            }
        }
    }

    onIsPluggedInChanged: {
        if (!root.hasBattery) return;
        if (!root._powerBaselineReady) {
            root._prevPluggedIn = root.isPluggedIn;
            root._powerBaselineReady = true;
            return;
        }
        if (root.isPluggedIn !== root._prevPluggedIn) {
            root._prevPluggedIn = root.isPluggedIn;
            if (root.isPluggedIn) root._lastLowBatteryTier = 0;
            root.powerPluggedChanged(root.isPluggedIn, root.batteryLevel);
        }
    }

    onBatteryLevelChanged: {
        if (!root.onBattery) {
            root._lastLowBatteryTier = 0;
            return;
        }
        const tier = root.batteryLevel <= 0.10 ? 2 : (root.batteryLevel <= 0.20 ? 1 : 0);
        if (tier > root._lastLowBatteryTier) {
            root._lastLowBatteryTier = tier;
            root.lowBatteryWarn(root.batteryLevel);
        }
    }

    FileView {
        id: customWeatherFile
        path: root._customWeatherPath
        watchChanges: true
        printErrors: false
        onLoaded: root._ingestWeatherJson(text())
        onFileChanged: reload()
    }

    FileView {
        id: customToastFile
        path: root._customToastPath
        watchChanges: true
        printErrors: false
        onLoaded: {
            const raw = text().trim();
            if (!raw) return;
            try {
                const t = JSON.parse(raw);
                if (!t || typeof t !== "object") return;
                const rawTs = Number(t.updatedAt ?? t.time ?? 0);
                const tsMs = rawTs > 0 && rawTs < 1e11 ? (rawTs * 1000) : rawTs;
                if (!(tsMs > root._bootMs) || (Date.now() - tsMs) > 15000) return;
                const sig = String(t.id ?? "") + ":" + String(t.appName ?? t.app ?? "") + ":" + String(Math.floor(tsMs / 1000));
                if (sig === root._lastToastSig) return;
                root._lastToastSig = sig;
                root.emitExternalToast(String(t.appName || t.app || "Desktop"), _normalizeUrgency(t.urgency), !!t.silent);
            } catch (e) {}
        }
        onFileChanged: reload()
    }

    Timer {
        interval: 60000
        running: root.activeSampling
        repeat: true
        onTriggered: root._refreshSolarPhase()
    }

    Connections {
        target: MacPlatform
        function onSystemResumed(sleptSec: real): void {
            root._refreshSolarPhase();
            root.systemResumed(sleptSec);
        }
    }

    Component.onCompleted: {
        if (root.hasBattery) {
            root._prevPluggedIn = root.isPluggedIn;
            root._powerBaselineReady = true;
        }
        root._refreshSolarPhase();
    }
}
