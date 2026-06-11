# Apex Dashboard 开发计划（Plan）

> 目标与范围以 [Target.md](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/Target.md) 为准。

## 当前状态概览
- ✅ 已让项目能够通过 `npm run build`
- ✅ 已移除会刷屏的调试日志（console.log）
- ✅ 已补齐若干“空壳模块”（小组件选择、天气配置、提醒弹窗、求签数据等），避免运行时报错

---

## Step 1（工程可构建）
- [x] 修复 build 脚本参数错误（tsc 参数）
- [x] 补齐 tsconfig.json，使 tsc 有可编译入口
- [x] 调整 TS lib（DOM.Iterable）以支持 NodeList 迭代
- [x] 让 `npm run build` 通过（tsc + esbuild）

## Step 2（核心功能稳定）
- [x] 修复文件建议输入（FileSuggest）作用域错误导致的运行时报错
- [x] 修复“标题转列”跳过自引用标题的逻辑，避免误伤其它标题
- [x] 移除 Parser/Renderer 中的调试 console.log，避免影响性能与控制台可用性

## Step 3（UI/Modal 补齐）
- [x] 补齐 WidgetTypeModal：可选择 weather / tracker 小组件类型
- [x] 补齐 WeatherConfigModal：城市搜索（Open-Meteo geocode）+ 手动经纬度兜底
- [x] 补齐 ReminderNoticeModal：到期提醒（关闭/稍后提醒）
- [x] 补齐 FortuneStick（求签）基础数据与抽签逻辑，使农历组件入口可用

## Step 4（后续迭代清单）
- [ ] 节假日数据源：接入稳定 API 或本地缓存（现在为降级空数据）
- [ ] Workspace API 规范化：替换兼容写法，减少 `unknown as`（保持行为不变）
- [ ] 统一错误处理：关键异步流程补齐 Notice 反馈（例如网络失败/解析失败）
- [ ] 性能优化：大 Vault 扫描（如文件筛选/搜索）增加缓存与节流
- [ ] 自动化检查：补一组最小单元测试（parser/serialize 循环、frontmatter 注入/移除）

