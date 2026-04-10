pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Services.Mpris
import "../config"

Singleton {
    id: root

    readonly property var active: {
        const players = Mpris.players.values ?? [];
        return players.find(p => p.playbackState === MprisPlaybackState.Playing) ?? players[0] ?? null;
    }
    readonly property bool isPlaying: active?.playbackState === MprisPlaybackState.Playing
    readonly property string trackTitle: active?.trackTitle ?? ""

    signal trackChanged(title: string, artist: string)
    signal playbackStarted
    signal playbackStopped

    property bool _wasPlaying: false
    property string _lastTrack: ""

    Timer {
        interval: 500; running: true; repeat: true
        onTriggered: {
            const nowPlaying = root.isPlaying;
            if (nowPlaying && !root._wasPlaying) root.playbackStarted();
            else if (!nowPlaying && root._wasPlaying) root.playbackStopped();
            root._wasPlaying = nowPlaying;

            const current = root.trackTitle;
            if (current && current !== root._lastTrack) {
                root._lastTrack = current;
                root.trackChanged(root.trackTitle, root.active?.trackArtist ?? "");
            }
        }
    }
}
