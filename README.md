# Peingxious Dashboard

> Stop switching between Obsidian notes. One page. Everything you need. Memo your thoughts, crush your todos, track your projects — and make it look incredible doing it. [【中文版】](README_ZH.md)

## Screenshot

![Peingxious Dashboard](screenshot1.png)

## Features

### 🗒️ Memo

Capture thoughts instantly with a built-in memo pad. Each memo card has a writable textarea — jot down ideas, meeting notes, or daily reflections without leaving your dashboard. Supports `[[wikilinks]]` that render as clickable links, autosaves while you type, and can convert into a standalone note while keeping the memo card as a `[[wikilink]]` pointer.

### ✅ Todo

Manage tasks with interactive checklists. Add, reorder, drag-and-drop, and check off tasks. A progress bar shows completion percentage at a glance. Todo items also support `[[wikilinks]]` for cross-referencing notes.

A per-card eye button toggles "hide completed tasks" (session only, never written to the markdown). For sections, a new archive button automatically hides **whole cards** whose task list is fully checked — the default behaviour for every new Todo / TodoPlus section, and toggleable per section via the column header.

### 📁 Projects

Organize your vault documents into project cards. Each card links to related notes, displays a cover image (supports both local vault images and web URLs), and supports inline document search to add new files quickly. Manage multiple file types including Markdown notes, PDFs, images, audio, and video.

### 📝 Notes

A compact, list-style section for organizing reference documents and quick-access files. Displays up to 5 cards per row without cover images for maximum density.

### 📚 Library

A database-style section that aggregates vault notes by frontmatter properties. Pick a view mode (Grid / List / Table / Kanban), set filters, sort, and group-by, and the dashboard will render matching notes live. Supports date-range filters, multi-value property filters, and per-view property visibility (Table / List only). Right-click any row in any view to open the file context menu (Open in new tab / pane / window, Copy `[[wikilink]]`, Copy Obsidian URL, Reveal in file explorer, plus any plugin that hooks the `file-menu` event) — the same menu you get from a right-click in the File Explorer.

### ⚡ Quick Actions

Pin your most-used shortcuts to the sidebar. Supports two action types: **File** links to open any document, and **Command** shortcuts to trigger any Obsidian command. Includes built-in presets for New Journal and New Note.

### 🌤️ Sidebar Widgets

The left sidebar features decorative widgets for at-a-glance information:

- **Week Calendar** — A compact 7-day strip highlighting today's date
- **Weather Widget** — Real-time weather with current temperature, feels-like, humidity, wind speed, and a 5-day forecast with daily high/low temperatures. Powered by Open-Meteo (no API key needed). City search with geocoding autocomplete for precise location
- **Heatmap Widget** — Track daily frontmatter data (mood, sleep, etc.) as a GitHub-style contribution heatmap. Configurable summary: streak days (⚡), completion rate (✅), or both
- **Pomodoro Timer** — A focus timer with activity selector and session tracking. Start, pause, and stop timed sessions with a donut chart showing today's breakdown by activity
- **Reading Tracker** — Track your reading sessions with a built-in timer. Add books from Douban search or manual input, time your reading sessions, and record progress with page numbers. Each book card shows cover image, author, and reading progress bar
- **Countdown** — A customizable countdown to any target date, displayed as days or hours remaining
- **Lunar Widget** — Lunar calendar with Chinese holidays and the current `干支` / `生肖` notation

### 🎨 Banner

A customizable banner with an inspirational quote and optional background image. Supports both local vault images and web URLs. Multiple quotes and background images can be added, with a 1-hour quote rotation and 30-minute image rotation. Double-click to edit.

### 🔄 Drag & Drop

Drag cards between sections to reorganize your workspace. Drag task items within Todo cards to reorder. Drag document links between project/note cards.

### 🧩 Custom Sections

Create sections with 5 built-in types — **Memo**, **Todo**, **Projects**, **Notes**, **Library**, and **TodoPlus** — each with its own layout and behaviour. Mix and match to fit your workflow.

### 🔗 TodoPlus (`待办Plus`)

