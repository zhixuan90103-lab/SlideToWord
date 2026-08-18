import { haptics } from '../utils/haptics';
import {
  TOY_STORE_LEVEL,
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
  planNextWave,
  stepDropSim,
  type WavePlan,
} from './wave';
import {
  LAND_MS,
  POSE_REST,
  flightStretch,
  impactFromFall,
  landCushion,
  measureRowCenters,
  offsetY,
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

const LINE_COLORS = ['#f97316', '#0ea5e9', '#a855f7', '#22c55e', '#e11d48'];

type Found = { word: string; start: Cell; end: Cell; color: string };

export function mountWordSearch(uiRoot: HTMLElement): () => void {
  const level: Level = structuredClone(TOY_STORE_LEVEL);
  const remaining = new Set(level.words);
  let catalog = locatePlacements(level.grid, level.words);
  const found: Found[] = [];
  let waveIndex = 1;
  let phase: 'playing' | 'wave' = 'playing';
  let waveGen = 0;
  let session: SwipeSession | null = null;
  let startCandidates: Placement[] = [];
  let strokeColor = LINE_COLORS[0]!;
  let lastTickKey = '';
  let lastNoteIndex = 0;
  let visualRaf = 0;

  function livePlacements(): Placement[] {
    return catalog.filter((p) => remaining.has(p.word));
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
      <button type="button" class="ws-icon" data-act="reset" aria-label="重置本关">↻</button>
      <p class="ws-level">Wave ${waveIndex}</p>
      <button type="button" class="ws-icon ws-icon-gear" data-act="tune" aria-label="设置" aria-expanded="false">⚙</button>
    </header>
    <div class="ws-play">
      <section class="ws-hints" aria-label="本关单词">
        <div class="ws-theme">${escapeHtml(level.theme)}</div>
        <ul class="ws-words"></ul>
      </section>
      <div class="ws-preview-slot">
        <p class="ws-preview" hidden></p>
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
  const boardEl = uiRoot.querySelector('.ws-board') as HTMLElement;
  const svgEl = uiRoot.querySelector('.ws-lines') as SVGSVGElement;
  const levelEl = uiRoot.querySelector('.ws-level') as HTMLElement;
  const previewEl = uiRoot.querySelector('.ws-preview') as HTMLElement;
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

  function renderWords(): void {
    wordsEl.innerHTML = level.words
      .map((word) => {
        const pending = pendingWords.has(word);
        const done = !remaining.has(word) && !pending;
        if (pending) {
          const chars = [...word]
            .map((ch) => `<span class="ws-ch">${escapeHtml(ch)}</span>`)
            .join('');
          return `<li data-word="${escapeHtml(word)}">${chars}</li>`;
        }
        return `<li data-word="${escapeHtml(word)}" class="${done ? 'found' : ''}">${escapeHtml(word)}</li>`;
      })
      .join('');
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
  const FAIL_AMP_CELLS = 0.1;
  const BLOOM_MS = 280;
  const BLOOM_TO_CELLS = 1.15;
  let bloomRaf = 0;
  const blooms: { el: SVGLineElement; at: number; start: Cell; end: Cell; color: string }[] = [];
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

  function setPreview(text: string, pop: boolean): void {
    previewEl.classList.remove('out');
    if (!text) {
      previewEl.hidden = true;
      previewEl.textContent = '';
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

  function onDown(ev: PointerEvent): void {
    if (phase !== 'playing') return;
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    unlockNoteSfx();
    beginSwipeSfx();
    const loc = localOnGrid(ev.clientX, ev.clientY);
    if (!loc) return;
    const cell = cellFromLocal(loc.x, loc.y, loc.px, level.size);
    if (!cell) return;
    stopFailFx();
    boardEl.setPointerCapture(ev.pointerId);
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
    ev.preventDefault();
    if (!visualRaf) visualRaf = requestAnimationFrame(pumpVisual);
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

  function onMove(ev: PointerEvent): void {
    if (!session) return;
    const loc = localOnGrid(ev.clientX, ev.clientY);
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
    ev.preventDefault();
  }

  function failAxis(): { x: number; y: number } {
    const step = failHold?.step ?? session?.step;
    if (!step || (step.row === 0 && step.col === 0)) return { x: 1, y: 0 };
    const len = Math.hypot(step.col, step.row) || 1;
    return { x: step.col / len, y: step.row / len };
  }

  function stopFailFx(): void {
    if (failRaf) cancelAnimationFrame(failRaf);
    failRaf = 0;
    failHold = null;
    cellsEl.classList.remove('fail-out');
    resetLiveGroup();
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
    stopFailFx();
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
    maybeStartWave();
  }

  function finishStroke(ok: boolean, cancelled = false): void {
    previewEl.classList.remove('pop');
    bump(previewEl, 'out');
    window.setTimeout(() => setPreview('', false), 140);
    if (!ok) {
      if (!cancelled) beginFailFx();
      return;
    }
    const last = found[found.length - 1];
    if (last) startLetterFlight(last.word, last.start, last.end);
  }

  function pumpBlooms(now: number): void {
    bloomRaf = 0;
    const cellW = 100 / level.size;
    const w0 = cellW * LINE_WIDTH_CELLS;
    const w1 = cellW * BLOOM_TO_CELLS;
    for (let i = blooms.length - 1; i >= 0; i--) {
      const b = blooms[i]!;
      const t = Math.min(1, (now - b.at) / BLOOM_MS);
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

  function spawnBloom(start: Cell, end: Cell, color: string): void {
    const el = document.createElementNS(SVG_NS, 'line');
    el.setAttribute('opacity', '1');
    setLine(el, lineGeom(start, end, true), color);
    bloomGroup.append(el);
    const now = performance.now();
    blooms.push({ el, at: now - 16, start, end, color });
    pumpBlooms(now);
  }

  function commitFound(word: string, start: Cell, end: Cell): void {
    spawnBloom(start, end, strokeColor);
    remaining.delete(word);
    found.push({ word, start, end, color: strokeColor });
    fireHaptic('find');
    playNoteForCellIndex(lastNoteIndex + 1);
    finishStroke(true);
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
    const literal = matchWord(wordOnSegment(level.grid, start, end), remaining);
    if (literal) {
      commitFound(literal, start, end);
      return;
    }
    const picked = pickIntentPlacement(
      start,
      session.step,
      session.along,
      startCandidates,
      session.peakSpeed,
    );
    if (picked && remaining.has(picked.word)) {
      commitFound(picked.word, start, farEnd(picked, start));
      return;
    }
    finishStroke(false);
  }

  function endPointer(ev: PointerEvent, commit: boolean): void {
    if (!session) return;
    try {
      boardEl.releasePointerCapture(ev.pointerId);
    } catch {
      /* already released */
    }
    if (commit) {
      const loc = localOnGrid(ev.clientX, ev.clientY);
      if (loc) session = moveSwipe(session, loc.x, loc.y, loc.px, level.size);
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
    endPointer(ev, true);
  }

  function onCancel(ev: PointerEvent): void {
    endPointer(ev, false);
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
    catalog = locatePlacements(level.grid, level.words);
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
    boardEl.classList.add('ws-falling');
    const centers = measureRowCenters(level.size, (row) => cellNode(row, 0)?.getBoundingClientRect() ?? null);
    const landAt = new Map<number, number>();

    const paint = (now: number): boolean => {
      const live = new Set(sim.pieces.map((p) => `${p.homeRow},${p.col}`));
      for (let row = 0; row < level.size; row++) {
        for (let col = 0; col < level.size; col++) {
          const glyph = glyphNode(row, col);
          if (!glyph) continue;
          glyph.style.visibility = live.has(`${row},${col}`) ? 'visible' : 'hidden';
        }
      }
      let cushioning = false;
      for (const piece of sim.pieces) {
        const glyph = glyphNode(piece.homeRow, piece.col);
        if (!glyph) continue;
        const shownRow = easeApproach(piece.visualRow, piece.homeRow, piece.targetRow);
        const flight = offsetY(shownRow, piece.homeRow, centers);
        const landed = !piece.dropping && piece.visualRow >= piece.homeRow - 1e-4;
        if (landed && !landAt.has(piece.id)) landAt.set(piece.id, now);
        const start = landAt.get(piece.id);
        glyph.style.transformOrigin = '50% 100%';
        if (start !== undefined) {
          const u = (now - start) / LAND_MS;
          if (u < 1) cushioning = true;
          const hit = impactFromFall(piece.homeRow - piece.originRow);
          const cush = landCushion(Math.min(1, u), hit);
          glyph.style.transform = pose(flight + cush.dy, cush.sx, cush.sy);
        } else {
          const stretch = flightStretch(piece.dropping);
          glyph.style.transform = pose(flight, stretch.sx, stretch.sy);
        }
      }
      return cushioning;
    };

    paint(performance.now());
    return new Promise((resolve) => {
      let last = performance.now();
      const settle = (ok: boolean): void => {
        cellsEl.querySelectorAll<HTMLElement>('.ws-glyph').forEach((g) => {
          g.style.visibility = '';
          g.style.transform = POSE_REST;
          g.style.transformOrigin = '50% 100%';
        });
        requestAnimationFrame(() => {
          cellsEl.querySelectorAll<HTMLElement>('.ws-glyph').forEach((g) => {
            g.style.transform = '';
            g.style.transformOrigin = '';
          });
          requestAnimationFrame(() => {
            boardEl.classList.remove('ws-falling');
            resolve(ok);
          });
        });
      };
      const tick = (now: number): void => {
        if (gen !== waveGen) {
          boardEl.classList.remove('ws-falling');
          resolve(false);
          return;
        }
        const busy = stepDropSim(sim, now - last);
        last = now;
        const cushioning = paint(now);
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
    startCandidates = [];
    stopVisual();
    stopFailFx();

    const used = cellsFromFound(found, cellsOnSegment);
    const plan = planNextWave(level.grid, used);

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
    levelEl.textContent = `Wave ${waveIndex}`;
    pendingWords.clear();
    renderWords();
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
    const fresh = structuredClone(TOY_STORE_LEVEL);
    level.grid = fresh.grid;
    level.words = fresh.words;
    remaining.clear();
    level.words.forEach((w) => remaining.add(w));
    catalog = locatePlacements(level.grid, level.words);
    found.length = 0;
    paintedFound = -1;
    waveIndex = 1;
    levelEl.textContent = `Wave ${waveIndex}`;
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
    startCandidates = [];
    stopVisual();
    renderWords();
    render();
  }

  renderWords();
  render();

  boardEl.addEventListener('pointerdown', onDown);
  boardEl.addEventListener('pointermove', onMove);
  boardEl.addEventListener('pointerup', onUp);
  boardEl.addEventListener('pointercancel', onCancel);
  resetBtn.addEventListener('click', reset);

  return () => {
    boardEl.removeEventListener('pointerdown', onDown);
    boardEl.removeEventListener('pointermove', onMove);
    boardEl.removeEventListener('pointerup', onUp);
    boardEl.removeEventListener('pointercancel', onCancel);
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
