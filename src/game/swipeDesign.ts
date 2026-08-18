/**
 * Swipe design — rules extracted from shipping bugs + INTENT.md.
 *
 * BUG 1  Diagonal almost never started.
 *        Cause: locked direction from the first rectangular neighbor.
 *        Rule:  lock from start-center → finger, quantized to 8 octants.
 *
 * BUG 2  Diagonal ran one letter ahead (finger on I, stroke on T).
 *        Cause: projected with orthogonal cell size; a (1,1) step counted as 2.
 *        Rule:  along = dot(delta, step) / (cell * |step|^2).
 *
 * Live stroke tip is the finger projected onto the CURRENT ray (recomputed
 * every sample). Do not carry alongVisual across a step change — (1,0)*t
 * and (1,1)*t are different Euclidean lengths (BUG 6).
 * Preview letters snap to the nearest cell center (round(along)).
 * Commit slop is speed-split (slow tight / fast loose, overshoot looser).
 * Before the second letter (along < 1) there is no assist: 8-way snaps
 * on the 22.5° midline. Reaching the second letter commits direction,
 * then hold / prefer apply. Switch is still instant once hold is beaten.
 *
 * BUG 5  Diagonal stroke sat short of the finger.
 *        Cause: drew with unit-circle (sin, cos) ≈ (0.71, 0.71) while along
 *        is in grid steps: diagonal step is (1, 1), not a unit vector.
 *        Rule: draw `start + step * along` with the SAME step as projection
 *        (components in {-1,0,1}). Soften a turn by lerping those grid
 *        steps — never unit-normalize the draw direction.
 */

import {
  alignedPlacements,
  cellsOnSegment,
  inBounds,
  type Cell,
  type Placement,
} from './model';

export const LOCK_SLOP_CELLS = 0.45;
/** Second-letter center. Before this: free 8-way. At/after: commit + assist. */
export const COMMIT_DIR_CELLS = 1;
export const OCTANT_STEP = Math.PI / 4;
/** After commit, slow swipe: just past 22.5° midline. */
export const OCTANT_HOLD_LOOSE = OCTANT_STEP * 0.52;
/** After commit, fast-swipe floor (~28°). */
export const OCTANT_HOLD = OCTANT_STEP * 0.62;
export const OCTANT_HOLD_FAST = OCTANT_STEP * 0.25;
export const SPEED_FAST_CELLS_PER_SEC = 16;
export const SPEED_SLOW_CELLS_PER_SEC = 4;
export const ASSIST_SPEED_CELLS_PER_SEC = 10;
export const LINE_WIDTH_CELLS = 0.75;
export const COMMIT_LINE_WIDTH_CELLS = 0.7;
/** Slow: tight so “3 letters + a bit” is not a 4-letter word. */
export const END_SLOP_SLOW_UNDER = 0.48;
export const END_SLOP_SLOW_OVER = 0.38;
/** Fast: loose, especially overshoot. */
export const END_SLOP_FAST_UNDER = 0.95;
export const END_SLOP_FAST_OVER = 1.25;

export type PathState = {
  start: Cell;
  end: Cell;
};

export type SwipeSession = {
  start: Cell;
  path: PathState;
  octant: number | null;
  preferredOctant: number | null;
  /** True once along has reached the second letter this stroke. */
  dirCommitted: boolean;
  along: number;
  alongVisual: number;
  visualStep: Cell;
  visualAt: number;
  sampleAt: number;
  speed: number;
  peakSpeed: number;
  step: Cell;
};

const ZERO: Cell = { row: 0, col: 0 };

export function beginSwipe(start: Cell, preferredOctant: number | null = null): SwipeSession {
  const now = performance.now();
  return {
    start,
    path: { start, end: start },
    octant: null,
    preferredOctant,
    dirCommitted: false,
    along: 0,
    alongVisual: 0,
    visualStep: ZERO,
    visualAt: now,
    sampleAt: now,
    speed: 0,
    peakSpeed: 0,
    step: ZERO,
  };
}

export function speedBlend(cellsPerSec: number): number {
  const span = SPEED_FAST_CELLS_PER_SEC - SPEED_SLOW_CELLS_PER_SEC;
  return Math.min(1, Math.max(0, (cellsPerSec - SPEED_SLOW_CELLS_PER_SEC) / span));
}

/** Assist starts when the second letter is reached. */
export function assistActive(along: number, _cellsPerSec?: number): boolean {
  return along >= COMMIT_DIR_CELLS;
}

export function endSlopCells(cellsPerSec: number, overshoot: boolean): number {
  const t = speedBlend(cellsPerSec);
  const slow = overshoot ? END_SLOP_SLOW_OVER : END_SLOP_SLOW_UNDER;
  const fast = overshoot ? END_SLOP_FAST_OVER : END_SLOP_FAST_UNDER;
  return slow + (fast - slow) * t;
}

export function octantFromStep(step: Cell): number {
  return wrapOctant(Math.round(Math.atan2(step.row, step.col) / OCTANT_STEP));
}

export function tickAlongVisual(session: SwipeSession, now = performance.now()): SwipeSession {
  return {
    ...session,
    alongVisual: session.along,
    visualStep: session.step,
    visualAt: now,
  };
}

