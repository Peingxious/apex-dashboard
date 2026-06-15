# Plan.md — 进度计划

> 标准拆分：Step 1 脚手架 → Step 2 核心功能 → Step 3 UI 与设置 → Step 4 收尾
> 状态：`[ ]` 待处理 | `[>]` 进行中 | `[x]` 已完成 | `[!]` 阻塞 | `[-]` 跳过

## 当前计划

修复 v1.4.8 暴露的三个用户感知 bug（详见 `.plan/Target.md` `BUG-003a` / `BUG-003b` / `BUG-003c`），目标版本 **v1.4.9**。

- **BUG-003a** 切换分区类型时工作台不刷新 → columns-only 写入 + 强制触发 `view.requestRender(newData)` 后再 `vault.modify`
- **BUG-003b** 每次保存都强制写 banner 块 → `serialize()` 条件输出 banner
- **BUG-003c** 默认应该只控制 columns → 用 `app.fileManager.processFrontMatter` API 直接 mutate `columns` 字段，banner/extra/注释**完全不动**

---

## 历史步骤（已完成）

### Step 1 — 脚手架

- [x] 项目结构 / manifest / esbuild / Obsidian API 框架

### Step 2 — 核心功能

- [x] 仪表盘主视图、6 种分区、笔记 ↔ 仪表盘双向转换

### Step 3 — UI 与设置

- [x] Settings Tab / Modal / Sidebar 小组件 / 12 风格预设

### Step 4 — 收尾

- [x] README、CHANGELOG、eslint、test harness

---

## Step 5 — v1.4.8 Bug 修复（已完成）

### 子任务 5.1 · BUG-001：banner 简化为单图，弹窗只有图片地址

- [x] **5.1.1** 改写 `BannerEditModal` 弹窗
  - 5.1.1.a ~~删除 "Rotation Images" 标题（`<h3>`）与对应的 `imagesContainer` 块~~ ✓
  - 5.1.1.b ~~删除 "Add Image" 按钮~~ ✓
  - 5.1.1.c ~~删除 `renderImagesList()` 私有方法~~ ✓
  - 5.1.1.d ~~删除 `localImages` 字段、`onSave` 中对 `updates.images` 的赋值~~ ✓
  - 5.1.1.e ~~弹窗里**只**保留一个 `Setting` 文本框：`banner.image`~~ ✓
- [x] **5.1.2** 在 `i18n.ts` 注册缺失的 key（中英文各 7 个）
  - `banner.edit` / `banner.image` / `banner.imageDesc` / `banner.imagePlaceholder` / `banner.rotationImages` / `banner.addImage` / `banner.save` ✓
  - `banner.rotationImages` / `banner.addImage` 仍注册为 backward-compat 预留
- [x] **5.1.3** 删除 `view.ts:setupBannerRotation` 整段方法
  - 5.1.3.a ~~移除 `private setupBannerRotation(...)` 方法体与 `cleanupFns.push(...)`~~ ✓
  - 5.1.3.b ~~移除所有 `setupBannerRotation` 的调用点~~ ✓
  - 5.1.3.c ~~移除 `BANNER_IMAGE_ROTATION_MS` 常量与 `bannerImageIndex` 字段~~ ✓
  - 5.1.3.d 移除 `resolveVaultImage` 的 import（已无引用）✓
- [x] **5.1.4** 修改 `parser.ts:serialize` 不再输出 `images:` 块
  - 5.1.4.a ~~删除 `if (data.banner.images && data.banner.images.length > 0)` 整段~~ ✓
  - 5.1.4.b `parseBanner` 仍可读 `images`（向后兼容），但**不**被使用 ✓
- [x] **5.1.5** `tsc --noEmit` 验证类型通过 ✓
- [x] **5.1.6** `node esbuild.config.mjs production` 验证构建通过 ✓

### 子任务 5.2 · BUG-002：首次打开工作台不再注入默认分区

- [x] **5.2.1** 抽出新函数 `generateEmptyDashboardMarkdown()` ✓
- [x] **5.2.2** `sync.ts:findOrCreateFile` 在新建文件时改为调用 `generateEmptyDashboardMarkdown()` ✓
- [x] **5.2.3** `parser.ts:parseColumnDefs` 当 `fm.columns` 缺失或非数组时返回 `[]` ✓
- [x] **5.2.4** `parser.ts:DEFAULT_COLUMNS` 加 JSDoc 注释：仅供向后兼容，不再作 fallback ✓
- [x] **5.2.5** `parser.ts:generateDefaultMarkdown` 加 JSDoc `@deprecated` 标注 ✓
- [x] **5.2.6** `tsc --noEmit` 验证类型通过 ✓
- [x] **5.2.7** `node esbuild.config.mjs production` 验证构建通过 ✓

### 子任务 5.3 · 文档与版本号同步

- [x] **5.3.1** `manifest.json` + `package.json` 版本号 `1.4.7 → 1.4.8` ✓
- [x] **5.3.2** `CHANGELOG.md` 顶部追加 `## 1.4.8 (2026-06-15)` 节 ✓
- [x] **5.3.3** `README.md` + `README_ZH.md` 检查：**纯 bug 修复，仅 Changelog 同步** ✓
- [x] **5.3.4** `.plan/decisions.md` 留痕：D-2026-06-15-01 / 02 / 03 三条决策 ✓

### 子任务 5.4 · 回归验证

