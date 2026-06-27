/**
 * Sidebar heatmap widget — moved from `src/renderer.ts` in
 * Step 8.7.3.
 *
 * The sidebar heatmap is a 20-week × 7-day grid (vs. the
 * dashboard tracker card's larger chart). It uses CSS Grid
 * with 8×8 px cells rather than Chart.js / Canvas to keep the
 * widget cheap to render — the sidebar can show 6+ widgets at
 * once and the heatmap is the most layout-sensitive one.
 *
 * Summary modes (configurable via `widgetTrackerSummary`):
 *   - "off"     — no summary footer at all
 *   - "streak"  — show only the consecutive-days streak
 *   - "rate"    — show only the completion rate
 *   - "both"    — show both
 */
import type { App } from "obsidian";
import type {
  DashboardSettings,
  TrackerDataPoint,
} from "../../types";
import { t } from "../../i18n";
import { readTrackerData } from "../../tracker-service";
import { getCSSVar } from "../dom-helpers";

/**
 * Render the sidebar heatmap. Returns early without painting
 * anything if the user has not configured a tracker key — the
 * settings panel is where they would set it.
 */
export function renderSidebarHeatmap(
  container: HTMLElement,
  settings: DashboardSettings,
  app: App,
): void {
  if (!settings.widgetTrackerKey) return;

  const widget = container.createDiv({
    cls: "dashboard-sidebar-widget dashboard-sidebar-heatmap",
  });

  const data = readTrackerData(
    app,
    "",
    settings.widgetTrackerKey,
    settings.widgetTrackerDays,
  );
  const validPoints = data.filter((p) => p.value !== null);

  if (validPoints.length === 0) return;

  const values = data.map((p) => p.value);
  const minVal = Math.min(...values.filter((v): v is number => v !== null));
  const maxVal = Math.max(...values.filter((v): v is number => v !== null));
  const accentColor = getCSSVar("--db-accent") || "#6366f1";

  const firstDate = data[0] ? new Date(data[0].date + "T00:00:00") : new Date();
  const startDayOfWeek = firstDate.getDay();
  const mondayOffset = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  const weeks: (TrackerDataPoint | null)[][] = [];
  let currentWeek: (TrackerDataPoint | null)[] = [];
  for (let i = 0; i < mondayOffset; i++) {
    currentWeek.push(null);
  }
  for (const point of data) {
    currentWeek.push(point);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  const visibleWeeks = weeks.slice(-20);
  const range = maxVal - minVal || 1;

  const grid = widget.createDiv({ cls: "dashboard-sidebar-heatmap-grid" });
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = `repeat(${visibleWeeks.length}, 8px)`;
  grid.style.gridTemplateRows = "repeat(7, 8px)";
  grid.style.gap = "2px";

  for (const week of visibleWeeks) {
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const point = week[dayIdx] ?? null;
      const cell = grid.createDiv({ cls: "dashboard-sidebar-heatmap-cell" });
      cell.style.width = "8px";
      cell.style.height = "8px";
      cell.style.borderRadius = "2px";

      if (point === null || point.value === null) {
        cell.addClass("dashboard-sidebar-heatmap-cell--empty");
      } else {
        const intensity = (point.value - minVal) / range;
        cell.style.backgroundColor = accentColor;
        cell.style.opacity = String(0.15 + intensity * 0.85);
        cell.title = `${point.date}: ${point.value}`;
      }
    }
  }

  // Mini stats — gated by `widgetTrackerSummary` so users can
  // hide the footer entirely if they want just the grid.
  const summaryMode = settings.widgetTrackerSummary ?? "streak";
  if (summaryMode === "off") return;

  let streak = 0;
  for (let i = validPoints.length - 1; i >= 0; i--) {
    if (validPoints[i]!.value !== null) streak++;
    else break;
  }
  const completionRate = Math.round((validPoints.length / data.length) * 100);

  const stats = widget.createDiv({ cls: "dashboard-sidebar-heatmap-stats" });

  if (summaryMode === "streak" || summaryMode === "both") {
    const streakEl = stats.createSpan({
      cls: "dashboard-sidebar-heatmap-summary",
    });
    streakEl.createSpan({ cls: "dashboard-sidebar-heatmap-icon", text: "⚡" });
    streakEl.createSpan({ text: t("heatmap.streak", { count: streak }) });
  }
  if (summaryMode === "rate" || summaryMode === "both") {
    const rateEl = stats.createSpan({
      cls: "dashboard-sidebar-heatmap-summary",
    });
    rateEl.createSpan({ cls: "dashboard-sidebar-heatmap-icon", text: "✅" });
    rateEl.createSpan({ text: t("heatmap.rate", { rate: completionRate }) });
  }
}
