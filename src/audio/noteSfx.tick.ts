/**
 * Slide tick: short wood-click per cell. Pitch steps 1–7, no sustain.
 * Glide backup: src/audio/noteSfx.glide.ts
 */

const TICK_HZ = [1480, 1660, 1860, 1980, 2220, 2490, 2790];
const CLICK_SEC = 0.038;

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const n = Math.ceil(c.sampleRate * 0.05);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  return buf;
}

export function unlockNoteSfx(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
}

export function preloadNoteSfx(): void {
  const c = getCtx();
  if (c) noiseBuffer(c);
}

function hzForIndex(zeroBasedIndex: number): number {
  return TICK_HZ[((zeroBasedIndex % 7) + 7) % 7]!;
}

export function playNoteForCellIndex(zeroBasedIndex: number): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const now = c.currentTime;
  const hz = hzForIndex(zeroBasedIndex);

  const osc = c.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(hz, now);
  const oscGain = c.createGain();
  oscGain.gain.setValueAtTime(0, now);
  oscGain.gain.linearRampToValueAtTime(0.09, now + 0.003);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, now + CLICK_SEC);
  osc.connect(oscGain);
  oscGain.connect(c.destination);
  osc.start(now);
  osc.stop(now + CLICK_SEC + 0.01);

  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(hz * 1.15, now);
  bp.Q.value = 4.5;
  const nGain = c.createGain();
  nGain.gain.setValueAtTime(0, now);
  nGain.gain.linearRampToValueAtTime(0.16, now + 0.002);
  nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);
  src.connect(bp);
  bp.connect(nGain);
  nGain.connect(c.destination);
  src.start(now);
  src.stop(now + 0.03);
}

export function releaseNoteSfx(): void {
  /* ticks are one-shots */
}
