# Apex Dashboard 插件目标（Target）

## 1. 插件基本信息

| 字段                   | 值                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| **ID**                 | `apex-dashboard`                                                                                  |
| **名称**               | Apex Dashboard                                                                                    |
| **版本**               | 1.1.15                                                                                            |
| **最低 Obsidian 版本** | 0.15.0                                                                                            |
| **作者**               | PandoraReads                                                                                      |
| **许可证**             | MIT                                                                                               |
| **描述**               | Your personal command center — memos, todos, and projects in one stunning glassmorphism dashboard |

---

## 2. 用户价值与使用场景

- 把"备忘录 / 待办 / 项目 / 阅读 / 番茄钟 / 天气 / 追踪"集中在一个面板里
- 用 Markdown 作为数据源，保持"可编辑、可迁移、可版本管理"
- 支持把任意笔记的 `##` 标题一键转换成 dashboard 列（写入 frontmatter 的 columns）
- 支持把带 columns 的任意笔记"嵌入到工作台"作为一个 Tab 切换查看
- 自动适配 Obsidian 主题颜色，无需手动配置

---

## 3. 触发方式（入口）

### 功能区图标

- 主页图标（Home）：点击打开 Dashboard

### 命令面板

| 命令 ID                       | 名称               | 快捷键             |
| ----------------------------- | ------------------ | ------------------ |
| `open-dashboard`              | 打开工作台         | `Ctrl+Alt+Shift+Z` |
| `toggle-dashboard-sidebar`    | 切换工作台侧边栏   | -                  |
| `convert-note-to-dashboard`   | 将笔记转换为仪表盘 | -                  |
| `restore-note-from-dashboard` | 从仪表盘恢复笔记   | -                  |
| `embed-note-in-dashboard`     | 在工作台中嵌入笔记 | `Ctrl+Alt+D`       |

---

## 4. 核心功能模块

### 4.1 四大卡片类型

| 类型         | 说明     | 布局特点                                                     |
| ------------ | -------- | ------------------------------------------------------------ |
| **Memo**     | 备忘录   | 可编辑文本区，支持 `[[wikilinks]]`，可选背景色               |
| **Todo**     | 待办清单 | 复选框列表，支持拖拽排序，进度条显示完成百分比，支持到期提醒 |
| **Projects** | 项目卡片 | 封面图、文档列表、内联搜索，支持多格式（MD/PDF/图片/音视频） |
| **Notes**    | 笔记列表 | 紧凑列表，每行 5 张卡片，无封面图                            |

### 4.2 侧边栏小组件

| 组件                | 功能                                                           |
| ------------------- | -------------------------------------------------------------- |
| **Week Calendar**   | 紧凑 7 天日历条，高亮今日                                      |
| **Weather Widget**  | 实时天气（温度/体感/湿度/风速）+ 5 天预报，基于 Open-Meteo API |
| **Heatmap Widget**  | GitHub 风格热力图，跟踪 frontmatter 数据（mood/sleep/weight）  |
| **Pomodoro Timer**  | 番茄钟计时器，环形进度，活动分类，会话统计                     |
| **Reading Tracker** | 阅读追踪，豆瓣搜索/手动添加图书，阅读计时，进度记录            |
| **Countdown**       | 倒计时组件，支持自定义目标日期和提醒                           |
| **Lunar Widget**    | 农历日历，含节假日信息                                         |

### 4.3 Banner 系统

- 激励语录（支持多语录轮播，每 1 小时切换）
- 背景图片（支持多图轮播，每 30 分钟切换）
- 语录颜色自定义
- 双击编辑

### 4.4 快捷操作（Quick Actions）

- 文件链接：打开任意文档
- 命令快捷方式：触发任意 Obsidian 命令
- 预设动作：新建日记、新建笔记

### 4.5 拖拽与交互

- 列间拖拽卡片
- 任务项在卡片内/跨卡片拖拽排序
- 文档链接在项目/笔记卡片间移动
- 卡片宽度调整（拖拽）
- 分栏折叠/展开

---

## 5. 数据格式与文件结构

### 5.1 Dashboard 文件格式（缩进 bullet-list 格式）

```markdown
## Memo

- 2026-06-08 memo
  - Welcome to Apex Dashboard! Click here to edit your first memo.

## Todo

- Task list
  - [ ] Review dashboard plugin code
  - [ ] Write documentation
  - due: 2025-05-20

## Projects

- Obsidian Dashboard
  - [[obsidian-dashboard/README.md]]
  - progress: 60
```

**格式规范：**

- `##` 标题定义分区
- 顶层 `-` 定义卡片标题
- 缩进 `\t-` 定义卡片内容（文本、任务、元数据等）
- 任务使用 `- [ ]` / `- [x]` 格式
- 元数据使用 `key: value` 格式（如 `due:`、`progress:`、`link:`）

