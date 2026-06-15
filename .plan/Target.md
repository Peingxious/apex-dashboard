# Target.md — 需求存档

> 本文件由 Agent 在「阶段 0：需求问询」结束后写入。
> 任何需求变更必须同步更新本文件，并在 `.plan/decisions.md` 留痕。

## 当前需求

**插件名称**：apex-dashboard
**当前阶段**：已上线维护期（v1.4.7）
**核心功能**：Obsidian 仪表盘与侧边栏聚合视图

## 标准格式

每次新增/调整功能时，按以下格式记录：

```
【触发方式】命令面板 / 功能区按钮 / 事件监听
【核心流程】步骤1 → 步骤2 → 步骤3
【数据存储】是/否，存储内容：...
【UI 组件】Settings Tab / Modal / Leaf View / 无
```

## 功能列表

| ID    | 标题                                                | 类别 | 状态             |
| ----- | --------------------------------------------------- | ---- | ---------------- |
| F-001 | 玻璃拟态仪表盘（6 种分区）                          | 核心 | 稳定             |
| F-002 | 笔记 → 仪表盘一键转换                               | 核心 | 稳定             |
| F-003 | TodoPlus 镜像分区                                   | 核心 | 1.4.0~1.4.6 完成 |
| F-004 | 12 种内置风格预设                                   | 视觉 | 稳定             |
| F-005 | 侧边栏小组件（天气/番茄钟/热力图/阅读/倒计时/农历） | 扩展 | 稳定             |
| F-006 | Ctrl+Z 撤销                                         | 体验 | 稳定             |
| F-007 | 任务提醒                                            | 扩展 | 稳定             |

## 当前问题（v1.4.7 → v1.4.8 修复）

### BUG-003a · 切换分区类型时工作台不刷新

**复现**：

1. 打开工作台 → 任意分区点"切换类型"按钮（📋/📊/🌤/📚 之类的下拉）
2. 选一个新类型（比如从 `memo` 切到 `todo`）→ 工作台视图**没有**立即按新类型渲染

**预期**：

- 选完新类型后**立即**（同帧内）按新类型重新渲染卡片样式
- frontmatter 里 `columns[i].type` 同步更新为新值
- 不需要手动关掉工作台重开

**实际**：

- 数据写到了磁盘（`columns[i].type` 已变）
- 但视图没刷新——需要切到别的 tab 再切回来，或者重启 Obsidian

**根因**（**待 5.4 手动验证后补全**）：

- 当前 `sync.setColumnSectionType` 走 `writeToDisk` → `serializeInto` 全量重写路径
- 整文件重写后 vault 触发 'modify' 事件 → `registerVaultListeners` 的 modify 监听器只刷新了 library 段，**没有**触发 view 全量 re-render
- `notifyCallbacks` 虽然同步触发 `view.requestRender(newData)`，但可能与 `renderCoalescer` 之前的 RAF 调度合并/被覆盖

**验收标准**：

- 切换分区类型后**同帧**按新类型渲染（无需手动重开）
- frontmatter 中 `columns[i].type` 同步更新
- `writeToDisk` 的 banner size 保护逻辑不被 columns-only 路径触发

---

### BUG-003b · 每次保存都强制写 banner 块（哪怕用户从未编辑 banner）

**复现**：

1. 删除 `dashboard.md` → 打开工作台 → 自动创建一个**最小骨架**（v1.4.8 修过的样子）
2. 在 settings 里切换任意开关、添加一个分区、添加一张卡片
3. 打开 `dashboard.md` → 发现文件**总是**带一个 `banner:` 行

**预期**：

- 用户**从未**编辑 banner → 文件里**不**应有 `banner:` 块
- 用户**编辑过** banner（填了图片地址）→ 文件里**才**有 `banner:` 块
- banner 块按"用户是否操作过"为写入条件

**实际**：

- `parser.ts:296` 写死 `lines.push("banner:")`，**无条件**输出 banner 行
- 哪怕 `data.banner.image === ""`，文件也会出现 `banner:\n` 这一行

**根因**：

- `serialize()` 是"全量重写"，**所有**已知 frontmatter 字段都被无脑输出
- 没有"用户是否操作过 banner"的状态位

**验收标准**：

- `parser.ts:serialize` **仅当** `data.banner.image` 非空时才输出 `banner:` 块
- `data.banner.image === ""` 时 → 序列化结果中**不**含 `banner:` 字符串
- 老用户已有 banner 块的 `dashboard.md` 仍能正常解析与显示（`parseBanner` 行为不变）

---

### BUG-003c · 默认应该只控制 columns，可以用 API 直接调整

**复现**：

1. 切分区类型（BUG-003a 同一动作）
2. 顺带把 `dashboard.md` 里用户手写的 `cssclass: my-dashboard` 注释行 / `tags: [x]` 字段**顺序重排**或**重写**了

**预期**：

- 默认（即不动 banner、不动 quickActions 等其他字段） → 插件**只**触碰 `columns:` 字段
- 用 `app.fileManager.processFrontMatter(file, fm => { fm.columns = newCols })` 直接 mutate frontmatter
- banner / quickActions / extra frontmatter / 注释 / 空行**完全不动**

**实际**：

- 当前 `writeToDisk` → `serializeInto` → `serialize` 是**全量重写**整文件
- 即使用户只切换了分区类型，banner / extra frontmatter / 注释顺序都可能被改

**根因**：

- `sync.setColumnSectionType` 复用了通用 `writeToDisk` 路径
- 没有"按字段粒度写入"的精细化路径

**验收标准**：

