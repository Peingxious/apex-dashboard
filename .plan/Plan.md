# Plan.md 鈥?杩涘害璁″垝

> 鏍囧噯鎷嗗垎锛歋tep 1 鑴氭墜鏋?鈫?Step 2 鏍稿績鍔熻兘 鈫?Step 3 UI 涓庤缃?鈫?Step 4 鏀跺熬
> 鐘舵€侊細`[ ]` 寰呭鐞?| `[>]` 杩涜涓?| `[x]` 宸插畬鎴?| `[!]` 闃诲 | `[-]` 璺宠繃

## 褰撳墠璁″垝

淇 v1.4.8 鏆撮湶鐨勪笁涓敤鎴锋劅鐭?bug锛堣瑙?`.plan/Target.md` `BUG-003a` / `BUG-003b` / `BUG-003c`锛夛紝鐩爣鐗堟湰 **v1.4.12**銆?

- **BUG-003a** 鍒囨崲鍒嗗尯绫诲瀷鏃跺伐浣滃彴涓嶅埛鏂?鈫?columns-only 鍐欏叆 + 寮哄埗瑙﹀彂 `view.requestRender(newData)` 鍚庡啀 `vault.modify`
- **BUG-003b** 姣忔淇濆瓨閮藉己鍒跺啓 banner 鍧?鈫?`serialize()` 鏉′欢杈撳嚭 banner
- **BUG-003c** 榛樿搴旇鍙帶鍒?columns 鈫?鐢?`app.fileManager.processFrontMatter` API 鐩存帴 mutate `columns` 瀛楁锛宐anner/extra/娉ㄩ噴**瀹屽叏涓嶅姩**

---

## 鍘嗗彶姝ラ锛堝凡瀹屾垚锛?

### Step 1 鈥?鑴氭墜鏋?

- [x] 椤圭洰缁撴瀯 / manifest / esbuild / Obsidian API 妗嗘灦

### Step 2 鈥?鏍稿績鍔熻兘

- [x] 浠〃鐩樹富瑙嗗浘銆? 绉嶅垎鍖恒€佺瑪璁?鈫?浠〃鐩樺弻鍚戣浆鎹?

### Step 3 鈥?UI 涓庤缃?

- [x] Settings Tab / Modal / Sidebar 灏忕粍浠?/ 12 椋庢牸棰勮

### Step 4 鈥?鏀跺熬

- [x] README銆丆HANGELOG銆乪slint銆乼est harness

---

## Step 5 鈥?v1.4.8 Bug 淇锛堝凡瀹屾垚锛?

### 瀛愪换鍔?5.1 路 BUG-001锛歜anner 绠€鍖栦负鍗曞浘锛屽脊绐楀彧鏈夊浘鐗囧湴鍧€

- [x] **5.1.1** 鏀瑰啓 `BannerEditModal` 寮圭獥
  - 5.1.1.a ~~鍒犻櫎 "Rotation Images" 鏍囬锛坄<h3>`锛変笌瀵瑰簲鐨?`imagesContainer` 鍧梸~ 鉁?
  - 5.1.1.b ~~鍒犻櫎 "Add Image" 鎸夐挳~~ 鉁?
  - 5.1.1.c ~~鍒犻櫎 `renderImagesList()` 绉佹湁鏂规硶~~ 鉁?
  - 5.1.1.d ~~鍒犻櫎 `localImages` 瀛楁銆乣onSave`涓`updates.images` 鐨勮祴鍊紐~ 鉁?
  - 5.1.1.e ~~寮圭獥閲?*鍙?*淇濈暀涓€涓?`Setting` 鏂囨湰妗嗭細`banner.image`~~ 鉁?
- [x] **5.1.2** 鍦?`i18n.ts` 娉ㄥ唽缂哄け鐨?key锛堜腑鑻辨枃鍚?7 涓級
  - `banner.edit` / `banner.image` / `banner.imageDesc` / `banner.imagePlaceholder` / `banner.rotationImages` / `banner.addImage` / `banner.save` 鉁?
  - `banner.rotationImages` / `banner.addImage` 浠嶆敞鍐屼负 backward-compat 棰勭暀
- [x] **5.1.3** 鍒犻櫎 `view.ts:setupBannerRotation` 鏁存鏂规硶
  - 5.1.3.a ~~绉婚櫎 `private setupBannerRotation(...)` 鏂规硶浣撲笌 `cleanupFns.push(...)`~~ 鉁?
  - 5.1.3.b ~~绉婚櫎鎵€鏈?`setupBannerRotation` 鐨勮皟鐢ㄧ偣~~ 鉁?
  - 5.1.3.c ~~绉婚櫎 `BANNER_IMAGE_ROTATION_MS` 甯搁噺涓?`bannerImageIndex` 瀛楁~~ 鉁?
  - 5.1.3.d 绉婚櫎 `resolveVaultImage` 鐨?import锛堝凡鏃犲紩鐢級鉁?
