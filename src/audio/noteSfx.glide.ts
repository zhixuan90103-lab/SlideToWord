/**
 * BACKUP of the glide+pluck slide tone (2026-03-18).
 * Restore: copy this file over noteSfx.ts
 *
 * Slide tone: a quiet pitch-glide under the finger, plus a soft
 * overlapping pluck on each new cell (C major, wraps at 7).
 * Generated — no chopped sample tails.
 */

const DEGREES_HZ = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88];
const GLIDE_SEC = 0.055;
const PLUCK_DECAY = 0.48;

let ctx: AudioContext | null = null;
let glideOsc: OscillatorNode | null = null;
let glideGain: GainNode | null = null;
let glideFilter: BiquadFilterNode | null = null;
let lastHz = DEGREES_HZ[0]!;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

export function unlockNoteSfx(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
}

export function preloadNoteSfx(): void {
  getCtx();
}

function hzForIndex(zeroBasedIndex: number): number {
  return DEGREES_HZ[((zeroBasedIndex % 7) + 7) % 7]!;
}

function ensureGlide(c: AudioContext, now: number, hz: number): void {
  if (glideOsc && glideGain && glideFilter) return;
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(hz, now);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1400, now);
  filter.Q.value = 0.4;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, now);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  glideOsc = osc;
  glideGain = gain;
  glideFilter = filter;
}

function playPluck(c: AudioContext, now: number, hz: number): void {
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(hz, now);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2200, now);
  filter.Q.value = 0.7;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, now + PLUCK_DECAY);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + PLUCK_DECAY + 0.02);
}

export function playNoteForCellIndex(zeroBasedIndex: number): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const now = c.currentTime;
  const hz = hzForIndex(zeroBasedIndex);
  ensureGlide(c, now, lastHz);
  if (glideOsc && glideGain) {
    const from = lastHz;
    glideOsc.frequency.cancelScheduledValues(now);
    glideOsc.frequency.setValueAtTime(from, now);
    glideOsc.frequency.exponentialRampToValueAtTime(Math.max(hz, 20), now + GLIDE_SEC);
    glideGain.gain.cancelScheduledValues(now);
    const cur = Math.max(glideGain.gain.value, 0.0001);
    glideGain.gain.setValueAtTime(cur, now);
    glideGain.gain.linearRampToValueAtTime(0.07, now + 0.02);
  }
  lastHz = hz;
  playPluck(c, now, hz);
}

export function releaseNoteSfx(): void {
  const c = ctx;
  if (!c || !glideGain || !glideOsc) {
    lastHz = DEGREES_HZ[0]!;
    return;
  }
  const now = c.currentTime;
  const osc = glideOsc;
  const gain = glideGain;
  gain.gain.cancelScheduledValues(now);
  const cur = Math.max(gain.gain.value, 0.0001);
  gain.gain.setValueAtTime(cur, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  try {
    osc.stop(now + 0.14);
  } catch {
    /* already stopped */
  }
  glideOsc = null;
  glideGain = null;
  glideFilter = null;
  lastHz = DEGREES_HZ[0]!;
}
