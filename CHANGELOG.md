# Changelog

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
  - `11`         → title is empty, a small `#11` badge sits to the right
  - `Project 5`  → title is `Project`, badge is `#5`
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
