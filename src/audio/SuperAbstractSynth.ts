import { GlottalSource } from './GlottalSource';
import { CONSONANTS } from './IPAConsonants';

export interface SuperAbstractState {
    // Vowel Control
    vowelHeight: number;       // 0-1 (Middle Finger)
    vowelBackness: number;     // 0-1 (Ring Finger)

    // Voice Control
    pitchMultiplier: number;   // 0.5-2.0 (Hand Roll)
    breathAmount: number;      // 0-1 (Wrist Tilt Forward)

    // Consonant Triggers (Thumb Distances)
    thumbToIndex: number;      // Alveolar [t, d, n]
    thumbToMiddle: number;     // Velar [k, g]
    thumbToRing: number;       // Fricative [s, z]
    thumbToPinky: number;      // Bilabial [p, b, m]
}

export class SuperAbstractSynth {
    private audioContext: AudioContext;
    private outputNode: GainNode;

    // Source
    private glottalSource: GlottalSource;
    private noiseNode: AudioBufferSourceNode | null = null;
    private noiseGain: GainNode;

    // Filter Path
    private oralGain: GainNode;
    private nasalGain: GainNode;
    private fricativeGain: GainNode;

    private filterChain: BiquadFilterNode[] = []; // F1, F2, F3
    private nasalFilter: BiquadFilterNode;
    private fricativeFilter: BiquadFilterNode;
    private globalLpf: BiquadFilterNode;

    // State Tracking
    private voiceSizeMultiplier: number = 1.0;

    constructor(audioContext: AudioContext) {
        this.audioContext = audioContext;

        // 1. Create Nodes
        this.outputNode = this.audioContext.createGain();
        this.outputNode.gain.value = 1.0;

        this.glottalSource = new GlottalSource(this.audioContext);

        this.noiseGain = this.audioContext.createGain();
        this.noiseGain.gain.value = 0;

        this.oralGain = this.audioContext.createGain();
        this.oralGain.gain.value = 1;

        this.nasalGain = this.audioContext.createGain();
        this.nasalGain.gain.value = 0;

        this.fricativeGain = this.audioContext.createGain();
        this.fricativeGain.gain.value = 0;

        // Filters
        const f1 = this.audioContext.createBiquadFilter(); f1.type = 'peaking'; f1.Q.value = 4; f1.gain.value = 15;
        const f2 = this.audioContext.createBiquadFilter(); f2.type = 'peaking'; f2.Q.value = 4; f2.gain.value = 10;
        const f3 = this.audioContext.createBiquadFilter(); f3.type = 'peaking'; f3.Q.value = 4; f3.gain.value = 5;
        this.filterChain = [f1, f2, f3];

        this.nasalFilter = this.audioContext.createBiquadFilter();
        this.nasalFilter.type = 'lowpass';
        this.nasalFilter.frequency.value = 300;

        this.fricativeFilter = this.audioContext.createBiquadFilter();
        this.fricativeFilter.type = 'highpass';
        this.fricativeFilter.frequency.value = 3000;

        this.globalLpf = this.audioContext.createBiquadFilter();
        this.globalLpf.type = 'lowpass';
        this.globalLpf.frequency.value = 20000;

        // 2. Connect Graph
        // Glottal -> Oral (Formants) -> Global LPF -> Output
        this.glottalSource.output.connect(this.oralGain);
        this.oralGain.connect(f1);
        f1.connect(f2);
        f2.connect(f3);
        f3.connect(this.globalLpf);

        // Glottal -> Nasal -> Output
        this.glottalSource.output.connect(this.nasalFilter);
        this.nasalFilter.connect(this.nasalGain);
        this.nasalGain.connect(this.outputNode);

        // Noise -> Fricative -> Output
        this.initNoise();
        if (this.noiseNode) {
            this.noiseNode.connect(this.noiseGain);
        }
        this.noiseGain.connect(this.fricativeFilter);
        this.fricativeFilter.connect(this.fricativeGain);
        this.fricativeGain.connect(this.outputNode);

        // Main path to output
        this.globalLpf.connect(this.outputNode);
    }

    private initNoise() {
        const bufferSize = this.audioContext.sampleRate * 2;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        this.noiseNode = this.audioContext.createBufferSource();
        this.noiseNode.buffer = buffer;
        this.noiseNode.loop = true;
        this.noiseNode.start();
    }