- [x] **5.4.1** `npm test` 通过（27/27）✓
- [x] **5.4.2** `tsc --noEmit` + `node esbuild.config.mjs production` 双通过 ✓
- [ ] **5.4.3** 手动检查清单（由用户完成）：
  - 删 `dashboard.md` → 打开工作台 → 文件**只**含 `banner:` + `columns: []`
  - 删 `dashboard.md` 里所有 `## H2` 与 `columns:` 块 → 重新打开 → 工作台为空，文件**不被改回**
  - Banner 编辑弹窗：**只**一个图片地址输入框，label/placeholder 正确显示
  - 填 URL → banner 立即按主图样式显示（vault 路径 / https URL 均可）

---

## Step 6 — v1.4.9 Bug 修复（BUG-003）

### 子任务 6.1 · BUG-003c：新增 `updateFrontmatterField` 列级写入路径

- [x] **6.1.1** 在 `SyncEngine` 新增私有方法 `updateFrontmatterField(file, mutate)` ✓
- [x] **6.1.2** 暴露公开方法 `updateColumnsField(updater)` ✓
- [x] **6.1.3** 改写 `setColumnSectionType` / `setColumnArchiveCompleted` 走新路径 ✓
- [x] **6.1.4** 错误处理：`processFrontMatter` 失败时 `console.error` + `new Notice` 兜底 ✓
- [x] **6.1.5** `tsc --noEmit` 通过 ✓
- [x] **6.1.6** `node esbuild.config.mjs production` 通过 ✓

### 子任务 6.2 · BUG-003a：修复切换分区类型不刷新

- [x] **6.2.1** `view.ts:onColumnSectionTypeChange` callback 额外 requestRender 一次 ✓
- [x] **6.2.2** `updateColumnsField` 内同步 `notifyCallbacks` → `view.requestRender(newData)` ✓
- [x] **6.2.3** **fix #2**（用户反馈「你只是刷新了样式，数据需要读取刷新！」）：
      之前 callback 调 `setColumnSectionType` → 同步 `notifyCallbacks(NEW)` → RAF 调度 `requestRender(OLD_REFERENCE)`，
      再调 `getData()` 拿 NEW。但 RAF 真正 fire 时，render 走的是 `this.data` 同步路径，
      `this.data` 在 RAF 触发前会被 `updateFrontmatterField` 的 re-parse **重新赋值为新对象**，
      结果 render 拿到的是「新对象的旧 sectionType」——所以样式刷了，sectionType 没刷。
  - [x] **6.2.3.a** 新增 `SyncEngine.persistColumnMutation(nextData)` 公开方法：
    1. 同步接管 `this.data = nextData`
    2. 同步 `notifyCallbacks`
    3. 异步 `processFrontMatter` 只写 `columns` 字段 ✓
  - [x] **6.2.3.b** `view.ts:onColumnSectionTypeChange`（主视图）改为：
    1. 同步构造 `nextColumns` / `nextData`
    2. 调 `this.requestRender(nextData)` **直接用 nextData 引用**
    3. 后台 `this.sync.persistColumnMutation(nextData)` 持久化 ✓
  - [x] **6.2.3.c** `view.ts:onColumnSectionTypeChange`（embedded）同样改为：先 `self.embeddedData = nextData`，再 `self.render(currentData)`，最后 `await self.saveEmbeddedAndRefresh()` ✓
  - [x] **6.2.3.d** 清理调试日志 ✓
  - [x] **6.2.3.e** `tsc --noEmit` + `esbuild production` 双通过 ✓
- [ ] **6.2.4** 用户验证切分区类型 → 视图**同帧**反映新 sectionType（卡片、按钮、accordion 行为都按新类型变）⚠️

### 子任务 6.3 · BUG-003b：serialize() 条件输出 banner 块

- [x] **6.3.1** `parser.ts:serialize` 删除硬编码 `lines.push("banner:")` ✓
- [x] **6.3.2** 改为 `if (data.banner.image) { ... }` 条件块 ✓
- [x] **6.3.3** `parseBanner` 保持现状（向后兼容）✓
- [x] **6.3.4** `generateEmptyDashboardMarkdown` 注释更新为「no banner block」✓
- [x] **6.3.5** `tsc --noEmit` 通过 ✓
- [x] **6.3.6** `node esbuild.config.mjs production` 通过 ✓

### 子任务 6.4 · 文档与版本号同步

- [x] **6.4.1** `manifest.json` + `package.json` 版本号 `1.4.8 → 1.4.9` ✓
- [x] **6.4.2** `CHANGELOG.md` 顶部追加 `## 1.4.9 (2026-06-15)` 节 ✓
- [x] **6.4.3** `README.md` + `README_ZH.md` 检查：**纯 bug 修复，仅 Changelog 同步** ✓
- [x] **6.4.4** `.plan/decisions.md` 留痕：v1.4.9 三条决策（D-04 / 05 / 06）✓

### 子任务 6.5 · 回归验证

- [x] **6.5.1** `npm test` 通过（27/27）✓
- [x] **6.5.2** `tsc --noEmit` + `node esbuild.config.mjs production` 双通过 ✓
- [ ] **6.5.3** 手动检查清单（由用户完成）：
  - 切分区类型 → 视图**同帧**反映新样式
  - 切分区类型 → `dashboard.md` 中**除 `columns:` 块外**内容 byte-identical
  - 删 `dashboard.md` → 打开 → 文件**不含** `banner:` 块
  - 编辑 banner（填 URL）→ 文件**才**含 `banner:` 块
  - 老用户的已有 `banner:` 块文件仍能正常显示 banner

---

## 修复记录

按「修复：[问题描述]」格式记录。

## 实现变更

按「实现变更：[说明]」格式记录非功能性的实现调整。
