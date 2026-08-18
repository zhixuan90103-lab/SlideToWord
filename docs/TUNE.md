# 调参

配套：[CONVENTIONS.md](./CONVENTIONS.md) · [HAPTICS.md](./HAPTICS.md)

真源：`src/game/tune.ts`。右上角 ⚙ 打开底板（挂 `#ui-root`，禁止 `position: fixed`）。

存储键：**`slidetoword.tune.v14`**。改默认必须改 `TUNE_DEFAULTS` 并升版本，否则旧机继续用缓存。

## 面板上有什么

- **词表底板 → 高度**（`hintsY`）：底板外框已固定，此项不再撑开布局；词在板内按数量居中  

- **震动四档**：按下、过格、找对（瞬态 + 间隔 + 持续 + 衰减）、错误（三记 + 两段间隔）  
- 每档有「试」；右上「完成」、下拉、点遮罩、再点 ⚙ 都可关  

其它布局（字号、棋盘位移等）仍从存储或默认值生效，不在面板里改。**不改**死区、8 向、终点门。

## 震动默认

| 档 | 强度 / 锐度 | 其它 |
|----|-------------|------|
| 按下 | 0.55 / 0.86 | 一记瞬态 |
| 过格 | 0.25 / 0.64 | 一记瞬态 |
| 找对 | 瞬态 0.50 / 0.30 | 间隔 50ms；持续 0.40 / 0.19；时长 100ms；衰减 1（整段收到 0） |
| 错误 | 0.40 / 0.65 | 50ms → 0.30 / 0.49 → 55ms → 0.25 / 0.35 |

实现：`playTransient`（按下/过格）、`playFindHaptic` / `playMissHaptic`（pattern）。

## 其它默认（不在面板）

| 项 | 默认 |
|----|------|
| 棋盘字号 | 35 |
| 词表字号 | 20 |
| 棋盘大小 / 位移 | 1.05 · x0 y30 |
| 胶囊位移 | x0 y24 |
| 按下放大 | 1.28 |

CSS：`--ws-hints-y` · `--ws-glyph-size` · `--ws-word-size` · `--ws-pad-x/y` · `--ws-board-scale` · `--ws-board-x/y` · `--ws-preview-x/y` · `--ws-press-scale`。

色条 SVG 的 `inset` 必须跟格子 `padding` 用同一套 `--ws-pad-*`。
