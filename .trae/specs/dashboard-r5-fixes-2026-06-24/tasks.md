# Tasks

- [ ] Task 1: `ensureTodoPlusHeading` 改用实时读判定（对应 1.1）
  - [ ] SubTask 1.1: 在 [src/renderer.ts:ensureTodoPlusHeading](file:///D:/BauduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/renderer.ts#L5186) 把 `app.metadataCache.getFileCache(file).headings` 判定替换为 `await app.vault.cachedRead(file)` + 自写 heading 扫描器
  - [ ] SubTask 1.2: heading 扫描器：每行 `^(#{1,6})[ \t]+(.+?)[ \t]*$`，存 `{ level: number; heading: string }[]`
  - [ ] SubTask 1.3: 保留 `vault.process` 写路径（trim + 追加 `## <heading>\n`）与错误处理
  - [ ] SubTask 1.4: 验证：手动删 `121.md` 的 `## To-do` 区块 → 在仪表盘新建 TodoPlus → 文件**确实**被改写、新增 `## To-do`

- [ ] Task 2: `renderDashboard` 新增 `sourcePath` 参数并透传（对应 2.1 / 2.2）
  - [ ] SubTask 2.1: [src/renderer.ts:renderDashboard](file:///D:/BauduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/renderer.ts#L2664) 签名加第 6 个参数 `sourcePath?: string`
  - [ ] SubTask 2.2: 透传到 `renderSection` → `renderColumnTitle` / `renderTaskBody` / `renderMemoViewContent` / `renderTodoPlusBody` / `renderTodoPlusItem` / `renderProjectItemList` 等等
  - [ ] SubTask 2.3: [src/view.ts:render](file:///D:/BauduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/view.ts#L298) 调用点：主模式传 `this.sync.getFile()?.path`，embedded 模式传 `this.embeddedNotePath`
  - [ ] SubTask 2.4: [src/sidebar-view.ts](file:///D:/BauduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/sidebar-view.ts) 两个 `renderDashboard` 调用点：主面板传 `plugin.sync.getFile()?.path`，overlay 模式传 `this.overlayNotePath`
  - [ ] SubTask 2.5: 验证：主区打开 `测试.md`、右侧 dashboard → hover 卡片内 wikilink → Page Preview 显示源文件内容（不是 wikilink 文字）

# Task Dependencies

- Task 1 独立
- Task 2 独立
- 两者可并行
