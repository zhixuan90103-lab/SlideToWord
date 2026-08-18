/** After a wave: compact unused letters, fill from the top, seed 3–6 straight words. */

import {
  DIRS,
  cellKey,
  inBounds,
  locatePlacements,
  type Cell,
  type Placement,
} from './model';

export const WAVE_MIN_WORDS = 3;
export const WAVE_MAX_WORDS = 6;

/** 6 words for 5 waves, then drop by 1 every 5 waves. Floor is 3. */
export function targetWordCount(wave: number): number {
  const n = Math.max(1, wave);
  return Math.max(WAVE_MIN_WORDS, WAVE_MAX_WORDS - Math.floor((n - 1) / 5));
}

/** After wave 20: 1 word hides a letter. +1 word every 5 waves, max 3. */
export function maskedHintCount(wave: number): number {
  if (wave < 20) return 0;
  return Math.min(3, 1 + Math.floor((wave - 20) / 5));
}

export type WordTheme = {
  title: string;
  words: readonly string[];
};

/** Pop-style clue: one category per wave. Bonus words still use the full lexicon. */
export const WAVE_THEMES: readonly WordTheme[] = [
  {
    title: 'From the Toy Store',
    words: ['BALL', 'DOLL', 'KITE', 'TOY', 'GAME', 'BLOCK', 'ROBOT', 'TRAIN', 'PUPPET', 'CARD', 'DICE', 'BEAR'],
  },
  {
    title: 'On the Farm',
    words: ['COW', 'PIG', 'HEN', 'HAY', 'BARN', 'CORN', 'FARM', 'GOAT', 'HORSE', 'DUCK', 'SEED', 'YARD'],
  },
  {
    title: 'In the Kitchen',
    words: ['PAN', 'POT', 'CUP', 'TEA', 'CAKE', 'COOK', 'OVEN', 'FORK', 'SPOON', 'BREAD', 'SUGAR', 'PLATE'],
  },
  {
    title: 'Ocean Life',
    words: ['SEA', 'FISH', 'WAVE', 'BOAT', 'SHIP', 'CRAB', 'REEF', 'SHELL', 'WHALE', 'OCEAN', 'CORAL', 'SHARK'],
  },
  {
    title: 'In the Forest',
    words: ['TREE', 'LEAF', 'BIRD', 'DEER', 'WOLF', 'BEAR', 'NEST', 'WOOD', 'FROG', 'MOSS', 'PINE', 'OWL'],
  },
  {
    title: 'Weather',
    words: ['SUN', 'SKY', 'RAIN', 'SNOW', 'WIND', 'HAIL', 'HEAT', 'COLD', 'CLOUD', 'STORM', 'MIST', 'FOG'],
  },
  {
    title: 'Colors',
    words: ['RED', 'BLUE', 'PINK', 'GOLD', 'GRAY', 'TEAL', 'GREEN', 'BLACK', 'WHITE', 'BROWN', 'IVORY', 'AMBER'],
  },
  {
    title: 'The Body',
    words: ['ARM', 'LEG', 'EAR', 'EYE', 'LIP', 'HAND', 'NOSE', 'FACE', 'HAIR', 'FOOT', 'NECK', 'SKIN'],
  },
  {
    title: 'Music',
    words: ['SONG', 'NOTE', 'BAND', 'DRUM', 'BELL', 'TUNE', 'BEAT', 'PIANO', 'GUITAR', 'FLUTE', 'CHOIR', 'MUSIC'],
  },
  {
    title: 'Outer Space',
    words: ['STAR', 'MOON', 'SUN', 'MARS', 'ROCK', 'ORBIT', 'COMET', 'EARTH', 'SPACE', 'NOVA', 'DUST', 'VOID'],
  },
  {
    title: 'Sweet Snacks',
    words: ['CAKE', 'PIE', 'JAM', 'NUT', 'CANDY', 'SUGAR', 'COOKIE', 'HONEY', 'COCOA', 'MINT', 'TAFFY', 'FUDGE'],
  },
  {
    title: 'At School',
    words: ['PEN', 'INK', 'BOOK', 'DESK', 'NOTE', 'EXAM', 'QUIZ', 'PAPER', 'PENCIL', 'CLASS', 'RULER', 'CHALK'],
  },
];