A section type that mirrors a checklist that already lives in another note under a `## <heading>` block. Point a card at `[[dash002#To-do]]` and the dashboard will render the live checklist from the source note — no second copy, no drift. Since 1.4.1 the card body is visually **identical to a regular Todo card** (checkbox list, add input, progress bar, hide-completed eye button) and supports the full set of operations: toggle, add, delete, edit, all written back to the source note via `vault.process` (only the touched line is changed, so neighbouring sections stay intact). The card's `+` button (1.4.3+) opens a vault-wide note search modal: pick any note, and if it doesn't already have a `## To-do` heading the plugin will append a fresh one for you. Since 1.4.6 the section's archive button (default ON) automatically hides every TodoPlus card whose source checklist is fully checked.

### 🕐 Recent Documents

The sidebar shows recently edited files with relative timestamps, so you can jump back into your latest work.

### ⏰ Task Reminders

Set a reminder for any task. Click the bell icon next to a task to open a calendar picker (with month navigation, day click, hour and minute dropdowns). The reminder is stored inline in the markdown as `⏰ YYYY-MM-DD HH:MM` so it stays transparent in your notes. A 60-second watcher fires Obsidian `Notice` notifications when reminders come due; overdue bells turn red and pulse.

### 🧬 Note → Dashboard Conversion

Convert any markdown note into a dashboard with one command. The plugin scans the note for `## H2` headings (skipping self-referential headings) and writes them as `columns:` in the file's frontmatter, then opens the dashboard overlay for that note. The reverse command strips the dashboard frontmatter to restore the original note.

### 📑 Embedded Note Tabs

Embed any other note as a tab inside the main workspace dashboard. The embedded note's `## H2` headings become columns inside a sub-tab, so you can switch between multiple "dashboarded" notes side by side. A dedicated open / close picker (with excluded-paths filter) lives in the nav bar.

### ↩️ Undo (Ctrl/Cmd+Z)

Press `Ctrl+Z` (Cmd+Z on macOS) inside the dashboard to restore the most recently deleted card, todo task, project item, or column. Up to 50 deletions are kept in an in-memory stack. The same action is exposed as a command-palette entry (with the same hotkey), and is automatically hidden when the stack is empty.

## Themes

The dashboard automatically inherits your Obsidian theme colors, seamlessly adapting to any community theme in both light and dark modes — no extra configuration needed. A built-in style preset picker (Earth / Nordic / Aurora / Spring / Island / Tundra / Blossom / Haze / Ember / Jade / Matcha / Lilac / Eclipse) lets you pin a specific look, or leave it on Auto to follow the active Obsidian theme.

## Commands

| Command ID                    | Name                        | Default Hotkey     |
| ----------------------------- | --------------------------- | ------------------ |
| `open-dashboard`              | Open dashboard              | —                  |
| `toggle-dashboard-sidebar`    | Toggle dashboard sidebar    | —                  |
| `convert-note-to-dashboard`   | Convert note to dashboard   | —                  |
| `restore-note-from-dashboard` | Restore note from dashboard | —                  |
| `embed-note-in-dashboard`     | Embed note in dashboard     | `Ctrl+Alt+D`       |
| (built-in)                    | Undo last delete            | `Ctrl+Z` / `Cmd+Z` |

## Settings

- **Dashboard file** — customize the file path for your dashboard data
- **Style preset** — pick a built-in look (Earth / Nordic / Aurora / Spring / Island / Tundra / Blossom / Haze / Ember / Jade / Matcha / Lilac / Eclipse) or leave on Auto to follow the Obsidian theme
- **Language** — English or Chinese interface
- **Recent documents count** — control how many recent files appear
- **Pin sidebar by default** — keep the right sidebar always visible when opening the dashboard
- **Hide nested project docs** — only show top-level documents in project cards; nested children are hidden but preserved
- **Hide completed tasks in Todo cards by default** _(default: on)_ — global default for the per-card eye / hide-completed filter. The per-card eye is a session-only override; the on-disk state of every card is "unset" and resolves to this default
- **Auto-archive completed cards in Todo / TodoPlus sections** _(default: on per section)_ — controls the per-section archive button. When on, any card whose task list is fully checked is hidden from the dashboard
- **Excluded notes** — comma-separated list of note basenames / paths hidden from the "Open" tab picker (e.g. `dashboard, area/workbench`). The main dashboard file is excluded by default
- **Sidebar widgets** — Weather, Heatmap, Pomodoro, Reading, Countdown, Lunar. Enable / disable and configure each widget independently
- **Reading settings** — Toggle reading tracker, enable / disable session completion sound

