# Target.md 鈥?闇€姹傚瓨妗?

> 鏈枃浠剁敱 Agent 鍦ㄣ€岄樁娈?0锛氶渶姹傞棶璇€嶇粨鏉熷悗鍐欏叆銆?
> 浠讳綍闇€姹傚彉鏇村繀椤诲悓姝ユ洿鏂版湰鏂囦欢锛屽苟鍦?`.plan/decisions.md` 鐣欑棔銆?

## 褰撳墠闇€姹?

**鎻掍欢鍚嶇О**锛歛pex-dashboard
**褰撳墠闃舵**锛氬凡涓婄嚎缁存姢鏈燂紙v1.4.12锛?
**鏍稿績鍔熻兘**锛歄bsidian 浠〃鐩樹笌渚ц竟鏍忚仛鍚堣鍥?

## 鏍囧噯鏍煎紡

姣忔鏂板/璋冩暣鍔熻兘鏃讹紝鎸変互涓嬫牸寮忚褰曪細

```
銆愯Е鍙戞柟寮忋€戝懡浠ら潰鏉?/ 鍔熻兘鍖烘寜閽?/ 浜嬩欢鐩戝惉
銆愭牳蹇冩祦绋嬨€戞楠? 鈫?姝ラ2 鈫?姝ラ3
銆愭暟鎹瓨鍌ㄣ€戞槸/鍚︼紝瀛樺偍鍐呭锛?..
銆怳I 缁勪欢銆慡ettings Tab / Modal / Leaf View / 鏃?
```

## 鍔熻兘鍒楄〃

| ID    | 鏍囬                                                | 绫诲埆 | 鐘舵€?            |
| ----- | --------------------------------------------------- | ---- | ---------------- |
| F-001 | 鐜荤拑鎷熸€佷华琛ㄧ洏锛? 绉嶅垎鍖猴級                          | 鏍稿績 | 绋冲畾             |
| F-002 | 绗旇 鈫?浠〃鐩樹竴閿浆鎹?                              | 鏍稿績 | 绋冲畾             |
| F-003 | TodoPlus 闀滃儚鍒嗗尯                                   | 鏍稿績 | 1.4.0~1.4.6 瀹屾垚 |
| F-004 | 12 绉嶅唴缃鏍奸璁?                                  | 瑙嗚 | 绋冲畾             |
| F-005 | 渚ц竟鏍忓皬缁勪欢锛堝ぉ姘?鐣寗閽?鐑姏鍥?闃呰/鍊掕鏃?鍐滃巻锛?| 鎵╁睍 | 绋冲畾             |
| F-006 | Ctrl+Z 鎾ら攢                                         | 浣撻獙 | 绋冲畾             |
| F-007 | 浠诲姟鎻愰啋                                            | 鎵╁睍 | 绋冲畾             |

## 褰撳墠闂锛坴1.4.7 鈫?v1.4.8 淇锛?

### BUG-003a 路 鍒囨崲鍒嗗尯绫诲瀷鏃跺伐浣滃彴涓嶅埛鏂?

**澶嶇幇**锛?

1. 鎵撳紑宸ヤ綔鍙?鈫?浠绘剰鍒嗗尯鐐?鍒囨崲绫诲瀷"鎸夐挳锛堭煋?馃搳/馃尋/馃摎 涔嬬被鐨勪笅鎷夛級
2. 閫変竴涓柊绫诲瀷锛堟瘮濡備粠 `memo` 鍒囧埌 `todo`锛夆啋 宸ヤ綔鍙拌鍥?*娌℃湁**绔嬪嵆鎸夋柊绫诲瀷娓叉煋

**棰勬湡**锛?

- 閫夊畬鏂扮被鍨嬪悗**绔嬪嵆**锛堝悓甯у唴锛夋寜鏂扮被鍨嬮噸鏂版覆鏌撳崱鐗囨牱寮?
- frontmatter 閲?`columns[i].type` 鍚屾鏇存柊涓烘柊鍊?
- 涓嶉渶瑕佹墜鍔ㄥ叧鎺夊伐浣滃彴閲嶅紑

**瀹為檯**锛?

