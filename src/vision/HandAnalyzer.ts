export interface HandState {
    isPinching: boolean;
    pinchDistance: number;
    isOpen: boolean;
    openness: number;
    palmPosition: { x: number, y: number, z: number };
    tilt: number;
    pitch: number;
    tongueHeight: number;
    tongueBackness: number;
    tongueTip: number;
    pinchVelocity: number;
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

        const isPinching = pinchDist < 0.05;

        // 2. Openness (Average distance of fingertips to wrist)
        const wrist = landmarks[0];
        const tips = [8, 12, 16, 20];
        let totalDist = 0;
        tips.forEach(i => {
            totalDist += Math.sqrt(
                Math.pow(landmarks[i].x - wrist.x, 2) +
                Math.pow(landmarks[i].y - wrist.y, 2) +
                Math.pow(landmarks[i].z - wrist.z, 2)
            );
        });
        const avgDist = totalDist / 4;
        const openness = Math.min(Math.max((avgDist - 0.15) / 0.25, 0), 1);

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

        return {
            isPinching,
            pinchDistance: pinchDist,
            isOpen: openness > 0.8,
            openness,
            palmPosition: { x: wrist.x, y: wrist.y, z: wrist.z },
            tilt: rollMetric,
            pitch,
            tongueHeight,
            tongueBackness,
            tongueTip,
            pinchVelocity
        };
    }
}