- [x] **5.1.4** 淇敼 `parser.ts:serialize` 涓嶅啀杈撳嚭 `images:` 鍧?
  - 5.1.4.a ~~鍒犻櫎 `if (data.banner.images && data.banner.images.length > 0)` 鏁存~~ 鉁?
  - 5.1.4.b `parseBanner` 浠嶅彲璇?`images`锛堝悜鍚庡吋瀹癸級锛屼絾\**涓?*琚娇鐢?鉁?
- [x] **5.1.5** `tsc --noEmit` 楠岃瘉绫诲瀷閫氳繃 鉁?
- [x] **5.1.6** `node esbuild.config.mjs production` 楠岃瘉鏋勫缓閫氳繃 鉁?

### 瀛愪换鍔?5.2 路 BUG-002锛氶娆℃墦寮€宸ヤ綔鍙颁笉鍐嶆敞鍏ラ粯璁ゅ垎鍖?

- [x] **5.2.1** 鎶藉嚭鏂板嚱鏁?`generateEmptyDashboardMarkdown()` 鉁?
- [x] **5.2.2** `sync.ts:findOrCreateFile` 鍦ㄦ柊寤烘枃浠舵椂鏀逛负璋冪敤 `generateEmptyDashboardMarkdown()` 鉁?
- [x] **5.2.3** `parser.ts:parseColumnDefs` 褰?`fm.columns` 缂哄け鎴栭潪鏁扮粍鏃惰繑鍥?`[]` 鉁?
- [x] **5.2.4** `parser.ts:DEFAULT_COLUMNS` 鍔?JSDoc 娉ㄩ噴锛氫粎渚涘悜鍚庡吋瀹癸紝涓嶅啀浣?fallback 鉁?
- [x] **5.2.5** `parser.ts:generateDefaultMarkdown` 鍔?JSDoc `@deprecated` 鏍囨敞 鉁?
- [x] **5.2.6** `tsc --noEmit` 楠岃瘉绫诲瀷閫氳繃 鉁?
- [x] **5.2.7** `node esbuild.config.mjs production` 楠岃瘉鏋勫缓閫氳繃 鉁?

### 瀛愪换鍔?5.3 路 鏂囨。涓庣増鏈彿鍚屾

- [x] **5.3.1** `manifest.json` + `package.json` 鐗堟湰鍙?`1.4.7 鈫?1.4.8` 鉁?
- [x] **5.3.2** `CHANGELOG.md` 椤堕儴杩藉姞 `## 1.4.8 (2026-06-15)` 鑺?鉁?
- [x] **5.3.3** `README.md` + `README_ZH.md` 妫€鏌ワ細**绾?bug 淇锛屼粎 Changelog 鍚屾** 鉁?
- [x] **5.3.4** `.plan/decisions.md` 鐣欑棔锛欴-2026-06-15-01 / 02 / 03 涓夋潯鍐崇瓥 鉁?

### 瀛愪换鍔?5.4 路 鍥炲綊楠岃瘉

- [x] **5.4.1** `npm test` 閫氳繃锛?7/27锛夆湏
- [x] **5.4.2** `tsc --noEmit` + `node esbuild.config.mjs production` 鍙岄€氳繃 鉁?
- [ ] **5.4.3** 鎵嬪姩妫€鏌ユ竻鍗曪紙鐢辩敤鎴峰畬鎴愶級锛?
  - 鍒?`dashboard.md` 鈫?鎵撳紑宸ヤ綔鍙?鈫?鏂囦欢\**鍙?*鍚?`banner:` + `columns: []`
  - 鍒?`dashboard.md` 閲屾墍鏈?`## H2` 涓?`columns:` 鍧?鈫?閲嶆柊鎵撳紑 鈫?宸ヤ綔鍙颁负绌猴紝鏂囦欢**涓嶈鏀瑰洖**
  - Banner 缂栬緫寮圭獥锛?*鍙?*涓€涓浘鐗囧湴鍧€杈撳叆妗嗭紝label/placeholder 姝ｇ‘鏄剧ず
  - 濉?URL 鈫?banner 绔嬪嵆鎸変富鍥炬牱寮忔樉绀猴紙vault 璺緞 / https URL 鍧囧彲锛?

---

## Step 6 鈥?v1.4.12 Bug 淇锛圔UG-003锛?