export function moveSwipe(
  session: SwipeSession,
  localX: number,
  localY: number,
  gridPx: number,
  size: number,
  now = performance.now(),
): SwipeSession {
  const resolved = resolveMove(session, localX, localY, gridPx, size, now);
  return tickAlongVisual(resolved, now);
}

export function pathCells(path: PathState): Cell[] {
  return cellsOnSegment(path.start, path.end);
}

/** Unique remaining placement whose far end is within the speed-split slop. */
export function pickIntentPlacement(
  start: Cell,
  step: Cell,
  along: number,
  candidates: readonly Placement[],
  cellsPerSec: number,
): Placement | null {
  if (step.row === 0 && step.col === 0) return null;
  const hits = alignedPlacements(candidates, start, step).filter((p) => {
    const overshoot = along > p.steps;
    return Math.abs(along - p.steps) <= endSlopCells(cellsPerSec, overshoot);
  });
  return hits.length === 1 ? hits[0]! : null;
}

export function cellFromLocal(
  localX: number,
  localY: number,
  gridPx: number,
  size: number,
): Cell | null {
  const cell = gridPx / size;
  if (cell <= 0) return null;
  const col = Math.floor(localX / cell);
  const row = Math.floor(localY / cell);
  if (!inBounds({ row, col }, size)) return null;
  return { row, col };
}

function wrapOctant(idx: number): number {
  let i = idx;
  while (i > 4) i -= 8;
  while (i < -3) i += 8;
  return i;
}

function angleDelta(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function holdForSwitch(cellsPerSec: number): number {
  if (cellsPerSec < ASSIST_SPEED_CELLS_PER_SEC) return OCTANT_HOLD_LOOSE;
  return OCTANT_HOLD + speedBlend(cellsPerSec) * OCTANT_HOLD_FAST;
}

function snapOctant(angle: number, locked: number | null, hold: number): number {
  let idx = Math.round(angle / OCTANT_STEP);
  if (locked !== null) {
    if (Math.abs(angleDelta(angle, locked * OCTANT_STEP)) < hold) idx = locked;
  }
  return wrapOctant(idx);
}

export function stepFromOctant(idx: number): Cell {
  const a = idx * OCTANT_STEP;
  return {
    row: Math.round(Math.sin(a)),
    col: Math.round(Math.cos(a)),
  };
}

function projectAlong(
  start: Cell,
  octant: number,
  localX: number,
  localY: number,
  gridPx: number,
  size: number,
): { path: PathState; along: number; step: Cell } {
  const cell = gridPx / size;
  const step = stepFromOctant(octant);
  const dx = localX - (start.col + 0.5) * cell;
  const dy = localY - (start.row + 0.5) * cell;
  const stepLen2 = step.col * step.col + step.row * step.row;
  let along = Math.max(0, (dx * step.col + dy * step.row) / (cell * stepLen2));
  let maxAlong = 0;
  while (
    inBounds(
      { row: start.row + step.row * (maxAlong + 1), col: start.col + step.col * (maxAlong + 1) },
      size,
    )
  ) {
    maxAlong += 1;
  }
  along = Math.min(along, maxAlong);
  const n = Math.round(along);
  let end = start;
  for (let i = 1; i <= n; i++) {
    const next = { row: start.row + step.row * i, col: start.col + step.col * i };
    if (!inBounds(next, size)) break;
    end = next;
  }
  return { path: { start, end }, along, step };
}

function resolveMove(
  session: SwipeSession,
  localX: number,
  localY: number,
  gridPx: number,
  size: number,
  now: number,
): SwipeSession {
  const cell = gridPx / size;
  const start = session.start;
  const dx = localX - (start.col + 0.5) * cell;
  const dy = localY - (start.row + 0.5) * cell;
  const dist = cell <= 0 ? 0 : Math.hypot(dx, dy) / cell;
  const dt = Math.max(0, (now - session.sampleAt) / 1000);

  const angle = Math.atan2(dy, dx);
  const raw = wrapOctant(Math.round(angle / OCTANT_STEP));

  if (dist < LOCK_SLOP_CELLS) {
    const hint = projectAlong(start, raw, localX, localY, gridPx, size);
    return {
      ...session,
      path: { start, end: start },
      octant: null,
      dirCommitted: false,
      along: hint.along,
      step: hint.step,
      sampleAt: now,
      speed: session.speed * 0.5,
    };
  }

  const rawProj = projectAlong(start, raw, localX, localY, gridPx, size);
  const dirCommitted = session.dirCommitted || rawProj.along >= COMMIT_DIR_CELLS;

  let octant: number;
  if (!dirCommitted) {
    octant = raw;
  } else if (!session.dirCommitted) {
    const prefer = session.preferredOctant;
    const towardPrefer =
      prefer !== null && Math.abs(angleDelta(angle, prefer * OCTANT_STEP)) < OCTANT_HOLD;
    octant = towardPrefer ? prefer : raw;
  } else {
    octant = snapOctant(angle, session.octant, holdForSwitch(session.speed));
  }

  const proj = projectAlong(start, octant, localX, localY, gridPx, size);
  const inst = dt > 0.0005 ? Math.abs(proj.along - session.along) / dt : session.speed;
  const speed = session.speed * 0.55 + inst * 0.45;
  return {
    ...session,
    path: proj.path,
    octant,
    dirCommitted,
    along: proj.along,
    step: proj.step,
    sampleAt: now,
    speed,
    peakSpeed: Math.max(session.peakSpeed, speed),
  };
}
