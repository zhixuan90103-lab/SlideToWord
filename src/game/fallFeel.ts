/**
 * Fall pose is always in cell units of the glyph box.
 * Never use getBoundingClientRect / screen px — `.ws-play` is scaled,
 * and iOS visual viewport would shear the drop.
 */

export const LAND_MS = 150;

export const POSE_REST = 'translateY(0) scale(1, 1)';

export function pose(cells: number, sx: number, sy: number): string {
  return `translateY(${(cells * 100).toFixed(2)}%) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
}

export function impactFromFall(cells: number): number {
  if (cells < 0.5) return 0;
  return Math.min(1, 0.3 + 0.45 * Math.min(1, cells / 4));
}

/** Last cell of a hop: ease-out so the letter slows into the slot. */
export function easeApproach(visualRow: number, homeRow: number, targetRow: number): number {
  if (targetRow !== homeRow) return visualRow;
  const d = homeRow - visualRow;
  if (d <= 0 || d >= 1) return visualRow;
  const t = 1 - d;
  const eased = 1 - (1 - t) * (1 - t) * (1 - t);
  return homeRow - (1 - eased);
}

/** Sink + squash in cell units, then ease back. No upward overshoot. */
export function landCushion(u: number, impact: number): { dy: number; sx: number; sy: number } {
  if (impact <= 0 || u <= 0 || u >= 1) return { dy: 0, sx: 1, sy: 1 };
  const wave = Math.sin(Math.PI * Math.min(1, u));
  const gain = wave * (1 - 0.25 * u);
  const squash = 0.035 * impact * gain;
  return {
    dy: 0.07 * impact * gain,
    sx: 1 + squash,
    sy: 1 - squash,
  };
}

export function flightStretch(dropping: boolean): { sx: number; sy: number } {
  if (!dropping) return { sx: 1, sy: 1 };
  return { sx: 0.97, sy: 1.04 };
}
