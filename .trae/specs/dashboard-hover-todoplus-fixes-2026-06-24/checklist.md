# Checklist

## 1.1 TodoPlus 渲染时 lazy auto-create
- [x] 第一次 `resolveTodoPlusSlice` 返回 null 后 400ms 重试
- [x] 二次仍 null 时调 `ensureTodoPlusHeading(app, file, heading)`
- [x] 自愈后**再**调一次 `resolveTodoPlusSlice`
- [x] 自愈成功 → 渲染空清单 + `+ 添加任务` 输入
- [x] 自愈失败（源文件不存在）→ 显示原错误态，不抛错
- [x] 已有 `## To-do` 的卡片不触发 auto-create（无副作用）
- [x] 嵌入式模式同样生效

## 1.2 渲染时自愈期间显示过渡态
- [x] 第一次解析失败到 auto-create 完成前显示 `renderer.todoPlusPreparing` 文案
- [x] 自愈成功后过渡态被替换为正常清单
- [x] 自愈失败时过渡态被替换为错误态

## 2.1 修复 hover source path
- [x] `renderWikilink` 签名加 `sourcePath?: string`
- [x] `link-hover` 派发用 `sourcePath ?? app.workspace.getActiveFile()?.path ?? ""`
- [x] `renderInlineMarkdown` / `renderInlineToken` 透传 `sourcePath`
- [x] `renderColumnTitle` 调用点传 source path
- [x] `renderCard` 标题调用点传 source path
- [x] `renderTaskBody` 调用点传 source path
- [x] `renderMemoViewContent` 调用点传 source path
- [x] `renderProjectItem` 调用点传 source path
- [x] `renderTodoPlusItem` 调用点传 source path
- [x] view.ts / sidebar-view.ts / embedded 三套回调都传 source path（通过 wrapper 内 `sourcePath ?? getActiveFile()?.path ?? ""` 兜底，无需改回调链）

## 2.2 保留右键 file-menu
- [x] 右键 wikilink 仍触发 `file-menu` workspace 事件
- [x] 右键行为不受 source path 修复影响
- [x] 未解析 wikilink 的 fallback 菜单仍可用
