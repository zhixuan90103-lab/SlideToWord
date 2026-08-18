# 规范 — Slide to Word

配套：[AGENTS.md](../AGENTS.md) · [SWIPE.md](./SWIPE.md) · [INTENT.md](./INTENT.md) · [TUNE.md](./TUNE.md) · [ENGINEERING.md](./ENGINEERING.md)

对照 Word Search Pop **主模式**（划直线找词）。道具、金币、广告不做。

**文档怎么分**

| 读什么 | 看哪份 |
|--------|--------|
| 壳、玩法、禁止事项、文件职责 | 本文 |
| 几何、死区、8 向、线宽、BUG 规则 | [SWIPE.md](./SWIPE.md) |
| 候选、第二字定方向、抬手终点门 | [INTENT.md](./INTENT.md) |
| 设置面板默认与存储键 | [TUNE.md](./TUNE.md) |
| 启动链、目录、构建 | [ENGINEERING.md](./ENGINEERING.md) · [ENTRYPOINTS.md](./ENTRYPOINTS.md) |

---

## 1. 壳子（改玩法时勿破）

| 项 | 规定 |
|----|------|
| 设计空间 | 永远 **390×844**。Pad 只改外层视口 |
| 坐标 | 玩法触控用棋盘格子坐标；letterbox 外忽略 |
| Vite `base` | `'./'`。禁止绝对 `/assets/` |
| Capacitor | `webDir: dist`；`ios.contentInset: never`；`scrollEnabled: false` |
| DOM | `#shell > #viewport > #app > #stage > #ui-root` |
| UI | 只挂 `#ui-root`。禁止玩法 UI `position: fixed` 贴浏览器窗 |
| 棋盘 | 默认位置见 [TUNE.md](./TUNE.md)。预览胶囊、过关文案用浮层，不得挤开棋盘布局 |
| 震动 | 改 Swift 改 `plugins/native-haptics/` 再 `ios:bootstrap`。接线见 [HAPTICS.md](./HAPTICS.md) |
| 当前玩法 | DOM 划词，不依赖 WebGPU。`create-renderer.ts` 保留给以后 3D |

---

## 2. 玩法

- 盘：`n×n` 字母（现关 6×6，Level 23 玩具店词表）。
- 词在盘上是 **一条直线**：横、竖、斜，正反都算。不能拐弯。
- 松手：字面线段 ∈ 未找到词表则收下；否则走 [INTENT.md](./INTENT.md) 终点门（离唯一候选另一端够近则收）。否则丢弃，不惩罚。
- 词表清空 → 过关。
- 意图与关卡无关。规范见 [INTENT.md](./INTENT.md)（已接代码）。

---

## 3. 划词输入（实现只放 `swipeDesign.ts`）

细则与常数意图见 [SWIPE.md](./SWIPE.md)。数值是本关手感，**不是** iOS 官方角度/死区推荐。

**禁止**

- 用「手指先进入哪个矩形格」锁方向（斜向会被横/竖邻居抢走）。
- 用横竖格宽去除对角投影（一步会被算成两格，线超前）。
- 用 iOS `preciseLocation` 做进格（Apple：Do not use for hit testing）。
- 在 `mount.ts` 再写一套投影。

**必须**

1. 按下：按下格 = 起点，方向未锁。  
2. 距起点中心 &lt; `LOCK_SLOP_CELLS`（**0.45 格**）：字母不外扩；条可跟角度。缩回死区清掉已定方向。  
3. `along < 1`（未到第二字）：8 向按 22.5° 中线立刻切，**不辅助**。`along ≥ 1`：定方向后再粘住；过门槛瞬间切。细则 [INTENT.md](./INTENT.md) §5。  
4. 角度始终是起点中心 → **此刻**手指。禁止折线。手指每动都重算，不是只在换向时量。  
5. 量的是手指在**当前这条** 8 向直线上的最近点，不是手指到起点的斜线距离。`along = dot(δ, step) / (cell · |step|²)`。对角一步 = 1。  
6. **看见的条**用这一帧的 `step` 与 `along`。**预览字母**用 `round(along)`。**抬手成交**先字面，再意图终点门。换向必须在新线上重投影。  
7. `pointerup` 必须用松手点再投影。`cancel` 丢掉，不认词。

---

## 4. 按下 / 滑动 / 抬手（表现）

线的两端与字母都对齐**格子中心**（滑动中线头可在射线上连续走）。棋盘默认平移见 [TUNE.md](./TUNE.md)，不得因预览胶囊改变布局 top。

| 阶段 | 规定 |
|------|------|
| 按下 | 本次色、直径 **0.75 格**、透明度 1；条在 **字下面**；按下格立刻变白，字有放大过程（默认 150ms 到 1.28） |
| 滑动 | 条画到手指在当前射线上的最近点（0.75 格粗）；未到第二字立刻换向，之后过粘住角瞬间切。字变白/放大在条距该格中心 **0.3 格**时（`floor(along + 0.3)`），不是 `round`、也不是等到正中。最远已触发的格白且放大；线上更早的格白且原大（缩小约 300ms）；离开线段的格恢复默认。同一时刻只有一格放大 |
| 抬手成功 | 同色留下，直径改为 **0.7 格**；词表划掉；预览浮层消失 |
| 抬手失败 | 条和预览消失；盘面、词表不动；不震 |

颜色：每次按下随机，**排除盘上已留下的色**。

预览胶囊叠在词表与盘之间的缝上（高度 0 的槽）。默认相对缝中心下移 **24px**，可用设置微调。

字母默认 **35px**。距格心 0.3 格即放大的当前格 **1.28**（只 `transform` `.ws-glyph`，放大约 150ms、离开缩小约 300ms）。线上其余已达格心的格只变白。观感默认见 [TUNE.md](./TUNE.md)。

---

## 5. 文件职责

| 改什么 | 改哪里 |
|--------|--------|
| 方向 / 投影 / 死区 / 粘住 / 两档线宽 | `src/game/swipeDesign.ts` + 同步 [SWIPE.md](./SWIPE.md) |
| 意图（候选 / 终点门 / 合同） | [INTENT.md](./INTENT.md) · `model.ts` + `mount.ts` + `swipeDesign.ts` |
| 盘面、词表、DOM 反馈 | `src/game/mount.ts` + `src/style.css` |
| 设置调参 | `src/game/tune.ts` + [TUNE.md](./TUNE.md) |
| 关卡数据 | `src/game/model.ts`（只供放置索引，禁止特判） |
| 启动、预览框 | `src/main.ts` · `src/adapt/*` |
| 包名 | `capacitor.config.ts`（现 `com.zhixuan.slidetoword` / Slide to Word） |

---

## 6. 真机

```bash
npm run build && npx cap sync ios
npx cap run ios --no-sync --target <设备 UDID>
```

首次或改震动插件：`npm run ios:bootstrap`。Team：`2F4FJS7J37`。
