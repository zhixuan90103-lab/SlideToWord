/**
 * Boot adapt shell, then Word Search Pop–style play (DOM on #ui-root).
 * Keep: adapt/*, DOM contract. Gameplay lives in src/game/*.
 */

import {
  applyStageTransform,
  computeStageLayout,
  watchStageLayout,
  type StageLayout,
} from './adapt/design';
import { mountDevicePreview } from './adapt/devicePreview';
import { lockWebGestures } from './adapt/lockGestures';
import { applyNativeClass, applySafeAreaCssVars } from './adapt/safeArea';
import { mountWordSearch } from './game/mount';

const shell = document.getElementById('shell')!;
const viewportEl = document.getElementById('viewport')!;
const stage = document.getElementById('stage')!;
const uiRoot = document.getElementById('ui-root')!;

function boot(): void {
  lockWebGestures();
  applyNativeClass();
  applySafeAreaCssVars();

  const onLayout = (layout: StageLayout) => {
    applyStageTransform(stage, layout);
  };

  let preview: ReturnType<typeof mountDevicePreview>;
  preview = mountDevicePreview(shell, viewportEl, () => {
    applySafeAreaCssVars();
    const size = preview.getViewSize();
    onLayout(computeStageLayout(size.width, size.height));
  });

  watchStageLayout(onLayout, {
    getViewSize: () => preview.getViewSize(),
  });

  mountWordSearch(uiRoot);
}

boot();
