# Tasks

- [x] Task 1: TodoPlus 渲染时 lazy auto-create（对应 1.1 / 1.2）
  - [x] SubTask 1.1: 在 [src/renderer.ts:renderTodoPlusBody](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/renderer.ts#L4375) 的两轮 `await resolveTodoPlusSlice` 之间插入 lazy auto-create
  - [x] SubTask 1.2: i18n 加 `renderer.todoPlusPreparing` 键（en: "Preparing {heading} block…" / zh: "正在准备 {heading} 区块…"）
  - [x] SubTask 1.3: 验证：删掉某张已存在 TodoPlus 卡片源文件的 `## To-do` 标题，重新打开仪表盘，文件自动恢复 `## To-do` 且卡片可用

- [x] Task 2: 修复 hover source path（对应 2.1 / 2.2）
  - [x] SubTask 2.1: 在 [src/renderer.ts:renderWikilink](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/renderer.ts#L5470) 签名加可选 `sourcePath?: string`，hover 派发用 `sourcePath ?? app.workspace.getActiveFile()?.path ?? ""`
  - [x] SubTask 2.2: `renderInlineMarkdown` / `renderInlineToken` 同步加 `sourcePath?`，透传到 `renderWikilink` 调用
  - [x] SubTask 2.3: 找全 `renderInlineMarkdown` / `renderWikilink` 调用点（renderer.ts + view.ts + sidebar-view.ts），全部统一传 `sourcePath`
  - [x] SubTask 2.4: view.ts 的 `createCallbacks` / `createEmbeddedCallbacks` / `createMainCallbacks`（sidebar）/ `createOverlayCallbacks` 内部用 `app.workspace.getActiveFile()?.path` 或 `plugin.dashboardFile` 作为 source path，传进所有 render 调用
  - [x] SubTask 2.5: 验证：在卡片正文里 hover `[[某笔记]]`，Obsidian Page Preview 浮窗出现

# Task Dependencies

- Task 1 独立
- Task 2 独立
