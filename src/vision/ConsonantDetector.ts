import type { HandState } from './HandAnalyzer';

export interface ConsonantGesture {
    type: 'bilabial' | 'alveolar' | 'velar' | 'glottal' | 'none';
    closure: number;        // 0-1 degree of constriction
    isComplete: boolean;    // Full closure for plosives
    manner: 'stop' | 'fricative' | 'nasal' | 'approximant' | 'none';
    phoneme?: string;       // Optional: specific IPA phoneme (for manual testing)
}

export class ConsonantDetector {

    static detect(state: HandState): ConsonantGesture {
        // Strategy 1: Hybrid Spatial+Poses

        // 1. Bilabial (Lips) -> Pinch
        // Thumb touching Index
        if (state.pinchDistance < 0.05) {
            // Map distance 0.05->0.0 to closure 0.0->1.0
            const closure = Math.min(Math.max((0.05 - state.pinchDistance) / 0.04, 0), 1);

            return {
                type: 'bilabial',
                closure: closure,
                isComplete: closure > 0.9,
                manner: 'stop' // Default to stop/nasal for pinch
            };
        }

        // 2. Alveolar (Teeth) -> Pointing (Index + Middle extended)
        // We use tongueHeight (Middle finger) as a proxy for "pointing" intent
        // If Middle is extended (High tongueHeight) AND we are NOT pinching
        if (state.tongueHeight > 0.8 && !state.isPinching) {
            // Check if it's a fricative gesture (maybe slightly different?)
            // For now, let's map extension to closure/proximity
            const closure = (state.tongueHeight - 0.8) / 0.2;

            return {
                type: 'alveolar',
                closure: closure,
                isComplete: false, // Pointing usually doesn't fully close unless we define a "touch"
                manner: 'fricative' // Pointing = [s], [t] (if burst)
            };
        }

        // 3. Velar (Back) -> Pinky Extension
        // tongueTip is Pinky extension
        if (state.tongueTip > 0.8) {
            const closure = (state.tongueTip - 0.8) / 0.2;
            return {
                type: 'velar',
                closure: closure,
                isComplete: false,
                manner: 'stop' // [k], [g]
            };
        }

        // 4. Glottal (Open) -> Flat hand / Open
        // If openness is high
        if (state.openness > 0.8) {
            return {
                type: 'glottal',
                closure: 0,
                isComplete: false,
                manner: 'fricative' // [h]
            };
        }

        return {
            type: 'none',
            closure: 0,
            isComplete: false,
            manner: 'none'
        };
    }
}
