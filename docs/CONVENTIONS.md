# 规范 — Slide to Word

配套：[AGENTS.md](../AGENTS.md) · [SWIPE.md](./SWIPE.md) · [INTENT.md](./INTENT.md) · [ENGINEERING.md](./ENGINEERING.md)

对照 Word Search Pop **主模式**（划直线找词）。道具、金币、广告不做。

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
| 棋盘 | **位置固定**。预览胶囊、过关文案用浮层，不得挤开棋盘 |
| 震动 | 改 Swift 改 `plugins/native-haptics/` 再 `ios:bootstrap`。接线见 [HAPTICS.md](./HAPTICS.md) |
| 当前玩法 | DOM 划词，不依赖 WebGPU。`create-renderer.ts` 保留给以后 3D |

---

## 2. 玩法

- 盘：`n×n` 字母（现关 6×6，Level 23 玩具店词表）。
- 词在盘上是 **一条直线**：横、竖、斜，正反都算。不能拐弯。
- 松手：字面线段 ∈ 未找到词表则收下；否则走 [INTENT.md](./INTENT.md) 终点门（离唯一候选另一端够近则收）。否则丢弃，不惩罚。
- 词表清空 → 过关。
- 意图与关卡无关。规范见 [INTENT.md](./INTENT.md)（**代码尚未接上**）。

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
2. 距起点中心 &lt; `LOCK_SLOP_CELLS`（**0.35 格**）：仍只有起点圆，方向空。缩回死区同样清方向。  
3. 否则：`atan2` 量化到 8 个 45°。第一锁晚一点定；已锁则粘住，偏够并稳住才换向（**不锁死**）。细则 [INTENT.md](./INTENT.md) §5。  
4. 角度始终是起点中心 → 手指。禁止折线。  
5. 投影：`along = dot(δ, step) / (cell · |step|²)`。对角一步 = 1。画线必须用同一 `step`（对角 `(1,1)`），禁止单位圆方向。  
6. **滑动预览**用 `round(along)`。**抬手成交**先字面，再意图终点门。  
7. `pointerup` 必须用松手点再投影。`cancel` 丢掉，不认词。

---

## 4. 按下 / 滑动 / 抬手（表现）

棋盘位置始终不动。线的两端与字母都对齐**格子中心**（滑动中线头可在射线上连续走）。

| 阶段 | 规定 |
|------|------|
| 按下 | 本次色、直径 **0.75 格**、透明度 1；条在 **字下面**；该字母立刻变白，绕字心放大 |
| 滑动 | 条沿当前 8 向跟手变长（仍 0.75）；柔和粘住可换向；每新纳入一字母可轻震 + 预览更新 |
| 抬手成功 | 同色留下，直径改为 **0.7 格**；词表划掉；预览浮层消失 |
| 抬手失败 | 条和预览消失；盘面、词表不动；不震 |

颜色：每次按下随机，**排除盘上已留下的色**。

预览胶囊（C / CA）叠在词表与盘之间的缝上，高度为 0 的槽，**不得改变棋盘 top**。

字母 **35px**。放大只 `transform` `.ws-glyph`，格子盒子不位移。`transform-origin: 50% 50%`。颜色立刻变白，不要用慢的颜色过渡冒充延迟。

---

## 5. 文件职责

| 改什么 | 改哪里 |
|--------|--------|
| 方向 / 投影 / 死区 / 粘住 / 两档线宽 | `src/game/swipeDesign.ts` + 同步 [SWIPE.md](./SWIPE.md) |
| 意图（候选 / 终点门 / 合同） | [INTENT.md](./INTENT.md) · `model.ts` + `mount.ts` + `swipeDesign.ts` |
| 盘面、词表、DOM 反馈 | `src/game/mount.ts` + `src/style.css` |
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
