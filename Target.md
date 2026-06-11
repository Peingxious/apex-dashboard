# Apex Dashboard 插件目标（Target）

## 1. 插件一句话说明
在 Obsidian 中提供一个“工作台”视图，把一个 Markdown 文件解析为「Banner + 快捷操作 + 多列卡片面板」，并在右侧边栏提供共享侧边栏与多种小组件。

## 2. 用户价值与使用场景
- 把“备忘录 / 待办 / 项目 / 阅读 / 番茄钟 / 天气 / 追踪”集中在一个面板里
- 用 Markdown 作为数据源，保持“可编辑、可迁移、可版本管理”
- 支持把任意笔记的 `##` 标题一键转换成 dashboard 列（写入 frontmatter 的 columns）
- 支持把带 columns 的任意笔记“嵌入到工作台”作为一个 Tab 切换查看

## 3. 触发方式（入口）
- 功能区图标：点击 Home 打开 Dashboard
- 命令面板：
  - 打开工作台（open-dashboard）
  - 切换工作台侧边栏（toggle-dashboard-sidebar）
  - 将标题转换为仪表盘列（convert-note-to-dashboard）
  - 从仪表盘恢复笔记（restore-note-from-dashboard）
  - 在工作台中打开笔记（embed-note-in-dashboard）

## 4. 核心数据与文件格式
### 4.1 Dashboard 文件（由设置项 dashboardFile 指定）
- YAML Frontmatter 主要字段：
  - banner：image / images（轮播）
  - quickActions：快捷操作（打开文件/执行命令）
  - columns：列定义（name / color / type / library 配置）
- 正文部分：
  - 每个列用 `## 列名` 分隔
  - 每张卡片用“顶层 bullet”表示：`- 卡片标题`
  - 卡片内容用缩进子行表示：任务、正文、少量元数据（如 cover/width/size/grid 等）

### 4.2 插件设置（loadData/saveData）
- UI/外观：语言、样式预设、侧边栏默认固定、最近文件数量
- Widgets：天气/追踪/番茄钟/阅读/倒计时/农历等开关与参数
- 嵌入笔记：embeddedNoteTabs / activeEmbeddedNoteTab（用于“笔记工作台 Tab”）

## 5. 主要模块划分（代码地图）
- 入口与命令：[main.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/main.ts)
- 主工作台视图：[view.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/view.ts)
- 共享侧边栏视图：[sidebar-view.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/sidebar-view.ts)
- 数据同步/读写（dashboard 文件解析与保存）：[sync.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/sync.ts)
- Markdown ↔ 数据结构转换：[parser.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/parser.ts)
- 主要渲染与交互（卡片、拖拽、widgets）：[renderer.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/renderer.ts)
- 设置页：[settings.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/settings.ts)
- 服务层（天气/追踪/阅读/番茄钟等）：src/*-service.ts

## 6. 关键质量目标（非功能）
- 构建可通过：`npm run build` 必须成功
- 运行不刷屏：不输出调试 console.log
- 数据安全：优先使用 Obsidian API 读写 vault；不直接 fs 操作
- 可回滚：对笔记的写入只发生在明确命令（如 convert/restore）或用户编辑保存时

## 7. 当前已知限制（可迭代项）
- 节假日数据目前为空数据源（UI 会降级为不显示节假日信息）
- 右侧 “getLeaf('tab') / right” 使用了兼容写法以适配类型定义，后续可改为更标准的 Workspace API 调用

