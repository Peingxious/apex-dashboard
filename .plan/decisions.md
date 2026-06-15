<!-- version: 1.4.9 -->

# decisions.md — 决策与禁令

> 记录项目已确定的技术决策、绝不能违反的约束。
> 任何决策变更必须留痕：日期 + 决策 + 原因。
>
> **当前版本**：v1.4.9 · 详见末尾「版本历史」

---

## 决策日志

### v1.4.9 · 2026-06-15 — 切换分区同帧刷新 + banner 条件输出 + 列级 frontmatter 写入

#### D-2026-06-15-04 · 切换分区类型用 `processFrontMatter` 列级写入

- **决策**：新增 `SyncEngine.updateFrontmatterField(file, mutate)` 与 `updateColumnsField(updater)`；`setColumnSectionType` / `setColumnArchiveCompleted` 改走新路径，不再 `writeToDisk`
- **原因**：用户在 bug 反馈中明确"切换分区的时候工作台不刷新"和"默认只控制 columns，可以用 API 直接调整"——旧路径走 `writeToDisk` → `serializeInto` 全量重写，vault 'modify' 事件**不**会触发 view 全量 re-render（只刷新 library 段），导致用户切完类型需切走 tab 再切回；并且整文件重写会顺带改 banner / extra frontmatter / 注释顺序
- **影响**：
  - 用户体验：切换分区类型**同帧**反映新样式
  - 文件 IO：banner / quickActions / extra frontmatter / 注释顺序**完全不变**（byte-identical）
  - 错误处理：`processFrontMatter` 失败时 `console.error` + `new Notice("Failed to save dashboard changes")` 兜底
  - 性能：少一次"读 → 全量解析 → 全量序列化 → 整文件写回 → vault 'modify' 事件"重型路径
  - `writeToDisk` 保留，供卡片增删改、banner 编辑、quickActions 增删等场景使用

#### D-2026-06-15-05 · banner 块条件输出

- **决策**：`parser.ts:serialize` 删除硬编码 `lines.push("banner:")`，改为**仅当** `data.banner.image` 非空时才输出 banner 块
- **原因**：用户在 bug 反馈中明确"不要每次都加 banner，banner 只有操作了才加"——旧路径每次保存都无脑写 `banner:` 行，哪怕用户从未编辑过 banner
- **影响**：
  - 新文件**不**含 `banner:` 字段
  - 用户编辑过 banner → 文件保留 `banner:` 块
  - 用户清空 banner（设 image 为 ""）→ 旧 `banner:` 块在下一次保存时**自动从文件移除**（`serializeInto` → `patchYamlBlock` 的 null block 路径）
  - 读路径不变，`parseBanner` 行为不变，向后兼容已有 `banner:` 块的老文件
  - 配合 BUG-002 的 `generateEmptyDashboardMarkdown`，新打开的工作台文件**完全**不含任何 plugin-specific frontmatter 块

#### D-2026-06-15-06 · view 层防御性 requestRender

- **决策**：`view.ts:onColumnSectionTypeChange` callback 在 `sync.setColumnSectionType` 之后**额外**调用一次 `this.requestRender(this.sync.getData()!)`
- **原因**：即便 `updateColumnsField` 已 `notifyCallbacks`，RAF 合并（`renderCoalescer`）可能在某些时序下吞掉请求；防御性多调一次 requestRender 成本为零（同 RAF 帧内合并为一次实际 render），但保证切换类型一定能触发 view 重新渲染
- **影响**：彻底修复"切换分区类型不刷新"的体验问题，覆盖所有时序边界

---

### v1.4.8 · 2026-06-15 — banner 简化为单图 + 首创建不注入默认分区

#### D-2026-06-15-01 · banner 不再支持轮播图

- **决策**：banner 整体下线轮播图能力——弹窗只保留一个图片地址输入框；`view.ts:setupBannerRotation` 删除；`parser.ts:serialize` 不再写 `banner.images:`
- **原因**：用户在 bug 反馈中明确"banner 就是一张图，不是轮播图"。轮播图 UI 与 i18n key 缺失叠加，让用户填了主图却看不到效果；`images.length > 1` 还会**覆盖**主图，破坏"输入图片地址即可"的契约
- **影响**：
  - 用户体验：弹窗精简，填 URL 即显示
  - 向后兼容：`banner.images` 字段在 read 时**忽略**，不破坏旧文件
  - 代码：净删除约 80 行（setupBannerRotation 69 行 + 弹窗轮播 UI 11 行）

#### D-2026-06-15-02 · 工作台首创建不注入默认 columns

- **决策**：`findOrCreateFile` 新建文件时调用 `generateEmptyDashboardMarkdown()`（仅含最小 frontmatter + `columns: []`），不再调用 `generateDefaultMarkdown()`；`parseColumnDefs` 在 `columns:` 缺失时返回 `[]`
- **原因**：用户在 bug 反馈中明确"直接改文件，其他的都会清除"——他手动清空 `dashboard.md` 里的 `## H2` 与 `columns:` 后，插件在下次保存又把它们**全部复活**（因为 `parseColumnDefs` fallback 到 `DEFAULT_COLUMNS`）。文件应当是 source of truth，插件不应猜测
- **影响**：
  - 用户体验：首次打开工作台是空画布，用户按需添加分区
  - 向后兼容：旧用户文件里已有 `columns:`，parse 走正常路径，**不**受影响
  - 代码：净增约 20 行（新函数 + 注释）

