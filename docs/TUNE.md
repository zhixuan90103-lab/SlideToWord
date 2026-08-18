# 调参 — 设置面板

配套：[CONVENTIONS.md](./CONVENTIONS.md) · [SWIPE.md](./SWIPE.md)

真源：`src/game/tune.ts`（默认与滑条范围以代码为准）。右上角 ⚙ 开关，底板挂在 `#ui-root`（禁止 `position: fixed`）。值写入 `localStorage` 键 `slidetoword.tune.v14`。

词表底板高度倍率 `hintsY`（默认 0.60），压主题条与词表上下内边距、行距。

面板显示词表底板高度 + 震动四档。其它布局项仍从存储或默认值生效。**不改**死区、8 向、终点门。

## 震动默认（0–1）

| 档 | 强度 | 锐度 |
|----|------|------|
| 按下 | 0.55 | 0.86 |
| 过格 | 0.25 | 0.64 |
| 找对 | 0.50 | 0.30 | 间隔 50ms + 持续 I0.40 S0.19 时长 100ms 全段衰减 |
| 错误 | 0.40 | 0.65 | 再两记 0.30/0.49、0.25/0.35，间隔 50ms / 55ms |

改默认：改 `TUNE_DEFAULTS`，并**升 `STORAGE_KEY` 版本**，否则旧本机会继续用缓存。

CSS 变量：`--ws-glyph-size` · `--ws-word-size` · `--ws-pad-x/y` · `--ws-board-scale` · `--ws-board-x/y` · `--ws-preview-x/y` · `--ws-press-scale`。

色条 SVG 的 `inset` 必须跟格子 `padding` 用同一套 `--ws-pad-*`。
