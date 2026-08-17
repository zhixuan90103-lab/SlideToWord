import { haptics } from '../utils/haptics';
import {
  TOY_STORE_LEVEL,
  matchWord,
  wordOnSegment,
  type Cell,
  type Level,
} from './model';
import {
  COMMIT_LINE_WIDTH_CELLS,
  LINE_WIDTH_CELLS,
  beginSwipe,
  cellFromLocal,
  moveSwipe,
  pathCells,
  tickAlongVisual,
  type SwipeSession,
} from './swipeDesign';

const LINE_COLORS = ['#f97316', '#0ea5e9', '#a855f7', '#22c55e', '#e11d48'];

type Found = { word: string; start: Cell; end: Cell; color: string };

export function mountWordSearch(uiRoot: HTMLElement): () => void {
  const level: Level = structuredClone(TOY_STORE_LEVEL);
  const remaining = new Set(level.words);
  const found: Found[] = [];
  let session: SwipeSession | null = null;
  let strokeColor = LINE_COLORS[0]!;
  let lastTickKey = '';
  let visualRaf = 0;

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
      <span class="ws-icon-spacer" aria-hidden="true"></span>
    </header>
    <section class="ws-hints" aria-label="本关单词">
      <div class="ws-theme">${escapeHtml(level.theme)}</div>
      <ul class="ws-words"></ul>
    </section>
    <div class="ws-preview-slot">
      <p class="ws-preview" hidden></p>
    </div>
    <section class="ws-board-wrap">
      <div class="ws-board" role="application" aria-label="字母盘">
        <svg class="ws-lines" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
        <div class="ws-cells"></div>
      </div>
    </section>
    <p class="ws-win" hidden>全部找到</p>
  `;

  const wordsEl = uiRoot.querySelector('.ws-words')!;
  const cellsEl = uiRoot.querySelector('.ws-cells') as HTMLElement;
  const boardEl = uiRoot.querySelector('.ws-board') as HTMLElement;
  const svgEl = uiRoot.querySelector('.ws-lines') as SVGSVGElement;
  const winEl = uiRoot.querySelector('.ws-win') as HTMLElement;
  const previewEl = uiRoot.querySelector('.ws-preview') as HTMLElement;
  const resetBtn = uiRoot.querySelector('[data-act="reset"]') as HTMLButtonElement;

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

  function svgSeg(start: Cell, end: Cell, color: string, temp: boolean, along?: number, step?: Cell): string {
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
    const width = (100 / n) * (temp ? LINE_WIDTH_CELLS : COMMIT_LINE_WIDTH_CELLS);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" opacity="1"/>`;
  }

  function render(): void {
    const parts = found.map((f) => svgSeg(f.start, f.end, f.color, false));
    if (session) {
      parts.push(
        svgSeg(
          session.path.start,
          session.path.end,
          strokeColor,
          true,
          session.alongVisual,
          session.step,
        ),
      );
    }
    svgEl.innerHTML = parts.join('');

    const active = new Set<string>();
    if (session) {
      for (const c of pathCells(session.path)) active.add(`${c.row},${c.col}`);
    }
    cellsEl.querySelectorAll<HTMLElement>('.ws-cell').forEach((el) => {
      el.classList.toggle('hot', active.has(`${el.dataset.row},${el.dataset.col}`));
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

  function localOnGrid(clientX: number, clientY: number): { x: number; y: number; px: number } | null {
    const rect = cellsEl.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < -8 || y < -8 || x > rect.width + 8 || y > rect.height + 8) return null;
    return {
      x: Math.min(rect.width - 0.001, Math.max(0, x)),
      y: Math.min(rect.height - 0.001, Math.max(0, y)),
      px: rect.width,
    };
  }

  function onDown(ev: PointerEvent): void {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    const loc = localOnGrid(ev.clientX, ev.clientY);
    if (!loc) return;
    const cell = cellFromLocal(loc.x, loc.y, loc.px, level.size);
    if (!cell) return;
    boardEl.setPointerCapture(ev.pointerId);
    strokeColor = pickStrokeColor();
    session = beginSwipe(cell);
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
    const end = session.path.end;
    const key = `${end.row},${end.col}`;
    if (key !== lastTickKey) {
      lastTickKey = key;
      tickCell(end);
      setPreview(live, true);
      void haptics.selection();
    } else {
      setPreview(live, false);
    }
    ev.preventDefault();
  }

  function onUp(ev: PointerEvent): void {
    if (!session) return;
    try {
      boardEl.releasePointerCapture(ev.pointerId);
    } catch {
      /* already released */
    }
    const { start, end } = session.path;
    const word = matchWord(wordOnSegment(level.grid, start, end), remaining);
    if (word) {
      remaining.delete(word);
      found.push({
        word,
        start,
        end,
        color: strokeColor,
      });
      void haptics.notification('success');
      renderWords();
      const hit = [...wordsEl.querySelectorAll('li')].find((el) => el.textContent === word);
      if (hit) bump(hit, 'just');
      if (remaining.size === 0) {
        winEl.hidden = false;
        void haptics.impact('medium');
      }
      previewEl.classList.remove('pop');
      bump(previewEl, 'out');
      window.setTimeout(() => setPreview('', false), 140);
    } else {
      bump(previewEl, 'out');
      window.setTimeout(() => setPreview('', false), 140);
    }
    session = null;
    lastTickKey = '';
    stopVisual();
    render();
  }

  function reset(): void {
    remaining.clear();
    level.words.forEach((w) => remaining.add(w));
    found.length = 0;
    session = null;
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
  boardEl.addEventListener('pointercancel', onUp);
  resetBtn.addEventListener('click', reset);

  return () => {
    boardEl.removeEventListener('pointerdown', onDown);
    boardEl.removeEventListener('pointermove', onMove);
    boardEl.removeEventListener('pointerup', onUp);
    boardEl.removeEventListener('pointercancel', onUp);
    resetBtn.removeEventListener('click', reset);
    stopVisual();
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!,
  );
}
