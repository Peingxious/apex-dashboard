# Apex Dashboard 开发计划（Plan）

> 目标与范围以 [Target.md](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/Target.md) 为准。

---

## ⚠️ 绝对禁止：nav-bar tab 双击/右键 "Open note" 的打开行为

**用户已明确禁止的违规方式（已犯过 3 次，绝对不能再犯）**：

| 违规方式                     | 代码                                               | 后果                                  | 状态 |
| ---------------------------- | -------------------------------------------------- | ------------------------------------- | ---- |
| ❌ 错误 #1：在当前 leaf 打开 | `app.workspace.openLinkText(path, "", false, ...)` | 挤掉 dashboard                        | 已犯 |
| ❌ 错误 #2：水平分屏         | `getLeaf("split", "horizontal")`                   | 不是"激活窗口"，会出现在奇怪位置      | 已犯 |
| ❌ 错误 #3：当前窗口的新 tab | `getLeaf("tab")`                                   | 用户原话："放屁，你还是在打开了新tab" | 已犯 |
| ❌ 错误 #4：垂直分屏         | `getLeaf("split", "vertical")`                     | 同 #2                                 | 禁止 |
| ❌ 错误 #5：新 Obsidian 窗口 | `getLeaf("window")` / `getLeaf(true)`              | 跳出独立窗口                          | 禁止 |

**✅ 唯一正确做法**（用户 2026-06-12 明确回复）：**"替换激活的 md 窗口"**

逻辑：

1. 遍历 `app.workspace.getLeavesOfType("markdown")`，找到**当前激活**的那个 md leaf
   - 通过对比 `leaf === app.workspace.activeLeaf`，或对比 `leaf.view.file?.path` 与 `app.workspace.activeEditor?.file?.path`
2. 在该 md leaf 上调用 `leaf.openFile(file, { active: true })` —— **替换里面的 md**
3. **绝不动 dashboard leaf**（保证 dblclick/右键/单击 tab 仍可用）
4. **绝不创建新 leaf**（无论 tab/split/window）

**fallback 规则**（如果找不到激活的 md leaf）：

- 找最近的一个 md leaf
- 如果一个 md leaf 都没有，就**什么也不做**（弹 Notice 提示）

**违规历史**（已修复，**仅作警示**）：

- 2026-06-12 v1.1.14 → 错误 #1 → 改成 #2 → 用户禁止 → 改成 #3 → 用户再次明确禁止（"放屁"）→ 修正为正确方式

---

## 新增 2026-06-12：表格/列表视图属性筛选显示 + 看板视图专属设置隔离

**背景**：当前 [library-section.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/library-section.ts) 的 `renderTableView` 会自动从前 20 条结果的 frontmatter 抓取最多 6 个 key 作为列，无法由用户控制；`renderListView` 只显示文件名 + 创建时间，无元数据扩展位。本次新增「属性筛选显示」功能，让用户能按需勾选要展示的属性字段。

### 方案

| 维度         | 改动                                                                                                                                                                                                                                                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **数据模型** | [types.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/types.ts) `LibraryConfig` 新增 `visibleProperties?: string[]`；未设置/空数组表示全量显示（向后兼容）                                                                                                                                                                 |
| **配置 UI**  | [library-config-modal.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/library-config-modal.ts) 在「视图模式」与「排序/分页」之间新增「显示属性」section：**仅当 `viewMode === 'table'` 或 `viewMode === 'list'` 时显示**，多选 checkbox 列表（基于 `extractFrontmatterProperties` 的全部 key + 内置 name/modified/created） |
| **看板专属** | 「分组依据」section 继续仅在 `viewMode === 'kanban'` 时显示（已有逻辑保持）                                                                                                                                                                                                                                                                                 |
| **表格渲染** | [library-section.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/library-section.ts) `renderTableView` 优先用 `config.visibleProperties` 决定列；未设置时降级为旧逻辑（filters + 前 20 条 frontmatter 自动收集）                                                                                                            |
| **列表渲染** | `renderListView` 在 name 与 date 之间插入属性 chip 行；只显示 `config.visibleProperties` 中勾选了的字段（数组为空则不显示任何 chip）                                                                                                                                                                                                                        |
| **持久化**   | [parser.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/parser.ts) `serialize` 增加 `visibleProperties: [a, b, c]` YAML 输出；`parseLibraryConfig` 反向解析回数组                                                                                                                                                           |
| **i18n**     | [i18n.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/i18n.ts) 新增 `library.visibleProperties` / `library.visiblePropertiesDesc` / `library.showAll` 中英文键                                                                                                                                                              |
| **样式**     | [styles.css](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/styles.css) 新增 `.dashboard-library-list-meta` / `.dashboard-library-list-meta-value` 样式（无 chip 边框，纯文本 + 末位时间）                                                                                                                                         |
| **版本**     | 1.1.5 → 1.1.6（patch：列表项 UI 调整）                                                                                                                                                                                                                                                                                                                      |
| **文档**     | README.md / README_ZH.md / CHANGELOG.md / Target.md 同步                                                                                                                                                                                                                                                                                                    |

### 子任务

- [x] types.ts: LibraryConfig 添加 `visibleProperties?: string[]`
- [x] parser.ts: serialize + parseLibraryConfig 双向支持
- [x] i18n.ts: 新增 3 个 key
- [x] library-config-modal.ts: 新增「显示属性」section（条件渲染 table/list）
- [x] library-section.ts: renderTableView 优先用 visibleProperties；renderListView 改为内联属性值 + 末位时间
- [x] styles.css: 列表项 meta 行 + 复选框列表样式
- [x] 同步 Target.md / README / README_ZH / CHANGELOG，版本 1.1.6
- [x] npm run build 验证通过

