/** Word-search board model. Cells are row-major; (0,0) is top-left. */

export type Cell = { row: number; col: number };

export type PlacedWord = {
  word: string;
  cells: Cell[];
};

export type Level = {
  id: number;
  theme: string;
  size: number;
  grid: string[][];
  words: string[];
};

export const DIRS: ReadonlyArray<Cell> = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
  { row: -1, col: -1 },
  { row: -1, col: 1 },
  { row: 1, col: -1 },
  { row: 1, col: 1 },
];

export function cellKey(c: Cell): string {
  return `${c.row},${c.col}`;
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.row === b.row && a.col === b.col;
}

export function inBounds(c: Cell, size: number): boolean {
  return c.row >= 0 && c.col >= 0 && c.row < size && c.col < size;
}

/** True if end is on the same row, column, or 45° diagonal as start. */
export function isAxisAligned(start: Cell, end: Cell): boolean {
  const dr = end.row - start.row;
  const dc = end.col - start.col;
  return dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc);
}

export function unitStep(start: Cell, end: Cell): Cell | null {
  const dr = end.row - start.row;
  const dc = end.col - start.col;
  if (dr === 0 && dc === 0) return { row: 0, col: 0 };
  if (!isAxisAligned(start, end)) return null;
  return {
    row: dr === 0 ? 0 : dr > 0 ? 1 : -1,
    col: dc === 0 ? 0 : dc > 0 ? 1 : -1,
  };
}

export function cellsOnSegment(start: Cell, end: Cell): Cell[] {
  const step = unitStep(start, end);
  if (!step) return [start];
  if (step.row === 0 && step.col === 0) return [start];
  const out: Cell[] = [start];
  let r = start.row;
  let c = start.col;
  while (r !== end.row || c !== end.col) {
    r += step.row;
    c += step.col;
    out.push({ row: r, col: c });
  }
  return out;
}

export function wordOnSegment(grid: string[][], start: Cell, end: Cell): string {
  return cellsOnSegment(start, end)
    .map((cell) => grid[cell.row][cell.col])
    .join('');
}

/**
 * Level 23 board transcribed from Word Search Pop screenshot.
 * Words: BALL ↓, DOLL ↓, KITE ↘, BLOCK ↘, ROBOT ↘
 */
export const TOY_STORE_LEVEL: Level = {
  id: 23,
  theme: 'From the Toy Store',
  size: 6,
  grid: [
    ['B', 'B', 'K', 'O', 'S', 'D'],
    ['B', 'R', 'L', 'F', 'A', 'O'],
    ['A', 'K', 'O', 'O', 'L', 'L'],
    ['L', 'O', 'I', 'B', 'C', 'L'],
    ['L', 'Y', 'T', 'T', 'O', 'K'],
    ['Q', 'L', 'H', 'C', 'E', 'T'],
  ],
  words: ['KITE', 'BLOCK', 'DOLL', 'BALL', 'ROBOT'],
};

export function matchWord(raw: string, remaining: Iterable<string>): string | null {
  const rev = raw.split('').reverse().join('');
  for (const word of remaining) {
    if (word === raw || word === rev) return word;
  }
  return null;
}
