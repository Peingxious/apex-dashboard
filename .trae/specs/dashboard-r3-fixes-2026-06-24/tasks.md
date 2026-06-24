# Tasks

- [x] Task 1: Memo 转笔记只写标题双链（对应 1.1）
  - [x] SubTask 1.1: 在 [src/view.ts:createCallbacks.onMemoConvertToNote](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/view.ts#L2370) 把 body 写入逻辑删掉，文件正文 = `[[<basename>]]\n`
  - [x] SubTask 1.2: 同样改 `createEmbeddedCallbacks.onMemoConvertToNote`（src/view.ts 中 embedded 分支）
  - [x] SubTask 1.3: 同样改 [src/sidebar-view.ts:createOverlayCallbacks.onMemoConvertToNote](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/sidebar-view.ts)
  - [x] SubTask 1.4: 验证：右键 Memo "转化为笔记" → 新文件正文就一行 `[[<title>]]`，无 body / blockquote

- [x] Task 2: TodoPlus 源文件追加标识注释（对应 2.1）
  - [x] SubTask 2.1: 在 [src/renderer.ts:ensureTodoPlusHeading](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/renderer.ts#L5118) 的 `vault.process` callback 里追加注释行
  - [x] SubTask 2.2: [src/i18n.ts](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/i18n.ts) 新增 `renderer.todoPlusMirrorNote` 键
  - [x] SubTask 2.3: 验证：删 `121.md` 的 `## To-do`，再打开仪表盘 → 文件末尾出现 `## To-do` 标题 + 一行 HTML 注释

- [x] Task 3: 去除卡片 hover 视觉（对应 3.1）
  - [x] SubTask 3.1: 在 [styles.css](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/styles.css) 删 `.dashboard-card:hover`（L5732-5735）整段
  - [x] SubTask 3.2: 删 `.dashboard-memo-view:hover`（L6118-6120）整段
  - [x] SubTask 3.3: 删各主题下 `.dashboard-card:hover` 块：aurora / prism / island / haze / blossom / matcha / lilac + 移动端
  - [x] SubTask 3.4: 保留：resize handle hover / 按钮 hover / card-actions 显示规则
  - [x] SubTask 3.5: 验证：hover 卡片无 box-shadow / background / border 变化；hover 卡片内 wikilink 200ms 后 Page Preview 浮窗正常弹出

# Task Dependencies

- Task 1 独立
- Task 2 独立
- Task 3 独立
