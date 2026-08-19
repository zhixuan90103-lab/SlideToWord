# 震动 — 如何一次接对

配套：[CONVENTIONS.md](./CONVENTIONS.md) · [TUNE.md](./TUNE.md)

**真源 Swift**：`plugins/native-haptics/`（改这里）。`ios/App/App/` 里的同名文件是副本。  
**JS 唯一出口**：`src/utils/haptics.ts`。玩法只走 `haptics.playTransient` / `playPattern`（`tune.ts` 的 `playFindHaptic` / `playMissHaptic`）。

---

## 0. 先分清两件事

| | 接上没有 | 手感好不好 |
|--|----------|------------|
| 看什么 | 插件有没有注册、真机能不能震一下 | 强度 / 锐度 / pattern |
| 改什么 | bootstrap、SceneDelegate、storyboard | `tune.ts` 默认值，升存储版本 |

没接上时调参毫无意义。iOS **WebView 没有** `navigator.vibrate`，插件没挂上 = 真机完全没震。

**不要用 `haptics.prepare()` 当验收。** Swift **没有** `prepare`。引擎在插件 `load()` 里启动。

---

## 1. 正确接入

### 1.1 用哪条命令

| 你刚做了什么 | 命令 |
|--------------|------|
| 刚 clone / 没有 `ios/` / 第一次真机 | `npm run ios:bootstrap` → Xcode 真机 Run |
| 改了 `plugins/native-haptics/*.swift` | **再跑** `ios:bootstrap` |
| 只改了 `src/`、`index.html`、CSS | `npm run build && npx cap sync ios` 再 Xcode Run |

`cap:sync` / `npm run ios` **不会**改 storyboard，也 **不会**改 SceneDelegate。干净的 `cap add ios` 工程默认没挂插件。

### 1.2 第一次真机

```bash
cd portrait-webgpu-base
npm install
npm run ios:bootstrap
npm run cap:open
```

Xcode：Signing → Team → **真机**（不要模拟器）→ Run。

### 1.3 充要条件（缺一条 = 没接上）

1. `plugins/native-haptics/AdvancedHapticsPlugin.swift` 已拷到 `ios/App/App/`
2. `ios/App/App/BridgeViewController.swift` 里：

```swift
override func capacitorDidLoad() {
    super.capacitorDidLoad()
    bridge?.registerPluginInstance(AdvancedHapticsPlugin())
}
```

3. `Main.storyboard` 入口 VC：

```xml
customClass="BridgeViewController" customModule="App"
```

不是 `CAPBridgeViewController`。

4. **`SceneDelegate.swift` 必须是：**

```swift
window?.rootViewController = BridgeViewController()
```

写成 `CAPBridgeViewController()` 会绕过第 2 步。这是本仓曾经真机完全没震的原因。`ios:bootstrap` 会改这一行。

5. 上述两个 `.swift` 在 Xcode **Compile Sources**
6. JS：`registerPlugin('AdvancedHaptics')` 与 `isPluginAvailable('AdvancedHaptics')` 同一字符串

### 1.4 怎么确认已经接通

Xcode 控制台必须有：`AdvancedHapticsPlugin registered`

Safari → 开发 → 你的 iPhone → 该 App，粘贴：

```js
({
  native: window.Capacitor?.isNativePlatform?.(),
  platform: window.Capacitor?.getPlatform?.(),
  plugin: window.Capacitor?.isPluginAvailable?.('AdvancedHaptics'),
})
```

期望：`{ native: true, platform: 'ios', plugin: true }`。

| 实际 | 含义 |
|------|------|
| `native: false` | 你在浏览器里，不是 App |
| `ios` 但 `plugin: false` | 没注册。查 SceneDelegate / storyboard / bootstrap |
| `plugin: true` 仍不震 | 系统设置关了触感，或只测了模拟器 |

杀进程再开仍能震，才算 `load()` 起的引擎是活的。

---

## 2. 能力分层（玩法用哪一层）

| 层 | API | 本关 |
|----|-----|------|
| UIKit 预设 | `impact` / `selection` / `notification` | **不用**（层次不够） |
| Core Haptics 瞬态 | `playTransient(I, S)` = 原生 `stackImpact` | 按下、过格 |
| Pattern | `playPattern(events, curves?)` | 找对、错误 |
| 长震开关 | `startContinuous` / `stopContinuous` | 不单独开；找对的持续段写在 pattern 里 |
| `prepare()` | JS 有、Swift **无** | **禁止当验收** |

---

## 3. 玩法现行四档

实现：`mount.ts` → `fireHaptic` → `tune.ts`（`playFindHaptic` / `playMissHaptic`）。数值真源 [TUNE.md](./TUNE.md)，⚙ 可改。

| 事件 | 怎么震 | 不震 |
|------|--------|------|
| 按下 | 一记瞬态 | |
| 过格 | 一记更轻的瞬态 | |
| 找对 | 瞬态 → **间隔** → 持续段（强度按**衰减**收到 0） | |
| 错误（已划 ≥2 格且不成词） | 三记瞬态，两段间隔 | |
| 只点一格 / 死区 / `pointercancel` | | **取消，不震不晃** |
| 过关 | | **不震** |

禁止：玩法里再 `registerPlugin`、再 `navigator.vibrate`、`await` 堵逻辑帧。一律 `void`。

改手感：只改 `TUNE_DEFAULTS` 并**升高** `STORAGE_KEY`（现 `slidetoword.tune.v15`）。只改 JS 不必 bootstrap。

---

## 4. 禁止与易错

- 改 Swift 只改 `ios/App/App/` 副本 → 下次 bootstrap 被覆盖  
- SceneDelegate 用默认 `CAPBridgeViewController` → 真机无震  
- 用 `prepare()` 的失败日志判断没接上  
- 桌面 `npm run dev` 不震当成故障（`not_native_ios` 正常）  
- 同一 100ms 叠两记（找对 + 过关）——过关已去掉震动  

---

## 5. 原生方法（插件有、JS 能调）

| 方法 | 底层 | 用途 |
|------|------|------|
| `impact({ style })` | UIKit | 本关不用 |
| `notification({ type })` | UIKit | 本关不用 |
| `selection()` | UIKit | 本关不用 |
| `stackImpact({ intensity, sharpness })` | CH transient | `playTransient` |
| `playPattern({ events, parameterCurves? })` | CH | 找对 / 错误 |
| `startContinuousHaptic` / `stopContinuousHaptic` | CH | 长震；stop 约 50ms 淡出 |
| `setKeepAwake` | 闲置定时器 | **不是震动** |
