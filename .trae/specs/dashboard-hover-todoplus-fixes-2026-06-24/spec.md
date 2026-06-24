# Dashboard Hover & TodoPlus 修复 Spec

## Why

上一轮 `dashboard-ux-fixes-2026-06-24` 实施后，用户报回两个真问题：

1. **TodoPlus 卡片渲染时 "无法定位来源"**：源笔记 `121` 没有 `## To-do` 标题块时，渲染器直接报错，把卡片锁死在错误态。**自动补齐** 只发生在「添加卡片」的入口，老卡片或「删除标题后重开」不会自愈。
2. **原生 Page Preview 不弹**：双链 `[[未命名 1]]` 在卡片正文里 hover 时，插件派发 `link-hover` 事件时把第 5 个参数（source path）硬编码为字符串 `"peingxious-dashboard"`。Page Preview 核心插件用这个参数解析链接上下文，源不是合法 vault 路径，链接解析失败，浮窗不出现。

## What Changes

- TodoPlus 卡片渲染时（`renderTodoPlusBody`）若 `resolveTodoPlusSlice` 第一次返回 null，**先**调 `ensureTodoPlusHeading` 兜底，**再**重新解析；解析成功就继续渲染空清单 + `+ 添加任务` 输入。
- 修复 `link-hover` 派发：把当前实际 source path（默认 `app.workspace.getActiveFile()?.path ?? ""`）透传进 `renderWikilink` / `renderInlineMarkdown`，替换硬编码 `"peingxious-dashboard"`。
- 不动 Page Preview 的设置/开启逻辑，不动 wikilink 右键 file-menu（那个用户没意见）。

## Impact

- 受影响文件：
  - [src/renderer.ts](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/renderer.ts) — `renderWikilink` 签名加 `sourcePath`；`renderInlineMarkdown` / `renderInlineToken` 透传；`renderTodoPlusBody` 增加 lazy auto-create
  - [src/view.ts](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/view.ts) — 调用 `renderInlineMarkdown` / `renderWikilink` 的所有点把 source path 传进去；`embedded` / `sidebar` 三套回调都要同步
  - [src/sidebar-view.ts](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/sidebar-view.ts) — 同步
- 兼容：所有改动是"加可选参数"，老调用点不传 source path 时默认走 `app.workspace.getActiveFile()?.path ?? ""`，与现状无破坏
- 行为变化：hover 浮窗现在真的会显示（更接近编辑器原生行为）；TodoPlus 老卡片自动自愈

## ADDED Requirements

### Requirement: 1.1 TodoPlus 渲染时 lazy auto-create
`renderTodoPlusBody` 在解析失败时，先尝试自愈，再走错误态：

- `await resolveTodoPlusSlice(app, sourceLink)` 返回 null
- 400ms 重试也返回 null
- **新分支**：调 `ensureTodoPlusHeading(app, file, heading)`，然后**重新** `await resolveTodoPlusSlice` 一次
- 这次如果成功：继续走空清单 + `+ 添加任务` 渲染（与正常流程一致）
- 还是失败：才显示 "无法定位来源" 错误

#### Scenario: 老卡片打开时自愈
- **GIVEN** TodoPlus 卡片 `[[121#To-do]]`，`121.md` 当前**没有** `## To-do` 标题
- **WHEN** 仪表盘渲染该卡片
- **THEN** 解析失败 → auto-create → 重新解析成功 → 渲染空清单 + 添加任务输入
- **AND** `121.md` 末尾出现 `## To-do`，前后各 1 换行（与 v1.4.4 一致）

#### Scenario: 源文件不存在
- **GIVEN** 源文件路径 `nonexistent.md` 实际不存在
- **WHEN** 渲染时尝试自愈
- **THEN** `ensureTodoPlusHeading` 找不到 `TFile` 提前 return false
- **AND** 卡片显示原错误态（不抛错）

### Requirement: 1.2 渲染时自愈期间显示过渡态
为避免自愈过程中用户连点，第一次失败后到自愈完成前显示 `正在准备 To-do 区块…` 提示，**不**弹错误。

### Requirement: 2.1 修复 hover source path
`renderWikilink` 派发 `link-hover` 时，第 5 参数改为实际 source path：

- `renderWikilink` 签名加可选 `sourcePath?: string`
- 内部 hover 派发用 `sourcePath ?? app.workspace.getActiveFile()?.path ?? ""`
- `renderInlineMarkdown` / `renderInlineToken` 同步加可选 `sourcePath`，透传到 `renderWikilink` 调用
- **所有** `renderInlineMarkdown` / `renderWikilink` 调用点（`renderColumnTitle` / `renderCard` 标题 / `renderTaskBody` / `renderMemoViewContent` / `renderProjectItem` / `renderTodoPlusItem`）统一传 `sourcePath`
- view.ts 三个 `createCallbacks` / `createEmbeddedCallbacks` / sidebar 回调都从 `plugin.dashboardFile` 或 `app.workspace.getActiveFile()?.path` 取 source path 传进去

#### Scenario: 卡片正文双链 hover
- **GIVEN** 测试卡片 body 含 `[[未命名 1]]`
- **WHEN** 鼠标悬停 200ms
- **THEN** 派发 `link-hover` 第 5 参数 = 当前仪表盘文件路径
- **AND** Obsidian Page Preview 弹出"未命名 1"预览
- **AND** 用户在 Page Preview 设置为 "Ctrl/Cmd + hover" 时，仅响应带修饰键的悬浮（由 Page Preview 自身处理）

#### Scenario: 嵌入式仪表盘
- **GIVEN** 当前激活的是 embedded 模式（dashboard 是嵌入在另一个 markdown 里）
- **WHEN** 悬停双链
- **THEN** source path = 宿主 markdown 文件路径
- **AND** Page Preview 按宿主文件解析链接上下文

### Requirement: 2.2 保留右键 file-menu
hover 修复**不**影响右键 `contextmenu` 行为：右键仍走 `file-menu` 派发（沿用现有 `getActiveFile()?.path ?? ""` source path 逻辑）。

## MODIFIED Requirements

无

## REMOVED Requirements

无
