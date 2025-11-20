import {
    FilesetResolver,
    HandLandmarker,
    DrawingUtils
} from "@mediapipe/tasks-vision";

export class HandTracker {
    private handLandmarker: HandLandmarker | undefined;
    private video: HTMLVideoElement;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private runningMode: "IMAGE" | "VIDEO" = "VIDEO";
    private lastVideoTime = -1;
    private resultsCallback: (result: any) => void;

    private drawingUtils: DrawingUtils | undefined;
    private lastDrawTime = 0;
    private readonly DRAW_INTERVAL = 1000 / 60; // Cap drawing at 60fps

    private modelComplexity: 0 | 1 = 1; // 0=fast, 1=accurate (default)
    private visionFilesetResolver: any; // Store for reinit

    constructor(videoEl: HTMLVideoElement, canvasEl: HTMLCanvasElement, onResults: (result: any) => void) {
        this.video = videoEl;
        this.canvas = canvasEl;
        this.ctx = canvasEl.getContext("2d")!;
        this.resultsCallback = onResults;
        this.drawingUtils = new DrawingUtils(this.ctx);
    }

    async init() {
        this.visionFilesetResolver = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );

        await this.createLandmarker();
        console.log(`Hand Landmarker Loaded (complexity: ${this.modelComplexity})`);
    }

    private async createLandmarker() {
        this.handLandmarker = await HandLandmarker.createFromOptions(this.visionFilesetResolver, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                delegate: "GPU"
            },
            runningMode: this.runningMode,
            numHands: 1
            // Note: MediaPipe Hand Landmarker doesn't have modelComplexity parameter
            // It's only available for Pose/Holistic. We keep this structure for future compatibility
        });
    }

    async setFastMode(enabled: boolean) {
        // MediaPipe Hand Landmarker doesn't support modelComplexity
        // This is a placeholder for future optimization or alternative implementation
        this.modelComplexity = enabled ? 0 : 1;
        console.log(`Fast mode ${enabled ? 'enabled' : 'disabled'} (note: Hand Landmarker doesn't support complexity param)`);
        // In a real implementation, we might switch to a lighter model or reduce processing
    }

    async startCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("Browser API navigator.mediaDevices.getUserMedia not available");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 120, min: 60 }, // Request 120fps for Elgato Facecam MK.2
                facingMode: "user" // Front camera
            }
        });

        // Log actual settings to verify 120fps
        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        console.log(`Camera running at: ${settings.width}x${settings.height} @ ${settings.frameRate}fps`);

        this.video.srcObject = stream;
        this.video.addEventListener("loadeddata", () => {
            this.predictWebcam();
        });
    }

    async predictWebcam() {
        // Ensure canvas matches video size
        if (this.canvas.width !== this.video.videoWidth) {
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
        }

        if (this.handLandmarker && this.video.currentTime !== this.lastVideoTime) {
            this.lastVideoTime = this.video.currentTime;
            const startTimeMs = performance.now();
            const results = this.handLandmarker.detectForVideo(this.video, startTimeMs);
            const processingTime = performance.now() - startTimeMs;

            // 1. Always send data for audio (Low Latency)
            if (results.landmarks && results.landmarks.length > 0) {
                this.resultsCallback({ landmarks: results.landmarks[0], latency: processingTime });
            } else {
                this.resultsCallback({ landmarks: null, latency: processingTime });
            }

            // 2. Draw only if enough time has passed (Cap at 60fps)
            const now = performance.now();
            if (now - this.lastDrawTime >= this.DRAW_INTERVAL) {
                this.lastDrawTime = now;

                this.ctx.save();
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

                if (results.landmarks && this.drawingUtils) {
                    for (const landmarks of results.landmarks) {
                        // Normalize landmarks for visualization (Stabilize rotation)
                        // 1. Center around wrist
                        const wrist = landmarks[0];
                        const centered = landmarks.map(p => ({
                            x: p.x - wrist.x,
                            y: p.y - wrist.y,
                            z: p.z - wrist.z,
                            visibility: p.visibility
                        }));

                        // 2. Rotate so Middle Finger MCP (9) is directly above Wrist (0)
                        // Current angle of vector 0->9
                        const mcp = centered[9];
                        const angle = Math.atan2(mcp.y, mcp.x);
                        const targetAngle = -Math.PI / 2; // Upwards (-90 deg)
                        const rotation = targetAngle - angle;

                        const rotated = centered.map(p => {
                            const x = p.x * Math.cos(rotation) - p.y * Math.sin(rotation);
                            const y = p.x * Math.sin(rotation) + p.y * Math.cos(rotation);
                            return { x, y, z: p.z, visibility: p.visibility };
                        });

                        // 3. Move back to center of canvas
                        const finalLandmarks = rotated.map(p => ({
                            x: p.x + 0.5, // Center X
                            y: p.y + 0.8, // Bottom Y
                            z: p.z,
                            visibility: p.visibility
                        }));

                        this.drawingUtils.drawConnectors(finalLandmarks, HandLandmarker.HAND_CONNECTIONS, {
                            color: "#00FF00",
                            lineWidth: 5
                        });
                        this.drawingUtils.drawLandmarks(finalLandmarks, { color: "#FF0000", lineWidth: 2 });
                    }
                }
                this.ctx.restore();
            }
        }

        window.requestAnimationFrame(() => this.predictWebcam());
    }
}
