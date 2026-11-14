pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Services.Mpris
import Quickshell.Services.Pipewire

Singleton {
    id: root

    signal musicStarted(title: string, artist: string)
    signal micStateChanged(active: bool)

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

    readonly property bool micActive: {
        if (Pipewire.defaultAudioSource?.audio?.muted) return false;
        const nodes = Pipewire.nodes.values;
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            if (!n || !n.isStream || n.isSink) continue;
            if (n.audio && n.audio.muted) continue;
            const props = n.properties ?? ({});
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
    property string _lastTrack: ""

    onMicActiveChanged: root.micStateChanged(root.micActive)

    onIsPlayingChanged: {
        if (isPlaying && !_wasPlaying) {
            root.musicStarted(root.trackTitle, root.trackArtist);
        }
        _wasPlaying = isPlaying;
    }

    onTrackTitleChanged: {
        if (isPlaying && trackTitle.length > 0 && trackTitle !== _lastTrack) {
            _lastTrack = trackTitle;
            root.musicStarted(root.trackTitle, root.trackArtist);
        }
    }
}