const THEME_WORDS = WAVE_THEMES.flatMap((t) => t.words);
const BONUS_EXTRA = [
  'ACE', 'AIR', 'ANT', 'ART', 'ASH', 'BAG', 'BAT', 'BED', 'BEE', 'BIG', 'BOX',
  'BOY', 'BUS', 'CAP', 'CAR', 'CAT', 'DOG', 'EGG', 'FAN', 'FOX', 'FUN', 'GEM',
  'HAT', 'HOT', 'ICE', 'JAR', 'KEY', 'KID', 'LOG', 'MAP', 'NET', 'PET', 'PIN',
  'RAT', 'TOP', 'VAN', 'WEB', 'ZOO', 'BABY', 'BEACH', 'CITY', 'DOOR', 'FIRE',
  'GIFT', 'HOME', 'JUMP', 'LAKE', 'LAMP', 'LION', 'LOCK', 'PARK', 'PEAR',
  'PLAY', 'RING', 'ROAD', 'ROSE', 'SHOE', 'STAR', 'TENT', 'TIME', 'APPLE',
  'CHAIR', 'DANCE', 'HEART', 'HOUSE', 'LEMON', 'LIGHT', 'MOUSE', 'OLIVE',
  'PAPER', 'PIZZA', 'PLANT', 'RIVER', 'SNAKE', 'STONE', 'TABLE', 'TIGER',
  'WATER', 'ZEBRA', 'BRIDGE', 'CASTLE', 'FLOWER', 'GARDEN', 'ISLAND', 'KITTEN',
  'MONKEY', 'ORANGE', 'PLANET', 'RABBIT', 'ROCKET', 'SPIDER', 'SUMMER', 'WINDOW',
];
export const WAVE_LEXICON: readonly string[] = [...new Set([...THEME_WORDS, ...BONUS_EXTRA])];

const LETTERS = 'EEEEAAAIIIIOOONNNRRRTTTSSSLLLLCCCCDDDHHUUMMPPGGYYWWFFBBVKJXQZ';

export type SurvivorMove = {
  letter: string;
  from: Cell;
  to: Cell;
};

export type SpawnDrop = {
  letter: string;
  col: number;
  fromRow: number;
  to: Cell;
};

export type WavePlan = {
  grid: string[][];
  words: string[];
  theme: string;
  survivors: SurvivorMove[];
  spawns: SpawnDrop[];
  used: Cell[];
};

function cloneGrid(grid: string[][]): string[][] {
  return grid.map((row) => row.slice());
}

function usedSet(used: Iterable<Cell>): Set<string> {
  const set = new Set<string>();
  for (const cell of used) set.add(cellKey(cell));
  return set;
}

/** Compact unused letters down each column. Empty cells are ''. */
export function compactColumns(
  grid: string[][],
  used: Iterable<Cell>,
): { compact: string[][]; survivors: SurvivorMove[] } {
  const size = grid.length;
  const gone = usedSet(used);
  const compact = Array.from({ length: size }, () => Array.from({ length: size }, () => ''));
  const survivors: SurvivorMove[] = [];

  for (let col = 0; col < size; col++) {
    const keep: { letter: string; fromRow: number }[] = [];
    for (let row = 0; row < size; row++) {
      if (gone.has(cellKey({ row, col }))) continue;
      keep.push({ letter: grid[row]![col]!, fromRow: row });
    }
    const startRow = size - keep.length;
    keep.forEach((item, i) => {
      const toRow = startRow + i;
      compact[toRow]![col] = item.letter;
      survivors.push({
        letter: item.letter,
        from: { row: item.fromRow, col },
        to: { row: toRow, col },
      });
    });
  }
  return { compact, survivors };
}

function randInt(n: number): number {
  return Math.floor(Math.random() * n);
}

function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

function randomLetter(): string {
  return LETTERS[randInt(LETTERS.length)]!;
}

