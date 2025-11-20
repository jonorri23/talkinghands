import { EnergyEnvelope } from './EnergyEnvelope';
import { ArticulatorSynth, type ArticulatoryState } from './ArticulatorSynth';

export type PresetName = 'clean' | 'fm' | 'raw' | 'bio' | 'articulatory';

export class AudioEngine {
    private audioContext: AudioContext | null = null;

    // Nodes
    private mainOscillator: OscillatorNode | null = null;
    private modOscillator: OscillatorNode | null = null; // For FM
    private modGain: GainNode | null = null; // FM Depth

    private noiseNode: AudioBufferSourceNode | null = null;
    private noiseGain: GainNode | null = null;

    private filterChain: BiquadFilterNode[] = []; // Formants
    private globalLpf: BiquadFilterNode | null = null; // Tone control
    private masterGain: GainNode | null = null;

    // Bio Nodes
    private oralGain: GainNode | null = null;
    private nasalFilter: BiquadFilterNode | null = null;
    private nasalGain: GainNode | null = null;
    private fricativeFilter: BiquadFilterNode | null = null;
    private fricativeGain: GainNode | null = null;

    // Articulatory Nodes
    private energyEnvelope: EnergyEnvelope | null = null;
    private glottalGain: GainNode | null = null; // Voicing amount
    private aspirationGain: GainNode | null = null; // Noise amount

    private currentPreset: PresetName = 'raw';

    constructor() { }

    async init() {
        if (this.audioContext) return;
        this.audioContext = new AudioContext();

        // Master Gain
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0;

        // Global LPF (Tone)
        this.globalLpf = this.audioContext.createBiquadFilter();
        this.globalLpf.type = 'lowpass';
        this.globalLpf.frequency.value = 20000; // Open by default
        this.globalLpf.Q.value = 0;

        // --- Oral Path (Formants) ---
        this.oralGain = this.audioContext.createGain();
        this.oralGain.gain.value = 1;

        const f1 = this.audioContext.createBiquadFilter();
        f1.type = 'peaking';
        f1.Q.value = 4;
        f1.gain.value = 15;

        const f2 = this.audioContext.createBiquadFilter();
        f2.type = 'peaking';
        f2.Q.value = 4;
        f2.gain.value = 10;

        const f3 = this.audioContext.createBiquadFilter();
        f3.type = 'peaking';
        f3.Q.value = 4;
        f3.gain.value = 5;

        this.filterChain = [f1, f2, f3];

        // Chain: OralGain -> F1 -> F2 -> F3 -> Global LPF -> Master
        this.oralGain.connect(f1);
        f1.connect(f2);
        f2.connect(f3);
        f3.connect(this.globalLpf);
        this.globalLpf.connect(this.masterGain);
        this.masterGain.connect(this.audioContext.destination);

        // --- Nasal Path ---
        this.nasalFilter = this.audioContext.createBiquadFilter();
        this.nasalFilter.type = 'lowpass';
        this.nasalFilter.frequency.value = 300;
        this.nasalFilter.Q.value = 1;

        this.nasalGain = this.audioContext.createGain();
        this.nasalGain.gain.value = 0;

        this.nasalFilter.connect(this.nasalGain);
        this.nasalGain.connect(this.masterGain);

        // --- Fricative Path ---
        this.fricativeFilter = this.audioContext.createBiquadFilter();
        this.fricativeFilter.type = 'highpass';
        this.fricativeFilter.frequency.value = 3000;
        this.fricativeFilter.Q.value = 1;

        this.fricativeGain = this.audioContext.createGain();
        this.fricativeGain.gain.value = 0;

        this.fricativeFilter.connect(this.fricativeGain);
        this.fricativeGain.connect(this.masterGain);

        // --- Articulatory Components ---
        this.energyEnvelope = new EnergyEnvelope(this.audioContext);

        this.glottalGain = this.audioContext.createGain();
        this.glottalGain.gain.value = 1;

        this.aspirationGain = this.audioContext.createGain();
        this.aspirationGain.gain.value = 0;

        // Initialize Noise
        this.initNoise();

        // Initialize Source based on default preset
        this.setPreset('raw');

        console.log("Audio Engine Initialized");
    }

    private initNoise() {
        if (!this.audioContext) return;
        const bufferSize = this.audioContext.sampleRate * 2;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        this.noiseNode = this.audioContext.createBufferSource();
        this.noiseNode.buffer = buffer;
        this.noiseNode.loop = true;

        this.noiseGain = this.audioContext.createGain();
        this.noiseGain.gain.value = 0;

        this.noiseNode.connect(this.noiseGain);
        this.noiseNode.start();
    }

