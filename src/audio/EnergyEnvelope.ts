export class EnergyEnvelope {
    private audioContext: AudioContext;
    private gainNode: GainNode;

    // ADSR Parameters (in seconds)
    attack = 0.01;
    decay = 0.3;
    sustain = 0.0; // Silence by default when not active
    release = 0.2;

    private isTriggered = false;

    constructor(context: AudioContext) {
        this.audioContext = context;
        this.gainNode = context.createGain();
        this.gainNode.gain.value = 0;
    }

    get node(): GainNode {
        return this.gainNode;
    }

    trigger(velocity: number = 1.0) {
        const now = this.audioContext.currentTime;

        // Cancel any scheduled updates to avoid conflicts
        this.gainNode.gain.cancelScheduledValues(now);

        // Attack
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.linearRampToValueAtTime(velocity, now + this.attack);

        // Decay to Sustain
        // For speech, "sustain" is usually the lung pressure slowly dropping
        // Let's model a slow decay instead of a fixed sustain level if held
        this.gainNode.gain.exponentialRampToValueAtTime(0.01, now + this.attack + this.decay);

        this.isTriggered = true;
    }

    releaseNote() {
        if (!this.isTriggered) return;

        const now = this.audioContext.currentTime;
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.exponentialRampToValueAtTime(0.001, now + this.release);

        this.isTriggered = false;
    }

    // For continuous "breath" control if needed
    setLevel(level: number) {
        const now = this.audioContext.currentTime;
        this.gainNode.gain.setTargetAtTime(level, now, 0.05);
    }
}
