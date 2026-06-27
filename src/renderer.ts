/**
 * Apex Dashboard — public render API barrel.
 *
 * v1.5.0 (Steps 8.4..8.8.0B.4.7) split the original 6 597-line
 * renderer.ts monolith into dedicated sub-modules under `src/render/*`.
 * This file now owns NO logic — only `export … from …` re-exports —
 * so external callers (view.ts, sidebar-view.ts, etc.) keep their
 * existing `import { ... } from "./renderer"` lines unchanged. See
 * .plan/Plan.md for the split history; see the README header in
 * `src/render/index.ts` for the sub-module map.
 */

export { renderDashboard } from "./render/dashboard/render-dashboard";
export { destroyAllCharts } from "./render/chart-pool";
export { ensureTodoPlusHeading } from "./render/dashboard/card-bodies/todoplus";
export { renderWeatherBody } from "./render/dashboard/card-bodies/weather";
export { renderTrackerBody } from "./render/dashboard/card-bodies/tracker";
export { renderSidebarPomodoro } from "./render/sidebar/sidebar-pomodoro";
export { renderSidebarCountdown } from "./render/sidebar/sidebar-countdown";
export {
  renderSidebarReading,
  showReadingStats,
} from "./render/sidebar/sidebar-reading";
export {
  renderSidebarWeekCalendar,
  renderSidebarWidgets,
} from "./render/sidebar/render-sidebar";
export { renderSidebarWeather } from "./render/sidebar/sidebar-weather";
export { renderSidebarHeatmap } from "./render/sidebar/sidebar-heatmap";
