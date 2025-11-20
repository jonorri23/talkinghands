import type { HandState } from './HandAnalyzer';

export interface ConsonantGesture {
    type: 'bilabial' | 'labiodental' | 'dental' | 'alveolar' | 'postalveolar' | 'velar' | 'glottal' | 'none';
    closure: number;        // 0-1 degree of constriction
    isComplete: boolean;    // Full closure for plosives
    manner: 'stop' | 'fricative' | 'nasal' | 'approximant' | 'none';
    phoneme?: string;       // Optional: specific IPA phoneme (for manual testing)
}

export class ConsonantDetector {

    static detect(state: HandState): ConsonantGesture {
        const {
            isPinch, pinchDistance,
            isThumbExt, isIndexExt, isMiddleExt, isRingExt, isPinkyExt,
            thumbToFingerDistances
        } = state;

        // Default: No consonant
        const gesture: ConsonantGesture = {
            type: 'none',
            closure: 0,
            isComplete: false,
            manner: 'none'
        };

        // 1. Bilabial (Pinch: Thumb + Index) -> [m, b, p]
        if (isPinch) {
            gesture.type = 'bilabial';
            gesture.closure = Math.max(0, 1 - (pinchDistance / 0.05)); // 0.05m threshold
            gesture.isComplete = gesture.closure > 0.8;
            gesture.manner = 'stop'; // Default to stop/nasal
            return gesture;
        }

        // 2. Labiodental (Thumb + Middle touch) -> [f, v]
        const thumbToMiddle = thumbToFingerDistances[1]; // Index 1 is Middle
        if (thumbToMiddle < 0.05) {
            gesture.type = 'labiodental';
            gesture.closure = Math.max(0, 1 - (thumbToMiddle / 0.05));
            gesture.isComplete = gesture.closure > 0.8;
            gesture.manner = 'fricative';
            return gesture;
        }

        // 3. Dental (Thumb + Ring touch) -> [th, dh]
        const thumbToRing = thumbToFingerDistances[2]; // Index 2 is Ring
        if (thumbToRing < 0.05) {
            gesture.type = 'dental';
            gesture.closure = Math.max(0, 1 - (thumbToRing / 0.05));
            gesture.isComplete = gesture.closure > 0.8;
            gesture.manner = 'fricative';
            return gesture;
        }

        // 4. Lateral Approximant (L-Shape: Thumb + Index extended) -> [l]
        // Must NOT be a pinch (handled above)
        if (isThumbExt && isIndexExt && !isMiddleExt && !isRingExt && !isPinkyExt) {
            gesture.type = 'alveolar'; // [l] is alveolar
            gesture.closure = 0.8; // Partial closure
            gesture.isComplete = false;
            gesture.manner = 'approximant';
            gesture.phoneme = 'l'; // Explicitly identify
            return gesture;
        }

        // 5. Postalveolar (Peace Sign: Index + Middle extended) -> [sh, zh]
        if (isIndexExt && isMiddleExt && !isRingExt && !isPinkyExt && !isThumbExt) {
            gesture.type = 'postalveolar';
            gesture.closure = 0.7; // Fricative constriction
            gesture.isComplete = false;
            gesture.manner = 'fricative';
            return gesture;
        }

        // 6. Labio-velar Glide (Shaka: Thumb + Pinky extended) -> [w]
        if (isThumbExt && isPinkyExt && !isIndexExt && !isMiddleExt && !isRingExt) {
            gesture.type = 'velar'; // [w] is labio-velar
            gesture.closure = 0.5; // Approximant
            gesture.isComplete = false;
            gesture.manner = 'approximant';
            gesture.phoneme = 'w';
            return gesture;
        }

        // 7. Rhotic Approximant (Rock On: Index + Pinky extended) -> [r]
        if (isIndexExt && isPinkyExt && !isMiddleExt && !isRingExt && !isThumbExt) {
            gesture.type = 'alveolar'; // [r] is alveolar/postalveolar
            gesture.closure = 0.6;
            gesture.isComplete = false;
            gesture.manner = 'approximant';
            gesture.phoneme = 'r';
            return gesture;
        }

        // 8. Alveolar (Point: Index only) -> [s, t, d, n]
        if (isIndexExt && !isMiddleExt && !isRingExt && !isPinkyExt && !isThumbExt) {
            gesture.type = 'alveolar';
            gesture.closure = 0.9; // High constriction
            gesture.isComplete = false;
            gesture.manner = 'fricative'; // Default to [s]
            return gesture;
        }

        // 9. Velar (Pinky only) -> [k, g, ng]
        if (isPinkyExt && !isIndexExt && !isMiddleExt && !isRingExt && !isThumbExt) {
            gesture.type = 'velar';
            gesture.closure = 1.0; // Full closure
            gesture.isComplete = true;
            gesture.manner = 'stop';
            return gesture;
        }

        // 10. Glottal (Open Hand) -> [h]
        if (isIndexExt && isMiddleExt && isRingExt && isPinkyExt) {
            gesture.type = 'glottal';
            gesture.closure = 0.4;
            gesture.isComplete = false;
            gesture.manner = 'fricative';
            return gesture;
        }

        return gesture;
    }
}
