.pragma library

function capitalize(word) {
    if (!word) return "";
    var s = String(word);
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function policyShortLabel(mode) {
    if (mode === "always") return "Always";
    if (mode === "penned") return "Sanctuary";
    return "Auto";
}

function formatAge(sec) {
    var s = Math.max(0, Math.floor(Number(sec) || 0));
    if (s < 3600) return Math.max(1, Math.floor(s / 60)) + "m";
    if (s < 86400) return Math.floor(s / 3600) + "h";
    return Math.floor(s / 86400) + "d " + Math.floor((s % 86400) / 3600) + "h";
}

function formatAgo(ts, nowMs) {
    var t = Number(ts) || 0;
    if (t <= 0) return "";
    var ref = Number(nowMs) || Date.now();
    var sec = Math.max(0, Math.floor((ref - t) / 1000));
    if (sec < 45) return "now";
    if (sec < 3600) return Math.floor(sec / 60) + "m";
    if (sec < 86400) return Math.floor(sec / 3600) + "h";
    return Math.floor(sec / 86400) + "d";
}

function companionSpecies(pets, name, rel) {
    if (Array.isArray(pets) && name) {
        for (var i = 0; i < pets.length; i++) {
            if (pets[i] && pets[i].name === name && pets[i].sprite) {
                return pets[i].sprite;
            }
        }
    }
    if (rel && rel.species) return rel.species;
    return "zorua";
}

function companionId(pets, name) {
    if (!Array.isArray(pets) || !name) return "";
    for (var i = 0; i < pets.length; i++) {
        if (pets[i] && pets[i].name === name) return pets[i].id || "";
    }
    return "";
}
