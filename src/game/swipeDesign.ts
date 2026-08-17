/**
 * Swipe design — rules extracted from shipping bugs.
 *
 * BUG 1  Diagonal almost never started.
 *        Cause: locked direction from the first rectangular neighbor.
 *        Rule:  lock from start-center → finger, quantized to 8 octants.
 *
 * BUG 2  Diagonal ran one letter ahead (finger on I, stroke on T).
 *        Cause: projected with orthogonal cell size; a (1,1) step counted as 2.
 *        Rule:  along = dot(delta, step) / (cell * |step|^2).
 *
 * Visual stroke length follows the finger along the locked ray (continuous).
 * Which letters count still snaps to the nearest cell center.
 * Hit-test uses client location on the letter grid — never iOS preciseLocation.
 */

import { cellsOnSegment, inBounds, type Cell } from './model';

export const LOCK_SLOP_CELLS = 0.35;
export const OCTANT_STEP = Math.PI / 4;
/** ~28°: past the 22.5° octant midline so a switch needs extra angle. */
export const OCTANT_HOLD = OCTANT_STEP * 0.62;
export const LINE_WIDTH_CELLS = 0.75;
/** Confirmed (found) stroke after lift. Live swipe stays LINE_WIDTH_CELLS. */
export const COMMIT_LINE_WIDTH_CELLS = 0.7;
/** Visual length only: catch up in ~2 frames at 60Hz. Direction / letters stay instant. */
export const ALONG_FOLLOW_TAU = 0.03;

export type PathState = {
  start: Cell;
  end: Cell;
};

export type SwipeSession = {
  start: Cell;
  path: PathState;
  octant: number | null;
  /** How far the finger is along the locked ray, in cells (can be 1.3). */
  along: number;
  /** Smoothed length for drawing only. */
  alongVisual: number;
  visualAt: number;
  step: Cell;
};

export function beginSwipe(start: Cell): SwipeSession {
  const now = performance.now();
  return {
    start,
    path: { start, end: start },
    octant: null,
    along: 0,
    alongVisual: 0,
    visualAt: now,
    step: { row: 0, col: 0 },
  };
}

export function tickAlongVisual(session: SwipeSession, now = performance.now()): SwipeSession {
  const dt = Math.min(0.05, Math.max(0, (now - session.visualAt) / 1000));
  const k = 1 - Math.exp(-dt / ALONG_FOLLOW_TAU);
  return {
    ...session,
    alongVisual: session.alongVisual + (session.along - session.alongVisual) * k,
    visualAt: now,
  };
}

export function moveSwipe(
  session: SwipeSession,
  localX: number,
  localY: number,
  gridPx: number,
  size: number,
): SwipeSession {
  const resolved = resolveRay(session.start, localX, localY, gridPx, size, session.octant);
  return tickAlongVisual({
    start: session.start,
    path: resolved.path,
    octant: resolved.octant,
    along: resolved.along,
    alongVisual: session.alongVisual,
    visualAt: session.visualAt,
    step: resolved.step,
  });
}

export function pathCells(path: PathState): Cell[] {
  return cellsOnSegment(path.start, path.end);
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

function snapOctant(angle: number, locked: number | null): number {
  let idx = Math.round(angle / OCTANT_STEP);
  if (locked !== null) {
    let d = angle - locked * OCTANT_STEP;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) < OCTANT_HOLD) idx = locked;
  }
  return wrapOctant(idx);
}

function stepFromOctant(idx: number): Cell {
  const a = idx * OCTANT_STEP;
  return {
    row: Math.round(Math.sin(a)),
    col: Math.round(Math.cos(a)),
  };
}

function resolveRay(
  start: Cell,
  localX: number,
  localY: number,
  gridPx: number,
  size: number,
  lockedOctant: number | null,
): { path: PathState; octant: number | null; along: number; step: Cell } {
  const cell = gridPx / size;
  const dx = localX - (start.col + 0.5) * cell;
  const dy = localY - (start.row + 0.5) * cell;
  const zero = { row: 0, col: 0 };

  if (Math.hypot(dx, dy) < cell * LOCK_SLOP_CELLS) {
    return { path: { start, end: start }, octant: null, along: 0, step: zero };
  }

  const octant = snapOctant(Math.atan2(dy, dx), lockedOctant);
  const step = stepFromOctant(octant);
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
  return { path: { start, end }, octant, along, step };
}
