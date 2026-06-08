# Changelog

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
