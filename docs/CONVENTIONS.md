# 规范 — Slide to Word

配套：[AGENTS.md](../AGENTS.md) · [SWIPE.md](./SWIPE.md) · [INTENT.md](./INTENT.md) · [WAVE.md](./WAVE.md) · [TUNE.md](./TUNE.md) · [ENGINEERING.md](./ENGINEERING.md)

对照 Word Search Pop **主模式**（划直线找词）。道具、金币、广告不做。

**文档怎么分**

| 读什么 | 看哪份 |
|--------|--------|
| 壳、玩法总表、禁止事项、文件职责 | 本文 |
| 几何、死区、8 向、线宽、BUG 规则 | [SWIPE.md](./SWIPE.md) |
| 候选、第二字定方向、抬手终点门 | [INTENT.md](./INTENT.md) |
| 主题、重复主题、种词、消落补 | [WAVE.md](./WAVE.md) |
| 设置面板默认与存储键 | [TUNE.md](./TUNE.md) |
| 震动怎么接、玩法四档 | [HAPTICS.md](./HAPTICS.md) |
| 启动链、目录、构建 | [ENGINEERING.md](./ENGINEERING.md) · [ENTRYPOINTS.md](./ENTRYPOINTS.md) |

---

## 1. 壳子（改玩法时勿破）

| 项 | 规定 |
|----|------|
| 设计空间 | 永远 **390×844**。Pad 只改外层视口 |
| 坐标 | 玩法触控用棋盘格子坐标；letterbox 外忽略 |
| Vite `base` | `'./'`。禁止绝对 `/assets/` |
| Capacitor | `webDir: dist`；`ios.contentInset: never`；`scrollEnabled: false` |
| 网页手势 | 禁止双指、双击放大、捏合、系统菜单。第一根手指划词时第二根不得改线、不得提交。见 `src/adapt/lockGestures.ts` + `BridgeViewController.lockWebGestures` |
| DOM | `#shell > #viewport > #app > #stage > #ui-root` |
| UI | 只挂 `#ui-root`。禁止玩法 UI `position: fixed` 贴浏览器窗 |
| 棋盘 | 与词表底板**固定尺寸**，不随词数伸缩。词在底板内居中。预览胶囊用浮层，不得挤开棋盘 |
| 震动 | 真源 `plugins/native-haptics/`，再 `ios:bootstrap`。**SceneDelegate 必须 `BridgeViewController()`**。接线见 [HAPTICS.md](./HAPTICS.md) |
| 当前玩法 | DOM 划词，不依赖 WebGPU。`create-renderer.ts` 保留给以后 3D |

---

## 2. 玩法

细则（主题、重复主题定义、种词、锁格下落）见 [WAVE.md](./WAVE.md)。

- 盘：`n×n` 字母（6×6）。每局开局随机种盘。无失败、无尽。
- 目标 3–6 个（前 5 波 6 个，每 5 波少 1 个）。横、竖、斜各至少 1 条。禁止目标互相包含或共用格。
- 每一波一个主题线索（橙条标题）。词库里其它直线词仍可收（额外词，计分、本波字母留下）。
- 计分：`字数 × 10`。顶栏只显示**当前**和**最高**。不显示波数。
- 松手：字面是目标或词库词则收；否则意图终点门；否则丢掉。
- 本波目标清空且飞字结束后才消落补。过波时不可划。
- 滑动强调用字号，不用 `transform: scale`。格子 `overflow: hidden` + 写死 `grid-template-rows`。真机关闭 `.ws-play` 缩放。
- 意图与关卡无关：[INTENT.md](./INTENT.md)。

---

## 3. 划词输入（实现只放 `swipeDesign.ts`）

细则与常数意图见 [SWIPE.md](./SWIPE.md)。数值是本关手感，**不是** iOS 官方角度/死区推荐。

**禁止**

- 用「手指先进入哪个矩形格」锁方向（斜向会被横/竖邻居抢走）。
- 用横竖格宽去除对角投影（一步会被算成两格，线超前）。
- 用 iOS `preciseLocation` 做进格（Apple：Do not use for hit testing）。
- 在 `mount.ts` 再写一套投影。

