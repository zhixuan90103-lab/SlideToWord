import { haptics } from '../utils/haptics';
import {
  cellsOnSegment,
  farEnd,
  inBounds,
  sameCell,
  locatePlacements,
  matchWord,
  placementsAtCell,
  wordOnSegment,
  type Cell,
  type Level,
  type Placement,
} from './model';
import {
  beginDropSim,
  cellsFromFound,
  createWaveLevel,
  planNextWave,
  advanceDropSim,
  restDropPieces,
  maskedHintCount,
  WAVE_LEXICON,
  type WavePlan,
} from './wave';
import {
  LAND_MS,
  flightStretch,
  impactFromFall,
  landCushion,
  pose,
  easeApproach,
} from './fallFeel';
import {
  COMMIT_LINE_WIDTH_CELLS,
  LINE_WIDTH_CELLS,
  beginSwipe,
  cellFromLocal,
  moveSwipe,
  octantFromStep,
  pickIntentPlacement,
  tickAlongVisual,
  type SwipeSession,
} from './swipeDesign';
import { mountTunePanel, playFindHaptic, playMissHaptic } from './tune';
import {
  beginSwipeSfx,
  playMissSfx,
  playNoteForCellIndex,
  preloadNoteSfx,
  releaseNoteSfx,
  unlockNoteSfx,
} from '../audio/noteSfx';

const LINE_COLORS = [
  '#f97316',
  '#0ea5e9',
  '#a855f7',
  '#22c55e',
  '#e11d48',
  '#eab308',
  '#14b8a6',
  '#ec4899',
  '#6366f1',
  '#84cc16',
];

type Found = { word: string; start: Cell; end: Cell; color: string };

