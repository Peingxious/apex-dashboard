/**
 * Sidebar shell — owns the widget dispatcher and shared layout
 * helpers. Moved from `src/renderer.ts` in Step 8.7.1.
 *
 * This file is the entry point for the sidebar's widget area.
 * It dispatches to the per-widget modules (sidebar-pomodoro,
 * sidebar-countdown, sidebar-reading, sidebar-weather,
 * sidebar-heatmap, plus the in-tree lunar widget) and is
 * responsible for:
 *
 *  1. Building the per-week "week calendar" header strip.
 *  2. Filtering + sorting the enabled widgets by
 *     `settings.widgetOrder`.
 *  3. Wiring the drag-and-drop reorder gesture via
 *     `setupWidgetDnD`.
 *
 * The per-widget implementations all live in dedicated files
 * under `src/render/sidebar/`. This file should stay small
 * (< 200 lines) — its job is composition, not implementation.
 */
import type { App } from "obsidian";
import type { DashboardSettings } from "../../types";
import { t, getLanguage } from "../../i18n";
import type { PomodoroService } from "../../pomodoro-service";
import type { ReadingService } from "../../reading-service";
import type { HolidayInfo } from "../../holiday-service";
import { renderSidebarLunarWidget } from "../../lunar-widget";
import { renderSidebarWeather } from "./sidebar-weather";
import { renderSidebarHeatmap } from "./sidebar-heatmap";
import { renderSidebarPomodoro } from "./sidebar-pomodoro";
import { renderSidebarCountdown } from "./sidebar-countdown";
import { renderSidebarReading } from "./sidebar-reading";

/** One widget descriptor. `key` is stable; `render` mounts the DOM. */
type WidgetEntry = { key: string; render: () => void };

/**
 * Default widget order. Used when `settings.widgetOrder` is
 * unset / empty. Keep this list in sync with the Settings UI
 * dropdown — if you add a widget, append it here AND in the
 * type picker.
 */
const DEFAULT_WIDGET_ORDER = [
  "lunar",
  "weather",
  "heatmap",
  "pomodoro",
  "reading",
  "countdown",
];

/**
 * Render a 7-day strip starting on Monday (ISO week).
 *
 * Each cell shows the day-of-week initial + the date number.
 * The current day gets a `--today` modifier class for the
 * stylesheet to highlight.
 */
export function renderSidebarWeekCalendar(container: HTMLElement): void {
  const now = new Date();
  const today = now.getDay();
  const mondayOffset = today === 0 ? -6 : 1 - today;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);

  const lang = getLanguage() === "zh" ? "zh-CN" : "en";
  const row = container.createDiv({ cls: "dashboard-sidebar-week-calendar" });

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const isToday = d.toDateString() === now.toDateString();

    const cell = row.createDiv({
      cls:
        "dashboard-sidebar-week-cell" +
        (isToday ? " dashboard-sidebar-week-cell--today" : ""),
    });
    cell.createDiv({
      cls: "dashboard-sidebar-week-day",
      text: d.toLocaleDateString(lang, { weekday: "narrow" }),
    });
    cell.createDiv({
      cls: "dashboard-sidebar-week-date",
      text: String(d.getDate()),
    });
  }
}

/**
 * Render the widget area. Each enabled widget is pushed into
 * an array, then sorted by `settings.widgetOrder`, then
 * rendered in that order. The DOM is annotated with
 * `data-widget-key` so the drag-and-drop reordering layer can
 * look up the source / target by key.
 *
 * Returns early without rendering anything if no widget is
 * enabled — the calling code (view.ts / sidebar-view.ts) shows
 * the default placeholder in that case.
 */
export function renderSidebarWidgets(
  container: HTMLElement,
  settings: DashboardSettings,
  app: App,
  pomodoroService?: PomodoroService,
  readingService?: ReadingService,
  holidayData?: Record<string, HolidayInfo>,
  onWidgetReorder?: (order: string[]) => void,
): void {
  const anyEnabled =
    settings.widgetWeatherEnabled ||
    settings.widgetHeatmapEnabled ||
    settings.pomodoroEnabled ||
    settings.widgetLunarEnabled ||
    settings.countdownEnabled ||
    settings.readingEnabled;
  if (!anyEnabled) return;

  const widgetArea = container.createDiv({ cls: "dashboard-sidebar-widgets" });

  const order = settings.widgetOrder?.length
    ? settings.widgetOrder
    : DEFAULT_WIDGET_ORDER;

  const enabled: WidgetEntry[] = [];
  if (settings.widgetLunarEnabled) {
    enabled.push({
      key: "lunar",
      render: () =>
        renderSidebarLunarWidget(widgetArea, holidayData ?? {}, app),
    });
  }
  if (settings.widgetWeatherEnabled) {
    enabled.push({
      key: "weather",
      render: () => renderSidebarWeather(widgetArea, settings, app),
    });
  }
  if (settings.widgetHeatmapEnabled) {
    enabled.push({
      key: "heatmap",
      render: () => renderSidebarHeatmap(widgetArea, settings, app),
    });
  }
  if (settings.pomodoroEnabled && pomodoroService) {
    enabled.push({
      key: "pomodoro",
      render: () =>
        renderSidebarPomodoro(widgetArea, pomodoroService, settings),
    });
  }
  if (settings.readingEnabled && readingService) {
    enabled.push({
      key: "reading",
      render: () => renderSidebarReading(widgetArea, readingService),
    });
  }
  if (settings.countdownEnabled) {
    enabled.push({
      key: "countdown",
      render: () => renderSidebarCountdown(widgetArea, settings, app),
    });
  }

  const ordered = sortByOrder(enabled, order);

  for (const { key, render } of ordered) {
    const childCount = widgetArea.children.length;
    render();
    const el = widgetArea.children[childCount] as HTMLElement | undefined;
    if (el) el.dataset.widgetKey = key;
  }

  if (onWidgetReorder) {
    setupWidgetDnD(
      widgetArea,
      ordered.map((e) => e.key),
      onWidgetReorder,
    );
  }
}

