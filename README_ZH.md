# Peingxious Dashboard

> Obsidian 一页纸工作台。一个页面，搞定一切。随手记灵感、管理待办、追踪项目 — 而且好看得不像实力派。

## 截图预览

![Peingxious Dashboard](screenshot1.png)

## 功能特色

### 🗒️ Memo（备忘）

内置便签式 Memo 卡片，每张卡片都有可编辑文本区域，随时记录灵感、会议笔记或每日反思，无需离开仪表盘。支持 `[[双链]]` 渲染为可点击链接，轻松关联笔记。

### ✅ Todo（待办）

交互式任务清单，支持添加、拖拽排序、勾选完成。底部进度条以百分比实时显示完成进度。待办项同样支持 `[[双链]]`，方便交叉引用。

卡片右上角有"隐藏已完成任务"小眼睛按钮（仅本次会话生效，不会写回笔记）。从 1.4.6 起，分区头新增"归档已完成卡片"按钮，开启后整张任务全部勾选完的卡片会自动隐藏；新建 Todo / TodoPlus 分区默认开启，可在分区头一键切换。

### 📁 Projects（项目）

将 Vault 文档组织为项目卡片。每张卡片可关联多篇笔记，支持封面图片（支持本地 Vault 图片和网络图片链接）和内联文档搜索，快速添加文件。支持管理多种文件类型，包括 Markdown 笔记、PDF、图片、音频和视频。

### 📝 Notes（笔记）

紧凑的列表式分区，用于整理参考文档和快捷访问文件。每行最多显示 5 张卡片，无封面图片，最大化信息密度。

### 📚 Library（资料库）

数据库式分区，按 frontmatter 属性聚合 Vault 笔记。视图模式支持 Grid / List / Table / Kanban，可设置筛选、排序、分组依据，实时渲染符合条件的笔记。支持日期范围筛选、多值属性筛选，以及按视图模式定制属性显示列（仅 Table / List）。

### ⚡ 快捷操作

将常用快捷方式固定到侧边栏，支持两种操作类型：**文件**链接可打开任意文档，**命令**快捷方式可触发任意 Obsidian 命令。内置新建日记和新建笔记预设。

### 🎨 Banner（横幅）

可自定义的横幅区域，支持编辑引言和**单张**背景图片（本地 Vault 图片或网络图片链接，含 `?` / `&` / `#` / unicode 字符的 URL 如 `huaban.com/…` 也安全）。双击即可编辑。从 1.4.8 起 banner 简化为单图（轮播已移除）；从 1.4.10 起磁盘 YAML 由 `banner:\n  image:` 嵌套形式改为单行标量 `banner: "url"`。

### 🔄 拖拽排列

在分区之间拖拽卡片来重新组织工作空间，也可以在 Todo 卡片内拖拽任务项进行排序，还支持在 Projects/Notes 卡片之间拖拽文档链接。

### 🧩 自定义分区

创建分区时可选择 6 种内置类型 — **Memo**、**Todo**、**Projects**、**Notes**、**Library**、**TodoPlus** — 每种类型都有独立的布局和行为。自由组合，打造专属工作流。

### 🔗 TodoPlus（待办Plus）

一种分区类型：把另一篇笔记里 `## <二级标题>` 下的清单实时镜像到 Dashboard 上。把卡片指向 `[[dash002#To-do]]`，仪表盘就会从原笔记渲染最新清单——不存在第二份副本，永不漂移。从 1.4.1 起，**卡片 UI 与普通 Todo 卡片完全一致**（复选框列表、添加输入框、进度条、隐藏已完成眼按钮），且支持完整操作：勾选 / 添加 / 删除 / 编辑，全部通过 `vault.process` 写回原笔记对应行（只动一行，其他标题/段落完全不动）。1.4.3 起，分区中的 `+` 按钮唤起 vault 全局笔记搜索弹窗：选一条笔记，若原笔记里没有 `## To-do` 标题，插件会自动追加一个空标题块让你立即开始写任务。1.4.6 起，分区头的归档按钮（默认开启）会自动隐藏源清单已全部勾选完的 TodoPlus 卡片。

