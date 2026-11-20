.pragma library

.import "../SpeciesProfile.js" as SpeciesProfile
.import "../behavior/Drives.js" as Drives
.import "FriendAreas.js" as FriendAreas

function capitalize(word) {
    if (!word) return "";
    var s = String(word);
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function natureLabel(preset) {
    switch (preset) {
    case "emergent": return "Surprise Me";
    case "playful": return "Playful";
    case "curious": return "Curious";
    case "chill": return "Relaxed";
    case "lazy": return "Sleepy";
    case "energetic": return "Jolly";
    case "brave": return "Brave";
    case "shy": return "Bashful";
    case "nocturnal": return "Night Owl";
    case "grumpy": return "Aloof";
    default: return capitalize(preset);
    }
}

function togetherDuration(sec) {
    var s = Math.max(0, Math.floor(Number(sec) || 0));
    if (s < 300) return "Just welcomed today";
    if (s < 3600) {
        var mins = Math.max(1, Math.floor(s / 60));
        return "Together for " + mins + (mins === 1 ? " minute" : " minutes");
    }
    if (s < 86400) {
        var hrs = Math.floor(s / 3600);
        return "Together for " + hrs + (hrs === 1 ? " hour" : " hours");
    }
    var days = Math.floor(s / 86400);
    return "Together for " + days + (days === 1 ? " day" : " days");
}

function formatAgo(ts, nowMs) {
    var t = Number(ts) || 0;
    if (t <= 0) return "";
    var ref = Number(nowMs) || Date.now();
    var sec = Math.max(0, Math.floor((ref - t) / 1000));
    if (sec < 60) return "just now";
    if (sec < 3600) return Math.floor(sec / 60) + "m ago";
    if (sec < 86400) return Math.floor(sec / 3600) + "h ago";
    return Math.floor(sec / 86400) + "d ago";
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
    return SpeciesProfile.DEFAULT_SPECIES;
}

function companionId(pets, name) {
    if (!Array.isArray(pets) || !name) return "";
    for (var i = 0; i < pets.length; i++) {
        if (pets[i] && pets[i].name === name) return pets[i].id || "";
    }
    return "";
}

function friendshipInfo(bondVal) {
    var b = Number(bondVal);
    if (isNaN(b)) b = 0.30;
    if (b >= 0.84) return { full: 5, half: false, title: "Best Friends" };
    if (b >= 0.70) return { full: 4, half: true, title: "Devoted Partner" };
    if (b >= 0.56) return { full: 4, half: false, title: "Close Partner" };
    if (b >= 0.44) return { full: 3, half: true, title: "Trusted Pal" };
    if (b >= 0.32) return { full: 3, half: false, title: "Good Friend" };
    if (b >= 0.22) return { full: 2, half: true, title: "Warming Up" };
    if (b >= 0.12) return { full: 2, half: false, title: "Friendly" };
    return { full: 1, half: true, title: "Newcomer" };
}

function moodWord(src) {
    var m = (src && src.mood !== undefined) ? Number(src.mood) : 0.56;
    if (m >= 0.78) return { label: "Beaming", icon: "heartFill", tone: "love" };
    if (m >= 0.62) return { label: "Happy", icon: "spark", tone: "positive" };
    if (m >= 0.45) return { label: "Content", icon: "leaf", tone: "positive" };
    if (m >= 0.30) return { label: "Mellow", icon: "dream", tone: "warm" };
    return { label: "Wistful", icon: "heart", tone: "warm" };
}

function isStuffed(src, species) {
    var s = (src && src.satiety !== undefined) ? Number(src.satiety) : 0.58;
    var fullAt = Drives.fullThresholdFor(species || src);
    return s >= fullAt;
}

function bellyWord(src, species) {
    var s = (src && src.satiety !== undefined) ? Number(src.satiety) : 0.58;
    var fullAt = Drives.fullThresholdFor(species || src);
    if (s >= fullAt) return { label: "Stuffed", itemSprite: "oran_berry.png", icon: "", tone: "warm", notable: true };
    if (s >= 0.64) return { label: "Well-fed", itemSprite: "oran_berry.png", icon: "", tone: "positive", notable: false };
    if (s >= 0.44) return { label: "Content", itemSprite: "oran_berry.png", icon: "", tone: "accent", notable: false };
    return { label: "Light appetite", itemSprite: "oran_berry.png", icon: "", tone: "accent", notable: false };
}

function energyWord(src, stateStr) {
    var st = String(stateStr || "");
    var rd = (src && src.restDrive !== undefined) ? Number(src.restDrive) : 0.18;
    if (st === "deepsleep") return { label: "Dreaming", icon: "moon", tone: "lavender", notable: true };
    if (st === "laying" || st === "loaf" || st === "sit") {
        return { label: "Resting", icon: "moon", tone: "warm", notable: false };
    }
    if (rd >= 0.64) return { label: "Sleepy", icon: "moon", tone: "warm", notable: true };
    if (rd >= 0.42) return { label: "Cozy", icon: "leaf", tone: "warm", notable: false };
    if (rd <= 0.20) return { label: "Full of pep", icon: "sun", tone: "positive", notable: false };
    return { label: "Bright-eyed", icon: "sun", tone: "accent", notable: false };
}

function dialogueLine(name, src, isRoaming) {
    var petName = name || "Your companion";
    if (!src) return petName + " is relaxing quietly.";

    var restDrive = src.restDrive !== undefined ? Number(src.restDrive) : 0.18;
    var playDrive = src.playDrive !== undefined ? Number(src.playDrive) : 0.24;
    var mood = src.mood !== undefined ? Number(src.mood) : 0.56;
    var bond = src.bond !== undefined ? Number(src.bond) : 0.30;

    if (isRoaming) {
        var st = String(src.state_ || "idle");
        var planName = (src.activePlan && src.activePlan.name) ? String(src.activePlan.name) : "";

        if (st === "deepsleep") {
            return petName + " is fast asleep, breathing softly and dreaming away.";
        }
        if (st === "laying") {
            return petName + " stretched out comfortably and is taking a quiet breather.";
        }
        if (st === "loaf" || st === "sit") {
            return petName + " settled in closely to keep you cozy company.";
        }
        if (planName === "eat_berry" || planName === "forage_snack" || st === "eat") {
            return petName + " is happily munching on an Oran Berry!";
        }
        if (st === "perch" || planName === "window_perch" || planName === "ledge_parkour") {
            return petName + " hopped up onto a window ledge to watch over your desktop.";
        }
        if (planName === "supervise_work") {
            return petName + " settled quietly beside your active window while you work.";
        }
        if (planName === "music_groove" || planName === "sync_dance") {
            return petName + " is swaying happily along to the music!";
        }
        if (st === "zoomies" || planName === "zoomies" || planName === "static_dash") {
            return petName + " is darting around with a cheerful burst of energy!";
        }
        if (planName === "rest_with"
                || planName === "social_mingle"
                || planName === "welcome_friend"
                || planName === "best_friend_checkin"
                || planName === "play_tag"
                || planName === "flee_tag"
                || planName === "joint_retire") {
            var pal = src.activePlan.otherName || "a friend";
            return petName + " is spending a sweet moment with " + pal + ".";
        }
        if (restDrive > 0.64) {
            return petName + " blinks slowly and yawns, getting ready for a cozy nap.";
        }
        if (playDrive > 0.62) {
            return petName + " is bouncing in place, eager to play together!";
        }
        if (mood >= 0.74 && bond >= 0.52) {
            return petName + " looks completely at ease just hanging out near you.";
        }
        return petName + " is wandering curiously and taking in the desktop sights.";
    }

    var penSt = String(src.penState || "idle");
    if (penSt === "deepsleep" || penSt === "laying") {
        return petName + " is curled up in the soft clearing grass, fast asleep.";
    }
    if (penSt === "sit" || penSt === "loaf") {
        return petName + " is relaxing peacefully by the warm camp fire.";
    }
    if (playDrive > 0.58) {
        return petName + " perks right up at you, ready to play or head out exploring!";
    }
    var act = String(src.sanctuaryActivity || "").trim();
    if (act.length > 0 && act.indexOf("Sanctuary pen") === -1) {
        return petName + " is " + act.charAt(0).toLowerCase() + act.slice(1) + ".";
    }
    return petName + " is enjoying the gentle breeze in the Sanctuary clearing.";
}

function natureProfile(effTraits, baseTraits, ageSeconds) {
    var eff = effTraits || {};
    var base = baseTraits || {};
    var energy = eff.energy !== undefined ? eff.energy : 0.5;
    var curiosity = eff.curiosity !== undefined ? eff.curiosity : 0.5;
    var playfulness = eff.playfulness !== undefined ? eff.playfulness : 0.5;
    var sleepiness = eff.sleepiness !== undefined ? eff.sleepiness : 0.45;
    var boldness = eff.boldness !== undefined ? eff.boldness : 0.48;
    var sociability = eff.sociability !== undefined ? eff.sociability : 0.5;
    var patience = eff.patience !== undefined ? eff.patience : 0.5;
    var composure = eff.composure !== undefined ? eff.composure : 0.5;

    var natureTitle = "Gentle, Adaptable Nature";
    var story = "Takes each day in stride with a warm, easygoing presence.";

    if (playfulness >= 0.68 && energy >= 0.64) {
        natureTitle = "Jolly, Spirited Nature";
        story = "Brimming with playful energy, always up for lively games, joyful hops, and brightening busy days.";
    } else if (sleepiness >= 0.66 && patience >= 0.62) {
        natureTitle = "Relaxed, Dreamy Nature";
        story = "Unhurried and easygoing, happiest curling up for long naps in warm, quiet corners.";
    } else if (curiosity >= 0.68 && boldness >= 0.58) {
        natureTitle = "Adventurous, Curious Nature";
        story = "Inquisitive and bold, always heading over to inspect new windows, ledges, and corners.";
    } else if (curiosity >= 0.66) {
        natureTitle = "Inquisitive, Observant Nature";
        story = "Quietly fascinated by everything happening on screen, watching thoughtfully from nearby.";
    } else if (boldness >= 0.68 && composure >= 0.60) {
        natureTitle = "Brave, Steady Nature";
        story = "Confident and composed, keeping steady watch beside you without getting flustered.";
    } else if (boldness <= 0.30) {
        natureTitle = "Bashful, Sweet Nature";
        story = "A little shy at first, warming up to gentle pats, quiet spots, and familiar company.";
    } else if (sociability >= 0.68) {
        natureTitle = "Affectionate, Devoted Nature";
        story = "Warm-hearted and social, thriving on companionship, shared naps, and friendly greetings.";
    } else if (composure >= 0.68 && patience >= 0.66) {
        natureTitle = "Calm, Steady Nature";
        story = "Brings a quiet, steady calm wherever they settle down to rest.";
    } else if (sociability <= 0.30 && playfulness <= 0.32) {
        natureTitle = "Independent, Quiet Nature";
        story = "Likes doing things on their own terms, offering quiet, understated companionship.";
    }

    var shifts = [
        { key: "sociability", diff: sociability - (base.sociability !== undefined ? base.sociability : sociability), up: "Time with you has made them noticeably warmer and more affectionate.", down: "They've grown comfortable enjoying quiet solo time nearby." },
        { key: "boldness", diff: boldness - (base.boldness !== undefined ? base.boldness : boldness), up: "Spending days together has helped them grow braver and more confident.", down: "They've become softer and more cautious around sudden commotion." },
        { key: "composure", diff: composure - (base.composure !== undefined ? base.composure : composure), up: "Living at your rhythm has helped them settle into a peaceful composure.", down: "Lately they've been extra excitable and quick to react." },
        { key: "curiosity", diff: curiosity - (base.curiosity !== undefined ? base.curiosity : curiosity), up: "Watching your workspace has sparked an even livelier curiosity.", down: "Familiarity with your desktop has made them quite content to stay put." },
        { key: "playfulness", diff: playfulness - (base.playfulness !== undefined ? base.playfulness : playfulness), up: "Playtime together has really brought out their joyful, mischievous side.", down: "They've mellowed into a gentler, calmer daily pace." }
    ];

    var bestShift = null;
    var bestMag = 0.045;
    for (var i = 0; i < shifts.length; i++) {
        if (Math.abs(shifts[i].diff) > bestMag) {
            bestMag = Math.abs(shifts[i].diff);
            bestShift = shifts[i];
        }
    }

    var growthLine = "";
    if (bestShift) {
        growthLine = bestShift.diff > 0 ? bestShift.up : bestShift.down;
    } else if ((Number(ageSeconds) || 0) < 7200) {
        growthLine = "Still settling in and learning your daily rhythm.";
    } else {
        growthLine = "Feels right at home sharing the day with you.";
    }

    return {
        title: natureTitle,
        memo: story + " " + growthLine
    };
}

function friendlyRelationshipPhrase(relObj) {
    if (!relObj) return "Camp acquaintance";
    var aff = relObj.affinity !== undefined ? Number(relObj.affinity) : 0.5;
    var fam = relObj.familiarity !== undefined ? Number(relObj.familiarity) : 0.1;
    var spars = Number(relObj.sparCount || 0);
    var naps = Number(relObj.napCount || 0);
    if (aff >= 0.78 && naps >= 2) return "Favorite nap buddy";
    if (aff >= 0.76) return "Inseparable pals";
    if (spars >= 3 && aff >= 0.52) return "Friendly sparring rival";
    if (aff >= 0.60) return "Good camp friend";
    if (aff < 0.36) return "Keeps a polite distance";
    if (fam < 0.22) return "Just getting acquainted";
    return "Easygoing campmate";
}

function campAreaName(campId) {
    return FriendAreas.areaFor(campId).label;
}

function biomePalette(biomeName, isNight) {
    return SpeciesProfile.biomeFor(biomeName, isNight);
}