/** One word sits inside another (TRAIN ⊃ RAIN). Same line would share a swipe. */
function nestedWords(a: string, b: string): boolean {
  return a !== b && (a.includes(b) || b.includes(a));
}

function placementCells(p: Placement): Cell[] {
  const out: Cell[] = [];
  for (let i = 0; i <= p.steps; i++) {
    out.push({ row: p.head.row + p.step.row * i, col: p.head.col + p.step.col * i });
  }
  return out;
}

function fits(grid: string[][], word: string, start: Cell, dir: Cell): boolean {
  const size = grid.length;
  for (let i = 0; i < word.length; i++) {
    const cell = { row: start.row + dir.row * i, col: start.col + dir.col * i };
    if (!inBounds(cell, size)) return false;
    const cur = grid[cell.row]![cell.col]!;
    if (cur !== '' && cur !== word[i]) return false;
  }
  return true;
}

function writeWord(grid: string[][], word: string, start: Cell, dir: Cell): void {
  for (let i = 0; i < word.length; i++) {
    grid[start.row + dir.row * i]![start.col + dir.col * i] = word[i]!;
  }
}

type Fit = { start: Cell; dir: Cell; locked: number };

function scoreFit(grid: string[][], word: string, start: Cell, dir: Cell): number {
  let locked = 0;
  for (let i = 0; i < word.length; i++) {
    const cur = grid[start.row + dir.row * i]![start.col + dir.col * i]!;
    if (cur !== '') locked += 1;
  }
  return locked;
}

function cellsOfWrite(word: string, start: Cell, dir: Cell): Cell[] {
  const out: Cell[] = [];
  for (let i = 0; i < word.length; i++) {
    out.push({ row: start.row + dir.row * i, col: start.col + dir.col * i });
  }
  return out;
}

function collectFits(grid: string[][], word: string, taken?: Set<string>): Fit[] {
  const size = grid.length;
  const out: Fit[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      for (const dir of DIRS) {
        const start = { row, col };
        if (!fits(grid, word, start, dir)) continue;
        const cells = cellsOfWrite(word, start, dir);
        if (taken && cells.some((c) => taken.has(cellKey(c)))) continue;
        out.push({ start, dir, locked: scoreFit(grid, word, start, dir) });
      }
    }
  }
  return out;
}

type Axis = 'h' | 'v' | 'd';

function axisOf(dir: Cell): Axis {
  if (dir.row !== 0 && dir.col !== 0) return 'd';
  return dir.row === 0 ? 'h' : 'v';
}

/** ≥1 horizontal, vertical, and diagonal when count ≥ 3. Extra slots balance the three. */
function axisQuota(count: number): Record<Axis, number> {
  const q: Record<Axis, number> = { h: 0, v: 0, d: 0 };
  if (count < 3) {
    q.h = count;
    return q;
  }
  q.h = 1;
  q.v = 1;
  q.d = 1;
  const order = shuffle<Axis>(['h', 'v', 'd']);
  for (let i = 0; i < count - 3; i++) q[order[i % 3]!] += 1;
  return q;
}

function pickFit(fitsList: Fit[], wantLocked: boolean, axis?: Axis): Fit | null {
  if (fitsList.length === 0) return null;
  let pool = wantLocked ? fitsList.filter((f) => f.locked > 0) : fitsList.slice();
  if (axis) pool = pool.filter((f) => axisOf(f.dir) === axis);
  if (pool.length === 0) return null;
  pool.sort((a, b) => b.locked - a.locked);
  const best = pool[0]!.locked;
  const top = pool.filter((f) => f.locked === best);
  return top[randInt(top.length)]!;
}

/** Force a word through a leftover letter so nails get used. */
function tryPlaceThrough(
  grid: string[][],
  cell: Cell,
  planted: string[],
  source: readonly string[],
): boolean {
  const ch = grid[cell.row]![cell.col]!;
  if (ch === '') return false;
  for (const word of shuffle(source)) {
    if (planted.includes(word) || planted.some((w) => nestedWords(w, word))) continue;
    for (let i = 0; i < word.length; i++) {
      if (word[i] !== ch) continue;
      for (const dir of shuffle(DIRS)) {
        const start = { row: cell.row - dir.row * i, col: cell.col - dir.col * i };
        if (!fits(grid, word, start, dir)) continue;
        writeWord(grid, word, start, dir);
        planted.push(word);
        return true;
      }
    }
  }
  return false;
}

