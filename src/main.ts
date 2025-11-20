import './style.css'
import { AudioEngine, type PresetName } from './audio/AudioEngine';
import { HandTracker } from './vision/HandTracker';
import { HandAnalyzer } from './vision/HandAnalyzer';
import { VowelSpace } from './audio/VowelSpace';
import type { ArticulatoryState } from './audio/ArticulatorSynth';

const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;
const pitchValEl = document.getElementById('pitch-val') as HTMLSpanElement;
const vowelValEl = document.getElementById('vowel-val') as HTMLSpanElement;
const videoEl = document.getElementById('webcam') as HTMLVideoElement;
const canvasEl = document.getElementById('output_canvas') as HTMLCanvasElement;
const modeSelector = document.getElementById('mode-selector') as HTMLSelectElement;
const presetBtns = document.querySelectorAll('.preset-btn');
const perfToggle = document.getElementById('perf-mode') as HTMLInputElement;
const latencyEl = document.getElementById('latency-display') as HTMLSpanElement;

const audio = new AudioEngine();
let tracker: HandTracker;

let currentMode = 'advanced';
let currentPreset: PresetName = 'raw';
let isPerfMode = false;

// Articulatory state tracking
let lastBreathLevel = 0;

// UI Event Listeners
modeSelector.addEventListener('change', (e) => {
  currentMode = (e.target as HTMLSelectElement).value;
});

presetBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    const target = e.target as HTMLButtonElement;
    const preset = target.dataset.preset as PresetName;
    currentPreset = preset;

    // Update Audio
    audio.setPreset(preset);

    // Update UI
    presetBtns.forEach(b => b.classList.remove('active'));
    target.classList.add('active');

    // Show/Hide UI elements
    const bioTweaks = document.getElementById('bio-tweaks');
    const artHint = document.querySelector('.articulatory-hint') as HTMLElement;

    if (bioTweaks) bioTweaks.style.display = preset === 'bio' ? 'flex' : 'none';
    if (artHint) {
      artHint.style.display = preset === 'articulatory' ? 'block' : 'none';
      artHint.innerText = "💡 TILT hand FORWARD to breathe out / speak";
    }
  });
});

perfToggle.addEventListener('change', (e) => {
  isPerfMode = (e.target as HTMLInputElement).checked;
  if (isPerfMode) {
    videoEl.style.opacity = '0';
    canvasEl.style.opacity = '0';
  } else {
    videoEl.style.opacity = '1';
    canvasEl.style.opacity = '1';
  }
});

// Spacebar removed - using Tilt for breath control

// State for smoothing
let lastX = 0.5;
let lastY = 0.5;

