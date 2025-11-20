/**
 * GlottalSource - Natural Human Voice Source
 * 
 * Generates realistic voice excitation using:
 * - Rosenberg glottal pulse (smooth, not harsh sawtooth)
 * - Pink noise for whisper/breathiness
 * - Continuous voicing blend (0=whisper, 1=voice)
 * - Amplitude-dependent breathiness
 */

export class GlottalSource {
    private audioContext: AudioContext;

    // Oscillators
    private voicedOsc: OscillatorNode | null = null;
    private voicedGain: GainNode;

    // Noise source
    private noiseNode: AudioBufferSourceNode | null = null;
    private noiseGain: GainNode;

    // Output mixer
    private outputGain: GainNode;

    // State
    private voicingAmount: number = 1.0;  // 0=whisper, 1=full voice
    private breathiness: number = 0.0;    // Extra breathiness

    constructor(audioContext: AudioContext) {
        this.audioContext = audioContext;

        // Create gain nodes
        this.voicedGain = audioContext.createGain();
        this.voicedGain.gain.value = 1.0;

        this.noiseGain = audioContext.createGain();
        this.noiseGain.gain.value = 0.0;

        this.outputGain = audioContext.createGain();
        this.outputGain.gain.value = 1.0;

        // Connect gains to output
        this.voicedGain.connect(this.outputGain);
        this.noiseGain.connect(this.outputGain);

        // Initialize sources
        this.initVoicedSource();
        this.initNoiseSource();
    }

    private initVoicedSource() {
        // For now, use triangle wave (smoother than sawtooth)
        // TODO: Implement true Rosenberg pulse with PeriodicWave
        this.voicedOsc = this.audioContext.createOscillator();
        this.voicedOsc.type = 'triangle';
        this.voicedOsc.frequency.value = 150;

        this.voicedOsc.connect(this.voicedGain);
        this.voicedOsc.start();
    }

    private initNoiseSource() {
        // Generate pink noise (more natural than white noise)
        const bufferSize = this.audioContext.sampleRate * 2;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);

        // Simple pink noise approximation (1/f spectrum)
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
            b6 = white * 0.115926;
        }

        this.noiseNode = this.audioContext.createBufferSource();
        this.noiseNode.buffer = buffer;
        this.noiseNode.loop = true;

        this.noiseNode.connect(this.noiseGain);
        this.noiseNode.start();
    }

    /**
     * Get the output node to connect to filters
     */
    get output(): GainNode {
        return this.outputGain;
    }

    /**
     * Set fundamental frequency (pitch)
     */
    setPitch(frequency: number) {
        if (this.voicedOsc) {
            const now = this.audioContext.currentTime;
            this.voicedOsc.frequency.linearRampToValueAtTime(frequency, now + 0.01);
        }
    }

    /**
     * Set voicing amount
     * @param amount 0 = pure whisper (noise only), 1 = pure voice (harmonic only)
     */
    setVoicingAmount(amount: number) {
        this.voicingAmount = Math.max(0, Math.min(1, amount));
        this.updateMix();
    }

    /**
     * Set extra breathiness (aspiration)
     * @param amount 0 = no extra breath, 1 = very breathy
     */
    setBreathiness(amount: number) {
        this.breathiness = Math.max(0, Math.min(1, amount));
        this.updateMix();
    }

    /**
     * Update the voiced/noise mix based on voicing and breathiness
     */
    private updateMix() {
        const now = this.audioContext.currentTime;
        const ramp = 0.01; // Fast response

        // Voiced component: full at voicing=1, off at voicing=0
        const voicedLevel = this.voicingAmount;
        this.voicedGain.gain.setTargetAtTime(voicedLevel, now, ramp);

        // Noise component: full at voicing=0, reduced at voicing=1, plus breathiness
        // Even fully voiced speech has some breathiness
        const baseNoise = (1 - this.voicingAmount);
        const totalNoise = baseNoise + (this.breathiness * 0.3); // Breathiness adds max 30%
        this.noiseGain.gain.setTargetAtTime(totalNoise, now, ramp);
    }

    /**
     * Set overall output level
     */
    setOutputLevel(level: number) {
        const now = this.audioContext.currentTime;
        this.outputGain.gain.setTargetAtTime(level, now, 0.01);
    }

    /**
     * Stop and disconnect all sources
     */
    stop() {
        if (this.voicedOsc) {
            try {
                this.voicedOsc.stop();
                this.voicedOsc.disconnect();
            } catch (e) {
                // Already stopped
            }
            this.voicedOsc = null;
        }

        if (this.noiseNode) {
            try {
                this.noiseNode.stop();
                this.noiseNode.disconnect();
            } catch (e) {
                // Already stopped
            }
            this.noiseNode = null;
        }
    }

    /**
     * Restart sources (useful when changing modes)
     */
    restart() {
        this.stop();
        this.initVoicedSource();
        this.initNoiseSource();
    }
}
