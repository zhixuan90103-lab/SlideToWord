/**
 * Slide drip: soft glass-bubble per cell. Pitch steps 1–7.
 * Backups: noteSfx.glide.ts (legato) · noteSfx.tick.ts (wood click)
 */

const DRIP_HZ = [523.25, 587.33, 659.25, 698.46, 783.99, 880.0, 987.77];
const RING_SEC = 0.11;

let ctx: AudioContext | null = null;

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
  return DRIP_HZ[((zeroBasedIndex % 7) + 7) % 7]!;
}

export function playNoteForCellIndex(zeroBasedIndex: number): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const now = c.currentTime;
  const hz = hzForIndex(zeroBasedIndex);

  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(hz * 1.12, now);
  osc.frequency.exponentialRampToValueAtTime(hz, now + 0.028);

  const body = c.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(hz * 0.5, now);

  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2400, now);
  filter.Q.value = 1.1;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.2, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + RING_SEC);

  const bodyGain = c.createGain();
  bodyGain.gain.setValueAtTime(0, now);
  bodyGain.gain.linearRampToValueAtTime(0.07, now + 0.004);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  body.connect(bodyGain);
  bodyGain.connect(c.destination);

  osc.start(now);
  body.start(now);
  osc.stop(now + RING_SEC + 0.02);
  body.stop(now + 0.08);
}

export function releaseNoteSfx(): void {
  /* one-shots */
}
