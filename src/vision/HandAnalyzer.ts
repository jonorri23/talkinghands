export interface HandState {
    isPinching: boolean;
    pinchDistance: number;
    isOpen: boolean;
    openness: number;
    palmPosition: { x: number, y: number, z: number };
    tilt: number;
    pitch: number; // Forward/back tilt (legacy, kept for compatibility)
    tongueHeight: number;
    tongueBackness: number;
    tongueTip: number;
    pinchVelocity: number;

    // Monkey Mode Controls (Swapped for better ergonomics)
    breathAmount: number;      // 0-1 from vertical Y (low hand = 0, high hand = 1)
    pitchMultiplier: number;   // 0.5-2.0 from hand roll/rotation

    // Finger States (for gesture recognition)
    isPinch: boolean;
    isThumbExt: boolean;
    isIndexExt: boolean;
    isMiddleExt: boolean;
    isRingExt: boolean;
    isPinkyExt: boolean;
    thumbToFingerDistances: number[]; // [index, middle, ring, pinky]
}

export class HandAnalyzer {
    private static lastPinchDist = 0;
    private static lastTime = 0;

    static analyze(landmarks: any[]): HandState {
        const now = performance.now();
        const dt = (now - HandAnalyzer.lastTime) / 1000;
        HandAnalyzer.lastTime = now;

        // 1. Pinch Detection (Thumb #4 to Index #8)
        const pinchDist = Math.sqrt(
            Math.pow(landmarks[4].x - landmarks[8].x, 2) +
            Math.pow(landmarks[4].y - landmarks[8].y, 2) +
            Math.pow(landmarks[4].z - landmarks[8].z, 2)
        );

        let pinchVelocity = 0;
        if (dt > 0) {
            pinchVelocity = (pinchDist - HandAnalyzer.lastPinchDist) / dt;
        }
        HandAnalyzer.lastPinchDist = pinchDist;

        // 2. Openness (Average distance of fingertips to wrist)
        const wrist = landmarks[0];

        // Helper: Calculate distance between two 3D points
        const dist = (p1: any, p2: any) => {
            return Math.sqrt(
                Math.pow(p1.x - p2.x, 2) +
                Math.pow(p1.y - p2.y, 2) +
                Math.pow(p1.z - p2.z, 2)
            );
        };

        // Calculate average distance of fingertips to wrist (for openness)
        const avgDist = (
            dist(landmarks[8], wrist) +
            dist(landmarks[12], wrist) +
            dist(landmarks[16], wrist) +
            dist(landmarks[20], wrist)
        ) / 4;
        const openness = Math.min(Math.max((avgDist - 0.15) / 0.25, 0), 1);
        // openness is calculated here but only used in return object
        // We can inline it or keep it. Let's keep it for clarity but use it.

        // 3. Tilt / Orientation
        const handSize = Math.sqrt(
            Math.pow(landmarks[0].x - landmarks[9].x, 2) +
            Math.pow(landmarks[0].y - landmarks[9].y, 2)
        );

        const width = Math.abs(landmarks[4].x - landmarks[20].x);
        const rollMetric = width / handSize; // Large = Flat, Small = Side

        // Pitch (Forward/Back tilt) - for breath control in articulatory mode
        const pitch = (landmarks[9].z - landmarks[0].z) / handSize;

        // Tongue Height: Middle Finger Extension
        const middleDist = Math.sqrt(
            Math.pow(landmarks[12].x - wrist.x, 2) +
            Math.pow(landmarks[12].y - wrist.y, 2) +
            Math.pow(landmarks[12].z - wrist.z, 2)
        );
        const tongueHeight = Math.min(Math.max((middleDist / handSize - 1.0) / 0.8, 0), 1);

        // Tongue Backness: Ring Finger Extension
        const ringDist = Math.sqrt(
            Math.pow(landmarks[16].x - wrist.x, 2) +
            Math.pow(landmarks[16].y - wrist.y, 2) +
            Math.pow(landmarks[16].z - wrist.z, 2)
        );
        const ringExt = Math.min(Math.max((ringDist / handSize - 1.0) / 0.8, 0), 1);
        const tongueBackness = 1 - ringExt; // Invert

        // Tongue Tip: Pinky Extension
        const pinkyDist = Math.sqrt(
            Math.pow(landmarks[20].x - wrist.x, 2) +
            Math.pow(landmarks[20].y - wrist.y, 2) +
            Math.pow(landmarks[20].z - wrist.z, 2)
        );
        const tongueTip = Math.min(Math.max((pinkyDist / handSize - 0.8) / 0.8, 0), 1);

        // === MONKEY MODE: Swapped Ergonomic Controls ===

        // Breath Amount: Vertical Y position (0.1 = low/silence, 0.9 = high/full voice)
        // Inverted: higher hand (lower Y value) = more breath
        const breathAmount = Math.min(Math.max((0.9 - wrist.y) / 0.8, 0), 1);

        // Pitch Multiplier: Forward/Backward tilt (0.7 to 1.5x)
        // pitch metric: positive = tilted back, negative = tilted forward
        // Neutral (flat hand) = 1.0x base pitch
        // Tilt forward = lower pitch, tilt back = higher pitch
        // Map pitch range of -0.3 to +0.3 → multiplier 0.7 to 1.5
        const pitchMultiplier = 1.0 + (pitch * 1.3); // Centered at 1.0, range ~0.7-1.5

        // Finger Extension Logic (simplified for now)
        const isPinch = pinchDist < 0.05; // Re-using existing pinch logic
        const isThumbExt = landmarks[4].y < landmarks[3].y; // Thumb tip higher than base
        const isIndexExt = landmarks[8].y < landmarks[7].y; // Index tip higher than base
        const isMiddleExt = landmarks[12].y < landmarks[11].y; // Middle tip higher than base
        const isRingExt = landmarks[16].y < landmarks[15].y; // Ring tip higher than base
        const isPinkyExt = landmarks[20].y < landmarks[19].y; // Pinky tip higher than base

        const thumbToFingerDistances = [
            Math.sqrt(Math.pow(landmarks[4].x - landmarks[8].x, 2) + Math.pow(landmarks[4].y - landmarks[8].y, 2) + Math.pow(landmarks[4].z - landmarks[8].z, 2)), // Thumb-Index
            Math.sqrt(Math.pow(landmarks[4].x - landmarks[12].x, 2) + Math.pow(landmarks[4].y - landmarks[12].y, 2) + Math.pow(landmarks[4].z - landmarks[12].z, 2)), // Thumb-Middle
            Math.sqrt(Math.pow(landmarks[4].x - landmarks[16].x, 2) + Math.pow(landmarks[4].y - landmarks[16].y, 2) + Math.pow(landmarks[4].z - landmarks[16].z, 2)), // Thumb-Ring
            Math.sqrt(Math.pow(landmarks[4].x - landmarks[20].x, 2) + Math.pow(landmarks[4].y - landmarks[20].y, 2) + Math.pow(landmarks[4].z - landmarks[20].z, 2))  // Thumb-Pinky
        ];

        return {
            // Existing properties
            isPinching: isPinch, // Legacy alias
            pinchDistance: pinchDist,
            isOpen: !isPinch && isIndexExt && isMiddleExt && isRingExt && isPinkyExt,
            openness: openness, // Use the calculated continuous value
            palmPosition: landmarks[0], // Wrist
            tilt: rollMetric, // Legacy
            pitch: pitch, // Legacy
            tongueHeight: tongueHeight, // Calculated below
            tongueBackness: tongueBackness, // Calculated below
            tongueTip: tongueTip, // Legacy
            pinchVelocity: pinchVelocity, // Legacy
            breathAmount: breathAmount, // Calculated in main.ts or below
            pitchMultiplier: pitchMultiplier, // Calculated below

            // New properties for extended gesture recognition
            isPinch,
            isThumbExt,
            isIndexExt,
            isMiddleExt,
            isRingExt,
            isPinkyExt,
            thumbToFingerDistances
        };
    }
}

