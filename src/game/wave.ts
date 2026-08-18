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

/** 3–7 letter uppercase words. Theme does not matter. */
export const WAVE_LEXICON: readonly string[] = [
  'ACE', 'AIR', 'ANT', 'ARM', 'ART', 'ASH', 'BAG', 'BAT', 'BED', 'BEE',
  'BIG', 'BOX', 'BOY', 'BUS', 'CAP', 'CAR', 'CAT', 'COW', 'CUP', 'DAY',
  'DOG', 'EAR', 'EGG', 'EYE', 'FAN', 'FAR', 'FOX', 'FUN', 'GAP', 'GEM',
  'GUN', 'HAT', 'HEN', 'HOT', 'ICE', 'INK', 'JAM', 'JAR', 'KEY', 'KID',
  'LEG', 'LID', 'LIP', 'LOG', 'MAP', 'MIX', 'MUD', 'NET', 'NUT', 'OAK',
  'OIL', 'OWL', 'PAN', 'PEN', 'PET', 'PIG', 'PIN', 'POT', 'RAT', 'RED',
  'RUG', 'SAD', 'SEA', 'SKY', 'SUN', 'TEA', 'TIE', 'TOP', 'TOY', 'VAN',
  'WAR', 'WAX', 'WEB', 'WET', 'ZOO',
  'AREA', 'BABY', 'BALL', 'BAND', 'BARK', 'BARN', 'BEACH', 'BEAN', 'BEAR',
  'BELL', 'BELT', 'BIRD', 'BLUE', 'BOAT', 'BOOK', 'CAKE', 'CARD', 'CAVE',
  'CITY', 'CLAY', 'COIN', 'COLD', 'COOK', 'CORN', 'DARK', 'DEER', 'DESK',
  'DOLL', 'DOOR', 'DUCK', 'DUST', 'EAST', 'FACE', 'FARM', 'FAST', 'FIRE',
  'FISH', 'FLAG', 'FLAT', 'FLOW', 'FROG', 'GAME', 'GATE', 'GIFT', 'GIRL',
  'GOLD', 'GOOD', 'GRIN', 'HAND', 'HILL', 'HOME', 'HOOK', 'HOPE', 'HORN',
  'JUMP', 'KIND', 'KITE', 'LAKE', 'LAMP', 'LAND', 'LEAF', 'LION', 'LOCK',
  'LONG', 'LUCK', 'MAIL', 'MOON', 'NEST', 'NOSE', 'NOTE', 'OPEN', 'PARK',
  'PEAR', 'PINK', 'PLAY', 'POND', 'RAIN', 'RING', 'ROAD', 'ROCK', 'ROOF',
  'ROSE', 'SAND', 'SEED', 'SHIP', 'SHOE', 'SNOW', 'SOAP', 'STAR', 'TENT',
  'TIME', 'TREE', 'WAVE', 'WIND', 'WOLF', 'WOOD', 'YARD',
  'APPLE', 'BEACH', 'BREAD', 'BRICK', 'CANDY', 'CHAIR', 'CLOUD', 'DANCE',
  'DREAM', 'EAGLE', 'EARTH', 'FIELD', 'FLAME', 'FRUIT', 'GHOST', 'GRAPE',
  'GRASS', 'GREEN', 'HEART', 'HORSE', 'HOUSE', 'JUICE', 'LEMON', 'LIGHT',
  'MAGIC', 'MANGO', 'MOUSE', 'MUSIC', 'OCEAN', 'OLIVE', 'PANDA', 'PAPER',
  'PEACH', 'PEARL', 'PIANO', 'PIZZA', 'PLANT', 'QUEEN', 'RIVER', 'ROBIN',
  'ROBOT', 'SHELL', 'SHIRT', 'SMILE', 'SNAKE', 'SPACE', 'SPOON', 'STONE',
  'STORM', 'SUGAR', 'SWEET', 'TABLE', 'TIGER', 'TRAIN', 'WATER', 'WHALE',
  'WHEEL', 'ZEBRA',
  'BANANA', 'BOTTLE', 'BRIDGE', 'BUTTON', 'CAMERA', 'CANDLE', 'CASTLE',
  'CHERRY', 'CIRCLE', 'COOKIE', 'COTTON', 'DRAGON', 'FLOWER', 'FOREST',
  'GARDEN', 'GUITAR', 'HAMMER', 'ISLAND', 'JACKET', 'KITTEN', 'LADDER',
  'LETTER', 'MARKET', 'MONKEY', 'ORANGE', 'PENCIL', 'PLANET', 'POCKET',
  'PUPPET', 'RABBIT', 'ROCKET', 'SCHOOL', 'SHADOW', 'SILVER', 'SOCKET',
  'SPIDER', 'SPRING', 'SQUARE', 'SUMMER', 'TURTLE', 'WINDOW', 'WINTER',
  'BLOSSOM', 'DIAMOND', 'DOLPHIN', 'FEATHER', 'HAMMOCK', 'LANTERN',
  'MUSTARD', 'OCTOPUS', 'PANCAKE', 'PENGUIN', 'RAINBOW', 'THUNDER',
  'TRIANGLE', 'VOLCANO',
];

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
  let empty = 0;
  for (let i = 0; i < word.length; i++) {
    const cell = { row: start.row + dir.row * i, col: start.col + dir.col * i };
    if (!inBounds(cell, size)) return false;
    const cur = grid[cell.row]![cell.col]!;
    if (cur === '') empty += 1;
    else if (cur !== word[i]) return false;
  }
  // Must claim at least one empty cell so we don't stamp RAIN onto TRAIN.
  return empty > 0;
}