function fillEmpties(grid: string[][]): Cell[] {
  const filled: Cell[] = [];
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid.length; col++) {
      if (grid[row]![col] !== '') continue;
      grid[row]![col] = randomLetter();
      filled.push({ row, col });
    }
  }
  return filled;
}

function pickWaveWords(grid: string[][], planted: string[], want: number): string[] {
  const unique = [...new Set(planted)];
  const placements = locatePlacements(grid, unique);
  const byWord = new Map<string, Placement[]>();
  for (const p of placements) {
    const list = byWord.get(p.word) ?? [];
    list.push(p);
    byWord.set(p.word, list);
  }
  const found = unique.filter((w) => (byWord.get(w)?.length ?? 0) > 0);
  found.sort((a, b) => (want >= 5 ? a.length - b.length : b.length - a.length));
  const chosen: string[] = [];
  const taken = new Set<string>();
  const have: Record<Axis, number> = { h: 0, v: 0, d: 0 };
  const quota = axisQuota(want);

  const take = (axis?: Axis): void => {
    for (const word of found) {
      if (chosen.length >= want) return;
      if (axis && have[axis] >= quota[axis]) return;
      if (chosen.includes(word) || chosen.some((w) => nestedWords(w, word))) continue;
      const free = byWord.get(word)!.filter((p) =>
        placementCells(p).every((cell) => !taken.has(cellKey(cell))),
      );
      const place = axis ? free.find((p) => axisOf(p.step) === axis) : free[0];
      if (!place) continue;
      chosen.push(word);
      have[axisOf(place.step)] += 1;
      for (const cell of placementCells(place)) taken.add(cellKey(cell));
    }
  };

  for (const axis of shuffle<Axis>(['h', 'v', 'd'])) take(axis);
  take();
  return chosen;
}

function leftoverCells(base: string[][]): Cell[] {
  const out: Cell[] = [];
  for (let row = 0; row < base.length; row++) {
    for (let col = 0; col < base.length; col++) {
      if (base[row]![col]) out.push({ row, col });
    }
  }
  return out;
}

function markNails(base: string[][], word: string, start: Cell, dir: Cell, into: Set<string>): void {
  for (let i = 0; i < word.length; i++) {
    const cell = { row: start.row + dir.row * i, col: start.col + dir.col * i };
    if (base[cell.row]?.[cell.col]) into.add(cellKey(cell));
  }
}

function plantPool(count: number, source: readonly string[]): string[] {
  const short = source.filter((w) => w.length <= 4);
  const long = source.filter((w) => w.length > 4);
  if (count >= 5) return [...shuffle(short), ...shuffle(long)];
  return shuffle(source);
}

function pickTheme(avoid?: string): WordTheme {
  const pool = WAVE_THEMES.filter((t) => t.title !== avoid);
  const list = pool.length > 0 ? pool : WAVE_THEMES;
  return list[randInt(list.length)]!;
}

