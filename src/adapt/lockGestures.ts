/**
 * Kill browser / WKWebView chrome: pinch-zoom, double-tap zoom,
 * two-finger pan, Safari gesture events. Single-finger game input stays.
 */

const DOUBLE_TAP_MS = 300;

export function lockWebGestures(): void {
  const opt: AddEventListenerOptions = { capture: true, passive: false };

  const block = (ev: Event) => {
    ev.preventDefault();
  };

  document.addEventListener('gesturestart', block, opt);
  document.addEventListener('gesturechange', block, opt);
  document.addEventListener('gestureend', block, opt);
  document.addEventListener('dblclick', block, opt);
  document.addEventListener('contextmenu', block, opt);

  document.addEventListener(
    'touchstart',
    (ev) => {
      if (ev.touches.length > 1) ev.preventDefault();
    },
    opt,
  );
  document.addEventListener(
    'touchmove',
    (ev) => {
      if (ev.touches.length > 1) ev.preventDefault();
    },
    opt,
  );

  let lastTap = 0;
  document.addEventListener(
    'touchend',
    (ev) => {
      const now = Date.now();
      if (now - lastTap <= DOUBLE_TAP_MS) ev.preventDefault();
      lastTap = now;
    },
    opt,
  );

  document.addEventListener(
    'wheel',
    (ev) => {
      if (ev.ctrlKey) ev.preventDefault();
    },
    opt,
  );
}
