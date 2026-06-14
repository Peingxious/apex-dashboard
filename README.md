# Peingxious Dashboard

> Stop switching between Obsidian notes. One page. Everything you need. Memo your thoughts, crush your todos, track your projects — and make it look incredible doing it. [【中文版】](README_ZH.md)

## Screenshot

![Peingxious Dashboard](screenshot1.png)

## Features

### 🗒️ Memo

Capture thoughts instantly with a built-in memo pad. Each memo card has a writable textarea — jot down ideas, meeting notes, or daily reflections without leaving your dashboard. Supports `[[wikilinks]]` that render as clickable links.

### ✅ Todo

Manage tasks with interactive checklists. Add, reorder, drag-and-drop, and check off tasks. A progress bar shows completion percentage at a glance. Todo items also support `[[wikilinks]]` for cross-referencing notes.

### 📁 Projects

Organize your vault documents into project cards. Each card links to related notes, displays a cover image (supports both local vault images and web URLs), and supports inline document search to add new files quickly. Manage multiple file types including Markdown notes, PDFs, images, audio, and video.

### 📝 Notes

A compact, list-style section for organizing reference documents and quick-access files. Displays up to 5 cards per row without cover images for maximum density.

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

### 🎨 Banner

A customizable banner with an inspirational quote and optional background image. Supports both local vault images and web URLs. Double-click to edit.

### 🔄 Drag & Drop

Drag cards between sections to reorganize your workspace. Drag task items within Todo cards to reorder. Drag document links between project/note cards.

### 🧩 Custom Sections

Create sections with 4 built-in types — **Memo**, **Todo**, **Projects**, **Notes**, and **TodoPlus** — each with its own layout and behavior. Mix and match to fit your workflow.

### 🔗 TodoPlus (`待办Plus`)

A section type that mirrors a checklist that already lives in another note under a `## <heading>` block. Point a card at `[[dash002#To-do]]` and the dashboard will render the live checklist from the source note — no second copy, no drift. Since 1.4.1 the card body is visually **identical to a regular Todo card** (checkbox list, add input, progress bar, hide-completed eye button) and supports the full set of operations: toggle, add, delete, edit, all written back to the source note via `vault.process` (only the touched line is changed, so neighbouring sections stay intact). The card's `+` button lets you point it at any `[[note#heading]]` in the vault, and if the heading doesn't exist yet, the plugin appends a fresh `## heading` block for you.

### 🕐 Recent Documents

The sidebar shows recently edited files with relative timestamps, so you can jump back into your latest work.

## Themes

The dashboard automatically inherits your Obsidian theme colors, seamlessly adapting to any community theme in both light and dark modes — no extra configuration needed.

## Settings

- **Dashboard file** — customize the file path for your dashboard data
- **Language** — English or Chinese interface
- **Recent documents count** — control how many recent files appear
- **Pin sidebar by default** — keep the right sidebar always visible when opening the dashboard
- **Hide nested project docs** — only show top-level documents in project cards; nested children are hidden but preserved
- **Hide completed tasks in Todo cards by default** _(default: on)_ — when on, every Todo card hides completed items in the visible list on first render. The eye/eye-off button on each card is a session-only override; it does not persist into the markdown
- **Excluded notes** — comma-separated list of note basenames / paths hidden from the "Open" tab picker (e.g. `dashboard, area/workbench`). The main dashboard file is excluded by default
- **Sidebar widgets** — Weather, Heatmap, Pomodoro, Reading, Countdown. Enable/disable and configure each widget independently
- **Reading settings** — Toggle reading tracker, enable/disable session completion sound

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

- `##` headings define sections
- Top-level `-` defines card titles
- Indented `\t-` defines card content (text, tasks, metadata, etc.)
- Tasks use `- [ ]` / `- [x]` format
- Metadata uses `key: value` format (e.g. `due:`, `progress:`, `link:`)

> **Tip:** Each section header has a trash button to delete sections directly from the dashboard UI.

## What's New

### 1.4.1