function plantWords(
  base: string[][],
  count: number,
  source: readonly string[],
  opts: { requireAxes?: boolean; minCount?: number } = {},
): { grid: string[][]; words: string[] } | null {
  const grid = cloneGrid(base);
  const planted: string[] = [];
  const nails = leftoverCells(base);
  const usedNails = new Set<string>();
  const taken = new Set<string>();
  const pool = plantPool(count, source);
  const quota = axisQuota(count);
  const have: Record<Axis, number> = { h: 0, v: 0, d: 0 };

  const tryAxis = (axis: Axis | undefined, preferLocked: boolean): void => {
    for (const word of pool) {
      if (planted.length >= count) return;
      if (axis && have[axis] >= quota[axis]) return;
      if (planted.includes(word) || planted.some((w) => nestedWords(w, word))) continue;
      const fit = pickFit(collectFits(grid, word, taken), preferLocked, axis);
      if (!fit) continue;
      writeWord(grid, word, fit.start, fit.dir);
      for (const c of cellsOfWrite(word, fit.start, fit.dir)) taken.add(cellKey(c));
      markNails(base, word, fit.start, fit.dir, usedNails);
      planted.push(word);
      have[axisOf(fit.dir)] += 1;
    }
  };

  const fillAxes = (preferLocked: boolean): void => {
    for (const axis of shuffle<Axis>(['h', 'v', 'd'])) tryAxis(axis, preferLocked);
    tryAxis(undefined, preferLocked);
  };

  if (nails.length > 0) {
    fillAxes(true);
    for (const nail of shuffle(nails)) {
      if (planted.length >= count) break;
      if (usedNails.has(cellKey(nail))) continue;
      const before = planted.length;
      tryPlaceThrough(grid, nail, planted, source);
      if (planted.length > before) {
        const word = planted[planted.length - 1]!;
        for (const p of locatePlacements(grid, [word])) {
          markNails(base, word, p.head, p.step, usedNails);
          for (const c of placementCells(p)) taken.add(cellKey(c));
        }
      }
    }
  }

  fillAxes(false);

  const minCount = opts.minCount ?? count;
  if (planted.length < minCount) return null;
  fillEmpties(grid);
  const words = pickWaveWords(grid, planted, count);
  if (words.length < minCount) return null;
  if ((opts.requireAxes ?? true) && words.length >= 3 && !hasAllAxes(grid, words)) return null;
  return { grid, words };
}

function hasAllAxes(grid: string[][], words: string[]): boolean {
  const seen: Record<Axis, boolean> = { h: false, v: false, d: false };
  for (const p of locatePlacements(grid, words)) seen[axisOf(p.step)] = true;
  return seen.h && seen.v && seen.d;
}

export function createWaveLevel(size = 6, wave = 1): {
  id: number;
  theme: string;
  size: number;
  grid: string[][];
  words: string[];
} {
  const want = targetWordCount(wave);
  const theme = pickTheme();
  for (let attempt = 0; attempt < 48; attempt++) {
    const planted = plantWords(emptyGrid(size), want, theme.words);
    if (!planted) continue;
    return {
      id: 1,
      theme: theme.title,
      size,
      grid: planted.grid,
      words: planted.words,
    };
  }
  throw new Error('wave: could not seed an opening board');
}

function emptyGrid(size: number): string[][] {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => ''));
}

function spawnsFrom(compact: string[][], filled: string[][]): SpawnDrop[] {
  const size = filled.length;
  const spawns: SpawnDrop[] = [];
  for (let col = 0; col < size; col++) {
    const holes: number[] = [];
    for (let row = 0; row < size; row++) {
      if (compact[row]![col] === '') holes.push(row);
    }
    holes.forEach((toRow, i) => {
      const fromRow = -holes.length + i;
      spawns.push({
        letter: filled[toRow]![col]!,
        col,
        fromRow,
        to: { row: toRow, col },
      });
    });
  }
  return spawns;
}

/**
 * Next board keeps unused letters. Only holes spawn from the top.
 * Never treat leftover nails as cleared (that made every letter fall again).
 */
export function planNextWave(
  grid: string[][],
  used: Iterable<Cell>,
  wave = 1,
  avoidTheme?: string,
): WavePlan {
  const usedCells = [...used];
  const { compact, survivors } = compactColumns(grid, usedCells);
  const targetCount = targetWordCount(wave);
  const themes = shuffle(WAVE_THEMES.filter((t) => t.title !== avoidTheme));
  const order = themes.length > 0 ? themes : [...WAVE_THEMES];

  const finish = (planted: { grid: string[][]; words: string[] }, title: string): WavePlan => ({
    grid: planted.grid,
    words: planted.words,
    theme: title,
    survivors,
    spawns: spawnsFrom(compact, planted.grid),
    used: usedCells,
  });

  for (const theme of order) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const planted = plantWords(compact, targetCount, theme.words);
      if (planted) return finish(planted, theme.title);
    }
  }

  for (const theme of order) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const planted = plantWords(compact, targetCount, theme.words, {
        requireAxes: false,
        minCount: Math.max(WAVE_MIN_WORDS, targetCount - 1),
      });
      if (planted) return finish(planted, theme.title);
    }
  }

  for (const theme of order) {
    const planted = plantWords(compact, targetCount, theme.words, {
      requireAxes: false,
      minCount: WAVE_MIN_WORDS,
    });
    if (planted) return finish(planted, theme.title);
  }

  throw new Error('wave: could not seed a playable board on leftovers');
}

