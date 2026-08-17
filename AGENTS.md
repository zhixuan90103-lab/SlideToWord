# AGENTS.md — Slide to Word

> **打开本仓库时的第一入口。**  
> 竖屏壳（390×844 + Capacitor iOS）+ Word Search Pop 式划词主模式。

## 一句话

**TypeScript + Vite + Capacitor iOS** 竖屏关卡。设计空间 **390×844**，contain letterbox。当前玩法是 DOM 划词，不依赖 WebGPU。

规范真源：[docs/CONVENTIONS.md](./docs/CONVENTIONS.md) · 手势细则：[docs/SWIPE.md](./docs/SWIPE.md)

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
| 震动 JS | `src/utils/haptics.ts` |
| 震动 Swift 真源 | `plugins/native-haptics/*` |
| 震动怎么接 | `docs/HAPTICS.md` **§0** |
| Capacitor | `capacitor.config.ts`（`contentInset: never`） |
| 构建 | `vite.config.ts`（**`base: './'`**） |
| iOS 注入 | `scripts/bootstrap-ios.mjs` |
| 规范总表 | `docs/CONVENTIONS.md` |
| 音效方案（未实现） | `docs/AUDIO.md` |
| 3D 渲染（现未用） | `src/create-renderer.ts` |

## DOM（勿拆）

```
#shell > #viewport > #app > #stage
  #ui-root        ← 所有游戏 UI（safe padding）
    词表 / 预览浮层 / 棋盘（条在字下）
#device-switcher  ← 仅桌面预览例外
```

棋盘位置固定。预览胶囊、过关字用浮层。

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
10. **对角一步 = 1 格**（`along` 按 `\|step\|²` 归一）  
11. **死区 0.35 格；已锁后约 28° 内不换向**（粘住须大于 22.5° 中线）  
12. **滑动中线宽 0.75 格；找对留下 0.65 格**  
13. **按下：本次色不透明、条在字下、字立刻变白并绕字心放大；色排除盘上已有**  
14. **棋盘不因点击/预览上下位移**

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
- 观感：`mount.ts` + `style.css`  
- 保留：adapt / haptics / plugins / `base`  
- 音效：按 `docs/AUDIO.md`；禁止热路径 `new Audio()` / 每发一次桥  

## 刻意不做

- 道具 / 金币 / 广告  
- Two Dots 式拐弯  
- Android（可后加）  
