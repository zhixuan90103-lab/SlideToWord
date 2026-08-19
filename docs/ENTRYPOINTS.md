# 入口与调用链

## 1. 命令

| 命令 | 结果 |
|------|------|
| `npm run dev` | Vite，默认 http://127.0.0.1:5190/ |
| `npm run build` | `tsc` + `dist/`（相对路径） |
| `npm run cap:sync` | build + cap sync ios |
| `npm run ios:bootstrap` | add ios + 注入插件 + sync |
| `npm run ios` | sync + open Xcode |
| `npx cap run ios --no-sync --target <UDID>` | 装到已连真机 |

## 2. Web 启动链

```
index.html
  → style.css
  → main.ts
       → lockWebGestures
       → applyNativeClass / safeArea
       → mountDevicePreview → computeStageLayout → applyStageTransform
       → watchStageLayout
       → mountWordSearch(#ui-root)
            → wave 开局种盘
            → swipeDesign 手势
            → tune 设置面板
            → 单指 pointer + 条/字/胶囊反馈
```

当前 **不** 创建 WebGPU canvas。

## 3. DOM

```
#shell
  #viewport
    #app
      #stage
        #ui-root.ws-root
          .ws-play（词表 + 棋盘，一起缩放）
            词表 / 预览胶囊 / 棋盘
              svg.ws-lines   （条，字下面）
              .ws-cells      （字）
          .ws-tune           （⚙ 开关）
#device-switcher / #device-label   (web only)
```

## 4. iOS

震动插件 **不会**随 `cap:sync` 自动注册。第一次 / 改插件必须 `ios:bootstrap`。SceneDelegate 必须是 `BridgeViewController()`。见 [HAPTICS.md](./HAPTICS.md)。

```
ios:bootstrap
  → 拷 plugins/native-haptics → ios/App/App
  → Main.storyboard customClass = BridgeViewController
Xcode / cap run
  → load App/public (= dist)
  → 同上 Web 链（无 WebGPU）
```

## 5. 改配置找谁

| 要改 | 文件 |
|------|------|
| 规范总表 | [CONVENTIONS.md](./CONVENTIONS.md) |
| 划词投影 / 死区 / 换向 / 线宽 | `src/game/swipeDesign.ts` · [SWIPE.md](./SWIPE.md) |
| 意图识别（候选 / 终点门） | [INTENT.md](./INTENT.md) · `swipeDesign.pickIntentPlacement` |
| 盘面与按下观感 | `src/game/mount.ts` · `src/style.css` |
| 调参（设置里开关） | `src/game/tune.ts` · [TUNE.md](./TUNE.md) |
| 关卡 / 放置索引 | `src/game/model.ts` |
| 过波（消落补、主题、重复主题） | `src/game/wave.ts` · `mount.ts` · [WAVE.md](./WAVE.md) |
| 禁网页手势 / 双指 | `src/adapt/lockGestures.ts` · `BridgeViewController.swift` |
| base / 端口 | `vite.config.ts` |
| appId / 显示名 | `capacitor.config.ts` |
| 设计分辨率 | `design.ts` + `style.css` `#stage` |
| 震动原生 | `plugins/native-haptics/*.swift` + bootstrap |
| 过格音 / 找对音 | `src/audio/noteSfx.ts` · `public/sfx/` · [AUDIO.md](./AUDIO.md) |