export function cellsFromFound(
  found: ReadonlyArray<{ start: Cell; end: Cell }>,
  cellsOnSegment: (start: Cell, end: Cell) => Cell[],
): Cell[] {
  const seen = new Set<string>();
  const out: Cell[] = [];
  for (const item of found) {
    for (const cell of cellsOnSegment(item.start, item.end)) {
      const key = cellKey(cell);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(cell);
    }
  }
  return out;
}

/** TripleMatch-style lock: book the next cell; release source after this fraction of a cell. */
export const OWNERSHIP_TRANSFER = 0.22;
export const FALL_MS_PER_CELL = 65;

export type DropCell = {
  current: number | null;
  incoming: number | null;
};

export type DropPiece = {
  id: number;
  letter: string;
  col: number;
  homeRow: number;
  originRow: number;
  visualRow: number;
  logicalRow: number;
  targetRow: number;
  dropStartRow: number;
  dropping: boolean;
};

export type SpawnQueued = {
  letter: string;
  homeRow: number;
};

export type DropSim = {
  size: number;
  cells: DropCell[][];
  pieces: DropPiece[];
  queues: SpawnQueued[][];
  nextId: number;
};

function canReceive(sim: DropSim, row: number, col: number): boolean {
  if (row < 0 || row >= sim.size || col < 0 || col >= sim.size) return false;
  const cell = sim.cells[row]![col]!;
  return cell.current === null && cell.incoming === null;
}

function pieceById(sim: DropSim, id: number): DropPiece | undefined {
  return sim.pieces.find((p) => p.id === id);
}

function startDrop(sim: DropSim, piece: DropPiece, toRow: number): boolean {
  if (!canReceive(sim, toRow, piece.col)) return false;
  sim.cells[toRow]![piece.col]!.incoming = piece.id;
  piece.targetRow = toRow;
  piece.dropStartRow = piece.visualRow;
  piece.dropping = true;
  return true;
}

/**
 * Survivors sit on their current cells. New letters queue per column,
 * deepest destination first so the first to enter lands lowest.
 */
export function beginDropSim(
  size: number,
  survivors: readonly SurvivorMove[],
  spawns: readonly SpawnDrop[],
): DropSim {
  const cells: DropCell[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ current: null, incoming: null })),
  );
  const pieces: DropPiece[] = [];
  let nextId = 0;
  for (const s of survivors) {
    const id = nextId++;
    pieces.push({
      id,
      letter: s.letter,
      col: s.from.col,
      homeRow: s.to.row,
      originRow: s.from.row,
      visualRow: s.from.row,
      logicalRow: s.from.row,
      targetRow: s.from.row,
      dropStartRow: s.from.row,
      dropping: false,
    });
    cells[s.from.row]![s.from.col]!.current = id;
  }
  const queues: SpawnQueued[][] = Array.from({ length: size }, () => []);
  const byCol = new Map<number, SpawnDrop[]>();
  for (const s of spawns) {
    const list = byCol.get(s.col) ?? [];
    list.push(s);
    byCol.set(s.col, list);
  }
  for (const [col, list] of byCol) {
    list.sort((a, b) => b.to.row - a.to.row);
    queues[col] = list.map((s) => ({ letter: s.letter, homeRow: s.to.row }));
  }
  return { size, cells, pieces, queues, nextId };
}