- 新增 `SyncEngine.updateFrontmatterField(key, mutate)` 方法，内部走 `app.fileManager.processFrontMatter` API
- `setColumnSectionType` / `setColumnArchiveCompleted` 改走**新路径**（只动 `columns:`）
- 切完类型后 `dashboard.md` 中 banner 块、extra frontmatter、注释顺序**完全不变**（byte-identical，除 `columns:` 字段外）
- 其他字段（卡片增删改、banner 编辑、quickActions 增删等）保留**原**全量路径
- 移动端兼容：`processFrontMatter` 在 mobile 端正常（依赖 Obsidian 0.15+ API）

---

## 非功能需求

- 最低 Obsidian 版本：`0.15.0`
- 是否提交社区市场：未计划
- 是否支持移动端：跟随 Obsidian 移动端能力

### BUG-001 · banner 弹窗要"普通图片地址"就行，不要轮播图

**复现**：

1. 打开工作台 → 点击 Banner 上的"编辑"按钮
2. 弹窗里出现**两个区**：① "Background image path (vault relative)" ② "Background Images" 轮播图列表
3. 在主图字段填一个 URL（`https://i.pravatar.cc/600`）保存 → banner 没按预期显示

**预期**：

- 弹窗**只**有一个图片地址输入框，**没有**轮播图列表
- 填 URL 即可，banner 立即按主图样式显示
- banner **始终是单图**模式，无轮播逻辑

**实际**：

- 弹窗里仍然有"Background Images"轮播图列表
- i18n key 缺失，弹窗里多处显示成字面量 `"banner.image"`、`"banner.imageDesc"`、`"banner.imagePlaceholder"`、`"banner.rotationImages"`、`"banner.addImage"`、`"banner.save"`、`"banner.edit"` 等
- 用户填写了主图但因 UI 干扰和 i18n 显示异常，感觉"被改成其他的"
- 后端 `view.ts:setupBannerRotation` 还在跑——`images.length > 1` 时会**覆盖**主图，破坏"输入图片地址即可"的契约

**根因**：

1. `src/banner.ts:BannerEditModal` 渲染了轮播图列表 UI（`renderImagesList` / `addImageBtn`），与用户"banner 就一张图"的预期冲突
2. `src/banner.ts` 引用了**未在 `i18n.ts` 注册**的 7 个 i18n key
3. `src/view.ts:setupBannerRotation` 整套轮播机制对单图 banner 是冗余的，且会"覆盖主图"——应整体下线
4. `src/parser.ts:serialize` 仍然写 `banner.images` 块，应同步下线

**验收标准**：

- Banner 编辑弹窗**只**含一个图片地址输入框（label/placeholder 正确显示，不再是字面量 key）
- `banner.images` 字段停止写入磁盘；`banner.images` 数据保留为"读时忽略"，避免破坏现有用户已写入的文件
- `view.ts:setupBannerRotation` 整段删除；`images.length > 1` 不再覆盖主图
- `parser.ts:serialize` 不再输出 `images:` 块
- 单图 URL（vault 相对路径或 https URL）填进去就正常显示，与现状一致

---

### BUG-002 · 工作台首次打开时强制写入 4 个默认分区，且二次保存会"重置"用户清空

**复现**：

1. 删除 vault 中 `dashboard.md`（或首次安装时）
2. 打开工作台 → 自动创建一个 `dashboard.md`
3. 文件里被自动写入 **Memo / Todo / Projects / Library 4 个默认分区**，每分区还有示例卡片
4. 用户手动编辑 `dashboard.md`，删掉所有 `## H2`、删掉 `columns:` 块
5. 重新打开工作台 → 4 个默认分区**又回来了**（因为 `parseColumnDefs` 看到 `columns:` 不存在就 fallback 到 `DEFAULT_COLUMNS`）

**预期**：

- 首次打开工作台 → 文件是**最小骨架**（仅 frontmatter，**无**任何默认分区）
- 删光文件里所有内容后再打开 → 工作台是**空**的（不是默认分区又出现）
- 用户在 settings 设了默认 columns 才用设定的，否则按文件里写的内容渲染

**根因**：

1. `parser.ts:30-35` 硬编码 4 个 `DEFAULT_COLUMNS`
2. `parser.ts:941` `parseColumnDefs` 在 `columns:` 缺失时**返回 `DEFAULT_COLUMNS` 而不是 `[]`**
3. `parser.ts:583+` `generateDefaultMarkdown()` 强制填了 4 个默认分区 + 示例卡片
4. `sync.ts:1413-1416` `findOrCreateFile` 新建文件时调用 `generateDefaultMarkdown()`

**验收标准**：

- 首次安装 / 删掉 dashboard.md 后打开工作台 → 写入的 `dashboard.md` **只**含 `banner:` 空块 + `columns: []` 空块，**无**任何默认分区与示例卡片
- 用户手动清空 `dashboard.md` 的所有 `## H2` 与 `columns:` 块后再打开 → 工作台显示**空**状态，文件**不会被插件改回默认**
- 现有用户的 dashboard 文件不受影响（`columns:` 已有的，parse 走正常路径，不 fallback）

---

## 非功能需求

- 最低 Obsidian 版本：`0.15.0`
- 是否提交社区市场：未计划
- 是否支持移动端：跟随 Obsidian 移动端能力

## 触发场景映射

| 用户说                    | 流程                                                          |
| ------------------------- | ------------------------------------------------------------- |
| 写一个插件                | 阶段 0 → 1 → 2 → 3                                            |
| 继续 / 当前进度           | 读 .plan/，简报后等确认                                       |
| 新增 / 添加 / 修复 / 重构 | 读 .plan/ → 在 Plan.md 加任务 → 确认后执行 → 同步文档与版本号 |
| 检查 / 审查               | 按 Agents.md §6 检查清单逐项扫描                              |
