# Dashboard UX 修复与改进 Spec

## Why

Peingxious Dashboard 插件当前有 5 个交互/显示问题影响日常使用：

1. 内部 wikilink 的「悬浮预览」不稳定，需要恢复与原生编辑器一致的 hover 行为。
2. TodoPlus 分区在「+ 添加」时，如果源笔记还没有 `## To-do` 标题块，目前不能保证自动追加，导致镜像卡片报"无法定位来源"。
3. 卡片正文在内部显示成纯文本（`[[wikilink]]`、`**粗体**`、`` `code` `` 都以字面量呈现），而右侧 Obsidian 编辑器渲染样式齐全，两者不一致。
4. 工作台顶部 `+ Open` 按钮的下拉只会列全 vault 的 .md 文件，体积一大就找不到目标；需要在设置里限定"扫描根目录"和"是否包含子文件夹"。
5. Memo 卡片缺少一个"快速沉淀为长笔记"的动作——用户希望右键就能把整张 Memo 转到 vault 默认位置的一个新 .md，标题用卡片标题。

## What Changes

- 维护/校验 wikilink 的 hover-Page-Preview 行为（已有 `link-hover` 派发，补一次回归）
- TodoPlus 添加卡片后强制确保源文件含 `## To-do` 块；`addTodoPlusItem` 与解析前都做一次兜底
- 在 Memo / Project / Note 卡片正文中渲染行内 markdown（wikilink、粗体、斜体、行内代码），保留 `[[…]]` 双向链接
- 设置面板新增"Open 文件夹根"和"包含子文件夹"开关，`+ Open` 下拉按此范围过滤
- Memo 卡片增加右键菜单项"转化为笔记"，调用 Obsidian 默认新建文件位置写入新文件

## Impact

- 受影响的代码：
  - [src/renderer.ts](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/renderer.ts) — 渲染 hover、行内 markdown、Memo 右键
  - [src/view.ts](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/view.ts) — Memo 右键菜单回调、设置项影响渲染
  - [src/sync.ts](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/sync.ts) — TodoPlus 写入兜底
  - [src/settings.ts](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/settings.ts) — 新增两个设置 UI
  - [src/types.ts](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/types.ts) — `DEFAULT_SETTINGS` 加两个新字段
  - [src/dashboard-view/column-file-picker.ts](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/dashboard-view/column-file-picker.ts) — 过滤文件
  - [src/i18n.ts](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/i18n.ts) — 新增 key
- 兼容：所有 `DEFAULT_SETTINGS` 新字段都有 `undefined` 兜底分支，老数据加载不会报错
- 无破坏性改动

## ADDED Requirements

### Requirement: 1.1 Wikilink hover Page Preview
仪表盘内渲染的 wikilink 元素（含 Memo 正文、项目条目、Todo 任务文本、列标题、卡片标题）必须支持**与 Obsidian 编辑器完全一致**的 hover 行为：
- 鼠标悬浮 200ms 后触发 Page Preview 浮窗
- 在 Settings → Page Preview 设为 "Ctrl/Cmd + hover" 时，仅响应带修饰键的悬浮
- 块引用（`^block-ref`）不触发浮窗
- 失效的 wikilink 也走原生 hover 逻辑（不弹窗但行为一致）

#### Scenario: 普通 wikilink 悬浮
- **WHEN** 鼠标悬停 `[[某笔记]]` 元素 200ms
- **THEN** workspace 收到 `link-hover` 事件，Obsidian Page Preview 弹出对应笔记预览
- **AND** 鼠标移出后浮窗关闭

#### Scenario: 块引用不弹窗
- **WHEN** 鼠标悬停 `[[某笔记#^block-id]]`
- **THEN** 不触发 Page Preview

### Requirement: 2.1 TodoPlus 自动追加 `## To-do` 标题
在 TodoPlus 分区「+ 添加」流程中：
- 通过 `DocSearchModal` 选定一条笔记后，**先**检查该笔记的 `metadataCache` 是否含 `level === 2 && heading === "To-do"`
- 若无，立即在笔记末尾追加一个独立的 `## To-do` 标题块（前后各 1 个空行，紧贴正文），然后再走原"添加卡片"流程
- 追加动作必须走 `vault.process` 以便 Undo

#### Scenario: 源笔记无 To-do 标题
- **WHEN** 用户在 TodoPlus 分区点 `+`，笔记搜索弹窗选了一个没有 `## To-do` 的笔记
- **THEN** 该笔记末尾追加 `## To-do`（前后各一个空行）
- **AND** 新 TodoPlus 卡片 `[[note#To-do]]` 正确解析并显示源清单