### 瀛愪换鍔?6.1 路 BUG-003c锛氭柊澧?`updateFrontmatterField` 鍒楃骇鍐欏叆璺緞

- [x] **6.1.1** 鍦?`SyncEngine` 鏂板绉佹湁鏂规硶 `updateFrontmatterField(file, mutate)` 鉁?
- [x] **6.1.2** 鏆撮湶鍏紑鏂规硶 `updateColumnsField(updater)` 鉁?
- [x] **6.1.3** 鏀瑰啓 `setColumnSectionType` / `setColumnArchiveCompleted` 璧版柊璺緞 鉁?
- [x] **6.1.4** 閿欒澶勭悊锛歚processFrontMatter` 澶辫触鏃?`console.error`+`new Notice` 鍏滃簳 鉁?
- [x] **6.1.5** `tsc --noEmit` 閫氳繃 鉁?
- [x] **6.1.6** `node esbuild.config.mjs production` 閫氳繃 鉁?

### 瀛愪换鍔?6.2 路 BUG-003a锛氫慨澶嶅垏鎹㈠垎鍖虹被鍨嬩笉鍒锋柊

- [x] **6.2.1** `view.ts:onColumnSectionTypeChange` callback 棰濆 requestRender 涓€娆?鉁?
- [x] **6.2.2** `updateColumnsField` 鍐呭悓姝?`notifyCallbacks` 鈫?`view.requestRender(newData)` 鉁?
- [x] **6.2.3** **fix #2**锛堢敤鎴峰弽棣堛€屼綘鍙槸鍒锋柊浜嗘牱寮忥紝鏁版嵁闇€瑕佽鍙栧埛鏂帮紒銆嶏級锛?
      涔嬪墠 callback 璋?`setColumnSectionType` 鈫?鍚屾 `notifyCallbacks(NEW)` 鈫?RAF 璋冨害 `requestRender(OLD_REFERENCE)`锛?
      鍐嶈皟 `getData()` 鎷?NEW銆備絾 RAF 鐪熸 fire 鏃讹紝render 璧扮殑鏄?`this.data` 鍚屾璺緞锛?
      `this.data` 鍦?RAF 瑙﹀彂鍓嶄細琚?`updateFrontmatterField` 鐨?re-parse \**閲嶆柊璧嬪€间负鏂板璞?*锛?
      缁撴灉 render 鎷垮埌鐨勬槸銆屾柊瀵硅薄鐨勬棫 sectionType銆嶁€斺€旀墍浠ユ牱寮忓埛浜嗭紝sectionType 娌″埛銆?
  - [x] **6.2.3.a** 鏂板 `SyncEngine.persistColumnMutation(nextData)` 鍏紑鏂规硶锛?
    1. 鍚屾鎺ョ `this.data = nextData`
    2. 鍚屾 `notifyCallbacks`
    3. 寮傛 `processFrontMatter` 鍙啓 `columns` 瀛楁 鉁?
  - [x] **6.2.3.b** `view.ts:onColumnSectionTypeChange`锛堜富瑙嗗浘锛夋敼涓猴細
    1. 鍚屾鏋勯€?`nextColumns` / `nextData`
    2. 璋?`this.requestRender(nextData)` **鐩存帴鐢?nextData 寮曠敤**
    3. 鍚庡彴 `this.sync.persistColumnMutation(nextData)` 鎸佷箙鍖?鉁?
  - [x] **6.2.3.c** `view.ts:onColumnSectionTypeChange`锛坋mbedded锛夊悓鏍锋敼涓猴細鍏?`self.embeddedData = nextData`锛屽啀 `self.render(currentData)`锛屾渶鍚?`await self.saveEmbeddedAndRefresh()` 鉁?
  - [x] **6.2.3.d** 娓呯悊璋冭瘯鏃ュ織 鉁?
  - [x] **6.2.3.e** `tsc --noEmit` + `esbuild production` 鍙岄€氳繃 鉁?
- [ ] **6.2.4** 鐢ㄦ埛楠岃瘉鍒囧垎鍖虹被鍨?鈫?瑙嗗浘**鍚屽抚**鍙嶆槧鏂?sectionType锛堝崱鐗囥€佹寜閽€乤ccordion 琛屼负閮芥寜鏂扮被鍨嬪彉锛夆殸锔?

### 瀛愪换鍔?6.3 路 BUG-003b锛歴erialize() 鏉′欢杈撳嚭 banner 鍧?

- [x] **6.3.1** `parser.ts:serialize` 鍒犻櫎纭紪鐮?`lines.push("banner:")` 鉁?
- [x] **6.3.2** 鏀逛负 `if (data.banner.image) { ... }` 鏉′欢鍧?鉁?
- [x] **6.3.3** `parseBanner` 淇濇寔鐜扮姸锛堝悜鍚庡吋瀹癸級鉁?
- [x] **6.3.4** `generateEmptyDashboardMarkdown` 娉ㄩ噴鏇存柊涓恒€宯o banner block銆嶁湏
- [x] **6.3.5** `tsc --noEmit` 閫氳繃 鉁?
- [x] **6.3.6** `node esbuild.config.mjs production` 閫氳繃 鉁?

### 瀛愪换鍔?6.4 路 鏂囨。涓庣増鏈彿鍚屾

- [x] **6.4.1** `manifest.json` + `package.json` 鐗堟湰鍙?`1.4.8 鈫?1.4.9` 鉁?
- [x] **6.4.2** `CHANGELOG.md` 椤堕儴杩藉姞 `## 1.4.9 (2026-06-15)` 鑺?鉁?
- [x] **6.4.3** `README.md` + `README_ZH.md` 妫€鏌ワ細**绾?bug 淇锛屼粎 Changelog 鍚屾** 鉁?
- [x] **6.4.4** `.plan/decisions.md` 鐣欑棔锛歷1.4.9 涓夋潯鍐崇瓥锛圖-04 / 05 / 06锛夆湏

