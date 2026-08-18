# 调参 — 设置面板

配套：[CONVENTIONS.md](./CONVENTIONS.md) · [SWIPE.md](./SWIPE.md)

真源：`src/game/tune.ts`。右上角 ⚙ 开关，底板挂在 `#ui-root`（禁止 `position: fixed`）。值写入 `localStorage` 键 `slidetoword.tune.v4`。

「棋盘大小」缩放 `.ws-play`（词表 + 棋盘一起）。棋盘左右/上下只平移 `.ws-board`。胶囊左右/上下只平移 `.ws-preview`。

## 现行默认

| 项 | 默认 | 滑条范围 |
|----|------|----------|
| 棋盘字号 | 35 | 16–72 |
| 词表字号 | 20 | 12–44 |
| 左右内边距 | 5 | 0–48 |
| 上下内边距 | 5 | 0–56 |
| 棋盘大小 | 1.05 | 0.55–1.60 |
| 棋盘左右 | 0 | -80–80 |
| 棋盘上下 | 30 | -120–120 |
| 胶囊左右 | 0 | -80–80 |
| 胶囊上下 | 24 | -80–80 |
| 按下放大 | 1.15 | 1.00–1.80 |

改默认：改 `TUNE_DEFAULTS`，并**升 `STORAGE_KEY` 版本**，否则旧本机会继续用缓存。

CSS 变量：`--ws-glyph-size` · `--ws-word-size` · `--ws-pad-x/y` · `--ws-board-scale` · `--ws-board-x/y` · `--ws-preview-x/y` · `--ws-press-scale`。

色条 SVG 的 `inset` 必须跟格子 `padding` 用同一套 `--ws-pad-*`。
