//@ pragma Env QS_NO_RELOAD_POPUP=1
//@ pragma Env QSG_RENDER_LOOP=threaded

import QtQuick
import Quickshell
import "services"
import "config"
import "components"

ShellRoot {
    id: root

    property var petList: []

    Variants {
        model: root.petList

        PetWindow {
            required property var modelData
            petData: modelData
            screen: {
                if (modelData.monitor) {
                    const match = Quickshell.screens.find(s => s.name === modelData.monitor);
                    if (match) return match;
                }
                return Quickshell.screens[0];
            }
        }
    }

    // Freeze pet list once config is loaded
    Connections {
        target: Config
        function onConfigReady(): void {
            root.petList = Config.pets.map(p => Object.assign({}, p));
        }
    }
}