**必须**

1. 按下：按下格 = 起点，方向未锁。可从棋盘外按下，滑入的第一格才是起点（顶栏/设置除外）。  
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
| 按下 | 本次色、直径 **0.75 格**、条在字下；按下格立刻变白，字 150ms 放到 **1.28**。震动：一记瞬态。只认第一根手指 |
| 滑动 | 条跟当前射线最近点（0.75）。字变白/放大在条距格心 **0.3 格**（`floor(along + 0.3)`），不是 `round`。只有最远已触发格放大；线上其余白且原大（缩回 300ms）。过格一记轻瞬态。第二根手指忽略 |
| 抬手 · 目标 | 条留下 **0.7 格**；扩散 280ms（外沿 **1.15** 格）。字按词序飞向词表（间隔 25ms，飞行 380ms）再淡出。胶囊停 **400ms** 再 140ms 收。找对震动。过波不震 |
| 抬手 · 额外词 | 同目标的分、震、音、胶囊停留。扩散**两层**，都扩到 **1.5** 格、360ms；第二层晚 **100ms**。不飞字、不消目标 |
| 取消 | 只一格 / 死区 / 真正取消：条与预览收掉，**不晃、不震**。第二根手指引起的 `pointercancel` **不算**取消，第一根继续划 |
| 抬手错误 | ≥2 格不成词：条沿划线方向衰减晃再淡出（晃 480ms，400ms 起淡，660ms 完）。胶囊**只绕中心旋转**（不左右移），与条同时淡出。三记错误瞬态 |

颜色：每次按下随机，**排除盘上已留下的色**（10 色池）。

**胶囊** = 棋盘上方那颗显示当前划词的彩色条，不是划线本身。结构：零尺寸**原点** → 零尺寸**运动层**（只转/淡）→ **外观**贴在原点上 `translate(-50%,-50%)`。禁止把位移+旋转写在外观上（字盒中心会偏下）。

词表底板高度 `hintsY`（默认 **0.60**），见 [TUNE.md](./TUNE.md)。预览胶囊不得挤开棋盘；锚点默认相对缝中心下移 24px。新词表淡入、找到的词淡出。

字母默认 35px。条的几何中心 = 格子中心；字形光学中心可以略偏。观感与震动默认见 [TUNE.md](./TUNE.md)。

---

## 5. 文件职责

| 改什么 | 改哪里 |
|--------|--------|
| 方向 / 投影 / 死区 / 粘住 / 两档线宽 | `src/game/swipeDesign.ts` + 同步 [SWIPE.md](./SWIPE.md) |
| 意图（候选 / 终点门 / 合同） | [INTENT.md](./INTENT.md) · `model.ts` + `mount.ts` + `swipeDesign.ts` |
| 盘面、词表、DOM 反馈、胶囊、指针所有权 | `src/game/mount.ts` + `src/style.css` |
| 设置调参 | `src/game/tune.ts` + [TUNE.md](./TUNE.md) |
| 震动接线 | [HAPTICS.md](./HAPTICS.md) · `src/utils/haptics.ts` · `plugins/native-haptics/` |
| 关卡数据 | `src/game/model.ts`（只供放置索引，禁止特判） |
| 过波（消 / 落 / 补 / 选词 / 主题） | `src/game/wave.ts` + `mount.ts` + [WAVE.md](./WAVE.md) |
| 禁网页手势 | `src/adapt/lockGestures.ts` · `BridgeViewController.swift` |
| 启动、预览框 | `src/main.ts` · `src/adapt/*` |
| 包名 | `capacitor.config.ts`（现 `com.zhixuan.slidetoword` / Slide to Word） |

---

## 6. 真机

```bash
npm run build && npx cap sync ios
npx cap run ios --no-sync --target <设备 UDID>
```

首次或改震动插件：`npm run ios:bootstrap`。Team：`2F4FJS7J37`。
