/** Live knobs for on-device tuning. Persisted in localStorage. */

import { haptics } from '../utils/haptics';

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
  hapticPressI: number;
  hapticPressS: number;
  hapticTickI: number;
  hapticTickS: number;
  hapticFindI: number;
  hapticFindS: number;
  hapticFindGap: number;
  hapticFindContI: number;
  hapticFindContS: number;
  hapticFindContDur: number;
  hapticFindDecay: number;
  hapticMissI: number;
  hapticMissS: number;
  hapticMissGap1: number;
  hapticMiss2I: number;
  hapticMiss2S: number;
  hapticMissGap2: number;
  hapticMiss3I: number;
  hapticMiss3S: number;
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
  pressScale: 1.28,
  hapticPressI: 0.55,
  hapticPressS: 0.86,
  hapticTickI: 0.25,
  hapticTickS: 0.64,
  hapticFindI: 0.5,
  hapticFindS: 0.3,
  hapticFindGap: 0.05,
  hapticFindContI: 0.4,
  hapticFindContS: 0.19,
  hapticFindContDur: 0.1,
  hapticFindDecay: 1,
  hapticMissI: 0.4,
  hapticMissS: 0.65,
  hapticMissGap1: 0.05,
  hapticMiss2I: 0.3,
  hapticMiss2S: 0.49,
  hapticMissGap2: 0.055,
  hapticMiss3I: 0.25,
  hapticMiss3S: 0.35,
};

const STORAGE_KEY = 'slidetoword.tune.v12';

type SliderSpec = {
  key: keyof Tune;
  label: string;
  min: number;
  max: number;
  step: number;
};

