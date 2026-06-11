# Apex Dashboard 开发计划（Plan）

> 目标与范围以 [Target.md](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/Target.md) 为准。

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

---

## 当前状态概览

| 维度         | 状态                                       |
| ------------ | ------------------------------------------ |
| **版本**     | 1.1.4                                      |
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