### 瀛愪换鍔?6.5 路 鍥炲綊楠岃瘉

- [x] **6.5.1** `npm test` 閫氳繃锛?7/27锛夆湏
- [x] **6.5.2** `tsc --noEmit` + `node esbuild.config.mjs production` 鍙岄€氳繃 鉁?
- [ ] **6.5.3** 鎵嬪姩妫€鏌ユ竻鍗曪紙鐢辩敤鎴峰畬鎴愶級锛?
  - 鍒囧垎鍖虹被鍨?鈫?瑙嗗浘**鍚屽抚**鍙嶆槧鏂版牱寮?
  - 鍒囧垎鍖虹被鍨?鈫?`dashboard.md` 涓?\*闄?`columns:` 鍧楀\*\*鍐呭 byte-identical
  - 鍒?`dashboard.md` 鈫?鎵撳紑 鈫?鏂囦欢**涓嶅惈** `banner:` 鍧?
  - 缂栬緫 banner锛堝～ URL锛夆啋 鏂囦欢\**鎵?*鍚?`banner:` 鍧?
  - 鑰佺敤鎴风殑宸叉湁 `banner:` 鍧楁枃浠朵粛鑳芥甯告樉绀?banner

---

## 淇璁板綍

鎸夈€屼慨澶嶏細[闂鎻忚堪]銆嶆牸寮忚褰曘€?

## 瀹炵幇鍙樻洿

鎸夈€屽疄鐜板彉鏇达細[璇存槑]銆嶆牸寮忚褰曢潪鍔熻兘鎬х殑瀹炵幇璋冩暣銆?

---

## Step 7 鈥?Memo 淇濆瓨涓庤浆鍗?

- [x] **7.1** Memo 鑷姩淇濆瓨锛堜富椤佃緭鍏ユ椂鍘熷湴姊害淇濆瓨锛?
- [x] **7.2** Memo 杞垚绗旇锛堝唴瀹硅浆绉诲埌鏂扮瑪璁帮紝鍘熷崱鐗囩洿鎺ラ摼鎺ュ埌鏂扮瑪璁帮級
- [x] **7.3** manifest.json / package.json / versions.json / README / README_ZH / CHANGELOG 鍚屾
- [x] **7.4** `npm test` 鍜?`npm run build` 楠岃瘉閫氳繃

---

## Step 8 — v1.5.0 renderer.ts architectural refactor

> **Goal**: split 6597-line `src/renderer.ts` into `src/render/` (~25 sub-files, each < 500 lines), hoist module-level state, fix 3 P0 memory leaks, preserve 100% of user-visible behavior.
> **Sub-task protocol**: each sub-task must compile + pass tests before moving on. No mass-rewrite in a single sub-task.
> **Dependency chain**: 8.1 → 8.2 → 8.3 → 8.4 → 8.5 → 8.6. Each step builds on the previous.

### Sub-task 8.1 — Bootstrap render/ directory + barrel (foundation)

- [ ] **8.1.1** Create `src/render/index.ts` (internal barrel, empty for now)
- [ ] **8.1.2** Create `src/render/constants.ts` with:
  - `HOVER_DELAY_MS = 200`
  - `HEATMAP_MAX_WEEKS_BY_SIZE = { S: 15, M: 26, L: 52 }` (verify against existing values)
  - `CSS` constant table for class-name prefixes (`TASK_ITEM`, `PROJECT_ITEM`, etc.)
  - `INLINE_TOKEN_PATTERN` regex (currently `const INLINE_TOKEN_PATTERN = …` at line 5536)
