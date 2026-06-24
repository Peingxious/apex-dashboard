# Tasks

- [x] Task 1: 行内 markdown 渲染（对应 3.1）
  - [x] SubTask 1.1: 在 [src/renderer.ts](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/renderer.ts) 新增 `renderInlineMarkdown(container, text, app)`：解析 `[[wikilink]]`、`[[link|alias]]`、`[[link#frag]]`、`[text](url)`、`**bold**`、`*italic*` / `_italic_`、`` `code` ``、`==highlight==`、`~~strike~~`；逐个生成对应 span/a/code
  - [x] SubTask 1.2: 把 `renderMemoViewContent`（renderer.ts:4019-4043）中 `renderTextWithLinks` 替换为 `renderInlineMarkdown`；blockquote 行保留为 `.dashboard-note-quote`
  - [x] SubTask 1.3: 把 `renderTextWithLinks` 在 Todo 任务 / TodoPlus 任务 / 项目条目 / 卡片标题的所有调用点改为 `renderInlineMarkdown`
  - [x] SubTask 1.4: 验证：在 dashboard 中输入 `**加粗**`、`` `code` ``、`[[笔记]]` 的 Memo，正文应显示对应样式

- [x] Task 2: Wikilink hover Page Preview 回归（对应 1.1）
  - [x] SubTask 2.1: 检查 [src/renderer.ts:renderWikilink](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/renderer.ts#L5300) 的 `mouseover` → `link-hover` 派发逻辑：确保 `^block-ref` 跳过、所有 wikilink 都被挂上监听
  - [x] SubTask 2.2: 把 `renderInlineMarkdown` 内部对 wikilink 的渲染统一调用 `renderWikilink`（避免重复实现），确保新支持的行内格式里 wikilink 仍支持 hover

- [x] Task 3: TodoPlus 自动追加 `## To-do` 标题（对应 2.1）
  - [x] SubTask 3.1: 在 [src/sync.ts](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/sync.ts) 新增 `ensureTodoPlusHeading(app, file): Promise<boolean>`：读 cache，若无 `level===2 && heading==="To-do"`，走 `vault.process` 在文件末尾追加 `\n## To-do\n`，返回是否变更
  - [x] SubTask 3.2: 在 view.ts 的 `addTodoPlusCardFromNote` 流程（搜索现有实现位置）调用 `ensureTodoPlusHeading` 后再 push 卡片
  - [x] SubTask 3.3: 嵌入式模式 `createEmbeddedCallbacks.onCardAdd` 的 todoplus 分支同样调用 `ensureTodoPlusHeading`
  - [x] SubTask 3.4: 验证：选一个没有 `## To-do` 的笔记作为源，源文件应自动出现该标题块，且镜像卡片能渲染出（空）清单

- [x] Task 4: 设置项 — Open 文件夹根（对应 4.1 / 4.2）
  - [x] SubTask 4.1: 在 [src/types.ts](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/types.ts) `DashboardSettings` 增加 `openFolders: string[]` 和 `openIncludeSubfolders: boolean`，`DEFAULT_SETTINGS` 设为 `[]` 和 `true`
  - [x] SubTask 4.2: 在 [src/settings.ts](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/settings.ts) 增两个 UI 控件（文本输入用逗号分隔多个文件夹根；toggle 控件"包含子文件夹"）
  - [x] SubTask 4.3: 修改 [src/dashboard-view/column-file-picker.ts](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/dashboard-view/column-file-picker.ts) 的扫描逻辑：先用 `openFolders` + `openIncludeSubfolders` 过滤，再走原有 `excludedNotePaths` 排除，再做 `columns:` frontmatter 检测
  - [x] SubTask 4.4: 验证：分别测试"未配置"、"单文件夹+不含子"、"多文件夹+含子"三种情况

- [x] Task 5: Memo 右键"转化为笔记"（对应 5.1）
  - [x] SubTask 5.1: 在 [src/renderer.ts](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/renderer.ts) 的 `renderCard` 中，给 Memo 卡片 header 注册 `contextmenu` 事件：构建 `Menu`，加入"转化为笔记"项
  - [x] SubTask 5.2: 在 view.ts 的 `createCallbacks` 新增 `onMemoConvertToNote(card): Promise<void>`：用 `path.basename(sanitizeTitle(card.title))` 作为文件名；通过 `app.fileManager.getAvailableFilenameForAttachment(basename + ".md")` 拿到不冲突路径；`vault.create(path, body)` 写入（body = card.body + 换行 + > prefix blockquote）；成功后 `new Notice(t("memo.converted", { path }))`
  - [x] SubTask 5.3: i18n 增 `memo.convertToNote`、`memo.converted`、`memo.convertError` 三个 key（en + zh）
  - [x] SubTask 5.4: 验证：右键 Memo → "转化为笔记"，新文件出现在 vault 默认位置，原 Memo 卡片保留

# Task Dependencies

- Task 1 不依赖其它任务
- Task 2 依赖 Task 1（1.4 的 `renderWikilink` 调用需要先抽出共用函数）
- Task 3 独立
- Task 4 独立
- Task 5 独立