### 5.2 插件设置（loadData/saveData）

```typescript
interface DashboardSettings {
  // 文件配置
  dashboardFile: string; // Dashboard 文件路径
  recentDocCount: number; // 最近文档数量

  // 外观
  language: "en" | "zh"; // 界面语言
  stylePreset: string; // 样式预设（已简化为主题自适应）

  // 小组件开关
  widgetWeatherEnabled: boolean;
  widgetHeatmapEnabled: boolean;
  widgetTrackerKey: string;
  widgetTrackerDays: number;
  widgetTrackerSummary: "streak" | "rate" | "both" | "off";
  widgetWeatherCity: string;
  widgetWeatherLat: number;
  widgetWeatherLon: number;
  widgetLunarEnabled: boolean;
  widgetOrder: string[];

  // 番茄钟
  pomodoroEnabled: boolean;
  pomodoroWorkMinutes: number;
  pomodoroShortBreakMinutes: number;
  pomodoroLongBreakMinutes: number;
  pomodoroLongBreakInterval: number;
  pomodoroAutoStartBreak: boolean;
  pomodoroSoundEnabled: boolean;

  // 倒计时
  countdownEnabled: boolean;
  countdownTargetDate: string;
  countdownDisplayMode: "days" | "hours" | "minutes";
  countdownReminderDays: number;
  countdownLabel: string;

  // 阅读
  readingEnabled: boolean;
  readingSoundEnabled: boolean;

  // 其他
  taskTemplates: TaskTemplate[];
  sidebarPinnedDefault: boolean;
  projectHideNestedDocs: boolean;
  embeddedNoteTabs: string[];
  activeEmbeddedNoteTab: string | null;
  // 库视图（Library）的 libraryConfig 包含的可选属性（详见 src/types.ts）：
  //   - visibleProperties?: string[]
  //     仅 table / list 视图生效；undefined 或空数组表示显示全部（向后兼容）
  //     非空数组按勾选顺序作为表格列 / 列表元数据 chip
  //   - kanbanGroupBy?: string
  //     仅 kanban 视图生效，配置弹窗中仅在「看板」被选中时显示
}
```

---

## 6. 代码架构（代码地图）

| 模块           | 文件                                                                                                                   | 职责                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **入口**       | [main.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/main.ts)                         | 插件生命周期、命令注册、视图管理 |
| **主视图**     | [view.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/view.ts)                         | Dashboard 主视图渲染             |
| **侧边栏视图** | [sidebar-view.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/sidebar-view.ts)         | 共享侧边栏视图                   |
| **渲染器**     | [renderer.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/renderer.ts)                 | 卡片渲染、拖拽、交互             |
| **解析器**     | [parser.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/parser.ts)                     | Markdown → 数据结构              |
| **同步器**     | [sync.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/sync.ts)                         | 文件读写同步、哈希校验防竞态     |
| **设置页**     | [settings.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/settings.ts)                 | Settings Tab UI                  |
| **类型定义**   | [types.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/types.ts)                       | 接口与默认配置                   |
| **国际化**     | [i18n.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/i18n.ts)                         | 中英文翻译                       |
| **Banner**     | [banner.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/banner.ts)                     | Banner 组件                      |
| **拖拽**       | [dnd.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/dnd.ts)                           | 拖拽排序逻辑                     |
| **卡片编辑**   | [card-edit-modal.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/card-edit-modal.ts)   | 卡片编辑弹窗                     |
| **天气服务**   | [weather-service.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/weather-service.ts)   | Open-Meteo API 封装              |
| **追踪服务**   | [tracker-service.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/tracker-service.ts)   | 热力图数据获取                   |
| **番茄钟**     | [pomodoro-service.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/pomodoro-service.ts) | 计时器逻辑                       |
| **阅读追踪**   | [reading-service.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/reading-service.ts)   | 豆瓣搜索/阅读计时                |
| **农历组件**   | [lunar-widget.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/lunar-widget.ts)         | 农历显示                         |
| **节假日**     | [holiday-service.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/holiday-service.ts)   | 节假日数据（降级空数据）         |
| **求签**       | [fortune-stick.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/fortune-stick.ts)       | 求签逻辑与数据                   |
| **最近文档**   | [recent.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/recent.ts)                     | 最近编辑文件列表                 |
| **提醒**       | [reminder-notice.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/reminder-notice.ts)   | 任务到期提醒                     |

---

## 7. 技术栈

