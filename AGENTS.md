# AGENTS.md — Slide to Word

> **打开本仓库时的第一入口。**  
> 竖屏壳（390×844 + Capacitor iOS）+ Word Search Pop 式划词主模式。

## 一句话

**TypeScript + Vite + Capacitor iOS** 竖屏关卡。设计空间 **390×844**，contain letterbox。当前玩法是 DOM 划词，不依赖 WebGPU。

规范真源：[docs/CONVENTIONS.md](./docs/CONVENTIONS.md) · 手势：[docs/SWIPE.md](./docs/SWIPE.md) · 意图：[docs/INTENT.md](./docs/INTENT.md) · 调参：[docs/TUNE.md](./docs/TUNE.md)

## 入口地图

| 职责 | 文件 |
|------|------|
| Web 启动 | `index.html` → `src/main.ts` |
| 设计舞台 | `src/adapt/design.ts` |
| 设备预览 | `src/adapt/devicePreview.ts` |
| Safe Area | `src/adapt/safeArea.ts` + `src/style.css` |
| 划词规则 / 投影 | `src/game/swipeDesign.ts` |
| 关卡与词表 | `src/game/model.ts` |
| 盘面 DOM / 反馈 | `src/game/mount.ts` |
| 设置调参 | `src/game/tune.ts` |
| 震动 JS | `src/utils/haptics.ts` |
| 震动 Swift 真源 | `plugins/native-haptics/*` |
| 震动怎么接 | `docs/HAPTICS.md` **§0** |
| Capacitor | `capacitor.config.ts`（`contentInset: never`） |
| 构建 | `vite.config.ts`（**`base: './'`**） |
| iOS 注入 | `scripts/bootstrap-ios.mjs` |
| 规范总表 | `docs/CONVENTIONS.md` |
| 意图识别 | `docs/INTENT.md` · `model.ts` / `swipeDesign.ts` / `mount.ts` |
| 调参规范 | `docs/TUNE.md` |
| 音效方案（未实现） | `docs/AUDIO.md` |
| 3D 渲染（现未用） | `src/create-renderer.ts` |

## DOM（勿拆）

```
#shell > #viewport > #app > #stage
  #ui-root        ← 所有游戏 UI（safe padding）
    词表 / 预览胶囊 / 棋盘（条在字下）
    ⚙ 设置 → 调参底板
#device-switcher  ← 仅桌面预览例外
```

棋盘与胶囊默认位移见 [docs/TUNE.md](./docs/TUNE.md)。过关字用浮层。

## 硬性约定

1. **`vite` `base: './'`** — Capacitor 禁止绝对 `/assets/`  
2. **`webDir: dist`** 与 Vite `outDir` 一致  
3. **`ios.contentInset: never`** — Safe Area 只走 CSS  
4. **布局坐标 390×844**  
5. **UI 只挂 `#ui-root`**；禁止玩法 UI `position: fixed` 贴浏览器窗  
6. **Pad 只改外层视口**，不改 `DESIGN_*`  
7. **改 Swift 改 `plugins/native-haptics/`** 再 `ios:bootstrap`  
8. **划词投影只写在 `swipeDesign.ts`**  
9. **方向用起点中心→手指的 8 向，禁止用矩形邻格抢锁**  
10. **对角一步 = 1 格**（`along` 按 `\|step\|²` 归一）。**画线 `start + step * along`，step 与投影相同；对角是 `(1,1)`，禁止 `(sin,cos)` 单位向量**（SWIPE BUG 5）  
11. **死区 0.45 格。未到第二字不辅助；到达第二字才定方向**（INTENT.md）  
12. **滑动中线宽 0.75 格；找对留下 0.7 格**  
13. **8 向 + 按下格为起点；每样本用此刻手指在当前射线上的最近点画线。换向在新线上重算，禁止沿用旧 along**（SWIPE「线头怎么量」· BUG 5 / 6）  
14. **按下：本次色不透明、条在字下、按下格立刻变白并有放大过程。字变白/放大在条距该格中心 0.3 格时。线上已触发、手指已离开的格白且原大。色排除盘上已有**  
15. **预览胶囊不得挤开棋盘布局**；默认位移见 TUNE.md

## 命令

```bash
npm install
npm run dev           # 默认 http://127.0.0.1:5190/ ；占用时可换端口
npm run build
npm run cap:sync
npm run ios:bootstrap # 首次 / 修插件
npx cap run ios --no-sync --target <UDID>
```

查询参数：`?preview=0|1` · `?debugFit=1`  
调试安全区：`document.body.classList.add('debug-safe-area')`

## 业务怎么加

- 关卡：`src/game/model.ts`  
- 手感：`swipeDesign.ts` + `docs/SWIPE.md`  
- 意图：`docs/INTENT.md`  
- 观感 / 调参：`mount.ts` + `style.css` + `tune.ts` + `docs/TUNE.md`  
- 保留：adapt / haptics / plugins / `base`  
- 音效：按 `docs/AUDIO.md`；禁止热路径 `new Audio()` / 每发一次桥  

## 刻意不做

- 道具 / 金币 / 广告  
- Two Dots 式拐弯  
- Android（可后加）  
