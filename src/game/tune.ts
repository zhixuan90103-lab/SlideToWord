/** Live layout knobs for on-device tuning. Persisted in localStorage. */

export type Tune = {
  glyphPx: number;
  wordPx: number;
  padX: number;
  padY: number;
  boardScale: number;
  boardX: number;
  boardY: number;
  previewX: number;
  previewY: number;
  pressScale: number;
};

export const TUNE_DEFAULTS: Tune = {
  glyphPx: 35,
  wordPx: 20,
  padX: 5,
  padY: 5,
  boardScale: 1.05,
  boardX: 0,
  boardY: 30,
  previewX: 0,
  previewY: 24,
  pressScale: 1.15,
};

const STORAGE_KEY = 'slidetoword.tune.v4';

type SliderSpec = {
  key: keyof Tune;
  label: string;
  min: number;
  max: number;
  step: number;
};

const SLIDERS: SliderSpec[] = [
  { key: 'glyphPx', label: '棋盘字号', min: 16, max: 72, step: 1 },
  { key: 'wordPx', label: '词表字号', min: 12, max: 44, step: 1 },
  { key: 'padX', label: '左右内边距', min: 0, max: 48, step: 1 },
  { key: 'padY', label: '上下内边距', min: 0, max: 56, step: 1 },
  { key: 'boardScale', label: '棋盘大小', min: 0.55, max: 1.6, step: 0.01 },
  { key: 'boardX', label: '棋盘左右', min: -80, max: 80, step: 1 },
  { key: 'boardY', label: '棋盘上下', min: -120, max: 120, step: 1 },
  { key: 'previewX', label: '胶囊左右', min: -80, max: 80, step: 1 },
  { key: 'previewY', label: '胶囊上下', min: -80, max: 80, step: 1 },
  { key: 'pressScale', label: '按下放大', min: 1, max: 1.8, step: 0.01 },
];

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function loadTune(): Tune {
  const out = { ...TUNE_DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return out;
    const parsed = JSON.parse(raw) as Partial<Tune>;
    for (const spec of SLIDERS) {
      const v = parsed[spec.key];
      if (typeof v === 'number' && Number.isFinite(v)) {
        out[spec.key] = clamp(v, spec.min, spec.max);
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

export function saveTune(tune: Tune): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tune));
  } catch {
    /* ignore */
  }
}

export function applyTune(root: HTMLElement, tune: Tune): void {
  const s = root.style;
  s.setProperty('--ws-glyph-size', `${tune.glyphPx}px`);
  s.setProperty('--ws-word-size', `${tune.wordPx}px`);
  s.setProperty('--ws-pad-x', `${tune.padX}px`);
  s.setProperty('--ws-pad-y', `${tune.padY}px`);
  s.setProperty('--ws-board-scale', String(tune.boardScale));
  s.setProperty('--ws-board-x', `${tune.boardX}px`);
  s.setProperty('--ws-board-y', `${tune.boardY}px`);
  s.setProperty('--ws-preview-x', `${tune.previewX}px`);
  s.setProperty('--ws-preview-y', `${tune.previewY}px`);
  s.setProperty('--ws-press-scale', String(tune.pressScale));
}

export function mountTunePanel(
  uiRoot: HTMLElement,
  openBtn: HTMLButtonElement,
): { getTune: () => Tune; destroy: () => void } {
  let tune = loadTune();
  applyTune(uiRoot, tune);

  const sheet = document.createElement('div');
  sheet.className = 'ws-tune';
  sheet.hidden = true;
  sheet.innerHTML = `
    <div class="ws-tune-sheet" role="dialog" aria-label="调参">
      <header class="ws-tune-head">
        <p>调参</p>
        <button type="button" class="ws-tune-close" aria-label="关闭">✕</button>
      </header>
      <div class="ws-tune-body">
        ${SLIDERS.map(
          (spec) => `
          <label class="ws-tune-row">
            <span class="ws-tune-label">${spec.label}</span>
            <span class="ws-tune-val" data-k="${spec.key}"></span>
            <input type="range" data-k="${spec.key}"
              min="${spec.min}" max="${spec.max}" step="${spec.step}" />
          </label>`,
        ).join('')}
      </div>
      <button type="button" class="ws-tune-reset">恢复默认</button>
    </div>
  `;
  uiRoot.append(sheet);

  const inputs = [...sheet.querySelectorAll<HTMLInputElement>('input[data-k]')];
  const vals = [...sheet.querySelectorAll<HTMLElement>('.ws-tune-val')];

  function format(key: keyof Tune, n: number): string {
    if (key === 'boardScale' || key === 'pressScale') return n.toFixed(2);
    return String(Math.round(n));
  }

  function syncUi(): void {
    for (const spec of SLIDERS) {
      const input = inputs.find((el) => el.dataset.k === spec.key);
      const label = vals.find((el) => el.dataset.k === spec.key);
      if (input) input.value = String(tune[spec.key]);
      if (label) label.textContent = format(spec.key, tune[spec.key]);
    }
  }

  function setOpen(open: boolean): void {
    sheet.hidden = !open;
    openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function onInput(ev: Event): void {
    const el = ev.target as HTMLInputElement;
    const key = el.dataset.k as keyof Tune | undefined;
    if (!key) return;
    const n = Number(el.value);
    if (!Number.isFinite(n)) return;
    tune = { ...tune, [key]: n };
    applyTune(uiRoot, tune);
    saveTune(tune);
    syncUi();
  }

  function onReset(): void {
    tune = { ...TUNE_DEFAULTS };
    applyTune(uiRoot, tune);
    saveTune(tune);
    syncUi();
  }

  const closeBtn = sheet.querySelector('.ws-tune-close') as HTMLButtonElement;
  const resetBtn = sheet.querySelector('.ws-tune-reset') as HTMLButtonElement;

  openBtn.addEventListener('click', () => setOpen(sheet.hidden));
  closeBtn.addEventListener('click', () => setOpen(false));
  sheet.addEventListener('click', (ev) => {
    if (ev.target === sheet) setOpen(false);
  });
  sheet.addEventListener('input', onInput);
  resetBtn.addEventListener('click', onReset);
  syncUi();

  return {
    getTune: () => tune,
    destroy: () => {
      sheet.remove();
    },
  };
}