/**
 * Stable sort by `order` (unknown keys go to the end).
 * Uses an index Map for O(n log n) instead of O(n^2).
 */
function sortByOrder(items: WidgetEntry[], order: string[]): WidgetEntry[] {
  const orderMap = new Map(order.map((k, i) => [k, i]));
  const sorted = [...items].sort((a, b) => {
    const ai = orderMap.get(a.key) ?? order.length;
    const bi = orderMap.get(b.key) ?? order.length;
    return ai - bi;
  });
  return sorted;
}

/**
 * Wire drag-and-drop reordering for the widget area.
 *
 * Each widget element gets `draggable=true` and the four
 * `dragstart` / `dragend` / `dragover` / `drop` listeners. The
 * drop handler computes the new key order and forwards it via
 * `onReorder` — the caller (view.ts) is responsible for
 * persisting the order to settings and re-rendering the sidebar.
 *
 * The class swaps (`--drag-over-top` / `--drag-over-bottom`)
 * use the cursor Y position relative to the target widget's
 * bounding rect midpoint to decide whether the drop should
 * insert before or after the target.
 */
function setupWidgetDnD(
  widgetArea: HTMLElement,
  currentKeys: string[],
  onReorder: (order: string[]) => void,
): void {
  let draggedKey: string | null = null;

  const widgets = () =>
    widgetArea.querySelectorAll(".dashboard-sidebar-widget");

  widgets().forEach((el) => {
    const wEl = el as HTMLElement;
    wEl.setAttribute("draggable", "true");
    wEl.dataset.widgetKey ??= wEl.dataset.widgetKey ?? "";

    wEl.addEventListener("dragstart", (e) => {
      draggedKey = wEl.dataset.widgetKey ?? null;
      wEl.addClass("dashboard-sidebar-widget--dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", draggedKey ?? "");
      }
    });

    wEl.addEventListener("dragend", () => {
      wEl.removeClass("dashboard-sidebar-widget--dragging");
      widgets().forEach((el2) =>
        el2.removeClass("dashboard-sidebar-widget--drag-over"),
      );
      draggedKey = null;
    });

    wEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      if (!draggedKey || wEl.dataset.widgetKey === draggedKey) return;
      widgets().forEach((el2) =>
        el2.removeClass("dashboard-sidebar-widget--drag-over"),
      );
      const rect = wEl.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        wEl.addClass("dashboard-sidebar-widget--drag-over-top");
        wEl.removeClass("dashboard-sidebar-widget--drag-over-bottom");
      } else {
        wEl.addClass("dashboard-sidebar-widget--drag-over-bottom");
        wEl.removeClass("dashboard-sidebar-widget--drag-over-top");
      }
    });

    wEl.addEventListener("dragleave", () => {
      wEl.removeClass("dashboard-sidebar-widget--drag-over-top");
      wEl.removeClass("dashboard-sidebar-widget--drag-over-bottom");
    });

    wEl.addEventListener("drop", (e) => {
      e.preventDefault();
      wEl.removeClass("dashboard-sidebar-widget--drag-over-top");
      wEl.removeClass("dashboard-sidebar-widget--drag-over-bottom");
      if (!draggedKey || wEl.dataset.widgetKey === draggedKey) return;

      const targetKey = wEl.dataset.widgetKey ?? "";
      const rect = wEl.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const insertBefore = e.clientY < midY;

      const keys = [...currentKeys];
      const fromIdx = keys.indexOf(draggedKey);
      if (fromIdx === -1) return;
      keys.splice(fromIdx, 1);
      let toIdx = keys.indexOf(targetKey);
      if (toIdx === -1) return;
      if (!insertBefore) toIdx += 1;
      keys.splice(toIdx, 0, draggedKey);
      onReorder(keys);
    });
  });
}
