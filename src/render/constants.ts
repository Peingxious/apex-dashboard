/**
 * src/render/constants.ts
 *
 * Centralized constants for the render layer. Previously scattered
 * across `renderer.ts` as magic numbers / strings. Hoisted here in
 * Step 8.1 to give every refactored sub-file a single source of truth.
 *
 * No business logic — pure values. Safe to import from anywhere
 * inside `src/render/**` (and from `src/renderer.ts` barrel).
 */

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

/** Delay before opening the native Page Preview popover on a wikilink. */
export const HOVER_DELAY_MS = 200;

/** Default debounce window for textarea autosave (memo card). */
export const AUTOSAVE_DEBOUNCE_MS = 600;

// ---------------------------------------------------------------------------
// Tracker heatmap
// ---------------------------------------------------------------------------

/**
 * Maximum visible weeks per heatmap card size. S = dense (52w), M = medium (26w),
 * L = sparse (15w). Aligned with the inline `?:` chain in the original heatmap
 * renderer. Change here ONLY if the visual design intent changes.
 */
export const HEATMAP_MAX_WEEKS_BY_SIZE: Readonly<Record<"S" | "M" | "L", number>> = {
  S: 52,
  M: 26,
  L: 15,
};

/** Heatmap cell opacity floor / range. */
export const HEATMAP_ALPHA_MIN = 0.15;
export const HEATMAP_ALPHA_RANGE = 0.85;

/** Default heatmap cell gap in pixels. */
export const HEATMAP_CELL_GAP_PX = 2;

// ---------------------------------------------------------------------------
// CSS class names (hoisted from magic strings)
// ---------------------------------------------------------------------------

/** Dashboard root element selector used for CSS-var lookups. */
export const SELECTORS = {
  dashboardRoot: ".peingxious-dashboard-root",
} as const;

/**
 * CSS class names used across render. Centralised here so a future
 * rename only needs to touch one file.
 */
export const CSS = {
  taskItem: "dashboard-task-item",
  taskItemDragging: "dashboard-task-item--dragging",
  taskItemDragOver: "dashboard-task-item--drag-over",
  taskListDropTarget: "dashboard-task-list--drop-target",
  projectItem: "dashboard-project-item",
  projectItemDragging: "dashboard-project-item--dragging",
  projectItemDragOver: "dashboard-project-item--drag-over",
  inlineHighlight: "dashboard-inline-highlight",
  inlineStrike: "dashboard-inline-strike",
  trackerHeatmapGrid: "dashboard-tracker-heatmap-grid",
  trackerHeatmapCell: "dashboard-tracker-heatmap-cell",
  trackerHeatmapCellEmpty: "dashboard-tracker-heatmap-cell--empty",
  trackerHeatmapLabels: "dashboard-tracker-heatmap-labels",
  trackerHeatmapDayLabel: "dashboard-tracker-heatmap-day-label",
} as const;

// ---------------------------------------------------------------------------
// Inline token regex
// ---------------------------------------------------------------------------

/**
 * Regex for the dashboard inline-markdown engine. Matches (in order of
 * precedence, so bold doesn't greedily eat italic):
 *
 *   `[[...]]`           -> Obsidian wikilink (half-width)
 *   `【【...】】`         -> Obsidian wikilink (full-width, common in zh-CN input)
 *   `[text](url)`       -> Markdown external link
 *   `**...**`           -> Bold
 *   `*...*`             -> Italic
 *   `_..._`             -> Italic (underscore)
 *   `` `...` ``         -> Inline code
 *   `==...==`           -> Highlight
 *   `~~...~~`           -> Strikethrough
 *
 * Original lives at `renderer.ts:5536` (pre-refactor). Re-exported here
 * so the new `wikilink-inline.ts` can consume it without circular
 * imports once that sub-file is created in Step 8.5.
 */
export const INLINE_TOKEN_PATTERN =
  /(\[\[[^\]]+\]\]|【【[^】]+】】|\[[^\]]+\]\([^)]+\)|\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`|==[^=\n]+==|~~[^~\n]+~~)/g;