function handleHandData(data: { landmarks: any[] | null, latency: number }) {
  // Update latency display
  if (latencyEl) {
    latencyEl.innerText = `${Math.round(data.latency)}ms`;
  }

  if (!data.landmarks) {
    return;
  }

  const state = HandAnalyzer.analyze(data.landmarks);
  const ctx = canvasEl.getContext('2d')!;

  // 1. Pitch: Wrist Y (Inverted)
  const pitch = 100 + (1 - state.palmPosition.y) * 300;
  audio.setPitch(pitch);
  pitchValEl.innerText = Math.round(pitch).toString();

  // 2. Volume: Pinch
  const vol = Math.min(Math.max((state.pinchDistance - 0.03) / 0.1, 0), 1);
  audio.setVolume(vol);

  // 3. Vowel Mapping based on Mode
  let f1, f2, f3, vowelName;

  if (currentPreset === 'articulatory') {
    // --- Articulatory Mode ---
    const lipClosure = Math.min(Math.max((0.1 - state.pinchDistance) / 0.07, 0), 1);

    // Detect Plosive (Rapid Opening)
    const plosiveTrigger = state.pinchVelocity < -2.0; // Fast opening

    // Breath Control: Tilt Forward (Pitch)
    // Pitch < -0.15 starts breath. Map -0.15 to -0.4 to 0..1 energy.
    const breathThreshold = -0.15;
    const maxBreathTilt = -0.4;

    let breathLevel = 0;
    if (state.pitch < breathThreshold) {
      breathLevel = Math.min((breathThreshold - state.pitch) / (breathThreshold - maxBreathTilt), 1.0);
    }

    // Trigger if breath level goes from 0 to > 0
    const energyTrigger = breathLevel > 0 && lastBreathLevel === 0;

    // Continuous pressure control
    if (breathLevel > 0) {
      // If already triggered, we might want to modulate volume/pressure
      // audio.setPressure(breathLevel); // Todo: Implement pressure modulation
    } else if (lastBreathLevel > 0) {
      audio.releaseEnergy();
    }

    lastBreathLevel = breathLevel;


    const articulatoryState: ArticulatoryState = {
      lipClosure,
      tongueHeight: state.tongueHeight,
      tongueBackness: state.tongueBackness,
      tongueTipPosition: state.tongueTip,
      isVoiced: state.tilt > 0.4,
      plosiveTrigger,
      energyTrigger
    };

    audio.updateArticulatory(articulatoryState);

    // Display info
    vowelName = articulatoryState.isVoiced ? "Voiced" : "Whisper";
    // Don't override formants in articulatory mode, they're set internally
    return;

  } else if (currentPreset === 'bio') {
    // --- Bio-Mechanical Mode ---
    // 1. Lip Closure (Pinch)
    // Pinch < 0.05 = Closed (1). Open > 0.1 = Open (0).
    const closure = Math.min(Math.max((0.1 - state.pinchDistance) / 0.05, 0), 1);

    // 2. Tongue Height (Hand Y)
    // High Hand (Low Y) = High Tongue (High F1? No, High Tongue = Low F1 usually, like "Ee")
    // Wait, "Ee" is High Tongue. "Ah" is Low Tongue.
    // Let's map Hand Y (0=Top) to Tongue Height (1=High).
    const tongueHeight = 1 - state.palmPosition.y;

    // 3. Tongue Backness (Hand X)
    // Left (1) = Back. Right (0) = Front.
    const tongueBack = 1 - state.palmPosition.x;

    // 4. Tongue Tip (Index Finger)
    // HandAnalyzer now returns this (0..1)
    // If not available (old analyzer), default to 0.
    const tongueTip = (state as any).tongueTip || 0;

    // 5. Voicing (Roll)
    const isVoiced = state.tilt > 0.4;

    // 6. Plosive Trigger
    // Detect rapid opening: dClosure/dt < -threshold
    // Simple state history
    if (!(window as any).lastClosure) (window as any).lastClosure = 0;
    const dClosure = closure - (window as any).lastClosure;
    (window as any).lastClosure = closure;

    // If we were closed (>0.8) and now opening fast (dClosure < -0.1)
    const plosiveTrigger = (closure < 0.8 && (window as any).lastClosure > 0.8 && dClosure < -0.05);

    // Map Tongue to Formants
    const formants = VowelSpace.getFormants(tongueBack, 1 - tongueHeight);

    audio.updateBio({
      lipClosure: closure,
      tongueHeight: tongueHeight,
      tongueBackness: tongueBack,
      tongueTip: tongueTip,
      isVoiced: isVoiced,
      plosiveTrigger: plosiveTrigger
    });

    f1 = formants.f1;
    f2 = formants.f2;
    f3 = formants.f3;
    vowelName = isVoiced ? VowelSpace.getNearestVowel(f1, f2) : "Whisper";

    // Override Volume for Bio Mode (Constant air pressure, modulated by closure)
    // But we still want some control. Let's use "Space" key or just always on?
    // Let's keep using the Pinch-Volume logic for now as a "Master Airflow" fallback
    // if closure is not 100%.
    // Actually, in Bio mode, "Volume" is Air Pressure.
    // Let's set it to 1.0 and let closure handle the rest.
    audio.setVolume(1.0);

  } else if (currentMode === 'simple') {
    // Simple Mode: Just Open/Close
    const t = state.openness;
    f1 = 300 + t * (730 - 300);
    f2 = 870 + t * (1090 - 870);
    f3 = 2240 + t * (2440 - 2240);
    vowelName = t > 0.5 ? "Ah" : "Oo";
  } else {
    // Advanced Mode: 2D Vowel Space
    // Use Articulatory metrics for consistency
    const backness = state.tongueBackness; // Ring finger
    const height = state.tongueHeight;     // Middle finger

    // Smooth values
    const smoothFactor = 0.2;
    lastX = lastX + (backness - lastX) * smoothFactor;
    lastY = lastY + (height - lastY) * smoothFactor;

    const formants = VowelSpace.getFormants(lastX, 1 - lastY); // Invert Y for VowelSpace (0=High F1/Low Tongue)
    f1 = formants.f1;
    f2 = formants.f2;
    f3 = formants.f3;
    vowelName = VowelSpace.getNearestVowel(f1, f2);

    // Draw Vowel Space Debug (Only if not in Perf Mode)
    if (!isPerfMode) {
      drawVowelDebug(ctx, lastX, lastY, vowelName);
    }
  }

  audio.setFormants(f1, f2, f3);
  vowelValEl.innerText = vowelName;

  // 4. Consonants / Noise
  // Trigger noise if hand moves laterally very fast?
  // Or maybe use a specific gesture (Pinky out?)
  // For now, let's map Noise to "Tilt" or just keep it simple.
  // Let's use "Roll" (Hand rotation) for Noise if we can detect it.
  // Alternatively, use Y-velocity.

  // Simple Consonant: If Pinch is VERY close (< 0.01), trigger burst?
  // Let's leave noise off for now unless we have a good trigger.
}

function drawVowelDebug(ctx: CanvasRenderingContext2D, x: number, y: number, label: string) {
  // Draw a small crosshair indicating current vowel position
  // Map x,y (0..1) to canvas dimensions
  // Note: Canvas is mirrored in CSS, but drawing coordinates are normal.
  // However, our X is "Backness". 
  // If X=0 (Right/Front), X=1 (Left/Back).

  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  const screenX = (1 - x) * w; // Invert X for visual match (if needed)
  const screenY = (1 - y) * h; // Invert Y (0 is top, but 0 is Close/Low F1... wait)
  // Y=0 (Close) -> Low F1. Y=1 (Open) -> High F1.
  // Visually, usually High F1 is at the bottom of the chart.
  // So Y=1 should be at bottom.

  ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
  ctx.beginPath();
  ctx.arc(screenX, screenY, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'white';
  ctx.font = '20px Arial';
  ctx.fillText(label, screenX + 15, screenY);
}

async function init() {
  statusEl.innerText = "Loading Vision Model...";
  tracker = new HandTracker(videoEl, canvasEl, handleHandData);
  await tracker.init();
  statusEl.innerText = "Ready. Press Start.";
  startBtn.disabled = false;
}

startBtn.addEventListener('click', async () => {
  await audio.init();
  audio.start();
  await tracker.startCamera();
  statusEl.innerText = "Running";
  startBtn.style.display = 'none';
});

init();
