# Checklist

## 3.1 卡片正文行内 markdown 渲染
- [x] Memo 视图区：`` `code` `` 渲染为 `<code>` chip 并应用 `.dashboard-inline-code` 样式
- [x] Memo 视图区：`**bold**` 渲染为 `<strong>`
- [x] Memo 视图区：`*italic*` / `_italic_` 渲染为 `<em>`
- [x] Memo 视图区：`==highlight==` 渲染为 `<mark>`（与 Obsidian 一致）
- [x] Memo 视图区：`~~strike~~` 渲染为 `<del>`
- [x] Todo / TodoPlus 任务文本支持以上行内格式
- [x] 项目卡片条目支持以上行内格式
- [x] 多行 Memo 保留换行（`<br>` 或分段）
- [x] blockquote 仍以 `.dashboard-note-quote` 显示
- [x] 嵌入式模式（embedded note dashboard）下同样生效

## 1.1 Wikilink hover Page Preview
- [x] 任意 wikilink 元素都注册了 `mouseover` / `mouseleave` 监听
- [x] 200ms 后派发 `link-hover` 事件（沿用现有节奏）
- [x] `^block-ref` 不触发 hover
- [x] 在原生 Page Preview 设置为 "Ctrl/Cmd + hover" 时，仅响应带修饰键的悬浮（由 Page Preview 核心按用户设置自行过滤，插件派发 `link-hover` 即可）
- [x] 失效的 wikilink 行为一致（不抛错）

## 2.1 TodoPlus 自动追加 `## To-do`
- [x] 添加卡片前先调 `ensureTodoPlusHeading`
- [x] 无 `## To-do` 时，文件末尾追加 `\n## To-do\n`（与 v1.4.4 一致：紧贴正文，标题独占一行）
- [x] 已有 `## To-do` 时不重复追加
- [x] 走 `vault.process` 支持 Undo
- [x] 嵌入式模式同样生效

## 4.1 / 4.2 Open 文件夹根
- [x] 设置 UI：文本框接受逗号分隔的文件夹根（如 `Notes, Projects`）
- [x] 设置 UI：toggle 控件"包含子文件夹"（默认开）
- [x] `+ Open` 下拉按 `openFolders` 过滤
- [x] `openIncludeSubfolders=false` 时严格匹配直接子层
- [x] `openFolders=[]` 时回退到全 vault 扫描
- [x] `excludedNotePaths` 仍生效（在 4.1 过滤后再排除）
- [x] 列文件检测（`columns:` frontmatter）继续工作

## 5.1 Memo 右键"转化为笔记"
- [x] Memo 卡片 header 注册 `contextmenu` 监听
- [x] 右键菜单仅含一项："转化为笔记"（`file-plus` 图标）
- [x] 标题清理：去除 `[[`、`]]`、`.md`、路径分隔符等
- [x] 用 `app.fileManager.getAvailablePathForAttachment` 拿到不冲突路径（Obsidian 实际 API）
- [x] 新文件正文 = card.body + `\n` + `> ` 前缀的 blockquote
- [x] 成功 Notice，失败 Notice
- [x] 原 Memo 卡片保持不变（不删除）
- [x] TodoPlus 卡片不出现此菜单项
