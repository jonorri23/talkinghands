import './style.css'
import { AudioEngine, type MonkeyState } from './audio/AudioEngine';
import { HandTracker } from './vision/HandTracker';
import { HandAnalyzer } from './vision/HandAnalyzer';
import { VowelSpace } from './audio/VowelSpace';
import { ConsonantDetector } from './vision/ConsonantDetector';
import type { ArticulatoryState } from './audio/ArticulatorSynth';

const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;
const pitchValEl = document.getElementById('pitch-val') as HTMLSpanElement;
const vowelValEl = document.getElementById('vowel-val') as HTMLSpanElement;
const videoEl = document.getElementById('webcam') as HTMLVideoElement;
const canvasEl = document.getElementById('output_canvas') as HTMLCanvasElement;
const presetBtns = document.querySelectorAll('.preset-btn');
const soundBtns = document.querySelectorAll('.sound-btn');
const perfToggle = document.getElementById('perf-mode') as HTMLInputElement;
const latencyEl = document.getElementById('latency-display') as HTMLSpanElement;

const audio = new AudioEngine();
let tracker: HandTracker;

let currentMode: 'simple' | 'advanced' | 'bio' | 'articulatory' | 'monkey' = 'advanced';
let currentSound: 'raw' | 'clean' | 'fm' = 'raw';
let isPerfMode = false;

// Articulatory state tracking
let lastBreathLevel = 0;

// UI Event Listeners - Preset (Mode) Buttons
presetBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    const target = e.target as HTMLButtonElement;
    const preset = target.dataset.preset as typeof currentMode;
    currentMode = preset;

    // Update UI
    presetBtns.forEach(b => b.classList.remove('active'));
    target.classList.add('active');

    // Set audio preset for special modes
    if (preset === 'monkey') {
      audio.setPreset('monkey');
    } else if (preset === 'articulatory') {
      audio.setPreset('articulatory');
    } else if (preset === 'bio') {
      audio.setPreset('bio');
    }

    // Show/Hide mode-specific UI
    const bioTweaks = document.getElementById('bio-tweaks');
    const artHint = document.querySelector('.articulatory-hint') as HTMLElement;
    const monkeyControls = document.getElementById('monkey-controls');

    if (bioTweaks) bioTweaks.style.display = preset === 'bio' ? 'flex' : 'none';

    if (monkeyControls) {
      monkeyControls.style.display = preset === 'monkey' ? 'block' : 'none';
    }

    if (artHint) {
      if (preset === 'articulatory') {
        artHint.style.display = 'block';
        artHint.innerText = "💡 TILT hand FORWARD to breathe out / speak";
      } else {
        // Monkey mode has its own panel now, so hide hint for it too
        artHint.style.display = 'none';
      }
    }
  });
});



// Monkey Mode Controls
const voiceSizeSlider = document.getElementById('voice-size') as HTMLInputElement;
const voiceSizeVal = document.getElementById('voice-size-val') as HTMLSpanElement;

if (voiceSizeSlider) {
  voiceSizeSlider.addEventListener('input', (e) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    voiceSizeVal.innerText = val.toFixed(2) + 'x';
    audio.setVoiceSize(val);
  });
}

// UI Event Listeners - Sound (Waveform) Buttons
soundBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    const target = e.target as HTMLButtonElement;
    const sound = target.dataset.sound as typeof currentSound;
    currentSound = sound;

    // Update Audio Engine preset (only for non-bio modes)
    if (currentMode !== 'bio' && currentMode !== 'articulatory') {
      audio.setPreset(sound);
    }

    // Update UI
    soundBtns.forEach(b => b.classList.remove('active'));
    target.classList.add('active');
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


// Bio Mode Parameters (tunable via UI)
let bioParams = {
  fricativeThreshold: 0.8,
  plosiveSensitivity: 0.05
};

// Bind Bio Tweak Sliders
const fricThreshSlider = document.getElementById('fric-thresh') as HTMLInputElement;
const plosiveSensSlider = document.getElementById('plosive-sens') as HTMLInputElement;
const fricThreshVal = document.getElementById('fric-thresh-val') as HTMLSpanElement;
const plosiveSensVal = document.getElementById('plosive-sens-val') as HTMLSpanElement;

if (fricThreshSlider && fricThreshVal) {
  fricThreshSlider.addEventListener('input', (e) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    bioParams.fricativeThreshold = val;
    fricThreshVal.innerText = val.toFixed(2);
  });
}