## Installation

### From Obsidian Community Plugins

1. Open Settings > Community Plugins
2. Browse and search for "Peingxious Dashboard"
3. Click Install, then Enable

### Manual Installation

1. Download the latest release from [GitHub Releases](https://github.com/pandorareads/peingxious-dashboard/releases)
2. Extract into your vault's `.obsidian/plugins/peingxious-dashboard/` folder
3. Open Settings > Community Plugins and enable "Peingxious Dashboard"

## Usage

1. Open the dashboard via the ribbon icon (home icon) or command palette: `Peingxious Dashboard: Open dashboard`
2. A `dashboard.md` file is automatically created in your vault root
3. All changes are saved directly to the file — it's your data, in plain text

### File Format

The dashboard uses an indented bullet-list format:

```markdown
---
columns:
  - name: "Memo"
  - name: "Todo"
  - name: "Projects"
---

## Memo

- 2026-06-08 memo
  - Welcome to Peingxious Dashboard! Click here to edit your first memo.

## Todo

- Task list
  - [ ] Review dashboard plugin code
  - [ ] Write documentation
  - due: 2025-05-20

## Projects

- Obsidian Dashboard
  - [[obsidian-dashboard/README.md]]
  - progress: 60
```

- `---` frontmatter defines section columns (and optional `archiveCompleted: true|false` per column)
- `##` headings define section bodies
- Top-level `-` defines card titles
- Indented `\t-` defines card content (text, tasks, metadata, etc.)
- Tasks use `- [ ]` / `- [x]` format
- Metadata uses `key: value` format (e.g. `due:`, `progress:`, `link:`)

> **Tip:** Each section header has a trash button to delete sections directly from the dashboard UI.

## What's New

### 1.4.13 (2026-06-26)

- **All hover effects removed from `dashboard-card` / `dashboard-card--project` / library cards / wikilinks** — every `:hover` rule under those classes (background tint, border, shadow, transform, the in-house tooltip `div` and popover) is gone. Cards and wikilinks are now visually static, matching the "no fancy hover, just the data" requirement. No more `position: fixed; top: …; left: …` ghost elements on hover
- **Wikilink preview in the dashboard is Obsidian's native Page Preview** — every `[[wikilink]]` in a dashboard card and every card in a library view triggers the same hover popover you get in the editor. The preview only fires while the user holds **Ctrl** (Windows / Linux) or **Cmd** (macOS) — a 200 ms debounce prevents a popover from being mounted on every mouse pass when navigating with the keyboard / trackpad. Implementation dispatches `app.workspace.trigger("hover-link", …)` with the same payload shape Obsidian's own editor uses, so the popover's behaviour (markdown render, link resolution, theme inheritance) is identical to a `[[wikilink]]` in a regular note
- **Library quick-date filter and configuration modal now share 8 one-tap date presets** — Today, Yesterday, This week, Last week, This month, Last month, Last 7 days, Last 30 days. In the toolbar filter popup the chips apply immediately and close the popup; in the configuration modal the chips fill the start / end date inputs and sync `quickDateFilter` so the saved value is still editable by hand. ISO week (Monday-anchored) and month-end arithmetic are computed in local time, so "Today" is the user's wall-clock today across timezones. The preset logic lives in a dedicated `date-presets.ts` module so the two surfaces can never drift
- **Library config round-trip: every field is now reliably persisted to `dashboard.md` frontmatter** — `filters`, `visibleProperties`, `pageSize`, `kanbanGroupBy` are now always emitted, so a hand-written `filters: [{ property: "Type", values: ["A","B"] }]` survives the next save instead of being silently dropped. Round-trip verified end-to-end: parse → serialise → parse is byte-stable

### 1.4.12 (2026-06-25)

- **Memo cards autosave more reliably on the main dashboard** — memo edits now debounce-save while typing and save on blur with error reporting, so the main page no longer depends on a perfect focus change to write back to `dashboard.md`
- **Memo "Convert to note" now migrates content instead of creating a blank link note** — the current memo body is copied into the new markdown note, and the original memo card is reduced to a single `[[new note]]` link so the dashboard stays as a pointer to the standalone note

### 1.4.11 (2026-06-23)

- **`.dashboard-backup` automatic backup removed** — `SyncEngine` no longer writes `.dashboard-backup/dashboard-<timestamp>.md` snapshots before overwriting the dashboard file. The `BACKUP_DIR` / `MAX_BACKUPS` constants and the entire `createBackup()` method are deleted. The dashboard's source of truth is now strictly the single dashboard markdown — no parallel copies in the vault. The in-app `Ctrl/Cmd+Z` undo stack is unchanged and remains the recovery path for destructive operations. Note: any `.dashboard-backup/` directory created by older versions will remain in your vault until you delete it manually (one-time cleanup, the plugin no longer produces new files there)

### 1.4.10 (2026-06-16)

- **Banner frontmatter simplified to a single-line scalar** — `banner: "url"` is now written instead of the two-line `banner:\n  image: "url"` nested form. Cleaner, no behavioural change: existing files load unchanged, URLs are quoted with `"` so URLs containing `?` / `&` / `#` / unicode (e.g. `huaban.com/…-lmNOvW`) round-trip safely
- **Banner is single-image only** — the multi-image `images: []` write path is removed. `banner.images` is still tolerated on read for legacy files, but the plugin never writes it. Per user request: "图片只能有一张，不是多张的"
- **Switching section type no longer destroys the user's content** — `migrateCardsForSectionType` now converts each task to a body line and keeps the existing body intact, instead of clearing `card.tasks` outright. Net effect: a `todo → projects` switch keeps the original task text (with `[ ]` removed per the user's "去掉 [ ] 就可以了" rule), and a `projects → todo` switch re-hydrates `card.tasks` from the body, preserving the leading `- ` prefix so the round-trip is byte-stable. The data is now strictly preserved across every (from × to) cell of the four section types
- **Library section: right-click file context menu works in every view mode** — Grid, list, and kanban cards (including the kanban "no group" column) now fire the same `showFileContextMenu` handler on right-click that the table view's "name" cell already had. Right-clicking any library row exposes Open in new tab / pane / window, Copy `[[wikilink]]`, Copy Obsidian URL, Reveal in file explorer, plus any plugin that hooks the `file-menu` workspace event. The table view's listener moved from the name cell up to the row, so right-clicking a frontmatter value cell (the editable ones triggered by dblclick) also opens the menu
- **Tests** — `tests/migration.test.mjs` (8 cases, all pass) and `tests/banner.test.mjs` (8 cases, all pass) added under `tests/`

