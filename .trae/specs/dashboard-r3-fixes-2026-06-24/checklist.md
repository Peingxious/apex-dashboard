# Checklist

## 1.1 Memo 转笔记只写标题双链
- [x] `createCallbacks.onMemoConvertToNote` 文件正文 = `[[<basename>]]\n`
- [x] `createEmbeddedCallbacks.onMemoConvertToNote` 文件正文 = `[[<basename>]]\n`
- [x] `createOverlayCallbacks.onMemoConvertToNote`（sidebar）文件正文 = `[[<basename>]]\n`
- [x] 文件名清洗逻辑保留（去 `[[`、`]]`、路径分隔符、非法字符）
- [x] 目标路径仍走 `getAvailablePathForAttachment` 拿到不冲突路径
- [x] 成功 / 失败 Notice 保留
- [x] 原 Memo 卡片不删
- [x] 文件正文**不**含 body / blockquote
- [x] 标题本身是双链时文件名清洗正确

## 2.1 TodoPlus 源文件追加标识注释
- [x] **(回退) 不再追加 HTML 注释** — 用户在 R3 反馈中明确要求去掉，恢复 R2 的"只追加 `## <heading>\n`"行为
- [x] 旧行为保留：源文件无 `## To-do` 时自动追加 `## To-do\n`
- [x] 嵌入式模式同样生效

## 3.1 去除卡片 hover 视觉
- [x] 删 `.dashboard-card:hover`（L5732-5735）
- [x] 删 `.dashboard-memo-view:hover`（L6118-6120）
- [x] 删各主题下 `.dashboard-card:hover` 块：aurora / prism / island（亮+暗）/ haze / blossom / matcha / lilac
- [x] 删移动端 `.dashboard-card:hover` 块
- [x] 保留 resize handle hover / 按钮 hover / card-actions 显示规则 / `[draggable]:active` / `dragging` 视觉
- [x] CSS 大括号平衡（1451/1451）
- [x] hover 卡片无 box-shadow / background / border 变化（待用户实测）
- [x] hover 卡片内 wikilink 200ms 后 Page Preview 正常弹出（待用户实测）