- **TodoPlus card now matches the regular Todo card, body and all** — the 1.4.0 release shipped TodoPlus with its own header (a "Source: [[…]]" link + a "## heading" caption) and only a working checkbox toggle. In 1.4.1 those decorations are gone; the body reuses the standard `dashboard-task-list` / `dashboard-task-item` / `dashboard-task-add` / `dashboard-progress` DOM, so a TodoPlus card is visually identical to a plain Todo card. The hide-completed eye button in the card header now applies (the header's `isTask` / `isTaskCard` checks were extended to include `sectionType === "todoplus"`)
- **Add / delete / edit all sync back to the source note** — three new `vault.process` helpers (`addTodoPlusItem`, `removeTodoPlusItem`, `editTodoPlusItem`) write the corresponding `- [ ]` / `- [x]` line in the source file. Only the bytes inside the `## <heading>` slice are touched, so neighbouring sections, paragraphs, and other headings stay byte-identical

### 1.4.0

- **New section type: TodoPlus (`待办Plus`)** — A card that mirrors a checklist that already lives in another note under a `## <heading>` block. Point it at `[[dash002#To-do]]` and the dashboard will render the live checklist from the source note. Toggling a checkbox rewrites the matching line in the source note via `vault.process` (only the touched line is changed, so neighbouring sections stay intact). Click the `+` in a TodoPlus section to point a new card at any `[[note#heading]]` in the vault; if the heading doesn't exist yet, the plugin appends a fresh `## heading` block for you
- **Native read path** — TodoPlus uses only Obsidian's built-in APIs (`metadataCache.getFirstLinkpathDest` + `metadataCache.getFileCache(file).headings` + `vault.cachedRead`) to slice the heading range. No new persistence layer, no DOM hacks
- **Source link is stored on the card, not the section** — like Project's `addGroup`, each TodoPlus card carries its own `sourceLink` (e.g. `dash002#To-do`). A single TodoPlus section can therefore mirror several different notes / headings side by side, or just one

### 1.3.0

- **New global setting: hide completed tasks in Todo cards by default** — A toggle in Settings (default ON). When on, every Todo card hides completed items in its visible list on first render. The per-card eye/eye-off button still works as a quick "show / hide" peek, but that override is now session-only and never written to the dashboard markdown
- **`hideCompleted: true` is no longer written to the dashboard markdown** — The dashboard note stays clean; the field is purely a render-time resolution between the global setting and the in-memory card flag

### 1.2.0

- **Plugin renamed: Apex Dashboard → Peingxious Dashboard** — The plugin ID (`peingxious-dashboard`), display name, author, and description have all been updated. The npm package name is now `peingxious-dashboard`. Internal class names (`.peingxious-dashboard-root`, `.peingxious-note-dashboard-root`), view types (`peingxious-dashboard-view`, `peingxious-dashboard-sidebar`), `localStorage` keys, the `peingxious-dashboard-template` YAML marker, and the `[peingxious-dashboard]` log tag all follow the new naming
- **Author changed to Peingxious** — `manifest.json` `author` field is now `Peingxious`
- **Description rewritten** — New copy reflects the expanded surface (memos, todos, projects, library, weather, quick links) under the new brand

### 1.1.17

- **File suggest dropdown no longer shows a fixed-height empty background** — The `positionDropdown()` layout was setting a hard minimum height (e.g. 220px) that left a large blank panel when only 1-2 results matched. The dropdown now sizes to its content: `maxHeight` is bounded by the space below the input, and the inner list uses `flex: 0 1 auto` so it shrinks with the items. Single-item suggestions now render as a compact ~52px card with no empty area beneath them
- **Full-width `【【` opener now triggers the wikilink dropdown** — `findWikilinkContext()` previously only matched ASCII `[[`. Both ASCII and full-width openers are now recognized as wikilink starters, and the matching closer (`]]` / `】】`) is preserved on pick. Mixed-bracket typing (e.g. `【【abc]]`) is treated as a closed link and won't reopen the dropdown
- **Picking a file preserves the leading text typed before `[[`** — The replacement used to overwrite the entire input value, dropping any text the user had typed before the opener. `applyWikilinkReplacement()` now only swaps the `[[…` fragment, so `review [[xyz` + pick → `review [[Foo]]`, not just `[[Foo]]`. Trailing `]]` / `】】` already typed by the user are also dropped from the result so we never produce `[[Foo]]]`
- **Pure-logic test suite for the wikilink context** — Extracted the context-detection and replacement helpers into `src/wikilink-context.ts` (no Obsidian dependency) and added `tests/wikilink-context.test.mjs` covering 27 cases (empty input, single bracket, ASCII / full-width openers, stray leading brackets, alias / section syntax, newlines, mid-query caret, leading + trailing text preservation, mixed-bracket closers). Run with `npm test`

### 1.1.14

- **Project-item wikilink: native Page Preview on plain hover; card titles stay passive** — The earlier 1.1.14 pass added a `title` HTML attribute so plain hover showed a small browser tooltip; the user did not want that — it produced a tag-style "To Read" chip on the card title. Removed. Page Preview (the rich popover) is now the only hover affordance, fires on plain `mouseover` (200ms delay, no Ctrl required), and is opt-in per call site via `renderTextWithLinks(..., { enableHover: true })`. Only the project-item title span opts in; card titles, task text, and note text intentionally never trigger a preview
- **Section title is no longer split into "title text + #N badge"** — The 1.1.12 "trailing number as badge" change is reverted. A column name is a user-facing label (`library`, `Project 5`, `121`, `闪念-2026-01月`), not an id, so it now renders verbatim as the `<h3>` — the same way every other section name is displayed. This also fixes the empty `<h3>` that happened when a column was just a number like `121`. Removed `splitTrailingNumber()`, the `.dashboard-section-number-badge` CSS, and the `renderer.columnNumberBadge` i18n string. Rename input and cancel-restore both use the full `column.name`

### 1.1.13

- **Native file preview on Ctrl/Cmd+hover for project-item wikilinks** — Project items in the workspace section were rendered as custom DOM, not via the markdown post-processor, so the core `Page Preview` plugin never saw them and hovering with Ctrl/Cmd did nothing. The fix dispatches the workspace-level `link-hover` event (the same one the markdown post-processor fires) whenever the user holds Ctrl (Cmd on macOS) and hovers for ~200ms. The same native popover that fires for a wikilink in any markdown view now fires for a project item too — fragment-aware navigation, embeds, and "Open" / "Open to the right" all work as expected. Mouseleave, key-down, and re-render detach all cancel the timer

### 1.1.12

- **Column title: trailing number rendered as a styled badge** — _Reverted in 1.1.14_ (the section name is a user-facing label, not an id)

### 1.1.11

- **File-suggest: no pre-selection on input, subtler highlight style** — No row is pre-highlighted when you type; pressing ↓ / ↑ moves a soft accent-tint highlight. The previous gradient + thick left-border + bold was too loud; it is now a soft `rgba(99, 102, 241, 0.18)` background with a 1px inner accent ring

### 1.1.10

- **File-suggest dropdown highlight now visible on ↑/↓ navigation** — The highlighted row is now unmistakable: indigo→light-indigo gradient, 3px accent left-border, bold weight. Hover on unselected rows is also restored. The fix removes an inline `background: transparent` that was beating the CSS `.is-selected` and `:hover` rules

### 1.1.9

- **File-suggest dropdown no longer auto-picks the first match on Enter** — The vault file search dropdown (used by add-note and other picker inputs) used to commit the first filtered match as soon as the user pressed Enter, which silently overwrote the text the user had just typed. Now the highlighted row is still the top match (visual cue), but pressing Enter without first navigating with ↑ / ↓ leaves the input untouched — the caller reads exactly the typed text. Mouse click on a row still works as before

### 1.1.8

- **Ctrl/Cmd+Z undo for one-click deletes** — Pressing Ctrl+Z (Cmd+Z on macOS) inside the dashboard now restores the most recently deleted card, todo task, project item, or column. A snapshot of the removed data is captured before each destructive op and pushed to an in-memory undo stack (capped at 50 entries). The view re-renders automatically after the undo, and a brief Notice shows which type of entry was restored. Obsidian's native editor undo continues to work inside text inputs — the global keydown listener bails when the focus is on an `<input>`, `<textarea>`, or any `contenteditable` element
- **Command-palette entry** — The same undo action is now available as "Undo last delete" in Obsidian's command palette, with Ctrl/Cmd+Z as the explicit hotkey. The command is contextually hidden when there is nothing on the undo stack

### 1.1.7

- **Unified row-delete UX** — The small red X button is now the single delete affordance for both todo tasks and project/memo items. It appears on hover with a subtle 4px rounded shape and fills with the theme danger color. The previous larger red X with the "Delete task" tooltip on project items has been retired in favor of the same compact treatment todo uses
- **One-click delete** — Clicking the X on a todo task, a project item, or a card header now deletes the entry directly, mirroring project/memo's existing behavior. The "Are you sure?" confirm modal that previously interrupted card and task deletion has been removed

### 1.1.6

- **Library list view — pill meta row** — Property values are now shown as rounded pill chips (no key labels) immediately before the time at the end of each list entry. The chips keep the familiar rounded border and subtle background from the previous design, while the time remains a plain muted label as the final element. This gives the list view a clean, scannable layout that matches the table view's column ordering

### 1.1.5

- **Library table / list — Visible Properties** — Pick exactly which property fields to show as table columns (or list metadata chips). A new "Visible Properties" section appears in the library config modal when the view mode is set to Table or List. Uncheck a property to hide it; use "Show all" / "Deselect all" for quick batch actions. When unset (legacy configs), the view keeps its previous auto-discovery behavior — fully backward compatible
- **Kanban exclusive setting preserved** — The "Group by" setting continues to appear only when Kanban is the active view mode, ensuring it never bleeds into the Table / List / Grid configurations

### 1.1.3

- **Mobile widget bar redesign** — Replaced the overlapping tab buttons with a collapsible strip below the banner. Tap the strip to reveal wider bookmark tabs (Pomodoro, Reading, Lunar), then tap a tab to expand its widget panel
- **Theme-aware tab colors** — Tab icons now transition from gray (inactive) to the theme primary text color (active), adapting to both light and dark themes
- **Updated widget icons** — Pomodoro uses hourglass icon, Lunar uses moon icon for clearer visual identity
- **Custom dialogs** — Replaced native browser dialogs with Obsidian-styled custom modals
- **Class rename** — Cleaned up internal class naming conventions
- **Style improvements** — Various visual polish and consistency fixes

### 1.1.2

- **Obsidian plugin review fixes** — Addressed feedback from the official Obsidian plugin review process
- **MIT license** — Changed license from ISC to MIT

### v1.1.1

- **Library config persistence** — Fixed a critical bug where library section configurations (filters, view mode, sort settings, page size) were lost after restarting Obsidian. The YAML parser now correctly handles nested objects in column definitions
- **Grid position persistence** — Fixed grid position (gcol/grow) values never being saved to the dashboard file, causing card positions to reset on reload
- **Write race condition fix** — Fixed a race condition where rapid updates could cause the file watcher to overwrite newer data with older content

### v1.1.0

- **Reading Tracker widget** — Full reading session management in the sidebar: add books from Douban search or manual input, start/pause/stop reading timer, and save sessions with page progress
- **Book cards** — Each active book displays cover image, title, author, reading progress bar, and today's reading time. Cover images support both web URLs and local vault paths
- **Edit book info** — Hover a book card to reveal edit (pencil) and remove (x) buttons. Edit modal supports changing title, author, total pages, and cover image URL/path
- **Reading statistics** — Full stats page with total reading time, today's reading, book count, streak days, book list by time range (week/month/year), and recent session records. Delete individual records or entire book histories
- **Pomodoro activity selector** — Activity selector moved to the timer title position with a dropdown picker for categorizing focus sessions
- **Pomodoro donut chart** — Visual breakdown of today's focus sessions by activity, displayed as a donut chart in the stats view

### v1.0.8

- **Sidebar weather widget** — Real-time weather with current temperature, feels-like temperature, humidity, wind speed, and a 5-day forecast (daily icons + high/low). Powered by Open-Meteo, no API key required
- **Sidebar heatmap widget** — GitHub-style contribution heatmap for tracking daily frontmatter data (mood, sleep, weight, etc.)
- **Heatmap summary** — Configurable stats below the heatmap: streak days (⚡), completion rate (✅), both, or off
- **Week calendar strip** — Compact 7-day strip in the sidebar highlighting today
- **City search** — Geocoding autocomplete when configuring the weather city in settings
- **Dashboard weather cards** — Weather card widgets in the main dashboard also show feels-like, humidity, and wind
- **i18n** — All sidebar widget settings now support both English and Chinese
- **5 new themes** — Matcha (green tea warmth), Lilac (soft purple), Sakura (cherry blossom pink), Eclipse (dark mode), Moonlight (silver blue)

### v1.0.7

- **Task reminders** — Set per-task reminders with a calendar popup. Click the bell icon on any task to pick a date and time
- **Calendar picker** — Visual month calendar with navigation, day selection, and hour/minute dropdowns (no manual date typing)
- **Overdue indicator** — Overdue task bell icon turns red with a pulse animation
- **Obsidian notifications** — 60-second periodic checker triggers an Obsidian Notice when a task is due
- **Inline markdown storage** — Reminders stored as `⏰ YYYY-MM-DD HH:MM` in task text, fully readable and editable in the markdown file
- **Island theme** — New Animal Crossing-inspired pastel theme with forest green sections and ocean blue accents
- **i18n** — Reminder UI supports both English and Chinese
- **Resizable section cards** — Drag to resize any card within a section, with min/max width constraints and persistent sizing
- **Collapsible sidebar** — Left sidebar is now resizable; click the pin button to fix it in place
- **6 new themes** — Tundra (sage green aurora), Blossom (rose glass, transparent sections), Haze (smoky blue mist, glass transparency), Ember (warm campfire smoke), Dusk (purple twilight mist), Jade (green bamboo mist)
- **Transparent sections** — Tundra, Blossom, Haze, Ember, Dusk, and Jade feature borderless transparent sections with floating cards
- **Banner overlay removed** — Banner images no longer covered by a dark overlay filter
- **Faster banner rotation** — Quotes rotate every 1 hour, images every 30 minutes

### v1.0.6

- **Multi-quote banner** — Store multiple quotes in the banner, each with its own author. Add, edit, and delete quotes in the edit modal
- **Banner image rotation** — Add multiple background images that rotate every 2 hours with a smooth fade transition
- **Quote auto-rotation** — Quotes rotate every 2 hours (offset 1 hour from image rotation so they never swap simultaneously)
- **Double-click rename sections** — Double-click any section title to rename it inline (Enter to save, Escape to cancel)
- **Collapsible sections** — Click the triangle indicator on section headers to collapse/expand sections. Collapse state persists across sessions
- **Cross-card drag & drop** — Drag document links between project/note cards, and drag task items between todo cards
- **Card reordering fix** — Fixed card drag-and-drop positioning in all sections (Todo, Projects, Notes). Cards now land exactly where you drop them instead of always moving to the first position
- **Empty card interaction** — Cards with all items removed can now receive new items via drag-and-drop or the add input
- **Mobile improvements** — Memo color picker button hidden on mobile, mobile drawer uses solid background for all themes, taller quick actions list

### v1.0.5

- **Distinct toggle colors** — Each section type (Memo, Todo, Projects, Notes) has its own triangle indicator color
- **Banner modal button sizing** — "Add quote" and "Add image" buttons in the banner edit modal now use fit-content width instead of stretching full width
- **Projects card default width** — Fixed new project cards stretching across the entire section; cards now have a proper default width (280px)
- **Section type robustness** — Three-layer defense for section type preservation: frontmatter `type:` field, name-based heuristics, and card type distribution analysis. Section types survive manual file edits, heading renames, and position swaps
- **Project card type persistence** — `type: project` is now written to the file and preserved across save/reload cycles, preventing cards from reverting to generic type
- **Default template fix** — Projects and Library sections now include `sectionType` in the default template and column definitions

### v1.0.4

- **Quick Actions** — Quick Links upgraded to Quick Actions, supporting both file links and Obsidian command shortcuts
- **Add Action modal** — Two tabs (File / Command) for adding custom actions, with built-in presets for New Journal and New Note
- **4 Section types** — Memo, Todo, Projects, and Notes, each with its own layout and behavior
- **Multi-format document support** — Manage Markdown, PDF, images (PNG, JPG, GIF, SVG, WebP), audio (MP3, M4A), and video (MP4, MOV) in project cards
- **Bidirectional links** — Memo and Todo cards render `[[wikilinks]]` as clickable links with basename fallback
- **Journal path setting** — Configure where new diary entries are saved
- **UI polish** — Vertical scrollbars hidden on desktop, theme-colored horizontal scrollbar, notes section layout optimization
- **Bug fixes** — Fixed wiki link clicks in memo cards, quick link rename race condition, rename listener cleanup on plugin unload

### v1.0.3

- **Wikilink support** — Memo and Todo cards now render `[[wikilinks]]` as clickable links
- **Section type selector** — Choose section type when creating new sections
- **Mobile sidebar drawer** — Slide-in animation for mobile navigation
- **Section creation UX** — Confirm button for mobile section creation, 'Add new section' command shortcut
- **Bug fixes** — Card drag restricted to header/cover area, mobile banner edit button, drawer alignment

### v1.0.2

- **Section management** — Manual section deletion, section type selector
- **Mobile improvements** — Better card scrolling and mobile layout
- **Bug fixes** — Respect body section order, form reset prevention

## Compatibility

- Obsidian v0.15.0+
- Desktop and mobile
- All themes work in both light and dark Obsidian modes

## License

0BSD