    public connect(destination: AudioNode) {
        this.outputNode.connect(destination);
    }

    public disconnect() {
        this.outputNode.disconnect();
    }

    public update(state: SuperAbstractState) {
        const now = this.audioContext.currentTime;
        const ramp = 0.03;

        // --- 1. Voice & Pitch ---
        // Map Breath Amount (Tilt) to Voicing
        // 0.0 - 0.2: Silence
        // 0.2 - 1.0: Voice
        const voiceThreshold = 0.2;
        let voiceLevel = 0;
        if (state.breathAmount > voiceThreshold) {
            voiceLevel = (state.breathAmount - voiceThreshold) / (1 - voiceThreshold);
        }

        // Apply voice level (Volume + Voicing Amount)
        const outputLevel = Math.pow(voiceLevel, 1.5); // Curve for natural swell
        this.glottalSource.setOutputLevel(outputLevel);
        this.glottalSource.setVoicingAmount(Math.min(voiceLevel * 1.2, 1.0)); // Reach full voicing quickly

        // Pitch
        const basePitch = 150;
        this.glottalSource.setPitch(basePitch * state.pitchMultiplier);


        // --- 2. Vowels ---
        const f1Base = 250 + (state.vowelHeight * 600);
        const f2Base = 800 + (state.vowelBackness * 1600);
        const f3Base = 2200 + (state.vowelBackness * 500);

        this.setFormants(
            f1Base * this.voiceSizeMultiplier,
            f2Base * this.voiceSizeMultiplier,
            f3Base * this.voiceSizeMultiplier
        );


        // --- 3. Consonants (Thumb Touches) ---
        // Detect closest touch
        const touchThreshold = 0.05; // 5cm proximity

        // Check all fingers, find max closure
        const touches = [
            { type: 'alveolar', dist: state.thumbToIndex },  // [t, d, n]
            { type: 'velar', dist: state.thumbToMiddle }, // [k, g]
            { type: 'fricative', dist: state.thumbToRing },   // [s, z]
            { type: 'bilabial', dist: state.thumbToPinky }   // [p, b, m]
        ];

        let maxClosure = 0;
        let bestType = '';

        touches.forEach(t => {
            if (t.dist < touchThreshold) {
                // Map distance 0.05 -> 0.0 to Closure 0.0 -> 1.0
                const closure = (touchThreshold - t.dist) / touchThreshold;
                if (closure > maxClosure) {
                    maxClosure = closure;
                    bestType = t.type;
                }
            }
        });

        // Apply Consonant Effects
        let targetOral = 1.0;
        let targetNasal = 0.0;
        let targetFricative = 0.0;

        if (maxClosure > 0) {
            // Choose specific phoneme based on type
            // For now, we map to a representative phoneme for each group
            let phoneme = '';
            if (bestType === 'bilabial') phoneme = 'm'; // Nasal/Stop hybrid
            else if (bestType === 'alveolar') phoneme = 'n';
            else if (bestType === 'velar') phoneme = 'k'; // Stop
            else if (bestType === 'fricative') phoneme = 's';

            if (phoneme && CONSONANTS[phoneme]) {
                const params = CONSONANTS[phoneme];

                // Modulate by closure amount
                targetOral = 1.0 - (maxClosure * (1.0 - params.oralGain));
                targetNasal = maxClosure * params.nasalGain;

                if (params.manner === 'fricative') {
                    targetFricative = maxClosure * 0.8;
                    // Update noise filter
                    this.fricativeFilter.type = 'bandpass';
                    this.fricativeFilter.frequency.setTargetAtTime(params.noiseFreq, now, ramp);
                    this.fricativeFilter.Q.setTargetAtTime(params.noiseBandwidth, now, ramp);
                }
            }
        }

        this.oralGain.gain.setTargetAtTime(targetOral, now, ramp);
        this.nasalGain.gain.setTargetAtTime(targetNasal, now, ramp);
        this.fricativeGain.gain.setTargetAtTime(targetFricative, now, ramp);
    }

    private setFormants(f1: number, f2: number, f3: number) {
        const now = this.audioContext.currentTime;
        this.filterChain[0].frequency.setTargetAtTime(f1, now, 0.05);
        this.filterChain[1].frequency.setTargetAtTime(f2, now, 0.05);
        this.filterChain[2].frequency.setTargetAtTime(f3, now, 0.05);
    }
}
