# Slide to Word

竖屏划词关卡：壳来自 **portrait-webgpu-base**（390×844 + Capacitor iOS），玩法对照 **Word Search Pop** 主模式（直线 8 向找词）。

远程：<https://github.com/zhixuan90103-lab/SlideToWord>

| 文档 | 用途 |
|------|------|
| [AGENTS.md](./AGENTS.md) | 打开仓库第一入口 |
| [docs/CONVENTIONS.md](./docs/CONVENTIONS.md) | **现行规范**（壳 + 玩法 + 按下/滑/抬手） |
| [docs/WAVE.md](./docs/WAVE.md) | 主题、重复主题、种词、消落补 |
| [docs/SWIPE.md](./docs/SWIPE.md) | 划词手势设计（几何、死区、换向、两档线宽） |
| [docs/INTENT.md](./docs/INTENT.md) | 意图识别（候选、第二字定方向、终点门） |
| [docs/TUNE.md](./docs/TUNE.md) | 设置调参与现行默认 |
| [docs/ENGINEERING.md](./docs/ENGINEERING.md) | 适配、构建、安全区 |
| [docs/ENTRYPOINTS.md](./docs/ENTRYPOINTS.md) | 入口与调用链 |
| [docs/HAPTICS.md](./docs/HAPTICS.md) | **震动如何一次接对**（SceneDelegate + 玩法四档） |
| [docs/AUDIO.md](./docs/AUDIO.md) | 音效方案；过格音已接 `src/audio/noteSfx.ts` |
| [docs/MERGE.md](./docs/MERGE.md) | 原双工程合并说明（历史） |

## 上手

```bash
npm install
npm run dev
# 默认 http://127.0.0.1:5190/
```

应看到：手机预览框、主题线索、6×6 字母盘。每局开局盘面不同。划直线找词（含斜向）。目标找完后字母消除下落，再出新主题。

## 玩法（一句话）

按下字母 → 沿横/竖/斜一条线滑 → 松手是目标或词库词则收下。一波 3～6 个主题词找完后集体消除、按列下落、顶上补字。盘上其它词库词也计分。右上角 ⚙ 可调词表底板高度与震动四档。

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

划词线头：8 向、起点固定、手指每动按**当前射线**重算最近点，见 [SWIPE.md](./docs/SWIPE.md)。改手势常数只动 `src/game/swipeDesign.ts` 并同步该文档。改观感默认动 `tune.ts` 并升存储版本，见 [TUNE.md](./docs/TUNE.md)。规范以 [CONVENTIONS.md](./docs/CONVENTIONS.md) 为准。
