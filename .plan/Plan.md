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
  - 5.1.1.d ~~鍒犻櫎 `localImages` 瀛楁銆乣onSave` 涓 `updates.images` 鐨勮祴鍊紐~ 鉁?
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
  - 5.1.4.b `parseBanner` 浠嶅彲璇?`images`锛堝悜鍚庡吋瀹癸級锛屼絾**涓?*琚娇鐢?鉁?
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
  - 鍒?`dashboard.md` 鈫?鎵撳紑宸ヤ綔鍙?鈫?鏂囦欢**鍙?*鍚?`banner:` + `columns: []`
  - 鍒?`dashboard.md` 閲屾墍鏈?`## H2` 涓?`columns:` 鍧?鈫?閲嶆柊鎵撳紑 鈫?宸ヤ綔鍙颁负绌猴紝鏂囦欢**涓嶈鏀瑰洖**
  - Banner 缂栬緫寮圭獥锛?*鍙?*涓€涓浘鐗囧湴鍧€杈撳叆妗嗭紝label/placeholder 姝ｇ‘鏄剧ず
  - 濉?URL 鈫?banner 绔嬪嵆鎸変富鍥炬牱寮忔樉绀猴紙vault 璺緞 / https URL 鍧囧彲锛?

---

## Step 6 鈥?v1.4.12 Bug 淇锛圔UG-003锛?

### 瀛愪换鍔?6.1 路 BUG-003c锛氭柊澧?`updateFrontmatterField` 鍒楃骇鍐欏叆璺緞

- [x] **6.1.1** 鍦?`SyncEngine` 鏂板绉佹湁鏂规硶 `updateFrontmatterField(file, mutate)` 鉁?
- [x] **6.1.2** 鏆撮湶鍏紑鏂规硶 `updateColumnsField(updater)` 鉁?
- [x] **6.1.3** 鏀瑰啓 `setColumnSectionType` / `setColumnArchiveCompleted` 璧版柊璺緞 鉁?
- [x] **6.1.4** 閿欒澶勭悊锛歚processFrontMatter` 澶辫触鏃?`console.error` + `new Notice` 鍏滃簳 鉁?
- [x] **6.1.5** `tsc --noEmit` 閫氳繃 鉁?
- [x] **6.1.6** `node esbuild.config.mjs production` 閫氳繃 鉁?

### 瀛愪换鍔?6.2 路 BUG-003a锛氫慨澶嶅垏鎹㈠垎鍖虹被鍨嬩笉鍒锋柊

- [x] **6.2.1** `view.ts:onColumnSectionTypeChange` callback 棰濆 requestRender 涓€娆?鉁?
- [x] **6.2.2** `updateColumnsField` 鍐呭悓姝?`notifyCallbacks` 鈫?`view.requestRender(newData)` 鉁?
- [x] **6.2.3** **fix #2**锛堢敤鎴峰弽棣堛€屼綘鍙槸鍒锋柊浜嗘牱寮忥紝鏁版嵁闇€瑕佽鍙栧埛鏂帮紒銆嶏級锛?
      涔嬪墠 callback 璋?`setColumnSectionType` 鈫?鍚屾 `notifyCallbacks(NEW)` 鈫?RAF 璋冨害 `requestRender(OLD_REFERENCE)`锛?
      鍐嶈皟 `getData()` 鎷?NEW銆備絾 RAF 鐪熸 fire 鏃讹紝render 璧扮殑鏄?`this.data` 鍚屾璺緞锛?
      `this.data` 鍦?RAF 瑙﹀彂鍓嶄細琚?`updateFrontmatterField` 鐨?re-parse **閲嶆柊璧嬪€间负鏂板璞?*锛?
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
  - 鍒囧垎鍖虹被鍨?鈫?`dashboard.md` 涓?*闄?`columns:` 鍧楀**鍐呭 byte-identical
  - 鍒?`dashboard.md` 鈫?鎵撳紑 鈫?鏂囦欢**涓嶅惈** `banner:` 鍧?
  - 缂栬緫 banner锛堝～ URL锛夆啋 鏂囦欢**鎵?*鍚?`banner:` 鍧?
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

