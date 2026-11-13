.import "Memory.js" as Memory
.import "Drives.js" as Drives

function greet(pet, other) {
    var oName = other.petData.name;
    Memory.adjustRelation(pet, oName, 0.012, 0.06);
    Memory.recordEpisode(pet, "greeted", { valence: 0.25, withPet: oName });
    Memory.thinkAloud(pet, "greet", "Sniffed hello to " + oName);
    pet.socialDrive = Math.max(0, pet.socialDrive - 0.18);
    pet.mood = Drives.clamp01(pet.mood + 0.04);
    other.socialEvent("greet", pet);
}

function invitePlay(pet, other) {
    var oName = other.petData.name;
    Memory.adjustRelation(pet, oName, 0.014, 0.06, "play");
    Memory.recordEpisode(pet, "played_with", { valence: 0.4, withPet: oName });
    Memory.thinkAloud(pet, "play_invite", "Play-bowed to " + oName);
    pet.socialDrive = Math.max(0, pet.socialDrive - 0.14);
    pet.mood = Drives.clamp01(pet.mood + 0.05);
    Drives.happier(pet, 0.025);
    other.socialEvent("invite", pet);
}

function startChase(pet, other) {
    var oName = other.petData.name;
    Memory.adjustRelation(pet, oName, 0.018, 0.07, "play");
    Memory.recordEpisode(pet, "chase_bout", { valence: 0.5, salience: 0.65, withPet: oName });
    Memory.thinkAloud(pet, "chase", "Chasing " + oName + " in a game of tag");
    pet.playDrive = Math.max(0, pet.playDrive - 0.24);
    pet.socialDrive = Math.max(0, pet.socialDrive - 0.16);
    pet.mood = Drives.clamp01(pet.mood + 0.07);
    Drives.happier(pet, 0.03);
    if (pet.emitEmote) pet.emitEmote("!");
    other.socialEvent("chase", pet);
}

function syncGroove(pet, other) {
    var oName = other.petData.name;
    Memory.adjustRelation(pet, oName, 0.015, 0.05, "play");
    Memory.recordEpisode(pet, "music_groove", { valence: 0.45, music: true, withPet: oName });
    pet.mood = Drives.clamp01(pet.mood + 0.05);
    other.socialEvent("groove", pet);
}

function shareDiscovery(pet, other, topic) {
    var oName = other.petData.name;
    Memory.adjustRelation(pet, oName, 0.016, 0.06);
    Memory.recordEpisode(pet, "greeted", { valence: 0.35, withPet: oName, note: topic || "story" });
    Memory.thinkAloud(pet, "story", "Checked in happily with " + oName);
    pet.socialDrive = Math.max(0, pet.socialDrive - 0.22);
    pet.mood = Drives.clamp01(pet.mood + 0.05);
    other.socialEvent("story", pet, { topic: topic || "adventure" });
}

function restBeside(pet, other) {
    var oName = other.petData.name;
    var rel = Memory.relationWith(pet, oName, other.personality);
    var bonus = rel.affinity < 0.4 ? 0.025 : 0.016; // Shared naps soften rivalries
    Memory.adjustRelation(pet, oName, bonus, 0.05, "nap");
    Memory.recordEpisode(pet, "rested_with", { valence: 0.4, withPet: oName });
    Memory.thinkAloud(pet, "nap_buddy", "Settled down beside " + oName);
    pet.mood = Drives.clamp01(pet.mood + 0.04);
    other.socialEvent("cuddle", pet);
}

function annoy(pet, other) {
    var oName = other.petData.name;
    Memory.adjustRelation(pet, oName, -0.025, 0.03, "friction");
    Memory.recordEpisode(pet, "annoyed", { valence: -0.35, withPet: oName });
    Memory.thinkAloud(pet, "annoy", "Wanted personal space from " + oName);
    pet.mood = Math.max(0, pet.mood - 0.03);
    other.socialEvent("annoy", pet);
}

function pounce(pet, other) {
    var oName = other.petData.name;
    Memory.adjustRelation(pet, oName, 0.005, 0.05, "play");
    Memory.recordEpisode(pet, "pounced", { valence: 0.35, withPet: oName });
    Memory.thinkAloud(pet, "pounce", "Play-pounced " + oName);
    pet.playDrive = Math.max(0, pet.playDrive - 0.18);
    pet.socialDrive = Math.max(0, pet.socialDrive - 0.08);
    pet.mood = Drives.clamp01(pet.mood + 0.05);
    Drives.happier(pet, 0.02);
    other.socialEvent("pounce", pet);
}

function sparBack(pet, other) {
    var oName = other.petData.name;
    Memory.adjustRelation(pet, oName, 0.018, 0.06, "play");
    Memory.recordEpisode(pet, "sparred", { valence: 0.45, withPet: oName });
    Memory.thinkAloud(pet, "spar", "Tumbled playfully with " + oName);
    pet.playDrive = Math.max(0, pet.playDrive - 0.16);
    pet.mood = Drives.clamp01(pet.mood + 0.06);
    Drives.happier(pet, 0.025);
    other.socialEvent("spar", pet);
}

function rebuff(pet, other) {
    var oName = other.petData.name;
    Memory.adjustRelation(pet, oName, -0.022, 0.03, "friction");
    Memory.recordEpisode(pet, "annoyed_by", { valence: -0.4, withPet: oName });
    Memory.thinkAloud(pet, "rebuff", "Brushed off " + oName);
    pet.mood = Math.max(0, pet.mood - 0.06);
    if (pet.emitEmote) pet.emitEmote("💢");
    other.socialEvent("rebuff", pet);
}

function illusionSurprise(pet, other) {
    var oName = other.petData.name;
    Memory.adjustRelation(pet, oName, 0.015, 0.06, "play");
    Memory.recordEpisode(pet, "illusion_prank", { valence: 0.48, withPet: oName });
    Memory.thinkAloud(pet, "illusion", "Surprised " + oName + " with a shadow Illusion!");
    pet.playDrive = Math.max(0, pet.playDrive - 0.24);
    pet.mood = Drives.clamp01(pet.mood + 0.07);
    Drives.happier(pet, 0.03);
    other.socialEvent("illusion", pet);
}
