pragma ComponentBehavior: Bound

import QtQuick
import Quickshell.Io
import "../config"
import "../components/behavior/Evolution.js" as Evolution

IpcHandler {
    id: root
    target: "vpets"

    function status(): string {
        const sanctuaryList = [];
        for (let i = 0; i < Config.pets.length; i++) {
            const cfg = Config.pets[i];
            if (!PetManager.isRoaming(cfg.id)) {
                const rec = PetManager.residentFor(cfg.id);
                const evo = rec && rec.stateObj
                    ? Evolution.evaluate(rec.stateObj, cfg.sprite)
                    : { ready: false, options: [] };
                sanctuaryList.push({
                    id: cfg.id,
                    name: cfg.name,
                    species: cfg.sprite,
                    roamMode: cfg.roamMode || "auto",
                    archetype: rec ? rec.archetype : "Curious Hatchling",
                    state: rec ? rec.penState : "idle",
                    activity: (rec && rec.sanctuaryActivity) ? rec.sanctuaryActivity : "Resting in Sanctuary",
                    mood: Math.round((rec ? rec.mood : 0.56) * 100),
                    energy: Math.round((1 - (rec ? rec.restDrive : 0.14)) * 100),
                    bond: Math.round((rec ? rec.bond : 0.3) * 100),
                    evolutionReady: evo.ready ? evo.options.map(o => o.species) : []
                });
            }
        }
        return JSON.stringify({
            hidden: PetManager.hidden,
            penVisible: PetManager.penVisible,
            sanctuaryCamp: Config.sanctuaryCamp,
            maxActiveRoaming: Config.maxActiveRoaming,
            totalCount: Config.pets.length,
            roamingCount: PetManager.pets.length,
            sanctuaryCount: sanctuaryList.length,
            pets: PetManager.pets.map(p => {
                const evo = Evolution.evaluate(p, p.petData.sprite);
                return {
                    id: p.petData.id,
                    name: p.petData.name,
                    species: p.petData.sprite,
                    roamMode: p.petData.roamMode || "auto",
                    archetype: p.archetype,
                    state: p.state_,
                    mood: Math.round(p.mood * 100),
                    bond: Math.round(p.bond * 100),
                    trust: Math.round(p.trust * 100),
                    plan: p.activePlan ? p.activePlan.label : "Idle",
                    thought: p.lastThoughtText,
                    quirks: p.quirks,
                    evolutionReady: evo.ready ? evo.options.map(o => o.species) : []
                };
            }),
            sanctuary: sanctuaryList
        }, null, 2);
    }

    function open(): string {
        PetManager.hidden = false;
        PetManager.openPen();
        return "opened";
    }

    function pen(): string {
        PetManager.togglePen();
        return PetManager.penVisible ? "opened" : "closed";
    }

    function flush(): string {
        PetManager.flushAll();
        return "flushed";
    }

    function toggle(): string {
        PetManager.hidden = !PetManager.hidden;
        if (PetManager.hidden) PetManager.closeInspector();
        return PetManager.hidden ? "hidden" : "visible";
    }

    function pet(name: string): string {
        const lp = PetManager.findPet(name);
        if (lp) {
            lp.onStroked();
            return "petted " + lp.petData.name;
        }
        const cfg = PetManager.findConfigPet(name);
        const rec = cfg ? PetManager.residentFor(cfg.id) : null;
        if (cfg && rec) {
            rec.patInPen();
            return "petted " + cfg.name + " in Sanctuary";
        }
        return "not found";
    }

    function feed(name: string): string {
        const lp = PetManager.findPet(name);
        if (lp) {
            lp.onFed();
            return "fed " + lp.petData.name;
        }
        const cfg = PetManager.findConfigPet(name);
        const rec = cfg ? PetManager.residentFor(cfg.id) : null;
        if (cfg && rec) {
            rec.feedInPen();
            return "fed " + cfg.name + " in Sanctuary";
        }
        return "not found";
    }

    function play(name: string): string {
        const lp = PetManager.findPet(name);
        if (lp) {
            lp.onPlayTriggered();
            return "playing with " + lp.petData.name;
        }
        const cfg = PetManager.findConfigPet(name);
        const rec = cfg ? PetManager.residentFor(cfg.id) : null;
        if (cfg && rec) {
            rec.playInPen();
            return "played with " + cfg.name + " in Sanctuary";
        }
        return "not found";
    }

    function summon(name: string): string {
        const lp = PetManager.findPet(name);
        if (lp) {
            lp.summonToCursor();
            return "summoned " + lp.petData.name;
        }
        const cfg = PetManager.findConfigPet(name);
        if (cfg) {
            PetManager.callOutNow(cfg.id);
            return "called " + cfg.name + " out from Sanctuary";
        }
        return "not found";
    }

    function roam(name: string, mode: string): string {
        const cfg = PetManager.findConfigPet(name);
        if (!cfg) return "not found";
        const m = String(mode || "").trim().toLowerCase();
        if (m === "out" || m === "call") {
            PetManager.callOutNow(cfg.id);
            return cfg.name + " called out to roam";
        }
        if (m === "in" || m === "pen") {
            PetManager.sendToPenNow(cfg.id, false);
            return cfg.name + " sent to Sanctuary";
        }
        if (m !== "auto" && m !== "always" && m !== "penned") {
            return "invalid mode (use auto, always, penned, out, or in)";
        }
        Config.updatePetRoamMode(cfg.id, m);
        return cfg.name + " roamMode=" + m;
    }

    function rename(oldName: string, newName: string): string {
        const updated = PetManager.renameCompanion(oldName, newName);
        if (!updated) return "rename failed";
        return "renamed to " + updated;
    }

    function inspect(name: string): string {
        const lp = PetManager.findPet(name);
        if (lp) {
            PetManager.toggleInspector(lp);
            return PetManager.inspectedPet === lp ? ("opened " + lp.petData.name) : "closed";
        }
        const cfg = PetManager.findConfigPet(name);
        if (cfg) {
            PetManager.openPen(cfg.id);
            return "opened Sanctuary for " + cfg.name;
        }
        return "not found";
    }

    function spawn(species: string, name: string): string {
        const added = Config.addPet(species, name, "");
        return "spawned " + added.name + " (" + added.sprite + ")";
    }

    function release(name: string): string {
        const cfg = PetManager.findConfigPet(name);
        if (!cfg) return "not found";
        if (Config.pets.length <= 1) return "cannot release last companion";
        const label = cfg.name;
        return PetManager.releaseCompanion(cfg.id) ? ("released " + label) : "release failed";
    }

    function evolve(name: string, species: string): string {
        const cfg = PetManager.findConfigPet(name);
        if (!cfg) return "not found";
        const evolvedName = PetManager.evolveCompanion(cfg.id, species || "");
        if (!evolvedName) {
            const lp = PetManager.findPetById(cfg.id);
            const rec = PetManager.residentFor(cfg.id);
            const evo = Evolution.evaluate(lp || (rec ? rec.stateObj : null), cfg.sprite);
            if (!evo.hasLine) return cfg.name + " does not have an evolution line";
            if (!evo.ready) return cfg.name + " is not ready to evolve yet (" + evo.nextHint + ")";
            return "invalid target form (ready: " + evo.options.map(o => o.species).join(", ") + ")";
        }
        return "evolved " + cfg.name + " into " + evolvedName;
    }

    function notify(appName: string, urgency: string): string {
        SystemMonitor.emitExternalToast(appName || "Desktop", urgency || "normal", false);
        return "notified";
    }

    function quit(): string {
        PetManager.flushAll();
        Qt.callLater(() => Qt.quit());
        return "quitting";
    }
}