function scanDrops(sim: DropSim): void {
  for (let row = 0; row < sim.size - 1; row++) {
    for (let col = 0; col < sim.size; col++) {
      const id = sim.cells[row]![col]!.current;
      if (id === null) continue;
      const piece = pieceById(sim, id);
      if (!piece || piece.dropping) continue;
      if (canReceive(sim, row + 1, col)) startDrop(sim, piece, row + 1);
    }
  }
}

function spawnAtTop(sim: DropSim): void {
  for (let col = 0; col < sim.size; col++) {
    const queue = sim.queues[col]!;
    if (queue.length === 0) continue;
    if (!canReceive(sim, 0, col)) continue;
    const next = queue.shift()!;
    const id = sim.nextId++;
    sim.pieces.push({
      id,
      letter: next.letter,
      col,
      homeRow: next.homeRow,
      originRow: -1,
      visualRow: -1,
      logicalRow: -1,
      targetRow: 0,
      dropStartRow: -1,
      dropping: true,
    });
    sim.cells[0]![col]!.incoming = id;
  }
}

function releaseOtherCells(sim: DropSim, piece: DropPiece, keepRow: number): void {
  for (let row = 0; row < sim.size; row++) {
    if (row === keepRow) continue;
    const cell = sim.cells[row]![piece.col]!;
    if (cell.current === piece.id) cell.current = null;
    if (cell.incoming === piece.id) cell.incoming = null;
  }
}

function transferOwnership(sim: DropSim, piece: DropPiece): void {
  if (!piece.dropping || piece.logicalRow === piece.targetRow) return;
  if (piece.visualRow - piece.dropStartRow < OWNERSHIP_TRANSFER) return;
  releaseOtherCells(sim, piece, piece.targetRow);
  const dst = sim.cells[piece.targetRow]![piece.col]!;
  if (dst.incoming === piece.id || dst.current === null) {
    dst.incoming = null;
    dst.current = piece.id;
  }
  piece.logicalRow = piece.targetRow;
}

function confirmAt(sim: DropSim, piece: DropPiece, row: number): void {
  const cell = sim.cells[row]![piece.col]!;
  if (cell.incoming === piece.id) {
    cell.incoming = null;
    cell.current = piece.id;
  } else if (cell.current !== piece.id) {
    cell.current = piece.id;
  }
  piece.logicalRow = row;
}

function updateDropping(sim: DropSim, dtMs: number): void {
  const step = dtMs / FALL_MS_PER_CELL;
  const moving = sim.pieces.filter((p) => p.dropping).sort((a, b) => b.visualRow - a.visualRow);
  for (const piece of moving) {
    piece.visualRow += step;
    transferOwnership(sim, piece);
    if (piece.visualRow + 1e-4 < piece.targetRow) continue;
    piece.visualRow = piece.targetRow;
    const next = piece.targetRow + 1;
    if (next < sim.size && canReceive(sim, next, piece.col)) {
      confirmAt(sim, piece, piece.targetRow);
      startDrop(sim, piece, next);
      continue;
    }
    piece.dropping = false;
    piece.visualRow = piece.targetRow;
    confirmAt(sim, piece, piece.targetRow);
  }
}

/** Advance one frame. Returns true if anything is still dropping or queued. */
export function stepDropSim(sim: DropSim, dtMs: number): boolean {
  const dt = Math.min(Math.max(dtMs, 0), FALL_MS_PER_CELL * 0.4);
  scanDrops(sim);
  spawnAtTop(sim);
  updateDropping(sim, dt);
  return sim.pieces.some((p) => p.dropping) || sim.queues.some((q) => q.length > 0);
}

/** Catch up after a hitch without jumping more than ~0.4 cell per inner step. */
export function advanceDropSim(sim: DropSim, dtMs: number): boolean {
  const slice = 1000 / 60;
  let left = Math.min(Math.max(dtMs, 0), 80);
  let busy = true;
  while (left > 0) {
    busy = stepDropSim(sim, Math.min(slice, left));
    left -= slice;
    if (!busy) break;
  }
  return busy;
}

export function restDropPieces(sim: DropSim): void {
  for (const piece of sim.pieces) {
    piece.visualRow = piece.homeRow;
    piece.targetRow = piece.homeRow;
    piece.dropping = false;
  }
}