---

## 修复 2026-06-12：删除最后一个 project 项会恢复

**根因**：主工作台 body 写入在 [sync.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/sync.ts) 中使用了两种不同的格式：

- `addDocToCard` 写入 `- [[x]]`（带 `- ` 前缀）
- `reorderDocPaths` / `moveDocToCard` / `updateProjectDocs` / `removeProjectDoc` 写入 `[[x]]`（无 `- ` 前缀）

当用户执行过任何 reorder/drag/delete 操作后，主工作台 body 会变成无前缀格式，渲染的 titles[] 索引在 `removeProjectItem` 的 index-based 查找过程中可能与预期的 body 行不匹配（尤其在最后一个项被删除时），导致 `startIdx < 0` 静默 return，**删除不生效**，看起来"恢复"。

**修复**：

1. [sync.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/sync.ts) 全部 5 个写入 body 的函数统一为 `- [[x]]` 格式，并对输入做兼容（同时识别 `- [[x]]` 和 `[[x]]` 两种格式）
2. [sync.ts:removeProjectItem](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/sync.ts#L804) 增加可选 `itemPath` 参数，index 失败时回退到 wikilink 文本匹配
3. [view.ts:onProjectItemDelete](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/view.ts#L1806) 主工作台 callback 透传 `itemPath`
4. [view.ts:嵌入视图 onProjectItemDelete](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/view.ts#L1008) 同样支持 path 兜底，且 `projectDocs` splice 优先 path 匹配再 fallback index
5. [renderer.ts:TitleInfo](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/renderer.ts#L3567) 新增 `path` 字段，捕获原始 wikilink target；删除按钮把 `title.path` 作为兜底标识传入
6. [types.ts:onProjectItemDelete](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/types.ts#L318) 接口扩展接受可选 `itemPath`

## 修复 2026-06-12：删除最后一个 project item "删不掉 / 会恢复"

**根因**：[sync.ts:writeToDisk](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/sync.ts#L1102) 内部有一个**全局 size check**：

```ts
if (current.length > 0 && content.length < current.length * 0.3) {
  return; // 跳过写入
}
```

当主 dashboard 文件本身较小（无 banner image, 仅几百 ~ 几 KB），删除最后一个 project item 后 `content.length < current.length * 0.3` 命中，写盘被跳过：

1. `removeProjectItem` mutate `this.data.cards[i].body = ""`（in-memory 成功）
2. `notifyCallbacks()` 立即触发 → `view.render(data)` 用最新 in-memory data 重新渲染，**UI 上看 item 消失了**
3. 但 `writeQueue` 内 `vault.modify` 被 size check 跳过，**实际文件未更新**
4. 用户切换 tab / 重启 Obsidian → 重新 parse 文件 → 旧 item **"恢复"**
5. 用户尝试插入新项 → `addDocToCard` 在 mutate 后的空 body 上 append → 写盘 size check 仍不通过 → 文件仍是旧内容 → 旧 item + 新 item 都没正确落地

**修复**：

1. [sync.ts:writeToDisk](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/sync.ts#L1102) 把"全局 30% size check"替换为"**banner 段**长度对比"（[sync.ts:extractBannerSectionLength](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/sync.ts#L1207)）。当且仅当 banner image 段在新内容里被截断超过 50% 时才跳过写入
2. 这保留了原始保护（防止 banner dataURL 在 mutate 中被意外清空），同时允许用户的合法删除操作（body 缩小）正常落盘
3. 用户现在可以删除最后一个 item → 卡片变为空 project（body 留空）→ 文件正常写入 → 重新打开保持空状态

---

## 修复 2026-06-12（续）：最后一个 item 删除后"删不掉、添加新的才被覆盖"

**根因**（banner check 修复后暴露的第二层 bug）：

[sync.ts:removeProjectItem](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/sync.ts#L804) 之前**只更新 `body` 不更新 `projectDocs`**。流程：

1. 用户点 × → `removeProjectItem` 把 `card.body` 改空（或去掉对应行）
2. 内存 `card.projectDocs` 数组**没有同步删除**对应 entry
3. `writeToDisk` 写盘成功（banner check 放行）
4. **下一次渲染** 走 [renderer.ts:renderProjectBody](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/renderer.ts#L3503)：
   - `if (card.body)` → `body = ""` 为 falsy，**不进入 body 分支**
   - 进入 `else if (Array.isArray(projectDocObjects) && projectDocObjects.length > 0 ...)` 分支，从 `card.projectDocs` 重新合成 lines
   - `projectDocs` 没被清空 → **旧 item "复活"**
5. 用户后续添加新 item → 走 `addDocToCard` 改 body → 写盘时 `serialize` 优先用 mutate 后的 body → 旧 item 因为 projectDocs 仍存在但 body 缺失，**在 add 时才被覆盖**

**修复**：

1. [sync.ts:removeProjectItem](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/sync.ts#L804) 在 splice body 行后**同步**清理 `card.projectDocs`：先按 wikilink path 匹配删除，失败则按 `itemIndex` 删除，最后 normalize 回 `ProjectDocNode[]`
2. 嵌入视图的 [view.ts:onProjectItemDelete](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/view.ts#L1024) 已经有 `projectDocs` splice 逻辑（之前 path 匹配 + index 兜底）保持不动；其 path fallback 增加 leading-tab 剥离（defense-in-depth）以匹配 parseCard 可能带前导 tab 的 body 行
3. 验证：现在删除最后一个 project item → 内存 `body` 与 `projectDocs` 同步清空 → 渲染走 body 分支（`body = ""` falsy）走 `projectDocs` 分支但都空 → 不渲染任何 item → 文件写入空 body → 重新打开保持空状态

---

## 修复 2026-06-13：嵌入笔记内嵌视图拖拽失效 + 3 次重复渲染

**现象**（用户日志）：
- 在嵌入到笔记的 dashboard 视图中拖拽 project item，dragstart 触发、drop 事件目标正确（`SPAN class=dashboard-project-item-title`），但 callback 未被调用 → 拖拽"不工作"
- 同时 `[apex-dashboard] render start` 出现 3 次（navGen 23/24/25），每次都伴随一次 `renderViewNavBar`，渲染频繁

### 补充修复（第二轮）：onProjectItemReorder 触发 synthesizeProjectBodyFromDocs 时崩溃

**现象**（用户日志）：第一轮修复后拖拽本身可以工作了，但浏览器报

```
Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'path')
    at renderDoc (main.js:43371:24)
    at _DashboardView.synthesizeProjectBodyFromDocs (main.js:43380:7)
    at Object.onProjectItemReorder (main.js:43174:32)
```

**根因**：`onProjectItemReorder` 在 `splice(fromIndex, 1)` 越界或 `projectDocs` 已包含 `undefined` 元素时，会得到 `undefined` 并把它 `splice(toIndex, 0, undefined!)` 推进数组。随后 `synthesizeProjectBodyFromDocs` 遍历到 `undefined`，访问 `doc.path` 崩溃。

**修复**（[view.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/view.ts)）：
1. **`onProjectItemReorder` / `onProjectItemMoveToCard` / `onProjectDocsReorder` / `onDocMoveToCard`**：bounds check（`from < 0 || from >= length || to < 0 || to > length`）+ `if (!movedDoc) return` 守卫，splice 永远不注入 undefined
2. **`synthesizeProjectBodyFromDocs.renderDoc`**：`if (!doc || typeof doc !== "object") return` + `if (typeof d.path !== "string" || d.path.length === 0) return` + 外层 `if (doc == null) continue` —— 双重防御，脏数据也不会再崩
3. `synthesizeProjectBodyFromDocs` 的参数类型从 `ProjectDocNode[]` 改为内部用 `unknown` 解析，编译产物对 `unknown` 做窄化，避免 ts 编译阶段就拒绝非空项目

**根因**（两个独立 bug）：

### Bug A：drop handler 类名不匹配

[renderer.ts:417](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/renderer.ts#L417) `drop` handler 寻找 `.dashboard-project-item-list`，但 [renderer.ts:3327](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/renderer.ts#L3327) 实际创建的是 `.dashboard-project-list`。同样问题在 [renderer.ts:307](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/renderer.ts#L307) 的 `dragleave` 和 [renderer.ts:3350](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/renderer.ts#L3350) 的 card body `dragover`/`drop` 中也存在。

虽然该 bug 不会直接阻断「拖拽到具体 item 上」的场景（因为有 `closest(".dashboard-project-item")` 的分支在前面），但会**导致空 project 列表的 drop 检测失败**，并且 card body 区域的兜底 dragover/drop 排除逻辑错误。

**修复**：把 4 处 `.dashboard-project-item-list` 全部改为 `.dashboard-project-list`，与实际渲染的 class 对齐。

### Bug B：`saveEmbeddedAndRefresh` 写入触发 `modify` 事件 → `reloadEmbeddedFromDisk` 重渲染

[view.ts:saveEmbeddedAndRefresh](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/view.ts#L1554) 调用 `app.vault.modify(file, newContent)`，这会触发 vault `modify` 事件。事件监听器 [view.ts:2481](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/view.ts#L2481) 判定文件是当前 embedded note 后，会调用 `reloadEmbeddedFromDisk` 异步**重新解析文件并 render**。而 `saveEmbeddedAndRefresh` **自己**也调用 `this.render(currentData)`。

**结果**：每次 embedded mode 的 mutation（拖拽排序、编辑、添加/删除等）都会产生**两次 render**：
1. `saveEmbeddedAndRefresh` 末尾的 `render(currentData)`（基于内存 mutated 数据）
2. `modify` 事件 handler 异步触发的 `reloadEmbeddedFromDisk` → 读盘 → parse → render（基于文件内容）

第二次 render 与第一次**内容相同但时序错位**：
- 第一次 render 时 dragstart 已经设置了 `projectItemDragSource` / `taskItemCallbacks`，但正在 drag 中（drop 还没到）
- 第二次 render 把它们清零、DOM 重建 → **drop 时 callback 找不到正确的 dragSource**（或者 dragSource 已经被 clear 了）
- 这就是用户看到的"drop 触发但 callback 未被调用" 的根因

而用户日志中的 3 次 render = saveEmbeddedAndRefresh 自身 1 次 + modify 事件 1 次 + 不知来源的 1 次（怀疑是 modify 事件在 Obsidian 内部被同步触发了一次 + 我们自己又触发一次）。

**修复**（[view.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/view.ts)）：

1. 新增 `private isWritingEmbeddedFile = false` 标志位
2. `saveEmbeddedAndRefresh` 在 `await this.app.vault.modify(file, newContent)` **之前**设置 `isWritingEmbeddedFile = true`
3. 用 `setTimeout(() => { isWritingEmbeddedFile = false; }, 0)` 在 macrotask 上清零（覆盖 `modify` 事件触发的同步+异步 handler），同时不阻塞外部编辑的正常 reload
4. `modify` 事件 handler 在 `isWritingEmbeddedFile && file.path === this.embeddedNotePath` 时**提前 return**，不再调用 `reloadEmbeddedFromDisk`

**结果**：现在嵌入视图的 mutation 只会触发 1 次 render（saveEmbeddedAndRefresh 末尾的 render），`projectItemDragSource` 在 drop 触发时仍然有效，callback 能正常被调用。

**验证清单**：
- [x] 4 处类名 `.dashboard-project-item-list` → `.dashboard-project-list` 修复
- [x] `isWritingEmbeddedFile` flag + modify handler 短路修复
- [x] 移除 renderer 调试 console.log（保留问题修复逻辑）
- [x] `npm run build` 通过

---

## 新增 2026-06-12：分区标题尾数分离为角标（兼容旧列表）

**背景**：旧版本的工作台列表曾以**纯数字**作为分区名（例：`11`、`121`），本质是"列表编号"。新版本允许任意文本作为分区名后，旧的纯数字分区在标题里显得突兀。需要在保留原始 column.name（保证 sync / serialize 兼容）的前提下，把尾部的数字视觉上**抽离为角标**显示在标题之后。

**展示规则**（由 `splitTrailingNumber` 函数实现）：

| 原 column.name         | 标题文本         | 角标   |
| ---------------------- | ---------------- | ------ |
| `11`                   | （空）           | `#11`  |
| `121`                  | （空）           | `#121` |
| `Project 5`            | `Project`        | `#5`   |
| `闪念-2026-01月`       | `闪念-2026-01月` | （无） |
| `Project 5 `（尾空格） | `Project 5`      | （无） |

**关键约束**：

- **子列表（projectDocs 子项）不显示**这个角标。子项的 `+N` 徽章是子项自己的隐藏子项计数，与分区编号无关，必须严格隔离。
- 双击重命名时，输入框出现的是**完整 column.name**（含数字），用户可整体编辑；保存时若名称变化，走 `callbacks.onColumnRename`；取消时仅恢复 titleText 部分，badge 角标在下一轮 render 自动重新派生。
- 仅在标题 DOM 新增一个 `dashboard-section-number-badge` 元素，**不影响** `data-column` 属性、`onColumnRename` 传入的 currentName / newName 等下游逻辑。

### 子任务

- [x] renderer.ts: 新增 `splitTrailingNumber` 纯函数（含 JSDoc + 边界注释）
- [x] renderer.ts: 分区标题渲染改为 `splitTrailingNumber` 分离 + 角标 span
- [x] renderer.ts: 双击重命名输入框使用 `column.name` 完整值；取消时仅恢复 titleText
- [x] i18n.ts: 新增 `renderer.columnNumberBadge` 中英文
- [x] styles.css: 新增 `.dashboard-section-number-badge` 角标样式（克制的半透明底 + 1px 边线）
- [x] npm run build 验证通过

---

## 新增 2026-06-12：项目项 wikilink 支持 Ctrl/Cmd+悬浮原生文件预览

**背景**：工作台里的项目项通过自定义 DOM 渲染（`renderTextWithLinks` → 内部 span 带 `internal-link` class + `data-href` / `href`），**不走 markdown post-processor**。Obsidian 的 Page Preview 核心插件靠 post-processor 给 wikilink 挂 mouseover 监听，再派发 workspace 级别的 `link-hover` 事件触发悬浮面板。我们的自定义 DOM 没有任何监听，所以 Ctrl+悬浮什么都不出现。

**方案**：在 `renderWikilink` 中给生成的 span 主动挂上 mouseover 监听，命中 Ctrl/Cmd 后等 200ms 派发 `app.workspace.trigger("link-hover", mouseEvent, target, linkText, source)`。Page Preview 接到这个事件会接管，弹出与 markdown 视图里完全一样的悬浮面板（支持 fragment 跳转、embed 渲染、"在新面板中打开"等所有原生能力）。

**安全约束**：

- **200ms 延迟** — 防止鼠标快速划过整个列表时弹一堆面板
- **mouseleave / keydown 取消定时器** — 鼠标移走或松开 Ctrl/Cmd 即时撤销
- **`link.isConnected` 检查** — render 重新构建 DOM 时旧 link 已 detach，timer 触发时跳过派发，避免在已卸载节点上派发
- **`!ctrlKey && !metaKey` 早退** — 普通 hover 不触发（与原生行为一致）
- **`source: "apex-dashboard"`** — 给 Page Preview 一个可识别的 source 字符串，未来排查多插件派发时方便定位

### 子任务

- [x] renderer.ts: `renderWikilink` 添加 mouseover/keydown/mouseout 监听 + workspace.link-hover 派发
- [x] 同步 Target.md / CHANGELOG / README / README_ZH，版本 1.1.12 → 1.1.13
- [x] npm run build 验证通过

---

## 撤销 2026-06-12：分区标题「尾号拆成 #N 角标」改动

**背景**：1.1.12 引入了 `splitTrailingNumber` 把 `column.name` 拆成 `titleText` + `trailingNumber`，把数字部分画成角标 span。设计意图是兼容旧版纯数字分区名（`11` / `121`）。

**问题**：分区名是**用户可见的标签**（`library` / `Project 5` / `121` / `闪念-2026-01月`），不是 id。把 `121` 这种纯数字分区名拆成"空标题 + `#121` 角标"，`<h3 class="dashboard-section-title">` 文本节点是空的，只剩一个标签式角标，视觉上把「名字」变成「编号」——和「其他分区名以普通标题文本展示」语义不一致。

**修复**：

- `renderer.ts`：删除 `splitTrailingNumber` 函数，新增 `renderColumnTitle(titleEl, name)` 辅助函数（仅做 `titleEl.setText(name)`）；section 标题渲染处直接 `renderColumnTitle(titleEl, column.name)`
- `renderer.ts`：双击重命名取消路径改为 `renderColumnTitle(titleEl, currentName)`，不再调用 `splitTrailingNumber`
- `styles.css`：删除 `.dashboard-section-number-badge` 样式块
- `i18n.ts`：删除 `renderer.columnNumberBadge` 中英文键值
- `Plan.md` / `CHANGELOG.md` / `README.md` / `README_ZH.md` / `Target.md` 同步：版本 1.1.13 → 1.1.14

### 子任务

- [x] renderer.ts: 移除 `splitTrailingNumber` 函数，引入 `renderColumnTitle`
- [x] renderer.ts: section 标题 + 重命名取消路径用 `renderColumnTitle`
- [x] styles.css: 移除 `.dashboard-section-number-badge` 样式
- [x] i18n.ts: 移除 `renderer.columnNumberBadge` 中英文
- [x] 同步 Plan / CHANGELOG / README / README_ZH / Target，版本 1.1.13 → 1.1.14
- [x] npm run build 验证通过

---

## 1.1.14 增补：wikilink 原生 hover tooltip

**背景**：1.1.13 实现 `link-hover` 派发后，Ctrl/Cmd+hover 已经能调起 Obsidian 原生 Page Preview 弹窗（用户反馈"图2样式"）。但**普通 hover**（无修饰键）目前只显示空白，没有原生 tooltip——Obsidian 在编辑器里默认会给 wikilink 加一个 `title` 属性，鼠标悬浮时显示链接路径。

**修复**：

- `renderer.ts` 中 `renderWikilink` 创建的 span 增加 `title` 属性（带 fragment 时为 `path#fragment`，否则为 `path`）。普通 hover 由浏览器原生 tooltip 渲染，**Ctrl/Cmd+hover 仍走 `link-hover` 派发**给 Page Preview
- 注释明确「plain hover = native tooltip, Ctrl/Cmd+hover = Page Preview」的分工

### 子任务

- [x] renderer.ts: `renderWikilink` span 增加 `title` 属性
- [x] CHANGELOG 增补「Native hover tooltip on wikilink, Page Preview kept for Ctrl+hover」
- [x] npm run build 验证通过

---

## 1.1.14 修订：仅 project-item 启用 hover，卡片标题/任务/笔记不启用

**背景**：上一节添加的 `title` 属性 + Ctrl 限制是两个独立问题：

1. `title` 属性会在**卡片标题**（"To Read"）上同时显示一个浏览器原生 tooltip 标签——用户反馈"图1 下面那个 To Read 不要了"（即红色框里的卡片级 chip）
2. Ctrl+hover 才触发 Page Preview 跟用户在编辑器里的预期不符——Obsidian 默认是普通 hover 触发（Settings → Page Preview → Hover）

**问题**：

- `renderTextWithLinks` 是一处实现，**所有调用方**（卡片标题 / task 文本 / note 文本 / project-item 标题）都拿到 `title` 属性 + Ctrl 限制。卡片标题拿到 `title` 是副作用，违反"卡片标题就是普通文本"的语义

**修复**：

- `renderer.ts` 给 `renderTextWithLinks` 和 `renderWikilink` 加 `options: { enableHover?: boolean }` 参数（默认 `false`）
- 移除 `renderWikilink` 中我刚加的 `title` 属性——**所有 wikilink 都不再带浏览器原生 tooltip**
- 把 hover 派发逻辑（`mouseover` 200ms 延时 + `mouseout`/`keydown` 清理）包在 `if (options.enableHover)` 里
- 取消 `Ctrl/Cmd` 限制——**普通 hover 就派发 `link-hover`**，让 Page Preview 完全接管弹窗逻辑（与 Obsidian 编辑器内 wikilink 行为一致）
- 调用方：
  - project-item 标题 span：`renderTextWithLinks(titleSpan, title.cleanText, app, { enableHover: true })`（唯一启用项）
  - 卡片标题 / task 文本 / note 文本：不传 `options`，默认 `false`，**hover 它们不触发任何预览**

### 子任务

- [x] renderer.ts: `renderTextWithLinks` / `renderWikilink` 增加 `options.enableHover` 参数
- [x] renderer.ts: 移除 `renderWikilink` 中的 `title` 属性
- [x] renderer.ts: hover 派发逻辑包裹在 `if (options.enableHover)` 中
- [x] renderer.ts: project-item 标题 span 调用时传 `{ enableHover: true }`
- [x] CHANGELOG / README / README_ZH / Target 同步：1.1.14 hover 行为修订说明
- [x] npm run build 验证通过

---

## 1.1.18：下拉框高度 + 前导文本保留回归修复

**用户反馈**（2026-06-13，1.1.17 回归）：

1. **下拉框在只有 1 个匹配项时高度被压扁成 32px 一条**：上一个迭代把 `min-height` 全部清空，单匹配时容器仅 1 行高度，看着像被裁掉一半
2. **前导文本还是被替换掉**：在 `修复【【en3` 状态下选文件，memo / 任务里只剩文件名（甚至只有 `en3`），前面的「修复」+ 中文括号被丢掉

### 修复 1：下拉框最小可用高度（≈ 2 行）

- [src/file-suggest.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/file-suggest.ts) `positionDropdown`
  - 重新引入 `minH = min(96, maxH)`，把下拉框最小高度限制在「约 2 行 + 6px 内边距」左右
  - 上限仍然是 `maxH`（受可视区剩余空间约束），所以不会出现上版的「260px 固定空背景」

### 修复 2：前导文本在 pick 时丢失

- [src/file-suggest.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/file-suggest.ts) `replaceWikilinkFragment`
  - 签名改为 `(linkText) => string | null`，**直接返回** `next` 字符串，避免在 `input` 事件派发后再次读取 `input.value`（同步 `update()` 监听器可能把字段改回去）
- 同文件 `pick`
  - 改用 `const replaced = replaceWikilinkFragment(...)`，`onPick(replaced ?? input.value, file)`，确保任务 / 笔记消费者拿到的是「前导文字 + 完整 [[name]]」

### 验证

- [tests/wikilink-context.test.mjs](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/tests/wikilink-context.test.mjs)：27/27 通过（其中 4 个直接覆盖「前导文字保留」+「混合括号」场景）
- `npm run build`：tsc + esbuild 均通过，`main.js` 重新生成（2026-06-13 08:58）

---

## 1.1.16：分区名双链渲染 + 下拉框仅 `[[` 触发

**用户反馈**（2026-06-13）：

1. **分区名支持双链语法**：列名叫 `[[dash01]]` 时，应当像卡片标题 / 任务文本里的双链一样，渲染为真正的可点击链接（含原生 Page Preview 悬停）
2. **下拉框仅在 `[[` 触发**：现在所有接了 `attachFileSuggest` 的输入框，正常打字也会冒出下拉（输入 "review report" 也会弹），需要改成只有当 caret 处于未关闭的 `[[…` 上下文时才显示

### 修复 1：分区名 `[[…]]` 渲染为真正的双链

| 文件                                                                                                                                     | 改动                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [src/renderer.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/renderer.ts) `renderColumnTitle`           | 新增 `app: App` 参数；当 name 包含 `[[` 时调用现有的 `renderTextWithLinks`（已支持别名 / 片段），否则走 `setText` 快速路径            |
| 同上 `renderSection` 调用 `renderColumnTitle` 处                                                                                          | 传入 `app`；rename 取消分支的 `renderColumnTitle(titleEl, currentName, app)` 同样更新                                                |

底层机制沿用现有的 `renderWikilink`：`internal-link` class + `data-href` / `href` 属性 + `mouseover` 派发 `link-hover` 事件，让原生 Page Preview 接管。render / rename / 取消三条路径都走同一函数，行为完全一致。

### 修复 2：下拉框仅在 `[[` 上下文打开

| 文件                                                                                                                                       | 改动                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| [src/file-suggest.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/file-suggest.ts) `update`                | 改用新增的 `findWikilinkContext(value, caret)`：返回 `null` 时直接 `close()`；返回 `{ start, query }` 才打开 / 更新 dropdown |
| 同上 `filterFiles`                                                                                                                          | 空 query（刚输入 `[[` 时）改为返回前 20 个文件，让用户能看到可选列表；非空 query 行为不变                                    |
| 同上 新增 `findWikilinkContext` 私有函数                                                                                                    | 找最后一个 caret 之前的 `[[`；若有 `]]` 在 `[[` 和 caret 之间则返回 `null`；query 包含换行也返回 `null`；兼容 `[[[abc` 这种带前导 `[` 的情况 |
| 同上 新增 `replaceWikilinkFragment` 私有函数                                                                                                 | pick 时按 `ctx.start` 到 caret（含光标后已输入的 `]]`）整段替换为 `[[basename]]`；若光标后已有 `]]` 自动去掉避免 `[[path]]]`     |
| 同上 `pick`                                                                                                                                 | 改用 `replaceWikilinkFragment`；保留 `onPick` 回调（任务 / note 消费者仍能正确添加）                                         |

调用 `attachFileSuggest` 的三处（todo 任务添加 input / memo textarea / 项目笔记 input）自动同时获得新行为，无需逐处修改。

### 子任务

- [x] renderer.ts: `renderColumnTitle` 新增 `app: App` 参数，含 `[[` 走 `renderTextWithLinks`
- [x] renderer.ts: `renderSection` 内的两处 `renderColumnTitle` 调用更新签名
- [x] file-suggest.ts: `update` 改用 `findWikilinkContext` 判定开关
- [x] file-suggest.ts: `findWikilinkContext` / `replaceWikilinkFragment` 私有函数
- [x] file-suggest.ts: `pick` 改为替换 fragment
- [x] file-suggest.ts: `filterFiles` 空 query 返回前 20 个
- [x] 单元测试：11 个输入场景（plain text / 单 `[` / `[[` / `[[dash` / `[[dash]]` 末尾或中间 / 第二个 link / 别名 / 片段 / 换行 / 杂散 `[`）全部 PASS
- [x] npm run build 通过
- [x] 文档同步：CHANGELOG / Plan / Target 版本号 1.1.15 → 1.1.16

---

## 1.1.15：三个稳定性 / 视觉修复

**用户反馈**（2026-06-13）：

1. **多属性更新数据异常**：对 BannerData 等对象做多属性更新时，原有未更新的属性值会被 `Object.assign` / `{ ...target, ...updates }` 中的 `undefined` 清掉
2. **Markdown 编辑与仪表盘同步问题**：在 Obsidian 编辑器里修改 .md 文件后，embedded-mode 的工作台视图不能实时刷新，需要手动切换 tab / 重启
3. **下拉列表选项"2 面板"现象**：`attachFileSuggest` 选中的行被画成「半透明紫色背景 + 1px 内嵌 box-shadow 内边框」，两层叠在一起像 2 个面板

### 修复 1：BannerData 多属性更新不再清空未编辑字段

| 文件                                                                                                                             | 改动                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [src/banner.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/banner.ts)                           | `BannerEditModal.save` 不再无条件写 `images: undefined`；只有 `localImages.length > 0` 时才把 `images` 放进 updates 对象               |
| [src/view.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/view.ts) `openEmbeddedBannerEditModal` | 消费者不再用 `Object.assign(banner, updates)`；改为按 key 循环，仅当 `value !== undefined` 时才赋值（即标准"safe merge partial" 模式） |

### 修复 1b：保存时不再清空用户自有的 frontmatter 字段

**根因**：[src/parser.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/parser.ts) `serialize()` 只输出 6 个插件自有的顶层 key（`banner` / `quickActions` / `quickActionOrder` / `hiddenPresets` / `columns` / 旧式 `quickLinks`），其它 frontmatter 字段（`Type: dashboard` / `cssclass: ...` / `tags: [...]` / `aliases: [...]` 等）从未被 `parse()` 收进 `DashboardData`，因此下一次保存就静默丢失了。

**修复**：

- [src/types.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/types.ts) `DashboardData` 新增 `extraFrontmatter?: Record<string, unknown>` 字段
- [src/parser.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/parser.ts) 新增 `KNOWN_FRONTMATTER_KEYS` 集合；`parse()` 把不在该集合内的所有顶层 key 收进 `data.extraFrontmatter`
- `serialize()` 在 `---` 后、`banner:` 之前，用 `yaml.stringify` 把 `extraFrontmatter` 整块写回，保留嵌套结构和引号
- 用户自有的字段在 round-trip 后仍然存在，验证脚本（parse → mutate → serialize → re-parse）已 PASS：`Type: dashboard` + `tags: [dashboard, apex]` 都完整保留

### 修复 2：embedded 视图随 .md 编辑实时刷新

| 文件                                                                                                                        | 改动                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [src/view.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/view.ts) `registerVaultListeners` | `vault.on("modify")` 检测到 `file.path === this.embeddedNotePath` 时调用 `reloadEmbeddedFromDisk()`                                              |
| 同上                                                                                                                        | 新增私有方法 `reloadEmbeddedFromDisk()`：从 vault 读最新内容 → `parse()` 解析 → 更新 `embeddedData` 与 `embeddedDataCache` → `render()` 重新绘制 |

### 修复 3：下拉列表无"2 面板"

| 文件                                                                                                                        | 改动                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [src/file-suggest.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/file-suggest.ts) `render` | 选中行：移除 `inset 0 0 0 1px ...` 那个 1px 内边框；只保留 `rgba(99, 102, 241, 0.22)` 半透明背景。alpha 微微提高到 0.22 让选中更明显 |
| 同上                                                                                                                        | 未选中行：`box-shadow: "none"`，避免 1px transparent 阴影被某些主题画成亚像素发丝线                                                  |

### 子任务

- [x] banner.ts: `BannerEditModal.save` 条件性包含 `images` 字段
- [x] view.ts: `openEmbeddedBannerEditModal` 改为按 key 安全 merge
- [x] types.ts: `DashboardData` 新增 `extraFrontmatter` 字段
- [x] parser.ts: `KNOWN_FRONTMATTER_KEYS` 集合 + `parse()` 收集 extra keys
- [x] parser.ts: `serialize()` 用 `yaml.stringify` 把 extra 字段写回 frontmatter
- [x] view.ts: `registerVaultListeners` modify 路径在命中 `embeddedNotePath` 时调用 `reloadEmbeddedFromDisk`
- [x] view.ts: 新增 `reloadEmbeddedFromDisk` 私有方法
- [x] file-suggest.ts: 选中行移除 inset 1px box-shadow，非选中行 box-shadow="none"
- [x] CHANGELOG / Target / Plan 同步：版本 1.1.14 → 1.1.15
- [x] npm run build 验证通过
- [x] 编写 round-trip 脚本验证 `Type:` / `tags:` 字段被完整保留（已通过 PASS）

---

## 当前状态概览

| 维度         | 状态                                       |
| ------------ | ------------------------------------------ |
| **版本**     | 1.1.15                                     |
| **构建**     | ✅ `npm run build` 通过                    |
| **核心功能** | ✅ 四大卡片类型、侧边栏小组件、拖拽交互    |
| **国际化**   | ✅ 中英文支持                              |
| **主题**     | ✅ 自动适配 Obsidian 主题                  |
| **文档**     | ✅ README.md / README_ZH.md / CHANGELOG.md |

---

## Step 1（工程可构建）✅ 已完成

- [x] 修复 build 脚本参数错误（tsc 参数）
- [x] 补齐 tsconfig.json，使 tsc 有可编译入口
- [x] 调整 TS lib（DOM.Iterable）以支持 NodeList 迭代
- [x] 让 `npm run build` 通过（tsc + esbuild）

---

## Step 2（核心功能稳定）✅ 已完成

- [x] 修复文件建议输入（FileSuggest）作用域错误导致的运行时报错
- [x] 修复"标题转列"跳过自引用标题的逻辑，避免误伤其它标题
- [x] 移除 Parser/Renderer 中的调试 console.log，避免影响性能与控制台可用性
- [x] 文件格式改为缩进 bullet-list 格式（v1.1.4）
- [x] 主题系统简化，自动适配 Obsidian 原生主题

- [x] **修复 Bug A（移除 Memo 色板）**：[renderer.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/renderer.ts#L2873) 移除 Memo 卡片顶部的调色板按钮，色板仅保留给 Weather / Tracker 小工具使用
- [x] **修复 Bug B（排除主工作台文件）**：
  - [types.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/types.ts) 新增 `excludedNotePaths: string[]`，默认排除 `dashboard`
  - [settings.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/settings.ts) 新增设置项（逗号分隔），支持中英 i18n
  - [i18n.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/i18n.ts) 添加 `settings.excludedNotePaths / .excludedNotePathsDesc`
  - [view.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/view.ts#L443-L454) `showColumnFilePicker` 读取排除列表并在扫描时跳过
- [x] **修复 Bug C（筛选弹窗主题适配）**：[styles.css](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/styles.css#L10141-L10282) 替换所有硬编码颜色（`#fff`/`#1a1a1a`/`#ddd`/`#7c3aed` 等）为 Obsidian 主题变量；新增缺失的 `.dashboard-library-quickfilter-row`、`.quickfilter-label`、`.filter-popup-clear` 样式
- [x] **修复 Bug D（任务输入框增强 + Wiki 链接 Obsidian 预览）**：
  - [styles.css](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/styles.css#L5951-L5979) `.dashboard-task-input` 加上边框、圆角、hover/focus 视觉
  - [renderer.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/renderer.ts#L3840-L3847) Wiki 链接增加 `internal-link` class + `data-href`/`href` 属性，触发 Obsidian 原生 hover preview
- [x] **修复 Bug E（自动补全下拉框被裁切）**：
  - [file-suggest.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/file-suggest.ts#L45-L99) dropdown 强制 220-260px 高度、所有布局属性 inline style 强制（绕过任何 host-theme 重置）
  - [styles.css](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/styles.css#L2309-L2370) `.dashboard-file-suggest` 完全不透明 + 深色 box-shadow；`has-open-suggest` class 让 dashboard card 临时 `overflow: visible`
  - [file-suggest.ts:119](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/file-suggest.ts#L119) `open()` 时给祖先 `.dashboard-card` 加 `has-open-suggest`；`close()` 时移除
  - [file-suggest.ts:101](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/file-suggest.ts#L101) 每个 item 用 `<div role="option">` + 强制 `height: 40px`（避免 button 默认行高塌缩）
- [x] **修复 Bug F（嵌入视图项目卡片 Enter 无反应）**：
  - [renderer.ts:3486](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/renderer.ts#L3486) `renderProjectBody` 现在同时读 `card.body`（主工作台用）和 `card.projectDocs`（嵌入视图用），统一为 `lines` 数组渲染
  - 修复后嵌入视图（dash01.md）的项目卡片按 Enter 后，新添加的文件 suggestion 会立即显示在项目列表中

---

## Step 3（UI/Modal 补齐）✅ 已完成

- [x] 补齐 WidgetTypeModal：可选择 weather / tracker 小组件类型
- [x] 补齐 WeatherConfigModal：城市搜索（Open-Meteo geocode）+ 手动经纬度兜底
- [x] 补齐 ReminderNoticeModal：到期提醒（关闭/稍后提醒）
- [x] 补齐 FortuneStick（求签）基础数据与抽签逻辑，使农历组件入口可用
- [x] 卡片编辑弹窗（CardEditModal）完整实现
- [x] 自定义确认对话框替代浏览器原生 dialog

---

## Step 4（后续迭代清单）

### 高优先级

- [x] **修复 Bug 1**：[view.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/view.ts) `showColumnFilePicker` 改为以 `navBar` 为定位父元素（`position: absolute; top: 100%`），让「+ 打开」下拉框紧贴按钮显示，不再「下移」

- [x] **修复 Bug 2**：[styles.css](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/styles.css) `.dashboard-file-suggest` 补齐内部子元素样式、设置兜底 `background-color`、提高 `z-index` 到 9999，使 Todo/Project 输入框的内部文件自动补全下拉框能稳定显示

- [x] **修复 Bug 3**：
  - [types.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/types.ts) `RenderCallbacks` 新增 `onProjectItemDelete`
  - [renderer.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/renderer.ts) `renderProjectBody` 添加 hover 时显示的删除按钮
  - [view.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/view.ts) 嵌入视图回调中实现「删除第 N 个 top-level 项目」（含其缩进子项）
  - [sync.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/sync.ts) 新增 `removeProjectItem`，主 Dashboard 视图使用
  - [styles.css](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/styles.css) 新增 `.dashboard-project-item-delete` 样式

### 高优先级

- [ ] **节假日数据源**：接入稳定 API（如 Nager.Date）或本地缓存节假日数据
  - 当前：降级为空数据源，农历组件无法显示节假日信息
  - 建议：使用 Nager.Date API（免费，无需 key）

- [ ] **Workspace API 规范化**：替换兼容写法，减少 `unknown as`
  - 文件：[main.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/main.ts) 第 155-160 行
  - 当前：`getLeaf('tab')` / `getLeaf('tab', 'right')` 使用兼容写法
  - 建议：研究 Obsidian 1.x 标准 Workspace API

### 中优先级

- [ ] **错误处理增强**：关键异步流程补齐 Notice 反馈
  - 网络请求失败（天气 API、豆瓣搜索）
  - 文件解析失败（Markdown 格式错误）
  - 数据写入失败

- [ ] **性能优化**：大 Vault 扫描增加缓存与节流
  - 最近文档列表（Recent）缓存
  - 热力图数据查询节流
  - 文件搜索防抖

### 低优先级（可选）

- [ ] **单元测试覆盖**：补一组最小测试
  - parser/serialize 循环测试
  - frontmatter 注入/移除测试
  - 卡片 CRUD 操作测试

- [ ] **发布版本加密**：可选的混淆/加密功能
  - 参考 [obsidian-plugin-dev skill](references/LICENSE_PROTECTION.md)

---

## 迭代记录

### 2025-06-09 (v1.1.4)

- 主题系统简化，移除内置主题预设
- 文件格式从 `###` 标题改为缩进 bullet-list
- 新增删除分区按钮
- WikiLink 显示短名称（basename）
- 修复卡片编辑弹窗空白内容问题
- 修复缩进任务行解析问题

### 2025-05-29 (v1.1.1)

- 修复 Library 配置重启后丢失
- 修复卡片网格位置未保存
- 修复写操作竞态条件（lastWrittenHash 时序问题）

### 2025-05-25 (v1.0.8)

- 侧边栏小组件完整实现（天气/热力图/番茄钟/倒计时/农历）
- 城市搜索 geocoding 自动补全