if (plosiveSensSlider && plosiveSensVal) {
  plosiveSensSlider.addEventListener('input', (e) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    bioParams.plosiveSensitivity = val;
    plosiveSensVal.innerText = val.toFixed(2);
  });
}

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

  // Active Zone Check - Ignore hands outside safe boundaries
  // Safe zone: X [0.2, 0.8], Y [0.1, 0.9] to avoid edge artifacts
  const inActiveZone = (
    state.palmPosition.x > 0.15 && state.palmPosition.x < 0.85 &&
    state.palmPosition.y > 0.1 && state.palmPosition.y < 0.9
  );

  if (!inActiveZone) {
    // Hand is outside active zone, mute or hold last state
    audio.setVolume(0);
    return;
  }

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

  if (currentMode === 'monkey') {
    // --- Monkey Mode ---
    // NEW ERGONOMIC CONTROLS:
    // - Vertical hand position (Y) = Breath/Voicing
    // - Hand rotation (roll) = Pitch
    // - Hand X/Y spatial position = Vowel quality

    const monkeyState: MonkeyState = {
      breathAmount: state.breathAmount,         // From vertical Y (raise hand to speak)
      pitchMultiplier: state.pitchMultiplier,   // From hand roll (twist for pitch)
      vowelBackness: state.tongueBackness,      // Ring finger extension (0=front, 1=back)
      vowelHeight: state.tongueHeight,          // Middle finger extension (0=low, 1=high)
      consonant: ConsonantDetector.detect(state) // Phase 2: Consonant detection
    };


    audio.updateMonkey(monkeyState);

    // Display info
    const basePitch = 150;
    const actualPitch = Math.round(basePitch * state.pitchMultiplier);
    pitchValEl.innerText = actualPitch.toString();

    // Show breath level and vowel
    const breathPercent = Math.round(state.breathAmount * 100);
    const formants = VowelSpace.getFormants(state.tongueBackness, 1 - state.tongueHeight);
    vowelName = `${VowelSpace.getNearestVowel(formants.f1, formants.f2)} (Breath: ${breathPercent}%)`;

    // Don't override formants, they're set in updateMonkey
    vowelValEl.innerText = vowelName;
    return;

  } else if (currentMode === 'articulatory') {
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

    // Display info with tilt debug
    const tiltPercent = Math.round(state.tilt * 100);
    vowelName = `${articulatoryState.isVoiced ? "Voiced" : "Whisper"} (Tilt: ${tiltPercent}%)`;
    // Don't override formants in articulatory mode, they're set internally
    return;

  } else if (currentMode === 'bio') {
    // --- Bio-Mechanical Mode ---
    // 1. Lip Closure (Pinch)
    const closure = Math.min(Math.max((0.1 - state.pinchDistance) / 0.05, 0), 1);

    // 2. Tongue Height & Backness - Use SAME metrics as Advanced mode for quality
    // Use finger-based detection (Middle & Ring fingers) instead of wrist position
    const tongueHeightRaw = state.tongueHeight;     // Middle finger extension
    const tongueBackRaw = state.tongueBackness;     // Ring finger curl

    // 3. Smooth values (same as Advanced mode)
    const smoothFactor = 0.2;
    lastX = lastX + (tongueBackRaw - lastX) * smoothFactor;
    lastY = lastY + (tongueHeightRaw - lastY) * smoothFactor;

    // 4. Voicing (Roll)
    const isVoiced = state.tilt > 0.4;

    // 5. Plosive Trigger
    if (!(window as any).lastClosure) (window as any).lastClosure = 0;
    const dClosure = closure - (window as any).lastClosure;
    (window as any).lastClosure = closure;

    const plosiveTrigger = (closure < 0.8 && (window as any).lastClosure > 0.8 && dClosure < -bioParams.plosiveSensitivity);

    // Map to Formants (using smoothed finger metrics)
    const formants = VowelSpace.getFormants(lastX, 1 - lastY);

    audio.updateBio({
      lipClosure: closure,
      tongueHeight: lastY,  // Use smoothed value
      isVoiced: isVoiced,
      plosiveTrigger: plosiveTrigger,
      fricativeThreshold: bioParams.fricativeThreshold
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
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // Draw Vowel Triangle (IPA vowel chart)
  // Triangle corners: i (top-left), a (bottom-center), u (top-right)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();

  // Triangle vertices (approximate vowel space)
  // i (Front High): x=0.2, y=0.2
  // a (Central Low): x=0.5, y=0.8
  // u (Back High): x=0.8, y=0.2
  const iX = w * 0.2, iY = h * 0.2;
  const aX = w * 0.5, aY = h * 0.8;
  const uX = w * 0.8, uY = h * 0.2;

  ctx.moveTo(iX, iY);
  ctx.lineTo(aX, aY);
  ctx.lineTo(uX, uY);
  ctx.closePath();
  ctx.stroke();

  // Label vowel corners
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '16px Arial';
  ctx.fillText('i (Ee)', iX - 30, iY - 10);
  ctx.fillText('a (Ah)', aX - 15, aY + 25);
  ctx.fillText('u (Oo)', uX + 10, uY - 10);

  // Draw current position
  const screenX = (1 - x) * w; // Invert X (backness)
  const screenY = (1 - y) * h; // Invert Y (height)

  ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
  ctx.beginPath();
  ctx.arc(screenX, screenY, 12, 0, Math.PI * 2);
  ctx.fill();

  // Draw crosshair
  ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(screenX - 20, screenY);
  ctx.lineTo(screenX + 20, screenY);
  ctx.moveTo(screenX, screenY - 20);
  ctx.lineTo(screenX, screenY + 20);
  ctx.stroke();

  // Label
  ctx.fillStyle = 'white';
  ctx.font = 'bold 20px Arial';
  ctx.fillText(label, screenX + 18, screenY);
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
