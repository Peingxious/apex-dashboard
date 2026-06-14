# Changelog

## 1.4.5 (2026-06-14)

### Fixed

- **TodoPlus list items no longer accumulate blank lines in the middle** — every previous "add item" call appended the new `- [ ] …` line to the end of the heading slice, but the end-of-slice position drifted one newline to the right every time because the empty line that follows the last task was kept verbatim. After 5–6 adds, the file looked like:
  ```
  ## To-do
  - [ ] 11
  <blank>
  - [ ] 22
  <blank>
  ```
  Fix: in [`addTodoPlusItem`](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/renderer.ts#L4825) the slice-end computation now walks backwards over trailing blank lines before splicing the new item in, so the new line lands right after the previous task. ([renderer.ts:4847](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/renderer.ts#L4847))
- **TodoPlus first-time auto-append no longer inserts a stray blank line** — when a TodoPlus column was created and the picked source note did not yet have a `## To-do` heading, the previous code emitted `\n\n## To-do\n` (two newlines = one blank line) between the existing body and the new heading. Fix: trim trailing newlines on the existing content and emit a single `\n` separator, so the heading sits flush against the body. ([renderer.ts:5041](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/renderer.ts#L5041))

### Added

- **Per-section "show / hide all completed tasks" toggle (Todo and TodoPlus)** — the existing per-card eye icon was session-only and reset to the global default on every reload. The new section-level eye sits in the Todo / TodoPlus column header (next to the existing `+` and template buttons) and is **persisted in the column's frontmatter** as `hideCompleted: true|false`, so the choice survives reloads and applies to every card in the section. The state resolves in this order, most-specific wins: `card.hideCompleted` (session-only) → `column.hideCompleted` (this new feature) → `settings.defaultHideCompleted` (global). Clicking the section eye a third time drops the override (writes `undefined`) so the file round-trips back to its pre-override shape — no stale `hideCompleted: true` line accumulates in the file. Implementation:
  - Type: [`DashboardColumn.hideCompleted?: boolean`](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/types.ts#L285) (and matching [`RenderCallbacks.onColumnHideCompletedChange`](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/types.ts#L394))
  - Parser: [`parseColumnDefs`](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/parser.ts#L808) reads `hideCompleted:` and [`serialize`](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/parser.ts#L196) writes it (only when explicitly set, so existing dashboard files stay byte-identical on the next save)
  - Sync: [`SyncService.setColumnHideCompleted`](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/sync.ts#L617) handles both set + reset
  - Renderer: new eye button in [`renderSection`](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/renderer.ts#L2881), threaded through `renderCard` → `renderCardBody` → `renderTodoPlusBody`
  - View / Sidebar: both call the new sync method ([view.ts:2543](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/view.ts#L2543), [sidebar-view.ts:570](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/sidebar-view.ts#L570))
- **"Add section" picker now groups `Todo` next to `TodoPlus`** — the dropdown order was `Notes / Todo / Memo / Library / Todoplus`, so the two related task types were on opposite ends of the bar. Re-ordered to `Notes / Todo / Todoplus / Memo / Library` so users picking a task-style section can see both variants next to each other. ([renderer.ts:2658](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/renderer.ts#L2658))

## 1.4.4 (2026-06-14)

### Fixed

- **TodoPlus new-card title had an extra `[[ ]]` wrapping** — 1.4.3 was emitting `[[[[dash03]]#To-do]]` (four `[` and four `]`). Root cause: [`addTodoPlusCardFromNote`](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/renderer.ts#L5025) used `pathToWikiLink(file.path)` to build the inner half of the wikilink, but `pathToWikiLink` _already_ returns a fully-wrapped `[[basename]]` (it's the single source of truth for "write a file as a wikilink"). Re-wrapping that in `[[${noteRef}#To-do]]` produced the double-wrap. Fix: use `file.basename` directly (TFile's `.basename` is already the `.md`-stripped name, which is exactly what we want inside `[[...#...]]`). The pre-existing per-card parser `getTodoPlusSourceLinkFromTitle` already expects the single-wrap form `[[name#To-do]]`, so this also means the card title now actually matches the source-link parser's contract — clicking a TodoPlus card correctly resolves its source note again. ([renderer.ts:5050](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/renderer.ts#L5050))
- **Removed `Notes (no cover)` / `笔记 (无封面)` entry from the "Add section" type picker** — it was a legacy alias for `Notes` / `projects` (no UI distinction, just a different `sectionType: "notes"` flag in the dashboard file) and had no separate icon/style. The new add-section dropdown now exposes: Notes / Todo / Memo / Library / Todoplus. Existing sections of type `notes` are still parsed, rendered, and serialised correctly — only the _new-section_ entry point is gone, so users can't accidentally create yet another alias. ([renderer.ts:2658](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/renderer.ts#L2658), [i18n.ts:140](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/i18n.ts#L140))

### Changed

- `renderer.typeNotesPlain` i18n key removed (en + zh) — no remaining callers. ([i18n.ts:140](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/i18n.ts#L140))
- `pathToWikiLink` import removed from `renderer.ts` — it was only used by the buggy TodoPlus title builder; the parser module keeps exporting it for `view.ts` / `sync.ts` callers.

## 1.4.3 (2026-06-14)

### Changed

- **TodoPlus column "+" button now opens a note-search modal** — the 1.4.0–1.4.2 add-card UX was an inline text input that required the user to hand-type a wikilink-form string (`dash002#To-do` / `[[dash002#To-do]]` / `dash002`) and then validate it. That input is gone. The new flow:
  1. Click `+` on the TodoPlus column header
  2. A `DocSearchModal` opens (the same modal the Project section uses — substring filter over vault file basenames/paths, max 20 hits, refilters as you type)
  3. Type to filter the candidate set, click the result you want, the modal closes
  4. The picked note becomes the source — a `[[note#To-do]]` mirror card is added
- **No `## To-do` heading required up-front** — if the picked note doesn't yet have a `## To-do` heading, we append a fresh one via `vault.process` so the new card has a real checklist to mirror immediately. The user is never blocked on a manual prep step. (The per-card "Set source" button still lets the user re-target a different heading afterwards — same `promptTodoPlusSourceLink` flow as before.)
- **The note search IS the filter** — typing in the modal's search box narrows the candidate set live. The user can search by name or path; only matching vault notes show. This is the "指定的部分笔记是可以筛选的" behaviour: the search itself acts as a scoped picker.

### Notes

- The column-header inline-input UX is now projects-only. TodoPlus no longer accepts a hand-typed wikilink string from the column header; use the search modal.
- The old `addTodoPlusCard(column, rawInput, ...)` helper in [renderer.ts](file:///d:/BaiduNetdiskWorkspace/Ptest/.obsidian/plugins/apex-dashboard/src/renderer.ts) (wikilink-form parsing) is removed; replaced by `openTodoPlusNoteSearchModal` + `addTodoPlusCardFromNote(column, file, ...)`.
- `parseTodoPlusSourceLink` is still in the codebase — used by the per-card "Set source" button (`promptTodoPlusSourceLink`).

## 1.4.2 (2026-06-14)

### Changed

- **Removed redundant per-card metadata for TodoPlus** — 1.4.0/1.4.1 wrote two lines into every TodoPlus card body that were already encoded elsewhere on disk:
  - `- type: todoplus` — this is the same value as the enclosing column's `sectionType: todoplus` (frontmatter, single source of truth for the column kind), so it was a duplicated field. The parser now ignores the per-card `type:` line and `parseColumns` derives `card.type = "todoplus"` for every card in a todoplus column automatically
  - `- sourceLink: "[[dash002#To-do]]"` — the source link is the card's first-bullet title itself (`- [[dash002#To-do]]`), so writing it as a metadata line was a duplicated field. The card's `DashboardCard.sourceLink` field is removed from the type; the renderer reads the source link from the title via a new `getTodoPlusSourceLinkFromTitle(card)` helper that parses the wikilink and returns the canonical `note#heading` form
- **A TodoPlus card on disk is now exactly one bullet line** — `- [[dash002#To-do]]` — plus its indented metadata (cover / width / size / grid), same shape as a regular Todo card. No per-card `type:` or `sourceLink:` line is written
- **`onCardAdd` option shape changed** — the `options.sourceLink` field on `RenderCallbacks.onCardAdd` is replaced by `options.title`. For TodoPlus columns the caller passes the wikilink-form title `[[note#heading]]` directly; the view layer creates the card with `type: "todoplus"` and that title. The round-trip is byte-identical to the on-disk format

### Migration

- **Existing dashboard notes load without manual action** — the parser still recognises the legacy `type: todoplus` / `sourceLink: "[[...]]"` lines if they happen to be present, but on the next save those lines are dropped (single source of truth wins). The card's in-memory `title` is read from the first bullet; the `sourceLink` field on `DashboardCard` is gone, so any direct `card.sourceLink` access in your own code is now a TypeScript error — switch to `getTodoPlusSourceLinkFromTitle(card)` (or parse the title yourself with the existing `parseTodoPlusSourceLink` helper) to get the canonical `note#heading` string

### Notes

- The `extractSourceLink(metadata)` helper in `parser.ts` is removed; the new `getTodoPlusSourceLinkFromTitle(card)` helper in `renderer.ts` is its replacement
- `detectCardType` no longer special-cases `metadata.type === "todoplus"`; the column override in `parseColumns` is the only place the type is set

## 1.4.1 (2026-06-14)

### Changed

- **TodoPlus card now uses the same UI and operations as a regular Todo card** — the 1.4.0 release shipped TodoPlus with its own chrome (a "Source: [[…]]" header and an "## heading" caption above the list, plus only a working toggle). In 1.4.1 the body drops the Source/## decorations entirely and reuses the standard `dashboard-task-list` / `dashboard-task-item` / `dashboard-task-add` / `dashboard-progress` DOM, so a TodoPlus card looks identical to a plain Todo card body. The progress bar is computed from the full item list, the add row supports the same file-suggest `[[…]]` flow as Todo, and the hide-completed eye button in the card header now applies (the header's `isTask` / `isTaskCard` checks were extended to include `sectionType === "todoplus"`, so the eye button and the no-edit-pencil behaviour show up automatically)
- **Three new vault-write helpers** — `addTodoPlusItem` (append a fresh `- [ ] <text>` line to the end of the heading slice, or append a new `## heading` block if the heading doesn't exist), `removeTodoPlusItem` (delete the touched line, including its trailing newline so no blank line is left behind), and `editTodoPlusItem` (rewrite just the text portion of a checklist line, preserving the `- [ ]` / `- [x]` marker). All three funnel through `vault.process` and only touch bytes inside the `## <heading>` slice of the source file, so neighbouring sections, paragraphs, and other headings stay byte-identical

### Notes

- No data format change. Existing dashboard markdown files load identically; the on-disk `sourceLink` field is still the only thing the renderer reads
- The "Source" and "## heading" header rows are gone from the card body. The source link is still visible from the card's hover-tooltip and the auto-suggest context; if you want a permanent visual reminder of which note a card mirrors, the card title is free to be set to a wikilink to that note (the regular title-edit path applies)
- The card `title` is now auto-set to `[[note#heading]]` (the same wikilink as `sourceLink`) when a TodoPlus card is created or its source link is changed via "Set source", so the header shows a clickable `[[dash002#To-do]]` label out of the box. The on-disk first-bullet text and the in-memory `title` stay byte-identical to avoid any round-trip mismatch

## 1.4.0 (2026-06-14)

### Added

- **TodoPlus section type (`待办Plus`)** — a new section kind that mirrors a checklist that lives in another note under a `## <heading>` block. Each card stores a single `sourceLink` (e.g. `dash002#To-do`) and renders the live checklist straight from the source — no second copy, no drift. Click the `+` button in a TodoPlus section to point a new card at any `[[note#heading]]` in the vault; if the heading doesn't exist yet, the plugin appends an empty `## heading` block for you so you can drop tasks in immediately
- **Bidirectional sync** — toggling a checkbox in a TodoPlus card rewrites the matching line in the source note via `vault.process` (only the touched line is changed, so neighbouring sections and other headings are untouched). The dashboard never owns the checklist; the source note does
- **Section type dropdown now lists `待办Plus`** — the header-level "switch section type" menu (the one with sticky-note / check-square / folder-kanban icons) gets a 4th option `list-checks` (待办Plus). Switching an existing column to TodoPlus just changes its `sectionType` flag; the existing cards are cleared since TodoPlus cards require their own `sourceLink` to be useful
- **New-section picker now lists `待办Plus`** — the inline type picker on the "+" button at the end of the kanban row gets a 6th option (Notes / Todo / Memo / Notes (no cover) / Library / **待办Plus**). Pick it to create a column that already knows it should hold mirror cards
- **Wikilink-as-title** — the source link is rendered as a clickable `[[note#heading]]` (using the same `renderTextWithLinks` pipeline as other wikilinks), so clicking it jumps straight to the heading in the source note
- **Native read path** — TodoPlus uses only Obsidian's built-in APIs (`metadataCache.getFirstLinkpathDest` + `metadataCache.getFileCache(file).headings` + `vault.cachedRead`) to slice the heading range. No new persistence layer, no DOM hacks, no extra metadata on the source note

### Changed

- **Source link is stored on the card, not the section** — like Project's `addGroup`, each TodoPlus card carries its own `sourceLink` (e.g. `dash002#To-do`). A single TodoPlus section can therefore mirror several different notes / headings side by side, or just one — the section's role is purely visual grouping
- **`sourceLink` is persisted as `sourceLink: "[[note#heading]]"`** in the card's metadata block (with `[[ ]]` wrapping on disk; the brackets are stripped on read so the in-memory representation is the canonical `dash002#To-do` form)

## 1.3.0 (2026-06-13)

### Added

- **Global setting: default-hide completed tasks in Todo cards** — New toggle in Settings → "Todo 默认隐藏已完成任务" / "Hide completed tasks in Todo cards by default" (default ON). When on, every Todo card hides completed items in its visible list on first render (and on every reload), giving new dashboards a clean look out of the box. The eye/eye-off button on each card still works as a per-card override — but that override is now **session-only**: it changes the in-memory flag and re-renders, but the flag is never written to the dashboard markdown, so a reload (or restarting Obsidian) always falls back to the global default. This is intentional — the toggle is meant as a quick "show me what I just did" peek, not a persistent per-card setting

### Changed

- **`hideCompleted: true` is no longer written to the dashboard markdown** — Previously the eye/eye-off button persisted its state into the card's frontmatter-style metadata block at the top of each Todo card, leaving `hideCompleted: true` lines scattered across the file. Those lines are gone. `serialize()` in `parser.ts` no longer emits the key, and `parseCardFromMetadata()` ignores it on read (the in-memory field is always unset on a fresh load), so older notes that still carry the key from previous versions will simply be cleaned up the next time the file is saved (and the field is unused, so the cleanup is purely cosmetic). The button still functions identically from the user's perspective; only the on-disk shape changed

## 1.2.1 (2026-06-13)

### Fixed

- **Dragging the last project item out of a card no longer crashes with `d.includes is not a function`** — Two stacked bugs surfaced when the user dragged the final project item from a card in the main workbench. (1) `serialize()` in `parser.ts` had a `toWikiLink` helper that called `.includes` on its input unconditionally, and the projectDocs body-synthesis path passed each `ProjectDocNode` child into it as if it were a string — throwing `TypeError` when a child was an object. (2) `SyncEngine.moveProjectItemToCard` in `sync.ts` only updated `card.body` and never mirrored the move into `card.projectDocs`, so dragging the last item left `body === ""` while `projectDocs` still referenced it — that triggered the buggy synthesis path on the next save. The fix adds a `typeof` guard at the top of `toWikiLink`, makes the children iteration handle both `string[]` and `ProjectDocNode[]` shapes, and makes `moveProjectItemToCard` mirror the move into `projectDocs` (with the same bounds-check + clamp + child normalisation that `removeProjectItem` already uses). Verified with `npx tsc --noEmit` and `npm run build` (both pass clean)

## 1.2.0 (2026-06-13)

### Changed

- **Plugin renamed: Apex Dashboard → Peingxious Dashboard** — `manifest.json` `id` is now `peingxious-dashboard`, `name` is "Peingxious Dashboard", and `author` is "Peingxious". Description rewritten. The npm package name is now `peingxious-dashboard`. All internal identifiers that used to derive from the old id have been updated: CSS class names (`.peingxious-dashboard-root`, `.peingxious-note-dashboard-root`), view-type constants (`peingxious-dashboard-view`, `peingxious-dashboard-sidebar`), `localStorage` keys (banner/sidebar/collapsed state), the `peingxious-dashboard-template` YAML marker, and the `[peingxious-dashboard]` log tag. i18n welcome / settings-prompt strings in `src/i18n.ts` and the install / command-palette / screenshot references in `README.md` and `README_ZH.md` all follow the new brand. The plugin directory `.obsidian/plugins/apex-dashboard/` should be renamed to `.obsidian/plugins/peingxious-dashboard/` after closing Obsidian (Obsidian identifies the plugin by `manifest.json` `id`, not the folder name, but the folder name is the conventional install path)

## 1.1.16 (2026-06-13)

### Added

- **Section / column names now render as real wikilinks** — A column called `[[dash01]]` (or `[[dash01|alias]]`, or `[[dash01#section]]`) is no longer displayed as raw `[[dash01]]` text. `renderColumnTitle` now detects an `[[…]]` token inside the column name and routes it through the same `renderTextWithLinks` helper that already powers card titles, project items, and task lines. The inner part becomes a real `internal-link` `<span>`: clickable (opens the target via `workspace.openLinkText`), with the native Obsidian Page Preview popover on plain `mouseover` (200ms delay), and the standard `data-href` / `href` attributes for the post-processor to find. Plain-text column names still take the cheap `setText` path, so there's no overhead for the common case. The rename input on double-click still shows the FULL verbatim string (including the `[[` / `]]`) so the user can edit it just like before

### Fixed

- **File-suggest dropdown only opens on `[[`, not on any text** — The dropdown was previously driven by `if (!q.trim())` and would open for any non-empty input, so typing a normal task title like "review report" would pop the dropdown with fuzzy matches against every vault file. That made plain text input feel noisy and random. `attachFileSuggest` now uses a `findWikilinkContext(value, caret)` helper that returns `null` unless the caret sits inside an unclosed `[[…`. The result: the user can type a normal task title / memo line freely and the dropdown stays closed; the moment they press the two opening brackets the dropdown opens with the full file list; every char typed after narrows the list down (substring match on path or basename). The dropdown also closes automatically when the user types `]]` (caret moves past the close). On pick, the active `[[partial` fragment is replaced with `[[basename]]` (basename form matches the canonical wikilink format used everywhere else in the dashboard), and any pre-existing `]]` the user has already typed past the caret is dropped so the result is never `[[path]]]`. The `onPick` callback still fires after the replacement, so the task-add / note-add consumers add the item and then clear the input as before. The new behaviour is verified against 11 input scenarios (plain text, single `[`, `[[`, `[[dash`, `[[dash]]` at end / in middle, second link after a closed one, alias / fragment, newline in middle, stray leading `[`)

## 1.1.15 (2026-06-13)

### Fixed

- **Multi-attribute update no longer wipes unedited fields on the banner** — Opening the banner edit modal and saving without touching the rotation-images list used to send `{ image, images: undefined }` to the consumer, and `Object.assign(this.embeddedData.banner, updates)` would then write `images: undefined` onto the banner, silently clearing the existing rotation array even though the user never asked to touch it. The modal's `save` handler now only includes `images` in the partial when there is at least one rotation image, and the embedded view's `openEmbeddedBannerEditModal` consumer now copies fields one-by-one, skipping any key whose value is `undefined` (the standard "merge partial safely" pattern). Unedited attributes are guaranteed to stay untouched on every multi-attribute update path
- **User-owned frontmatter keys are no longer wiped on save** — `serialize()` previously emitted ONLY the six plugin-owned top-level keys (`banner`, `quickActions`, `quickActionOrder`, `hiddenPresets`, `columns`, and the legacy `quickLinks` slot). Any other field the user put in the frontmatter — e.g. `Type: dashboard`, `cssclass: dashboard`, `tags: [...]`, `aliases: [...]` — was silently DROPPED on the next save, because the parse step never captured it into the `DashboardData` model. The plugin now keeps an `extraFrontmatter: Record<string, unknown>` slot on `DashboardData`: `parse()` records every top-level YAML key that is not in the known-key set, and `serialize()` re-emits that block at the top of the frontmatter BEFORE the plugin-owned keys, so user metadata round-trips cleanly. Verified with a parse → mutate → serialize → re-parse cycle: `Type: dashboard` and `tags: [dashboard, apex]` both survive intact
- **Embedded dashboard now reflects external markdown edits in real time** — The `modify` handler in `registerVaultListeners` previously only refreshed the recent-docs and library-sections side panels, and the embedded-mode view would happily keep rendering stale data after the user edited the underlying `.md` file in the Obsidian editor. When the modified file is the same as the active `embeddedNotePath`, the view now re-reads the file from disk, re-parses it with `parse()`, updates the in-memory `embeddedData` and the `embeddedDataCache`, and re-renders the dashboard immediately. The `embeddedDataCache` is updated at the same time so subsequent tab switches serve the fresh data without an extra disk read
- **File-suggest dropdown: removed the inner-panel "second border" on the selected row** — The selected row was being rendered with both a translucent indigo background _and_ a 1px inset `box-shadow` ring, and on a dark theme the two layers read as two stacked panels inside a single row (this was the "2 panels" visual bug). The inset ring is gone — the active row is now marked by the translucent tint alone, and the non-selected rows have `box-shadow: none` so they no longer paint a 1px transparent hairline that some themes rendered as a visible sub-pixel line. The dropdown now reads as a single panel of items with one row clearly highlighted

## 1.1.14 (2026-06-12)

### Changed

- **Wikilink hover: every dashboard `[[...]]` now calls the native Obsidian Page Preview** — All wikilinks in the dashboard (card titles, project items, task text, note text) now fire the workspace `link-hover` event on plain `mouseover` with a 200ms delay. The native `Page Preview` core plugin then takes over and pops the exact same hover popover it does for any markdown-rendered wikilink — the user sees the actual file preview ("image 2" feel: file content, not a card title). No more `enableHover` opt-in flag, no more card-only / project-item-only restriction: the dashboard wikilinks now feel exactly like wikilinks in the editor. The 1.1.13 Ctrl/Cmd modifier-key requirement is gone — plain hover is enough. Mouseleave, key-down, and re-render detach all cancel the pending timer so the preview never pops on a stale node

### Reverted

- **Section title: no longer split into "title text + #N badge"** — The 1.1.12 "trailing number as badge" change is reverted. The column name is now rendered verbatim as the section title (`<h3 class="dashboard-section-title">`), exactly the way every other section name is displayed. Rationale: a section name is a user-facing label (e.g. `library`, `Project 5`, `121`, `闪念-2026-01月`), not an id. Treating the trailing number as a chip changed the meaning from "name" to "id" and produced empty `<h3>` elements when the column was just a number. Removed: `splitTrailingNumber()` helper, the `.dashboard-section-number-badge` CSS, and the `renderer.columnNumberBadge` i18n string. The rename flow now seeds the input with the full `column.name` and the cancel path restores the same full name

## 1.1.13 (2026-06-12)

### Added

- **Native Obsidian file preview on Ctrl/Cmd+hover for project-item wikilinks** — Project items in the workspace section are rendered as custom DOM, not via the markdown post-processor, so the core `Page Preview` plugin never sees them. We now bridge that gap by dispatching the workspace-level `link-hover` event with the right `MouseEvent`, target element, link text, and source string whenever the user holds Ctrl (Cmd on macOS) and hovers for ~200ms. The same native popover that fires for a wikilink in any markdown view now fires for a project item too — fragment-aware navigation, embeds, and "Open" / "Open to the right" all work as expected. Mouseleave, key-down, and re-render detach all cancel the timer so the preview never pops on accident

## 1.1.12 (2026-06-12)

### Added

- **Column title: trailing number rendered as a styled badge** — A previous list format used a pure numeric column name (`11`, `121`, ...) as a stable ordering identifier. To keep those lists readable in the new "any text" naming model, the renderer now splits a column name into a `titleText` and an optional `trailingNumber`. Examples:
  - `11` → title is empty, a small `#11` badge sits to the right
  - `Project 5` → title is `Project`, badge is `#5`
  - `闪念-2026-01月` → title is the full text, no badge
    The rule is "ASCII digits at the end of the trimmed string, optionally preceded by a single space" — anything else (digits mid-string, full-width digits, leading digits) does NOT trigger extraction, so existing Chinese / punctuated names render unchanged. The badge is rendered **only at the column-header level**: project sub-list items (which already carry their own `+N` child-count badge) intentionally do NOT receive this number, since the two concepts mean different things
- **Rename input now sees the full column name** — The double-click-to-rename flow previously read the title element's text content, which after this change would have been missing the number portion. The handler now seeds the input with the full `column.name` (number included); cancelling restores only the title text portion, while the badge re-derives itself on the next render pass

## 1.1.11 (2026-06-12)

### Changed

- **File-suggest: no pre-selection on input, subtler highlight style** — When the user types, no row is pre-highlighted anymore: the dropdown shows matches but the user's typed text is the only thing the caller reads. Pressing ↓ / ↑ moves the soft-tint highlight. The 1.1.10 highlight (indigo gradient + 3px accent left border + bold weight) was found too loud; it is now a soft `rgba(99, 102, 241, 0.18)` background with a 1px inner accent ring, no border, no bold. Hover (unselected) still uses the CSS accent color so the two states remain visually distinct — one is a passive cursor, the other is a confirmed pick

## 1.1.10 (2026-06-12)

### Fixed

- **File-suggest dropdown highlight now visible on ↑/↓ navigation** — Pressing the arrow keys to walk through the file list used to leave the highlight invisible because the inline `background: transparent` we wrote on every row was beating the CSS `.is-selected` rule (inline styles always win over external CSS). The fix removes the unconditional inline background — rows now only set inline `background` when they ARE the selected one — and uses a stronger gradient (indigo→light-indigo) plus a 3px accent left-border plus bold weight so the highlighted row is unmistakable. Hover on unselected rows is also restored because the CSS `:hover` rule is no longer overridden

## 1.1.9 (2026-06-12)

### Fixed

- **File-suggest dropdown no longer auto-picks the first match on Enter** — The vault file search dropdown (used by add-note and other picker inputs) used to commit the first filtered match as soon as the user pressed Enter, which silently overwrote the text the user had just typed. The fix separates "visual highlight" from "user-committed pick": the highlighted row is still the top match (so the user has a visual cue), but pressing Enter without first navigating with ↑ / ↓ now leaves the input untouched — the caller reads exactly the typed text. Mouse click on a row still works as before. Each query change resets the committed pick, so a stale "picked" state from a previous query can never leak into the next one

## 1.1.8 (2026-06-12)

### Added

- **Ctrl/Cmd+Z undo for one-click deletes** — Pressing Ctrl+Z (Cmd+Z on macOS) inside the dashboard now restores the most recently deleted card, todo task, project item, or column. A snapshot of the removed data is captured before each destructive op and pushed to an in-memory undo stack (capped at 50 entries). The view re-renders automatically after the undo, and a brief Notice shows which type of entry was restored. Obsidian's native editor undo continues to work inside text inputs — the global keydown listener bails when the focus is on an `<input>`, `<textarea>`, or any `contenteditable` element
- **Command-palette entry** — The same undo action is now available as "Undo last delete" in Obsidian's command palette, with Ctrl/Cmd+Z as the explicit hotkey. The command is contextually hidden (returns false from `checkCallback`) when there is nothing on the undo stack, so the palette stays clean

## 1.1.7 (2026-06-12)

### Changed

- **Unified row-delete UX across todo / project** — The small red X button is now the single delete affordance for both todo tasks and project/memo items. It appears on hover with a subtle 4px rounded shape, fills with the theme danger color (red) on hover, and remains identical in size and behavior across both card types. The previous larger red X with the "删除任务" tooltip on project items has been retired in favor of the same compact treatment todo uses
- **One-click delete, no confirm dialog** — Clicking the X on a todo task, a project item, or a card header now deletes the entry directly, mirroring project/memo's existing behavior. The "Are you sure?" confirm modal that previously interrupted card and task deletion has been removed. Undo is still possible via Ctrl+Z in the editor and the file-level history

## 1.1.6 (2026-06-12)

### Changed

- **Library list view — compact meta row** — Property values are now rendered as rounded pill chips (no key labels) immediately before the time value. The time value remains the final element in each list entry, and all configured properties (excluding `name` / `modified` / `created`, which are absorbed into the title and the trailing time) are placed directly adjacent to it. The pill styling (rounded border, subtle background, padded chip) matches the previous visual identity while dropping the key prefix for a cleaner read
- **Behavior parity with table view** — The list view now mirrors the table view's column order for `visibleProperties` (excluding the auto-handled `name` and time keys), giving users a consistent mental model across the two views

## 1.1.5 (2026-06-12)

### Added

- **Library table / list — Visible Properties** — A new "Visible Properties" section in the library config modal lets users pick exactly which property fields appear as table columns (or list metadata chips). The section is shown only when the view mode is Table or List, and provides a checkbox list of every frontmatter key found in the vault plus the built-in `name` / `modified` / `created` / `path` pseudo-properties. "Show all" / "Deselect all" quick actions are included. When `visibleProperties` is unset (legacy configs), the table falls back to its prior auto-discovery behavior — fully backward compatible
- **Kanban exclusive setting isolation** — The "Group by" setting continues to appear only when the Kanban view mode is selected. The "Visible Properties" section is the reciprocal: it appears only for Table / List, never for Kanban / Grid

### Persistence

- `visibleProperties` is serialized to YAML frontmatter as `visibleProperties: ["key1", "key2", ...]` and parsed back on reload. See `LibraryConfig` in `src/types.ts` and the `parseLibraryConfig` / `serialize` paths in `src/parser.ts`

## 1.1.4 (2025-06-09)

### Changed

- **Theme system simplified** — Removed built-in theme presets. Dashboard now automatically inherits Obsidian's native theme colors, seamlessly adapting to any community theme in both light and dark modes
- **File format redesigned** — Switched from `###` headings with `id:` markers to indented bullet-list format. Cleaner, more readable, and easier to edit manually

### Added

- **Delete section button** — Each section header now has a trash button to delete sections directly from the dashboard UI
- **WikiLink short names** — WikiLinks now display only the basename (e.g. `README` instead of `path/to/README.md`), with parent folder disambiguation for duplicate names

### Fixed

- **Card edit modal** — Fixed project card edit modal showing blank content
- **Todo task parsing** — Fixed indented task lines (`\t- [ ]`) not being recognized as tasks in the new bullet format

## 1.1.1 (2025-05-29)

### Fixed

- Library section config (filters, view mode, sort, page size) lost after restart — replaced custom YAML parser with `yaml` package to correctly handle nested objects in frontmatter
- Card grid position (gcol/grow) never serialized to file — empty `lines.push()` calls replaced with proper key-value output
- Write race condition — `lastWrittenHash` now set after file write completes instead of before, preventing stale data overwrite during rapid updates

## 1.0.9 (2025-05-26)

### Improved

- Pomodoro ring stroke width increased from 3px to 6px for better visibility
- Pomodoro dots moved inside the ring, positioned below the time display
- Stats hint (today count) moved to the top-left corner of the pomodoro widget, on the same line as the title
- Reduced pomodoro widget gap from 6px to 4px for a more compact layout
- All slider settings now show current value in the title (recent edits count, pomodoro work/break/interval)
- Weather API now has fallback: primary `api.open-meteo.com` with backup `archive-api.open-meteo.com`

### Fixed

- Stats hint now always visible (shows "Today 0" even when no sessions completed)
- Stats hint no longer displays total count, only today count
- Title "Pomodoro" stays centered with stats hint on the left

## 1.0.8 (2025-05-25)

### Added

- Sidebar widget: Pomodoro timer with ring progress, activity tracking, and stats
- Sidebar widget: Countdown timer with reminder notifications
- Sidebar widget: Lunar calendar with holiday support
- Todo card templates and mobile touch-friendly UI
- Banner quote color picker

### Fixed

- Preset quick actions reappear after deletion
- Blossom button hover flicker
- Removed bottom padding from banner
