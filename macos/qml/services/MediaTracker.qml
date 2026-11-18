pragma Singleton
pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import MacPlatform

Singleton {
    id: root

    signal musicStarted(title: string, artist: string)
    signal musicPausedAbruptly(title: string, artist: string)
    signal micStateChanged(active: bool)
    signal audioVolumeSpiked(volume: real)
    signal audioMuteChanged(muted: bool)

    readonly property bool isPlaying: MacPlatform.isPlaying
    readonly property string trackTitle: MacPlatform.trackTitle
    readonly property string trackArtist: MacPlatform.trackArtist
    readonly property bool audioMuted: MacPlatform.audioMuted
    readonly property real audioVolume: MacPlatform.audioVolume
    readonly property bool micActive: MacPlatform.micActive

    property bool _wasPlaying: false
    property double _playStartedMs: 0
    property string _lastTrack: ""
    property string _lastArtist: ""
    property bool _audioReady: false
    property bool _prevMuted: false
    property real _prevVolume: 0
    property double _lastSpikeEmitMs: 0

    onMicActiveChanged: {
        if (!root._audioReady) return;
        root.micStateChanged(root.micActive);
    }

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
            _wasPlaying = true;
            _playStartedMs = now;
            _lastTrack = trackTitle;
            _lastArtist = trackArtist;
            musicStarted(trackTitle, trackArtist);
        } else if (!isPlaying && _wasPlaying) {
            _wasPlaying = false;
            if (_playStartedMs > 0 && (now - _playStartedMs) >= 12000) {
                musicPausedAbruptly(_lastTrack, _lastArtist);
            }
        }
    }

    onTrackTitleChanged: {
        if (isPlaying && trackTitle) {
            _lastTrack = trackTitle;
            _lastArtist = trackArtist;
        }
    }

    Timer {
        interval: 1500
        running: !root._audioReady
        onTriggered: {
            root._prevMuted = root.audioMuted;
            root._prevVolume = root.audioVolume;
            root._audioReady = true;
        }
    }
}