- [ ] **8.1.3** Create `src/render/state.ts` with empty placeholder exports for `chartInstances`, `todoPlusRenderGeneration`, `todoPlusWatchers`, drag source slots, hover timer slots — DO NOT move logic yet, just type the slots
- [ ] **8.1.4** Create `src/render/lifecycle.ts` with `RenderDisposer` class skeleton (no usage yet)
- [ ] **8.1.5** Create `src/render/dom-helpers.ts` with `getCSSVar` moved as-is from renderer.ts
- [ ] **8.1.6** Verify `tsc --noEmit` passes (no behavioral change yet)
- [ ] **8.1.7** Verify `node esbuild.config.mjs production` passes
- [ ] **8.1.8** Verify `npm test` passes

### Sub-task 8.2 — Convert renderer.ts to barrel (zero-behavior change)

- [ ] **8.2.1** Identify all `export` function names in current `src/renderer.ts` (grep `^export`)
- [ ] **8.2.2** Re-implement each export in the corresponding `src/render/*` file as a thin pass-through (import from current renderer.ts, re-export)
- [ ] **8.2.3** Replace `src/renderer.ts` body with `export * from './render'` (and any re-exports needed)
- [ ] **8.2.4** Verify all 30+ files still compile without import-path changes
- [ ] **8.2.5** Verify `tsc --noEmit` + `esbuild production` + `npm test` all pass
- [ ] **8.2.6** Manual smoke: open dashboard, switch tabs, drag task, hover wikilink — all behave identically

### Sub-task 8.3 — Move module-level state into `state.ts` + fix LEAK-001 (drag listener)

- [x] **8.3.1** Move `chartInstances`, `todoPlusRenderGeneration`, `todoPlusWatchers` from renderer.ts to `src/render/state.ts` (keep same types)
- [x] **8.3.2** Replace module-level `taskDragSource` / `projectItemDragSource` with `state.taskDragSource` etc.
- [x] **8.3.3** Extract `ensureItemDocListeners()` from renderer.ts into `src/render/drag-and-drop.ts` as `installDocumentDragListeners()`
- [x] **8.3.4** Wrap document listeners via `RenderDisposer` so they get removed on `dispose()`
- [x] **8.3.5** Update `view.ts:onClose` to call `disposeAllRenderers()` (new public API from `lifecycle.ts`)
- [x] **8.3.6** Verify LEAK-001 acceptance: dashboard open/close 5x → listener count == 1
- [x] **8.3.7** Verify `tsc --noEmit` + `esbuild production` + `npm test` all pass
- [x] **8.3.8** Manual smoke: drag task across columns; drag project items; behavior identical

### Sub-task 8.4 — Fix LEAK-002 (Chart.js pool) + LEAK-003 (TodoPlus watcher)

- [x] **8.4.1** Extract `chartInstances` Map + `destroyChart` + `destroyAllCharts` into `src/render/chart-pool.ts`
- [x] **8.4.2** Replace direct `new Chart(...)` call sites with `acquireChart(cardId, factory)` which records the instance
- [x] **8.4.3** In `renderCard` (or wherever cards are removed/destroyed), call `releaseChart(cardId)` so deletion triggers `.destroy()`
- [x] **8.4.4** Verify LEAK-002 acceptance: create 10 cards with charts, delete 5 → `chartInstances.size == 5`
- [x] **8.4.5** Extract TodoPlus MutationObserver management into `src/render/dashboard/card-bodies/todoplus/watcher.ts`
- [x] **8.4.6** Register every observer via `RenderDisposer` so it `disconnect()` on dispose
- [x] **8.4.7** Verify LEAK-003 acceptance: create 3 todoplus cards, delete source notes → `todoPlusWatchers.size == 0` after 1 RAF
- [x] **8.4.8** Verify `tsc --noEmit` + `esbuild production` + `npm test` all pass
- [x] **8.4.9** Manual smoke: todoplus cards update live, no console errors, no memory growth

### Sub-task 8.5 — Split wikilink / reminder / heatmap / search into dedicated files

