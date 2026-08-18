/** Fall visuals: one pose string, one rAF, no overlay, no WAAPI handoff. */

export const LAND_MS = 150;

/** Written while `ws-falling` so we never swap `none` ↔ `translateZ`. */
export const POSE_REST = 'translateY(0px) scale(1, 1)';

export function pose(dy: number, sx: number, sy: number): string {
  return `translateY(${dy.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
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

/** Sink + squash, then ease back. No upward overshoot. */
export function landCushion(u: number, impact: number): { dy: number; sx: number; sy: number } {
  if (impact <= 0 || u <= 0) return { dy: 0, sx: 1, sy: 1 };
  if (u >= 1) return { dy: 0, sx: 1, sy: 1 };
  const wave = Math.sin(Math.PI * Math.min(1, u));
  const gain = wave * (1 - 0.25 * u);
  const squash = 0.035 * impact * gain;
  return {
    dy: 3 * impact * gain,
    sx: 1 + squash,
    sy: 1 - squash,
  };
}

export function flightStretch(dropping: boolean): { sx: number; sy: number } {
  if (!dropping) return { sx: 1, sy: 1 };
  return { sx: 0.97, sy: 1.04 };
}

export function measureRowCenters(size: number, cellBox: (row: number) => DOMRect | null): number[] {
  const centers: number[] = [];
  for (let row = 0; row < size; row++) {
    const box = cellBox(row);
    if (!box) {
      centers.push((centers[row - 1] ?? 0) + 48);
      continue;
    }
    centers.push(box.top + box.height / 2);
  }
  return centers;
}

export function offsetY(visualRow: number, homeRow: number, centers: number[]): number {
  const yAt = (row: number): number => {
    if (row >= 0 && row < centers.length) return centers[row]!;
    if (row < 0) {
      const step = (centers[1] ?? centers[0]! + 48) - centers[0]!;
      return centers[0]! + row * step;
    }
    const last = centers.length - 1;
    const step = centers[last]! - (centers[last - 1] ?? centers[last]! - 48);
    return centers[last]! + (row - last) * step;
  };
  const i = Math.floor(visualRow);
  const f = visualRow - i;
  return yAt(i) + (yAt(i + 1) - yAt(i)) * f - yAt(homeRow);
}