- 鏁版嵁鍐欏埌浜嗙鐩橈紙`columns[i].type` 宸插彉锛?
- 浣嗚鍥炬病鍒锋柊鈥斺€旈渶瑕佸垏鍒板埆鐨?tab 鍐嶅垏鍥炴潵锛屾垨鑰呴噸鍚?Obsidian

**鏍瑰洜**锛?*寰?5.4 鎵嬪姩楠岃瘉鍚庤ˉ鍏?*锛夛細

- 褰撳墠 `sync.setColumnSectionType` 璧?`writeToDisk` 鈫?`serializeInto` 鍏ㄩ噺閲嶅啓璺緞
- 鏁存枃浠堕噸鍐欏悗 vault 瑙﹀彂 'modify' 浜嬩欢 鈫?`registerVaultListeners` 鐨?modify 鐩戝惉鍣ㄥ彧鍒锋柊浜?library 娈碉紝**娌℃湁**瑙﹀彂 view 鍏ㄩ噺 re-render
- `notifyCallbacks` 铏界劧鍚屾瑙﹀彂 `view.requestRender(newData)`锛屼絾鍙兘涓?`renderCoalescer` 涔嬪墠鐨?RAF 璋冨害鍚堝苟/琚鐩?

**楠屾敹鏍囧噯**锛?

- 鍒囨崲鍒嗗尯绫诲瀷鍚?*鍚屽抚**鎸夋柊绫诲瀷娓叉煋锛堟棤闇€鎵嬪姩閲嶅紑锛?
- frontmatter 涓?`columns[i].type` 鍚屾鏇存柊
- `writeToDisk` 鐨?banner size 淇濇姢閫昏緫涓嶈 columns-only 璺緞瑙﹀彂

---

### BUG-003b 路 姣忔淇濆瓨閮藉己鍒跺啓 banner 鍧楋紙鍝€曠敤鎴蜂粠鏈紪杈?banner锛?

**澶嶇幇**锛?

1. 鍒犻櫎 `dashboard.md` 鈫?鎵撳紑宸ヤ綔鍙?鈫?鑷姩鍒涘缓涓€涓?*鏈€灏忛鏋?*锛坴1.4.8 淇繃鐨勬牱瀛愶級
2. 鍦?settings 閲屽垏鎹换鎰忓紑鍏炽€佹坊鍔犱竴涓垎鍖恒€佹坊鍔犱竴寮犲崱鐗?
3. 鎵撳紑 `dashboard.md` 鈫?鍙戠幇鏂囦欢**鎬绘槸**甯︿竴涓?`banner:` 琛?

**棰勬湡**锛?

- 鐢ㄦ埛**浠庢湭**缂栬緫 banner 鈫?鏂囦欢閲?*涓?*搴旀湁 `banner:` 鍧?
- 鐢ㄦ埛**缂栬緫杩?* banner锛堝～浜嗗浘鐗囧湴鍧€锛夆啋 鏂囦欢閲?*鎵?*鏈?`banner:` 鍧?
- banner 鍧楁寜"鐢ㄦ埛鏄惁鎿嶄綔杩?涓哄啓鍏ユ潯浠?

**瀹為檯**锛?

- `parser.ts:296` 鍐欐 `lines.push("banner:")`锛?*鏃犳潯浠?*杈撳嚭 banner 琛?
- 鍝€?`data.banner.image === ""`锛屾枃浠朵篃浼氬嚭鐜?`banner:\n` 杩欎竴琛?

**鏍瑰洜**锛?

- `serialize()` 鏄?鍏ㄩ噺閲嶅啓"锛?*鎵€鏈?*宸茬煡 frontmatter 瀛楁閮借鏃犺剳杈撳嚭
- 娌℃湁"鐢ㄦ埛鏄惁鎿嶄綔杩?banner"鐨勭姸鎬佷綅

**楠屾敹鏍囧噯**锛?

- `parser.ts:serialize` **浠呭綋** `data.banner.image` 闈炵┖鏃舵墠杈撳嚭 `banner:` 鍧?
- `data.banner.image === ""` 鏃?鈫?搴忓垪鍖栫粨鏋滀腑**涓?*鍚?`banner:` 瀛楃涓?
- 鑰佺敤鎴峰凡鏈?banner 鍧楃殑 `dashboard.md` 浠嶈兘姝ｅ父瑙ｆ瀽涓庢樉绀猴紙`parseBanner` 琛屼负涓嶅彉锛?