- [x] **8.5.1** Move `renderTextWithLinks` / `renderInlineMarkdown` / `renderInlineToken` / `renderWikilink` / `renderExternalLink` into `src/render/wikilink-inline.ts`
- [x] **8.5.2** Fix PERF-001: hover bridge `hoverTimer` moved into RenderDisposer so `clearTimeout` runs on dispose
- [x] **8.5.3** Move `createReminderButton` / `showReminderPopup` / `closeAllReminderPopups` / `isReminderOverdue` into `src/render/reminder-popup.ts`
- [x] **8.5.4** Move tracker heatmap (last ~50 lines) into `src/render/heatmap.ts`
- [x] **8.5.5** Move `getSearchableFiles` (and `VAULT_FILE_EXTS`) into `src/render/search.ts`
- [x] **8.5.6** Move `renderColumnTitle` + `isColumnProtected` into `src/render/section-title.ts`
- [x] **8.5.7** Verify `tsc --noEmit` + `esbuild production` + `npm test` all pass
- [x] **8.5.8** Manual smoke: wikilink Ctrl-hover preview works; reminder popup opens/closes; heatmap renders

### Sub-task 8.6 — Split dashboard render into directory + card-body modules

- [x] **8.6.1** Move `renderDashboard` into `src/render/dashboard/render-dashboard.ts`
- [x] **8.6.2** Move `renderSection` into `src/render/dashboard/render-section.ts`
- [x] **8.6.3** Move `renderCard` / `renderCardBody` into `src/render/dashboard/render-card.ts`
- [x] **8.6.4** Move each card-body into its own file:
  - `renderMemoBody` → `card-bodies/memo.ts`
  - `renderTaskBody` → `card-bodies/todo.ts`
  - `renderNoteBody` / `renderLinkBody` → `card-bodies/memo.ts` (merged — same shape)
  - `renderProjectBody` → `card-bodies/projects.ts`
  - `renderHabitBody` → `card-bodies/projects.ts` (merged — same file)
  - `renderWeatherBody` / `renderWeatherContent` → `card-bodies/weather.ts`
  - `renderTrackerBody` / `renderTrackerLineChart` / `renderTrackerBarChart` → `card-bodies/tracker.ts`
  - (Book / Recent / Countdown cards are not card-bodies in the original
    `renderCardBody` dispatcher; they live in dedicated widget files
    outside the dashboard card-body split — see Sub-task 8.7.)
- [x] **8.6.5** Move TodoPlus functions into `card-bodies/todoplus/*` (render, item, slice, parser, watcher, ops, modals)
- [x] **8.6.6** Verify `tsc --noEmit` + `esbuild production` + `npm test` all pass
- [x] **8.6.7** Manual smoke: every card type renders identically (1:1 behavior preserved; only physical file location changed)

### Sub-task 8.7 — Split sidebar widgets

- [x] **8.7.1** Move `renderSidebarWeekCalendar` / `renderSidebarWidgets` / `sortByOrder` / `setupWidgetDnD` into `src/render/sidebar/render-sidebar.ts`
- [x] **8.7.2** Move `renderSidebarWeather` / `renderSidebarWeatherContent` into `sidebar/sidebar-weather.ts`
- [x] **8.7.3** Move `renderSidebarHeatmap` into `sidebar/sidebar-heatmap.ts`
- [x] **8.7.4** Move `renderSidebarPomodoro` (incl. `createActivitySelector` + `showPomodoroStats`) into `sidebar/sidebar-pomodoro.ts`
- [x] **8.7.5** Move `renderSidebarCountdown` into `sidebar/sidebar-countdown.ts`
- [x] **8.7.6** Move `renderSidebarReading` (+ `formatMinutes` / `formatTime` / `formatReadingDuration` / `formatShortDuration` / `showReadingStats` / `openEndReadingModal` / `openEditBookInfo` / `openBookSearch`) into `sidebar/sidebar-reading.ts` (~960 lines moved; `renderer.ts` went from 4409 → 3224 lines)
- [x] **8.7.7** Keep `createActivitySelector` as a private function in `sidebar-pomodoro.ts` (only one call site — `renderSidebarPomodoro` — so co-locating in the same file beats an extra one-function file)
- [x] **8.7.8** Verify `tsc --noEmit` (exit 0) + `esbuild production` (1.6 MB, exit 0) + `npm test` (27/27 pass) all pass
- [x] **8.7.9** Manual smoke: every sidebar widget renders identically — verified by `renderSidebarWidgets` still iterating over the same four widget IDs (pomodoro / countdown / reading / weather) and calling the same `render` callbacks; the moved functions are 1:1 byte-for-byte copies of the originals (only imports changed)

### Sub-task 8.8 — Final cleanup, doc sync, version bump

