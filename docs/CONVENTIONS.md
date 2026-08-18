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
| DOM | `#shell > #viewport > #app > #stage > #ui-root` |
| UI | 只挂 `#ui-root`。禁止玩法 UI `position: fixed` 贴浏览器窗 |
| 棋盘 | 与词表底板**固定尺寸**，不随词数伸缩。词在底板内居中。预览胶囊用浮层，不得挤开棋盘 |
| 震动 | 真源 `plugins/native-haptics/`，再 `ios:bootstrap`。**SceneDelegate 必须 `BridgeViewController()`**。接线见 [HAPTICS.md](./HAPTICS.md) |
| 当前玩法 | DOM 划词，不依赖 WebGPU。`create-renderer.ts` 保留给以后 3D |

---

## 2. 玩法

- 盘：`n×n` 字母（6×6）。每局开局随机种盘；过波优先用落下的旧字母种新词。
- 目标词推送：每 **5** 波少 1 个（1–5 波 6 个，6–10 波 5 个…），最少 **3** 个。横、竖、斜各至少 1 条。
- 第 **20** 波起：3 个提示里有 1 个词藏 1 个字母（下划线）。之后每 5 波多藏 1 个词，到第 30 波三个词各藏 1 个。划中后显示全词。
- 每一波一个主题线索（橙条标题），目标词都属该类。盘上词库里其它能划的直线词仍计分。
- 盘上词库里能划成直线的词都可以收（彩蛋词），字母本波先留下。
- 计分：每个收下的词 `字数 × 10`，本局累加。顶栏只显示**当前**和**最高**（本地存储）。不再显示波数。
- 松手：字面是目标或词库词则收；否则走终点门（目标 + 未收彩蛋）。否则丢掉，不惩罚。无失败、无尽。
- 本波词表清空且飞字结束后：只用过的字母集体消除；未用字母按列下落（下空才落）；顶上只补空位。禁止把残留钉子当已消除、整盘重掉。过波时不可划。
- 下落按 TripleMatch 锁格：目标永远是下一格；`incoming` 占坑；走出 0.22 格才放源格，上面才能跟。匀速。
- 下落只画在与棋盘对齐的浮层上（`top/left` 按行占比），格子字在 `ws-falling` 时隐藏。禁止在终点格里 `translateY` 飞（iOS 和 PC 算出来不一样，会叠字、空行）。
- 滑动强调用字号，不用 `transform: scale`（iOS 上会撑破 `1fr` 行，出现空行和叠字）。格子 `overflow: hidden`，并写死 `grid-template-rows`。真机关闭 `.ws-play` 缩放。
- 落定：浮层先贴到整数格，下一帧撤浮层、显示格子。不换棋盘 DOM。
- 落地缓冲同一条 rAF：轻下沉+轻压扁，原点格子下边。
- 同一波目标词不得互相包含（禁止 TRAIN + RAIN），也不得共用格子。
- 意图与关卡无关。规范见 [INTENT.md](./INTENT.md)。过波选词见 `src/game/wave.ts`。

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
| 按下 | 本次色、直径 **0.75 格**、条在字下；按下格立刻变白，字 150ms 放到 **1.28**。震动：一记瞬态 |
| 滑动 | 条跟当前射线最近点（0.75）。字变白/放大在条距格心 **0.3 格**（`floor(along + 0.3)`），不是 `round`。只有最远已触发格放大；线上其余白且原大（缩回 300ms）。过格一记轻瞬态 |
| 抬手成功 | 条留下 **0.7 格**；同色扩散淡出 280ms（外沿 1.15 格）。词按**单词首字母**顺序从盘面飞到词表（间隔 25ms，飞行 380ms，慢出慢入中间快）；每到一字从左画 3px 划线。预览消失。找对：瞬态 + 间隔 + 持续衰减。过关不震 |
| 取消 | 只一格 / 死区 / `pointercancel`：条与预览收掉，**不晃、不震** |
| 抬手错误 | 已划 ≥2 格且不成词：条停在松手形状，沿条方向衰减晃动再淡出；字白收回默认色；三记错误瞬态。可被下一次按下打断 |

颜色：每次按下随机，**排除盘上已留下的色**。

词表底板高度 `hintsY`（默认 **0.60**），见 [TUNE.md](./TUNE.md)。预览胶囊不得挤开棋盘；默认相对缝中心下移 24px。

字母默认 35px。条的几何中心 = 格子中心；字形光学中心可以略偏。观感与震动默认见 [TUNE.md](./TUNE.md)。

---

## 5. 文件职责

| 改什么 | 改哪里 |
|--------|--------|
| 方向 / 投影 / 死区 / 粘住 / 两档线宽 | `src/game/swipeDesign.ts` + 同步 [SWIPE.md](./SWIPE.md) |
| 意图（候选 / 终点门 / 合同） | [INTENT.md](./INTENT.md) · `model.ts` + `mount.ts` + `swipeDesign.ts` |
| 盘面、词表、DOM 反馈 | `src/game/mount.ts` + `src/style.css` |
| 设置调参 | `src/game/tune.ts` + [TUNE.md](./TUNE.md) |
| 震动接线 | [HAPTICS.md](./HAPTICS.md) · `src/utils/haptics.ts` · `plugins/native-haptics/` |
| 关卡数据 | `src/game/model.ts`（只供放置索引，禁止特判） |
| 过波（消 / 落 / 补 / 选词） | `src/game/wave.ts` + `mount.ts` |
| 启动、预览框 | `src/main.ts` · `src/adapt/*` |
| 包名 | `capacitor.config.ts`（现 `com.zhixuan.slidetoword` / Slide to Word） |

---

## 6. 真机

```bash
npm run build && npx cap sync ios
npx cap run ios --no-sync --target <设备 UDID>
```

首次或改震动插件：`npm run ios:bootstrap`。Team：`2F4FJS7J37`。
