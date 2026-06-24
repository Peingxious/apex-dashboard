# Dashboard R5 修复 Spec

## Why

R3（`dashboard-r3-fixes-2026-06-24`）实施后，用户报回两个仍未解决的根因问题：

1. **TodoPlus 源文件没被改写** — 用户新建 TodoPlus 卡片后，源笔记里**没有**出现 `## To-do` 二级标题。根因：`ensureTodoPlusHeading` 用 `app.metadataCache.getFileCache(file)` 判定"标题是否存在"。在以下两种实际场景里，缓存会让函数提前 return `true`、跳过 `vault.process`：
   - 用户在 Obsidian 中**手动删过** `## To-do` 区块（缓存尚未被外部修改事件刷新或解析时机错位）
   - 用户**新建空白笔记**后立刻加 TodoPlus 卡片（缓存里没有 headings 列表，但 `getFileCache` 返回 undefined，被当作"没标题"，理应走写路径——这条理论上 OK，但当 heading 之前存在过、之后用户从源码删掉，缓存残留仍是命中）
   - **更隐蔽的根因**：`vault.process` 的 callback 在某些时机下被同步执行，文件已经写、但 `metadataCache.on('changed')` 还没回填到下一次 `getFileCache` 查询。下一个 `ensureTodoPlusHeading` 看到旧 headings，认为已存在，跳过写。
2. **hover 预览只显示"块的名字"** — 用户 hover 卡片内 wikilink 时，Obsidian Page Preview 弹窗只显示 wikilink 的**展示文本**（`noteName > fragment`，即"块名"），不是源文件对应区块的实际内容。根因：当前 hover dispatch 用的 source path 是 `app.workspace.getActiveFile()?.path ?? ""`。当用户**没有把 dashboard view 设为活动 leaf**（比如右侧栏 + 主区打开了别的 markdown）时，`getActiveFile()` 返回的是另一份文件。Page Preview 把 `[[121#To-do]]` 相对那份"错的源文件"去解析，结果找不到 → 退化成只显示 wikilink 文字。

## What Changes

- `ensureTodoPlusHeading`（renderer.ts）改为**直接读源文件内容**判定"是否已存在 `## <heading>`"，不再依赖 `metadataCache.getFileCache`。
  - 用 `app.vault.cachedRead(file)` 读内容
  - 用一个**与 metadataCache 相同的 heading 解析规则**扫描（`^(#{1,6})\s+(.+?)\s*$` 多行匹配）
  - 命中则 return `true`（幂等，不重写）
  - 未命中则用 `vault.process` 追加 `## <heading>\n`
- `renderDashboard`（renderer.ts）新增 `sourcePath?: string` 参数，从 view 层透传到所有 `renderInlineMarkdown` / `renderWikilink` 调用。
- `DashboardView.render`（view.ts）传 `this.sync.getFile()?.path` 作为 source path。
- `DashboardView.render` 在 embedded 模式下传 `this.embeddedNotePath` 作为 source path。
- `SidebarView.render`（sidebar-view.ts）传对应 host 文件 path（主面板用 `plugin.sync` 的 getFile()，overlay 用 `this.overlayNotePath`）。
- hover dispatch（renderer.ts）保留对 `sourcePath` 的优先级：explicit `sourcePath` > `getActiveFile()` > 空串。

## Impact

