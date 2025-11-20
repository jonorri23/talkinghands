export interface HandState {
    isPinching: boolean;
    pinchDistance: number;
    isOpen: boolean;
    openness: number; // 0 (Fist) to 1 (Open Palm)
    palmPosition: { x: number, y: number, z: number };
    tilt: number; // Hand rotation (Roll)
    pitch: number; // Forward/Backward Tilt

    // Bio-Mechanical Specifics
    tongueHeight: number;   // Middle Finger Extension (0..1)
    tongueBackness: number; // Ring Finger Curl (0..1)
    tongueTip: number;      // Pinky Extension (0..1)
    pinchVelocity: number;  // Rate of change of pinch distance
}

export class HandAnalyzer {
    private static lastPinchDist = 0;
    private static lastTime = 0;

    static analyze(landmarks: any[]): HandState {
        // Landmarks:
        // 0: Wrist
        // 4: Thumb Tip
        // 8: Index Tip
        // 12: Middle Tip
        // 16: Ring Tip
        // 20: Pinky Tip

        // 1. Pinch Detection (Thumb to Index)
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const pinchDist = Math.sqrt(
            Math.pow(thumbTip.x - indexTip.x, 2) +
            Math.pow(thumbTip.y - indexTip.y, 2)
        );
        const isPinching = pinchDist < 0.05;

        // Calculate velocity (dPinch/dt)
        const now = performance.now();
        const dt = (now - this.lastTime) / 1000; // Seconds
        let pinchVelocity = 0;

        if (dt > 0 && dt < 0.1) { // Ignore if dt is too large (e.g. tab backgrounded)
            pinchVelocity = (pinchDist - this.lastPinchDist) / dt;
        }

        this.lastPinchDist = pinchDist;
        this.lastTime = now;

        // 2. Openness (Average distance of tips from wrist)
        const wrist = landmarks[0];
        const tips = [8, 12, 16, 20];
        let totalDist = 0;

        tips.forEach(idx => {
            const tip = landmarks[idx];
            const d = Math.sqrt(
                Math.pow(tip.x - wrist.x, 2) +
                Math.pow(tip.y - wrist.y, 2)
            );
            totalDist += d;
        });

        const avgDist = totalDist / 4;
        // Map avgDist (approx 0.1 to 0.4) to 0..1
        const openness = Math.min(Math.max((avgDist - 0.15) / 0.25, 0), 1);

        // 3. Tilt / Orientation
        // Use 3D distance for Hand Size (Wrist to Middle MCP)
        const handSize = Math.sqrt(
            Math.pow(landmarks[0].x - landmarks[9].x, 2) +
            Math.pow(landmarks[0].y - landmarks[9].y, 2) +
            Math.pow(landmarks[0].z - landmarks[9].z, 2)
        );

        const width = Math.abs(landmarks[4].x - landmarks[20].x);
        const rollMetric = width / handSize;

        // Pitch (Forward/Backward Tilt)
        // Compare Z of Middle Finger MCP (9) vs Wrist (0)
        // Normalized by hand size
        const pitchRaw = (landmarks[9].z - landmarks[0].z) / handSize;
        // pitchRaw < -0.2 means tilting forward (towards camera)
        // pitchRaw > 0.2 means tilting backward
        const pitch = pitchRaw;

        // 4. Individual Finger States (Normalized by Hand Size)
        // Use 3D distances to handle foreshortening (rotation/skew)

        // Middle (12) -> Tongue Height
        const middleDist = Math.sqrt(
            Math.pow(landmarks[12].x - wrist.x, 2) +
            Math.pow(landmarks[12].y - wrist.y, 2) +
            Math.pow(landmarks[12].z - wrist.z, 2)
        );
        // Tuned range: 1.2 to 1.8 x handSize seems typical for extension
        const tongueHeight = Math.min(Math.max((middleDist / handSize - 1.0) / 0.8, 0), 1);

        // Ring (16) -> Tongue Backness (Curl)
        const ringDist = Math.sqrt(
            Math.pow(landmarks[16].x - wrist.x, 2) +
            Math.pow(landmarks[16].y - wrist.y, 2) +
            Math.pow(landmarks[16].z - wrist.z, 2)
        );
        const ringExt = Math.min(Math.max((ringDist / handSize - 1.0) / 0.8, 0), 1);
        const tongueBackness = 1 - ringExt; // Invert

        // 4. Tongue Tip (Index Finger Tip #8)
        // Relative to Wrist #0 or Middle MCP #9?
        // Let's use Index Tip Y relative to Wrist Y.
        // Normalized by hand size.
        // High Tip (small Y) = 1. Low Tip (large Y) = 0.
        const indexTipY = landmarks[8].y;
        const wristY = landmarks[0].y;
        // If Tip is above Wrist (smaller Y), value is positive.
        // We want 0..1 range.
        // Usually Tip is above Wrist.
        const tipHeight = (wristY - indexTipY) / handSize;
        // Clamp 0..1.5 -> 0..1
        const tongueTip = Math.min(Math.max(tipHeight, 0), 1.5) / 1.5;

        return {
            isPinching,
            pinchDistance: pinchDist,
            isOpen: openness > 0.8,
            openness,
            palmPosition: { x: wrist.x, y: wrist.y, z: wrist.z },
            tilt: rollMetric, // 0 (Side) to 1 (Flat)
            pitch, // Forward/Backward tilt
            tongueHeight,
            tongueBackness,
            tongueTip // 0 (Low) to 1 (High)
            ,
            pinchVelocity
        };
    }
}
