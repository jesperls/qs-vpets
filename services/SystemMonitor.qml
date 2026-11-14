pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

Singleton {
    id: root

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

    property string solarPhase: "day"
    property string weatherKind: "clear"
    property real outdoorTempC: 16
    property bool weatherAvailable: false
    readonly property bool isRaining: weatherKind === "rain" || weatherKind === "storm"
    readonly property bool isSnowing: weatherKind === "snow"

    signal buildCompleted(durationSec: real)

    property real _lastCpuTotal: 0
    property real _lastCpuIdle: 0
    property string _thermalPath: ""
    property double _heavyLoadSinceMs: 0
    property double _lastBuildSignalMs: 0
    property string _sunrise: ""
    property string _sunset: ""

    readonly property string _cacheBase: {
        const xdg = Quickshell.env("XDG_CACHE_HOME");
        return (xdg && xdg.length > 0) ? xdg : (Quickshell.env("HOME") + "/.cache");
    }
    readonly property string _customWeatherPath: {
        const envFile = Quickshell.env("QS_VPETS_WEATHER_FILE");
        return (envFile && envFile.length > 0) ? envFile : (_cacheBase + "/qs-vpets/weather.json");
    }
    readonly property string _panguWeatherPath: _cacheBase + "/pangu/weather.json"

    function _parseClockHour(hhmm: string, fallback: real): real {
        if (!hhmm || hhmm.indexOf(":") === -1) return fallback;
        const parts = hhmm.split(":");
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
        return h + m / 60;
    }

    function _updateSolarPhase(): void {
        const now = new Date();
        const hr = now.getHours() + now.getMinutes() / 60;
        const rise = _parseClockHour(root._sunrise, 6.25);
        const set = _parseClockHour(root._sunset, 19.25);
        if (hr >= rise - 0.85 && hr < rise + 1.35) root.solarPhase = "dawn";
        else if (hr >= rise + 1.35 && hr < set - 1.1) root.solarPhase = "day";
        else if (hr >= set - 1.1 && hr < set + 1.1) root.solarPhase = "dusk";
        else root.solarPhase = "night";
    }

    function _classifyWeatherCode(code: int): string {
        if (code <= 1) return "clear";
        if (code <= 48) return "clouds";
        if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
        if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return "snow";
        if (code >= 95) return "storm";
        return "clear";
    }

    function _ingestWeatherJson(raw: string): bool {
        if (!raw || !raw.trim()) return false;
        try {
            const d = JSON.parse(raw);
            if (!d || typeof d !== "object") return false;
            if (d.updatedAt && (Date.now() - Number(d.updatedAt)) > 3 * 3600 * 1000) return false;
            if (typeof d.weatherKind === "string" && d.weatherKind.length > 0) {
                root.weatherKind = d.weatherKind;
            } else if (d.weatherCode !== undefined) {
                root.weatherKind = root._classifyWeatherCode( parseInt(d.weatherCode, 10) || 0 );
            }
            if (d.tempC !== undefined && Number.isFinite(Number(d.tempC))) {
                root.outdoorTempC = Number(d.tempC);
            }
            if (typeof d.sunrise === "string") root._sunrise = d.sunrise;
            if (typeof d.sunset === "string") root._sunset = d.sunset;
            root.weatherAvailable = true;
            root._updateSolarPhase();
            return true;
        } catch (e) {
            return false;
        }
    }

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
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: {
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
        printErrors: false
        onLoaded: root._ingestWeatherJson(text())
    }

    FileView {
        id: panguWeatherFile
        path: root._panguWeatherPath
        printErrors: false
        onLoaded: {
            if (!customWeatherFile.text() || !customWeatherFile.text().trim()) {
                root._ingestWeatherJson(text());
            }
        }
    }

    Component.onCompleted: {
        root._updateSolarPhase();
        thermalProbe.running = true;
    }
}