---

### BUG-003c 路 榛樿搴旇鍙帶鍒?columns锛屽彲浠ョ敤 API 鐩存帴璋冩暣

**澶嶇幇**锛?

1. 鍒囧垎鍖虹被鍨嬶紙BUG-003a 鍚屼竴鍔ㄤ綔锛?
2. 椤哄甫鎶?`dashboard.md` 閲岀敤鎴锋墜鍐欑殑 `cssclass: my-dashboard` 娉ㄩ噴琛?/ `tags: [x]` 瀛楁**椤哄簭閲嶆帓**鎴?*閲嶅啓**浜?

**棰勬湡**锛?

- 榛樿锛堝嵆涓嶅姩 banner銆佷笉鍔?quickActions 绛夊叾浠栧瓧娈碉級 鈫?鎻掍欢**鍙?*瑙︾ `columns:` 瀛楁
- 鐢?`app.fileManager.processFrontMatter(file, fm => { fm.columns = newCols })` 鐩存帴 mutate frontmatter
- banner / quickActions / extra frontmatter / 娉ㄩ噴 / 绌鸿**瀹屽叏涓嶅姩**

**瀹為檯**锛?

- 褰撳墠 `writeToDisk` 鈫?`serializeInto` 鈫?`serialize` 鏄?*鍏ㄩ噺閲嶅啓**鏁存枃浠?
- 鍗充娇鐢ㄦ埛鍙垏鎹簡鍒嗗尯绫诲瀷锛宐anner / extra frontmatter / 娉ㄩ噴椤哄簭閮藉彲鑳借鏀?

**鏍瑰洜**锛?

- `sync.setColumnSectionType` 澶嶇敤浜嗛€氱敤 `writeToDisk` 璺緞
- 娌℃湁"鎸夊瓧娈电矑搴﹀啓鍏?鐨勭簿缁嗗寲璺緞

**楠屾敹鏍囧噯**锛?

- 鏂板 `SyncEngine.updateFrontmatterField(key, mutate)` 鏂规硶锛屽唴閮ㄨ蛋 `app.fileManager.processFrontMatter` API
- `setColumnSectionType` / `setColumnArchiveCompleted` 鏀硅蛋**鏂拌矾寰?*锛堝彧鍔?`columns:`锛?
- 鍒囧畬绫诲瀷鍚?`dashboard.md` 涓?banner 鍧椼€乪xtra frontmatter銆佹敞閲婇『搴?*瀹屽叏涓嶅彉**锛坆yte-identical锛岄櫎 `columns:` 瀛楁澶栵級
- 鍏朵粬瀛楁锛堝崱鐗囧鍒犳敼銆乥anner 缂栬緫銆乹uickActions 澧炲垹绛夛級淇濈暀**鍘?*鍏ㄩ噺璺緞
- 绉诲姩绔吋瀹癸細`processFrontMatter` 鍦?mobile 绔甯革紙渚濊禆 Obsidian 0.15+ API锛?

---

## 闈炲姛鑳介渶姹?

- 鏈€浣?Obsidian 鐗堟湰锛歚0.15.0`
- 鏄惁鎻愪氦绀惧尯甯傚満锛氭湭璁″垝
- 鏄惁鏀寔绉诲姩绔細璺熼殢 Obsidian 绉诲姩绔兘鍔?

### BUG-001 路 banner 寮圭獥瑕?鏅€氬浘鐗囧湴鍧€"灏辫锛屼笉瑕佽疆鎾浘

**澶嶇幇**锛?

1. 鎵撳紑宸ヤ綔鍙?鈫?鐐瑰嚮 Banner 涓婄殑"缂栬緫"鎸夐挳
2. 寮圭獥閲屽嚭鐜?*涓や釜鍖?*锛氣憼 "Background image path (vault relative)" 鈶?"Background Images" 杞挱鍥惧垪琛?
3. 鍦ㄤ富鍥惧瓧娈靛～涓€涓?URL锛坄https://i.pravatar.cc/600`锛変繚瀛?鈫?banner 娌℃寜棰勬湡鏄剧ず

**棰勬湡**锛?

