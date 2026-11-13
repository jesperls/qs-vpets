pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Services.Mpris

Singleton {
    id: root

    signal musicStarted(title: string, artist: string)

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

    property bool _wasPlaying: false
    property string _lastTrack: ""

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