- 受影响文件：
  - [src/renderer.ts](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/renderer.ts) — `ensureTodoPlusHeading`、`renderDashboard` 签名 + 透传 `sourcePath`
  - [src/view.ts](file:///D:/BauduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/view.ts) — `render()` 调用点（main / embedded）
  - [src/sidebar-view.ts](file:///D:/BauduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/sidebar-view.ts) — `render()` / `renderOverlayMode()` 调用点
- 行为变化：源文件判定从"缓存"改为"实时读"，开销可忽略（一次 cachedRead）；hover 解析路径变正确。

## ADDED Requirements

### Requirement: 1.1 源文件标题判定改为实时读

`ensureTodoPlusHeading` 不再使用 `app.metadataCache.getFileCache(file).headings` 做"是否已存在"判定。改为：

1. 调用 `await app.vault.cachedRead(file)` 拿当前源文件内容
2. 用一个与 Obsidian metadataCache **相同语义**的 heading 扫描器：每行匹配 `^(#{1,6})[ \t]+(.+?)[ \t]*$`，记录 `{ level, heading }`
3. 判定 `exists = headings.some(h => h.level === 2 && h.heading === <targetHeading>)`
4. 若 exists：return `true`（不写文件）
5. 若不存在：用 `app.vault.process(file, content => <trimmed>\n## <heading>\n)` 追加
6. 写失败 catch：显示 `renderer.todoPlusWriteError` Notice，return `false`

> 注：cachedRead 不会触发磁盘 IO 风暴，Obsidian 内部已缓存。读到的字符串与磁盘同步（Obsidian 在 `vault.process` 完成后会刷缓存）。

#### Scenario: 用户手动删过 `## To-do` 再加 TodoPlus 卡片
- **GIVEN** 源笔记 `121.md` 当前正文（磁盘 + 缓存）**没有** `## To-do` 区块
- **WHEN** 用户在仪表盘 TodoPlus 列点 "+" 选 `121.md`
- **THEN** `ensureTodoPlusHeading` 读 `121.md` 实时内容，扫描 headings，命中数 = 0
- **AND** 调用 `vault.process` 追加 `## To-do\n`
- **AND** `121.md` 磁盘文件被改写

#### Scenario: 源文件已有 `## To-do`
- **GIVEN** 源笔记 `121.md` 已有 `## To-do` 区块
- **WHEN** 任意 `ensureTodoPlusHeading` 调用
- **THEN** 实时读 → 扫描命中 → 直接 return `true`，**不**写文件

### Requirement: 2.1 hover 用 dashboard host 文件作为 source path

`renderDashboard(container, data, callbacks, app, settings)` 新增第六个参数 `sourcePath?: string`。内部所有 `renderInlineMarkdown` / `renderWikilink` 调用都把这个 sourcePath 透传到底。**当 sourcePath 非空时，hover dispatch 优先用它**而非 `getActiveFile()`。

#### Scenario: 主 dashboard 视图（无 embedded tab）
- **GIVEN** `DashboardView.sync.getFile()?.path = "dashboard.md"`
- **WHEN** 渲染
- **THEN** `renderDashboard` 的 `sourcePath` 参数 = `"dashboard.md"`
- **AND** 卡片内所有 wikilink 的 hover 都用 `"dashboard.md"` 作为解析 source

#### Scenario: Embedded tab 激活
- **GIVEN** `DashboardView.embeddedNotePath = "notes/测试.md"`
- **WHEN** 渲染
- **THEN** `renderDashboard` 的 `sourcePath` 参数 = `"notes/测试.md"`
- **AND** 卡片内所有 wikilink 的 hover 都用 `"notes/测试.md"` 作为解析 source

#### Scenario: Sidebar 主面板
- **GIVEN** `SidebarView` 渲染主 dashboard 面板
- **WHEN** 渲染
- **THEN** sourcePath = `plugin.sync.getFile()?.path`（与主 view 一致）

#### Scenario: Sidebar overlay 模式
- **GIVEN** `SidebarView.overlayNotePath = "daily/2026-06-24.md"`
- **WHEN** 渲染 overlay
- **THEN** sourcePath = `"daily/2026-06-24.md"`

### Requirement: 2.2 hover dispatch 优先级

`renderWikilink`（renderer.ts）中的 hover 200ms 定时器回调里，source path 解析顺序：

1. 显式传入的 `sourcePath` 参数（**最高优先级**，view 层已传 dashboard host file path）
2. 兜底 `app.workspace.getActiveFile()?.path`
3. 兜底 `""`（vault root）

显式 sourcePath **永远** 覆盖 `getActiveFile()`。避免用户在主区打开别的 markdown 时 hover 退化。

#### Scenario: 用户主区打开 "测试.md"，右侧 dashboard 视图
- **GIVEN** Dashboard 卡片内有 wikilink `[[121#To-do]]`
- **GIVEN** DashboardView 把 `sourcePath = "dashboard.md"` 传给 renderer
- **WHEN** 用户 hover 该 wikilink
- **THEN** Page Preview 收到 linkText=`"121#To-do"`、source=`"dashboard.md"`
- **AND** Page Preview 在 `"dashboard.md"` 同目录（或 vault 根）下找 `121.md`，正常显示其 `## To-do` 区块内容

## MODIFIED Requirements

无

## REMOVED Requirements

无