- 寮圭獥**鍙?*鏈変竴涓浘鐗囧湴鍧€杈撳叆妗嗭紝**娌℃湁**杞挱鍥惧垪琛?
- 濉?URL 鍗冲彲锛宐anner 绔嬪嵆鎸変富鍥炬牱寮忔樉绀?
- banner **濮嬬粓鏄崟鍥?*妯″紡锛屾棤杞挱閫昏緫

**瀹為檯**锛?

- 寮圭獥閲屼粛鐒舵湁"Background Images"杞挱鍥惧垪琛?
- i18n key 缂哄け锛屽脊绐楅噷澶氬鏄剧ず鎴愬瓧闈㈤噺 `"banner.image"`銆乣"banner.imageDesc"`銆乣"banner.imagePlaceholder"`銆乣"banner.rotationImages"`銆乣"banner.addImage"`銆乣"banner.save"`銆乣"banner.edit"` 绛?
- 鐢ㄦ埛濉啓浜嗕富鍥句絾鍥?UI 骞叉壈鍜?i18n 鏄剧ず寮傚父锛屾劅瑙?琚敼鎴愬叾浠栫殑"
- 鍚庣 `view.ts:setupBannerRotation` 杩樺湪璺戔€斺€擿images.length > 1` 鏃朵細**瑕嗙洊**涓诲浘锛岀牬鍧?杈撳叆鍥剧墖鍦板潃鍗冲彲"鐨勫绾?

**鏍瑰洜**锛?

1. `src/banner.ts:BannerEditModal` 娓叉煋浜嗚疆鎾浘鍒楄〃 UI锛坄renderImagesList` / `addImageBtn`锛夛紝涓庣敤鎴?banner 灏变竴寮犲浘"鐨勯鏈熷啿绐?
2. `src/banner.ts` 寮曠敤浜?*鏈湪 `i18n.ts` 娉ㄥ唽**鐨?7 涓?i18n key
3. `src/view.ts:setupBannerRotation` 鏁村杞挱鏈哄埗瀵瑰崟鍥?banner 鏄啑浣欑殑锛屼笖浼?瑕嗙洊涓诲浘"鈥斺€斿簲鏁翠綋涓嬬嚎
4. `src/parser.ts:serialize` 浠嶇劧鍐?`banner.images` 鍧楋紝搴斿悓姝ヤ笅绾?

**楠屾敹鏍囧噯**锛?

- Banner 缂栬緫寮圭獥**鍙?*鍚竴涓浘鐗囧湴鍧€杈撳叆妗嗭紙label/placeholder 姝ｇ‘鏄剧ず锛屼笉鍐嶆槸瀛楅潰閲?key锛?
- `banner.images` 瀛楁鍋滄鍐欏叆纾佺洏锛沗banner.images` 鏁版嵁淇濈暀涓?璇绘椂蹇界暐"锛岄伩鍏嶇牬鍧忕幇鏈夌敤鎴峰凡鍐欏叆鐨勬枃浠?
- `view.ts:setupBannerRotation` 鏁存鍒犻櫎锛沗images.length > 1` 涓嶅啀瑕嗙洊涓诲浘
- `parser.ts:serialize` 涓嶅啀杈撳嚭 `images:` 鍧?
- 鍗曞浘 URL锛坴ault 鐩稿璺緞鎴?https URL锛夊～杩涘幓灏辨甯告樉绀猴紝涓庣幇鐘朵竴鑷?

---

### BUG-002 路 宸ヤ綔鍙伴娆℃墦寮€鏃跺己鍒跺啓鍏?4 涓粯璁ゅ垎鍖猴紝涓斾簩娆′繚瀛樹細"閲嶇疆"鐢ㄦ埛娓呯┖

**澶嶇幇**锛?

1. 鍒犻櫎 vault 涓?`dashboard.md`锛堟垨棣栨瀹夎鏃讹級
2. 鎵撳紑宸ヤ綔鍙?鈫?鑷姩鍒涘缓涓€涓?`dashboard.md`
3. 鏂囦欢閲岃鑷姩鍐欏叆 **Memo / Todo / Projects / Library 4 涓粯璁ゅ垎鍖?*锛屾瘡鍒嗗尯杩樻湁绀轰緥鍗＄墖
4. 鐢ㄦ埛鎵嬪姩缂栬緫 `dashboard.md`锛屽垹鎺夋墍鏈?`## H2`銆佸垹鎺?`columns:` 鍧?
5. 閲嶆柊鎵撳紑宸ヤ綔鍙?鈫?4 涓粯璁ゅ垎鍖?*鍙堝洖鏉ヤ簡**锛堝洜涓?`parseColumnDefs` 鐪嬪埌 `columns:` 涓嶅瓨鍦ㄥ氨 fallback 鍒?`DEFAULT_COLUMNS`锛?