#### Scenario: 源笔记已有 To-do 标题
- **WHEN** 用户选了一个已有 `## To-do` 的笔记
- **THEN** 不修改源文件，直接添加镜像卡片

### Requirement: 3.1 卡片正文行内 markdown 渲染
Memo 卡片正文、项目卡片条目、Todo 任务文本、Note 卡片正文应当按以下规则渲染：
- `[[wikilink]]` 与 `[[link|alias]]` 渲染为原生内链，hover 行为遵循 1.1
- `**bold**` / `*italic*` / `` `code` `` 渲染为对应的行内样式
- 多行文本保留换行（`\n` 渲染为 `<br>` 或独立段落）
- 块级元素（标题、列表项符号）保持字面量，不展开为新的 DOM 结构
- 已有 `blockquote` 仍以引用样式显示

#### Scenario: Memo 卡片含 wikilink 与 code
- **WHEN** Memo 文本为 "参考 [[Obsidian]] 用 `MarkdownRenderer` 渲染"
- **THEN** 视图区显示三个独立 span：`参考 ` + 内链"Obsidian" + ` 用 ` + 行内代码 chip"MarkdownRenderer"

#### Scenario: Todo 任务文本含粗体
- **WHEN** 任务文本为 "**重要** 实现 hover"
- **THEN** 任务项显示"重要 实现 hover"，其中"重要"加粗

### Requirement: 4.1 设置项：Open 文件夹根
设置面板新增两个字段：
- **`openFolders`**：字符串数组，每个元素是 vault 相对文件夹路径（如 `["Notes", "Projects/sub"]`），空数组 = 扫描整个 vault
- **`openIncludeSubfolders`**：布尔值，默认 `true`；仅当 `openFolders` 非空时生效

#### Scenario: 指定单一文件夹（不含子文件夹）
- **GIVEN** 设置 `openFolders = ["Notes"]`，`openIncludeSubfolders = false`
- **WHEN** 用户点击工作台顶部 `+ Open`
- **THEN** 下拉只列出 `Notes/` 下的 .md 文件（不含 `Notes/area/`）

#### Scenario: 多个文件夹根（含子文件夹）
- **GIVEN** 设置 `openFolders = ["Notes", "Projects"]`，`openIncludeSubfolders = true`
- **WHEN** 用户点击 `+ Open`
- **THEN** 下拉列出两个根下所有子层级的 .md 文件

#### Scenario: 未配置（空数组）
- **GIVEN** `openFolders = []`
- **WHEN** 用户点击 `+ Open`
- **THEN** 行为与现状一致：扫描整个 vault

### Requirement: 4.2 排除列表与新文件夹设置并存
`excludedNotePaths`（现有"排除的笔记"）继续生效，在 4.1 过滤之后再做一次排除。两者**不冲突**：先按文件夹根白名单，再按名称/路径黑名单。

### Requirement: 5.1 Memo 右键"转化为笔记"
Memo 卡片 header 添加右键菜单（不含 TodoPlus 卡片）：
- 菜单项："转化为笔记"（icon: `file-plus`）
- 触发后：
  1. 取卡片 `title` 作为新文件名（去掉 `.md` 后缀已存在时直接取 basename），做 YAML/路径非法字符清理
  2. 使用 `app.fileManager.getAvailableFilenameForAttachment` 或 `app.fileManager.createNewMarkdownFile` 拿到 Obsidian 默认新文件位置
  3. 写入文件：frontmatter 空（保留插件默认 yaml 不写），正文 = 卡片 `body` + 换行 + `> ` 前缀的 `blockquote`（如有）
  4. 提示 Notice：成功 / 失败
  5. 不删除原 Memo 卡片（用户可手动删）

#### Scenario: 成功转换
- **WHEN** 用户右键 Memo 卡片 → "转化为笔记"，标题为"颜色配置"
- **THEN** Obsidian 默认位置（通常是 vault 根）创建 `颜色配置.md`
- **AND** 文件正文与原 Memo body/blockquote 一致
- **AND** 弹出 Notice "已创建 颜色配置.md"
- **AND** 原 Memo 卡片保持不变

#### Scenario: 同名文件已存在
- **WHEN** 目标文件名在默认位置已存在
- **THEN** Obsidian 自动加序号（如 `颜色配置 1.md`），不覆盖

## MODIFIED Requirements

无

## REMOVED Requirements

无