### 1.4.9 (2026-06-15)

- **BUG-003a · 切换分区类型时工作台同帧刷新** — added [`SyncEngine.updateFrontmatterField()`](file:///d:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/sync.ts#L1543) + [`updateColumnsField()`](file:///d:/BaiduNetdiskWorkspace/test/.obsidian/plugins/apex-dashboard/src/sync.ts#L1605) public methods that go through `app.fileManager.processFrontMatter()` to mutate the `columns:` field in place. `setColumnSectionType` / `setColumnArchiveCompleted` switched to the new path and synchronously fire `notifyCallbacks` → `view.requestRender(newData)` so the new type reflects in the same frame. The view's `onColumnSectionTypeChange` callback forces a second `requestRender` defensively (covers the case where RAF coalescing swallows the first). Fixes the previous "switch tab and switch back" UX
- **BUG-003b · banner block conditional output** — `parser.ts:serialize` no longer hard-codes `lines.push("banner:")`; the `banner:` block is only emitted when `data.banner.image` is non-empty. A user who has never edited the banner now has a file with **no** `banner:` field, a user who has edited it keeps the block, and a user who clears the banner image gets the block auto-removed on the next save (via `serializeInto` → `patchYamlBlock`'s null block path). `parseBanner` is unchanged, so old files with a `banner:` block still load
- **BUG-003c · columns-only write path** — switching the section type no longer rewrites the entire file. The new path only mutates the `columns:` field; `banner` / `quickActions` / extra frontmatter / YAML comments / blank-line order are byte-identical before and after. `writeToDisk` (full-file path) is preserved for the card add/delete/edit, banner edit, and quickActions add/delete flows. Errors are no longer silent — `console.error` + a `new Notice("Failed to save dashboard changes")` surfaces failures

### 1.4.8 (2026-06-15)

- **BUG-001 · Banner simplified to a single image, the edit modal only shows the image address** — removed the "Rotation Images" list and the "Add Image" button from the banner edit modal. The banner is no longer a carousel. The modal keeps exactly one image-address input (vault-relative path or full https URL). `view.ts:setupBannerRotation` is deleted; `images.length > 1` no longer overrides the primary image. `parser.ts:serialize` no longer emits a `banner.images:` block; `banner.images` is ignored on read (backward-compat with old files). The 7 missing banner i18n keys in `i18n.ts` (`banner.edit` / `banner.image` / `banner.imageDesc` / `banner.imagePlaceholder` / `banner.rotationImages` / `banner.addImage` / `banner.save`) are filled in so modal labels / placeholders display correctly
- **BUG-002 · First-open no longer injects default sections** — added `generateEmptyDashboardMarkdown()` to `parser.ts:600` which outputs only the minimum frontmatter + `columns: []` skeleton. `sync.ts:findOrCreateFile` now uses `generateEmptyDashboardMarkdown()` for new files (replacing `generateDefaultMarkdown()`). `parser.ts:parseColumnDefs` returns `[]` when `columns:` is missing, no longer falling back to `DEFAULT_COLUMNS`. `DEFAULT_COLUMNS` / `generateDefaultMarkdown` are kept and marked `@deprecated` for a future "insert sample data" button. A user who clears the `columns:` block from `dashboard.md` and reopens gets an empty dashboard, the file is **not** rewritten back to defaults

### 1.4.7 (2026-06-15)

- **Documentation sync** — README / README_ZH / versions.json fully aligned with the v1.4.0 → v1.4.6 changelog. All features shipped since 1.4.1 (TodoPlus card UI alignment, the + button note-search modal, the per-section auto-archive toggle) are now documented under the corresponding features above. No code changes

### 1.4.6 (2026-06-14)

- **Per-section "archive completed cards" button (Todo / TodoPlus)** — replaces the v1.4.5 per-section "hide completed items" filter. When ON (default for new and existing sections), any card whose task list is fully checked is hidden from the dashboard. When OFF, every card is shown. The new button uses `archive` / `archive-restore` lucide icons. The property name in column frontmatter is `archiveCompleted: true|false` (replaces `hideCompleted`; v1.4.5 files round-trip on the next save)
- **Empty-state placeholder** — when every card in a section is archived, the section shows a muted `"All cards are archived…"` line so the user gets feedback
- **TodoPlus archive check reads the source note live** — for TodoPlus cards the decision is made by parsing the source file's heading slice via the existing `resolveTodoPlusSlice` helper, so the archive reflects the source-note state, not a stale mirror
- **Removed the v1.4.5 column-level "hide completed items" override** — the per-card eye icon (session-only, in-memory only) is the sole item-level filter

### 1.4.5 (2026-06-14)

- **Per-section "show / hide all completed tasks" toggle (Todo / TodoPlus)** — new section-level eye in the column header, persisted in `columns:` frontmatter as `hideCompleted: true|false`. Survives reloads and applies to every card in the section. Resolution order, most-specific wins: `card.hideCompleted` (session-only) → `column.hideCompleted` (this new feature) → `settings.defaultHideCompleted` (global). Clicking the section eye a third time writes `undefined` (line dropped from the file)
- **Fixed TodoPlus slice drift on add** — adding a new task previously drifted one newline to the right every time because the empty line after the last task was kept verbatim; the slice-end computation now trims trailing blank lines before splicing
- **Fixed TodoPlus first-time auto-append stray blank line** — when the picked source note didn't have a `## To-do` heading yet, the appended block is now flush against the body (one `\n` separator)
- **"Add section" picker now groups `Todo` next to `TodoPlus`** — dropdown reordered to `Notes / Todo / Todoplus / Memo / Library`

### 1.4.4 (2026-06-14)

- **Fixed TodoPlus new-card title double `[[ ]]` wrapping** — `addTodoPlusCardFromNote` now uses `file.basename` directly (TFile's `.basename` is already `.md`-stripped), so the resulting `[[dash03#To-do]]` no longer has four brackets. The card title is now compatible with the per-card parser `getTodoPlusSourceLinkFromTitle`
- **Removed `Notes (no cover)` entry from the "Add section" picker** — was a legacy alias for `Notes` with no separate icon / style. Existing `notes` sections still parse / render / serialise correctly; only the new-section entry point is gone
- **Cleaned up unused `pathToWikiLink` import and `typeNotesPlain` i18n key**

### 1.4.3 (2026-06-14)

- **TodoPlus column `+` button now opens a note-search modal** — replaces the inline wikilink-input UX (which required hand-typing a `dash002#To-do` / `[[dash002#To-do]]` / `dash002` string and validating it). The new flow: click `+` → `DocSearchModal` opens (same modal Project uses; substring filter, max 20 hits, refilters as you type) → pick a note → the modal closes → a `[[note#To-do]]` mirror card is added. If the picked note doesn't yet have a `## To-do` heading, the plugin appends one via `vault.process`

### 1.4.2 (2026-06-14)

- **Removed redundant per-card metadata for TodoPlus** — the on-disk card body is now exactly one bullet line (`- [[dash002#To-do]]`) plus its indented metadata (cover / width / size / grid). The `type: todoplus` and `sourceLink: "[[...]]"` lines that 1.4.0 / 1.4.1 wrote are no longer emitted (the column's `sectionType: todoplus` and the card's wikilink title are the single source of truth for both)
- **`DashboardCard.sourceLink` field removed** — the renderer now reads the source link from the card's title via a new `getTodoPlusSourceLinkFromTitle(card)` helper
- **`onCardAdd` option shape changed** — `options.sourceLink` replaced by `options.title`. For TodoPlus columns the caller passes the wikilink-form title `[[note#heading]]` directly

### 1.4.1 (2026-06-14)

- **TodoPlus card body now matches the regular Todo card exactly** — the 1.4.0 chrome (Source/## header rows, source-link caption) is gone. The body reuses the standard `dashboard-task-list` / `dashboard-task-item` / `dashboard-task-add` / `dashboard-progress` DOM, so a TodoPlus card is visually identical to a plain Todo card. The hide-completed eye button in the card header now applies
- **Three new vault-write helpers** — `addTodoPlusItem` / `removeTodoPlusItem` / `editTodoPlusItem` (all routed through `vault.process`) — add / delete / edit `- [ ]` lines inside the source file's `## <heading>` slice, so neighbouring sections stay byte-identical
- **Card `title` auto-set to the wikilink** — when a TodoPlus card is created or its source is changed, the card's first-bullet title is set to `[[note#heading]]`, matching the source link and keeping the on-disk / in-memory round-trip clean

### 1.4.0 (2026-06-14)

- **New section type: TodoPlus (`待办Plus`)** — mirrors a checklist that lives in another note under a `## <heading>` block. Each card stores its own `sourceLink` (e.g. `dash002#To-do`) and renders the live checklist straight from the source — no second copy, no drift
- **Bidirectional sync** — toggling a checkbox rewrites the matching line in the source note via `vault.process` (only the touched line is changed)
- **Native read path** — TodoPlus uses only Obsidian's built-in APIs (`metadataCache.getFirstLinkpathDest` + `metadataCache.getFileCache(file).headings` + `vault.cachedRead`) to slice the heading range. No new persistence layer
- **Section type dropdown + new-section picker list `待办Plus`** — `list-checks` icon
- **Wikilink-as-title** — the source link is rendered as a clickable `[[note#heading]]`

### 1.3.0 (2026-06-13)

- **New global setting: hide completed tasks in Todo cards by default** — toggle in Settings (default ON). The per-card eye / eye-off button still works as a session-only peek, but the override is never written to the dashboard markdown
- **`hideCompleted: true` is no longer written to the dashboard markdown** — the field is purely a render-time resolution between the global setting and the in-memory card flag

### 1.2.0 (2026-06-13)

- **Plugin renamed: Apex Dashboard → Peingxious Dashboard** — plugin ID (`peingxious-dashboard`), display name, author, and description have all been updated. The npm package name is now `peingxious-dashboard`. Internal class names (`.peingxious-dashboard-root`, `.peingxious-note-dashboard-root`), view types (`peingxious-dashboard-view`, `peingxious-dashboard-sidebar`), `localStorage` keys, the `peingxious-dashboard-template` YAML marker, and the `[peingxious-dashboard]` log tag all follow the new naming
- **Author changed to Peingxious** — `manifest.json` `author` field is now `Peingxious`
- **Description rewritten** — new copy reflects the expanded surface (memos, todos, projects, library, weather, quick links) under the new brand

### 1.1.17 (2026-06-12)

- **File suggest dropdown no longer shows a fixed-height empty background** — the dropdown now sizes to its content; single-item suggestions render as a compact ~52px card with no empty area beneath them
- **Full-width `【【` opener now triggers the wikilink dropdown** — both ASCII and full-width openers are recognized; the matching closer (`]]` / `】】`) is preserved on pick
- **Picking a file preserves the leading text typed before `[[`** — only the `[[…` fragment is swapped, so `review [[xyz` + pick → `review [[Foo]]`, not just `[[Foo]]`
- **Pure-logic test suite for the wikilink context** — 27 cases; run with `npm test`

### 1.1.14 (2026-06-12)

- **Project-item wikilink: native Page Preview on plain hover; card titles stay passive** — Page Preview is the only hover affordance, fires on plain `mouseover` (200ms delay, no Ctrl required), and is opt-in per call site. Only the project-item title span opts in
- **Section title is no longer split into "title text + #N badge"** — a column name is a user-facing label and now renders verbatim

### 1.1.13 (2026-06-12)

- **Native file preview on Ctrl/Cmd+hover for project-item wikilinks** — dispatches the workspace-level `link-hover` event (same one the markdown post-processor fires); 200ms delay, mouseleave / keydown / re-render all cancel the timer

### 1.1.11 (2026-06-12)

- **File-suggest: no pre-selection on input, subtler highlight style** — soft `rgba(99, 102, 241, 0.18)` background with a 1px inner accent ring

### 1.1.10 (2026-06-12)

- **File-suggest dropdown highlight now visible on ↑/↓ navigation** — indigo→light-indigo gradient, 3px accent left-border, bold weight

### 1.1.9 (2026-06-12)

- **File-suggest dropdown no longer auto-picks the first match on Enter** — pressing Enter without ↑/↓ leaves the input untouched; mouse click still works

### 1.1.8 (2026-06-12)

- **Ctrl/Cmd+Z undo for one-click deletes** — restores the most recently deleted card, todo task, project item, or column. In-memory undo stack capped at 50 entries
- **Command-palette entry** — "Undo last delete" with Ctrl/Cmd+Z as the hotkey; contextually hidden when the stack is empty

### 1.1.7 (2026-06-12)

- **Unified row-delete UX** — small red X button is the single delete affordance for both todo tasks and project/memo items
- **One-click delete** — clicking the X on a todo task, a project item, or a card header deletes the entry directly, no "Are you sure?" confirm

### 1.1.6 (2026-06-12)

- **Library list view — pill meta row** — property values shown as rounded pill chips (no key labels) immediately before the time at the end of each list entry

### 1.1.5 (2026-06-12)

- **Library table / list — Visible Properties** — pick exactly which property fields to show as table columns (or list metadata chips). Configurable in the library config modal (Table / List only)
- **Kanban exclusive setting preserved** — the "Group by" setting continues to appear only when Kanban is the active view mode

### 1.1.3 (2026-06-12)

- **Mobile widget bar redesign** — replaced the overlapping tab buttons with a collapsible strip below the banner
- **Theme-aware tab colors** — adapt to both light and dark themes
- **Updated widget icons** — Pomodoro hourglass, Lunar moon
- **Custom dialogs** — replaced native browser dialogs with Obsidian-styled custom modals

### 1.1.2 (2026-06-12)

- **Obsidian plugin review fixes** — addressed feedback from the official Obsidian plugin review process
- **MIT license** — changed license from ISC to MIT

### 1.1.1 (2026-06-12)

- **Library config persistence** — fixed a critical bug where library section configurations (filters, view mode, sort settings, page size) were lost after restarting Obsidian
- **Grid position persistence** — fixed grid position (gcol/grow) values never being saved to the dashboard file
- **Write race condition fix** — fixed a race condition where rapid updates could cause the file watcher to overwrite newer data with older content

### 1.1.0 (2026-06-12)

- **Reading Tracker widget** — full reading session management in the sidebar
- **Book cards** — cover image, title, author, reading progress bar, today's reading time
- **Edit book info** — hover to reveal edit / remove buttons
- **Reading statistics** — total time, today's reading, book count, streak, week / month / year breakdown, recent session records

## License

0BSD