**棰勬湡**锛?

- 棣栨鎵撳紑宸ヤ綔鍙?鈫?鏂囦欢鏄?*鏈€灏忛鏋?*锛堜粎 frontmatter锛?*鏃?*浠讳綍榛樿鍒嗗尯锛?
- 鍒犲厜鏂囦欢閲屾墍鏈夊唴瀹瑰悗鍐嶆墦寮€ 鈫?宸ヤ綔鍙版槸**绌?*鐨勶紙涓嶆槸榛樿鍒嗗尯鍙堝嚭鐜帮級
- 鐢ㄦ埛鍦?settings 璁句簡榛樿 columns 鎵嶇敤璁惧畾鐨勶紝鍚﹀垯鎸夋枃浠堕噷鍐欑殑鍐呭娓叉煋

**鏍瑰洜**锛?

1. `parser.ts:30-35` 纭紪鐮?4 涓?`DEFAULT_COLUMNS`
2. `parser.ts:941` `parseColumnDefs` 鍦?`columns:` 缂哄け鏃?*杩斿洖 `DEFAULT_COLUMNS` 鑰屼笉鏄?`[]`**
3. `parser.ts:583+` `generateDefaultMarkdown()` 寮哄埗濉簡 4 涓粯璁ゅ垎鍖?+ 绀轰緥鍗＄墖
4. `sync.ts:1413-1416` `findOrCreateFile` 鏂板缓鏂囦欢鏃惰皟鐢?`generateDefaultMarkdown()`

**楠屾敹鏍囧噯**锛?

- 棣栨瀹夎 / 鍒犳帀 dashboard.md 鍚庢墦寮€宸ヤ綔鍙?鈫?鍐欏叆鐨?`dashboard.md` **鍙?*鍚?`banner:` 绌哄潡 + `columns: []` 绌哄潡锛?*鏃?*浠讳綍榛樿鍒嗗尯涓庣ず渚嬪崱鐗?
- 鐢ㄦ埛鎵嬪姩娓呯┖ `dashboard.md` 鐨勬墍鏈?`## H2` 涓?`columns:` 鍧楀悗鍐嶆墦寮€ 鈫?宸ヤ綔鍙版樉绀?*绌?*鐘舵€侊紝鏂囦欢**涓嶄細琚彃浠舵敼鍥為粯璁?*
- 鐜版湁鐢ㄦ埛鐨?dashboard 鏂囦欢涓嶅彈褰卞搷锛坄columns:` 宸叉湁鐨勶紝parse 璧版甯歌矾寰勶紝涓?fallback锛?

---

## 闈炲姛鑳介渶姹?

- 鏈€浣?Obsidian 鐗堟湰锛歚0.15.0`
- 鏄惁鎻愪氦绀惧尯甯傚満锛氭湭璁″垝
- 鏄惁鏀寔绉诲姩绔細璺熼殢 Obsidian 绉诲姩绔兘鍔?

## 瑙﹀彂鍦烘櫙鏄犲皠

| 鐢ㄦ埛璇?                   | 娴佺▼                                                          |
| ------------------------- | ------------------------------------------------------------- |
| 鍐欎竴涓彃浠?               | 闃舵 0 鈫?1 鈫?2 鈫?3                                            |
| 缁х画 / 褰撳墠杩涘害           | 璇?.plan/锛岀畝鎶ュ悗绛夌‘璁?                                      |
| 鏂板 / 娣诲姞 / 淇 / 閲嶆瀯 | 璇?.plan/ 鈫?鍦?Plan.md 鍔犱换鍔?鈫?纭鍚庢墽琛?鈫?鍚屾鏂囨。涓庣増鏈彿 |
| 妫€鏌?/ 瀹℃煡               | 鎸?Agents.md 搂6 妫€鏌ユ竻鍗曢€愰」鎵弿                              |
