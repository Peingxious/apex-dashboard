# debug-dropdown-leading-text-replaced

**状态**: [OPEN]
**会话 ID**: dropdown-leading-text-replaced
**创建时间**: 2026-06-13

---

## 用户反馈

> 还是替换了之前输入的内容
>
> 同时附上控制台日志：
> ```
> [apex-dashboard] render start {navGen: 9, passedDataColumns: 5, ...}
> [apex-dashboard] renderViewNavBar {navGen: 10, embeddedNotePath: 'apex-dashboard（修改）/dash01.md', mainIsActive: false}
> [apex-dashboard] render start {navGen: 10, ...}
> [apex-dashboard] renderViewNavBar {navGen: 11, ...}
> [apex-dashboard] render start {navGen: 11, ...}
> [apex-dashboard] renderViewNavBar {navGen: 12, ...}
> ```

**前置背景**：
- 用户输入：`修复【【en3`（带中文全角括号 `【【`）
- 下拉框出现，匹配到文件
- 用户选中后，**前导文字「修复」和中文括号 `【【` 被替换丢失**
- 剩余结果只剩下文件名（如 `En3` / `Fn3`），甚至可能没有双链括号
- 控制台显示 `navGen` 从 9 → 10 → 11 → 12 连续自增，伴随 `render start` / `renderViewNavBar` 反复触发

**前置修复尝试（v1.1.17 → v1.1.18）**：
- v1.1.17: `replaceWikilinkFragment` 派发 `input` 事件后 `pick()` 读 `input.value` → 失败
- v1.1.18: `replaceWikilinkFragment` 改为返回 `next` 字符串，`pick` 用返回值 → 仍未生效

---

## 假设（H1–H5）

### H1：`replaceWikilinkFragment` 仍然派发 `input` 事件导致同步 `update()` 重新打开/关闭下拉，把字段改回
- **观察点**：在 `pick` / `replaceWikilinkFragment` / `update` 三处加埋点，输出 `(value, caret, ctx, replaced, post-update-value)`
- **预期**：`replaced` 是 `"修复[[Fn3]]"`，但 `post-update-value` 又变回 `"修复【【en3"` 或空

### H2：用户实际**没有点击下拉项**，而是按 Enter → 走 `input.addEventListener("keydown", Enter)` 的 fallback 分支
- **观察点**：在两个 keydown 分支都加埋点，输出 `pickPath: "click" | "enter" | "enter-noarrow" | "escape"`
- **预期**：走到 `callbacks.onTaskAdd(card.id, input.value.trim())` 时 `input.value` 是原始的 `"修复【【en3"`，而非 `pick()` 处理后的

### H3：用户**点中了下拉项**，但 `onPick` 回调签名不匹配——`TaskAdd` 的 `onPick(value)` 接收的是 `replaced ?? input.value`，但实际拿到的是 `input.value`（因为 `replaced` 在 build 后是 `undefined`）
- **观察点**：在 `pick` 内埋点 `replaced` 是否为 `null/undefined`；`onPick` 实际收到的第一个参数是什么
- **预期**：`replaced` 正常为 `"修复[[Fn3]]"`，但 `onPick` 内部拿到的 `value` 是空 / `undefined`

### H4：embedded view 的 `onTaskAdd` 回调接到的 `text` 是 `input.value.trim()` 而不是 `replaced`
- **观察点**：在 renderer.ts:3361 调用 `callbacks.onTaskAdd` 处埋点输出 `text` 内容
- **预期**：`text` 是 `"修复【【en3"`（说明回调拿的就是 input 当前值）

### H5：`onTaskAdd` → `sync.addTask` 内部把 `[[xxx]]` 当成 wikilink 处理，存储时被剥成 `xxx`（数据层而非渲染层）
- **观察点**：在 `sync.addTask` 入参处埋点输出 `text`；读取存储后输出
- **预期**：存储的 text 已经丢失前导

---

## 优先级

| # | 假设 | 可证伪性 | 排查成本 |
|---|------|----------|----------|
| H1 | 同步 input 事件竞态 | 高 | 低（埋 3 个点） |
| H2 | 用户没点下拉，按 Enter | 中 | 低（埋 keydown） |
| H4 | onTaskAdd 拿的就是 input.value | 高 | 低（埋 1 个点） |
| H3 | onPick 签名 / 闭包 | 中 | 低 |
| H5 | 数据层处理 wikilink | 中 | 中 |

**首要验证**：H1 + H2 + H4（最有可能，且最便宜）

---

## 排障计划

1. **Step 1 插桩**（首次改业务代码）：在以下位置加 `console.log("[dbg-file-suggest]", ...)` 哨兵
   - `pick()` 入口 + `replaced` 值 + `onPick` 实际收到的第一个参数
   - `replaceWikilinkFragment` 入口 + `next` 值 + 派发 `input` 前后 `input.value` 对比
   - `update()` 入口 + 是否调用了 `close()`
   - renderer.ts 任务 add 的 Enter keydown 两个分支

2. **Step 2 用户复现**：让用户输入 `修复【【en3` → 选文件，把控制台日志发回来

3. **Step 3 定位**：根据日志确认是 H1/H2/H3/H4 哪个

4. **Step 4 最小修复**：根据定位结果改代码

5. **Step 5 二次验证**：用户再测一次，对比前后日志

6. **Step 6 清理**：用户确认修复后，移除所有 `console.log`

---

## 当前状态

- 等待 Step 1 插桩
- 用户需要：保持 Obsidian 打开，准备复现
