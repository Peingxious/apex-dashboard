# Dashboard R3 修复 Spec

## Why

第二轮 `dashboard-hover-todoplus-fixes-2026-06-24` 实施后，用户报回三个 UX 问题：

1. **"转化为笔记" 写错内容**：当前把 `card.body` 当正文写入新文件，导致转换后的笔记出现无序列表子项（"备忘"、"1212"）。用户希望新文件正文就一行 `[[备忘]]`（标题作为双链），保留为「存根」式骨架，**不**带 body / blockquote。
2. **TodoPlus 源文件没标识**：自动追加的 `## To-do` 下面完全空白，打开 `121.md` 看不出来这是被仪表盘镜像的区块。用户希望在源文件里直接有可识别的内容（注释 / 起始任务），让"这是 todoplus 镜像"一眼可见。
3. **卡片 hover 阻碍内部双链 hover**：`.dashboard-card:hover` 改 `box-shadow` + `background`，`.dashboard-memo-view:hover` 改 border-color。这些视觉变化触发浏览器重绘，可能让双链的 `mouseout` 提前 fire、清掉 200ms hover 定时器，Page Preview 浮窗不出。先把卡片 hover 视觉去掉，验证 wikilink hover 是否恢复。

## What Changes

- `onMemoConvertToNote`（view.ts / sidebar-view.ts / embedded 三处）：文件正文改为固定 `[[<cleanTitle>]]` 单行，**不**写 body / blockquote；frontmatter 留空。
- `ensureTodoPlusHeading`（renderer.ts）：在 `## <heading>` 之后**追加**一行 HTML 注释 `<!-- Dashboard TodoPlus mirror: tasks below are mirrored to a dashboard card. -->`，让源文件可识别。
- `styles.css`：移除/弱化卡片 hover 视觉
  - `.dashboard-card:hover` 去掉 box-shadow 和 background 变更
  - `.dashboard-memo-view:hover` 去掉 border-color 变更
  - 主题里相关的 hover 也同步去掉

## Impact

- 受影响文件：
  - [src/view.ts](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/view.ts) — `createCallbacks.onMemoConvertToNote`（同时改 embedded / sidebar 同名回调）
  - [src/sidebar-view.ts](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/sidebar-view.ts) — `createOverlayCallbacks.onMemoConvertToNote`
  - [src/renderer.ts](file:///D:/BauduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/renderer.ts) — `ensureTodoPlusHeading` 追加注释行
  - [styles.css](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/styles.css) — 去掉 hover 视觉
  - [src/i18n.ts](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/i18n.ts) — 新增 `memo.convertBody` 模板
- 兼容：所有现有 Memo 卡片的「转化为笔记」行为变化是预期内的；老 todo 镜像文件已是空区块，注释是新增行不影响阅读
- 行为变化：转换后内容简化、源文件可读性提升、卡片无视觉 hover 反馈

## ADDED Requirements

### Requirement: 1.1 Memo 转笔记只写标题双链
`onMemoConvertToNote` 三处实现（`createCallbacks` / `createEmbeddedCallbacks` / sidebar `createOverlayCallbacks`）统一改为：

- 文件名清洗逻辑保留（去掉 `[[` `]]`、路径分隔符、非法字符）
- 目标路径仍用 `app.fileManager.getAvailablePathForAttachment(basename + ".md", "md")` 拿不冲突路径
- **文件正文** = 固定 `[[<basename>]]` 单行（保留换行），**不**写 body、**不**写 blockquote
- `frontmatter` 不写
- 成功 Notice、失败 Notice 保持
- 原 Memo 卡片保持不变

#### Scenario: 标题为「备忘」的 Memo 转笔记
- **GIVEN** Memo 卡片 title = "备忘"，body = "1212"，blockquote = 空
- **WHEN** 用户右键 Memo → "转化为笔记"
- **THEN** 新文件 `备忘.md`（如存在则 `备忘 1.md`）正文为单行 `[[备忘]]`
- **AND** 不出现 "1212" 这种无序列表
- **AND** Notice "已创建 备忘.md"

#### Scenario: 标题本身是双链
- **GIVEN** Memo 卡片 title = `[[某笔记]]`（前端已 strip `[[` `]]`）
- **WHEN** 转化
- **THEN** 文件名 = `某笔记.md`，正文 = `[[某笔记]]`

### Requirement: 2.1 TodoPlus 源文件追加标识注释
`ensureTodoPlusHeading(app, file, heading)` 写入末尾的内容改为：

```
## <heading>
<!-- Dashboard TodoPlus mirror: tasks below are mirrored to a dashboard card. -->
```

- 旧实现只写 `## <heading>\n`（空块），导致源文件看不出被镜像
- 新实现在标题下追加一行 HTML 注释（Obsidian 会渲染为不可见注释）
- 注释文本用 i18n key `renderer.todoPlusMirrorNote`（en + zh）

#### Scenario: 源文件无 ## To-do
- **GIVEN** 源笔记 `121.md` 没有 `## To-do`
- **WHEN** 仪表盘渲染 / 添加 TodoPlus 卡片
- **THEN** 文件末尾追加：
  ```
  
  ## To-do
  <!-- Dashboard TodoPlus mirror: tasks below are mirrored to a dashboard card. -->
  ```
- **AND** 源文件在 Obsidian 编辑器里看到 `## To-do` 下面有一行灰色注释，可识别

#### Scenario: 源文件已有 ## To-do
- **GIVEN** 已有 `## To-do` 块
- **WHEN** 调用 `ensureTodoPlusHeading`
- **THEN** 不修改文件（包括不追加注释）

### Requirement: 3.1 去除卡片 hover 视觉
[styles.css](file:///D:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/styles.css) 中：

- 删 `.dashboard-card:hover`（line 5732-5735）的 box-shadow + background 变更
- 删 `.dashboard-memo-view:hover`（line 6118-6120）的 border-color 变更
- 同步删各主题（aurora / prism / island / haze / blossom / matcha / lilac）下 `.dashboard-card:hover` 样式
- 保留：resize handle hover、按钮 hover、card-actions 显示、drag visual 等

#### Scenario: 鼠标悬停卡片
- **WHEN** 鼠标悬停任意卡片
- **THEN** 卡片**不**发生 box-shadow / background / border 变化
- **AND** wikilink hover 200ms 后能正常弹出 Page Preview 浮窗（不再被卡片 hover 重绘打断）

#### Scenario: 按钮 / resize handle 仍可交互
- **WHEN** 鼠标悬停 edit / delete 按钮
- **THEN** 按钮自身仍 hover 高亮（未触碰）
- **WHEN** 鼠标悬停 resize handle
- **THEN** handle 仍变色（未触碰）

## MODIFIED Requirements

无

## REMOVED Requirements

无