export function mountWordSearch(uiRoot: HTMLElement): () => void {
  const level: Level = createWaveLevel(6, 1);
  let waveIndex = 1;
  const seenThemes = new Set<string>([level.theme]);
  let maskAllHints = false;
  const remaining = new Set(level.words);
  let catalog = locatePlacements(level.grid, WAVE_LEXICON);
  const found: Found[] = [];
  const BEST_KEY = 'slidetoword.best.v1';
  let score = 0;
  let best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
  let phase: 'playing' | 'wave' = 'playing';
  let waveGen = 0;
  let session: SwipeSession | null = null;
  let ownerPointerId: number | null = null;
  let ownerTouchId: number | null = null;
  let pointerLost = false;
  let pendingEnter = false;
  const liveTouches = new Map<number, { x: number; y: number }>();
  let startCandidates: Placement[] = [];
  let strokeColor = LINE_COLORS[0]!;
  let lastTickKey = '';
  let lastNoteIndex = 0;
  let visualRaf = 0;

  function livePlacements(): Placement[] {
    return catalog.filter((p) => !alreadyFound(p.head, p.tail));
  }

  function alreadyFound(start: Cell, end: Cell): boolean {
    return found.some(
      (f) =>
        (sameCell(f.start, start) && sameCell(f.end, end)) ||
        (sameCell(f.start, end) && sameCell(f.end, start)),
    );
  }

  function addScore(word: string): void {
    score += word.length * 10;
    if (score > best) {
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
    }
    paintScore();
  }

  function paintScore(): void {
    const nowEl = uiRoot.querySelector('.ws-hud-now');
    const bestEl = uiRoot.querySelector('.ws-hud-best');
    if (nowEl) nowEl.textContent = String(score);
    if (bestEl) bestEl.textContent = String(best);
  }

  function pickStrokeColor(): string {
    const used = new Set(found.map((f) => f.color));
    const pool = LINE_COLORS.filter((c) => !used.has(c));
    const pickFrom = pool.length > 0 ? pool : LINE_COLORS;
    return pickFrom[Math.floor(Math.random() * pickFrom.length)]!;
  }

  uiRoot.classList.add('ws-root');
  uiRoot.innerHTML = `
    <div class="ws-sky" aria-hidden="true"></div>
    <header class="ws-top">
      <button type="button" class="ws-icon" data-act="reset" aria-label="重新开始">↻</button>
      <div class="ws-hud" aria-label="分数">
        <div class="ws-hud-card ws-hud-card-best">
          <span class="ws-hud-label">最高</span>
          <span class="ws-hud-best">${best}</span>
        </div>
        <div class="ws-hud-card ws-hud-card-now">
          <span class="ws-hud-label">当前</span>
          <span class="ws-hud-now">${score}</span>
        </div>
      </div>
      <button type="button" class="ws-icon ws-icon-gear" data-act="tune" aria-label="设置" aria-expanded="false">⚙</button>
    </header>
    <div class="ws-play">
      <section class="ws-hints" aria-label="本关单词">
        <div class="ws-theme">${escapeHtml(level.theme)}</div>
        <ul class="ws-words"></ul>
      </section>
      <div class="ws-preview-slot">
        <div class="ws-preview-origin">
          <div class="ws-preview-motion">
            <p class="ws-preview" hidden></p>
          </div>
        </div>
      </div>
      <section class="ws-board-wrap">
        <div class="ws-board" role="application" aria-label="字母盘">
          <div class="ws-lines-host" aria-hidden="true">
            <svg class="ws-lines" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
          </div>
          <div class="ws-cells"></div>
        </div>
      </section>
    </div>
  `;

  const wordsEl = uiRoot.querySelector('.ws-words')!;
  const cellsEl = uiRoot.querySelector('.ws-cells') as HTMLElement;
  const playEl = uiRoot.querySelector('.ws-play') as HTMLElement;
  const boardEl = uiRoot.querySelector('.ws-board') as HTMLElement;
  const svgEl = uiRoot.querySelector('.ws-lines') as SVGSVGElement;
  const previewEl = uiRoot.querySelector('.ws-preview') as HTMLElement;
  const previewMotion = uiRoot.querySelector('.ws-preview-motion') as HTMLElement;
  const resetBtn = uiRoot.querySelector('[data-act="reset"]') as HTMLButtonElement;
  const tuneBtn = uiRoot.querySelector('[data-act="tune"]') as HTMLButtonElement;
  const tunePanel = mountTunePanel(uiRoot, tuneBtn);
  preloadNoteSfx();

  function fireHaptic(kind: 'press' | 'tick' | 'find' | 'miss'): void {
    const t = tunePanel.getTune();
    if (kind === 'find') {
      playFindHaptic(t);
      return;
    }
    if (kind === 'miss') {
      playMissHaptic(t);
      return;
    }
    const pair = kind === 'press' ? [t.hapticPressI, t.hapticPressS] : [t.hapticTickI, t.hapticTickS];
    void haptics.playTransient(pair[0], pair[1]);
  }

  function buildBoard(grid: string[][]): void {
    cellsEl.style.gridTemplateColumns = `repeat(${level.size}, 1fr)`;
    cellsEl.style.gridTemplateRows = `repeat(${level.size}, 1fr)`;
    const nodes: HTMLElement[] = [];
    for (let r = 0; r < level.size; r++) {
      for (let c = 0; c < level.size; c++) {
        const cell = document.createElement('div');
        cell.className = 'ws-cell';
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        const glyph = document.createElement('span');
        glyph.className = 'ws-glyph';
        glyph.textContent = grid[r]![c] || '';
        cell.append(glyph);
        nodes.push(cell);
      }
    }
    cellsEl.replaceChildren(...nodes);
  }

  buildBoard(level.grid);

  const pendingWords = new Set<string>();
  const flyers: HTMLElement[] = [];
  const FLY_MS = 380;
  const FLY_STAGGER = 25;
  const hintMasks = new Map<string, number>();

  function rebuildHintMasks(): void {
    hintMasks.clear();
    const n = maskAllHints
      ? level.words.length
      : Math.min(maskedHintCount(waveIndex), level.words.length);
    const order = level.words.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = order[i]!;
      order[i] = order[j]!;
      order[j] = tmp;
    }
    for (let i = 0; i < n; i++) {
      const word = order[i]!;
      const hide =
        word.length <= 3 ? Math.floor(Math.random() * word.length) : 1 + Math.floor(Math.random() * (word.length - 2));
      hintMasks.set(word, hide);
    }
  }

  function hintLabel(word: string): string {
    const hide = hintMasks.get(word);
    if (hide === undefined || !remaining.has(word)) return word;
    return [...word].map((ch, i) => (i === hide ? '_' : ch)).join('');
  }

  function renderWords(fadeIn = false): void {
    wordsEl.innerHTML = level.words
      .map((word, i) => {
        const pending = pendingWords.has(word);
        const done = !remaining.has(word) && !pending;
        const enter = fadeIn ? ' ws-word-in' : '';
        const delay = `--i:${i}`;
        if (pending) {
          const chars = [...word]
            .map((ch) => `<span class="ws-ch">${escapeHtml(ch)}</span>`)
            .join('');
          return `<li data-word="${escapeHtml(word)}" class="${enter.trim()}" style="${delay}">${chars}</li>`;
        }
        return `<li data-word="${escapeHtml(word)}" class="${done ? 'found' : ''}${enter}" style="${delay}">${escapeHtml(hintLabel(word))}</li>`;
      })
      .join('');
  }

  function fadeWordListOut(): Promise<void> {
    const items = [...wordsEl.querySelectorAll('li')];
    if (items.length === 0) return Promise.resolve();
    for (const li of items) li.classList.add('ws-word-out');
    return waitMs(280);
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const foundGroup = document.createElementNS(SVG_NS, 'g');
  const bloomGroup = document.createElementNS(SVG_NS, 'g');
  const liveGroup = document.createElementNS(SVG_NS, 'g');
  const liveLine = document.createElementNS(SVG_NS, 'line');
  liveLine.setAttribute('stroke-linecap', 'round');
  liveGroup.append(liveLine);
  svgEl.replaceChildren(foundGroup, bloomGroup, liveGroup);
  let paintedFound = -1;

  type FailHold = {
    start: Cell;
    end: Cell;
    along: number;
    step: Cell;
    color: string;
    lit: string[];
    fadeLetters: boolean;
  };
  let failHold: FailHold | null = null;
  let failRaf = 0;
  let failStarted = 0;
  const FAIL_SHAKE_MS = 480;
  const FAIL_FADE_AT = 400;
  const FAIL_FADE_MS = 260;
  const FAIL_CYCLES = 3.25;
  const PREVIEW_OK_HOLD_MS = 400;
  const PREVIEW_OUT_MS = 140;
  let previewHideTimer = 0;
  const FAIL_AMP_CELLS = 0.1;
  const FAIL_ROT_DEG = 12;
  const BLOOM_MS = 280;
  const BLOOM_TO_CELLS = 1.15;
  const BLOOM_EXTRA_MS = 360;
  const BLOOM_EXTRA_TO_CELLS = 1.5;
  const BLOOM_EXTRA_DELAY_MS = 100;
  let bloomRaf = 0;
  const blooms: {
    el: SVGLineElement;
    at: number;
    start: Cell;
    end: Cell;
    color: string;
    toCells: number;
    ms: number;
  }[] = [];
  let letterAlongN = 0;

  /** Light/scale a cell 0.3 steps before its center (along + 0.3). */
  const LETTER_LEAD_CELLS = 0.3;
  const LETTER_LEAVE_SLOP = 0.12;

  function stickyAlongN(along: number): number {
    const raw = Math.floor(along + LETTER_LEAD_CELLS);
    if (raw > letterAlongN) letterAlongN = raw;
    else if (along + LETTER_LEAD_CELLS < letterAlongN - LETTER_LEAVE_SLOP) {
      letterAlongN = raw;
    }
    return letterAlongN;
  }

  function lineGeom(
    start: Cell,
    end: Cell,
    temp: boolean,
    along?: number,
    step?: Cell,
  ): { x1: number; y1: number; x2: number; y2: number; width: number } {
    const n = level.size;
    const x1 = ((start.col + 0.5) / n) * 100;
    const y1 = ((start.row + 0.5) / n) * 100;
    let x2 = ((end.col + 0.5) / n) * 100;
    let y2 = ((end.row + 0.5) / n) * 100;
    if (temp && step && (step.row !== 0 || step.col !== 0)) {
      const t = Math.max(0, along ?? 0);
      x2 = ((start.col + 0.5 + step.col * t) / n) * 100;
      y2 = ((start.row + 0.5 + step.row * t) / n) * 100;
    }
    return {
      x1,
      y1,
      x2,
      y2,
      width: (100 / n) * (temp ? LINE_WIDTH_CELLS : COMMIT_LINE_WIDTH_CELLS),
    };
  }

  function setLine(
    el: SVGLineElement,
    geom: { x1: number; y1: number; x2: number; y2: number; width: number },
    color: string,
  ): void {
    const q = (n: number) => n.toFixed(3);
    const next = `${q(geom.x1)},${q(geom.y1)},${q(geom.x2)},${q(geom.y2)},${q(geom.width)},${color}`;
    if (el.dataset.geom === next) return;
    el.dataset.geom = next;
    el.setAttribute('x1', q(geom.x1));
    el.setAttribute('y1', q(geom.y1));
    el.setAttribute('x2', q(geom.x2));
    el.setAttribute('y2', q(geom.y2));
    el.setAttribute('stroke', color);
    el.setAttribute('stroke-width', q(geom.width));
    el.setAttribute('stroke-linecap', 'round');
  }

  function paintFoundLines(): void {
    if (paintedFound === found.length) return;
    paintedFound = found.length;
    foundGroup.replaceChildren(
      ...found.map((f) => {
        const el = document.createElementNS(SVG_NS, 'line');
        setLine(el, lineGeom(f.start, f.end, false), f.color);
        return el;
      }),
    );
  }

  function resetLiveGroup(): void {
    liveGroup.removeAttribute('transform');
    liveGroup.setAttribute('opacity', '1');
    liveLine.style.display = 'none';
  }

  function paintLiveLine(): void {
    const src = session
      ? {
          start: session.path.start,
          end: session.path.end,
          along: session.along,
          step: session.step,
          color: strokeColor,
        }
      : failHold;
    if (!src) {
      resetLiveGroup();
      return;
    }
    liveLine.style.display = '';
    setLine(liveLine, lineGeom(src.start, src.end, true, src.along, src.step), src.color);
    if (session) {
      liveGroup.removeAttribute('transform');
      liveGroup.setAttribute('opacity', '1');
    }
  }

  function render(): void {
    paintFoundLines();
    paintLiveLine();

    const lit = new Set<string>();
    let tipKey = '';
    if (session) {
      const reached = cellsReachedByLine(
        session.path.start,
        session.step,
        stickyAlongN(session.along),
        level.size,
      );
      for (const c of reached) lit.add(`${c.row},${c.col}`);
      const tip = reached[reached.length - 1];
      if (tip) tipKey = `${tip.row},${tip.col}`;
    } else if (failHold && !failHold.fadeLetters) {
      for (const key of failHold.lit) lit.add(key);
    }
    cellsEl.querySelectorAll<HTMLElement>('.ws-cell').forEach((el) => {
      const key = `${el.dataset.row},${el.dataset.col}`;
      const on = lit.has(key);
      const tip = key === tipKey;
      if (el.classList.contains('lit') !== on) el.classList.toggle('lit', on);
      if (el.classList.contains('tip') !== tip) el.classList.toggle('tip', tip);
    });
  }

  function bump(el: HTMLElement, cls: string): void {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function restPreviewMotion(): void {
    previewMotion.style.transform = '';
    previewMotion.style.opacity = '';
  }

  function hidePreview(): void {
    window.clearTimeout(previewHideTimer);
    previewHideTimer = 0;
    previewEl.classList.remove('pop', 'out');
    previewEl.style.transform = '';
    restPreviewMotion();
    previewEl.hidden = true;
    previewEl.textContent = '';
  }

  function dismissPreview(holdMs: number): void {
    window.clearTimeout(previewHideTimer);
    previewHideTimer = window.setTimeout(() => {
      bump(previewEl, 'out');
      previewHideTimer = window.setTimeout(() => hidePreview(), PREVIEW_OUT_MS);
    }, holdMs);
  }

  function setPreview(text: string, pop: boolean): void {
    window.clearTimeout(previewHideTimer);
    previewHideTimer = 0;
    previewEl.classList.remove('out');
    previewEl.style.transform = '';
    restPreviewMotion();
    if (!text) {
      hidePreview();
      return;
    }
    const changed = previewEl.textContent !== text || previewEl.hidden;
    previewEl.hidden = false;
    previewEl.textContent = text;
    previewEl.style.background = strokeColor;
    if (pop && changed) bump(previewEl, 'pop');
  }

  function tickCell(cell: Cell): void {
    const el = cellsEl.querySelector<HTMLElement>(
      `.ws-cell[data-row="${cell.row}"][data-col="${cell.col}"]`,
    );
    if (el) bump(el, 'tick');
  }

  /** Board plane coords. Off-grid still projects (INTENT contract). */
  function localOnGrid(clientX: number, clientY: number): { x: number; y: number; px: number } | null {
    const rect = cellsEl.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      px: rect.width,
    };
  }

  function ignoreExtra(ev: Event): void {
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }

  function clearOwner(): void {
    ownerPointerId = null;
    ownerTouchId = null;
    pointerLost = false;
    pendingEnter = false;
  }

  function capturePointer(id: number): void {
    try {
      playEl.setPointerCapture(id);
    } catch {
      /* not a pointer target */
    }
  }

  function releaseCaptured(id: number): void {
    try {
      playEl.releasePointerCapture(id);
    } catch {
      /* already released */
    }
  }

  function beginAtCell(cell: Cell): void {
    unlockNoteSfx();
    beginSwipeSfx();
    stopFailFx();
    pendingEnter = false;
    strokeColor = pickStrokeColor();
    startCandidates = placementsAtCell(livePlacements(), cell);
    let prefer: number | null = null;
    if (startCandidates.length === 1) {
      const far = farEnd(startCandidates[0]!, cell);
      prefer = octantFromStep({ row: Math.sign(far.row - cell.row), col: Math.sign(far.col - cell.col) });
    }
    session = beginSwipe(cell, prefer);
    letterAlongN = 0;
    lastTickKey = `${cell.row},${cell.col}`;
    lastNoteIndex = 0;
    render();
    setPreview(level.grid[cell.row][cell.col], true);
    fireHaptic('press');
    playNoteForCellIndex(0);
    if (!visualRaf) visualRaf = requestAnimationFrame(pumpVisual);
  }

  function cellAtClient(clientX: number, clientY: number): Cell | null {
    const loc = localOnGrid(clientX, clientY);
    if (!loc) return null;
    return cellFromLocal(loc.x, loc.y, loc.px, level.size);
  }

  function nearestLiveTouch(clientX: number, clientY: number): number | null {
    let best: number | null = null;
    let bestD = Infinity;
    for (const [id, p] of liveTouches) {
      const d = (p.x - clientX) ** 2 + (p.y - clientY) ** 2;
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  function rememberTouches(ev: TouchEvent, drop: boolean): void {
    for (const t of ev.changedTouches) {
      if (drop) liveTouches.delete(t.identifier);
      else liveTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
  }

  function touchById(list: TouchList, id: number): Touch | null {
    for (const t of list) {
      if (t.identifier === id) return t;
    }
    return null;
  }

  function onDown(ev: PointerEvent): void {
    if (ownerPointerId !== null && ev.pointerId !== ownerPointerId) {
      ignoreExtra(ev);
      return;
    }
    if (phase !== 'playing') return;
    if (session || ownerPointerId !== null) {
      ignoreExtra(ev);
      return;
    }
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    const hit = ev.target as HTMLElement | null;
    if (hit?.closest('.ws-top, .ws-tune, .ws-icon, button')) return;
    ownerPointerId = ev.pointerId;
    pointerLost = false;
    pendingEnter = true;
    ownerTouchId = nearestLiveTouch(ev.clientX, ev.clientY);
    capturePointer(ev.pointerId);
    const cell = cellAtClient(ev.clientX, ev.clientY);
    if (cell) beginAtCell(cell);
    ev.preventDefault();
  }

  function pumpVisual(): void {
    visualRaf = 0;
    if (!session) return;
    session = tickAlongVisual(session);
    render();
    visualRaf = requestAnimationFrame(pumpVisual);
  }

  function stopVisual(): void {
    if (visualRaf) cancelAnimationFrame(visualRaf);
    visualRaf = 0;
  }

  function applyMove(clientX: number, clientY: number): void {
    if (!session) return;
    const loc = localOnGrid(clientX, clientY);
    if (!loc) return;
    session = moveSwipe(session, loc.x, loc.y, loc.px, level.size);
    render();
    const live = wordOnSegment(level.grid, session.path.start, session.path.end);
    const reached = cellsReachedByLine(
      session.path.start,
      session.step,
      letterAlongN,
      level.size,
    );
    const tip = reached[reached.length - 1]!;
    const key = `${tip.row},${tip.col}`;
    if (key !== lastTickKey) {
      lastTickKey = key;
      tickCell(tip);
      setPreview(live, true);
      fireHaptic('tick');
      lastNoteIndex = reached.length - 1;
      playNoteForCellIndex(lastNoteIndex);
    } else {
      setPreview(live, false);
    }
  }

  function onMove(ev: PointerEvent): void {
    if (ev.pointerId !== ownerPointerId) {
      if (ownerPointerId !== null) ignoreExtra(ev);
      return;
    }
    if (pendingEnter && !session) {
      const cell = cellAtClient(ev.clientX, ev.clientY);
      if (cell) beginAtCell(cell);
    }
    applyMove(ev.clientX, ev.clientY);
    ev.preventDefault();
  }

  function onTouchStart(ev: TouchEvent): void {
    rememberTouches(ev, false);
    if (ownerPointerId === null && !session) return;
    if (ownerTouchId === null) {
      ownerTouchId = nearestLiveTouch(ev.changedTouches[0]!.clientX, ev.changedTouches[0]!.clientY);
    }
    let extra = false;
    for (const t of ev.changedTouches) {
      if (t.identifier !== ownerTouchId) extra = true;
    }
    if (extra) ignoreExtra(ev);
  }

  function onTouchMove(ev: TouchEvent): void {
    rememberTouches(ev, false);
    if (ownerPointerId === null && ownerTouchId === null) return;
    if (!session && !pendingEnter) return;
    let extra = false;
    for (const t of ev.changedTouches) {
      if (t.identifier !== ownerTouchId) extra = true;
    }
    if (extra) ignoreExtra(ev);
    if (ownerTouchId === null && ev.touches.length > 0) {
      ownerTouchId = nearestLiveTouch(ev.touches[0]!.clientX, ev.touches[0]!.clientY);
    }
    const mine = ownerTouchId === null
      ? null
      : touchById(ev.touches, ownerTouchId) ?? touchById(ev.changedTouches, ownerTouchId);
    if (pendingEnter && !session && mine) {
      const cell = cellAtClient(mine.clientX, mine.clientY);
      if (cell) beginAtCell(cell);
    }
    if (pointerLost && mine) applyMove(mine.clientX, mine.clientY);
  }

  function onTouchEnd(ev: TouchEvent): void {
    let ownerEnded = false;
    let extra = false;
    for (const t of ev.changedTouches) {
      if (t.identifier === ownerTouchId) ownerEnded = true;
      else extra = true;
    }
    rememberTouches(ev, true);
    if (ownerTouchId === null && ownerPointerId === null) return;
    if (extra) ignoreExtra(ev);
    if (!ownerEnded) return;
    const mine = touchById(ev.changedTouches, ownerTouchId!);
    if (mine) applyMove(mine.clientX, mine.clientY);
    endPointer(true, mine?.clientX, mine?.clientY);
  }

  function failAxis(): { x: number; y: number } {
    const step = failHold?.step ?? session?.step;
    if (!step || (step.row === 0 && step.col === 0)) return { x: 1, y: 0 };
    const len = Math.hypot(step.col, step.row) || 1;
    return { x: step.col / len, y: step.row / len };
  }

  function stopFailFx(clearPreview = true): void {
    if (failRaf) cancelAnimationFrame(failRaf);
    failRaf = 0;
    failHold = null;
    cellsEl.classList.remove('fail-out');
    resetLiveGroup();
    if (clearPreview) hidePreview();
  }

  function poseFailPreview(rotDeg: number, fadeT: number): void {
    previewEl.classList.remove('pop', 'out');
    previewEl.style.transform = '';
    previewEl.hidden = false;
    previewMotion.style.opacity = String(1 - fadeT);
    previewMotion.style.transform = `rotate(${rotDeg.toFixed(2)}deg)`;
  }

  function pumpFail(now: number): void {
    failRaf = 0;
    if (!failHold) return;
    const t = now - failStarted;
    const shakeT = Math.min(1, t / FAIL_SHAKE_MS);
    const fadeT = t <= FAIL_FADE_AT ? 0 : Math.min(1, (t - FAIL_FADE_AT) / FAIL_FADE_MS);
    const envelope = (1 - shakeT) * (1 - shakeT);
    const wave = Math.sin(shakeT * FAIL_CYCLES * Math.PI * 2);
    const amp = FAIL_AMP_CELLS * (100 / level.size);
    const axis = failAxis();
    const dx = axis.x * amp * envelope * wave;
    const dy = axis.y * amp * envelope * wave;
    liveGroup.setAttribute('transform', `translate(${dx.toFixed(3)} ${dy.toFixed(3)})`);
    liveGroup.setAttribute('opacity', String(1 - fadeT));
    poseFailPreview(FAIL_ROT_DEG * envelope * wave, fadeT);
    if (fadeT > 0 && !failHold.fadeLetters) {
      failHold.fadeLetters = true;
      cellsEl.classList.add('fail-out');
      render();
    }
    if (t >= FAIL_FADE_AT + FAIL_FADE_MS) {
      stopFailFx();
      render();
      return;
    }
    failRaf = requestAnimationFrame(pumpFail);
  }

  function beginFailFx(): void {
    if (!session) return;
    stopFailFx(false);
    fireHaptic('miss');
    playMissSfx(lastNoteIndex);
    const reached = cellsReachedByLine(
      session.path.start,
      session.step,
      letterAlongN,
      level.size,
    );
    failHold = {
      start: session.path.start,
      end: session.path.end,
      along: session.along,
      step: session.step,
      color: strokeColor,
      lit: reached.map((c) => `${c.row},${c.col}`),
      fadeLetters: false,
    };
    failStarted = performance.now();
    paintLiveLine();
    failRaf = requestAnimationFrame(pumpFail);
  }

  function cellsInWordOrder(word: string, start: Cell, end: Cell): Cell[] {
    const cells = cellsOnSegment(start, end);
    const fwd = wordOnSegment(level.grid, start, end);
    if (fwd === word) return cells;
    if ([...fwd].reverse().join('') === word) return [...cells].reverse();
    return cells;
  }

  function clearFlyers(): void {
    for (const el of flyers) el.remove();
    flyers.length = 0;
  }

  function startLetterFlight(word: string, start: Cell, end: Cell): void {
    pendingWords.add(word);
    let li = wordsEl.querySelector<HTMLElement>(`[data-word="${word}"]`);
    if (!li) {
      renderWords();
      li = wordsEl.querySelector<HTMLElement>(`[data-word="${word}"]`);
    }
    if (li && !li.querySelector('.ws-ch')) {
      li.classList.remove('found');
      li.innerHTML = [...word]
        .map((ch) => `<span class="ws-ch">${escapeHtml(ch)}</span>`)
        .join('');
    }
    const spans = li ? [...li.querySelectorAll<HTMLElement>('.ws-ch')] : [];
    const cells = cellsInWordOrder(word, start, end);
    const n = Math.min(spans.length, cells.length);
    if (!li || n === 0) {
      pendingWords.delete(word);
      renderWords();
      maybeStartWave();
      return;
    }
    let landed = 0;
    for (let i = 0; i < n; i++) {
      const cell = cells[i]!;
      const span = spans[i]!;
      window.setTimeout(() => {
        if (!span.isConnected) return;
        const fromEl = cellsEl.querySelector<HTMLElement>(
          `.ws-cell[data-row="${cell.row}"][data-col="${cell.col}"] .ws-glyph`,
        );
        if (!fromEl) {
          span.classList.add('off');
          landed += 1;
          if (landed === n) finishLetterFlight(word, li);
          return;
        }
        const from = fromEl.getBoundingClientRect();
        const to = span.getBoundingClientRect();
        const fromSize = parseFloat(getComputedStyle(fromEl).fontSize) || 35;
        const toSize = parseFloat(getComputedStyle(span).fontSize) || 20;
        const flyer = document.createElement('span');
        flyer.className = 'ws-fly';
        flyer.textContent = span.textContent;
        flyer.style.left = `${from.left + from.width / 2}px`;
        flyer.style.top = `${from.top + from.height / 2}px`;
        flyer.style.fontSize = `${fromSize}px`;
        document.body.append(flyer);
        flyers.push(flyer);
        const dx = to.left + to.width / 2 - (from.left + from.width / 2);
        const dy = to.top + to.height / 2 - (from.top + from.height / 2);
        const scale = toSize / fromSize;
        const anim = flyer.animate(
          [
            { transform: 'translate(-50%, -50%) scale(1)' },
            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale})` },
          ],
          {
            duration: FLY_MS,
            easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
            fill: 'forwards',
          },
        );
        anim.onfinish = () => {
          span.classList.add('off');
          flyer.remove();
          const idx = flyers.indexOf(flyer);
          if (idx >= 0) flyers.splice(idx, 1);
          landed += 1;
          if (landed === n) finishLetterFlight(word, li);
        };
      }, i * FLY_STAGGER);
    }
  }

  function finishLetterFlight(word: string, li: HTMLElement): void {
    pendingWords.delete(word);
    li.classList.add('found');
    li.classList.add('ws-word-out');
    window.setTimeout(() => maybeStartWave(), 280);
  }

  function finishStroke(ok: boolean, cancelled = false, flyTarget = true): void {
    previewEl.classList.remove('pop');
    if (!ok) {
      if (!cancelled) beginFailFx();
      else {
        dismissPreview(0);
      }
      return;
    }
    dismissPreview(PREVIEW_OK_HOLD_MS);
    const last = found[found.length - 1];
    if (last && flyTarget) startLetterFlight(last.word, last.start, last.end);
    else if (ok) maybeStartWave();
  }

  function pumpBlooms(now: number): void {
    bloomRaf = 0;
    const cellW = 100 / level.size;
    const w0 = cellW * LINE_WIDTH_CELLS;
    for (let i = blooms.length - 1; i >= 0; i--) {
      const b = blooms[i]!;
      const w1 = cellW * b.toCells;
      const raw = (now - b.at) / b.ms;
      if (raw < 0) {
        b.el.setAttribute('opacity', '0');
        continue;
      }
      const t = Math.min(1, raw);
      const ease = 1 - (1 - t) * (1 - t);
      const geom = lineGeom(b.start, b.end, false);
      geom.width = w0 + (w1 - w0) * ease;
      setLine(b.el, geom, b.color);
      b.el.setAttribute('opacity', String(1 - t));
      if (t >= 1) {
        b.el.remove();
        blooms.splice(i, 1);
      }
    }
    if (blooms.length > 0) bloomRaf = requestAnimationFrame(pumpBlooms);
  }

  function spawnBloom(
    start: Cell,
    end: Cell,
    color: string,
    toCells = BLOOM_TO_CELLS,
    ms = BLOOM_MS,
    delayMs = 0,
  ): void {
    const el = document.createElementNS(SVG_NS, 'line');
    el.setAttribute('opacity', delayMs > 0 ? '0' : '1');
    setLine(el, lineGeom(start, end, true), color);
    bloomGroup.append(el);
    const now = performance.now();
    blooms.push({ el, at: now - 16 + delayMs, start, end, color, toCells, ms });
    pumpBlooms(now);
  }

  function commitFound(word: string, start: Cell, end: Cell): void {
    if (alreadyFound(start, end)) {
      finishStroke(false, true);
      return;
    }
    const target = remaining.has(word);
    if (target) {
      spawnBloom(start, end, strokeColor);
    } else {
      spawnBloom(start, end, strokeColor, BLOOM_EXTRA_TO_CELLS, BLOOM_EXTRA_MS);
      spawnBloom(start, end, strokeColor, BLOOM_EXTRA_TO_CELLS, BLOOM_EXTRA_MS, BLOOM_EXTRA_DELAY_MS);
    }
    if (target) remaining.delete(word);
    found.push({ word, start, end, color: strokeColor });
    addScore(word);
    fireHaptic('find');
    playNoteForCellIndex(lastNoteIndex + 1);
    finishStroke(true, false, target);
  }

  function tryCommit(): void {
    if (!session) return;
    if (
      session.octant === null ||
      session.along < 1 ||
      sameCell(session.path.start, session.path.end)
    ) {
      finishStroke(false, true);
      return;
    }
    const { start, end } = session.path;
    const raw = wordOnSegment(level.grid, start, end);
    const targetHit = matchWord(raw, remaining);
    if (targetHit) {
      commitFound(targetHit, start, end);
      return;
    }
    const bonusHit = matchWord(raw, WAVE_LEXICON);
    if (bonusHit) {
      commitFound(bonusHit, start, end);
      return;
    }
    const picked = pickIntentPlacement(
      start,
      session.step,
      session.along,
      startCandidates,
      session.peakSpeed,
    );
    if (picked && !alreadyFound(start, farEnd(picked, start))) {
      commitFound(picked.word, start, farEnd(picked, start));
      return;
    }
    finishStroke(false);
  }

  function endPointer(commit: boolean, clientX?: number, clientY?: number): void {
    if (ownerPointerId === null && !session) return;
    const id = ownerPointerId;
    clearOwner();
    if (id !== null) releaseCaptured(id);
    if (!session) return;
    if (commit) {
      if (clientX !== undefined && clientY !== undefined) {
        const loc = localOnGrid(clientX, clientY);
        if (loc) session = moveSwipe(session, loc.x, loc.y, loc.px, level.size);
      }
      tryCommit();
    } else {
      finishStroke(false, true);
    }
    session = null;
    startCandidates = [];
    lastTickKey = '';
    lastNoteIndex = 0;
    letterAlongN = 0;
    releaseNoteSfx();
    stopVisual();
    render();
  }

  function onUp(ev: PointerEvent): void {
    if (ev.pointerId !== ownerPointerId) return;
    endPointer(true, ev.clientX, ev.clientY);
  }

  function onCancel(ev: PointerEvent): void {
    if (ev.pointerId !== ownerPointerId) return;
    // Second finger often cancels the first pointer on iOS; keep the swipe.
    pointerLost = true;
    releaseCaptured(ev.pointerId);
  }

  function cellNode(row: number, col: number): HTMLElement | null {
    return cellsEl.querySelector(`.ws-cell[data-row="${row}"][data-col="${col}"]`);
  }

  function glyphNode(row: number, col: number): HTMLElement | null {
    return cellNode(row, col)?.querySelector('.ws-glyph') ?? null;
  }

  function waitMs(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function animateEl(
    el: Element,
    frames: Keyframe[],
    opts: KeyframeAnimationOptions,
  ): Promise<void> {
    return new Promise((resolve) => {
      const anim = el.animate(frames, { ...opts, fill: 'forwards' });
      anim.onfinish = () => resolve();
      anim.oncancel = () => resolve();
    });
  }

  function applyWaveModel(plan: WavePlan): void {
    level.grid = plan.grid;
    level.words = plan.words;
    remaining.clear();
    plan.words.forEach((w) => remaining.add(w));
    found.length = 0;
    paintedFound = -1;
    catalog = locatePlacements(level.grid, WAVE_LEXICON);
    if (plan.theme) {
      level.theme = plan.theme;
      seenThemes.add(plan.theme);
      const themeEl = uiRoot.querySelector('.ws-theme');
      if (themeEl) themeEl.textContent = plan.theme;
    }
    maskAllHints = Boolean(plan.maskAllHints);
    foundGroup.replaceChildren();
    foundGroup.style.opacity = '1';
  }

  function maybeStartWave(): void {
    if (phase !== 'playing') return;
    if (remaining.size > 0 || pendingWords.size > 0) return;
    void runWaveTransition();
  }

  function playLockedDrop(plan: WavePlan, gen: number): Promise<boolean> {
    const sim = beginDropSim(level.size, plan.survivors, plan.spawns);
    const n = level.size;
    const layer = document.createElement('div');
    layer.className = 'ws-drop-layer';
    boardEl.append(layer);
    boardEl.classList.add('ws-falling');
    const nodes = new Map<number, HTMLElement>();
    const landAt = new Map<number, number>();

    const slot = (el: HTMLElement, col: number, row: number): void => {
      el.style.left = `${(col / n) * 100}%`;
      el.style.top = `${(row / n) * 100}%`;
      el.style.width = `${100 / n}%`;
      el.style.height = `${100 / n}%`;
    };

    const paint = (now: number, rest: boolean): boolean => {
      let cushioning = false;
      for (const piece of sim.pieces) {
        let el = nodes.get(piece.id);
        if (!el) {
          el = document.createElement('span');
          el.className = 'ws-drop-glyph';
          el.textContent = piece.letter;
          layer.append(el);
          nodes.set(piece.id, el);
        }
        const row = rest ? piece.homeRow : easeApproach(piece.visualRow, piece.homeRow, piece.targetRow);
        slot(el, piece.col, row);
        const landed = !piece.dropping && piece.visualRow >= piece.homeRow - 1e-4;
        if (landed && !landAt.has(piece.id)) landAt.set(piece.id, now);
        if (rest) {
          el.style.transform = pose(0, 1, 1);
          continue;
        }
        const start = landAt.get(piece.id);
        if (start !== undefined) {
          const u = (now - start) / LAND_MS;
          if (u < 1) cushioning = true;
          const hit = impactFromFall(piece.homeRow - piece.originRow);
          const cush = landCushion(Math.min(1, u), hit);
          el.style.transform = pose(cush.dy, cush.sx, cush.sy);
        } else {
          const stretch = flightStretch(piece.dropping);
          el.style.transform = pose(0, stretch.sx, stretch.sy);
        }
      }
      return cushioning;
    };

    paint(performance.now(), false);
    return new Promise((resolve) => {
      let last = performance.now();
      const teardown = (ok: boolean): void => {
        layer.remove();
        boardEl.classList.remove('ws-falling');
        resolve(ok);
      };
      const settle = (ok: boolean): void => {
        restDropPieces(sim);
        paint(performance.now(), true);
        requestAnimationFrame(() => teardown(ok));
      };
      const tick = (now: number): void => {
        if (gen !== waveGen) {
          teardown(false);
          return;
        }
        const busy = advanceDropSim(sim, now - last);
        last = now;
        const cushioning = paint(now, false);
        if (busy || cushioning) {
          requestAnimationFrame(tick);
          return;
        }
        settle(true);
      };
      requestAnimationFrame(tick);
    });
  }

  async function runWaveTransition(): Promise<void> {
    const gen = waveGen;
    phase = 'wave';
    session = null;
    clearOwner();
    startCandidates = [];
    stopVisual();
    stopFailFx();

    await fadeWordListOut();
    if (gen !== waveGen) return;

    const used = cellsFromFound(found, cellsOnSegment);
    const plan = planNextWave(level.grid, used, waveIndex + 1, level.theme, [...seenThemes]);

    foundGroup.style.transition = 'opacity 200ms ease';
    foundGroup.style.opacity = '0';
    const pop = used.map((cell) => {
      const glyph = glyphNode(cell.row, cell.col);
      if (!glyph) return Promise.resolve();
      return animateEl(
        glyph,
        [
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(0.55)' },
        ],
        { duration: 220, easing: 'ease-in' },
      );
    });
    await Promise.all(pop);
    if (gen !== waveGen) return;

    applyWaveModel(plan);
    buildBoard(plan.grid);
    await playLockedDrop(plan, gen);
    if (gen !== waveGen) return;
    waveIndex += 1;
    rebuildHintMasks();
    pendingWords.clear();
    renderWords(true);
    render();
    phase = 'playing';
    void waitMs(0);
  }

  function reset(): void {
    waveGen += 1;
    phase = 'playing';
    boardEl.querySelector('.ws-drop-layer')?.remove();
    boardEl.classList.remove('ws-dropping');
    boardEl.classList.remove('ws-falling');
    waveIndex = 1;
    maskAllHints = false;
    seenThemes.clear();
    const fresh = createWaveLevel(6, 1);
    seenThemes.add(fresh.theme);
    level.grid = fresh.grid;
    level.words = fresh.words;
    level.theme = fresh.theme;
    const themeEl = uiRoot.querySelector('.ws-theme');
    if (themeEl) themeEl.textContent = fresh.theme;
    remaining.clear();
    level.words.forEach((w) => remaining.add(w));
    catalog = locatePlacements(level.grid, WAVE_LEXICON);
    found.length = 0;
    score = 0;
    paintScore();
    paintedFound = -1;
    buildBoard(level.grid);
    stopFailFx();
    pendingWords.clear();
    clearFlyers();
    if (bloomRaf) cancelAnimationFrame(bloomRaf);
    bloomRaf = 0;
    blooms.length = 0;
    bloomGroup.replaceChildren();
    foundGroup.replaceChildren();
    foundGroup.style.opacity = '1';
    session = null;
    clearOwner();
    startCandidates = [];
    stopVisual();
    rebuildHintMasks();
    renderWords(true);
    render();
  }

  renderWords(true);
  render();

  const touchOpt: AddEventListenerOptions = { capture: true, passive: false };
  playEl.addEventListener('pointerdown', onDown);
  playEl.addEventListener('pointermove', onMove);
  playEl.addEventListener('pointerup', onUp);
  playEl.addEventListener('pointercancel', onCancel);
  document.addEventListener('touchstart', onTouchStart, touchOpt);
  document.addEventListener('touchmove', onTouchMove, touchOpt);
  document.addEventListener('touchend', onTouchEnd, touchOpt);
  document.addEventListener('touchcancel', onTouchEnd, touchOpt);
  resetBtn.addEventListener('click', reset);

  return () => {
    playEl.removeEventListener('pointerdown', onDown);
    playEl.removeEventListener('pointermove', onMove);
    playEl.removeEventListener('pointerup', onUp);
    playEl.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('touchstart', onTouchStart, touchOpt);
    document.removeEventListener('touchmove', onTouchMove, touchOpt);
    document.removeEventListener('touchend', onTouchEnd, touchOpt);
    document.removeEventListener('touchcancel', onTouchEnd, touchOpt);
    resetBtn.removeEventListener('click', reset);
    tunePanel.destroy();
    stopVisual();
  };
}

/** Cells whose centers the stroke is within 0.3 of (caller passes sticky n). */
function cellsReachedByLine(start: Cell, step: Cell, along: number, size: number): Cell[] {
  const out: Cell[] = [start];
  if (step.row === 0 && step.col === 0) return out;
  const n = Math.floor(along);
  for (let i = 1; i <= n; i++) {
    const cell = { row: start.row + step.row * i, col: start.col + step.col * i };
    if (!inBounds(cell, size)) break;
    out.push(cell);
  }
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!,
  );
}
