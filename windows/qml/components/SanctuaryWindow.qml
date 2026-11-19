pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Window
import WinPlatform
import "../services"

Window {
    id: root

    flags: Qt.Window | Qt.FramelessWindowHint
    width: 1080
    height: 700
    minimumWidth: 860
    minimumHeight: 560
    visible: true
    title: "Pokémon Sanctuary"
    color: "transparent"

    function _centerOnActiveScreen(): void {
        const screens = WindowTracker.realScreens;
        if (screens.length === 0) return;
        let target = screens[0];
        if (InputTracker.cursorKnown) {
            const cx = InputTracker.cursorX;
            const cy = InputTracker.cursorY;
            for (let i = 0; i < screens.length; i++) {
                const s = screens[i];
                if (cx >= s.x && cx < s.x + s.width && cy >= s.y && cy < s.y + s.height) {
                    target = s;
                    break;
                }
            }
        }
        const topIn = target.topInset || 0;
        const botIn = target.bottomInset || 0;
        const leftIn = target.leftInset || 0;
        const rightIn = target.rightInset || 0;
        const availW = Math.max(860, target.width - leftIn - rightIn - 48);
        const availH = Math.max(560, target.height - topIn - botIn - 36);
        root.width = Math.min(1080, availW);
        root.height = Math.min(700, availH);
        root.x = Math.round(target.x + leftIn + (target.width - leftIn - rightIn - root.width) * 0.5);
        root.y = Math.round(target.y + topIn + (target.height - topIn - botIn - root.height) * 0.5);
    }

    Shortcut {
        sequence: StandardKey.Close
        context: Qt.WindowShortcut
        onActivated: PetManager.closePen()
    }

    Component.onCompleted: {
        _centerOnActiveScreen();
        WinPlatform.configureSanctuaryWindow(root);
        Qt.callLater(() => WinPlatform.activateSanctuaryWindow(root));
    }

    Connections {
        target: WinPlatform
        function onOpenSanctuaryRequested(): void {
            root._centerOnActiveScreen();
            WinPlatform.activateSanctuaryWindow(root);
        }
    }

    onClosing: close => {
        close.accepted = true;
        PetManager.closePen();
    }

    SanctuaryContent {
        enableHeaderDrag: true
        onHeaderDragStarted: root.startSystemMove()
    }
}
