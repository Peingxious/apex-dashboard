/**
 * src/render/index.ts
 *
 * Internal barrel for the `src/render/` directory. The top-level
 * `src/renderer.ts` re-exports everything from this barrel so the
 * 30+ consumer files do NOT need to change their import paths.
 *
 * **Status (Step 8.1)**: skeleton only. The actual re-exports of
 * the render sub-files are wired up incrementally in Steps 8.2
 * (barrel conversion), 8.3 (drag / state), 8.4 (chart pool /
 * todoplus watcher), 8.5 (wikilink / reminder / heatmap /
 * search), 8.6 (dashboard render), 8.7 (sidebar widgets).
 *
 * Re-exports added in Step 8.1:
 *   - `getCSSVar`, `emptyChildren` from `dom-helpers.ts`
 *   - All constants from `constants.ts`
 *   - `RenderDisposer`, `globalDisposer`, `disposeAllRenderers`
 *     from `lifecycle.ts` (exported but not yet consumed)
 *   - The state Maps (exported but not yet consumed)
 *
 * The re-exports are intentionally narrow: they only expose the
 * public surface used by other sub-files inside `src/render/**`.
 * Nothing here is meant to be imported from outside `src/render/`;
 * external consumers go through `src/renderer.ts`.
 */

export {
  HOVER_DELAY_MS,
  AUTOSAVE_DEBOUNCE_MS,
  HEATMAP_MAX_WEEKS_BY_SIZE,
  HEATMAP_ALPHA_MIN,
  HEATMAP_ALPHA_RANGE,
  HEATMAP_CELL_GAP_PX,
  SELECTORS,
  CSS,
  INLINE_TOKEN_PATTERN,
} from "./constants";

export { getCSSVar, emptyChildren } from "./dom-helpers";

export {
  RenderDisposer,
  globalDisposer,
  disposeAllRenderers,
} from "./lifecycle";

export {
  chartInstances,
  todoPlusRenderGeneration,
  todoPlusWatchers,
  dragState,
} from "./state";
export type { DragState } from "./state";

export { installDocumentDragListeners } from "./drag-and-drop";

// ---------------------------------------------------------------------------
// Public API re-exports (Step 8.2 trampoline)
//
// These are the 8 `export function …` declarations that used to live
// directly in `src/renderer.ts`. The function BODIES are still
// defined in `src/renderer.ts`; the sub-files in this directory are
// thin re-export shims so the new import paths exist today without
// changing any consumer file.
//
// The physical body move (so the sub-files own the implementations
// and `src/renderer.ts` becomes a true barrel) happens incrementally
// in Step 8.4 (chart pool), 8.5 (wikilink / reminder / heatmap),
// 8.6 (dashboard), 8.7 (sidebar), and is finalised in 8.8
// (renderer.ts becomes `export * from './render'`).
// ---------------------------------------------------------------------------

export { destroyAllCharts } from "./chart-pool";

export {
  renderSidebarWeekCalendar,
  renderSidebarWidgets,
} from "./sidebar/render-sidebar";

export { renderSidebarPomodoro } from "./sidebar/sidebar-pomodoro";
export { renderSidebarCountdown } from "./sidebar/sidebar-countdown";
export { renderSidebarWeather } from "./sidebar/sidebar-weather";
export { renderSidebarHeatmap } from "./sidebar/sidebar-heatmap";
export {
  renderSidebarReading,
  showReadingStats,
} from "./sidebar/sidebar-reading";

export { renderDashboard } from "./dashboard/render-dashboard";

export { ensureTodoPlusHeading } from "./dashboard/card-bodies/todoplus/modals";

// Step 8.5 — wikilink / reminder / heatmap / search / section-title
export {
  renderInlineMarkdown,
  renderWikilink,
  renderExternalLink,
  renderTextWithLinks,
} from "./wikilink-inline";

export { renderColumnTitle, isColumnProtected } from "./section-title";

export { renderTrackerHeatmap } from "./heatmap";

export { getSearchableFiles } from "./search";

export {
  createReminderButton,
  showReminderPopup,
  closeAllReminderPopups,
  isReminderOverdue,
} from "./reminder-popup";

// Step 8.6.5 — weather + tracker card-body renderers
export { renderWeatherBody } from "./dashboard/card-bodies/weather";
export { renderTrackerBody } from "./dashboard/card-bodies/tracker";