const LAYOUT_SLIDERS: SliderSpec[] = [
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

type HapticGroup = {
  id: string;
  title: string;
  sliders: SliderSpec[];
};

const HAPTIC_GROUPS: HapticGroup[] = [
  {
    id: 'press',
    title: '按下',
    sliders: [
      { key: 'hapticPressI', label: '强度', min: 0, max: 1, step: 0.01 },
      { key: 'hapticPressS', label: '锐度', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    id: 'tick',
    title: '过格',
    sliders: [
      { key: 'hapticTickI', label: '强度', min: 0, max: 1, step: 0.01 },
      { key: 'hapticTickS', label: '锐度', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    id: 'find',
    title: '找对',
    sliders: [
      { key: 'hapticFindI', label: '瞬强', min: 0, max: 1, step: 0.01 },
      { key: 'hapticFindS', label: '瞬锐', min: 0, max: 1, step: 0.01 },
      { key: 'hapticFindGap', label: '间隔', min: 0, max: 0.2, step: 0.005 },
      { key: 'hapticFindContI', label: '续强', min: 0, max: 1, step: 0.01 },
      { key: 'hapticFindContS', label: '续锐', min: 0, max: 1, step: 0.01 },
      { key: 'hapticFindContDur', label: '时长', min: 0.04, max: 0.6, step: 0.01 },
      { key: 'hapticFindDecay', label: '衰减', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    id: 'miss',
    title: '错误',
    sliders: [
      { key: 'hapticMissI', label: '1强', min: 0, max: 1, step: 0.01 },
      { key: 'hapticMissS', label: '1锐', min: 0, max: 1, step: 0.01 },
      { key: 'hapticMissGap1', label: '隔1', min: 0, max: 0.2, step: 0.005 },
      { key: 'hapticMiss2I', label: '2强', min: 0, max: 1, step: 0.01 },
      { key: 'hapticMiss2S', label: '2锐', min: 0, max: 1, step: 0.01 },
      { key: 'hapticMissGap2', label: '隔2', min: 0, max: 0.2, step: 0.005 },
      { key: 'hapticMiss3I', label: '3强', min: 0, max: 1, step: 0.01 },
      { key: 'hapticMiss3S', label: '3锐', min: 0, max: 1, step: 0.01 },
    ],
  },
];

const HAPTIC_SLIDERS: SliderSpec[] = HAPTIC_GROUPS.flatMap((g) => g.sliders);

const ALL_SLIDERS: SliderSpec[] = [...LAYOUT_SLIDERS, ...HAPTIC_SLIDERS];

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function loadTune(): Tune {
  const out = { ...TUNE_DEFAULTS };
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem('slidetoword.tune.v11') ??
      localStorage.getItem('slidetoword.tune.v10') ??
      localStorage.getItem('slidetoword.tune.v9') ??
      localStorage.getItem('slidetoword.tune.v8') ??
      localStorage.getItem('slidetoword.tune.v7') ??
      localStorage.getItem('slidetoword.tune.v5');
    if (!raw) return out;
    const parsed = JSON.parse(raw) as Partial<Tune>;
    for (const spec of ALL_SLIDERS) {
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

export function playFindHaptic(t: Tune): void {
  const gap = t.hapticFindGap;
  const dur = Math.max(0.04, t.hapticFindContDur);
  const decay = clamp(t.hapticFindDecay, 0, 1);
  const hold = dur * (1 - decay);
  const points = [
    { relativeTime: 0, parameterValue: t.hapticFindContI },
    ...(hold > 0.008 ? [{ relativeTime: hold, parameterValue: t.hapticFindContI }] : []),
    { relativeTime: dur, parameterValue: 0 },
  ];
  void haptics.playPattern(
    [
      {
        type: 'transient',
        relativeTime: 0,
        intensity: t.hapticFindI,
        sharpness: t.hapticFindS,
      },
      {
        type: 'continuous',
        relativeTime: gap,
        duration: dur,
        intensity: t.hapticFindContI,
        sharpness: t.hapticFindContS,
      },
    ],
    [
      {
        parameterID: 'hapticIntensity',
        relativeTime: gap,
        controlPoints: points,
      },
    ],
  );
}

export function playMissHaptic(t: Tune): void {
  const t1 = 0;
  const t2 = t.hapticMissGap1;
  const t3 = t.hapticMissGap1 + t.hapticMissGap2;
  void haptics.playPattern([
    { type: 'transient', relativeTime: t1, intensity: t.hapticMissI, sharpness: t.hapticMissS },
    { type: 'transient', relativeTime: t2, intensity: t.hapticMiss2I, sharpness: t.hapticMiss2S },
    { type: 'transient', relativeTime: t3, intensity: t.hapticMiss3I, sharpness: t.hapticMiss3S },
  ]);
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
    <div class="ws-tune-sheet" role="dialog" aria-label="震动">
      <div class="ws-tune-grab" aria-hidden="true"></div>
      <header class="ws-tune-head">
        <span class="ws-tune-head-spacer" aria-hidden="true"></span>
        <p>震动</p>
        <button type="button" class="ws-tune-close">完成</button>
      </header>
      <div class="ws-tune-body">
        ${HAPTIC_GROUPS.map(
          (g) => `
          <section class="ws-tune-sec" data-haptic="${g.id}">
            <header class="ws-tune-sec-head">
              <p>${g.title}</p>
              <button type="button" class="ws-tune-play" data-play="${g.id}">试</button>
            </header>
            ${g.sliders
              .map(
                (spec) => `
            <label class="ws-tune-row">
              <span class="ws-tune-label">${spec.label}</span>
              <span class="ws-tune-val" data-k="${spec.key}"></span>
              <input type="range" data-k="${spec.key}"
                min="${spec.min}" max="${spec.max}" step="${spec.step}" />
            </label>`,
              )
              .join('')}
          </section>`,
        ).join('')}
      </div>
      <div class="ws-tune-foot">
        <button type="button" class="ws-tune-reset">恢复默认</button>
      </div>
    </div>
  `;
  uiRoot.append(sheet);

  const inputs = [...sheet.querySelectorAll<HTMLInputElement>('input[data-k]')];
  const vals = [...sheet.querySelectorAll<HTMLElement>('.ws-tune-val')];

  function format(key: keyof Tune, n: number): string {
    if (key.includes('Gap') || key.includes('Dur')) return `${Math.round(n * 1000)}ms`;
    if (key === 'boardScale' || key === 'pressScale' || key.startsWith('haptic')) {
      return n.toFixed(2);
    }
    return String(Math.round(n));
  }

  function playGroup(id: string): void {
    if (id === 'find') {
      playFindHaptic(tune);
      return;
    }
    if (id === 'miss') {
      playMissHaptic(tune);
      return;
    }
    const g = HAPTIC_GROUPS.find((x) => x.id === id);
    if (!g) return;
    const i = g.sliders[0];
    const s = g.sliders[1];
    if (!i || !s) return;
    void haptics.playTransient(tune[i.key] as number, tune[s.key] as number);
  }

  function syncUi(): void {
    for (const spec of HAPTIC_SLIDERS) {
      const input = inputs.find((el) => el.dataset.k === spec.key);
      const label = vals.find((el) => el.dataset.k === spec.key);
      if (input) input.value = String(tune[spec.key]);
      if (label) label.textContent = format(spec.key, tune[spec.key]);
    }
  }

  function setOpen(open: boolean): void {
    sheet.hidden = !open;
    sheetEl.style.transform = '';
    sheetEl.style.transition = '';
    openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('ws-tune-open', open);
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

  const sheetEl = sheet.querySelector('.ws-tune-sheet') as HTMLElement;
  let dragY = 0;
  let dragging = false;

  function onGrabStart(ev: PointerEvent): void {
    const t = ev.target as HTMLElement;
    if (t.closest('input, button, label')) return;
    if (!t.closest('.ws-tune-grab, .ws-tune-head')) return;
    dragging = true;
    dragY = ev.clientY;
    sheetEl.style.transition = 'none';
    try {
      sheetEl.setPointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onGrabMove(ev: PointerEvent): void {
    if (!dragging) return;
    const dy = Math.max(0, ev.clientY - dragY);
    sheetEl.style.transform = `translateY(${dy}px)`;
  }

  function onGrabEnd(ev: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    const dy = Math.max(0, ev.clientY - dragY);
    sheetEl.style.transition = 'transform 220ms ease';
    if (dy > 72) {
      setOpen(false);
    } else {
      sheetEl.style.transform = '';
    }
  }

  openBtn.addEventListener('click', () => setOpen(sheet.hidden));
  closeBtn.addEventListener('click', () => setOpen(false));
  sheet.addEventListener('click', (ev) => {
    if (ev.target === sheet) setOpen(false);
  });
  sheetEl.addEventListener('pointerdown', onGrabStart);
  sheetEl.addEventListener('pointermove', onGrabMove);
  sheetEl.addEventListener('pointerup', onGrabEnd);
  sheetEl.addEventListener('pointercancel', onGrabEnd);
  sheet.addEventListener('input', onInput);
  sheet.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-play]');
    if (!btn?.dataset.play) return;
    ev.preventDefault();
    playGroup(btn.dataset.play);
  });
  resetBtn.addEventListener('click', onReset);
  syncUi();

  return {
    getTune: () => tune,
    destroy: () => {
      document.body.classList.remove('ws-tune-open');
      sheet.remove();
    },
  };
}