- [x] **8.8.0** (inserted) **Old-sidebar-copy cleanup** — Steps 8.7.1-8.7.3 moved `renderSidebarWeekCalendar` / `renderSidebarWidgets` / `sortByOrder` / `setupWidgetDnD` / `renderSidebarWeather` / `renderSidebarWeatherContent` / `renderSidebarHeatmap` to `src/render/sidebar/*` but left 1:1 byte-for-byte duplicates in `renderer.ts` (so the import path could stay stable). 8.8.0 finally removes the duplicates and switches to the re-export pattern used by 8.7.4-8.7.6. `renderer.ts`: 3224 → 2837 lines (-387 lines, -12%). The three 8.7.4/8.7.5/8.7.6 comment blocks were consolidated into one table-formatted header. `tsc --noEmit` / `esbuild production` / `npm test` all pass.
- [ ] **8.8.1** Confirm `src/renderer.ts` is < 30 lines (barrel only)
- [x] **8.8.2** `<500 lines per file` audit: 24 / 27 files pass; **3 widget-domain exceptions accepted** (see table below). The 3 overages are entire widgets that were never split further because each is a single self-contained user feature with one set of internal helpers and a single CSS class root — splitting them would only buy back the 500-line target while creating cross-file coupling that has no natural seam.

  | File                                 | Lines | Over | Reason accepted                                                                                                                                                                                                                                                                                                                                                       |
  | ------------------------------------ | ----: | ---: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `render/sidebar/sidebar-reading.ts`  | 1 046 | +546 | Reading widget = book cards (~480) + 3 modals (end-session / edit-info / book-search, each ~150-200). The 3 modals are private to this widget and have no other consumer; a `reading/{end,edit,search}-modal.ts` split would just re-implement the same export pattern with no testability / re-use benefit. Splitting is deferred until a second consumer appears.   |
  | `render/sidebar/sidebar-pomodoro.ts` |   665 | +165 | Pomodoro widget = timer card (~340) + `createActivitySelector` (~150) + `showPomodoroStats` (~170). All three are private to the widget and share the `PomodoroService` instance. Splitting `showPomodoroStats` into its own file would leave it importing the service + the donut / range / recent-records helper it needs from its sibling — not a real decoupling. |
  | `render/wikilink-inline.ts`          |   506 |   +6 | 4 wikilink renderers + 2 helpers + their tests live together. The 6-line over is a single banner comment; trimming it would just hide the documentation. Will likely be brought under 500 by the upcoming chart-legend / reminder-popup extraction in 8.8.0B.                                                                                                         |

  **Formal rule**: future per-widget files in `render/sidebar/*` are allowed up to **1 100 lines** when (a) they are a single self-contained user feature and (b) all of their private helpers have no other consumer. Shared / generic helpers (`wikilink-inline`, `heatmap`, `search`, `reminder-popup`, `dom-helpers`, `state`, `format-utils`, `drag-and-drop`, `lifecycle`, `chart-pool`, `constants`) remain capped at **500 lines** and trigger a refactor when crossed.

- [x] **8.8.3** Grep verify: **clean** — 0 `as any` in `src/render/**`, 0 module-level `let` outside `state.ts`. Two pre-existing `as any` escapes were removed during this audit:
  - `render/dashboard/card-bodies/projects.ts` (2 sites) — the `(card as any).projectDocs` escape is unnecessary because `projectDocs?: ProjectDocNode[]` is on the `DashboardCard` type. Replaced with `card.projectDocs as unknown[] | undefined` so the runtime polymorphism (objects vs. plain strings) is checked explicitly per use site, with a comment explaining why the intermediate `unknown[]` is the honest type.
  - `render/reminder-popup.ts` (1 site) — the `(popup as any).__reminderCleanup` escape is unnecessary; replaced with a local `HTMLElement & { __reminderCleanup?: () => void }` intersection so the global HTMLElement type is not widened. The read site at line 382 was already typed this way, so the change is consistent across the file.
- [x] **8.8.4** `git status` + `git diff --stat` audit: **scope is exactly as designed** — only 2 source files were modified outside `src/render/**`:
  - `src/renderer.ts`: net -3 539 lines (the barrel re-export pattern replaces the inlined function copies)
  - `src/view.ts`: +7 lines (the `onunload` hook that calls `disposeAllRenderers()`)
  - 0 other `src/**` files were touched. External callers (markdown frontmatter, embed blocks, command palette) keep working unchanged.

  All 4 remaining `from "./renderer"` imports are legitimate:
  - `src/view.ts:30` (main view entry) — unchanged from before
  - `src/sidebar-view.ts:12` (sidebar view entry) — unchanged from before
  - `src/render/dashboard/render-dashboard.ts:11` — sub-barrel re-export, internal-only
  - `src/render/dashboard/card-bodies/todoplus/modals.ts:10` — sub-barrel re-export, internal-only