#### D-2026-06-15-03 · DEFAULT_COLUMNS / generateDefaultMarkdown 保留为 deprecated

- **决策**：两个函数保留，但**不**被首创建流程调用；JSDoc 标记 `@deprecated for default-creation since v1.4.8`
- **原因**：未来可能加"插入示例数据"按钮或"重置工作台"操作复用这份 4 分区样板。删除会损失扩展点；保留但不再滥用，是最小代价的方案
- **影响**：增加少量"看着像用着又没用"的代码，但保留了未来 UX 设计的灵活性

---

### v1.3.0 · 2026-06-15 — 引入 `.plan/PURPOSE.md`

- **决策**：新增 `PURPOSE.md` 作为 AI 理解产品意图的入口文件
- **原因**：现有记忆文件（Target / Plan / decisions）都是"项目层"的，缺少"产品层"的意图说明。AI 在做功能决策时需要先理解"为什么做这个插件"才能做出符合产品方向的选择
- **影响**：
  - `.plan/` 从 4 文件扩展为 5 文件
  - `Agents.md` §0 / §10.1 启动流程加入"必读 PURPOSE.md"约束
  - 未来 AI 加载后**先读 PURPOSE.md** 再读其他文件
- **PURPOSE.md 包含**：
  - 一句话定位、核心问题、目标用户
  - 4 个核心差异化（含 1 个愿景：块状图规划项目面板）
  - 明确边界（不替代任务/数据库插件、不与核心插件抢功能、可调用 Templater）
  - 整体框架（入口/数据流/核心模块/插件关系）
  - 8 个非目标 + 4 条成功标准

### v1.2.0 · 2026-06-15 — 引入 Agents.md 自举规则

- **决策**：`Agents.md` 加载时，AI 必须自动检查并补齐 `.plan/` 记忆模块
- **原因**：用户希望"只引用 `Agents.md` 一个文件即可启动整个开发体系"，避免每次手动维护 `.plan/`
- **影响**：`Agents.md` 新增 §10 自举规则章节；版本升至 v1.2.0
- **新约束**：
  - 单一入口：用户对话中只需提供 `Agents.md` 路径
  - 路径推导：AI 自行取同目录下的 `.plan/`
  - Bootstrap 自检：生成 4 个文件后逐项确认
  - 跨项目复用：任何新项目放 `Agents.md` 即可启动

### v1.1.0 · 2026-06-15 — 引入 `.plan/` 记忆模块

- **决策**：所有 `Plan.md` / `Target.md` 等开发记忆文件统一存放在 `.plan/` 目录
- **原因**：与运行时文件（`manifest.json` / `main.js` / `src/`）分离，便于版本管理与 AI 上下文加载
- **影响**：`Agents.md` 中的所有引用路径已从 `Plan.md` 改为 `.plan/Plan.md`
- **版本**：随 `Agents.md` 同步升至 v1.1.0

### v1.1.0 · 2026-06-15 — 优化 Agents.md 角色设定

- **决策**：移除内嵌的英文 Obsidian 官方规范（280+ 行），精简为 400-500 行的角色卡 + 速查手册
- **原因**：原版内容是 `obsidianmd/sample-plugin` 模板的复制，不是角色设定本身
- **影响**：若需要查阅官方规范，需通过 Obsidian 官方文档（https://docs.obsidian.md）自行获取

---

## 技术栈

- **语言**：TypeScript（`"strict": true`）
- **包管理**：npm
- **构建**：esbuild（`esbuild.config.mjs`）
- **入口**：`src/main.ts` → `main.js`
- **Node**：LTS 18+
- **Lint**：ESLint + `eslint-plugin-obsidianmd`

## 项目结构

```
apex-dashboard/
├── Agents.md              # 角色设定（本仓库专属）
├── .plan/                 # 记忆模块
│   ├── README.md
│   ├── Target.md
│   ├── Plan.md
│   └── decisions.md
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── .eslintrc.js
├── src/                   # 源码（按功能拆模块）
├── styles.css
├── README.md              # 英文
├── README_ZH.md           # 中文
├── CHANGELOG.md
└── versions.json
```

## 绝不能做（红线）

- 手动创建、读取、修改、覆盖 `main.js`（编译产物）
- 使用 `any` 类型
- 裸写 `.then()` 链（必须 `async/await`）
- 直接 `app.xxx.on(...)` 而不用 `this.registerEvent(...)` 包装
- 用 `fs` / `localStorage` / `document.createElement` 替代 Obsidian API
- 跳过 `.plan/Target.md` 或 `.plan/Plan.md` 存档
- 单文件超过 500 行不拆分
- 修改插件 `id`（一旦发布即为稳定 API）
- 引入网络请求 / 云服务而不明示用户并提供 opt-in

---

## 版本历史

| 版本       | 日期       | 变更摘要                                                                      |
| ---------- | ---------- | ----------------------------------------------------------------------------- |
| **v1.3.0** | 2026-06-15 | 新增 `.plan/PURPOSE.md` 作为产品意图入口文件；`.plan/` 从 4 文件扩展为 5 文件 |
| **v1.2.0** | 2026-06-15 | 新增 Agents.md 自举规则：加载时 AI 自动检查/生成 `.plan/`                     |
| **v1.1.0** | 2026-06-15 | 新增版本字段；与 `Agents.md` 同步升至 v1.1.0；决策日志条目全部携带版本号      |
| v1.0.0     | —          | 初版（含技术栈 / 项目结构 / 红线）                                            |
