# Slide to Word

竖屏划词关卡：壳来自 **portrait-webgpu-base**（390×844 + Capacitor iOS），玩法对照 **Word Search Pop** 主模式（直线 8 向找词）。

远程：<https://github.com/zhixuan90103-lab/SlideToWord>

| 文档 | 用途 |
|------|------|
| [AGENTS.md](./AGENTS.md) | 打开仓库第一入口 |
| [docs/CONVENTIONS.md](./docs/CONVENTIONS.md) | **现行规范**（壳 + 玩法 + 按下/滑/抬手） |
| [docs/SWIPE.md](./docs/SWIPE.md) | 划词手势设计（几何、死区、换向、两档线宽） |
| [docs/INTENT.md](./docs/INTENT.md) | 意图识别（候选、柔和方向、终点门；代码未接） |
| [docs/ENGINEERING.md](./docs/ENGINEERING.md) | 适配、构建、安全区 |
| [docs/ENTRYPOINTS.md](./docs/ENTRYPOINTS.md) | 入口与调用链 |
| [docs/HAPTICS.md](./docs/HAPTICS.md) | 震动接线 |
| [docs/AUDIO.md](./docs/AUDIO.md) | 音效方案（未实现） |
| [docs/MERGE.md](./docs/MERGE.md) | 原双工程合并说明（历史） |

## 上手

```bash
npm install
npm run dev
# 默认 http://127.0.0.1:5190/
```

应看到：手机预览框、Level 23 词表、6×6 字母盘。划直线找词（含斜向）。

## 玩法（一句话）

按下字母 → 沿横/竖/斜一条线滑 → 松手若是词表里的词则收下。棋盘位置固定。

## iOS 真机

```bash
# 首次
npm run ios:bootstrap
# 日常（已有 ios/）
npm run build && npx cap sync ios
npx cap run ios --no-sync --target <设备 UDID>
```

`appId`：`com.zhixuan.slidetoword`  
`appName`：Slide to Word  

改手势常数只动 `src/game/swipeDesign.ts` 并同步 [SWIPE.md](./docs/SWIPE.md)。改观感动 `mount.ts` / `style.css`。规范以 [CONVENTIONS.md](./docs/CONVENTIONS.md) 为准。
