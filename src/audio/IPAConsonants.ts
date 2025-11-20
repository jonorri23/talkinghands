export interface ConsonantParams {
    name: string;
    place: 'bilabial' | 'alveolar' | 'velar' | 'glottal';
    manner: 'stop' | 'fricative' | 'nasal' | 'approximant';
    isVoiced: boolean;

    // Acoustic targets
    noiseFreq: number;      // Center freq for burst/frication
    noiseBandwidth: number; // Q factor or bandwidth
    oralGain: number;       // 0-1 (1=open, 0=closed)
    nasalGain: number;      // 0-1
    formantDamping: number; // 0-1 (1=normal, 0=muted)
    burstDuration: number;  // ms
}

export const CONSONANTS: Record<string, ConsonantParams> = {
    // --- Bilabial (Lips) ---
    'm': {
        name: 'm', place: 'bilabial', manner: 'nasal', isVoiced: true,
        noiseFreq: 0, noiseBandwidth: 0,
        oralGain: 0.0, nasalGain: 1.0, formantDamping: 0.5, burstDuration: 0
    },
    'b': {
        name: 'b', place: 'bilabial', manner: 'stop', isVoiced: true,
        noiseFreq: 500, noiseBandwidth: 1, // Low freq burst
        oralGain: 0.0, nasalGain: 0.0, formantDamping: 0.1, burstDuration: 0.015
    },
    'p': {
        name: 'p', place: 'bilabial', manner: 'stop', isVoiced: false,
        noiseFreq: 800, noiseBandwidth: 1,
        oralGain: 0.0, nasalGain: 0.0, formantDamping: 0.0, burstDuration: 0.02
    },

    // --- Alveolar (Teeth/Ridge) ---
    'n': {
        name: 'n', place: 'alveolar', manner: 'nasal', isVoiced: true,
        noiseFreq: 0, noiseBandwidth: 0,
        oralGain: 0.0, nasalGain: 0.8, formantDamping: 0.6, burstDuration: 0
    },
    'd': {
        name: 'd', place: 'alveolar', manner: 'stop', isVoiced: true,
        noiseFreq: 3000, noiseBandwidth: 2, // Higher freq burst
        oralGain: 0.0, nasalGain: 0.0, formantDamping: 0.1, burstDuration: 0.015
    },
    't': {
        name: 't', place: 'alveolar', manner: 'stop', isVoiced: false,
        noiseFreq: 4000, noiseBandwidth: 2,
        oralGain: 0.0, nasalGain: 0.0, formantDamping: 0.0, burstDuration: 0.02
    },
    's': {
        name: 's', place: 'alveolar', manner: 'fricative', isVoiced: false,
        noiseFreq: 6000, noiseBandwidth: 1, // Very high hiss
        oralGain: 0.2, nasalGain: 0.0, formantDamping: 0.8, burstDuration: 0
    },

    // --- Velar (Back) ---
    'k': {
        name: 'k', place: 'velar', manner: 'stop', isVoiced: false,
        noiseFreq: 1500, noiseBandwidth: 1.5, // Mid freq burst
        oralGain: 0.0, nasalGain: 0.0, formantDamping: 0.0, burstDuration: 0.025
    },

    // --- Glottal ---
    'h': {
        name: 'h', place: 'glottal', manner: 'fricative', isVoiced: false,
        noiseFreq: 1000, noiseBandwidth: 0.5, // Broad aspiration
        oralGain: 1.0, nasalGain: 0.0, formantDamping: 1.0, burstDuration: 0
    }
};
