pragma Singleton
pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Services.UPower

Singleton {
    id: root

    property bool activeSampling: true
    property real cpuUsage: 0
    property real memUsage: 0
    property real cpuTempC: 42
    property bool hasThermalSensor: false
    readonly property bool isUnderLoad: cpuUsage > 0.72 || memUsage > 0.86
    readonly property real thermalWarmth: {
        const tempNorm = Math.max(0, Math.min(1, (cpuTempC - 44) / 36));
        const loadNorm = Math.max(0, Math.min(1, (cpuUsage - 0.18) / 0.65));
        return hasThermalSensor ? (tempNorm * 0.68 + loadNorm * 0.32) : loadNorm;
    }

    readonly property UPowerDevice _batDev: UPower.displayDevice
    readonly property bool hasBattery: _batDev !== null && _batDev.isPresent && _batDev.type === UPowerDeviceType.Battery
    readonly property real batteryLevel: {
        if (!hasBattery || !_batDev) return 1.0;
        const raw = _batDev.percentage;
        return Math.max(0, Math.min(1, raw > 1.01 ? (raw / 100) : raw));
    }
    readonly property bool onBattery: hasBattery && UPower.onBattery
    readonly property bool isPluggedIn: hasBattery && !UPower.onBattery
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

    property real _lastCpuTotal: 0
    property real _lastCpuIdle: 0
    property string _thermalPath: ""
    property double _heavyLoadSinceMs: 0
    property double _lastBuildSignalMs: 0
    property string _sunrise: ""
    property string _sunset: ""
    property bool _customWeatherFresh: false
    property bool _solarBaselineReady: false
    property bool _weatherBaselineReady: false
    property bool _powerBaselineReady: false
    property bool _prevPluggedIn: false
    property int _lastLowBatteryTier: 0
    property double _lastWallClockMs: Date.now()
    property double _bootMs: Date.now()
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
    readonly property string _panguWeatherPath: _cacheBase + "/pangu/weather.json"
    readonly property string _customToastPath: {
        const envFile = Quickshell.env("QS_VPETS_TOAST_FILE");
        return (envFile && envFile.length > 0) ? envFile : (_cacheBase + "/qs-vpets/toast.json");
    }
    readonly property string _panguToastPath: _cacheBase + "/pangu/toast.json"
    readonly property string _panguNotificationsPath: _cacheBase + "/pangu/notifications.json"

    function _parseClockHour(hhmm: string, fallback: real): real {
        if (!hhmm || hhmm.indexOf(":") === -1) return fallback;
        const parts = hhmm.split(":");
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
        return h + m / 60;
    }

    function _setSolarPhase(nextPhase: string): void {
        const prev = root.solarPhase;
        root.solarPhase = nextPhase;
        if (!root._solarBaselineReady) {
            root._solarBaselineReady = true;
            return;
        }
        if (nextPhase !== prev) {
            root.solarTransitioned(prev, nextPhase);
        }
    }

    function _setWeatherKind(nextKind: string): void {
        const prev = root.weatherKind;
        root.weatherKind = nextKind;
        if (!root._weatherBaselineReady) {
            root._weatherBaselineReady = true;
            return;
        }
        if (nextKind !== prev) {
            root.weatherChanged(prev, nextKind);
        }
    }

    function _updateSolarPhase(): void {
        const now = new Date();
        const hr = now.getHours() + now.getMinutes() / 60;
        const rise = _parseClockHour(root._sunrise, 6.25);
        const set = _parseClockHour(root._sunset, 19.25);
        let next = "night";
        if (hr >= rise - 0.85 && hr < rise + 1.35) next = "dawn";
        else if (hr >= rise + 1.35 && hr < set - 1.1) next = "day";
        else if (hr >= set - 1.1 && hr < set + 1.1) next = "dusk";
        _setSolarPhase(next);
    }

    function _classifyWeatherCode(code: int): string {
        if (code <= 1) return "clear";
        if (code <= 48) return "clouds";
        if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
        if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return "snow";
        if (code >= 95) return "storm";
        return "clear";
    }

    function _resetWeatherDefaults(): void {
        root.weatherAvailable = false;
        root._setWeatherKind("clear");
        root.outdoorTempC = 16;
        root._sunrise = "";
        root._sunset = "";
        root._updateSolarPhase();
    }

    function _ingestWeatherJson(raw: string): bool {
        if (!raw || !raw.trim()) return false;
        try {
            const d = JSON.parse(raw);
            if (!d || typeof d !== "object") return false;
            if (d.updatedAt !== undefined) {
                const rawTs = Number(d.updatedAt);
                if (Number.isFinite(rawTs) && rawTs > 0) {
                    const tsMs = rawTs < 1e11 ? (rawTs * 1000) : rawTs;
                    if ((Date.now() - tsMs) > 3 * 3600 * 1000) return false;
                }
            }
            let nextKind = root.weatherKind;
            if (typeof d.weatherKind === "string" && d.weatherKind.length > 0) {
                nextKind = d.weatherKind;
            } else if (d.weatherCode !== undefined) {
                nextKind = root._classifyWeatherCode(parseInt(d.weatherCode, 10) || 0);
            }
            if (d.tempC !== undefined && Number.isFinite(Number(d.tempC))) {
                root.outdoorTempC = Number(d.tempC);
            }
            if (typeof d.sunrise === "string") root._sunrise = d.sunrise;
            if (typeof d.sunset === "string") root._sunset = d.sunset;
            root.weatherAvailable = true;
            root._setWeatherKind(nextKind);
            root._updateSolarPhase();
            return true;
        } catch (e) {
            return false;
        }
    }

    function _refreshWeather(): void {
        if (root._ingestWeatherJson(customWeatherFile.text())) {
            root._customWeatherFresh = true;
            return;
        }
        root._customWeatherFresh = false;
        if (!root._ingestWeatherJson(panguWeatherFile.text())) {
            root._resetWeatherDefaults();
        }
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
        root.toastArrived(String(appName || "Desktop"), root._normalizeUrgency(urgency), !!silent);
    }

    function _ingestToastJson(raw: string): void {
        if (!raw || !raw.trim()) return;
        try {
            const d = JSON.parse(raw);
            if (!d || typeof d !== "object") return;
            const rawTs = Number(d.updatedAt ?? d.time ?? 0);
            const tsMs = rawTs > 0 && rawTs < 1e11 ? (rawTs * 1000) : rawTs;
            if (!(tsMs > root._bootMs) || (Date.now() - tsMs) > 15000) return;
            const sig = String(d.id ?? "") + ":" + String(d.appName ?? "") + ":" + String(Math.floor(tsMs / 1000));
            if (sig === root._lastToastSig) return;
            root._lastToastSig = sig;
            root.emitExternalToast(String(d.appName ?? "Notification"), root._normalizeUrgency(d.urgency), !!d.silent);
        } catch (e) {
            return;
        }
    }

    function _ingestNotificationsListJson(raw: string): void {
        if (!raw || !raw.trim()) return;
        try {
            const list = JSON.parse(raw);
            if (!Array.isArray(list) || list.length === 0) return;
            let newest = null;
            let newestTs = 0;
            for (let i = Math.max(0, list.length - 12); i < list.length; i++) {
                const item = list[i];
                if (!item || typeof item !== "object") continue;
                const rawT = Number(item.time ?? item.ts ?? item.timestamp ?? item.updatedAt ?? 0);
                const t = rawT > 0 && rawT < 1e11 ? rawT * 1000 : rawT;
                if (t > newestTs) {
                    newestTs = t;
                    newest = item;
                }
            }
            if (!newest || !(newestTs > root._bootMs) || (Date.now() - newestTs) > 15000) return;
            const sig = String(newest.id ?? "") + ":" + String(newest.appName ?? "") + ":" + String(Math.floor(newestTs / 1000));
            if (sig === root._lastToastSig) return;
            root._lastToastSig = sig;
            root.emitExternalToast(String(newest.appName ?? "Notification"), root._normalizeUrgency(newest.urgency), false);
        } catch (e) {
            return;
        }
    }

    function _evaluatePower(): void {
        if (!root.hasBattery) {
            root._lastLowBatteryTier = 0;
            return;
        }
        const plugged = root.isPluggedIn;
        if (!root._powerBaselineReady) {
            root._powerBaselineReady = true;
            root._prevPluggedIn = plugged;
        } else if (plugged !== root._prevPluggedIn) {
            root._prevPluggedIn = plugged;
            root.powerPluggedChanged(plugged, root.batteryLevel);
        }

        if (plugged) {
            root._lastLowBatteryTier = 0;
            return;
        }
        const pct = Math.round(root.batteryLevel * 100);
        const tier = pct <= 10 ? 10 : (pct <= 20 ? 20 : 0);
        if (tier > 0 && tier !== root._lastLowBatteryTier) {
            root._lastLowBatteryTier = tier;
            root.lowBatteryWarn(root.batteryLevel);
        } else if (tier === 0 && pct >= 24) {
            root._lastLowBatteryTier = 0;
        }
    }

    onHasBatteryChanged: _evaluatePower()
    onIsPluggedInChanged: _evaluatePower()
    onBatteryLevelChanged: _evaluatePower()

    Process {
        id: thermalProbe
        command: [
            "sh", "-c",
            "for d in /sys/class/hwmon/hwmon*; do " +
            "[ -r \"$d/name\" ] && [ -r \"$d/temp1_input\" ] || continue; " +
            "read -r n < \"$d/name\" || continue; " +
            "case \"$n\" in k10temp|zenpower|coretemp|cpu_thermal|x86_pkg_temp) printf '%s\\n' \"$d/temp1_input\"; exit 0;; esac; " +
            "done; " +
            "[ -r /sys/class/thermal/thermal_zone0/temp ] && printf '%s\\n' /sys/class/thermal/thermal_zone0/temp || true"
        ]
        stdout: SplitParser {
            onRead: function(line) {
                const trimmed = line.trim();
                if (trimmed.length > 0 && root._thermalPath.length === 0) {
                    root._thermalPath = trimmed;
                    tempFile.reload();
                }
            }
        }
    }

    Timer {
        interval: 6000
        running: root.activeSampling
        repeat: true
        triggeredOnStart: true
        onRunningChanged: {
            if (running) root._lastWallClockMs = Date.now();
        }
        onTriggered: {
            const now = Date.now();
            const wallGap = now - root._lastWallClockMs;
            root._lastWallClockMs = now;
            if (wallGap > 180000) {
                root._heavyLoadSinceMs = 0;
                root._updateSolarPhase();
                customWeatherFile.reload();
                panguWeatherFile.reload();
                root.systemResumed(wallGap / 1000);
            }
            cpuFile.reload();
            memFile.reload();
            if (root._thermalPath.length > 0) tempFile.reload();
        }
    }

    Timer {
        interval: 240000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: {
            root._updateSolarPhase();
            customWeatherFile.reload();
            panguWeatherFile.reload();
            root._refreshWeather();
        }
    }

    FileView {
        id: cpuFile
        path: "/proc/stat"
        printErrors: false
        onLoaded: {
            const m = text().match(/^cpu\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
            if (!m) return;
            let total = 0;
            const stats = [];
            for (let i = 1; i <= 7; i++) {
                const v = parseInt(m[i], 10) || 0;
                stats.push(v);
                total += v;
            }
            const idle = stats[3] + (stats[4] || 0);
            const dt = total - root._lastCpuTotal;
            const di = idle - root._lastCpuIdle;
            if (dt > 0 && root._lastCpuTotal > 0) {
                root.cpuUsage = 1 - di / dt;
                const now = Date.now();
                if (root.cpuUsage >= 0.56) {
                    if (root._heavyLoadSinceMs <= 0) root._heavyLoadSinceMs = now;
                } else if (root.cpuUsage < 0.24 && root._heavyLoadSinceMs > 0) {
                    const durMs = now - root._heavyLoadSinceMs;
                    root._heavyLoadSinceMs = 0;
                    if (durMs >= 42000 && (now - root._lastBuildSignalMs) > 180000) {
                        root._lastBuildSignalMs = now;
                        root.buildCompleted(durMs / 1000);
                    }
                } else if (root.cpuUsage < 0.36 && root._heavyLoadSinceMs > 0
                           && (now - root._heavyLoadSinceMs) < 18000) {
                    root._heavyLoadSinceMs = 0;
                }
            }
            root._lastCpuTotal = total;
            root._lastCpuIdle = idle;
        }
    }

    FileView {
        id: memFile
        path: "/proc/meminfo"
        printErrors: false
        onLoaded: {
            const txt = text();
            const total = parseInt((txt.match(/MemTotal:\s*(\d+)/) || [])[1] || "1", 10);
            const avail = parseInt((txt.match(/MemAvailable:\s*(\d+)/) || [])[1] || "0", 10);
            if (total > 0) root.memUsage = (total - avail) / total;
        }
    }

    FileView {
        id: tempFile
        path: root._thermalPath
        printErrors: false
        onLoaded: {
            const milli = parseInt(text().trim(), 10);
            if (Number.isFinite(milli) && milli > 0) {
                root.cpuTempC = milli > 250 ? (milli / 1000) : milli;
                root.hasThermalSensor = true;
            }
        }
    }

    FileView {
        id: customWeatherFile
        path: root._customWeatherPath
        watchChanges: true
        printErrors: false
        onLoaded: root._refreshWeather()
        onFileChanged: reload()
    }

    FileView {
        id: panguWeatherFile
        path: root._panguWeatherPath
        watchChanges: true
        printErrors: false
        onLoaded: {
            if (!root._customWeatherFresh) root._refreshWeather();
        }
        onFileChanged: reload()
    }

    FileView {
        id: customToastFile
        path: root._customToastPath
        watchChanges: true
        printErrors: false
        onLoaded: root._ingestToastJson(text())
        onFileChanged: reload()
    }

    FileView {
        id: panguToastFile
        path: root._panguToastPath
        watchChanges: true
        printErrors: false
        onLoaded: root._ingestToastJson(text())
        onFileChanged: reload()
    }

    FileView {
        id: panguNotificationsFile
        path: root._panguNotificationsPath
        watchChanges: true
        printErrors: false
        onLoaded: root._ingestNotificationsListJson(text())
        onFileChanged: reload()
    }

    Component.onCompleted: {
        root._bootMs = Date.now();
        root._lastWallClockMs = root._bootMs;
        root._updateSolarPhase();
        root._evaluatePower();
        thermalProbe.running = true;
    }
}