| 依赖               | 版本   | 用途         |
| ------------------ | ------ | ------------ |
| `obsidian`         | 1.10.3 | Obsidian API |
| `typescript`       | ^5.8.3 | 类型系统     |
| `esbuild`          | 0.25.5 | 构建工具     |
| `chart.js`         | ^4.5.1 | 图表绘制     |
| `lunar-typescript` | ^1.8.6 | 农历计算     |
| `yaml`             | ^2.9.0 | YAML 解析    |

---

## 8. 版本历史（关键里程碑）

| 版本   | 日期       | 主要变化                                                                                                                                  |
| ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1.14 | 2026-06-12 | 项目项 wikilink 普通 hover 触发 Page Preview（200ms 延迟）；卡片标题/task/note 不启用 hover；撤销 1.1.12 分区标题尾号角标，分区名完整渲染 |
| 1.1.13 | 2026-06-12 | 项目项 wikilink 支持 Ctrl/Cmd+悬浮原生文件预览（手动派发 workspace `link-hover` 事件，200ms 延迟）                                        |
| 1.1.11 | 2026-06-12 | File-suggest 输入时无预选第一项；高亮从 1.1.10 的"渐变+粗边框+加粗"改为"软底色+1px 内嵌边线"克制版                                        |
| 1.1.10 | 2026-06-12 | 修复：File-suggest 下拉 ↑/↓ 高亮不可见 — 移除 inline `background: transparent` 覆盖，改用渐变+左边框+加粗高亮；hover 同步恢复             |
| 1.1.9  | 2026-06-12 | 修复：File-suggest 下拉按 Enter 不再自动选中第一项；高亮与"已确认选择"分离，需先按 ↑/↓ 才能回车确认                                       |
| 1.1.8  | 2026-06-12 | 工作台支持 Ctrl/Cmd+Z 撤销最近一次删除（卡片/任务/项目项/分区），栈深 50，命令面板同步入口                                                |
| 1.1.7  | 2026-06-12 | 统一 todo 与 project 的 X 删除按钮样式（红色小胶囊，hover 出现）；点击直接删除，无确认弹窗                                                |
| 1.1.6  | 2026-06-12 | 列表视图属性值以胶囊样式（无 key 标签）紧邻时间值；时间保持最末；列序与表格一致                                                           |
| 1.1.5  | 2026-06-12 | Library 表格/列表视图新增「显示属性」可配置列；看板视图保持「分组依据」专属配置；向后兼容                                                 |
| 1.1.4  | 2025-06-09 | 主题系统简化（自动适配 Obsidian 主题）；文件格式改为缩进 bullet-list                                                                      |
| 1.1.3  | -          | 移动端小组件栏重新设计；自定义弹窗替代浏览器 dialog                                                                                       |
| 1.1.1  | 2025-05-29 | 修复 Library 配置丢失、卡片网格位置未保存、写操作竞态条件                                                                                 |
| 1.1.0  | -          | 阅读追踪完整功能；番茄钟活动选择器；甜甜圈统计图                                                                                          |
| 1.0.8  | 2025-05-25 | 侧边栏小组件完整实现（天气/热力图/番茄钟/倒计时/农历）                                                                                    |
| 1.0.7  | -          | 任务提醒、日历选择器、过期指示器、6 个新主题                                                                                              |
| 1.0.6  | -          | 多语录轮播、图片轮播、卡片间拖拽、章节折叠                                                                                                |
| 1.0.4  | -          | Quick Actions、4 种分区类型、多格式文档支持                                                                                               |
| 1.0.2  | -          | 分区管理、移动端优化                                                                                                                      |

---

## 9. 已知限制与待改进项

| 问题                   | 状态      | 说明                                                      |
| ---------------------- | --------- | --------------------------------------------------------- |
| 节假日数据源           | ⚠️ 降级   | 目前为空数据源，UI 降级不显示节假日信息                   |
| Workspace API 兼容写法 | ⚠️ 待优化 | `getLeaf('tab')` 使用了兼容写法，后续可改为更标准的 API   |
| 单元测试覆盖           | ⚠️ 待补齐 | 缺乏 parser/serialize 循环测试、frontmatter 注入/移除测试 |
| 性能优化               | ⚠️ 待优化 | 大 Vault 扫描缺乏缓存与节流机制                           |
| 错误处理               | ⚠️ 待补齐 | 关键异步流程缺少 Notice 反馈（如网络失败/解析失败）       |

---

## 10. 构建与发布

```bash
# 开发构建
npm run dev

# 生产构建
npm run build

# 版本更新
npm run version

# 代码检查
npm run lint
```

**发布目录结构：**

```
apex-dashboard/
├── src/                    # 源代码（TypeScript）
├── main.js                 # 构建输出
├── manifest.json           # 插件清单
├── styles.css              # 样式文件
└── release/                # 发布版本（加密/混淆）
```
