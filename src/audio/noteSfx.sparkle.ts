/**
 * Slide sparkle (kept): light high ping per cell. Pitch steps 1–7.
 * Same copy: noteSfx.sparkle.ts
 * Other: noteSfx.glide.ts · noteSfx.tick.ts · noteSfx.drip.ts
 */

const PING_HZ = [1046.5, 1174.7, 1318.5, 1396.9, 1568.0, 1760.0, 1975.5];
const RING_SEC = 0.09;

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

function airBuffer(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const n = Math.ceil(c.sampleRate * 0.04);
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
  if (c) airBuffer(c);
}

function hzForIndex(zeroBasedIndex: number): number {
  return PING_HZ[((zeroBasedIndex % 7) + 7) % 7]!;
}

export function playNoteForCellIndex(zeroBasedIndex: number): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const now = c.currentTime;
  const hz = hzForIndex(zeroBasedIndex);

  const fund = c.createOscillator();
  fund.type = 'sine';
  fund.frequency.setValueAtTime(hz, now);

  const spark = c.createOscillator();
  spark.type = 'sine';
  spark.frequency.setValueAtTime(hz * 2, now);

  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(520, now);
  hp.Q.value = 0.5;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.16, now + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + RING_SEC);

  const sparkGain = c.createGain();
  sparkGain.gain.setValueAtTime(0, now);
  sparkGain.gain.linearRampToValueAtTime(0.07, now + 0.002);
  sparkGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

  fund.connect(hp);
  hp.connect(gain);
  gain.connect(c.destination);
  spark.connect(sparkGain);
  sparkGain.connect(c.destination);

  const air = c.createBufferSource();
  air.buffer = airBuffer(c);
  const airHp = c.createBiquadFilter();
  airHp.type = 'highpass';
  airHp.frequency.setValueAtTime(3500, now);
  const airGain = c.createGain();
  airGain.gain.setValueAtTime(0, now);
  airGain.gain.linearRampToValueAtTime(0.045, now + 0.0015);
  airGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);
  air.connect(airHp);
  airHp.connect(airGain);
  airGain.connect(c.destination);

  fund.start(now);
  spark.start(now);
  air.start(now);
  fund.stop(now + RING_SEC + 0.02);
  spark.stop(now + 0.055);
  air.stop(now + 0.025);
}

export function releaseNoteSfx(): void {
  /* one-shots */
}