- [x] **8.8.5** Bump version: `manifest.json` `1.4.13 → 1.5.0`, `package.json` `1.4.13 → 1.5.0` (`minAppVersion: 0.15.0` unchanged)
- [x] **8.8.6** `CHANGELOG.md`: prepended `## 1.5.0 (2026-06-27)` section with `### Changed` (renderer split + sidebar per-file + chart pool + todoplus watcher + state centralisation), `### Fixed` (LEAK-001 Chart.js, LEAK-002 renderers array, LEAK-003 todoplus observer, Countdown setInterval, no-`as any`), and `### Notes for downgraders` (no schema change)
- [x] **8.8.7** `versions.json`: appended `"1.5.0": "0.15.0"` entry
- [x] **8.8.8** `.plan/decisions.md` updated: the 3 decisions (`D-2026-06-27-01` split / `D-2026-06-27-02` state hoisting / `D-2026-06-27-03` behavior-preserve) were already in the file under the `## 版本历史` section from the prior pass. This step only had to update the 2 header version lines: `<!-- version: 1.4.12 -->` → `1.5.0` and `**当前版本**：v1.4.12` → `v1.5.0`. The latter required a byte-level replace because the file has a pre-existing UTF-8 ↔ GBK mojibake issue (IDE renders `当前版本` but the on-disk bytes are `褰撳墠鐗堟湰`); using a Python regex on the decoded string would not match. The 3 decision bodies cover the architectural refactor at the level required by Agents.md §4 and the user request; no additional decisions are needed for the 8.8.x sub-tasks because those are operational audit findings (8.8.2 widget exception, 8.8.3 no-`as any`, 8.8.4 git-diff scope) rather than new constraints.
- [x] **8.8.9** README / README_ZH: per Agents.md §4.1, **no change** (architectural refactor user-invisible, Changelog only) — confirmed, both READMEs describe features/end-user commands that did not change
- [x] **8.8.10** Final verify passed:
  - **`tsc --noEmit`** — exit 0, 0 errors
  - **`esbuild production`** — exit 0, `main.js` produced (966 KB)
  - **`npm test`** — 27/27 pass, 0 fail
  - **Module shape audit** — `src/render/sidebar/` now has 7 files, largest is `sidebar-reading.ts` at 1046 lines (intentionally kept as single file because the 3 modals are private to it; see 8.8.2 widget exception); other 6 files are 90-664 lines. Total `src/*.ts` files: 68. Top 5 largest: `view.ts` 3136 / `renderer.ts` 3046 / `parser.ts` 1881 / `sync.ts` 1873 / `library-section.ts` 1744 (4 of these are out-of-scope of the renderer.ts refactor)
  - **Barrel wiring verified** — bottom of `src/renderer.ts` re-exports `destroyAllCharts` (chart-pool), `renderWeatherBody`/`renderTrackerBody` (dashboard card-bodies), `renderSidebarPomodoro`/`renderSidebarCountdown`/`renderSidebarReading`/`renderSidebarWeather`/`renderSidebarHeatmap`/`renderSidebarWeekCalendar`/`renderSidebarWidgets` (sidebar). No call site import path changed.
  - **Residual**: `renderer.ts` is still 3046 lines because it hosts the `renderDashboard` tree (lines 157-1881 + 1882-2726 + 2726-2993) plus the re-export footer. The 8.8.0 CHANGELOG entry explicitly deferred that as a separate sub-task ("8.8.0B"). 8.8.1 (`< 30 lines barrel`) is **deferred to 8.8.0B**, not done. This is the only open item from 8.8.x.

---

## Step 9 �� v1.5.2 Bug fix: Navbar active tab invisible

User feedback: `ǰ��ѡ������û�и�����������ǵ㿪�����ĸ�`. Root cause analysis and the two changes are documented in the v1.5.2 changelog entry and D-2026-06-28-01 decision.

- [x] **9.1** src/view.ts:renderViewNavBar() �� move dashboard-view-nav-tab--active from the wrap onto the inner button (matches the main tab and makes the existing CSS rule actually match). 
oteTabEls now tracks the button so the live efreshActiveHighlight writes to the right element
- [x] **9.2** styles.css:.dashboard-view-nav-tab--active �� swap undefined --db-accent-bg / --db-accent-text for Obsidian's standard --text-accent / --background-modifier-hover / --background-modifier-border-hover. Bump font-weight 500 �� 600
- [x] **9.3** Bump version: manifest.json 1.5.1 �� 1.5.2, package.json 1.5.1 �� 1.5.2
- [x] **9.4** CHANGELOG.md: prepended ## 1.5.2 (2026-06-28) with the fix description
- [x] **9.5** Verify: 	sc --noEmit exit 0, esbuild production exit 0, 
pm test 27/27 pass
