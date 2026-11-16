pragma Singleton
pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Services.Mpris
import Quickshell.Services.Pipewire

Singleton {
    id: root

    signal musicStarted(title: string, artist: string)
    signal musicPausedAbruptly(title: string, artist: string)
    signal micStateChanged(active: bool)
    signal audioVolumeSpiked(volume: real)
    signal audioMuteChanged(muted: bool)

    PwObjectTracker {
        objects: Pipewire.nodes.values
    }

    readonly property var activePlayer: {
        const players = Mpris.players.values;
        for (let i = 0; i < players.length; i++) {
            if (players[i] && players[i].playbackState === MprisPlaybackState.Playing) {
                return players[i];
            }
        }
        return players.length > 0 ? players[0] : null;
    }

    readonly property bool isPlaying: activePlayer !== null && activePlayer.playbackState === MprisPlaybackState.Playing
    readonly property string trackTitle: activePlayer?.trackTitle ?? ""
    readonly property string trackArtist: activePlayer?.trackArtist ?? ""

    readonly property bool audioMuted: !!(Pipewire.defaultAudioSink?.audio?.muted)
    readonly property real audioVolume: Number(Pipewire.defaultAudioSink?.audio?.volume ?? 0)

    readonly property bool micActive: {
        if (Pipewire.defaultAudioSource?.audio?.muted) return false;
        const nodes = Pipewire.nodes.values;
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            if (!n || !n.isStream || n.isSink) continue;
            if (!n.audio || n.audio.muted) continue;
            const props = n.properties ?? ({});
            const mediaClass = String(props["media.class"] ?? "");
            if (mediaClass.length > 0 && mediaClass !== "Stream/Input/Audio") continue;
            if (String(props["stream.capture.sink"] ?? "") === "true") continue;
            const app = String(props["application.name"] ?? props["node.name"] ?? n.name ?? "").toLowerCase();
            if (!app) continue;
            if (/(peak detect|pavucontrol|quickshell|easyeffects|cava|gpu-screen-recorder|pangu|helvum|pwvucontrol)/.test(app)) {
                continue;
            }
            return true;
        }
        return false;
    }

    property bool _wasPlaying: false
    property double _playStartedMs: 0
    property string _lastTrack: ""
    property string _lastArtist: ""
    property bool _audioReady: false
    property bool _prevMuted: false
    property real _prevVolume: 0
    property double _lastSpikeEmitMs: 0

    onMicActiveChanged: root.micStateChanged(root.micActive)

    onAudioMutedChanged: {
        if (!root._audioReady) return;
        const wasMuted = root._prevMuted;
        root._prevMuted = root.audioMuted;
        root.audioMuteChanged(root.audioMuted);
        if (wasMuted && !root.audioMuted && root.audioVolume >= 0.56 && root.isPlaying) {
            const now = Date.now();
            if (now - root._lastSpikeEmitMs > 30000) {
                root._lastSpikeEmitMs = now;
                root.audioVolumeSpiked(root.audioVolume);
            }
        }
    }

    onAudioVolumeChanged: {
        if (!root._audioReady) return;
        const delta = root.audioVolume - root._prevVolume;
        root._prevVolume = root.audioVolume;
        if (!root.audioMuted && delta >= 0.22 && root.audioVolume >= 0.45) {
            const now = Date.now();
            if (now - root._lastSpikeEmitMs > 30000) {
                root._lastSpikeEmitMs = now;
                root.audioVolumeSpiked(root.audioVolume);
            }
        }
    }

    onIsPlayingChanged: {
        const now = Date.now();
        if (isPlaying && !_wasPlaying) {
            _playStartedMs = now;
            _lastTrack = root.trackTitle;
            _lastArtist = root.trackArtist;
            root.musicStarted(root.trackTitle, root.trackArtist);
        } else if (!isPlaying && _wasPlaying) {
            if (_playStartedMs > 0 && (now - _playStartedMs) >= 2500) {
                root.musicPausedAbruptly(_lastTrack, _lastArtist);
            }
            _playStartedMs = 0;
        }
        _wasPlaying = isPlaying;
    }

    onTrackTitleChanged: {
        if (isPlaying && trackTitle.length > 0 && trackTitle !== _lastTrack) {
            _lastTrack = trackTitle;
            _lastArtist = trackArtist;
            _playStartedMs = Date.now();
            root.musicStarted(root.trackTitle, root.trackArtist);
        }
    }

    Component.onCompleted: {
        root._prevMuted = root.audioMuted;
        root._prevVolume = root.audioVolume;
        root._audioReady = true;
    }
}