    setPreset(name: PresetName) {
        if (!this.audioContext) return;
        this.currentPreset = name;
        const now = this.audioContext.currentTime;

        // 1. Cleanup old sources
        if (this.mainOscillator) {
            try { this.mainOscillator.stop(); this.mainOscillator.disconnect(); } catch (e) { }
        }
        if (this.modOscillator) {
            try { this.modOscillator.stop(); this.modOscillator.disconnect(); } catch (e) { }
        }
        if (this.modGain) this.modGain.disconnect();
        if (this.noiseGain) try { this.noiseGain.disconnect(); } catch (e) { }

        // Disconnect Envelope outputs
        if (this.energyEnvelope) {
            try { this.energyEnvelope.node.disconnect(); } catch (e) { }
        }
        if (this.glottalGain) this.glottalGain.disconnect();
        if (this.aspirationGain) this.aspirationGain.disconnect();

        // 2. Create new source
        this.mainOscillator = this.audioContext.createOscillator();
        this.mainOscillator.frequency.value = 150;

        if (name === 'articulatory') {
            // --- Articulatory Mode ---
            this.mainOscillator.type = 'sawtooth';

            // Glottal Path: Osc -> GlottalGain -> Envelope -> Oral/Nasal
            this.mainOscillator.connect(this.glottalGain!);
            this.glottalGain!.connect(this.energyEnvelope!.node);

            // Noise Path: Noise -> AspirationGain -> Envelope -> Fricative/Oral
            this.noiseGain!.connect(this.aspirationGain!);
            this.aspirationGain!.connect(this.energyEnvelope!.node);

            // Envelope Output -> All Filters
            this.energyEnvelope!.node.connect(this.oralGain!);
            this.energyEnvelope!.node.connect(this.nasalFilter!);
            this.energyEnvelope!.node.connect(this.fricativeFilter!);

            // Reset Gains
            this.oralGain!.gain.value = 1;
            this.nasalGain!.gain.value = 0;
            this.fricativeGain!.gain.value = 0;

            // Open LPF
            this.globalLpf!.frequency.setValueAtTime(20000, now);

            // Set Master Gain to 1 (Volume controlled by Envelope)
            this.masterGain!.gain.setValueAtTime(1.0, now);

        } else if (name === 'bio') {
            // Bio Mode (Legacy)
            this.mainOscillator.type = 'sawtooth';
            this.mainOscillator.connect(this.oralGain!);
            this.mainOscillator.connect(this.nasalFilter!);

            this.noiseGain!.connect(this.fricativeFilter!);
            this.noiseGain!.connect(this.filterChain[0]);

            this.globalLpf!.frequency.setValueAtTime(20000, now);
        }
        else if (name === 'clean') {
            this.mainOscillator.type = 'triangle';
            this.mainOscillator.connect(this.filterChain[0]);
            this.globalLpf!.frequency.setValueAtTime(1500, now);
        }
        else if (name === 'raw') {
            this.mainOscillator.type = 'sawtooth';
            this.mainOscillator.connect(this.filterChain[0]);
            this.globalLpf!.frequency.setValueAtTime(5000, now);
        }
        else if (name === 'fm') {
            this.mainOscillator.type = 'sine';
            this.modOscillator = this.audioContext.createOscillator();
            this.modOscillator.type = 'sine';
            this.modOscillator.frequency.value = 150 * 1.5;
            this.modGain = this.audioContext.createGain();
            this.modGain.gain.value = 500;
            this.modOscillator.connect(this.modGain);
            this.modGain.connect(this.mainOscillator.frequency);
            this.mainOscillator.connect(this.filterChain[0]);
            this.modOscillator.start();
            this.globalLpf!.frequency.setValueAtTime(8000, now);
        }

        this.mainOscillator.start();
    }

    start() {
        if (this.audioContext?.state === 'suspended') {
            this.audioContext.resume();
        }
        if (this.currentPreset !== 'bio' && this.currentPreset !== 'articulatory') {
            this.setVolume(0.5);
        }
    }

    stop() {
        this.setVolume(0);
    }

    setPitch(frequency: number) {
        if (!this.mainOscillator || !this.audioContext) return;
        const now = this.audioContext.currentTime;
        this.mainOscillator.frequency.linearRampToValueAtTime(frequency, now + 0.05);
        if (this.currentPreset === 'fm' && this.modOscillator) {
            this.modOscillator.frequency.linearRampToValueAtTime(frequency * 1.5, now + 0.05);
        }
    }

    setVolume(volume: number) {
        if (!this.masterGain || !this.audioContext) return;
        const now = this.audioContext.currentTime;

        // In Articulatory mode, Master Gain is fixed, Envelope handles volume.
        // But we can use this as a "Master Volume" scaler.
        this.masterGain.gain.linearRampToValueAtTime(volume, now + 0.05);

        if (this.currentPreset === 'clean' && this.globalLpf) {
            const freq = 500 + (volume * 2000);
            this.globalLpf.frequency.linearRampToValueAtTime(freq, now + 0.1);
        }
    }

    setNoise(volume: number) {
        if (!this.noiseGain || !this.audioContext) return;
        const now = this.audioContext.currentTime;
        this.noiseGain.gain.linearRampToValueAtTime(volume, now + 0.05);
    }