### 🕐 最近文档

侧边栏展示最近编辑的文件及相对时间，快速回到最近的工作。

### ⏰ 任务提醒

为任意任务设置提醒时间。点击任务旁的铃铛图标，弹出可视化日历选择器（支持翻月、点选日期、小时和分钟下拉）。提醒以 `⏰ YYYY-MM-DD HH:MM` 内联格式存储在 Markdown 中，可直接在笔记中查看和编辑。60 秒定时检查，任务到期时弹出 Obsidian Notice 通知；过期任务的铃铛图标变红并带脉冲动画。

### 🧬 笔记 → 仪表盘 一键转换

通过命令面板把任意 Markdown 笔记一键转换为仪表盘。插件扫描笔记的 `## H2` 标题（自动跳过自引用标题），写入文件 frontmatter 的 `columns:` 字段，然后打开对应笔记的仪表盘覆盖层。另有一条反向命令，可把仪表盘 frontmatter 移除、还原为普通笔记。

### 📑 嵌入笔记 Tab

把任意其他笔记以 tab 形式嵌入到主工作台中。被嵌入笔记的 `## H2` 标题会成为子 tab 内的列，方便在多个"已仪表盘化"的笔记之间来回切换。导航栏有专用的打开 / 关闭选择器（含路径排除过滤）。

### ↩️ 撤销（Ctrl/Cmd+Z）

在工作台中按 `Ctrl+Z`（macOS 为 `Cmd+Z`）即可恢复最近一次被删除的卡片、todo 任务、项目项或分区。最多保留 50 条删除记录。同一动作以「撤销最近一次删除」出现在命令面板中，当撤销栈为空时自动从面板中隐藏。

## 主题

Dashboard 自动跟随 Obsidian 原生主题色，完美适配所有社区主题的亮色和暗色模式，无需额外配置。同时内置样式预设选择器（Earth / Nordic / Aurora / Spring / Island / Tundra / Blossom / Haze / Ember / Jade / Matcha / Lilac / Eclipse），可锁定特定风格，或保持 Auto 自动跟随当前 Obsidian 主题。

## 命令面板

| 命令 ID                       | 名称                       | 默认快捷键           |
| ----------------------------- | -------------------------- | -------------------- |
| `open-dashboard`              | 打开工作台                 | —                    |
| `toggle-dashboard-sidebar`    | 切换工作台侧边栏           | —                    |
| `convert-note-to-dashboard`   | 将笔记转换为仪表盘         | —                    |
| `restore-note-from-dashboard` | 从仪表盘恢复笔记           | —                    |
| `embed-note-in-dashboard`     | 在工作台中嵌入笔记         | `Ctrl+Alt+D`         |
| （内置）                      | 撤销最近一次删除           | `Ctrl+Z` / `Cmd+Z`   |

## 设置选项

- **Dashboard 文件路径** — 自定义仪表盘数据文件的存放路径
- **样式预设** — 选择内置风格（Earth / Nordic / Aurora / Spring / Island / Tundra / Blossom / Haze / Ember / Jade / Matcha / Lilac / Eclipse），或保持 Auto 跟随 Obsidian 主题
- **语言** — 支持英文和中文界面
- **最近文档数量** — 控制侧边栏显示的最近文件数量
- **默认钉住侧边栏** — 打开工作台时，右侧边栏始终保持展开状态
- **隐藏项目嵌套文档** — 项目卡片中仅显示顶层文档，子文档隐藏但保留数据
- **Todo 默认隐藏已完成任务** _（默认：开）_ — 全局默认；卡片眼睛按钮可临时覆盖单卡片（仅会话内生效，不写入笔记）
- **Todo / TodoPlus 分区自动归档已完成卡片** _（默认：每分区开启）_ — 控制分区头的归档按钮；开启后整张卡片任务全部勾选完毕的卡片会从仪表盘隐藏
- **排除的笔记** — 在「打开」面板中隐藏的笔记名称或路径，逗号分隔（如 `dashboard, area/workbench`）。主工作台文件默认排除
- **侧边栏小组件** — 天气 / 热力图 / 番茄钟 / 阅读 / 倒计时 / 农历，可独立开关与配置
- **阅读设置** — 开关阅读追踪、是否启用会话完成音效

