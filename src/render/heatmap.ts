/**
 * src/render/heatmap.ts
 *
 * Tracker card heatmap renderer. Extracted from `renderer.ts`
 * in Step 8.5.
 *
 * **Why a separate file**: the heatmap is a self-contained
 * ~80-line function with no callers inside `renderer.ts`
 * besides `renderTrackerBody`. It uses no shared state, no
 * event listeners, and no callbacks. Splitting it shrinks
 * `renderer.ts` by ~85 lines and gives a single place for
 * future heatmap tweaks (e.g. swatchable colour palettes,
 * week-alignment options).
 *
 * **Behaviour preservation**: every constant and every
 * arithmetic step is byte-identical to the pre-refactor
 * `renderTrackerHeatmap` at `renderer.ts:6181-6270`. The
 * week-alignment logic (Monday=0, Sunday=6, with a Sunday
 * special-case to put Sunday at the end of the column) is
 * preserved verbatim.
 */

import type { CardSize, TrackerDataPoint } from "../types";

/**
 * Render a GitHub-style contribution heatmap into `el`. The
 * visual layout is a CSS grid of cells where each column is
 * one ISO week (Monday → Sunday) and each row is one day.
 *
 * @param el          container element to append the heatmap to
 * @param data        tracker data points, ordered ascending by date
 * @param minVal      minimum value (used for `intensity` normalisation)
 * @param maxVal      maximum value (used for `intensity` normalisation)
 * @param size        card size — controls cell size and visible week count
 * @param accentColor CSS color string for the cell fill
 */
export function renderTrackerHeatmap(
  el: HTMLElement,
  data: TrackerDataPoint[],
  minVal: number,
  maxVal: number,
  size: CardSize,
  accentColor: string,
): void {
  const heatmap = el.createDiv({ cls: "dashboard-tracker-heatmap" });

  const range = maxVal - minVal || 1;
  const cellSize = size === "M" ? 10 : 14;
  const gap = 2;

  // Organize data into weeks (columns), days are rows (Mon-Sun)
  // Each column = 1 week, from oldest to newest
  const firstDate = data[0] ? new Date(data[0].date + "T00:00:00") : new Date();
  const startDayOfWeek = firstDate.getDay(); // 0=Sun, 1=Mon...
  const mondayOffset = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1; // days from Monday

  // Build week columns
  const weeks: (TrackerDataPoint | null)[][] = [];
  let currentWeek: (TrackerDataPoint | null)[] = [];

  // Pad first week with nulls to align to Monday
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

  // Limit visible weeks based on size
  const maxWeeks = size === "M" ? 15 : size === "L" ? 26 : 52;
  const visibleWeeks = weeks.slice(-maxWeeks);

  const grid = heatmap.createDiv({ cls: "dashboard-tracker-heatmap-grid" });
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = `repeat(${visibleWeeks.length}, ${cellSize}px)`;
  grid.style.gridTemplateRows = `repeat(7, ${cellSize}px)`;
  grid.style.gap = `${gap}px`;

  // Day labels (Mon, Tue, ... Sun) for L size
  if (size === "L") {
    const labels = heatmap.createDiv({
      cls: "dashboard-tracker-heatmap-labels",
    });
    const dayNames = ["M", "", "W", "", "F", "", "S"];
    for (const name of dayNames) {
      labels.createDiv({
        cls: "dashboard-tracker-heatmap-day-label",
        text: name,
      });
    }
  }

  for (const week of visibleWeeks) {
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const point = week[dayIdx] ?? null;
      const cell = grid.createDiv({ cls: "dashboard-tracker-heatmap-cell" });
      cell.style.width = `${cellSize}px`;
      cell.style.height = `${cellSize}px`;
      cell.style.borderRadius = `${Math.max(2, cellSize / 4)}px`;

      if (point === null || point.value === null) {
        cell.addClass("dashboard-tracker-heatmap-cell--empty");
      } else {
        const intensity = (point.value - minVal) / range;
        const alpha = 0.15 + intensity * 0.85;
        cell.style.backgroundColor = accentColor;
        cell.style.opacity = String(alpha);
        cell.title = `${point.date}: ${point.value}`;
      }
    }
  }
}
