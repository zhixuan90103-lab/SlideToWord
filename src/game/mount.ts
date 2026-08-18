import { haptics } from '../utils/haptics';
import {
  TOY_STORE_LEVEL,
  farEnd,
  inBounds,
  locatePlacements,
  matchWord,
  placementsAtCell,
  wordOnSegment,
  type Cell,
  type Level,
  type Placement,
} from './model';
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
import { mountTunePanel } from './tune';

const LINE_COLORS = ['#f97316', '#0ea5e9', '#a855f7', '#22c55e', '#e11d48'];

type Found = { word: string; start: Cell; end: Cell; color: string };

export function mountWordSearch(uiRoot: HTMLElement): () => void {
  const level: Level = structuredClone(TOY_STORE_LEVEL);
  const remaining = new Set(level.words);
  const catalog = locatePlacements(level.grid, level.words);
  const found: Found[] = [];
  let session: SwipeSession | null = null;
  let startCandidates: Placement[] = [];
  let strokeColor = LINE_COLORS[0]!;
  let lastTickKey = '';
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
      <p class="ws-level">Level ${level.id}</p>
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
    <p class="ws-win" hidden>全部找到</p>
  `;

  const wordsEl = uiRoot.querySelector('.ws-words')!;
  const cellsEl = uiRoot.querySelector('.ws-cells') as HTMLElement;
  const boardEl = uiRoot.querySelector('.ws-board') as HTMLElement;
  const svgEl = uiRoot.querySelector('.ws-lines') as SVGSVGElement;
  const winEl = uiRoot.querySelector('.ws-win') as HTMLElement;
  const previewEl = uiRoot.querySelector('.ws-preview') as HTMLElement;
  const resetBtn = uiRoot.querySelector('[data-act="reset"]') as HTMLButtonElement;
  const tuneBtn = uiRoot.querySelector('[data-act="tune"]') as HTMLButtonElement;
  const tunePanel = mountTunePanel(uiRoot, tuneBtn);

  cellsEl.style.gridTemplateColumns = `repeat(${level.size}, 1fr)`;
  for (let r = 0; r < level.size; r++) {
    for (let c = 0; c < level.size; c++) {
      const cell = document.createElement('div');
      cell.className = 'ws-cell';
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
      const glyph = document.createElement('span');
      glyph.className = 'ws-glyph';
      glyph.textContent = level.grid[r][c];
      cell.append(glyph);
      cellsEl.append(cell);
    }
  }

  function renderWords(): void {
    wordsEl.innerHTML = level.words
      .map((word) => {
        const done = !remaining.has(word);
        return `<li class="${done ? 'found' : ''}">${escapeHtml(word)}</li>`;
      })
      .join('');
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const foundGroup = document.createElementNS(SVG_NS, 'g');
  const liveGroup = document.createElementNS(SVG_NS, 'g');
  const liveLine = document.createElementNS(SVG_NS, 'line');
  liveLine.setAttribute('stroke-linecap', 'round');
  liveGroup.append(liveLine);
  svgEl.replaceChildren(foundGroup, liveGroup);
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
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
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
    render();
    setPreview(level.grid[cell.row][cell.col], true);
    void haptics.selection();
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
      void haptics.selection();
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

  function finishStroke(ok: boolean): void {
    previewEl.classList.remove('pop');
    bump(previewEl, 'out');
    window.setTimeout(() => setPreview('', false), 140);
    if (!ok) {
      beginFailFx();
      return;
    }
    renderWords();
    const word = found[found.length - 1]?.word;
    const hit = word
      ? [...wordsEl.querySelectorAll('li')].find((el) => el.textContent === word)
      : undefined;
    if (hit) bump(hit, 'just');
    if (remaining.size === 0) {
      winEl.hidden = false;
      void haptics.impact('medium');
    }
  }

  function commitFound(word: string, start: Cell, end: Cell): void {
    remaining.delete(word);
    found.push({ word, start, end, color: strokeColor });
    void haptics.notification('success');
    finishStroke(true);
  }

  function tryCommit(): void {
    if (!session) return;
    if (session.octant === null) {
      finishStroke(false);
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
      finishStroke(false);
    }
    session = null;
    startCandidates = [];
    lastTickKey = '';
    letterAlongN = 0;
    stopVisual();
    render();
  }

  function onUp(ev: PointerEvent): void {
    endPointer(ev, true);
  }

  function onCancel(ev: PointerEvent): void {
    endPointer(ev, false);
  }

  function reset(): void {
    remaining.clear();
    level.words.forEach((w) => remaining.add(w));
    found.length = 0;
    paintedFound = -1;
    stopFailFx();
    session = null;
    startCandidates = [];
    stopVisual();
    winEl.hidden = true;
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