## 安装

### 从 Obsidian 社区插件市场安装

1. 打开 设置 > 第三方插件
2. 浏览并搜索 "Peingxious Dashboard"
3. 点击安装，然后启用

### 手动安装

1. 从 [GitHub Releases](https://github.com/pandorareads/peingxious-dashboard/releases) 下载最新版本
2. 解压到 Vault 的 `.obsidian/plugins/peingxious-dashboard/` 目录
3. 打开 设置 > 第三方插件，启用 "Peingxious Dashboard"

## 使用方法

1. 通过左侧功能区图标（主页图标）或命令面板打开：`Peingxious Dashboard: Open dashboard`
2. 首次使用会在 Vault 根目录自动创建 `dashboard.md` 文件
3. 所有更改直接保存到文件 — 纯文本格式，你的数据完全属于你

### 文件格式

Dashboard 使用缩进 bullet 列表格式组织数据：

```markdown
---
columns:
  - name: "Memo"
  - name: "Todo"
  - name: "Projects"
---

## Memo

- 2026-06-08 备忘
  - 欢迎使用 Peingxious Dashboard！点击此处编辑你的第一条备忘。

## Todo

- 待办清单
  - [ ] Review dashboard plugin code
  - [ ] Write documentation
  - due: 2025-05-20

## Projects

- Obsidian Dashboard
  - [[obsidian-dashboard/README.md]]
  - progress: 60
```

- `---` frontmatter 定义分区列（可附 `archiveCompleted: true|false` 等列级配置）
- `##` 标题定义分区正文
- 顶级 `-` 定义卡片标题
- 缩进的 `\t-` 定义卡片内容（文本、任务、元数据等）
- 任务使用 `- [ ]` / `- [x]` 格式
- 元数据使用 `key: value` 格式（如 `due:`、`progress:`、`link:`）

> **提示：** 每个分区标题右侧有垃圾桶按钮，可直接在 Dashboard 界面中删除分区。

## 更新日志

### 1.4.10 (2026-06-16)

- **banner frontmatter 简化为单行标量** — 写入由 `banner:\n  image: "url"` 嵌套形式改为 `banner: "url"`。文件更干净，行为不变：旧文件照常加载，URL 用 `"` 引号包裹以兼容 `?` / `&` / `#` / unicode（如 `huaban.com/…-lmNOvW`）等 YAML plain-string 容易出问题的字符
- **banner 只支持单图** — 多图 `images: []` 写入分支删除。`banner.images` 读取时仍保留兼容旧文件，但插件永远不会写出来。按用户要求："图片只能有一张，不是多张的"
- **切换分区类型不再破坏用户内容** — `migrateCardsForSectionType` 不再清空 `card.tasks`，而是把每条任务转为 body 行并保留原有 body。`todo → projects` 切换保留任务文本（按用户"去掉 [ ] 就可以了"的规则去掉复选框），`projects → todo` 切换从 body 重新构建 `card.tasks` 并保留 `- ` 前缀以便回环。数据在四种分区类型任意 (from × to) 切换中严格保留
- **Library 分区四种视图都支持右键文件菜单** — Grid、List、Kanban 卡片（含 Kanban 的"未分组"列）现在都会触发与 Table 视图"文件名"列同样的 `showFileContextMenu`：Open in new tab / pane / window、Copy `[[wikilink]]`、Copy Obsidian URL、Reveal in file explorer，以及任何 hook 了 `file-menu` 事件的第三方插件。Table 视图的监听器从 name 列上移到整行 `tr`，所以右键 frontmatter 值列（dblclick 触发的可编辑列）也会弹出菜单——`contextmenu` 和 `dblclick` 是不同鼠标动作，无冲突
- **测试** — `tests/migration.test.mjs`（8 个用例）、`tests/banner.test.mjs`（8 个用例）已加入 `tests/`

### 1.4.9 (2026-06-15)

- **BUG-003a · 切换分区类型时工作台同帧刷新** — 新增 [`SyncEngine.updateFrontmatterField()`](file:///d:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/sync.ts#L1543) + [`updateColumnsField()`](file:///d:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/sync.ts#L1605) 公开方法：走 `app.fileManager.processFrontMatter()` API 直接 mutate `columns:` 字段。`setColumnSectionType` / `setColumnArchiveCompleted` 改走**新路径**，调用前同步触发 `notifyCallbacks` → `view.requestRender(newData)`，**同帧**反映新类型。`view.ts:onColumnSectionTypeChange` callback 额外**强制**再 requestRender 一次（防御性：覆盖 RAF 合并可能吞掉请求的情况）。修复旧路径下用户需切走 tab 再切回才能看到新样式的体验
- **BUG-003b · banner 块条件输出，未操作不再写** — `parser.ts:serialize` 删除硬编码 `lines.push("banner:")`，改为**仅当** `data.banner.image` 非空时才输出 `banner:` 块。用户从未编辑过 banner → 文件**不含** `banner:` 字段；编辑过 banner（填 URL）→ 文件**保留** `banner:` 块；清空 banner（设 image 为 ""）→ 旧 banner 块会在下次保存时**自动从文件移除**（由 `serializeInto` → `patchYamlBlock` 的 null block 路径处理）。`parseBanner` 行为不变，向后兼容已有 `banner:` 块的老文件
- **BUG-003c · 默认只控制 columns，其它字段字节级不动** — 切换分区类型时**不再**整文件重写。banner / quickActions / extra frontmatter / YAML 注释 / 空行顺序**完全保留**。新路径只动 `columns:` 字段，其它字段 byte-identical。`writeToDisk` 整文件路径**保留**，供卡片增删改、banner 编辑、quickActions 增删等场景使用。写完后 `console.error` + `new Notice("Failed to save dashboard changes")` 兜底，错误不再静默

### 1.4.8 (2026-06-15)

- **BUG-001 · Banner 简化为单图，弹窗只有图片地址** — **删除** banner 编辑弹窗里的 "Rotation Images" 列表与 "Add Image" 按钮——banner 不再支持轮播。弹窗**只**保留一个图片地址输入框（vault 相对路径或完整 https URL）。`view.ts:setupBannerRotation` 整段删除，`images.length > 1` 不再覆盖主图。`parser.ts:serialize` 不再输出 `banner.images:` 块；`banner.images` 数据读时**忽略**（向后兼容旧文件）。补全 `i18n.ts` 缺失的 7 个 banner key（`banner.edit` / `banner.image` / `banner.imageDesc` / `banner.imagePlaceholder` / `banner.rotationImages` / `banner.addImage` / `banner.save`），弹窗 label / placeholder 正常显示
- **BUG-002 · 首次打开工作台不再注入默认分区** — 新增 `generateEmptyDashboardMarkdown()`（`parser.ts:600`）——输出**仅**含最小 frontmatter + `columns: []` 的骨架。`sync.ts:findOrCreateFile` 在新建文件时改用 `generateEmptyDashboardMarkdown()`（替代 `generateDefaultMarkdown()`）。`parser.ts:parseColumnDefs` 在 `columns:` 缺失时**返回 `[]`**，不再 fallback 到 `DEFAULT_COLUMNS`。`DEFAULT_COLUMNS` / `generateDefaultMarkdown` 保留并标记 `@deprecated`，仅供未来"插入示例数据"按钮使用。用户清空 `dashboard.md` 的 `columns:` 块后再打开 → 工作台**空**，文件**不被改回**

### 1.4.7 (2026-06-15)

- **文档同步** — README / README_ZH / versions.json 全面对齐 v1.4.0 → v1.4.6 changelog。1.4.1 之后发布的所有特性（TodoPlus 卡片 UI 与 Todo 对齐、+ 按钮唤起笔记搜索弹窗、分区级自动归档切换）都已在功能章节中详尽描述。**无任何代码变更**

### 1.4.6 (2026-06-14)

- **分区级"归档已完成卡片"按钮（Todo / TodoPlus）** — 取代 1.4.5 的"隐藏已完成任务"语义。开启（新建 / 已存在分区默认开）时，整张卡片任务全部勾选完的卡片会从仪表盘隐藏；关闭时全部显示。新按钮采用 `archive` / `archive-restore` lucide 图标。分区 frontmatter 字段重命名为 `archiveCompleted: true|false`（替换 `hideCompleted`；1.4.5 文件下次保存时自动迁移）
- **空分区占位** — 当分区内所有卡片都已归档时，显示一行淡色 `「所有卡片都已归档…」` 提示，避免误以为分区空了
- **TodoPlus 归档判定实时读取源笔记** — 通过现有 `resolveTodoPlusSlice` 辅助函数解析源文件标题块，归档决策反映源笔记的实时状态，而非陈旧的镜像
- **移除 1.4.5 的分区级"隐藏已完成任务"覆盖逻辑** — 单卡片眼按钮（仅会话内、仅内存）是唯一的项级过滤器

### 1.4.5 (2026-06-14)

- **分区级"显示 / 隐藏全部已完成任务"开关（Todo / TodoPlus）** — 分区头的眼睛按钮，写入列的 frontmatter `hideCompleted: true|false`，跨刷新保留。解析优先级（最具体优先）：`card.hideCompleted`（仅会话）→ `column.hideCompleted`（本次新增）→ `settings.defaultHideCompleted`（全局）。第三次点击分区眼按钮会写入 `undefined`（自动从文件删除该行）
- **修复 TodoPlus 添加项切片漂移** — 之前每次新增任务时由于切片末尾空行未去除，文件会逐次向右偏移一个空行；新增前先倒序去除尾部空行，新行紧贴上一行
- **修复 TodoPlus 首次自动追加标题的多余空行** — 当所选源笔记还没有 `## To-do` 标题时，新追加的标题块现在紧贴正文（仅一个 `\n` 分隔）
- **"新增分区"下拉把 `Todo` 紧邻 `TodoPlus`** — 顺序由 `Notes / Todo / Memo / Library / Todoplus` 调整为 `Notes / Todo / Todoplus / Memo / Library`

### 1.4.4 (2026-06-14)

- **修复 TodoPlus 新建卡片标题双重 `[[ ]]` 包裹** — `addTodoPlusCardFromNote` 现直接使用 `file.basename`（TFile 的 `.basename` 已经是去除 `.md` 后的），新卡片标题 `[[dash03#To-do]]` 不再是四层括号。卡片标题现在与单卡解析器 `getTodoPlusSourceLinkFromTitle` 的契约一致
- **从"新增分区"选择器移除 `笔记 (无封面)`** — 它是 `Notes` 的遗留别名，无独立图标 / 样式。已存在的 `notes` 分区照常解析 / 渲染 / 序列化，仅"新建"入口消失
- **清理无用 `pathToWikiLink` 导入和 `typeNotesPlain` i18n 键**

### 1.4.3 (2026-06-14)

- **TodoPlus 分区 `+` 按钮改为笔记搜索弹窗** — 替代原本的内联 wikilink 输入框（要求手输 `dash002#To-do` / `[[dash002#To-do]]` / `dash002` 等字符串并校验）。新流程：点击 `+` → 弹出 `DocSearchModal`（与 Project 共用，子串过滤，最多 20 条，键入实时刷新）→ 选中一条笔记 → 弹窗关闭 → 新增一张 `[[note#To-do]]` 镜像卡。若所选笔记里还没有 `## To-do` 标题，插件通过 `vault.process` 自动追加一个

### 1.4.2 (2026-06-14)

- **移除 TodoPlus 卡片上的冗余元数据** — 卡片正文现仅一行 `- [[dash002#To-do]]` 加缩进的元数据（cover / width / size / grid）。1.4.0 / 1.4.1 写入的 `type: todoplus` 与 `sourceLink: "[[...]]"` 行不再写盘（分区 frontmatter 的 `sectionType: todoplus` 和卡片标题的 wikilink 分别是这两者的唯一真实来源）
- **删除 `DashboardCard.sourceLink` 字段** — 渲染器通过新辅助函数 `getTodoPlusSourceLinkFromTitle(card)` 从卡片标题读取源链接
- **`onCardAdd` 选项 shape 变更** — `options.sourceLink` 改为 `options.title`。TodoPlus 分区调用方直接传入 wikilink 形式的标题 `[[note#heading]]`

### 1.4.1 (2026-06-14)

- **TodoPlus 卡片 UI 与操作完全对齐普通 Todo 卡片** — 1.4.0 的"Source: [[…]]"头与"## 标题"提示行全部移除；卡片 DOM 复用 `dashboard-task-list` / `dashboard-task-item` / `dashboard-task-add` / `dashboard-progress`，肉眼上与普通 Todo 卡片完全一致。卡片右上角的隐藏已完成眼按钮在 TodoPlus 卡片上同样生效
- **三个新 `vault.process` 写回辅助函数** — `addTodoPlusItem` / `removeTodoPlusItem` / `editTodoPlusItem`，分别处理新增 / 删除 / 文本编辑；都只动 `## <heading>` 切片内的字节
- **卡片 `title` 自动设置为 wikilink** — 新建或修改源链接时，卡片首条 bullet 的标题自动写为 `[[note#heading]]`，与 sourceLink 保持一致

### 1.4.0 (2026-06-14)

- **新增分区类型：TodoPlus（待办Plus）** — 把另一篇笔记里 `## <二级标题>` 下的清单实时镜像到 Dashboard 上。卡片指向 `[[dash002#To-do]]`，仪表盘就渲染该原笔记的清单
- **双向同步** — 勾选复选框通过 `vault.process` 改写原笔记对应行（只动一行）
- **完全使用 Obsidian 原生 API 读取** — 仅依赖 `metadataCache.getFirstLinkpathDest` + `metadataCache.getFileCache(file).headings` + `vault.cachedRead`，无新持久化层
- **分区类型下拉 / 新增分区选择器均加入 `待办Plus`** — `list-checks` 图标
- **Wikilink 作为标题** — 源链接渲染为可点击的 `[[note#heading]]`

### 1.3.0 (2026-06-13)

- **新增全局设置：Todo 默认隐藏已完成任务** — 设置面板新增开关（默认开启）。卡片右上角的眼按钮仍可作为快速"显示/隐藏"切换，但该切换仅在本次会话内生效，不再写入工作台笔记
- **`hideCompleted: true` 不再写入工作台笔记** — 该字段仅在渲染时由全局设置和内存中的卡片标志共同决定

### 1.2.0 (2026-06-13)

- **重命名：Apex Dashboard → Peingxious Dashboard** — 插件 ID（`peingxious-dashboard`）、显示名、作者、描述全部更新。npm 包名变更为 `peingxious-dashboard`。内部类名、视图类型、`localStorage` 键、`peingxious-dashboard-template` YAML 标记、`[peingxious-dashboard]` 日志 tag 全部跟随新命名
- **作者变更为 Peingxious** — `manifest.json` `author` 字段现为 `Peingxious`
- **重写插件描述** — 新文案反映扩展后的功能面并贴合新品牌

### 1.1.17 (2026-06-12)

- **文件下拉框不再出现固定高度的空白背景** — 改为内容驱动，单条结果时只占约 52px
- **输入 `【【`（全角双括号）也能触发下拉框** — ASCII 和全角都会触发；pick 时保留用户输入的那种括号风格
- **选中文件时保留 `[[` 之前已输入的前导文字** — 只替换 `[[…` 片段
- **wikilink 上下文纯逻辑单测** — 27 个场景，运行方式：`npm test`

### 1.1.14 (2026-06-12)

- **项目项 wikilink：原生 Page Preview 在普通 hover 触发；卡片标题不启用** — Page Preview 是唯一 hover 行为，200ms 延迟，不再需要 Ctrl/Cmd
- **撤销 1.1.12「分区标题尾号拆成 #N 角标」改动** — 分区名是用户可见的标签，完整渲染到 `<h3>` 文本节点

### 1.1.13 (2026-06-12)

- **项目项 wikilink 支持 Ctrl/Cmd+悬浮原生文件预览** — 手动派发 workspace 级别的 `link-hover` 事件

### 1.1.11 (2026-06-12)

- **File-suggest：输入时无预选 + 高亮回归克制** — 软底色 + 1px 内嵌边线

### 1.1.10 (2026-06-12)

- **修复：File-suggest 下拉 ↑/↓ 导航时高亮不可见** — 紫渐变 + 3px 浅紫左边框 + 加粗

### 1.1.9 (2026-06-12)

- **修复：File-suggest 下拉不再按 Enter 就自动选中第一项** — 未先用 ↑/↓ 导航直接回车则输入框文字保持不变

### 1.1.8 (2026-06-12)

- **工作台支持 Ctrl/Cmd+Z 撤销** — 恢复最近一次被删除的卡片、todo 任务、项目项或分区
- **命令面板入口** — "撤销最近一次删除"，绑定 Ctrl/Cmd+Z；栈空时自动隐藏

### 1.1.7 (2026-06-12)

- **统一行内删除交互** — todo 任务与 project/笔记项的删除按钮统一为同一个红色小 X 胶囊
- **点击即删** — todo 任务、project 项、卡片头部的 X 按钮都是点击直接删除，不再弹二次确认

### 1.1.6 (2026-06-12)

- **Library 列表视图 — 胶囊元数据行** — 属性值以圆角胶囊样式内联显示，紧邻每行末尾的时间值

### 1.1.5 (2026-06-12)

- **Library 表格/列表视图 — 显示属性** — 用户可按需勾选要展示的属性字段。仅在表格/列表视图模式显示
- **看板视图专属设置保持隔离** — "分组依据"section 继续仅在看板模式显示

### 1.1.3 (2026-06-12)

- **移动端小组件栏重构** — 改为 Banner 下方可折叠横条
- **主题自适应标签颜色**
- **更宽的标签按钮**
- **更新小组件图标** — 番茄钟沙漏、农历月亮
- **自定义对话框** — 用 Obsidian 风格的自定义弹窗替代原生浏览器对话框
- **样式优化** — 多处视觉打磨和一致性修复

### 1.1.2 (2026-06-12)

- **Obsidian 插件审核修复** — 回应官方 Obsidian 插件审核流程的反馈
- **MIT 许可证** — 许可证从 ISC 更改为 MIT

### 1.1.1 (2026-06-12)

- **Library 配置持久化** — 修复关键 Bug：数据库分区的配置在重启 Obsidian 后丢失
- **网格位置持久化** — 修复网格定位值（gcol/grow）从未被保存到 dashboard 文件的问题
- **写入竞态修复** — 修复快速连续更新时文件监视器可能用旧数据覆盖新数据的竞态条件

### 1.1.0 (2026-06-12)

- **阅读追踪小组件** — 侧边栏完整阅读会话管理
- **图书卡片** — 封面、标题、作者、阅读进度条、今日阅读时长
- **编辑图书信息** — 悬停显示编辑 / 移除按钮
- **阅读统计** — 总时长、今日阅读、图书数、连续天数、周 / 月 / 年统计、最近会话记录

## 许可证

0BSD
