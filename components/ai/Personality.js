// Each trait is 0-1, influences drive rates and behavior weights.

function resolve(preset) {
    var presets = {
        "lazy": {
            energy: 0.15, curiosity: 0.2, playfulness: 0.15, sleepiness: 0.9,
            boldness: 0.2, sociability: 0.3, patience: 0.8
        },
        "energetic": {
            energy: 0.95, curiosity: 0.6, playfulness: 0.85, sleepiness: 0.05,
            boldness: 0.8, sociability: 0.7, patience: 0.2
        },
        "curious": {
            energy: 0.5, curiosity: 0.95, playfulness: 0.4, sleepiness: 0.3,
            boldness: 0.6, sociability: 0.5, patience: 0.5
        },
        "chill": {
            energy: 0.3, curiosity: 0.35, playfulness: 0.25, sleepiness: 0.5,
            boldness: 0.4, sociability: 0.4, patience: 0.9
        },
        "brave": {
            energy: 0.7, curiosity: 0.7, playfulness: 0.5, sleepiness: 0.2,
            boldness: 0.95, sociability: 0.5, patience: 0.4
        },
        "shy": {
            energy: 0.3, curiosity: 0.6, playfulness: 0.3, sleepiness: 0.4,
            boldness: 0.1, sociability: 0.2, patience: 0.7
        },
        "playful": {
            energy: 0.7, curiosity: 0.5, playfulness: 0.95, sleepiness: 0.15,
            boldness: 0.6, sociability: 0.8, patience: 0.3
        },
        "grumpy": {
            energy: 0.4, curiosity: 0.2, playfulness: 0.1, sleepiness: 0.6,
            boldness: 0.5, sociability: 0.1, patience: 0.3
        },
    };
    return presets[preset] || presets["curious"];
}
