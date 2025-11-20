export interface ConsonantParams {
    manner: 'stop' | 'fricative' | 'nasal' | 'approximant';
    place: 'bilabial' | 'labiodental' | 'dental' | 'alveolar' | 'postalveolar' | 'palatal' | 'velar' | 'glottal';
    isVoiced: boolean;
    noiseFreq: number;      // Center frequency for frication/burst
    noiseBandwidth: number; // Q factor for noise filter
    oralGain: number;       // 0-1 (0=closed, 1=open)
    nasalGain: number;      // 0-1 (0=closed, 1=open)
    formantDamping: number; // 0-1 (0=none, 1=full damping)
    burstDuration: number;  // ms
    targetFormants?: { f1: number, f2: number, f3: number }; // For approximants
}

export const CONSONANTS: Record<string, ConsonantParams> = {
    // --- Phase 1: Basic ---
    'm': { manner: 'nasal', place: 'bilabial', isVoiced: true, noiseFreq: 0, noiseBandwidth: 0, oralGain: 0, nasalGain: 1.0, formantDamping: 0.5, burstDuration: 0 },
    'b': { manner: 'stop', place: 'bilabial', isVoiced: true, noiseFreq: 500, noiseBandwidth: 1, oralGain: 0, nasalGain: 0, formantDamping: 0.8, burstDuration: 15 },
    'p': { manner: 'stop', place: 'bilabial', isVoiced: false, noiseFreq: 800, noiseBandwidth: 1, oralGain: 0, nasalGain: 0, formantDamping: 0.8, burstDuration: 20 },

    'n': { manner: 'nasal', place: 'alveolar', isVoiced: true, noiseFreq: 0, noiseBandwidth: 0, oralGain: 0, nasalGain: 0.8, formantDamping: 0.4, burstDuration: 0 },
    'd': { manner: 'stop', place: 'alveolar', isVoiced: true, noiseFreq: 2500, noiseBandwidth: 2, oralGain: 0, nasalGain: 0, formantDamping: 0.8, burstDuration: 15 },
    't': { manner: 'stop', place: 'alveolar', isVoiced: false, noiseFreq: 3500, noiseBandwidth: 2, oralGain: 0, nasalGain: 0, formantDamping: 0.8, burstDuration: 20 },

    's': { manner: 'fricative', place: 'alveolar', isVoiced: false, noiseFreq: 6000, noiseBandwidth: 4, oralGain: 0.1, nasalGain: 0, formantDamping: 0.2, burstDuration: 0 },
    'z': { manner: 'fricative', place: 'alveolar', isVoiced: true, noiseFreq: 6000, noiseBandwidth: 4, oralGain: 0.1, nasalGain: 0, formantDamping: 0.2, burstDuration: 0 },

    'k': { manner: 'stop', place: 'velar', isVoiced: false, noiseFreq: 1500, noiseBandwidth: 1.5, oralGain: 0, nasalGain: 0, formantDamping: 0.8, burstDuration: 25 },
    'g': { manner: 'stop', place: 'velar', isVoiced: true, noiseFreq: 1200, noiseBandwidth: 1.5, oralGain: 0, nasalGain: 0, formantDamping: 0.8, burstDuration: 20 },

    'h': { manner: 'fricative', place: 'glottal', isVoiced: false, noiseFreq: 1000, noiseBandwidth: 0.5, oralGain: 0.8, nasalGain: 0, formantDamping: 0, burstDuration: 0 },

    // --- Phase 6: Extended ---

    // Labiodental Fricatives
    'f': { manner: 'fricative', place: 'labiodental', isVoiced: false, noiseFreq: 4500, noiseBandwidth: 1, oralGain: 0.1, nasalGain: 0, formantDamping: 0.3, burstDuration: 0 },
    'v': { manner: 'fricative', place: 'labiodental', isVoiced: true, noiseFreq: 4500, noiseBandwidth: 1, oralGain: 0.1, nasalGain: 0, formantDamping: 0.3, burstDuration: 0 },

    // Dental Fricatives (Th)
    'th': { manner: 'fricative', place: 'dental', isVoiced: false, noiseFreq: 5000, noiseBandwidth: 0.8, oralGain: 0.1, nasalGain: 0, formantDamping: 0.3, burstDuration: 0 }, // [θ]
    'dh': { manner: 'fricative', place: 'dental', isVoiced: true, noiseFreq: 5000, noiseBandwidth: 0.8, oralGain: 0.1, nasalGain: 0, formantDamping: 0.3, burstDuration: 0 }, // [ð] "this"

    // Postalveolar Fricatives (Sh)
    'sh': { manner: 'fricative', place: 'postalveolar', isVoiced: false, noiseFreq: 2500, noiseBandwidth: 3, oralGain: 0.2, nasalGain: 0, formantDamping: 0.4, burstDuration: 0 }, // [ʃ]
    'zh': { manner: 'fricative', place: 'postalveolar', isVoiced: true, noiseFreq: 2500, noiseBandwidth: 3, oralGain: 0.2, nasalGain: 0, formantDamping: 0.4, burstDuration: 0 }, // [ʒ]

    // Velar Nasal
    'ng': { manner: 'nasal', place: 'velar', isVoiced: true, noiseFreq: 0, noiseBandwidth: 0, oralGain: 0, nasalGain: 1.0, formantDamping: 0.6, burstDuration: 0 }, // [ŋ]

    // Approximants (Liquids/Glides)
    // These rely on specific formant targets
    'l': {
        manner: 'approximant', place: 'alveolar', isVoiced: true,
        noiseFreq: 0, noiseBandwidth: 0, oralGain: 0.8, nasalGain: 0, formantDamping: 0, burstDuration: 0,
        targetFormants: { f1: 360, f2: 1100, f3: 2800 }
    },
    'r': {
        manner: 'approximant', place: 'alveolar', isVoiced: true,
        noiseFreq: 0, noiseBandwidth: 0, oralGain: 0.7, nasalGain: 0, formantDamping: 0, burstDuration: 0,
        targetFormants: { f1: 320, f2: 1100, f3: 1400 } // Low F3 is key for American /r/
    },
    'w': {
        manner: 'approximant', place: 'velar', isVoiced: true,
        noiseFreq: 0, noiseBandwidth: 0, oralGain: 0.5, nasalGain: 0, formantDamping: 0, burstDuration: 0,
        targetFormants: { f1: 300, f2: 600, f3: 2200 } // Very low F1/F2
    },
    'j': {
        manner: 'approximant', place: 'palatal', isVoiced: true,
        noiseFreq: 0, noiseBandwidth: 0, oralGain: 0.6, nasalGain: 0, formantDamping: 0, burstDuration: 0,
        targetFormants: { f1: 280, f2: 2300, f3: 3000 } // High F2/F3 (like [i])
    }
};