    setFormants(f1Freq: number, f2Freq: number, f3Freq: number) {
        if (this.filterChain.length < 3 || !this.audioContext) return;
        const now = this.audioContext.currentTime;
        this.filterChain[0].frequency.linearRampToValueAtTime(f1Freq, now + 0.05);
        this.filterChain[1].frequency.linearRampToValueAtTime(f2Freq, now + 0.05);
        this.filterChain[2].frequency.linearRampToValueAtTime(f3Freq, now + 0.05);
    }

    triggerEnergy(velocity: number = 1.0) {
        if (this.energyEnvelope) {
            this.energyEnvelope.trigger(velocity);
        }
    }

    releaseEnergy() {
        if (this.energyEnvelope) {
            this.energyEnvelope.releaseNote();
        }
    }

    // --- Bio-Mechanical Updates ---
    // --- Bio-Mechanical Updates ---
    updateBio(params: {
        lipClosure: number; // 0 (Open) to 1 (Closed)
        tongueHeight: number; // 0 (Low) to 1 (High/Roof)
        isVoiced: boolean;
        plosiveTrigger: boolean;
        fricativeThreshold: number; // Tunable threshold for fricative detection
    }) {
        if (this.currentPreset !== 'bio' || !this.audioContext) return;
        const now = this.audioContext.currentTime;
        const ramp = 0.02;

        // 1. Oral/Nasal Mix - Tuned for realistic speech
        // Use exponential curve for more natural transition
        const oralLevel = Math.pow(1 - params.lipClosure, 1.5); // Exponential falloff
        const nasalLevel = Math.pow(params.lipClosure, 0.8);     // Gentler rise

        if (this.oralGain) this.oralGain.gain.setTargetAtTime(oralLevel, now, ramp);
        if (this.nasalGain) this.nasalGain.gain.setTargetAtTime(nasalLevel * 0.7, now, ramp); // Boost nasal

        // 2. Fricatives (Tongue Height) - now with tunable threshold
        let fricativeVol = 0;
        if (params.tongueHeight > params.fricativeThreshold) {
            fricativeVol = (params.tongueHeight - params.fricativeThreshold) / (1 - params.fricativeThreshold);
        }
        // Unvoiced sounds (Palm Side) should boost fricatives
        if (!params.isVoiced) fricativeVol *= 2;

        if (this.fricativeGain) this.fricativeGain.gain.setTargetAtTime(fricativeVol, now, ramp);

        // 3. Plosives (Burst) - sensitivity controlled by main.ts
        if (params.plosiveTrigger) {
            this.masterGain!.gain.cancelScheduledValues(now);
            this.masterGain!.gain.setValueAtTime(1.0, now);
            this.masterGain!.gain.exponentialRampToValueAtTime(0.1, now + 0.1);
        }
    }

    // --- New Articulatory Update ---
    updateArticulatory(state: ArticulatoryState) {
        if (this.currentPreset !== 'articulatory' || !this.audioContext) return;

        const params = ArticulatorSynth.mapStateToAcoustic(state);
        const now = this.audioContext.currentTime;
        const ramp = 0.02; // Fast response

        // 1. Formants
        this.setFormants(params.f1, params.f2, params.f3);

        // 2. Filter Gains
        if (this.oralGain) this.oralGain.gain.setTargetAtTime(params.oralGain, now, ramp);
        if (this.nasalGain) this.nasalGain.gain.setTargetAtTime(params.nasalGain, now, ramp);
        if (this.fricativeGain) this.fricativeGain.gain.setTargetAtTime(params.fricativeGain, now, ramp);
        if (this.fricativeFilter) this.fricativeFilter.frequency.setTargetAtTime(params.fricativeFreq, now, ramp);

        // 3. Excitation Mix
        // Voicing Mix: 1 = Glottal only, 0 = Noise only
        // Glottal Gain = voicingMix
        // Aspiration Gain = (1 - voicingMix) + extra aspiration
        if (this.glottalGain) this.glottalGain.gain.setTargetAtTime(params.voicingMix, now, ramp);
        if (this.aspirationGain) this.aspirationGain.gain.setTargetAtTime(1 - params.voicingMix, now, ramp);

        // 4. Plosive Trigger (Burst) - Using EnergyEnvelope
        if (state.plosiveTrigger) {
            // Set fast attack for burst
            if (this.energyEnvelope) {
                this.energyEnvelope.attack = 0.001; // Very fast
                this.energyEnvelope.decay = 0.05;   // Quick decay
                this.energyEnvelope.trigger(1.0);
            }

            // Momentary noise burst for aspiration
            this.aspirationGain!.gain.cancelScheduledValues(now);
            this.aspirationGain!.gain.setValueAtTime(1.0, now);
            this.aspirationGain!.gain.exponentialRampToValueAtTime(Math.max(1 - params.voicingMix, 0.0001), now + 0.05);
        }

        // 5. Energy Trigger (Breath) - Using EnergyEnvelope
        if (state.energyTrigger) {
            // Set slower attack for natural breath onset
            if (this.energyEnvelope) {
                this.energyEnvelope.attack = 0.02;  // Natural breath start
                this.energyEnvelope.decay = 0.3;    // Long sustain
                this.energyEnvelope.trigger(1.0);
            }
        }
    }
}