function writeWord(grid: string[][], word: string, start: Cell, dir: Cell): void {
  for (let i = 0; i < word.length; i++) {
    grid[start.row + dir.row * i]![start.col + dir.col * i] = word[i]!;
  }
}

function tryPlaceWord(grid: string[][], word: string): boolean {
  const size = grid.length;
  const starts: Cell[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) starts.push({ row, col });
  }
  const dirs = shuffle(DIRS);
  for (const start of shuffle(starts)) {
    for (const dir of dirs) {
      if (!fits(grid, word, start, dir)) continue;
      writeWord(grid, word, start, dir);
      return true;
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

function pickWaveWords(grid: string[][], planted: string[]): string[] {
  const unique = [...new Set(planted)];
  const placements = locatePlacements(grid, unique);
  const byWord = new Map<string, Placement[]>();
  for (const p of placements) {
    const list = byWord.get(p.word) ?? [];
    list.push(p);
    byWord.set(p.word, list);
  }
  const found = unique.filter((w) => (byWord.get(w)?.length ?? 0) > 0);
  found.sort((a, b) => b.length - a.length || byWord.get(a)!.length - byWord.get(b)!.length);
  const want = WAVE_MIN_WORDS + randInt(WAVE_MAX_WORDS - WAVE_MIN_WORDS + 1);
  const chosen: string[] = [];
  const taken = new Set<string>();
  for (const word of found) {
    if (chosen.some((w) => nestedWords(w, word))) continue;
    const place = byWord.get(word)!.find((p) =>
      placementCells(p).every((cell) => !taken.has(cellKey(cell))),
    );
    if (!place) continue;
    chosen.push(word);
    for (const cell of placementCells(place)) taken.add(cellKey(cell));
    if (chosen.length >= want) break;
  }
  return chosen;
}

function plantWords(base: string[][], count: number): { grid: string[][]; words: string[] } | null {
  const grid = cloneGrid(base);
  const planted: string[] = [];
  for (const word of shuffle(WAVE_LEXICON)) {
    if (planted.length >= count) break;
    if (planted.includes(word)) continue;
    if (planted.some((w) => nestedWords(w, word))) continue;
    if (tryPlaceWord(grid, word)) planted.push(word);
  }
  if (planted.length < WAVE_MIN_WORDS) return null;
  fillEmpties(grid);
  const words = pickWaveWords(grid, planted);
  if (words.length < WAVE_MIN_WORDS) return null;
  return { grid, words };
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
 * Build the next board: compact unused letters, plant 3–6 words, fill the rest.
 * Retries new letters first; full reshuffle is the last resort.
 */
export function planNextWave(grid: string[][], used: Iterable<Cell>): WavePlan {
  const usedCells = [...used];
  const { compact, survivors } = compactColumns(grid, usedCells);
  const size = grid.length;
  const targetCount = WAVE_MIN_WORDS + randInt(WAVE_MAX_WORDS - WAVE_MIN_WORDS + 1);

  for (let attempt = 0; attempt < 24; attempt++) {
    const planted = plantWords(compact, targetCount);
    if (!planted) continue;
    return {
      grid: planted.grid,
      words: planted.words,
      survivors,
      spawns: spawnsFrom(compact, planted.grid),
      used: usedCells,
    };
  }

  for (let attempt = 0; attempt < 24; attempt++) {
    const planted = plantWords(emptyGrid(size), targetCount);
    if (!planted) continue;
    const wiped = usedSet(usedCells);
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        wiped.add(cellKey({ row, col }));
      }
    }
    const allUsed = [...wiped].map((key) => {
      const [r, c] = key.split(',').map(Number);
      return { row: r!, col: c! };
    });
    return {
      grid: planted.grid,
      words: planted.words,
      survivors: [],
      spawns: spawnsFrom(emptyGrid(size), planted.grid),
      used: allUsed,
    };
  }

  throw new Error('wave: could not seed a playable board');
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
