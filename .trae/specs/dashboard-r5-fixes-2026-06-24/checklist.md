# Checklist

## 1.1 源文件标题判定改为实时读
- [x] `ensureTodoPlusHeading` 不再读 `app.metadataCache.getFileCache(file).headings`
- [x] 改为 `await app.vault.cachedRead(file)` + 自写 heading 扫描器
- [x] heading 扫描正则：`^(#{1,6})[ \t]+(.+?)[ \t]*$`（与 metadataCache 语义一致）
- [x] 已存在 `## <heading>` 时 return `true`、不写文件
- [x] 不存在时 `vault.process` 追加 `## <heading>\n`
- [x] 写失败 catch + Notice
- [x] `scanMarkdownHeadings` 抽为独立函数（renderer.ts:5178），JSDoc 说明 ATX-only 边界
- [x] cachedRead 错误也走 Notice + return false（与 vault.process 错误处理一致）
- [x] TypeScript 编译通过（`tsc --noEmit`）
- [x] esbuild production 构建通过
- [x] 现有 wikilink-context 测试 27/27 通过
- [x] 现有 migration 测试通过
- [ ] 手动删 `121.md` 的 `## To-do` → 新建 TodoPlus 卡片 → 文件确实被改写（待用户实测）
- [ ] 已有 `## To-do` → 任何调用都不重写文件（待用户实测）

## 2.1 `renderDashboard` 新增 `sourcePath` 参数
- [x] 签名第 6 个参数 `sourcePath?: string`
- [x] 透传到 `renderSection`（renderer.ts:2861）
- [x] 透传到 `renderCard`（renderer.ts:3310）→ `renderCardBody`（renderer.ts:3736）
- [x] `renderColumnTitle` 接收 `sourcePath` 显式优先
- [x] `renderTaskBody` 第 6 参数保持 `sourcePath?: string`，已使用
- [x] `renderMemoBody` 新增 `sourcePath?: string` 参数
- [x] `renderMemoViewContent` 第 4 参数保持 `sourcePath?: string`
- [x] `renderTodoPlusBody` 新增 `sourcePath?: string` 参数
- [x] `renderTodoPlusItem` 接收 `sourcePath`（renderer.ts:4559 调用点）
- [x] `renderProjectBody` 第 5 参数保持 `sourcePath?: string`
- [x] `renderWikilink` 内部 hover dispatch 用显式 sourcePath 优先
- [x] `renderWikilink` 内部 data-link-path 解析也用显式 sourcePath 优先
- [x] `renderWikilink` 内部右键菜单 `file-menu` 也用显式 sourcePath 优先

## 2.2 view.ts 调用点
- [x] 主 dashboard 模式：`renderDashboard` 第 6 参数 = `this.sync.getFile()?.path`
- [x] embedded 模式：`renderDashboard` 第 6 参数 = `this.embeddedNotePath`
- [x] 统一为 `hostSourcePath` 局部变量（view.ts:306-308）

## 2.3 sidebar-view.ts 调用点
- [x] 主面板 `renderDashboard` 第 6 参数 = `this.sync.getFile()?.path`
- [x] overlay 模式 `renderDashboard` 第 6 参数 = `this.overlayNotePath ?? undefined`
- [x] sidebar-view.ts:115-129 + sidebar-view.ts:211-221 都已更新

## 2.4 验证
- [x] TypeScript 编译通过
- [x] esbuild production 构建通过
- [ ] 主区打开 `测试.md`、右侧 dashboard → hover `[[121#To-do]]` → Page Preview 显示 `121.md` 的 `## To-do` 区块（待用户实测）
- [ ] 主区打开 dashboard（tab 模式）→ hover 内部 wikilink → 正常显示目标文件（待用户实测）
- [ ] embedded 模式 → hover 内部 wikilink → 正常显示目标文件（待用户实测）
