/**
 * Light slide pings. Active preset is the one in the tune sheet.
 * Named copies: noteSfx.sparkle.ts · glide · tick · drip
 */

export const NOTE_SFX_PRESETS = [
  { id: 'sparkle', label: '亮叮' },
  { id: 'chime', label: '风铃' },
  { id: 'crystal', label: '水晶' },
] as const;

export type NoteSfxId = (typeof NOTE_SFX_PRESETS)[number]['id'];

const PING_HZ = [1046.5, 1174.7, 1318.5, 1396.9, 1568.0, 1760.0, 1975.5];

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
let preset: NoteSfxId = 'sparkle';
let lastSwipePreset: NoteSfxId | null = null;

export function getNoteSfxPreset(): NoteSfxId {
  return preset;
}

/** New swipe: pick a different timbre from 亮叮 / 风铃 / 水晶. */
export function beginSwipeSfx(): void {
  const pool = NOTE_SFX_PRESETS.map((p) => p.id);
  const choices = lastSwipePreset ? pool.filter((id) => id !== lastSwipePreset) : pool;
  preset = choices[Math.floor(Math.random() * choices.length)]!;
  lastSwipePreset = preset;
}

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

function hzForIndex(i: number): number {
  return PING_HZ[((i % 7) + 7) % 7]!;
}

/** `steps` degrees below `i`, without wrapping up to B6. */
function hzDownFrom(i: number, steps = 1): number {
  const idx = i - steps;
  if (idx >= 0) return hzForIndex(idx);
  const below = [987.77, 880.0, 783.99, 698.46];
  return below[Math.min(-idx - 1, below.length - 1)]!;
}

function playVoice(c: AudioContext, now: number, hz: number): void {
  switch (preset) {
    case 'chime':
      playChime(c, now, hz);
      break;
    case 'crystal':
      playCrystal(c, now, hz);
      break;
    default:
      playSparkle(c, now, hz);
  }
}

function tone(
  c: AudioContext,
  now: number,
  hz: number,
  type: OscillatorType,
  peak: number,
  attack: number,
  decay: number,
): void {
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(hz, now);
  const g = c.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(peak, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(now);
  osc.stop(now + decay + 0.02);
}

function airBurst(c: AudioContext, now: number, peak: number, hpHz: number, decay: number): void {
  const air = c.createBufferSource();
  air.buffer = airBuffer(c);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(hpHz, now);
  const g = c.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(peak, now + 0.0015);
  g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
  air.connect(hp);
  hp.connect(g);
  g.connect(c.destination);
  air.start(now);
  air.stop(now + decay + 0.01);
}

function playSparkle(c: AudioContext, now: number, hz: number): void {
  const fund = c.createOscillator();
  fund.type = 'sine';
  fund.frequency.setValueAtTime(hz, now);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(520, now);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.16, now + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  fund.connect(hp);
  hp.connect(gain);
  gain.connect(c.destination);
  fund.start(now);
  fund.stop(now + 0.11);
  tone(c, now, hz * 2, 'sine', 0.07, 0.002, 0.045);
  airBurst(c, now, 0.045, 3500, 0.018);
}

function playChime(c: AudioContext, now: number, hz: number): void {
  tone(c, now, hz, 'sine', 0.13, 0.004, 0.14);
  tone(c, now, hz * 1.004, 'sine', 0.08, 0.004, 0.13);
  tone(c, now, hz * 2.01, 'sine', 0.045, 0.003, 0.07);
}

function playCrystal(c: AudioContext, now: number, hz: number): void {
  tone(c, now, hz, 'sine', 0.15, 0.002, 0.1);
  tone(c, now, hz * 3, 'sine', 0.035, 0.002, 0.055);
  airBurst(c, now, 0.02, 5000, 0.012);
}

export function playNoteForCellIndex(zeroBasedIndex: number): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const now = c.currentTime;
  playVoice(c, now, hzForIndex(zeroBasedIndex));
}

/** Same swipe timbre, two descending degrees from the last cell. */
export function playMissSfx(fromIndex: number): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const now = c.currentTime;
  playVoice(c, now, hzDownFrom(fromIndex, 1));
  playVoice(c, now + 0.09, hzDownFrom(fromIndex, 2));
}

export function previewNoteSfx(): void {
  unlockNoteSfx();
  beginSwipeSfx();
  playNoteForCellIndex(0);
  const c = getCtx();
  if (!c) return;
  window.setTimeout(() => playNoteForCellIndex(1), 90);
  window.setTimeout(() => playNoteForCellIndex(2), 180);
}



export function releaseNoteSfx(): void {
  /* one-shots */
}
